import {
  GamePackageSchema,
  MapDataSchema,
  type GamePackage,
  type MapData,
} from "../../schema/game";
import { hashMapOutput } from "../../generation-facing";
import {
  generateDungeon,
  type DungeonGenerationResult,
} from "../../dungeonGen";
import {
  createInstitutionalRuinSingleMapRecipe,
  installInstitutionalRuinGeneratorContent,
} from "../../dungeonGen/presets/institutionalRuin";
import {
  applyDungeonPackageBake,
  planDungeonPackageBake,
} from "../../dungeonGen/packageBake";
import {
  DOORWAY,
  keywordDlg,
  keywordResponse,
  roomCells,
  stampCells,
  type CellOverrides,
} from "./shared";

// Phase 11 is an explicit, deterministic scenario builder rather than part of
// ordinary package normalization. Fresh browser profiles use its result as the
// repository-owned starting workspace, while hydration still preserves every
// persisted project exactly as authored.

export const PHASE_11_SCENARIO_SEED =
  "phase-11-integrated-architecture-v1";
export const PHASE_11_GENERATED_AT = "2026-07-19T00:00:00.000Z";
export const PHASE_11_HUB_MAP_ID = "qa_phase11_architecture_hub";
export const PHASE_11_HUB_SPAWN_ID = "spawn_phase11_hub";
export const PHASE_11_SHORTCUT_ID = "qa_phase11_return_shortcut";
export const PHASE_11_RUBBLE_OBJECT_ID = "qa_phase11_loop_rubble";
export const PHASE_11_EXTRACTION_ID = "qa_phase11_extraction";
export const PHASE_11_ARTIFACT_ITEM_ID = "qa_phase11_artifact";
export const PHASE_11_ARTIFACT_ID = "artifact:qa:phase11_resonance_index";
export const PHASE_11_ARTIFACT_PLACEMENT_ID =
  "qa_phase11_artifact_origin";
export const PHASE_11_GLASS_ITEM_ID = "qa_phase11_raw_glass";
export const PHASE_11_GLASS_PLACEMENT_ID = "qa_phase11_glass_source";
export const PHASE_11_GLASS_BURNER_ITEM_ID = "qa_phase11_glass_burner";
export const PHASE_11_CARRIED_LIGHT_ITEM_ID = "itm_fracture_starter_lantern";
export const PHASE_11_PLACEABLE_LIGHT_ITEM_ID = "qa_phase11_placeable_beacon";
export const PHASE_11_THROWABLE_LIGHT_ITEM_ID = "qa_phase11_throwable_flare";
export const PHASE_11_SIGNATURE_SKILL_ID = "qa_phase11_signature_skill";
export const PHASE_11_DEATH_CUTSCENE_ID = "qa_phase11_death_event";
export const PHASE_11_SIGNATURE_CUTSCENE_ID =
  "qa_phase11_signature_lesson";

const REQUIRED_SENSORY_ENTITY_IDS = [
  "qa_sight_watcher",
  "qa_sound_hunter",
  "qa_light_glass_watcher",
] as const;

type Cell = [number, number];

export interface Phase11IntegratedScenarioIds {
  hubMapId: string;
  hubSpawnId: string;
  entranceMapId: string;
  entranceSpawnId: string;
  objectiveMapId: string;
  shortcutMapId: string;
  shortcutObjectId: string;
  extractionId: string;
  artifactItemId: string;
  artifactId: string;
  artifactPlacementId: string;
  glassItemId: string;
  glassPlacementId: string;
  glassBurnerItemId: string;
  carriedLightItemId: string;
  placeableLightItemId: string;
  throwableLightItemId: string;
  signatureSkillId: string;
}

export interface Phase11IntegratedScenarioCells {
  shortcut: Cell;
  shortcutPush: Cell;
  extraction: Cell;
  artifact: Cell;
  glass: Cell;
  carriedLight: Cell;
  placeableLight: Cell;
  throwableLight: Cell;
  glassBurner: Cell;
  signatureTerminal: Cell;
  deathTerminal: Cell;
  culmination: Cell;
  sightCreature: Cell;
  soundCreature: Cell;
  glassCreature: Cell;
  soundDistraction: Cell;
  smoke: Cell[];
}

