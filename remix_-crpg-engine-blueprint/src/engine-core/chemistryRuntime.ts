// ── Grid chemistry runtime ───────────────────────────────────────────────────
// Bridges the pure chemistry core (chemistry.ts) to the live v1 save/render
// model. It seeds an authoritative per-cell axis grid from authored map data,
// applies command impulses + deterministic ticks, persists the axes on the
// save (`PlaySave.chemistry`), and PROJECTS the derived conditions back onto the
// map-delta structures the renderer already draws (`surface_layers`,
// `environment_fields`) so fire/water/ice/scorch/smoke show without a renderer
// rewrite. Axes stay authoritative; the tokens are a read-only view of them.

import type { GamePackage } from "../schema/game";
import type {
  ActorPhysicalStateRecord,
  CellChemRunRecord,
  PlaySave,
  MapDelta,
  SimulationEnvironmentFieldRecord,
  SimulationSurfaceLayerRecord,
} from "../schema/save";
import {
  advanceAlderamonticoActorFromPhysical,
  ensureAlderamonticoActorState,
  entityEmotionalSeed,
} from "./alderamonticoState";
import { entityPlacementStateKey } from "../utils/entityState";
import {
  applyChemImpulse,
  CHEM_AMBIENT_TEMPERATURE,
  CHEM_FLOW_ITERATIONS_PER_MOVE,
  cellChemKey,
  chemActorStatusEffects,
  chemEnvironmentTokens,
  chemSurfaceTokens,
  computeChemActiveSet,
  effectiveChemMaterial,
  fromCellChemRecord,
  getChemMaterial,
  isBurning,
  registerCustomChemMaterials,
  seedCellChem,
  tickChemistryState,
  toCellChemRecord,
  wakeChemCell,
  type ChemCell,
  type ChemCommand,
  type ChemGridState,
  type ChemReactionRecord,
  type CellChemRecord,
} from "./chemistry";
import { applyStatus } from "./statuses";
import { actorFootprintCells } from "./gridCoordinates";
import { getPlacementFootprint, placementHasCollision } from "../utils/objectFootprint";

const CHEM_VERB_MAP: Record<string, ChemCommand> = {
  burn: "burn",
  douse: "douse",
  freeze: "freeze",
  wet: "wet",
  electrify: "shock",
  foam: "foam",
};

export const isChemistryVerb = (verb: string): boolean => verb in CHEM_VERB_MAP;

// Settle ticks run immediately after a command so a single Burn visibly ignites
// and starts spreading rather than waiting for later turns.
const SETTLE_TICKS = 3;

const resolveMap = (gamePackage: GamePackage, mapId: string) =>
  gamePackage.maps.find((map) => map.id === mapId);

// Infer a chemistry material from an authored object so crates/doors burn and
// metal grates conduct. An authored `chem_material_id` on the object (Tiles
// editor · Chemistry material dropdown) always wins over name inference.
// Falls back to nothing (cell keeps its surface material).
const inferObjectMaterial = (gamePackage: GamePackage, objectId: string): string | undefined => {
  const def = gamePackage.object_library.find((object) => object.id === objectId);
  const authored = (def as { chem_material_id?: string } | undefined)?.chem_material_id;
  if (authored) return authored;
  const haystack = `${objectId} ${def?.category || ""} ${(def?.tags || []).join(" ")}`.toLowerCase();
  if (/metal|grate|iron|steel|machine|terminal|beacon/.test(haystack)) return "metal";
  if (/stone|wall|rock|pillar|statue/.test(haystack)) return "stone";
  if (/glass|crystal|window/.test(haystack)) return "glass";
  if (/crate|barrel|chest|door|wood|table|chair|cart|fence|log|shelf/.test(haystack)) return "wood";
  return undefined;
};

