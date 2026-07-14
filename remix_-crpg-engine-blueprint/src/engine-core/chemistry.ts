// ── Grid chemistry core ──────────────────────────────────────────────────────
// An authoritative, numeric-axis chemistry model for the 2D grid (per
// docs/GRID_CHEMISTRY_AND_STATE_REACTION_SYSTEM_V1.md). This is the corrected,
// codebase-grounded version of that spec.
//
// The central inversion vs. the old system: NUMERIC STATE AXES ARE THE TRUTH.
// The engine no longer asks "does this cell have the `fire` token?" — it asks
// "is its temperature above its material's ignition point, does it still have
// fuel, and is it not suppressed by saturation or foam?" Discrete conditions
// (burning, wet, frozen, scorched, …) are DERIVED from the axes every tick.
//
// Because axes are real numbers that transfer between neighbours and relax
// toward ambient, the emergent behaviours fall out for free:
//   • fire spreads over wood   — a burning cell heats fuelled neighbours until
//                                they pass their own ignition threshold;
//   • ice melts                — a frozen cell's temperature relaxes toward
//                                ambient and, once above the melt point, the
//                                ice becomes plain water again;
//   • douse leaves scorch      — water raises saturation (extinguishing the
//                                fire) but the scorch axis it already
//                                accumulated persists as a residue;
//   • wet conducts electricity — charge arcs through saturated/metal neighbours.
//
// This module is pure and framework-agnostic: no React, DOM, zustand, or save
// types. Callers serialize `CellChemRecord`s and project the derived condition
// tokens onto whatever rendering/status layers they already have.

import { fineCoordKey } from "./gridCoordinates";
import type { RNG } from "./rng";

// ── Tunables ─────────────────────────────────────────────────────────────────
export const CHEM_AMBIENT_TEMPERATURE = 25;
export const CHEM_FREEZE_POINT = -10; // at/below this a wet cell can freeze
export const CHEM_MELT_POINT = 2; // above this, ice melts back to water
export const CHEM_BOIL_HINT = 70; // hot + wet above this flashes to steam
export const CHEM_SUPPRESS_SATURATION = 70; // saturation that smothers fire
export const CHEM_SMOTHER_FOAM = 40; // foam that smothers fire
export const CHEM_BURN_FUEL_RATE = 14; // fuel consumed per tick while burning
export const CHEM_SCORCH_RATE = 10; // scorch accrued per tick while burning
export const CHEM_HEAT_EMISSION = 42; // heat a burning cell pushes to neighbours
export const CHEM_CONDUCTION_FACTOR = 0.08; // passive neighbour heat conduction
export const CHEM_SCORCHED_THRESHOLD = 25; // scorch at/above this reads "scorched"

// ── Flow tunables (grid-subdivision rebuild §6) ──────────────────────────────
// Liquid depth is a real quantity axis, distinct from saturation ("wet floor"
// vs "ankle-deep water" — open item #2 resolved: liquids get their own
// volume). Levels compare height * CHEM_HEIGHT_LEVEL + liquid_volume, so
// fluids run downhill first and level out second.
export const CHEM_HEIGHT_LEVEL = 80; // level units per authored height step
export const CHEM_MIN_FLOW_DEPTH = 4; // below this a puddle stops spreading (surface tension)
export const CHEM_FLOW_ITERATIONS_PER_MOVE = 2; // ooze advances a few cells per player step
export const CHEM_GAS_DIFFUSION = 0.28; // fraction of a vapor gradient moved per iteration
export const CHEM_ACTIVE_EPSILON = 0.5; // change below this lets a cell go dormant

// ── Axes ─────────────────────────────────────────────────────────────────────
// Normalized ranges; values are design units, not physical units.
export interface ChemAxes {
  temperature: number; // -100..125 (ambient ~25)
  saturation: number; // 0..100 (water held — WETNESS, not depth)
  charge: number; // 0..100 (electrical)
  integrity: number; // 0..100 (100 = intact)
  foam: number; // 0..100 (insulating coating)
  fuel: number; // 0..100 (burnable material left)
  stability: number; // 0..100 (structural / footing)
  scorch: number; // 0..100 (burn residue — sticky)
  frozen: boolean; // ice latch: set when frozen, cleared when melted
  liquid_volume: number; // 0..400 (standing liquid DEPTH; flows via archetype)
  vapor: number; // 0..100 (gas concentration; diffuses and dissipates)
}

export const cloneAxes = (axes: ChemAxes): ChemAxes => ({ ...axes });

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export const defaultAxes = (overrides: Partial<ChemAxes> = {}): ChemAxes => ({
  temperature: CHEM_AMBIENT_TEMPERATURE,
  saturation: 0,
  charge: 0,
  integrity: 100,
  foam: 0,
  fuel: 0,
  stability: 100,
  scorch: 0,
  frozen: false,
  liquid_volume: 0,
  vapor: 0,
  ...overrides,
});

// ── Materials ────────────────────────────────────────────────────────────────
export type ChemFlowArchetype = "liquid" | "fire" | "gas" | "none";

export interface ChemMaterial {
  id: string;
  displayName: string;
  flammability: number; // 0..100 ease of catching once hot
  ignitionThreshold: number; // temperature required to ignite
  fuelCapacity: number; // default/maximum fuel
  conductivity: number; // 0..100 electrical conduction
  absorbency: number; // 0..100 saturation it holds / how slowly it dries
  thermalMass: number; // 0..100 resistance to temperature change
  brittleness: number; // 0..100 extra break damage when frozen
  impactResistance: number; // 0..100 resists integrity loss
  foamAffinity: number; // 0..100 how well foam adheres
  // ── Flow (rebuild spec §6.1) ──
  flowArchetype: ChemFlowArchetype;
  // Viscosity expressed as FLOW RATE: fine cells of frontier advance per flow
  // iteration. Water ≈ 3 (about one macro tile), honey ≈ 1 (slow crawl).
  flowRate: number;
  // Level difference a liquid needs before it moves — viscous liquids hold
  // slopes and sit as thick blobs; thin ones run flat.
  slopeHold: number;
  // Gas only: concentration lost to the air per iteration.
  dissipation: number;
  tags: string[];
}

