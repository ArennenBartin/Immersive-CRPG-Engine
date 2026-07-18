// Behavioral contract for movement noise, hearing memory, investigation, and
// the explicit quiet-movement stance. Run with: npm run test:hearing-stealth

import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  advanceImmersivePerceptionForSave,
  dispatchV1DropItem,
  dispatchV1EmitSound,
  dispatchV1MoveEntity,
  dispatchV1TakeItem,
  isPlayerStealthActive,
  resolveMovementHearingSettings,
  setPlayerStealthActive,
  stealthBlockedActionMessage,
  validateHearingStealthAuthoring,
} from "../src/engine-core";
import {
  EventActionSchema,
  type GamePackage,
  type SensoryChannelData,
} from "../src/schema/game";
import type { PlaySave, SimulationEnvironmentFieldRecord } from "../src/schema/save";
import { SUPPORTED_CUTSCENE_ACTION_TYPES } from "../src/engine-core/studioRuntimeSupport";
import { doorPlacementKey } from "../src/utils/doorPlacement";
import { entityPlacementStateKey } from "../src/utils/entityState";

let passed = 0;
let failed = 0;

const check = (label: string, condition: boolean, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
};

const sameCell = (left: unknown, right: [number, number]) =>
  Array.isArray(left) && left[0] === right[0] && left[1] === right[1];

const gamePackage = createQaSuitePackage();
const map = gamePackage.maps.find((candidate) => candidate.id === "qa_perception_lab");
if (!map) throw new Error("QA package is missing qa_perception_lab");
const hunterIndex = map.entity_placements.findIndex(
  (placement) => placement.entity_id === "qa_sound_hunter",
);
if (hunterIndex < 0) throw new Error("QA perception lab is missing qa_sound_hunter");
const hunterKey = entityPlacementStateKey(
  map.id,
  map.entity_placements[hunterIndex],
  hunterIndex,
);

const makeSave = (
  playerCell: [number, number],
  overrides: Partial<PlaySave> = {},
): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: map.id,
  player: { cell: [...playerCell], facing: [0, -1] },
  player_stealth: { active: false, changed_at_tick: 1 },
  playerStats: {
    hp: 20,
    max_hp: 20,
    mp: 10,
    max_mp: 10,
    attack: 3,
    defense: 1,
    speed: 10,
    energy: 1000,
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
  ...overrides,
});

const soundFields = (save: PlaySave): SimulationEnvironmentFieldRecord[] =>
  Object.values(save.map_deltas?.[map.id]?.environment_fields || {}).flat();

const latestFootstep = (save: PlaySave) =>
  soundFields(save)
    .filter(
      (field) =>
        field.kind === "sound" &&
        (field.tag === "footstep" || field.frequency_tag === "footstep"),
    )
    .sort(
      (left, right) =>
        Number(right.stimulus_sequence || 0) - Number(left.stimulus_sequence || 0),
    )[0];

const withHunterChannel = (
  source: GamePackage,
  mutate: (channel: SensoryChannelData) => SensoryChannelData,
): GamePackage => ({
  ...source,
  entities: source.entities.map((entity) => {
    if (entity.id !== "qa_sound_hunter" || !entity.sensory_profile) return entity;
    return {
      ...entity,
      sensory_profile: {
        ...entity.sensory_profile,
        channels: entity.sensory_profile.channels.map((channel) =>
          channel.stimulus_kinds.includes("sound")
            ? mutate({ ...channel })
            : { ...channel },
        ),
      },
    };
  }),
});