// Build a fresh chemistry grid from authored cells + object placements. This is
// the authored/expanded baseline; save.chemistry stores sparse deltas from it.
// Exported so generation audits can inspect the exact same initial state the
// runtime will load instead of maintaining a generator-specific approximation.
export const buildAuthoredChemistryGrid = (
  gamePackage: GamePackage,
  mapId: string,
): Map<string, ChemCell> => {
  const map = resolveMap(gamePackage, mapId);
  const grid = new Map<string, ChemCell>();
  if (!map) return grid;
  for (const cell of map.cells) {
    if (cell.active === false) continue;
    const seeded = seedCellChem(cell.x, cell.z, {
        surfaceTag: cell.surface_tag,
        terrain: cell.terrain,
        height: Number(cell.height ?? cell.visual_height ?? 0),
        walkable: cell.walkable,
      });
    const authored = cell.initial_chemistry;
    if (authored) {
      if (authored.material_id) seeded.materialId = authored.material_id;
      if (authored.liquid_id !== undefined) seeded.liquidId = authored.liquid_id || undefined;
      if (authored.temperature !== undefined) seeded.axes.temperature = authored.temperature;
      if (authored.saturation !== undefined) seeded.axes.saturation = authored.saturation;
      if (authored.charge !== undefined) seeded.axes.charge = authored.charge;
      if (authored.integrity !== undefined) seeded.axes.integrity = authored.integrity;
      if (authored.foam !== undefined) seeded.axes.foam = authored.foam;
      if (authored.fuel !== undefined) seeded.axes.fuel = authored.fuel;
      if (authored.stability !== undefined) seeded.axes.stability = authored.stability;
      if (authored.scorch !== undefined) seeded.axes.scorch = authored.scorch;
      if (authored.frozen !== undefined) seeded.axes.frozen = authored.frozen;
      if (authored.liquid_volume !== undefined) seeded.axes.liquid_volume = authored.liquid_volume;
      if (authored.vapor !== undefined) seeded.axes.vapor = authored.vapor;
    }
    grid.set(cellChemKey(cell.x, cell.z), seeded);
  }
  // Layer object materials onto their cells so a crate cell becomes burnable
  // wood even on a stone floor.
  for (const placement of map.custom_object_placements || []) {
    const materialId = inferObjectMaterial(gamePackage, placement.object_id);
    if (!materialId) continue;
    const mat = getChemMaterial(materialId);
    const objectDef = gamePackage.object_library.find((object) => object.id === placement.object_id);
    for (const [x, z] of getPlacementFootprint(placement, objectDef)) {
      const target = grid.get(cellChemKey(x, z));
      if (!target) continue;
      target.materialId = materialId;
      if (placementHasCollision(placement, objectDef)) target.blocksFlow = true;
      if (mat.fuelCapacity > 0 && target.axes.fuel === 0) target.axes.fuel = mat.fuelCapacity;
    }
  }
  return grid;
};

const chemRecordStableKey = (record: CellChemRecord): string =>
  JSON.stringify(record);

const encodeChemistryRuns = (
  records: Record<string, CellChemRecord>,
): CellChemRunRecord[] => {
  const rows = new Map<number, { x: number; record: CellChemRecord; stable: string }[]>();
  for (const [key, record] of Object.entries(records)) {
    const [x, z] = key.split(":").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const row = rows.get(z) || [];
    row.push({ x, record, stable: chemRecordStableKey(record) });
    rows.set(z, row);
  }

  const runs: CellChemRunRecord[] = [];
  for (const [z, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    row.sort((a, b) => a.x - b.x);
    let current: CellChemRunRecord | undefined;
    let stable = "";
    for (const cell of row) {
      if (current && cell.x === current.x1 + 1 && cell.stable === stable) {
        current.x1 = cell.x;
        continue;
      }
      current = { z, x0: cell.x, x1: cell.x, record: cell.record };
      stable = cell.stable;
      runs.push(current);
    }
  }
  return runs;
};

const applyChemistryRuns = (
  grid: Map<string, ChemCell>,
  baseline: Map<string, ChemCell>,
  runs: CellChemRunRecord[] | undefined,
): void => {
  for (const run of runs || []) {
    const x0 = Math.min(run.x0, run.x1);
    const x1 = Math.max(run.x0, run.x1);
    for (let x = x0; x <= x1; x += 1) {
      const key = cellChemKey(x, run.z);
      if (!grid.has(key) && !baseline.has(key)) continue;
      grid.set(key, fromCellChemRecord(x, run.z, run.record, baseline.get(key)));
    }
  }
};

const loadChemistryState = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): { baseline: Map<string, ChemCell>; state: ChemGridState } => {
  // Authored custom materials (Game panel · Chemistry) must be registered
  // before any material lookup — seeding and every later tick resolve ids
  // through getChemMaterial.
  registerCustomChemMaterials(
    (gamePackage.settings as { chem_materials?: Record<string, never> } | undefined)?.chem_materials,
  );
  const baseline = buildAuthoredChemistryGrid(gamePackage, mapId);
  const grid = new Map<string, ChemCell>();
  for (const [key, cell] of baseline) {
    grid.set(key, { ...cell, axes: { ...cell.axes } });
  }
  const stored = save.chemistry?.[mapId];
  applyChemistryRuns(grid, baseline, save.chemistry_runs?.[mapId]);
  if (stored && Object.keys(stored).length) {
    for (const [key, record] of Object.entries(stored)) {
      const [x, z] = key.split(":").map(Number);
      grid.set(key, fromCellChemRecord(x, z, record, baseline.get(key)));
    }
  }
  const savedActive = save.chemistry_active?.[mapId]?.filter((key) => grid.has(key));
  const active = savedActive?.length ? new Set(savedActive) : computeChemActiveSet(grid);
  return { baseline, state: { cells: grid, active } };
};

