// ── Backrooms anomaly kit ───────────────────────────────────────────────────
// Office furniture for Level 0, plus the deterministic placement builders that
// arrange it into the two anomaly classes the engine has to support before a
// generator can use them:
//
//   A. recursive chains — one object repeated, shrinking and rotating with
//      distance, so a corridor implies a vanishing point its geometry does not
//      actually have;
//   C. partial embedding — furniture driven physically into a wall, floor, or
//      column, so its missing half clearly continues inside solid geometry.
//
// Both rely on per-placement `scale`, `rotation_offset`, and `plan_offset`.
// Neither is allowed to affect collision or navigation: every copy after the
// first is `collision_mode: "none"`, and embedded pieces never collide at all.
// That is what keeps a decorative object buried in a wall from becoming an
// invisible obstacle.
//
// The definitions below are Blender-authored, center-floor GLBs. Their source
// scene contains the complete Phase 7 staged review composition:
// `assets/blender/backrooms-anomalies/backrooms-anomaly-kit.blend`.
// Placement metadata still owns collision; no collider is baked into either
// file, so clipped and recursive copies cannot create hidden obstacles.

import type { ObjectData, ObjectPlacementData } from "../schema/game";

export const BACKROOMS_DESK_OBJECT_ID = "obj_backrooms_office_desk";
export const BACKROOMS_FILING_CABINET_OBJECT_ID =
  "obj_backrooms_filing_cabinet";
export const BACKROOMS_WRONG_CLOCK_OBJECT_ID = "obj_backrooms_wrong_clock";
export const BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID =
  "obj_backrooms_vertical_fluorescent";
export const BACKROOMS_BACKWARDS_DESK_OBJECT_ID =
  "obj_backrooms_backwards_desk";
export const BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID =
  "obj_backrooms_impossible_filing_cabinet";
export const BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID =
  "obj_backrooms_wrong_exit_sign";
export const BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID =
  "obj_backrooms_recursive_chair";
export const BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID =
  "obj_backrooms_half_wall_bisected_desk";
export const BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID =
  "obj_backrooms_wall_clipped_filing_cabinet";

const ASSET_BASE = "/models/environment/backrooms/anomalies";

export const BACKROOMS_DESK_OBJECT: ObjectData = {
  id: BACKROOMS_DESK_OBJECT_ID,
  display_name: "Worn Office Desk",
  category: "furniture",
  tags: [
    "prop",
    "furniture",
    "backrooms",
    "level_zero",
    "desk",
    "glb",
    "blender_authored",
    "phase2_anomaly_kit",
  ],
  origin: "center_floor",
  bounds: [0.96, 0.76, 0.58],
  materials: ["MAT_DeskOxidizedMetal", "MAT_WornDeskLaminate"],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: `${ASSET_BASE}/office-desk.glb`,
    filename: "office-desk.glb",
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    source_min: [-0.48, 0, -0.29],
    source_center: [0, 0.38, 0],
    source_bounds: [0.96, 0.76, 0.58],
    material_names: ["MAT_DeskOxidizedMetal", "MAT_WornDeskLaminate"],
    stats: {
      meshes: 2,
      vertices: 3024,
      triangles: 1512,
      materials: 2,
      textures: 4,
      bytes: 436920,
    },
  },
  collision: { profile: "single", footprint: [[0, 0]] },
};

export const BACKROOMS_FILING_CABINET_OBJECT: ObjectData = {
  id: BACKROOMS_FILING_CABINET_OBJECT_ID,
  display_name: "Worn Filing Cabinet",
  category: "furniture",
  tags: [
    "prop",
    "furniture",
    "backrooms",
    "level_zero",
    "cabinet",
    "glb",
    "blender_authored",
    "phase2_anomaly_kit",
  ],
  origin: "center_floor",
  bounds: [0.46, 1.32, 0.674],
  materials: ["MAT_CabinetDarkHardware", "MAT_CabinetYellowedPaint"],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: `${ASSET_BASE}/filing-cabinet.glb`,
    filename: "filing-cabinet.glb",
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    source_min: [-0.23, 0, -0.31],
    source_center: [0, 0.66, 0.027],
    source_bounds: [0.46, 1.32, 0.674],
    material_names: ["MAT_CabinetDarkHardware", "MAT_CabinetYellowedPaint"],
    stats: {
      meshes: 2,
      vertices: 2712,
      triangles: 1252,
      materials: 2,
      textures: 4,
      bytes: 310852,
    },
  },
  collision: { profile: "single", footprint: [[0, 0]] },
};