console.log("hearing/stealth contract: authored tuning and persistence");
{
  const defaults = resolveMovementHearingSettings(gamePackage);
  const invalidPackage = {
    ...gamePackage,
    settings: {
      ...gamePackage.settings,
      movement_hearing: {
        stealth_noise_multiplier: 0,
        stealth_speed_multiplier: 2,
      },
    },
  };
  const issues = validateHearingStealthAuthoring(invalidPackage);
  check(
    "movement/hearing defaults make stealth quieter, slower, and never perfectly silent",
    defaults.normal_movement_loudness > 0 &&
      defaults.stealth_noise_multiplier >= 0.05 &&
      defaults.stealth_noise_multiplier < 1 &&
      defaults.stealth_speed_multiplier > 0 &&
      defaults.stealth_speed_multiplier < 1,
  );
  check(
    "Studio validation rejects silent/no-cost stealth contradictions",
    issues.some((issue) => issue.code === "movement_hearing_stealth_noise_multiplier_invalid") &&
      issues.some((issue) => issue.code === "movement_hearing_stealth_speed_multiplier_invalid"),
  );
  const active = setPlayerStealthActive(makeSave([0, 8]), true);
  const roundTrip = JSON.parse(JSON.stringify(active)) as PlaySave;
  check(
    "stealth stance is explicit save data and survives JSON/browser persistence",
    isPlayerStealthActive(roundTrip) &&
      roundTrip.player_stealth?.changed_at_tick === active.player_stealth?.changed_at_tick,
  );
  check(
    "blocked-action feedback requires manual stance exit",
    stealthBlockedActionMessage("act") === "Exit stealth mode to do that." &&
      stealthBlockedActionMessage("attack").includes("Exit stealth mode"),
  );
}

console.log("hearing/stealth contract: every movement writes a compact mechanical pulse");
let normalMoved: ReturnType<typeof dispatchV1MoveEntity>;
let quietMoved: ReturnType<typeof dispatchV1MoveEntity>;
{
  normalMoved = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([-7, -2]),
    actorId: "player",
    dx: 0,
    dy: -1,
    energyCost: 300,
  });
  quietMoved = dispatchV1MoveEntity({
    gamePackage,
    save: setPlayerStealthActive(makeSave([-7, -2]), true),
    actorId: "player",
    dx: 0,
    dy: -1,
    energyCost: 300,
  });
  const normal = latestFootstep(normalMoved.save);
  const quiet = latestFootstep(quietMoved.save);
  check(
    "normal walking writes an explicit compact movement stimulus",
    normalMoved.ok &&
      normal?.propagation_mode === "compact" &&
      normal.source_category === "movement_normal" &&
      normal.action === "movement" &&
      normal.reveals_identity === false &&
      sameCell(normal.origin_cell, [-7, -3]) &&
      Number(normal.stimulus_sequence || 0) > 0,
  );
  check(
    "stealth walking remains audible nearby but has a smaller mechanical radius",
    quietMoved.ok &&
      quiet?.source_category === "movement_stealth" &&
      quiet.stimulus_tags?.includes("stealth") === true &&
      Number(quiet.radius || 0) >= 1 &&
      Number(quiet.radius || 0) < Number(normal?.radius || 0),
    `normal=${normal?.radius} quiet=${quiet?.radius}`,
  );
  check(
    "stealth movement spends more world energy as well as using a slower input cadence",
    quietMoved.save.playerStats.energy < normalMoved.save.playerStats.energy,
    `normal=${normalMoved.save.playerStats.energy} quiet=${quietMoved.save.playerStats.energy}`,
  );
}

console.log("hearing/stealth contract: scripted sound is mechanical, authored data");
{
  const action = EventActionSchema.safeParse({
    type: "emit_sound",
    cell: [-7, -3],
    sound_loudness: 3,
    sound_tag: "falling_masonry",
    sound_category: "environment",
    sound_material_tag: "stone",
    sound_duration_ticks: 12,
    reveals_identity: false,
    stimulus_tags: ["impact", "masonry"],
  });
  const emitted = dispatchV1EmitSound({
    gamePackage,
    save: makeSave([-7, -3]),
    mapId: map.id,
    actorId: "script",
    cell: [-7, -3],
    loudness: 9,
    tag: "falling_masonry",
    materialTag: "stone",
    sourceCategory: "environment",
    sourceAction: "scripted_event",
    revealsIdentity: false,
    durationTicks: 12,
    tags: ["scripted", "impact", "masonry"],
    compactPropagation: true,
  });
  const field = soundFields(emitted.save).find(
    (candidate) => candidate.frequency_tag === "falling_masonry",
  );
  check(
    "Studio/runtime supports a distinct emit_sound action instead of inferring hearing from an audio asset",
    action.success && SUPPORTED_CUTSCENE_ACTION_TYPES.has("emit_sound"),
  );
  check(
    "scripted sound dispatch preserves category, tags, duration, location evidence, and non-identity",
    emitted.ok &&
      field?.source_category === "environment" &&
      field.action === "scripted_event" &&
      field.propagation_mode === "compact" &&
      field.duration_ticks === 12 &&
      field.reveals_identity === false &&
      field.stimulus_tags?.includes("masonry") === true,
  );
}

