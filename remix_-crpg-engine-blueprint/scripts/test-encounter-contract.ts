import {
  EncounterDefinitionSchema,
  EntityPlacementSchema,
  MapDataSchema,
  type EncounterDefinition,
  type MapData,
} from "../src/schema/game";
import {
  EncounterPlacementError,
  resolveEncounter,
  resolveEncounterPlacements,
  stableJsonStringify,
  type EncounterCell,
  type EncounterPlacementIssueCode,
} from "../src/generation-facing";

let passed = 0;
const check = (label: string, condition: unknown) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const expectIssue = (
  label: string,
  run: () => unknown,
  code: EncounterPlacementIssueCode,
) => {
  let found = false;
  try {
    run();
  } catch (error) {
    found = error instanceof EncounterPlacementError && error.issues.some((issue) => issue.code === code);
  }
  check(label, found);
};

const createMap = (mutate?: (map: MapData) => void): MapData => {
  const cells = [];
  for (let z = 0; z < 7; z += 1) {
    for (let x = 0; x < 7; x += 1) {
      const boundary = x === 0 || z === 0 || x === 6 || z === 6;
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable: !boundary,
        blocks_los: boundary,
        height: boundary ? 1 : 0,
        visual_height: 0,
        terrain: boundary ? "stone_wall" : "stone_floor",
        room_id: "test_room",
        surface_tag: "none" as const,
      });
    }
  }
  const parsed = MapDataSchema.parse({
    id: "encounter_floor",
    display_name: "Encounter Contract Floor",
    width: 7,
    height: 7,
    spawns: [{ id: "spawn_start", cell: [1, 1], facing: [0, 1] }],
    cells,
  });
  mutate?.(parsed);
  return MapDataSchema.parse(parsed);
};

const actors = [
  { id: "ent_guard", is_npc: false },
  { id: "ent_scout", is_npc: false },
  { id: "ent_patroller", is_npc: true },
];