export interface Phase11IntegratedArchitectureFixture {
  gamePackage: GamePackage;
  generation: DungeonGenerationResult;
  ids: Phase11IntegratedScenarioIds;
  cells: Phase11IntegratedScenarioCells;
}

const keyOf = (cell: readonly unknown[]) =>
  `${Number(cell[0] ?? 0)}:${Number(cell[1] ?? 0)}`;

const mergeById = <T extends { id: string }>(
  existing: readonly T[],
  additions: readonly T[],
): T[] => {
  const merged = new Map(existing.map((entry) => [entry.id, entry]));
  additions.forEach((entry) => merged.set(entry.id, entry));
  return [...merged.values()];
};

const finalizedManualMap = (map: MapData): MapData => {
  if (!map.generation) return MapDataSchema.parse(map);
  const edited: MapData = {
    ...map,
    generation: {
      ...map.generation,
      manuallyModified: true,
      outputHash: "pending",
    },
  };
  edited.generation!.outputHash = hashMapOutput(edited);
  return MapDataSchema.parse(edited);
};

const occupiedCells = (map: MapData) => new Set([
  ...map.spawns.map((entry) => keyOf(entry.cell)),
  ...map.exits.map((entry) => keyOf(entry.cell)),
  ...map.custom_object_placements.map((entry) => keyOf(entry.cell)),
  ...map.container_placements.map((entry) => keyOf(entry.cell)),
  ...map.item_placements.map((entry) => keyOf(entry.cell)),
  ...map.entity_placements.map((entry) => keyOf(entry.cell)),
]);

const roomCellsFor = (
  generation: DungeonGenerationResult,
  mapsById: Map<string, MapData>,
  nodeId: string,
  count: number,
  reservations: Map<string, Set<string>>,
): { mapId: string; cells: Cell[] } => {
  const room = generation.embedded?.rooms.find((candidate) => candidate.nodeId === nodeId);
  if (!room) throw new Error(`Phase 11 fixture cannot find embedded room ${nodeId}`);
  const map = mapsById.get(room.mapId);
  if (!map) throw new Error(`Phase 11 fixture cannot find map ${room.mapId}`);
  const reserved = reservations.get(map.id) || occupiedCells(map);
  reservations.set(map.id, reserved);
  const socketKeys = new Set(room.sockets.map((socket) => keyOf(socket.cell)));
  const center: Cell = [
    room.bounds.x + Math.floor(room.bounds.width / 2),
    room.bounds.z + Math.floor(room.bounds.depth / 2),
  ];
  const candidates = map.cells
    .filter((cell) =>
      cell.active &&
      cell.walkable &&
      cell.x >= room.bounds.x &&
      cell.x < room.bounds.x + room.bounds.width &&
      cell.z >= room.bounds.z &&
      cell.z < room.bounds.z + room.bounds.depth &&
      !reserved.has(`${cell.x}:${cell.z}`) &&
      !socketKeys.has(`${cell.x}:${cell.z}`),
    )
    .map((cell) => [cell.x, cell.z] as Cell)
    .sort((left, right) => {
      const leftDistance =
        Math.abs(left[0] - center[0]) + Math.abs(left[1] - center[1]);
      const rightDistance =
        Math.abs(right[0] - center[0]) + Math.abs(right[1] - center[1]);
      return leftDistance - rightDistance || left[0] - right[0] || left[1] - right[1];
    });
  if (candidates.length < count) {
    throw new Error(
      `Phase 11 fixture needs ${count} free cells in ${nodeId}, found ${candidates.length}`,
    );
  }
  const chosen = candidates.slice(0, count);
  chosen.forEach((cell) => reserved.add(keyOf(cell)));
  return { mapId: map.id, cells: chosen };
};

