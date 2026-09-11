import { useEffect, useMemo, useState } from "react";
import type { Tables } from "@/db/database.types";
import type { MatrixGridData } from "@/lib/matrix";
import {
  confirmOurAccept,
  confirmOurAttackerPair,
  confirmOurDefender,
  createSession,
  enterTheirAttackerPair,
  enterTheirDefender,
  enterTheirPick,
  type MatchSessionState,
} from "@/lib/matchSessionEngine";
import { randomSuggestionProvider, type ArmyId } from "@/lib/matchSuggestions";
import { loadSession, saveSession, clearSession } from "@/lib/matchSessionStorage";
import MatchMatrix from "@/components/match/MatchMatrix";

interface Props {
  opponentId: string;
  ourArmies: Tables<"team_armies">[];
  theirArmies: Tables<"opponent_armies">[];
  matrixGrid: MatrixGridData;
}

function phaseLabel(state: MatchSessionState, nameById: Map<ArmyId, string>): string {
  const name = (id: ArmyId | undefined) => (id ? (nameById.get(id) ?? id) : "?");
  const { working } = state;

  switch (state.phase) {
    case "our-defender":
      return "Pick our defender";
    case "their-defender":
      return `Enter their revealed defender (our defender: ${name(working.ourDefender)})`;
    case "our-attacker-pair":
      return `Offer 2 of our attackers against their defender, ${name(working.theirDefender)}`;
    case "their-pick": {
      const [a, b] = working.ourOfferedPair ?? [];
      return `Enter which of our offered attackers — ${name(a)} or ${name(b)} — their defender ${name(working.theirDefender)} selected`;
    }
    case "their-attacker-pair":
      return `Enter their 2 offered attackers against our defender, ${name(working.ourDefender)}`;
    case "our-accept": {
      const [a, b] = working.theirOfferedPair ?? [];
      return `Accept one of their offered attackers — ${name(a)} or ${name(b)} — for our defender ${name(working.ourDefender)}`;
    }
    case "complete":
      return "Session complete";
  }
}

function ArmyButton({ name, suggested, onClick }: { name: string; suggested: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-lg border px-3 py-2 text-sm text-white transition-colors ${
        suggested
          ? "border-amber-400/60 bg-amber-400/10 hover:bg-amber-400/20"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      {suggested && (
        <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-semibold text-black">
          Suggested
        </span>
      )}
      {name}
    </button>
  );
}

function SinglePicker({
  ids,
  suggested,
  nameById,
  onPick,
}: {
  ids: ArmyId[];
  suggested: ArmyId | null;
  nameById: Map<ArmyId, string>;
  onPick: (id: ArmyId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <ArmyButton
          key={id}
          name={nameById.get(id) ?? id}
          suggested={id === suggested}
          onClick={() => {
            onPick(id);
          }}
        />
      ))}
    </div>
  );
}

