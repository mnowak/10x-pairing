import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { TeamsError } from "@/lib/teams";

/**
 * Well-known Supabase CLI local-dev demo credentials — identical across every
 * `supabase start` instance unless `supabase/config.toml` overrides them (it
 * doesn't, here; confirmed via `supabase status -o json`). Deliberately
 * hardcoded rather than read from `.env`/`.dev.vars`, which may legitimately
 * point at a different (even linked/remote) project on a given machine — see
 * plan.md's Critical Implementation Details. Also required in practice: the
 * Workers Pool test runtime can't shell out to `supabase status` at test
 * time, so there's no way to source these dynamically from inside a test.
 */
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Matches supabase/seed.sql's two RLS-isolation test captains.
const CAPTAIN_CREDENTIALS = {
  a: { email: "captain-a@example.test", password: "test-password" },
  b: { email: "captain-b@example.test", password: "test-password" },
} as const;

export type CaptainKey = keyof typeof CAPTAIN_CREDENTIALS;

/**
 * Signs in as one of the two seeded local captains and returns a Supabase
 * client scoped to that session, ready to pass into `src/lib/*.ts` domain
 * functions exactly as an Astro route would.
 */
export async function signInCaptain(which: CaptainKey): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY);
  const { email, password } = CAPTAIN_CREDENTIALS[which];
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(
      `Could not sign in seeded captain "${which}" against local Supabase (${LOCAL_SUPABASE_URL}). ` +
        `Is \`npx supabase start\` running, and has \`supabase db reset\` seeded supabase/seed.sql? ` +
        `Original error: ${error.message}`,
    );
  }

  return client;
}

/** Returns the id of the currently signed-in captain on `client`. */
export async function getCaptainId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw new Error(`Could not resolve the signed-in captain's id: ${error.message}`);
  }
  return data.user.id;
}

/**
 * Deletes only the top-level `teams` row a test created — every child row
 * (armies, pairing-matrix estimates) cascade-deletes per the schema's
 * `on delete cascade` chain, so no per-table cleanup is needed.
 */
export async function cleanupTeam(client: SupabaseClient<Database>, teamId: string): Promise<void> {
  await client.from("teams").delete().eq("id", teamId);
}

/**
 * Deletes a single `team_armies` row a test created without touching the
 * team it belongs to. Use this instead of `cleanupTeam` when a test adds an
 * army to an already-existing team (e.g. `supabase/seed.sql`'s seeded
 * captain teams) rather than creating a fresh team of its own —
 * `getTeamWithArmies` always resolves to a captain's oldest team, so a test
 * that creates a second team for an already-seeded captain would silently
 * never be the one exercised by `src/lib/matrix.ts`'s `upsertEstimate`.
 */
export async function cleanupTeamArmy(client: SupabaseClient<Database>, teamArmyId: string): Promise<void> {
  await client.from("team_armies").delete().eq("id", teamArmyId);
}

/** Deletes only the top-level `opponents` row; see `cleanupTeam` for why that's sufficient. */
export async function cleanupOpponent(client: SupabaseClient<Database>, opponentId: string): Promise<void> {
  await client.from("opponents").delete().eq("id", opponentId);
}

/**
 * Renders a `TeamsError` (returned by both `src/lib/teams.ts` and
 * `src/lib/opponents.ts`) into a message string — mirrors the pattern
 * already used by the route handlers that consume these functions.
 */
export function describeSetupError(error: TeamsError): string {
  return error.type === "duplicate_army" ? `"${error.name}" is already in the roster` : error.message;
}
