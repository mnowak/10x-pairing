---
change_id: live-match-recommender
title: Live match recommender
status: impl_reviewed
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Increment 2 of 2 for live match-mode. Swaps `randomSuggestionProvider`
(increment 1, `live-match-mode-session`) for a real minimax-based
`MatchSuggestionProvider` implementation behind the same interface.
Roadmap S-06 · GitHub issue #7.
