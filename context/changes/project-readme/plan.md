# Project README Implementation Plan

## Overview

Rewrite `README.md` so a new reader — contributor or future-you — understands what the Pairing Assistant does, how the live pairing sequence works, and where the project stands on its roadmap, directly from the README, while keeping (trimmed and corrected) the local-dev setup instructions.

## Current State Analysis

`README.md` is the unmodified `10x-astro-starter` boilerplate: a generic tech-stack list, prerequisites, getting-started steps, full Supabase configuration walkthrough, project-structure tree, deployment steps, and a CI summary — with zero mention of the pairing product itself. It also contains one stale fact: the CI section says "lint + build on every push and PR to `master`," but `.github/workflows/ci.yml` actually triggers on `main` and runs 4 independent jobs (lint, typecheck, build, test — the last spinning up a local Supabase instance).

## Desired End State

`README.md` leads with what the product is and does (persona + the live defender/attacker reveal sequence), gives a short roadmap status pointing to `context/foundation/roadmap.md` for detail, retains the Tech Stack list, and follows with a trimmed, corrected local-dev setup (prerequisites + getting started + essential Supabase config, collapsed from the current multi-subsection walkthrough) and a corrected CI/Deployment section. Verify by reading the file top-to-bottom: a reader with no other context should come away knowing what the app does, how a live round is paired, what's shipped vs. in progress, and how to run it locally.

### Key Discoveries:

- `README.md:169-171` — CI section is stale (`master`, lint+build only); actual behavior is `.github/workflows/ci.yml:1-8` (triggers on `main`) and 4 jobs including `test` (`.github/workflows/ci.yml:39-50`).
- `context/foundation/prd.md:20-24` (Vision) and `:110-118` (Business Logic) — the accurate, captain-facing description of the live pairing sequence to draw the README walkthrough from.
- `context/foundation/roadmap.md:45-56` (At a glance table) and `:198-201` (Milestone History) — the source for the roadmap status summary; link rather than duplicate the full slice table.
- `package.json` scripts include `test`, `test:watch`, `test:e2e`, `db:types` — not listed in the current README's Available Scripts section.
- No `LICENSE` file exists despite the README's "MIT" license line — pre-existing, out of scope for this change (not part of S-15's outcome).

## What We're NOT Doing

- Not writing a full PRD-equivalent walkthrough of every business rule (refused-attacker weighting nuance, practice-mode opponent styles in detail) — those stay in `context/foundation/prd.md`.
- Not adding screenshots or diagrams.
- Not adding course/cohort/certification references (universal-language convention already established for this project's toolkit skills).
- Not fixing the missing `LICENSE` file — pre-existing gap, unrelated to this slice's outcome.
- Not restructuring `src/` or any code — this is a documentation-only change.

## Implementation Approach

Single-file rewrite of `README.md`. No code, schema, or config changes. Structure, top to bottom:

1. Title + one-line product description
2. What it does (persona + problem, 2-3 sentences)
3. The live pairing sequence (numbered 4-6 step walkthrough)
4. Project status (roadmap summary + link to `context/foundation/roadmap.md`)
5. Tech Stack (kept as-is)
6. Local development (trimmed: prerequisites + getting started + essential Supabase env setup, collapsed from today's 5 separate subsections)
7. Available Scripts (corrected to include `test`, `test:watch`, `test:e2e`, `db:types`)
8. Deployment (kept, brief)
9. CI (corrected: `main`, 4 jobs)
10. License

## Phase 1: Rewrite README.md

### Overview

Replace the generic starter README with the product-first structure above in a single pass.

### Changes Required:

#### 1. Project README

**File**: `README.md`

**Intent**: Replace the Astro-starter boilerplate with a README that opens with what the Pairing Assistant is and does, walks through the live defender/attacker reveal sequence at a level a new reader can follow without opening the PRD, summarizes roadmap status with a link to the full roadmap, and keeps a corrected, trimmed local-dev setup.

**Contract**: Markdown document, no code contract. Required content elements (each must appear, exact wording is the writer's judgment):
- Product name + one-line description of the pairing tool and its persona (team captain).
- A numbered sequence describing the live reveal: pick defender → opponent reveals their defender → app suggests attacker pair → opponent picks which attacker to send → app suggests accept/reject weighing the downstream refused-attacker matchup → repeat for sub-round 2 → final armies auto-paired as refused attacker.
- A "Status" or "Roadmap" section naming what's shipped (M-1 live-pairing MVP, M-2 pairing-simulation) and what's active (M-3 release hardening), linking to `context/foundation/roadmap.md`.
- Tech Stack list retained verbatim (or near-verbatim) from the current README.
- Local dev setup collapsed to: prerequisites, clone/install, `.env`/`.dev.vars` creation, local Supabase start (`npx supabase start`), and the email-confirmation-toggle note (still needed for first sign-up to work) — without the current file's fully separated "First-time setup" / "Using a cloud Supabase project" / "Email confirmation" subsections.
- Available Scripts section updated to include every script in `package.json` (`dev`, `build`, `preview`, `lint`, `lint:fix`, `format`, `test`, `test:watch`, `test:e2e`, `db:types`).
- CI section corrected: triggers on `main`, 4 jobs (lint, typecheck, build, test), test job spins up local Supabase via CLI.
- License section unchanged (MIT).

### Success Criteria:

#### Automated Verification:

- [ ] Every relative link/path referenced in the README resolves to a real file: `test -f context/foundation/roadmap.md`, `test -f context/foundation/prd.md`
- [ ] `npm run build` still succeeds (README change is inert to the build, sanity-check only)

#### Manual Verification:

- [ ] Read the rewritten README top-to-bottom with no other context open — confirm you come away understanding what the app does, how a live round is paired, and what's shipped vs. in progress
- [ ] Confirm the CI and Available Scripts sections match the actual `.github/workflows/ci.yml` and `package.json` contents
- [ ] Confirm local-dev steps are still sufficient to get a fresh clone running (no step silently dropped in the trim)

**Implementation Note**: After completing this phase and automated verification passes, pause here for manual confirmation from the human that the manual read-through was satisfactory before closing out the change.

---

## Testing Strategy

### Unit Tests:

- Not applicable — documentation-only change, no code under test.

### Integration Tests:

- Not applicable.

### Manual Testing Steps:

1. Open `README.md` fresh (as if landing on the repo for the first time) and read top to bottom.
2. Confirm the pairing-sequence walkthrough matches the PRD's Business Logic section without contradicting it.
3. Follow the local-dev setup steps on a clean checkout (or mentally trace them) to confirm nothing load-bearing was trimmed.
4. Cross-check the CI and Available Scripts sections line-by-line against `.github/workflows/ci.yml` and `package.json`.

## Performance Considerations

None — documentation-only change.

## Migration Notes

None — no data or code migration involved.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-15, milestone M-3)
- Product spec: `context/foundation/prd.md`
- Current CI config: `.github/workflows/ci.yml`
- Current README (baseline being replaced): `README.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rewrite README.md

#### Automated

- [x] 1.1 Every relative link/path referenced in the README resolves to a real file
- [x] 1.2 `npm run build` still succeeds

#### Manual

- [x] 1.3 Read the rewritten README top-to-bottom — confirms understanding of product, pairing sequence, and roadmap status
- [x] 1.4 CI and Available Scripts sections match actual `.github/workflows/ci.yml` and `package.json`
- [x] 1.5 Local-dev setup steps remain sufficient for a fresh clone