const material = (
  id: string,
  displayName: string,
  partial: Partial<Omit<ChemMaterial, "id" | "displayName">>,
): ChemMaterial => ({
  id,
  displayName,
  flammability: 0,
  ignitionThreshold: 999,
  fuelCapacity: 0,
  conductivity: 10,
  absorbency: 15,
  thermalMass: 60,
  brittleness: 20,
  impactResistance: 50,
  foamAffinity: 40,
  flowArchetype: "none",
  flowRate: 0,
  slopeHold: 2,
  dissipation: 0,
  tags: [],
  ...partial,
});

export const CHEM_MATERIALS: Record<string, ChemMaterial> = {
  wood: material("wood", "Wood", {
    flammability: 70,
    ignitionThreshold: 80,
    fuelCapacity: 90,
    conductivity: 5,
    absorbency: 35,
    thermalMass: 45,
    brittleness: 30,
    impactResistance: 40,
    foamAffinity: 55,
    tags: ["wood", "flammable", "solid"],
  }),
  cloth: material("cloth", "Cloth", {
    flammability: 95,
    ignitionThreshold: 60,
    fuelCapacity: 70,
    conductivity: 5,
    absorbency: 70,
    thermalMass: 15,
    brittleness: 10,
    impactResistance: 15,
    tags: ["cloth", "flammable", "soft"],
  }),
  grass: material("grass", "Grass", {
    flammability: 90,
    ignitionThreshold: 65,
    fuelCapacity: 60,
    conductivity: 5,
    absorbency: 45,
    thermalMass: 18,
    brittleness: 10,
    tags: ["grass", "flammable", "ground"],
  }),
  oil: material("oil", "Oil", {
    flammability: 100,
    ignitionThreshold: 55,
    fuelCapacity: 100,
    conductivity: 8,
    absorbency: 5,
    thermalMass: 12,
    brittleness: 0,
    flowArchetype: "liquid",
    flowRate: 2,
    slopeHold: 4,
    tags: ["oil", "flammable", "liquid", "surface_spread"],
  }),
  metal: material("metal", "Metal", {
    flammability: 0,
    ignitionThreshold: 999,
    fuelCapacity: 0,
    conductivity: 95,
    absorbency: 0,
    thermalMass: 80,
    brittleness: 5,
    impactResistance: 85,
    tags: ["metal", "conductive", "solid"],
  }),
  stone: material("stone", "Stone", {
    flammability: 0,
    ignitionThreshold: 999,
    fuelCapacity: 0,
    conductivity: 10,
    absorbency: 10,
    thermalMass: 95,
    brittleness: 25,
    impactResistance: 90,
    tags: ["stone", "solid"],
  }),
  glass: material("glass", "Glass", {
    flammability: 5,
    ignitionThreshold: 400,
    fuelCapacity: 0,
    conductivity: 40,
    absorbency: 0,
    thermalMass: 40,
    brittleness: 85,
    impactResistance: 20,
    tags: ["glass", "brittle"],
  }),
  flesh: material("flesh", "Flesh", {
    flammability: 40,
    ignitionThreshold: 120,
    fuelCapacity: 50,
    conductivity: 45,
    absorbency: 40,
    thermalMass: 30,
    brittleness: 10,
    impactResistance: 35,
    tags: ["flesh", "actor", "flammable"],
  }),
  water: material("water", "Water", {
    flammability: 0,
    ignitionThreshold: 999,
    fuelCapacity: 0,
    conductivity: 60,
    absorbency: 100,
    thermalMass: 50,
    brittleness: 0,
    flowArchetype: "liquid",
    flowRate: 3,
    slopeHold: 1,
    tags: ["water", "liquid", "conductive"],
  }),
  honey: material("honey", "Honey", {
    flammability: 15,
    ignitionThreshold: 160,
    fuelCapacity: 30,
    conductivity: 8,
    absorbency: 20,
    thermalMass: 55,
    brittleness: 0,
    flowArchetype: "liquid",
    flowRate: 1,
    slopeHold: 9,
    tags: ["honey", "liquid", "viscous", "sticky"],
  }),
  miasma: material("miasma", "Miasma", {
    flammability: 0,
    ignitionThreshold: 999,
    fuelCapacity: 0,
    conductivity: 2,
    absorbency: 0,
    thermalMass: 5,
    brittleness: 0,
    flowArchetype: "gas",
    flowRate: 3,
    // Slow enough that a vented cloud crosses a room before thinning out,
    // fast enough that the vault reads as clean air again in tens of moves.
    dissipation: 0.4,
    tags: ["gas", "toxic"],
  }),
  foam: material("foam", "Foam", {
    flammability: 5,
    ignitionThreshold: 300,
    fuelCapacity: 0,
    conductivity: 2,
    absorbency: 30,
    thermalMass: 40,
    brittleness: 5,
    foamAffinity: 100,
    tags: ["foam", "insulator", "smothering"],
  }),
  floor: material("floor", "Floor", {
    flammability: 0,
    ignitionThreshold: 999,
    fuelCapacity: 0,
    conductivity: 10,
    absorbency: 15,
    thermalMass: 70,
    impactResistance: 80,
    tags: ["ground", "solid"],
  }),
};

// Author-defined materials (Game panel · Chemistry tab). Registered from
// `settings.chem_materials` whenever a chemistry grid is seeded or loaded, so
// custom ids resolve inside the tick exactly like built-ins. A custom id that
// matches a built-in overrides it.
let CUSTOM_CHEM_MATERIALS: Record<string, ChemMaterial> = {};

export const registerCustomChemMaterials = (
  authored: Record<string, Partial<Omit<ChemMaterial, "id" | "displayName">> & { label?: string }> | undefined,
) => {
  CUSTOM_CHEM_MATERIALS = {};
  for (const [id, spec] of Object.entries(authored || {})) {
    if (!id) continue;
    const { label, ...props } = spec || {};
    CUSTOM_CHEM_MATERIALS[id] = material(id, label || id, props);
  }
};

