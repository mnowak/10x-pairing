import { describe, expect, it } from "vitest";
import { estimatedTeamScore } from "@/lib/teamScore";
import type { SubRoundResult, RefusedAttackerPairing } from "@/lib/matchSessionEngine";
import type { MatrixGridData } from "@/lib/matrix";
import type { Estimate } from "@/lib/colorBands";

function gridOf(estimates: Record<string, Estimate>): MatrixGridData {
  return { ourArmies: [], theirArmies: [], estimates };
}

function subRound(overrides: Partial<SubRoundResult> & Pick<SubRoundResult, "subRound">): SubRoundResult {
  return {
    ourDefender: "o1",
    theirDefender: "t1",
    ourOfferedPair: ["o1", "o2"],
    theirPick: "o2",
    theirOfferedPair: ["t1", "t2"],
    ourAccepted: "t1",
    ...overrides,
  };
}

describe("estimatedTeamScore", () => {
  it("returns 0 for an empty history and no refused attacker", () => {
    expect(estimatedTeamScore(gridOf({}), [], null)).toBe(0);
  });

  it("sums ourDefender<->ourAccepted and theirPick<->theirDefender, not ourDefender<->theirDefender", () => {
    // o1 (our defender) is paired with t1 (our accepted) — red, score 2.
    // o2 (their pick) is paired with t2 (their defender) — dark-green, score 18.
    // o1<->t2 and o2<->t1 are deliberately given a different, unused estimate
    // to prove the naive (wrong) pairing isn't what's being summed.
    const grid = gridOf({
      "o1:t1": "red",
      "o2:t2": "dark-green",
      "o1:t2": "yellow",
      "o2:t1": "yellow",
    });
    const round = subRound({
      subRound: 1,
      ourDefender: "o1",
      theirDefender: "t2",
      theirPick: "o2",
      ourAccepted: "t1",
    });
    expect(estimatedTeamScore(grid, [round], null)).toBe(2 + 18);
  });

  it("sums across two sub-rounds plus the refused-attacker pairing", () => {
    const grid = gridOf({
      "o1:t1": "red", // round 1: ourDefender <-> ourAccepted
      "o2:t2": "yellow", // round 1: theirPick <-> theirDefender
      "o3:t3": "green", // round 2: ourDefender <-> ourAccepted
      "o4:t4": "dark-green", // round 2: theirPick <-> theirDefender
      "o5:t5": "orange", // refused attacker
    });
    const history: SubRoundResult[] = [
      subRound({ subRound: 1, ourDefender: "o1", theirDefender: "t2", theirPick: "o2", ourAccepted: "t1" }),
      subRound({ subRound: 2, ourDefender: "o3", theirDefender: "t4", theirPick: "o4", ourAccepted: "t3" }),
    ];
    const refusedAttacker: RefusedAttackerPairing = { ours: "o5", theirs: "t5" };

    expect(estimatedTeamScore(grid, history, refusedAttacker)).toBe(2 + 10 + 14 + 18 + 6);
  });

  it("includes a pairing with no stored estimate via cellValue's fallback, not by skipping it", () => {
    // "o1:t1" is deliberately absent from estimates.
    const grid = gridOf({ "o2:t2": "red" });
    const round = subRound({ subRound: 1, ourDefender: "o1", theirDefender: "t2", theirPick: "o2", ourAccepted: "t1" });

    expect(estimatedTeamScore(grid, [round], null)).toBe(7 + 2);
  });
});
