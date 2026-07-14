import {
  applyAlderamonticoEmotionalVerbToSave,
  applyAlderamonticoGridToActor,
  applyAlderamonticoImpulseToSave,
  dispatchAlderamonticoAttendNode,
  advanceAlderamonticoEmotionalDecayForSave,
  advanceAlderamonticoGridRegionsForSave,
  attendAlderamonticoActor,
  advanceAlderamonticoActorFromPhysical,
  buildAlderamonticoConditionReadout,
  defaultAlderamonticoActorState,
  defaultAlderamonticoEmotionalAxes,
  defaultAlderamonticoSaveState,
  deriveAlderamonticoEmotionalRegions,
  deriveAlderamonticoNamedEmotions,
  dominantAlderamonticoGridAxis,
  getVisibleAlderamonticoAttendReadings,
  dispatchV1CastSkill,
  dispatchV1EnemyTurn,
  ensureAlderamonticoActorState,
  entityEmotionalSeed,
  inferAlderamonticoBehavior,
  projectAlderamonticoActorEmotionalStates,
  resolveAlderamonticoBehavior,
  syncAlderamonticoActorEmotionalStates,
  upsertAlderamonticoActorState,
  zoneProfileEmotionalSeed,
} from "../src/engine-core";
import { migratePlaySaveV1ToV2, PLAY_SAVE_V2_SCHEMA } from "../src/schema/v2";
import { entityStateKey } from "../src/utils/entityState";
import {
  createLegacyEngineTestFixturePackage,
} from "../src/schema/game";
import type { AlderamonticoAttendNode, AlderamonticoEmotionalImpulse } from "../src/engine-core";
import type { GamePackage } from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";

let failed = 0;
let passed = 0;

