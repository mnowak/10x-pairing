<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Team/Opponent/Pairing-Matrix Schema Implementation Plan

- **Plan**: context/changes/schema-teams-opponents-matrix/plan.md
- **Scope**: Phase 4 of 4 (full plan review, all phases)
- **Date**: 2026-09-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — shape-notes.md internally inconsistent after FR-004 reversal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/shape-notes.md:96-97, :143
- **Detail**: The FR-004 reversal (color-band storage → integer `score` 0-20) was correctly applied to the checkpoint decision log entry (line 38, "matrix input shape" topic) and to `prd.md`'s FR-004. But two other spots in the *same file* were missed: line 96-97 still restates FR-004 as "a pairing-matrix color-band estimate... Resolution: FR revised — input shape is color bands, not numeric scores" (the literal opposite of the final decision), and line 143 (Business Logic section) still says "pre-entered pairing-matrix estimates (color-banded, per our-army-vs-opponent-army pair)". A future reader of this file sees two contradictory statements about the same decision.
- **Fix**: Update shape-notes.md:96-97 and :143 to describe integer point-estimate storage with color-band display derived in the application layer, mirroring the language already used in the corrected line 38 and in `prd.md`'s FR-004 Socratic note.
- **Decision**: FIXED

### F2 — plan.md Phase 3 manual-verification bullet references the obsolete `color` column

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/schema-teams-opponents-matrix/plan.md:285
- **Detail**: Phase 3's Manual Verification bullet reads "confirm the generated columns match Phase 1's schema (names, nullability, the `color` check-constraint values)". Phase 1's actual Contract (and the Definitions table) was revised to `score integer check (score >= 0 and score <= 20)` — there is no `color` column anywhere in the shipped migration or generated types. This line was not swept when the rest of Phase 1/Definitions were updated.
- **Fix**: Replace "the `color` check-constraint values" with "the `score` integer range (0-20) enforced by the CHECK constraint".
- **Decision**: FIXED

### F3 — seed.sql not technically foreclosed from running against a linked production project

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql:1-2
- **Detail**: `seed.sql` inserts synthetic `auth.users` rows and is documented as "local only — never applied to production" in a comment. In practice, actual usage stayed safe (Phase 4 used `supabase db push`, which never touches `seed.sql`). But the modern Supabase CLI supports `supabase db reset --linked`, which *would* run this seed against a linked remote project if someone ever ran it — nothing in the file itself prevents that, only operator discipline.
- **Fix**: Strengthen the header comment with an explicit, impossible-to-miss warning, e.g. `-- WARNING: never run "supabase db reset --linked" against this project — it would seed fake users into production.`
- **Decision**: FIXED

### F4 — seed.sql's RLS-impersonation trick depends on implicit transaction batching

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql (all `set_config('request.jwt.claims', ..., true)` calls)
- **Detail**: Every `set_config` call uses `is_local = true` (transaction-scoped). This only behaves correctly if the Supabase CLI sends the whole file as one implicit transaction — there's no explicit `begin;`/`commit;` bracketing each impersonation block. It works today (empirically confirmed: `supabase db reset` completed with no RLS `RAISE EXCEPTION`, commit `b514d30`), but a future change to how the file is applied (different runner, statement-by-statement execution) would silently make `auth.uid()` evaluate to `NULL` between statements — which would fail loudly (RLS would reject the insert), not silently pass, but would break the seed script's idempotency guarantee in a confusing way.
- **Fix A ⭐ Recommended**: Switch every `set_config(..., true)` to `set_config(..., false)` (session-scoped instead of transaction-scoped) — removes the dependency on implicit transaction batching entirely, no bookkeeping needed.
  - Strength: Simplest fix, one-character change per call site, no structural changes to the script.
  - Tradeoff: Session-scoped means the claim persists until explicitly overwritten — already exactly what every block does (`reset role` clears the *role*, and the next `set_config` overwrites the *claim*), so no new risk introduced.
  - Confidence: HIGH — `is_local=false` is the more common pattern for exactly this kind of multi-statement impersonation script.
  - Blind spot: None significant.
- **Fix B**: Wrap each impersonation block in explicit `begin; ... commit;`.
  - Strength: Makes the transaction boundary visible and intentional in the script itself.
  - Tradeoff: More edits (4 blocks × 2 lines each), and explicit transactions inside a file already implicitly transactional by the CLI could interact unexpectedly (nested transaction semantics vary).
  - Confidence: MEDIUM — correct in principle, more moving parts to get right.
  - Blind spot: Haven't tested explicit `begin`/`commit` inside a `supabase db reset`-applied seed file in this CLI version.
- **Decision**: FIXED (via Fix A — verified: `supabase db reset` completed with no RLS `RAISE EXCEPTION`)

### F5 — Cascade deletes silently remove pairing-matrix estimates, no audit trail

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; informational, no action needed now
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260904185524_create_pairing_domain_schema.sql (all `on delete cascade` FKs)
- **Detail**: Deleting a `team_armies`/`opponent_armies` row cascades to delete any dependent `pairing_matrix_estimates` rows with no soft-delete or audit trail. This matches the plan's stated intent (cascade supports a future delete-UI slice) and isn't a bug in this change — but nothing currently protects a captain from silently losing previously-entered estimates if a future delete UI doesn't warn them first.
- **Fix**: None needed in this change. Flag for whichever future slice adds army/team deletion UI: show a confirmation naming how many saved estimates would be lost.
- **Decision**: SKIPPED (lesson entry proposed, user cancelled — not recorded)

### F6 — RLS enabled without FORCE ROW LEVEL SECURITY (expected, not a defect)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — informational only
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260904185524_create_pairing_domain_schema.sql (RLS enable block)
- **Detail**: All 5 tables use `enable row level security` without `force row level security`, meaning the table owner and superuser roles bypass RLS. This is the standard, expected Supabase pattern (migrations and admin tooling run as owner/superuser and are meant to bypass RLS) — not a defect, noted for awareness only.
- **Fix**: None needed.
- **Decision**: SKIPPED
