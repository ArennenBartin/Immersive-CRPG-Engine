// Focused acceptance checks for the authoritative Phase 2–3 perception
// contract. Run with: npm run test:perception

import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  FINE_PER_MACRO,
  advanceImmersivePerceptionForSave,
  createImmersiveIlluminationSnapshotFromV1,
  createImmersiveViewerVisibilityFromV1,
  dispatchV1EmitSound,
  dispatchV1UpdateCombatSession,
  expandGamePackageToFine,
  fineCenterOfMacro,
  queryImmersiveIlluminationAtCell,
  queryImmersiveVisualAcquisition,
  resolveImmersiveLightSources,
} from "../src/engine-core";
import type { PlaySave } from "../src/schema/save";
import { entityPlacementStateKey } from "../src/utils/entityState";
import {
  classifyFogRenderStateForCells,
  fogCellKey,
} from "../src/utils/fogOfWar";
import {
  STRUCTURE_EMISSIVE_FILL_MAX,
  STRUCTURE_EMISSIVE_FILL_MIN,
  resolveStructureEmissiveFillStrength,
  resolveStructureFootprintIllumination,
} from "../src/utils/lightRendering";
import { fineCellsCoveredByWorldMacroCell } from "../src/utils/renderSpace";

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

const gamePackage = createQaSuitePackage();
const map = gamePackage.maps.find((candidate) => candidate.id === "qa_perception_lab");
if (!map) throw new Error("QA package is missing qa_perception_lab");
const portableLampPlacement = map.item_placements.find(
  (placement) => placement.item_id === "qa_portable_lamp",
);
if (!portableLampPlacement) throw new Error("QA perception lab is missing its portable lamp");
const portableLampDefinition = gamePackage.items.find(
  (item) => item.id === portableLampPlacement.item_id,
);
if (!portableLampDefinition) throw new Error("QA package is missing its portable lamp definition");

const sameCell = (left: readonly number[], right: readonly number[]) =>
  left[0] === right[0] && left[1] === right[1];

const includesCell = (cells: [number, number][], target: [number, number]) =>
  cells.some((cell) => sameCell(cell, target));

const makeSave = (
  playerCell: [number, number],
  overrides: Partial<PlaySave> = {},
): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: map.id,
  player: { cell: [...playerCell], facing: [0, -1] },
  playerStats: {
    hp: 20,
    max_hp: 20,
    mp: 0,
    max_mp: 0,
    attack: 3,
    defense: 1,
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
  map_deltas: {},
  clock_minutes: 1,
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  ...overrides,
});

console.log("perception contract: authored acceptance chamber");
{
  const profiles = [
    "qa_sight_watcher",
    "qa_sound_hunter",
    "qa_light_glass_watcher",
  ].map((entityId) => gamePackage.entities.find((entity) => entity.id === entityId)?.sensory_profile);

  check("acceptance chamber has zero ambient light", map.ambient_light === 0);
  check(
    "acceptance chamber defines three distinct sensory profiles",
    profiles.every((profile) => Boolean(profile?.channels.length)) &&
      new Set(profiles.map((profile) => profile?.id)).size === 3,
  );
  check(
    "profiles separate illuminated sight, hearing, and Glass/light sensitivity",
    profiles[0]?.channels.some(
      (channel) =>
        channel.stimulus_kinds.includes("visible_player") &&
        channel.requires_los &&
        channel.requires_illumination,
    ) === true &&
      profiles[1]?.channels.some(
        (channel) => channel.stimulus_kinds.includes("sound") && !channel.requires_illumination,
      ) === true &&
      profiles[2]?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("light") &&
          channel.stimulus_tags?.includes("glass"),
      ) === true,
  );
}

