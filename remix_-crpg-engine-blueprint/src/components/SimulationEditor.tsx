import React, { useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Cloud,
  Droplets,
  EyeOff,
  Flame,
  Hammer,
  Layers3,
  ListTodo,
  PackageSearch,
  ShieldAlert,
  SunMedium,
  Volume2,
  Wind,
} from "lucide-react";
import {
  IMMERSIVE_GLOBAL_VERBS,
  IMMERSIVE_REACTION_RULES,
  createGameObjectModelSnapshotFromV1,
  createImmersiveCombatTacticalSnapshotFromV1,
  createImmersivePerceptionSnapshotFromV1,
  createImmersiveSpatialInventorySnapshotFromSave,
  createImmersiveStage2SnapshotFromV1,
  createSimulationSnapshotFromV1,
  evaluateImmersiveWorldStateForSave,
} from "../engine-core";
import type { SimulationDebugOverlay } from "../engine-core";
import { useEngineStore } from "../store/engineStore";
import { usePlayStore } from "../store/playStore";

const overlayIcon = (id: string) => {
  if (id === "surfaces") return <Droplets className="w-4 h-4 text-cyan-300" />;
  if (id === "traces") return <Activity className="w-4 h-4 text-fuchsia-300" />;
  if (id === "residues") return <Droplets className="w-4 h-4 text-emerald-300" />;
  if (id === "cleaned_traces") return <Hammer className="w-4 h-4 text-sky-300" />;
  if (id === "hazards") return <Flame className="w-4 h-4 text-rose-300" />;
  if (id === "fire") return <Flame className="w-4 h-4 text-orange-300" />;
  if (id === "smoke") return <Cloud className="w-4 h-4 text-zinc-300" />;
  if (id === "light") return <SunMedium className="w-4 h-4 text-yellow-300" />;
  if (id === "sound") return <Volume2 className="w-4 h-4 text-blue-300" />;
  if (id === "npc_tasks") return <ListTodo className="w-4 h-4 text-teal-300" />;
  if (id === "simulation_processes") return <Hammer className="w-4 h-4 text-indigo-300" />;
  if (id === "infection") return <Wind className="w-4 h-4 text-lime-300" />;
  if (id === "collision") return <ShieldAlert className="w-4 h-4 text-amber-300" />;
  if (id === "line_of_sight") return <EyeOff className="w-4 h-4 text-purple-300" />;
  if (id === "objects") return <Boxes className="w-4 h-4 text-orange-300" />;
  if (id === "containers") return <PackageSearch className="w-4 h-4 text-emerald-300" />;
  if (id === "conditions") return <Hammer className="w-4 h-4 text-yellow-300" />;
  return <Layers3 className="w-4 h-4 text-neutral-300" />;
};

