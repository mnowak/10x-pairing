import { describe, expect, it } from "vitest";
import {
  bestTheirAttackerPair,
  bestTheirDefender,
  bestTheirPick,
  cellValue,
  minimaxSuggestionProvider,
  mirroredValue,
  pickBest,
  reserveStrength,
  theirReserveStrength,
  type ArmyId,
} from "@/lib/matchSuggestions";
import { createSimilarOpponentProvider, mirroredOpponentProvider } from "@/lib/opponentMoves";
import {
  confirmOurAccept,
  confirmOurAttackerPair,
  confirmOurDefender,
  createSession,
  enterTheirAttackerPair,
  enterTheirDefender,
  enterTheirPick,
  isSessionComplete,
} from "@/lib/matchSessionEngine";
import type { MatrixGridData } from "@/lib/matrix";
import type { Estimate } from "@/lib/colorBands";

function gridOf(estimates: Record<string, Estimate>): MatrixGridData {
  return { ourArmies: [], theirArmies: [], estimates };
}

describe("cellValue", () => {
  const grid = gridOf({
    "a:x": "red",
    "a:y": "orange",
    "a:z": "yellow",
    "b:x": "green",
    "b:y": "dark-green",
    "b:z": "purple",
    // "c:x" deliberately absent — unestimated
  });

  it("maps a real color band via bandToScore", () => {
    expect(cellValue(grid, "a", "x")).toBe(2); // red
    expect(cellValue(grid, "a", "y")).toBe(6); // orange
    expect(cellValue(grid, "a", "z")).toBe(10); // yellow
    expect(cellValue(grid, "b", "x")).toBe(14); // green
    expect(cellValue(grid, "b", "y")).toBe(18); // dark-green
  });

  it("scores purple as 7 (orange's score + 1, explicitly arbitrary)", () => {
    expect(cellValue(grid, "b", "z")).toBe(7);
  });

  it("scores an unestimated (absent) cell the same as purple, 7", () => {
    expect(cellValue(grid, "c", "x")).toBe(7);
  });
});

describe("reserveStrength", () => {
  it("sums cellValue across every army in theirAvailable", () => {
    const grid = gridOf({ "a:x": "red", "a:y": "yellow", "a:z": "dark-green" });
    expect(reserveStrength(grid, "a", ["x", "y", "z"])).toBe(2 + 10 + 18);
  });

  it("is 0 when theirAvailable is empty", () => {
    const grid = gridOf({});
    expect(reserveStrength(grid, "a", [])).toBe(0);
  });
});

describe("mirroredValue", () => {
  const grid = gridOf({ "a:x": "red", "a:y": "dark-green", "a:z": "yellow", "b:x": "purple" });

  it("inverts a real color-band score as 20 - cellValue", () => {
    expect(mirroredValue(grid, "a", "x")).toBe(18); // 20 - 2 (red)
    expect(mirroredValue(grid, "a", "y")).toBe(2); // 20 - 18 (dark-green)
    expect(mirroredValue(grid, "a", "z")).toBe(10); // 20 - 10 (yellow) — self-inverse at the midpoint
  });

  it("leaves purple unchanged at NO_SIGNAL_VALUE (7), not inverted to 13", () => {
    expect(mirroredValue(grid, "b", "x")).toBe(7);
  });

  it("leaves an unestimated (absent) cell unchanged at 7, same as purple", () => {
    expect(mirroredValue(grid, "c", "q")).toBe(7);
  });
});

describe("theirReserveStrength", () => {
  it("sums score(ourArmy, theirArmy) over ourAvailable, for the fixed theirArmy", () => {
    const grid = gridOf({ "x:a": "red", "y:a": "yellow", "z:a": "dark-green" });
    expect(theirReserveStrength(grid, "a", ["x", "y", "z"], cellValue)).toBe(2 + 10 + 18);
  });

  it("is 0 when ourAvailable is empty", () => {
    expect(theirReserveStrength(gridOf({}), "a", [], cellValue)).toBe(0);
  });
});

