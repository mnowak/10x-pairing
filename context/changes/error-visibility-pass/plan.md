# Error-Handling/Observability Pass Implementation Plan

## Overview

Replace 17 silent `catch {}` blocks across the app with a shared `logError()` helper that logs the real error (context label, message, stack) to `console.error`, feeding the already-enabled Cloudflare Workers Logs pipeline. This is purely an internal-visibility change — no user-facing message, redirect target, or UI component changes.

## Current State Analysis

- **17 catch sites discard the real error today**, all replacing it with a hardcoded string and none logging anything:
  - 11 in SSR page loads: `src/pages/dashboard/team.astro:24`, `opponents/index.astro:15`, `opponents/[id].astro:20,32,46`, `opponents/[id]/match.astro:21,33,45`, `opponents/[id]/simulate.astro:21,33,47`
  - 5 in API routes: `src/pages/api/matrix.ts:25`, `src/pages/api/opponents/armies.ts:31`, `src/pages/api/opponents/armies/remove.ts:31`, `src/pages/api/teams/armies.ts:26`, `src/pages/api/teams/index.ts:18`
  - 1 in a shared lib function: `src/lib/matrix.ts:78` (`upsertEstimate`'s catch around `getTeamWithArmies`)
  - 1 client-side, in a React island: `src/components/matrix/MatrixGrid.tsx:43` (fetch-error catch)
- **Zero logging exists anywhere in `src/`** — no `console.error`/`console.warn`, no logger, no error-tracking SDK. `wrangler.jsonc` has `observability: { enabled: true }` with default sampling, but nothing currently feeds it.
- **4 catch sites are already documented as intentionally silent** and are explicitly out of scope: `src/lib/matrix.ts:50` (out-of-range score, DB CHECK makes it unreachable — comment already explains the skip) and `src/lib/matchSessionStorage.ts:71,83,103,111` (localStorage unavailable — comment already explains the silent degrade).
- **Two disconnected error-display patterns already exist** and are not being touched: `src/components/forms/ServerError.tsx` (inline red banner, `serverError` prop) and `src/components/Banner.astro` (page-level banner, currently only used for missing-config warnings in `Layout.astro`).
- **`src/lib/supabase.ts`'s null-on-missing-config pattern** is the precedent for "surface configuration problems explicitly rather than crashing" — this plan follows the same spirit (make failures visible) but at the logging layer, not the config layer.

## Desired End State

Every one of the 17 sites above calls `logError(context, error)` before falling back to its existing (unchanged) user-facing behavior. During the next real incident, the actual error's message and stack trace are visible in Cloudflare Workers Logs (server-side sites) or the browser console (the one client-side site) instead of a dead end.

**Verification:** `npm test`, `npm run lint`, `npx astro check`, and `npm run build` all pass; manually triggering a failure at a representative site in each phase shows a structured log line containing the real error, and the page/API still behaves exactly as it does today (same redirect, same displayed message).

### Key Discoveries:

- All 17 sites currently use `catch {}` (or `catch { ... }` with no error binding) — every site needs the binding added (`catch (error) { ... }`) as part of wiring in the call.
- `logError()` has no server-only dependencies (just `Date`, `JSON.stringify`, `console.error`), so the same function can be imported unchanged into both `.astro` frontmatter (SSR/Workers runtime) and `MatrixGrid.tsx` (browser bundle) — no separate client/server variant needed.
- Test convention in this repo is a colocated `<file>.test.ts` using Vitest (see `src/lib/matrix.test.ts`, `src/lib/matchSessionStorage.test.ts`) — `logError.ts` follows the same pattern.

## What We're NOT Doing

- Not changing any user-facing error message, redirect target, or HTTP status code — every site's existing behavior after the catch is preserved exactly.
- Not touching the 4 already-documented intentional silent catches (`matrix.ts:50`, `matchSessionStorage.ts` ×3).
- Not unifying `ServerError.tsx` and `Banner.astro` into one error-display pattern.
- Not adding a server round-trip for the client-side `MatrixGrid.tsx` catch — it logs to the browser console only.
- Not integrating a third-party error-tracking service (Sentry etc.) — `console.error` feeding the already-enabled Cloudflare Workers Logs is the full scope.
- Not adding a scripted/lint-rule check that guarantees every future catch site calls `logError()` — this pass fixes the current 17 sites; regression prevention beyond that is out of scope.

## Implementation Approach

Add one small shared helper (`src/lib/logError.ts`), unit-test it in isolation, then mechanically wire it into each catch site in two batches (SSR pages, then API/lib/client) so each phase's diff stays reviewable and independently verifiable.

## Phase 1: Shared logging helper

### Overview

Create the `logError()` helper and its unit tests. Nothing else in the app changes yet.

### Changes Required:

#### 1. Logging helper

**File**: `src/lib/logError.ts`

**Intent**: Provide one function every catch site calls to record a structured, greppable log line (context label + the real error's message and stack) via `console.error`, instead of each site inventing its own ad hoc logging.

**Contract**: `logError(context: string, error: unknown): void`. Builds a plain object `{ context, timestamp: <ISO 8601 string>, message, stack? }` — `message`/`stack` come from `error.message`/`error.stack` when `error instanceof Error`, otherwise `message` falls back to `String(error)` and `stack` is omitted — and passes it to `console.error(JSON.stringify(...))`. No return value, no throwing (a logging call must never itself become a new source of failure).

#### 2. Unit tests

**File**: `src/lib/logError.test.ts`

**Intent**: Lock down the helper's behavior so downstream wiring can trust it: real `Error` inputs produce a message+stack, non-`Error` thrown values (string, plain object) still produce a usable log line without crashing.

**Contract**: Spy on `console.error` (Vitest `vi.spyOn`), call `logError("test-context", <input>)` for both an `Error` instance and a non-`Error` value, and assert the parsed JSON payload contains the expected `context`, `message`, and (only for the `Error` case) a `stack` field.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Run `npm test -- logError` locally and confirm both the `Error` and non-`Error` cases pass.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Wire into SSR page catch sites

### Overview

Wire `logError()` into all 11 bare `catch {}` blocks in `src/pages/dashboard/**/*.astro`, preserving each site's existing fallback behavior (generic `error` variable set, or redirect with the same `?error=` message) exactly.

### Changes Required:

#### 1. Team page

**File**: `src/pages/dashboard/team.astro`

**Intent**: Log the real cause when `getTeamWithArmies`/`getEstimateCountsForTeamArmies` fails, before falling back to the existing generic `error` message shown via `ServerError`.

**Contract**: Line 24's `catch {}` becomes `catch (error) { logError("team.astro: getTeamWithArmies/getEstimateCountsForTeamArmies", error); error ??= "Something went wrong loading your team"; }` (variable name shadows the existing page-level `error` `let` — use a distinct binding, e.g. `err`, to avoid the collision). Import `logError` from `@/lib/logError`.

#### 2. Opponents list page

**File**: `src/pages/dashboard/opponents/index.astro`

**Intent**: Log the real cause when `getOpponentsWithArmies` fails, before the existing generic fallback.

**Contract**: Line 15's `catch {}` becomes `catch (err) { logError("opponents/index.astro: getOpponentsWithArmies", err); error ??= "Something went wrong loading your opponents"; }`.

#### 3. Opponent detail page

**File**: `src/pages/dashboard/opponents/[id].astro`

**Intent**: Log the real cause at each of the three independent failure points (opponent lookup, matrix grid, estimate counts) before each one's existing redirect.

**Contract**: Lines 20, 32, 46 — each `catch {}` becomes `catch (err) { logError("opponents/[id].astro: <getOpponentWithArmies|getMatrixGrid|getEstimateCountsForOpponentArmies>", err); return Astro.redirect(...unchanged...); }`, one distinct context label per site.

#### 4. Match mode page

**File**: `src/pages/dashboard/opponents/[id]/match.astro`

**Intent**: Log the real cause at each of the three failure points (opponent, team, matrix grid lookups) before each one's existing redirect.

**Contract**: Lines 21, 33, 45 — same pattern as above, context labels `"match.astro: getOpponentWithArmies"`, `"match.astro: getTeamWithArmies"`, `"match.astro: getMatrixGrid"`.

#### 5. Simulate mode page

**File**: `src/pages/dashboard/opponents/[id]/simulate.astro`

**Intent**: Log the real cause at each of the three failure points, mirroring `match.astro`.

**Contract**: Lines 21, 33, 47 — same pattern, context labels `"simulate.astro: getOpponentWithArmies"`, `"simulate.astro: getTeamWithArmies"`, `"simulate.astro: getMatrixGrid"`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- Existing test suite still passes: `npm test`

#### Manual Verification:

- With `npm run dev` running, temporarily force one lookup to throw (e.g. pass an invalid Supabase URL, or throw inside a mocked call) for one representative page (e.g. `team.astro`) and confirm: (a) the terminal shows a `logError` JSON line with the real error's message/stack, and (b) the page still renders/redirects exactly as it does today (same message, same destination).
- Spot-check one more page from each file above (opponents list, opponent detail, match, simulate) to confirm no behavior regression.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wire into API routes, the lib function, and the client-side site

### Overview

Wire `logError()` into the 5 API-route catches, the one `src/lib/matrix.ts` catch, and the one client-side catch in `MatrixGrid.tsx` — completing coverage of all 17 target sites.

### Changes Required:

#### 1. Matrix API route

**File**: `src/pages/api/matrix.ts`

**Intent**: Log malformed-JSON request bodies (the message shown to the client, `"Invalid JSON body"`, is already accurate — this adds a log line so repeated bad requests are visible).

**Contract**: Line 25's `catch {}` becomes `catch (error) { logError("api/matrix.ts: request.json()", error); return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }`.

#### 2. Opponent armies API routes

**File**: `src/pages/api/opponents/armies.ts`, `src/pages/api/opponents/armies/remove.ts`

**Intent**: Log the real cause when `getOpponentWithArmies` fails before the existing redirect.

**Contract**: Line 31 in each file — `catch {}` becomes `catch (error) { logError("api/opponents/armies.ts: getOpponentWithArmies", error); return context.redirect(...unchanged...); }` (context label reflects each file's own path).

#### 3. Team armies API routes

**File**: `src/pages/api/teams/armies.ts`, `src/pages/api/teams/index.ts`

**Intent**: Log the real cause when `getTeamWithArmies` fails before the existing redirect.

**Contract**: Line 26 and line 18 respectively — same pattern, context labels `"api/teams/armies.ts: getTeamWithArmies"` and `"api/teams/index.ts: getTeamWithArmies"`.

#### 4. Matrix lib function

**File**: `src/lib/matrix.ts`

**Intent**: Log the real cause when `upsertEstimate`'s internal `getTeamWithArmies` call fails, before returning the existing `{ ok: false, error: "..." }` shape to its caller (`api/matrix.ts`).

**Contract**: Line 78's `catch {}` becomes `catch (error) { logError("matrix.ts: upsertEstimate -> getTeamWithArmies", error); return { ok: false, error: "Something went wrong loading your team" }; }`.

#### 5. Client-side matrix grid

**File**: `src/components/matrix/MatrixGrid.tsx`

**Intent**: Log the real fetch failure to the browser console before falling back to the existing "Network error — try again" cell message. Browser-only — no server round-trip.

**Contract**: Line 43's `catch {}` becomes `catch (error) { logError("MatrixGrid.tsx: pickEstimate fetch", error); setCellErrors((prev) => ({ ...prev, [key]: "Network error — try again" })); }`. Import `logError` from `@/lib/logError` — safe in the client bundle since the helper has no server-only dependencies.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- Full test suite passes: `npm test`

#### Manual Verification:

- Trigger a failure in one API route (e.g. `api/teams/armies.ts` with a broken Supabase client) and confirm a `logError` line appears server-side with the real error, and the redirect/message is unchanged.
- With devtools open, trigger a network failure while saving a matrix cell (e.g. throttle to offline in devtools) and confirm the browser console shows a structured `logError` line and the cell still shows "Network error — try again".
- Confirm no regression across all 17 sites by running through the smoke-test paths already covered by the test suite plus one manual pass over team/opponents/match/simulate pages.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `logError()` behavior for both `Error` and non-`Error` inputs (Phase 1).
- No new unit tests for the 17 wired call sites themselves — they're one-line additions to already-tested flows (`teams.test.ts`, `matrix.test.ts`, `opponents.test.ts` etc. continue covering the underlying logic); this pass only adds a side-effecting log call, which unit tests would otherwise need to mock `console.error` at every existing test to assert on, disproportionate to the risk.

### Integration Tests:

- None added — no new integration-level behavior is introduced; existing integration coverage (if any, per `test-plan.md`) continues to exercise the same request paths.

### Manual Testing Steps:

1. Force a failure in `team.astro`'s data load and confirm a structured log line appears in the dev server terminal.
2. Force a failure in one `.astro` redirect-on-error page (`opponents/[id].astro`) and confirm the redirect target and query-string message are byte-identical to before this change.
3. Force a failure in one API route (`teams/armies.ts`) and confirm the same redirect behavior plus a server-side log line.
4. Force a client-side network failure while saving a matrix cell and confirm a browser-console log line plus the unchanged inline error text.

## Performance Considerations

None — `console.error` with a small JSON payload is negligible relative to the Supabase round-trips already happening at every one of these sites.

## Migration Notes

Not applicable — no data model or schema changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` § S-11
- Change identity: `context/changes/error-visibility-pass/change.md`
- Existing null-on-missing-config precedent: `src/lib/supabase.ts:6-9`, `src/lib/config-status.ts`
- Existing test convention: `src/lib/matrix.test.ts`, `src/lib/matchSessionStorage.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared logging helper

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Type checking passes: `npx astro check`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 `npm test -- logError` confirms both Error and non-Error cases pass

### Phase 2: Wire into SSR page catch sites

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`
- [ ] 2.4 Existing test suite still passes: `npm test`

#### Manual

- [ ] 2.5 Forced failure on `team.astro` shows a `logError` line and unchanged page behavior
- [ ] 2.6 Spot-check opponents list, opponent detail, match, and simulate pages for no behavior regression

### Phase 3: Wire into API routes, the lib function, and the client-side site

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`
- [ ] 3.4 Full test suite passes: `npm test`

#### Manual

- [ ] 3.5 Forced API-route failure shows a server-side `logError` line and unchanged redirect/message
- [ ] 3.6 Forced client-side network failure shows a browser-console `logError` line and unchanged cell message
- [ ] 3.7 Smoke-test pass across team/opponents/match/simulate pages confirms no regression
