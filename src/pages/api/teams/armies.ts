import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addArmyToTeam, getTeamWithArmies } from "@/lib/teams";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/team?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawArmy = form.get("army");
  const armyName = typeof rawArmy === "string" ? rawArmy.trim() : "";

  if (!armyName) {
    return context.redirect(`/dashboard/team?error=${encodeURIComponent("Army name is required")}`);
  }

  let team;
  try {
    team = await getTeamWithArmies(supabase, context.locals.user.id);
  } catch {
    return context.redirect(`/dashboard/team?error=${encodeURIComponent("Something went wrong loading your team")}`);
  }
  if (!team) {
    return context.redirect(`/dashboard/team?error=${encodeURIComponent("Create a team first")}`);
  }

  const result = await addArmyToTeam(supabase, team.id, armyName);

  if ("error" in result) {
    const message =
      result.error.type === "duplicate_army"
        ? `"${result.error.name}" is already in your roster`
        : result.error.message;
    return context.redirect(`/dashboard/team?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/dashboard/team");
};
