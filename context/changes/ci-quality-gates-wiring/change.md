---
change_id: ci-quality-gates-wiring
title: CI pipeline correctly gates every merge
status: implementing
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Roadmap slice S-09 (`context/foundation/roadmap.md`, milestone M-3: mvp-release-preparation) — the milestone's north star. Two real production incidents during M-2's tail (missing DB GRANTs, an unapplied migration) exposed that CI has never actually run: `.github/workflows/ci.yml` triggers on `master`, a branch that has never existed in this repo (always `main`), and even when triggered, only ever ran lint + build — never `npx astro check` (typecheck) or `npm test`.

Research during `/10x-plan` found the fix is simpler than expected: the test suite needs zero GitHub secrets (the `twoCaptains.ts` fixture already hardcodes the well-known, deterministic local Supabase CLI demo credentials, bypassing `astro:env` entirely) and `astro build` was verified to succeed with no `SUPABASE_URL`/`SUPABASE_KEY` set at all — the existing `secrets.SUPABASE_URL`/`KEY` references in `ci.yml` are dead config.

Scope: fix + restructure `ci.yml` into 4 parallel jobs (lint, typecheck, build, test with a real local Supabase instance via the Supabase CLI), then configure GitHub branch protection on `main` requiring all 4 to pass (no PR requirement, no review requirement — solo-dev project).
