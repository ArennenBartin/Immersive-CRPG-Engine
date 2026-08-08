import type { ObjectData } from "../schema/game";
import { FINE_PER_MACRO } from "../engine-core/gridCoordinates";
import { LONELY_STREET_INTERIOR_DOOR_OBJECT_ID } from "../utils/doorPlacement";

const ASSET_BASE = "/models/environment/lonely-street-house-interior";

// Bumped whenever the fitted collision below changes shape. Saved packages are
// upgraded by matching on this tag (see engineStore hydration) rather than by
// enumerating every previous footprint.
export const LONELY_STREET_INTERIOR_COLLISION_REVISION =
  "lonely_street_interior_fitted_collision_v2";

export const LONELY_STREET_INTERIOR_FLOOR_OBJECT_ID =
  "obj_lonely_street_interior_floor";
export const LONELY_STREET_INTERIOR_SHELL_OBJECT_ID =
  "obj_lonely_street_interior_shell";
export const LONELY_STREET_INTERIOR_DOOR_FRAME_OBJECT_ID =
  "obj_lonely_street_interior_door_frame";
export const LONELY_STREET_INTERIOR_WINDOW_OBJECT_ID =
  "obj_lonely_street_interior_window";
export const LONELY_STREET_INTERIOR_SOFA_OBJECT_ID =
  "obj_lonely_street_interior_sofa";
export const LONELY_STREET_INTERIOR_RUG_OBJECT_ID =
  "obj_lonely_street_interior_rug";
export const LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID =
  "obj_lonely_street_interior_coffee_table";
export const LONELY_STREET_INTERIOR_SIDE_TABLE_OBJECT_ID =
  "obj_lonely_street_interior_side_table";
export const LONELY_STREET_INTERIOR_FRIDGE_OBJECT_ID =
  "obj_lonely_street_interior_fridge";
export const LONELY_STREET_INTERIOR_STOVE_OBJECT_ID =
  "obj_lonely_street_interior_stove";
export const LONELY_STREET_INTERIOR_CABINETS_OBJECT_ID =
  "obj_lonely_street_interior_cabinets";
export const LONELY_STREET_INTERIOR_BOOKCASE_OBJECT_ID =
  "obj_lonely_street_interior_bookcase";
export const LONELY_STREET_INTERIOR_DRESSER_OBJECT_ID =
  "obj_lonely_street_interior_dresser";
export const LONELY_STREET_INTERIOR_CLUTTER_OBJECT_ID =
  "obj_lonely_street_interior_clutter";
export const LONELY_STREET_INTERIOR_TABLE_LAMP_OBJECT_ID =
  "obj_lonely_street_interior_table_lamp";
export const LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID =
  "obj_lonely_street_interior_ceiling_bulb";
export const LONELY_STREET_INTERIOR_TASK_LIGHT_OBJECT_ID =
  "obj_lonely_street_interior_task_light";

export { LONELY_STREET_INTERIOR_DOOR_OBJECT_ID } from "../utils/doorPlacement";

type AssetSpec = {
  id: string;
  name: string;
  filename: string;
  category: string;
  // Blender exports report X/Y/Z bounds; the engine consumes X/height/Z.
  blenderBounds: [number, number, number];
  materials: string[];
  meshes: number;
  triangles: number;
  bytes: number;
  collision?: ObjectData["collision"];
  tags?: string[];
  rotation?: [number, number, number];
  /**
   * Render scale applied to the source mesh. `bounds` is reported post-scale so
   * collision, occlusion, and the continuous collider all describe the geometry
   * the player actually sees.
   */
  scale?: [number, number, number];
  /**
   * Corrects a source mesh that is not centred on its own origin. The engine's
   * `origin: "center_floor"` convention assumes it is, and every collider is
   * built around the placement cell, so an off-centre mesh otherwise renders
   * away from the volume that blocks the player.
   */
  offset?: [number, number, number];
  light?: NonNullable<ObjectData["light_source"]>;
};