console.log("hearing/stealth contract: compact movement history remains bounded");
{
  const bell = dispatchV1EmitSound({
    gamePackage,
    save: makeSave([-7, -2]),
    mapId: map.id,
    actorId: "script",
    cell: [-7, -2],
    loudness: 6,
    tag: "watch_bell",
    sourceCategory: "environment",
    sourceAction: "scripted_event",
    durationTicks: 1_000,
    tags: ["scripted", "bell"],
    compactPropagation: true,
  });
  let walkedSave = bell.save;
  for (let index = 0; index < 30; index += 1) {
    const moved = dispatchV1MoveEntity({
      gamePackage,
      save: walkedSave,
      actorId: "player",
      dx: 0,
      dy: index % 2 === 0 ? -1 : 1,
    });
    if (!moved.ok) break;
    walkedSave = moved.save;
  }
  const persisted = JSON.parse(JSON.stringify(walkedSave)) as PlaySave;
  const latestSequence = Number(
    persisted.flags?.immersive_sound_sequence || 0,
  );
  const movement = soundFields(persisted).filter(
    (field) =>
      field.propagation_mode === "compact" &&
      (field.tag === "footstep" ||
        field.source_category === "movement_normal" ||
        field.source_category === "movement_stealth"),
  );
  const sequences = movement.map((field) =>
    Number(field.stimulus_sequence || 0),
  );
  check(
    "fine-step hearing keeps only the recent four-macro movement window after save round-trip",
    movement.length <= 13 &&
      sequences.includes(latestSequence) &&
      sequences.every((sequence) => sequence >= latestSequence - 12),
    `latest=${latestSequence} retained=${sequences.join(",")}`,
  );
  check(
    "movement compaction never removes a long-lived scripted compact sound",
    soundFields(persisted).some(
      (field) =>
        field.frequency_tag === "watch_bell" &&
        field.action === "scripted_event",
    ),
  );
}

console.log("hearing/stealth contract: sound evidence is positional, finite, and non-live");
{
  const heard = advanceImmersivePerceptionForSave(gamePackage, normalMoved.save, map.id);
  const state = heard.save.entity_states[hunterKey];
  const quiet = advanceImmersivePerceptionForSave(gamePackage, quietMoved.save, map.id);
  check(
    "ordinary walking can create hearing suspicion while the player is unseen",
    state?.last_detection_cause === "heard" &&
      state?.alertness !== "oblivious" &&
      sameCell(state?.last_heard_position, [-7, -3]),
  );
  check(
    "hearing stores a last-heard position without granting live player tracking",
    state?.last_stimulus?.kind === "sound" &&
      state?.perception_evidence_driver === "hearing" &&
      state?.perception_tracks_live_target === false &&
      state?.target_actor_id === undefined &&
      sameCell(state?.investigation_target_cell, state?.last_heard_position),
  );
  const persisted = JSON.parse(
    JSON.stringify(setPlayerStealthActive(heard.save, true)),
  ) as PlaySave;
  check(
    "save/browser round-trip preserves sound pulses, last-heard evidence, investigation tasks, and stance",
    isPlayerStealthActive(persisted) &&
      soundFields(persisted).some((field) => field.kind === "sound") &&
      sameCell(persisted.entity_states[hunterKey]?.last_heard_position, [-7, -3]) &&
      (persisted.map_deltas?.[map.id]?.npc_tasks || []).some(
        (task) => task.actor_id === hunterKey && task.task_type === "investigate",
      ),
  );
  check(
    "the same route in stealth can fall below the hunter's audible radius",
    quiet.save.entity_states[hunterKey]?.last_detection_cause !== "heard",
  );
}

