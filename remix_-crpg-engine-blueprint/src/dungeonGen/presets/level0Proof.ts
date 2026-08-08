// ─────────────────────────────────────────────────────────────────────────
// TEMPORARY / DISPOSABLE — Backrooms plan, Phase 1.
//
// This is a PROOF preset, not the final Backrooms topology. It exists to
// answer one question before any new semantic generator is written:
//
//   does the existing dungeon pipeline, pointed at Level 0 materials with
//   open-only connections and broad openings, produce space that reads as
//   Backrooms in third person?
//
// It deliberately runs through the ORDINARY dungeon generator — same seed
// context, embedding, worker, bake, validation, and ordinary MapData output.
// Nothing here is a new generator, and nothing here changes the institutional
// ruin preset.
//
// Phase 4 replaces this with real Backrooms semantic topology under
// src/backroomsGen/. Expect to delete this file then.
//
// What makes it Backrooms-shaped rather than dungeon-shaped:
//   - open_only connections: no doors, no keys, no gates, no secrets;
//   - no encounter/hazard/reward/narrative profiles at all, so the map ships
//     with zero mandatory actors and no loot cadence;
//   - no vertical transitions, so there is no floor-to-floor progression beat;
//   - three-cell openings and three-cell corridors everywhere;
//   - open-office and pillar-field room silhouettes authored as templates
//     (pure data — the shared embedding code is untouched);
//   - Level 0 carpet/wallpaper/fluorescent materials via the theme.
// ─────────────────────────────────────────────────────────────────────────

import type { GamePackage } from "../../schema/game";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  objectLibraryPresets,
} from "../../schema/presets";
import {
  DungeonRecipeSchema,
  DungeonRoomArchetypeSchema,
  DungeonRoomTemplateSchema,
  DungeonThemeProfileSchema,
} from "../schema";
import type {
  DungeonRecipeDef,
  DungeonRoomArchetypeDef,
  DungeonRoomTemplateDef,
  DungeonThemeProfileDef,
} from "../types";
import {
  type DungeonGeneratorAuthoringContent,
  mergeDungeonGeneratorAuthoringContent,
} from "./institutionalRuin";

export const LEVEL0_PROOF_RECIPE_ID = "level0_proof_v1";
export const LEVEL0_PROOF_THEME_ID = "level0_proof_theme_v1";
export const LEVEL0_PROOF_DEFAULT_SEED = "level0-proof-001";

export const LEVEL0_PROOF_ARCHETYPE_IDS = {
  entry: "l0_arch_entry",
  openOffice: "l0_arch_open_office",
  corridor: "l0_arch_corridor",
  pillarHall: "l0_arch_pillar_hall",
  nook: "l0_arch_service_nook",
  junction: "l0_arch_junction",
  landmark: "l0_arch_landmark",
  // dungeon_v1 always reserves one entrance node and one objective node. Level
  // 0 has no boss room, so the objective slot is spent on a far landmark: the
  // distant room you eventually arrive at, with nothing in it.
  farLandmark: "l0_arch_objective_far_landmark",
} as const;

export const LEVEL0_PROOF_TEMPLATE_IDS = {
  entryLobby: "level0_proof_entry_lobby_v1",
  openOffice: "level0_proof_open_office_v1",
  pillarHall: "level0_proof_pillar_hall_v1",
} as const;

// Level 0 is one continuous storey. Wall cells reuse the authored QA map's
// proportions so generated rooms and the hand-authored reference read at the
// same height.
const WALL_HEIGHT = 1;
const WALL_VISUAL_HEIGHT = 1.5;
const FLOOR_TERRAIN = "soft";
const WALL_TERRAIN = "stone_wall";

// Every opening is three macro cells wide. Backrooms space should never make
// the player thread a one-cell gap, and the third-person camera needs the
// width to avoid collapsing to its wall-backed profile in every doorway.
const OPENING_WIDTH = 3;

interface RoomShellOptions {
  width: number;
  depth: number;
  /** Local cells that stay solid inside the room, forming a pillar field. */
  pillars?: ReadonlyArray<readonly [number, number]>;
  interiorTag: string;
}

