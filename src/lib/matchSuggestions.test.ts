import { describe, expect, it } from "vitest";
import { cellValue, minimaxSuggestionProvider, pickBest, reserveStrength, type ArmyId } from "@/lib/matchSuggestions";
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