const axesDiffer = (a: ChemCell, b: ChemCell) =>
  a.materialId !== b.materialId ||
  (a.liquidId || "") !== (b.liquidId || "") ||
  Math.abs(a.axes.temperature - b.axes.temperature) > 0.001 ||
  Math.abs(a.axes.saturation - b.axes.saturation) > 0.001 ||
  Math.abs(a.axes.charge - b.axes.charge) > 0.001 ||
  Math.abs(a.axes.integrity - b.axes.integrity) > 0.001 ||
  Math.abs(a.axes.foam - b.axes.foam) > 0.001 ||
  Math.abs(a.axes.fuel - b.axes.fuel) > 0.001 ||
  Math.abs(a.axes.stability - b.axes.stability) > 0.001 ||
  Math.abs(a.axes.scorch - b.axes.scorch) > 0.001 ||
  Math.abs(a.axes.liquid_volume - b.axes.liquid_volume) > 0.001 ||
  Math.abs(a.axes.vapor - b.axes.vapor) > 0.001 ||
  a.axes.frozen !== b.axes.frozen;

const writeChemistryState = (
  save: PlaySave,
  mapId: string,
  state: ChemGridState,
  baseline: Map<string, ChemCell>,
  tick: number,
): { save: PlaySave; recordKeys: Set<string> } => {
  const records: Record<string, ReturnType<typeof toCellChemRecord>> = {};
  for (const [key, cell] of state.cells) {
    const base = baseline.get(key);
    if (!base || axesDiffer(cell, base)) records[key] = toCellChemRecord(cell, tick);
  }
  const chemistry = { ...(save.chemistry || {}) };
  const chemistryRuns = { ...(save.chemistry_runs || {}) };
  const activeByMap = { ...(save.chemistry_active || {}) };
  const recordKeys = new Set(Object.keys(records));
  if (recordKeys.size) {
    const runs = encodeChemistryRuns(records);
    const pointSize = JSON.stringify(records).length;
    const runSize = JSON.stringify(runs).length;
    if (runs.length && runSize < pointSize) {
      chemistryRuns[mapId] = runs;
      delete chemistry[mapId];
    } else {
      chemistry[mapId] = records;
      delete chemistryRuns[mapId];
    }
  } else {
    delete chemistry[mapId];
    delete chemistryRuns[mapId];
  }
  if (state.active.size) activeByMap[mapId] = Array.from(state.active).sort();
  else delete activeByMap[mapId];
  return {
    save: {
      ...save,
      chemistry: Object.keys(chemistry).length ? chemistry : undefined,
      chemistry_runs: Object.keys(chemistryRuns).length ? chemistryRuns : undefined,
      chemistry_active: Object.keys(activeByMap).length ? activeByMap : undefined,
    },
    recordKeys,
  };
};

const CHEM_TAG = "chem";
const stripChemSurfaces = (layers: SimulationSurfaceLayerRecord[] | undefined) =>
  (layers || []).filter((layer) => layer.tag !== CHEM_TAG);
const stripChemFields = (fields: SimulationEnvironmentFieldRecord[] | undefined) =>
  (fields || []).filter((field) => field.tag !== CHEM_TAG);