/**
 * Builds a rectangular room shell with a centered three-cell opening on each
 * side and optional interior pillars. Openings are authored as walkable
 * boundary cells so the embedder can attach a corridor to any side.
 */
const roomShellCells = ({ width, depth, pillars = [], interiorTag }: RoomShellOptions) => {
  const halfOpening = Math.floor(OPENING_WIDTH / 2);
  const centerX = Math.floor(width / 2);
  const centerZ = Math.floor(depth / 2);
  const pillarKeys = new Set(pillars.map(([x, z]) => `${x}:${z}`));

  const cells = [];
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const onBoundary = x === 0 || x === width - 1 || z === 0 || z === depth - 1;
      const opening =
        (z === 0 && Math.abs(x - centerX) <= halfOpening) ||
        (z === depth - 1 && Math.abs(x - centerX) <= halfOpening) ||
        (x === 0 && Math.abs(z - centerZ) <= halfOpening) ||
        (x === width - 1 && Math.abs(z - centerZ) <= halfOpening);
      const pillar = pillarKeys.has(`${x}:${z}`);
      const walkable = opening || (!onBoundary && !pillar);
      cells.push({
        cell: [x, z] as [number, number],
        walkable,
        height: walkable ? 0 : WALL_HEIGHT,
        visualHeight: walkable ? 0 : WALL_VISUAL_HEIGHT,
        terrain: walkable ? FLOOR_TERRAIN : WALL_TERRAIN,
        objectId: walkable
          ? BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID
          : BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
        tag: opening ? "connection" : walkable ? interiorTag : "boundary",
        surfaceTag: "none" as const,
      });
    }
  }
  return cells;
};

const shellSockets = (width: number, depth: number) => {
  const centerX = Math.floor(width / 2);
  const centerZ = Math.floor(depth / 2);
  const socket = (
    id: string,
    cell: [number, number],
    facing: [number, number],
    tags: string[],
  ) => ({
    id,
    cell,
    facing,
    width: OPENING_WIDTH,
    elevation: 0,
    // Open-only: these rooms never accept a door, a lock, or a secret.
    connectionTypes: ["open"],
    requiredClearance: 1,
    tags,
    allowDoor: false,
  });
  return [
    socket("north", [centerX, 0], [0, -1], ["main"]),
    socket("east", [width - 1, centerZ], [1, 0], ["side"]),
    socket("south", [centerX, depth - 1], [0, 1], ["main"]),
    socket("west", [0, centerZ], [-1, 0], ["side"]),
  ];
};

interface ArchetypeOptions {
  tags: string[];
  minWidth?: number;
  maxWidth?: number;
  minDepth?: number;
  maxDepth?: number;
  minConnections?: number;
  maxConnections?: number;
  requiredPlacementTags?: string[];
  allowedAsObjective?: boolean;
}

// Every Level 0 room is quiet by construction: there is no encounter, hazard,
// or reward profile on this recipe, so pressure/reward/hazard ranges stay at
// zero rather than describing tactical intent that nothing will consume.
const level0Archetype = (
  id: string,
  name: string,
  options: ArchetypeOptions,
): DungeonRoomArchetypeDef => DungeonRoomArchetypeSchema.parse({
  id,
  name,
  tags: options.tags,
  minWidth: options.minWidth ?? 7,
  maxWidth: options.maxWidth ?? 13,
  minDepth: options.minDepth ?? 7,
  maxDepth: options.maxDepth ?? 13,
  minConnections: options.minConnections ?? 1,
  maxConnections: options.maxConnections ?? 4,
  allowedOnCriticalPath: true,
  allowedAsSecret: false,
  allowedAsObjective: options.allowedAsObjective ?? false,
  pressureRange: { min: 0, max: 0 },
  rewardRange: { min: 0, max: 0 },
  hazardRange: { min: 0, max: 0 },
  requiredSocketKinds: [],
  requiredPlacementTags: options.requiredPlacementTags ?? [],
  forbiddenNeighborArchetypes: [],
});

