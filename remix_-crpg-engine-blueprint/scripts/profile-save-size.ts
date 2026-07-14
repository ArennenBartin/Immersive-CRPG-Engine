import { gzipSync } from "node:zlib";
import { defaultAxes, type CellChemRecord } from "../src/engine-core/chemistry";
import {
  expandGamePackageToFine,
  FINE_PER_MACRO,
  fineCenterOfMacro,
  fineCoordKey,
} from "../src/engine-core";
import { createEmptyGamePackage, type CellData, type GamePackage, type MapData } from "../src/schema/game";
import type { CellChemRunRecord, PlaySave } from "../src/schema/save";

const MACRO_WIDTH = 120;
const MACRO_HEIGHT = 120;
const FINE_WIDTH = MACRO_WIDTH * FINE_PER_MACRO;
const FINE_HEIGHT = MACRO_HEIGHT * FINE_PER_MACRO;
const PROFILE_MAP_ID = "map_profile_save_size";
const JSON_BUDGET_BYTES = 2 * 1024 * 1024;

const byteSize = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const gzipSize = (value: unknown): number => gzipSync(JSON.stringify(value)).byteLength;
const fmt = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

const makeCells = (): CellData[] => {
  const cells: CellData[] = [];
  for (let z = 0; z < MACRO_HEIGHT; z += 1) {
    for (let x = 0; x < MACRO_WIDTH; x += 1) {
      const edge = x === 0 || z === 0 || x === MACRO_WIDTH - 1 || z === MACRO_HEIGHT - 1;
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable: !edge,
        blocks_los: edge,
        height: 0,
        visual_height: edge ? 1 : 0,
        terrain: "profile_floor",
        object_id: edge ? "obj_wall_block" : "obj_floor_plate",
        surface_tag: "none",
      });
    }
  }
  return cells;
};

const makePackage = (): GamePackage => {
  const base = createEmptyGamePackage();
  const center = fineCenterOfMacro([Math.floor(MACRO_WIDTH / 2), Math.floor(MACRO_HEIGHT / 2)]);
  const authoredCenter = [Math.floor(MACRO_WIDTH / 2), Math.floor(MACRO_HEIGHT / 2)] as [number, number];
  const map: MapData = {
    id: PROFILE_MAP_ID,
    display_name: "Save Size Profile Map",
    width: MACRO_WIDTH,
    height: MACRO_HEIGHT,
    cells: makeCells(),
    spawns: [{ id: "spawn_profile", cell: authoredCenter, facing: [0, -1] }],
    custom_object_placements: [],
    entity_placements: [],
    item_placements: [],
    container_placements: [],
    props: [],
    triggers: [],
    exits: [],
  };
  const expanded = expandGamePackageToFine({
    ...base,
    metadata: {
      ...base.metadata,
      start_map_id: PROFILE_MAP_ID,
      start_spawn_id: "spawn_profile",
    },
    settings: {
      ...base.settings,
      fog_los_resolution: "macro",
    },
    maps: [map],
  });
  // Touch the computed center so this script fails loudly if the imported
  // coordinate helper changes shape.
  if (center[0] < 0 || center[1] < 0) throw new Error("invalid profile center");
  return expanded;
};

const makeSave = (gamePackage: GamePackage): PlaySave => {
  const map = gamePackage.maps.find((candidate) => candidate.id === PROFILE_MAP_ID)!;
  const spawn = map.spawns[0];
  return {
    schema: "crpg_engine_save_v1",
    package_version: gamePackage.metadata.version,
    fine_ratio: FINE_PER_MACRO,
    current_map_id: PROFILE_MAP_ID,
    player: { cell: [...spawn.cell] as [number, number], facing: [0, -1], sprite_id: "spr_player" },
    playerStats: { hp: 24, max_hp: 24, mp: 12, max_mp: 12, attack: 5, defense: 2, speed: 10, energy: 1000 },
    level: 1,
    experience: 0,
    pending_level_ups: 0,
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    map_deltas: {},
    clock_minutes: 540,
    faction_rep: {},
    read_documents: [],
    in_combat: false,
    combat_queue: [],
    active_turn_id: "player",
    combat_xp_pool: 0,
  };
};