console.log("hearing/stealth contract: repeated sounds build confidence");
{
  const repeatPackage = withHunterChannel(gamePackage, (channel) => ({
    ...channel,
    sensitivity: 0.65,
    threshold: 0.1,
    repeated_sound_gain: 0.22,
    positional_uncertainty: 0,
  }));
  const firstMove = dispatchV1MoveEntity({
    gamePackage: repeatPackage,
    save: makeSave([-7, -2]),
    actorId: "player",
    dx: 0,
    dy: -1,
  });
  const first = advanceImmersivePerceptionForSave(repeatPackage, firstMove.save, map.id);
  const secondMove = dispatchV1MoveEntity({
    gamePackage: repeatPackage,
    save: first.save,
    actorId: "player",
    dx: 0,
    dy: 1,
  });
  const second = advanceImmersivePerceptionForSave(repeatPackage, secondMove.save, map.id);
  const thirdMove = dispatchV1MoveEntity({
    gamePackage: repeatPackage,
    save: second.save,
    actorId: "player",
    dx: 0,
    dy: -1,
  });
  const third = advanceImmersivePerceptionForSave(repeatPackage, thirdMove.save, map.id);
  const firstScore = Number(first.save.entity_states[hunterKey]?.alert_score || 0);
  const thirdScore = Number(third.save.entity_states[hunterKey]?.alert_score || 0);
  check(
    "fresh repeated footsteps accumulate bounded confidence instead of resetting",
    firstScore > 0 && thirdScore > firstScore &&
      Number(third.save.entity_states[hunterKey]?.perception_sound_repeat_count || 0) >= 2,
    `first=${firstScore} third=${thirdScore}`,
  );
  check(
    "repeated hearing evidence updates the latest sound location, never a hidden future position",
    sameCell(third.save.entity_states[hunterKey]?.last_heard_position, [-7, -3]) &&
      third.save.entity_states[hunterKey]?.perception_tracks_live_target === false,
  );
}

console.log("hearing/stealth contract: sensory profiles filter sound");
{
  const ignoredPackage = withHunterChannel(gamePackage, (channel) => ({
    ...channel,
    ignored_stimulus_tags: [
      ...(channel.ignored_stimulus_tags || []),
      "footstep",
      "movement",
    ],
  }));
  const ignoredMove = dispatchV1MoveEntity({
    gamePackage: ignoredPackage,
    save: makeSave([-7, -2]),
    actorId: "player",
    dx: 0,
    dy: -1,
  });
  const ignored = advanceImmersivePerceptionForSave(
    ignoredPackage,
    ignoredMove.save,
    map.id,
  );
  const deafPackage = withHunterChannel(gamePackage, () => ({
    id: "removed_hearing",
    stimulus_kinds: ["fire"],
    stimulus_tags: [],
    ignored_stimulus_tags: [],
    stimulus_tag_multipliers: {},
    range: 0,
    threshold: 1,
    sensitivity: 0,
    repeated_sound_gain: 0,
    positional_uncertainty: 0,
    barrier_response: "normal",
    requires_los: false,
    requires_view_cone: false,
    view_cone_degrees: 120,
    requires_illumination: false,
    tracks_live_target: false,
    source_tracking: "none",
  }));
  const deafMove = dispatchV1MoveEntity({
    gamePackage: deafPackage,
    save: makeSave([-7, -2]),
    actorId: "player",
    dx: 0,
    dy: -1,
  });
  const deaf = advanceImmersivePerceptionForSave(deafPackage, deafMove.save, map.id);
  check(
    "category filters let a creature ignore ordinary footsteps",
    ignored.save.entity_states[hunterKey]?.last_detection_cause !== "heard",
  );
  check(
    "a profile with no sound channel remains mechanically deaf",
    deaf.save.entity_states[hunterKey]?.last_detection_cause !== "heard",
  );
}

