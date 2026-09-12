---
change_id: blind-declaration-opponent-sim
title: Fix simultaneous-declaration leaks in practice-mode opponent simulation
status: implementing
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Surfaced during `pairing-simulation-recommender`'s full-plan impl-review (F1): the Mirrored/Similar practice-mode opponent's defender pick changed depending on which army the captain revealed as their own defender, confirmed live against real dev-DB matrix data. User confirmed the real tournament rule is that defender declarations, attacker-pair offers, and accept/refuse decisions are each made in parallel/blind between the two captains — verified against `context/archive/2026-09-11-live-match-mode-session/plan.md:45`'s original (but never fully implemented) design intent: "each sub-round runs two parallel defend/attack exchanges simultaneously."

Framed via `/10x-frame` — see `frame.md`. Scope turned out larger than the original F1 finding: two confirmed leak points (their-defender, their-attacker-pair), not one.
