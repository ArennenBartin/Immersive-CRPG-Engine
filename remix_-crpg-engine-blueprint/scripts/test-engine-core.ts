// Headless smoke/regression test for engine-core. Run: `npm run test:engine`.
// Proves deterministic RNG, the command/effect/event pipeline, and rejection of
// invalid commands — all without React/DOM.

import {
  applyStatus,
  activeReactiveTaskForActor,
  buildConditionContext,
  createV1GridWorld,
  dispatchV1AdjustFactionRep,
  dispatchV1CastSkill,
  dispatchV1ChangeMap,
  dispatchV1CompleteQuestObjective,
  dispatchV1FireTrigger,
  dispatchV1AdvanceCombatTurn,
  dispatchV1EnemyTurn,
  dispatchV1EnemyPulse,
  dispatchV1GiveCurrency,
  dispatchV1GiveItem,
  dispatchV1LearnSkill,
  dispatchV1MeleeAttack,
  dispatchV1MoveEntity,
  dispatchV1OpenContainer,
  dispatchV1OpenDoor,
  dispatchV1PushObject,
  dispatchV1PullObject,
  dispatchV1DragObject,
  dispatchV1CarryObject,
  dispatchV1CleanSurface,
  dispatchV1DecaySurfaces,
  dispatchV1IgniteFire,
  dispatchV1ExtinguishFire,
  dispatchV1AdvanceEnvironment,
  dispatchV1EmitSound,
  dispatchV1AdvanceNpcTasks,
  dispatchV1StartProcess,
  dispatchV1InterruptProcess,
  dispatchV1AdvanceProcesses,
  dispatchV1AdvanceSimulationRegions,
  dispatchV1AdaptSimulationSemantics,
  dispatchV1AddPartyMember,
  dispatchV1AdvanceClock,
  dispatchV1BuyShopItem,
  dispatchV1ChooseDialogueOption,
  dispatchV1GameEnd,
  dispatchV1HealPlayer,
  dispatchV1ModifyPlayerStats,
  dispatchV1RecordBark,
  dispatchV1ReadDocument,
  dispatchV1RemoveCurrency,
  dispatchV1RemoveItem,
  dispatchV1RemovePartyMember,
  dispatchV1RestoreParty,
  dispatchV1SellInventoryItem,
  dispatchV1SetEntityHidden,
  dispatchV1SetEntityPosition,
  dispatchV1SetQuest,
  dispatchV1SetPlayerPosition,
  dispatchV1SetPlayerSprite,
  dispatchV1SetSwitch,
  dispatchV1StowInContainer,
  dispatchV1TakeAllFromContainer,
  dispatchV1TakeFromContainer,
  dispatchV1TakeItem,
  dispatchV1DropItem,
  dispatchV1TeleportPlayer,
  dispatchV1UpdateCombatSession,
  dispatchV1CloseDoor,
  dispatchV1SearchContainer,
  dispatchV1BreakObject,
  getV1ControlledCombatant,
  dispatchV1UnlockContainer,
  getV1NearbyHostiles,
  getV1SkillRangeCells,
  getV1SkillTargetCells,
  dispatchV1Wait,
  Engine,
  getV1DoorKey,
  getAvailableShopStock,
  getVisibleDialogueOptions,
  InMemoryGridWorld,
  isTriggerEligible,
  findCutsceneLabelIndex,
  actorInventoryHolderId,
  advanceImmersivePerceptionForSave,
  advanceImmersiveReactionsForSave,
  advanceImmersiveStage2Save,
  advanceImmersiveStage2Snapshot,
  advanceImmersiveWorldStateForSave,
  applyImmersiveCombatAttackToSave,
  applyImmersiveCombatForcedMovementToSave,
  applyImmersiveGlobalVerbToSave,
  applyImmersiveOverwatchToMovementSave,
  applyImmersivePlayerOverwatchToSave,
  applyGameObjectCascadeDispatchToSave,
  applyGameObjectPartEmissionsToSave,
  containerInventoryHolderId,
  createKernelFactsFromEngineEvents,
  createKernelSnapshotFromV1,
  createGameObjectModelSnapshotFromV1,
  createImmersiveCombatTacticalSnapshotFromV1,
  createImmersivePerceptionSnapshotFromV1,
  createImmersiveSpatialInventorySnapshotFromSave,
  createImmersiveStage2SnapshotFromV1,
  createSimulationSnapshotFromV1,
  decideEntityAction,
  destroyedHolderId,
  dispatchGameObjectEvent,
  dispatchGameObjectEventCascade,
  equipmentSlotHolderId,
  handSlotHolderId,
  hiddenCacheHolderId,
  IMMERSIVE_GLOBAL_VERBS,
  IMMERSIVE_REACTION_RULES,
  kernelInstanceId,
  resolveGameObjectBlueprint,
  worldCellHolderId,
  RNG,
  RngStreams,
  registerCoreCommands,
  recordEntityBehaviorDecision,
  selectEligibleBark,
  shouldRunCutsceneBranch,
  statModifiers,
  tickStatuses,
  evaluateCondition,
  evaluateImmersiveWorldStateForSave,
  expandGamePackageToFine,
  FINE_PER_MACRO,
  areAdjacentMacro,
  coordKey,
  fineCenterOfMacro,
  fineBlockForMacro,
  fineCoord,
  fineCoordKey,
  fineOfMacro,
  footprintIntersectsLeadingEdge,
  macroCoord,
  macroOfFine,
  parseFineCoordKey,
  sameMacroCoord,
  scaleMacroDistanceToFine,
} from "../src/engine-core";
import {
  createEmptyGamePackage,
  createLegacyEngineTestFixturePackage,
} from "../src/schema/game";
import { resolvePlayModeMap } from "../src/utils/playModeMap";
import {
  getNormalizedMovementRepeatIntervalMs,
  resolveHeldMovementIntent,
  shouldDriveDemandFrames,
} from "../src/utils/playInput";
import {
  normalizePackageImportPayload,
  serializePackageForExport,
} from "../src/store/engineStore";
import {
  buildSaveSlotPayload,
  normalizeSaveSlotPayload,
} from "../src/store/playStore";
import {
  GAME_PACKAGE_V2_SCHEMA,
  PLAY_SAVE_V2_SCHEMA,
  migrateGamePackageV1ToV2,
  migratePlaySaveV1ToV2,
  normalizeGamePackageToV2,
  normalizePlaySaveToV2,
  unwrapGamePackageV1,
  unwrapPlaySaveV1,
} from "../src/schema/v2";
import type { PlaySave } from "../src/schema/save";
import { entityStateKey } from "../src/utils/entityState";
import {
  classifyFogRenderState,
  classifyFogRenderStateForCells,
  computeFogVisibleCells,
  createFogLineOfSightBlockers,
  fogCellKey,
  hasFogLineOfSight,
  resolveStructureFogCompositePolicy,
} from "../src/utils/fogOfWar";
import {
  resolveActorSpriteBrightness,
  resolveAuthoritativeLightRenderMetrics,
} from "../src/utils/lightRendering";
import { useFxStore } from "../src/store/fxStore";
import {
  PLAYMODE_ITEM_PICKUP_RADIUS_MACRO,
  PLAYMODE_COMMAND_WHEEL_VERBS,
  PLAYMODE_PHASE_2_ELEMENTAL_VERBS,
  PLAYMODE_PHASE_3_MOVEMENT_VERBS,
  playModeCommandWheelPhaseStatus,
  selectPlayModePickupCandidate,
} from "../src/utils/playModeCommands";
import {
  dedupeFineTerrainCellsFor3D,
  fineCellsCoveredByWorldMacroCell,
  isWorldPointInCameraOcclusionCorridor,
  logicalCellToWorld,
  logicalCoordToWorld,
  worldCoordToLogical,
  worldPointToLogicalCell,
} from "../src/utils/renderSpace";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
};

console.log("engine-core: Play input cadence + demand frames");
{
  const baseIntervalMs = 50;
  const cardinalIntervals = ([
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const).map(([dx, dz]) =>
    getNormalizedMovementRepeatIntervalMs(baseIntervalMs, dx, dz),
  );
  const diagonalInterval = getNormalizedMovementRepeatIntervalMs(
    baseIntervalMs,
    1,
    -1,
  );

  ok(
    cardinalIntervals.every((interval) => interval === baseIntervalMs) &&
      getNormalizedMovementRepeatIntervalMs(baseIntervalMs, 0, 0) ===
        baseIntervalMs,
    "cardinal and wait-like input retain the base repeat cadence",
  );
  ok(
    Math.abs(diagonalInterval - baseIntervalMs * Math.SQRT2) < 0.000001,
    "diagonal input scales its repeat interval by resolved world distance",
  );
  const cardinalWorldSpeed = 1 / (baseIntervalMs / 1000);
  const diagonalWorldSpeed = Math.SQRT2 / (diagonalInterval / 1000);
  ok(
    Math.abs(cardinalWorldSpeed - diagonalWorldSpeed) < 0.000001,
    "cardinal and diagonal holds cover equal world distance per second",
  );
  const quickChordKeys = new Set(["w", "d"]);
  const quickChordIntent = resolveHeldMovementIntent(
    quickChordKeys,
    new Set(["w", "d"]),
  );
  ok(
    quickChordIntent.ax === 0 &&
      quickChordIntent.az === 0 &&
      !quickChordIntent.wait,
    "consumed chord keys remain inert until every participating key releases",
  );
  const waitChordIntent = resolveHeldMovementIntent(
    new Set(["z", "arrowright"]),
    new Set(),
  );
  ok(
    waitChordIntent.wait && waitChordIntent.ax === 1,
    "wait remains explicit when a direction is held in the same quick chord",
  );

  const demandTruthTable = [
    {
      input: {
        pageVisible: false,
        performanceMode: true,
        bottomPanelOpen: false,
      },
      expected: false,
    },
    {
      input: {
        pageVisible: false,
        performanceMode: false,
        bottomPanelOpen: true,
      },
      expected: false,
    },
    {
      input: {
        pageVisible: true,
        performanceMode: false,
        bottomPanelOpen: false,
      },
      expected: true,
    },
    {
      input: {
        pageVisible: true,
        performanceMode: true,
        bottomPanelOpen: false,
      },
      expected: true,
    },
    {
      input: {
        pageVisible: true,
        performanceMode: false,
        bottomPanelOpen: true,
      },
      expected: true,
    },
    {
      input: {
        pageVisible: true,
        performanceMode: true,
        bottomPanelOpen: true,
      },
      expected: true,
    },
  ];
  ok(
    demandTruthTable.every(
      ({ input, expected }) => shouldDriveDemandFrames(input) === expected,
    ),
    "the bounded demand-frame clock runs for every visible play scene",
  );
}

console.log("engine-core: 3D render-space adapter");
{
  ok(
    logicalCoordToWorld(1, "fine", 3) === 0 &&
      logicalCoordToWorld(2, "fine", 3) === 1 / 3 &&
      logicalCoordToWorld(0, "fine", 3) === -1 / 3,
    "fine-cell centers occupy one-third-world-unit offsets around a macro center",
  );
  const logicalSamples = [-17, -4, 0, 1, 2, 19];
  ok(
    logicalSamples.every(
      (value) => worldCoordToLogical(logicalCoordToWorld(value, "fine", 3), "fine", 3) === value,
    ),
    "fine coordinate conversion round-trips across negative and positive cells",
  );
  const pointerCell = worldPointToLogicalCell(2 / 3, -4 / 3, "fine", 3);
  ok(
    pointerCell[0] === 3 && pointerCell[1] === -3,
    "3D pointer intersections resolve back to fine gameplay cells",
  );
  ok(
    logicalCellToWorld([9, -6], "macro", 3)[0] === 9 &&
      logicalCellToWorld([9, -6], "macro", 3)[1] === -6,
    "authored editor coordinates remain one world unit per macro cell",
  );
  ok(
    isWorldPointInCameraOcclusionCorridor([2, 0], [0, 0], 0, 7, 1.45) &&
      !isWorldPointInCameraOcclusionCorridor([-2, 0], [0, 0], 0, 7, 1.45),
    "wall occlusion includes camera-side cells and excludes cells behind the player",
  );
  ok(
    isWorldPointInCameraOcclusionCorridor(
      [0, 2],
      [0, 0],
      Math.PI / 2,
      7,
      1.45,
    ) &&
      !isWorldPointInCameraOcclusionCorridor(
        [0, -2],
        [0, 0],
        Math.PI / 2,
        7,
        1.45,
      ),
    "wall occlusion direction follows quarter-turn camera rotation",
  );
  const positiveWallFineCells = fineCellsCoveredByWorldMacroCell(1, -2, 3);
  const positiveWallFineKeys = new Set(
    positiveWallFineCells.map((cell) => fogCellKey(cell[0], cell[1])),
  );
  ok(
    positiveWallFineCells.length === 9 &&
      positiveWallFineKeys.has(fogCellKey(3, -6)) &&
      positiveWallFineKeys.has(fogCellKey(5, -4)) &&
      !positiveWallFineKeys.has(fogCellKey(6, -4)),
    "macro wall visibility samples its exact positive-coordinate fine block",
  );
  const negativeWallFineKeys = new Set(
    fineCellsCoveredByWorldMacroCell(-4, -4, 3).map((cell) =>
      fogCellKey(cell[0], cell[1]),
    ),
  );
  ok(
    negativeWallFineKeys.has(fogCellKey(-12, -12)) &&
      negativeWallFineKeys.has(fogCellKey(-10, -10)) &&
      !negativeWallFineKeys.has(fogCellKey(-9, -10)),
    "macro wall visibility samples its exact negative-coordinate fine block",
  );
  const visibleWallEdge = new Set<string>([fogCellKey(3, -4)]);
  const exploredWallEdge = new Set<string>([fogCellKey(3, -4)]);
  ok(
    classifyFogRenderStateForCells(
      positiveWallFineCells,
      true,
      visibleWallEdge,
      visibleWallEdge,
    ) === "visible" &&
      classifyFogRenderStateForCells(
        positiveWallFineCells,
        true,
        new Set(),
        exploredWallEdge,
      ) === "explored" &&
      classifyFogRenderStateForCells(
        positiveWallFineCells,
        true,
        new Set([fogCellKey(6, -4)]),
        new Set([fogCellKey(6, -4)]),
      ) === "unseen",
    "a visible or explored fine boundary retains only its owning macro wall",
  );
  const visibleSolidWall = resolveStructureFogCompositePolicy("visible", false);
  const visibleFadedWall = resolveStructureFogCompositePolicy("visible", true);
  const exploredWall = resolveStructureFogCompositePolicy("explored", true);
  const unseenWall = resolveStructureFogCompositePolicy("unseen", true);
  ok(
    visibleSolidWall.render &&
      !visibleSolidWall.postFog &&
      !visibleSolidWall.cameraFaded &&
      visibleFadedWall.render &&
      !visibleFadedWall.postFog &&
      visibleFadedWall.cameraFaded &&
      exploredWall.render &&
      !exploredWall.postFog &&
      !exploredWall.cameraFaded &&
      unseenWall.render &&
      !unseenWall.postFog &&
      !unseenWall.cameraFaded,
    "all walls retain one opaque mesh and only visible walls camera-fade",
  );
  const fineCopies = Array.from({ length: 9 }, (_, index) => ({
    x: index % 3,
    y: 0,
    z: Math.floor(index / 3),
    active: true,
    walkable: true,
    blocks_los: false,
    height: 0,
    visual_height: 0,
    object_id: "obj_floor_plate",
    terrain: "default",
    surface_tag: "none" as const,
  }));
  const terrain = dedupeFineTerrainCellsFor3D(fineCopies, 3);
  ok(
    terrain.length === 1 && terrain[0].x === 0 && terrain[0].z === 0,
    "nine fine copies produce one 3D terrain model",
  );
}

console.log("engine-core: deterministic RNG");
{
  const a = new RNG(12345);
  const b = new RNG(12345);
  const c = new RNG(99999);
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  const seqC = Array.from({ length: 8 }, () => c.next());
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), "same seed → identical sequence");
  ok(JSON.stringify(seqA) !== JSON.stringify(seqC), "different seed → different sequence");
  ok(seqA.every((n) => n >= 0 && n < 1), "values in [0,1)");

  const r = new RNG(7);
  const state = r.getState();
  const x = r.next();
  r.setState(state);
  ok(r.next() === x, "state snapshot/restore reproduces value");

  const streams = new RngStreams(42);
  const combat1 = Array.from({ length: 4 }, () => streams.stream("combat").next());
  const streams2 = new RngStreams(42);
  const combat2 = Array.from({ length: 4 }, () => streams2.stream("combat").next());
  ok(JSON.stringify(combat1) === JSON.stringify(combat2), "named streams reproduce from master seed");
}

console.log("engine-core: macro/fine coordinate abstraction");
{
  const macro = macroCoord(-2, 5);
  const fine = fineOfMacro(macro);
  const center = fineCenterOfMacro(macro);
  ok(FINE_PER_MACRO === 3, "phase B/F runs the configured 3x fine ratio");
  ok(fine[0] === -2 * FINE_PER_MACRO && fine[1] === 5 * FINE_PER_MACRO, "fineOfMacro returns the fine-block origin");
  ok(macroOfFine(center)[0] === -2 && macroOfFine(center)[1] === 5, "macroOfFine round-trips the macro center");
  ok(fineBlockForMacro(macro).length === FINE_PER_MACRO * FINE_PER_MACRO, "macro block size follows ratio");
  ok(
    fineCoordKey(-2, 5) === "-2:5" && coordKey(fine) === `${-2 * FINE_PER_MACRO}:${5 * FINE_PER_MACRO}`,
    "fine coordinate keys use canonical x:z form",
  );
  ok(parseFineCoordKey("-2:5")[0] === -2 && parseFineCoordKey("-2:5")[1] === 5, "fine coordinate keys parse");
  ok(
    sameMacroCoord(fine, fineCoord(fine[0] + FINE_PER_MACRO - 1, fine[1] + FINE_PER_MACRO - 1)),
    "sameMacroCoord groups fine cells in the same macro block",
  );
  ok(scaleMacroDistanceToFine(6) === 6 * FINE_PER_MACRO, "macro distances scale to fine resolution");
  const actorCenter = fineCoord(10, 10);
  ok(
    footprintIntersectsLeadingEdge(actorCenter, fineCoord(1, 0), fineCoord(13, 12)),
    "faced targeting intersects the full offset edge of a 3x3 actor footprint",
  );
  ok(
    areAdjacentMacro(actorCenter, fineCoord(13, 12)) &&
      areAdjacentMacro(actorCenter, fineCoord(13, 13)),
    "melee adjacency includes footprint edges and diagonal collision corners",
  );
  ok(
    !footprintIntersectsLeadingEdge(actorCenter, fineCoord(1, 0), fineCoord(13, 13)) &&
      !areAdjacentMacro(actorCenter, fineCoord(14, 10)),
    "footprint melee targeting excludes actors beyond the next movement step",
  );

  const twoMacroCardinal = { id: "cardinal", cell: fineCoord(7, 1) };
  ok(
    PLAYMODE_ITEM_PICKUP_RADIUS_MACRO === 2 &&
      [0, 1, 2].every(
        (localX) =>
          selectPlayModePickupCandidate(
            [twoMacroCardinal],
            fineCoord(localX, 1),
          )?.id === twoMacroCardinal.id,
      ),
    "item pickup halo reaches two macro tiles from every local fine offset",
  );
  ok(
    selectPlayModePickupCandidate(
      [{ id: "diagonal", cell: fineCoord(7, 7) }],
      fineCoord(0, 0),
    )?.id === "diagonal" &&
      !selectPlayModePickupCandidate(
        [{ id: "too_far", cell: fineCoord(8, 0) }],
        fineCoord(0, 0),
      ),
    "item pickup halo includes its diagonal edge and excludes radius-plus-one",
  );
  const pickupCandidates = [
    { id: "far", cell: fineCoord(6, 0) },
    { id: "z_tie", cell: fineCoord(3, 0) },
    { id: "a_tie", cell: fineCoord(0, 3) },
  ];
  ok(
    selectPlayModePickupCandidate(pickupCandidates, fineCoord(0, 0))?.id === "a_tie" &&
      selectPlayModePickupCandidate(
        [...pickupCandidates].reverse(),
        fineCoord(0, 0),
      )?.id === "a_tie",
    "item pickup chooses the nearest candidate with a stable ID tie-break",
  );
}

console.log("engine-core: entity behavior arbiter");
{
  const actor = {
    id: "npc_test",
    name: "Test NPC",
    cell: [4, 4] as [number, number],
    hp: 10,
    max_hp: 10,
    emotional_behavior: "calm" as const,
  };
  const schedule = { cell: [9, 4] as [number, number], label: "market" };
  const threat = { actor_id: "player", cell: [4, 5] as [number, number], adjacent: true };
  const reaction = {
    kind: "investigate" as const,
    reason: "sound",
    target_cell: [2, 2] as [number, number],
    priority: 5,
  };
  const stunned = decideEntityAction(
    {
      ...actor,
      statuses: [{ id: "stun", remaining: 1, magnitude: 1 }],
      physical: {
        temperature: 800,
        wetness: 0,
        heat: 1,
        chill: 0,
        charge: 0,
        coating: 0,
        toxicity: 0,
        labels: ["On Fire"],
        updated_at_tick: 1,
        cell: [4, 4],
      },
    },
    { tick: 1, threat, schedule },
    "exploration",
  );
  ok(stunned.tier === "incapacitated" && stunned.action === "skip", "arbiter: incapacitation overrides survival");

  const burning = decideEntityAction(
    {
      ...actor,
      emotional_behavior: "flee",
      physical: {
        temperature: 800,
        wetness: 0,
        heat: 1,
        chill: 0,
        charge: 0,
        coating: 0,
        toxicity: 0,
        labels: ["On Fire"],
        updated_at_tick: 1,
        cell: [4, 4],
      },
    },
    { tick: 2, threat, reactive: reaction, schedule },
    "exploration",
  );
  ok(burning.tier === "survival" && burning.reason === "burning", "arbiter: physical survival overrides emotion, reaction, and schedule");

  const afraid = decideEntityAction(
    { ...actor, emotional_behavior: "flee" },
    { tick: 3, threat, reactive: reaction, schedule },
    "exploration",
  );
  ok(afraid.tier === "emotional" && afraid.action === "flee", "arbiter: emotional override wins before reaction and routine");

  const investigating = decideEntityAction(
    actor,
    { tick: 4, threat, reactive: reaction, schedule },
    "exploration",
  );
  ok(investigating.tier === "reactive" && investigating.action === "investigate", "arbiter: perception reaction wins before schedule");

  const scheduled = decideEntityAction(actor, { tick: 5, schedule }, "exploration");
  ok(scheduled.tier === "scheduled" && scheduled.action === "schedule", "arbiter: schedule is the baseline action");
  const idle = decideEntityAction({ ...actor, cell: [9, 4] }, { tick: 6, schedule }, "exploration");
  ok(idle.tier === "idle", "arbiter: a satisfied schedule falls through to idle");

  const recorded = recordEntityBehaviorDecision({}, afraid);
  const calming = decideEntityAction(
    {
      ...actor,
      commitment: recorded.behavior_commitment,
    },
    { tick: 7, threat, schedule },
    "exploration",
  );
  const committedAgain = recordEntityBehaviorDecision(recorded, calming);
  ok(
    calming.tier === "emotional" && calming.from_commitment === true &&
      committedAgain.behavior_commitment?.remaining_turns === 1 &&
      committedAgain.behavior_intent_log.length === 2,
    "arbiter: urgent intent persists through a short commitment window and remains observable",
  );

  const task = activeReactiveTaskForActor([
    {
      id: "schedule_task",
      actor_id: actor.id,
      task_type: "travel_to_work",
      source_kind: "schedule",
      target_cell: [8, 8],
      priority: 100,
      state: "queued",
      created_at_tick: 0,
    },
    {
      id: "noise_task",
      actor_id: actor.id,
      task_type: "investigate",
      source_kind: "sound",
      target_cell: [2, 2],
      priority: 5,
      state: "queued",
      created_at_tick: 1,
    },
  ], actor.id, 2);
  ok(task?.id === "noise_task", "arbiter: reactive task selection ignores the deprecated schedule-task path");
}

console.log("engine-core: command → effect → event pipeline");
{
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = new InMemoryGridWorld(2024, 8, 8);
  world.addEntity({ id: "player", x: 2, y: 2 });
  world.setBlocked(3, 2); // wall to the right

  const moveUp = engine.dispatch({ type: "move_entity", actorId: "player", params: { dx: 0, dy: -1 } }, world);
  ok(moveUp.ok, "valid move accepted");
  ok(world.getEntity("player")!.y === 1, "entity moved to new cell");
  ok(moveUp.events.some((e) => e.type === "entity_moved"), "entity_moved event emitted");

  // Move back down, then into the wall.
  engine.dispatch({ type: "move_entity", actorId: "player", params: { dx: 0, dy: 1 } }, world);
  const intoWall = engine.dispatch({ type: "move_entity", actorId: "player", params: { dx: 1, dy: 0 } }, world);
  ok(!intoWall.ok && intoWall.reason === "blocked", "move into wall rejected");
  ok(world.getEntity("player")!.x === 2, "rejected move did not mutate state");

  const unknown = engine.dispatch({ type: "nonsense", actorId: "player" }, world);
  ok(!unknown.ok, "unknown command rejected");
}

