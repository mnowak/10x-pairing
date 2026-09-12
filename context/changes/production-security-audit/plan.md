# Production Security/RLS + GRANT Audit Implementation Plan

## Overview

S-09's tail-end fix (migration `20260912170143_grant_table_privileges_to_authenticated.sql`)
patched a production incident: RLS was enabled on all 5 `public` tables but 2
of them were missing base `GRANT`s for the `authenticated` role, causing
"permission denied" errors despite correct policies. That fix was applied to
all 5 tables, but nothing independently verified it generalized correctly,
and no one checked for adjacent classes of misconfiguration (`anon` role
exposure, mutable function `search_path`, weak Auth settings). This plan
performs that independent audit directly against the **linked production
project**, then remediates every real finding it surfaces.

## Current State Analysis

An audit was run during planning, live against production, using two
methods:

1. `npx supabase db advisors --linked` — Supabase's own Security/Performance
   Advisor (the same linter surfaced in the Supabase dashboard).
2. A manual query against `information_schema.role_table_grants` for
   `table_schema = 'public'`, to see the full set of role→table grants,
   including roles the advisor doesn't editorialize on.

**Confirmed correct (no action needed):**

- All 5 tables (`teams`, `team_armies`, `opponents`, `opponent_armies`,
  `pairing_matrix_estimates`) have RLS enabled, with a matching
  `for all using (auth.uid() = captain_id) with check (auth.uid() = captain_id)`
  policy on each — see `supabase/migrations/20260904185524_create_pairing_domain_schema.sql:72-87`.
- `authenticated` now holds `SELECT/INSERT/UPDATE/DELETE` on all 5 tables in
  production (verified via the manual grant query, not just by reading the
  migration) — S-09's tail-fix generalized correctly.
- No `service_role` key usage exists anywhere in application code
  (`src/lib/supabase.ts`, `src/middleware.ts`, all `src/pages/api/**`
  routes) — every request path uses the request-scoped anon-key client, so
  there is no RLS-bypass surface in the app layer itself.
- Cross-captain data isolation (a table's row belonging to captain isn't
  readable/writable by another captain) is already covered by existing
  automated tests from `context/changes/testing-bootstrap-critical-path-coverage/`
  (test-plan.md risk #3) — this plan does not need to add new isolation
  tests, only avoid regressing them.

**3 real findings requiring remediation:**

1. **`function_search_path_mutable`** (advisor, SECURITY/WARN) — `public.set_updated_at()`
   (the shared `updated_at` trigger function, `20260904185524...sql:57-63`)
   has no `search_path` pinned, which is a schema-hijacking risk per
   Postgres/Supabase's own linter.
2. **`anon` holds leftover `TRUNCATE`/`REFERENCES`/`TRIGGER`** grants on all
   5 tables (manual grant query) — provisioned by Supabase's default project
   template, never explicitly revoked. Not exploitable via the app's
   PostgREST-based API today (PostgREST exposes no TRUNCATE verb), but
   inconsistent with the PRD's Access Control model ("Login required...
   every logged-in user acts as a captain" — `context/foundation/prd.md:122`),
   under which `anon` should hold zero table privileges.
3. **`auth_leaked_password_protection`** (advisor, SECURITY/WARN) — disabled
   project-wide in Supabase Auth (HaveIBeenPwned check on signup/password
   change).

**1 bundled performance finding** (not security, but touches the same lines):

- **`auth_rls_initplan`** (advisor, PERFORMANCE/WARN) — all 5 RLS policies
  call `auth.uid()` directly instead of `(select auth.uid())`, causing
  per-row re-evaluation. Fixed in the same migration since it's the same
  `create policy` statements this audit is already touching.

### Key Discoveries:

- The Supabase CLI is already linked to the production project
  (`unfcrnssmdnzylxmlnmk`) and has working credentials — confirmed via
  `npx supabase projects list` and `npx supabase migration list --linked`
  (all 3 local migrations already applied to production, in sync).
- The installed CLI's `supabase/config.toml` schema (`[auth]` section,
  `supabase/config.toml:150-178`) has **no key for leaked-password
  protection** — it's not a `config.toml` + `supabase config push` setting
  on this CLI version. It must be toggled via the Supabase **Management
  API** (`PATCH https://api.supabase.com/v1/projects/{ref}/config/auth`,
  body `{"password_hibp_enabled": true}`), authenticated with the same
  access token the CLI itself already uses.

## Desired End State

Production has zero SECURITY-category findings from `supabase db advisors --linked`
(down from 2), `anon` holds no privileges on any `public` table, and
`context/foundation/security-audit.md` records the audit's scope, method,
findings, and remediation status for future reference. The existing test
suite still passes unchanged against the migrated schema/policies.

