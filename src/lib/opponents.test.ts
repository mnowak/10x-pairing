import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { createOpponentWithArmies, removeArmyFromOpponent } from "@/lib/opponents";
import { cleanupOpponent, describeSetupError, getCaptainId, signInCaptain } from "@/lib/testSupport/twoCaptains";

async function getOpponentArmyId(client: SupabaseClient<Database>, opponentId: string): Promise<string> {
  const { data, error } = await client.from("opponent_armies").select("id").eq("opponent_id", opponentId).single();
  if (error) {
    throw new Error(`Could not fetch the created opponent army: ${error.message}`);
  }
  return data.id;
}

// Risk #3 (test-plan.md §2, row 3), defense-in-depth case: removeArmyFromOpponent's
// `captain_id`-scoped delete must keep a captain's delete from ever touching
// another captain's opponent army — independent of RLS. Distinct from the F1
// fix in context/archive/2026-09-07-remove-team-army/reviews/impl-review.md,
// which lives in the route handler and covers a same-captain/cross-opponent
// case, not this one.
describe("removeArmyFromOpponent — cross-captain delete protection (risk #3, defense-in-depth)", () => {
  let captainA: SupabaseClient<Database>;
  let captainB: SupabaseClient<Database>;
  let captainAId: string;
  let captainBId: string;

  beforeAll(async () => {
    captainA = await signInCaptain("a");
    captainB = await signInCaptain("b");
    captainAId = await getCaptainId(captainA);
    captainBId = await getCaptainId(captainB);
  });

  it("deletes the captain's own opponent army", async () => {
    const opponentResult = await createOpponentWithArmies(captainB, `Risk3 Own Delete ${crypto.randomUUID()}`, ["Tau"]);
    if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
    const opponentId = opponentResult.opponent.id;

    try {
      const opponentArmyId = await getOpponentArmyId(captainB, opponentId);

      const result = await removeArmyFromOpponent(captainB, captainBId, opponentArmyId);
      expect(result).toEqual({ ok: true });

      const { data: stillThere } = await captainB
        .from("opponent_armies")
        .select("id")
        .eq("id", opponentArmyId)
        .maybeSingle();
      expect(stillThere).toBeNull();
    } finally {
      await cleanupOpponent(captainB, opponentId);
    }
  });

  it("does not delete another captain's opponent army", async () => {
    const opponentResult = await createOpponentWithArmies(captainB, `Risk3 Cross Delete ${crypto.randomUUID()}`, [
      "Tyranids",
    ]);
    if ("error" in opponentResult) throw new Error(describeSetupError(opponentResult.error));
    const opponentId = opponentResult.opponent.id;

    try {
      const opponentArmyId = await getOpponentArmyId(captainB, opponentId);

      await removeArmyFromOpponent(captainA, captainAId, opponentArmyId);

      const { data: stillThere } = await captainB
        .from("opponent_armies")
        .select("id")
        .eq("id", opponentArmyId)
        .maybeSingle();
      expect(stillThere).not.toBeNull();
    } finally {
      await cleanupOpponent(captainB, opponentId);
    }
  });
});
