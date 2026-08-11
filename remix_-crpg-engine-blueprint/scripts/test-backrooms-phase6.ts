import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKROOMS_LEVEL0_TEMPLATE_IDS,
  BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  BackroomsPacingPlanSchema,
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE6_AMBIENCE,
  LEVEL0_CMT_PHASE6_AUDIO,
  LEVEL0_CMT_PHASE6_CUTSCENES,
  LEVEL0_CMT_PHASE6_EVENT_PROFILE,
  LEVEL0_CMT_PHASE6_MOTIF,
  backroomsGraphDistance,
  createLevel0CmtBackroomsRecipe,
  generateBackroomsMap,
  installLevel0CmtPhase6Content,
} from "../src/backroomsGen";
import { dispatchV1FireTrigger } from "../src/engine-core/v1Runtime";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { auditGamePackageReferences } from "../src/generation-facing";
import { GamePackageSchema, createEmptyGamePackage } from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";
import { normalizePlaySaveToV2, unwrapPlaySaveV1 } from "../src/schema/v2";
import { macroCellKey } from "../src/dungeonGen/embedding/gridSearch";
import { readBackroomsLevelZeroPartitionWall } from "../src/schema/presets";

console.log("backrooms phase 6: motif, non-combat event, and layered ambience profiles");
assert.equal(LEVEL0_CMT_PHASE6_MOTIF.stages.length, 4);
assert.equal(LEVEL0_CMT_PHASE6_MOTIF.maxOccurrences, 4);
assert.ok(LEVEL0_CMT_PHASE6_MOTIF.minSpacingRooms >= 7);
assert.ok(LEVEL0_CMT_PHASE6_EVENT_PROFILE.events.every((event) => event.kind !== "hostile"));
assert.equal(LEVEL0_CMT_PHASE6_AMBIENCE.layers.filter((layer) => layer.role === "base_hum").length, 1);
assert.ok(LEVEL0_CMT_PHASE6_AMBIENCE.layers.find((layer) => layer.role === "base_hum")?.loop);
assert.ok(LEVEL0_CMT_PHASE6_AMBIENCE.layers
  .filter((layer) => layer.role !== "base_hum")
  .every((layer) => layer.minSpacingRooms >= 6 && layer.maxOccurrences <= 4));
for (const path of [LEVEL0_CMT_PHASE6_AUDIO.humUrl, LEVEL0_CMT_PHASE6_AUDIO.electricalPopUrl]) {
  const wav = readFileSync(`public${path}`);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.ok(wav.length > 10_000, `${path} is not a usable ambience asset`);
}

console.log("backrooms phase 6: deterministic recurrence and protected story islands");
const recipe = createLevel0CmtBackroomsRecipe("phase6-determinism");
const first = generateBackroomsMap({
  recipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
});
const repeated = generateBackroomsMap({
  recipe,
  requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS].reverse(),
});
assert.equal(first.success, true, JSON.stringify(first.diagnostics));
assert.equal(repeated.success, true, JSON.stringify(repeated.diagnostics));
assert.ok(first.graph && first.embedded && first.pacing && first.map);
assert.deepEqual(first.pacing, repeated.pacing);
assert.deepEqual(first.embedded, repeated.embedded);
assert.deepEqual(first.map, repeated.map);
assert.equal(BackroomsPacingPlanSchema.safeParse(first.pacing).success, true);
assert.equal(first.pacing.recurrence.length, 4);
assert.equal(first.pacing.mandatoryHostileActors, 0);
assert.equal(first.map.entity_placements.length, 0);
assert.ok(first.graph.requiredAnchorNodeIds.every((nodeId) => first.pacing!.protectedNodeIds.includes(nodeId)));
assert.ok(first.pacing.recurrence.at(-1)?.protected);
assert.ok(first.pacing.protectedNodeIds.includes(first.pacing.recurrence.at(-1)!.nodeId));

const recurrenceRooms = first.pacing.recurrence.map((occurrence) =>
  first.embedded!.rooms.find((room) => room.nodeId === occurrence.nodeId)!);
assert.ok(recurrenceRooms.every((room) => room.templateId === BACKROOMS_LEVEL0_TEMPLATE_IDS.openOffice));
for (let index = 1; index < first.pacing.recurrence.length; index += 1) {
  assert.ok(
    backroomsGraphDistance(
      first.graph,
      first.pacing.recurrence[index - 1].nodeId,
      first.pacing.recurrence[index].nodeId,
    ) >= LEVEL0_CMT_PHASE6_MOTIF.minSpacingRooms,
    "successive recurrence occurrences violate graph spacing",
  );
}