const CARDINAL_DIRECTIONS: readonly Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const chooseLoopRubbleCell = (
  generation: DungeonGenerationResult,
  mapsById: Map<string, MapData>,
  reservations: Map<string, Set<string>>,
): { map: MapData; cell: Cell; push: Cell } => {
  const loopEdge = generation.graph?.edges.find((edge) =>
    edge.id.includes("edge_loop_00"),
  );
  const corridor = loopEdge
    ? generation.embedded?.corridors.find((candidate) => candidate.edgeId === loopEdge.id)
    : undefined;
  if (!loopEdge || !corridor) {
    throw new Error("Phase 11 fixed seed did not embed its declared open loop");
  }
  const map = mapsById.get(corridor.mapId);
  if (!map) throw new Error(`Phase 11 loop map ${corridor.mapId} is missing`);
  const reserved = reservations.get(map.id) || occupiedCells(map);
  reservations.set(map.id, reserved);
  const walkable = new Set(
    map.cells
      .filter((entry) => entry.active && entry.walkable)
      .map((entry) => `${entry.x}:${entry.z}`),
  );
  const center: Cell = corridor.cells.length
    ? [
        Math.round(corridor.cells.reduce((sum, cell) => sum + cell[0], 0) / corridor.cells.length),
        Math.round(corridor.cells.reduce((sum, cell) => sum + cell[1], 0) / corridor.cells.length),
      ]
    : [0, 0];
  const candidates = corridor.cells
    .map((cell): Cell => [cell[0], cell[1]])
    .filter((cell, index, values) =>
      values.findIndex((candidate) => keyOf(candidate) === keyOf(cell)) === index &&
      walkable.has(keyOf(cell)) &&
      !reserved.has(keyOf(cell)),
    )
    .sort((left, right) =>
      Math.abs(left[0] - center[0]) + Math.abs(left[1] - center[1]) -
        (Math.abs(right[0] - center[0]) + Math.abs(right[1] - center[1])) ||
      left[0] - right[0] ||
      left[1] - right[1],
    );
  for (const cell of candidates) {
    const push = CARDINAL_DIRECTIONS.find(([dx, dz]) => {
      const target: Cell = [cell[0] + dx, cell[1] + dz];
      const approach: Cell = [cell[0] - dx, cell[1] - dz];
      return (
        walkable.has(keyOf(target)) &&
        walkable.has(keyOf(approach)) &&
        !reserved.has(keyOf(target)) &&
        !reserved.has(keyOf(approach))
      );
    });
    if (!push) continue;
    reserved.add(keyOf(cell));
    return { map, cell, push: [...push] };
  }
  throw new Error("Phase 11 open loop has no safe pushable-rubble position");
};

const createHubMap = (
  entranceMapId: string,
  entranceSpawnId: string,
): MapData => {
  const overrides: CellOverrides = {};
  stampCells(overrides, [[0, -4]], DOORWAY);
  return MapDataSchema.parse({
    id: PHASE_11_HUB_MAP_ID,
    display_name: "Phase 11 — Expedition Architecture Hub",
    width: 9,
    height: 9,
    ambient_light: 0.45,
    spawns: [
      {
        id: PHASE_11_HUB_SPAWN_ID,
        cell: [0, 2],
        facing: [0, -1],
      },
    ],
    cells: roomCells(-4, 4, -4, 4, overrides),
    props: [],
    custom_object_placements: [
      {
        id: "qa_phase11_hub_instructions",
        object_id: "obj_bookshelf",
        cell: [-1, 0],
        facing: [0, 1],
        dialogue_id: "qa_phase11_dlg_instructions",
      },
      {
        id: "qa_phase11_hub_archive_display",
        object_id: "obj_terminal",
        cell: [1, 0],
        facing: [0, 1],
        dialogue_id: "qa_phase11_dlg_archive",
      },
      {
        id: "qa_phase11_hub_lamp",
        object_id: "obj_oil_lamp",
        cell: [0, -1],
        facing: [0, 1],
      },
    ],
    entity_placements: [],
    item_placements: [],
    container_placements: [],
    regions: [],
    triggers: [],
    exits: [
      {
        id: "qa_phase11_enter_generated_fracture",
        cell: [0, -4],
        target_map_id: entranceMapId,
        target_spawn_id: entranceSpawnId,
        transition_kind: "portal",
      },
    ],
  });
};