// Project the grid's derived conditions onto the map delta's surface/environment
// layers (tagged "chem" so each projection replaces the previous one).
const projectGrid = (
  save: PlaySave,
  mapId: string,
  grid: Map<string, ChemCell>,
  tick: number,
  projectKeys?: Set<string>,
): PlaySave => {
  const delta: MapDelta = { ...(save.map_deltas?.[mapId] || {}) };
  const surfaces: Record<string, SimulationSurfaceLayerRecord[]> = {};
  const fields: Record<string, SimulationEnvironmentFieldRecord[]> = {};

  // Carry over non-chem layers from the existing delta.
  for (const [key, layers] of Object.entries(delta.surface_layers || {})) {
    const kept = stripChemSurfaces(layers);
    if (kept.length) surfaces[key] = kept;
  }
  for (const [key, fieldList] of Object.entries(delta.environment_fields || {})) {
    const kept = stripChemFields(fieldList);
    if (kept.length) fields[key] = kept;
  }

  const keys = projectKeys || new Set(grid.keys());
  for (const key of keys) {
    const cell = grid.get(key);
    if (!cell) continue;
    const mat = effectiveChemMaterial(cell);
    for (const kind of chemSurfaceTokens(cell.axes, mat)) {
      const amount =
        kind === "water" || kind === "ice"
          ? Math.min(1, Math.max(cell.axes.saturation / 100, cell.axes.liquid_volume / 90))
          : kind === "oil" || kind === "honey"
            ? Math.min(1, cell.axes.liquid_volume / 90)
          : kind === "scorched"
            ? Math.min(1, cell.axes.scorch / 100)
            : kind === "foam"
              ? Math.min(1, cell.axes.foam / 100)
              : 0.6;
      (surfaces[key] ||= []).push({
        id: `chem_surf_${kind}_${key}_${tick}`,
        kind,
        amount,
        age_ticks: 0,
        source: "runtime",
        tag: CHEM_TAG,
        slipperiness: kind === "ice" ? 0.85 : kind === "water" ? 0.3 : kind === "foam" ? 0.2 : 0,
        created_at_tick: tick,
      });
    }
    for (const kind of chemEnvironmentTokens(cell.axes, mat)) {
      (fields[key] ||= []).push({
        id: `chem_env_${kind}_${key}_${tick}`,
        kind,
        intensity:
          kind === "fire"
            ? Math.min(1, 0.6 + cell.axes.fuel / 250)
            : kind === "poison_gas"
              ? Math.min(1, cell.axes.vapor / 60)
              : 0.5,
        age_ticks: 0,
        source: "runtime",
        tag: CHEM_TAG,
        radius: 1,
        origin_cell: [cell.x, cell.z],
        damage_per_tick: kind === "fire" ? 2 : 0,
        visibility_modifier: kind === "poison_gas" ? -0.25 : undefined,
        created_at_tick: tick,
      });
    }
  }

  delta.surface_layers = surfaces;
  delta.environment_fields = fields;
  return {
    ...save,
    map_deltas: { ...(save.map_deltas || {}), [mapId]: delta },
  };
};

// ── Actor/tile axis unification ──────────────────────────────────────────────
// Doc 05 §2: "Tiles carry the same axes... a barrel, a puddle, and a person are
// the same kind of thing." Every actor standing on a chemistry cell reads that
// cell's axes into its own physical state (`actor_physical_states`), takes the
// matching statuses, and feeds the physical→emotional crosstalk — so a burning
// creature panics and a doused one calms, whether it is the player or an NPC.

const CHEM_BODY_NEUTRAL_TEMPERATURE = 37;

const chemPhysicalLabels = (state: Omit<ActorPhysicalStateRecord, "labels">): string[] => {
  const labels: string[] = [];
  if (state.heat >= 0.65) labels.push("On Fire");
  else if (state.heat >= 0.3) labels.push("Hot");
  if (state.chill >= 0.65) labels.push("Freezing");
  else if (state.chill >= 0.3) labels.push("Chilled");
  if (state.wetness >= 0.55) labels.push("Soaked");
  else if (state.wetness >= 0.25) labels.push("Damp");
  if (state.charge >= 0.55) labels.push("Charged");
  if (state.coating >= 0.5) labels.push("Foamed");
  if (state.toxicity >= 0.5) labels.push("Toxic");
  return labels;
};

// Derive an actor's exposure from the chemistry cell under it, or undefined
// when the cell is unremarkable (ambient, dry, uncharged).
export const chemActorPhysicalStateFromCell = (
  cell: ChemCell,
  tick: number,
): ActorPhysicalStateRecord | undefined => {
  const mat = effectiveChemMaterial(cell);
  const a = cell.axes;
  const burning = isBurning(a, mat);
  const heat = burning ? 1 : a.temperature >= 90 ? 0.75 : a.temperature >= 55 ? 0.4 : 0;
  const chill = a.frozen ? 0.9 : a.temperature <= -10 ? 0.65 : a.temperature <= 5 ? 0.35 : 0;
  const wetness = a.saturation >= 25 ? Math.min(1, a.saturation / 100) : 0;
  const charge = a.charge >= 25 ? Math.min(1, a.charge / 100) : 0;
  const coating = a.foam >= 40 ? Math.min(1, a.foam / 100) : 0;
  // Standing in a gas cloud (vapor axis) poisons — the miasma release proof.
  const toxicity = a.vapor >= 25 ? Math.min(1, a.vapor / 100) : 0;
  if (heat <= 0 && chill <= 0 && wetness <= 0 && charge <= 0 && coating <= 0 && toxicity <= 0)
    return undefined;
  const temperature = burning
    ? 125
    : chill >= 0.65
      ? -5
      : heat >= 0.65
        ? 70
        : heat > 0
          ? 48
          : CHEM_BODY_NEUTRAL_TEMPERATURE;
  const state: Omit<ActorPhysicalStateRecord, "labels"> = {
    temperature,
    wetness,
    heat,
    chill,
    charge,
    coating,
    toxicity,
    updated_at_tick: tick,
    cell: [cell.x, cell.z],
  };
  return { ...state, labels: chemPhysicalLabels(state) };
};

