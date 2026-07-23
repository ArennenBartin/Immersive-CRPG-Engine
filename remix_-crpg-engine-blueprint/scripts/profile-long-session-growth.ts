// Measures save growth and movement-dispatch cost over a long exploration
// session. Run with: npx tsx scripts/profile-long-session-growth.ts [steps]

import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  dispatchV1MoveEntity,
  getFineGamePackage,
} from "../src/engine-core";
import type { CellData, GamePackage } from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";

const requestedSteps = Math.max(1, Number(process.argv[2] || 3000));
// Keep each authored axis below the large-map streaming threshold so this
// benchmark measures runtime state rather than window materialization.
const width = 40;
const height = Math.max(8, Math.ceil(requestedSteps / (width * 2)) + 2);
const cells: CellData[] = [];
for (let z = 0; z < height; z += 1) {
  for (let x = 0; x < width; x += 1) {
    cells.push({
      x,
      y: 0,
      z,
      active: true,
      height: 0,
      visual_height: 0,
      terrain: "stone",
      surface_tag: "none",
      walkable: true,
      blocks_los: false,
    });
  }
}

const source = createQaSuitePackage();
const authoredPackage: GamePackage = {
  ...source,
  maps: [
    {
      id: "profile_long_session",
      display_name: "Long-session profiler",
      width,
      height,
      ambient_light: 0,
      spawns: [{ id: "start", cell: [0, 0], facing: [1, 0] }],
      cells,
      props: [],
      custom_object_placements: [],
      entity_placements: [],
      item_placements: [],
      container_placements: [],
      regions: [],
      triggers: [],
      exits: [],
    },
  ],
};
const gamePackage = getFineGamePackage(authoredPackage);
const map = gamePackage.maps[0];
let save: PlaySave = {
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: map.id,
  player: { cell: [1, 1], facing: [1, 0] },
  playerStats: {
    hp: 20,
    max_hp: 20,
    mp: 10,
    max_mp: 10,
    attack: 3,
    defense: 1,
    speed: 10,
    energy: 1_000_000,
  },
  known_skills: [],
  flags: {},
  variables: {},
  relationships: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 1,
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
};

let direction = 1;
const segmentSamples: Array<{ end: number; milliseconds: number }> = [];
let segmentStarted = performance.now();
for (let step = 1; step <= requestedSteps; step += 1) {
  const [x, z] = save.player.cell;
  let dx = direction;
  let dz = 0;
  if ((direction > 0 && x >= map.width - 2) || (direction < 0 && x <= 1)) {
    dx = 0;
    dz = 1;
    direction *= -1;
  }
  const moved = dispatchV1MoveEntity({
    gamePackage,
    save,
    actorId: "player",
    dx,
    dy: dz,
    energyCost: 0,
  });
  if (!moved.ok) throw new Error(`movement failed at ${step}: ${moved.reason}`);
  save = moved.save;
  if (step % 500 === 0 || step === requestedSteps) {
    const now = performance.now();
    segmentSamples.push({ end: step, milliseconds: now - segmentStarted });
    segmentStarted = now;
  }
}

const delta = save.map_deltas?.[map.id];
const surfaceLayers = Object.values(delta?.surface_layers || {}).flat();
const environmentFields = Object.values(delta?.environment_fields || {}).flat();
const serializedBytes = Buffer.byteLength(JSON.stringify(save));

console.log(JSON.stringify({
  steps: requestedSteps,
  serialized_bytes: serializedBytes,
  surface_cells: Object.keys(delta?.surface_layers || {}).length,
  surface_layers: surfaceLayers.length,
  environment_cells: Object.keys(delta?.environment_fields || {}).length,
  environment_fields: environmentFields.length,
  world_facts: save.world_facts?.length || 0,
  segment_ms: segmentSamples,
}, null, 2));
