---
change_id: frontpage-redesign
title: Redesign the frontpage away from the Astro-starter default
status: archived
created: 2026-09-13
updated: 2026-09-13
archived_at: 2026-09-13T01:07:48Z
---

## Notes

Roadmap slice S-16 (`context/foundation/roadmap.md`, milestone M-3: mvp-release-preparation, MS-05). `src/pages/index.astro` currently renders the unmodified Astro-starter `<Welcome />` component — generic "10x Astro Starter" copy, no mention of the pairing product.

Scope decided directly by the user ahead of planning: there is no separate `/dashboard` — the frontpage *is* the dashboard. Anonymous visitors see the project name, a short summary/pitch, and sign-in/sign-up buttons. Authenticated captains see the same name/summary plus their team-roster editor, an "add opponent" entry point, and a list of their existing opponents (clicking one opens the existing per-opponent screen with armies/matrix/pairing). This consolidates `dashboard.astro`, `dashboard/team.astro`, and `dashboard/opponents/index.astro` into `index.astro`; `dashboard/opponents/[id].astro` (+ `/match`, `/simulate`) are unchanged.