export function SimulationEditor() {
  const { gamePackage } = useEngineStore();
  const { saveData } = usePlayStore();
  const initialMapId = saveData?.current_map_id || gamePackage.metadata.start_map_id || gamePackage.maps[0]?.id || "";
  const [selectedMapId, setSelectedMapId] = useState(initialMapId);
  const snapshot = useMemo(
    () => createSimulationSnapshotFromV1(gamePackage, saveData || undefined, selectedMapId),
    [gamePackage, saveData, selectedMapId],
  );
  const objectSnapshot = useMemo(
    () => saveData ? createGameObjectModelSnapshotFromV1(gamePackage, saveData) : null,
    [gamePackage, saveData],
  );
  const stage2Snapshot = useMemo(
    () => saveData ? createImmersiveStage2SnapshotFromV1(gamePackage, saveData, selectedMapId) : null,
    [gamePackage, saveData, selectedMapId],
  );
  const stage4Snapshot = useMemo(
    () => saveData ? createImmersivePerceptionSnapshotFromV1(gamePackage, saveData, selectedMapId) : null,
    [gamePackage, saveData, selectedMapId],
  );
  const stage6Snapshot = useMemo(
    () => saveData ? createImmersiveCombatTacticalSnapshotFromV1(gamePackage, saveData, selectedMapId) : null,
    [gamePackage, saveData, selectedMapId],
  );
  const stage7Inventory = useMemo(
    () => saveData ? createImmersiveSpatialInventorySnapshotFromSave(gamePackage, saveData) : null,
    [gamePackage, saveData],
  );
  const stage7WorldState = useMemo(() => {
    if (!saveData) return null;
    const selectedMap = gamePackage.maps.find((map) => map.id === selectedMapId);
    const fallbackCell = selectedMap?.cells[0]
      ? [selectedMap.cells[0].x, selectedMap.cells[0].z] as [number, number]
      : saveData.player.cell;
    const currentMapId = saveData.current_map_id || gamePackage.metadata.start_map_id;
    const cell = currentMapId === selectedMapId ? saveData.player.cell : fallbackCell;
    return evaluateImmersiveWorldStateForSave(gamePackage, saveData, { mapId: selectedMapId, cell });
  }, [gamePackage, saveData, selectedMapId]);
  const activeOverlays = snapshot.overlays.filter((overlay) => overlay.count > 0);
  const objectPartCount = objectSnapshot?.objects.reduce((sum, object) => sum + object.parts.length, 0) || 0;
  const recentReactionFacts = (saveData?.world_facts || [])
    .filter((fact) => fact.action_type === "immersive_reaction_resolved")
    .slice(-10)
    .reverse();
  const globalVerbFactCount = (saveData?.world_facts || []).filter((fact) => fact.action_type === "immersive_global_verb_applied").length;
  const recentGlobalVerbFacts = (saveData?.world_facts || [])
    .filter((fact) => fact.action_type === "immersive_global_verb_applied")
    .slice(-10)
    .reverse();
  const worldStateFactCount = (saveData?.world_facts || []).filter((fact) => fact.action_type === "immersive_world_state_evaluated").length;
  const recentWorldStateFacts = (saveData?.world_facts || [])
    .filter((fact) => fact.action_type === "immersive_world_state_evaluated")
    .slice(-10)
    .reverse();

  return (
    <div className="h-full w-full bg-neutral-950 text-neutral-100 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-6">
        <header className="flex flex-col gap-3 border-b border-neutral-800 pb-5">
          <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-emerald-300" />
            <div>
              <h2 className="text-xl font-semibold text-white">Simulation Layer</h2>
              <p className="text-sm text-neutral-400">S8 grid snapshot with normalized cells, layered surfaces, residue transfers, cleaned traces, fire, smoke, light, propagated sound, NPC tasks, simulation processes, regional LOD tiers, semantic evidence hooks, blockers, items, material profiles, condition records, and manipulation affordances.</p>
            </div>
          </div>
          <label className="block text-xs text-neutral-400 max-w-sm">
            <span className="block mb-1">Map</span>
            <select
              className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              value={selectedMapId}
              onChange={(event) => setSelectedMapId(event.target.value)}
            >
              {gamePackage.maps.map((map) => (
                <option key={map.id} value={map.id}>{map.display_name}</option>
              ))}
            </select>
          </label>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active Cells" value={snapshot.totals.active_cells} />
          <Metric label="Surface Cells" value={snapshot.totals.surface_cells} />
          <Metric label="Movement Blockers" value={snapshot.totals.blocked_cells} />
          <Metric label="LOS Blockers" value={snapshot.totals.los_blocking_cells} />
          <Metric label="Object Footprints" value={snapshot.totals.object_footprint_cells} />
          <Metric label="Containers" value={snapshot.totals.container_cells} />
          <Metric label="Items" value={snapshot.totals.item_cells} />
          <Metric label="Condition Records" value={snapshot.totals.condition_records} />
          <Metric label="Material Profiles" value={snapshot.totals.material_profiles} />
          <Metric label="Solo Movables" value={snapshot.totals.movable_objects} />
          <Metric label="Co-op Required" value={snapshot.totals.cooperative_objects} />
          <Metric label="Max Push Cost" value={snapshot.totals.max_push_energy_cost} />
          <Metric label="Trace Cells" value={snapshot.totals.trace_cells} />
          <Metric label="Surface Layers" value={snapshot.totals.surface_layers} />
          <Metric label="Residue Cells" value={snapshot.totals.residue_cells} />
          <Metric label="Cleaned Traces" value={snapshot.totals.cleaned_trace_cells} />
          <Metric label="Fire Cells" value={snapshot.totals.fire_cells} />
          <Metric label="Smoke Cells" value={snapshot.totals.smoke_cells} />
          <Metric label="Light Cells" value={snapshot.totals.light_cells} />
          <Metric label="Sound Cells" value={snapshot.totals.sound_cells} />
          <Metric label="Env Fields" value={snapshot.totals.environment_fields} />
          <Metric label="NPC Tasks" value={snapshot.totals.npc_tasks} />
          <Metric label="Processes" value={snapshot.totals.simulation_processes} />
          <Metric label="Regions" value={snapshot.totals.regional_aggregates} />
          <Metric label="Exact Regions" value={snapshot.totals.exact_regions} />
          <Metric label="Nearby Regions" value={snapshot.totals.nearby_regions} />
          <Metric label="Aggregate Regions" value={snapshot.totals.aggregate_regions} />
          <Metric label="Dormant Regions" value={snapshot.totals.dormant_regions} />
          <Metric label="Object Blueprints" value={objectSnapshot?.blueprints.length || 0} />
          <Metric label="Object Runtimes" value={objectSnapshot?.objects.length || 0} />
          <Metric label="Resolved Parts" value={objectPartCount} />
          <Metric label="Stage 2 Hot Cells" value={stage2Snapshot?.tile_layers.totals.temperature_cells || 0} />
          <Metric label="Stage 3 Rules" value={IMMERSIVE_REACTION_RULES.length} />
          <Metric label="Stage 4 Stimuli" value={stage4Snapshot?.totals.stimuli || 0} />
          <Metric label="Stage 4 Alerts" value={stage4Snapshot?.totals.alerted_actors || 0} />
          <Metric label="Stage 5 Verbs" value={IMMERSIVE_GLOBAL_VERBS.length} />
          <Metric label="Stage 5 Facts" value={globalVerbFactCount} />
          <Metric label="Stage 6 Actors" value={stage6Snapshot?.totals.actors || 0} />
          <Metric label="Stage 6 Intents" value={stage6Snapshot?.totals.telegraphed_intents || 0} />
          <Metric label="Stage 7 Items" value={stage7Inventory?.items.length || 0} />
          <Metric label="Stage 7 Denials" value={stage7WorldState?.denials.length || 0} />
          <Metric label="Semantic Obs" value={snapshot.totals.semantic_observations} />
          <Metric label="Evidence Links" value={snapshot.totals.semantic_evidence_links} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-emerald-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Debug Overlays</h3>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {snapshot.overlays.map((overlay) => (
                <OverlaySummary key={overlay.id} overlay={overlay} />
              ))}
            </div>
          </div>

          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Snapshot Source</h3>
            </div>
            <div className="p-4 space-y-3 text-sm text-neutral-300">
              <p><span className="text-neutral-500">Map:</span> {snapshot.map_label}</p>
              <p><span className="text-neutral-500">Resolution:</span> {snapshot.resolution}</p>
              <p><span className="text-neutral-500">Tick:</span> {snapshot.generated_at_tick}</p>
              <p><span className="text-neutral-500">Save map:</span> {snapshot.source.save_map_id || "none"}</p>
              <p><span className="text-neutral-500">Save delta:</span> {snapshot.source.delta_applied ? "yes" : "no"}</p>
              <p><span className="text-neutral-500">Active overlays:</span> {activeOverlays.length}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-orange-300" />
              <h3 className="text-sm font-semibold text-neutral-200">GameObject / Parts</h3>
            </div>
            <div className="p-4 space-y-3">
              {(objectSnapshot?.objects || []).slice(0, 8).map((object) => (
                <div key={object.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-100">{object.display_name || object.template_id}</p>
                    <span className="ml-auto text-[11px] text-neutral-500">{object.kind}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{object.blueprint_id} · {object.parts.length} parts</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {object.parts.slice(0, 6).map((part) => (
                      <span key={`${object.id}:${part.id}`} className="rounded-sm border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300">
                        {part.type}
                      </span>
                    ))}
                    {object.parts.length > 6 && (
                      <span className="rounded-sm border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-500">
                        +{object.parts.length - 6}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!objectSnapshot && <p className="text-sm text-neutral-500">Start or load Play Mode to inspect runtime objects.</p>}
            </div>
          </div>

          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-emerald-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 2 Tile / Scheduler</h3>
            </div>
            <div className="p-4 space-y-3 text-sm text-neutral-300">
              <p><span className="text-neutral-500">Scheduler tick:</span> {stage2Snapshot?.scheduler.tick ?? snapshot.generated_at_tick}</p>
              <p><span className="text-neutral-500">Actors:</span> {stage2Snapshot?.scheduler.actors.length || 0}</p>
              <p><span className="text-neutral-500">Hot/cold cells:</span> {stage2Snapshot?.tile_layers.totals.temperature_cells || 0}</p>
              <p><span className="text-neutral-500">Liquid cells:</span> {stage2Snapshot?.tile_layers.totals.liquid_cells || 0}</p>
              <p><span className="text-neutral-500">Gas cells:</span> {stage2Snapshot?.tile_layers.totals.gas_cells || 0}</p>
              <p><span className="text-neutral-500">Max temp:</span> {stage2Snapshot?.tile_layers.totals.max_temperature ?? 25}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(stage2Snapshot?.tile_layers.cells || [])
                  .filter((cell) => cell.temperature !== cell.ambient_temperature || cell.liquid || cell.gas)
                  .slice(0, 24)
                  .map((cell) => (
                    <span key={`stage2:${cell.cell[0]}:${cell.cell[1]}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                      {cell.cell[0]},{cell.cell[1]} · {Math.round(cell.temperature)} deg · {cell.liquid?.kind || cell.gas?.kind || "field"}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 3 Reactions</h3>
            </div>
            <div className="p-4 space-y-3">
              {IMMERSIVE_REACTION_RULES.map((rule) => (
                <div key={rule.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-100">{rule.id}</p>
                    <span className="ml-auto text-[11px] text-neutral-500">p{rule.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {rule.inputs.join(" + ")} {"->"} {rule.outputs.join(" + ")}
                  </p>
                  {!!rule.status_effects?.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rule.status_effects.map((effect) => (
                        <span key={`${rule.id}:${effect.status_id}`} className="rounded-sm border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300">
                          {effect.status_id} {effect.magnitude}/{effect.duration}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 4 Perception</h3>
            </div>
            <div className="p-4 space-y-4 text-sm text-neutral-300">
              <div className="grid grid-cols-2 gap-2">
                <InlineStat label="Stimuli" value={stage4Snapshot?.totals.stimuli || 0} />
                <InlineStat label="Alerted" value={stage4Snapshot?.totals.alerted_actors || 0} />
                <InlineStat label="Searching" value={stage4Snapshot?.totals.searching || 0} />
                <InlineStat label="Combat" value={stage4Snapshot?.totals.combat || 0} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage4Snapshot?.alerts || []).slice(0, 24).map((alert) => (
                  <span key={`alert:${alert.actor_id}:${alert.stimulus.kind}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {alert.entity_id} · {alert.alertness} · {alert.stimulus.kind} {alert.score.toFixed(2)}
                  </span>
                ))}
                {!!stage4Snapshot && stage4Snapshot.alerts.length === 0 && (
                  <span className="text-sm text-neutral-500">No alertness records for this map.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage4Snapshot?.stimuli || []).slice(0, 24).map((stimulus) => (
                  <span key={`stimulus:${stimulus.kind}:${stimulus.cell[0]}:${stimulus.cell[1]}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {stimulus.kind} {stimulus.cell[0]},{stimulus.cell[1]} r{stimulus.radius}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <Hammer className="w-4 h-4 text-yellow-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 5 Global Verbs</h3>
            </div>
            <div className="p-4 space-y-4 text-sm text-neutral-300">
              <div className="grid grid-cols-2 gap-2">
                <InlineStat label="Verbs" value={IMMERSIVE_GLOBAL_VERBS.length} />
                <InlineStat label="Facts" value={globalVerbFactCount} />
              </div>
              <div className="flex flex-wrap gap-2">
                {IMMERSIVE_GLOBAL_VERBS.map((verb) => (
                  <span key={`verb:${verb}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {verb}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {recentGlobalVerbFacts.map((fact) => (
                  <span key={fact.id} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {String(fact.direct_consequences?.verb || "verb")} · {formatCell(fact.cells?.[0])} · t{fact.tick}
                  </span>
                ))}
                {!recentGlobalVerbFacts.length && (
                  <span className="text-sm text-neutral-500">No global verb facts recorded yet.</span>
                )}
              </div>
            </div>
          </div>

          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 6 Tactical Combat</h3>
            </div>
            <div className="p-4 space-y-4 text-sm text-neutral-300">
              <div className="grid grid-cols-2 gap-2">
                <InlineStat label="Actors" value={stage6Snapshot?.totals.actors || 0} />
                <InlineStat label="Cover" value={stage6Snapshot?.totals.cover_edges || 0} />
                <InlineStat label="Overwatch" value={stage6Snapshot?.totals.overwatch_zones || 0} />
                <InlineStat label="Intents" value={stage6Snapshot?.totals.telegraphed_intents || 0} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage6Snapshot?.actors || []).slice(0, 24).map((actor) => (
                  <span key={`stage6actor:${actor.actor_id}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {actor.actor_id} · {actor.team} · hp {actor.hp} · {formatCell(actor.cell)}
                  </span>
                ))}
                {!!stage6Snapshot && stage6Snapshot.actors.length === 0 && (
                  <span className="text-sm text-neutral-500">No tactical actors on this map.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage6Snapshot?.intents || []).slice(0, 24).map((intent) => (
                  <span key={`intent:${intent.actor_id}:${intent.target_actor_id}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {intent.actor_id} {"->"} {intent.target_actor_id || "area"} · {intent.action_type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 7 Spatial Inventory</h3>
            </div>
            <div className="p-4 space-y-4 text-sm text-neutral-300">
              <div className="grid grid-cols-2 gap-2">
                <InlineStat label="Items" value={stage7Inventory?.items.length || 0} />
                <InlineStat label="Weight" value={stage7Inventory ? `${stage7Inventory.total_weight_kg.toFixed(1)} kg` : "0 kg"} />
                <InlineStat label="AP Penalty" value={stage7Inventory?.ap_penalty || 0} />
                <InlineStat label="Overflow" value={stage7Inventory?.overflow_slots || 0} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage7Inventory?.items || []).slice(0, 24).map((item) => (
                  <span key={`stage7item:${item.item_id}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {item.display_name} x{item.count} · {item.total_slots} slots · {item.total_weight_kg.toFixed(1)} kg
                  </span>
                ))}
                {!!stage7Inventory && stage7Inventory.items.length === 0 && (
                  <span className="text-sm text-neutral-500">Inventory is empty.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage7Inventory?.world_object_refs || []).slice(0, 12).map((ref) => (
                  <span key={`stage7ref:${ref.instance_id}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {ref.instance_id} · {ref.total_slots} slots
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Stage 7 World State</h3>
            </div>
            <div className="p-4 space-y-4 text-sm text-neutral-300">
              <div className="grid grid-cols-2 gap-2">
                <InlineStat label="Region" value={stage7WorldState?.region_id || "none"} />
                <InlineStat label="Permitted" value={stage7WorldState ? (stage7WorldState.permitted ? "yes" : "no") : "none"} />
                <InlineStat label="Gates" value={stage7WorldState?.gates.length || 0} />
                <InlineStat label="Facts" value={worldStateFactCount} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage7WorldState?.gates || []).map((gate) => (
                  <span key={`stage7gate:${gate.id}`} className={`text-[11px] rounded-sm border px-2 py-1 ${gateClassName(gate.severity, gate.passed)}`}>
                    {gate.kind} · {gate.passed ? "pass" : "fail"} · {gate.score ?? "-"} / {gate.difficulty ?? "-"}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(stage7WorldState?.consequences || []).map((consequence) => (
                  <span key={`stage7consequence:${consequence.id}`} className="text-[11px] rounded-sm border border-rose-900/70 bg-rose-950/40 px-2 py-1 text-rose-200">
                    {consequence.flag_id}
                  </span>
                ))}
                {recentWorldStateFacts.map((fact) => (
                  <span key={fact.id} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {String(fact.direct_consequences?.region_id || "region")} · t{fact.tick}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              <Hammer className="w-4 h-4 text-yellow-300" />
              <h3 className="text-sm font-semibold text-neutral-200">Material Profiles</h3>
            </div>
            <div className="p-4 space-y-2">
              {gamePackage.simulation_materials.slice(0, 8).map((material) => (
                <div key={material.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-100">{material.label}</p>
                    <span className="ml-auto text-[11px] text-neutral-500">{material.id}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    hard {material.hardness} / flame {material.flammability} / absorb {material.absorbency}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
              {overlayIcon("conditions")}
              <h3 className="text-sm font-semibold text-neutral-200">Active Condition Changes</h3>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {(snapshot.overlays.find((overlay) => overlay.id === "conditions")?.cells || []).slice(0, 64).map((entry) => (
                  <span key={`condition:${entry.cell[0]}:${entry.cell[1]}:${entry.label}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                    {entry.cell[0]},{entry.cell[1]} · {entry.label}
                  </span>
                ))}
                {snapshot.totals.condition_records === 0 && (
                  <span className="text-sm text-neutral-500">No saved condition changes yet.</span>
                )}
              </div>
              {!!recentReactionFacts.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {recentReactionFacts.map((fact) => (
                    <span key={fact.id} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                      {String(fact.direct_consequences?.rule_id || "reaction")} · t{fact.tick}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="border border-neutral-800 rounded-lg bg-neutral-900 overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-neutral-200">Overlay Cells</h3>
          </div>
          <div className="divide-y divide-neutral-800">
            {activeOverlays.map((overlay) => (
              <div key={overlay.id} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  {overlayIcon(overlay.id)}
                  <h4 className="text-sm font-medium text-white">{overlay.label}</h4>
                  <span className="ml-auto text-xs text-neutral-500">{overlay.count}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {overlay.cells.slice(0, 48).map((entry) => (
                    <span key={`${overlay.id}:${entry.cell[0]}:${entry.cell[1]}:${entry.label}`} className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                      {entry.cell[0]},{entry.cell[1]} · {entry.label}
                    </span>
                  ))}
                  {overlay.cells.length > 48 && (
                    <span className="text-[11px] rounded-sm border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-500">
                      +{overlay.cells.length - 48} more
                    </span>
                  )}
                </div>
              </div>
            ))}
            {!activeOverlays.length && <p className="p-4 text-sm text-neutral-500">No active simulation overlays on this map.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatCell(cell?: [number, number]) {
  return cell ? `${cell[0]},${cell[1]}` : "none";
}

function gateClassName(severity: "info" | "warning" | "deny", passed: boolean) {
  if (passed) return "border-emerald-900/70 bg-emerald-950/40 text-emerald-200";
  if (severity === "deny") return "border-rose-900/70 bg-rose-950/40 text-rose-200";
  if (severity === "warning") return "border-amber-900/70 bg-amber-950/40 text-amber-200";
  return "border-neutral-800 bg-neutral-950 text-neutral-300";
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-neutral-800 rounded-lg bg-neutral-900 p-4">
      <p className="text-xl font-semibold text-white">{value}</p>
      <p className="text-xs text-neutral-500 mt-1">{label}</p>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-neutral-950 px-3 py-2">
      <p className="text-sm font-semibold text-white">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function OverlaySummary({ overlay }: { overlay: SimulationDebugOverlay }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="flex items-center gap-2">
        {overlayIcon(overlay.id)}
        <p className="text-sm font-medium text-neutral-100">{overlay.label}</p>
        <span className="ml-auto text-xs text-neutral-500">{overlay.count}</span>
      </div>
      <p className="text-xs text-neutral-500 mt-2">
        {overlay.count > 0 ? `${overlay.cells.slice(0, 3).map((entry) => `${entry.cell[0]},${entry.cell[1]}`).join(" / ")}${overlay.count > 3 ? " / ..." : ""}` : "inactive"}
      </p>
    </div>
  );
}
