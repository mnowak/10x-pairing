---
change_id: production-security-audit
title: Production security/RLS + GRANT audit
status: implementing
created: 2026-09-12
updated: 2026-09-12
---

## Notes

Roadmap S-10 (milestone M-3: mvp-release-preparation). Independently verifies
RLS + GRANT coverage across all 5 tables rather than assuming S-09's tail-fix
(missing GRANTs on 2 tables) generalized correctly. Audited live against the
linked production project via `supabase db advisors --linked` plus a manual
`information_schema.role_table_grants` query, surfacing 3 real findings
(mutable `search_path` on a trigger function, `anon` holding leftover
TRUNCATE/REFERENCES/TRIGGER grants, leaked-password protection disabled) and
1 bundled performance cleanup (RLS policies re-evaluating `auth.uid()` per
row). PRD ref: MS-01.
