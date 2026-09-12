# Update "Similar" Mode Description Copy — Plan Brief

> Full plan: `context/changes/similar-mode-copy-update/plan.md`

## What & Why

The solo practice-mode picker shows a one-line description for each of the three opponent-behavior options. The "Similar" option's description currently explains the implementation mechanism ("a fixed random skew per matchup") instead of what it means for the captain ("their estimates may differ from ours"). Roadmap slice S-14 (MS-03) asks for the captain-facing wording.

## Starting Point

`src/components/match/PracticeSetup.tsx:28` defines the description as a string literal inside the `OPPONENT_BEHAVIOR_OPTIONS` array (lines 14-30), alongside the "Random" and "Mirrored" descriptions. It's the single point of definition — no duplication, no test asserts on its literal text.

## Desired End State

The "Similar" option reads: "Like Mirrored, but assumes their per-matchup estimates may differ from ours." Random and Mirrored are unchanged.

## Key Decisions Made

| Decision                      | Choice                                              | Why (1 sentence)                                                                 |
| ------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Wording source                 | Polished rewrite (not verbatim roadmap text), without the em-dash tag | Roadmap's literal phrasing has a grammar issue; user asked to drop the trailing evocative tag the other two descriptions use, keeping just the factual clause. |
| Test coverage                   | None added                                          | No description string in this picker has literal-text test coverage today; adding one only for this string would be inconsistent and brittle. |

## Scope

**In scope:** the "similar" entry's `description` string in `PracticeSetup.tsx`.

**Out of scope:** "Random"/"Mirrored" descriptions, the underlying Similar-mode noise/behavior logic, any new tests.

## Architecture / Approach

Single-line string replacement in an existing array literal. No components, routes, schema, or logic touched.

## Phases at a Glance

| Phase                    | What it delivers                          | Key risk |
| ------------------------- | -------------------------------------------- | -------- |
| 1. Update the description string | New Similar-mode copy live in the picker | None — trivial string change, no logic touched |

**Prerequisites:** None.
**Estimated effort:** Minutes — a single-line edit plus a manual UI check.

## Open Risks & Assumptions

- None — roadmap itself flags this as having "no design decision involved."

## Success Criteria (Summary)

- The Similar-mode description in the practice-setup picker reads the new captain-facing text.
- Random and Mirrored descriptions are unchanged.
- Lint, typecheck, and build stay green.