console.log("hearing/stealth contract: closed barriers reduce compact sound");
{
  const door = {
    id: "qa_hearing_test_door",
    object_id: "obj_p_door",
    cell: [-7, -4] as [number, number],
    facing: [0, 1] as [number, number],
  };
  const barrierPackage = withHunterChannel(
    {
      ...gamePackage,
      maps: gamePackage.maps.map((candidate) =>
        candidate.id === map.id
          ? {
              ...candidate,
              custom_object_placements: [
                ...candidate.custom_object_placements,
                door,
              ],
            }
          : candidate,
      ),
    },
    (channel) => ({
      ...channel,
      sensitivity: 0.5,
      threshold: 0.2,
      repeated_sound_gain: 0,
      barrier_response: "normal",
    }),
  );
  const closedMove = dispatchV1MoveEntity({
    gamePackage: barrierPackage,
    save: makeSave([-7, -2]),
    actorId: "player",
    dx: 0,
    dy: -1,
  });
  const closed = advanceImmersivePerceptionForSave(
    barrierPackage,
    closedMove.save,
    map.id,
  );
  const openedSave = makeSave([-7, -2], {
    map_deltas: {
      [map.id]: { opened_doors: [doorPlacementKey(door)] },
    },
  });
  const openMove = dispatchV1MoveEntity({
    gamePackage: barrierPackage,
    save: openedSave,
    actorId: "player",
    dx: 0,
    dy: -1,
  });
  const open = advanceImmersivePerceptionForSave(
    barrierPackage,
    openMove.save,
    map.id,
  );
  const closedScore = Number(closed.save.entity_states[hunterKey]?.alert_score || 0);
  const openScore = Number(open.save.entity_states[hunterKey]?.alert_score || 0);
  check(
    "a closed door attenuates more sound than the same open path",
    openScore > closedScore,
    `closed=${closedScore} open=${openScore}`,
  );
}

console.log("hearing/stealth contract: prohibited input remains blocked until manual exit");
{
  const lampPlacement = map.item_placements.find(
    (placement) => placement.item_id === "qa_portable_lamp",
  );
  if (!lampPlacement) throw new Error("QA lab is missing the portable lamp");
  const lampCell: [number, number] = [
    lampPlacement.cell[0],
    lampPlacement.cell[1],
  ];
  const active = setPlayerStealthActive(makeSave(lampCell), true);
  const pickup = dispatchV1TakeItem({
    gamePackage,
    save: active,
    x: lampPlacement.cell[0],
    y: lampPlacement.cell[1],
  });
  const drop = dispatchV1DropItem({
    gamePackage,
    save: { ...active, inventory: [{ id: "qa_portable_lamp", count: 1 }] },
    itemId: "qa_portable_lamp",
    count: 1,
    cell: [lampPlacement.cell[0] + 1, lampPlacement.cell[1]],
  });
  const exited = setPlayerStealthActive(active, false);
  const pickupAfterExit = dispatchV1TakeItem({
    gamePackage,
    save: exited,
    x: lampPlacement.cell[0],
    y: lampPlacement.cell[1],
  });
  check(
    "pickup and item manipulation are engine-blocked without silently exiting stealth",
    !pickup.ok &&
      pickup.reason === "stealth stance" &&
      !drop.ok &&
      drop.reason === "stealth stance" &&
      isPlayerStealthActive(pickup.save),
  );
  check(
    "manual exit restores ordinary interaction immediately",
    pickupAfterExit.ok && !isPlayerStealthActive(pickupAfterExit.save),
  );
}

if (failed > 0) {
  console.error(`\n${failed} hearing/stealth contract check(s) failed; ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll ${passed} hearing/stealth contract checks passed.`);