describe("pickBest", () => {
  it("picks the candidate with the highest primary value", () => {
    const result = pickBest(
      [1, 5, 3],
      (n) => n,
      () => 0,
    );
    expect(result).toBe(5);
  });

  it("breaks a primary tie by the lowest tie-break value", () => {
    const candidates = [
      { id: "a", primary: 10, tieBreak: 5 },
      { id: "b", primary: 10, tieBreak: 2 },
      { id: "c", primary: 8, tieBreak: 0 },
    ];
    const result = pickBest(
      candidates,
      (c) => c.primary,
      (c) => c.tieBreak,
    );
    expect(result.id).toBe("b");
  });

  it("with a constant tie-break value, the first candidate wins every tie", () => {
    const candidates = ["first", "second", "third"];
    const result = pickBest(
      candidates,
      () => 1,
      () => 0,
    );
    expect(result).toBe("first");
  });
});

describe("bestTheirDefender / bestTheirPick / bestTheirAttackerPair — bounds", () => {
  const grid = gridOf({});

  it("bestTheirDefender always returns an army from theirAvailable", () => {
    const theirAvailable = ["x", "y", "z"];
    const result = bestTheirDefender(theirAvailable, ["a", "b", "c"], grid, cellValue);
    expect(theirAvailable).toContain(result);
  });

  it("bestTheirPick always returns one of offeredPair", () => {
    const offeredPair: [ArmyId, ArmyId] = ["o1", "o2"];
    const result = bestTheirPick(offeredPair, "t1", offeredPair, ["t2", "t3"], "d", grid, cellValue);
    expect(offeredPair).toContain(result);
  });

  it("bestTheirAttackerPair always returns 2 distinct armies from theirAvailable", () => {
    const theirAvailable = ["a", "b", "c"];
    const [first, second] = bestTheirAttackerPair(theirAvailable, ["o1", "o2"], "d", grid, cellValue);
    expect(theirAvailable).toContain(first);
    expect(theirAvailable).toContain(second);
    expect(first).not.toBe(second);
  });
});

describe("bestTheirDefender — hand-verified scenario (mirror of bestOurDefender's own tie-break test)", () => {
  it("a tied primary value correctly falls through to the theirReserveStrength tie-break", () => {
    // Transpose of the "suggestDefender: a tied primary value..." scenario
    // below: their candidates a/b/c take the role bestOurDefender's own
    // candidates played, our armies x/y/z take the role bestOurDefender's
    // theirAvailable played — but bestTheirDefender's search now has one
    // MORE aggregation layer than bestOurDefender's (it searches over
    // ourAvailable via searchOurDefenderForTheirChoice instead of taking a
    // fixed ourDefender), and the config's oursMaximize flips (false, not
    // true), so the recursion is not byte-identical and the outcome isn't
    // derivable by simply reusing bestOurDefender's own reasoning. Verified
    // directly: every candidate's primary value ties at 14 (transposing the
    // original grid happens to preserve that number, though the search
    // shape differs), and reserveStrength(a)=30 > reserveStrength(b)=22 >
    // reserveStrength(c)=6, so the tie-break correctly prefers "c".
    const grid = gridOf({
      "x:a": "yellow",
      "y:a": "yellow",
      "z:a": "yellow",
      "x:b": "dark-green",
      "y:b": "red",
      "z:b": "red",
      "x:c": "red",
      "y:c": "red",
      "z:c": "red",
    });
    const result = bestTheirDefender(["a", "b", "c"], ["x", "y", "z"], grid, cellValue);
    expect(result).toBe("c");
  });
});