export const getChemMaterial = (id: string | undefined): ChemMaterial =>
  (id && (CUSTOM_CHEM_MATERIALS[id] || CHEM_MATERIALS[id])) || CHEM_MATERIALS.floor;

// ── Working cell + serializable record ───────────────────────────────────────
export interface ChemCell {
  x: number;
  z: number;
  materialId: string;
  axes: ChemAxes;
  // Simulation height of the FINE cell (macro-uniform per authored tile);
  // liquids compare height * CHEM_HEIGHT_LEVEL + liquid_volume when flowing.
  height: number;
  // Material id of the standing liquid occupying this cell (water/honey/oil).
  // Cleared when the volume drains; the floor material stays `materialId`.
  liquidId?: string;
  // Walls: liquids and gases never flow into these (fire ignores it).
  blocksFlow?: boolean;
}

export interface CellChemRecord extends ChemAxes {
  material_id: string;
  liquid_id?: string;
  updated_at_tick: number;
}

export const cellChemKey = fineCoordKey;

export const toCellChemRecord = (cell: ChemCell, tick: number): CellChemRecord => ({
  material_id: cell.materialId,
  ...(cell.liquidId ? { liquid_id: cell.liquidId } : {}),
  ...cell.axes,
  updated_at_tick: tick,
});

export const fromCellChemRecord = (
  x: number,
  z: number,
  record: CellChemRecord,
  base?: Pick<ChemCell, "height" | "blocksFlow">,
): ChemCell => ({
  x,
  z,
  materialId: record.material_id,
  liquidId: record.liquid_id,
  height: base?.height ?? 0,
  blocksFlow: base?.blocksFlow,
  axes: {
    temperature: record.temperature,
    saturation: record.saturation,
    charge: record.charge,
    integrity: record.integrity,
    foam: record.foam,
    fuel: record.fuel,
    stability: record.stability,
    scorch: record.scorch,
    frozen: record.frozen,
    // Legacy saves predate the flow axes.
    liquid_volume: record.liquid_volume ?? 0,
    vapor: record.vapor ?? 0,
  },
});

// ── Derived conditions ───────────────────────────────────────────────────────
// Recomputed from axes after every tick. These are READINGS, never stored state.
export type ChemCondition =
  | "dry"
  | "damp"
  | "wet"
  | "soaked"
  | "hot"
  | "burning"
  | "smoldering"
  | "charged"
  | "electrified"
  | "frosted"
  | "frozen"
  | "coated"
  | "foamed"
  | "sealed"
  | "scorched"
  | "intact"
  | "damaged"
  | "breaking"
  | "broken";

export const isBurning = (axes: ChemAxes, mat: ChemMaterial): boolean =>
  mat.flammability > 0 &&
  axes.fuel > 0 &&
  !axes.frozen &&
  axes.temperature >= mat.ignitionThreshold &&
  axes.saturation < CHEM_SUPPRESS_SATURATION &&
  axes.foam < CHEM_SMOTHER_FOAM;

const isSmoldering = (axes: ChemAxes, mat: ChemMaterial): boolean =>
  !isBurning(axes, mat) &&
  mat.flammability > 0 &&
  axes.fuel > 0 &&
  !axes.frozen &&
  axes.temperature >= mat.ignitionThreshold * 0.7 &&
  (axes.saturation >= CHEM_SUPPRESS_SATURATION ||
    axes.foam >= CHEM_SMOTHER_FOAM ||
    axes.temperature < mat.ignitionThreshold);

export const deriveChemConditions = (
  axes: ChemAxes,
  mat: ChemMaterial,
): ChemCondition[] => {
  const out: ChemCondition[] = [];

  // Saturation ladder.
  if (axes.saturation >= 70) out.push("soaked");
  else if (axes.saturation >= 25) out.push("wet");
  else if (axes.saturation >= 1) out.push("damp");
  else out.push("dry");

  // Thermal / fire.
  if (axes.frozen) out.push("frozen");
  else if (axes.temperature <= 0 && axes.saturation >= 1) out.push("frosted");
  if (isBurning(axes, mat)) out.push("burning");
  else if (isSmoldering(axes, mat)) out.push("smoldering");
  else if (axes.temperature >= 41 && !axes.frozen) out.push("hot");

  // Electrical.
  if (axes.charge >= 70) out.push("electrified");
  else if (axes.charge >= 25) out.push("charged");

  // Foam coating.
  if (axes.foam >= 80) out.push("sealed");
  else if (axes.foam >= 40) out.push("foamed");
  else if (axes.foam >= 1) out.push("coated");

  // Burn residue.
  if (axes.scorch >= CHEM_SCORCHED_THRESHOLD) out.push("scorched");

  // Integrity ladder.
  if (axes.integrity <= 0) out.push("broken");
  else if (axes.integrity < 40) out.push("breaking");
  else if (axes.integrity < 70) out.push("damaged");
  else out.push("intact");

  return out;
};

// ── Command impulses ─────────────────────────────────────────────────────────
// Commands are state operators: they move axes, they do not set conditions.
export type ChemCommand =
  | "burn"
  | "douse"
  | "wet"
  | "freeze"
  | "shock"
  | "foam"
  | "break";

export interface ChemImpulseOptions {
  magnitude?: number; // 0..1 scale of the impulse (default 1)
}