console.log("perception contract: authoritative illumination");
{
  const wallFootprint = fineCellsCoveredByWorldMacroCell(-1, -2);
  const wallSamples = new Map(
    wallFootprint.map((cell, index) => [
      fogCellKey(cell[0], cell[1]),
      index < 6 ? 0 : [0.3494, 0.3522, 0.3542][index - 6],
    ]),
  );
  const wallIllumination = resolveStructureFootprintIllumination(
    wallFootprint,
    (cell) => wallSamples.get(fogCellKey(cell[0], cell[1])),
    0,
  );
  check(
    "a macro wall uses the strongest illuminated fine edge instead of its dark center",
    wallFootprint.length === FINE_PER_MACRO * FINE_PER_MACRO &&
      wallIllumination === 0.3542,
    `resolved=${wallIllumination}`,
  );
  check(
    "structure illumination falls back to clamped ambient for absent fine samples",
    resolveStructureFootprintIllumination(
      wallFootprint,
      () => undefined,
      0.17,
    ) === 0.17 &&
      resolveStructureFootprintIllumination([], () => 1, 2) === 1,
  );
  const lowFill = resolveStructureEmissiveFillStrength(0.0001);
  const wallFill = resolveStructureEmissiveFillStrength(wallIllumination);
  const brightFill = resolveStructureEmissiveFillStrength(1);
  check(
    "structure emissive fill is absent in darkness, perceptible in light, monotonic, and clamped",
    resolveStructureEmissiveFillStrength(0) === 0 &&
      resolveStructureEmissiveFillStrength(-1) === 0 &&
      lowFill >= STRUCTURE_EMISSIVE_FILL_MIN &&
      lowFill < wallFill &&
      wallFill < brightFill &&
      brightFill === STRUCTURE_EMISSIVE_FILL_MAX &&
      resolveStructureEmissiveFillStrength(2) === STRUCTURE_EMISSIVE_FILL_MAX,
  );

  const baseSave = makeSave([0, 8]);
  const snapshot = createImmersiveIlluminationSnapshotFromV1(
    gamePackage,
    baseSave,
    map.id,
  );
  const darkArtifactCell: [number, number] = [7, -7];
  const darkArtifactLight = queryImmersiveIlluminationAtCell(snapshot, darkArtifactCell);
  const darkArtifactAcquisition = queryImmersiveVisualAcquisition(gamePackage, baseSave, {
    map_id: map.id,
    observer_cell: [7, -5],
    target_cell: darkArtifactCell,
    max_range: 10,
  });
  check(
    "zero ambient leaves the dark control cell mechanically unlit",
    snapshot.ambient_light === 0 &&
      darkArtifactLight.value === 0 &&
      darkArtifactLight.source_ids.length === 0,
  );
  check(
    "an unlit target is not acquired even through clear nearby LOS",
    darkArtifactAcquisition.line_of_sight &&
      darkArtifactAcquisition.illumination === 0 &&
      !darkArtifactAcquisition.acquired,
  );

  const carriedAtStart = makeSave([0, -4], {
    inventory: [{ id: "qa_portable_lamp", count: 1 }],
    map_deltas: {
      [map.id]: { taken_items: [portableLampPlacement.id] },
    },
  });
  const startSource = resolveImmersiveLightSources(gamePackage, carriedAtStart, map.id)
    .find((source) => source.source_kind === "carried_item");
  const fineGamePackage = expandGamePackageToFine(gamePackage);
  const finePlayerCell = fineCenterOfMacro(carriedAtStart.player.cell);
  const fineCarriedAtStart: PlaySave = {
    ...carriedAtStart,
    player: { ...carriedAtStart.player, cell: [finePlayerCell[0], finePlayerCell[1]] },
  };
  const fineStartSource = resolveImmersiveLightSources(
    fineGamePackage,
    fineCarriedAtStart,
    map.id,
  ).find((source) => source.source_kind === "carried_item");
  check(
    "the QA lamp authors a literal 14-tile radius and resolves to 42 fine cells",
    portableLampDefinition.light_source?.radius === 14 &&
      startSource?.radius === 14 &&
      fineStartSource?.radius === 14 * FINE_PER_MACRO,
    `authored=${portableLampDefinition.light_source?.radius}, macro=${startSource?.radius}, fine=${fineStartSource?.radius}`,
  );
  const movedSave: PlaySave = {
    ...carriedAtStart,
    player: { ...carriedAtStart.player, cell: [3, -4] },
  };
  const movedSource = resolveImmersiveLightSources(gamePackage, movedSave, map.id)
    .find((source) => source.source_kind === "carried_item");
  check(
    "a carried light source follows the player authoritatively",
    Boolean(startSource) &&
      sameCell(startSource!.cell, [0, -4]) &&
      startSource?.carrier_actor_id === "player" &&
      startSource.exposes_carrier &&
      Boolean(movedSource) &&
      sameCell(movedSource!.cell, [3, -4]),
  );

  const droppedCell: [number, number] = [-7, 4];
  const droppedId = "drop_1_qa_portable_lamp_-7_4_0";
  const droppedSave = makeSave([0, 8], {
    map_deltas: {
      [map.id]: {
        taken_items: [portableLampPlacement.id],
        dropped_items: [
          {
            id: droppedId,
            item_id: "qa_portable_lamp",
            cell: droppedCell,
            count: 1,
          },
        ],
      },
    },
    clock_minutes: 2,
  });
  const roundTrippedDrop = JSON.parse(JSON.stringify(droppedSave)) as PlaySave;
  const droppedSources = resolveImmersiveLightSources(
    gamePackage,
    roundTrippedDrop,
    map.id,
  );
  const droppedSource = droppedSources.find(
    (source) => source.source_kind === "dropped_item" && source.id.includes(droppedId),
  );
  const droppedLight = queryImmersiveIlluminationAtCell(
    createImmersiveIlluminationSnapshotFromV1(gamePackage, roundTrippedDrop, map.id),
    droppedCell,
  );
  check(
    "a placed/dropped light keeps its world location through JSON save roundtrip",
    Boolean(droppedSource) &&
      sameCell(droppedSource!.cell, droppedCell) &&
      droppedSource?.persistent === true &&
      droppedLight.value > 0 &&
      droppedLight.source_ids.includes(droppedSource!.id),
  );
}