describe("mirroredOpponentProvider.pickDefender — blind-decision regression (F1 / blind-declaration-opponent-sim)", () => {
  it("returns a single, defender-choice-independent pick against the real Expedition 2137 vs Wujasy matrix", () => {
    // Real pairing-matrix data pulled from the local dev DB, 2026-09-12 —
    // "Expedition 2137" (ours) vs "Wujasy" (theirs), the exact matchup that
    // originally surfaced this bug (see
    // context/changes/blind-declaration-opponent-sim/frame.md). Raw DB
    // scores map 1:1 onto COLOR_BANDS' representativeScore, so the bands
    // below reproduce the stored estimates exactly (Demony:DG and Tau:CSM
    // are genuinely purple in the real data).
    const grid = gridOf({
      "BA:CSM": "dark-green",
      "BA:DA": "yellow",
      "BA:DG": "red",
      "BA:TS": "green",
      "BA:WE": "green",
      "CK:CSM": "green",
      "CK:DA": "orange",
      "CK:DG": "yellow",
      "CK:TS": "orange",
      "CK:WE": "yellow",
      "Custo:CSM": "yellow",
      "Custo:DA": "yellow",
      "Custo:DG": "yellow",
      "Custo:TS": "yellow",
      "Custo:WE": "green",
      "Demony:CSM": "green",
      "Demony:DA": "red",
      "Demony:DG": "purple",
      "Demony:TS": "red",
      "Demony:WE": "dark-green",
      "Tau:CSM": "purple",
      "Tau:DA": "yellow",
      "Tau:DG": "orange",
      "Tau:TS": "yellow",
      "Tau:WE": "green",
    });
    const ourAvailable = ["BA", "CK", "Custo", "Demony", "Tau"];
    const theirAvailable = ["CSM", "DA", "DG", "TS", "WE"];

    // Verified directly against the pre-fix code shape: computing this same
    // search with a concrete, fixed ourDefender (as the original bug did)
    // yields a DIFFERENT opponent pick depending on which army is fixed
    // (e.g. "CSM" for BA/CK/Demony, "WE" for Custo, "TS" for Tau) — a real
    // reactive leak against this exact matrix. mirroredOpponentProvider no
    // longer accepts an ourDefender argument at all, closing that leak at
    // the type level; this locks in the single, blind value it now computes.
    const result = mirroredOpponentProvider.pickDefender(theirAvailable, ourAvailable, grid);
    expect(result).toBe("WE");
  });
});

describe("bestTheirAttackerPair — hand-verified dominance scenario", () => {
  it("offers the pair that maximizes the minimum immediate value against the fixed ourDefender", () => {
    // ourDefender "OD" scores dark-green (18) against a/b, red (2) against
    // c/d. Every other matchup (o1/o2/o3 vs a/b/c/d) is uniformly yellow
    // (10), so the nested-subround continuation after accepting is
    // identical regardless of which 3-of-4 opponents remain — it
    // contributes the same constant to every candidate pair, leaving only
    // the immediate min(score(OD, p0), score(OD, p1)) to decide. {a,b}
    // (min 18) strictly dominates every pair containing c or d (min 2).
    const grid = gridOf({
      "OD:a": "dark-green",
      "OD:b": "dark-green",
      "OD:c": "red",
      "OD:d": "red",
      "o1:a": "yellow",
      "o1:b": "yellow",
      "o1:c": "yellow",
      "o1:d": "yellow",
      "o2:a": "yellow",
      "o2:b": "yellow",
      "o2:c": "yellow",
      "o2:d": "yellow",
      "o3:a": "yellow",
      "o3:b": "yellow",
      "o3:c": "yellow",
      "o3:d": "yellow",
    });
    const [first, second] = bestTheirAttackerPair(["a", "b", "c", "d"], ["o1", "o2", "o3"], "OD", grid, cellValue);
    expect(new Set([first, second])).toEqual(new Set(["a", "b"]));
  });
});