// Apply a command impulse to a single cell's axes, returning new axes. The
// material is consulted so e.g. metal does not gain fuel and oil ignites easily.
export const applyChemImpulse = (
  axes: ChemAxes,
  mat: ChemMaterial,
  command: ChemCommand,
  options: ChemImpulseOptions = {},
): ChemAxes => {
  const m = clamp(options.magnitude ?? 1, 0, 1);
  const next = cloneAxes(axes);
  switch (command) {
    case "burn": {
      // Strong heat impulse — enough to push dry flammable material over its
      // ignition threshold in one application; also dries and melts.
      next.temperature = clamp(next.temperature + 60 * m, -100, 125);
      if (next.frozen && next.temperature > CHEM_MELT_POINT) next.frozen = false;
      if (next.saturation > 0 && next.saturation < 25) next.saturation = clamp(next.saturation - 15 * m, 0, 100);
      if (next.foam > 0) next.foam = clamp(next.foam - 15 * m, 0, 100);
      break;
    }
    case "douse": {
      // Water + cooling. Suppresses fire (raises saturation past the smother
      // threshold even on a fire-dried surface) and chills, but never erases
      // accumulated scorch.
      next.saturation = clamp(next.saturation + 70 * m, 0, 100);
      next.temperature = clamp(next.temperature - 35 * m, -100, 125);
      break;
    }
    case "wet": {
      next.saturation = clamp(next.saturation + 35 * m, 0, 100);
      next.temperature = clamp(next.temperature - 10 * m, -100, 125);
      break;
    }
    case "freeze": {
      next.temperature = clamp(next.temperature - 55 * m, -100, 125);
      if (next.temperature <= CHEM_FREEZE_POINT && next.saturation >= 25) {
        next.frozen = true;
      }
      if (mat.brittleness >= 50) next.integrity = clamp(next.integrity - 5 * m, 0, 100);
      break;
    }
    case "shock": {
      next.charge = clamp(next.charge + 70 * m, 0, 100);
      break;
    }
    case "foam": {
      next.foam = clamp(next.foam + 60 * m, 0, 100);
      // Foam carries a little water and chills slightly.
      next.saturation = clamp(next.saturation + 10 * m, 0, 100);
      next.temperature = clamp(next.temperature - 8 * m, -100, 125);
      break;
    }
    case "break": {
      const impact = 45 * m * (1 - mat.impactResistance / 200);
      const brittleBonus = axes.frozen ? impact * (0.5 + mat.brittleness / 100) : 0;
      next.integrity = clamp(next.integrity - (impact + brittleBonus), 0, 100);
      next.stability = clamp(next.stability - 20 * m, 0, 100);
      break;
    }
  }
  return next;
};

// ── Deterministic grid tick ──────────────────────────────────────────────────
export interface ChemReactionRecord {
  kind:
    | "ignited"
    | "spread"
    | "burning"
    | "smoldering"
    | "extinguished"
    | "scorched"
    | "froze"
    | "melted"
    | "steam"
    | "arc"
    | "dried";
  cell: [number, number];
  detail?: string;
}

export interface ChemTickResult {
  cells: Map<string, ChemCell>;
  reactions: ChemReactionRecord[];
}

const neighbors4: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// ── Active-set grid state (rebuild spec §6.4) ────────────────────────────────
// Chemistry cost scales with the LIVE FRONTIER, not the map: only cells in the
// active set tick; a cell in equilibrium with its neighbours goes dormant and
// costs nothing until a verb, a flow, or a neighbouring change wakes it. If a
// tick ever iterates the whole grid at ratio 3, that is a bug, not a load.
export interface ChemGridState {
  cells: Map<string, ChemCell>;
  active: Set<string>;
}

export const allActiveChemState = (cells: Map<string, ChemCell>): ChemGridState => ({
  cells,
  active: new Set(cells.keys()),
});

export const wakeChemCell = (state: ChemGridState, x: number, z: number): void => {
  const key = cellChemKey(x, z);
  if (state.cells.has(key)) state.active.add(key);
  for (const [dx, dz] of neighbors4) {
    const nKey = cellChemKey(x + dx, z + dz);
    if (state.cells.has(nKey)) state.active.add(nKey);
  }
};

// Rebuild the active set from scratch (used after loading a save, where only
// out-of-equilibrium cells need to resume ticking).
export const computeChemActiveSet = (cells: Map<string, ChemCell>): Set<string> => {
  const active = new Set<string>();
  for (const [key, cell] of cells) {
    const mat = getChemMaterial(cell.materialId);
    const a = cell.axes;
    const energetic =
      isBurning(a, effectiveChemMaterial(cell)) ||
      a.charge > 0 ||
      a.foam > 0 ||
      a.vapor > 0 ||
      Math.abs(a.temperature - CHEM_AMBIENT_TEMPERATURE) > 5 ||
      (a.temperature > 40 && (a.saturation > 0 || a.liquid_volume > 0));
    if (energetic) {
      active.add(key);
      continue;
    }
    if (a.liquid_volume > CHEM_MIN_FLOW_DEPTH && cell.liquidId && !a.frozen) {
      // Wake liquids that still have somewhere to go.
      const liq = getChemMaterial(cell.liquidId);
      const level = cell.height * CHEM_HEIGHT_LEVEL + a.liquid_volume;
      for (const [dx, dz] of neighbors4) {
        const n = cells.get(cellChemKey(cell.x + dx, cell.z + dz));
        if (!n || n.blocksFlow || n.axes.frozen) continue;
        const nLevel = n.height * CHEM_HEIGHT_LEVEL + n.axes.liquid_volume;
        if (level - nLevel > liq.slopeHold) {
          active.add(key);
          break;
        }
      }
    }
    void mat;
  }
  return active;
};

// The material that reacts to heat on this cell: a standing flammable liquid
// (oil that flowed in) burns even on stone floor.
export const effectiveChemMaterial = (cell: ChemCell): ChemMaterial => {
  const floor = getChemMaterial(cell.materialId);
  if (cell.liquidId && cell.axes.liquid_volume > 0) {
    const liquid = getChemMaterial(cell.liquidId);
    if (liquid.flammability > floor.flammability) return liquid;
  }
  return floor;
};

