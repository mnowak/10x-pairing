import { useState } from "react";
import { BAND_SWATCH_CLASSES, COLOR_BANDS, type Estimate } from "@/lib/colorBands";
import type { MatrixGridData } from "@/lib/matrix";

interface Props {
  opponentId: string;
  grid: MatrixGridData;
}

function cellKey(teamArmyId: string, opponentArmyId: string): string {
  return `${teamArmyId}:${opponentArmyId}`;
}

export default function MatrixGrid({ grid }: Props) {
  const [estimates, setEstimates] = useState<Partial<Record<string, Estimate>>>(grid.estimates);
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});

  async function pickEstimate(teamArmyId: string, opponentArmyId: string, estimate: Estimate) {
    const key = cellKey(teamArmyId, opponentArmyId);
    setSavingCell(key);

    try {
      const response = await fetch("/api/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamArmyId, opponentArmyId, band: estimate }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        setCellErrors((prev) => ({ ...prev, [key]: data.error ?? "Failed to save" }));
        return;
      }

      setEstimates((prev) => ({ ...prev, [key]: estimate }));
      setCellErrors((prev) => {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
      setOpenCell(null);
    } catch {
      setCellErrors((prev) => ({ ...prev, [key]: "Network error — try again" }));
    } finally {
      setSavingCell(null);
    }
  }

  if (grid.ourArmies.length === 0 || grid.theirArmies.length === 0) {
    return (
      <p className="text-sm text-blue-100/60">
        Add armies to both your team and this opponent to start building the matrix.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {COLOR_BANDS.map((range) => (
          <span key={range.band} className="flex items-center gap-1.5 text-xs text-blue-100/70">
            <span className={`size-3 rounded-sm ${BAND_SWATCH_CLASSES[range.band]}`} />
            {range.band} ({range.min}-{range.max})
          </span>
        ))}
        <span className="mx-1 h-4 w-px bg-white/20" aria-hidden="true" />
        <span className="flex items-center gap-1.5 text-xs text-blue-100/70">
          <span className={`size-3 rounded-sm ${BAND_SWATCH_CLASSES.purple}`} />
          purple (unpredictable — deliberately not scored)
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-white/10 bg-white/5 p-2 text-left text-white/60"> </th>
              {grid.theirArmies.map((theirArmy) => (
                <th
                  key={theirArmy.id}
                  className="border-b border-l border-white/10 bg-white/5 p-2 text-left font-medium text-white"
                >
                  {theirArmy.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.ourArmies.map((ourArmy) => (
              <tr key={ourArmy.id}>
                <th className="border-b border-white/10 bg-white/5 p-2 text-left font-medium text-white">
                  {ourArmy.name}
                </th>
                {grid.theirArmies.map((theirArmy) => {
                  const key = cellKey(ourArmy.id, theirArmy.id);
                  const estimate = estimates[key];
                  const isOpen = openCell === key;
                  const isSaving = savingCell === key;
                  const error = cellErrors[key];

                  return (
                    <td key={theirArmy.id} className="border-b border-l border-white/10 p-2 text-center">
                      {isOpen ? (
                        <div className="flex items-center justify-center gap-1">
                          {COLOR_BANDS.map((range) => (
                            <button
                              key={range.band}
                              type="button"
                              disabled={isSaving}
                              aria-label={`Set ${range.band} (${range.min}-${range.max})`}
                              onClick={() => {
                                void pickEstimate(ourArmy.id, theirArmy.id, range.band);
                              }}
                              className={`size-5 rounded-sm ${BAND_SWATCH_CLASSES[range.band]} transition-transform hover:scale-110 disabled:opacity-50`}
                            />
                          ))}
                          <span className="mx-0.5 h-4 w-px bg-white/20" aria-hidden="true" />
                          <button
                            type="button"
                            disabled={isSaving}
                            aria-label="Set purple (unpredictable)"
                            onClick={() => {
                              void pickEstimate(ourArmy.id, theirArmy.id, "purple");
                            }}
                            className={`size-5 rounded-sm ${BAND_SWATCH_CLASSES.purple} transition-transform hover:scale-110 disabled:opacity-50`}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenCell(key);
                          }}
                          aria-label={estimate ? `Change estimate (currently ${estimate})` : "Set estimate"}
                          className={
                            estimate
                              ? `mx-auto size-6 rounded-sm ${BAND_SWATCH_CLASSES[estimate]}`
                              : "mx-auto size-6 rounded-sm border border-dashed border-white/30"
                          }
                        />
                      )}
                      {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