/**
 * Fitted collision for a prop, in fine cells.
 *
 * A fine cell is 1/FINE_PER_MACRO m. A cell joins the footprint when its CENTRE
 * falls inside the model's real X/Z box, so the blocked shape tracks the mesh
 * instead of the macro tile the prop happens to sit on, and rounding error stays
 * under half a cell in either direction. Opting into `fine_footprint` also opts
 * the prop into the continuous collider that free movement sweeps against
 * (getPlacementContinuousCollisionBounds), which uses the exact box.
 *
 * Both shapes are centred on the placement cell, so keep source meshes centred
 * on their origin (`offset` above) rather than biasing a footprint to chase one.
 */
const fittedFineFootprint = (
  width: number,
  depth: number,
): [number, number][] => {
  const axis = (extent: number): number[] => {
    const half = Math.max(0, extent) * 0.5;
    const min = Math.ceil(-half * FINE_PER_MACRO);
    const max = Math.floor(half * FINE_PER_MACRO);
    // A model narrower than one fine cell still blocks the cell it stands in.
    if (max < min) return [0];
    const cells: number[] = [];
    for (let cell = min; cell <= max; cell += 1) cells.push(cell);
    return cells;
  };

  const cells: [number, number][] = [];
  for (const x of axis(width)) {
    for (const z of axis(depth)) cells.push([x, z]);
  }
  return cells;
};

/** Fitted collision built straight from a spec's authored model box. */
const fittedCollision = (
  blenderBounds: [number, number, number],
): ObjectData["collision"] => ({
  profile: "single",
  footprint: [[0, 0]],
  fine_footprint: fittedFineFootprint(blenderBounds[0], blenderBounds[1]),
});

const INTERIOR_SHELL_FOOTPRINT: [number, number][] = [];
for (let z = -3; z <= 3; z += 1) {
  for (let x = -4; x <= 4; x += 1) {
    const boundary = x === -4 || x === 4 || z === -3 || z === 3;
    const doorway = x === -4 && z === 1;
    if (boundary && !doorway) INTERIOR_SHELL_FOOTPRINT.push([x, z]);
  }
}

// The shell's collision is the authored macro ring above, whose inner faces sit
// at ±3.5 m across and ±2.5 m deep (7 x 5 walkable tiles). The source mesh does
// not agree: measured from house-interior-shell.glb, its floor spans X ±4.000
// and its wall inner faces sit at X ±4.000 / Z ±2.335. Left unscaled that puts
// 0.50 m of visible floor behind an invisible wall on each side wall, and lets
// the player stand 0.165 m inside the front and back walls.
//
// Scale the mesh onto the grid rather than re-authoring the room: the walkable
// rectangle is what every other system already agrees on, and the props were
// laid out against it.
const SHELL_MESH_INTERIOR_HALF_WIDTH = 4.0;
const SHELL_MESH_INTERIOR_HALF_DEPTH = 2.335;
const SHELL_GRID_INTERIOR_HALF_WIDTH = 3.5;
const SHELL_GRID_INTERIOR_HALF_DEPTH = 2.5;
const INTERIOR_SHELL_SCALE: [number, number, number] = [
  SHELL_GRID_INTERIOR_HALF_WIDTH / SHELL_MESH_INTERIOR_HALF_WIDTH,
  1,
  SHELL_GRID_INTERIOR_HALF_DEPTH / SHELL_MESH_INTERIOR_HALF_DEPTH,
];

// Scaling the shell moves the west wall's inner face from X = -4.0 to -3.5.
// The door, its frame, and the window are authored on that wall's macro tile at
// world X = -4.0 and have to travel with it. Their PLACEMENTS must not move:
// the doorway cell owns the door's collision, the map exit, and door-clearance
// validation. Shift the mesh instead.
const WEST_WALL_MESH_SHIFT_X =
  SHELL_MESH_INTERIOR_HALF_WIDTH - SHELL_GRID_INTERIOR_HALF_WIDTH;

// Facings are shared with the placements in lonelyStreetWing so the offsets
// below and the placements they compensate for cannot drift apart.
export const LONELY_STREET_INTERIOR_DOORWAY_FACING: [number, number] = [-1, 0];
export const LONELY_STREET_INTERIOR_WINDOW_FACING: [number, number] = [0, 1];

// Measured centres of each source mesh in its own space (X, Z). None of these
// three GLBs is modelled on its origin, which is the same defect that put the
// bookcase's collider off its shelves.
const DOOR_MESH_CENTER: [number, number] = [-0.06, 0.475];
const DOOR_FRAME_MESH_CENTER: [number, number] = [-0.03, 0.475];
const WINDOW_MESH_CENTER: [number, number] = [-0.097, 0];

