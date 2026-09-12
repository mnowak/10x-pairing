---
change_id: error-visibility-pass
title: Error-handling/observability pass
status: implemented
created: 2026-09-12
updated: 2026-09-12
---

## Notes

Roadmap slice S-11 (`context/foundation/roadmap.md`, milestone M-3: mvp-release-preparation). Today's two production incidents (missing DB GRANTs, an unapplied migration) took extra digging to diagnose partly because the app itself has zero error visibility: 17 catch sites across `.astro` pages, API routes, and one lib function discard the real error and substitute a generic message, with no logging anywhere in `src/`. Cloudflare `observability: enabled` is already on in `wrangler.jsonc` but nothing feeds it.

Scope: add a shared `logError()` helper and wire it into all 16 server-side swallow sites plus the one client-side fetch-error catch (browser-only). User-facing messages are unchanged — this is purely an internal-visibility pass. The 4 already-documented intentional silent catches (`matrix.ts:50`, `matchSessionStorage.ts` ×3) are left untouched.
