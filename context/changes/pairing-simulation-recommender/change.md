---
change_id: pairing-simulation-recommender
title: Selectable opponent-behavior modes for pairing simulation
status: implemented
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Roadmap slice S-08 (`context/foundation/roadmap.md`, milestone M-2: pairing-simulation), scope expanded during `/10x-plan` from a single hardcoded algorithmic swap to a full 3-mode selector — pulling the previously-parked MS-05 forward at the user's explicit request.

Three opponent-behavior modes for solo pairing-simulation sessions, captain-selectable via a pre-session picker:

- **Random** (already shipped in S-07 / `pairing-simulation-session`) — uniform random pick among available armies, no matrix awareness.
- **Mirrored** — opponent plays via a real minimax lookahead over an inverted view of the captain's own matrix (`20 - estimate` per non-purple cell; purple pinned flat at 7). Default mode.
- **Similar** — Mirrored's inverted matrix plus a fixed-per-session random perturbation: non-purple cells get `mirroredValue ± 4` (integer, clamped to [0,20]); purple cells get a fully random integer uniform in [0,20]. The generated matrix is fixed once per session (not regenerated per decision point) so the minimax lookahead stays internally consistent, and persists across a page refresh.

Architecture: the existing minimax search in `matchSuggestions.ts` is generalized (parameterized by a per-cell value function and which side maximizes) rather than duplicated, so Mirrored/Similar reuse the same engine from the opponent's point of view. Zero behavior change to the existing "our" suggestions, verified by the full existing test suite passing unchanged.
