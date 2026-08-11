import assert from "node:assert/strict";

import {
  BackroomsDefinitionLibrarySchema,
  BackroomsTransitionRuleSchema,
  DEFAULT_TRANSITION_COMFORT_SETTINGS,
  TransitionPresentationProfileSchema,
  createBackroomsCrossLevelExit,
  resolveBackroomsCrossLevelRoute,
  resolveTransitionPresentationActions,
} from "../src/backroomsGen";
import {
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL0_CMT_PHASE6_EVENT_PROFILE,
  LEVEL0_CMT_PHASE6_MOTIF,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
} from "../src/backroomsGen/presets/level0Cmt";
import {
  LEVEL0_TO_LEVEL1_PRESENTATION,
  LEVEL0_TO_LEVEL1_TRANSITION,
  LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL1_TO_LEVEL0_PRESENTATION,
  LEVEL1_TO_LEVEL0_TRANSITION,
} from "../src/backroomsGen/presets/level1Cmt";
import {
  buildConditionContext,
  dispatchV1ChangeMap,
  findEligibleRegionTransitionTriggers,
} from "../src/engine-core";
import { stableContentHash } from "../src/generation-facing/stableHash";
import {
  GamePackageSchema,
  MapDataSchema,
  TriggerSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";
import {
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";
import {
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP,
  GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP,
  GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
  GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE,
} from "../src/data/qaSuite/generatedBackroomsPhase6Wing";

console.log("backrooms phase 10: generic transition profiles and comfort modes");
for (const kind of [
  "threshold",
  "door",
  "noclip",
  "fall",
  "portal",
  "scripted",
] as const) {
  assert.equal(
    BackroomsTransitionRuleSchema.safeParse({
      id: `transition.test.${kind}`,
      name: kind,
      fromLevelProfileId: "level.a",
      toLevelProfileId: "level.b",
      kind,
    }).success,
    true,
  );
}

const presentation = TransitionPresentationProfileSchema.parse({
  id: "presentation.test",
  name: "Test presentation",
  actions: [
    {
      type: "screen_tint",
      color: "#111111",
      peakOpacity: 0.9,
      attackMs: 100,
      holdMs: 80,
      releaseMs: 500,
    },
    {
      type: "screen_pulse",
      color: "#ffffff",
      peakOpacity: 0.7,
      durationMs: 160,
      repetitions: 3,
    },
    {
      type: "play_sound",
      soundId: "transition_hit",
      volume: 0.9,
      playbackRate: 1,
    },
  ],
});
assert.deepEqual(
  resolveTransitionPresentationActions(
    presentation,
    DEFAULT_TRANSITION_COMFORT_SETTINGS,
  ),
  presentation.actions,
);
const reduced = resolveTransitionPresentationActions(presentation, {
  reducedMotion: true,
  photosensitivity: true,
  audioComfort: "reduced",
});
assert.equal(reduced.some((action) => action.type === "screen_pulse"), false);
const reducedTint = reduced.find((action) => action.type === "screen_tint");
assert.equal(reducedTint?.peakOpacity, 0.2);
assert.equal(reducedTint?.attackMs, 0);
const reducedSound = reduced.find((action) => action.type === "play_sound");
assert.ok(reducedSound?.volume && reducedSound.volume <= 0.22);
assert.equal(
  resolveTransitionPresentationActions(presentation, {
    reducedMotion: false,
    photosensitivity: false,
    audioComfort: "muted",
  }).some((action) => action.type === "play_sound"),
  false,
);

console.log("backrooms phase 10: cross-level definition library");
const library = BackroomsDefinitionLibrarySchema.parse({
  backrooms_recipes: [
    GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
    GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE,
  ],
  backrooms_level_profiles: [
    LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
    LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE,
  ],
  backrooms_transition_rules: [
    LEVEL0_TO_LEVEL1_TRANSITION,
    LEVEL1_TO_LEVEL0_TRANSITION,
  ],
  transition_presentation_profiles: [
    LEVEL0_TO_LEVEL1_PRESENTATION,
    LEVEL1_TO_LEVEL0_PRESENTATION,
  ],
  backrooms_motifs: [LEVEL0_CMT_PHASE6_MOTIF],
  backrooms_event_profiles: [LEVEL0_CMT_PHASE6_EVENT_PROFILE],
  backrooms_anomaly_profiles: [LEVEL0_CMT_PHASE8_ANOMALY_PROFILE],
});
assert.equal(library.backrooms_level_profiles.length, 2);
assert.equal(library.transition_presentation_profiles.length, 2);

const bundledLevel0 = GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP;
const level1 = GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP;
assert.equal(bundledLevel0.generation?.levelProfileId, LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE.id);
assert.equal(level1.generation?.levelProfileId, LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE.id);
assert.notEqual(bundledLevel0.id, level1.id);
assert.match(level1.id, /^brg_level1_/);
assert.equal(bundledLevel0.presentation_profile_id, undefined, "Level 0 baseline must stay drab");
assert.equal(level1.presentation_profile_id, LEVEL0_TO_LEVEL1_PRESENTATION.id);

// Phase 11 does not ship this exit in the Level 0-only demo. Keep testing the
// generic Phase 10 transition system with an isolated two-level fixture.
const fixtureRoute = resolveBackroomsCrossLevelRoute(
  { maps: [bundledLevel0, level1], ...library },
  bundledLevel0.id,
  LEVEL0_TO_LEVEL1_TRANSITION.id,
);
const fixtureThreshold = bundledLevel0.generation_sockets?.find(
  (socket) => socket.kind === "extraction",
);
assert.ok(fixtureRoute && fixtureThreshold);
const level0 = MapDataSchema.parse({
  ...bundledLevel0,
  exits: [
    ...bundledLevel0.exits,
    createBackroomsCrossLevelExit({
      id: "exit.backrooms.level0_to_level1",
      pairedExitId: "exit.backrooms.level1_to_level0",
      cell: [Number(fixtureThreshold.cell[0]), Number(fixtureThreshold.cell[1])],
      route: fixtureRoute,
    }),
  ],
});

const base = createEmptyGamePackage();
const pkg = GamePackageSchema.parse({
  ...base,
  metadata: {
    ...base.metadata,
    start_map_id: level0.id,
    start_spawn_id: level0.spawns[0].id,
  },
  maps: [level0, level1],
  ...library,
});
const route = resolveBackroomsCrossLevelRoute(
  pkg,
  level0.id,
  LEVEL0_TO_LEVEL1_TRANSITION.id,
);
assert.ok(route);
assert.equal(route.targetMap.id, level1.id);
assert.equal(route.targetSpawnId, level1.spawns[0].id);
assert.equal(route.presentationProfile?.id, LEVEL0_TO_LEVEL1_PRESENTATION.id);

const level0Exit = level0.exits.find(
  (exit) => exit.transition_id === LEVEL0_TO_LEVEL1_TRANSITION.id,
);
const level1Exit = level1.exits.find(
  (exit) => exit.transition_id === LEVEL1_TO_LEVEL0_TRANSITION.id,
);
assert.ok(level0Exit && level1Exit);
assert.equal(level0Exit.paired_exit_id, level1Exit.id);
assert.equal(level1Exit.paired_exit_id, level0Exit.id);
assert.equal(level0Exit.transition_kind, "threshold");

const save: PlaySave = {
  schema: "crpg_engine_save_v1",
  package_version: "phase10-test",
  current_map_id: level0.id,
  player: {
    cell: [level0.spawns[0].cell[0], level0.spawns[0].cell[1]],
    facing: [0, 1],
  },
  playerStats: {
    hp: 20,
    max_hp: 20,
    mp: 10,
    max_mp: 10,
    attack: 5,
    defense: 2,
    speed: 10,
    energy: 1_000,
  },
  known_skills: [],
  flags: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 480,
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
};
const beforePhysicalHash = stableContentHash({
  cells: level0.cells,
  overrides: level0.fine_cell_overrides,
});
const changed = dispatchV1ChangeMap({
  gamePackage: pkg,
  save,
  targetMapId: level0Exit.target_map_id,
  targetSpawnId: level0Exit.target_spawn_id,
  exitId: level0Exit.id,
});
assert.equal(changed.ok, true, changed.reason);
assert.equal(changed.save.current_map_id, level1.id);
assert.deepEqual(changed.save.player.cell, level1.spawns[0].cell);
assert.equal(
  stableContentHash({ cells: level0.cells, overrides: level0.fine_cell_overrides }),
  beforePhysicalHash,
  "presentation must not mutate source collision/topology",
);
const restored = unwrapPlaySaveV1(
  normalizePlaySaveToV2(JSON.parse(JSON.stringify(changed.save))),
);
assert.equal(restored.current_map_id, level1.id);
assert.deepEqual(restored.player.cell, level1.spawns[0].cell);

console.log("backrooms phase 10: region enter/exit trigger edges");
const regionTriggers = TriggerSchema.array().parse([
  {
    id: "exit.region.a",
    type: "region_exit",
    region_id: "region.a",
    cutscene_id: "cutscene.exit.a",
    once: true,
  },
  {
    id: "enter.region.b",
    type: "region_enter",
    region_id: "region.b",
    cutscene_id: "cutscene.enter.b",
    once: true,
  },
]);
const emptyConditionContext = buildConditionContext(null);
const regionMatches = findEligibleRegionTransitionTriggers(
  regionTriggers,
  "region.a",
  "region.b",
  emptyConditionContext,
);
assert.deepEqual(regionMatches.map((trigger) => trigger.id), [
  "exit.region.a",
  "enter.region.b",
]);
assert.deepEqual(
  findEligibleRegionTransitionTriggers(
    regionTriggers,
    "region.a",
    "region.a",
    emptyConditionContext,
  ),
  [],
);
assert.equal(
  TriggerSchema.safeParse({
    id: "invalid.region",
    type: "region_enter",
    cutscene_id: "missing.region",
  }).success,
  false,
);

console.log("Backrooms Phase 10 cross-level presentation passed.");