console.log("perception contract: reciprocal sight, occlusion, and fog layers");
{
  const carriedSave = makeSave([0, -4], {
    inventory: [{ id: "qa_portable_lamp", count: 1 }],
    map_deltas: {
      [map.id]: { taken_items: [portableLampPlacement.id] },
    },
  });
  const exposed = queryImmersiveVisualAcquisition(gamePackage, carriedSave, {
    map_id: map.id,
    observer_cell: [0, -5],
    target_cell: carriedSave.player.cell,
    target_actor_id: "player",
    max_range: 13,
  });
  const extinguishedSave: PlaySave = {
    ...carriedSave,
    flags: {
      immersive_light_states: { "item:qa_portable_lamp": false },
    },
  };
  const afterExtinguish = queryImmersiveVisualAcquisition(gamePackage, extinguishedSave, {
    map_id: map.id,
    observer_cell: [0, -5],
    target_cell: extinguishedSave.player.cell,
    target_actor_id: "player",
    max_range: 13,
  });
  check(
    "carrying an active light exposes the player with an explicit cause",
    exposed.acquired &&
      exposed.cause === "carried_light_exposure" &&
      exposed.exposing_source_ids.length === 1,
  );
  check(
    "extinguishing the light removes its source and breaks visual contact",
    resolveImmersiveLightSources(gamePackage, extinguishedSave, map.id)
      .every((source) => source.definition_key !== "item:qa_portable_lamp") &&
      !afterExtinguish.acquired &&
      afterExtinguish.illumination === 0,
  );

  const wallTargetSave = makeSave([3, -1], {
    inventory: [{ id: "qa_portable_lamp", count: 1 }],
    map_deltas: {
      [map.id]: { taken_items: [portableLampPlacement.id] },
    },
  });
  const wallBlocked = queryImmersiveVisualAcquisition(gamePackage, wallTargetSave, {
    map_id: map.id,
    observer_cell: [3, -4],
    target_cell: wallTargetSave.player.cell,
    target_actor_id: "player",
    max_range: 20,
  });
  check(
    "an illuminated target behind the authored shutter wall is not acquired",
    wallBlocked.illumination > 0 &&
      !wallBlocked.line_of_sight &&
      !wallBlocked.acquired,
  );

  const smokeTargetSave: PlaySave = {
    ...wallTargetSave,
    player: { ...wallTargetSave.player, cell: [2, -1] },
  };
  const smokeBlocked = queryImmersiveVisualAcquisition(gamePackage, smokeTargetSave, {
    map_id: map.id,
    observer_cell: [2, 3],
    target_cell: smokeTargetSave.player.cell,
    target_actor_id: "player",
    max_range: 20,
  });
  check(
    "the authored smoke lane prevents acquisition of an illuminated target",
    smokeBlocked.illumination > 0 &&
      smokeBlocked.smoke_transmission <= 0.1 &&
      !smokeBlocked.acquired,
  );

  const remoteLampCell: [number, number] = [7, 2];
  const discoveredOnlyCell: [number, number] = [9, -9];
  const sensedOnlyCell: [number, number] = [8, -8];
  const viewerSave = makeSave([0, 8], {
    explored_cells: { [map.id]: ["9:-9"] },
  });
  const visibility = createImmersiveViewerVisibilityFromV1(
    gamePackage,
    viewerSave,
    map.id,
    {
      viewer_cell: [0, -5],
      max_range: 20,
      sensed_cells: [sensedOnlyCell],
    },
  );
  check(
    "remote illumination does not reveal an occluded cell to the viewer",
    includesCell(visibility.illuminated, remoteLampCell) &&
      !includesCell(visibility.currently_visible, remoteLampCell),
  );
  check(
    "discovered, currently visible, illuminated, and sensed remain distinct layers",
    includesCell(visibility.discovered, discoveredOnlyCell) &&
      !includesCell(visibility.currently_visible, discoveredOnlyCell) &&
      !includesCell(visibility.illuminated, discoveredOnlyCell) &&
      includesCell(visibility.sensed, sensedOnlyCell) &&
      !includesCell(visibility.currently_visible, sensedOnlyCell),
  );

  const terrainViewerCell: [number, number] = [7, 4];
  const terrainViewerSave = makeSave(terrainViewerCell);
  const terrainVisibility = createImmersiveViewerVisibilityFromV1(
    gamePackage,
    terrainViewerSave,
    map.id,
    { viewer_cell: terrainViewerCell, max_range: 8 },
  );
  const lowScoreLitWall: [number, number] = [4, -3];
  const occludedLitWall: [number, number] = [10, -3];
  const lowScoreWallAcquisition = queryImmersiveVisualAcquisition(
    gamePackage,
    terrainViewerSave,
    {
      map_id: map.id,
      observer_cell: terrainViewerCell,
      target_cell: lowScoreLitWall,
      max_range: 8,
    },
  );
  const occludedWallAcquisition = queryImmersiveVisualAcquisition(
    gamePackage,
    terrainViewerSave,
    {
      map_id: map.id,
      observer_cell: terrainViewerCell,
      target_cell: occludedLitWall,
      max_range: 8,
    },
  );
  check(
    "a lit LOS wall remains terrain-visible below the actor acquisition score floor",
    map.cells.some(
      (cell) =>
        cell.x === lowScoreLitWall[0] &&
        cell.z === lowScoreLitWall[1] &&
        cell.blocks_los,
    ) &&
      lowScoreWallAcquisition.line_of_sight &&
      lowScoreWallAcquisition.illumination >= terrainVisibility.minimum_light &&
      lowScoreWallAcquisition.smoke_transmission > 0.1 &&
      lowScoreWallAcquisition.score < 0.04 &&
      !lowScoreWallAcquisition.acquired &&
      includesCell(terrainVisibility.terrain_visible, lowScoreLitWall) &&
      !includesCell(terrainVisibility.currently_visible, lowScoreLitWall) &&
      includesCell(terrainVisibility.discovered, lowScoreLitWall),
  );
  check(
    "a genuinely occluded lit wall is not terrain-visible",
    map.cells.some(
      (cell) =>
        cell.x === occludedLitWall[0] &&
        cell.z === occludedLitWall[1] &&
        cell.blocks_los,
    ) &&
      occludedWallAcquisition.illumination >= terrainVisibility.minimum_light &&
      !occludedWallAcquisition.line_of_sight &&
      !occludedWallAcquisition.acquired &&
      !includesCell(terrainVisibility.terrain_visible, occludedLitWall) &&
      !includesCell(terrainVisibility.currently_visible, occludedLitWall),
  );

  const finePackage = expandGamePackageToFine(gamePackage);
  const fineViewerCell = fineCenterOfMacro([0, 3]);
  const fineBoundarySave = makeSave(
    [fineViewerCell[0], fineViewerCell[1]],
    {
      inventory: [{ id: "qa_portable_lamp", count: 1 }],
      map_deltas: {
        [map.id]: { taken_items: [portableLampPlacement.id] },
      },
    },
  );
  const fineBoundaryVisibility = createImmersiveViewerVisibilityFromV1(
    finePackage,
    fineBoundarySave,
    map.id,
  );
  const boundaryWallCells = fineCellsCoveredByWorldMacroCell(1, -2);
  const boundaryVisibleKeys = new Set(
    fineBoundaryVisibility.terrain_visible.map((cell) =>
      fogCellKey(cell[0], cell[1]),
    ),
  );
  const boundaryDiscoveredKeys = new Set(
    fineBoundaryVisibility.discovered.map((cell) =>
      fogCellKey(cell[0], cell[1]),
    ),
  );
  check(
    "a visible fine-grid wall edge retains its owning macro wall mesh",
    boundaryVisibleKeys.has(fogCellKey(3, -4)) &&
      classifyFogRenderStateForCells(
        boundaryWallCells,
        true,
        boundaryVisibleKeys,
        boundaryDiscoveredKeys,
      ) === "visible",
  );
}

