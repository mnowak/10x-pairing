# Error-Handling/Observability Pass — Plan Brief

> Full plan: `context/changes/error-visibility-pass/plan.md`

## What & Why

Today's app has 17 places (SSR pages, API routes, one lib function, one client-side fetch handler) that catch a real error and discard it in favor of a generic message — with zero logging anywhere in the codebase. This is precisely why the two recent production incidents (missing DB GRANTs, an unapplied migration) took live database queries to diagnose instead of a log line. This slice (roadmap S-11) wires a shared `logError()` helper into all 17 sites so the next incident's real cause is visible.

## Starting Point

Cloudflare's `observability: { enabled: true }` is already on in `wrangler.jsonc`, but nothing feeds it — every catch site is a dead end. Two error-display patterns already exist (`ServerError.tsx`, `Banner.astro`) and are not being touched by this change.

## Desired End State

Every one of the 17 catch sites calls `logError(context, error)` before its existing (unchanged) fallback behavior runs. During the next incident, the real error's message and stack trace are visible in Cloudflare Workers Logs (or the browser console for the one client-side site) instead of nothing.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Logging mechanism | Shared `logError()` helper in `src/lib/logError.ts` over bare inline `console.error` | Consistent, greppable shape across 17 sites; one place to extend later |
| User-facing messages | Stay exactly as they are today | This is an internal-visibility pass, not a UX change — zero behavior risk |
| Scope of catch sites | 16 undocumented server-side swallows + 1 client-side; the 4 already-documented intentional silent catches are untouched | Matches the roadmap's stated target; doesn't second-guess a deliberate prior decision |
| Success bar | Cloudflare Workers Logs dashboard is sufficient | Zero new infrastructure — `observability: true` is already on, this just starts feeding it |
| Client-side catch (`MatrixGrid.tsx`) | Browser `console.error` only, no server round-trip | The underlying server-side failure that usually causes it is already logged independently |
| Log depth | Message + stack trace | A stack trace is what turns "something failed" into "line X failed" — the whole point of this slice |
| UI components | Left untouched — no convergence of `ServerError.tsx`/`Banner.astro` | Keeps this a backend-visibility change; avoids reopening UX scope not asked for |
| Testing | Unit-test `logError()` itself; spot-check call sites manually | The helper is the one piece of new logic worth testing; call sites are one-line additions to already-tested flows |

## Scope

**In scope:**
- New `src/lib/logError.ts` helper + `src/lib/logError.test.ts`
- Wiring `logError()` into all 16 server-side catch sites (11 `.astro` pages, 5 API routes, 1 lib function) and the 1 client-side catch in `MatrixGrid.tsx`

**Out of scope:**
- Any change to user-facing messages, redirects, or status codes
- The 4 documented-intentional silent catches (`matrix.ts:50`, `matchSessionStorage.ts` ×3)
- Unifying the two existing error-display components
- A server round-trip for the client-side catch
- Third-party error-tracking service integration (Sentry etc.)
- A scripted/lint-rule guarantee against future silent catches

## Architecture / Approach

One small isomorphic helper (`logError(context, error)`, no server-only dependencies) is imported into both `.astro` frontmatter and one React client island, then mechanically wired into 17 catch sites in two review-sized batches: SSR pages first, then API routes + lib + the client-side site.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared logging helper | `logError()` + unit tests | Low — new, isolated, well-tested code |
| 2. Wire into SSR pages | 11 `.astro` catch sites logging | Low — mechanical change, but touches many files; verify no behavior drift |
| 3. Wire into API/lib/client | 5 API routes + 1 lib fn + 1 client site logging | Low — same mechanical pattern; client-side site needs a quick browser-bundle sanity check |

**Prerequisites:** None — independent hardening work, no dependency on other in-flight slices.
**Estimated effort:** ~1 session across 3 phases (small, mechanical diff per site).

## Open Risks & Assumptions

- Assumes Cloudflare Workers Logs will actually surface `console.error` output from all runtime contexts (SSR page loads and API routes) without additional wrangler config — `observability: { enabled: true }` with default sampling is assumed sufficient; if sampling drops error-level logs in practice, that's a follow-up outside this slice's scope.
- Assumes the context-label naming scheme (`"<file>: <function>"`) stays human-greppable at 17 sites without needing a stricter taxonomy — reasonable for a solo-captain-scale MVP per the roadmap's own framing.

## Success Criteria (Summary)

- All 17 target catch sites call `logError()` with no change to any user-facing message, redirect, or status code.
- `npm test`, `npm run lint`, `npx astro check`, and `npm run build` all pass after each phase.
- A manually forced failure at a representative site in each phase produces a real, structured log line (server-side via Workers Logs / dev terminal, or browser console for the one client-side site).