console.log("engine-core: v1 package/save grid adapter");
{
  const gamePackage = createLegacyEngineTestFixturePackage();
  const demoMap = gamePackage.maps.find((map) => map.id === "map_demo_ground")!;
  const makeSave = (
    cell: [number, number],
    overrides: Partial<PlaySave> = {},
  ): PlaySave => ({
    schema: "crpg_engine_save_v1",
    package_version: gamePackage.metadata.version,
    current_map_id: demoMap.id,
    player: { cell, facing: [0, -1], sprite_id: "spr_player" },
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
    clock_minutes: 9 * 60,
    faction_rep: {},
    read_documents: [],
    in_combat: false,
    combat_queue: [],
    active_turn_id: "player",
    combat_xp_pool: 0,
    ...overrides,
  });

  ok(
    !("praxis_verbs" in (gamePackage as any)) &&
      !("praxis_cases" in (gamePackage as any)) &&
      !gamePackage.entities.some((entity) => "praxis_profile" in (entity as any)),
    "default package has no Praxis layer fields",
  );

  // ── S0/S1: simulation snapshot normalizes current map fields, materials, and conditions ──
  {
    ok(
      gamePackage.simulation_materials.some((material) => material.id === "sim_mat_wood") &&
        gamePackage.simulation_materials.some((material) => material.id === "sim_mat_stone"),
      "default package seeds Simulation S1 material profiles",
    );
    const simulationPackage = {
      ...gamePackage,
      maps: gamePackage.maps.map((map) =>
        map.id === demoMap.id
          ? {
              ...map,
              cells: map.cells.map((cell) =>
                cell.x === 0 && cell.z === 6
                  ? { ...cell, surface_tag: "oil" as const, hazard: "embers", infection: "spores" }
                  : cell,
              ),
            }
          : map,
      ),
    } as typeof gamePackage;
    const simulationSave = makeSave([0, 6], {
      map_deltas: {
        [demoMap.id]: {
          dropped_items: [{ id: "drop_sim_token", item_id: "itm_training_token", cell: [1, 6], count: 1 }],
        },
      },
    });
    const simulationSnapshot = createSimulationSnapshotFromV1(simulationPackage, simulationSave, demoMap.id);
    const simulationCell = simulationSnapshot.cells.find((cell) => cell.cell[0] === 0 && cell.cell[1] === 6);
    ok(
      simulationSnapshot.map_id === demoMap.id && simulationSnapshot.source.delta_applied,
      "simulation S0 builds a save-aware exact-cell snapshot",
    );
    ok(
      simulationCell?.surfaces.some((surface) => surface.kind === "oil") &&
        simulationCell.surfaces.some((surface) => surface.kind === "hazard" && surface.tag === "embers") &&
        simulationCell.surfaces.some((surface) => surface.kind === "infection" && surface.tag === "spores"),
      "simulation S0 normalizes surface_tag, hazard, and infection into surface states",
    );
    ok(
      simulationSnapshot.overlays.some((overlay) => overlay.id === "surfaces" && overlay.count >= 1) &&
        simulationSnapshot.overlays.some((overlay) => overlay.id === "collision" && overlay.count > 0) &&
        simulationSnapshot.overlays.some((overlay) => overlay.id === "items" && overlay.cells.some((entry) => entry.label.includes("Training Token"))),
      "simulation S0 exposes debug overlays for current surfaces, blockers, and save-delta items",
    );
    ok(
      simulationCell?.material_id === "sim_mat_stone" && simulationCell.condition.state === "intact",
      "simulation S1 assigns default material and condition state to cells",
    );

    const simulationDoor = demoMap.custom_object_placements.find((placement) => placement.object_id === "obj_p_door")!;
    const openedSimulationDoor = dispatchV1OpenDoor({
      gamePackage,
      save: makeSave([-1, -4]),
      x: simulationDoor.cell[0],
      y: simulationDoor.cell[1],
    });
    const openedDoorCondition =
      openedSimulationDoor.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[getV1DoorKey(simulationDoor)];
    const conditionSnapshot = createSimulationSnapshotFromV1(gamePackage, openedSimulationDoor.save, demoMap.id);
    ok(
      openedDoorCondition?.state === "worn" && openedDoorCondition.last_action === "open",
      "simulation S1 records door open condition changes in the save delta",
    );
    ok(
      conditionSnapshot.overlays.some((overlay) => overlay.id === "conditions" && overlay.count > 0),
      "simulation S1 exposes changed condition records as a debug overlay",
    );
    ok(
      conditionSnapshot.totals.movable_objects > 0 && conditionSnapshot.totals.max_push_energy_cost >= 300,
      "simulation S2 exposes manipulation affordance totals",
    );
  }

  const tokenDrop = demoMap.item_placements.find((p) => p.id === "drop_training_token")!;
  const chest = demoMap.container_placements.find((container) => container.id === "demo_locked_chest")!;
  const initialKernel = createKernelSnapshotFromV1(gamePackage, makeSave([0, 6]));
  const tokenInstanceId = kernelInstanceId(demoMap.id, "item", "drop_training_token");
  const chestInstanceId = kernelInstanceId(demoMap.id, "container", "demo_locked_chest");
  const tokenGroundHolderId = worldCellHolderId(demoMap.id, tokenDrop.cell);
  const playerInventoryHolderId = actorInventoryHolderId("player");
  const chestContentsHolderId = containerInventoryHolderId(demoMap.id, chest.id);
  const systemCacheHolderId = hiddenCacheHolderId(demoMap.id);
  const consumedHolderId = destroyedHolderId();
  ok(
    initialKernel.instances.some(
      (instance) =>
        instance.id === tokenInstanceId &&
        instance.location.type === "world_cell" &&
        instance.holder_id === tokenGroundHolderId,
    ),
    "kernel snapshot creates a stable authored item instance with a world-cell holder",
  );
  ok(
    initialKernel.instances.some((instance) => instance.id === chestInstanceId && instance.locked === true),
    "kernel snapshot creates container instances from authored placements",
  );
  ok(
    initialKernel.holders.some((holder) => holder.id === tokenGroundHolderId && holder.kind === "world_cell"),
    "kernel snapshot lists occupied world-cell holders",
  );
  ok(
    initialKernel.holders.some((holder) => holder.id === chestContentsHolderId && holder.kind === "container_inventory"),
    "kernel snapshot lists container inventory holders",
  );
  ok(
    gamePackage.object_blueprints.some((blueprint) => blueprint.id === "Object") &&
      gamePackage.object_blueprints.some((blueprint) => blueprint.id === "PhysicalObject"),
    "default package seeds GameObject/Part root blueprints",
  );
  const initialObjectModel = createGameObjectModelSnapshotFromV1(gamePackage, makeSave([0, 6]));
  const crateGameObject = initialObjectModel.objects.find(
    (object) => object.kind === "object" && object.template_id === "obj_crate",
  );
  ok(
    !!crateGameObject &&
      crateGameObject.parts.some((part) => part.type === "material_profile" && part.data.material_id === "sim_mat_wood") &&
      crateGameObject.parts.some((part) => part.type === "manipulation" && part.data.push_difficulty === 3),
    "object model synthesizes material and manipulation Parts for existing props",
  );
  const chestGameObject = initialObjectModel.objects.find(
    (object) => object.kind === "container" && object.template_id === "obj_chest",
  );
  const chestEvent = chestGameObject
    ? dispatchGameObjectEvent(chestGameObject, { type: "container_opened", tick: 0, target_object_id: chestGameObject.id })
    : undefined;
  ok(
    chestEvent?.ok === true && chestEvent.cascade_scopes.includes("container_contents"),
    "container Parts expose a cascade plan for contained objects",
  );
  const customPartPackage = {
    ...gamePackage,
    object_blueprints: [
      ...gamePackage.object_blueprints,
      {
        id: "test_flammable_crate",
        display_name: "Test Flammable Crate",
        extends: "PhysicalObject",
        tags: ["crate", "flammable"],
        parts: [
          {
            id: "flammable",
            type: "flammable",
            listens: ["apply_fire"],
            data: { ignition_temperature: 350, fuel_value: 4 },
          },
          {
            id: "breakable",
            type: "breakable",
            listens: ["object_hit", "object_broken"],
            data: { break_threshold: 4 },
          },
        ],
      },
    ],
    object_library: gamePackage.object_library.map((object) =>
      object.id === "obj_crate" ? { ...object, blueprint_id: "test_flammable_crate" } : object,
    ),
  } as typeof gamePackage;
  const flammableCrateBlueprint = resolveGameObjectBlueprint(customPartPackage, "test_flammable_crate");
  ok(
    flammableCrateBlueprint?.ancestor_ids.includes("PhysicalObject") &&
      flammableCrateBlueprint.parts.some((part) => part.id === "physical") &&
      flammableCrateBlueprint.parts.some((part) => part.id === "flammable"),
    "GameObject blueprints resolve inherited Parts",
  );
  const customObjectModel = createGameObjectModelSnapshotFromV1(customPartPackage, makeSave([0, 6]));
  const customCrateObject = customObjectModel.objects.find(
    (object) => object.kind === "object" && object.template_id === "obj_crate",
  );
  const fireEvent = customCrateObject
    ? dispatchGameObjectEvent(customCrateObject, { type: "apply_fire", tick: 12, target_object_id: customCrateObject.id })
    : undefined;
  ok(
    fireEvent?.ok === true && fireEvent.emitted.some((event) => event.type === "object_ignited"),
    "data-authored flammable Parts handle fire events without PlayMode code",
  );
  const appliedFireEvent = customCrateObject && fireEvent
    ? applyGameObjectPartEmissionsToSave(makeSave([0, 6]), customCrateObject, fireEvent.emitted)
    : undefined;
  ok(
    appliedFireEvent?.save.world_facts?.some((fact) => fact.action_type === "object_ignited") &&
      appliedFireEvent.condition_records.some((condition) => condition.state === "burned" && condition.last_action === "object_ignited") &&
      appliedFireEvent.environment_fields.some((field) => field.kind === "fire" && field.tag === "part_ignition"),
    "data-authored Parts commit save-backed kernel/simulation consequences",
  );
  const vetoFireEvent = customCrateObject
    ? dispatchGameObjectEvent(
        {
          ...customCrateObject,
          parts: [
            {
              id: "safety_interlock",
              type: "event_gate",
              listens: ["apply_fire"],
              cascade: [],
              data: { veto_events: ["apply_fire"], reason: "crate is sealed" },
              inherited_from: "test",
            },
            ...customCrateObject.parts,
          ],
        },
        { type: "apply_fire", tick: 13, target_object_id: customCrateObject.id },
      )
    : undefined;
  ok(
    vetoFireEvent?.ok === false && vetoFireEvent.vetoed_by_part_id === "safety_interlock",
    "object-local Parts can veto event handling",
  );
  const cascadePackage = {
    ...customPartPackage,
    object_blueprints: [
      ...customPartPackage.object_blueprints,
      {
        id: "test_flammable_token",
        display_name: "Test Flammable Token",
        extends: "ItemObject",
        tags: ["item", "flammable"],
        parts: [
          {
            id: "flammable",
            type: "flammable",
            listens: ["apply_fire"],
            cascade: [],
            data: { ignition_temperature: 250, fuel_value: 1 },
          },
        ],
      },
    ],
    items: customPartPackage.items.map((item) =>
      item.id === "itm_training_token" ? { ...item, blueprint_id: "test_flammable_token" } : item,
    ),
  } as typeof gamePackage;
  const cascadeModel = createGameObjectModelSnapshotFromV1(cascadePackage, makeSave([0, 6]));
  const cascadeChest = cascadeModel.objects.find(
    (object) => object.kind === "container" && object.template_id === "obj_chest",
  );
  const cascadeFire = cascadeChest
    ? dispatchGameObjectEventCascade(cascadeModel, cascadeChest, {
        type: "apply_fire",
        tick: 14,
        actor_id: "player",
        target_object_id: cascadeChest.id,
      })
    : undefined;
  ok(
    cascadeFire?.ok === true &&
      cascadeFire.cascaded.some(
        (entry) => entry.scope === "container_contents" && entry.result.emitted.some((event) => event.type === "object_ignited"),
      ),
    "object event cascade reaches contained objects through data-authored Parts",
  );
  const appliedCascade = cascadeFire ? applyGameObjectCascadeDispatchToSave(makeSave([0, 6]), cascadeFire) : undefined;
  ok(
    appliedCascade?.save.world_facts?.some((fact) => fact.action_type === "object_ignited"),
    "cascaded Part emissions commit durable world facts",
  );
  const weaponHolderId = equipmentSlotHolderId("player", "weapon");
  const mainHandHolderId = handSlotHolderId("player", "main");
  const equipmentHolderKernel = createKernelSnapshotFromV1(gamePackage, makeSave([0, 6], {
    world_facts: [
      {
        id: "wfact:test_equipment_holder",
        tick: 0,
        map_id: demoMap.id,
        plane_id: "ground",
        action_type: "equipment_holder_probe",
        previous_state: { from_holder_id: weaponHolderId },
        new_state: { to_holder_id: mainHandHolderId },
      },
    ],
  }));
  ok(
    equipmentHolderKernel.holders.some((holder) => holder.id === weaponHolderId && holder.kind === "equipment_slot"),
    "kernel snapshot recognizes equipment slot holders from facts",
  );
  ok(
    equipmentHolderKernel.holders.some((holder) => holder.id === mainHandHolderId && holder.kind === "hand_slot"),
    "kernel snapshot recognizes hand slot holders from facts",
  );

  const openGround = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([0, 6]),
    dx: 0,
    dy: -1,
  });
  ok(openGround.ok, "v1 adapter accepts movement onto open authored ground");
  ok(openGround.save.player.cell[0] === 0 && openGround.save.player.cell[1] === 5, "v1 move updates save player cell");
  ok(openGround.events.some((event) => event.type === "entity_moved"), "v1 move emits entity_moved event");
  ok(
    Boolean(openGround.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"]?.some((layer) => layer.kind === "footprint")),
    "movement records a Simulation S3 footprint trace layer",
  );
  const footprintSnapshot = createSimulationSnapshotFromV1(gamePackage, openGround.save, demoMap.id);
  ok(
    footprintSnapshot.totals.trace_cells > 0 &&
      footprintSnapshot.overlays.some((overlay) => overlay.id === "traces" && overlay.count > 0),
    "simulation S3 exposes runtime trace layers in snapshot overlays",
  );
  const residueTransferPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) =>
              cell.x === 0 && cell.z === 5
                ? {
                    ...cell,
                    surface_tag: "blood" as const,
                    simulation: {
                      ...(cell.simulation || {}),
                      trace_profile: {
                        residue_kind: "blood",
                        trace_potential: 0.9,
                        visibility: 0.8,
                        scent: 0.6,
                        slipperiness: 0.15,
                        cleaning_difficulty: 1.2,
                        decay_ticks: 300,
                        decay_per_tick: 0.001,
                        transfer_kinds: ["footprint"],
                      },
                    },
                  }
                : cell,
            ),
          }
        : map,
    ),
  } as typeof gamePackage;
  const bloodStep = dispatchV1MoveEntity({
    gamePackage: residueTransferPackage,
    save: makeSave([0, 6]),
    dx: 0,
    dy: -1,
  });
  const bloodLayers = bloodStep.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"] || [];
  ok(
    bloodStep.ok &&
      bloodLayers.some((layer) => layer.kind === "blood_footprint" && layer.residue_kind === "blood"),
    "movement transfers authored S3 residue into actor footprint traces",
  );
  const bloodSnapshot = createSimulationSnapshotFromV1(residueTransferPackage, bloodStep.save, demoMap.id);
  ok(
    bloodSnapshot.totals.residue_cells > 0 &&
      bloodSnapshot.overlays.some((overlay) => overlay.id === "residues" && overlay.count > 0),
    "simulation S3 exposes residue transfer overlays",
  );

  const surfaceLayerSave = makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [
            {
              id: "runtime_blood_pool",
              kind: "blood",
              tag: "blood",
              amount: 0.8,
              age_ticks: 4,
              source: "runtime",
              residue_kind: "blood",
              trace_potential: 0.9,
              cleaning_difficulty: 1.2,
              decay_per_tick: 0.001,
              created_at_tick: 500,
              expires_at_tick: 900,
            },
          ],
        },
      },
    },
  });
  const cleanedSurface = dispatchV1CleanSurface({
    gamePackage,
    save: surfaceLayerSave,
    x: 0,
    y: 5,
  });
  const cleanedLayers = cleanedSurface.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"] || [];
  ok(
    cleanedSurface.ok &&
      !cleanedLayers.some((layer) => layer.id === "runtime_blood_pool") &&
      cleanedLayers.some((layer) => layer.kind === "cleaned_trace" && layer.cleaned_by_actor_id === "player"),
    "clean_surface removes runtime residue while leaving a cleaned trace",
  );
  ok(
    cleanedSurface.save.map_deltas?.[demoMap.id]?.simulation_conditions?.["cell:map_demo_ground:0:5"]?.last_action === "clean" &&
      cleanedSurface.events.some((event) => event.type === "surface_cleaned"),
    "clean_surface records a stained cell condition and event",
  );
  ok(
    cleanedSurface.kernelFacts.some(
      (fact) => fact.action_type === "surface_cleaned" && fact.target_id === "cell:map_demo_ground:0:5",
    ),
    "kernel snapshot records surface cleaning as a world fact",
  );
  const cleanedSnapshot = createSimulationSnapshotFromV1(gamePackage, cleanedSurface.save, demoMap.id);
  ok(
    cleanedSnapshot.totals.cleaned_trace_cells > 0 &&
      cleanedSnapshot.overlays.some((overlay) => overlay.id === "cleaned_traces" && overlay.count > 0),
    "simulation S3 exposes cleaned trace overlays",
  );

  const decayedSurface = dispatchV1DecaySurfaces({
    gamePackage,
    save: makeSave([0, 6], {
      map_deltas: {
        [demoMap.id]: {
          surface_layers: {
            "0:5": [
              {
                id: "faint_footprint",
                kind: "footprint",
                amount: 0.05,
                age_ticks: 110,
                source: "trace",
                trace_actor_id: "player",
                trace_action: "move",
                residue_kind: "dust",
                decay_per_tick: 0.01,
                created_at_tick: 420,
                expires_at_tick: 800,
              },
              {
                id: "fresh_oil_trace",
                kind: "oil_footprint",
                amount: 0.6,
                age_ticks: 5,
                source: "trace",
                trace_actor_id: "player",
                trace_action: "residue_transfer",
                residue_kind: "oil",
                decay_per_tick: 0.001,
                created_at_tick: 535,
                expires_at_tick: 900,
              },
            ],
          },
        },
      },
    }),
    ticks: 10,
  });
  const decayedLayers = decayedSurface.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"] || [];
  ok(
    decayedSurface.ok &&
      !decayedLayers.some((layer) => layer.id === "faint_footprint") &&
      decayedLayers.some((layer) => layer.id === "fresh_oil_trace" && layer.age_ticks >= 15),
    "decay_surfaces ages persistent traces and removes faint expired layers",
  );
  ok(
    decayedSurface.events.some(
      (event) => event.type === "surfaces_decayed" && (event.payload as any)?.removed >= 1,
    ),
    "decay_surfaces emits deterministic cleanup metadata",
  );
  ok(
    Boolean(openGround.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"]?.some((field) => field.kind === "sound")),
    "movement records Simulation S4 propagated footstep sound",
  );
  const footstepSnapshot = createSimulationSnapshotFromV1(gamePackage, openGround.save, demoMap.id);
  ok(
    footstepSnapshot.totals.sound_cells > 0 &&
      footstepSnapshot.overlays.some((overlay) => overlay.id === "sound" && overlay.count > 0),
    "simulation S4 exposes sound propagation overlays",
  );

  const soundPulse = dispatchV1EmitSound({
    gamePackage,
    save: makeSave([0, 6]),
    cell: [0, 5],
    loudness: 4,
    tag: "bell",
    materialTag: "metal",
  });
  ok(
    soundPulse.ok &&
      Object.values(soundPulse.save.map_deltas?.[demoMap.id]?.environment_fields || {}).flat().some(
        (field) => field.kind === "sound" && field.frequency_tag === "bell",
      ),
    "emit_sound writes propagated sound fields with frequency metadata",
  );
  ok(
    !(soundPulse.save.map_deltas?.[demoMap.id]?.npc_tasks || []).some(
      (task) => task.source_kind === "sound",
    ),
    "emit_sound leaves NPC response to sensory-profile perception",
  );
  const soundEvent = soundPulse.events.find((event) => event.type === "sound_propagated");
  const propagatedSoundFields = Object.values(
    soundPulse.save.map_deltas?.[demoMap.id]?.environment_fields || {},
  ).flat();
  ok(
    propagatedSoundFields.length === Number(soundEvent?.payload?.cells || 0) &&
      propagatedSoundFields.every(
        (field) =>
          field.kind === "sound" &&
          field.frequency_tag === "bell" &&
          field.origin_cell?.[0] === 0 &&
          field.origin_cell?.[1] === 5 &&
          field.created_at_tick === 9 * 60 &&
          field.expires_at_tick === 9 * 60 + 8,
      ),
    "emit_sound batches the exact propagated field count and metadata reported by the event",
  );

  const seededSoundFields = Array.from({ length: 12 }, (_, index) => ({
    id: `seed_sound_${index}`,
    kind: "sound" as const,
    intensity: 0.1,
    age_ticks: index,
    source: "runtime" as const,
    tag: "seed",
    created_at_tick: 500 + index,
    expires_at_tick: 800,
  }));
  const cappedSoundPulse = dispatchV1EmitSound({
    gamePackage,
    save: makeSave([0, 6], {
      map_deltas: {
        [demoMap.id]: {
          environment_fields: { "0:5": seededSoundFields },
        },
      },
    }),
    cell: [0, 5],
    loudness: 1,
    tag: "tap",
  });
  const cappedOriginFields =
    cappedSoundPulse.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"] || [];
  ok(
    cappedOriginFields.length === 10 &&
      cappedOriginFields[0]?.id === "seed_sound_3" &&
      cappedOriginFields[8]?.id === "seed_sound_11" &&
      cappedOriginFields[9]?.id === "env_sound_540_0_5_12",
    "batched sound propagation preserves per-cell history caps and stable id suffixes",
  );

  const igniteFire = dispatchV1IgniteFire({
    gamePackage,
    save: makeSave([0, 6]),
    x: 0,
    y: 5,
  });
  const ignitedFields = Object.values(igniteFire.save.map_deltas?.[demoMap.id]?.environment_fields || {}).flat();
  ok(
    igniteFire.ok &&
      ignitedFields.some((field) => field.kind === "fire") &&
      ignitedFields.some((field) => field.kind === "smoke") &&
      ignitedFields.some((field) => field.kind === "light"),
    "ignite_fire creates Simulation S4 fire, smoke, and light fields",
  );
  const igniteSnapshot = createSimulationSnapshotFromV1(gamePackage, igniteFire.save, demoMap.id);
  ok(
    igniteSnapshot.totals.fire_cells > 0 &&
      igniteSnapshot.totals.smoke_cells > 0 &&
      igniteSnapshot.totals.light_cells > 0,
    "simulation S4 exposes fire, smoke, and light overlays",
  );
  ok(
    igniteFire.save.map_deltas?.[demoMap.id]?.simulation_conditions?.["cell:map_demo_ground:0:5"]?.state === "burned",
    "ignite_fire records a burned cell condition",
  );
  const smokeVisionSave = makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [
            {
              id: "dense_smoke_test",
              kind: "smoke",
              intensity: 0.65,
              age_ticks: 0,
              source: "runtime",
              tag: "dense_smoke",
              visibility_modifier: -0.35,
              decay_per_tick: 0.01,
              created_at_tick: 540,
              expires_at_tick: 700,
            },
          ],
        },
      },
    },
  });
  const smokeVisionSnapshot = createSimulationSnapshotFromV1(gamePackage, smokeVisionSave, demoMap.id);
  ok(
    smokeVisionSnapshot.cells.some((cell) => cell.cell[0] === 0 && cell.cell[1] === 5 && cell.blocks_vision),
    "simulation S4 dense smoke marks cells as vision-blocking",
  );

  const authoredLightPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) => (cell.x === 0 && cell.z === 5 ? { ...cell, tag: "torch_light" } : cell)),
          }
        : map,
    ),
  } as typeof gamePackage;
  const authoredLightSnapshot = createSimulationSnapshotFromV1(authoredLightPackage, makeSave([0, 6]), demoMap.id);
  ok(
    authoredLightSnapshot.totals.light_cells > 0 &&
      authoredLightSnapshot.cells.some((cell) => cell.environment.some((field) => field.kind === "light" && field.source === "authored")),
    "simulation S4 normalizes authored static light sources",
  );

  const oilFirePackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) =>
              (cell.x === 0 && cell.z === 5) || (cell.x === 1 && cell.z === 5)
                ? { ...cell, surface_tag: "oil" as const }
                : cell,
            ),
          }
        : map,
    ),
  } as typeof gamePackage;
  const spreadingFire = dispatchV1AdvanceEnvironment({
    gamePackage: oilFirePackage,
    save: dispatchV1IgniteFire({
      gamePackage: oilFirePackage,
      save: makeSave([0, 6]),
      x: 0,
      y: 5,
    }).save,
    ticks: 1,
  });
  const spreadFields = Object.values(spreadingFire.save.map_deltas?.[demoMap.id]?.environment_fields || {}).flat();
  ok(
    spreadingFire.ok &&
      spreadFields.some((field) => field.kind === "fire" && field.source === "propagation") &&
      spreadFields.some((field) => field.kind === "smoke" && field.source === "propagation"),
    "advance_environment propagates S4 fire and smoke through flammable cells",
  );
  ok(
    (spreadingFire.save.map_deltas?.[demoMap.id]?.npc_tasks || []).some(
      (task) => (task.task_type === "report" || task.task_type === "investigate") && task.source_kind === "fire",
    ),
    "advance_environment begins Simulation S5 by queueing NPC fire response tasks",
  );

  const fireDamage = dispatchV1AdvanceEnvironment({
    gamePackage,
    save: dispatchV1IgniteFire({
      gamePackage,
      save: makeSave([0, 5]),
      x: 0,
      y: 5,
    }).save,
    ticks: 1,
  });
  ok(
    fireDamage.ok &&
      fireDamage.save.playerStats.hp < 24 &&
      fireDamage.save.actor_statuses?.player?.some((status) => status.id === "burn"),
    "advance_environment applies S4 fire damage and burn status to actors in fire",
  );

  const extinguishedFire = dispatchV1ExtinguishFire({
    gamePackage,
    save: igniteFire.save,
    x: 0,
    y: 5,
  });
  const extinguishedFields = extinguishedFire.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"] || [];
  ok(
    extinguishedFire.ok &&
      !extinguishedFields.some((field) => field.kind === "fire") &&
      extinguishedFields.some((field) => field.kind === "smoke" && field.action === "extinguish"),
    "extinguish_fire removes fire and leaves doused smoke",
  );
  const taskSnapshot = createSimulationSnapshotFromV1(
    oilFirePackage,
    spreadingFire.save,
    demoMap.id,
  );
  ok(
    taskSnapshot.totals.npc_tasks > 0 &&
      taskSnapshot.overlays.some((overlay) => overlay.id === "npc_tasks" && overlay.count > 0),
    "simulation S5 exposes queued NPC tasks in snapshot overlays",
  );
  const guideIndexForTasks = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_guide");
  const guideTaskKey = entityStateKey(demoMap.id, "ent_guide", guideIndexForTasks);
  const taskMove = dispatchV1AdvanceNpcTasks({
    gamePackage,
    save: makeSave([4, 6], {
      entity_states: { [guideTaskKey]: { cell: [0, 6] } },
      map_deltas: {
        [demoMap.id]: {
          npc_tasks: [{
            id: "task_test_investigate",
            actor_id: guideTaskKey,
            task_type: "investigate",
            source_kind: "sound",
            target_cell: [2, 6],
            origin_cell: [2, 6],
            priority: 1,
            state: "queued",
            created_at_tick: 540,
            expires_at_tick: 800,
          }],
        },
      },
    }),
    ticks: 1,
  });
  ok(
    taskMove.ok &&
      taskMove.save.entity_states?.[guideTaskKey]?.cell?.[0] === 1 &&
      taskMove.save.map_deltas?.[demoMap.id]?.npc_tasks?.some((task) => task.id === "task_test_investigate" && task.state === "active"),
    "advance_npc_tasks activates queued tasks and moves NPCs toward targets",
  );
  const taskComplete = dispatchV1AdvanceNpcTasks({
    gamePackage,
    save: taskMove.save,
    ticks: 1,
  });
  ok(
    taskComplete.ok &&
      taskComplete.save.map_deltas?.[demoMap.id]?.npc_tasks?.some((task) => task.id === "task_test_investigate" && task.state === "done") &&
      taskComplete.save.world_facts?.some((fact) => fact.action_type === "npc_investigated_disturbance"),
    "advance_npc_tasks completes investigation tasks into NPC memory/world facts",
  );
  const taskCleanup = dispatchV1AdvanceNpcTasks({
    gamePackage,
    save: makeSave([4, 6], {
      entity_states: { [guideTaskKey]: { cell: [0, 5] } },
      map_deltas: {
        [demoMap.id]: {
          surface_layers: {
            "0:5": [{
              id: "task_cleanup_blood",
              kind: "blood",
              amount: 0.8,
              age_ticks: 0,
              source: "runtime",
              residue_kind: "blood",
              created_at_tick: 540,
              expires_at_tick: 900,
            }],
          },
          npc_tasks: [{
            id: "task_test_cleanup",
            actor_id: guideTaskKey,
            task_type: "cleanup",
            source_kind: "trace",
            target_cell: [0, 5],
            priority: 0.8,
            state: "queued",
            created_at_tick: 540,
          }],
        },
      },
    }),
    ticks: 1,
  });
  ok(
    taskCleanup.ok &&
      taskCleanup.save.map_deltas?.[demoMap.id]?.npc_tasks?.some((task) => task.id === "task_test_cleanup" && task.state === "done") &&
      taskCleanup.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"]?.some((layer) => layer.kind === "cleaned_trace"),
    "advance_npc_tasks resolves cleanup tasks through the surface-cleaning system",
  );
  const taskRepair = dispatchV1AdvanceNpcTasks({
    gamePackage,
    save: makeSave([4, 6], {
      entity_states: { [guideTaskKey]: { cell: [0, 5] } },
      map_deltas: {
        [demoMap.id]: {
          npc_tasks: [{
            id: "task_test_repair",
            actor_id: guideTaskKey,
            task_type: "repair",
            source_kind: "authored",
            target_cell: [0, 5],
            priority: 0.6,
            state: "queued",
            created_at_tick: 540,
          }],
        },
      },
    }),
    ticks: 1,
  });
  ok(
    taskRepair.ok &&
      taskRepair.save.map_deltas?.[demoMap.id]?.simulation_conditions?.["cell:map_demo_ground:0:5"]?.state === "repaired",
    "advance_npc_tasks resolves repair tasks into simulation condition records",
  );
  const taskRestock = dispatchV1AdvanceNpcTasks({
    gamePackage,
    save: makeSave([0, 6], {
      entity_states: { [guideTaskKey]: { cell: [4, 5] } },
      map_deltas: {
        [demoMap.id]: {
          containers: { [chest.id]: { locked: false, opened: true, items: [] } },
          npc_tasks: [{
            id: "task_test_restock",
            actor_id: guideTaskKey,
            task_type: "restock",
            source_kind: "authored",
            target_cell: [4, 4],
            priority: 0.5,
            state: "queued",
            created_at_tick: 540,
          }],
        },
      },
    }),
    ticks: 1,
  });
  ok(
    taskRestock.ok &&
      taskRestock.save.map_deltas?.[demoMap.id]?.containers?.[chest.id]?.items?.some((entry) => entry.item_id === "itm_health_tonic"),
    "advance_npc_tasks resolves restock tasks into container inventory",
  );
  const scheduledTasks = dispatchV1AdvanceNpcTasks({
    gamePackage,
    save: makeSave([0, 6], { entity_states: { [guideTaskKey]: { cell: [0, 6] } } }),
    ticks: 1,
  });
  ok(
    scheduledTasks.ok &&
      !(scheduledTasks.save.map_deltas?.[demoMap.id]?.npc_tasks || []).some(
        (task) => task.task_type === "travel_to_work" || task.source_kind === "schedule",
      ),
    "advance_npc_tasks leaves stateless schedules to the behavior arbiter",
  );
  const startedProcess = dispatchV1StartProcess({
    gamePackage,
    save: makeSave([0, 6], { inventory: [{ id: "itm_training_token", count: 1 }] }),
    processType: "alchemy",
    cell: [0, 5],
    actorIds: ["player"],
    requiredTicks: 3,
    inputItems: [{ item_id: "itm_training_token", count: 1 }],
    outputItems: [{ item_id: "itm_health_tonic", count: 1 }],
    wasteItems: [{ item_id: "itm_training_token", count: 1 }],
    emits: { sound: 2, heat: 0.4 },
  });
  ok(
    startedProcess.ok &&
      !startedProcess.save.inventory.some((entry) => entry.id === "itm_training_token") &&
      startedProcess.save.map_deltas?.[demoMap.id]?.simulation_processes?.some((process) => process.process_type === "alchemy" && process.state === "active"),
    "start_process begins Simulation S6 processes and consumes inputs",
  );
  const processSnapshot = createSimulationSnapshotFromV1(gamePackage, startedProcess.save, demoMap.id);
  ok(
    processSnapshot.totals.simulation_processes === 1 &&
      processSnapshot.overlays.some((overlay) => overlay.id === "simulation_processes" && overlay.count === 1),
    "simulation S6 exposes active processes in snapshot overlays",
  );
  const advancedProcess = dispatchV1AdvanceProcesses({
    gamePackage,
    save: startedProcess.save,
    ticks: 3,
  });
  ok(
    advancedProcess.ok &&
      advancedProcess.save.map_deltas?.[demoMap.id]?.simulation_processes?.some((process) => process.state === "complete") &&
      advancedProcess.save.map_deltas?.[demoMap.id]?.dropped_items?.some((drop) => drop.item_id === "itm_health_tonic") &&
      advancedProcess.save.world_facts?.some((fact) => fact.action_type === "simulation_process_completed"),
    "advance_processes completes S6 processes into outputs, waste, emissions, and world facts",
  );
  ok(
    gamePackage.simulation_processes.some((process) => process.id === "sim_proc_brew_tonic") &&
      gamePackage.simulation_processes.some((process) => process.id === "sim_proc_pack_field_ration") &&
      gamePackage.items.some((item) => item.id === "itm_field_ration" && item.effects?.survival_restore?.hunger) &&
      gamePackage.simulation_workstations.some(
        (station) =>
          station.id === "sim_ws_demo_alchemy" &&
          station.process_ids.includes("sim_proc_brew_tonic") &&
          station.process_ids.includes("sim_proc_pack_field_ration"),
      ),
    "default package seeds authored Simulation S6 process, workstation, and survival-ration definitions",
  );
  const authoredWorldProcess = dispatchV1StartProcess({
    gamePackage,
    save: makeSave([-2, 6], {
      current_map_id: "map_overworld",
      inventory: [{ id: "itm_training_token", count: 1 }],
    }),
    processId: "sim_proc_brew_tonic",
    workstationId: "sim_ws_world_alchemy",
    cell: [-2, 5],
    actorIds: ["player"],
  });
  ok(
    authoredWorldProcess.ok &&
      authoredWorldProcess.save.map_deltas?.map_overworld?.simulation_processes?.some(
        (process) => process.process_def_id === "sim_proc_brew_tonic" && process.workstation_id === "sim_ws_world_alchemy",
      ),
    "start_process can instantiate authored S6 process definitions at the systems-map workstation",
  );
  const authoredProcess = dispatchV1StartProcess({
    gamePackage,
    save: makeSave([0, 6], { inventory: [{ id: "itm_training_token", count: 1 }] }),
    processId: "sim_proc_brew_tonic",
    cell: [0, 5],
    actorIds: ["player"],
  });
  ok(
    authoredProcess.ok &&
      authoredProcess.save.map_deltas?.[demoMap.id]?.simulation_processes?.some(
        (process) => process.process_def_id === "sim_proc_brew_tonic" && process.workstation_id === "sim_ws_demo_alchemy",
      ),
    "start_process can instantiate authored S6 process definitions at a workstation",
  );
  const costedRationProcess = dispatchV1StartProcess({
    gamePackage,
    save: makeSave([0, 6], { inventory: [{ id: "itm_training_token", count: 1 }] }),
    processId: "sim_proc_pack_field_ration",
    cell: [0, 5],
    actorIds: ["player"],
    energyCost: 1000,
  });
  ok(
    costedRationProcess.ok &&
      costedRationProcess.save.playerStats.energy === 0 &&
      costedRationProcess.events.some((event) => event.type === "resource_spent" && (event.payload as any)?.energy === 1000),
    "start_process can spend player action energy",
  );
  const completedRationProcess = dispatchV1AdvanceProcesses({
    gamePackage,
    save: {
      ...costedRationProcess.save,
      playerStats: { ...costedRationProcess.save.playerStats, energy: 1000 },
    },
    ticks: 2,
    energyCost: 1000,
  });
  ok(
    completedRationProcess.ok &&
      completedRationProcess.save.playerStats.energy === 0 &&
      completedRationProcess.save.map_deltas?.[demoMap.id]?.dropped_items?.some((drop) => drop.item_id === "itm_field_ration") &&
      completedRationProcess.events.some((event) => event.type === "resource_spent" && (event.payload as any)?.energy === 1000),
    "advance_processes completes authored survival-ration output and spends player action energy",
  );
  const occupiedProcess = dispatchV1StartProcess({
    gamePackage,
    save: authoredProcess.save,
    processId: "sim_proc_brew_tonic",
    cell: [0, 5],
    actorIds: ["player"],
  });
  ok(!occupiedProcess.ok && occupiedProcess.reason === "workstation occupied", "start_process rejects occupied workstations");
  const completedAuthoredProcess = dispatchV1AdvanceProcesses({
    gamePackage,
    save: authoredProcess.save,
    ticks: 3,
  });
  const economyStock = completedAuthoredProcess.save.simulation_economy?.shop_stock?.["shop_demo_supply:itm_health_tonic"];
  ok(
    completedAuthoredProcess.ok &&
      economyStock?.stock === 1 &&
      economyStock.shortage &&
      economyStock.price_modifier === 2,
    "advance_processes updates local S6 economy stock and shortage price pressure",
  );
  const scarcePurchase = dispatchV1BuyShopItem({
    gamePackage,
    save: { ...completedAuthoredProcess.save, money: 10 },
    shopId: "shop_demo_supply",
    stockIndex: 0,
  });
  ok(
    scarcePurchase.ok &&
      scarcePurchase.outcome?.unitPrice === 7 &&
      scarcePurchase.save.simulation_economy?.shop_stock?.["shop_demo_supply:itm_health_tonic"]?.stock === 0,
    "shop purchases consume S6 local stock and apply shortage pricing",
  );
  const interruptedProcess = dispatchV1InterruptProcess({
    gamePackage,
    save: authoredProcess.save,
    processId: authoredProcess.save.map_deltas?.[demoMap.id]?.simulation_processes?.[0]?.id || "",
    reason: "manual_interrupt",
  });
  ok(
    interruptedProcess.ok &&
      interruptedProcess.save.map_deltas?.[demoMap.id]?.simulation_processes?.some((process) => process.state === "failed" && process.result === "manual_interrupt") &&
      interruptedProcess.save.world_facts?.some((fact) => fact.action_type === "simulation_process_failed"),
    "interrupt_process fails active S6 processes and writes a world fact",
  );
  const otherMap = gamePackage.maps.find((map) => map.id !== demoMap.id);
  const regionalAdvance = dispatchV1AdvanceSimulationRegions({
    gamePackage,
    save: makeSave([0, 6], otherMap ? {
      map_deltas: {
        [otherMap.id]: {
          environment_fields: {
            "0:0": [{
              id: "offmap_smoke",
              kind: "smoke",
              intensity: 0.5,
              age_ticks: 0,
              source: "runtime",
              created_at_tick: 540,
            }],
          },
        },
      },
      simulation_regions: {
        [`${otherMap.id}:map`]: {
          id: `${otherMap.id}:map`,
          map_id: otherMap.id,
          region_id: "map",
          resolution: "exact",
          cell_count: 1,
          active_processes: 0,
          queued_tasks: 0,
          environment_fields: 0,
          fire_intensity: 0,
          smoke_intensity: 0,
          sound_intensity: 0,
          updated_at_tick: 530,
        },
      },
    } : {}),
    ticks: 5,
  });
  const regionalRecords = Object.values(regionalAdvance.save.simulation_regions || {});
  ok(
    regionalAdvance.ok &&
      regionalRecords.some((region) => region.map_id === demoMap.id && region.resolution === "exact") &&
      regionalRecords.some((region) => region.map_id !== demoMap.id && (region.resolution === "aggregate" || region.resolution === "dormant")),
    "advance_simulation_regions begins S7 by writing exact/aggregate/dormant regional state",
  );
  const regionalSnapshot = createSimulationSnapshotFromV1(gamePackage, regionalAdvance.save, demoMap.id);
  ok(regionalSnapshot.totals.regional_aggregates > 0, "simulation S7 exposes regional aggregate counts in snapshots");
  if (otherMap) {
    const offMapProcess = dispatchV1AdvanceSimulationRegions({
      gamePackage,
      save: makeSave([0, 6], {
        map_deltas: {
          [otherMap.id]: {
            simulation_processes: [{
              id: "offmap_process",
              process_type: "crafting",
              cell: [0, 0],
              state: "queued",
              progress_ticks: 0,
              required_ticks: 2,
              output_items: [{ item_id: "itm_health_tonic", count: 1 }],
              created_at_tick: 540,
            }],
          },
        },
      }),
      ticks: 4,
    });
    ok(
      offMapProcess.ok &&
        offMapProcess.events.some((event) => event.type === "simulation_regions_advanced" && ((event.payload as any)?.completed || 0) > 0) &&
        offMapProcess.save.map_deltas?.[otherMap.id]?.simulation_processes?.some((process) => process.state === "complete") &&
        offMapProcess.save.map_deltas?.[otherMap.id]?.dropped_items?.some((drop) => drop.item_id === "itm_health_tonic"),
      "advance_simulation_regions completes S7 off-map processes and reconciles their outputs",
    );
    const offMapTask = dispatchV1AdvanceSimulationRegions({
      gamePackage,
      save: makeSave([0, 6], {
        map_deltas: {
          [otherMap.id]: {
            surface_layers: {
              "0:0": [{
                id: "offmap_spill",
                kind: "oil",
                amount: 0.75,
                age_ticks: 0,
                source: "runtime",
                created_at_tick: 540,
              }],
            },
            npc_tasks: [{
              id: "offmap_cleanup",
              actor_id: "missing_regional_worker",
              task_type: "cleanup",
              source_kind: "trace",
              target_cell: [0, 0],
              priority: 1,
              state: "queued",
              progress_ticks: 0,
              created_at_tick: 540,
            }],
          },
        },
      }),
      ticks: 12,
    });
    ok(
      offMapTask.ok &&
        offMapTask.save.map_deltas?.[otherMap.id]?.npc_tasks?.some((task) => task.state === "done") &&
        !offMapTask.save.map_deltas?.[otherMap.id]?.surface_layers?.["0:0"],
      "advance_simulation_regions resolves S7 aggregate NPC tasks without loading the map exactly",
    );
    const promotedRegionId = demoMap.cells[0]?.region_id || demoMap.cells[0]?.room_id || "map";
    const promotedCell = demoMap.cells[0]!;
    const promoted = dispatchV1AdvanceSimulationRegions({
      gamePackage,
      save: makeSave([0, 6], {
        simulation_regions: {
          [`${demoMap.id}:${promotedRegionId}`]: {
            id: `${demoMap.id}:${promotedRegionId}`,
            map_id: demoMap.id,
            region_id: promotedRegionId,
            resolution: "aggregate",
            cell_count: 1,
            active_processes: 0,
            queued_tasks: 0,
            environment_fields: 2,
            fire_intensity: 0.6,
            smoke_intensity: 0.4,
            sound_intensity: 0.3,
            updated_at_tick: 530,
          },
        },
      }),
      ticks: 1,
    });
    const promotedKey = `${promotedCell.x}:${promotedCell.z}`;
    const promotedFields = promoted.save.map_deltas?.[demoMap.id]?.environment_fields?.[promotedKey] || [];
    const promotedSnapshot = createSimulationSnapshotFromV1(gamePackage, promoted.save, demoMap.id);
    ok(
      promoted.ok &&
        promotedFields.some((field) => field.tag === "regional_reconciliation") &&
        promotedSnapshot.totals.exact_regions > 0,
      "advance_simulation_regions reconciles aggregate S7 fields when a region promotes to exact",
    );
  }
  const semanticSourceSave = makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:6": [{
            id: "semantic_footprint",
            kind: "mud",
            amount: 0.8,
            age_ticks: 0,
            source: "trace",
            trace_actor_id: "ent_guide",
            trace_action: "movement",
            residue_kind: "mud",
            visibility: 0.7,
            trace_potential: 0.8,
            created_at_tick: 540,
          }],
        },
        simulation_conditions: {
          [`cell:${demoMap.id}:0:6`]: {
            target_kind: "cell",
            target_id: `cell:${demoMap.id}:0:6`,
            state: "stained",
            integrity: 0.6,
            condition_tags: ["mud"],
            cell: [0, 6],
            last_action: "footprint_transfer",
            updated_at_tick: 540,
          },
        },
        environment_fields: {
          "0:6": [{
            id: "semantic_smoke",
            kind: "smoke",
            intensity: 0.45,
            age_ticks: 0,
            source: "runtime",
            tag: "doused_fire",
            origin_cell: [0, 6],
            visibility_modifier: -0.2,
            created_at_tick: 540,
          }],
        },
      },
    },
  });
  const semanticAdapted = dispatchV1AdaptSimulationSemantics({
    gamePackage,
    save: semanticSourceSave,
    mapId: demoMap.id,
  });
  ok(
    semanticAdapted.ok &&
      !("praxis_state" in (semanticAdapted.save as any)) &&
      semanticAdapted.events.some((event) => event.type === "simulation_semantics_adapted"),
    "adapt_simulation_semantics remains available without creating Praxis state",
  );
  const semanticSnapshot = createSimulationSnapshotFromV1(gamePackage, semanticAdapted.save, demoMap.id);
  ok(
    semanticSnapshot.totals.semantic_observations === 0 &&
      semanticSnapshot.totals.semantic_evidence_links === 0,
    "simulation snapshots report no Praxis semantic counts after layer removal",
  );
  const stage2FireSnapshot = createImmersiveStage2SnapshotFromV1(gamePackage, igniteFire.save, demoMap.id);
  const stage2HotCell = stage2FireSnapshot.tile_layers.cells.find(
    (cell) => cell.cell[0] === 0 && cell.cell[1] === 5,
  );
  ok(
    !!stage2HotCell &&
      stage2HotCell.temperature > 300 &&
      stage2HotCell.light > 0 &&
      stage2FireSnapshot.tile_layers.totals.temperature_cells > 0,
    "stage 2 tile layers expose temperature/light from existing simulation fields",
  );
  const stage2Advanced = advanceImmersiveStage2Snapshot(stage2FireSnapshot, { segments: 10 });
  const cooledHotCell = stage2Advanced.snapshot.tile_layers.cells.find(
    (cell) => cell.cell[0] === 0 && cell.cell[1] === 5,
  );
  ok(
    stage2Advanced.ok &&
      !!cooledHotCell &&
      !!stage2HotCell &&
      cooledHotCell.temperature < stage2HotCell.temperature &&
      stage2Advanced.events.some((event) => event.type === "EndSegment") &&
      stage2Advanced.events.some((event) => event.type === "EndTurn"),
    "stage 2 scheduler advances time and relaxes tile temperature toward ambient",
  );
  const stage2Action = advanceImmersiveStage2Snapshot(stage2Advanced.snapshot, {
    action: { actor_id: "player", action_type: "wait", energy_cost: 1000 },
  });
  ok(
    stage2Action.ok &&
      stage2Action.events.some((event) => event.type === "EndAction" && event.actor_id === "player") &&
      (stage2Action.snapshot.scheduler.actors.find((actor) => actor.id === "player")?.energy || 0) >= 1000,
    "stage 2 scheduler resolves player actions on the same energy clock",
  );
  const stage2SaveAdvance = advanceImmersiveStage2Save(gamePackage, igniteFire.save, {
    mapId: demoMap.id,
    segments: 10,
    action: { actor_id: "player", action_type: "wait", energy_cost: 250 },
  });
  ok(
    stage2SaveAdvance.ok &&
      !!stage2SaveAdvance.save.immersive_scheduler &&
      !!stage2SaveAdvance.save.immersive_tile_layers?.[demoMap.id] &&
      stage2SaveAdvance.save.clock_minutes === stage2SaveAdvance.snapshot.scheduler.tick,
    "stage 2 advancement persists scheduler and dynamic tile layers into the save",
  );
  const stage2SavedSnapshot = createImmersiveStage2SnapshotFromV1(gamePackage, stage2SaveAdvance.save, demoMap.id);
  const savedHotCell = stage2SavedSnapshot.tile_layers.cells.find((cell) => cell.cell[0] === 0 && cell.cell[1] === 5);
  ok(
    !!savedHotCell && !!cooledHotCell && savedHotCell.temperature === cooledHotCell.temperature,
    "stage 2 snapshots read saved tile-layer overrides",
  );
  const oilFireReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_oil_pool",
            kind: "oil",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.8,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_fire_seed",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_fire",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    oilFireReaction.reactions.some((reaction) => reaction.rule_id === "fire_ignites_oil") &&
      oilFireReaction.environment_fields.some((field) => field.kind === "fire" && field.tag === "oil_fire") &&
      oilFireReaction.environment_fields.some((field) => field.kind === "smoke") &&
      oilFireReaction.condition_records.some((condition) => condition.state === "burned"),
    "stage 3 reaction table ignites oil into fire/smoke and burned cell state",
  );
  const waterFireReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_water_pool",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_fire_for_steam",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_fire",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    waterFireReaction.reactions.some((reaction) => reaction.rule_id === "water_extinguishes_fire_to_steam") &&
      waterFireReaction.environment_fields.some((field) => field.kind === "steam" && field.visibility_modifier === -0.3) &&
      waterFireReaction.surface_layers.some((layer) => layer.kind === "doused") &&
      !(waterFireReaction.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"] || []).some((field) => field.kind === "fire"),
    "stage 3 reaction table resolves water plus fire into steam, doused residue, and consumed fire",
  );
  const electricWaterReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_conductive_water",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_shock_seed",
            kind: "electricity",
            intensity: 0.7,
            age_ticks: 0,
            source: "runtime",
            tag: "test_shock",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    electricWaterReaction.reactions.some((reaction) => reaction.rule_id === "electricity_conducts_water") &&
      electricWaterReaction.environment_fields.some((field) => field.kind === "electricity" && field.tag === "conductive_water") &&
      electricWaterReaction.save.world_facts?.some((fact) => fact.action_type === "immersive_reaction_resolved"),
    "stage 3 reaction table resolves electricity through water with durable facts",
  );
  const poisonFireReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_poison_pool",
            kind: "poison",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.35,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_fire_for_poison",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_fire",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    poisonFireReaction.reactions.some((reaction) => reaction.rule_id === "fire_vaporizes_poison") &&
      poisonFireReaction.environment_fields.some((field) => field.kind === "poison_gas" && field.damage_per_tick === 2) &&
      poisonFireReaction.environment_fields.some((field) => field.kind === "smoke" && field.tag === "toxic_smoke") &&
      poisonFireReaction.condition_records.some((condition) => condition.state === "contaminated"),
    "stage 3 reaction table vaporizes poison into toxic smoke and contamination",
  );
  const coldWaterReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_freezable_water",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_cold_seed",
            kind: "cold",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_cold",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    coldWaterReaction.reactions.some((reaction) => reaction.rule_id === "cold_freezes_water") &&
      coldWaterReaction.surface_layers.some((layer) => layer.kind === "ice" && layer.slipperiness === 0.75) &&
      coldWaterReaction.condition_records.some((condition) => condition.state === "frozen") &&
      coldWaterReaction.save.immersive_tile_layers?.[demoMap.id]?.["0:5"]?.surface_kinds.includes("ice") &&
      !(coldWaterReaction.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"] || []).some((layer) => layer.kind === "water"),
    "stage 3 reaction table freezes water into slippery ice, consumed water, and frozen cell state",
  );
  const iceFireReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_meltable_ice",
            kind: "ice",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.75,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_fire_for_ice",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_fire",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    iceFireReaction.reactions.some((reaction) => reaction.rule_id === "fire_melts_ice_to_water") &&
      iceFireReaction.surface_layers.some((layer) => layer.kind === "water" && layer.tag === "meltwater") &&
      iceFireReaction.condition_records.some((condition) => condition.state === "wet") &&
      iceFireReaction.save.immersive_tile_layers?.[demoMap.id]?.["0:5"]?.liquid?.kind === "water" &&
      !(iceFireReaction.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"] || []).some((layer) => layer.kind === "ice") &&
      !(iceFireReaction.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"] || []).some((field) => field.kind === "fire"),
    "stage 3 reaction table melts ice exposed to fire into water and steam while consuming source ice/fire",
  );
  const acidCorrosionReaction = advanceImmersiveReactionsForSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_acid_pool",
            kind: "acid",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.15,
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    acidCorrosionReaction.reactions.some((reaction) => reaction.rule_id === "acid_corroded_material") &&
      acidCorrosionReaction.environment_fields.some((field) => field.kind === "acid_fumes" && field.tag === "acid_corrosion") &&
      acidCorrosionReaction.surface_layers.some((layer) => layer.kind === "corrosion") &&
      acidCorrosionReaction.condition_records.some((condition) => condition.state === "damaged"),
    "stage 3 reaction table lets acid corrode material into fumes, residue, and damage",
  );
  ok(
    IMMERSIVE_REACTION_RULES.some((rule) => rule.id === "fire_spreads_to_flammable_neighbor") &&
      IMMERSIVE_REACTION_RULES.some((rule) => rule.id === "poison_gas_diffuses_to_neighbor"),
    "stage 3 exposes an inspectable deterministic reaction rule table",
  );
  const reactionPropagationPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) =>
              cell.x === 1 && cell.z === 5
                ? { ...cell, surface_tag: "oil" as const }
                : cell.x === 0 && cell.z === 6
                  ? { ...cell, surface_tag: "water" as const }
                  : cell,
            ),
          }
        : map,
    ),
  } as typeof gamePackage;
  const fireSpreadReaction = advanceImmersiveReactionsForSave(reactionPropagationPackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "reaction_spread_fire_seed",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "spread_seed",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    fireSpreadReaction.reactions.some(
      (reaction) => reaction.rule_id === "fire_spreads_to_flammable_neighbor" && reaction.cell[0] === 1 && reaction.cell[1] === 5,
    ) &&
      fireSpreadReaction.environment_fields.some((field) => field.kind === "fire" && field.tag === "spread_fire") &&
      fireSpreadReaction.condition_records.some((condition) => condition.last_action === "fire_spreads_to_flammable_neighbor"),
    "stage 3 propagation spreads fire into adjacent flammable cells",
  );
  const electricChainReaction = advanceImmersiveReactionsForSave(reactionPropagationPackage, makeSave([0, 5], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "reaction_chain_water_source",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "0:5": [{
            id: "reaction_chain_shock_seed",
            kind: "electricity",
            intensity: 0.7,
            age_ticks: 0,
            source: "runtime",
            tag: "chain_seed",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    electricChainReaction.reactions.some((reaction) => reaction.rule_id === "electricity_chains_through_wet_cell") &&
      electricChainReaction.environment_fields.some((field) => field.kind === "electricity" && field.tag === "conductive_chain") &&
      electricChainReaction.status_applications.some((application) => application.actor_id === "player" && application.status_id === "stun") &&
      electricChainReaction.save.actor_statuses?.player?.some((status) => status.id === "stun"),
    "stage 3 propagation chains electricity through wet cells and applies actor statuses",
  );
  ok(
    poisonFireReaction.reactions.some((reaction) => reaction.rule_id === "poison_gas_diffuses_to_neighbor") &&
      poisonFireReaction.environment_fields.some((field) => field.kind === "poison_gas" && field.tag === "gas_diffusion"),
    "stage 3 gas propagation diffuses poison gas into neighboring open cells",
  );
  // Detecting/investigating the player (via sight, sound, or light) is a
  // HOSTILE-only behaviour, so the perception pipeline is exercised with a
  // hostile variant of the perceiver entity.
  const makeHostilePerceiver = (pkg: typeof gamePackage) =>
    ({
      ...pkg,
      entities: pkg.entities.map((entity) =>
        entity.id === "ent_guide" ? { ...entity, is_npc: false } : entity,
      ),
    }) as typeof gamePackage;
  const perceptionAdvance = advanceImmersivePerceptionForSave(makeHostilePerceiver(gamePackage), makeSave([4, 6], {
    entity_states: { [guideTaskKey]: { cell: [0, 6] } },
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "perception_sound_seed",
            kind: "sound",
            intensity: 1,
            age_ticks: 0,
            source: "runtime",
            tag: "test_noise",
            origin_cell: [0, 5],
            radius: 5,
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    perceptionAdvance.snapshot.totals.alerted_actors > 0 &&
      perceptionAdvance.save.entity_states?.[guideTaskKey]?.alertness === "searching" &&
      perceptionAdvance.npc_tasks.some((task) => task.actor_id === guideTaskKey && task.task_type === "investigate") &&
      perceptionAdvance.world_facts.some((fact) => fact.action_type === "immersive_perception_alert"),
    "stage 4 perception starts by turning sound stimuli into NPC alertness, tasks, and facts",
  );
  const visiblePlayerSave = makeSave([0, 5], {
    entity_states: { [guideTaskKey]: { cell: [0, 7], facing: [0, -1] } },
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "perception_player_light",
            kind: "light",
            intensity: 0.9,
            age_ticks: 0,
            source: "runtime",
            tag: "test_player_light",
            origin_cell: [0, 5],
            radius: 4,
            created_at_tick: 540,
          }],
        },
      },
    },
  });
  const visiblePlayerSnapshot = createImmersivePerceptionSnapshotFromV1(makeHostilePerceiver(gamePackage), visiblePlayerSave, demoMap.id);
  ok(
    visiblePlayerSnapshot.alerts.some(
      (alert) => alert.actor_id === guideTaskKey && alert.stimulus.kind === "visible_player",
    ),
    "stage 4 perception uses facing and line of sight to see a lit player",
  );
  // Regression guard for the reported bug: a FRIENDLY NPC seeing the same lit
  // player must NOT enter any alert/search state.
  const friendlyVisibleSnapshot = createImmersivePerceptionSnapshotFromV1(gamePackage, visiblePlayerSave, demoMap.id);
  ok(
    !friendlyVisibleSnapshot.alerts.some(
      (alert) => alert.actor_id === guideTaskKey && alert.stimulus.kind === "visible_player",
    ),
    "stage 4 perception: friendly NPCs do not hunt/search for the visible player",
  );
  const friendlyNoiseAdvance = advanceImmersivePerceptionForSave(gamePackage, makeSave([4, 6], {
    entity_states: { [guideTaskKey]: { cell: [0, 6] } },
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "friendly_noise_seed",
            kind: "sound",
            intensity: 1,
            age_ticks: 0,
            source: "runtime",
            tag: "test_disturbance",
            origin_cell: [0, 5],
            radius: 5,
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    friendlyNoiseAdvance.snapshot.alerts.some(
      (alert) => alert.actor_id === guideTaskKey && alert.stimulus.kind === "sound",
    ) &&
      friendlyNoiseAdvance.npc_tasks.some(
        (task) => task.actor_id === guideTaskKey && task.task_type === "investigate",
      ),
    "stage 4 perception routes environmental disturbances to friendly NPCs without targeting the player",
  );
  const friendlyFootstepAdvance = advanceImmersivePerceptionForSave(gamePackage, makeSave([0, 5], {
    entity_states: { [guideTaskKey]: { cell: [0, 6] } },
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "player_footstep_seed",
            kind: "sound",
            intensity: 1,
            age_ticks: 0,
            source: "runtime",
            tag: "footstep",
            actor_id: "player",
            action: "emit_sound",
            origin_cell: [0, 5],
            radius: 4,
            frequency_tag: "footstep",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), demoMap.id);
  ok(
    friendlyFootstepAdvance.snapshot.stimuli.some(
      (stimulus) =>
        stimulus.kind === "sound" &&
        stimulus.tag === "footstep" &&
        stimulus.source_actor_id === "player",
    ) &&
      !friendlyFootstepAdvance.snapshot.alerts.some(
        (alert) => alert.actor_id === guideTaskKey && alert.stimulus.kind === "sound",
      ) &&
      !friendlyFootstepAdvance.npc_tasks.some((task) => task.actor_id === guideTaskKey),
    "stage 4 perception preserves sound ownership and friendly NPCs ignore ordinary player footsteps",
  );
  const facingAwaySnapshot = createImmersivePerceptionSnapshotFromV1(makeHostilePerceiver(gamePackage), {
    ...visiblePlayerSave,
    entity_states: { [guideTaskKey]: { cell: [0, 7], facing: [0, 1] } },
  }, demoMap.id);
  ok(
    !facingAwaySnapshot.alerts.some(
      (alert) => alert.actor_id === guideTaskKey && alert.stimulus.kind === "visible_player",
    ),
    "stage 4 perception viewcones ignore visible-player stimuli behind the actor",
  );
  const losBlockedPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) => cell.x === 0 && cell.z === 6 ? { ...cell, blocks_los: true } : cell),
          }
        : map,
    ),
  } as typeof gamePackage;
  const blockedLosSnapshot = createImmersivePerceptionSnapshotFromV1(makeHostilePerceiver(losBlockedPackage), visiblePlayerSave, demoMap.id);
  ok(
    !blockedLosSnapshot.alerts.some(
      (alert) => alert.actor_id === guideTaskKey && alert.stimulus.kind === "visible_player",
    ),
    "stage 4 perception line of sight blocks visible-player stimuli through occluders",
  );
  const botPlacementIndexForSight = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_training_bot");
  const botSightKey = entityStateKey(demoMap.id, "ent_training_bot", botPlacementIndexForSight);
  const botFrontalSight = createImmersivePerceptionSnapshotFromV1(gamePackage, makeSave([5, -5]), demoMap.id);
  ok(
    botFrontalSight.alerts.some(
      (alert) =>
        alert.actor_id === botSightKey &&
        alert.stimulus.kind === "visible_player" &&
        alert.alertness === "combat",
    ),
    "stage 4 perception sees a player standing in front of an authored hostile facing",
  );
  const movedBotSight = createImmersivePerceptionSnapshotFromV1(gamePackage, makeSave([6, -5], {
    entity_states: { [botSightKey]: { cell: [4, -5], facing: [1, 0] } },
  }), demoMap.id);
  ok(
    movedBotSight.alerts.some(
      (alert) =>
        alert.actor_id === botSightKey &&
        alert.cell[0] === 4 &&
        alert.cell[1] === -5 &&
        alert.target_cell[0] === 6 &&
        alert.target_cell[1] === -5 &&
        alert.stimulus.kind === "visible_player",
    ),
    "stage 4 perception follows save-backed moved hostile cells and facing",
  );
  const decayedPerception = advanceImmersivePerceptionForSave(gamePackage, makeSave([4, 6], {
    entity_states: {
      [guideTaskKey]: {
        cell: [0, 6],
        alertness: "suspicious",
        alert_score: 0.1,
        investigation_target_cell: [0, 5],
        last_stimulus: { kind: "sound", cell: [0, 5], tick: 540 },
      },
    },
  }), demoMap.id, { segments: 2 });
  ok(
    decayedPerception.scheduler_events.some((event) => event.type === "EndSegment") &&
      decayedPerception.decayed_alerts.some((alert) => alert.actor_id === guideTaskKey && alert.alertness === "oblivious") &&
      decayedPerception.save.entity_states?.[guideTaskKey]?.alertness === "oblivious" &&
      decayedPerception.world_facts.some((fact) => fact.action_type === "immersive_perception_gave_up"),
    "stage 4 perception advances on scheduler segments and decays alerts until actors give up",
  );
  const douseVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "verb_douse_fire_seed",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_fire",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), { verb: "douse", cell: [0, 5], mapId: demoMap.id });
  ok(
    douseVerb.ok &&
      douseVerb.world_facts.some((fact) => fact.action_type === "immersive_global_verb_applied") &&
      douseVerb.reactions.some((reaction) => reaction.rule_id === "water_extinguishes_fire_to_steam") &&
      douseVerb.environment_fields.some((field) => field.kind === "steam"),
    "stage 5 global douse verb modifies tile properties and lets reactions resolve steam",
  );
  const freezeVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "verb_freeze_water_pool",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
      },
    },
  }), { verb: "freeze", cell: [0, 5], mapId: demoMap.id });
  ok(
    freezeVerb.ok &&
      freezeVerb.reactions.some((reaction) => reaction.rule_id === "cold_freezes_water") &&
      freezeVerb.surface_layers.some((layer) => layer.kind === "ice"),
    "stage 5 global freeze verb modifies properties and lets reactions create ice",
  );
  const electrifyVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 5], {
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "0:5": [{
            id: "verb_electrify_water_pool",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
      },
    },
  }), { verb: "electrify", cell: [0, 5], mapId: demoMap.id });
  ok(
    electrifyVerb.ok &&
      electrifyVerb.reactions.some((reaction) => reaction.rule_id === "electricity_conducts_water") &&
      electrifyVerb.save.actor_statuses?.player?.some((status) => status.id === "stun"),
    "stage 5 global electrify verb modifies properties and lets reactions apply statuses",
  );
  const globalCrate = demoMap.custom_object_placements.find((placement) => placement.object_id === "obj_crate")!;
  const globalCrateCell = globalCrate.cell as [number, number];
  const globalCrateKey = `${globalCrate.object_id}|${globalCrateCell[0]}|${globalCrateCell[1]}|${globalCrate.facing?.[0] ?? 0}|${globalCrate.facing?.[1] ?? 1}`;
  const pushVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "push",
    cell: globalCrateCell,
    targetCell: [globalCrateCell[0] + 1, globalCrateCell[1]],
    mapId: demoMap.id,
  });
  ok(
    pushVerb.ok &&
      pushVerb.save.map_deltas?.[demoMap.id]?.moved_objects?.[globalCrateKey]?.cell?.[0] === globalCrateCell[0] + 1 &&
      pushVerb.condition_records.some((condition) => condition.target_id === globalCrateKey && condition.last_action === "verb_push"),
    "stage 5 global push verb moves an object through save-backed placement deltas",
  );
  const pullVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "pull",
    cell: globalCrateCell,
    targetCell: [globalCrateCell[0] - 1, globalCrateCell[1]],
    mapId: demoMap.id,
  });
  const throwVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "throw",
    cell: globalCrateCell,
    targetCell: [globalCrateCell[0] + 2, globalCrateCell[1]],
    mapId: demoMap.id,
  });
  ok(
    pullVerb.ok &&
      throwVerb.ok &&
      throwVerb.condition_records.some((condition) => condition.target_id === globalCrateKey && condition.state === "damaged") &&
      throwVerb.environment_fields.some((field) => field.kind === "sound" && field.tag === "global_verb_throw_sound"),
    "stage 5 global pull and throw verbs share object movement and impact properties",
  );
  const dropVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6], {
    inventory: [{ id: "itm_training_token", count: 2 }],
  }), { verb: "drop", cell: [1, 6], mapId: demoMap.id, itemId: "itm_training_token", count: 1 });
  ok(
    dropVerb.ok &&
      dropVerb.save.inventory.some((item) => item.id === "itm_training_token" && item.count === 1) &&
      dropVerb.save.map_deltas?.[demoMap.id]?.dropped_items?.some((drop) => drop.item_id === "itm_training_token" && drop.cell[0] === 1),
    "stage 5 global drop verb moves inventory into world item placement state",
  );
  const stackVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "stack",
    cell: globalCrateCell,
    targetCell: [globalCrateCell[0] + 1, globalCrateCell[1]],
    mapId: demoMap.id,
  });
  const climbVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "climb",
    cell: [0, 6],
    mapId: demoMap.id,
  });
  ok(
    stackVerb.ok &&
      stackVerb.surface_layers.some((layer) => layer.kind === "climbable_support") &&
      climbVerb.ok &&
      climbVerb.condition_records.some((condition) => condition.condition_tags?.includes("traversal_support")),
    "stage 5 global stack and climb verbs create traversal-support properties",
  );
  const breakVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "break",
    cell: globalCrateCell,
    mapId: demoMap.id,
  });
  const chestPlacement = demoMap.container_placements[0];
  const chestCell = chestPlacement.cell as [number, number];
  const hackVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "hack",
    cell: chestCell,
    mapId: demoMap.id,
  });
  ok(
    breakVerb.ok &&
      breakVerb.save.map_deltas?.[demoMap.id]?.removed_objects?.includes(globalCrateKey) &&
      hackVerb.ok &&
      hackVerb.save.map_deltas?.[demoMap.id]?.containers?.[chestPlacement.id]?.opened === true &&
      hackVerb.save.flags?.[`immersive_hacked_${chestPlacement.id}`] === true,
    "stage 5 global break and hack verbs commit object removal and access-state changes",
  );
  const foamVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6], {
    map_deltas: {
      [demoMap.id]: {
        environment_fields: {
          "0:5": [{
            id: "verb_foam_fire_seed",
            kind: "fire",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "test_fire",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), { verb: "foam", cell: [0, 5], mapId: demoMap.id });
  const mimicVerb = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "mimic",
    cell: globalCrateCell,
    mapId: demoMap.id,
  });
  ok(
    foamVerb.ok &&
      foamVerb.surface_layers.some((layer) => layer.kind === "foam") &&
      foamVerb.reactions.some((reaction) => reaction.rule_id === "water_extinguishes_fire_to_steam") &&
      mimicVerb.ok &&
      mimicVerb.save.flags?.immersive_mimic_form === "obj_crate",
    "stage 5 signature foam and mimic verbs alter shared properties and actor state",
  );
  ok(
    IMMERSIVE_GLOBAL_VERBS.length === new Set(IMMERSIVE_GLOBAL_VERBS).size &&
      IMMERSIVE_GLOBAL_VERBS.includes("foam") &&
      IMMERSIVE_GLOBAL_VERBS.includes("mimic") &&
      IMMERSIVE_GLOBAL_VERBS.includes("electrify"),
    "stage 5 exposes a canonical global verb registry for Studio inspection",
  );
  const playModeWheelStatus = playModeCommandWheelPhaseStatus();
  ok(
    playModeWheelStatus.phase1Complete &&
      playModeWheelStatus.phase2Complete &&
      playModeWheelStatus.phase3Complete &&
      PLAYMODE_PHASE_2_ELEMENTAL_VERBS.every((verb) =>
        PLAYMODE_COMMAND_WHEEL_VERBS.some((entry) => entry.kind === verb && entry.enabled),
      ) &&
      PLAYMODE_PHASE_3_MOVEMENT_VERBS.every((verb) =>
        PLAYMODE_COMMAND_WHEEL_VERBS.some((entry) => entry.kind === verb && entry.enabled),
      ) &&
      !PLAYMODE_COMMAND_WHEEL_VERBS.some((entry) => entry.kind === "hack"),
    "unsurfaced plan phase 3 exposes non-hack movement/traversal verbs in the Play Mode command wheel",
  );
  const phase2BurnFeedback = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "burn",
    cell: [0, 5],
    mapId: demoMap.id,
  });
  const phase2WetFeedback = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "wet",
    cell: [0, 5],
    mapId: demoMap.id,
  });
  const phase2ShockFeedback = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6]), {
    verb: "electrify",
    cell: [0, 5],
    mapId: demoMap.id,
  });
  ok(
    phase2BurnFeedback.ok &&
      phase2BurnFeedback.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"]?.some((field) => field.kind === "fire") &&
      phase2WetFeedback.ok &&
      phase2WetFeedback.save.map_deltas?.[demoMap.id]?.surface_layers?.["0:5"]?.some((layer) => layer.kind === "water") &&
      phase2ShockFeedback.ok &&
      phase2ShockFeedback.save.map_deltas?.[demoMap.id]?.environment_fields?.["0:5"]?.some((field) => field.kind === "electricity"),
    "unsurfaced plan phase 2 writes renderer-visible elemental surface and field deltas",
  );
  const playerBurnPhysical = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 5]), {
    verb: "burn",
    cell: [0, 5],
    mapId: demoMap.id,
  });
  const playerDousedPhysical = applyImmersiveGlobalVerbToSave(gamePackage, playerBurnPhysical.save, {
    verb: "douse",
    cell: [0, 5],
    mapId: demoMap.id,
  });
  const physicalBotIndex = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_training_bot");
  const physicalBotKey = entityStateKey(demoMap.id, "ent_training_bot", physicalBotIndex);
  const entityWetPhysical = applyImmersiveGlobalVerbToSave(gamePackage, makeSave([0, 6], {
    entity_states: { [physicalBotKey]: { cell: [0, 5] } },
  }), {
    verb: "wet",
    cell: [0, 5],
    mapId: demoMap.id,
  });
  ok(
    playerBurnPhysical.ok &&
      playerBurnPhysical.save.actor_physical_states?.player?.labels.includes("On Fire") &&
      playerBurnPhysical.save.actor_physical_states?.player?.heat === 1 &&
      playerDousedPhysical.ok &&
      !playerDousedPhysical.save.actor_physical_states?.player?.labels.includes("On Fire") &&
      (playerDousedPhysical.save.actor_physical_states?.player?.wetness || 0) >= 0.55 &&
      entityWetPhysical.ok &&
      entityWetPhysical.save.actor_physical_states?.[physicalBotKey]?.labels.includes("Soaked"),
    "unsurfaced plan phase 2 exposes multi-axis physical state feedback for player and entities",
  );
  const botStage6Index = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_training_bot");
  const botStage6Placement = demoMap.entity_placements[botStage6Index];
  const botStage6Key = entityStateKey(demoMap.id, "ent_training_bot", botStage6Index);
  const fineFootprintPackage = {
    ...gamePackage,
    __fine_expanded: true,
  } as typeof gamePackage;
  const offsetFootprintMelee = applyImmersiveCombatAttackToSave(
    fineFootprintPackage,
    makeSave([2, 0], {
      in_combat: true,
      entity_states: { [botStage6Key]: { cell: [5, 2], hp: 12 } },
    }),
    {
      actorId: "player",
      targetActorId: botStage6Key,
      baseDamage: 4,
      range: 1,
      energyCost: 0,
      mapId: demoMap.id,
    },
  );
  ok(
    offsetFootprintMelee.ok &&
      (offsetFootprintMelee.save.entity_states?.[botStage6Key]?.hp ?? 12) < 12,
    "stage 6 melee resolves against an offset edge of a 3x3 collision footprint",
  );
  const fineStepEnemyMove = dispatchV1EnemyTurn({
    gamePackage: fineFootprintPackage,
    save: makeSave([0, 0], {
      in_combat: true,
      combat_queue: ["player"],
      active_turn_id: "player",
      entity_states: { [botStage6Key]: { cell: [6, 0], hp: 12 } },
    }),
    actorId: botStage6Key,
    advanceTurn: false,
    movementSteps: 1,
  });
  const fineStepEnemyCell = fineStepEnemyMove.save.entity_states?.[botStage6Key]?.cell;
  ok(
    fineStepEnemyMove.ok &&
      Boolean(fineStepEnemyCell) &&
      Math.abs((fineStepEnemyCell?.[0] || 0) - 6) +
        Math.abs((fineStepEnemyCell?.[1] || 0) - 0) === 1,
    "combat enemy micro-pulses move exactly one fine cell",
  );
  const movementOnlyAdjacentEnemy = dispatchV1EnemyTurn({
    gamePackage: fineFootprintPackage,
    save: makeSave([0, 0], {
      in_combat: true,
      combat_queue: ["player"],
      active_turn_id: "player",
      entity_states: { [botStage6Key]: { cell: [3, 0], hp: 12 } },
    }),
    actorId: botStage6Key,
    advanceTurn: false,
    movementSteps: 1,
    allowAttack: false,
  });
  ok(
    movementOnlyAdjacentEnemy.ok && movementOnlyAdjacentEnemy.save.playerStats.hp === 24,
    "movement-only enemy micro-pulses do not multiply full-action attacks",
  );
  const secondPulseIndex = demoMap.entity_placements.length;
  const secondPulseKey = entityStateKey(demoMap.id, "ent_training_bot", secondPulseIndex);
  const crowdedPulsePackage = {
    ...fineFootprintPackage,
    maps: fineFootprintPackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            entity_placements: [
              ...map.entity_placements,
              { entity_id: "ent_training_bot", cell: [-6, 0] as [number, number] },
            ],
          }
        : map,
    ),
  } as typeof gamePackage;
  const crowdedPulse = dispatchV1EnemyPulse({
    gamePackage: crowdedPulsePackage,
    save: makeSave([0, 0], {
      in_combat: true,
      combat_queue: ["player"],
      active_turn_id: "player",
      entity_states: {
        [botStage6Key]: { cell: [6, 0], hp: 12 },
        [secondPulseKey]: { cell: [-6, 0], hp: 12 },
      },
    }),
    actorIds: [botStage6Key, secondPulseKey],
    movementSteps: 1,
    allowAttack: false,
  });
  const crowdedFirstCell = crowdedPulse.save.entity_states?.[botStage6Key]?.cell;
  const crowdedSecondCell = crowdedPulse.save.entity_states?.[secondPulseKey]?.cell;
  ok(
    crowdedPulse.ok &&
      crowdedPulse.events.filter((event) => event.type === "enemy_turn_resolved").length === 2 &&
      Math.abs((crowdedFirstCell?.[0] || 0) - 6) + Math.abs(crowdedFirstCell?.[1] || 0) === 1 &&
      Math.abs((crowdedSecondCell?.[0] || 0) + 6) + Math.abs(crowdedSecondCell?.[1] || 0) === 1,
    "crowded combat resolves multiple hostile fine steps in one shared world pulse",
  );
  const forcedMove = applyImmersiveCombatForcedMovementToSave(gamePackage, makeSave([0, 6], {
    entity_states: { [botStage6Key]: { cell: botStage6Placement.cell, hp: 12 } },
    map_deltas: {
      [demoMap.id]: {
        surface_layers: {
          "5:-5": [{
            id: "combat_forced_water",
            kind: "water",
            amount: 1,
            age_ticks: 0,
            source: "runtime",
            slipperiness: 0.2,
            created_at_tick: 540,
          }],
        },
        environment_fields: {
          "5:-5": [{
            id: "combat_forced_electricity",
            kind: "electricity",
            intensity: 0.8,
            age_ticks: 0,
            source: "runtime",
            tag: "forced_movement_hazard",
            created_at_tick: 540,
          }],
        },
      },
    },
  }), {
    actorId: "player",
    targetActorId: botStage6Key,
    direction: [0, -1],
    distance: 1,
    mapId: demoMap.id,
  });
  ok(
    forcedMove.ok &&
      forcedMove.to?.[0] === 5 &&
      forcedMove.to?.[1] === -5 &&
      forcedMove.scheduler_events.some((event) => event.type === "EndAction") &&
      forcedMove.reactions.some((reaction) => reaction.rule_id === "electricity_conducts_water") &&
      forcedMove.status_applications.some((application) => application.actor_id === botStage6Key && application.status_id === "stun") &&
      forcedMove.hazard_damage > 0 &&
      (forcedMove.save.entity_states?.[botStage6Key]?.hp ?? 12) < 12,
    "stage 6 begins with same-simulation forced movement into reactive combat hazards",
  );
  const coverPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            container_placements: [
              ...map.container_placements,
              {
                id: "stage6_cover_crate",
                object_id: "obj_chest",
                cell: [1, 6] as [number, number],
                facing: [0, -1] as [number, number],
                display_name: "Stage 6 Cover",
                locked: false,
                items: [],
              },
            ],
          }
        : map,
    ),
  } as typeof gamePackage;
  const coverTargetCell: [number, number] = [1, 7];
  const coverAttackerCell: [number, number] = [1, 5];
  const coverSave = makeSave(coverAttackerCell, {
    entity_states: { [botStage6Key]: { cell: coverTargetCell, hp: 12, facing: [0, -1] } },
  });
  const tacticalCover = createImmersiveCombatTacticalSnapshotFromV1(coverPackage, coverSave, demoMap.id);
  const coveredAttack = applyImmersiveCombatAttackToSave(coverPackage, coverSave, {
    actorId: "player",
    targetActorId: botStage6Key,
    baseDamage: 6,
    range: 6,
    mapId: demoMap.id,
  });
  ok(
    tacticalCover.cover_edges.some(
      (edge) => edge.source_id === "stage6_cover_crate" && edge.cell[0] === 1 && edge.cell[1] === 7 && edge.direction[1] === -1,
    ) &&
      coveredAttack.ok &&
      coveredAttack.cover?.source_id === "stage6_cover_crate" &&
      coveredAttack.cover_reduction === 2 &&
      coveredAttack.mitigated_damage === 4 &&
      (coveredAttack.save.entity_states?.[botStage6Key]?.hp ?? 12) === 8,
    "stage 6 tactical attack applies directional cover mitigation",
  );
  const heightPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) => cell.x === 4 && cell.z === 6 ? { ...cell, height: 2, visual_height: 2 } : cell),
          }
        : map,
    ),
  } as typeof gamePackage;
  const flankHeightAttack = applyImmersiveCombatAttackToSave(heightPackage, makeSave([4, 6], {
    entity_states: { [botStage6Key]: { cell: [4, 5], hp: 12, facing: [0, -1] } },
  }), {
    actorId: "player",
    targetActorId: botStage6Key,
    baseDamage: 6,
    range: 6,
    mapId: demoMap.id,
  });
  ok(
    flankHeightAttack.ok &&
      flankHeightAttack.flanked &&
      flankHeightAttack.height_delta === 2 &&
      flankHeightAttack.facing_bonus === 2 &&
      flankHeightAttack.height_bonus === 2 &&
      flankHeightAttack.mitigated_damage === 10,
    "stage 6 tactical attack applies flanking plus height/facing modifiers",
  );
  const companionStage6Index = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_companion");
  const companionStage6Key = entityStateKey(demoMap.id, "ent_companion", companionStage6Index);
  const overwatchMove = applyImmersiveCombatForcedMovementToSave(gamePackage, makeSave([0, 6], {
    party_members: ["ent_companion"],
    entity_states: {
      ent_companion: { cell: [4, -5], hp: 20, overwatch: true },
      [botStage6Key]: { cell: botStage6Placement.cell, hp: 12 },
    },
  }), {
    actorId: "player",
    targetActorId: botStage6Key,
    direction: [0, -1],
    distance: 1,
    mapId: demoMap.id,
  });
  ok(
    overwatchMove.ok &&
      overwatchMove.overwatch_triggers.some(
        (trigger) => trigger.actor_id === companionStage6Key && trigger.target_actor_id === botStage6Key,
      ) &&
      overwatchMove.world_facts.some((fact) => fact.action_type === "immersive_combat_overwatch_triggered") &&
      overwatchMove.save.entity_states?.[companionStage6Key]?.overwatch === false,
    "stage 6 overwatch zones react to forced movement through watched cells",
  );
  // Player-set overwatch: arm the reactive zone, then walk the hostile bot
  // through a watched cell as an ordinary (non-forced) move.
  const playerOverwatchArmed = applyImmersivePlayerOverwatchToSave(
    gamePackage,
    makeSave([5, -6], {
      entity_states: { [botStage6Key]: { cell: botStage6Placement.cell, hp: 12 } },
    }),
    { mapId: demoMap.id },
  );
  ok(
    playerOverwatchArmed.ok &&
      playerOverwatchArmed.save.flags?.immersive_overwatch_player === true &&
      playerOverwatchArmed.zone_cells.length > 0 &&
      (playerOverwatchArmed.save.world_facts || []).some(
        (fact) => fact.action_type === "immersive_combat_overwatch_set",
      ) &&
      !applyImmersivePlayerOverwatchToSave(gamePackage, playerOverwatchArmed.save, { mapId: demoMap.id }).ok,
    "stage 6 player-set overwatch arms a save-backed reactive zone once",
  );
  const overwatchStepCell = playerOverwatchArmed.zone_cells[0];
  const botSteppedSave = {
    ...playerOverwatchArmed.save,
    entity_states: {
      ...(playerOverwatchArmed.save.entity_states || {}),
      [botStage6Key]: {
        ...(playerOverwatchArmed.save.entity_states?.[botStage6Key] || {}),
        cell: overwatchStepCell,
        hp: 12,
      },
    },
  };
  const playerOverwatchTriggered = applyImmersiveOverwatchToMovementSave(gamePackage, botSteppedSave, {
    mapId: demoMap.id,
    actorId: botStage6Key,
    path: [overwatchStepCell],
  });
  ok(
    playerOverwatchTriggered.triggers.some(
      (trigger) => trigger.actor_id === "player" && trigger.target_actor_id === botStage6Key,
    ) &&
      (playerOverwatchTriggered.save.entity_states?.[botStage6Key]?.hp ?? 12) < 12 &&
      playerOverwatchTriggered.save.flags?.immersive_overwatch_player === false,
    "stage 6 player overwatch reacts to ordinary enemy movement and disarms",
  );
  const intentSnapshot = createImmersiveCombatTacticalSnapshotFromV1(gamePackage, makeSave([5, -6], {
    entity_states: { [botStage6Key]: { cell: botStage6Placement.cell, hp: 12 } },
  }), demoMap.id);
  ok(
    intentSnapshot.intents.some(
      (intent) =>
        intent.actor_id === botStage6Key &&
        intent.action_type === "advance" &&
        intent.target_cells.some((cell) => cell[0] === 5 && cell[1] === -5),
    ),
    "stage 6 tactical snapshot telegraphs hostile intent with target cells",
  );
  const stage7Package = {
    ...gamePackage,
    items: [
      ...gamePackage.items,
      {
        id: "itm_stage7_anvil",
        display_name: "Practice Anvil",
        description: "A deliberately heavy spatial-inventory test item.",
        icon: "A",
        category: "consumable" as const,
        simulation: {
          material_id: "sim_mat_metal",
          condition: "intact" as const,
          integrity: 1,
          condition_tags: [],
          mass_kg: 28,
          bulk: 6,
          awkwardness: 0.8,
          push_difficulty: 8,
          carry_size: "oversized" as const,
          requires_cooperation: false,
        },
        spatial: {
          shape: [[0, 0], [1, 0], [0, 1]] as [number, number][],
          weight_kg: 28,
          bulk: 3,
        },
      },
    ],
    maps: gamePackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            cells: map.cells.map((cell) => cell.x === 0 && cell.z === 6 ? { ...cell, region_id: "guild_gate" } : cell),
            regions: [
              ...(map.regions || []),
              {
                id: "guild_gate",
                display_name: "Guild Gate",
                faction_id: "f_guild",
                reputation_threshold: -3,
                irreversible_denial_flag: "guild_gate_barred",
                survival_delta: { hunger: 1, thirst: 1, fatigue: 1 },
                passive_checks: [
                  {
                    id: "guild_badge_gate",
                    stat: "flag" as const,
                    flag_id: "guild_badge",
                    difficulty: 7,
                    denial: true,
                  },
                ],
              },
            ],
          }
        : map,
    ),
  } as typeof gamePackage;
  const spatialInventory = createImmersiveSpatialInventorySnapshotFromSave(stage7Package, makeSave([0, 6], {
    inventory: [
      { id: "itm_stage7_anvil", count: 1 },
      { id: "itm_training_token", count: 3 },
    ],
  }), { gridSize: [2, 2], maxCarryWeightKg: 10 });
  ok(
    spatialInventory.total_weight_kg > 28 &&
      spatialInventory.items.some((item) => item.item_id === "itm_stage7_anvil" && item.shape.length === 3) &&
      spatialInventory.overflow_slots > 0 &&
      spatialInventory.ap_penalty > 0 &&
      spatialInventory.world_object_refs.some((ref) => ref.instance_id === "inventory:player:itm_stage7_anvil"),
    "stage 7 spatial inventory packs authored item shapes, projects inventory objects, and computes AP load penalty",
  );
  const deniedWorld = evaluateImmersiveWorldStateForSave(stage7Package, makeSave([0, 6], {
    faction_rep: { f_guild: -8 },
  }));
  ok(
    !deniedWorld.permitted &&
      deniedWorld.region_id === "guild_gate" &&
      deniedWorld.denials.some((gate) => gate.kind === "region_reputation" && gate.score === -8) &&
      deniedWorld.consequences.some((consequence) => consequence.flag_id === "guild_gate_barred"),
    "stage 7 world-state evaluation denies passage from authored region reputation without a trigger",
  );
  const passiveWorld = evaluateImmersiveWorldStateForSave(stage7Package, makeSave([0, 6], {
    faction_rep: { f_guild: 5 },
    flags: { guild_badge: true },
    level: 2,
  }), {
    passiveChecks: [
      { id: "guild_recognizes_player", stat: "faction_rep", factionId: "f_guild", difficulty: 10 },
      { id: "too_low_level_for_relic", stat: "level", difficulty: 12 },
    ],
  });
  ok(
    passiveWorld.permitted &&
      passiveWorld.gates.some((gate) => gate.id === "passive:guild_recognizes_player" && gate.passed) &&
      passiveWorld.gates.some((gate) => gate.id === "passive:too_low_level_for_relic" && !gate.passed && gate.severity === "warning"),
    "stage 7 passive-check-style world evaluation reads faction and level state",
  );
  const advancedWorld = advanceImmersiveWorldStateForSave(stage7Package, makeSave([0, 6], {
    faction_rep: { f_guild: -8 },
    flags: { survival_hunger: 72, survival_thirst: 98 },
  }), {
    survivalDelta: { hunger: 5, thirst: 4, fatigue: 2 },
  });
  ok(
    advancedWorld.save.flags?.survival_hunger === 78 &&
      advancedWorld.save.flags?.survival_thirst === 103 &&
      advancedWorld.save.flags?.survival_fatigue === 3 &&
      advancedWorld.save.flags?.immersive_world_state_permitted === false &&
      advancedWorld.save.flags?.immersive_region_denied_guild_gate === true &&
      advancedWorld.save.flags?.guild_gate_barred === true &&
      advancedWorld.save.flags?.immersive_passive_denial_guild_badge_gate === true &&
      advancedWorld.save.flags?.immersive_survival_crisis_thirst === true &&
      advancedWorld.world_facts.some((fact) => fact.action_type === "immersive_world_state_evaluated"),
    "stage 7 world-state advancement persists authored survival attrition, irreversible denials, and durable facts",
  );

  const paidMove = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([0, 6]),
    dx: 0,
    dy: -1,
    energyCost: 1000,
  });
  ok(paidMove.save.playerStats.energy === 0, "v1 move can spend player energy");
  ok(
    paidMove.events.some((event) => event.type === "resource_spent" && (event.payload as any)?.energy === 1000),
    "v1 move emits resource_spent when costed",
  );

  const intoWall = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([-1, -3]),
    dx: -1,
    dy: 0,
  });
  ok(!intoWall.ok && intoWall.reason === "blocked", "v1 adapter rejects blocked cells");

  const intoCrate = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([2, 2]),
    dx: 1,
    dy: 0,
  });
  ok(!intoCrate.ok && intoCrate.reason === "blocked", "v1 adapter rejects blocking object placements");

  const nonBlockingPlacementPackage = {
    ...gamePackage,
    maps: gamePackage.maps.map((map) => map.id === demoMap.id ? {
      ...map,
      custom_object_placements: map.custom_object_placements.map((placement) =>
        placement.object_id === "obj_crate" && placement.cell[0] === 3 && placement.cell[1] === 2
          ? { ...placement, collision_mode: "none" as const }
          : placement,
      ),
    } : map),
  };
  const throughNonBlockingCrate = dispatchV1MoveEntity({
    gamePackage: nonBlockingPlacementPackage,
    save: makeSave([2, 2]),
    dx: 1,
    dy: 0,
  });
  ok(throughNonBlockingCrate.ok, "placement collision_mode none overrides inherited object collision");

  const intoContainer = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([3, 4]),
    dx: 1,
    dy: 0,
  });
  ok(!intoContainer.ok && intoContainer.reason === "blocked", "v1 adapter rejects container-occupied cells");

  const intoNpc = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([-2, 5]),
    dx: -1,
    dy: 0,
  });
  ok(!intoNpc.ok && intoNpc.reason === "occupied", "v1 adapter rejects occupied entity cells");

  const door = demoMap.custom_object_placements.find(
    (placement) => placement.object_id === "obj_p_door",
  )!;
  const intoClosedDoor = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([-1, -4]),
    dx: -1,
    dy: 0,
  });
  ok(!intoClosedDoor.ok && intoClosedDoor.reason === "blocked", "v1 adapter rejects closed doors");

  const throughOpenDoor = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([-1, -4], {
      map_deltas: {
        [demoMap.id]: { opened_doors: [getV1DoorKey(door)] },
      },
    }),
    dx: -1,
    dy: 0,
  });
  ok(throughOpenDoor.ok, "v1 adapter allows opened doors");

  const fineDoorPackage = expandGamePackageToFine(gamePackage);
  const fineDoorMap = fineDoorPackage.maps.find((map) => map.id === demoMap.id)!;
  const fineDoor = fineDoorMap.custom_object_placements.find(
    (placement) => placement.object_id === "obj_p_door",
  )!;
  const offsetDoorSave = makeSave(
    [fineDoor.cell[0] + FINE_PER_MACRO, fineDoor.cell[1] + 1],
    {
      map_deltas: {
        [demoMap.id]: { opened_doors: [getV1DoorKey(fineDoor)] },
      },
    },
  );
  const offsetDoorMove = dispatchV1MoveEntity({
    gamePackage: fineDoorPackage,
    save: offsetDoorSave,
    dx: -1,
    dy: 0,
  });
  ok(!offsetDoorMove.ok, "an off-center footprint still collides with an open doorway frame");

  const assistedDoorMove = dispatchV1MoveEntity({
    gamePackage: fineDoorPackage,
    save: offsetDoorSave,
    dx: -1,
    dy: 0,
    allowDoorwayAssist: true,
  });
  ok(
    assistedDoorMove.ok &&
      assistedDoorMove.doorwayAssisted &&
      assistedDoorMove.resolvedDelta[0] === 0 &&
      assistedDoorMove.resolvedDelta[1] === -1 &&
      assistedDoorMove.save.player.cell[0] === offsetDoorSave.player.cell[0] &&
      assistedDoorMove.save.player.cell[1] === fineDoor.cell[1] &&
      assistedDoorMove.save.player.facing[0] === -1 &&
      assistedDoorMove.save.player.facing[1] === 0,
    "open-door assist recenters an offset player by one fine cell while preserving intended facing",
  );
  const throughFineDoor = dispatchV1MoveEntity({
    gamePackage: fineDoorPackage,
    save: assistedDoorMove.save,
    dx: -1,
    dy: 0,
    allowDoorwayAssist: true,
  });
  ok(
    throughFineDoor.ok && !throughFineDoor.doorwayAssisted,
    "held movement continues normally through the doorway after alignment",
  );

  const doorlessFinePackage = {
    ...fineDoorPackage,
    maps: fineDoorPackage.maps.map((map) =>
      map.id === demoMap.id
        ? {
            ...map,
            custom_object_placements: map.custom_object_placements.filter(
              (placement) => placement.object_id !== "obj_p_door",
            ),
          }
        : map,
    ),
  } as typeof fineDoorPackage;
  const verticalApproaches = [-FINE_PER_MACRO, -2, -1, 1, 2, FINE_PER_MACRO].flatMap(
    (offset) =>
      ([-1, 1] as const).map((side) => {
        const start: [number, number] = [
          fineDoor.cell[0] + side * FINE_PER_MACRO,
          fineDoor.cell[1] + offset,
        ];
        const move = dispatchV1MoveEntity({
          gamePackage: doorlessFinePackage,
          save: makeSave(start),
          dx: -side,
          dy: 0,
          allowDoorwayAssist: true,
        });
        return (
          move.ok &&
          move.doorwayAssisted &&
          move.resolvedDelta[0] === 0 &&
          move.resolvedDelta[1] === -Math.sign(offset)
        );
      }),
  );
  ok(
    verticalApproaches.every(Boolean),
    "plain vertical wall gaps funnel consistently from both sides and every nearby fine-cell offset",
  );

  const horizontalMap = {
    ...demoMap,
    id: "map_horizontal_doorway_test",
    display_name: "Horizontal Doorway Test",
    cells: demoMap.cells.map((cell) => ({ ...cell, x: cell.z, z: cell.x })),
    spawns: [],
    custom_object_placements: [],
    entity_placements: [],
    item_placements: [],
    container_placements: [],
    triggers: [],
    exits: [],
  };
  const horizontalPackage = expandGamePackageToFine({
    ...gamePackage,
    metadata: {
      ...gamePackage.metadata,
      start_map_id: horizontalMap.id,
      start_spawn_id: "",
    },
    maps: [horizontalMap],
  });
  const horizontalDoor = fineCenterOfMacro([door.cell[1], door.cell[0]]);
  const horizontalApproaches = [-FINE_PER_MACRO, -2, -1, 1, 2, FINE_PER_MACRO].flatMap(
    (offset) =>
      ([-1, 1] as const).map((side) => {
        const start: [number, number] = [
          horizontalDoor[0] + offset,
          horizontalDoor[1] + side * FINE_PER_MACRO,
        ];
        const move = dispatchV1MoveEntity({
          gamePackage: horizontalPackage,
          save: makeSave(start, { current_map_id: horizontalMap.id }),
          dx: 0,
          dy: -side,
          allowDoorwayAssist: true,
        });
        return (
          move.ok &&
          move.doorwayAssisted &&
          move.resolvedDelta[0] === -Math.sign(offset) &&
          move.resolvedDelta[1] === 0
        );
      }),
  );
  ok(
    horizontalApproaches.every(Boolean),
    "plain horizontal wall gaps funnel consistently from both sides and every nearby fine-cell offset",
  );

  const diagonalDoorwayApproaches = ([
    {
      package: doorlessFinePackage,
      mapId: demoMap.id,
      doorway: [fineDoor.cell[0], fineDoor.cell[1]] as [number, number],
      forward: [1, 0] as [number, number],
    },
    {
      package: horizontalPackage,
      mapId: horizontalMap.id,
      doorway: [horizontalDoor[0], horizontalDoor[1]] as [number, number],
      forward: [0, 1] as [number, number],
    },
  ]).flatMap(({ package: testPackage, mapId, doorway, forward }) => {
    const perpendicular: [number, number] = [-forward[1], forward[0]];
    return [-FINE_PER_MACRO, -2, 0, 2, FINE_PER_MACRO].map((offset) => {
      const start: [number, number] = [
        doorway[0] - forward[0] * FINE_PER_MACRO + perpendicular[0] * offset,
        doorway[1] - forward[1] * FINE_PER_MACRO + perpendicular[1] * offset,
      ];
      const towardCenter = offset === 0 ? 1 : -Math.sign(offset);
      const requested: [number, number] = [
        forward[0] + perpendicular[0] * towardCenter,
        forward[1] + perpendicular[1] * towardCenter,
      ];
      const move = dispatchV1MoveEntity({
        gamePackage: testPackage,
        save: makeSave(start, { current_map_id: mapId }),
        dx: requested[0],
        dy: requested[1],
        allowDoorwayAssist: true,
      });
      const expected: [number, number] = offset === 0
        ? forward
        : [perpendicular[0] * -Math.sign(offset), perpendicular[1] * -Math.sign(offset)];
      return (
        move.ok &&
        move.doorwayAssisted &&
        move.resolvedDelta[0] === expected[0] &&
        move.resolvedDelta[1] === expected[1]
      );
    });
  });
  ok(
    diagonalDoorwayApproaches.every(Boolean),
    "isometric diagonal input resolves into deterministic centering and forward doorway steps",
  );

  const fineCrate = fineDoorMap.custom_object_placements.find(
    (placement) => placement.object_id === "obj_crate",
  )!;
  const isolatedObstacleMove = dispatchV1MoveEntity({
    gamePackage: fineDoorPackage,
    save: makeSave([fineCrate.cell[0] - FINE_PER_MACRO, fineCrate.cell[1]]),
    dx: 1,
    dy: 0,
    allowDoorwayAssist: true,
  });
  ok(
    !isolatedObstacleMove.ok && !isolatedObstacleMove.doorwayAssisted,
    "doorway funneling does not slide the player around an isolated blocking object",
  );

  const objectById = new Map(gamePackage.object_library.map((object) => [object.id, object]));
  const closedDoorFogBlockers = createFogLineOfSightBlockers([door], objectById);
  const openDoorFogBlockers = createFogLineOfSightBlockers(
    [door],
    objectById,
    { opened_doors: [getV1DoorKey(door)] },
  );
  ok(
    closedDoorFogBlockers.has(fogCellKey(door.cell[0], door.cell[1])) &&
      !hasFogLineOfSight([-1, -4], [-3, -4], (x, z) => closedDoorFogBlockers.has(fogCellKey(x, z))) &&
      hasFogLineOfSight([-1, -4], [-3, -4], (x, z) => openDoorFogBlockers.has(fogCellKey(x, z))),
    "fog of war treats closed doors as LOS walls until opened",
  );
  const terminalPlacement = {
    object_id: "obj_terminal",
    cell: [8, -4] as [number, number],
    facing: [0, 1] as [number, number],
  };
  const reedPlacement = {
    object_id: "obj_reed_clump",
    cell: [12, -4] as [number, number],
    facing: [0, 1] as [number, number],
  };
  const semanticObjectFogBlockers = createFogLineOfSightBlockers(
    [terminalPlacement, reedPlacement],
    objectById,
  );
  ok(
    !semanticObjectFogBlockers.has(
      fogCellKey(terminalPlacement.cell[0], terminalPlacement.cell[1]),
    ) &&
      semanticObjectFogBlockers.has(
        fogCellKey(reedPlacement.cell[0], reedPlacement.cell[1]),
      ),
    "fog LOS follows explicit sight semantics rather than movement collision",
  );
  const closedDoorVisibility = computeFogVisibleCells({
    map: demoMap,
    playerPos: [-1, -4],
    objectById,
    gridSpace: "macro",
    fineRatio: 3,
    radius: 5,
    resolution: "fine",
  });
  const openDoorVisibility = computeFogVisibleCells({
    map: demoMap,
    playerPos: [-1, -4],
    objectById,
    delta: { opened_doors: [getV1DoorKey(door)] },
    gridSpace: "macro",
    fineRatio: 3,
    radius: 5,
    resolution: "fine",
  });
  ok(
    !closedDoorVisibility.has(fogCellKey(-3, -4)) &&
      openDoorVisibility.has(fogCellKey(-3, -4)),
    "3D fog visibility culls actors behind closed doors and reveals them when opened",
  );
  const currentFogCells = new Set([fogCellKey(1, 1)]);
  const discoveredFogCells = new Set([fogCellKey(1, 1), fogCellKey(2, 2)]);
  ok(
    classifyFogRenderState(fogCellKey(1, 1), true, currentFogCells, discoveredFogCells) === "visible" &&
      classifyFogRenderState(fogCellKey(2, 2), true, currentFogCells, discoveredFogCells) === "explored" &&
      classifyFogRenderState(fogCellKey(3, 3), true, currentFogCells, discoveredFogCells) === "unseen" &&
      classifyFogRenderState(fogCellKey(3, 3), false, currentFogCells, discoveredFogCells) === "visible",
    "3D fog render classification distinguishes visible, explored, and unseen cells and reveals all static geometry when disabled",
  );
  const lightRenderMetrics = resolveAuthoritativeLightRenderMetrics(14, 1 / 3);
  ok(
    Math.abs(lightRenderMetrics.worldRadius - 14 / 3) < 0.000001 &&
      lightRenderMetrics.pointDistance === lightRenderMetrics.worldRadius &&
      lightRenderMetrics.poolRadius === lightRenderMetrics.worldRadius &&
      lightRenderMetrics.decay === 1,
    "authoritative 3D light cutoff and pool preserve the simulation's literal radius",
  );
  ok(
    Math.abs(resolveActorSpriteBrightness(0) - 0.3) < 0.000001 &&
      Math.abs(resolveActorSpriteBrightness(1) - 1) < 0.000001 &&
      Math.abs(resolveActorSpriteBrightness(-1) - 0.3) < 0.000001 &&
      Math.abs(resolveActorSpriteBrightness(2) - 1) < 0.000001 &&
      resolveActorSpriteBrightness(0.64) > resolveActorSpriteBrightness(0.16),
    "actor sprite lighting shades the whole billboard from its authoritative foot-cell illumination with a darkness floor",
  );

  const world = createV1GridWorld({ gamePackage, save: makeSave([0, 6]) });
  ok(world.map.id === demoMap.id, "v1 adapter loads the save's current map");

  // take_item command.
  const beforePickupSave = makeSave([1, 2]);
  const pickup = dispatchV1TakeItem({
    gamePackage,
    save: beforePickupSave,
    x: tokenDrop.cell[0],
    y: tokenDrop.cell[1],
    energyCost: 1000,
  });
  ok(pickup.ok, "take_item picks up an authored ground item");
  ok(
    (pickup.save.inventory || []).some((i) => i.id === tokenDrop.item_id),
    "take_item adds the item to the save inventory",
  );
  ok(
    (pickup.save.map_deltas?.[demoMap.id]?.taken_items || []).includes(tokenDrop.id),
    "take_item marks the placement taken",
  );
  ok(pickup.events.some((e) => e.type === "item_acquired"), "take_item emits item_acquired");
  ok(pickup.save.playerStats.energy === 0, "take_item can spend player energy");
  ok(
    pickup.kernelFacts.some((fact) => fact.action_type === "object_taken" && fact.target_id === tokenInstanceId),
    "take_item emits a kernel object_taken fact",
  );
  const pickupFact = pickup.kernelFacts.find((fact) => fact.action_type === "object_taken");
  ok(
    pickupFact?.previous_state?.from_holder_id === tokenGroundHolderId &&
      pickupFact?.new_state?.to_holder_id === playerInventoryHolderId,
    "take_item kernel fact records world-cell to inventory holders",
  );
  ok(
    pickup.save.world_facts?.some((fact) => fact.action_type === "object_taken"),
    "take_item persists kernel facts into the save",
  );
  ok(
    pickupFact?.exposures?.some(
      (exposure) =>
        exposure.actor_id === "ent_companion" &&
        (exposure.type === "visual" || exposure.type === "auditory"),
    ),
    "kernel exposure records nearby NPCs that saw or heard the pickup",
  );
  ok(
    pickup.kernelFacts.some(
      (fact) =>
        fact.action_type === "npc_noticed_world_fact" &&
        fact.actor_id === "ent_companion" &&
        fact.parent_fact_ids?.includes(pickupFact?.id || ""),
    ),
    "kernel derives simple NPC awareness facts from exposed obvious changes",
  );
  const pickupFactsWithoutAwareness = createKernelFactsFromEngineEvents({
    gamePackage,
    beforeSave: beforePickupSave,
    afterSave: pickup.save,
    events: pickup.events,
    options: { enableAwarenessFacts: false },
  });
  ok(
    pickupFactsWithoutAwareness.some((fact) => fact.action_type === "object_taken") &&
      !pickupFactsWithoutAwareness.some((fact) => fact.action_type === "npc_noticed_world_fact"),
    "kernel awareness facts can be disabled for expansion adapters",
  );
  const pickupFactsWithAdapter = createKernelFactsFromEngineEvents({
    gamePackage,
    beforeSave: beforePickupSave,
    afterSave: pickup.save,
    events: pickup.events,
    options: {
      adapters: [
        {
          id: "test_semantic_adapter",
          onFacts: ({ facts }) => [
            {
              id: "wfact:test_semantic_adapter",
              tick: facts[0]?.tick || 0,
              map_id: demoMap.id,
              plane_id: "ground",
              action_type: "adapter_probe",
              direct_consequences: { received_fact_count: facts.length },
              parent_fact_ids: facts.map((fact) => fact.id),
            },
          ],
        },
      ],
    },
  });
  ok(
    pickupFactsWithAdapter.some(
      (fact) =>
        fact.action_type === "adapter_probe" &&
        Number(fact.direct_consequences?.received_fact_count || 0) >= 2,
    ),
    "kernel runs optional expansion adapters with philosophy/simulation off by default",
  );
  const pickupKernel = createKernelSnapshotFromV1(gamePackage, pickup.save);
  ok(
    pickupKernel.instances.some(
      (instance) =>
        instance.id === tokenInstanceId &&
        instance.location.type === "actor_inventory" &&
        instance.holder_id === playerInventoryHolderId,
    ),
    "kernel snapshot keeps the taken authored item identity in actor inventory",
  );
  ok(
    pickupKernel.holders.some((holder) => holder.id === playerInventoryHolderId && holder.kind === "actor_inventory"),
    "kernel snapshot lists actor inventory holders after pickup",
  );
  ok(
    pickupKernel.transfers.some(
      (transfer) =>
        transfer.fact_id === pickupFact?.id &&
        transfer.item_template_id === tokenDrop.item_id &&
        transfer.from_holder_id === tokenGroundHolderId &&
        transfer.to_holder_id === playerInventoryHolderId,
    ),
    "kernel snapshot derives a pickup transfer record from persisted facts",
  );

  const dropItem = dispatchV1DropItem({
    gamePackage,
    save: makeSave([0, 6], { inventory: [{ id: "itm_training_token", count: 1 }] }),
    itemId: "itm_training_token",
    count: 1,
    cell: [1, 6],
    energyCost: 1000,
  });
  ok(dropItem.ok, "drop_item drops inventory into a valid world cell");
  const droppedEntry = dropItem.save.map_deltas?.[demoMap.id]?.dropped_items?.[0];
  ok(
    droppedEntry?.item_id === "itm_training_token" && droppedEntry.cell[0] === 1 && dropItem.save.playerStats.energy === 0,
    "drop_item records a dropped world item and can spend energy",
  );
  const dropFact = dropItem.kernelFacts.find((fact) => fact.action_type === "object_dropped");
  ok(
    dropFact?.previous_state?.from_holder_id === playerInventoryHolderId &&
      typeof dropFact.new_state?.to_holder_id === "string",
    "drop_item kernel fact records inventory to world-cell holders",
  );
  const dropKernel = createKernelSnapshotFromV1(gamePackage, dropItem.save);
  ok(
    dropKernel.transfers.some(
      (transfer) =>
        transfer.fact_id === dropFact?.id &&
        transfer.item_template_id === "itm_training_token" &&
        transfer.from_holder_id === playerInventoryHolderId,
    ),
    "kernel snapshot derives a drop transfer record from persisted facts",
  );

  const emptyPickup = dispatchV1TakeItem({ gamePackage, save: makeSave([7, 7]), x: 7, y: 7, energyCost: 1000 });
  ok(!emptyPickup.ok && emptyPickup.reason === "no item", "take_item rejects an empty cell");
  ok(emptyPickup.save.playerStats.energy === 1000, "failed take_item does not spend energy");

  // open_door command.
  const openDoor = dispatchV1OpenDoor({
    gamePackage,
    save: makeSave([-1, -4]),
    x: door.cell[0],
    y: door.cell[1],
    energyCost: 1000,
  });
  ok(openDoor.ok, "open_door opens a closed door");
  ok(
    (openDoor.save.map_deltas?.[demoMap.id]?.opened_doors || []).includes(getV1DoorKey(door)),
    "open_door records the door in opened_doors",
  );
  ok(
    openDoor.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[getV1DoorKey(door)]?.last_action === "open",
    "open_door records a Simulation S1 door condition",
  );
  ok(openDoor.events.some((e) => e.type === "door_opened"), "open_door emits door_opened");
  ok(openDoor.save.playerStats.energy === 0, "open_door can spend player energy");
  ok(
    openDoor.kernelFacts.some((fact) => fact.action_type === "door_opened"),
    "open_door emits a kernel door_opened fact",
  );
  const openDoorFact = openDoor.kernelFacts.find((fact) => fact.action_type === "door_opened");
  ok(
    openDoorFact?.direct_consequences?.transaction_kind === "open",
    "open_door kernel fact records an open transaction kind",
  );
  const openDoorKernel = createKernelSnapshotFromV1(gamePackage, openDoor.save);
  ok(
    openDoorKernel.transactions.some(
      (transaction) =>
        transaction.fact_id === openDoorFact?.id &&
        transaction.kind === "open" &&
        transaction.target_id === openDoorFact?.target_id &&
        transaction.previous_state?.opened === false &&
        transaction.new_state?.opened === true,
    ),
    "kernel snapshot derives a committed door-open transaction",
  );

  const alreadyOpen = dispatchV1OpenDoor({
    gamePackage,
    save: makeSave([-1, -4], { map_deltas: { [demoMap.id]: { opened_doors: [getV1DoorKey(door)] } } }),
    x: door.cell[0],
    y: door.cell[1],
    energyCost: 1000,
  });
  ok(!alreadyOpen.ok && alreadyOpen.reason === "no closed door", "open_door rejects an already-open door");
  ok(alreadyOpen.save.playerStats.energy === 1000, "failed open_door does not spend energy");
  const closeDoor = dispatchV1CloseDoor({
    gamePackage,
    save: makeSave([-1, -4], { map_deltas: { [demoMap.id]: { opened_doors: [getV1DoorKey(door)] } } }),
    x: door.cell[0],
    y: door.cell[1],
    energyCost: 1000,
  });
  ok(closeDoor.ok, "close_door closes an open door");
  ok(
    !(closeDoor.save.map_deltas?.[demoMap.id]?.opened_doors || []).includes(getV1DoorKey(door)),
    "close_door removes the opened door delta",
  );
  ok(
    closeDoor.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[getV1DoorKey(door)]?.last_action === "close",
    "close_door updates the Simulation S1 door condition",
  );
  const closeDoorFact = closeDoor.kernelFacts.find((fact) => fact.action_type === "door_closed");
  const closeDoorKernel = createKernelSnapshotFromV1(gamePackage, closeDoor.save);
  ok(
    closeDoorKernel.transactions.some(
      (transaction) =>
        transaction.fact_id === closeDoorFact?.id &&
        transaction.kind === "close" &&
        transaction.previous_state?.opened === true &&
        transaction.new_state?.opened === false,
    ),
    "kernel snapshot derives a committed door-close transaction",
  );

  // push_object command (K3 grid manipulation).
  const crate = demoMap.custom_object_placements.find((p) => p.object_id === "obj_crate")!;
  const pushCrate = dispatchV1PushObject({
    gamePackage,
    save: makeSave([crate.cell[0] - 1, crate.cell[1]]),
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 1,
    dy: 0,
  });
  ok(pushCrate.ok, "push_object pushes a prop one cell");
  ok(pushCrate.save.playerStats.energy === 700, "push_object spends Simulation S2 push effort by default");
  const movedKey = Object.keys(pushCrate.save.map_deltas?.[demoMap.id]?.moved_objects || {})[0];
  ok(
    !!movedKey && pushCrate.save.map_deltas![demoMap.id]!.moved_objects![movedKey].cell[0] === crate.cell[0] + 1,
    "push_object records the object at the next cell",
  );
  ok(
    pushCrate.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[movedKey]?.last_action === "push",
    "push_object records a Simulation S2 pushed condition",
  );
  ok(pushCrate.events.some((e) => e.type === "object_pushed"), "push_object emits object_pushed");
  const pushPayload = pushCrate.events.find((e) => e.type === "object_pushed")?.payload as any;
  ok(
    pushPayload?.mass_kg === 35 && pushPayload?.push_energy_cost === 300,
    "push_object event includes Simulation S2 mass and effort",
  );
  ok(
    (pushCrate.save.world_facts || []).some((f) => f.action_type === "object_pushed"),
    "push_object records an object_pushed world fact",
  );
  const pushFact = pushCrate.kernelFacts.find((fact) => fact.action_type === "object_pushed");
  ok(
    pushFact?.direct_consequences?.push_difficulty === 3 &&
      pushFact.direct_consequences?.push_energy_cost === 300,
    "kernel fact preserves Simulation S2 push affordance details",
  );
  const pushedObjectInstanceId = kernelInstanceId(demoMap.id, "object", movedKey);
  const pushKernel = createKernelSnapshotFromV1(gamePackage, pushCrate.save);
  ok(
    pushKernel.instances.some(
      (instance) =>
        instance.id === pushedObjectInstanceId &&
        instance.location.type === "world_cell" &&
        instance.location.cell[0] === crate.cell[0] + 1,
    ),
    "kernel snapshot preserves pushed object identity at its moved cell",
  );
  const breakCrate = dispatchV1BreakObject({
    gamePackage,
    save: pushCrate.save,
    x: crate.cell[0] + 1,
    y: crate.cell[1],
    energyCost: 1000,
  });
  ok(breakCrate.ok, "break_object removes a blocking moved object");
  ok(
    (breakCrate.save.map_deltas?.[demoMap.id]?.removed_objects || []).includes(movedKey),
    "break_object records the removed placement key",
  );
  ok(
    breakCrate.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[movedKey]?.state === "broken",
    "break_object records a broken Simulation S1 object condition",
  );
  const breakFact = breakCrate.kernelFacts.find((fact) => fact.action_type === "object_broken");
  const breakKernel = createKernelSnapshotFromV1(gamePackage, breakCrate.save);
  ok(
    breakKernel.transactions.some(
      (transaction) =>
        transaction.fact_id === breakFact?.id &&
        transaction.kind === "break" &&
        transaction.target_id === pushedObjectInstanceId,
    ),
    "kernel snapshot derives a committed object-break transaction",
  );
  ok(
    !breakKernel.instances.some((instance) => instance.id === pushedObjectInstanceId),
    "kernel snapshot removes broken object instances from occupancy",
  );
  const moveThroughBrokenCrate = dispatchV1MoveEntity({
    gamePackage,
    save: {
      ...breakCrate.save,
      player: {
        ...breakCrate.save.player,
        cell: [crate.cell[0], crate.cell[1]],
        facing: [1, 0],
      },
      playerStats: { ...breakCrate.save.playerStats, energy: 1000 },
    },
    dx: 1,
    dy: 0,
  });
  ok(moveThroughBrokenCrate.ok, "breaking a barricade updates movement collision");

  // Pushing where nothing pushable is faced is rejected.
  const noPush = dispatchV1PushObject({
    gamePackage,
    save: makeSave([0, 0]),
    x: 0,
    y: 0,
    dx: 1,
    dy: 0,
  });
  ok(!noPush.ok && noPush.reason === "not pushable", "push_object rejects an empty/non-pushable cell");
  const heavyPushPackage = {
    ...gamePackage,
    object_library: gamePackage.object_library.map((object) =>
      object.id === "obj_crate"
        ? {
            ...object,
            simulation: {
              ...(object.simulation || {}),
              mass_kg: 260,
              bulk: 5,
              awkwardness: 0.9,
              push_difficulty: 12,
              carry_size: "immovable" as const,
              requires_cooperation: true,
            },
          }
        : object,
    ),
  } as typeof gamePackage;
  const heavyPush = dispatchV1PushObject({
    gamePackage: heavyPushPackage,
    save: makeSave([crate.cell[0] - 1, crate.cell[1]]),
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 1,
    dy: 0,
  });
  ok(
    !heavyPush.ok && heavyPush.reason === "requires cooperation" && heavyPush.save.playerStats.energy === 1000,
    "push_object rejects objects that require cooperative movement",
  );
  const cooperativeHeavyPush = dispatchV1PushObject({
    gamePackage: heavyPushPackage,
    save: makeSave([crate.cell[0] - 1, crate.cell[1]]),
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 1,
    dy: 0,
    helperActorIds: ["helper_companion"],
  });
  ok(
    cooperativeHeavyPush.ok &&
      Object.values(cooperativeHeavyPush.save.map_deltas?.[demoMap.id]?.moved_objects || {}).some(
        (moved) => moved.cell[0] === crate.cell[0] + 1,
      ),
    "push_object allows cooperation-required objects when helpers participate",
  );
  ok(
    cooperativeHeavyPush.events.some((event) =>
      event.type === "object_pushed" && (event.actorIds || []).includes("helper_companion"),
    ),
    "cooperative push records helper actor ids",
  );

  const pullCrate = dispatchV1PullObject({
    gamePackage,
    save: makeSave([crate.cell[0] + 1, crate.cell[1]]),
    x: crate.cell[0],
    y: crate.cell[1],
    dx: -1,
    dy: 0,
  });
  ok(pullCrate.ok, "pull_object moves a prop through the manipulation pipeline");
  ok(
    pullCrate.events.some((event) => event.type === "object_pulled") &&
      Object.values(pullCrate.save.map_deltas?.[demoMap.id]?.moved_objects || {}).some(
        (moved) => moved.cell[0] === crate.cell[0] - 1,
      ),
    "pull_object records a moved object delta and event",
  );

  const dragCrate = dispatchV1DragObject({
    gamePackage,
    save: makeSave([0, 6]),
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 0,
    dy: -1,
  });
  ok(dragCrate.ok, "drag_object moves a prop through the manipulation pipeline");
  ok(
    dragCrate.save.playerStats.energy === 550 &&
      dragCrate.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[movedKey]?.last_action === "drag",
    "drag_object spends higher drag effort and records a dragged condition",
  );

  const carryCrate = dispatchV1CarryObject({
    gamePackage,
    save: makeSave([crate.cell[0], crate.cell[1] - 1]),
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 0,
    dy: 0,
  });
  const carriedKey = Object.keys(carryCrate.save.map_deltas?.[demoMap.id]?.carried_objects || {})[0];
  ok(
    carryCrate.ok &&
      Boolean(carriedKey) &&
      carryCrate.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[carriedKey]?.last_action === "carry",
    "carry_object records an oversized carry state and condition",
  );
  const carryKernel = createKernelSnapshotFromV1(gamePackage, carryCrate.save);
  ok(
    carryKernel.instances.some(
      (instance) =>
        instance.id === kernelInstanceId(demoMap.id, "object", carriedKey) &&
        instance.location.type === "hand_slot",
    ),
    "kernel snapshot places carried objects in an actor hand holder",
  );

  // change_map command.
  const overworld = gamePackage.maps.find((map) => map.id === "map_overworld")!;
  const targetSpawn = overworld.spawns[0]!;
  const mapChange = dispatchV1ChangeMap({
    gamePackage,
    save: makeSave([0, 5]),
    targetMapId: overworld.id,
    targetSpawnId: targetSpawn.id,
    facing: [1, 0],
    exitId: "test_exit",
  });
  ok(mapChange.ok, "change_map accepts a valid target map");
  ok(mapChange.save.current_map_id === overworld.id, "change_map updates the save current_map_id");
  ok(
    mapChange.save.player.cell[0] === targetSpawn.cell[0] &&
      mapChange.save.player.cell[1] === targetSpawn.cell[1],
    "change_map moves the player to the target spawn",
  );
  ok(mapChange.save.player.facing[0] === 1 && mapChange.save.player.facing[1] === 0, "change_map applies exit facing override");
  ok(mapChange.events.some((e) => e.type === "map_changed"), "change_map emits map_changed");

  const authoredOverworldExit = overworld.exits?.find((exit) => exit.id === "exit_to_demo_ground");
  ok(
    Boolean(authoredOverworldExit) &&
      authoredOverworldExit?.cell?.[0] === 8 &&
      authoredOverworldExit?.cell?.[1] === 6,
    "authored overworld exit is present at x8 z6",
  );
  const exitApproach = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([7, 6], { current_map_id: overworld.id }),
    dx: 1,
    dy: 0,
  });
  ok(
    exitApproach.ok &&
      exitApproach.save.current_map_id === overworld.id &&
      exitApproach.save.player.cell[0] === 8 &&
      exitApproach.save.player.cell[1] === 6,
    "authored x8 z6 exit cell accepts the approach step",
  );
  const authoredExitChange = dispatchV1ChangeMap({
    gamePackage,
    save: exitApproach.save,
    targetMapId: authoredOverworldExit!.target_map_id,
    targetSpawnId: authoredOverworldExit!.target_spawn_id,
    facing: authoredOverworldExit!.facing as [number, number] | undefined,
    exitId: authoredOverworldExit!.id,
  });
  ok(
    authoredExitChange.ok &&
      authoredExitChange.save.current_map_id === demoMap.id &&
      authoredExitChange.save.player.cell[0] === 0 &&
      authoredExitChange.save.player.cell[1] === 6 &&
      authoredExitChange.save.player.facing[0] === -1 &&
      authoredExitChange.save.player.facing[1] === 0,
    "authored x8 z6 exit transitions to Engine Test Grounds spawn_start",
  );

  const missingMap = dispatchV1ChangeMap({
    gamePackage,
    save: makeSave([0, 5]),
    targetMapId: "missing_map",
  });
  ok(!missingMap.ok && missingMap.reason === "invalid map transition", "change_map rejects a missing target map");
  ok(missingMap.save.current_map_id === demoMap.id, "failed change_map does not mutate current_map_id");

  // wait command (deterministic time + a deliberately passed turn).
  const waited = dispatchV1Wait({
    gamePackage,
    save: makeSave([0, 6]),
    energyCost: 1000,
    clockMinutes: 5,
  });
  ok(waited.ok, "wait accepts a valid actor");
  ok(waited.events.some((e) => e.type === "waited"), "wait emits a waited event");
  ok(waited.save.playerStats.energy === 0, "wait can spend player energy");
  ok(waited.save.clock_minutes === 9 * 60 + 5, "wait advances the deterministic clock");
  ok(
    waited.events.some((e) => e.type === "resource_spent" && (e.payload as any)?.clock_minutes === 5),
    "wait emits resource_spent with the clock cost",
  );
  ok(
    waited.save.player.cell[0] === 0 && waited.save.player.cell[1] === 6,
    "wait never moves the actor",
  );

  const freeWait = dispatchV1Wait({ gamePackage, save: makeSave([0, 6]) });
  ok(freeWait.ok, "wait with no cost still succeeds");
  ok(freeWait.save.clock_minutes === 9 * 60, "free wait leaves the clock unchanged");
  ok(
    !freeWait.events.some((e) => e.type === "resource_spent"),
    "free wait emits no resource_spent",
  );

  const waitA = dispatchV1Wait({ gamePackage, save: makeSave([0, 6]), energyCost: 250, clockMinutes: 5 });
  const waitB = dispatchV1Wait({ gamePackage, save: makeSave([0, 6]), energyCost: 250, clockMinutes: 5 });
  ok(
    waitA.save.clock_minutes === waitB.save.clock_minutes &&
      waitA.save.playerStats.energy === waitB.save.playerStats.energy,
    "wait is deterministic for identical inputs",
  );

  // fire_trigger command.
  const firedTrigger = dispatchV1FireTrigger({
    gamePackage,
    save: makeSave([0, 6]),
    triggerId: "trg_demo_intro",
  });
  ok(firedTrigger.ok, "fire_trigger accepts an authored trigger");
  ok(firedTrigger.save.flags?.trig_run_trg_demo_intro === true, "fire_trigger marks once triggers as run");
  ok(firedTrigger.events.some((e) => e.type === "trigger_fired"), "fire_trigger emits trigger_fired");

  const repeatedTrigger = dispatchV1FireTrigger({
    gamePackage,
    save: makeSave([0, 6], { flags: { trig_run_trg_demo_intro: true } }),
    triggerId: "trg_demo_intro",
  });
  ok(
    !repeatedTrigger.ok && repeatedTrigger.reason === "trigger already fired",
    "fire_trigger rejects already-run once triggers",
  );

  const missingTrigger = dispatchV1FireTrigger({
    gamePackage,
    save: makeSave([0, 6]),
    triggerId: "missing_trigger",
  });
  ok(!missingTrigger.ok && missingTrigger.reason === "no trigger", "fire_trigger rejects missing triggers");

  // container commands.
  const lockedOpen = dispatchV1OpenContainer({
    gamePackage,
    save: makeSave([4, 3], { inventory: [{ id: "itm_practice_key", count: 1 }] }),
    containerId: chest.id,
    energyCost: 1000,
  });
  ok(!lockedOpen.ok && lockedOpen.reason === "locked", "open_container rejects locked containers");
  ok(lockedOpen.save.playerStats.energy === 1000, "failed open_container does not spend energy");

  const missingKeyUnlock = dispatchV1UnlockContainer({
    gamePackage,
    save: makeSave([4, 3]),
    containerId: chest.id,
    energyCost: 1000,
  });
  ok(!missingKeyUnlock.ok && missingKeyUnlock.reason === "missing key", "unlock_container rejects missing keys");
  ok(missingKeyUnlock.save.playerStats.energy === 1000, "failed unlock_container does not spend energy");

  const unlockedChest = dispatchV1UnlockContainer({
    gamePackage,
    save: makeSave([4, 3], { inventory: [{ id: "itm_practice_key", count: 1 }] }),
    containerId: chest.id,
    energyCost: 1000,
  });
  ok(unlockedChest.ok, "unlock_container unlocks keyed containers");
  ok(
    unlockedChest.save.map_deltas?.[demoMap.id]?.containers?.[chest.id]?.locked === false,
    "unlock_container records unlocked state",
  );
  ok(
    unlockedChest.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[chest.id]?.last_action === "unlock",
    "unlock_container records a Simulation S1 container condition",
  );
  ok(
    (unlockedChest.save.inventory || []).some((entry) => entry.id === "itm_practice_key" && entry.count === 1),
    "unlock_container preserves non-consuming keys",
  );
  ok(unlockedChest.save.playerStats.energy === 0, "unlock_container can spend player energy");
  ok(unlockedChest.events.some((e) => e.type === "container_unlocked"), "unlock_container emits container_unlocked");
  const unlockFact = unlockedChest.kernelFacts.find((fact) => fact.action_type === "container_unlocked");
  ok(
    unlockFact?.direct_consequences?.transaction_kind === "unlock",
    "unlock_container kernel fact records an unlock transaction kind",
  );
  const unlockKernel = createKernelSnapshotFromV1(gamePackage, unlockedChest.save);
  ok(
    unlockKernel.transactions.some(
      (transaction) =>
        transaction.fact_id === unlockFact?.id &&
        transaction.kind === "unlock" &&
        transaction.target_id === chestInstanceId &&
        transaction.previous_state?.locked === true &&
        transaction.new_state?.locked === false,
    ),
    "kernel snapshot derives a committed container-unlock transaction",
  );

  const openedChest = dispatchV1OpenContainer({
    gamePackage,
    save: makeSave([4, 3], {
      map_deltas: { [demoMap.id]: { containers: { [chest.id]: { locked: false } } } },
    }),
    containerId: chest.id,
    energyCost: 1000,
  });
  ok(openedChest.ok, "open_container opens unlocked containers");
  ok(
    openedChest.save.map_deltas?.[demoMap.id]?.containers?.[chest.id]?.opened === true,
    "open_container records opened state",
  );
  ok(
    openedChest.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[chest.id]?.last_action === "open",
    "open_container updates the Simulation S1 container condition",
  );
  ok(openedChest.save.playerStats.energy === 0, "open_container can spend player energy");
  ok(openedChest.events.some((e) => e.type === "container_opened"), "open_container emits container_opened");
  const openContainerFact = openedChest.kernelFacts.find((fact) => fact.action_type === "container_opened");
  ok(
    openContainerFact?.direct_consequences?.transaction_kind === "open",
    "open_container kernel fact records an open transaction kind",
  );
  const openContainerKernel = createKernelSnapshotFromV1(gamePackage, openedChest.save);
  ok(
    openContainerKernel.transactions.some(
      (transaction) =>
        transaction.fact_id === openContainerFact?.id &&
        transaction.kind === "open" &&
        transaction.target_id === chestInstanceId &&
        transaction.previous_state?.opened === false &&
        transaction.new_state?.opened === true,
    ),
    "kernel snapshot derives a committed container-open transaction",
  );
  const searchedChest = dispatchV1SearchContainer({
    gamePackage,
    save: openedChest.save,
    containerId: chest.id,
  });
  ok(searchedChest.ok, "search_container searches an accessible container");
  ok(
    searchedChest.save.map_deltas?.[demoMap.id]?.simulation_conditions?.[chest.id]?.last_action === "search",
    "search_container updates the Simulation S1 container condition",
  );
  const searchFact = searchedChest.kernelFacts.find((fact) => fact.action_type === "container_searched");
  const searchKernel = createKernelSnapshotFromV1(gamePackage, searchedChest.save);
  ok(
    searchKernel.transactions.some(
      (transaction) =>
        transaction.fact_id === searchFact?.id &&
        transaction.kind === "search" &&
        transaction.target_id === chestInstanceId,
    ),
    "kernel snapshot derives a committed container-search transaction",
  );

  const consumingPackage = createLegacyEngineTestFixturePackage();
  const consumingDemoMap = consumingPackage.maps.find((map) => map.id === "map_demo_ground")!;
  const consumingChest = consumingDemoMap.container_placements.find((container) => container.id === chest.id)!;
  consumingChest.consume_key = true;
  const consumedKeyUnlock = dispatchV1UnlockContainer({
    gamePackage: consumingPackage,
    save: makeSave([4, 3], { inventory: [{ id: "itm_practice_key", count: 1 }] }),
    containerId: chest.id,
  });
  ok(
    consumedKeyUnlock.ok && !(consumedKeyUnlock.save.inventory || []).some((entry) => entry.id === "itm_practice_key"),
    "unlock_container consumes authored consuming keys",
  );

  const unopenedTake = dispatchV1TakeFromContainer({
    gamePackage,
    save: makeSave([4, 3], {
      map_deltas: { [demoMap.id]: { containers: { [chest.id]: { locked: false } } } },
    }),
    containerId: chest.id,
    entryIndex: 0,
  });
  ok(!unopenedTake.ok && unopenedTake.reason === "not open", "take_from_container rejects unopened containers");

  const openedContainerSave = makeSave([4, 3], {
    map_deltas: { [demoMap.id]: { containers: { [chest.id]: { locked: false, opened: true } } } },
  });
  const takenFromContainer = dispatchV1TakeFromContainer({
    gamePackage,
    save: openedContainerSave,
    containerId: chest.id,
    entryIndex: 0,
  });
  ok(takenFromContainer.ok, "take_from_container takes an opened container stack");
  ok(
    (takenFromContainer.save.inventory || []).some((entry) => entry.id === "itm_health_tonic" && entry.count === 2),
    "take_from_container adds the stack to inventory",
  );
  ok(
    takenFromContainer.save.map_deltas?.[demoMap.id]?.containers?.[chest.id]?.items?.length === 1,
    "take_from_container removes the stack from container contents",
  );
  ok(
    takenFromContainer.events.some((event) => event.type === "container_item_taken"),
    "take_from_container emits container_item_taken",
  );
  ok(
    takenFromContainer.kernelFacts.some(
      (fact) =>
        fact.action_type === "object_taken_from_container" &&
        fact.resulting_object_instance_ids?.includes(chestInstanceId),
    ),
    "take_from_container emits a kernel object_taken_from_container fact",
  );
  const containerTakeFact = takenFromContainer.kernelFacts.find(
    (fact) => fact.action_type === "object_taken_from_container",
  );
  ok(
    containerTakeFact?.previous_state?.from_holder_id === chestContentsHolderId &&
      containerTakeFact?.new_state?.to_holder_id === playerInventoryHolderId,
    "take_from_container kernel fact records container to inventory holders",
  );
  const containerTakeKernel = createKernelSnapshotFromV1(gamePackage, takenFromContainer.save);
  ok(
    containerTakeKernel.transfers.some(
      (transfer) =>
        transfer.fact_id === containerTakeFact?.id &&
        transfer.item_template_id === "itm_health_tonic" &&
        transfer.from_holder_id === chestContentsHolderId &&
        transfer.to_holder_id === playerInventoryHolderId,
    ),
    "kernel snapshot derives a container loot transfer record",
  );

  const missingStowItem = dispatchV1StowInContainer({
    gamePackage,
    save: openedContainerSave,
    containerId: chest.id,
    itemId: "itm_training_token",
  });
  ok(!missingStowItem.ok && missingStowItem.reason === "missing item", "stow_in_container rejects missing inventory");

  const stowedItem = dispatchV1StowInContainer({
    gamePackage,
    save: makeSave([4, 3], {
      inventory: [{ id: "itm_training_token", count: 2 }],
      map_deltas: { [demoMap.id]: { containers: { [chest.id]: { locked: false, opened: true } } } },
    }),
    containerId: chest.id,
    itemId: "itm_training_token",
  });
  ok(stowedItem.ok, "stow_in_container stows one inventory item");
  ok(
    (stowedItem.save.inventory || []).some((entry) => entry.id === "itm_training_token" && entry.count === 1),
    "stow_in_container decrements player inventory",
  );
  ok(
    stowedItem.save.map_deltas?.[demoMap.id]?.containers?.[chest.id]?.items?.some(
      (entry) => entry.item_id === "itm_training_token" && entry.count === 2,
    ),
    "stow_in_container merges with an existing container stack",
  );
  ok(
    stowedItem.events.some((event) => event.type === "container_item_stowed"),
    "stow_in_container emits container_item_stowed",
  );
  ok(
    stowedItem.kernelFacts.some(
      (fact) =>
        fact.action_type === "object_stowed_in_container" &&
        fact.previous_state?.from_holder_id === playerInventoryHolderId &&
        fact.new_state?.to_holder_id === chestContentsHolderId,
    ),
    "stow_in_container kernel fact records inventory to container holders",
  );

  const takenAll = dispatchV1TakeAllFromContainer({
    gamePackage,
    save: openedContainerSave,
    containerId: chest.id,
  });
  ok(takenAll.ok, "take_all_from_container empties an opened container");
  ok(
    (takenAll.save.inventory || []).some((entry) => entry.id === "itm_health_tonic" && entry.count === 2) &&
      (takenAll.save.inventory || []).some((entry) => entry.id === "itm_training_token" && entry.count === 1),
    "take_all_from_container moves all contents to inventory",
  );
  ok(
    takenAll.save.map_deltas?.[demoMap.id]?.containers?.[chest.id]?.items?.length === 0,
    "take_all_from_container records empty container contents",
  );
  ok(
    takenAll.events.some((event) => event.type === "container_items_taken"),
    "take_all_from_container emits container_items_taken",
  );
  const takenAllAgain = dispatchV1TakeAllFromContainer({
    gamePackage,
    save: takenAll.save,
    containerId: chest.id,
  });
  ok(!takenAllAgain.ok && takenAllAgain.reason === "empty", "take_all_from_container rejects empty containers");

  // ── State-mutation commands (story / cutscene / dialogue effects) ──
  const switched = dispatchV1SetSwitch({ gamePackage, save: makeSave([0, 6]), switchId: "sw_gate", value: true });
  ok(switched.ok && switched.save.flags?.sw_gate === true, "set_switch sets a flag");
  ok(switched.events.some((e) => e.type === "switch_set"), "set_switch emits switch_set");
  ok(
    !dispatchV1SetSwitch({ gamePackage, save: makeSave([0, 6]), switchId: "" }).ok,
    "set_switch rejects an empty switch id",
  );

  const quested = dispatchV1SetQuest({ gamePackage, save: makeSave([0, 6]), questId: "q_intro", state: "active" });
  ok(quested.ok && quested.save.quests?.q_intro === "active", "set_quest sets quest state");
  ok(quested.events.some((e) => e.type === "quest_updated"), "set_quest emits quest_updated");

  const granted = dispatchV1GiveItem({ gamePackage, save: makeSave([0, 6]), itemId: "itm_health_tonic", count: 3 });
  ok(
    granted.ok && (granted.save.inventory || []).some((i) => i.id === "itm_health_tonic" && i.count === 3),
    "give_item adds a stack to inventory",
  );
  ok(granted.events.some((e) => e.type === "item_granted"), "give_item emits item_granted");
  const grantedFact = granted.kernelFacts.find((fact) => fact.action_type === "object_granted");
  ok(
    grantedFact?.previous_state?.from_holder_id === systemCacheHolderId &&
      grantedFact?.new_state?.to_holder_id === playerInventoryHolderId,
    "give_item kernel fact records system-cache to inventory holders",
  );
  ok(
    granted.save.world_facts?.some((fact) => fact.action_type === "object_granted"),
    "give_item persists a kernel grant fact",
  );
  const grantKernel = createKernelSnapshotFromV1(gamePackage, granted.save);
  ok(
    grantKernel.transfers.some(
      (transfer) =>
        transfer.fact_id === grantedFact?.id &&
        transfer.item_template_id === "itm_health_tonic" &&
        transfer.quantity === 3 &&
        transfer.from_holder_id === systemCacheHolderId &&
        transfer.to_holder_id === playerInventoryHolderId,
    ),
    "kernel snapshot derives a grant transfer record",
  );

  const removed = dispatchV1RemoveItem({
    gamePackage,
    save: makeSave([0, 6], { inventory: [{ id: "itm_health_tonic", count: 3 }] }),
    itemId: "itm_health_tonic",
    count: 2,
  });
  ok(
    removed.ok && (removed.save.inventory || []).some((i) => i.id === "itm_health_tonic" && i.count === 1),
    "remove_item decrements an inventory stack",
  );
  ok(removed.events.some((e) => e.type === "item_removed"), "remove_item emits item_removed");
  const removedFact = removed.kernelFacts.find((fact) => fact.action_type === "object_removed");
  ok(
    removedFact?.previous_state?.from_holder_id === playerInventoryHolderId &&
      removedFact?.new_state?.to_holder_id === consumedHolderId,
    "remove_item kernel fact records inventory to destroyed holders",
  );
  ok(
    removed.save.world_facts?.some((fact) => fact.action_type === "object_removed"),
    "remove_item persists a kernel removal fact",
  );
  const removalKernel = createKernelSnapshotFromV1(gamePackage, removed.save);
  ok(
    removalKernel.transfers.some(
      (transfer) =>
        transfer.fact_id === removedFact?.id &&
        transfer.item_template_id === "itm_health_tonic" &&
        transfer.quantity === 2 &&
        transfer.from_holder_id === playerInventoryHolderId &&
        transfer.to_holder_id === consumedHolderId,
    ),
    "kernel snapshot derives a removal transfer record",
  );

  const coined = dispatchV1GiveCurrency({ gamePackage, save: makeSave([0, 6], { money: 10 }), amount: 15 });
  ok(coined.ok && coined.save.money === 25, "give_currency adds money");
  ok(coined.events.some((e) => e.type === "currency_changed"), "give_currency emits currency_changed");
  const spent = dispatchV1RemoveCurrency({ gamePackage, save: makeSave([0, 6], { money: 10 }), amount: 15 });
  ok(spent.ok && spent.save.money === 0, "remove_currency clamps money at zero");

  const repped = dispatchV1AdjustFactionRep({
    gamePackage,
    save: makeSave([0, 6], { faction_rep: { f_guild: 5 } }),
    factionId: "f_guild",
    amount: -8,
  });
  ok(repped.ok && repped.save.faction_rep?.f_guild === -3, "adjust_faction_rep applies a signed delta");
  ok(repped.events.some((e) => e.type === "faction_rep_changed"), "adjust_faction_rep emits faction_rep_changed");

  const readDoc = dispatchV1ReadDocument({ gamePackage, save: makeSave([0, 6]), documentId: "doc_note" });
  ok(readDoc.ok && (readDoc.save.read_documents || []).includes("doc_note"), "read_document records a read document");
  ok(readDoc.events.some((e) => e.type === "document_read"), "read_document emits document_read");
  const reReadDoc = dispatchV1ReadDocument({
    gamePackage,
    save: makeSave([0, 6], { read_documents: ["doc_note"] }),
    documentId: "doc_note",
  });
  ok(
    (reReadDoc.save.read_documents || []).filter((d) => d === "doc_note").length === 1,
    "read_document does not duplicate an already-read document",
  );

  const learned = dispatchV1LearnSkill({ gamePackage, save: makeSave([0, 6]), skillId: "ab_strike" });
  ok(learned.ok && (learned.save.known_skills || []).includes("ab_strike"), "learn_skill adds a known skill");
  ok(learned.events.some((e) => e.type === "skill_learned"), "learn_skill emits skill_learned");

  const costedSwitch = dispatchV1SetSwitch({ gamePackage, save: makeSave([0, 6]), switchId: "sw_gate", energyCost: 250 });
  ok(costedSwitch.save.playerStats.energy === 750, "state commands can spend an action cost");

  const positionedPlayer = dispatchV1SetPlayerPosition({
    gamePackage,
    save: makeSave([0, 6]),
    cell: [2, 2],
    facing: [1, 0],
  });
  ok(
    positionedPlayer.ok &&
      positionedPlayer.save.player.cell[0] === 2 &&
      positionedPlayer.save.player.facing[0] === 1,
    "set_player_position persists absolute player placement",
  );

  const teleportedPlayer = dispatchV1TeleportPlayer({
    gamePackage,
    save: makeSave([0, 6]),
    mapId: "map_overworld",
    cell: [3, 4],
    facing: [0, 1],
  });
  ok(
    teleportedPlayer.ok &&
      teleportedPlayer.save.current_map_id === "map_overworld" &&
      teleportedPlayer.save.player.cell[1] === 4,
    "teleport_player can move the player to an explicit map/cell",
  );

  const guideIndex = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_guide");
  const guideKey = entityStateKey(demoMap.id, "ent_guide", guideIndex);
  const movedGuide = dispatchV1SetEntityPosition({
    gamePackage,
    save: makeSave([0, 6]),
    entityId: "ent_guide",
    cell: [1, 5],
    facing: [-1, 0],
  });
  ok(
    movedGuide.ok &&
      movedGuide.save.entity_states?.[guideKey]?.cell?.[0] === 1 &&
      movedGuide.save.entity_states?.[guideKey]?.facing?.[0] === -1,
    "set_entity_position persists authored entity placement state",
  );

  const spriteSet = dispatchV1SetPlayerSprite({ gamePackage, save: makeSave([0, 6]), spriteId: "spr_companion" });
  ok(spriteSet.ok && spriteSet.save.player.sprite_id === "spr_companion", "set_player_sprite persists player sprite");

  const healedPlayer = dispatchV1HealPlayer({
    gamePackage,
    save: makeSave([0, 6], { playerStats: { ...makeSave([0, 6]).playerStats, hp: 5 } }),
    amount: 6,
  });
  ok(healedPlayer.ok && healedPlayer.save.playerStats.hp === 11, "heal_player restores HP up to max");

  const restoredParty = dispatchV1RestoreParty({
    gamePackage,
    save: makeSave([0, 6], {
      playerStats: { ...makeSave([0, 6]).playerStats, hp: 1, mp: 0, energy: 0 },
      party_members: ["ent_companion"],
      entity_states: { ent_companion: { hp: 0, mp: 0, dead: true } },
    }),
  });
  ok(
    restoredParty.ok &&
      restoredParty.save.playerStats.hp === restoredParty.save.playerStats.max_hp &&
      restoredParty.save.playerStats.energy === 1000 &&
      restoredParty.save.entity_states?.ent_companion?.dead === false,
    "restore_party restores player and party actors",
  );

  const partyAdded = dispatchV1AddPartyMember({ gamePackage, save: makeSave([0, 6]), entityId: "ent_companion" });
  ok(partyAdded.ok && partyAdded.save.party_members.includes("ent_companion"), "add_party_member persists party membership");
  const partyRemoved = dispatchV1RemovePartyMember({ gamePackage, save: partyAdded.save, entityId: "ent_companion" });
  ok(partyRemoved.ok && !partyRemoved.save.party_members.includes("ent_companion"), "remove_party_member persists dismissal");

  const clockAdvanced = dispatchV1AdvanceClock({ gamePackage, save: makeSave([0, 6]), minutes: 75 });
  ok(clockAdvanced.ok && clockAdvanced.save.clock_minutes === 9 * 60 + 75, "advance_clock persists clock jumps");

  const statsModified = dispatchV1ModifyPlayerStats({
    gamePackage,
    save: makeSave([0, 6]),
    stats: { max_hp: 4, attack: 2, speed: -20 },
  });
  ok(
    statsModified.ok &&
      statsModified.save.playerStats.max_hp === 28 &&
      statsModified.save.playerStats.hp === 28 &&
      statsModified.save.playerStats.speed === 1,
    "modify_player_stats applies deltas and clamps derived stats",
  );

  const hiddenGuide = dispatchV1SetEntityHidden({
    gamePackage,
    save: makeSave([0, 6]),
    entityId: "ent_guide",
    hidden: true,
  });
  ok(hiddenGuide.ok && hiddenGuide.save.entity_states?.[guideKey]?.hidden === true, "set_entity_hidden persists entity visibility");

  const recordedBark = dispatchV1RecordBark({
    gamePackage,
    save: makeSave([0, 6]),
    barkId: "bark_demo_ready",
    clockMinutes: 777,
  });
  ok(
    recordedBark.ok && recordedBark.save.bark_cooldowns?.bark_demo_ready === 777,
    "record_bark persists save-backed bark cooldowns",
  );

  const endedGame = dispatchV1GameEnd({
    gamePackage,
    save: makeSave([0, 6]),
    endingId: "demo_end",
    title: "Demo Complete",
  });
  ok(
    endedGame.ok &&
      endedGame.save.flags.game_ended === true &&
      endedGame.save.game_end?.title === "Demo Complete",
    "game_end records terminal playthrough state",
  );

  const dialogueChoice = dispatchV1ChooseDialogueOption({
    gamePackage,
    save: makeSave([0, 6]),
    dialogueId: "dia_demo_guide",
    nodeId: "start",
    optionIndex: 0,
  });
  ok(
    dialogueChoice.ok &&
      dialogueChoice.outcome?.nextNodeId === "tour" &&
      dialogueChoice.save.flags.demo_tour_started === true &&
      dialogueChoice.save.quests.quest_demo_tour === "started",
    "choose_dialogue_option resolves graph transitions and option effects",
  );
  ok(
    dialogueChoice.events.some((event) => event.type === "dialogue_option_chosen") &&
      dialogueChoice.events.some((event) => event.type === "switch_set") &&
      dialogueChoice.events.some((event) => event.type === "quest_updated"),
    "choose_dialogue_option emits transition and state-effect events",
  );

  const boughtItem = dispatchV1BuyShopItem({
    gamePackage,
    save: makeSave([0, 6], { money: 5 }),
    shopId: "shop_demo_supply",
    stockIndex: 0,
  });
  ok(
    boughtItem.ok &&
      boughtItem.save.money === 0 &&
      boughtItem.save.inventory.some((entry) => entry.id === "itm_health_tonic" && entry.count === 1),
    "buy_shop_item applies price and grants stock item",
  );
  ok(boughtItem.events.some((event) => event.type === "shop_item_bought"), "buy_shop_item emits shop_item_bought");
  const soldItem = dispatchV1SellInventoryItem({
    gamePackage,
    save: makeSave([0, 6], { inventory: [{ id: "itm_health_tonic", count: 1 }] }),
    shopId: "shop_demo_supply",
    itemId: "itm_health_tonic",
    count: 1,
  });
  ok(
    soldItem.ok &&
      soldItem.save.money === 2 &&
      !soldItem.save.inventory.some((entry) => entry.id === "itm_health_tonic"),
    "sell_inventory_item removes inventory and grants resale value",
  );
  ok(soldItem.events.some((event) => event.type === "shop_item_sold"), "sell_inventory_item emits shop_item_sold");

  // ── Story read services (conditions / dialogue / shops / triggers / barks) ──
  const storySave = makeSave([0, 6], {
    flags: { demo_tour_started: true },
    quests: { quest_demo_tour: "started" },
    inventory: [{ id: "itm_training_token", count: 2 }],
    party_members: ["ent_companion"],
    faction_rep: { f_guild: 5 },
    clock_minutes: 23 * 60,
  });
  const storyCtx = buildConditionContext(storySave);
  ok(
    evaluateCondition(
      {
        all: [
          { switch: "demo_tour_started" },
          { quest: "quest_demo_tour", quest_state: "started" },
          { has_item: "itm_training_token", item_count: 2 },
          { party_contains: "ent_companion" },
          { faction: "f_guild", rep_gte: 5 },
          { hour_gte: 22, hour_lt: 5 },
          { time_of_day: "night" },
        ],
      },
      storyCtx,
    ),
    "story conditions evaluate composed save gates",
  );
  ok(
    !evaluateCondition({ not: { switch: "demo_tour_started" } }, storyCtx),
    "story conditions support negation",
  );

  const gatedTrigger = {
    id: "trg_story_gate",
    type: "step" as const,
    conditions: [{ switch_id: "demo_tour_started", expected_value: true }],
    condition: { has_item: "itm_training_token", item_count: 2 },
    cutscene_id: "cut_story_gate",
    once: false,
  };
  ok(isTriggerEligible(gatedTrigger, storyCtx), "trigger eligibility honors legacy and general conditions");

  const dialogueNode = {
    id: "story_node",
    speaker: "Guide",
    text: "Pick a gated option.",
    options: [
      { text: "Visible by switch.", required_switch: "demo_tour_started" },
      { text: "Hidden by switch.", required_switch: "missing_switch" },
      { text: "Visible by quest.", required_quest: "quest_demo_tour", required_quest_state: "started" },
      { text: "Visible by condition.", condition: { party_contains: "ent_companion" } },
    ],
  };
  const visibleDialogue = getVisibleDialogueOptions(dialogueNode, storyCtx);
  ok(
    visibleDialogue.map((option) => option.text).join("|") ===
      "Visible by switch.|Visible by quest.|Visible by condition.",
    "dialogue option visibility is resolved by the core story service",
  );

  const storyShop = {
    id: "shop_story",
    display_name: "Story Shop",
    items: [
      {
        item_id: "itm_health_tonic",
        price: 10,
        condition: { switch: "demo_tour_started" },
        price_modifiers: [{ condition: { faction: "f_guild", rep_gte: 5 }, multiplier: 0.5, delta: 1 }],
      },
      {
        item_id: "itm_practice_key",
        price: 10,
        condition: { switch: "missing_switch" },
        price_modifiers: [],
      },
    ],
  };
  const storyStock = getAvailableShopStock(storyShop, storyCtx);
  ok(
    storyStock.length === 1 && storyStock[0].item.item_id === "itm_health_tonic" && storyStock[0].price === 6,
    "shop stock visibility and price modifiers are resolved by the core story service",
  );

  const bark = selectEligibleBark({
    barks: gamePackage.barks,
    speakerA: "ent_companion",
    speakerB: "ent_guide",
    ctx: storyCtx,
    clockMinutes: storySave.clock_minutes,
    lastPlayed: new Map(),
    defaultCooldownMinutes: 120,
  });
  ok(bark?.id === "bark_demo_ready", "bark selection matches speaker pairs and conditions");
  const cooledBark = selectEligibleBark({
    barks: gamePackage.barks,
    speakerA: "ent_guide",
    speakerB: "ent_companion",
    ctx: storyCtx,
    clockMinutes: storySave.clock_minutes,
    lastPlayed: new Map([["bark_demo_ready", storySave.clock_minutes - 10]]),
    defaultCooldownMinutes: 120,
  });
  ok(!cooledBark, "bark selection honors cooldowns");
  const overworldMap = gamePackage.maps.find((map) => map.id === "map_overworld")!;
  const barkScout = overworldMap.entity_placements.find((placement) => placement.entity_id === "ent_bark_scout");
  const barkScribe = overworldMap.entity_placements.find((placement) => placement.entity_id === "ent_bark_scribe");
  const systemsMapBark = selectEligibleBark({
    barks: gamePackage.barks,
    speakerA: "ent_bark_scout",
    speakerB: "ent_bark_scribe",
    ctx: storyCtx,
    clockMinutes: storySave.clock_minutes,
    lastPlayed: new Map(),
    defaultCooldownMinutes: 120,
  });
  ok(
    systemsMapBark?.id === "bark_systems_map_ready" &&
      barkScout &&
      barkScribe &&
      Math.abs(barkScout.cell[0] - barkScribe.cell[0]) + Math.abs(barkScout.cell[1] - barkScribe.cell[1]) <= 2,
    "systems test map includes an eligible ambient bark pair",
  );
  ok(
    overworldMap.entity_placements.some((placement) => placement.entity_id === "ent_stealth_watcher") &&
      overworldMap.cells.some((cell) => cell.x === 0 && cell.z === 6 && String(cell.tag || "").includes("stealth_light")),
    "systems test map includes a lit stealth watcher lane",
  );
  ok(
    overworldMap.regions?.some((region) => region.id === "systems_lab" && region.passive_checks.some((check) => check.id === "systems_lab_orientation")),
    "systems test map includes authored survival and region-gate rules",
  );
  ok(
    overworldMap.custom_object_placements.some(
      (placement) => placement.object_id === "obj_training_beacon" && placement.cell[0] === -2 && placement.cell[1] === 5,
    ) &&
      gamePackage.simulation_workstations.some(
        (station) => station.id === "sim_ws_world_alchemy" && station.map_id === "map_overworld" && station.cell[0] === -2,
      ),
    "systems test map includes a visible S6 workstation prompt target",
  );

  // ── Quest objective and combat commands ──
  const completedTalk = dispatchV1CompleteQuestObjective({
    gamePackage,
    save: makeSave([0, 6]),
    objectiveId: "obj_companion",
    targetId: "ent_companion",
    objectiveType: "talk",
  });
  ok(completedTalk.ok && completedTalk.save.flags?.obj_done_obj_companion === true, "complete_quest_objective marks the objective flag");
  ok(completedTalk.save.flags?.talked_ent_companion === true, "complete_quest_objective marks talk targets");
  ok(completedTalk.events.some((e) => e.type === "quest_objective_completed"), "complete_quest_objective emits completion event");

  const botPlacementIndex = demoMap.entity_placements.findIndex((placement) => placement.entity_id === "ent_training_bot");
  const botPlacement = demoMap.entity_placements[botPlacementIndex];
  const botCell = botPlacement.cell as [number, number];
  const adjacentToBot: [number, number] = [botCell[0], botCell[1] - 1];
  const botKey = entityStateKey(demoMap.id, "ent_training_bot", botPlacementIndex);

  const melee = dispatchV1MeleeAttack({
    gamePackage,
    save: makeSave(adjacentToBot),
    actorId: "player",
    targetId: botKey,
    energyCost: 1000,
  });
  const meleeState = melee.save.entity_states?.[botKey];
  const meleePayload = melee.events.find((event) => event.type === "melee_attack_resolved")?.payload as any;
  ok(melee.ok, "melee_attack accepts an adjacent target");
  ok((meleeState?.hp ?? 12) < 12, "melee_attack applies damage to entity state");
  ok(
    meleeState?.alertness === "combat" && Number(meleeState?.alert_score || 0) >= 1,
    "melee_attack marks damaged hostiles combat-alerted",
  );
  ok(melee.save.playerStats.energy === 0, "melee_attack can spend player action energy");
  ok(meleePayload?.targetId === botKey && meleePayload?.targetKind === "entity", "melee_attack emits structured combat payload");
  ok(melee.events.some((event) => event.type === "resource_spent"), "melee_attack emits resource_spent when costed");

  const enemyMelee = dispatchV1MeleeAttack({
    gamePackage,
    save: makeSave(adjacentToBot),
    actorId: botKey,
    targetId: "player",
  });
  const enemyPayload = enemyMelee.events.find((event) => event.type === "melee_attack_resolved")?.payload as any;
  ok(enemyMelee.ok, "melee_attack supports non-player attackers");
  ok(enemyMelee.save.playerStats.hp < 24, "enemy melee damages the player through the command");
  ok(enemyPayload?.targetKind === "player", "enemy melee payload identifies the player target");

  const killed = dispatchV1MeleeAttack({
    gamePackage,
    save: makeSave(adjacentToBot, {
      entity_states: { [botKey]: { cell: botCell, hp: 1 } },
    }),
    actorId: "player",
    targetId: botKey,
  });
  const killedState = killed.save.entity_states?.[botKey];
  ok(killed.ok, "melee_attack resolves lethal hits");
  ok(killedState?.dead === true && killedState.hp === 0, "lethal melee marks hostile entities dead");
  ok(killed.save.flags?.obj_done_obj_training === true, "lethal melee completes matching kill objectives");
  ok(killed.save.experience >= 25, "lethal melee grants out-of-combat XP immediately");
  ok(killed.events.some((event) => event.type === "quest_objective_completed"), "lethal melee emits objective completion");

  const quickStrike = dispatchV1CastSkill({
    gamePackage,
    save: makeSave(adjacentToBot, { known_skills: ["skl_quick_strike"] }),
    actorId: "player",
    skillId: "skl_quick_strike",
    targetCells: [botCell],
  });
  const quickStrikePayload = quickStrike.events.find((event) => event.type === "skill_cast_resolved")?.payload as any;
  ok(quickStrike.ok, "cast_skill accepts a known skill");
  ok((quickStrike.save.entity_states?.[botKey]?.hp ?? 12) < 12, "cast_skill applies damage payloads");
  ok(quickStrike.save.playerStats.energy === 0, "cast_skill spends player action energy outside combat");
  ok(quickStrikePayload?.hits?.[0]?.payloadType === "damage", "cast_skill emits damage hit payloads");

  const woundedSave = makeSave([0, 6], { known_skills: ["skl_first_aid"] });
  woundedSave.playerStats = { ...woundedSave.playerStats, hp: 10 };
  const healed = dispatchV1CastSkill({
    gamePackage,
    save: woundedSave,
    actorId: "player",
    skillId: "skl_first_aid",
    targetCells: [[0, 6]],
  });
  const healedPayload = healed.events.find((event) => event.type === "skill_cast_resolved")?.payload as any;
  ok(healed.ok, "cast_skill accepts healing payload skills");
  ok(healed.save.playerStats.hp === 16, "cast_skill applies heal payloads");
  ok(healed.save.playerStats.mp === 10, "cast_skill spends MP");
  ok(healedPayload?.hits?.[0]?.payloadType === "heal", "cast_skill emits heal hit payloads");

  const unlearned = dispatchV1CastSkill({
    gamePackage,
    save: makeSave(adjacentToBot),
    actorId: "player",
    skillId: "skl_quick_strike",
    targetCells: [botCell],
  });
  ok(!unlearned.ok && unlearned.reason === "skill not known", "cast_skill rejects unlearned player skills");

  // ── Combat session / turn / targeting services (phase 3 extraction) ──
  const nearbyHostiles = getV1NearbyHostiles({ gamePackage, save: makeSave(adjacentToBot), radius: 6 });
  ok(nearbyHostiles.some((hostile) => hostile.id === botKey), "core threat scan finds authored hostiles");

  const controlledExplorer = getV1ControlledCombatant({ gamePackage, save: makeSave([0, 6]) });
  ok(controlledExplorer?.id === "player" && controlledExplorer.skills.length === 0, "core controlled actor resolves exploration player");

  const targetPattern = getV1SkillTargetCells({
    gamePackage,
    save: makeSave(adjacentToBot, { known_skills: ["skl_quick_strike"] }),
    actorId: "player",
    skillId: "skl_quick_strike",
    targetCell: botCell,
  });
  ok(targetPattern.ok && targetPattern.cells.length === 1, "core targeting validates single-target skill cells");
  const rangeCells = getV1SkillRangeCells({
    gamePackage,
    save: makeSave(adjacentToBot, { known_skills: ["skl_first_aid"] }),
    actorId: "player",
    skillId: "skl_first_aid",
  });
  ok(rangeCells.some((cell) => cell[0] === adjacentToBot[0] && cell[1] === adjacentToBot[1] - 2), "core targeting exposes range overlay cells");

  const combatStarted = dispatchV1UpdateCombatSession({
    gamePackage,
    save: makeSave(adjacentToBot, { party_members: ["ent_companion"] }),
    threatRadius: 6,
    chaseRadius: 8,
    partyFollowers: [{ entityId: "ent_companion", cell: [4, -5] }],
  });
  ok(combatStarted.ok && combatStarted.save.in_combat === true, "update_combat_session starts combat");
  ok(
    combatStarted.save.combat_queue?.includes("player") &&
      combatStarted.save.combat_queue?.includes("ent_companion") &&
      !combatStarted.save.combat_queue?.includes(botKey),
    "combat start builds a speed-ordered player-side action queue",
  );
  const companionSpeed = gamePackage.entities.find((entity) => entity.id === "ent_companion")?.speed ?? 10;
  const expectedFirstAlly = companionSpeed > combatStarted.save.playerStats.speed ? "ent_companion" : "player";
  ok(
    combatStarted.save.active_turn_id === expectedFirstAlly,
    "combat gives first control to the fastest player-side actor",
  );
  ok(combatStarted.save.entity_states?.ent_companion?.cell?.[0] === 4, "combat start positions party followers");
  ok(combatStarted.events.some((event) => event.type === "combat_started"), "combat start emits combat_started");
  ok(
    combatStarted.save.entity_states?.[botKey]?.alertness === "combat",
    "combat start records a hostile alert memory for pursuit",
  );
  const stableCombatSession = dispatchV1UpdateCombatSession({
    gamePackage,
    save: combatStarted.save,
    threatRadius: 6,
    chaseRadius: 8,
  });
  ok(
    stableCombatSession.ok &&
      !stableCombatSession.events.some((event) => event.type === "combat_reinforced") &&
      stableCombatSession.save.active_turn_id === combatStarted.save.active_turn_id,
    "re-evaluating the same engaged hostiles is idempotent",
  );

  const sightAlert = advanceImmersivePerceptionForSave(gamePackage, makeSave(adjacentToBot), demoMap.id);
  const sightStarted = dispatchV1UpdateCombatSession({
    gamePackage,
    save: sightAlert.save,
    threatRadius: 0,
    chaseRadius: 8,
  });
  ok(
    sightStarted.ok &&
      sightStarted.save.in_combat === true &&
      sightStarted.events.some((event) => event.type === "combat_started"),
    "combat session can start from hostile sight alert instead of contact radius",
  );

  const distantAlertedCombat = dispatchV1UpdateCombatSession({
    gamePackage,
    save: makeSave([5, -15], {
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: botKey,
      entity_states: {
        [botKey]: {
          cell: botCell,
          hp: 12,
          alertness: "combat",
          alert_score: 1,
          investigation_target_cell: [5, -15],
        },
      },
    }),
    threatRadius: 6,
    chaseRadius: 8,
  });
  ok(
    distantAlertedCombat.ok &&
      distantAlertedCombat.save.in_combat === true &&
      distantAlertedCombat.save.active_turn_id === "player" &&
      !distantAlertedCombat.save.combat_queue?.includes(botKey),
    "combat keeps a distant alerted hostile while normalizing legacy hostile turns",
  );

  const controlledCompanion = getV1ControlledCombatant({
    gamePackage,
    save: { ...combatStarted.save, active_turn_id: "ent_companion" },
  });
  ok(controlledCompanion?.id === "ent_companion", "core controlled actor resolves party combat turns");

  const advancedTurn = dispatchV1AdvanceCombatTurn({
    gamePackage,
    save: { ...combatStarted.save, active_turn_id: "player" },
  });
  ok(advancedTurn.ok && advancedTurn.save.active_turn_id === "ent_companion", "advance_combat_turn skips to next living combatant");
  ok(advancedTurn.events.some((event) => event.type === "combat_turn_advanced"), "advance_combat_turn emits turn event");

  const enemyMove = dispatchV1EnemyTurn({
    gamePackage,
    save: makeSave([5, -7], {
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: botKey,
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    }),
  });
  const enemyMovePayload = enemyMove.events.find((event) => event.type === "enemy_turn_resolved")?.payload as any;
  ok(enemyMove.ok && enemyMovePayload?.kind === "move", "enemy_turn moves toward a distant opponent");
  ok(enemyMove.save.entity_states?.[botKey]?.cell?.[1] === -5, "enemy_turn persists chase movement");
  ok(enemyMove.save.active_turn_id === "player", "enemy_turn advances after moving");
  ok(
    enemyMove.save.entity_states?.[botKey]?.behavior_intent?.tier === "reactive" &&
      enemyMove.save.entity_states?.[botKey]?.behavior_intent?.action === "attack" &&
      enemyMove.save.entity_states?.[botKey]?.behavior_intent_log?.length === 1,
    "enemy_turn records its shared-arbiter combat intent",
  );

  const enemyAttack = dispatchV1EnemyTurn({
    gamePackage,
    save: makeSave(adjacentToBot, {
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: botKey,
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    }),
  });
  const enemyAttackPayload = enemyAttack.events.find((event) => event.type === "enemy_turn_resolved")?.payload as any;
  ok(enemyAttack.ok && enemyAttackPayload?.kind === "attack", "enemy_turn attacks adjacent opponents");
  ok(enemyAttack.save.playerStats.hp < 24, "enemy_turn attack mutates player HP");
  ok(enemyAttack.events.some((event) => event.type === "melee_attack_resolved"), "enemy_turn emits melee attack event");

  const simultaneousEnemyAttack = dispatchV1EnemyTurn({
    gamePackage,
    save: makeSave(adjacentToBot, {
      in_combat: true,
      combat_queue: ["player"],
      active_turn_id: "player",
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    }),
    actorId: botKey,
    advanceTurn: false,
  });
  ok(
    simultaneousEnemyAttack.ok &&
      simultaneousEnemyAttack.save.active_turn_id === "player" &&
      simultaneousEnemyAttack.save.playerStats.hp < 24 &&
      !simultaneousEnemyAttack.events.some((event) => event.type === "combat_turn_advanced"),
    "simultaneous enemy pulse resolves without taking control from the player side",
  );

  const opportunity = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([botCell[0] - 1, botCell[1]], {
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: "player",
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    }),
    dx: -1,
    dy: 0,
  });
  ok(opportunity.ok, "combat move away from adjacency still resolves through move_entity");
  ok(opportunity.events.some((event) => event.type === "opportunity_attack_resolved"), "combat movement can trigger opportunity attacks");
  ok(opportunity.save.playerStats.hp < 24, "opportunity attacks apply damage before movement completes");

  const combatEnded = dispatchV1UpdateCombatSession({
    gamePackage,
    save: { ...combatStarted.save, combat_xp_pool: 25 },
    forceEnd: true,
  });
  ok(combatEnded.ok && combatEnded.save.in_combat === false, "update_combat_session can force combat end");
  ok((combatEnded.save.experience || 0) >= 25, "combat end grants queued XP");
  ok(combatEnded.events.some((event) => event.type === "combat_ended"), "combat end emits combat_ended");

  // ── Package/save v2 migration and v1 normalization ──
  const packageV2 = migrateGamePackageV1ToV2(gamePackage);
  ok(packageV2.schema === GAME_PACKAGE_V2_SCHEMA, "v1 package migrates to package v2 schema");
  ok(packageV2.content.schema === "crpg_engine_game_package_v1", "package v2 preserves v1 content for compatibility");
  ok(packageV2.runtime.coordinate_system.default_plane_id === "ground", "package v2 declares a default grid plane");
  ok(!("praxis_verbs" in (packageV2.content as any)), "package v2 preserves the Praxis-free default package");
  const normalizedPackage = normalizeGamePackageToV2(gamePackage);
  ok(normalizedPackage.package_version === gamePackage.metadata.version, "normalizeGamePackageToV2 accepts v1 packages");
  ok(unwrapGamePackageV1(packageV2).metadata.title === gamePackage.metadata.title, "package v2 unwraps to v1 content");
  const exportedPackage = JSON.parse(serializePackageForExport(gamePackage));
  ok(exportedPackage.schema === GAME_PACKAGE_V2_SCHEMA, "studio package export defaults to package v2");
  const importedFromV2 = normalizePackageImportPayload(exportedPackage);
  ok(
    importedFromV2.schema === "crpg_engine_game_package_v1" &&
      importedFromV2.metadata.start_map_id === gamePackage.metadata.start_map_id &&
      importedFromV2.maps.length === gamePackage.maps.length &&
      importedFromV2.maps.every((map) => gamePackage.maps.some((source) => source.id === map.id)),
    "studio package import unwraps v2 without replacing authored maps",
  );
  const legacyPraxisPackage: any = {
    ...createEmptyGamePackage(),
    praxis_verbs: [{ id: "legacy_pxv", label: "Legacy" }],
    praxis_cases: [{ id: "legacy_case", title: "Legacy", central_question: "Retired?" }],
  };
  const normalizedNoPraxisPackage = normalizePackageImportPayload(legacyPraxisPackage);
  ok(
    !("praxis_verbs" in (normalizedNoPraxisPackage as any)) && !("praxis_cases" in (normalizedNoPraxisPackage as any)),
    "package normalization strips removed Praxis registries",
  );
  const legacyPraxisDialoguePackage = createEmptyGamePackage();
  legacyPraxisDialoguePackage.dialogue = legacyPraxisDialoguePackage.dialogue.map((dialogue) => {
    if (dialogue.id === "dia_demo_guide") {
      return {
        ...dialogue,
        nodes: [
          ...dialogue.nodes.map((node) =>
            node.id === "start"
              ? {
                  ...node,
                  options: [
                    ...node.options,
                    {
                      text: "Ask the Guide to answer the presented claim.",
                      next_node_id: "praxis_claim_response",
                      set_switch: "praxis_claim_presented",
                    },
                  ],
                }
              : node,
          ),
          {
            id: "praxis_claim_response",
            speaker: "Guide",
            text: "Praxis response placeholder.",
            options: [{ text: "Close." }],
          },
        ],
      };
    }
    if (dialogue.id === "dia_demo_companion") {
      return {
        ...dialogue,
        nodes: dialogue.nodes.map((node) =>
          node.id === "start"
            ? {
                ...node,
                options: [
                  ...node.options,
                  {
                    text: "Ask the Companion to answer the presented claim.",
                    next_node_id: "companion_praxis_claim_response",
                  },
                ],
              }
            : node,
        ),
      };
    }
    return dialogue;
  });
  const normalizedNoPraxisDialoguePackage = normalizePackageImportPayload(legacyPraxisDialoguePackage);
  const normalizedNoPraxisDialogueStrings = normalizedNoPraxisDialoguePackage.dialogue.flatMap((dialogue) =>
    dialogue.nodes.flatMap((node) => [
      node.id,
      node.speaker,
      node.text,
      ...node.options.flatMap((option) => [
        option.text,
        option.next_node_id || "",
        option.required_switch || "",
        option.set_switch || "",
      ]),
    ]),
  );
  ok(
    normalizedNoPraxisDialogueStrings.some((value) =>
      /presented claim|praxis_claim_response|praxis_claim_presented|casebook|casework/i.test(value),
    ),
    "package normalization preserves valid authored dialogue instead of applying an undeclared destructive migration",
  );
  const legacyNoBlueprintPackage: any = createEmptyGamePackage();
  delete legacyNoBlueprintPackage.object_blueprints;
  const normalizedBlueprintPackage = normalizePackageImportPayload(legacyNoBlueprintPackage);
  ok(
    normalizedBlueprintPackage.object_blueprints.length === 0,
    "package normalization applies schema defaults without injecting sample GameObject/Part blueprints",
  );
  const legacyImportedOverworldPackage = createLegacyEngineTestFixturePackage();
  legacyImportedOverworldPackage.maps = legacyImportedOverworldPackage.maps.map((map) =>
    map.id === "map_overworld"
      ? {
          ...map,
          display_name: "Imported Overworld (Seed 62)",
          width: 96,
          height: 96,
          custom_object_placements: [{ object_id: "obj_world_city", cell: [0, 0], facing: [0, 1] }],
        }
      : map,
  );
  const normalizedLegacyOverworld = normalizePackageImportPayload(legacyImportedOverworldPackage);
  const normalizedLegacyOverworldMap = normalizedLegacyOverworld.maps.find((map) => map.id === "map_overworld");
  ok(
    normalizedLegacyOverworldMap?.display_name === "Imported Overworld (Seed 62)" &&
      normalizedLegacyOverworld.metadata.start_map_id === legacyImportedOverworldPackage.metadata.start_map_id &&
      normalizedLegacyOverworld.maps.length === legacyImportedOverworldPackage.maps.length,
    "package normalization preserves an imported legacy overworld and its start map",
  );
  const staleSystemsMapPackage = createLegacyEngineTestFixturePackage();
  staleSystemsMapPackage.maps = staleSystemsMapPackage.maps.map((map) =>
    map.id === "map_overworld"
      ? {
          ...map,
          entity_placements: map.entity_placements.filter(
            (placement) =>
              placement.entity_id !== "ent_bark_scout" &&
              placement.entity_id !== "ent_bark_scribe" &&
              placement.entity_id !== "ent_stealth_watcher",
          ),
          regions: [],
        }
      : map,
  );
  staleSystemsMapPackage.entities = staleSystemsMapPackage.entities.filter(
    (entity) =>
      entity.id !== "ent_bark_scout" &&
      entity.id !== "ent_bark_scribe" &&
      entity.id !== "ent_stealth_watcher",
  );
  staleSystemsMapPackage.simulation_processes = staleSystemsMapPackage.simulation_processes.filter(
    (process) => process.id !== "sim_proc_brew_tonic" && process.id !== "sim_proc_pack_field_ration",
  );
  staleSystemsMapPackage.items = staleSystemsMapPackage.items.filter((item) => item.id !== "itm_field_ration");
  staleSystemsMapPackage.simulation_workstations = staleSystemsMapPackage.simulation_workstations.filter(
    (station) => station.id !== "sim_ws_world_alchemy" && station.id !== "sim_ws_demo_alchemy",
  );
  staleSystemsMapPackage.barks = (staleSystemsMapPackage.barks || []).filter(
    (bark) => bark.id !== "bark_systems_map_ready",
  );
  const normalizedStaleSystemsMap = normalizePackageImportPayload(staleSystemsMapPackage);
  const refreshedOverworld = normalizedStaleSystemsMap.maps.find((map) => map.id === "map_overworld");
  ok(
    Boolean(refreshedOverworld) &&
      normalizedStaleSystemsMap.maps.length === staleSystemsMapPackage.maps.length &&
      !normalizedStaleSystemsMap.entities.some((entity) => entity.id === "ent_bark_scribe") &&
      !normalizedStaleSystemsMap.entities.some((entity) => entity.id === "ent_stealth_watcher") &&
      !normalizedStaleSystemsMap.simulation_processes.some((process) => process.id === "sim_proc_brew_tonic") &&
      !normalizedStaleSystemsMap.items.some((item) => item.id === "itm_field_ration") &&
      !normalizedStaleSystemsMap.barks?.some((bark) => bark.id === "bark_systems_map_ready"),
    "package normalization preserves stale-but-valid authored content without installing sample backfills",
  );
  const normalizedGuideDialogue = gamePackage.dialogue.find((dialogue) => dialogue.id === "dia_demo_guide");
  ok(
    !normalizedGuideDialogue?.nodes.some((node) => node.id === "praxis_claim_response") &&
      !normalizedGuideDialogue?.nodes.some((node) =>
        node.options.some(
          (option) =>
            option.next_node_id === "praxis_claim_response" || /presented claim|casebook|casework/i.test(option.text),
        ),
      ),
    "default Guide dialogue has no retired Praxis claim prompts",
  );

  const saveForMigration = makeSave([0, 6], {
    explored_cells: { [demoMap.id]: ["0:6", "1:6"] },
    bark_cooldowns: { bark_demo_ready: 777 },
    game_end: { ending_id: "demo_end", title: "Demo Complete", reached_at_clock_minutes: 999 },
    actor_statuses: { player: [{ id: "regen", remaining: 2, magnitude: 3 }] },
    in_combat: true,
    combat_queue: ["player", botKey],
    active_turn_id: botKey,
    combat_xp_pool: 25,
    immersive_scheduler: {
      tick: 540,
      segment: 2,
      turn: 1,
      actors: [{ id: "player", actor_kind: "player", speed: 10, energy: 750 }],
    },
    immersive_tile_layers: {
      [demoMap.id]: {
        "0:5": {
          cell: [0, 5],
          temperature: 320,
          ambient_temperature: 25,
          light: 0.2,
          sound: 0,
          occlusion: 0,
          blocks_movement: false,
          blocks_vision: false,
          surface_kinds: ["water"],
          environment_kinds: ["steam"],
          updated_at_tick: 540,
        },
      },
    },
  });
  (saveForMigration as any).praxis_state = { focus: 1, observations: [] };
  const saveV2 = migratePlaySaveV1ToV2(saveForMigration);
  ok(saveV2.schema === PLAY_SAVE_V2_SCHEMA, "v1 save migrates to save v2 schema");
  ok(!("praxis_state" in (saveV2.content as any)) && !("praxis" in (saveV2.runtime as any)), "save v2 strips removed Praxis state");
  ok(saveV2.runtime.exploration.explored_cells[demoMap.id]?.includes("1:6"), "save v2 preserves fog exploration");
  ok(saveV2.runtime.story.bark_cooldowns.bark_demo_ready === 777, "save v2 preserves bark cooldowns");
  ok(saveV2.runtime.story.game_end?.title === "Demo Complete", "save v2 preserves ending state");
  ok(saveV2.runtime.combat.in_combat && saveV2.runtime.combat.active_turn_id === botKey, "save v2 preserves combat state");
  ok(saveV2.runtime.simulation.scheduler?.actors[0]?.energy === 750, "save v2 preserves immersive scheduler state");
  ok(saveV2.runtime.simulation.tile_layers[demoMap.id]?.["0:5"]?.temperature === 320, "save v2 preserves immersive tile layers");
  const kernelSaveV2 = migratePlaySaveV1ToV2(pickup.save);
  ok(
    kernelSaveV2.runtime.kernel.world_facts.some((fact) => fact.action_type === "object_taken"),
    "save v2 preserves kernel world facts in its runtime summary",
  );
  const normalizedSave = normalizePlaySaveToV2(saveForMigration);
  ok(normalizedSave.package_version === saveForMigration.package_version, "normalizePlaySaveToV2 accepts v1 saves");
  ok(normalizePlaySaveToV2(saveV2).schema === PLAY_SAVE_V2_SCHEMA, "normalizePlaySaveToV2 accepts v2 saves");
  ok(unwrapPlaySaveV1(saveV2).schema === "crpg_engine_save_v1", "save v2 unwraps to v1 content");
  const slotPayload = buildSaveSlotPayload(2, saveForMigration, "2026-06-28T12:00:00.000Z");
  ok((slotPayload.saveData as any)?.schema === PLAY_SAVE_V2_SCHEMA, "save slots write save v2 payloads by default");
  const normalizedSlot = normalizeSaveSlotPayload(2, slotPayload);
  ok(
    normalizedSlot?.saveData.schema === "crpg_engine_save_v1" &&
      normalizedSlot.meta.save_schema === PLAY_SAVE_V2_SCHEMA,
    "save slot loading normalizes v2 saves for the current runtime",
  );
  const legacySlot = normalizeSaveSlotPayload(1, {
    meta: { slot: 1, saved_at: "2026-06-28T12:00:00.000Z" },
    saveData: saveForMigration,
  });
  ok(legacySlot?.saveData.schema === "crpg_engine_save_v1", "save slot loading still accepts legacy v1 saves");

  // ── Phase 6 acceptance slice: one headless path through the shipped demo loop ──
  let acceptanceSave = makeSave([0, 6], { money: 6, known_skills: ["skl_quick_strike"] });
  const acceptanceMove = dispatchV1MoveEntity({
    gamePackage,
    save: acceptanceSave,
    dx: 0,
    dy: 1,
    energyCost: 1000,
  });
  ok(acceptanceMove.ok, "phase 6 acceptance: movement command advances the player");
  acceptanceSave = acceptanceMove.save;

  const acceptanceDialogue = dispatchV1ChooseDialogueOption({
    gamePackage,
    save: acceptanceSave,
    dialogueId: "dia_demo_guide",
    nodeId: "start",
    optionIndex: 0,
  });
  ok(
    acceptanceDialogue.ok &&
      acceptanceDialogue.save.flags.demo_tour_started === true &&
      acceptanceDialogue.save.quests.quest_demo_tour === "started",
    "phase 6 acceptance: dialogue updates quest and switch state",
  );
  acceptanceSave = acceptanceDialogue.save;

  const acceptanceDocument = dispatchV1ReadDocument({
    gamePackage,
    save: acceptanceSave,
    documentId: "doc_demo_note",
  });
  ok(
    acceptanceDocument.ok && acceptanceDocument.save.read_documents?.includes("doc_demo_note"),
    "phase 6 acceptance: document read persists to save",
  );
  acceptanceSave = acceptanceDocument.save;

  const acceptancePurchase = dispatchV1BuyShopItem({
    gamePackage,
    save: acceptanceSave,
    shopId: "shop_demo_supply",
    stockIndex: 0,
  });
  ok(
    acceptancePurchase.ok &&
      acceptancePurchase.save.money === 1 &&
      acceptancePurchase.save.inventory.some((entry) => entry.id === "itm_health_tonic"),
    "phase 6 acceptance: shop purchase updates economy and inventory",
  );

  const acceptanceMapTransition = dispatchV1ChangeMap({
    gamePackage,
    save: acceptancePurchase.save,
    targetMapId: "map_overworld",
  });
  ok(
    acceptanceMapTransition.ok &&
      acceptanceMapTransition.save.current_map_id === "map_overworld" &&
      acceptanceMapTransition.events.some((event) => event.type === "map_changed"),
    "phase 6 acceptance: map transition changes the active map",
  );

  const acceptanceUnlockedChest = dispatchV1UnlockContainer({
    gamePackage,
    save: makeSave([4, 3], { inventory: [{ id: "itm_practice_key", count: 1 }] }),
    containerId: chest.id,
  });
  const acceptanceOpenedChest = dispatchV1OpenContainer({
    gamePackage,
    save: acceptanceUnlockedChest.save,
    containerId: chest.id,
  });
  const acceptanceContainerLoot = dispatchV1TakeFromContainer({
    gamePackage,
    save: acceptanceOpenedChest.save,
    containerId: chest.id,
    entryIndex: 0,
  });
  ok(
    acceptanceUnlockedChest.ok &&
      acceptanceOpenedChest.ok &&
      acceptanceContainerLoot.ok &&
      acceptanceContainerLoot.save.inventory.some((entry) => entry.id === "itm_health_tonic"),
    "phase 6 acceptance: container unlock/open/loot persists inventory",
  );

  const acceptanceBranchActions = [
    { type: "label", label: "start" },
    {
      type: "branch",
      target_label: "after_tour",
      condition: { switch: "demo_tour_started" },
    },
    { type: "give_currency", amount: 999 },
    { type: "label", label: "after_tour" },
  ] as any;
  ok(
    shouldRunCutsceneBranch(acceptanceBranchActions[1], buildConditionContext(acceptanceDialogue.save)) &&
      findCutsceneLabelIndex(acceptanceBranchActions, "after_tour") === 3,
    "phase 6 acceptance: cutscene branch gates and resolves label jumps",
  );

  const acceptanceCombat = dispatchV1UpdateCombatSession({
    gamePackage,
    save: makeSave(adjacentToBot, { known_skills: ["skl_quick_strike"] }),
    threatRadius: 8,
    chaseRadius: 12,
  });
  ok(
    acceptanceCombat.ok &&
      acceptanceCombat.save.in_combat === true &&
      acceptanceCombat.save.combat_queue?.includes("player") &&
      !acceptanceCombat.save.combat_queue?.includes(botKey),
    "phase 6 acceptance: combat starts with player-side control and nearby hostile state",
  );
  const acceptanceAttack = dispatchV1MeleeAttack({
    gamePackage,
    save: acceptanceCombat.save,
    actorId: "player",
    targetId: botKey,
  });
  ok(
    acceptanceAttack.ok &&
      acceptanceAttack.events.some((event) => event.type === "melee_attack_resolved"),
    "phase 6 acceptance: combat attack resolves through event stream",
  );
  const phase6StatusSkill = {
    id: "skl_phase6_poison",
    display_name: "Phase 6 Poison",
    ap_cost: 1000,
    mp_cost: 0,
    element: "poison" as const,
    targeting: "single" as const,
    range: 6,
    payloads: [{ type: "status" as const, status_effect: "poison", value: 3 }],
  };
  const acceptanceStatusPackage = {
    ...gamePackage,
    abilities: [...gamePackage.abilities, phase6StatusSkill],
  };
  const acceptanceStatus = dispatchV1CastSkill({
    gamePackage: acceptanceStatusPackage,
    save: makeSave(adjacentToBot, {
      known_skills: [phase6StatusSkill.id],
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    }),
    actorId: "player",
    skillId: phase6StatusSkill.id,
    targetCells: [botCell],
  });
  ok(
    acceptanceStatus.ok &&
      acceptanceStatus.save.entity_states?.[botKey]?.statuses?.some((status) => status.id === "poison") &&
      acceptanceStatus.events.some((event) => event.type === "skill_cast_resolved"),
    "phase 6 acceptance: status-effect skill writes target status state",
  );

  const acceptanceOpportunity = dispatchV1MoveEntity({
    gamePackage,
    save: makeSave([botCell[0] - 1, botCell[1]], {
      in_combat: true,
      combat_queue: ["player", botKey],
      active_turn_id: "player",
      entity_states: { [botKey]: { cell: botCell, hp: 12 } },
    }),
    dx: -1,
    dy: 0,
  });
  ok(
    acceptanceOpportunity.ok &&
      acceptanceOpportunity.events.some((event) => event.type === "opportunity_attack_resolved") &&
      acceptanceOpportunity.save.playerStats.hp < 24,
    "phase 6 acceptance: opportunity attack fires on adjacent combat movement",
  );

  const acceptanceSlot = normalizeSaveSlotPayload(
    3,
    buildSaveSlotPayload(3, acceptanceAttack.save, "2026-06-28T12:30:00.000Z"),
  );
  ok(
    acceptanceSlot?.saveData.in_combat === true &&
      acceptanceSlot.saveData.combat_queue?.includes("player") &&
      !acceptanceSlot.saveData.combat_queue?.includes(botKey),
    "phase 6 acceptance: save/load boundary preserves active run state",
  );

  const acceptanceFogSlot = normalizeSaveSlotPayload(
    4,
    buildSaveSlotPayload(
      4,
      makeSave([0, 6], { explored_cells: { [demoMap.id]: ["0:6", "1:6"] } }),
      "2026-06-28T12:45:00.000Z",
    ),
  );
  ok(
    acceptanceFogSlot?.saveData.explored_cells?.[demoMap.id]?.includes("1:6"),
    "phase 6 acceptance: fog-of-war exploration survives save/load",
  );

  const acceptanceEditorPlayMap = resolvePlayModeMap({
    gamePackage,
    selectedMapId: demoMap.id,
    saveData: makeSave([0, 0], { current_map_id: "map_overworld" }),
    didInitialMapLoad: false,
  });
  const acceptanceMidRunMap = resolvePlayModeMap({
    gamePackage,
    selectedMapId: demoMap.id,
    saveData: makeSave([0, 0], { current_map_id: "map_overworld" }),
    didInitialMapLoad: true,
  });
  ok(
    acceptanceEditorPlayMap.map?.id === "map_overworld" &&
      acceptanceEditorPlayMap.versionOk &&
      acceptanceMidRunMap.map?.id === "map_overworld",
    "phase 6 acceptance: a resumable save wins across Studio/Play transitions",
  );
}