console.log("perception contract: last-known evidence and finite search");
{
  const hearingPlacementIndex = map.entity_placements.findIndex(
    (placement) => placement.entity_id === "qa_sound_hunter",
  );
  const sightPlacementIndex = map.entity_placements.findIndex(
    (placement) => placement.entity_id === "qa_sight_watcher",
  );
  if (hearingPlacementIndex < 0 || sightPlacementIndex < 0) {
    throw new Error("QA perception lab is missing a memory/search observer");
  }
  const hearingActorKey = entityPlacementStateKey(
    map.id,
    map.entity_placements[hearingPlacementIndex],
    hearingPlacementIndex,
  );
  const sightActorKey = entityPlacementStateKey(
    map.id,
    map.entity_placements[sightPlacementIndex],
    sightPlacementIndex,
  );

  const soundCell: [number, number] = [-7, 2];
  const soundPulse = dispatchV1EmitSound({
    gamePackage,
    save: makeSave(soundCell),
    actorId: "player",
    cell: soundCell,
    loudness: 8,
    tag: "qa_thrown_distraction",
    materialTag: "metal",
  });
  if (!soundPulse.ok) throw new Error("QA sound stimulus dispatch failed");
  const heard = advanceImmersivePerceptionForSave(gamePackage, soundPulse.save, map.id);
  const heardState = heard.save.entity_states[hearingActorKey];
  const hearingTask = heard.save.map_deltas?.[map.id]?.npc_tasks?.find(
    (task) => task.actor_id === hearingActorKey && task.task_type === "investigate",
  );
  check(
    "hearing records the stimulus cell as non-live last-known evidence",
    heardState?.last_detection_cause === "heard" &&
      heardState?.last_stimulus?.kind === "sound" &&
      sameCell(heardState.last_stimulus.cell, soundCell) &&
      sameCell(heardState.last_known_position, soundCell) &&
      heardState.perception_tracks_live_target === false &&
      heardState.target_actor_id === undefined &&
      Boolean(hearingTask) &&
      sameCell(hearingTask!.target_cell, soundCell),
  );

  const hiddenFutureCell: [number, number] = [9, -9];
  const afterHiddenMove = advanceImmersivePerceptionForSave(
    gamePackage,
    {
      ...heard.save,
      player: { ...heard.save.player, cell: hiddenFutureCell },
    },
    map.id,
  );
  const afterHiddenMoveState = afterHiddenMove.save.entity_states[hearingActorKey];
  check(
    "hearing never updates memory to the hidden player's future position",
    sameCell(afterHiddenMoveState?.last_known_position, soundCell) &&
      sameCell(afterHiddenMoveState?.investigation_target_cell, soundCell) &&
      !sameCell(afterHiddenMoveState?.last_known_position, hiddenFutureCell) &&
      afterHiddenMoveState?.perception_tracks_live_target === false,
  );

  const sightContactCell: [number, number] = [0, -4];
  const sightContact = advanceImmersivePerceptionForSave(
    gamePackage,
    makeSave(sightContactCell, {
      inventory: [{ id: "qa_portable_lamp", count: 1 }],
      map_deltas: {
        [map.id]: { taken_items: [portableLampPlacement.id] },
      },
    }),
    map.id,
  );
  const sightContactState = sightContact.save.entity_states[sightActorKey];
  check(
    "direct sight explicitly tracks the live target while contact holds",
    sightContactState?.perception_tracks_live_target === true &&
      sightContactState?.target_actor_id === "player" &&
      sameCell(sightContactState?.last_known_position, sightContactCell),
  );

  const lostContact = advanceImmersivePerceptionForSave(
    gamePackage,
    {
      ...sightContact.save,
      player: { ...sightContact.save.player, cell: hiddenFutureCell },
      flags: {
        ...sightContact.save.flags,
        immersive_light_states: { "item:qa_portable_lamp": false },
      },
    },
    map.id,
  );
  const lostContactState = lostContact.save.entity_states[sightActorKey];
  const lostContactTask = lostContact.save.map_deltas?.[map.id]?.npc_tasks?.find(
    (task) =>
      task.actor_id === sightActorKey &&
      task.task_type === "investigate" &&
      task.state === "queued",
  );
  check(
    "loss of sight clears live tracking and searches the last-known cell",
    lostContactState?.perception_tracks_live_target === false &&
      lostContactState?.target_actor_id === undefined &&
      sameCell(lostContactState?.last_known_position, sightContactCell) &&
      !sameCell(lostContactState?.last_known_position, hiddenFutureCell) &&
      Boolean(lostContactTask) &&
      sameCell(lostContactTask!.target_cell, sightContactCell),
  );

  const sightProfile = gamePackage.entities.find(
    (entity) => entity.id === "qa_sight_watcher",
  )?.sensory_profile;
  const searchExpiresAt = Number(lostContactState?.perception_search_expires_at_tick);
  const afterSearchExpiry = advanceImmersivePerceptionForSave(
    gamePackage,
    {
      ...lostContact.save,
      clock_minutes: searchExpiresAt,
    },
    map.id,
  );
  const expiredState = afterSearchExpiry.save.entity_states[sightActorKey];
  const expiredTask = afterSearchExpiry.save.map_deltas?.[map.id]?.npc_tasks?.find(
    (task) => task.actor_id === sightActorKey && task.result === "search_expired",
  );
  check(
    "configured search expiry de-escalates to oblivious and ends investigation",
    Number.isFinite(searchExpiresAt) &&
      searchExpiresAt - Number(sightContactState?.last_evidence_tick) === sightProfile?.search_ticks &&
      expiredState?.alertness === "oblivious" &&
      expiredState?.alert_score === 0 &&
      expiredState?.investigation_target_cell === undefined &&
      expiredState?.perception_tracks_live_target === false &&
      expiredTask?.state === "failed" &&
      afterSearchExpiry.world_facts.some(
        (fact) => fact.actor_id === sightActorKey && fact.action_type === "immersive_perception_gave_up",
      ),
  );
}

