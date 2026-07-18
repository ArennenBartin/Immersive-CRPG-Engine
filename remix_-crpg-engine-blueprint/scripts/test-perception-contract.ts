// Focused acceptance checks for the authoritative Phase 2–3 perception
// contract. Run with: npm run test:perception

import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  FINE_PER_MACRO,
  advanceImmersivePerceptionForSave,
  createImmersiveIlluminationSnapshotFromV1,
  createSimulationSnapshotFromV1,
  createImmersiveViewerVisibilityFromV1,
  dispatchV1EmitSound,
  dispatchV1PushObject,
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
  buildAuthoritativeFogPresentationPlan,
  classifyFogRenderStateForCells,
  fogCellKey,
  resolveFogCurtainProfile,
} from "../src/utils/fogOfWar";
import {
  AUTHORITATIVE_GROUND_LIGHT_VISUAL_FLOOR,
  STRUCTURE_EMISSIVE_FILL_MAX,
  STRUCTURE_EMISSIVE_FILL_MIN,
  resolveAuthoritativeGroundLightPresentationStrength,
  hasAuthoritativePresentLight,
  resolveStaticFogMaterialPolicy,
  resolveStructureEmissiveFillStrength,
  resolveStructureFootprintIllumination,
} from "../src/utils/lightRendering";
import { applyPlacementDeltas } from "../src/utils/objectFootprint";
import {
  fineCellsCoveredByWorldMacroCell,
  logicalCellToWorld,
  worldPointToWorldMacroCell,
} from "../src/utils/renderSpace";

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
  check(
    "dominant profiles retain weaker baseline senses while preserving their specialty",
    (profiles[0]?.channels.find((channel) => channel.id === "illuminated_sight")
      ?.view_cone_degrees || 0) >= 140 &&
      profiles[0]?.channels.some((channel) => channel.stimulus_kinds.includes("sound")) === true &&
      profiles[1]?.channels.some((channel) => channel.stimulus_kinds.includes("visible_player")) === true &&
      profiles[2]?.channels.some((channel) => channel.stimulus_kinds.includes("sound")) === true,
  );
  check(
    "Glass sensitivity explicitly locks a carried source only after acquisition",
    profiles[2]?.channels.some(
      (channel) =>
        channel.stimulus_kinds.includes("light") &&
        channel.requires_los &&
        channel.tracks_live_target &&
        channel.source_tracking === "lock_after_acquisition",
    ) === true,
  );
}

