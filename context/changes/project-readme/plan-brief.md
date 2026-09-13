# Project README — Plan Brief

> Full plan: `context/changes/project-readme/plan.md`

## What & Why

`README.md` is still the unmodified Astro-starter default — it never mentions the Pairing Assistant, the live defender/attacker reveal sequence, or the project's roadmap. Roadmap slice S-15 (milestone M-3, MS-04) asks for a README that lets a new reader — contributor or future-you — understand the pairing process and the product roadmap from the README alone.

## Starting Point

The current README is 176 lines of generic starter boilerplate (tech stack, prerequisites, getting-started, full Supabase config walkthrough, project structure, deployment, CI) with one stale fact: it says CI runs lint+build on push/PR to `master`, but `.github/workflows/ci.yml` actually triggers on `main` and runs 4 jobs (lint, typecheck, build, test).

## Desired End State

A reader opens `README.md` and, without any other context, understands: what the app is and who it's for, how a live pairing round works (the numbered defender→attacker→accept→repeat sequence), what's shipped vs. currently in progress (with a link to the full roadmap), and how to get it running locally — with all facts (CI, scripts) accurate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Pairing-process depth | Concise numbered walkthrough (4-6 steps), no screenshots | Gives the actual mental model fast without duplicating the PRD | Plan (user-selected) |
| Roadmap presentation | Short status summary + link to `roadmap.md` | Stays accurate without needing edits every time a slice ships | Plan (user-selected) |
| Audience/tone | Product-first, contributor-friendly | Works whether the repo stays private or goes public later | Plan (user-selected) |
| Dev-setup content | Trim to essentials, collapse verbose subsections | Shorter, tighter README; setup detail was more granular than needed | Plan (user-selected) |
| Tech stack section | Keep existing list, no deeper architecture notes | Useful at-a-glance orientation, already accurate, low effort | Plan (user-selected) |

## Scope

**In scope:**
- Full rewrite of `README.md` content and structure
- Correcting the stale CI description (`main`, 4 jobs) and Available Scripts list

**Out of scope:**
- Full PRD-equivalent detail on every business rule
- Screenshots or diagrams
- Fixing the missing `LICENSE` file (pre-existing, unrelated gap)
- Any code, schema, or config changes

## Architecture / Approach

Single-file documentation rewrite. New structure, top to bottom: product description → pairing-sequence walkthrough → roadmap status (linked) → tech stack → trimmed local-dev setup → corrected deployment/CI → license.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rewrite README.md | Complete product-first README replacing the starter default | Trimming dev-setup content could drop a step a fresh contributor actually needs |

**Prerequisites:** None — no code dependency.
**Estimated effort:** Single session, one file.

## Open Risks & Assumptions

- Trimming the Supabase setup subsections assumes the email-confirmation-toggle note is the only step that's truly load-bearing beyond clone/install/env/start — verified during manual testing (checklist item 1.3/1.5).
- No `LICENSE` file exists despite the README's MIT line; left as a pre-existing gap, not fixed here.

## Success Criteria (Summary)

- A first-time reader understands what the app does, how live pairing works, and what's shipped vs. in progress — from the README alone.
- CI and Available Scripts sections match the actual repo (`ci.yml`, `package.json`).
- No local-dev setup step is lost in the trim.