console.log("perception contract: combat requires detection");
{
  const placementIndex = map.entity_placements.findIndex(
    (placement) => placement.entity_id === "qa_sight_watcher",
  );
  if (placementIndex < 0) throw new Error("QA perception lab is missing the sight watcher");
  const placement = map.entity_placements[placementIndex];
  const actorKey = entityPlacementStateKey(map.id, placement, placementIndex);
  const adjacentSave = makeSave([0, -4]);
  const undetected = dispatchV1UpdateCombatSession({
    gamePackage,
    save: adjacentSave,
    threatRadius: 10,
    chaseRadius: 10,
    requireAlert: true,
  });
  check(
    "proximity alone cannot start alert-gated combat",
    undetected.ok && undetected.save.in_combat !== true,
  );

  const detected = dispatchV1UpdateCombatSession({
    gamePackage,
    save: {
      ...adjacentSave,
      entity_states: {
        [actorKey]: {
          alertness: "combat",
          alert_score: 1,
          investigation_target_cell: [...adjacentSave.player.cell],
        },
      },
    },
    threatRadius: 10,
    chaseRadius: 10,
    requireAlert: true,
  });
  check(
    "a combat-level detection record starts alert-gated combat",
    detected.ok &&
      detected.save.in_combat === true &&
      detected.events.some((event) => event.type === "combat_started"),
  );
}

console.log(`perception contract: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
