import React, { useState } from "react";
import { Shield, Plus, Trash2 } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ServerError } from "@/components/forms/ServerError";
import { MAX_ROSTER_SIZE } from "@/lib/rosterLimits";

const DEFAULT_ARMY_FIELDS = MAX_ROSTER_SIZE;
const MAX_NAME_LENGTH = 60;

const armyInputClasses =
  "w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors";

interface Props {
  serverError?: string | null;
}

export default function CreateTeamForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [armies, setArmies] = useState<string[]>(() => Array.from({ length: DEFAULT_ARMY_FIELDS }, () => ""));
  const [errors, setErrors] = useState<{ name?: string; armies?: string }>({});

  function updateArmy(index: number, value: string) {
    setArmies((prev) => prev.map((army, i) => (i === index ? value : army)));
    if (errors.armies) setErrors((prev) => ({ ...prev, armies: undefined }));
  }

  function addArmyField() {
    setArmies((prev) => (prev.length < MAX_ROSTER_SIZE ? [...prev, ""] : prev));
  }

  function removeArmyField(index: number) {
    setArmies((prev) => prev.filter((_, i) => i !== index));
  }

  function validate() {
    const next: typeof errors = {};

    if (!name.trim()) {
      next.name = "Team name is required";
    }

    const filled = armies.map((army) => army.trim()).filter((army) => army.length > 0);
    const seen = new Set<string>();
    for (const army of filled) {
      if (seen.has(army)) {
        next.armies = `"${army}" is entered more than once`;
        break;
      }
      seen.add(army);
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/teams" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Team name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="My Team"
        maxLength={MAX_NAME_LENGTH}
        error={errors.name}
        icon={<Shield className="size-4" />}
      />

      <div>
        <p className="mb-1 block text-sm text-blue-100/80">
          Armies ({armies.length}/{MAX_ROSTER_SIZE})
        </p>
        <div className="space-y-2">
          {armies.map((army, index) => (
            <div key={index} className="flex gap-2">
              <input
                id={`army-${index}`}
                name="army"
                value={army}
                onChange={(e) => {
                  updateArmy(index, e.target.value);
                }}
                placeholder={`Army ${index + 1}`}
                maxLength={MAX_NAME_LENGTH}
                className={armyInputClasses}
              />
              {armies.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    removeArmyField(index);
                  }}
                  aria-label={`Remove army ${index + 1}`}
                  className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 text-white/60 transition-colors hover:bg-white/20"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {armies.length < MAX_ROSTER_SIZE && (
          <button
            type="button"
            onClick={addArmyField}
            className="mt-2 flex items-center gap-1 text-sm text-purple-300 hover:underline"
          >
            <Plus className="size-4" /> Add army
          </button>
        )}
        {errors.armies && <p className="mt-1 text-xs text-red-300">{errors.armies}</p>}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Creating team..." icon={<Shield className="size-4" />}>
        Create team
      </SubmitButton>
    </form>
  );
}