interface BackroomsAnomalyAssetSpec {
  id: string;
  displayName: string;
  filename: string;
  category: string;
  tags: string[];
  bounds: [number, number, number];
  sourceMin: [number, number, number];
  sourceCenter: [number, number, number];
  materials: string[];
  meshes: number;
  vertices: number;
  triangles: number;
  bytes: number;
}

const buildPhase7AnomalyObject = (
  spec: BackroomsAnomalyAssetSpec,
): ObjectData => ({
  id: spec.id,
  display_name: spec.displayName,
  category: spec.category,
  tags: [
    "prop",
    "backrooms",
    "level_zero",
    "anomaly",
    "glb",
    "blender_authored",
    "phase7_anomaly_kit",
    ...spec.tags,
  ],
  origin: "center_floor",
  bounds: spec.bounds,
  materials: spec.materials,
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: `${ASSET_BASE}/${spec.filename}`,
    filename: spec.filename,
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    source_min: spec.sourceMin,
    source_center: spec.sourceCenter,
    source_bounds: spec.bounds,
    material_names: spec.materials,
    stats: {
      meshes: spec.meshes,
      vertices: spec.vertices,
      triangles: spec.triangles,
      materials: spec.materials.length,
      textures: spec.materials.length * 2,
      bytes: spec.bytes,
    },
  },
  // Phase 7 dressing owns placement safety. Decorative, recursive, and
  // embedded modules never derive collision from their buried full bounds.
  collision: { profile: "none", footprint: [] },
});

export const BACKROOMS_WRONG_CLOCK_OBJECT = buildPhase7AnomalyObject({
  id: BACKROOMS_WRONG_CLOCK_OBJECT_ID,
  displayName: "Many-Handed Wrong Clock",
  filename: "wrong-clock.glb",
  category: "decoration",
  tags: ["wrong_clock", "wall_anchor", "wrong_decor"],
  bounds: [0.54, 0.54, 0.1145],
  sourceMin: [-0.27, 0, -0.035],
  sourceCenter: [0, 0.27, 0.02225],
  materials: ["MAT_AnomalyDarkMetal", "MAT_AnomalyPalePlastic"],
  meshes: 2,
  vertices: 2240,
  triangles: 1168,
  bytes: 407096,
});

export const BACKROOMS_VERTICAL_FLUORESCENT_OBJECT = buildPhase7AnomalyObject({
  id: BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID,
  displayName: "Vertical Wall Fluorescent",
  filename: "vertical-fluorescent.glb",
  category: "decoration",
  tags: ["vertical_fluorescent", "wall_anchor", "wrong_decor", "emissive"],
  bounds: [0.22, 1.24, 0.1085],
  sourceMin: [-0.11, 0, -0.07],
  sourceCenter: [0, 0.62, -0.01575],
  materials: ["MAT_AnomalyDarkMetal", "MAT_AnomalyFluorescentGlow"],
  meshes: 2,
  vertices: 864,
  triangles: 432,
  bytes: 226172,
});

export const BACKROOMS_BACKWARDS_DESK_OBJECT = buildPhase7AnomalyObject({
  id: BACKROOMS_BACKWARDS_DESK_OBJECT_ID,
  displayName: "Backwards Office Desk",
  filename: "backwards-desk.glb",
  category: "furniture",
  tags: ["desk", "backwards_desk", "floor_anchor", "wrong_decor"],
  bounds: [0.96, 0.76, 0.58],
  sourceMin: [-0.48, 0, -0.29],
  sourceCenter: [0, 0.38, 0],
  materials: ["MAT_DeskOxidizedMetal", "MAT_WornDeskLaminate"],
  meshes: 2,
  vertices: 3024,
  triangles: 1512,
  bytes: 436984,
});

