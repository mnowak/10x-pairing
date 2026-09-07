import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createOpponentWithArmies } from "@/lib/opponents";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent("Opponent name is required")}`);
  }

  const armyNames = form
    .getAll("army")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const result = await createOpponentWithArmies(supabase, name, armyNames);

  if ("error" in result) {
    const message =
      result.error.type === "duplicate_army"
        ? `"${result.error.name}" is already in that roster`
        : result.error.message;
    return context.redirect(`/dashboard/opponents?error=${encodeURIComponent(message)}`);
  }

  return context.redirect(`/dashboard/opponents/${result.opponent.id}`);
};
