import { describe, expect, it } from "vitest";
import { randomSuggestionProvider } from "@/lib/matchSuggestions";
import type { MatrixGridData } from "@/lib/matrix";

const emptyGrid: MatrixGridData = { ourArmies: [], theirArmies: [], estimates: {} };

describe("randomSuggestionProvider", () => {
  it("suggestDefender always returns an army from the available set", () => {
    const available = ["a1", "a2", "a3"];
    for (let i = 0; i < 50; i++) {
      const pick = randomSuggestionProvider.suggestDefender(available, ["b1", "b2"], emptyGrid);
      expect(available).toContain(pick);
    }
  });

  it("suggestAttackerPair always returns 2 distinct armies from the available set", () => {
    const available = ["a1", "a2", "a3", "a4"];
    for (let i = 0; i < 50; i++) {
      const [first, second] = randomSuggestionProvider.suggestAttackerPair(available, "b1", emptyGrid);
      expect(available).toContain(first);
      expect(available).toContain(second);
      expect(first).not.toBe(second);
    }
  });

  it("suggestAcceptedAttacker always returns one of the offered pair", () => {
    const offeredPair: [string, string] = ["b1", "b2"];
    for (let i = 0; i < 50; i++) {
      const pick = randomSuggestionProvider.suggestAcceptedAttacker("a1", offeredPair, ["a2", "a3"], emptyGrid);
      expect(offeredPair).toContain(pick);
    }
  });

  it("suggestDefender throws when there are no available armies", () => {
    expect(() => randomSuggestionProvider.suggestDefender([], ["b1"], emptyGrid)).toThrow();
  });

  it("suggestAttackerPair throws when fewer than 2 armies are available", () => {
    expect(() => randomSuggestionProvider.suggestAttackerPair(["a1"], "b1", emptyGrid)).toThrow();
  });
});