for (const occurrence of first.pacing.recurrence) {
  const occurrenceToken = occurrence.id;
  const placements = first.map.custom_object_placements.filter((placement) =>
    placement.id?.includes(occurrenceToken));
  const objectIds = new Set(placements.map((placement) => placement.object_id));
  assert.ok(objectIds.has("obj_backrooms_level_zero_carpet_stain"));
  assert.ok(objectIds.has(
    occurrence.stageIndex <= 1
      ? "obj_backrooms_level_zero_dead_ceiling_light"
      : "obj_backrooms_level_zero_ceiling_light",
  ));
  assert.equal(objectIds.has("obj_chair"), occurrence.stageIndex <= 1);
  assert.ok(placements.every((placement) => placement.collision_mode === "none"));
}
for (const nodeId of first.pacing.protectedNodeIds) {
  assert.equal(
    first.map.custom_object_placements.some((placement) =>
      placement.id?.includes(`:light:${nodeId}`)),
    false,
    `generic dressing overwrote protected node ${nodeId}`,
  );
}
const protectedRoomIds = new Set([
  ...first.pacing.protectedNodeIds,
  ...first.pacing.recurrence.map((occurrence) => occurrence.nodeId),
]);
const mapCellsByKey = new Map(
  first.map.cells.map((cell) => [macroCellKey([cell.x, cell.z]), cell]),
);
const partitionOverrides = (first.map.fine_cell_overrides ?? []).filter(
  (override) => Boolean(readBackroomsLevelZeroPartitionWall(
    override.overrides.object_id,
  )),
);
const partitionRuns = new Set(
  partitionOverrides.map((override) => override.overrides.tag),
);
const spawnCell = first.map.spawns[0].cell;
const nearestPartitionDistance = Math.min(...partitionOverrides.map((override) =>
  Math.max(
    Math.abs(Number(override.macro_cell[0]) - Number(spawnCell[0])),
    Math.abs(Number(override.macro_cell[1]) - Number(spawnCell[1])),
  )));
assert.ok(partitionRuns.size >= 6, "large Phase 6 maps need repeated office partitions");
assert.ok(
  nearestPartitionDistance <= 32,
  `nearest office partition is outside the opening runtime sector (${nearestPartitionDistance})`,
);
assert.ok(partitionOverrides.every((override) =>
  override.overrides.walkable === false && override.overrides.blocks_los === true),
"office partitions must collide and block sight without sealing their surrounding room",
);
for (const override of partitionOverrides) {
  if (!readBackroomsLevelZeroPartitionWall(override.overrides.object_id)) continue;
  const roomId = mapCellsByKey.get(macroCellKey([
    Number(override.macro_cell[0]),
    Number(override.macro_cell[1]),
  ]))?.room_id;
  assert.equal(
    roomId ? protectedRoomIds.has(roomId) : false,
    false,
    `partition dressing intruded into protected room ${roomId ?? "<unknown>"}`,
  );
}

console.log("backrooms phase 6: novelty debt, sparse events, normal triggers and sockets");
assert.ok(first.pacing.maximumQuietStreak <= recipe.pacing.maxQuietRoomsBeforeNoveltyBoost);
assert.ok(first.pacing.events.length >= 2);
assert.ok(first.pacing.events.length <= LEVEL0_CMT_PHASE6_EVENT_PROFILE.maxEventsPerMap);
assert.ok(first.pacing.events.every((event) => event.kind !== "hostile" && event.once));
for (let left = 0; left < first.pacing.events.length; left += 1) {
  for (let right = left + 1; right < first.pacing.events.length; right += 1) {
    assert.ok(
      backroomsGraphDistance(
        first.graph,
        first.pacing.events[left].nodeId,
        first.pacing.events[right].nodeId,
      ) >= LEVEL0_CMT_PHASE6_EVENT_PROFILE.minSpacingRooms,
      "ambient events are close enough to spam",
    );
  }
}
assert.equal(first.map.triggers.length, first.pacing.events.length);
assert.ok(first.map.triggers.every((trigger) => trigger.type === "step" && trigger.once));
assert.ok(first.pacing.events.every((event) =>
  first.map!.generation_sockets?.some((socket) => socket.source_opportunity_id === event.id)));
assert.ok(first.pacing.recurrence.every((occurrence) =>
  first.map!.generation_sockets?.some((socket) =>
    socket.node_id === occurrence.nodeId && socket.tags.includes("recurrence"))));