const eligible: EncounterCell[] = [
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],
  [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
  [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
  [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
];

const encounter = EncounterDefinitionSchema.parse({
  id: "enc_watch",
  tags: ["watch", "dungeon"],
  difficulty: 4,
  minArea: 12,
  maxArea: 24,
  slots: [
    { entityId: "ent_guard", role: "frontline", minCount: 2, maxCount: 3 },
    { entityId: "ent_scout", role: "ambush", minCount: 1, maxCount: 1 },
    { entityId: "ent_patroller", role: "patrol", minCount: 1, maxCount: 1 },
  ],
  reinforcementSlots: [
    { entityId: "ent_guard", minCount: 1, maxCount: 2 },
  ],
  environmentalPreferences: [
    { kind: "cover", value: "covered", weight: 2 },
    { kind: "room_tag", value: "test_room", weight: 1, required: true },
  ],
});

console.log("encounter contract: deterministic ordinary placements");
const map = createMap();
const mapBefore = stableJsonStringify(map);
const encounterBefore = stableJsonStringify(encounter);
const first = resolveEncounter({
  encounter,
  map,
  eligibleCells: eligible,
  entities: actors,
  seed: "encounter-seed",
  instanceId: "watch-room-a",
  difficultyBudget: 5,
  approachCell: [1, 1],
});
const second = resolveEncounter({
  encounter,
  map,
  eligibleCells: eligible,
  entities: actors,
  seed: "encounter-seed",
  instanceId: "watch-room-a",
  difficultyBudget: 5,
  approachCell: [1, 1],
});
check("same seed and inputs produce byte-identical placements", stableJsonStringify(first) === stableJsonStringify(second));
check("same inputs produce the same encounter output hash", first.outputHash === second.outputHash);
check("resolver does not mutate the map", stableJsonStringify(map) === mapBefore);
check("resolver does not mutate the encounter definition", stableJsonStringify(encounter) === encounterBefore);
check("every output is an ordinary EntityPlacementData record", first.placements.every((placement) => EntityPlacementSchema.safeParse(placement).success));
check("output contains no special encounter runtime subtype", first.placements.every((placement) => !Object.keys(placement).some((key) => ["encounter", "encounter_id", "encounterId", "role"].includes(key))));
check("stable IDs use the generated map entity namespace", first.placements.every((placement) => placement.id?.startsWith("dg:encounter_floor:entity:")));
check("actor footprint anchors are unique", new Set(first.placements.map((placement) => placement.cell.join(","))).size === first.placements.length);
check("approach/player footprint remains clear", first.placements.every((placement) => placement.cell.join(",") !== "1,1"));
check("resolved counts remain within authored slot bounds", first.resolvedSlots.every((resolved, index) => resolved.count >= encounter.slots[index].minCount && resolved.count <= encounter.slots[index].maxCount));
check("patrol role maps to the supported schedule field for NPCs", first.placements.some((placement) => placement.entity_id === "ent_patroller" && placement.schedule?.length === 2));
check("ambush role resolves through position/facing without extra metadata", first.placements.some((placement) => placement.entity_id === "ent_scout" && placement.facing && !placement.schedule));
check("reinforcements are validated but deferred rather than spawned as a fake wave", first.notices.some((notice) => notice.code === "ENCOUNTER_REINFORCEMENTS_DEFERRED") && first.placements.every((placement) => placement.entity_id !== "ent_missing"));
check("placement-only convenience API returns the same ordinary records", stableJsonStringify(resolveEncounterPlacements({
  encounter,
  map,
  eligibleCells: eligible,
  entities: actors,
  seed: "encounter-seed",
  instanceId: "watch-room-a",
  difficultyBudget: 5,
  approachCell: [1, 1],
})) === stableJsonStringify(first.placements));

console.log("encounter contract: hazards, roles, and deterministic capacity");
const hazardMap = createMap((draft) => {
  const hazard = draft.cells.find((cell) => cell.x === 2 && cell.z === 2)!;
  hazard.hazard = "acid";
});
const single = EncounterDefinitionSchema.parse({
  id: "enc_single",
  difficulty: 1,
  minArea: 2,
  slots: [{ entityId: "ent_guard", minCount: 1, maxCount: 1 }],
});
const avoidsHazard = resolveEncounter({
  encounter: single,
  map: hazardMap,
  eligibleCells: [[2, 2], [3, 2]],
  entities: actors,
  seed: "hazard-safe",
});
check("hazards are excluded by default", avoidsHazard.placements[0].cell.join(",") === "3,2");
const seeksHazard = resolveEncounter({
  encounter: EncounterDefinitionSchema.parse({
    ...single,
    id: "enc_acid",
    environmentalPreferences: [{ kind: "hazard", value: "acid", weight: 1, required: true }],
  }),
  map: hazardMap,
  eligibleCells: [[2, 2], [3, 2]],
  entities: actors,
  seed: "hazard-required",
});
check("an explicit required hazard preference may select that hazard", seeksHazard.placements[0].cell.join(",") === "2,2");

const hostilePatrol = resolveEncounter({
  encounter: EncounterDefinitionSchema.parse({
    id: "enc_hostile_patrol",
    difficulty: 1,
    minArea: 2,
    slots: [{ entityId: "ent_guard", role: "patrol", minCount: 1, maxCount: 1 }],
  }),
  map,
  eligibleCells: [[2, 1], [3, 1]],
  entities: actors,
  seed: "hostile-patrol",
});
check("unsupported hostile schedules are reported instead of invented", hostilePatrol.notices.some((notice) => notice.code === "ENCOUNTER_PATROL_RUNTIME_UNSUPPORTED") && !hostilePatrol.placements[0].schedule);

console.log("encounter contract: stable validation issue codes");
const withArea = (changes: Partial<EncounterDefinition>): EncounterDefinition => EncounterDefinitionSchema.parse({
  id: "enc_validation",
  difficulty: 1,
  minArea: 1,
  slots: [{ entityId: "ent_guard", minCount: 1, maxCount: 1 }],
  ...changes,
});
expectIssue("invalid authored count ranges fail schema validation", () => resolveEncounter({
  encounter: {
    id: "enc_bad_counts",
    tags: [],
    difficulty: 1,
    minArea: 1,
    slots: [{ entityId: "ent_guard", minCount: 2, maxCount: 1 }],
  } as EncounterDefinition,
  map,
  eligibleCells: [[2, 1]],
  entities: actors,
  seed: "x",
}), "ENCOUNTER_SCHEMA_INVALID");
expectIssue("area below minArea is rejected", () => resolveEncounter({ encounter: withArea({ minArea: 2 }), map, eligibleCells: [[2, 1]], entities: actors, seed: "x" }), "ENCOUNTER_AREA_TOO_SMALL");
expectIssue("area above maxArea is rejected", () => resolveEncounter({ encounter: withArea({ maxArea: 1 }), map, eligibleCells: [[2, 1], [3, 1]], entities: actors, seed: "x" }), "ENCOUNTER_AREA_TOO_LARGE");
expectIssue("difficulty budget is enforced", () => resolveEncounter({ encounter: withArea({ difficulty: 3 }), map, eligibleCells: [[2, 1]], entities: actors, seed: "x", difficultyBudget: 2 }), "ENCOUNTER_DIFFICULTY_BUDGET_EXCEEDED");
expectIssue("missing actor definitions are rejected", () => resolveEncounter({ encounter: withArea({ slots: [{ entityId: "ent_missing", minCount: 1, maxCount: 1 }] }), map, eligibleCells: [[2, 1]], entities: actors, seed: "x" }), "ENCOUNTER_ENTITY_REFERENCE_MISSING");
expectIssue("duplicate eligible footprints are rejected", () => resolveEncounter({ encounter: withArea({}), map, eligibleCells: [[2, 1], [2, 1]], entities: actors, seed: "x" }), "ENCOUNTER_ELIGIBLE_CELL_DUPLICATE");
expectIssue("out-of-bounds eligible cells are rejected", () => resolveEncounter({ encounter: withArea({}), map, eligibleCells: [[99, 99]], entities: actors, seed: "x" }), "ENCOUNTER_CELL_OUT_OF_BOUNDS");
expectIssue("non-walkable eligible cells are rejected", () => resolveEncounter({ encounter: withArea({}), map, eligibleCells: [[0, 0]], entities: actors, seed: "x" }), "ENCOUNTER_CELL_NOT_WALKABLE");
const occupiedMap = createMap((draft) => {
  draft.entity_placements.push({ id: "existing_actor", entity_id: "ent_guard", cell: [2, 1] });
});
expectIssue("occupied actor footprints are rejected", () => resolveEncounter({ encounter: withArea({}), map: occupiedMap, eligibleCells: [[2, 1]], entities: actors, seed: "x" }), "ENCOUNTER_CELL_BLOCKED");
expectIssue("overlapping explicit blocker footprints are rejected", () => resolveEncounter({
  encounter: withArea({}),
  map,
  eligibleCells: [[2, 1]],
  entities: actors,
  seed: "x",
  blockedFootprints: [
    { id: "block-a", cells: [[4, 4]] },
    { id: "block-b", cells: [[4, 4]] },
  ],
}), "ENCOUNTER_BLOCKER_FOOTPRINT_DUPLICATE");

const splitMap = createMap((draft) => {
  for (const cell of draft.cells) {
    if (cell.x === 3) {
      cell.walkable = false;
      cell.blocks_los = true;
    }
  }
});
expectIssue("disconnected candidate footprints are rejected", () => resolveEncounter({ encounter: withArea({ minArea: 2 }), map: splitMap, eligibleCells: [[1, 1], [5, 1]], entities: actors, seed: "x", approachCell: [1, 1] }), "ENCOUNTER_CELL_UNREACHABLE");
expectIssue("missing required environmental preference is rejected", () => resolveEncounter({
  encounter: withArea({ environmentalPreferences: [{ kind: "terrain", value: "lava", weight: 1, required: true }] }),
  map,
  eligibleCells: [[2, 1]],
  entities: actors,
  seed: "x",
}), "ENCOUNTER_REQUIRED_ENVIRONMENT_UNAVAILABLE");
expectIssue("unsupported placement rules are rejected honestly", () => resolveEncounter({
  encounter: withArea({ slots: [{ entityId: "ent_guard", minCount: 1, maxCount: 1, placementRule: "teleport-behind-player" }] }),
  map,
  eligibleCells: [[2, 1]],
  entities: actors,
  seed: "x",
}), "ENCOUNTER_PLACEMENT_RULE_UNSUPPORTED");
expectIssue("minimum actor footprint capacity is enforced", () => resolveEncounter({
  encounter: withArea({ slots: [{ entityId: "ent_guard", minCount: 2, maxCount: 2 }] }),
  map,
  eligibleCells: [[2, 1]],
  entities: actors,
  seed: "x",
}), "ENCOUNTER_CAPACITY_INSUFFICIENT");
expectIssue("schedule-capable patrols require a real route", () => resolveEncounter({
  encounter: withArea({ slots: [{ entityId: "ent_patroller", role: "patrol", minCount: 1, maxCount: 1 }] }),
  map,
  eligibleCells: [[2, 1]],
  entities: actors,
  seed: "x",
}), "ENCOUNTER_PATROL_ROUTE_UNAVAILABLE");

console.log(`encounter contract: ${passed} checks passed`);
