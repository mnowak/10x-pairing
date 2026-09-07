import { useState } from "react";
import { Plus } from "lucide-react";
import { ServerError } from "@/components/forms/ServerError";
import { SubmitButton } from "@/components/forms/SubmitButton";
import MatrixGrid from "@/components/matrix/MatrixGrid";
import type { OpponentWithArmies } from "@/lib/opponents";
import type { MatrixGridData } from "@/lib/matrix";

const MAX_NAME_LENGTH = 60;

interface Props {
  opponent: OpponentWithArmies;
  matrixGrid: MatrixGridData;
  serverError?: string | null;
}

export default function OpponentDetail({ opponent, matrixGrid, serverError }: Props) {
  const [armyName, setArmyName] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{opponent.name}</h2>
        {opponent.armies.length === 0 ? (
          <p className="mt-2 text-sm text-blue-100/60">No armies yet — add the first one below.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {opponent.armies.map((army) => (
              <li key={army.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white">
                {army.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ServerError message={serverError} />

      <form method="POST" action="/api/opponents/armies" className="flex gap-2">
        <input type="hidden" name="opponent_id" value={opponent.id} />
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

      <div className="border-t border-white/10 pt-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Pairing matrix</h3>
        <MatrixGrid opponentId={opponent.id} grid={matrixGrid} />
      </div>
    </div>
  );
}