const ok = (label: string, condition: boolean, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ok ${label}`);
  } else {
    failed += 1;
    console.log(`  fail ${label}${detail ? ` - ${detail}` : ""}`);
  }
};

const makeSave = (overrides: Partial<PlaySave> = {}): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: "0.0.0",
  current_map_id: "map_demo_ground",
  player: { cell: [0, 0], facing: [0, 1] },
  playerStats: {
    hp: 24,
    max_hp: 24,
    mp: 12,
    max_mp: 12,
    attack: 5,
    defense: 2,
    speed: 10,
    energy: 1000,
  },
  known_skills: [],
  flags: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  clock_minutes: 1,
  ...overrides,
});

// Seed an actor's emotional record directly at absolute axis values (the
// `axes` merge over engine defaults), bypassing impulse math.
const withActorAxes = (
  save: PlaySave,
  actorId: string,
  axes: AlderamonticoEmotionalImpulse,
): PlaySave => {
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  return {
    ...save,
    alderamontico_state: {
      ...state,
      actors: {
        ...(state.actors || {}),
        [actorId]: defaultAlderamonticoActorState(save.clock_minutes ?? 0, axes),
      },
      attended: { ...(state.attended || {}) },
      attention: state.attention ?? 20,
    },
  };
};

console.log("alderamontico-state: emotional axes and regions");
{
  const axes = defaultAlderamonticoEmotionalAxes({
    valence: 15,
    arousal: 15,
    grief: 90,
  });
  const regions = deriveAlderamonticoEmotionalRegions(axes);
  const named = deriveAlderamonticoNamedEmotions(axes);
  ok("regions are computed from axis values", regions.valence === "anguish" && regions.grief === "drowning");
  ok("named emotions are derived, not stored", named.includes("despairing"));
  ok("behavior reads emotional regions", inferAlderamonticoBehavior(axes) === "paralyzed");
  const gridInflatedAttachment = defaultAlderamonticoEmotionalAxes({ attachment: 95, arousal: 30 });
  ok(
    "Grid-inflated attachment alone does not create a guard anchor",
    inferAlderamonticoBehavior(gridInflatedAttachment, {
      baselineAxes: defaultAlderamonticoEmotionalAxes({ attachment: 35 }),
    }) === "calm",
  );
  ok(
    "baseline-bound attachment still defends",
    inferAlderamonticoBehavior(gridInflatedAttachment, {
      baselineAxes: defaultAlderamonticoEmotionalAxes({ attachment: 80 }),
    }) === "defend_attachment",
  );
}

console.log("alderamontico-state: physical-to-emotional crosstalk and Attend");
{
  let save = makeSave({
    actor_physical_states: {
      player: {
        temperature: 125,
        wetness: 0,
        heat: 1,
        chill: 0,
        charge: 0,
        coating: 0,
        toxicity: 0,
        labels: ["On Fire"],
        updated_at_tick: 1,
        cell: [0, 0],
      },
    },
  });
  save = upsertAlderamonticoActorState(save, "player", {
    emotional_axes: { arousal: 30, valence: -5 },
  });
  save = advanceAlderamonticoActorFromPhysical(save, "player", { tick: 2, applyGlass: false });
  const hidden = buildAlderamonticoConditionReadout(save, "player");
  ok("surface readout hides exact emotional axes", hidden.emotional_visible === "surface" && !hidden.emotional_axes);
  ok("surface readout can infer panic from body state", hidden.condition.includes("panicking"));

  save = attendAlderamonticoActor(save, "player", { attention: 80, tick: 3 });
  const attended = buildAlderamonticoConditionReadout(save, "player");
  ok("Attend reveals emotional axes", attended.emotional_visible === "attended" && Boolean(attended.emotional_axes));
  ok("physical distress pushes emotional state into fear", attended.named_emotions.includes("scared"));

  let watcher = withActorAxes(makeSave(), "watcher", {
    reverence: 95,
    arousal: 10,
    valence: 70,
  });
  const surface = buildAlderamonticoConditionReadout(watcher, "watcher");
  watcher = attendAlderamonticoActor(watcher, "watcher", { attention: 80, tick: 4 });
  const truth = buildAlderamonticoConditionReadout(watcher, "watcher");
  ok("surface condition can be Grid-flattered as peace", surface.emotional_summary === "at peace");
  ok(
    "attended condition exposes borrowed reverence underneath",
    truth.emotional_summary.includes("borrowed reverence"),
  );
}

console.log("alderamontico-state: Grid amplification and Glass");
{
  let save = makeSave();
  save = upsertAlderamonticoActorState(save, "npc_griever", {
    emotional_axes: { grief: 80, reverence: 10, attachment: 5, valence: -20 },
  });
  const before = save.alderamontico_state!.actors.npc_griever.emotional_axes;
  ok("dominant Grid axis is the highest philosophy axis", dominantAlderamonticoGridAxis(before) === "grief");

  const amplified = applyAlderamonticoGridToActor(save, "npc_griever", {
    magnitude: 6,
    lensMultiplier: 1.5,
    ticks: 3,
    tick: 4,
  });
  save = amplified.save;
  const record = save.alderamontico_state!.actors.npc_griever;
  ok("Grid amplifies the dominant axis", amplified.dominant_axis === "grief" && record.emotional_axes.grief > before.grief);
  ok("sustained extreme emotion accretes Glass", record.glass > 0);
}

console.log("alderamontico-state: authored Grid regions and lens multipliers");
{
  const gamePackage = {
    maps: [
      {
        id: "grid_map",
        display_name: "Grid Map",
        width: 4,
        height: 4,
        spawns: [],
        cells: [
          { x: 0, z: 0, region_id: "watchfold" },
          { x: 1, z: 0, region_id: "watchfold" },
          { x: 3, z: 3, region_id: "quiet" },
        ],
        entity_placements: [
          { entity_id: "ent_lens", cell: [1, 0] },
          { entity_id: "ent_watcher", cell: [0, 0] },
          { entity_id: "ent_distant", cell: [3, 3] },
          { entity_id: "ent_profiled", cell: [0, 0] },
        ],
        regions: [
          {
            id: "watchfold",
            display_name: "Watchfold",
            neutral: true,
            passive_checks: [],
            alderamontico_grid: {
              enabled: true,
              magnitude: 5,
              lens_entity_id: "ent_lens",
              lens_radius: 2,
              lens_multiplier: 2,
            },
            emotional_profile: {
              baseline_axis_offsets: { reverence: 20 },
            },
          },
          {
            id: "quiet",
            display_name: "Quiet",
            neutral: true,
            passive_checks: [],
          },
        ],
      },
    ],
    entities: [],
  } as unknown as GamePackage;
  const watcherKey = entityStateKey("grid_map", "ent_watcher", 1);
  const distantKey = entityStateKey("grid_map", "ent_distant", 2);
  const profiledKey = entityStateKey("grid_map", "ent_profiled", 3);
  let save = makeSave({
    current_map_id: "grid_map",
    player: { cell: [0, 0], facing: [0, 1] },
  });
  save = upsertAlderamonticoActorState(save, watcherKey, {
    emotional_axes: { reverence: 60, grief: 5, attachment: 5 },
  });
  const advanced = advanceAlderamonticoGridRegionsForSave(gamePackage, save, "grid_map", { tick: 6 });
  const watcher = advanced.save.alderamontico_state!.actors[watcherKey];
  const profiled = advanced.save.alderamontico_state!.actors[profiledKey];
  ok("authored Grid region applies to actors standing in it", watcher.emotional_axes.reverence === 90);
  ok("lens multiplier is recorded on the actor exposure", watcher.last_grid_exposure?.lens_multiplier === 2);
  ok("exposure result records the dominant axis", advanced.exposures.some((exposure) => exposure.actor_id === watcherKey && exposure.dominant_axis === "reverence"));
  ok("actors outside authored Grid regions are untouched", !advanced.save.alderamontico_state!.actors[distantKey]);
  ok("zone emotional profile offsets seed new actor baselines", profiled.baseline_axes?.reverence === 40);
  ok("Grid feed accumulator records amplified excess", (advanced.save.alderamontico_state?.grid?.fed || 0) > 0);
  ok(
    "zoneProfileEmotionalSeed exposes authored region offsets",
    zoneProfileEmotionalSeed(gamePackage, "ent_profiled", gamePackage.maps[0].regions![0])?.reverence === 40,
  );
}

console.log("alderamontico-state: authored entity axes seed the runtime");
{
  const gp = createLegacyEngineTestFixturePackage();
  const bot = gp.entities.find((entity) => entity.id === "ent_training_bot")!;
  ok("default Training Bot ships an authored attend node", (bot.attend_node?.readings.length || 0) >= 3);
  bot.emotional_axes = { grief: 92, valence: 15, arousal: 12 };
  ok("entityEmotionalSeed reads authored entity axes", entityEmotionalSeed(gp, "ent_training_bot")?.grief === 92);
  ok("entityEmotionalSeed ignores the player pseudo-entity", entityEmotionalSeed(gp, "player") === undefined);

  let save = makeSave();
  save = ensureAlderamonticoActorState(save, "bot_actor", {
    seedAxes: entityEmotionalSeed(gp, "ent_training_bot"),
    tick: 2,
  });
  const seeded = save.alderamontico_state!.actors.bot_actor;
  ok("ensure seeds a new actor from authored entity axes", seeded.emotional_axes.grief === 92);
  ok("behavior is read off the seeded axes", resolveAlderamonticoBehavior(save, "bot_actor") === "paralyzed");

  const untouched = save.alderamontico_state!.actors.bot_actor;
  const again = ensureAlderamonticoActorState(save, "bot_actor", { seedAxes: { grief: 0 }, tick: 3 });
  ok("ensure never overwrites an existing record", again.alderamontico_state!.actors.bot_actor === untouched);
  ok(
    "doc 06 actor_emotional_states projection mirrors seeded actor state",
    save.actor_emotional_states?.bot_actor?.emotional_axes.grief ===
      save.alderamontico_state!.actors.bot_actor.emotional_axes.grief,
  );

  const fresh = makeSave();
  ok(
    "behavior falls back to seed axes when no record exists",
    resolveAlderamonticoBehavior(fresh, "ghost", { reverence: 95, arousal: 5 }) === "paralyzed",
  );
  const pushed = applyAlderamonticoImpulseToSave(fresh, "seed_target", { grief: 30 }, { seedAxes: { grief: 40 } });
  ok(
    "applyAlderamonticoImpulseToSave seeds then pushes axes",
    pushed.alderamontico_state!.actors.seed_target.emotional_axes.grief === 70,
  );
  ok(
    "doc 06 projection mirrors impulse-updated actor state",
    pushed.actor_emotional_states?.seed_target?.emotional_axes.grief === 70,
  );
}

console.log("alderamontico-state: doc 06 actor_emotional_states projection");
{
  const legacySave = withActorAxes(makeSave(), "legacy_attendee", {
    reverence: 88,
    arousal: 10,
  });
  ok(
    "legacy helper intentionally starts without doc 06 projection",
    !legacySave.actor_emotional_states?.legacy_attendee,
  );
  const projected = projectAlderamonticoActorEmotionalStates(legacySave.alderamontico_state);
  ok(
    "projection can derive top-level emotional states from canonical Alderamontico actors",
    projected.legacy_attendee.emotional_axes.reverence === 88,
  );
  const synced = syncAlderamonticoActorEmotionalStates(legacySave);
  ok(
    "sync writes doc 06 actor_emotional_states without changing canonical actor",
    synced.actor_emotional_states?.legacy_attendee?.emotional_axes.reverence ===
      synced.alderamontico_state?.actors.legacy_attendee.emotional_axes.reverence,
  );
  const attended = attendAlderamonticoActor(synced, "legacy_attendee", {
    attention: 80,
    tick: 8,
  });
  ok(
    "Attend keeps doc 06 projection synced",
    attended.actor_emotional_states?.legacy_attendee?.emotional_axes.reverence ===
    attended.alderamontico_state?.actors.legacy_attendee.emotional_axes.reverence,
  );
}

console.log("alderamontico-state: doc 06 attend-node command");
{
  const attendNode: AlderamonticoAttendNode = {
    id: "attend_training_claim",
    target: "claimant",
    composure: 2,
    glassPressure: { reverence: 8, arousal: 4 },
    readings: [
      {
        id: "flattering_false",
        text: "They are serene. The Grid has solved them.",
        truth: "false",
        requiresAttention: 0,
        effect: { set_switch: "accepted_false_claim" },
      },
      {
        id: "hard_true",
        text: "They are still frightened beneath the stillness.",
        truth: "true",
        requiresAttention: 30,
        effect: { set_switch: "saw_fear_under_stillness", target_emotional_impulse: { valence: 5 } },
      },
      {
        id: "honest_partial",
        text: "I cannot tell enough to accept this.",
        truth: "partial",
        requiresAttention: 9,
      },
    ],
    onTimeout: {
      reading_id: "flattering_false",
      status_effect: "glass_residue",
      status_duration: 3,
      status_magnitude: 2,
    },
  };

  const visibleAtLowAttention = getVisibleAlderamonticoAttendReadings(attendNode, 20);
  ok(
    "attention gates hidden attend readings",
    visibleAtLowAttention.length === 1 && visibleAtLowAttention[0].id === "flattering_false",
  );

  let save = withActorAxes(makeSave(), "claimant", {
    reverence: 92,
    arousal: 12,
    valence: 45,
  });
  const opened = dispatchAlderamonticoAttendNode(save, attendNode, {
    action: "open",
    tick: 10,
  });
  save = opened.save;
  ok("opening an attend node succeeds", opened.ok && Boolean(opened.active));
  ok(
    "first attend on a target grants the doc 06 floor tick",
    save.alderamontico_state?.attention === 21,
  );
  ok(
    "attend node stores composure and visible readings",
    save.alderamontico_state?.active_attend?.composure_remaining === 2 &&
      save.alderamontico_state.active_attend.visible_reading_ids.includes("flattering_false"),
  );
  ok(
    "glass pressure writes to the player's emotional record",
    (save.alderamontico_state?.actors.player?.emotional_axes.reverence || 0) > 20,
  );

  const hiddenSelection = dispatchAlderamonticoAttendNode(save, attendNode, {
    action: "select",
    readingId: "hard_true",
    tick: 10,
  });
  ok("hidden attend readings cannot be selected", !hiddenSelection.ok && hiddenSelection.reason === "reading hidden");

  const falseSelection = dispatchAlderamonticoAttendNode(save, attendNode, {
    action: "select",
    readingId: "flattering_false",
    tick: 11,
  });
  ok("visible false readings can resolve effects", Boolean(falseSelection.save.flags.accepted_false_claim));
  ok("selecting a reading closes the active attend node", !falseSelection.save.alderamontico_state?.active_attend);

  save = withActorAxes(makeSave({
    alderamontico_state: {
      actors: {},
      attended: {},
      attention: 35,
    },
  }), "claimant", {
    reverence: 92,
    arousal: 12,
    valence: 45,
  });
  const openedHigh = dispatchAlderamonticoAttendNode(save, attendNode, {
    action: "open",
    tick: 12,
  });
  const trueSelection = dispatchAlderamonticoAttendNode(openedHigh.save, attendNode, {
    action: "select",
    readingId: "hard_true",
    tick: 13,
  });
  ok("true readings above the threshold are visible at sufficient attention", trueSelection.ok);
  ok("true reading selection raises attention", trueSelection.save.alderamontico_state?.attention === 37);
  ok(
    "true reading effects can mark story facts and affect the target",
    Boolean(trueSelection.save.flags.saw_fear_under_stillness) &&
      trueSelection.save.alderamontico_state!.actors.claimant.emotional_axes.valence > 45,
  );

  const openedTimeout = dispatchAlderamonticoAttendNode(makeSave({
    alderamontico_state: {
      actors: {},
      attended: {},
      attention: 50,
    },
  }), { ...attendNode, composure: 1 }, {
    action: "open",
    targetActorId: "claimant",
    tick: 20,
  });
  const timeout = dispatchAlderamonticoAttendNode(openedTimeout.save, attendNode, {
    action: "tick",
    ticks: 1,
    tick: 21,
  });
  ok("composure reaching zero auto-selects the timeout reading", timeout.timed_out === true);
  ok(
    "timeout applies Glass residue status to the player",
    timeout.save.actor_statuses?.player?.some((status) => status.id === "glass_residue" && status.remaining === 3) === true,
  );
}

console.log("alderamontico-state: emotional verbs push axes through skill cast");
{
  const gp = createLegacyEngineTestFixturePackage();
  gp.abilities.push({
    id: "skl_yell",
    display_name: "Yell",
    description: "A shout that rattles the target.",
    ap_cost: 1000,
    mp_cost: 0,
    element: "none",
    targeting: "single",
    range: 4,
    payloads: [],
    emotional_impulse: { arousal: 50, valence: -25 },
  });
  const demoMap = gp.maps.find((map) => map.id === "map_demo_ground")!;
  const botIndex = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_training_bot");
  const botCell = demoMap.entity_placements[botIndex].cell as [number, number];
  const botKey = entityStateKey(demoMap.id, "ent_training_bot", botIndex);
  const save = makeSave({
    current_map_id: demoMap.id,
    package_version: gp.metadata.version,
    known_skills: ["skl_yell"],
    player: { cell: [botCell[0], botCell[1] - 1], facing: [0, 1] },
    entity_states: { [botKey]: { cell: botCell, hp: 12 } },
  });
  const result = dispatchV1CastSkill({
    gamePackage: gp,
    save,
    actorId: "player",
    skillId: "skl_yell",
    targetCells: [botCell],
  });
  ok("emotional skill cast resolves", result.ok);
  const botState = result.save.alderamontico_state?.actors?.[botKey];
  ok("skill impulse pushes the target's arousal up", (botState?.emotional_axes.arousal ?? 0) > 30);
  ok("skill impulse pushes the target's valence down", (botState?.emotional_axes.valence ?? 100) < 50);
  const payload = result.events.find((event) => event.type === "skill_cast_resolved")?.payload as any;
  ok(
    "skill cast reports an emotional hit",
    payload?.hits?.some((hit: any) => hit.payloadType === "emotional" && hit.emotionalImpulse?.arousal === 50),
  );
}

console.log("alderamontico-state: enemy AI reads the emotional layer");
{
  const gp = createLegacyEngineTestFixturePackage();
  const demoMap = gp.maps.find((map) => map.id === "map_demo_ground")!;
  const botIndex = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_training_bot");
  const botCell = demoMap.entity_placements[botIndex].cell as [number, number];
  const botKey = entityStateKey(demoMap.id, "ent_training_bot", botIndex);
  const adjacent: [number, number] = [botCell[0], botCell[1] - 1];
  const baseCombat = (): PlaySave =>
    makeSave({
      current_map_id: demoMap.id,
      package_version: gp.metadata.version,
      player: { cell: adjacent, facing: [0, 1] },
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: botKey,
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    });
  const outcomeOf = (result: { events: { type: string; payload?: unknown }[] }) =>
    result.events.find((event) => event.type === "enemy_turn_resolved")?.payload as any;

  const baseline = dispatchV1EnemyTurn({ gamePackage: gp, save: baseCombat() });
  ok(
    "a calm adjacent enemy still attacks (default behavior preserved)",
    outcomeOf(baseline)?.kind === "attack" && baseline.save.playerStats.hp < 24,
  );

  const paralyzed = dispatchV1EnemyTurn({
    gamePackage: gp,
    save: withActorAxes(baseCombat(), botKey, { reverence: 95, arousal: 8 }),
  });
  ok("a transfixed enemy skips its turn", outcomeOf(paralyzed)?.kind === "skip" && outcomeOf(paralyzed)?.reason === "paralyzed");
  ok("a transfixed enemy deals no damage", paralyzed.save.playerStats.hp === 24);

  const fled = dispatchV1EnemyTurn({
    gamePackage: gp,
    save: withActorAxes(baseCombat(), botKey, { arousal: 95, valence: 8, grief: 5, reverence: 5, attachment: 5 }),
  });
  ok("a frightened enemy never attacks", outcomeOf(fled)?.kind !== "attack" && fled.save.playerStats.hp === 24);

  const distantCombat = (): PlaySave =>
    makeSave({
      current_map_id: demoMap.id,
      package_version: gp.metadata.version,
      player: { cell: [botCell[0], botCell[1] - 3], facing: [0, 1] },
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: botKey,
      entity_states: { [botKey]: { cell: botCell, hp: 12, alertness: "combat", alert_score: 1 } },
    });
  const withAttachmentRecord = (save: PlaySave, baselineAttachment: number): PlaySave => {
    const record = defaultAlderamonticoActorState(save.clock_minutes ?? 0, {
      valence: 50,
      arousal: 30,
      grief: 5,
      reverence: 5,
      attachment: 95,
    });
    record.baseline_axes = defaultAlderamonticoEmotionalAxes({
      valence: 50,
      arousal: 30,
      grief: 5,
      reverence: 5,
      attachment: baselineAttachment,
    });
    return {
      ...save,
      alderamontico_state: {
        ...(save.alderamontico_state || defaultAlderamonticoSaveState()),
        actors: {
          ...(save.alderamontico_state?.actors || {}),
          [botKey]: record,
        },
      },
    };
  };
  const gridInflated = dispatchV1EnemyTurn({
    gamePackage: gp,
    save: withAttachmentRecord(distantCombat(), 35),
  });
  ok("a combat-alerted hostile with Grid-inflated attachment still chases", outcomeOf(gridInflated)?.kind === "move");

  const boundGuard = dispatchV1EnemyTurn({
    gamePackage: gp,
    save: withAttachmentRecord(distantCombat(), 80),
  });
  ok(
    "a baseline-bound enthralled hostile still guards",
    outcomeOf(boundGuard)?.kind === "skip" && outcomeOf(boundGuard)?.reason === "defending",
  );
}

console.log("alderamontico-state: built-in emotional verbs (Yell / Console)");
{
  // Yell startles a skittish creature into flight.
  let save = makeSave();
  save = withActorAxes(save, "npc_deer", { arousal: 60, valence: 40, grief: 5, reverence: 5, attachment: 5 });
  const yelled = applyAlderamonticoEmotionalVerbToSave(save, { verb: "yell", actorId: "npc_deer" });
  ok("yell pushes arousal up", yelled.save.alderamontico_state!.actors.npc_deer.emotional_axes.arousal > 60);
  ok("yell pushes valence down", yelled.save.alderamontico_state!.actors.npc_deer.emotional_axes.valence < 40);
  ok("yell flips a skittish creature to flee", yelled.after.behavior === "flee" && yelled.behavior_changed);
  ok("yell is not resisted by an unbound target", !yelled.resisted);

  // The transfixed watcher cannot be startled awake — bound extremes resist.
  let watcher = makeSave();
  watcher = withActorAxes(watcher, "npc_watcher", { reverence: 95, arousal: 10, valence: 40, grief: 5, attachment: 5 });
  const yellAtWatcher = applyAlderamonticoEmotionalVerbToSave(watcher, { verb: "yell", actorId: "npc_watcher" });
  ok("yell is resisted by a reverence-maxed target", yellAtWatcher.resisted);
  ok(
    "the watcher stays transfixed",
    yellAtWatcher.after.behavior === "paralyzed" && !yellAtWatcher.behavior_changed,
  );

  // Console lowers a griever out of paralysis — the counter-tool is exempt
  // from binding resistance.
  let griever = makeSave();
  griever = withActorAxes(griever, "npc_griever", { grief: 90, valence: 20, arousal: 20, reverence: 5, attachment: 5 });
  const consoled = applyAlderamonticoEmotionalVerbToSave(griever, { verb: "console", actorId: "npc_griever" });
  ok("the griever starts paralyzed", consoled.before.behavior === "paralyzed");
  ok("console lowers grief", consoled.save.alderamontico_state!.actors.npc_griever.emotional_axes.grief < 90);
  ok("console is never resisted", !consoled.resisted);
  ok(
    "console lifts the griever out of paralysis",
    consoled.after.behavior !== "paralyzed" && consoled.behavior_changed,
  );

  // Unknown verbs are rejected without touching the save.
  const bogus = applyAlderamonticoEmotionalVerbToSave(save, { verb: "serenade", actorId: "npc_deer" });
  ok("unknown emotional verbs are rejected", !bogus.ok && bogus.save === save);
}

console.log("alderamontico-state: emotional decay toward baseline");
{
  // Seed a calm baseline, push arousal high, then let time pass.
  let save = makeSave();
  save = applyAlderamonticoImpulseToSave(save, "npc_deer", { arousal: 50 }, { seedAxes: { arousal: 20 } });
  const pushed = save.alderamontico_state!.actors.npc_deer;
  ok("impulse pushed arousal above baseline", pushed.emotional_axes.arousal === 70);
  ok("the record remembers its baseline", pushed.baseline_axes?.arousal === 20);

  const decayed = advanceAlderamonticoEmotionalDecayForSave(save, { rate: 5, tick: 10 });
  ok(
    "decay relaxes arousal toward baseline",
    decayed.save.alderamontico_state!.actors.npc_deer.emotional_axes.arousal === 65,
  );
  ok("decay reports the changed actor", decayed.changed_actor_ids.includes("npc_deer"));

  // Converges to baseline and then stops producing new saves.
  let settled = decayed.save;
  for (let i = 0; i < 20; i += 1) {
    settled = advanceAlderamonticoEmotionalDecayForSave(settled, { rate: 5, tick: 11 + i }).save;
  }
  ok(
    "decay converges on the baseline",
    settled.alderamontico_state!.actors.npc_deer.emotional_axes.arousal === 20,
  );
  const idle = advanceAlderamonticoEmotionalDecayForSave(settled, { rate: 5, tick: 40 });
  ok("decay is a no-op at baseline (same save reference)", idle.save === settled);
}

console.log("alderamontico-state: save v2 preservation");
{
  let save = makeSave();
  save = upsertAlderamonticoActorState(save, "player", {
    emotional_axes: { reverence: 75 },
  });
  save = attendAlderamonticoActor(save, "player", { attention: 70, tick: 5 });
  const v2 = migratePlaySaveV1ToV2(save);
  ok("save migrates to v2", v2.schema === PLAY_SAVE_V2_SCHEMA);
  ok(
    "v2 content preserves Alderamontico state",
    v2.content.alderamontico_state?.actors.player?.emotional_axes.reverence === 95,
  );
  ok(
    "v2 content preserves doc 06 actor_emotional_states projection",
    v2.content.actor_emotional_states?.player?.emotional_axes.reverence === 95,
  );
  ok(
    "v2 runtime summary preserves Alderamontico state",
    v2.runtime.actors.alderamontico_state.attended.player?.attention === 70,
  );
  ok(
    "v2 runtime summary preserves doc 06 actor_emotional_states projection",
    v2.runtime.actors.actor_emotional_states.player?.emotional_axes.reverence === 95,
  );
}

console.log("");
if (failed > 0) {
  console.log(`alderamontico-state: ${failed} FAILED, ${passed} passed`);
  process.exit(1);
}
console.log(`alderamontico-state: all ${passed} checks passed`);
