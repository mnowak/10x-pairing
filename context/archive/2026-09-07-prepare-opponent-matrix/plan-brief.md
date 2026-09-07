# Prepare Opponent Matrix — Plan Brief

> Full plan: `context/changes/prepare-opponent-matrix/plan.md`

## What & Why

Let a captain add opponent teams and prepare a pairing-matrix estimate against each one — a grid of our armies × their armies, each cell a color-banded point estimate. Roadmap item S-02, the PRD's north star: the smallest complete flow that proves captains will actually use the tool.

## Starting Point

`opponents`/`opponent_armies`/`pairing_matrix_estimates` tables exist and are RLS-protected (F-01, archived), zero application code queries them yet. S-01 (archived) established the local pattern this slice extends: typed data-access modules, FormData→redirect API routes, hand-rolled forms, shared `components/forms/*` primitives. No grid/table UI exists anywhere in the repo, and no JSON API route exists — both are new for this slice.

## Desired End State

A captain adds an opponent (name + roster, mirrors team creation), lands on that opponent's page showing a grid of our armies × their armies, clicks any cell to pick one of 5 colors, sees it save instantly (no reload), and can revisit and change any pick later. Repeatable for any number of opponents.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Color band boundaries | Custom: red 0-3, orange 4-8, yellow 9-11, green 12-15, dark-green 16-20 | User's explicit call — original worksheet ranges overlap and can't be used as-is | Plan (user override) |
| Matrix entry mechanism | Color swatch picker (5 buttons), mapped to a representative stored number | User's explicit call — matches how captains actually think, at the cost of some precision | Plan (user override) |
| Grid layout | Full table (our armies × their armies), horizontally scrollable on mobile | Matrix prep is offline/batch work, not the live-match NFR's one-handed-at-a-table scenario | Plan |
| Save behavior | Auto-save per cell, immediately on pick | Protects the PRD guardrail against losing entered estimates if the captain closes the tab mid-prep | Plan |
| Opponent CRUD | Exact mirror of S-01's team pattern (create with roster, add-army-later, no remove) | Consistency, minimal new surface; opponent-side removal is a new, separately-tracked gap | Plan |
| Navigation | New `/dashboard/opponents` list + `/dashboard/opponents/[id]` detail page | Matches `/dashboard/team`'s existing shape | Plan |
| Empty cell | Blank placeholder, not a default color | A default color would collide with F-01's "no row = no estimate" design | Plan |
| Color legend | Shown on the grid screen | Custom (non-worksheet) palette needs an on-screen key | Plan |
| Edit vs create | Same UPSERT endpoint for both | Schema's `unique(team_army_id, opponent_army_id)` already supports `ON CONFLICT DO UPDATE` | Plan |
| API shape for matrix | First JSON (`fetch()`-based) route in the app | Auto-save-per-cell can't use full-page FormData→redirect without a terrible reload-per-click UX | Plan |

## Scope

**In scope:** color-band mapping module, opponent data-access + API routes + UI (mirroring S-01), matrix data-access + JSON API route + grid UI with legend and auto-save.

**Out of scope:** removing/renaming an opponent or opponent army, opponent-vs-opponent comparisons, live match-mode logic (S-03), any test framework, pagination.

## Architecture / Approach

Three phases: data layer (color-bands, `opponents.ts`, `matrix.ts`) → API routes (two FormData mirrors of S-01's, one new JSON route) → UI (opponent components adapted from S-01's, plus the new `MatrixGrid`). The matrix upsert explicitly re-verifies both army IDs belong to the requesting captain before writing — RLS alone doesn't catch a cross-captain FK reference.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | Color-band module, opponents.ts, matrix.ts (with ownership check) | Getting the ownership-verification logic right — RLS alone is insufficient here |
| 2. API routes | `/api/opponents`, `/api/opponents/armies`, `/api/matrix` (JSON, first of its kind) | First deviation from the established FormData convention — must be well-justified and contained to just this one route |
| 3. UI | Opponent CRUD (adapted from S-01), `MatrixGrid` with legend + auto-save | First grid UI in the app, no local precedent to follow |

**Prerequisites:** S-01 (done, archived) — team must exist to have "our armies" for the grid. F-01 (done, archived) — schema already live.
**Estimated effort:** Not estimated (roadmap items carry no time units) — see `plan.md` for phase-level detail.

## Open Risks & Assumptions

- The custom color palette (red/orange/yellow/green/dark-green) replaces the worksheet's palette entirely — if a captain has already memorized the original colors from paper prep, this could cause brief confusion; the on-screen legend is the mitigation.
- Representative scores per band (2/6/10/14/18) are rounded midpoints chosen by the plan, not explicitly confirmed number-by-number by the user — worth a quick sanity check during Phase 1 manual review before they're load-bearing everywhere.

## Success Criteria (Summary)

- A captain can add multiple opponents, each with an independent, correctly-sized grid.
- Picking or changing any cell's color saves instantly and persists.
- No cross-opponent or cross-captain data leakage, verified directly in Supabase Studio.
