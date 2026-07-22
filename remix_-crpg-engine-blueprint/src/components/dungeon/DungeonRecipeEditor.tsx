import React, { useEffect, useState } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import type { DungeonRecipeDef, DungeonWeightedRef } from "../../dungeonGen/types";
import type { GamePackage } from "../../schema/game";

const inputClass = "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-sky-500";

export interface DungeonRecipeEditorProps {
  recipe: DungeonRecipeDef;
  gamePackage: GamePackage;
  dirty: boolean;
  issues?: string[];
  onChange: (recipe: DungeonRecipeDef) => void;
  onSave: () => void;
  onNew: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function DungeonRecipeEditor({
  recipe,
  gamePackage,
  dirty,
  issues = [],
  onChange,
  onSave,
  onNew,
  onDuplicate,
  onDelete,
}: DungeonRecipeEditorProps) {
  const patch = (updates: Partial<DungeonRecipeDef>) => onChange({ ...recipe, ...updates });
  const patchScale = (updates: Partial<DungeonRecipeDef["scale"]>) => patch({ scale: { ...recipe.scale, ...updates } });
  const patchTopology = (updates: Partial<DungeonRecipeDef["topology"]>) => patch({ topology: { ...recipe.topology, ...updates } });
  const patchArchitecture = (updates: Partial<DungeonRecipeDef["architecture"]>) => patch({ architecture: { ...recipe.architecture, ...updates } });
  const patchPopulation = (updates: Partial<DungeonRecipeDef["population"]>) => patch({ population: { ...recipe.population, ...updates } });
  const patchDifficulty = (updates: Partial<DungeonRecipeDef["difficulty"]>) => patch({ difficulty: { ...recipe.difficulty, ...updates } });
  const patchConstraints = (updates: Partial<DungeonRecipeDef["constraints"]>) => patch({ constraints: { ...recipe.constraints, ...updates } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <button onClick={onNew} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"><Plus className="h-4 w-4" /> New</button>
        <button onClick={onDuplicate} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"><Copy className="h-4 w-4" /> Duplicate</button>
        <button onClick={onDelete} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> Delete</button>
        <button
          onClick={onSave}
          disabled={!dirty || issues.length > 0}
          className="ml-auto flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" /> Save recipe
        </button>
      </div>

      {issues.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <h3 className="font-semibold">Recipe validation</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-100/80">
            {issues.map((issue, index) => <li key={index}>{issue}</li>)}
          </ul>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card title="Identity and output" description="The saved, reproducible authoring identity for this dungeon.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recipe ID"><input className={inputClass} value={recipe.id} onChange={(event) => patch({ id: event.target.value })} /></Field>
            <Field label="Name"><input className={inputClass} value={recipe.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
            <Field label="Seed"><input className={inputClass} value={recipe.seed} onChange={(event) => patch({ seed: event.target.value })} /></Field>
            <Field label="Version"><input className={inputClass} value={recipe.version} onChange={(event) => patch({ version: event.target.value })} /></Field>
            <Field label="Theme">
              <select className={inputClass} value={recipe.themeId} onChange={(event) => patch({ themeId: event.target.value })}>
                {gamePackage.dungeon_themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
              </select>
            </Field>
            <Field label="Output">
              <select
                className={inputClass}
                value={recipe.outputMode}
                onChange={(event) => {
                  const outputMode = event.target.value as DungeonRecipeDef["outputMode"];
                  patch({
                    outputMode,
                    scale: outputMode === "single_map"
                      ? { ...recipe.scale, floorCount: { min: 1, max: 1 } }
                      : recipe.scale,
                  });
                }}
              >
                <option value="single_map">Single map</option>
                <option value="multi_map_floors">Linked floor maps</option>
              </select>
            </Field>
          </div>
          <Field label="Description"><textarea className={`${inputClass} min-h-20 resize-y`} value={recipe.description || ""} onChange={(event) => patch({ description: event.target.value || undefined })} /></Field>
        </Card>

        <Card title="Scale" description="Authored macro-grid dimensions; the runtime performs 3×3 fine expansion.">
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeField label="Floors" value={recipe.scale.floorCount} min={1} max={3} disabled={recipe.outputMode === "single_map"} onChange={(floorCount) => patchScale({ floorCount })} />
            <RangeField label="Rooms" value={recipe.scale.roomCount} min={2} onChange={(roomCount) => patchScale({ roomCount })} />
            <RangeField label="Room width" value={recipe.scale.roomWidth} min={3} onChange={(roomWidth) => patchScale({ roomWidth })} />
            <RangeField label="Room depth" value={recipe.scale.roomDepth} min={3} onChange={(roomDepth) => patchScale({ roomDepth })} />
            <NumberField label="Map width" value={recipe.scale.floorMapWidth} min={12} onChange={(floorMapWidth) => patchScale({ floorMapWidth })} />
            <NumberField label="Map depth" value={recipe.scale.floorMapDepth} min={12} onChange={(floorMapDepth) => patchScale({ floorMapDepth })} />
            <NumberField label="Floor height step" value={recipe.scale.floorHeightStep ?? 3} min={0.1} step={0.5} onChange={(floorHeightStep) => patchScale({ floorHeightStep })} />
          </div>
        </Card>

        <Card title="Topology" description="Graph constraints are solved before any room geometry is placed.">
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeField label="Critical path" value={recipe.topology.criticalPathLength} min={2} onChange={(criticalPathLength) => patchTopology({ criticalPathLength })} />
            <RangeField label="Branches" value={recipe.topology.branchCount} min={0} onChange={(branchCount) => patchTopology({ branchCount })} />
            <RangeField label="Branch length" value={recipe.topology.branchLength} min={1} onChange={(branchLength) => patchTopology({ branchLength })} />
            <RangeField label="Loops" value={recipe.topology.loopCount} min={0} onChange={(loopCount) => patchTopology({ loopCount })} />
            <RangeField label="Secrets" value={recipe.topology.secretCount} min={0} disabled={recipe.architecture.connectionMode === "open_only"} onChange={(secretCount) => patchTopology({ secretCount })} />
            <RangeField label="Locks" value={recipe.topology.lockCount} min={0} disabled={recipe.architecture.connectionMode === "open_only"} onChange={(lockCount) => patchTopology({ lockCount })} />
            <RangeField label="Optional objectives" value={recipe.topology.optionalObjectiveCount || { min: 0, max: 0 }} min={0} onChange={(optionalObjectiveCount) => patchTopology({ optionalObjectiveCount })} />
          </div>
          <Toggle label="Require a valid return path" checked={recipe.topology.requireReturnPath} onChange={(requireReturnPath) => patchTopology({ requireReturnPath })} />
        </Card>

        <Card title="Architecture" description="Room sources, clearances, corridors, and legal vertical transitions.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Connection policy">
              <select
                className={inputClass}
                value={recipe.architecture.connectionMode}
                onChange={(event) => {
                  const connectionMode = event.target.value as DungeonRecipeDef["architecture"]["connectionMode"];
                  patch({
                    architecture: { ...recipe.architecture, connectionMode },
                    topology: connectionMode === "open_only"
                      ? {
                          ...recipe.topology,
                          lockCount: { min: 0, max: 0 },
                          secretCount: { min: 0, max: 0 },
                        }
                      : recipe.topology,
                  });
                }}
              >
                <option value="open_only">Open passages only</option>
                <option value="mixed_doors">Doors, locks, and secrets</option>
              </select>
            </Field>
            <Field label="Layout style">
              <select
                className={inputClass}
                value={recipe.architecture.layoutStyle}
                onChange={(event) => patchArchitecture({
                  layoutStyle: event.target.value as DungeonRecipeDef["architecture"]["layoutStyle"],
                })}
              >
                <option value="directional_crawl">Directional crawl</option>
                <option value="organic">Organic</option>
              </select>
            </Field>
            <RangeField label="Corridor width" value={recipe.architecture.corridorWidth} min={1} onChange={(corridorWidth) => patchArchitecture({ corridorWidth })} />
            <NumberField label="Room padding" value={recipe.architecture.roomPadding} min={0} onChange={(roomPadding) => patchArchitecture({ roomPadding })} />
            <Field label="Boundary style"><input className={inputClass} value={recipe.architecture.boundaryStyle} onChange={(event) => patchArchitecture({ boundaryStyle: event.target.value })} /></Field>
          </div>
          <Toggle label="Allow vertical transitions" checked={recipe.architecture.allowVerticalTransitions} onChange={(allowVerticalTransitions) => patchArchitecture({ allowVerticalTransitions })} />
          <Toggle label="Allow diagonal corridor routing" checked={recipe.architecture.allowDiagonalCorridors} onChange={(allowDiagonalCorridors) => patchArchitecture({ allowDiagonalCorridors })} />
          <div>
            <div className="text-xs font-medium text-neutral-400">Vertical transition types</div>
            <div className="mt-2 flex flex-wrap gap-3">
              {(["stairs", "ladder", "lift", "shaft", "portal"] as const).map((kind) => (
                <label key={kind} className="flex items-center gap-1.5 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={recipe.architecture.verticalTransitionTypes.includes(kind)}
                    onChange={(event) => patchArchitecture({
                      verticalTransitionTypes: event.target.checked
                        ? Array.from(new Set([...recipe.architecture.verticalTransitionTypes, kind]))
                        : recipe.architecture.verticalTransitionTypes.filter((entry) => entry !== kind),
                    })}
                  />
                  {kind}
                </label>
              ))}
            </div>
          </div>
          <WeightedPoolEditor
            label="Room archetype pool"
            value={recipe.architecture.roomArchetypePool}
            candidates={gamePackage.dungeon_room_archetypes.map((entry) => ({ id: entry.id, label: entry.name }))}
            onChange={(roomArchetypePool) => patchArchitecture({ roomArchetypePool })}
          />
          <IdListField label="Procedural builders" value={recipe.architecture.proceduralRoomBuilderPool.map((entry) => entry.id)} onChange={(ids) => patchArchitecture({ proceduralRoomBuilderPool: ids.map((id) => ({ id, weight: 1 })) })} />
          <IdListField label="Room templates" value={recipe.architecture.roomTemplatePool.map((entry) => entry.id)} onChange={(ids) => patchArchitecture({ roomTemplatePool: ids.map((id) => ({ id, weight: 1 })) })} />
        </Card>

        <Card title="Population profiles" description="Population references existing authored pools and ordinary content records.">
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileSelect label="Encounter" value={recipe.population.encounterProfileId} entries={gamePackage.dungeon_encounter_profiles} onChange={(encounterProfileId) => patchPopulation({ encounterProfileId })} />
            <ProfileSelect label="Hazard" value={recipe.population.hazardProfileId} entries={gamePackage.dungeon_hazard_profiles} onChange={(hazardProfileId) => patchPopulation({ hazardProfileId })} />
            <ProfileSelect label="Reward" value={recipe.population.rewardProfileId} entries={gamePackage.dungeon_reward_profiles} onChange={(rewardProfileId) => patchPopulation({ rewardProfileId })} />
            <ProfileSelect label="Narrative" value={recipe.population.narrativeProfileId} entries={gamePackage.dungeon_narrative_profiles} onChange={(narrativeProfileId) => patchPopulation({ narrativeProfileId })} />
            <Field label="Starting light">
              <select
                className={inputClass}
                value={recipe.population.startingLightItemId || ""}
                onChange={(event) => patchPopulation({ startingLightItemId: event.target.value || undefined })}
              >
                <option value="">None</option>
                {gamePackage.items
                  .filter((item) => Boolean(item.light_source))
                  .map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select>
            </Field>
            <Field label="Infrastructure profile"><input className={inputClass} value={recipe.population.infrastructureProfileId || ""} onChange={(event) => patchPopulation({ infrastructureProfileId: event.target.value || undefined })} /></Field>
            <Field label="Ecology profile"><input className={inputClass} value={recipe.population.ecologyProfileId || ""} onChange={(event) => patchPopulation({ ecologyProfileId: event.target.value || undefined })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <NumberField label="Base threat" value={recipe.difficulty.baseThreat} min={0} onChange={(baseThreat) => patchDifficulty({ baseThreat })} />
            <NumberField label="Threat growth" value={recipe.difficulty.threatGrowthByDepth} min={0} step={0.1} onChange={(threatGrowthByDepth) => patchDifficulty({ threatGrowthByDepth })} />
            <NumberField label="Branch threat ×" value={recipe.difficulty.optionalBranchThreatMultiplier} min={0} step={0.1} onChange={(optionalBranchThreatMultiplier) => patchDifficulty({ optionalBranchThreatMultiplier })} />
            <NumberField label="Resource budget" value={recipe.difficulty.resourceBudget} min={0} onChange={(resourceBudget) => patchDifficulty({ resourceBudget })} />
            <NumberField label="Hazard budget" value={recipe.difficulty.hazardBudget} min={0} onChange={(hazardBudget) => patchDifficulty({ hazardBudget })} />
            <NumberField label="Complexity budget" value={recipe.difficulty.complexityBudget} min={0} onChange={(complexityBudget) => patchDifficulty({ complexityBudget })} />
          </div>
        </Card>

        <Card title="Constraints and retry bounds" description="Search is deterministic and bounded; failures remain visible.">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Generation attempts" value={recipe.constraints.maxGenerationAttempts} min={1} onChange={(maxGenerationAttempts) => patchConstraints({ maxGenerationAttempts })} />
            <NumberField label="Embedding backtracks" value={recipe.constraints.maxEmbeddingBacktracks} min={0} onChange={(maxEmbeddingBacktracks) => patchConstraints({ maxEmbeddingBacktracks })} />
          </div>
          <IdListField label="Required archetypes" value={recipe.constraints.requiredRoomArchetypes} onChange={(requiredRoomArchetypes) => patchConstraints({ requiredRoomArchetypes })} />
          <IdListField label="Permitted verbs" value={recipe.constraints.permittedVerbs} onChange={(permittedVerbs) => patchConstraints({ permittedVerbs })} />
          <IdListField label="Permitted chemistry materials" value={recipe.constraints.permittedChemistryMaterials} onChange={(permittedChemistryMaterials) => patchConstraints({ permittedChemistryMaterials })} />
          <IdListField label="Required tags" value={recipe.constraints.requiredTags} onChange={(requiredTags) => patchConstraints({ requiredTags })} />
        </Card>
      </section>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <header>
        <h3 className="font-semibold text-neutral-100">{title}</h3>
        <p className="mt-1 text-xs text-neutral-500">{description}</p>
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium text-neutral-400">{label}</span>{children}</label>;
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" className={inputClass} value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function RangeField({ label, value, min, max, disabled = false, onChange }: { label: string; value: { min: number; max: number }; min?: number; max?: number; disabled?: boolean; onChange: (value: { min: number; max: number }) => void }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" aria-label={`${label} minimum`} className={inputClass} value={value.min} min={min} max={max} disabled={disabled} onChange={(event) => onChange({ ...value, min: Number(event.target.value) })} />
        <input type="number" aria-label={`${label} maximum`} className={inputClass} value={value.max} min={min} max={max} disabled={disabled} onChange={(event) => onChange({ ...value, max: Number(event.target.value) })} />
      </div>
    </Field>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}
    </label>
  );
}

function ProfileSelect({ label, value, entries, onChange }: { label: string; value?: string; entries: Array<{ id: string; name: string }>; onChange: (value?: string) => void }) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value || ""} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">None</option>
        {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </Field>
  );
}

function WeightedPoolEditor({ label, value, candidates, onChange }: { label: string; value: DungeonWeightedRef[]; candidates: Array<{ id: string; label: string }>; onChange: (value: DungeonWeightedRef[]) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">{label}</span>
        <button
          onClick={() => {
            const unused = candidates.find((candidate) => !value.some((entry) => entry.id === candidate.id));
            if (unused) onChange([...value, { id: unused.id, weight: 1 }]);
          }}
          className="rounded px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/10"
        >
          + Add
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {value.map((entry, index) => (
          <div key={`${entry.id}:${index}`} className="grid grid-cols-[minmax(0,1fr)_80px_auto] gap-2">
            <select className={inputClass} value={entry.id} onChange={(event) => onChange(value.map((current, currentIndex) => currentIndex === index ? { ...current, id: event.target.value } : current))}>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
            </select>
            <input type="number" min={0.01} step={0.1} className={inputClass} value={entry.weight} onChange={(event) => onChange(value.map((current, currentIndex) => currentIndex === index ? { ...current, weight: Number(event.target.value) } : current))} />
            <button onClick={() => onChange(value.filter((_, currentIndex) => currentIndex !== index))} className="rounded px-2 text-red-300 hover:bg-red-500/10" aria-label={`Remove ${entry.id}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function IdListField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => setText(value.join(", ")), [value]);
  return (
    <Field label={label}>
      <input
        className={inputClass}
        value={text}
        placeholder="comma-separated IDs"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onChange(Array.from(new Set(text.split(",").map((entry) => entry.trim()).filter(Boolean))))}
      />
    </Field>
  );
}