console.log("engine-core: transient bark lifecycle");
{
  useFxStore.setState({ barks: [] });
  useFxStore.getState().enqueueBark([
    { actorId: "enemy_dead", cell: [4, 7], text: "First", speaker: "Dead enemy" },
    { actorId: "enemy_dead", cell: [4, 7], text: "Delayed", speaker: "Dead enemy" },
    { actorId: "enemy_alive", cell: [5, 7], text: "Still here", speaker: "Living enemy" },
    { cell: [6, 7], text: "World text", speaker: "" },
  ]);
  useFxStore.getState().dismissBarksForActors(["enemy_dead"]);
  const survivingBarks = useFxStore.getState().barks;
  ok(
    survivingBarks.every((bark) => bark.actorId !== "enemy_dead") &&
      survivingBarks.some((bark) => bark.actorId === "enemy_alive") &&
      survivingBarks.some((bark) => !bark.actorId),
    "dead speakers lose current and delayed barks without clearing living or world text",
  );
  useFxStore.setState({ barks: [] });
}

console.log("engine-core: status-effect runtime");
{
  // Apply poison (value 3 → -3 hp/turn for 3 turns) and a stun.
  let statuses = applyStatus(undefined, "poison", { magnitude: 3 });
  statuses = applyStatus(statuses, "stun");
  ok(statuses.length === 2, "applyStatus adds distinct statuses");

  const mods = statModifiers(applyStatus(applyStatus(undefined, "weaken"), "guard"));
  ok(mods.attack === -2 && mods.defense === 2, "statModifiers sums flat buffs/debuffs");

  const tick1 = tickStatuses(statuses);
  ok(tick1.hpDelta === -3, "tick applies periodic poison damage");
  ok(tick1.skipTurn === true, "tick reports stun skipTurn");
  ok(
    tick1.instances.find((s) => s.id === "poison")?.remaining === 2 && !tick1.instances.find((s) => s.id === "stun"),
    "tick decrements duration and expires the 1-turn stun",
  );

  // Refresh keeps the longer duration.
  const refreshed = applyStatus([{ id: "poison", remaining: 1, magnitude: 2 }], "poison", { duration: 3, magnitude: 4 });
  ok(refreshed[0].remaining === 3 && refreshed[0].magnitude === 4, "applyStatus refresh keeps stronger/longer values");

  // Regen heals.
  const regenTick = tickStatuses(applyStatus(undefined, "regen", { magnitude: 5 }));
  ok(regenTick.hpDelta === 5, "regen ticks positive hp");
}

if (failures > 0) {
  console.error(`\nengine-core: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nengine-core: all checks passed");
}