export const BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT =
  buildPhase7AnomalyObject({
    id: BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID,
    displayName: "Impossible Filing Cabinet",
    filename: "impossible-filing-cabinet.glb",
    category: "furniture",
    tags: ["cabinet", "impossible_cabinet", "floor_anchor", "hero_anomaly"],
    bounds: [0.46, 1.32, 0.73],
    sourceMin: [-0.23, 0, -0.366],
    sourceCenter: [0, 0.66, -0.001],
    materials: ["MAT_CabinetDarkHardware", "MAT_CabinetYellowedPaint"],
    meshes: 2,
    vertices: 3480,
    triangles: 1604,
    bytes: 337596,
  });

export const BACKROOMS_WRONG_EXIT_SIGN_OBJECT = buildPhase7AnomalyObject({
  id: BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID,
  displayName: "Wrong Exit Sign",
  filename: "wrong-exit-sign.glb",
  category: "decoration",
  tags: ["wrong_exit_sign", "wall_anchor", "wrong_decor"],
  bounds: [0.92, 0.5034, 0.096],
  sourceMin: [-0.46, 0, -0.04],
  sourceCenter: [0, 0.2517, 0.008],
  materials: ["MAT_AnomalyExitGreen", "MAT_AnomalyPalePlastic"],
  meshes: 2,
  vertices: 1464,
  triangles: 680,
  bytes: 396764,
});

export const BACKROOMS_RECURSIVE_CHAIR_OBJECT = buildPhase7AnomalyObject({
  id: BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID,
  displayName: "Recursive Office Chair",
  filename: "recursive-chair.glb",
  category: "furniture",
  tags: ["chair", "recursive_chain", "floor_anchor", "repetition_anomaly"],
  bounds: [0.6589, 1.115, 0.6537],
  sourceMin: [-0.2989, 0, -0.3268],
  sourceCenter: [0.03055, 0.5575, 0],
  materials: ["MAT_AnomalyChairFabric", "MAT_AnomalyDarkMetal"],
  meshes: 2,
  vertices: 3184,
  triangles: 1644,
  bytes: 421124,
});

export const BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT =
  buildPhase7AnomalyObject({
    id: BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID,
    displayName: "Half-Wall Bisected Desk",
    filename: "half-wall-bisected-desk.glb",
    category: "furniture",
    tags: ["desk", "partition_anchor", "partition_bisect", "partial_embed"],
    bounds: [0.96, 1.1575, 1.28],
    sourceMin: [-0.48, 0, -0.64],
    sourceCenter: [0, 0.57875, 0],
    materials: [
      "MAT_AnomalyAgedWallpaper",
      "MAT_AnomalyDarkMetal",
      "MAT_DeskOxidizedMetal",
      "MAT_WornDeskLaminate",
    ],
    meshes: 4,
    vertices: 3456,
    triangles: 1728,
    bytes: 774848,
  });

export const BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT =
  buildPhase7AnomalyObject({
    id: BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID,
    displayName: "Wall-Clipped Filing Cabinet",
    filename: "wall-clipped-filing-cabinet.glb",
    category: "furniture",
    tags: ["cabinet", "wall_anchor", "wall_clip", "partial_embed"],
    bounds: [1.47, 2.32, 0.674],
    sourceMin: [-0.735, 0, -0.52],
    sourceCenter: [0, 1.16, -0.183],
    materials: [
      "MAT_AnomalyAgedWallpaper",
      "MAT_AnomalyDarkMetal",
      "MAT_CabinetDarkHardware",
      "MAT_CabinetYellowedPaint",
    ],
    meshes: 4,
    vertices: 2952,
    triangles: 1372,
    bytes: 642056,
  });

export const BACKROOMS_ANOMALY_OBJECTS: ObjectData[] = [
  BACKROOMS_DESK_OBJECT,
  BACKROOMS_FILING_CABINET_OBJECT,
  BACKROOMS_WRONG_CLOCK_OBJECT,
  BACKROOMS_VERTICAL_FLUORESCENT_OBJECT,
  BACKROOMS_BACKWARDS_DESK_OBJECT,
  BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT,
  BACKROOMS_WRONG_EXIT_SIGN_OBJECT,
  BACKROOMS_RECURSIVE_CHAIR_OBJECT,
  BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT,
  BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT,
];

// ── Recursive chain ─────────────────────────────────────────────────────────