describe("bestTheirPick — hand-verified scenarios", () => {
  // ourAvailable = the full offered pair (a minimal 3v3 subround: exactly 2
  // armies remain after our-defender is committed). o1/o2 share an
  // identical row against t2/t3 (the only downstream matchup), so the
  // nested continuation is the same regardless of which is picked — only
  // the immediate score against the fixed theirDefender "t1" decides.
  const neutralDownstream = {
    "o1:t2": "yellow",
    "o2:t2": "yellow",
    "o1:t3": "yellow",
    "o2:t3": "yellow",
    "OD:t2": "yellow",
    "OD:t3": "yellow",
  } as const;

  it("picks the offered army with the better immediate matchup against theirDefender", () => {
    const grid = gridOf({ "o1:t1": "dark-green", "o2:t1": "red", ...neutralDownstream });
    const result = bestTheirPick(["o1", "o2"], "t1", ["o1", "o2"], ["t2", "t3"], "OD", grid, cellValue);
    expect(result).toBe("o1");
  });

  it("on a genuine tie, the first candidate in offeredPair wins (no reserve-strength tie-break, mirroring bestOurAccept)", () => {
    const grid = gridOf({ "o1:t1": "yellow", "o2:t1": "yellow", ...neutralDownstream });
    const result = bestTheirPick(["o1", "o2"], "t1", ["o1", "o2"], ["t2", "t3"], "OD", grid, cellValue);
    expect(result).toBe("o1");
  });
});

describe("mirroredOpponentProvider — wiring", () => {
  it("pickDefender delegates to bestTheirDefender with mirroredValue as the score function", () => {
    const grid = gridOf({ "x:a": "red", "x:b": "dark-green", "y:a": "red", "y:b": "dark-green" });
    const expected = bestTheirDefender(["a", "b"], ["x", "y"], grid, mirroredValue);
    expect(mirroredOpponentProvider.pickDefender(["a", "b"], ["x", "y"], grid)).toBe(expected);
  });
});

describe("minimaxSuggestionProvider — bounds", () => {
  const grid = gridOf({});

  it("suggestDefender always returns an army from ourAvailable", () => {
    const ourAvailable = ["a", "b", "c"];
    const result = minimaxSuggestionProvider.suggestDefender(ourAvailable, ["x", "y", "z"], grid);
    expect(ourAvailable).toContain(result);
  });

  it("suggestAttackerPair always returns 2 distinct armies from ourAvailable", () => {
    const ourAvailable = ["a", "b", "c"];
    const [first, second] = minimaxSuggestionProvider.suggestAttackerPair(ourAvailable, "x", ["y", "z"], "d", grid);
    expect(ourAvailable).toContain(first);
    expect(ourAvailable).toContain(second);
    expect(first).not.toBe(second);
  });

  it("suggestAcceptedAttacker always returns one of theirOfferedPair", () => {
    const theirOfferedPair: [ArmyId, ArmyId] = ["x", "y"];
    const result = minimaxSuggestionProvider.suggestAcceptedAttacker("a", theirOfferedPair, ["b", "c"], ["z"], grid);
    expect(theirOfferedPair).toContain(result);
  });
});

