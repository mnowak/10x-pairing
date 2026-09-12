import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ServerError } from "@/components/forms/ServerError";
import { SubmitButton } from "@/components/forms/SubmitButton";
import MatrixGrid from "@/components/matrix/MatrixGrid";
import type { OpponentWithArmies } from "@/lib/opponents";
import type { MatrixGridData } from "@/lib/matrix";
import { MAX_ROSTER_SIZE } from "@/lib/rosterLimits";

const MAX_NAME_LENGTH = 60;

interface Props {
  opponent: OpponentWithArmies;
  matrixGrid: MatrixGridData;
  estimateCounts: Record<string, number>;
  serverError?: string | null;
}

export default function OpponentDetail({ opponent, matrixGrid, estimateCounts, serverError }: Props) {
  const [armyName, setArmyName] = useState("");
  const [confirmingArmyId, setConfirmingArmyId] = useState<string | null>(null);
  const atCap = opponent.armies.length >= MAX_ROSTER_SIZE;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{opponent.name}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-blue-100/60">
              {opponent.armies.length}/{MAX_ROSTER_SIZE} armies
            </span>
            <a
              href={`/dashboard/opponents/${opponent.id}/simulate`}
              className="rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/10"
            >
              Practice solo
            </a>
            <a
              href={`/dashboard/opponents/${opponent.id}/match`}
              className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-purple-500"
            >
              Start match mode
            </a>
          </div>
        </div>
        {opponent.armies.length === 0 ? (
          <p className="mt-2 text-sm text-blue-100/60">No armies yet — add the first one below.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {opponent.armies.map((army) =>
              confirmingArmyId === army.id ? (
                <li key={army.id} className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-sm text-white">
                    Remove <span className="font-semibold">{army.name}</span>? This will also delete{" "}
                    {estimateCounts[army.id] ?? 0} previously-entered estimate(s).
                  </p>
                  <div className="flex gap-2">
                    <form method="POST" action="/api/opponents/armies/remove">
                      <input type="hidden" name="opponent_id" value={opponent.id} />
                      <input type="hidden" name="opponent_army_id" value={army.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-500"
                      >
                        Confirm
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingArmyId(null);
                      }}
                      className="rounded-lg border border-white/20 px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={army.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                >
                  <span>{army.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingArmyId(army.id);
                    }}
                    aria-label={`Remove ${army.name}`}
                    className="text-white/40 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <ServerError message={serverError} />

      {atCap ? (
        <p className="text-sm text-blue-100/60">
          Roster full ({MAX_ROSTER_SIZE}/{MAX_ROSTER_SIZE})
        </p>
      ) : (
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
      )}

      <div className="border-t border-white/10 pt-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Pairing matrix</h3>
        <MatrixGrid opponentId={opponent.id} grid={matrixGrid} />
      </div>
    </div>
  );
}