// Fade a stale exposure record once the actor leaves the cause: heat cools,
// wetness dries, charge grounds. Returns undefined when fully neutral so the
// record can be dropped (and the emotional crosstalk stops firing).
export const decayActorPhysicalStateRecord = (
  record: ActorPhysicalStateRecord,
  tick: number,
  rate = 0.3,
): ActorPhysicalStateRecord | undefined => {
  const fade = (value: number) => Math.max(0, Math.round((value - rate) * 100) / 100);
  const state: Omit<ActorPhysicalStateRecord, "labels"> = {
    temperature:
      record.temperature > CHEM_BODY_NEUTRAL_TEMPERATURE
        ? Math.max(CHEM_BODY_NEUTRAL_TEMPERATURE, record.temperature - 14)
        : Math.min(CHEM_BODY_NEUTRAL_TEMPERATURE, record.temperature + 14),
    wetness: fade(record.wetness),
    heat: fade(record.heat),
    chill: fade(record.chill),
    charge: fade(record.charge),
    coating: fade(record.coating),
    toxicity: fade(record.toxicity),
    updated_at_tick: tick,
    cell: record.cell,
  };
  const neutral =
    state.heat <= 0 &&
    state.chill <= 0 &&
    state.wetness <= 0 &&
    state.charge <= 0 &&
    state.coating <= 0 &&
    state.toxicity <= 0 &&
    state.temperature === CHEM_BODY_NEUTRAL_TEMPERATURE;
  if (neutral) return undefined;
  return { ...state, labels: chemPhysicalLabels(state) };
};

export interface ChemActorExposure {
  actor_id: string;
  entity_id?: string;
  cell: [number, number];
  labels: string[];
  // Labels the actor did not have before this exposure pass (drives feedback).
  new_labels: string[];
}

type ChemRuntimeActor = {
  actor_id: string;
  entity_id?: string;
  cell: [number, number];
};

const collectChemRuntimeActors = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): ChemRuntimeActor[] => {
  const actors: ChemRuntimeActor[] = [];
  if (save.current_map_id === mapId) {
    actors.push({ actor_id: "player", entity_id: "player", cell: [save.player.cell[0], save.player.cell[1]] });
  }
  const map = resolveMap(gamePackage, mapId);
  (map?.entity_placements || []).forEach((placement, index) => {
    const key = entityPlacementStateKey(mapId, placement, index);
    const state = save.entity_states?.[key] || save.entity_states?.[placement.entity_id] || {};
    if (state.dead || state.hidden) return;
    const cell = (state.cell || placement.cell) as [number, number];
    actors.push({ actor_id: key, entity_id: placement.entity_id, cell: [cell[0], cell[1]] });
  });
  return actors;
};

const applyStatusesToActor = (
  save: PlaySave,
  actorId: string,
  effects: { status_id: string; duration: number; magnitude: number }[],
): PlaySave => {
  if (!effects.length) return save;
  if (actorId === "player") {
    let statuses = save.actor_statuses?.player;
    for (const effect of effects) {
      statuses = applyStatus(statuses, effect.status_id, {
        duration: effect.duration,
        magnitude: effect.magnitude,
      });
    }
    return {
      ...save,
      actor_statuses: { ...(save.actor_statuses || {}), player: statuses || [] },
    };
  }
  const entityState = { ...(save.entity_states?.[actorId] || {}) };
  let statuses = entityState.statuses;
  for (const effect of effects) {
    statuses = applyStatus(statuses, effect.status_id, {
      duration: effect.duration,
      magnitude: effect.magnitude,
    });
  }
  return {
    ...save,
    entity_states: {
      ...(save.entity_states || {}),
      [actorId]: { ...entityState, statuses: statuses || [] },
    },
  };
};

