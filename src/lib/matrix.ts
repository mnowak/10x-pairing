import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/db/database.types";
import { getTeamWithArmies } from "@/lib/teams";
import { getOpponentWithArmies } from "@/lib/opponents";
import { scoreToBand, bandToScore, type ColorBand } from "@/lib/colorBands";

type TypedSupabaseClient = SupabaseClient<Database>;

export interface MatrixGridData {
  ourArmies: Tables<"team_armies">[];
  theirArmies: Tables<"opponent_armies">[];
  // Keyed by `${teamArmyId}:${opponentArmyId}`.
  estimates: Record<string, ColorBand>;
}

export async function getMatrixGrid(
  supabase: TypedSupabaseClient,
  captainId: string,
  opponentId: string,
): Promise<MatrixGridData | null> {
  const team = await getTeamWithArmies(supabase, captainId);
  const opponent = await getOpponentWithArmies(supabase, captainId, opponentId);

  if (!team || !opponent) {
    return null;
  }

  const estimates: Record<string, ColorBand> = {};

  if (opponent.armies.length > 0) {
    const { data, error } = await supabase
      .from("pairing_matrix_estimates")
      .select("team_army_id, opponent_army_id, score")
      .eq("captain_id", captainId)
      .in(
        "opponent_army_id",
        opponent.armies.map((army) => army.id),
      );

    if (error) {
      throw error;
    }

    for (const row of data) {
      estimates[`${row.team_army_id}:${row.opponent_army_id}`] = scoreToBand(row.score);
    }
  }

  return { ourArmies: team.armies, theirArmies: opponent.armies, estimates };
}

/**
 * Verifies teamArmyId belongs to the captain's own team and opponentArmyId
 * belongs to one of the captain's own opponents before writing — RLS's
 * WITH CHECK only validates the new row's own captain_id, not that the
 * *referenced* army rows are owned by the same captain (a foreign key only
 * requires the referenced row to exist, not that it's owned by the caller).
 */
export async function upsertEstimate(
  supabase: TypedSupabaseClient,
  captainId: string,
  teamArmyId: string,
  opponentArmyId: string,
  band: ColorBand,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await getTeamWithArmies(supabase, captainId);
  if (!team?.armies.some((army) => army.id === teamArmyId)) {
    return { ok: false, error: "That army is not on your team" };
  }

  const { data: opponentArmy, error: opponentArmyError } = await supabase
    .from("opponent_armies")
    .select("id")
    .eq("captain_id", captainId)
    .eq("id", opponentArmyId)
    .maybeSingle();

  if (opponentArmyError) {
    return { ok: false, error: opponentArmyError.message };
  }
  if (!opponentArmy) {
    return { ok: false, error: "That opponent army was not found" };
  }

  const score = bandToScore(band);

  const { error } = await supabase
    .from("pairing_matrix_estimates")
    .upsert(
      { team_army_id: teamArmyId, opponent_army_id: opponentArmyId, score },
      { onConflict: "team_army_id,opponent_army_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