console.log("perception contract: authoritative illumination");
{
  const presentationSamples = [0, 0.06, 0.18, 0.36, 0.54, 0.72, 0.9, 1].map(
    resolveAuthoritativeGroundLightPresentationStrength,
  );
  check(
    "ground-light presentation preserves the source while dissolving its weak tail into fog",
    AUTHORITATIVE_GROUND_LIGHT_VISUAL_FLOOR === 0.06 &&
      presentationSamples[0] === 0 &&
      presentationSamples[1] === 0 &&
      presentationSamples[2] < 0.01 &&
      presentationSamples[3] < 0.1 &&
      presentationSamples[5] > 0.55 &&
      presentationSamples[6] > 0.9 &&
      presentationSamples[7] === 1 &&
      presentationSamples.every(
        (value, index) => index === 0 || value >= presentationSamples[index - 1],
      ),
    `samples=${presentationSamples.map((value) => value.toFixed(3)).join(",")}`,
  );
  check(
    "barely perceptible light retains the memory backdrop without changing Senses",
    !hasAuthoritativePresentLight(0.08) &&
      !hasAuthoritativePresentLight(0.2) &&
      !hasAuthoritativePresentLight(0.3) &&
      hasAuthoritativePresentLight(0.36),
  );
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

  const smokeLightOrigin: [number, number] = [0, 1];
  const smokeLightTarget: [number, number] = [4, 1];
  const smokeLightSave = makeSave(smokeLightOrigin, {
    inventory: [{ id: "qa_portable_lamp", count: 1 }],
    map_deltas: {
      [map.id]: { taken_items: [portableLampPlacement.id] },
    },
  });
  const smokeLightSnapshot = createImmersiveIlluminationSnapshotFromV1(
    gamePackage,
    smokeLightSave,
    map.id,
  );
  const smokeLightAtTarget = queryImmersiveIlluminationAtCell(
    smokeLightSnapshot,
    smokeLightTarget,
  );
  const smokeLightContribution = smokeLightAtTarget.contributions.find(
    (entry) => entry.source_id.includes("light:carried:player"),
  );
  const smokeLightAcquisition = queryImmersiveVisualAcquisition(
    gamePackage,
    smokeLightSave,
    {
      map_id: map.id,
      observer_cell: smokeLightOrigin,
      target_cell: smokeLightTarget,
      max_range: 20,
    },
  );
  const smokeLightVisibility = createImmersiveViewerVisibilityFromV1(
    gamePackage,
    smokeLightSave,
    map.id,
    { viewer_cell: smokeLightOrigin, max_range: 20 },
  );
  const authoredSmokeCells = map.cells.filter(
    (cell) =>
      cell.x >= 1 &&
      cell.x <= 3 &&
      cell.z >= 0 &&
      cell.z <= 2 &&
      cell.tag === "smoke_obscurance",
  );
  check(
    "walkable smoke hides actors without becoming a black illumination wall",
    authoredSmokeCells.length === 9 &&
      authoredSmokeCells.every((cell) => cell.walkable && !cell.blocks_los) &&
      smokeLightAcquisition.line_of_sight &&
      smokeLightAcquisition.smoke_transmission <= 0.1 &&
      !smokeLightAcquisition.acquired &&
      Boolean(smokeLightContribution) &&
      smokeLightContribution!.transmission >= 0.45 &&
      smokeLightAtTarget.value >= smokeLightVisibility.minimum_light &&
      includesCell(smokeLightVisibility.terrain_visible, smokeLightTarget) &&
      !includesCell(smokeLightVisibility.currently_visible, smokeLightTarget),
    `sight=${smokeLightAcquisition.smoke_transmission} light=${smokeLightContribution?.transmission} illumination=${smokeLightAtTarget.value}`,
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
    { viewer_cell: terrainViewerCell, max_range: 12 },
  );
  const lowScoreLitWall: [number, number] = [1, -2];
  const occludedLitWall: [number, number] = [10, -3];
  const lowScoreWallAcquisition = queryImmersiveVisualAcquisition(
    gamePackage,
    terrainViewerSave,
    {
      map_id: map.id,
      observer_cell: terrainViewerCell,
      target_cell: lowScoreLitWall,
      max_range: 12,
    },
  );
  const occludedWallAcquisition = queryImmersiveVisualAcquisition(
    gamePackage,
    terrainViewerSave,
    {
      map_id: map.id,
      observer_cell: terrainViewerCell,
      target_cell: occludedLitWall,
      max_range: 12,
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
  const fineSpawnCell = fineCenterOfMacro([0, 8]);
  const fineOpenFloorTarget = fineCenterOfMacro([4, 8]);
  const fineTerminalSave = makeSave(
    [fineSpawnCell[0], fineSpawnCell[1]],
    {
      inventory: [{ id: "qa_portable_lamp", count: 1 }],
      map_deltas: {
        [map.id]: { taken_items: [portableLampPlacement.id] },
      },
    },
  );
  const fineTerminalSimulation = createSimulationSnapshotFromV1(
    finePackage,
    fineTerminalSave,
    map.id,
  );
  const terminalOccupants = fineTerminalSimulation.cells.flatMap((cell) =>
    cell.occupants
      .filter((occupant) => occupant.label === "Info Terminal")
      .map((occupant) => ({ cell: cell.cell, occupant })),
  );
  const openFloorAcquisition = queryImmersiveVisualAcquisition(
    finePackage,
    fineTerminalSave,
    {
      map_id: map.id,
      observer_cell: [fineSpawnCell[0], fineSpawnCell[1]],
      target_cell: [fineOpenFloorTarget[0], fineOpenFloorTarget[1]],
      max_range: 10 * FINE_PER_MACRO,
    },
  );
  const fineTerminalVisibility = createImmersiveViewerVisibilityFromV1(
    finePackage,
    fineTerminalSave,
    map.id,
  );
  const fineTargetCell = fineTerminalSimulation.cells.find(
    (cell) => sameCell(cell.cell, fineOpenFloorTarget),
  );
  check(
    "solid props block movement without becoming phantom LOS walls",
    terminalOccupants.length === FINE_PER_MACRO * FINE_PER_MACRO &&
      terminalOccupants.every(({ occupant }) =>
        occupant.blocks_movement && !occupant.blocks_los,
      ) &&
      Boolean(fineTargetCell?.active) &&
      Boolean(fineTargetCell?.walkable) &&
      !fineTargetCell?.blocks_los &&
      openFloorAcquisition.line_of_sight &&
      openFloorAcquisition.illumination >=
        fineTerminalVisibility.minimum_light &&
      includesCell(
        fineTerminalVisibility.terrain_visible,
        [fineOpenFloorTarget[0], fineOpenFloorTarget[1]],
      ),
    `los=${openFloorAcquisition.line_of_sight} light=${openFloorAcquisition.illumination}`,
  );

  const fineSmokeObserver = fineCenterOfMacro([2, 3]);
  const fineSmokeTarget = fineCenterOfMacro([2, -1]);
  const fineSmokeSave = makeSave(
    [fineSmokeTarget[0], fineSmokeTarget[1]],
  );
  const fineSmokeAcquisition = queryImmersiveVisualAcquisition(
    finePackage,
    fineSmokeSave,
    {
      map_id: map.id,
      observer_cell: [fineSmokeObserver[0], fineSmokeObserver[1]],
      target_cell: [fineSmokeTarget[0], fineSmokeTarget[1]],
      max_range: 20 * FINE_PER_MACRO,
    },
  );
  const fineSmokeLightOrigin = fineCenterOfMacro(smokeLightOrigin);
  const fineSmokeLightTarget = fineCenterOfMacro(smokeLightTarget);
  const fineSmokeLightSave = makeSave(
    [fineSmokeLightOrigin[0], fineSmokeLightOrigin[1]],
    {
    inventory: [{ id: "qa_portable_lamp", count: 1 }],
    map_deltas: {
      [map.id]: { taken_items: [portableLampPlacement.id] },
    },
    },
  );
  const fineSmokeLightAtTarget = queryImmersiveIlluminationAtCell(
    createImmersiveIlluminationSnapshotFromV1(
      finePackage,
      fineSmokeLightSave,
      map.id,
    ),
    [fineSmokeLightTarget[0], fineSmokeLightTarget[1]],
  );
  const fineSmokeLightContribution = fineSmokeLightAtTarget.contributions.find(
    (entry) => entry.source_id.includes("light:carried:player"),
  );
  check(
    "fine-grid expansion preserves separate sight and light smoke optical depths",
    smokeBlocked.line_of_sight &&
      fineSmokeAcquisition.line_of_sight &&
      Math.abs(
        smokeBlocked.smoke_transmission -
          fineSmokeAcquisition.smoke_transmission,
      ) < 0.0001 &&
      Boolean(smokeLightContribution) &&
      Boolean(fineSmokeLightContribution) &&
      Math.abs(
        smokeLightContribution!.transmission -
          fineSmokeLightContribution!.transmission,
      ) < 0.0001,
    `sight macro=${smokeBlocked.smoke_transmission} fine=${fineSmokeAcquisition.smoke_transmission}; light macro=${smokeLightContribution?.transmission} fine=${fineSmokeLightContribution?.transmission}`,
  );

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
  const finePerceptionMap = finePackage.maps.find(
    (candidate) => candidate.id === map.id,
  );
  if (!finePerceptionMap) {
    throw new Error("Fine QA package is missing qa_perception_lab");
  }
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
  const fogPresentationPlan = buildAuthoritativeFogPresentationPlan({
    cells: finePerceptionMap.cells,
    gridSpace: "fine",
    fineRatio: FINE_PER_MACRO,
    fogEnabled: true,
    terrainVisible: boundaryVisibleKeys,
    discovered: boundaryDiscoveredKeys,
  });
  const boundaryWallPresentation = fogPresentationPlan.find(
    (cell) => cell.world_cell[0] === 1 && cell.world_cell[1] === -2,
  );
  const plannedFineKeys = fogPresentationPlan.flatMap((cell) =>
    cell.fine_cells.map((fineCell) => fogCellKey(fineCell[0], fineCell[1])),
  );
  const runtimeFineKeys = new Set(
    finePerceptionMap.cells.map((cell) => fogCellKey(cell.x, cell.z)),
  );
  check(
    "geometry and overlay share one complete macro fog presentation plan",
    fogPresentationPlan.length === map.cells.length &&
      plannedFineKeys.length === runtimeFineKeys.size &&
      new Set(plannedFineKeys).size === runtimeFineKeys.size &&
      plannedFineKeys.every((key) => runtimeFineKeys.has(key)) &&
      // A single visible edge retains and promotes the whole authored wall
      // mesh, matching the Phase 2–3 macro presentation contract.
      boundaryWallPresentation?.state === "visible" &&
      boundaryWallPresentation.fine_cells.length ===
        FINE_PER_MACRO * FINE_PER_MACRO,
    `plan=${fogPresentationPlan.length} wall=${boundaryWallPresentation?.state}`,
  );

  const visibleMaterial = resolveStaticFogMaterialPolicy("visible");
  const exploredMaterial = resolveStaticFogMaterialPolicy("explored");
  const unseenMaterial = resolveStaticFogMaterialPolicy("unseen");
  check(
    "static fog materials preserve lit color, retain dark memory, and black out unseen geometry",
    visibleMaterial.brightness === 1 &&
      visibleMaterial.preserveEmission &&
      exploredMaterial.brightness > 0 &&
      exploredMaterial.brightness < 0.2 &&
      !exploredMaterial.preserveEmission &&
      unseenMaterial.brightness === 0 &&
      !unseenMaterial.preserveEmission,
  );
  const openUnseenCurtain = resolveFogCurtainProfile("unseen", false);
  const wallUnseenCurtain = resolveFogCurtainProfile("unseen", true);
  const openExploredCurtain = resolveFogCurtainProfile("explored", false);
  const wallExploredCurtain = resolveFogCurtainProfile("explored", true);
  check(
    "open-floor fog uses a low mist skirt while real blocker edges retain full curtains",
    !openUnseenCurtain.full_height &&
      !openExploredCurtain.full_height &&
      openUnseenCurtain.height <= 0.5 &&
      openExploredCurtain.height <= 0.5 &&
      wallUnseenCurtain.full_height &&
      wallExploredCurtain.full_height &&
      wallUnseenCurtain.height > openUnseenCurtain.height * 4 &&
      wallExploredCurtain.height > openExploredCurtain.height * 4 &&
      wallUnseenCurtain.opacity > openUnseenCurtain.opacity &&
      wallExploredCurtain.opacity > openExploredCurtain.opacity,
  );
}

console.log("perception contract: angular sight and carried-source tracing");
{
  const sightPlacementIndex = map.entity_placements.findIndex(
    (placement) => placement.entity_id === "qa_sight_watcher",
  );
  const glassPlacementIndex = map.entity_placements.findIndex(
    (placement) => placement.entity_id === "qa_light_glass_watcher",
  );
  if (sightPlacementIndex < 0 || glassPlacementIndex < 0) {
    throw new Error("QA perception lab is missing a sight/source observer");
  }
  const sightActorKey = entityPlacementStateKey(
    map.id,
    map.entity_placements[sightPlacementIndex],
    sightPlacementIndex,
  );
  const glassActorKey = entityPlacementStateKey(
    map.id,
    map.entity_placements[glassPlacementIndex],
    glassPlacementIndex,
  );
  const carriedLampSave = (cell: [number, number], overrides: Partial<PlaySave> = {}) =>
    makeSave(cell, {
      inventory: [{ id: "qa_portable_lamp", count: 1 }],
      map_deltas: {
        [map.id]: { taken_items: [portableLampPlacement.id] },
      },
      ...overrides,
    });

  const offAxisSight = advanceImmersivePerceptionForSave(
    gamePackage,
    carriedLampSave([3, -3]),
    map.id,
  ).snapshot.alerts.find((alert) => alert.actor_id === sightActorKey);
  const sideBlindSpot = advanceImmersivePerceptionForSave(
    gamePackage,
    carriedLampSave([3, -5]),
    map.id,
  ).snapshot.alerts.find((alert) => alert.actor_id === sightActorKey);
  const authoredLongRange = advanceImmersivePerceptionForSave(
    gamePackage,
    carriedLampSave([0, 4]),
    map.id,
  ).snapshot.alerts.find((alert) => alert.actor_id === sightActorKey);
  const directlyBehind = advanceImmersivePerceptionForSave(
    gamePackage,
    carriedLampSave([0, -8]),
    map.id,
  ).snapshot.alerts.find((alert) => alert.actor_id === sightActorKey);
  check(
    "sight uses an angular peripheral cone instead of a cardinal-only lane",
    offAxisSight?.stimulus.kind === "visible_player" &&
      offAxisSight.alertness === "combat" &&
      sideBlindSpot === undefined &&
      directlyBehind === undefined,
  );
  check(
    "visible-player sight honors the channel's authored range beyond eight cells",
    authoredLongRange?.stimulus.kind === "visible_player" &&
      authoredLongRange.alertness === "combat",
  );
  const narrowVectorPackage = {
    ...gamePackage,
    entities: gamePackage.entities.map((entity) =>
      entity.id === "qa_sight_watcher" && entity.sensory_profile
        ? {
            ...entity,
            sensory_profile: {
              ...entity.sensory_profile,
              channels: entity.sensory_profile.channels.map((channel) =>
                channel.id === "illuminated_sight"
                  ? { ...channel, view_cone_degrees: 10 }
                  : channel,
              ),
            },
          }
        : entity,
    ),
  } as typeof gamePackage;
  const authoredVectorSight = advanceImmersivePerceptionForSave(
    narrowVectorPackage,
    carriedLampSave([2, -4], {
      entity_states: { [sightActorKey]: { facing: [2, 1] } },
    }),
    map.id,
  ).snapshot.alerts.find((alert) => alert.actor_id === sightActorKey);
  check(
    "angular sight preserves authored non-cardinal facing vectors",
    authoredVectorSight?.stimulus.kind === "visible_player" &&
      authoredVectorSight.alertness === "combat",
  );

  const directGlassContact = advanceImmersivePerceptionForSave(
    gamePackage,
    carriedLampSave([6, -5]),
    map.id,
  );
  const directGlassState = directGlassContact.save.entity_states[glassActorKey];
  const directGlassAlert = directGlassContact.snapshot.alerts.find(
    (alert) => alert.actor_id === glassActorKey,
  );
  const serializedContact = JSON.parse(
    JSON.stringify(directGlassContact.save),
  ) as PlaySave;
  const tracedGlassContact = advanceImmersivePerceptionForSave(
    gamePackage,
    {
      ...serializedContact,
      player: { ...serializedContact.player, cell: [3, -5] },
    },
    map.id,
  );
  const tracedGlassState = tracedGlassContact.save.entity_states[glassActorKey];
  const tracedGlassAlert = tracedGlassContact.snapshot.alerts.find(
    (alert) => alert.actor_id === glassActorKey,
  );
  const freshOccludedContact = advanceImmersivePerceptionForSave(
    gamePackage,
    carriedLampSave([3, -5]),
    map.id,
  ).snapshot.alerts.find((alert) => alert.actor_id === glassActorKey);
  check(
    "direct Glass contact records the exact carried source and carrier",
    directGlassAlert?.cause === "glass_sensitivity" &&
      directGlassAlert.source_traced === false &&
      directGlassState?.perception_tracked_source_id ===
        directGlassAlert.stimulus.source_id &&
      directGlassState?.target_actor_id === "player" &&
      directGlassState?.alertness === "searching",
  );
  check(
    "a serialized source lock traces that same carried source behind LOS without granting combat",
    tracedGlassAlert?.cause === "glass_sensitivity" &&
      tracedGlassAlert.source_traced === true &&
      tracedGlassAlert.alertness === "searching" &&
      sameCell(tracedGlassAlert.target_cell, [3, -5]) &&
      tracedGlassState?.perception_tracked_source_id ===
        directGlassState?.perception_tracked_source_id &&
      tracedGlassState?.target_actor_id === "player",
  );
  check(
    "an occluded Glass source cannot be acquired through a wall without a prior lock",
    freshOccludedContact === undefined,
  );

  const concealedCarrierPackage = {
    ...gamePackage,
    items: gamePackage.items.map((item) =>
      item.id === "qa_portable_lamp" && item.light_source
        ? {
            ...item,
            light_source: { ...item.light_source, exposes_carrier: false },
          }
        : item,
    ),
  } as typeof gamePackage;
  const concealedCarrierContact = advanceImmersivePerceptionForSave(
    concealedCarrierPackage,
    carriedLampSave([6, -5]),
    map.id,
  );
  const concealedCarrierAlert = concealedCarrierContact.snapshot.alerts.find(
    (alert) => alert.actor_id === glassActorKey,
  );
  const concealedCarrierState =
    concealedCarrierContact.save.entity_states[glassActorKey];
  check(
    "a perceptible carried light cannot identify or trace a carrier when exposes_carrier is disabled",
    concealedCarrierAlert?.cause === "glass_sensitivity" &&
      concealedCarrierAlert.stimulus.source_actor_id === undefined &&
      concealedCarrierAlert.tracks_live_target === false &&
      concealedCarrierAlert.tracked_source_id === undefined &&
      concealedCarrierState?.perception_tracked_source_id === undefined &&
      concealedCarrierState?.target_actor_id === undefined,
  );

  const extinguishedTrace = advanceImmersivePerceptionForSave(
    gamePackage,
    {
      ...tracedGlassContact.save,
      flags: {
        ...tracedGlassContact.save.flags,
        immersive_light_states: { "item:qa_portable_lamp": false },
      },
    },
    map.id,
  );
  const extinguishedState = extinguishedTrace.save.entity_states[glassActorKey];
  check(
    "extinguishing the carried source breaks live tracing and keeps only last-known memory",
    !extinguishedTrace.snapshot.alerts.some(
      (alert) =>
        alert.actor_id === glassActorKey &&
        alert.tracked_source_id === directGlassState?.perception_tracked_source_id,
    ) &&
      extinguishedState?.perception_tracks_live_target === false &&
      extinguishedState?.perception_tracked_source_id === undefined &&
      extinguishedState?.target_actor_id === undefined &&
      sameCell(extinguishedState?.last_known_position, [3, -5]),
  );
}

console.log("perception contract: physical actions become hearing evidence");
{
  const crate = map.custom_object_placements.find(
    (placement) => placement.id === "qa_noise_crate",
  );
  const hunterIndex = map.entity_placements.findIndex(
    (placement) => placement.entity_id === "qa_sound_hunter",
  );
  if (!crate || hunterIndex < 0) {
    throw new Error("QA perception lab is missing its noise crate or hearing hunter");
  }
  const hunterKey = entityPlacementStateKey(
    map.id,
    map.entity_placements[hunterIndex],
    hunterIndex,
  );
  const pushed = dispatchV1PushObject({
    gamePackage,
    save: makeSave([-7, 5]),
    actorId: "player",
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 0,
    dy: -1,
  });
  const pushPayload = pushed.events.find(
    (event) => event.type === "object_pushed",
  )?.payload as { to?: [number, number] } | undefined;
  const pushSound = Object.values(
    pushed.save.map_deltas?.[map.id]?.environment_fields || {},
  )
    .flat()
    .find(
      (field) =>
        field.kind === "sound" &&
        field.frequency_tag === "object_push" &&
        Boolean(
          pushPayload?.to &&
            sameCell(field.origin_cell || [Number.NaN, Number.NaN], pushPayload.to),
        ),
    );
  const perceivedPush = advanceImmersivePerceptionForSave(
    gamePackage,
    pushed.save,
    map.id,
  );
  const hunterState = perceivedPush.save.entity_states[hunterKey];
  const hunterTask = perceivedPush.save.map_deltas?.[map.id]?.npc_tasks?.find(
    (task) =>
      task.actor_id === hunterKey &&
      task.source_kind === "sound" &&
      task.task_type === "investigate",
  );
  check(
    "pushing the QA crate emits systemic sound and makes the hearing hunter investigate its origin",
    pushed.ok &&
      Boolean(pushPayload?.to) &&
      Boolean(pushSound) &&
      hunterState?.last_detection_cause === "heard" &&
      sameCell(hunterState?.last_known_position, pushPayload!.to!) &&
      Boolean(hunterTask) &&
      sameCell(hunterTask!.target_cell, pushPayload!.to!),
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

console.log("perception contract: pushed-object render visibility");
{
  const finePackage = expandGamePackageToFine(gamePackage);
  const fineMap = finePackage.maps.find(
    (candidate) => candidate.id === map.id,
  );
  if (!fineMap) throw new Error("Fine QA package is missing qa_perception_lab");
  const crate = fineMap.custom_object_placements.find(
    (placement) => placement.id === "qa_noise_crate",
  );
  if (!crate) throw new Error("Fine QA perception lab is missing its pushable crate");

  const playerCell: [number, number] = [crate.cell[0] - 1, crate.cell[1]];
  const pushed = dispatchV1PushObject({
    gamePackage: finePackage,
    save: {
      ...makeSave(playerCell),
      inventory: [{ id: "qa_portable_lamp", count: 1 }],
      map_deltas: {
        [map.id]: { taken_items: [portableLampPlacement.id] },
      },
    },
    x: crate.cell[0],
    y: crate.cell[1],
    dx: 1,
    dy: 0,
  });
  const destination: [number, number] = [crate.cell[0] + 1, crate.cell[1]];
  const pushedDelta = pushed.save.map_deltas?.[map.id];
  const effectiveCrate = applyPlacementDeltas(
    fineMap.custom_object_placements,
    pushedDelta,
  ).find((placement) => placement.id === crate.id);
  const visibility = createImmersiveViewerVisibilityFromV1(
    finePackage,
    pushed.save,
    map.id,
    { viewer_cell: playerCell },
  );
  const renderedDestination = logicalCellToWorld(
    destination,
    "fine",
    FINE_PER_MACRO,
  );
  const destinationFogCell = worldPointToWorldMacroCell(
    renderedDestination[0],
    renderedDestination[1],
    "fine",
    FINE_PER_MACRO,
  );
  const visibilityKeys = new Set(
    visibility.terrain_visible.map((cell) => fogCellKey(cell[0], cell[1])),
  );
  const discoveredKeys = new Set(
    visibility.discovered.map((cell) => fogCellKey(cell[0], cell[1])),
  );
  const fogPlan = buildAuthoritativeFogPresentationPlan({
    cells: fineMap.cells,
    gridSpace: "fine",
    fineRatio: FINE_PER_MACRO,
    fogEnabled: true,
    terrainVisible: visibilityKeys,
    discovered: discoveredKeys,
  });
  const destinationFogState = new Map(
    fogPlan.map((cell) => [cell.key, cell.state]),
  ).get(fogCellKey(destinationFogCell[0], destinationFogCell[1]));
  check(
    "a fractional pushed prop resolves to its owning visible macro fog cell",
    pushed.ok &&
      Boolean(pushedDelta?.moved_objects?.[crate.id!]) &&
      Boolean(effectiveCrate) &&
      sameCell(effectiveCrate!.cell as [number, number], destination) &&
      includesCell(visibility.terrain_visible, destination) &&
      !Number.isInteger(renderedDestination[0]) &&
      sameCell(destinationFogCell, [-7, 4]) &&
      destinationFogState === "visible",
    `ok=${pushed.ok} placement=${effectiveCrate?.cell.join(":")} world=${renderedDestination.join(":")} fog=${destinationFogCell.join(":")}:${destinationFogState}`,
  );

  const positiveInterior = logicalCellToWorld([5, 4], "fine", FINE_PER_MACRO);
  const beforePositiveBoundary = logicalCellToWorld(
    [2, 4],
    "fine",
    FINE_PER_MACRO,
  );
  const afterPositiveBoundary = logicalCellToWorld(
    [3, 4],
    "fine",
    FINE_PER_MACRO,
  );
  check(
    "render-space fog normalization handles positive fractions and macro-boundary pushes",
    sameCell(
      worldPointToWorldMacroCell(
        positiveInterior[0],
        positiveInterior[1],
        "fine",
        FINE_PER_MACRO,
      ),
      [1, 1],
    ) &&
      sameCell(
        worldPointToWorldMacroCell(
          beforePositiveBoundary[0],
          beforePositiveBoundary[1],
          "fine",
          FINE_PER_MACRO,
        ),
        [0, 1],
      ) &&
      sameCell(
        worldPointToWorldMacroCell(
          afterPositiveBoundary[0],
          afterPositiveBoundary[1],
          "fine",
          FINE_PER_MACRO,
        ),
        [1, 1],
      ),
    `interior=${positiveInterior.join(":")} before=${beforePositiveBoundary.join(":")} after=${afterPositiveBoundary.join(":")}`,
  );

  const restoredSave = JSON.parse(JSON.stringify(pushed.save)) as PlaySave;
  const restoredDelta = restoredSave.map_deltas?.[map.id];
  const restoredCrate = applyPlacementDeltas(
    fineMap.custom_object_placements,
    restoredDelta,
  ).find((placement) => placement.id === crate.id);
  const restoredVisibility = createImmersiveViewerVisibilityFromV1(
    finePackage,
    restoredSave,
    map.id,
    { viewer_cell: playerCell },
  );
  check(
    "a pushed prop retains its moved render cell and visibility after a save JSON round-trip",
    Boolean(restoredCrate) &&
      sameCell(restoredCrate!.cell as [number, number], destination) &&
      includesCell(restoredVisibility.terrain_visible, destination),
    `placement=${restoredCrate?.cell.join(":")} visible=${includesCell(restoredVisibility.terrain_visible, destination)}`,
  );
}

console.log(`perception contract: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
