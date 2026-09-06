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

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