console.log("backrooms phase 6: ordinary package references, map validation, and witnessed-event save state");
const basePackage = createEmptyGamePackage();
let gamePackage = GamePackageSchema.parse({
  ...basePackage,
  metadata: {
    ...basePackage.metadata,
    start_map_id: first.map.id,
    start_spawn_id: first.map.spawns[0].id,
  },
  maps: [...basePackage.maps, first.map],
});
gamePackage = installLevel0CmtPhase6Content(gamePackage, {
  mapId: first.map.id,
  recipe,
});
assert.equal(
  (gamePackage.settings.map_music as Record<string, string>)[first.map.id],
  LEVEL0_CMT_PHASE6_AUDIO.humMusicId,
);
assert.equal(
  (gamePackage.settings.music_tracks as Record<string, string>)[LEVEL0_CMT_PHASE6_AUDIO.humMusicId],
  LEVEL0_CMT_PHASE6_AUDIO.humUrl,
);
assert.ok(LEVEL0_CMT_PHASE6_CUTSCENES.every((cutscene) =>
  gamePackage.cutscenes.some((candidate) => candidate.id === cutscene.id && !candidate.is_blocking)));
assert.ok(first.map.triggers.every((trigger) =>
  gamePackage.cutscenes.some((cutscene) => cutscene.id === trigger.cutscene_id)));

const validation = validateOrdinaryMap(first.map, {
  package: gamePackage,
  budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
});
assert.equal(
  validation.valid,
  true,
  JSON.stringify(validation.issues.filter((issue) => issue.severity === "error")),
);
assert.equal(validation.reachableRegions.unreachableCells, 0);
const referenceAudit = auditGamePackageReferences(gamePackage);
assert.equal(
  referenceAudit.issues.filter((issue) => issue.severity === "error").length,
  0,
  JSON.stringify(referenceAudit.issues.filter((issue) => issue.severity === "error")),
);
const roundTrip = GamePackageSchema.parse(JSON.parse(JSON.stringify(gamePackage)));
assert.deepEqual(roundTrip, JSON.parse(JSON.stringify(gamePackage)));

const trigger = first.map.triggers[0];
const makeSave = (flags: Record<string, unknown> = {}): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: first.map!.id,
  player: {
    cell: [first.map!.spawns[0].cell[0], first.map!.spawns[0].cell[1]],
    facing: [first.map!.spawns[0].facing[0], first.map!.spawns[0].facing[1]],
  },
  playerStats: { hp: 24, max_hp: 24, mp: 12, max_mp: 12, attack: 5, defense: 2, speed: 10, energy: 1000 },
  level: 1,
  experience: 0,
  pending_level_ups: 0,
  known_skills: [],
  flags,
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 9 * 60,
  faction_rep: {},
  read_documents: [],
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
});
const fired = dispatchV1FireTrigger({ gamePackage, save: makeSave(), triggerId: trigger.id });
assert.equal(fired.ok, true);
assert.equal(fired.save.flags[`trig_run_${trigger.id}`], true);
const savedAndLoaded = unwrapPlaySaveV1(
  normalizePlaySaveToV2(JSON.parse(JSON.stringify(fired.save))),
);
assert.equal(savedAndLoaded.flags[`trig_run_${trigger.id}`], true);
const repeatedTrigger = dispatchV1FireTrigger({
  gamePackage,
  save: savedAndLoaded,
  triggerId: trigger.id,
});
assert.equal(repeatedTrigger.ok, false);
assert.equal(repeatedTrigger.reason, "trigger already fired");

console.log("backrooms phase 6: 32-seed recurrence and pacing acceptance corpus");
const hashes = new Set<string>();
for (let index = 0; index < 32; index += 1) {
  const seed = `backrooms-phase6-corpus-${String(index).padStart(2, "0")}`;
  const result = generateBackroomsMap({
    recipe: createLevel0CmtBackroomsRecipe(seed),
    requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  });
  assert.equal(result.success, true, `${seed}: ${JSON.stringify(result.diagnostics)}`);
  assert.ok(result.graph && result.embedded && result.pacing && result.map);
  hashes.add(result.pacing.canonicalHash);
  assert.equal(result.pacing.recurrence.length, 4);
  assert.equal(result.pacing.mandatoryHostileActors, 0);
  assert.equal(result.map.entity_placements.length, 0);
  assert.ok(
    result.pacing.maximumQuietStreak <=
      createLevel0CmtBackroomsRecipe(seed).pacing.maxQuietRoomsBeforeNoveltyBoost,
    `${seed}: quiet streak ${result.pacing.maximumQuietStreak}`,
  );
  assert.equal(result.map.triggers.length, result.pacing.events.length);
  assert.ok(result.map.triggers.every((entry) => entry.once));
  assert.ok(result.pacing.events.every((event, eventIndex) =>
    result.pacing!.events.every((other, otherIndex) =>
      eventIndex === otherIndex ||
      backroomsGraphDistance(result.graph!, event.nodeId, other.nodeId) >=
        LEVEL0_CMT_PHASE6_EVENT_PROFILE.minSpacingRooms)));
}
assert.ok(hashes.size >= 28, `expected recurrence/pacing variety, received ${hashes.size}`);

console.log("Backrooms Phase 6 protected anchors, recurrence, ambience, and non-combat pacing passed.");
