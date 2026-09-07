import { useState } from "react";
import { Plus, Users } from "lucide-react";
import CreateOpponentForm from "@/components/opponent/CreateOpponentForm";
import type { OpponentWithArmies } from "@/lib/opponents";

interface Props {
  opponents: OpponentWithArmies[];
  serverError?: string | null;
}

export default function OpponentsList({ opponents, serverError }: Props) {
  const [showForm, setShowForm] = useState(opponents.length === 0 || Boolean(serverError));

  return (
    <div className="space-y-6">
      {opponents.length === 0 ? (
        <p className="text-sm text-blue-100/60">No opponents yet — add your first one below.</p>
      ) : (
        <ul className="space-y-2">
          {opponents.map((opponent) => (
            <li key={opponent.id}>
              <a
                href={`/dashboard/opponents/${opponent.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white transition-colors hover:bg-white/10"
              >
                <span>{opponent.name}</span>
                <span className="text-xs text-blue-100/60">
                  {opponent.armies.length} {opponent.armies.length === 1 ? "army" : "armies"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {!showForm && opponents.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
          }}
          className="flex items-center gap-1 text-sm text-purple-300 hover:underline"
        >
          <Plus className="size-4" /> Add another opponent
        </button>
      )}

      {showForm && (
        <div className="border-t border-white/10 pt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="size-4" /> Add an opponent
          </h2>
          <CreateOpponentForm serverError={serverError} />
        </div>
      )}
    </div>
  );
}
