# Production Security/RLS + GRANT Audit — Plan Brief

> Full plan: `context/changes/production-security-audit/plan.md`

## What & Why

S-09 fixed a production incident where 2 of 5 tables had RLS enabled but no
base `GRANT`s for `authenticated` (Postgres checks GRANTs before RLS). This
slice independently verifies that fix generalized to all 5 tables and
audits for adjacent misconfiguration classes, rather than assuming the fix
was complete — the exact "audit, not assume" gap this milestone exists to
close.

## Starting Point

The audit was run live against the **linked production project** during
planning (`npx supabase db advisors --linked` + a manual
`information_schema.role_table_grants` query). Result: RLS coverage and
`authenticated` grants are confirmed correct on all 5 tables — S-09's fix
generalized fine. But 3 previously-unknown findings surfaced: a mutable
`search_path` on the shared trigger function, leftover `anon` grants
(TRUNCATE/REFERENCES/TRIGGER) on all 5 tables, and leaked-password
protection disabled in Supabase Auth. A 4th, non-security performance
finding (RLS policies re-evaluating `auth.uid()` per row) touches the same
lines and is bundled in.

## Desired End State

Production shows 0 SECURITY-category findings from Supabase's own advisor
tool (down from 2), `anon` holds zero privileges on any `public` table, and
`context/foundation/security-audit.md` records what was audited, how, and
what (if anything) remains open — so the next audit doesn't start from
zero.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Fix now vs. document only | Fix all 3 real findings in this slice | Matches S-09's precedent — this milestone closes gaps, not just names them |
| Bundle the performance finding | Yes, same migration | Same policies, same deploy, zero extra risk vs. a second production RLS change later |
| Revoke anon's leftover grants | Yes, all 5 tables | True least-privilege — PRD's Access Control model is login-required for everything |
| Audit record location | `context/foundation/security-audit.md` | Durable, discoverable by future audits — mirrors the `health-check.md` convention |
| Verification method | Re-run `supabase db advisors --linked` + full test suite | Same tool that found the gaps confirms they're closed |
| If leaked-password protection is plan-gated | Attempt it; document as accepted risk if blocked | Doesn't stall the slice on a billing decision that isn't Claude's to make |

## Scope

**In scope:**
- One migration: pin `search_path` on `set_updated_at()`, rewrite all 5 RLS
  policies to `(select auth.uid())`, revoke `anon`'s leftover grants
- Enable leaked-password protection via the Supabase Management API
- Re-verify against production and write the audit record

**Out of scope:**
- New cross-captain isolation tests (already covered by
  `testing-bootstrap-critical-path-coverage`)
- Any `config.toml` `[auth]` setting beyond leaked-password protection
  (e.g. email confirmation policy — a product decision, not a security gap)
- A recurring/scheduled audit cadence

## Architecture / Approach

Single migration for all schema-level fixes (same objects, one production
deploy); a separate Management-API call for the one Auth-service setting
that isn't expressible in SQL; a final phase that re-runs the same audit
tooling against production to prove the fix landed, not just that it was
written.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Security + performance migration | New migration fixing search_path, RLS auth.uid() wrap, anon grant revocation | Touching production RLS/grants again soon after the last incident — mitigated by local `db reset` + full test suite before push |
| 2. Enable leaked-password protection | Management API call toggling the Auth setting | May be gated behind a paid plan tier — handled as accepted-risk fallback, not a blocker |
| 3. Verify and record | Production re-verification + `security-audit.md` | None — this is the confirmation step |

**Prerequisites:** Supabase CLI linked to production (already confirmed working); no code dependency.
**Estimated effort:** ~1 session across 3 phases — findings are already known, this is fix + verify, not discovery.

## Open Risks & Assumptions

- Leaked-password protection may require a paid Supabase plan tier to
  enable via the Management API; if so, it's recorded as an accepted risk
  rather than blocking this slice.
- The RLS policy rewrite (`auth.uid()` → `(select auth.uid())`) must be
  semantically identical to the original — Phase 1 includes an explicit
  manual review step for this before touching production.

## Success Criteria (Summary)

- Production shows 0 SECURITY-category findings from `supabase db advisors --linked` (or 1 documented accepted-risk entry)
- `anon` holds zero privileges on all 5 `public` tables
- `context/foundation/security-audit.md` exists, reviewed for accuracy, and the full test suite still passes unchanged
