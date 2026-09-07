import { useState } from "react";
import { Plus } from "lucide-react";
import { ServerError } from "@/components/forms/ServerError";
import { SubmitButton } from "@/components/forms/SubmitButton";
import type { TeamWithArmies } from "@/lib/teams";

const MAX_NAME_LENGTH = 60;

interface Props {
  team: TeamWithArmies;
  serverError?: string | null;
}

export default function TeamView({ team, serverError }: Props) {
  const [armyName, setArmyName] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{team.name}</h2>
        {team.armies.length === 0 ? (
          <p className="mt-2 text-sm text-blue-100/60">No armies yet — add your first one below.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {team.armies.map((army) => (
              <li key={army.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white">
                {army.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ServerError message={serverError} />

      <form method="POST" action="/api/teams/armies" className="flex gap-2">
        <input
          id="army"
          name="army"
          value={armyName}
          onChange={(e) => {
            setArmyName(e.target.value);
          }}
          placeholder="Add an army"
          maxLength={MAX_NAME_LENGTH}
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
        <div className="w-auto shrink-0">
          <SubmitButton pendingText="Adding..." icon={<Plus className="size-4" />}>
            Add
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