const writeActorPhysicalRecord = (
  save: PlaySave,
  actorId: string,
  record: ActorPhysicalStateRecord | undefined,
): PlaySave => {
  const existing = save.actor_physical_states || {};
  if (!record) {
    if (!(actorId in existing)) return save;
    const next = { ...existing };
    delete next[actorId];
    return { ...save, actor_physical_states: next };
  }
  return {
    ...save,
    actor_physical_states: { ...existing, [actorId]: record },
  };
};

const applyActorChemistryExposure = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  grid: Map<string, ChemCell>,
  tick: number,
): { save: PlaySave; exposures: ChemActorExposure[] } => {
  let nextSave = save;
  const exposures: ChemActorExposure[] = [];
  for (const actor of collectChemRuntimeActors(gamePackage, nextSave, mapId)) {
    const cell = grid.get(cellChemKey(actor.cell[0], actor.cell[1]));
    const previous = nextSave.actor_physical_states?.[actor.actor_id];
    let exposure = cell ? chemActorPhysicalStateFromCell(cell, tick) : undefined;
    // Toxicity can come from the chemistry vapor axis OR the immersive-sim
    // gas layer. Carry any prior toxicity through (fading) rather than
    // zeroing it, keeping whichever source reads stronger.
    if (exposure && previous && previous.toxicity > 0.3) {
      const carried = Math.max(0, Math.round((previous.toxicity - 0.3) * 100) / 100);
      if (carried > exposure.toxicity) {
        const merged = { ...exposure, toxicity: carried };
        exposure = { ...merged, labels: chemPhysicalLabels(merged) };
      }
    }
    if (exposure) {
      nextSave = writeActorPhysicalRecord(nextSave, actor.actor_id, exposure);
      nextSave = applyStatusesToActor(
        nextSave,
        actor.actor_id,
        chemActorStatusEffects(cell!.axes, effectiveChemMaterial(cell!)),
      );
      // Physical → emotional crosstalk: being on fire is frightening. Seed the
      // emotional record from authored axes the first time chemistry touches it.
      nextSave = ensureAlderamonticoActorState(nextSave, actor.actor_id, {
        tick,
        seedAxes: entityEmotionalSeed(gamePackage, actor.entity_id),
      });
      nextSave = advanceAlderamonticoActorFromPhysical(nextSave, actor.actor_id, { tick });
      const previousLabels = new Set(previous?.labels || []);
      exposures.push({
        actor_id: actor.actor_id,
        entity_id: actor.entity_id,
        cell: [...actor.cell],
        labels: [...exposure.labels],
        new_labels: exposure.labels.filter((label) => !previousLabels.has(label)),
      });
    } else if (previous) {
      // Cause removed — the body fades back toward neutral.
      nextSave = writeActorPhysicalRecord(
        nextSave,
        actor.actor_id,
        decayActorPhysicalStateRecord(previous, tick),
      );
    }
  }
  return { save: nextSave, exposures };
};

export interface ChemistryVerbResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  reactions: ChemReactionRecord[];
  exposures: ChemActorExposure[];
  conditionSummary: string;
}

const summarizeReactions = (reactions: ChemReactionRecord[]): string => {
  if (!reactions.length) return "";
  const counts = new Map<string, number>();
  for (const reaction of reactions) counts.set(reaction.kind, (counts.get(reaction.kind) || 0) + 1);
  const order = ["ignited", "spread", "extinguished", "froze", "melted", "steam", "arc", "scorched"];
  const parts: string[] = [];
  for (const kind of order) {
    const n = counts.get(kind);
    if (n) parts.push(kind === "spread" ? `spread×${n}` : kind);
  }
  return parts.join(", ");
};

