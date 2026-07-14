// Headless proof that the grid chemistry core behaves sensibly (BotW-style on a
// grid). Run with: npx tsx scripts/test-chemistry.ts
//
// Each case asserts an emergent behaviour that the OLD token-matching system
// could not express, and that the user specifically called out: fire spreads
// over wood, ice melts, fire is put out by water but stays scorched, wet
// conducts electricity, and foam smothers fire.

import {
  applyChemImpulse,
  allActiveChemState,
  CHEM_FLOW_ITERATIONS_PER_MOVE,
  CHEM_MATERIALS,
  cellChemKey,
  deriveChemConditions,
  defaultAxes,
  getChemMaterial,
  isBurning,
  seedCellChem,
  tickChemistryGrid,
  tickChemistryState,
  type ChemCell,
} from "../src/engine-core/chemistry";
import {
  advanceChemistryForSave,
  applyChemistryVerbToSave,
  buildAuthoredChemistryGrid,
  initializeAuthoredChemistryForSave,
} from "../src/engine-core/chemistryRuntime";
import { resolveAlderamonticoBehavior } from "../src/engine-core/alderamonticoState";
import { entityStateKey } from "../src/utils/entityState";

let passed = 0;
let failed = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const grid = (cells: ChemCell[]): Map<string, ChemCell> => {
  const map = new Map<string, ChemCell>();
  for (const cell of cells) map.set(cellChemKey(cell.x, cell.z), map.has(cellChemKey(cell.x, cell.z)) ? cell : cell);
  for (const cell of cells) map.set(cellChemKey(cell.x, cell.z), cell);
  return map;
};
const at = (g: Map<string, ChemCell>, x: number, z: number) => g.get(cellChemKey(x, z))!;
const conds = (g: Map<string, ChemCell>, x: number, z: number) =>
  deriveChemConditions(at(g, x, z).axes, getChemMaterial(at(g, x, z).materialId));

const woodCell = (x: number, z: number, axes = {}): ChemCell => ({
  x,
  z,
  materialId: "wood",
  height: 0,
  axes: defaultAxes({ fuel: CHEM_MATERIALS.wood.fuelCapacity, ...axes }),
});

const floorCell = (x: number, z: number, axes = {}, height = 0): ChemCell => ({
  x,
  z,
  materialId: "floor",
  height,
  axes: defaultAxes(axes),
});

// ── 1. Fire spreads over wood ────────────────────────────────────────────────
console.log("chemistry: fire spreads over wood");
{
  // A row of five wood cells; ignite the leftmost.
  let g = grid([woodCell(0, 0), woodCell(1, 0), woodCell(2, 0), woodCell(3, 0), woodCell(4, 0)]);
  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.wood, "burn");
  ok("burn ignites the struck wood cell", isBurning(at(g, 0, 0).axes, CHEM_MATERIALS.wood));

  let frontier = 0;
  for (let tick = 0; tick < 12; tick += 1) {
    g = tickChemistryGrid(g).cells;
    for (let x = 0; x <= 4; x += 1) {
      if (isBurning(at(g, x, 0).axes, CHEM_MATERIALS.wood)) frontier = Math.max(frontier, x);
    }
  }
  ok("fire spread down the wood row", frontier >= 2, `furthest burning x=${frontier}`);
  ok("burned cells accrued scorch", at(g, 0, 0).axes.scorch > 0);
  ok("metal would not have spread it", getChemMaterial("metal").flammability === 0);
}

// ── 2. Ice melts ─────────────────────────────────────────────────────────────
console.log("chemistry: ice melts");
{
  let g = grid([
    { x: 0, z: 0, materialId: "water", height: 0, axes: defaultAxes({ saturation: 90 }) },
  ]);
  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.water, "freeze");
  ok("freeze turns wet water cell to ice", at(g, 0, 0).axes.frozen, `temp=${at(g, 0, 0).axes.temperature}`);
  ok("frozen reads as 'frozen'", conds(g, 0, 0).includes("frozen"));

  for (let tick = 0; tick < 20; tick += 1) g = tickChemistryGrid(g).cells;
  ok("ice melts back toward ambient over time", !at(g, 0, 0).axes.frozen, `temp=${at(g, 0, 0).axes.temperature.toFixed(1)}`);
  ok("melted ice is still wet water", at(g, 0, 0).axes.saturation >= 25);
}