const authoredItems = (): GamePackage["items"] => [
  {
    id: PHASE_11_PLACEABLE_LIGHT_ITEM_ID,
    display_name: "Placeable Survey Beacon",
    description: "A portable beacon that may be dropped to hold a lit position.",
    icon: "⌾",
    category: "key",
    light_source: {
      intensity: 0.8,
      radius: 10,
      color: "#9ed8ff",
      active_by_default: true,
      extinguishable: true,
      mobility: "portable",
      persistent: false,
      stimulus_tags: ["light", "beacon", "portable_light", "placeable_light"],
      exposes_carrier: true,
    },
  },
  {
    id: PHASE_11_THROWABLE_LIGHT_ITEM_ID,
    display_name: "Throwable Survey Flare",
    description: "A temporary light that can be thrown to displace attention.",
    icon: "✦",
    category: "key",
    light_source: {
      intensity: 0.95,
      radius: 9,
      duration_ticks: 180,
      color: "#ff9f66",
      active_by_default: true,
      extinguishable: true,
      mobility: "throwable",
      persistent: false,
      stimulus_tags: ["light", "flare", "portable_light", "throwable_light"],
      exposes_carrier: true,
    },
  },
  {
    id: PHASE_11_GLASS_ITEM_ID,
    display_name: "Harvested Fracture Glass",
    description: "Recoverable Glass that can instead be burned for emergency sight.",
    icon: "◇",
    category: "key",
    glass_resource: {
      units_per_item: 1,
      recovery_value_per_unit: 15,
      burden_per_unit: 0.25,
    },
  },
  {
    id: PHASE_11_GLASS_BURNER_ITEM_ID,
    display_name: "Glass Emergency Burner",
    description: "Consumes one unit of harvested Glass to illuminate a dark route.",
    icon: "◈",
    category: "key",
    light_source: {
      intensity: 0.92,
      radius: 11,
      color: "#efb2ff",
      active_by_default: false,
      extinguishable: true,
      mobility: "portable",
      persistent: false,
      stimulus_tags: [
        "light",
        "glass",
        "lamp",
        "portable_light",
        "glass_fueled",
      ],
      exposes_carrier: true,
    },
    glass_fuel: {
      resource_item_id: PHASE_11_GLASS_ITEM_ID,
      units_per_ignition: 1,
      duration_ticks: 240,
    },
  },
  {
    id: PHASE_11_ARTIFACT_ITEM_ID,
    display_name: "Resonance Index",
    description: "The expedition artifact used to prove origin, bundle, extraction, and hub recovery.",
    icon: "R",
    category: "key",
    artifact: {
      artifact_id: PHASE_11_ARTIFACT_ID,
      recovery_value: 120,
      burden: 2.5,
    },
  },
];

const authoredObjects = (): GamePackage["object_library"] => [
  {
    id: PHASE_11_RUBBLE_OBJECT_ID,
    display_name: "Collapsed Survey Rubble",
    category: "prop",
    tags: ["pushable", "breakable", "rubble", "stone"],
    origin: "center_floor",
    bounds: [0.9, 0.7, 0.9],
    materials: [],
    material_settings: [],
    model_kind: "parts",
    parts: [],
    decals: [],
    reference_images: [],
    collision: { profile: "single", footprint: [[0, 0]] },
    simulation: {
      condition: "intact",
      integrity: 1,
      condition_tags: [],
      mass_kg: 36,
      bulk: 1,
      awkwardness: 0.25,
      push_difficulty: 3,
      carry_size: "oversized",
      requires_cooperation: false,
    },
  },
];