// Apply an elemental command-wheel verb through the chemistry core: impulse on
// the target cell, then a few settle ticks so it visibly ignites/spreads/freezes.
export const applyChemistryVerbToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: { verb: string; cell: [number, number]; mapId?: string; tick?: number },
): ChemistryVerbResult => {
  const command = CHEM_VERB_MAP[options.verb];
  if (!command) {
    return { ok: false, reason: "not a chemistry verb", save, reactions: [], exposures: [], conditionSummary: "" };
  }
  const mapId = options.mapId || save.current_map_id;
  const tick = options.tick ?? (save.clock_minutes || 0);
  const { baseline, state } = loadChemistryState(gamePackage, save, mapId);
  const grid = state.cells;
  const key = cellChemKey(options.cell[0], options.cell[1]);
  const target = grid.get(key);
  if (!target) {
    return { ok: false, reason: "unknown cell", save, reactions: [], exposures: [], conditionSummary: "" };
  }
  target.axes = applyChemImpulse(target.axes, effectiveChemMaterial(target), command);
  if (command === "douse" || command === "wet" || command === "freeze") {
    target.liquidId = "water";
    target.axes.liquid_volume = Math.min(
      400,
      target.axes.liquid_volume + (command === "douse" ? 85 : command === "freeze" ? 45 : 35),
    );
    target.axes.saturation = Math.max(target.axes.saturation, command === "wet" ? 45 : 85);
  }
  wakeChemCell(state, target.x, target.z);

  const allReactions: ChemReactionRecord[] = [];
  for (let i = 0; i < SETTLE_TICKS; i += 1) {
    const result = tickChemistryState(state, {
      ambient: CHEM_AMBIENT_TEMPERATURE,
      flowIterations: CHEM_FLOW_ITERATIONS_PER_MOVE,
    });
    allReactions.push(...result.reactions);
  }

  const persisted = writeChemistryState(save, mapId, state, baseline, tick);
  let next = projectGrid(persisted.save, mapId, grid, tick, persisted.recordKeys);
  const exposure = applyActorChemistryExposure(gamePackage, next, mapId, grid, tick);
  return {
    ok: true,
    save: exposure.save,
    reactions: allReactions,
    exposures: exposure.exposures,
    conditionSummary: summarizeReactions(allReactions),
  };
};

// The substances a `chem_spill` cutscene action can release. Liquids dump
// standing volume, "miasma" dumps gas concentration, "fire" is an ignition
// impulse (amount = burn magnitude × 100).
export const CHEM_SPILL_LIQUIDS = ["water", "honey", "oil", "miasma", "fire"] as const;

// Debug/test reader: the live chemistry grid a save resolves to for a map
// (baseline seed + persisted deltas), plus the surviving active set. Headless
// suite tests assert flooding/racing/burning/dissipating against this.
export const readChemistryGridForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): { cells: Map<string, ChemCell>; active: Set<string> } => {
  const { state } = loadChemistryState(gamePackage, save, mapId);
  return { cells: state.cells, active: state.active };
};

/**
 * Materializes explicitly authored chemistry axes into the ordinary save and
 * renderer projections on first entry. Legacy surface tags keep their existing
 * lazy behavior; only maps using the validated `initial_chemistry` contract
 * opt into an immediately live field.
 */
export const initializeAuthoredChemistryForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  tick = save.clock_minutes || 0,
): PlaySave => {
  const map = resolveMap(gamePackage, mapId);
  if (!map?.cells.some((cell) => Boolean(cell.initial_chemistry))) return save;
  if (save.chemistry?.[mapId] || save.chemistry_runs?.[mapId] || save.chemistry_active?.[mapId]) {
    return save;
  }
  const { baseline, state } = loadChemistryState(gamePackage, save, mapId);
  if (state.active.size === 0) return save;
  const persisted = writeChemistryState(save, mapId, state, baseline, tick);
  return projectGrid(persisted.save, mapId, state.cells, tick, new Set(state.active));
};

