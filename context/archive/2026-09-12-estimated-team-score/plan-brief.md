# Estimated Team Score — Plan Brief

> Full plan: `context/changes/estimated-team-score/plan.md`

## What & Why

Show captains an estimated total team score on the session-completion screen — the sum of their own pairing-matrix estimates across the 5 final pairings of a round. Today the completion screen lists which armies were paired but never scores the outcome, even though the recommender already computes and sums exactly this value internally to pick suggestions — it just never surfaces the total.

## Starting Point

`MatchSession.tsx`'s `"complete"` phase already has all the data needed (`state.history` + `state.refusedAttacker`), and `cellValue()` in `matchSuggestions.ts` already maps a color-band estimate to a score. Neither is currently combined into a displayed total.

## Desired End State

Completing a session (live match-mode or practice mode) shows "Estimated team score: N" on the completion screen, in the same place, with the same wording, in both modes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope | Both live and practice mode | Both render the identical completion screen off identical data — one implementation covers both. |
| Testability | Extract a testable pure function (`src/lib/teamScore.ts`) | Scoring/matrix logic has been this project's single most-reversed area historically; this codebase always unit-tests its scoring primitives (`cellValue`, `reserveStrength`). |
| Display format | Raw total only, no `/90` denominator | Matches how scores are shown elsewhere (color bands, not raw numbers); simplest change. |
| Breakdown | Total only, no per-pairing list | Keeps the completion screen uncluttered; a curious captain can cross-reference the matrix. |
| Labeling | "Estimated team score" (not just "Team score") | Matches this app's consistent framing of matrix data as an estimate, never a guaranteed outcome. |

## Scope

**In scope:**
- New `estimatedTeamScore()` pure function + unit tests
- One completion-screen line, shown identically in both session modes

**Out of scope:**
- Per-pairing score breakdown
- Any `/90` or other contextualization of the total
- Persisted score history
- Any change to the underlying color-band scoring rule

## Architecture / Approach

A new small module (`src/lib/teamScore.ts`) sums `cellValue()` across the 5 final pairings — pairing each sub-round the same way `MatchSession.tsx`'s existing `ourPairedWith` derivation already does (`ourDefender↔ourAccepted`, `theirPick↔theirDefender`), plus the forced `refusedAttacker` pairing. Kept as a separate module (not added to `matchSuggestions.ts` or `matchSessionEngine.ts`) to avoid introducing a circular import between those two files.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Estimated team score | New scoring function + tests + completion-screen line | Low — pure summation over an existing, already-tested per-cell function |

**Prerequisites:** None beyond the already-shipped live match-mode and practice-mode completion screens.
**Estimated effort:** Single phase, one session.

## Open Risks & Assumptions

- Assumes a completed session always yields exactly 5 final pairings (true today given the fixed 5-army roster cap); if that cap is ever relaxed (parked FR-016), this function's shape still works — it sums whatever pairings exist, it doesn't hardcode "5".

## Success Criteria (Summary)

- A captain sees an estimated team score immediately upon completing any session, live or practice.
- The displayed total is independently verifiable by manually summing the matrix's color-band scores for the same 5 pairings.
