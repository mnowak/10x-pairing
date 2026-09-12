import { describe, expect, it } from "vitest";
import { createRandomOpponentProvider } from "@/lib/opponentMoves";
import type { MatrixGridData } from "@/lib/matrix";

const emptyGrid: MatrixGridData = { ourArmies: [], theirArmies: [], estimates: {} };

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
