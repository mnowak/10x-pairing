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

CI (`.github/workflows/ci.yml`): `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`, with `SUPABASE_URL`/`SUPABASE_KEY` from repo secrets.

## Architecture

- Astro `output: "server"` on the Cloudflare adapter (`astro.config.mjs`) — every route is SSR by default, not static.
- Auth: `src/middleware.ts` builds a Supabase SSR client per request and sets `context.locals.user`; protected paths are a prefix array (`PROTECTED_ROUTES`, currently `["/dashboard"]`) — add new protected routes there rather than gating per-page.
- `src/lib/supabase.ts` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are unset (both are `optional: true` in the `astro:env` schema) instead of throwing. Every call site must handle the `null` case — see `src/lib/config-status.ts`'s `missingConfigs` for the pattern of surfacing "not configured" in the UI rather than crashing.
- Path alias `@/*` → `src/*` (`tsconfig.json`), also backing the shadcn/ui aliases in `components.json` (`style: "new-york"`, icons via `lucide-react`).
- API routes live under `src/pages/api/**` as Astro endpoints (e.g. `src/pages/api/auth/signin.ts`): they read `FormData` and respond with a redirect, not JSON — that's the established auth-flow pattern here.
- React is for interactive islands only (`src/components/**/*.tsx`); page shells and static content stay `.astro`.
- Local secrets live in two files copied from `.env.example`: `.env` (Supabase CLI / `astro:env`) and `.dev.vars` (Cloudflare `workerd` runtime) — both need updating together or the dev server and `astro:env` will disagree on config.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
