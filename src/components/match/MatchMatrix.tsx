import type { Tables } from "@/db/database.types";
import { BAND_SWATCH_CLASSES, type Estimate } from "@/lib/colorBands";
import type { MatrixGridData } from "@/lib/matrix";
import type { ArmyId } from "@/lib/matchSuggestions";

interface Focus {
  rows: ArmyId[];
  columns: ArmyId[];
}

interface Props {
  ourArmies: Tables<"team_armies">[];
  theirArmies: Tables<"opponent_armies">[];
  matrixGrid: MatrixGridData;
  ourAvailable: ArmyId[];
  theirAvailable: ArmyId[];
  // Committed army -> the specific army it's actually paired against, once
  // a sub-round resolves (or the session auto-pairs the refused attacker).
  ourPairedWith: Partial<Record<ArmyId, ArmyId>>;
  theirPairedWith: Partial<Record<ArmyId, ArmyId>>;
  // When set, only cells at the intersection of these rows/columns are
  // emphasized — the current decision's actual comparison (e.g. our
  // available armies against their one revealed defender) rather than
  // every available-vs-available matchup. Null falls back to that default.
  focus: Focus | null;
}

function cellKey(teamArmyId: string, opponentArmyId: string): string {
  return `${teamArmyId}:${opponentArmyId}`;
}

/**
 * Read-only pairing-matrix visualization for live match-mode. A committed
 * army shows only its actual pairing's color, ring-highlighted — everything
 * else about that army fades, since its other matchups are now moot. Among
 * still-open matchups, `focus` (when set) narrows emphasis to the specific
 * rows/columns the current decision actually compares; otherwise every
 * available-vs-available cell is emphasized.
 */
export default function MatchMatrix({
  ourArmies,
  theirArmies,
  matrixGrid,
  ourAvailable,
  theirAvailable,
  ourPairedWith,
  theirPairedWith,
  focus,
}: Props) {
  // Widened to Partial: an arbitrary cellKey may have no stored estimate,
  // which MatrixGridData's plain Record type doesn't reflect.
  const estimates: Partial<Record<string, Estimate>> = matrixGrid.estimates;

  function rowEmphasized(ourArmyId: ArmyId): boolean {
    return focus ? focus.rows.includes(ourArmyId) : ourAvailable.includes(ourArmyId);
  }

  function colEmphasized(theirArmyId: ArmyId): boolean {
    return focus ? focus.columns.includes(theirArmyId) : theirAvailable.includes(theirArmyId);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border-b border-white/10 bg-white/5 p-1.5 text-left text-white/60"> </th>
            {theirArmies.map((theirArmy) => (
              <th
                key={theirArmy.id}
                className={`border-b border-l border-white/10 bg-white/5 p-1.5 text-left font-medium ${
                  colEmphasized(theirArmy.id) ? "text-white" : "text-white/30"
                }`}
              >
                {theirArmy.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ourArmies.map((ourArmy) => (
            <tr key={ourArmy.id}>
              <th
                className={`border-b border-white/10 bg-white/5 p-1.5 text-left font-medium ${
                  rowEmphasized(ourArmy.id) ? "text-white" : "text-white/30"
                }`}
              >
                {ourArmy.name}
              </th>
              {theirArmies.map((theirArmy) => {
                const isPaired =
                  ourPairedWith[ourArmy.id] === theirArmy.id || theirPairedWith[theirArmy.id] === ourArmy.id;
                // A row/column belonging to an already-committed army is
                // locked to its one real pairing — every other cell in it
                // is no longer just de-emphasized, it's flat-out moot.
                const rowLocked = ourArmy.id in ourPairedWith;
                const colLocked = theirArmy.id in theirPairedWith;
                const hidden = !isPaired && (rowLocked || colLocked);
                const vivid = isPaired || (rowEmphasized(ourArmy.id) && colEmphasized(theirArmy.id));
                const estimate = estimates[cellKey(ourArmy.id, theirArmy.id)];

                return (
                  <td key={theirArmy.id} className="border-b border-l border-white/10 p-1.5 text-center">
                    <span
                      className={`mx-auto block size-4 rounded-sm transition-opacity ${
                        estimate ? BAND_SWATCH_CLASSES[estimate] : "border border-dashed border-white/20"
                      } ${hidden ? "opacity-0" : vivid ? "opacity-100" : "opacity-20"} ${
                        isPaired ? "ring-2 ring-white" : ""
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