// ── 3. Fire is doused by water but stays scorched ────────────────────────────
console.log("chemistry: douse extinguishes but leaves scorch");
{
  let g = grid([woodCell(0, 0)]);
  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.wood, "burn");
  // Let it burn a few ticks to build up scorch.
  for (let tick = 0; tick < 3; tick += 1) g = tickChemistryGrid(g).cells;
  const scorchWhileBurning = at(g, 0, 0).axes.scorch;
  ok("the crate is burning and scorching", isBurning(at(g, 0, 0).axes, CHEM_MATERIALS.wood) && scorchWhileBurning > 0);

  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.wood, "douse");
  g = tickChemistryGrid(g).cells;
  ok("water puts the fire out", !isBurning(at(g, 0, 0).axes, CHEM_MATERIALS.wood));
  ok("the cell is now wet", at(g, 0, 0).axes.saturation >= 25, `saturation=${at(g, 0, 0).axes.saturation.toFixed(1)}`);
  ok("but it stays scorched", conds(g, 0, 0).includes("scorched"), `scorch=${at(g, 0, 0).axes.scorch}`);
}

// ── 4. Wet conducts electricity ──────────────────────────────────────────────
console.log("chemistry: wet conducts electricity");
{
  // Three floor cells in a row; wet the middle + right, charge the left.
  let g = grid([
    floorCell(0, 0),
    floorCell(1, 0),
    floorCell(2, 0),
  ]);
  at(g, 1, 0).axes = applyChemImpulse(at(g, 1, 0).axes, CHEM_MATERIALS.floor, "wet");
  at(g, 2, 0).axes = applyChemImpulse(at(g, 2, 0).axes, CHEM_MATERIALS.floor, "wet");
  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.floor, "shock");

  const before = at(g, 1, 0).axes.charge;
  g = tickChemistryGrid(g).cells;
  ok("charge arcs into the adjacent wet cell", at(g, 1, 0).axes.charge > before, `wet-cell charge=${at(g, 1, 0).axes.charge.toFixed(1)}`);
  g = tickChemistryGrid(g).cells;
  ok("and chains further along the wet path", at(g, 2, 0).axes.charge > 0, `far wet-cell charge=${at(g, 2, 0).axes.charge.toFixed(1)}`);

  // A dry gap should NOT conduct.
  let g2 = grid([
    floorCell(0, 0),
    floorCell(1, 0), // dry
  ]);
  at(g2, 0, 0).axes = applyChemImpulse(at(g2, 0, 0).axes, CHEM_MATERIALS.floor, "shock");
  g2 = tickChemistryGrid(g2).cells;
  ok("dry ground does not conduct the arc", at(g2, 1, 0).axes.charge === 0);
}

// ── 5. Foam smothers fire ────────────────────────────────────────────────────
console.log("chemistry: foam smothers fire");
{
  let g = grid([woodCell(0, 0)]);
  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.wood, "burn");
  g = tickChemistryGrid(g).cells;
  ok("crate is burning before foam", isBurning(at(g, 0, 0).axes, CHEM_MATERIALS.wood));
  at(g, 0, 0).axes = applyChemImpulse(at(g, 0, 0).axes, CHEM_MATERIALS.wood, "foam");
  ok("foam smothers the fire immediately", !isBurning(at(g, 0, 0).axes, CHEM_MATERIALS.wood));
  ok("cell reads as foamed", conds(g, 0, 0).includes("foamed"));
}

// ── 6. Non-exclusive state: burning AND charged at once ──────────────────────
console.log("chemistry: states overlap (burning + charged)");
{
  const axes = applyChemImpulse(
    applyChemImpulse(defaultAxes({ fuel: 90 }), CHEM_MATERIALS.wood, "burn"),
    CHEM_MATERIALS.wood,
    "shock",
  );
  const c = deriveChemConditions(axes, CHEM_MATERIALS.wood);
  ok(
    "a cell can be burning and charged simultaneously",
    isBurning(axes, CHEM_MATERIALS.wood) && (c.includes("charged") || c.includes("electrified")),
  );
}

