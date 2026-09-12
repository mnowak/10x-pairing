# Update "Similar" Mode Description Copy Implementation Plan

## Overview

Update the one-line description shown for the "Similar" opponent-behavior option in the solo practice-mode picker, so it explains the mode's effect in captain-facing language ("their per-matchup estimates may differ from ours") instead of implementation jargon ("fixed random skew per matchup"), matching the tone of the other two option descriptions.

## Current State Analysis

`src/components/match/PracticeSetup.tsx` defines `OPPONENT_BEHAVIOR_OPTIONS` (lines 14-30), a 3-entry array of `{ value, label, description }` literals rendered by the picker UI. The "similar" entry's `description` field (line 28) currently reads:

> "Like Mirrored, but with a fixed random skew per matchup — an imperfect read on the matrix."

This string is defined in exactly one place, is not duplicated anywhere else in the codebase, and is not asserted on by any existing unit or e2e test (confirmed via repo-wide search).

## Desired End State

The "similar" entry's `description` field reads:

> "Like Mirrored, but assumes their per-matchup estimates may differ from ours."

Verify by opening the practice-mode picker in the browser (or reading the updated source line) and confirming the new text renders for the "Similar" option, with "Random" and "Mirrored" unchanged.

### Key Discoveries:

- Single point of definition: `src/components/match/PracticeSetup.tsx:28`. No other file references this literal text.
- Existing tone pattern across "Random"/"Mirrored": factual clause + em-dash + short evocative tag (e.g. "no matrix awareness at all", "a mirror-image strategist"). Per user direction, the "Similar" entry drops the em-dash tag and ends at the factual clause.

## What We're NOT Doing

- Not changing the "Random" or "Mirrored" descriptions.
- Not changing the underlying Similar-mode behavior/logic (`src/lib/opponentMoves.ts` or wherever the noise mechanism lives) — copy only.
- Not adding test coverage for this string, matching the current pattern (none of the three descriptions has literal-text test coverage).

## Implementation Approach

Single-line string replacement in an existing array literal. No new files, no schema/data/API changes.

## Phase 1: Update the description string

### Overview

Replace the "similar" option's `description` value with the new wording.

### Changes Required:

#### 1. Similar-mode description copy

**File**: `src/components/match/PracticeSetup.tsx`

**Intent**: Replace the current "similar" description text with captain-facing wording that names the mode's effect (their estimates may differ from ours) rather than its implementation mechanism (fixed random skew), while preserving the established tone pattern shared with the other two options.

**Contract**: Line 28, the `description` field of the `{ value: "similar", ... }` object in `OPPONENT_BEHAVIOR_OPTIONS`, changes from:

```
"Like Mirrored, but with a fixed random skew per matchup — an imperfect read on the matrix."
```

to:

```
"Like Mirrored, but assumes their per-matchup estimates may differ from ours."
```

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`

#### Manual Verification:

- Practice-mode picker (solo simulation setup) shows the updated Similar-mode description text, with Random and Mirrored descriptions unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added — no existing test in the repo asserts on the literal description text for any of the three options, and this change doesn't warrant introducing that pattern.

### Integration Tests:

- None — no session-mechanics, storage, or suggestion-engine code paths are touched.

### Manual Testing Steps:

1. Start a solo practice session (from an opponent with a prepared matrix) to reach the opponent-behavior picker.
2. Confirm the "Similar" option shows: "Like Mirrored, but assumes their per-matchup estimates may differ from ours."
3. Confirm "Random" and "Mirrored" descriptions are unchanged.

## Performance Considerations

None — static string change.

## Migration Notes

None — no data or schema involved.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-14, milestone M-3, MS-03)
- Change identity: `context/changes/similar-mode-copy-update/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Update the description string

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 6130598
- [x] 1.2 Type checking passes: `npx astro check` — 6130598
- [x] 1.3 Build succeeds: `npm run build` — 6130598

#### Manual

- [x] 1.4 Practice-mode picker shows the updated Similar-mode description text, with Random and Mirrored unchanged. — 6130598