// ── Liquid / gas flow (rebuild spec §6.2–6.3) ────────────────────────────────
// One flow iteration advances each liquid frontier up to its material's
// flowRate fine cells (water 3 ≈ a macro tile, honey 1 — the two tuning knobs
// for feel are flowRate and iterations-per-move). Liquids run to LOWER LEVEL
// first (height*CHEM_HEIGHT_LEVEL + depth), pooling in basins and holding
// slopes when viscous; gases diffuse toward lower concentration and dissipate.
// Mutations are applied sequentially in sorted-key order, so the pass is
// deterministic and volume is conserved exactly.
const runFlowIteration = (
  state: ChemGridState,
  changed: Set<string>,
): void => {
  const { cells, active } = state;
  const orderedActive = Array.from(active).sort();

  // Liquid sub-steps: sub-step s moves only liquids whose flowRate > s, so a
  // fast liquid's frontier advances further per iteration than a slow one's.
  // Rebuild the processing frontier each sub-step so newly-wet cells can carry
  // water onward in the same visible ooze iteration.
  const maxSubSteps = Math.max(
    1,
    ...Array.from(active)
      .map((key) => {
        const cell = cells.get(key);
        return cell?.liquidId ? Math.ceil(getChemMaterial(cell.liquidId).flowRate) : 0;
      })
      .filter((flowRate) => flowRate > 0),
  );
  for (let sub = 0; sub < maxSubSteps; sub += 1) {
    const processKeys = Array.from(new Set([...orderedActive, ...changed])).sort();
    for (const key of processKeys) {
      const cell = cells.get(key);
      if (!cell || !cell.liquidId || cell.axes.frozen) continue;
      if (cell.axes.liquid_volume <= CHEM_MIN_FLOW_DEPTH) continue;
      const liquid = getChemMaterial(cell.liquidId);
      if (liquid.flowArchetype !== "liquid") continue;
      if (sub >= Math.max(1, liquid.flowRate)) continue;

      const targets: { cell: ChemCell; level: number; key: string }[] = [];
      for (const [dx, dz] of neighbors4) {
        const nKey = cellChemKey(cell.x + dx, cell.z + dz);
        const n = cells.get(nKey);
        if (!n || n.blocksFlow || n.axes.frozen) continue;
        targets.push({
          cell: n,
          key: nKey,
          level: n.height * CHEM_HEIGHT_LEVEL + n.axes.liquid_volume,
        });
      }
      // Lower elevation first, then lower quantity; stable tie-break by key.
      targets.sort((a, b) => a.level - b.level || (a.key < b.key ? -1 : 1));

      for (const target of targets) {
        const volume = cell.axes.liquid_volume;
        if (volume <= CHEM_MIN_FLOW_DEPTH) break;
        const level = cell.height * CHEM_HEIGHT_LEVEL + volume;
        const diff = level - target.level;
        if (diff <= liquid.slopeHold) continue;
        // Move half the level difference, capped for a watchable ooze and by
        // what the source can give without dropping under the residue depth.
        const give = Math.min(
          Math.floor(diff / 2),
          24,
          Math.floor(volume - CHEM_MIN_FLOW_DEPTH / 2),
        );
        if (give <= 0) continue;
        cell.axes.liquid_volume = clamp(volume - give, 0, 400);
        target.cell.axes.liquid_volume = clamp(target.cell.axes.liquid_volume + give, 0, 400);
        if (!target.cell.liquidId) target.cell.liquidId = cell.liquidId;
        // Water wets what it covers; oil/honey remain liquid surfaces without
        // becoming electrical "wetness" for the scalar saturation axis.
        if (liquid.id === "water") {
          target.cell.axes.saturation = clamp(
            Math.max(target.cell.axes.saturation, Math.min(100, target.cell.axes.liquid_volume * 2)),
            0,
            100,
          );
        }
        if (liquid.flammability > 0) {
          target.cell.axes.fuel = clamp(
            Math.max(target.cell.axes.fuel, Math.min(liquid.fuelCapacity, target.cell.axes.liquid_volume * 1.5)),
            0,
            100,
          );
        }
        changed.add(key);
        changed.add(target.key);
        target.level = target.cell.height * CHEM_HEIGHT_LEVEL + target.cell.axes.liquid_volume;
      }
    }
  }

  // Fire frontier (spec §6.2): burning cells ignite flammable neighbours at a
  // per-surface pace — an oil trail or dry grass carries flame two cells per
  // iteration, solid fuels one. Ignition is written as heat (past the
  // material's threshold with margin to survive ambient relaxation), so the
  // ordinary reaction rules still decide burning, suppression, and fuel burn.
  const fireRateOf = (mat: ChemMaterial) =>
    mat.flammability >= 90 ? 2 : mat.flammability > 0 ? 1 : 0;
  for (let sub = 0; sub < 2; sub += 1) {
    const burningKeys = Array.from(new Set([...orderedActive, ...changed]))
      .sort()
      .filter((key) => {
        const cell = cells.get(key);
        return cell ? isBurning(cell.axes, effectiveChemMaterial(cell)) : false;
      });
    for (const key of burningKeys) {
      const cell = cells.get(key)!;
      if (sub >= fireRateOf(effectiveChemMaterial(cell))) continue;
      for (const [dx, dz] of neighbors4) {
        const nKey = cellChemKey(cell.x + dx, cell.z + dz);
        const n = cells.get(nKey);
        if (!n || n.axes.frozen) continue;
        const nMat = effectiveChemMaterial(n);
        if (nMat.flammability <= 0 || n.axes.fuel <= 0) continue;
        if (
          n.axes.saturation >= CHEM_SUPPRESS_SATURATION ||
          n.axes.foam >= CHEM_SMOTHER_FOAM
        )
          continue;
        if (n.axes.temperature >= nMat.ignitionThreshold) continue;
        n.axes.temperature = clamp(nMat.ignitionThreshold + 20, -100, 125);
        changed.add(nKey);
      }
    }
  }

  // Gas diffusion + dissipation (single pass per iteration).
  const gasMat = getChemMaterial("miasma");
  for (const key of orderedActive) {
    const cell = cells.get(key);
    if (!cell || cell.axes.vapor <= 0) continue;
    for (const [dx, dz] of neighbors4) {
      const nKey = cellChemKey(cell.x + dx, cell.z + dz);
      const n = cells.get(nKey);
      if (!n || n.blocksFlow) continue;
      const gradient = cell.axes.vapor - n.axes.vapor;
      if (gradient <= 1) continue;
      const give = Math.max(1, Math.floor(gradient * CHEM_GAS_DIFFUSION));
      cell.axes.vapor = clamp(cell.axes.vapor - give, 0, 100);
      n.axes.vapor = clamp(n.axes.vapor + give, 0, 100);
      changed.add(key);
      changed.add(nKey);
    }
    if (cell.axes.vapor > 0 && gasMat.dissipation > 0) {
      cell.axes.vapor = clamp(cell.axes.vapor - gasMat.dissipation, 0, 100);
      changed.add(key);
    }
  }

  // Settle residues: a film too thin to flow stops being "standing liquid"
  // and remains as wetness (or an oil sheen's fuel).
  for (const key of changed) {
    const cell = cells.get(key);
    if (!cell) continue;
    if (cell.liquidId && cell.axes.liquid_volume < 1) {
      cell.axes.liquid_volume = 0;
      cell.liquidId = undefined;
    }
  }
};