**Verification:** re-run `npx supabase db advisors --linked` post-deploy and
confirm the `function_search_path_mutable` and `auth_leaked_password_protection`
findings are gone; re-run the manual grant query and confirm `anon` has 0 rows
across the 5 tables; run the full test suite against a local stack reset from
the updated migrations.

### Key Discoveries:

(see Current State Analysis above — findings and their exact locations are
the discoveries for this plan)

## What We're NOT Doing

- Not adding new automated tests for cross-captain isolation — already
  covered by `context/changes/testing-bootstrap-critical-path-coverage/`.
- Not changing `enable_confirmations = false` (email confirmation) or other
  `[auth]` settings in `config.toml` beyond leaked-password protection —
  out of this audit's scope (roadmap S-10 is RLS/GRANT-focused; email
  confirmation policy is a product decision, not a security gap).
- Not introducing a teammate/viewer role or any RLS policy shape change
  beyond the `(select auth.uid())` rewrite — PRD Access Control is
  explicitly flat/captain-only for MVP.
- Not adding a recurring/scheduled audit job — this is a one-time hardening
  pass; a cadence for re-running it is a process decision outside this
  slice's scope.

## Implementation Approach

One migration handles all 3 schema-level fixes (search_path, RLS
`auth.uid()` rewrite, anon grant revocation) since they touch overlapping
objects (the same trigger function and the same 5 tables/policies) and
should land in a single production deploy rather than three separate ones.
The Auth-service setting (leaked-password protection) is a separate,
non-SQL change via the Management API, since it isn't expressible in a
migration. A final verification phase closes the loop the way this
milestone's own north star (S-09) demands: re-run the same audit tooling
that found the gaps, don't just trust that the fix applied.

## Phase 1: Security + performance migration

### Overview

Adds one migration fixing the 3 real findings plus the bundled RLS
performance cleanup, all confirmed independently correct before landing.

### Changes Required:

#### 1. New migration file

**File**: `supabase/migrations/<timestamp>_security_audit_hardening.sql`

**Intent**: Pin `search_path` on the shared trigger function; rewrite all 5
RLS policies to wrap `auth.uid()` in `(select ...)`; revoke `anon`'s leftover
`TRUNCATE`/`REFERENCES`/`TRIGGER` grants on all 5 tables.

**Contract**:
- `alter function public.set_updated_at() set search_path = ''` (empty
  search_path is safe here since the function body only calls the built-in
  `now()`, which resolves via `pg_catalog` regardless of search_path).
- Each of the 5 `create policy ... using (auth.uid() = captain_id) with check (auth.uid() = captain_id)`
  statements from `20260904185524...sql:78-87` must be dropped and recreated
  with `using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id)`
  — same semantics, no policy-shape or access-control change.
- `revoke truncate, references, trigger on public.<table> from anon;` for
  each of the 5 tables.

#### 2. Local verification before push

**Intent**: Confirm the migration applies cleanly and doesn't regress
existing behavior before touching production.

**Contract**: `npx supabase db reset` (local stack) applies all migrations
including the new one without error; existing test suite passes locally
unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] New migration applies cleanly on a local reset: `npx supabase db reset`
- [ ] Full test suite passes locally against the migrated schema: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Typecheck passes: `npx astro check`

#### Manual Verification:

- [ ] Migration file reviewed for exact policy-semantics equivalence (no
      accidental access-control change) before pushing to production

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Enable leaked-password protection

### Overview

Toggles the one finding that isn't a schema change — Supabase Auth's
HaveIBeenPwned check — via the Management API, since the local CLI's
`config.toml` schema doesn't expose this setting.

### Changes Required:

#### 1. Enable via Management API

**Intent**: Turn on leaked-password protection for the production project.

