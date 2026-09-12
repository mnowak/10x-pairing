---
change_id: pairing-simulation-session
title: Solo pairing simulation (opponent plays randomly)
status: implemented
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Roadmap slice S-07 (`context/foundation/roadmap.md`, milestone M-2: pairing-simulation).

Captain can run a solo practice session against a prepared opponent matrix
without a second human present: captain still makes their own three
decisions manually (with the existing minimax suggestions), while the app
automatically picks the opponent's move at each of the opponent's three
decision points — uniformly at random for this increment — and shows the
captain what was picked. Increment 2 (S-08, separate change) swaps the
random opponent pick for the existing minimax engine's opponent-optimal
logic.