// Advance an active-set grid one reaction tick plus `flowIterations` flow
// passes, in place. Returns the reactions plus the set of cells that changed;
// the state's active set is re-derived from the changes (changed cells and
// their neighbours stay live, everything else goes dormant).
export const tickChemistryState = (
  state: ChemGridState,
  options: { ambient?: number; rng?: RNG; flowIterations?: number } = {},
): { reactions: ChemReactionRecord[]; changed: Set<string> } => {
  const result = reactionPass(state, options);
  const flowIterations = options.flowIterations ?? 1;
  for (let i = 0; i < flowIterations; i += 1) {
    runFlowIteration(state, result.changed);
  }
  // Dormancy: only changed cells and their frontier stay in the active set.
  const nextActive = new Set<string>();
  for (const key of result.changed) {
    const cell = state.cells.get(key);
    if (!cell) continue;
    nextActive.add(key);
    for (const [dx, dz] of neighbors4) {
      const nKey = cellChemKey(cell.x + dx, cell.z + dz);
      if (state.cells.has(nKey)) nextActive.add(nKey);
    }
  }
  state.active = nextActive;
  return result;
};

// Advance the whole grid one tick using a fixed substep order so saves/replays
// are stable. Reads from `cells` (treated as immutable `prev`) and returns a new
// map. An optional seeded RNG is accepted for future probabilistic spread; the
// current rules are fully deterministic. (Legacy whole-grid entry point — the
// runtime uses tickChemistryState with a persistent active set instead.)
export const tickChemistryGrid = (
  cells: Map<string, ChemCell>,
  options: { ambient?: number; rng?: RNG; flowIterations?: number } = {},
): ChemTickResult => {
  const next = new Map<string, ChemCell>();
  for (const [key, cell] of cells) {
    next.set(key, { ...cell, axes: cloneAxes(cell.axes) });
  }
  const state = allActiveChemState(next);
  const { reactions } = tickChemistryState(state, options);
  return { cells: next, reactions };
};

