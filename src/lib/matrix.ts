import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/db/database.types";
import { getTeamWithArmies } from "@/lib/teams";
import type { OpponentWithArmies } from "@/lib/opponents";
import { scoreToBand, bandToScore, type Estimate } from "@/lib/colorBands";
import { logError } from "@/lib/logError";

type TypedSupabaseClient = SupabaseClient<Database>;

export interface MatrixGridData {
  ourArmies: Tables<"team_armies">[];
  theirArmies: Tables<"opponent_armies">[];
  // Keyed by `${teamArmyId}:${opponentArmyId}`.
  estimates: Record<string, Estimate>;
}

export async function getMatrixGrid(
  supabase: TypedSupabaseClient,
  captainId: string,
  opponent: OpponentWithArmies,
): Promise<MatrixGridData | null> {
  const team = await getTeamWithArmies(supabase, captainId);

  if (!team) {
    return null;
  }

  const estimates: Record<string, Estimate> = {};

  if (opponent.armies.length > 0) {
    const { data, error } = await supabase
      .from("pairing_matrix_estimates")
      .select("team_army_id, opponent_army_id, score, is_purple")
      .eq("captain_id", captainId)
      .in(
        "opponent_army_id",
        opponent.armies.map((army) => army.id),
      );

    if (error) {
      throw error;
    }

    for (const row of data) {
      const key = `${row.team_army_id}:${row.opponent_army_id}`;
      if (row.is_purple) {
        estimates[key] = "purple";
      } else if (row.score !== null) {
        try {
          estimates[key] = scoreToBand(row.score);
        } catch {
          // Out-of-range score shouldn't happen (DB CHECK enforces 0-20), but
          // skip just this cell rather than failing the whole grid if it ever does.
        }
      }
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
  estimate: Estimate,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let team;
  try {
    team = await getTeamWithArmies(supabase, captainId);
  } catch (error) {
    logError("matrix.ts: upsertEstimate -> getTeamWithArmies", error);
    return { ok: false, error: "Something went wrong loading your team" };
  }
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

  const isPurple = estimate === "purple";
  const score = isPurple ? null : bandToScore(estimate);

  const { error } = await supabase
    .from("pairing_matrix_estimates")
    .upsert(
      { team_army_id: teamArmyId, opponent_army_id: opponentArmyId, score, is_purple: isPurple },
      { onConflict: "team_army_id,opponent_army_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