const allMacroFogKeys = (): string[] => {
  const keys: string[] = [];
  for (let z = 0; z < MACRO_HEIGHT; z += 1) {
    for (let x = 0; x < MACRO_WIDTH; x += 1) keys.push(fineCoordKey(x, z));
  }
  return keys;
};

const allFineFogKeys = (): string[] => {
  const keys: string[] = [];
  for (let z = 0; z < FINE_HEIGHT; z += 1) {
    for (let x = 0; x < FINE_WIDTH; x += 1) keys.push(fineCoordKey(x, z));
  }
  return keys;
};

const waterRecord = (): CellChemRecord => ({
  material_id: "water",
  liquid_id: "water",
  ...defaultAxes({ saturation: 100, liquid_volume: 90 }),
  updated_at_tick: 540,
});

const floodedFineBounds = () => ({
  x0: Math.floor(FINE_WIDTH * 0.25),
  x1: Math.floor(FINE_WIDTH * 0.75) - 1,
  z0: Math.floor(FINE_HEIGHT * 0.25),
  z1: Math.floor(FINE_HEIGHT * 0.75) - 1,
});

const pointChemistry = (): Record<string, CellChemRecord> => {
  const bounds = floodedFineBounds();
  const records: Record<string, CellChemRecord> = {};
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) records[fineCoordKey(x, z)] = waterRecord();
  }
  return records;
};

const runChemistry = (): CellChemRunRecord[] => {
  const bounds = floodedFineBounds();
  const runs: CellChemRunRecord[] = [];
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    runs.push({ z, x0: bounds.x0, x1: bounds.x1, record: waterRecord() });
  }
  return runs;
};

const activeFrontier = (): string[] => {
  const bounds = floodedFineBounds();
  const keys: string[] = [];
  for (let x = bounds.x0; x <= bounds.x1; x += 1) {
    keys.push(fineCoordKey(x, bounds.z0), fineCoordKey(x, bounds.z1));
  }
  for (let z = bounds.z0 + 1; z < bounds.z1; z += 1) {
    keys.push(fineCoordKey(bounds.x0, z), fineCoordKey(bounds.x1, z));
  }
  return keys;
};

const report = (label: string, save: PlaySave) => {
  const json = byteSize(save);
  const gzip = gzipSize(save);
  console.log(`${label.padEnd(28)} json=${fmt(json).padStart(9)} gzip=${fmt(gzip).padStart(9)}`);
  return { json, gzip };
};

const gamePackage = makePackage();
const base = makeSave(gamePackage);
const macroFog = { ...base, explored_cells: { [PROFILE_MAP_ID]: allMacroFogKeys() } };
const fineFog = { ...base, explored_cells: { [PROFILE_MAP_ID]: allFineFogKeys() } };
const pointFlood = {
  ...macroFog,
  chemistry: { [PROFILE_MAP_ID]: pointChemistry() },
  chemistry_active: { [PROFILE_MAP_ID]: activeFrontier() },
};
const runFlood = {
  ...macroFog,
  chemistry_runs: { [PROFILE_MAP_ID]: runChemistry() },
  chemistry_active: { [PROFILE_MAP_ID]: activeFrontier() },
};

console.log("save-size profile");
console.log(`map: ${MACRO_WIDTH}x${MACRO_HEIGHT} macro, ${FINE_WIDTH}x${FINE_HEIGHT} fine, ratio ${FINE_PER_MACRO}`);
console.log(`budget: ${fmt(JSON_BUDGET_BYTES)} json for macro fog + encoded flooded-region save`);
report("base save", base);
report("macro fog full map", macroFog);
report("fine fog full map", fineFog);
report("point flood + macro fog", pointFlood);
const encoded = report("run flood + macro fog", runFlood);

if (encoded.json > JSON_BUDGET_BYTES) {
  console.error(`save-size profile FAILED: encoded save ${fmt(encoded.json)} exceeds ${fmt(JSON_BUDGET_BYTES)}`);
  process.exit(1);
}

console.log("decision: macro fog remains default; run-encoded chemistry keeps large uniform spills under budget");