// ── 7. Authoring seed maps surfaces to materials/axes ────────────────────────
console.log("chemistry: authoring seed");
{
  ok("oil surface seeds oil material with fuel", seedCellChem(0, 0, { surfaceTag: "oil" }).materialId === "oil");
  ok("water surface seeds saturation", seedCellChem(0, 0, { surfaceTag: "water" }).axes.saturation >= 70);
  ok("ice surface seeds a frozen cell", seedCellChem(0, 0, { surfaceTag: "ice" }).axes.frozen);
}

// ── 8. Phase D flow: height-aware, viscous, active-set, sparse save ───────────
console.log("chemistry: phase D liquid flow");
{
  let downhill = grid([
    {
      x: 0,
      z: 0,
      materialId: "water",
      liquidId: "water",
      height: 1,
      axes: defaultAxes({ saturation: 100, liquid_volume: 90 }),
    },
    floorCell(1, 0, {}, 0),
  ]);
  downhill = tickChemistryGrid(downhill, { flowIterations: 1 }).cells;
  ok(
    "standing water flows downhill into a lower fine cell",
    at(downhill, 1, 0).axes.liquid_volume > 0,
    `target volume=${at(downhill, 1, 0).axes.liquid_volume}`,
  );

  const spillRow = (liquidId: "water" | "honey") =>
    grid(
      Array.from({ length: 5 }, (_, x): ChemCell =>
        x === 0
          ? {
              x,
              z: 0,
              materialId: liquidId === "water" ? "water" : "floor",
              liquidId,
              height: 0,
              axes: defaultAxes({
                saturation: liquidId === "water" ? 100 : 0,
                liquid_volume: 120,
              }),
            }
          : floorCell(x, 0),
      ),
    );
  const furthestWet = (g: Map<string, ChemCell>) =>
    Math.max(
      ...Array.from(g.values())
        .filter((cell) => cell.axes.liquid_volume > 0)
        .map((cell) => cell.x),
    );
  const water = tickChemistryGrid(spillRow("water"), { flowIterations: 1 }).cells;
  const honey = tickChemistryGrid(spillRow("honey"), { flowIterations: 1 }).cells;
  ok(
    "low-viscosity water advances farther than honey in one ooze iteration",
    furthestWet(water) > furthestWet(honey),
    `water=${furthestWet(water)} honey=${furthestWet(honey)}`,
  );

  const state = allActiveChemState(spillRow("water"));
  const activeResult = tickChemistryState(state, { flowIterations: CHEM_FLOW_ITERATIONS_PER_MOVE });
  ok("active-set tick reports changed frontier cells", activeResult.changed.size > 0);
  ok("active-set frontier persists for the next ooze step", state.active.size > 0 && state.active.size < 5 * 4);

  const sparsePackage = {
    metadata: { title: "chem sparse", version: "0", start_map_id: "map_sparse" },
    maps: [
      {
        id: "map_sparse",
        display_name: "Sparse Chem Map",
        width: 12,
        height: 1,
        spawns: [],
        cells: Array.from({ length: 12 }, (_, x) => ({ x, z: 0, walkable: true })),
        custom_object_placements: [],
        entity_placements: [],
      },
    ],
    entities: [],
    object_library: [],
    items: [],
  } as unknown as Parameters<typeof applyChemistryVerbToSave>[0];
  const sparseSave = {
    schema: "crpg_engine_save_v1",
    package_version: "0",
    current_map_id: "map_sparse",
    player: { cell: [11, 0], facing: [-1, 0] },
    playerStats: { hp: 20, max_hp: 20, mp: 5, max_mp: 5, attack: 3, defense: 1, speed: 10, energy: 1000 },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as Parameters<typeof applyChemistryVerbToSave>[1];
  const wetted = applyChemistryVerbToSave(sparsePackage, sparseSave, {
    verb: "douse",
    cell: [4, 0],
    mapId: "map_sparse",
  });
  const storedKeys = Object.keys(wetted.save.chemistry?.map_sparse || {});
  ok("runtime chemistry save is sparse", storedKeys.length > 0 && storedKeys.length < 12, `stored=${storedKeys.length}`);
  ok("runtime persists a live active frontier", Boolean(wetted.save.chemistry_active?.map_sparse?.length));

  const runEncodedSave = {
    ...sparseSave,
    chemistry_runs: {
      map_sparse: [
        {
          z: 0,
          x0: 2,
          x1: 7,
          record: {
            material_id: "floor",
            ...defaultAxes({ foam: 80 }),
            updated_at_tick: 1,
          },
        },
      ],
    },
  };
  const advancedRunSave = advanceChemistryForSave(sparsePackage, runEncodedSave, "map_sparse", 1, 2).save;
  ok(
    "runtime loads and preserves run-encoded chemistry deltas",
    Boolean(advancedRunSave.chemistry_runs?.map_sparse?.length) &&
      !advancedRunSave.chemistry?.map_sparse,
  );
}

// ── 9. Actor/tile axis unification ───────────────────────────────────────────
// Doc 05 §2: an actor standing on a chemistry cell reads that cell's axes into
// its own physical state, takes the matching statuses, and the physical state
// crosstalks into the emotional layer — a burning creature panics.
console.log("chemistry: actors read the cell's axes (unification)");
{
  const wolfKey = entityStateKey("map_chem", "ent_wolf", 0);
  const gp = {
    metadata: { title: "chem", version: "0", start_map_id: "map_chem" },
    maps: [
      {
        id: "map_chem",
        display_name: "Chem Map",
        width: 4,
        height: 1,
        spawns: [],
        cells: [
          { x: 0, z: 0, walkable: true, surface_tag: "firehazard" },
          { x: 1, z: 0, walkable: true, terrain: "grass" },
          { x: 2, z: 0, walkable: true },
          { x: 3, z: 0, walkable: true },
        ],
        custom_object_placements: [],
        entity_placements: [{ entity_id: "ent_wolf", cell: [1, 0] }],
      },
    ],
    entities: [
      { id: "ent_wolf", display_name: "Wolf", is_npc: false, max_hp: 12, attack: 2, defense: 0, speed: 10 },
    ],
    object_library: [],
    items: [],
  } as unknown as Parameters<typeof applyChemistryVerbToSave>[0];
  const save = {
    schema: "crpg_engine_save_v1",
    package_version: "0",
    current_map_id: "map_chem",
    player: { cell: [3, 0], facing: [-1, 0] },
    playerStats: { hp: 20, max_hp: 20, mp: 5, max_mp: 5, attack: 3, defense: 1, speed: 10, energy: 1000 },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as Parameters<typeof applyChemistryVerbToSave>[1];

  // Burn the wolf's grass cell directly: it ignites under its feet.
  const burned = applyChemistryVerbToSave(gp, save, { verb: "burn", cell: [1, 0], mapId: "map_chem" });
  ok("burn verb resolves", burned.ok);
  const wolfExposure = burned.exposures.find((exposure) => exposure.actor_id === wolfKey);
  ok("the wolf's exposure is reported", Boolean(wolfExposure), JSON.stringify(burned.exposures));
  ok("the wolf reads as On Fire", Boolean(burned.save.actor_physical_states?.[wolfKey]?.labels.includes("On Fire")));
  ok(
    "newly-gained labels are flagged for feedback",
    Boolean(wolfExposure?.new_labels.includes("On Fire")),
  );
  ok(
    "the burning cell applies a burn status to the NPC",
    Boolean(burned.save.entity_states?.[wolfKey]?.statuses?.some((status) => status.id === "burn")),
  );
  const wolfEmotional = burned.save.alderamontico_state?.actors?.[wolfKey];
  ok("physical exposure crosstalks into the emotional layer", Boolean(wolfEmotional));
  ok("being on fire is frightening (arousal up)", (wolfEmotional?.emotional_axes.arousal ?? 0) > 30);
  ok("being on fire is miserable (valence down)", (wolfEmotional?.emotional_axes.valence ?? 100) < 50);

  // Sustained burning drives the wolf into flee behavior.
  let panicked = burned.save;
  for (let i = 0; i < 4; i += 1) {
    panicked = advanceChemistryForSave(gp, panicked, "map_chem", 1, 2 + i).save;
  }
  ok(
    "a creature left burning panics into flee behavior",
    resolveAlderamonticoBehavior(panicked, wolfKey) === "flee",
  );

  // Move the wolf out of the fire: its body fades back toward neutral and the
  // record is eventually dropped.
  let escaped = {
    ...panicked,
    entity_states: {
      ...(panicked.entity_states || {}),
      [wolfKey]: { ...(panicked.entity_states?.[wolfKey] || {}), cell: [3, 0] },
    },
    player: { ...panicked.player, cell: [2, 0] },
  } as typeof panicked;
  for (let i = 0; i < 8; i += 1) {
    escaped = advanceChemistryForSave(gp, escaped, "map_chem", 1, 10 + i).save;
  }
  const lingering = escaped.actor_physical_states?.[wolfKey];
  ok(
    "leaving the fire decays the body state until it drops",
    !lingering || !lingering.labels.includes("On Fire"),
    JSON.stringify(lingering),
  );
}

// ── 10. Ordinary authored initial chemistry ─────────────────────────────────
// Dungeon baking writes this same CellData field; the runtime must therefore
// preserve every authored axis without a generator-specific map format.
console.log("chemistry: ordinary authored initial state");
{
  const gp = {
    metadata: { title: "authored chemistry", version: "0", start_map_id: "map_authored" },
    maps: [
      {
        id: "map_authored",
        display_name: "Authored Chemistry",
        width: 2,
        height: 1,
        spawns: [],
        cells: [
          {
            x: 0,
            y: 0,
            z: 0,
            active: true,
            walkable: true,
            blocks_los: false,
            height: 0,
            visual_height: 0,
            surface_tag: "none",
            initial_chemistry: {
              material_id: "metal",
              liquid_id: "water",
              temperature: -12,
              saturation: 82,
              charge: 73,
              integrity: 64,
              foam: 31,
              fuel: 22,
              stability: 58,
              scorch: 17,
              frozen: true,
              liquid_volume: 140,
              vapor: 44,
            },
          },
          {
            x: 1,
            y: 0,
            z: 0,
            active: true,
            walkable: true,
            blocks_los: false,
            height: 0,
            visual_height: 0,
            surface_tag: "none",
          },
        ],
        custom_object_placements: [],
        entity_placements: [],
      },
    ],
    entities: [],
    object_library: [],
    items: [],
  } as unknown as Parameters<typeof buildAuthoredChemistryGrid>[0];
  const seeded = buildAuthoredChemistryGrid(gp, "map_authored");
  const authored = at(seeded, 0, 0);
  ok("authored material and liquid seed the ordinary runtime grid", authored.materialId === "metal" && authored.liquidId === "water");
  ok("authored thermal and phase axes survive exactly", authored.axes.temperature === -12 && authored.axes.frozen && authored.axes.liquid_volume === 140);
  ok("authored reaction axes survive exactly", authored.axes.charge === 73 && authored.axes.foam === 31 && authored.axes.vapor === 44);
  ok("authored durability axes survive exactly", authored.axes.integrity === 64 && authored.axes.stability === 58 && authored.axes.scorch === 17);

  const save = {
    schema: "crpg_engine_save_v1",
    package_version: "0",
    current_map_id: "map_authored",
    player: { cell: [1, 0], facing: [-1, 0] },
    playerStats: { hp: 20, max_hp: 20, mp: 5, max_mp: 5, attack: 3, defense: 1, speed: 10, energy: 1000 },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as Parameters<typeof initializeAuthoredChemistryForSave>[1];
  const initialized = initializeAuthoredChemistryForSave(gp, save, "map_authored", 1);
  ok("first map entry activates authored chemistry", Boolean(initialized.chemistry_active?.map_authored?.length));
  ok("first map entry projects authored chemistry for rendering", Boolean(initialized.map_deltas?.map_authored));
  ok("initialization is idempotent once chemistry is live", initializeAuthoredChemistryForSave(gp, initialized, "map_authored", 2) === initialized);
}

console.log("");
if (failed === 0) {
  console.log(`chemistry: all ${passed} checks passed`);
} else {
  console.log(`chemistry: ${failed} FAILED, ${passed} passed`);
  process.exit(1);
}