function PairPicker({
  ids,
  suggested,
  nameById,
  onConfirm,
}: {
  ids: ArmyId[];
  suggested: [ArmyId, ArmyId] | null;
  nameById: Map<ArmyId, string>;
  onConfirm: (pair: [ArmyId, ArmyId]) => void;
}) {
  // No reset-on-`ids`-change effect needed: each PairPicker instance is
  // conditionally rendered per phase ({phase === "..." && <PairPicker/>}),
  // so returning to this phase in a later sub-round is a fresh mount with a
  // fresh `selected` already — the previous instance was fully unmounted.
  const [selected, setSelected] = useState<ArmyId[]>([]);

  function toggle(id: ArmyId) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((existing) => existing !== id);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const isSuggested = suggested?.includes(id) ?? false;
          const isSelected = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                toggle(id);
              }}
              className={`relative rounded-lg border px-3 py-2 text-sm text-white transition-colors ${
                isSelected
                  ? "border-purple-400 bg-purple-400/20"
                  : isSuggested
                    ? "border-amber-400/60 bg-amber-400/10 hover:bg-amber-400/20"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              {isSuggested && (
                <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-semibold text-black">
                  Suggested
                </span>
              )}
              {nameById.get(id) ?? id}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={selected.length !== 2}
        onClick={() => {
          onConfirm([selected[0], selected[1]]);
        }}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Confirm pair ({selected.length}/2)
      </button>
    </div>
  );
}

export default function MatchSession({ opponentId, ourArmies, theirArmies, matrixGrid }: Props) {
  const ourArmyIds = useMemo(() => ourArmies.map((army) => army.id), [ourArmies]);
  const theirArmyIds = useMemo(() => theirArmies.map((army) => army.id), [theirArmies]);

  const nameById = useMemo(() => {
    const map = new Map<ArmyId, string>();
    for (const army of [...ourArmies, ...theirArmies]) {
      map.set(army.id, army.name);
    }
    return map;
  }, [ourArmies, theirArmies]);

  // Lazy initializer (not an effect): this island is mounted client:only
  // (see match.astro), so this component's first render IS the client
  // render — matchSessionStorage's globalThis.localStorage read is safe
  // here and never runs during SSR.
  const [state, setState] = useState<MatchSessionState>(
    () => loadSession(opponentId) ?? createSession(ourArmyIds, theirArmyIds, randomSuggestionProvider, matrixGrid),
  );

  useEffect(() => {
    saveSession(opponentId, state);
  }, [opponentId, state]);

  function restart() {
    clearSession();
    setState(createSession(ourArmyIds, theirArmyIds, randomSuggestionProvider, matrixGrid));
  }

  const suggestedSingle = typeof state.suggested === "string" ? state.suggested : null;
  const suggestedPair = Array.isArray(state.suggested) ? state.suggested : null;

  // Derived from completed sub-rounds (+ the auto-paired refused attacker):
  // which specific opposing army each committed army actually ended up
  // matched against — MatchMatrix uses this to highlight the one relevant
  // cell for a committed army instead of its whole (now-moot) row.
  const { ourPairedWith, theirPairedWith } = useMemo(() => {
    const ours: Partial<Record<ArmyId, ArmyId>> = {};
    const theirs: Partial<Record<ArmyId, ArmyId>> = {};
    for (const round of state.history) {
      ours[round.ourDefender] = round.ourAccepted;
      theirs[round.ourAccepted] = round.ourDefender;
      ours[round.theirPick] = round.theirDefender;
      theirs[round.theirDefender] = round.theirPick;
    }
    if (state.refusedAttacker) {
      ours[state.refusedAttacker.ours] = state.refusedAttacker.theirs;
      theirs[state.refusedAttacker.theirs] = state.refusedAttacker.ours;
    }
    return { ourPairedWith: ours, theirPairedWith: theirs };
  }, [state.history, state.refusedAttacker]);

  // The matrix cells actually relevant to the current decision: offering
  // attackers narrows to their one revealed defender's column; accepting
  // one of their offered attackers narrows to our one committed defender's
  // row. Every other phase (picking our defender, or plain data entry)
  // falls back to MatchMatrix's default available-vs-available emphasis.
  const focus = useMemo(() => {
    if (state.phase === "our-attacker-pair" && state.working.theirDefender) {
      return { rows: state.ourAvailable, columns: [state.working.theirDefender] };
    }
    if (state.phase === "our-accept" && state.working.ourDefender && state.working.theirOfferedPair) {
      return { rows: [state.working.ourDefender], columns: state.working.theirOfferedPair };
    }
    return null;
  }, [state.phase, state.working, state.ourAvailable]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-100/60">
          Sub-round {state.subRound} · {phaseLabel(state, nameById)}
        </span>
        <button
          type="button"
          onClick={restart}
          className="rounded-lg border border-white/20 px-3 py-1 text-xs text-white/70 transition-colors hover:bg-white/10"
        >
          Abandon &amp; restart
        </button>
      </div>

      <MatchMatrix
        ourArmies={ourArmies}
        theirArmies={theirArmies}
        matrixGrid={matrixGrid}
        ourAvailable={state.ourAvailable}
        theirAvailable={state.theirAvailable}
        ourPairedWith={ourPairedWith}
        theirPairedWith={theirPairedWith}
        focus={focus}
      />

      {state.phase === "our-defender" && (
        <SinglePicker
          ids={state.ourAvailable}
          suggested={suggestedSingle}
          nameById={nameById}
          onPick={(id) => {
            setState(confirmOurDefender(state, id));
          }}
        />
      )}

      {state.phase === "their-defender" && (
        <SinglePicker
          ids={state.theirAvailable}
          suggested={null}
          nameById={nameById}
          onPick={(id) => {
            setState(enterTheirDefender(state, id, randomSuggestionProvider, matrixGrid));
          }}
        />
      )}

      {state.phase === "our-attacker-pair" && (
        <PairPicker
          ids={state.ourAvailable}
          suggested={suggestedPair}
          nameById={nameById}
          onConfirm={(pair) => {
            setState(confirmOurAttackerPair(state, pair));
          }}
        />
      )}

      {state.phase === "their-pick" && (
        <SinglePicker
          ids={state.working.ourOfferedPair ?? []}
          suggested={null}
          nameById={nameById}
          onPick={(id) => {
            setState(enterTheirPick(state, id));
          }}
        />
      )}

      {state.phase === "their-attacker-pair" && (
        <PairPicker
          ids={state.theirAvailable}
          suggested={null}
          nameById={nameById}
          onConfirm={(pair) => {
            setState(enterTheirAttackerPair(state, pair, randomSuggestionProvider, matrixGrid));
          }}
        />
      )}

      {state.phase === "our-accept" && (
        <SinglePicker
          ids={state.working.theirOfferedPair ?? []}
          suggested={suggestedSingle}
          nameById={nameById}
          onPick={(id) => {
            setState(confirmOurAccept(state, id, randomSuggestionProvider, matrixGrid));
          }}
        />
      )}

      {state.phase === "complete" && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Session complete!</p>
          <ul className="space-y-2">
            {state.history.map((round) => (
              <li key={round.subRound} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white">
                <p className="font-semibold text-blue-100/80">Sub-round {round.subRound}</p>
                <p>
                  Our defender{" "}
                  <span className="font-medium">{nameById.get(round.ourDefender) ?? round.ourDefender}</span> vs their
                  defender{" "}
                  <span className="font-medium">{nameById.get(round.theirDefender) ?? round.theirDefender}</span>
                </p>
                <p>
                  They selected <span className="font-medium">{nameById.get(round.theirPick) ?? round.theirPick}</span>{" "}
                  from our offered pair
                </p>
                <p>
                  We accepted{" "}
                  <span className="font-medium">{nameById.get(round.ourAccepted) ?? round.ourAccepted}</span> from their
                  offered pair
                </p>
              </li>
            ))}
          </ul>
          {state.refusedAttacker && (
            <div className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-3 text-sm text-white">
              <p className="font-semibold text-purple-200">Refused attacker (auto-paired)</p>
              <p>
                {nameById.get(state.refusedAttacker.ours) ?? state.refusedAttacker.ours} vs{" "}
                {nameById.get(state.refusedAttacker.theirs) ?? state.refusedAttacker.theirs}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