export const LEVEL0_PROOF_ARCHETYPES: DungeonRoomArchetypeDef[] = [
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.entry, "Level Zero Entry Lobby", {
    tags: ["entrance", "orientation", "quiet", "backrooms"],
    minWidth: 9,
    minDepth: 9,
    maxConnections: 3,
    requiredPlacementTags: ["safe_spawn"],
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.openOffice, "Open Office Floor", {
    tags: ["open_office", "quiet", "backrooms"],
    minWidth: 9,
    minDepth: 9,
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.corridor, "Long Corridor", {
    tags: ["corridor", "connector", "quiet", "backrooms"],
    minWidth: 5,
    maxWidth: 9,
    minDepth: 5,
    maxDepth: 11,
    maxConnections: 3,
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.pillarHall, "Pillar Field", {
    tags: ["pillar_field", "quiet", "backrooms"],
    minWidth: 11,
    minDepth: 9,
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.nook, "Service Nook", {
    tags: ["service_nook", "quiet", "backrooms"],
    minWidth: 5,
    maxWidth: 7,
    minDepth: 5,
    maxDepth: 7,
    maxConnections: 2,
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.junction, "Open Junction", {
    tags: ["junction", "quiet", "backrooms"],
    minConnections: 3,
    maxConnections: 4,
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.landmark, "Sparse Landmark", {
    tags: ["landmark", "orientation", "quiet", "backrooms"],
    minWidth: 9,
    minDepth: 9,
  }),
  level0Archetype(LEVEL0_PROOF_ARCHETYPE_IDS.farLandmark, "Far Landmark", {
    // The generator's objective slot. Nothing is staged here — it is simply
    // the most distant room, so arrival reads as "I have come a long way"
    // rather than "I have reached the boss".
    tags: ["objective", "landmark", "quiet", "backrooms"],
    minWidth: 9,
    minDepth: 9,
    allowedAsObjective: true,
  }),
];

export const LEVEL0_PROOF_ROOM_TEMPLATES: DungeonRoomTemplateDef[] = [
  DungeonRoomTemplateSchema.parse({
    id: LEVEL0_PROOF_TEMPLATE_IDS.entryLobby,
    name: "Level Zero Entry Lobby",
    description:
      "A quiet nine-by-nine arrival room with four open sides and a protected spawn point.",
    archetypeIds: [
      LEVEL0_PROOF_ARCHETYPE_IDS.entry,
      LEVEL0_PROOF_ARCHETYPE_IDS.junction,
    ],
    themeTags: ["backrooms", "level_zero", "entrance"],
    bounds: { width: 9, depth: 9 },
    rotationModes: [0, 90, 180, 270],
    cells: roomShellCells({ width: 9, depth: 9, interiorTag: "entry_lobby" }),
    connectionSockets: shellSockets(9, 9),
    populationSockets: [
      {
        id: "safe_spawn",
        kind: "landmark",
        cell: [4, 5],
        facing: [0, -1],
        tags: ["safe_spawn"],
        required: true,
      },
    ],
    requiredObjectRefs: [
      BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
    ],
  }),
  DungeonRoomTemplateSchema.parse({
    id: LEVEL0_PROOF_TEMPLATE_IDS.openOffice,
    name: "Open Office Floor",
    description:
      "An eleven-by-eleven open floor broken by four columns, giving long sightlines with partial occlusion.",
    archetypeIds: [
      LEVEL0_PROOF_ARCHETYPE_IDS.openOffice,
      LEVEL0_PROOF_ARCHETYPE_IDS.landmark,
    ],
    themeTags: ["backrooms", "level_zero", "open_office"],
    bounds: { width: 11, depth: 11 },
    rotationModes: [0, 90, 180, 270],
    cells: roomShellCells({
      width: 11,
      depth: 11,
      pillars: [
        [3, 3],
        [3, 7],
        [7, 3],
        [7, 7],
      ],
      interiorTag: "open_office",
    }),
    connectionSockets: shellSockets(11, 11),
    requiredObjectRefs: [
      BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
    ],
  }),
  DungeonRoomTemplateSchema.parse({
    id: LEVEL0_PROOF_TEMPLATE_IDS.pillarHall,
    name: "Pillar Field",
    description:
      "A thirteen-by-eleven hall with a regular column grid, producing the repeating-bay look Level 0 is known for.",
    archetypeIds: [
      LEVEL0_PROOF_ARCHETYPE_IDS.pillarHall,
      LEVEL0_PROOF_ARCHETYPE_IDS.junction,
    ],
    themeTags: ["backrooms", "level_zero", "pillar_field"],
    bounds: { width: 13, depth: 11 },
    rotationModes: [0, 90, 180, 270],
    cells: roomShellCells({
      width: 13,
      depth: 11,
      pillars: [
        [3, 3],
        [3, 7],
        [6, 3],
        [6, 7],
        [9, 3],
        [9, 7],
      ],
      interiorTag: "pillar_field",
    }),
    connectionSockets: shellSockets(13, 11),
    requiredObjectRefs: [
      BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
    ],
  }),
];

export const LEVEL0_PROOF_THEME: DungeonThemeProfileDef =
  DungeonThemeProfileSchema.parse({
    id: LEVEL0_PROOF_THEME_ID,
    name: "Backrooms Level Zero (Proof)",
    description:
      "Damp carpet, yellowed wallpaper, and buzzing fluorescents using the existing authored Level 0 object presets.",
    tags: ["backrooms", "level_zero", "proof", "temporary"],
    architecture: {
      floorObjectId: BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      wallObjectId: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
      // Required by the theme schema. open_only connections mean the bake
      // emits no door edges, and no reward profile means no containers, so
      // neither of these is ever placed by this preset.
      doorObjectId: "obj_p_door",
      containerObjectId: "obj_chest",
      floorTerrain: FLOOR_TERRAIN,
      wallTerrain: WALL_TERRAIN,
      stairTerrain: "stone_stair",
    },
    population: {
      // Intentionally empty: a Level 0 proof has no required encounters,
      // hazards, rewards, or narrative beats. Only the fluorescents.
      encounterProfileIds: [],
      hazardProfileIds: [],
      rewardProfileIds: [],
      narrativeProfileIds: [],
      roomLightObjectIds: [BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID],
    },
    // Level 0's defining quality is that it is ALWAYS lit. There is no torch
    // to carry and no darkness to push back — the fluorescents are simply on,
    // everywhere, forever. A dark generated map with yellow wallpaper reads as
    // an ordinary horror dungeon, which is the exact failure this proof exists
    // to avoid, so the theme raises ambient well above the ruin default.
    ambientLight: 0.62,
    presentationAmbientLight: 0.72,
    keyItemPool: [],
    rewardItemPool: [],
    chemistryMaterialIds: [],
    presentationTags: ["backrooms", "fluorescent", "monotonous"],
  });

/**
 * TEMPORARY proof recipe. Open-only, single storey, unpopulated.
 */
export const createLevel0ProofRecipe = (
  seed = LEVEL0_PROOF_DEFAULT_SEED,
): DungeonRecipeDef => DungeonRecipeSchema.parse({
  id: LEVEL0_PROOF_RECIPE_ID,
  name: "Backrooms Level Zero — Proof",
  description:
    "TEMPORARY Phase 1 proof. One open storey of doorless Level 0 rooms with wide openings, pillar fields, loops, and no required encounters.",
  version: "0.1.0",
  generatorId: "dungeon",
  generatorVersion: "dungeon_v1",
  seed,
  stageSalts: {},
  outputMode: "single_map",
  themeId: LEVEL0_PROOF_THEME_ID,
  scale: {
    floorCount: { min: 1, max: 1 },
    roomCount: { min: 20, max: 26 },
    roomWidth: { min: 5, max: 13 },
    roomDepth: { min: 5, max: 13 },
    floorMapWidth: 88,
    floorMapDepth: 88,
  },
  topology: {
    // A long spine with several lateral branches and more than one loop, so
    // backtracking is ambiguous rather than a single corridor there-and-back.
    criticalPathLength: { min: 10, max: 14 },
    branchCount: { min: 3, max: 4 },
    branchLength: { min: 2, max: 4 },
    loopCount: { min: 2, max: 3 },
    secretCount: { min: 0, max: 0 },
    lockCount: { min: 0, max: 0 },
    optionalObjectiveCount: { min: 0, max: 0 },
    requireReturnPath: true,
  },
  architecture: {
    connectionMode: "open_only",
    // Organic rather than directional_crawl: Level 0 should not read as a
    // one-way descent with a start and a finish.
    layoutStyle: "organic",
    roomArchetypePool: [
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.entry, weight: 1 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.openOffice, weight: 4 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.corridor, weight: 4 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.pillarHall, weight: 3 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.nook, weight: 2 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.junction, weight: 3 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.landmark, weight: 1 },
      { id: LEVEL0_PROOF_ARCHETYPE_IDS.farLandmark, weight: 1 },
    ],
    roomTemplatePool: [
      { id: LEVEL0_PROOF_TEMPLATE_IDS.entryLobby, weight: 3 },
      { id: LEVEL0_PROOF_TEMPLATE_IDS.openOffice, weight: 4 },
      { id: LEVEL0_PROOF_TEMPLATE_IDS.pillarHall, weight: 3 },
    ],
    proceduralRoomBuilderPool: [
      { id: "rectangular_room_v1", weight: 4 },
      { id: "l_room_v1", weight: 2 },
      { id: "junction_room_v1", weight: 2 },
    ],
    corridorWidth: { min: 3, max: 3 },
    roomPadding: 1,
    allowDiagonalCorridors: false,
    allowVerticalTransitions: false,
    verticalTransitionTypes: [],
    boundaryStyle: "backrooms_drywall",
  },
  // Deliberately empty. Zero mandatory actors is the point of the proof.
  population: {},
  difficulty: {
    baseThreat: 0,
    threatGrowthByDepth: 0,
    optionalBranchThreatMultiplier: 0,
    resourceBudget: 0,
    hazardBudget: 0,
    complexityBudget: 0,
  },
  constraints: {
    requiredRoomArchetypes: [
      LEVEL0_PROOF_ARCHETYPE_IDS.entry,
      LEVEL0_PROOF_ARCHETYPE_IDS.openOffice,
      LEVEL0_PROOF_ARCHETYPE_IDS.corridor,
      LEVEL0_PROOF_ARCHETYPE_IDS.pillarHall,
      LEVEL0_PROOF_ARCHETYPE_IDS.junction,
      LEVEL0_PROOF_ARCHETYPE_IDS.farLandmark,
    ],
    forbiddenAdjacencies: [],
    requiredTags: ["backrooms", "level_zero", "proof", "open_plan", "loop"],
    permittedVerbs: ["move", "interact"],
    permittedChemistryMaterials: [],
    maxGenerationAttempts: 48,
    maxEmbeddingBacktracks: 3_000,
  },
});

export const createLevel0ProofGeneratorContent = (
  seed?: string,
): DungeonGeneratorAuthoringContent => {
  const requiredObjectIds = new Set<string>([
    BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
    BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
    BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  ]);
  return {
    items: [],
    objects: objectLibraryPresets.filter((object) =>
      requiredObjectIds.has(object.id),
    ),
    recipes: [createLevel0ProofRecipe(seed)],
    themes: [LEVEL0_PROOF_THEME],
    roomArchetypes: LEVEL0_PROOF_ARCHETYPES,
    roomTemplates: LEVEL0_PROOF_ROOM_TEMPLATES,
    encounterProfiles: [],
    hazardProfiles: [],
    rewardProfiles: [],
    narrativeProfiles: [],
  };
};

export const installLevel0ProofGeneratorContent = (
  pkg: GamePackage,
): GamePackage => mergeDungeonGeneratorAuthoringContent(
  pkg,
  createLevel0ProofGeneratorContent(),
);