// The reaction pass: heat transfer, fire, evaporation, freeze/melt,
// electricity, foam — the original scalar-axis rules, restricted to the
// active set. Reads neighbour values from a snapshot taken before the pass so
// ordering does not leak into physics.
const reactionPass = (
  state: ChemGridState,
  options: { ambient?: number; rng?: RNG } = {},
): { reactions: ChemReactionRecord[]; changed: Set<string> } => {
  const ambient = options.ambient ?? CHEM_AMBIENT_TEMPERATURE;
  const reactions: ChemReactionRecord[] = [];
  const changed = new Set<string>();
  const grid = state.cells;

  // Snapshot the active cells (and their neighbours are read directly from
  // the live grid — dormant neighbours are stable by definition).
  const prevAxes = new Map<string, ChemAxes>();
  const orderedKeys = Array.from(state.active).sort();
  for (const key of orderedKeys) {
    const cell = grid.get(key);
    if (cell) prevAxes.set(key, cloneAxes(cell.axes));
  }
  const prevAxesAt = (x: number, z: number): ChemAxes | undefined => {
    const key = cellChemKey(x, z);
    return prevAxes.get(key) || grid.get(key)?.axes;
  };
  const prevCellAt = (x: number, z: number): ChemCell | undefined =>
    grid.get(cellChemKey(x, z));

  // Arc targets are collected here and applied AFTER the main loop, so a
  // neighbour's own charge-decay step can't clobber an arc written into it.
  const chargeBoost = new Map<string, number>();

  const axesMeaningfullyChanged = (before: ChemAxes, after: ChemAxes): boolean =>
    Math.abs(before.temperature - after.temperature) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.saturation - after.saturation) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.charge - after.charge) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.integrity - after.integrity) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.foam - after.foam) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.fuel - after.fuel) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.scorch - after.scorch) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.liquid_volume - after.liquid_volume) > CHEM_ACTIVE_EPSILON ||
    Math.abs(before.vapor - after.vapor) > CHEM_ACTIVE_EPSILON ||
    before.frozen !== after.frozen;

  for (const key of orderedKeys) {
    const cell = grid.get(key);
    if (!cell) continue;
    const out = cell;
    const mat = effectiveChemMaterial(cell);
    const a = prevAxes.get(key)!;
    out.axes = cloneAxes(a);

    // ── Step 1: heat transfer + relaxation toward ambient ──
    let heatDelta = 0;
    for (const [dx, dz] of neighbors4) {
      const nCell = prevCellAt(cell.x + dx, cell.z + dz);
      if (!nCell) continue;
      const nAxes = prevAxesAt(cell.x + dx, cell.z + dz)!;
      const nMat = effectiveChemMaterial(nCell);
      if (isBurning(nAxes, nMat)) {
        heatDelta += CHEM_HEAT_EMISSION * (1 - mat.thermalMass / 200);
      } else {
        heatDelta += (nAxes.temperature - a.temperature) * CHEM_CONDUCTION_FACTOR;
      }
    }
    let temperature = a.temperature + heatDelta;
    // Relaxation toward ambient, slower for high thermal mass.
    const relax = clamp((100 - mat.thermalMass) / 8, 1.5, 12);
    if (temperature > ambient) temperature = Math.max(ambient, temperature - relax);
    else if (temperature < ambient) temperature = Math.min(ambient, temperature + relax);
    out.axes.temperature = clamp(temperature, -100, 125);

    // ── Step 2: fire (ignition / burning / suppression / extinguish) ──
    // A cell ignites when its (post-transfer) temperature crosses the material's
    // ignition threshold, and — crucially — once lit it SUSTAINS itself as long
    // as it has fuel and isn't suppressed, rather than being snuffed out by its
    // own relaxation toward ambient. Suppression uses the cell's incoming state.
    const wasBurning = isBurning(a, mat);
    const canBurn =
      mat.flammability > 0 &&
      a.fuel > 0 &&
      !a.frozen &&
      a.saturation < CHEM_SUPPRESS_SATURATION &&
      a.foam < CHEM_SMOTHER_FOAM;
    const burning = canBurn && (wasBurning || out.axes.temperature >= mat.ignitionThreshold);
    if (burning) {
      out.axes.fuel = clamp(a.fuel - CHEM_BURN_FUEL_RATE, 0, 100);
      out.axes.scorch = clamp(a.scorch + CHEM_SCORCH_RATE, 0, 100);
      out.axes.integrity = clamp(a.integrity - 3, 0, 100);
      out.axes.saturation = clamp(a.saturation - 6, 0, 100);
      // Fire sustains its own heat.
      out.axes.temperature = Math.max(out.axes.temperature, mat.ignitionThreshold + 25);
      reactions.push({ kind: wasBurning ? "burning" : "ignited", cell: [cell.x, cell.z] });
      if (!wasBurning) reactions.push({ kind: "spread", cell: [cell.x, cell.z] });
    } else if (
      mat.flammability > 0 &&
      a.fuel > 0 &&
      a.temperature >= mat.ignitionThreshold &&
      (a.saturation >= CHEM_SUPPRESS_SATURATION || a.foam >= CHEM_SMOTHER_FOAM)
    ) {
      // Hot + fuelled but suppressed: smoulder, accruing some scorch, then cool.
      out.axes.scorch = clamp(a.scorch + CHEM_SCORCH_RATE / 2, 0, 100);
      out.axes.temperature = Math.min(out.axes.temperature, mat.ignitionThreshold * 0.7);
      reactions.push({ kind: "smoldering", cell: [cell.x, cell.z] });
      if (wasBurning) reactions.push({ kind: "extinguished", cell: [cell.x, cell.z], detail: "scorched" });
    } else if (wasBurning) {
      // Ran out of fuel or cooled below ignition — fire is out, scorch remains.
      reactions.push({ kind: "extinguished", cell: [cell.x, cell.z], detail: "scorched" });
    }
    if (out.axes.scorch >= CHEM_SCORCHED_THRESHOLD && a.scorch < CHEM_SCORCHED_THRESHOLD) {
      reactions.push({ kind: "scorched", cell: [cell.x, cell.z] });
    }

    // ── Step 3: saturation — evaporation (+ steam) ──
    // Standing liquid keeps its cell soaked; heat boils volume off into vapor.
    if (out.axes.liquid_volume > 0) {
      out.axes.saturation = clamp(
        Math.max(out.axes.saturation, Math.min(100, out.axes.liquid_volume * 2)),
        0,
        100,
      );
    }
    if (out.axes.temperature > 40 && out.axes.saturation > 0) {
      const evap = clamp((out.axes.temperature - 40) / 12, 1, 8);
      out.axes.saturation = clamp(out.axes.saturation - evap, 0, 100);
      if (out.axes.liquid_volume > 0) {
        out.axes.liquid_volume = clamp(out.axes.liquid_volume - evap * 1.5, 0, 400);
        if (out.axes.temperature >= CHEM_BOIL_HINT) {
          out.axes.vapor = clamp(out.axes.vapor + evap, 0, 100);
        }
        if (out.axes.liquid_volume === 0) cell.liquidId = undefined;
      }
      if (out.axes.temperature >= CHEM_BOIL_HINT) {
        reactions.push({ kind: "steam", cell: [cell.x, cell.z] });
        out.axes.temperature = clamp(out.axes.temperature - 4, -100, 125); // evaporative cooling
      } else if (out.axes.saturation === 0) {
        reactions.push({ kind: "dried", cell: [cell.x, cell.z] });
      }
    }

    // ── Step 4: freeze / melt ──
    if (out.axes.temperature <= CHEM_FREEZE_POINT && out.axes.saturation >= 25 && !out.axes.frozen) {
      out.axes.frozen = true;
      reactions.push({ kind: "froze", cell: [cell.x, cell.z] });
    } else if (out.axes.frozen && out.axes.temperature > CHEM_MELT_POINT) {
      out.axes.frozen = false;
      reactions.push({ kind: "melted", cell: [cell.x, cell.z] });
    }

    // ── Step 5: electricity — decay this cell, record arcs for after the loop ──
    out.axes.charge = clamp(a.charge - (a.charge >= 25 ? 20 : 8), 0, 100);
    if (a.charge >= 25) {
      for (const [dx, dz] of neighbors4) {
        const nKey = cellChemKey(cell.x + dx, cell.z + dz);
        const nPrev = grid.get(nKey);
        if (!nPrev) continue;
        const nAxes = prevAxesAt(cell.x + dx, cell.z + dz)!;
        const nMat = getChemMaterial(nPrev.materialId);
        const conducts = nMat.conductivity >= 50 || nAxes.saturation >= 25;
        if (!conducts) continue;
        const transferred = a.charge * 0.7 * (1 - nAxes.foam / 100);
        if (transferred > (chargeBoost.get(nKey) || 0)) chargeBoost.set(nKey, transferred);
      }
    }

    // ── Step 6: foam degradation (chars when hot) ──
    if (out.axes.foam > 0) {
      const decay = out.axes.temperature > 60 ? 12 : 4;
      out.axes.foam = clamp(out.axes.foam - decay, 0, 100);
      if (out.axes.temperature > 60) out.axes.scorch = clamp(out.axes.scorch + 2, 0, 100);
    }

    if (axesMeaningfullyChanged(a, out.axes)) changed.add(key);
  }

  // Apply electrical arcs after the main loop so they survive each target's own
  // decay step. An arc only ever raises a target's charge (max), never lowers it.
  for (const [key, boost] of chargeBoost) {
    const target = grid.get(key);
    if (!target) continue;
    if (boost > target.axes.charge) {
      target.axes.charge = clamp(boost, 0, 100);
      reactions.push({ kind: "arc", cell: [target.x, target.z] });
      changed.add(key);
    }
  }

  return { reactions, changed };
};