**Contract**: `PATCH https://api.supabase.com/v1/projects/unfcrnssmdnzylxmlnmk/config/auth`
with body `{"password_hibp_enabled": true}`, authorized with the Supabase
access token already used by the linked CLI (`~/.supabase/access-token` or
equivalent CLI credential store — do not hardcode or print the token value).
If the API rejects this as plan-gated (HTTP 402/403 or an explicit
plan-tier error), do not treat this as a blocking failure: record it as an
accepted, currently-open risk in `security-audit.md` (Phase 3) instead of
retrying or escalating scope.

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db advisors --linked` no longer lists `auth_leaked_password_protection`, OR the finding is explicitly logged as an accepted risk with the reason (plan-gated) in `security-audit.md`

#### Manual Verification:

- [ ] Supabase dashboard's Auth → Policies (or Advisors) page confirms the toggle's actual state matches what the API call reported

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Verify and record the audit

### Overview

Closes the loop: confirm production actually reflects the fixes (not just
that migrations were written), and leave a durable record of what was
audited, how, and what remains open.

### Changes Required:

#### 1. Production re-verification

**Intent**: Prove the fixes landed on production, using the same tools that
found the gaps — mirrors this milestone's own north star (S-09: don't trust,
verify).

**Contract**: `npx supabase db advisors --linked` re-run, `SECURITY`-category
results compared against the Phase-1-start baseline (2 findings → 0, or 1
accepted-risk entry per Phase 2's fallback); manual grant query re-run,
confirming zero `anon` rows across the 5 tables for `TRUNCATE`/`REFERENCES`/`TRIGGER`.

#### 2. Audit record

**File**: `context/foundation/security-audit.md`

**Intent**: A durable, foundation-level record of this audit's scope,
method, findings, and remediation status — discoverable by any future audit
or slice without digging through an archived change folder, mirroring the
existing convention of `context/foundation/health-check.md`-style audit
docs.

**Contract**: Frontmatter with `audited_at` (production, live) and
`method` (advisors + manual grant query); a findings table (finding, table/
object, severity, status: fixed/accepted-risk); a "Confirmed correct"
section listing what was checked and found already sound (RLS coverage,
`authenticated` grants, no `service_role` usage in app code).

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db advisors --linked` shows 0 SECURITY-category findings, or only the Phase-2 accepted-risk entry
- [ ] Manual grant query shows 0 `anon` privileges across the 5 `public` tables
- [ ] `context/foundation/security-audit.md` exists and is git-tracked

#### Manual Verification:

- [ ] A human reviews `security-audit.md` for accuracy against the actual production state

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before proceeding to close out the
change.

---

## Testing Strategy

### Unit Tests:

- No new unit tests — this plan fixes infrastructure/config, not
  application logic covered by unit tests.

### Integration Tests:

- Rerun the full existing suite (including the cross-captain RLS-isolation
  tests from `testing-bootstrap-critical-path-coverage`) against the
  migrated schema to confirm no regression in access control.

### Manual Testing Steps:

1. Sign in as a captain in the deployed app and confirm team/roster/matrix
   CRUD still works end-to-end (the RLS policy rewrite must be semantically
   identical, but this is real-app confirmation beyond the SQL review).
2. Confirm the Supabase dashboard's Advisors page matches the CLI's
   re-verification output.

## Performance Considerations

The `auth_rls_initplan` fix (wrapping `auth.uid()` in `(select ...)`) is
itself the performance improvement in scope — no additional performance
work planned.

## Migration Notes

The new migration only alters function configuration, policy definitions,
and grants — no data migration, no column/table changes, fully reversible
by re-running the inverse `grant`/`create policy` statements if ever needed.

## References

- Prior incident fix: `supabase/migrations/20260912170143_grant_table_privileges_to_authenticated.sql`
- Original schema + RLS: `supabase/migrations/20260904185524_create_pairing_domain_schema.sql`
- Cross-captain isolation test precedent: `context/changes/testing-bootstrap-critical-path-coverage/`
- PRD Access Control: `context/foundation/prd.md:120-126`
- Roadmap slice: `context/foundation/roadmap.md` (S-10)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Security + performance migration

#### Automated

- [x] 1.1 New migration applies cleanly on a local reset: `npx supabase db reset`
- [x] 1.2 Full test suite passes locally against the migrated schema: `npm test`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Typecheck passes: `npx astro check`

#### Manual

- [x] 1.5 Migration file reviewed for exact policy-semantics equivalence (no accidental access-control change) before pushing to production

### Phase 2: Enable leaked-password protection

#### Automated

- [ ] 2.1 `npx supabase db advisors --linked` no longer lists `auth_leaked_password_protection`, OR the finding is explicitly logged as an accepted risk with the reason (plan-gated) in `security-audit.md`

#### Manual

- [ ] 2.2 Supabase dashboard's Auth → Policies (or Advisors) page confirms the toggle's actual state matches what the API call reported

### Phase 3: Verify and record the audit

#### Automated

- [ ] 3.1 `npx supabase db advisors --linked` shows 0 SECURITY-category findings, or only the Phase-2 accepted-risk entry
- [ ] 3.2 Manual grant query shows 0 `anon` privileges across the 5 `public` tables
- [ ] 3.3 `context/foundation/security-audit.md` exists and is git-tracked

#### Manual

- [ ] 3.4 A human reviews `security-audit.md` for accuracy against the actual production state