describe("minimaxSuggestionProvider — hand-verified scenarios", () => {
  // suggestAttackerPair and suggestAcceptedAttacker below are "dominance"
  // scenarios: one candidate scores at least as well as every alternative
  // against every possible opponent choice, so the correct answer is
  // provable by inspection without tracing the full recursive search.
  //
  // suggestDefender's own case genuinely needed the full trace (see its
  // comment) — a lesson from this test suite's own construction: when
  // EVERY candidate's value is uniform (opponent-independent), the total
  // is invariant to who defends when, so "obviously stronger" is not the
  // same as "wins on primary value" — the tie-break rule decides instead.

  it("suggestDefender: a tied primary value correctly falls through to the tie-break rule", () => {
    // a: yellow (10) vs every opponent. b: dark-green (18) vs x, red (2) vs
    // y/z. c: red (2) vs every opponent. Hand-derivation (traced through
    // every branch of the 3-vs-3 search): committing "a" and committing "c"
    // both yield a primary minimax value of exactly 14 — a genuine tie, not
    // a dominance case ("b"'s spiky profile makes both paths converge). The
    // tie-break must then prefer committing the LOWER-reserveStrength
    // candidate: reserveStrength(a, [x,y,z]) = 30, reserveStrength(c,
    // [x,y,z]) = 6 — so "c" is correctly committed as defender, keeping the
    // stronger all-arounder "a" in reserve for later.
    const grid = gridOf({
      "a:x": "yellow",
      "a:y": "yellow",
      "a:z": "yellow",
      "b:x": "dark-green",
      "b:y": "red",
      "b:z": "red",
      "c:x": "red",
      "c:y": "red",
      "c:z": "red",
    });
    const result = minimaxSuggestionProvider.suggestDefender(["a", "b", "c"], ["x", "y", "z"], grid);
    expect(result).toBe("c");
  });

  it("suggestAttackerPair offers the pair that dominates the alternatives", () => {
    // ourAvailable has 3 candidates (a,b,c) offered against a fixed
    // theirDefender "x"; {a,b} both score dark-green against x, c scores
    // red — {a,b} must be the offered pair regardless of downstream play.
    const grid = gridOf({
      "a:x": "dark-green",
      "b:x": "dark-green",
      "c:x": "red",
      "a:y": "yellow",
      "b:y": "yellow",
      "c:y": "yellow",
      "a:z": "yellow",
      "b:z": "yellow",
      "c:z": "yellow",
    });
    const [first, second] = minimaxSuggestionProvider.suggestAttackerPair(["a", "b", "c"], "x", ["y", "z"], "d", grid);
    expect(new Set([first, second])).toEqual(new Set(["a", "b"]));
  });

  it("suggestAcceptedAttacker accepts the offered attacker with the better immediate matchup", () => {
    const grid = gridOf({
      "d:x": "dark-green",
      "d:y": "red",
    });
    const result = minimaxSuggestionProvider.suggestAcceptedAttacker("d", ["x", "y"], ["e", "f"], ["z"], grid);
    expect(result).toBe("x");
  });
});

describe("minimaxSuggestionProvider — full 5-vs-5 walkthrough via the real engine", () => {
  it("terminates with every army committed exactly once per side, no thrown errors", () => {
    const ourArmies = ["o1", "o2", "o3", "o4", "o5"];
    const theirArmies = ["t1", "t2", "t3", "t4", "t5"];
    // A varied matrix so the search has real choices to make at every step,
    // not just ties.
    const estimates: Record<string, Estimate> = {};
    const bands: Estimate[] = ["red", "orange", "yellow", "green", "dark-green", "purple"];
    let i = 0;
    for (const our of ourArmies) {
      for (const their of theirArmies) {
        estimates[`${our}:${their}`] = bands[i % bands.length];
        i++;
      }
    }
    const grid = gridOf(estimates);

    let state = createSession(ourArmies, theirArmies, minimaxSuggestionProvider, grid);

    function ourSuggested(): ArmyId {
      if (typeof state.suggested !== "string") {
        throw new Error(`Expected a single suggested army, got: ${JSON.stringify(state.suggested)}`);
      }
      return state.suggested;
    }

    while (!isSessionComplete(state)) {
      switch (state.phase) {
        case "our-defender":
          state = confirmOurDefender(state, ourSuggested());
          break;
        case "their-defender":
          state = enterTheirDefender(state, state.theirAvailable[0], minimaxSuggestionProvider, grid);
          break;
        case "our-attacker-pair":
          state = confirmOurAttackerPair(state, [state.ourAvailable[0], state.ourAvailable[1]]);
          break;
        case "their-pick": {
          const offered = state.working.ourOfferedPair;
          if (!offered) throw new Error("Expected ourOfferedPair to be set in their-pick phase");
          state = enterTheirPick(state, offered[0]);
          break;
        }
        case "their-attacker-pair":
          state = enterTheirAttackerPair(
            state,
            [state.theirAvailable[0], state.theirAvailable[1]],
            minimaxSuggestionProvider,
            grid,
          );
          break;
        case "our-accept":
          state = confirmOurAccept(state, ourSuggested(), minimaxSuggestionProvider, grid);
          break;
        case "complete":
          break;
      }
    }

    expect(state.history).toHaveLength(2);
    expect(state.refusedAttacker).not.toBeNull();

    const committedOurs = new Set([
      ...state.history.map((r) => r.ourDefender),
      ...state.history.map((r) => r.theirPick),
      state.refusedAttacker?.ours,
    ]);
    const committedTheirs = new Set([
      ...state.history.map((r) => r.theirDefender),
      ...state.history.map((r) => r.ourAccepted),
      state.refusedAttacker?.theirs,
    ]);
    expect(committedOurs).toEqual(new Set(ourArmies));
    expect(committedTheirs).toEqual(new Set(theirArmies));
  });
});

