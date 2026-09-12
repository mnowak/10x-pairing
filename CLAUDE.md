# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Pairing Assistant — a live pairing tool for Warhammer 40k team-tournament captains (defender/attacker reveal sequence against a pre-entered pairing-matrix). Full product spec: `@context/foundation/prd.md`. Only the starter's auth scaffold is implemented so far; the pairing/matrix domain logic described in the PRD has not been built yet.

## Commands

- `npm run dev` — dev server (Cloudflare `workerd` runtime via `astro dev`)
- `npm run build` — production build; `npm run preview` — preview it locally
- `npm run lint` / `npm run lint:fix` — ESLint (flat config, `strictTypeChecked`)
- `npm run format` — Prettier (writes)
- `npx astro sync` — regenerates `astro:env` / content types; run this if `astro:env/server` imports fail to resolve. CI runs it before lint/build.
- No test script/framework is configured yet.
- `npx supabase start` / `stop` — local Supabase stack (Docker required); Studio at `http://localhost:54323`

CI (`.github/workflows/ci.yml`), on push/PR to `main`: 4 independent parallel jobs — `lint`, `typecheck` (`npx astro check`), `build`, and `test` (spins up a local Supabase instance via the Supabase CLI, then runs the full suite). No GitHub secrets are required — `astro build` succeeds with `SUPABASE_URL`/`SUPABASE_KEY` unset (both `optional: true`), and the test suite's DB-dependent files use hardcoded local-only demo credentials (see `src/lib/testSupport/twoCaptains.ts`), bypassing `astro:env` entirely. All 4 checks are required on `main` via branch protection.

## Architecture

- Astro `output: "server"` on the Cloudflare adapter (`astro.config.mjs`) — every route is SSR by default, not static.
- Auth: `src/middleware.ts` builds a Supabase SSR client per request and sets `context.locals.user`; protected paths are a prefix array (`PROTECTED_ROUTES`, currently `["/dashboard"]`) — add new protected routes there rather than gating per-page.
- `src/lib/supabase.ts` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are unset (both are `optional: true` in the `astro:env` schema) instead of throwing. Every call site must handle the `null` case — see `src/lib/config-status.ts`'s `missingConfigs` for the pattern of surfacing "not configured" in the UI rather than crashing.
- Path alias `@/*` → `src/*` (`tsconfig.json`), also backing the shadcn/ui aliases in `components.json` (`style: "new-york"`, icons via `lucide-react`).
- API routes live under `src/pages/api/**` as Astro endpoints (e.g. `src/pages/api/auth/signin.ts`): they read `FormData` and respond with a redirect, not JSON — that's the established auth-flow pattern here.
- React is for interactive islands only (`src/components/**/*.tsx`); page shells and static content stay `.astro`.
- Local secrets live in two files copied from `.env.example`: `.env` (Supabase CLI / `astro:env`) and `.dev.vars` (Cloudflare `workerd` runtime) — both need updating together or the dev server and `astro:env` will disagree on config.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