const authoredDialogues = (): GamePackage["dialogue"] => [
  keywordDlg(
    "qa_phase11_dlg_instructions",
    "Integrated Architecture Route",
    "Expedition Console",
    [
      keywordResponse({
        id: "qa_phase11_instructions_opening",
        role: "opening",
        text:
          "The north threshold enters a committed, editable generated fracture. Test the three light forms, sound distraction, obscurance, Glass harvesting and burning, the artifact, the loop shortcut, succession, ghost communion, bundle recovery, extraction, and the archive display.",
      }),
    ],
  ),
  keywordDlg(
    "qa_phase11_dlg_archive",
    "Campaign Recovery Display",
    "Archive Console",
    [
      keywordResponse({
        id: "qa_phase11_archive_opening",
        role: "opening",
        text:
          "Artifacts carried into this hub are transferred to the campaign archive. The Journal reports the conserved artifact state, recovered Glass value, ghosts, and death bundles after save or reload.",
      }),
    ],
  ),
  keywordDlg(
    "qa_phase11_dlg_fracture_marker",
    "Generated Fracture Marker",
    "Survey Terminal",
    [
      keywordResponse({
        id: "qa_phase11_fracture_opening",
        role: "opening",
        text:
          "This geometry was generated from a fixed seed, committed as ordinary map data, then deliberately edited with the integrated scenario placements.",
      }),
    ],
  ),
  keywordDlg(
    "qa_phase11_dlg_culmination",
    "Culmination Point",
    "Deep Survey Terminal",
    [
      keywordResponse({
        id: "qa_phase11_culmination_opening",
        role: "opening",
        text:
          "Culmination reached. Learn the signature, collect the Resonance Index, move the persistent loop rubble, then use the death terminal to prove succession before extracting.",
      }),
    ],
  ),
];

/**
 * Build the fixed-seed Phase 11 proof on top of the canonical QA package.
 * The caller owns when to install it; invoking this function never mutates the
 * source package and never writes to browser persistence.
 */