const rotateXZ = (
  [x, z]: readonly [number, number],
  yaw: number,
): [number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

const placementYaw = (facing: readonly [number, number]) =>
  Math.atan2(facing[0], facing[1]);

/**
 * The renderer resolves a placed asset as
 *   world = placementCell + R(placementYaw) · ( assetOffset + R(assetYaw) · mesh )
 * so the offset that lands a mesh's centre on `worldTarget` (given relative to
 * the placement cell) is R(placementYaw)⁻¹ · worldTarget − R(assetYaw) · centre.
 */
const meshCenteringOffset = (options: {
  meshCenter: readonly [number, number];
  assetYaw?: number;
  facing: readonly [number, number];
  worldTarget?: readonly [number, number];
}): [number, number, number] => {
  const local = rotateXZ(
    options.worldTarget || [0, 0],
    -placementYaw(options.facing),
  );
  const mesh = rotateXZ(options.meshCenter, options.assetYaw || 0);
  return [local[0] - mesh[0], 0, local[1] - mesh[1]];
};

const makeAssetObject = (spec: AssetSpec): ObjectData => {
  const sourceBounds: [number, number, number] = [
    spec.blenderBounds[0],
    spec.blenderBounds[2],
    spec.blenderBounds[1],
  ];
  const scale = spec.scale || [1, 1, 1];
  // `bounds` describes the RENDERED model, so scaled geometry reports the size
  // its collider and occlusion volume must match. `source_bounds` stays the
  // unscaled mesh (same split Riley's rigged model uses).
  const bounds: [number, number, number] = [
    sourceBounds[0] * scale[0],
    sourceBounds[1] * scale[1],
    sourceBounds[2] * scale[2],
  ];
  return {
    id: spec.id,
    display_name: spec.name,
    category: spec.category,
    tags: [
      "house_interior",
      "survival_horror",
      "glb",
      "engine_builtin",
      LONELY_STREET_INTERIOR_COLLISION_REVISION,
      ...(spec.tags || []),
    ],
    origin: "center_floor",
    bounds,
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
      offset: spec.offset || [0, 0, 0],
      rotation: spec.rotation || [0, 0, 0],
      scale,
      source_min: [-sourceBounds[0] * 0.5, 0, -sourceBounds[2] * 0.5],
      source_center: [0, sourceBounds[1] * 0.5, 0],
      source_bounds: sourceBounds,
      material_names: spec.materials,
      stats: {
        meshes: spec.meshes,
        vertices: 0,
        triangles: spec.triangles,
        materials: spec.materials.length,
        textures: 0,
        bytes: spec.bytes,
      },
    },
    collision: spec.collision || { profile: "none", footprint: [[0, 0]] },
    light_source: spec.light,
  };
};

const fixedLight = (
  intensity: number,
  radius: number,
  color: string,
  stimulusTags: string[] = [],
  sourceHeightOffset?: number,
): NonNullable<ObjectData["light_source"]> => ({
  intensity,
  radius,
  color,
  source_height_offset: sourceHeightOffset,
  active_by_default: true,
  extinguishable: false,
  mobility: "fixed",
  persistent: true,
  stimulus_tags: ["light", "house_light", "fixed_light", ...stimulusTags],
  exposes_carrier: false,
});