describe("mirroredOpponentProvider — full 5-vs-5 walkthrough via the real engine", () => {
  it("a uniform grid produces the exact, hand-provable outcome via the real engine", () => {
    // Every cell is the same band (yellow=10), so every decision at every
    // phase is a full tie: primary value AND reserve/theirReserveStrength
    // are identical for every candidate. pickBest/bestTheir*'s tie-break
    // loop only replaces `best` on a STRICT improvement, so with
    // everything tied the FIRST candidate in each phase's current
    // available-list order always wins — for both minimaxSuggestionProvider
    // (ours) and mirroredOpponentProvider (theirs), independently of which
    // provider is asking. This makes the entire 3v3 session's outcome
    // exactly predictable by hand:
    //   our-defender "o1" (first of [o1,o2,o3])
    //   their-defender "t1" (first of [t1,t2,t3])
    //   our-attacker-pair forced to [o2,o3] (only pair left)
    //   their-pick "o2" (first of the offered [o2,o3])
    //   their-attacker-pair forced to [t2,t3] (only pair left)
    //   our-accept "t2" (first of the offered [t2,t3])
    //   forced refusal: the one army left on each side, o3 vs t3.
    const ourArmies3 = ["o1", "o2", "o3"];
    const theirArmies3 = ["t1", "t2", "t3"];
    const estimates3: Record<string, Estimate> = {};
    for (const our of ourArmies3) {
      for (const their of theirArmies3) {
        estimates3[`${our}:${their}`] = "yellow";
      }
    }
    const grid3 = gridOf(estimates3);

    let state3 = createSession(ourArmies3, theirArmies3, minimaxSuggestionProvider, grid3);

    while (!isSessionComplete(state3)) {
      switch (state3.phase) {
        case "our-defender":
          state3 = confirmOurDefender(state3, "o1");
          break;
        case "their-defender": {
          const picked = mirroredOpponentProvider.pickDefender(state3.theirAvailable, state3.ourAvailable, grid3);
          state3 = enterTheirDefender(state3, picked, minimaxSuggestionProvider, grid3);
          break;
        }
        case "our-attacker-pair":
          state3 = confirmOurAttackerPair(state3, [state3.ourAvailable[0], state3.ourAvailable[1]]);
          break;
        case "their-pick": {
          const offered = state3.working.ourOfferedPair;
          const theirDefender = state3.working.theirDefender;
          const ourDefender = state3.working.ourDefender;
          if (!offered || !theirDefender || !ourDefender) {
            throw new Error("Expected ourOfferedPair/theirDefender/ourDefender to be set in their-pick phase");
          }
          const picked = mirroredOpponentProvider.pickAttackerChoice(
            offered,
            theirDefender,
            state3.ourAvailable,
            state3.theirAvailable,
            ourDefender,
            grid3,
          );
          state3 = enterTheirPick(state3, picked);
          break;
        }
        case "their-attacker-pair": {
          const ourDefender = state3.working.ourDefender;
          if (!ourDefender) throw new Error("Expected ourDefender to be set in their-attacker-pair phase");
          const pair = mirroredOpponentProvider.pickAttackerPair(
            state3.theirAvailable,
            state3.ourAvailable,
            ourDefender,
            grid3,
          );
          state3 = enterTheirAttackerPair(state3, pair, minimaxSuggestionProvider, grid3);
          break;
        }
        case "our-accept":
          state3 = confirmOurAccept(
            state3,
            state3.working.theirOfferedPair?.[0] ?? "",
            minimaxSuggestionProvider,
            grid3,
          );
          break;
        case "complete":
          break;
      }
    }

    expect(state3.history).toEqual([
      {
        subRound: 1,
        ourDefender: "o1",
        theirDefender: "t1",
        ourOfferedPair: ["o2", "o3"],
        theirPick: "o2",
        theirOfferedPair: ["t2", "t3"],
        ourAccepted: "t2",
      },
    ]);
    expect(state3.refusedAttacker).toEqual({ ours: "o3", theirs: "t3" });
  });

  it("drives the opponent's 3 decision points end-to-end with no thrown errors, every army committed exactly once", () => {
    const ourArmies = ["o1", "o2", "o3", "o4", "o5"];
    const theirArmies = ["t1", "t2", "t3", "t4", "t5"];
    const estimates: Record<string, Estimate> = {};
    const bands: Estimate[] = ["red", "orange", "yellow", "green", "dark-green", "purple"];
    let i = 0;
    for (const our of ourArmies) {
      for (const their of theirArmies) {
        estimates[`${our}:${their}`] = bands[i % bands.length];
        i++;
      }
    }
    const grid = gridOf(estimates);

    let state = createSession(ourArmies, theirArmies, minimaxSuggestionProvider, grid);

    function ourSuggested(): ArmyId {
      if (typeof state.suggested !== "string") {
        throw new Error(`Expected a single suggested army, got: ${JSON.stringify(state.suggested)}`);
      }
      return state.suggested;
    }

    while (!isSessionComplete(state)) {
      switch (state.phase) {
        case "our-defender":
          state = confirmOurDefender(state, ourSuggested());
          break;
        case "their-defender": {
          const picked = mirroredOpponentProvider.pickDefender(state.theirAvailable, state.ourAvailable, grid);
          state = enterTheirDefender(state, picked, minimaxSuggestionProvider, grid);
          break;
        }
        case "our-attacker-pair":
          state = confirmOurAttackerPair(state, [state.ourAvailable[0], state.ourAvailable[1]]);
          break;
        case "their-pick": {
          const offered = state.working.ourOfferedPair;
          const theirDefender = state.working.theirDefender;
          const ourDefender = state.working.ourDefender;
          if (!offered || !theirDefender || !ourDefender) {
            throw new Error("Expected ourOfferedPair/theirDefender/ourDefender to be set in their-pick phase");
          }
          const picked = mirroredOpponentProvider.pickAttackerChoice(
            offered,
            theirDefender,
            state.ourAvailable,
            state.theirAvailable,
            ourDefender,
            grid,
          );
          state = enterTheirPick(state, picked);
          break;
        }
        case "their-attacker-pair": {
          const ourDefender = state.working.ourDefender;
          if (!ourDefender) throw new Error("Expected ourDefender to be set in their-attacker-pair phase");
          const pair = mirroredOpponentProvider.pickAttackerPair(
            state.theirAvailable,
            state.ourAvailable,
            ourDefender,
            grid,
          );
          state = enterTheirAttackerPair(state, pair, minimaxSuggestionProvider, grid);
          break;
        }
        case "our-accept":
          state = confirmOurAccept(state, ourSuggested(), minimaxSuggestionProvider, grid);
          break;
        case "complete":
          break;
      }
    }

    expect(state.history).toHaveLength(2);
    expect(state.refusedAttacker).not.toBeNull();

    const committedOurs = new Set([
      ...state.history.map((r) => r.ourDefender),
      ...state.history.map((r) => r.theirPick),
      state.refusedAttacker?.ours,
    ]);
    const committedTheirs = new Set([
      ...state.history.map((r) => r.theirDefender),
      ...state.history.map((r) => r.ourAccepted),
      state.refusedAttacker?.theirs,
    ]);
    expect(committedOurs).toEqual(new Set(ourArmies));
    expect(committedTheirs).toEqual(new Set(theirArmies));
  });
});

