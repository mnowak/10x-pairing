import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createTeamWithArmies } from "@/lib/teams";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/team?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    return context.redirect(`/dashboard/team?error=${encodeURIComponent("Team name is required")}`);
  }

  const armyNames = form
    .getAll("army")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const result = await createTeamWithArmies(supabase, name, armyNames);

  if ("error" in result) {
    const message =
      result.error.type === "duplicate_army"
        ? `"${result.error.name}" is already in your roster`
        : result.error.message;
    return context.redirect(`/dashboard/team?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/dashboard/team");
};