const assetSpecs: AssetSpec[] = [
  {
    id: LONELY_STREET_INTERIOR_SHELL_OBJECT_ID,
    name: "Lonely Street House Interior Shell",
    filename: "house-interior-shell.glb",
    category: "structure",
    blenderBounds: [8.13, 4.93, 3.065],
    materials: [
      "MAT_DarkWood",
      "MAT_GrimyPlaster",
      "MAT_SootBlack",
      "MAT_WornFloorboards",
    ],
    meshes: 5,
    triangles: 780,
    bytes: 93052,
    scale: INTERIOR_SHELL_SCALE,
    collision: {
      profile: "custom_footprint",
      footprint: INTERIOR_SHELL_FOOTPRINT,
    },
    tags: ["structure", "room_shell", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_DOOR_FRAME_OBJECT_ID,
    name: "Worn Interior Door Frame",
    filename: "worn-door-frame.glb",
    category: "structure",
    blenderBounds: [0.15, 1.25, 2.195],
    materials: ["MAT_DarkWood"],
    meshes: 1,
    triangles: 324,
    bytes: 47960,
    rotation: [0, Math.PI / 2, 0],
    offset: meshCenteringOffset({
      meshCenter: DOOR_FRAME_MESH_CENTER,
      assetYaw: Math.PI / 2,
      facing: LONELY_STREET_INTERIOR_DOORWAY_FACING,
      worldTarget: [WEST_WALL_MESH_SHIFT_X, 0],
    }),
    tags: ["door_frame", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_DOOR_OBJECT_ID,
    name: "Worn Interior Front Door",
    filename: "worn-door.glb",
    category: "door",
    blenderBounds: [0.21, 0.95, 2.04],
    materials: ["MAT_DarkWood", "MAT_OxidizedMetal", "MAT_SootBlack"],
    meshes: 3,
    triangles: 1196,
    bytes: 112360,
    rotation: [0, Math.PI / 2, 0],
    offset: meshCenteringOffset({
      meshCenter: DOOR_MESH_CENTER,
      assetYaw: Math.PI / 2,
      facing: LONELY_STREET_INTERIOR_DOORWAY_FACING,
      worldTarget: [WEST_WALL_MESH_SHIFT_X, 0],
    }),
    // A closed door seals its whole doorway tile. Keep the macro collider: a
    // fitted 0.21 m slab would leave gaps beside a 1 m doorway.
    collision: { profile: "single", footprint: [[0, 0]] },
    tags: ["door", "interactable", "map_exit"],
  },
  {
    id: LONELY_STREET_INTERIOR_WINDOW_OBJECT_ID,
    name: "Curtained House Window",
    filename: "curtained-window.glb",
    category: "structure",
    blenderBounds: [0.2482, 1.95, 1.4803],
    materials: [
      "MAT_DarkWood",
      "MAT_DirtyCurtainPlaid",
      "MAT_OxidizedMetal",
      "MAT_SmokyGlass",
    ],
    meshes: 4,
    triangles: 1936,
    bytes: 189684,
    offset: meshCenteringOffset({
      meshCenter: WINDOW_MESH_CENTER,
      facing: LONELY_STREET_INTERIOR_WINDOW_FACING,
      worldTarget: [WEST_WALL_MESH_SHIFT_X, 0],
    }),
    tags: ["window", "curtain", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_SOFA_OBJECT_ID,
    name: "Sagging Plaid Sofa",
    filename: "plaid-sofa.glb",
    category: "furniture",
    // Measured from plaid-sofa.glb: 2.560 wide, 1.029 deep, 1.301 tall.
    blenderBounds: [2.56, 1.029, 1.3009],
    materials: [
      "MAT_DarkBlanket",
      "MAT_DarkWood",
      "MAT_FadedBurgundyFabric",
      "MAT_WornPlaid",
    ],
    meshes: 4,
    triangles: 1364,
    bytes: 147936,
    // 7 x 3 fine cells, and the exact 2.56 x 1.03 m box for free movement.
    collision: {
      ...fittedCollision([2.56, 1.029, 1.3009]),
      // Keep the authored macro shape the editor draws for a three-tile sofa.
      profile: "custom_footprint",
      footprint: [
        [-1, 0],
        [0, 0],
        [1, 0],
      ],
    },
    tags: ["furniture", "sofa", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_RUG_OBJECT_ID,
    name: "Worn Living Room Rug",
    filename: "worn-area-rug.glb",
    category: "decor",
    blenderBounds: [3.15, 2.15, 0.036],
    materials: ["MAT_WornRug"],
    meshes: 1,
    triangles: 108,
    bytes: 35300,
    tags: ["rug", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID,
    name: "Scarred Coffee Table",
    filename: "scarred-coffee-table.glb",
    category: "prop",
    blenderBounds: [1.55, 0.72, 0.54],
    materials: ["MAT_DarkWood"],
    meshes: 1,
    triangles: 648,
    bytes: 70632,
    // 5 x 3 fine cells. The previous 5x2 shape could not centre on the
    // placement cell, so it blocked 0.17 m south of the visible tabletop and
    // closed the aisle in front of the sofa earlier than it looked.
    collision: fittedCollision([1.55, 0.72, 0.54]),
    tags: ["furniture", "table", "pushable"],
  },
  {
    id: LONELY_STREET_INTERIOR_SIDE_TABLE_OBJECT_ID,
    name: "Worn Side Table",
    filename: "side-table.glb",
    category: "prop",
    blenderBounds: [0.72, 0.6, 0.555],
    materials: ["MAT_DarkWood"],
    meshes: 1,
    triangles: 648,
    bytes: 70608,
    collision: { profile: "single", footprint: [[0, 0]] },
    tags: ["furniture", "table", "pushable"],
  },
  {
    id: LONELY_STREET_INTERIOR_FRIDGE_OBJECT_ID,
    name: "Dirty Refrigerator",
    filename: "dirty-fridge.glb",
    category: "furniture",
    blenderBounds: [0.96, 0.7325, 1.9],
    materials: [
      "MAT_AgedPaper",
      "MAT_DirtyEnamel",
      "MAT_FictionalPosterGreen",
      "MAT_FictionalPosterRed",
      "MAT_OxidizedMetal",
    ],
    meshes: 5,
    triangles: 864,
    bytes: 115000,
    collision: fittedCollision([0.96, 0.7325, 1.9]),
    tags: ["kitchen", "appliance", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_STOVE_OBJECT_ID,
    name: "Worn Kitchen Stove",
    filename: "worn-stove.glb",
    category: "furniture",
    blenderBounds: [0.88, 0.765, 0.9875],
    materials: [
      "MAT_DirtyCurtainPlaid",
      "MAT_DirtyEnamel",
      "MAT_OxidizedMetal",
      "MAT_SootBlack",
    ],
    meshes: 4,
    triangles: 956,
    bytes: 117656,
    collision: fittedCollision([0.88, 0.765, 0.9875]),
    tags: ["kitchen", "appliance", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_CABINETS_OBJECT_ID,
    name: "Dark Kitchen Cabinets",
    filename: "dark-kitchen-cabinets.glb",
    category: "furniture",
    blenderBounds: [1.67, 0.73, 2.11],
    materials: ["MAT_DarkWood", "MAT_OxidizedMetal", "MAT_SootBlack"],
    meshes: 3,
    triangles: 1896,
    bytes: 164164,
    // The old two-macro footprint [[0,0],[1,0]] had no centre cell, so its
    // collider sat 0.50 m east of the 1.67 m cabinet run: an invisible wall
    // beside it, and no collision at all under its left half.
    collision: fittedCollision([1.67, 0.73, 2.11]),
    tags: ["kitchen", "cabinet", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_BOOKCASE_OBJECT_ID,
    name: "Packed Bookcase",
    filename: "packed-bookcase.glb",
    category: "furniture",
    // Measured from packed-bookcase.glb: 0.546 wide, 1.540 deep, 2.080 tall.
    blenderBounds: [0.546, 1.54, 2.08],
    materials: [
      "MAT_AgedPaper",
      "MAT_DarkWood",
      "MAT_FictionalPosterGreen",
      "MAT_FictionalPosterRed",
      "MAT_SootBlack",
    ],
    meshes: 5,
    triangles: 3888,
    bytes: 328000,
    // packed-bookcase.glb is modelled 0.223 m off its own origin in X. Recentre
    // it so the shelf the player sees is the shelf that blocks them, then fit a
    // 1 x 5 fine footprint to the real 0.55 x 1.54 m case instead of squaring it
    // off into a whole 1 x 1 m tile.
    offset: [0.223, 0, 0],
    collision: fittedCollision([0.546, 1.54, 2.08]),
    tags: ["bookcase", "storage", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_DRESSER_OBJECT_ID,
    name: "Narrow Dresser",
    filename: "narrow-dresser.glb",
    category: "furniture",
    blenderBounds: [0.78, 0.555, 1.1],
    materials: ["MAT_DarkWood", "MAT_OxidizedMetal"],
    meshes: 2,
    triangles: 792,
    bytes: 84152,
    collision: fittedCollision([0.78, 0.555, 1.1]),
    tags: ["dresser", "storage", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_CLUTTER_OBJECT_ID,
    name: "House Clutter Cluster",
    filename: "house-clutter-clusters.glb",
    category: "decor",
    blenderBounds: [6.6563, 3.204, 2.11],
    materials: [
      "MAT_AgedPaper",
      "MAT_BrownGlass",
      "MAT_DarkWood",
      "MAT_DirtyCurtainPlaid",
      "MAT_DirtyEnamel",
      "MAT_FictionalPosterGreen",
      "MAT_FictionalPosterRed",
      "MAT_OxidizedMetal",
      "MAT_SootBlack",
      "MAT_StainedCeramic",
    ],
    meshes: 10,
    triangles: 2156,
    bytes: 248648,
    tags: ["clutter", "set_dressing", "static_asset_instance"],
  },
  {
    id: LONELY_STREET_INTERIOR_TABLE_LAMP_OBJECT_ID,
    name: "Worn Table Lamp",
    filename: "table-lamp.glb",
    category: "lighting",
    blenderBounds: [0.54, 0.54, 0.73],
    materials: ["MAT_LampShade", "MAT_OxidizedMetal", "MAT_WarmBulb"],
    meshes: 3,
    triangles: 420,
    bytes: 32096,
    tags: ["light_fixture", "presentation_room_light"],
    light: fixedLight(0.62, 7, "#efad68", [], 0.54),
  },
  {
    id: LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
    name: "Bare Ceiling Bulb",
    filename: "bare-ceiling-bulb.glb",
    category: "lighting",
    blenderBounds: [0.32, 0.32, 0.38],
    materials: ["MAT_OxidizedMetal", "MAT_SootBlack", "MAT_WarmBulb"],
    meshes: 3,
    triangles: 360,
    bytes: 28656,
    tags: ["light_fixture", "light_ceiling", "presentation_room_light"],
    light: fixedLight(0.88, 11, "#efb06a", ["ceiling_light"], -0.25),
  },
  {
    id: LONELY_STREET_INTERIOR_TASK_LIGHT_OBJECT_ID,
    name: "Under-Cabinet Task Light",
    filename: "under-cabinet-light.glb",
    category: "lighting",
    blenderBounds: [0.56, 0.1525, 0.07],
    materials: ["MAT_SootBlack", "MAT_WarmBulb"],
    meshes: 2,
    triangles: 216,
    bytes: 17428,
    tags: ["light_fixture", "presentation_room_light"],
    light: fixedLight(0.46, 5, "#f0a45e", [], 0),
  },
];

const INTERIOR_FLOOR: ObjectData = {
  id: LONELY_STREET_INTERIOR_FLOOR_OBJECT_ID,
  display_name: "Worn House Floorboards",
  category: "terrain",
  tags: [
    "tile",
    "ground",
    "interior",
    "wood_floor",
    "engine_builtin",
    LONELY_STREET_INTERIOR_COLLISION_REVISION,
  ],
  origin: "center_floor",
  bounds: [1, 0.04, 1],
  materials: ["mat_lonely_street_interior_floor"],
  material_settings: [
    {
      id: "mat_lonely_street_interior_floor",
      name: "Worn floorboards",
      color: "#2f1b11",
      emissive: "#000000",
      emissive_intensity: 0,
      opacity: 1,
      transparent: false,
      roughness: 0.92,
      metalness: 0,
      texture_kind: "wood_grain",
      texture_scale: 3.2,
      texture_strength: 0.7,
    },
  ],
  model_kind: "parts",
  parts: [
    {
      shape: "box",
      name: "floorboards",
      position: [0, 0.005, 0],
      rotation: [0, 0, 0],
      size: [1, 0.01, 1],
      material: "mat_lonely_street_interior_floor",
    },
  ],
  decals: [],
  reference_images: [],
  collision: { profile: "none", footprint: [[0, 0]] },
};

export const LONELY_STREET_HOUSE_INTERIOR_OBJECTS: ObjectData[] = [
  INTERIOR_FLOOR,
  ...assetSpecs.map(makeAssetObject),
];

export const LONELY_STREET_HOUSE_INTERIOR_OBJECT_IDS =
  LONELY_STREET_HOUSE_INTERIOR_OBJECTS.map((object) => object.id);