describe("createSimilarOpponentProvider — full 3v3 walkthrough via the real engine", () => {
  it("a uniform table produces the exact, hand-provable outcome via the real engine", () => {
    // Same technique as mirroredOpponentProvider's own hand-provable test
    // above: a uniform table (every entry the same value) makes every
    // decision at every phase a full tie, so pickBest/bestTheir*'s
    // tie-break loop always keeps the FIRST candidate in each phase's
    // current available-list order — for both minimaxSuggestionProvider
    // (ours, via the real cellValue grid, also uniform) and the Similar
    // provider (theirs, via the hand-crafted uniform table). This proves
    // the real engine + createSimilarOpponentProvider integrate correctly
    // end-to-end, with the exact same predictable outcome as the Mirrored
    // walkthrough: defender "o1", their-defender "t1", forced pair
    // [o2,o3], their-pick "o2", forced pair [t2,t3], our-accept "t2",
    // forced refusal o3 vs t3.
    const ourArmies3 = ["o1", "o2", "o3"];
    const theirArmies3 = ["t1", "t2", "t3"];
    const estimates3: Record<string, Estimate> = {};
    for (const our of ourArmies3) {
      for (const their of theirArmies3) {
        estimates3[`${our}:${their}`] = "yellow";
      }
    }
    const grid3 = gridOf(estimates3);

    const uniformTable: Record<string, number> = {};
    for (const our of ourArmies3) {
      for (const their of theirArmies3) {
        uniformTable[`${our}:${their}`] = 10;
      }
    }
    const { provider: similarProvider } = createSimilarOpponentProvider(grid3, ourArmies3, theirArmies3, {
      existingTable: uniformTable,
    });

    let state3 = createSession(ourArmies3, theirArmies3, minimaxSuggestionProvider, grid3);

    while (!isSessionComplete(state3)) {
      switch (state3.phase) {
        case "our-defender":
          state3 = confirmOurDefender(state3, "o1");
          break;
        case "their-defender": {
          const picked = similarProvider.pickDefender(state3.theirAvailable, state3.ourAvailable, grid3);
          state3 = enterTheirDefender(state3, picked, minimaxSuggestionProvider, grid3);
          break;
        }
        case "our-attacker-pair":
          state3 = confirmOurAttackerPair(state3, [state3.ourAvailable[0], state3.ourAvailable[1]]);
          break;
        case "their-pick": {
          const offered = state3.working.ourOfferedPair;
          const theirDefender = state3.working.theirDefender;
          const ourDefender = state3.working.ourDefender;
          if (!offered || !theirDefender || !ourDefender) {
            throw new Error("Expected ourOfferedPair/theirDefender/ourDefender to be set in their-pick phase");
          }
          const picked = similarProvider.pickAttackerChoice(
            offered,
            theirDefender,
            state3.ourAvailable,
            state3.theirAvailable,
            ourDefender,
            grid3,
          );
          state3 = enterTheirPick(state3, picked);
          break;
        }
        case "their-attacker-pair": {
          const ourDefender = state3.working.ourDefender;
          if (!ourDefender) throw new Error("Expected ourDefender to be set in their-attacker-pair phase");
          const pair = similarProvider.pickAttackerPair(state3.theirAvailable, state3.ourAvailable, ourDefender, grid3);
          state3 = enterTheirAttackerPair(state3, pair, minimaxSuggestionProvider, grid3);
          break;
        }
        case "our-accept":
          state3 = confirmOurAccept(
            state3,
            state3.working.theirOfferedPair?.[0] ?? "",
            minimaxSuggestionProvider,
            grid3,
          );
          break;
        case "complete":
          break;
      }
    }

    expect(state3.history).toEqual([
      {
        subRound: 1,
        ourDefender: "o1",
        theirDefender: "t1",
        ourOfferedPair: ["o2", "o3"],
        theirPick: "o2",
        theirOfferedPair: ["t2", "t3"],
        ourAccepted: "t2",
      },
    ]);
    expect(state3.refusedAttacker).toEqual({ ours: "o3", theirs: "t3" });
  });
});
