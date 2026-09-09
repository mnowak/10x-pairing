import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { upsertEstimate } from "@/lib/matrix";
import { addArmyToTeam, getTeamWithArmies } from "@/lib/teams";
import { createOpponentWithArmies } from "@/lib/opponents";
import {
  cleanupOpponent,
  cleanupTeamArmy,
  describeSetupError,
  getCaptainId,
  signInCaptain,
} from "@/lib/testSupport/twoCaptains";

// Risk #3 (test-plan.md §2, row 3): a write route accepting 2+ foreign-key
// IDs must verify BOTH referenced rows belong to the caller. upsertEstimate
// is the primary case — the ownership check itself lives in src/lib/matrix.ts.
describe("upsertEstimate — cross-captain write protection (risk #3)", () => {
  let captainA: SupabaseClient<Database>;
  let captainB: SupabaseClient<Database>;
  let captainAId: string;

  let teamArmyId: string;
  let ownOpponentId: string;
  let ownOpponentArmyId: string;
  let foreignOpponentId: string;
  let foreignOpponentArmyId: string;

  beforeAll(async () => {
    captainA = await signInCaptain("a");
    captainB = await signInCaptain("b");
    captainAId = await getCaptainId(captainA);

    // Captain A already has a seeded team (supabase/seed.sql). getTeamWithArmies
    // always resolves to a captain's oldest team, so this test adds an army to
    // that existing team rather than creating a second one that upsertEstimate
    // (which calls getTeamWithArmies internally) would never actually resolve to.
    const existingTeam = await getTeamWithArmies(captainA, captainAId);
    if (!existingTeam) throw new Error("Captain A has no seeded team — check supabase/seed.sql");
    const addArmyResult = await addArmyToTeam(captainA, existingTeam.id, `Risk3 Army ${crypto.randomUUID()}`);
    if ("error" in addArmyResult) throw new Error(describeSetupError(addArmyResult.error));
    teamArmyId = addArmyResult.army.id;

    const ownOpponentResult = await createOpponentWithArmies(captainA, `Risk3 Opponent A ${crypto.randomUUID()}`, [
      "Necrons",
    ]);
    if ("error" in ownOpponentResult) throw new Error(describeSetupError(ownOpponentResult.error));
    ownOpponentId = ownOpponentResult.opponent.id;
    const { data: ownOpponentArmy, error: ownOpponentArmyError } = await captainA
      .from("opponent_armies")
      .select("id")
      .eq("opponent_id", ownOpponentId)
      .single();
    if (ownOpponentArmyError) {
      throw new Error(`Could not fetch the created opponent army: ${ownOpponentArmyError.message}`);
    }
    ownOpponentArmyId = ownOpponentArmy.id;

    const foreignOpponentResult = await createOpponentWithArmies(captainB, `Risk3 Opponent B ${crypto.randomUUID()}`, [
      "Orks",
    ]);
    if ("error" in foreignOpponentResult) throw new Error(describeSetupError(foreignOpponentResult.error));
    foreignOpponentId = foreignOpponentResult.opponent.id;
    const { data: foreignOpponentArmy, error: foreignOpponentArmyError } = await captainB
      .from("opponent_armies")
      .select("id")
      .eq("opponent_id", foreignOpponentId)
      .single();
    if (foreignOpponentArmyError) {
      throw new Error(`Could not fetch the created opponent army: ${foreignOpponentArmyError.message}`);
    }
    foreignOpponentArmyId = foreignOpponentArmy.id;
  });

  afterAll(async () => {
    await cleanupTeamArmy(captainA, teamArmyId);
    await cleanupOpponent(captainA, ownOpponentId);
    await cleanupOpponent(captainB, foreignOpponentId);
  });

  it("accepts a write against the captain's own team army and opponent army", async () => {
    const result = await upsertEstimate(captainA, captainAId, teamArmyId, ownOpponentArmyId, "green");
    expect(result).toEqual({ ok: true });

    const { data: storedRow } = await captainA
      .from("pairing_matrix_estimates")
      .select("score, is_purple")
      .eq("team_army_id", teamArmyId)
      .eq("opponent_army_id", ownOpponentArmyId)
      .maybeSingle();
    expect(storedRow).toMatchObject({ score: 14, is_purple: false });
  });

  it("rejects a write naming another captain's opponent army, and persists nothing", async () => {
    const result = await upsertEstimate(captainA, captainAId, teamArmyId, foreignOpponentArmyId, "red");
    expect(result.ok).toBe(false);

    const { data: leakedRow } = await captainB
      .from("pairing_matrix_estimates")
      .select("id")
      .eq("opponent_army_id", foreignOpponentArmyId)
      .maybeSingle();
    expect(leakedRow).toBeNull();
  });
});