// ── Authoring seed ───────────────────────────────────────────────────────────
// Build initial axes for a cell from its authored surface tag / terrain. Object
// materials (crates etc.) are layered on by the caller.
export interface ChemSeedInput {
  surfaceTag?: string; // "water" | "oil" | "ice" | "poison" | "blood" | "firehazard" | "none"
  terrain?: string;
  materialId?: string;
  // Authored simulation height of the cell (macro-uniform per tile) — liquids
  // flow downhill across these.
  height?: number;
  // Unwalkable cells (walls) block liquid/gas flow.
  walkable?: boolean;
}

export const seedCellChem = (x: number, z: number, input: ChemSeedInput): ChemCell => {
  const surface = (input.surfaceTag || "none").toLowerCase();
  const terrain = (input.terrain || "").toLowerCase();

  let materialId = input.materialId || "floor";
  let liquidId: string | undefined;
  const axes = defaultAxes();

  if (surface === "oil" || terrain.includes("oil")) {
    materialId = "oil";
    axes.fuel = 100;
    liquidId = "oil";
    axes.liquid_volume = 30;
  } else if (surface === "water" || terrain.includes("water")) {
    materialId = "water";
    axes.saturation = 90;
    liquidId = "water";
    axes.liquid_volume = 45;
  } else if (terrain.includes("honey")) {
    materialId = "floor";
    liquidId = "honey";
    axes.liquid_volume = 60;
    axes.saturation = 20;
  } else if (surface === "ice" || terrain.includes("ice")) {
    materialId = "water";
    axes.saturation = 85;
    axes.temperature = -15;
    axes.frozen = true;
    axes.liquid_volume = 40;
    liquidId = "water";
  } else if (surface === "firehazard") {
    materialId = materialId === "floor" ? "wood" : materialId;
    axes.fuel = Math.max(axes.fuel, 80);
    axes.temperature = 95; // already alight
  } else if (terrain.includes("grass")) {
    materialId = "grass";
    axes.fuel = 60;
  } else if (!input.materialId) {
    materialId = "floor";
  }

  // Material-default fuel for solid flammables when not otherwise set.
  const mat = getChemMaterial(materialId);
  if (axes.fuel === 0 && mat.fuelCapacity > 0) axes.fuel = mat.fuelCapacity;

  // An authored pool is a resting body, not a spill: sink its bed one height
  // step so it reads as a shallow basin. Interior cells sit in equilibrium
  // (dormant, ~zero cost) and the pool only overflows if something raises its
  // level — pouring more liquid in makes it visibly brim over the lip.
  const basin = liquidId ? 1 : 0;
  return {
    x,
    z,
    materialId,
    axes,
    liquidId,
    height: Math.floor(input.height ?? 0) - basin,
    blocksFlow: input.walkable === false,
  };
};

// ── Projection helpers (axes → existing render/sim tokens) ───────────────────
// The renderer already tints surface tokens (water/oil/ice/…) and draws
// environment fields (fire/smoke). We project the DERIVED conditions back onto
// those tokens so visuals/perception keep working while axes stay authoritative.
export const chemSurfaceTokens = (axes: ChemAxes, mat: ChemMaterial): string[] => {
  const tokens: string[] = [];
  if (axes.frozen) tokens.push("ice");
  else if (axes.saturation >= 25) tokens.push("water");
  if (mat.tags.includes("oil") && axes.fuel > 0 && !axes.frozen) tokens.push("oil");
  if (mat.tags.includes("honey") && axes.liquid_volume > 0 && !axes.frozen) tokens.push("honey");
  if (axes.foam >= 40) tokens.push("foam");
  if (axes.scorch >= CHEM_SCORCHED_THRESHOLD) tokens.push("scorched");
  return tokens;
};

export const chemEnvironmentTokens = (axes: ChemAxes, mat: ChemMaterial): string[] => {
  const tokens: string[] = [];
  if (isBurning(axes, mat)) {
    tokens.push("fire");
    tokens.push("smoke");
  } else if (isSmoldering(axes, mat)) {
    tokens.push("smoke");
  }
  if (axes.charge >= 25) tokens.push("electricity");
  // Standing gas concentration renders as a poison cloud.
  if (axes.vapor >= 8) tokens.push("poison_gas");
  return tokens;
};

// Status effects a cell's chemistry inflicts on an actor standing in it.
export const chemActorStatusEffects = (
  axes: ChemAxes,
  mat: ChemMaterial,
): { status_id: string; duration: number; magnitude: number }[] => {
  const effects: { status_id: string; duration: number; magnitude: number }[] = [];
  if (isBurning(axes, mat)) effects.push({ status_id: "burn", duration: 2, magnitude: 2 });
  if (axes.frozen) effects.push({ status_id: "slow", duration: 2, magnitude: 1 });
  if (axes.charge >= 25 && axes.saturation >= 25) effects.push({ status_id: "stun", duration: 1, magnitude: 1 });
  // Breathing a thick gas cloud poisons; wading through deep viscous liquid slows.
  if (axes.vapor >= 40) effects.push({ status_id: "poison", duration: 2, magnitude: 1 });
  if (mat.tags.includes("sticky") && axes.liquid_volume >= 15)
    effects.push({ status_id: "slow", duration: 2, magnitude: 1 });
  return effects;
};