export interface RecursiveChainOptions {
  /** Stable prefix for the generated placement IDs. */
  idPrefix: string;
  objectId: string;
  /** Where the first, solid copy stands. */
  originCell: [number, number];
  /** Unit step between copies, in macro cells. */
  step: [number, number];
  facing: [number, number];
  count: number;
  /** Multiplier applied per copy, compounding. 0.84 shrinks ~16% each time. */
  scaleFalloff: number;
  /** Extra horizontal yaw per copy, compounding, in degrees. */
  rotationStepDegrees: number;
  /** Extra forward/back tilt per copy, compounding, in degrees. */
  tiltStepDegrees?: number;
  /** Metres pushed below the floor per copy, compounding. */
  sinkStep?: number;
}

/**
 * Builds a chain where each copy is smaller and slightly more rotated than the
 * last. Only the first copy collides; the rest are scenery, so the chain can
 * run straight down a corridor without ever blocking it.
 *
 * Fully determined by its options — no RNG — so a given corridor always
 * produces the same chain.
 */
export const buildRecursiveChainPlacements = ({
  idPrefix,
  objectId,
  originCell,
  step,
  facing,
  count,
  scaleFalloff,
  rotationStepDegrees,
  tiltStepDegrees = 0,
  sinkStep = 0,
}: RecursiveChainOptions): ObjectPlacementData[] => {
  const placements: ObjectPlacementData[] = [];
  for (let index = 0; index < count; index += 1) {
    const factor = Math.pow(scaleFalloff, index);
    const yaw = (rotationStepDegrees * index * Math.PI) / 180;
    const pitch = (tiltStepDegrees * index * Math.PI) / 180;
    placements.push({
      id: `${idPrefix}_${String(index).padStart(2, "0")}`,
      object_id: objectId,
      cell: [
        originCell[0] + step[0] * index,
        originCell[1] + step[1] * index,
      ],
      facing: [facing[0], facing[1]],
      scale: [factor, factor, factor],
      // Rotation compounds on two axes: the chain spirals in plan while its
      // shrinking copies pitch into the carpet.
      rotation_offset: [pitch, yaw, 0],
      ...(index > 0 && sinkStep > 0
        ? { height_offset: -sinkStep * index }
        : {}),
      // The first desk is furniture. Everything past it is a trick of the
      // light, and must never be something the player walks into.
      ...(index === 0 ? {} : { collision_mode: "none" as const }),
    });
  }
  return placements;
};

// ── Partial embedding ───────────────────────────────────────────────────────

export interface WallClipOptions {
  id: string;
  objectId: string;
  /** The open floor cell the piece stands in, adjacent to the wall. */
  cell: [number, number];
  /**
   * Unit vector from that cell toward the wall it sinks into. The piece is
   * pushed this way by `penetrationRatio` of a cell.
   */
  towardWall: [number, number];
  /** Fraction of a macro cell driven into the wall. 0.4 buries 40% of it. */
  penetrationRatio: number;
  /** Optional lean, in degrees, so the piece does not read as installed. */
  tiltDegrees?: number;
}

const canonicalNumber = (value: number) => (Object.is(value, -0) ? 0 : value);

/**
 * Drives a piece of furniture partway into adjacent solid geometry. The offset
 * is real displacement rather than a coplanar overlap, so the buried half is
 * genuinely inside the wall instead of z-fighting against its surface.
 *
 * Always non-blocking: the visible half stands in a walkable cell, and a
 * collider there would be an obstacle the player cannot see the shape of.
 */
export const buildWallClippedPlacement = ({
  id,
  objectId,
  cell,
  towardWall,
  penetrationRatio,
  tiltDegrees = 0,
}: WallClipOptions): ObjectPlacementData => ({
  id,
  object_id: objectId,
  cell,
  // Face back out of the wall, so the drawers and handles stay visible.
  facing: [
    canonicalNumber(-towardWall[0]),
    canonicalNumber(-towardWall[1]),
  ],
  plan_offset: [
    canonicalNumber(towardWall[0] * penetrationRatio),
    canonicalNumber(towardWall[1] * penetrationRatio),
  ],
  ...(tiltDegrees
    ? {
        rotation_offset: [
          (tiltDegrees * Math.PI) / 180,
          0,
          0,
        ] as [number, number, number],
      }
    : {}),
  collision_mode: "none",
});
