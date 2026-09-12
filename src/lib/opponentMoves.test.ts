import { describe, expect, it } from "vitest";
import {
  createRandomOpponentProvider,
  createSimilarOpponentProvider,
  generateSimilarScoreTable,
} from "@/lib/opponentMoves";
import type { MatrixGridData } from "@/lib/matrix";
import type { Estimate } from "@/lib/colorBands";

const emptyGrid: MatrixGridData = { ourArmies: [], theirArmies: [], estimates: {} };

function gridOf(estimates: Record<string, Estimate>): MatrixGridData {
  return { ourArmies: [], theirArmies: [], estimates };
}

/** Returns a fixed queue of `[0,1)` values, repeating the last one past the end. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[Math.min(i, values.length - 1)];
    i++;
    return value;
  };
}

describe("createRandomOpponentProvider", () => {
  describe("pickDefender", () => {
    it("returns the first candidate for a boundary-low random value", () => {
      const provider = createRandomOpponentProvider(sequence(0));
      expect(provider.pickDefender(["a", "b", "c"], [], "our-defender", emptyGrid)).toBe("a");
    });

    it("returns the last candidate for a boundary-high random value", () => {
      const provider = createRandomOpponentProvider(sequence(0.999999));
      expect(provider.pickDefender(["a", "b", "c"], [], "our-defender", emptyGrid)).toBe("c");
    });
  });

  describe("pickAttackerChoice", () => {
    it("returns the first offered army for a boundary-low random value", () => {
      const provider = createRandomOpponentProvider(sequence(0));
      expect(provider.pickAttackerChoice(["a", "b"], "d", [], [], "our-defender", emptyGrid)).toBe("a");
    });

    it("returns the second offered army for a boundary-high random value", () => {
      const provider = createRandomOpponentProvider(sequence(0.999999));
      expect(provider.pickAttackerChoice(["a", "b"], "d", [], [], "our-defender", emptyGrid)).toBe("b");
    });
  });

  describe("pickAttackerPair", () => {
    it("returns 2 distinct armies from exactly 2 available", () => {
      const provider = createRandomOpponentProvider(sequence(0, 0));
      expect(provider.pickAttackerPair(["x", "y"], [], "d", emptyGrid)).toEqual(["x", "y"]);
    });

    it("returns 2 distinct armies from more than 2 available (not hardcoded to 'the only 2 left')", () => {
      const provider = createRandomOpponentProvider(sequence(0, 0));
      const [a, b] = provider.pickAttackerPair(["a", "b", "c", "d", "e"], [], "d", emptyGrid);
      expect(a).toBe("a");
      expect(b).toBe("b");
      expect(a).not.toBe(b);
    });

    it("stays distinct at the boundary-high end of a 5-element list", () => {
      const provider = createRandomOpponentProvider(sequence(0.999999, 0.999999));
      const [a, b] = provider.pickAttackerPair(["a", "b", "c", "d", "e"], [], "d", emptyGrid);
      expect(a).toBe("e");
      expect(b).toBe("d");
      expect(a).not.toBe(b);
    });
  });
});

describe("generateSimilarScoreTable", () => {
  it("covers every (our, their) combination across the full initial rosters", () => {
    const table = generateSimilarScoreTable(gridOf({}), ["a", "b"], ["x", "y"], sequence(0.5));
    expect(Object.keys(table).sort()).toEqual(["a:x", "a:y", "b:x", "b:y"].sort());
  });

  it("a non-purple cell is mirroredValue ± [-4,+4], clamped to 0 at the low end", () => {
    // cellValue("a","x") = dark-green = 18, mirroredValue = 20 - 18 = 2.
    // Boundary-low random draws -4: 2 + (-4) = -2, clamped to 0.
    const grid = gridOf({ "a:x": "dark-green" });
    const table = generateSimilarScoreTable(grid, ["a"], ["x"], sequence(0));
    expect(table["a:x"]).toBe(0);
  });

  it("a non-purple cell is mirroredValue ± [-4,+4], clamped to 20 at the high end", () => {
    // cellValue("a","x") = red = 2, mirroredValue = 20 - 2 = 18.
    // Boundary-high random draws +4: 18 + 4 = 22, clamped to 20.
    const grid = gridOf({ "a:x": "red" });
    const table = generateSimilarScoreTable(grid, ["a"], ["x"], sequence(0.999999));
    expect(table["a:x"]).toBe(20);
  });

  it("a purple cell gets the full [0,20] range, not the narrower mirrored±4 band", () => {
    const grid = gridOf({ "a:x": "purple" });
    const low = generateSimilarScoreTable(grid, ["a"], ["x"], sequence(0));
    const high = generateSimilarScoreTable(grid, ["a"], ["x"], sequence(0.999999));
    // If purple were treated as mirroredValue(7) ± 4, the range would be
    // [3,11] — these boundary draws prove it's actually the full [0,20].
    expect(low["a:x"]).toBe(0);
    expect(high["a:x"]).toBe(20);
  });

  it("an unestimated (absent) cell is treated identically to purple, not skipped", () => {
    const purpleGrid = gridOf({ "a:x": "purple" });
    const blankGrid = gridOf({});
    const purpleTable = generateSimilarScoreTable(purpleGrid, ["a"], ["x"], sequence(0.5));
    const blankTable = generateSimilarScoreTable(blankGrid, ["a"], ["x"], sequence(0.5));
    expect(blankTable["a:x"]).toBe(purpleTable["a:x"]);
  });
});

describe("createSimilarOpponentProvider", () => {
  it("restoring from an existingTable reproduces the same pick as the original generation, drawing no new randomness", () => {
    const grid = gridOf({});
    const { provider: original, table } = createSimilarOpponentProvider(grid, ["x", "y", "z"], ["a", "b", "c"], {
      random: sequence(0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.5, 0.3, 0.7),
    });
    const originalPick = original.pickDefender(["a", "b", "c"], ["x", "y", "z"], "d", grid);

    const { provider: restored } = createSimilarOpponentProvider(grid, ["x", "y", "z"], ["a", "b", "c"], {
      existingTable: table,
      random: () => {
        throw new Error("existingTable path must not draw new randomness");
      },
    });
    const restoredPick = restored.pickDefender(["a", "b", "c"], ["x", "y", "z"], "d", grid);

    expect(restoredPick).toBe(originalPick);
  });

  it("once a table exists, the provider's picks depend only on the table, not the matrixGrid argument", () => {
    const table: Record<string, number> = { "x:a": 5, "y:a": 5, "x:b": 18, "y:b": 18 };
    const gridA = gridOf({});
    // Opposite-signal grid — if the provider were reading the grid instead
    // of the table, this would change the outcome; it doesn't.
    const gridB = gridOf({ "x:a": "dark-green", "x:b": "red", "y:a": "dark-green", "y:b": "red" });

    const { provider: providerA } = createSimilarOpponentProvider(gridA, ["x", "y"], ["a", "b"], {
      existingTable: table,
    });
    const { provider: providerB } = createSimilarOpponentProvider(gridB, ["x", "y"], ["a", "b"], {
      existingTable: table,
    });

    const resultA = providerA.pickAttackerPair(["a", "b"], ["x", "y"], "d", gridA);
    const resultB = providerB.pickAttackerPair(["a", "b"], ["x", "y"], "d", gridB);
    expect(resultA).toEqual(resultB);
  });
});
