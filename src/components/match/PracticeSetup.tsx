import { useState } from "react";
import type { Tables } from "@/db/database.types";
import type { MatrixGridData } from "@/lib/matrix";
import MatchSession from "@/components/match/MatchSession";
import { clearSession, loadSession, type OpponentBehavior } from "@/lib/matchSessionStorage";

interface Props {
  opponentId: string;
  ourArmies: Tables<"team_armies">[];
  theirArmies: Tables<"opponent_armies">[];
  matrixGrid: MatrixGridData;
}

const OPPONENT_BEHAVIOR_OPTIONS: { value: OpponentBehavior; label: string; description: string }[] = [
  {
    value: "random",
    label: "Random",
    description: "Picks uniformly at random among their available armies — no matrix awareness at all.",
  },
  {
    value: "mirrored",
    label: "Mirrored",
    description: "Plays a real lookahead over an inverted view of your own matrix — a mirror-image strategist.",
  },
  {
    value: "similar",
    label: "Similar",
    description: "Like Mirrored, but with a fixed random skew per matchup — an imperfect read on the matrix.",
  },
];

const DEFAULT_BEHAVIOR: OpponentBehavior = "mirrored";

/**
 * Owns the picker-vs-session decision for a solo practice session: on
 * mount, a previously-started (and not-yet-abandoned) simulation session
 * for this opponent is resumed directly with its saved opponentBehavior,
 * skipping the picker entirely; otherwise a 3-option picker is shown first.
 * `onAbandon` (passed to MatchSession) clears the stored session and
 * returns here to the picker, rather than MatchSession silently starting a
 * new same-mode session on its own.
 */
export default function PracticeSetup({ opponentId, ourArmies, theirArmies, matrixGrid }: Props) {
  const [initialLoaded] = useState(() => loadSession(opponentId, "simulation"));
  const [activeBehavior, setActiveBehavior] = useState<OpponentBehavior | null>(
    () => initialLoaded?.opponentBehavior ?? null,
  );
  const [selected, setSelected] = useState<OpponentBehavior>(DEFAULT_BEHAVIOR);

  if (activeBehavior) {
    return (
      <MatchSession
        opponentId={opponentId}
        ourArmies={ourArmies}
        theirArmies={theirArmies}
        matrixGrid={matrixGrid}
        mode="simulation"
        opponentBehavior={activeBehavior}
        onAbandon={() => {
          clearSession("simulation");
          setActiveBehavior(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {OPPONENT_BEHAVIOR_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSelected(option.value);
              }}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                isSelected ? "border-purple-400 bg-purple-400/20" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <p className="text-sm font-semibold text-white">{option.label}</p>
              <p className="text-xs text-blue-100/70">{option.description}</p>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          setActiveBehavior(selected);
        }}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
      >
        Start practice session
      </button>
    </div>
  );
}
