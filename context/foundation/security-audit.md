---
audited_at: 2026-09-12 (production, live)
method: "npx supabase db advisors --linked (Security/Performance Advisor); manual query against information_schema.role_table_grants for table_schema = 'public'"
project_ref: unfcrnssmdnzylxmlnmk
related_change: context/changes/production-security-audit/
roadmap_slice: S-10 (milestone M-3: mvp-release-preparation)
---

# Production Security / RLS + GRANT Audit

Independent verification of RLS + GRANT coverage across all 5 `public` tables,
triggered by S-09's tail-end fix (a migration that added missing `authenticated`
GRANTs on 2 tables) — this audit checks whether that fix generalized correctly
and looks for adjacent classes of misconfiguration (`anon` role exposure,
mutable function `search_path`, weak Auth settings).

## Findings

| Finding | Object | Severity | Status |
| --- | --- | --- | --- |
| `function_search_path_mutable` | `public.set_updated_at()` (trigger function) | SECURITY/WARN | **Fixed** — migration `20260912195414_security_audit_hardening.sql`, pushed to production 2026-09-12 |
| `anon` held leftover `TRUNCATE`/`REFERENCES`/`TRIGGER` grants | All 5 `public` tables (`teams`, `team_armies`, `opponents`, `opponent_armies`, `pairing_matrix_estimates`) | SECURITY (not advisor-flagged; found via manual grant query) | **Fixed** — same migration; confirmed 0 `anon` rows in `information_schema.role_table_grants` post-deploy |
| `auth_rls_initplan` (bundled performance finding) | RLS policies on all 5 tables re-evaluating `auth.uid()` per row | PERFORMANCE/WARN | **Fixed** — same migration rewrote all 5 policies to `(select auth.uid())` |
| `auth_leaked_password_protection` | Supabase Auth (HaveIBeenPwned check on signup/password change) | SECURITY/WARN | **Accepted risk (open)** — see below |

### Accepted risk: `auth_leaked_password_protection`

This setting is not expressible in `supabase/config.toml` on any current CLI
version (checked against both the linked project's installed CLI and the
latest `supabase@latest` — no `[auth]` key exists for it); it is only
toggleable via the Supabase Management API
(`PATCH https://api.supabase.com/v1/projects/unfcrnssmdnzylxmlnmk/config/auth`,
body `{"password_hibp_enabled": true}`) or the Supabase Dashboard.

The implementation environment used for this audit sandboxes access to the
Supabase CLI's stored access token (file/env/Keychain lookups are blocked as
credential exploration/materialization), so the automated agent could not
authenticate the Management API call. **This is an environment limitation,
not a Supabase plan-tier restriction** — plan-gating was the originally
anticipated failure mode, but the actual blocker here is tooling sandboxing.

**To close this out:** a human with the CLI's access token (or Dashboard
access) should either run the `curl` command above, or toggle
Authentication → Providers → Email → "Leaked password protection" (or the
equivalent Policies/Advisors page) directly in the Supabase Dashboard for
project `unfcrnssmdnzylxmlnmk`.

## Confirmed correct (no action needed)

- All 5 tables have RLS enabled with a matching
  `for all using ((select auth.uid()) = captain_id) with check ((select auth.uid()) = captain_id)`
  policy (post-fix) on each.
- `authenticated` holds `SELECT/INSERT/UPDATE/DELETE` on all 5 tables in
  production — S-09's tail-fix generalized correctly.
- No `service_role` key usage anywhere in application code
  (`src/lib/supabase.ts`, `src/middleware.ts`, all `src/pages/api/**`
  routes) — every request path uses the request-scoped anon-key client.
- Cross-captain data isolation is covered by existing automated tests from
  `context/changes/testing-bootstrap-critical-path-coverage/` (not
  re-tested here; not regressed by this audit's changes).

## Verification evidence (post-deploy, 2026-09-12)

`npx supabase db advisors --linked` — only remaining finding:

```json
{
  "name": "auth_leaked_password_protection",
  "level": "WARN",
  "categories": ["SECURITY"]
}
```

Manual grant query (`anon` privileges on `public` tables) — 0 rows returned.

`npx supabase migration list --linked` — Local and Remote columns in sync
through `20260912195414`.