// Release a quantity of liquid / gas / ignition onto a cell — the authored
// "button floods the room" hook (QA suite plan Phase 1). The spill only
// INJECTS quantity and wakes the active set; the flooding, racing, burning,
// and dissipating that follow are the ordinary chemistry simulation advancing
// on player moves. `cell` arrives fine-expanded (macro-center) like every
// other runtime coordinate.
export const applyChemistrySpillToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: {
    cell: [number, number];
    liquid?: string;
    amount?: number;
    mapId?: string;
    tick?: number;
  },
): ChemistryVerbResult => {
  const mapId = options.mapId || save.current_map_id;
  const tick = options.tick ?? (save.clock_minutes || 0);
  const { baseline, state } = loadChemistryState(gamePackage, save, mapId);
  const grid = state.cells;
  const key = cellChemKey(options.cell[0], options.cell[1]);
  const target = grid.get(key);
  if (!target) {
    return { ok: false, reason: "unknown cell", save, reactions: [], exposures: [], conditionSummary: "" };
  }
  const liquid = (options.liquid || "water").toLowerCase();
  const amount = Math.max(1, Math.floor(options.amount ?? 150));

  if (liquid === "miasma") {
    // A gas release is a tile-sized burst: fill the whole macro block around
    // the valve so the cloud has enough mass to visibly fill the chamber
    // before dissipation wins.
    for (const [bx, bz] of actorFootprintCells([target.x, target.z])) {
      const burst = grid.get(cellChemKey(bx, bz));
      if (!burst || burst.blocksFlow) continue;
      burst.axes.vapor = Math.min(100, burst.axes.vapor + amount);
      wakeChemCell(state, bx, bz);
    }
  } else if (liquid === "fire") {
    target.axes = applyChemImpulse(target.axes, effectiveChemMaterial(target), "burn", {
      magnitude: Math.min(1, amount / 100),
    });
  } else {
    // A liquid release is likewise a tile-sized dump: `amount` of DEPTH lands
    // on every open fine cell of the macro tile (one authored action empties
    // one tank), and the flood spreads from there on the player's moves.
    const liquidMat = getChemMaterial(liquid);
    for (const [bx, bz] of actorFootprintCells([target.x, target.z])) {
      const burst = grid.get(cellChemKey(bx, bz));
      if (!burst || burst.blocksFlow || burst.axes.frozen) continue;
      burst.liquidId = burst.liquidId || liquid;
      burst.axes.liquid_volume = Math.min(400, burst.axes.liquid_volume + amount);
      if (liquid === "water") {
        burst.axes.saturation = Math.max(
          burst.axes.saturation,
          Math.min(100, burst.axes.liquid_volume * 2),
        );
      }
      if (liquidMat.flammability > 0) {
        burst.axes.fuel = Math.max(
          burst.axes.fuel,
          Math.min(liquidMat.fuelCapacity, burst.axes.liquid_volume * 1.5),
        );
      }
      wakeChemCell(state, bx, bz);
    }
  }
  wakeChemCell(state, target.x, target.z);

  // A single settle tick with ONE flow iteration makes the release visibly
  // splash out of the source; the flood/race/burn that follows advances on
  // player moves — the watchable ooze IS the point, so the spill must not
  // pre-resolve it.
  const allReactions: ChemReactionRecord[] = [];
  const result = tickChemistryState(state, {
    ambient: CHEM_AMBIENT_TEMPERATURE,
    flowIterations: 1,
  });
  allReactions.push(...result.reactions);

  const persisted = writeChemistryState(save, mapId, state, baseline, tick);
  let next = projectGrid(persisted.save, mapId, grid, tick, persisted.recordKeys);
  const exposure = applyActorChemistryExposure(gamePackage, next, mapId, grid, tick);
  return {
    ok: true,
    save: exposure.save,
    reactions: allReactions,
    exposures: exposure.exposures,
    conditionSummary: summarizeReactions(allReactions),
  };
};

// Advance an already-seeded map's chemistry by `ticks` (called as turns pass so
// fire keeps spreading and ice keeps melting between player commands).
export const advanceChemistryForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  ticks = 1,
  tick?: number,
): { save: PlaySave; reactions: ChemReactionRecord[]; exposures: ChemActorExposure[] } => {
  if (!save.chemistry?.[mapId] && !save.chemistry_runs?.[mapId] && !save.chemistry_active?.[mapId])
    return { save, reactions: [], exposures: [] };
  // Dormancy short-circuit BEFORE the expensive full-grid reseed: a settled
  // map keeps its chemistry records (the standing pool) but no persisted
  // active set, so once the flood equilibrates, walking past it costs O(1)
  // instead of reseeding the whole (9×) grid every step.
  const persistedActive = (save.chemistry_active?.[mapId]?.length ?? 0) > 0;
  const lingering = Object.keys(save.actor_physical_states || {}).length > 0;
  if (!persistedActive && !lingering) return { save, reactions: [], exposures: [] };
  const stamp = tick ?? (save.clock_minutes || 0);
  const { baseline, state } = loadChemistryState(gamePackage, save, mapId);
  const grid = state.cells;
  const reactions: ChemReactionRecord[] = [];
  const active = state.active.size > 0;
  if (!active && !lingering) return { save, reactions: [], exposures: [] };
  for (let i = 0; i < ticks; i += 1) {
    const result = tickChemistryState(state, {
      ambient: CHEM_AMBIENT_TEMPERATURE,
      flowIterations: CHEM_FLOW_ITERATIONS_PER_MOVE,
    });
    reactions.push(...result.reactions);
  }
  const persisted = writeChemistryState(save, mapId, state, baseline, stamp);
  let next = projectGrid(persisted.save, mapId, grid, stamp, persisted.recordKeys);
  const exposure = applyActorChemistryExposure(gamePackage, next, mapId, grid, stamp);
  return { save: exposure.save, reactions, exposures: exposure.exposures };
};