export const createPhase11IntegratedArchitectureFixture = (
  sourcePackage: GamePackage,
): Phase11IntegratedArchitectureFixture => {
  const source = GamePackageSchema.parse(sourcePackage);
  for (const entityId of REQUIRED_SENSORY_ENTITY_IDS) {
    const entity = source.entities.find((candidate) => candidate.id === entityId);
    if (!entity?.sensory_profile?.channels.length) {
      throw new Error(
        `Phase 11 fixture requires the canonical sensory entity ${entityId}`,
      );
    }
  }

  const generatorPackage = installInstitutionalRuinGeneratorContent(source);
  const recipe = createInstitutionalRuinSingleMapRecipe(PHASE_11_SCENARIO_SEED);
  const generation = generateDungeon({
    recipe,
    gamePackage: generatorPackage,
    generatedAt: PHASE_11_GENERATED_AT,
    debug: false,
  });
  if (!generation.success || !generation.graph || !generation.embedded) {
    const blocking = generation.diagnostics
      .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
      .map((entry) => `${entry.code}: ${entry.message}`)
      .join("; ");
    throw new Error(`Phase 11 fixed-seed generation failed: ${blocking}`);
  }

  const bake = applyDungeonPackageBake(
    planDungeonPackageBake(generatorPackage, generation.maps),
    { policy: "replace" },
  );
  if (!bake.applied) {
    throw new Error("Phase 11 generated fracture could not be committed");
  }

  const generatedIds = new Set(generation.maps.map((map) => map.id));
  const mapsById = new Map(
    bake.package.maps
      .filter((map) => generatedIds.has(map.id))
      // Phase 11 replaces the generic generator encounters with the exact
      // three sensory contracts this scenario is intended to integrate.
      .map((map) => [map.id, { ...map, entity_placements: [] } as MapData]),
  );
  const reservations = new Map<string, Set<string>>();
  mapsById.forEach((map) => reservations.set(map.id, occupiedCells(map)));

  const graph = generation.graph;
  const entranceNodeId = graph.entranceNodeId;
  const objectiveNodeId = graph.objectiveNodeId;
  const criticalNodes = graph.nodes
    .filter((node) => node.mandatory && node.id !== entranceNodeId && node.id !== objectiveNodeId)
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  const branchNodes = graph.nodes
    .filter((node) => !node.mandatory)
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  if (criticalNodes.length < 2 || branchNodes.length < 1) {
    throw new Error("Phase 11 generated topology lacks required scenario rooms");
  }

  const entrance = roomCellsFor(
    generation,
    mapsById,
    entranceNodeId,
    4,
    reservations,
  );
  const sightRoom = roomCellsFor(
    generation,
    mapsById,
    criticalNodes[0].id,
    5,
    reservations,
  );
  const soundRoom = roomCellsFor(
    generation,
    mapsById,
    branchNodes[0].id,
    2,
    reservations,
  );
  const glassRoom = roomCellsFor(
    generation,
    mapsById,
    criticalNodes[Math.min(criticalNodes.length - 1, 2)].id,
    3,
    reservations,
  );
  const objective = roomCellsFor(
    generation,
    mapsById,
    objectiveNodeId,
    7,
    reservations,
  );

  const entranceMap = mapsById.get(entrance.mapId)!;
  const objectiveMap = mapsById.get(objective.mapId)!;
  const entranceSpawn = [...entranceMap.spawns]
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!entranceSpawn) throw new Error("Phase 11 entrance map has no spawn");

  const shortcut = chooseLoopRubbleCell(generation, mapsById, reservations);
  shortcut.map.custom_object_placements.push({
    id: PHASE_11_SHORTCUT_ID,
    object_id: PHASE_11_RUBBLE_OBJECT_ID,
    cell: shortcut.cell,
    facing: [0, 1],
  });

  const generatedLantern = entranceMap.item_placements.find(
    (placement) => placement.item_id === PHASE_11_CARRIED_LIGHT_ITEM_ID,
  );
  if (!generatedLantern) {
    throw new Error("Phase 11 single-map fracture did not bake its starting lantern");
  }

  entranceMap.item_placements = [
    ...entranceMap.item_placements,
    {
      id: "qa_phase11_placeable_light",
      item_id: PHASE_11_PLACEABLE_LIGHT_ITEM_ID,
      cell: entrance.cells[0],
      count: 1,
    },
    {
      id: "qa_phase11_throwable_light",
      item_id: PHASE_11_THROWABLE_LIGHT_ITEM_ID,
      cell: entrance.cells[1],
      count: 1,
    },
    {
      id: "qa_phase11_glass_burner",
      item_id: PHASE_11_GLASS_BURNER_ITEM_ID,
      cell: entrance.cells[2],
      count: 1,
    },
  ];
  entranceMap.custom_object_placements = [
    ...entranceMap.custom_object_placements,
    {
      id: "qa_phase11_generated_marker",
      object_id: "obj_terminal",
      cell: entrance.cells[3],
      facing: [0, 1],
      dialogue_id: "qa_phase11_dlg_fracture_marker",
      collision_mode: "none",
    },
  ];

  const sightMap = mapsById.get(sightRoom.mapId)!;
  sightMap.entity_placements.push({
    id: "qa_phase11_sight_creature",
    entity_id: "qa_sight_watcher",
    cell: sightRoom.cells[0],
    facing: [0, 1],
  });
  const smokeCells = sightRoom.cells.slice(1, 5);
  const smokeKeys = new Set(smokeCells.map(keyOf));
  sightMap.cells = sightMap.cells.map((cell) =>
    smokeKeys.has(`${cell.x}:${cell.z}`)
      ? {
          ...cell,
          terrain: "smoke",
          hazard: "smoke",
          tag: "smoke_obscurance",
        }
      : cell,
  );

  const soundMap = mapsById.get(soundRoom.mapId)!;
  soundMap.entity_placements.push({
    id: "qa_phase11_sound_creature",
    entity_id: "qa_sound_hunter",
    cell: soundRoom.cells[0],
    facing: [1, 0],
  });
  soundMap.custom_object_placements.push({
    id: "qa_phase11_sound_distraction_crate",
    object_id: "obj_crate",
    cell: soundRoom.cells[1],
    facing: [0, 1],
  });

  const glassMap = mapsById.get(glassRoom.mapId)!;
  glassMap.entity_placements.push({
    id: "qa_phase11_glass_creature",
    entity_id: "qa_light_glass_watcher",
    cell: glassRoom.cells[0],
    facing: [-1, 0],
  });
  glassMap.item_placements.push({
    id: PHASE_11_GLASS_PLACEMENT_ID,
    item_id: PHASE_11_GLASS_ITEM_ID,
    cell: glassRoom.cells[1],
    count: 4,
  });
  glassMap.custom_object_placements.push({
    id: "qa_phase11_glass_marker",
    object_id: "obj_broken_statue",
    cell: glassRoom.cells[2],
    facing: [0, 1],
  });

  objectiveMap.item_placements.push({
    id: PHASE_11_ARTIFACT_PLACEMENT_ID,
    item_id: PHASE_11_ARTIFACT_ITEM_ID,
    cell: objective.cells[0],
    count: 1,
  });
  objectiveMap.custom_object_placements.push(
    {
      id: "qa_phase11_culmination_marker",
      object_id: "obj_terminal",
      cell: objective.cells[1],
      facing: [0, 1],
      dialogue_id: "qa_phase11_dlg_culmination",
      collision_mode: "none",
    },
    {
      id: "qa_phase11_signature_terminal",
      object_id: "obj_terminal",
      cell: objective.cells[2],
      facing: [0, 1],
    },
    {
      id: "qa_phase11_death_terminal",
      object_id: "obj_terminal",
      cell: objective.cells[3],
      facing: [0, 1],
    },
  );
  objectiveMap.triggers.push(
    {
      id: "qa_phase11_signature_trigger",
      cell: objective.cells[2],
      type: "interact",
      conditions: [],
      cutscene_id: PHASE_11_SIGNATURE_CUTSCENE_ID,
      once: true,
    },
    {
      id: "qa_phase11_death_trigger",
      cell: objective.cells[3],
      type: "interact",
      conditions: [],
      cutscene_id: PHASE_11_DEATH_CUTSCENE_ID,
      once: false,
    },
  );
  objectiveMap.spawns.push({
    id: "spawn_phase11_extraction_return",
    cell: objective.cells[4],
    facing: [0, 1],
  });
  objectiveMap.exits.push({
    id: PHASE_11_EXTRACTION_ID,
    cell: objective.cells[5],
    target_map_id: PHASE_11_HUB_MAP_ID,
    target_spawn_id: PHASE_11_HUB_SPAWN_ID,
    transition_kind: "portal",
  });
  objectiveMap.custom_object_placements.push({
    id: "qa_phase11_extraction_marker",
    object_id: "obj_training_beacon",
    cell: objective.cells[6],
    facing: [0, 1],
    collision_mode: "none",
  });

  const modifiedGeneratedMaps = [...mapsById.values()].map(finalizedManualMap);
  const hub = createHubMap(entranceMap.id, entranceSpawn.id);
  const persistentObjects = {
    ...((source.settings?.world_state_policy as Record<string, unknown> | undefined)
      ?.persistent_object_ids as Record<string, string[]> | undefined),
    [shortcut.map.id]: [
      ...new Set([
        ...(((source.settings?.world_state_policy as Record<string, unknown> | undefined)
          ?.persistent_object_ids as Record<string, string[]> | undefined)?.[
          shortcut.map.id
        ] || []),
        PHASE_11_SHORTCUT_ID,
      ]),
    ],
  };
  const persistentItems = {
    ...((source.settings?.world_state_policy as Record<string, unknown> | undefined)
      ?.persistent_item_ids as Record<string, string[]> | undefined),
    [objectiveMap.id]: [
      ...new Set([
        ...(((source.settings?.world_state_policy as Record<string, unknown> | undefined)
          ?.persistent_item_ids as Record<string, string[]> | undefined)?.[
          objectiveMap.id
        ] || []),
        PHASE_11_ARTIFACT_PLACEMENT_ID,
      ]),
    ],
  };
  const existingMapIds = new Set(modifiedGeneratedMaps.map((map) => map.id));
  const intercessorConfig =
    (source.settings?.intercessor_succession as Record<string, unknown> | undefined) || {};
  const worldPolicy =
    (source.settings?.world_state_policy as Record<string, unknown> | undefined) || {};

  const candidate: GamePackage = {
    ...bake.package,
    metadata: {
      ...bake.package.metadata,
      title: "Fracture Crawl — Integrated Architecture Scenario",
      version: "phase11.1.0",
      start_map_id: PHASE_11_HUB_MAP_ID,
      start_spawn_id: PHASE_11_HUB_SPAWN_ID,
    },
    settings: {
      ...bake.package.settings,
      initial_known_skills: [PHASE_11_SIGNATURE_SKILL_ID],
      world_state_policy: {
        ...worldPolicy,
        persistent_object_ids: persistentObjects,
        persistent_item_ids: persistentItems,
      },
      intercessor_succession: {
        ...intercessorConfig,
        enabled: true,
        hub_map_id: PHASE_11_HUB_MAP_ID,
        hub_spawn_id: PHASE_11_HUB_SPAWN_ID,
        recover_artifacts_on_hub_entry: true,
        base_known_skills: [],
      },
      campaign_debug: true,
    },
    maps: [
      ...bake.package.maps.filter(
        (map) => map.id !== PHASE_11_HUB_MAP_ID && !existingMapIds.has(map.id),
      ),
      hub,
      ...modifiedGeneratedMaps,
    ],
    dialogue: mergeById(bake.package.dialogue, authoredDialogues()),
    cutscenes: mergeById(bake.package.cutscenes, [
      {
        id: PHASE_11_SIGNATURE_CUTSCENE_ID,
        display_name: "Learn Phase 11 Signature",
        is_blocking: true,
        actions: [
          { type: "learn_skill", skill_id: PHASE_11_SIGNATURE_SKILL_ID },
          { type: "play_sound", sound_id: "level_up" },
        ],
      },
      {
        id: PHASE_11_DEATH_CUTSCENE_ID,
        display_name: "End Phase 11 Intercessor",
        is_blocking: true,
        actions: [{ type: "modify_player_stats", stats: { hp: -999 } }],
      },
    ]),
    items: mergeById(bake.package.items, authoredItems()),
    object_library: mergeById(bake.package.object_library, authoredObjects()),
    abilities: mergeById(bake.package.abilities, [
      {
        id: PHASE_11_SIGNATURE_SKILL_ID,
        display_name: "Resonant Survey",
        description: "The deterministic signature inherited from the prior Intercessor's ghost.",
        ability_kind: "skill",
        ability_page: "physical",
        icon: "sparkles",
        sort_order: 95,
        starts_unlocked: false,
        ap_cost: 1000,
        mp_cost: 0,
        element: "none",
        targeting: "single",
        range: 1,
        payloads: [{ type: "status", status_effect: "guard", value: 1 }],
      },
    ]),
  };

  const gamePackage = GamePackageSchema.parse(candidate);
  return {
    gamePackage,
    generation,
    ids: {
      hubMapId: PHASE_11_HUB_MAP_ID,
      hubSpawnId: PHASE_11_HUB_SPAWN_ID,
      entranceMapId: entranceMap.id,
      entranceSpawnId: entranceSpawn.id,
      objectiveMapId: objectiveMap.id,
      shortcutMapId: shortcut.map.id,
      shortcutObjectId: PHASE_11_SHORTCUT_ID,
      extractionId: PHASE_11_EXTRACTION_ID,
      artifactItemId: PHASE_11_ARTIFACT_ITEM_ID,
      artifactId: PHASE_11_ARTIFACT_ID,
      artifactPlacementId: PHASE_11_ARTIFACT_PLACEMENT_ID,
      glassItemId: PHASE_11_GLASS_ITEM_ID,
      glassPlacementId: PHASE_11_GLASS_PLACEMENT_ID,
      glassBurnerItemId: PHASE_11_GLASS_BURNER_ITEM_ID,
      carriedLightItemId: PHASE_11_CARRIED_LIGHT_ITEM_ID,
      placeableLightItemId: PHASE_11_PLACEABLE_LIGHT_ITEM_ID,
      throwableLightItemId: PHASE_11_THROWABLE_LIGHT_ITEM_ID,
      signatureSkillId: PHASE_11_SIGNATURE_SKILL_ID,
    },
    cells: {
      shortcut: [...shortcut.cell],
      shortcutPush: [...shortcut.push],
      extraction: objective.cells[5],
      artifact: objective.cells[0],
      glass: glassRoom.cells[1],
      carriedLight: [...generatedLantern.cell] as Cell,
      placeableLight: entrance.cells[0],
      throwableLight: entrance.cells[1],
      glassBurner: entrance.cells[2],
      signatureTerminal: objective.cells[2],
      deathTerminal: objective.cells[3],
      culmination: objective.cells[1],
      sightCreature: sightRoom.cells[0],
      soundCreature: soundRoom.cells[0],
      glassCreature: glassRoom.cells[0],
      soundDistraction: soundRoom.cells[1],
      smoke: smokeCells,
    },
  };
};
