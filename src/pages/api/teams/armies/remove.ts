import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { removeArmyFromTeam } from "@/lib/teams";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/?teamError=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawTeamArmyId = form.get("team_army_id");
  const teamArmyId = typeof rawTeamArmyId === "string" ? rawTeamArmyId : "";

  if (!teamArmyId) {
    return context.redirect(`/?teamError=${encodeURIComponent("Missing army to remove")}`);
  }

  const result = await removeArmyFromTeam(supabase, context.locals.user.id, teamArmyId);

  if (!result.ok) {
    return context.redirect(`/?teamError=${encodeURIComponent(result.error)}`);
  }

  return context.redirect("/");
};
