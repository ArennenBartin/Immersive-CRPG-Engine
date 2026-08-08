import type { ObjectData } from "../schema/game";
import { FINE_PER_MACRO } from "../engine-core/gridCoordinates";

const ASSET_BASE = "/models/environment/lonely-street-basement";

export const LONELY_STREET_BASEMENT_ASSET_REVISION =
  "lonely_street_basement_modular_v1";

export const LONELY_STREET_BASEMENT_FLOOR_OBJECT_ID =
  "obj_lonely_street_basement_floor";
export const LONELY_STREET_BASEMENT_SHELL_OBJECT_ID =
  "obj_lonely_street_basement_shell";
export const LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID =
  "obj_lonely_street_basement_staircase";
export const LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID =
  "obj_lonely_street_basement_stair_door";
export const LONELY_STREET_BASEMENT_DRUM_KIT_OBJECT_ID =
  "obj_lonely_street_basement_drum_kit";
export const LONELY_STREET_BASEMENT_DRUM_STOOL_OBJECT_ID =
  "obj_lonely_street_basement_drum_stool";
export const LONELY_STREET_BASEMENT_WASHER_OBJECT_ID =
  "obj_lonely_street_basement_washer";
export const LONELY_STREET_BASEMENT_DRYER_OBJECT_ID =
  "obj_lonely_street_basement_dryer";
export const LONELY_STREET_BASEMENT_FRIDGE_OBJECT_ID =
  "obj_lonely_street_basement_fridge";
export const LONELY_STREET_BASEMENT_STORAGE_SHELF_OBJECT_ID =
  "obj_lonely_street_basement_storage_shelf";
export const LONELY_STREET_BASEMENT_LAUNDRY_BASKET_OBJECT_ID =
  "obj_lonely_street_basement_laundry_basket";
export const LONELY_STREET_BASEMENT_DETERGENTS_OBJECT_ID =
  "obj_lonely_street_basement_detergents";
export const LONELY_STREET_BASEMENT_BOX_STACK_OBJECT_ID =
  "obj_lonely_street_basement_box_stack";
export const LONELY_STREET_BASEMENT_PAINT_CANS_OBJECT_ID =
  "obj_lonely_street_basement_paint_cans";
export const LONELY_STREET_BASEMENT_PIPES_OBJECT_ID =
  "obj_lonely_street_basement_pipes";
export const LONELY_STREET_BASEMENT_POSTER_OBJECT_ID =
  "obj_lonely_street_basement_bad_luck_poster";
export const LONELY_STREET_BASEMENT_FLOOR_DEBRIS_OBJECT_ID =
  "obj_lonely_street_basement_floor_debris";
export const LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID =
  "obj_lonely_street_basement_bare_bulb";
export const LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID =
  "obj_lonely_street_basement_stair_sconce";

type AssetSpec = {
  id: string;
  name: string;
  filename: string;
  category: string;
  /** Blender X/Y/Z bounds measured by a clean GLB re-import. */
  blenderBounds: [number, number, number];
  materials: string[];
  meshes: number;
  triangles: number;
  bytes: number;
  collision?: ObjectData["collision"];
  tags?: string[];
  light?: NonNullable<ObjectData["light_source"]>;
};

const fittedFineFootprint = (
  width: number,
  depth: number,
): [number, number][] => {
  const axis = (extent: number): number[] => {
    const half = Math.max(0, extent) * 0.5;
    const min = Math.ceil(-half * FINE_PER_MACRO);
    const max = Math.floor(half * FINE_PER_MACRO);
    if (max < min) return [0];
    const cells: number[] = [];
    for (let cell = min; cell <= max; cell += 1) cells.push(cell);
    return cells;
  };
  const result: [number, number][] = [];
  for (const x of axis(width)) {
    for (const z of axis(depth)) result.push([x, z]);
  }
  return result;
};

const fittedCollision = (
  blenderBounds: [number, number, number],
): ObjectData["collision"] => ({
  profile: "single",
  footprint: [[0, 0]],
  fine_footprint: fittedFineFootprint(blenderBounds[0], blenderBounds[1]),
});

const BASEMENT_SHELL_FOOTPRINT: [number, number][] = [];
for (let z = -4; z <= 4; z += 1) {
  for (let x = -5; x <= 5; x += 1) {
    if (x === -5 || x === 5 || z === -4 || z === 4) {
      BASEMENT_SHELL_FOOTPRINT.push([x, z]);
    }
  }
}

const fixedLight = (
  intensity: number,
  radius: number,
  color: string,
  sourceHeightOffset: number,
  tags: string[],
): NonNullable<ObjectData["light_source"]> => ({
  intensity,
  radius,
  color,
  source_height_offset: sourceHeightOffset,
  active_by_default: true,
  extinguishable: false,
  mobility: "fixed",
  persistent: true,
  stimulus_tags: ["light", "basement_light", "fixed_light", ...tags],
  exposes_carrier: false,
});

const specs: AssetSpec[] = [
  {
    id: LONELY_STREET_BASEMENT_SHELL_OBJECT_ID,
    name: "Lonely Street Basement Shell",
    filename: "basement-shell.glb",
    category: "structure",
    blenderBounds: [10.16, 8.16, 4.74],
    materials: [
      "MAT_Concrete_Weathered",
      "MAT_Wood_Charred",
      "MAT_Wood_DarkStained",
    ],
    meshes: 4,
    triangles: 3420,
    bytes: 359108,
    collision: {
      profile: "custom_footprint",
      footprint: BASEMENT_SHELL_FOOTPRINT,
    },
    tags: ["structure", "room_shell"],
  },
  {
    id: LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID,
    name: "Basement Timber Staircase",
    filename: "basement-staircase.glb",
    category: "structure",
    blenderBounds: [1.86, 5.9841, 3.6597],
    materials: ["MAT_Wood_Charred", "MAT_Wood_DarkStained"],
    meshes: 2,
    triangles: 3132,
    bytes: 276244,
    collision: {
      ...fittedCollision([1.86, 5.9841, 3.6597]),
      profile: "single",
      footprint: [[0, 0]],
    },
    tags: ["stairs", "railing", "structure"],
  },
  {
    id: LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
    name: "Basement Stair Door",
    filename: "basement-stair-door.glb",
    category: "door",
    blenderBounds: [1.36, 0.265, 2.2],
    materials: [
      "MAT_Metal_DirtyEnamel",
      "MAT_Metal_DullChrome",
      "MAT_Paper_Aged",
      "MAT_Wood_DarkStained",
    ],
    meshes: 4,
    triangles: 1088,
    bytes: 184440,
    tags: ["door", "stairs", "decorative"],
  },
  {
    id: LONELY_STREET_BASEMENT_DRUM_KIT_OBJECT_ID,
    name: "Burgundy Basement Drum Kit",
    filename: "basement-drum-kit.glb",
    category: "prop",
    blenderBounds: [2.8695, 1.2904, 1.6248],
    materials: [
      "MAT_Fabric_DirtyDrumHead",
      "MAT_Metal_DrumBurgundy",
      "MAT_Metal_DullChrome",
      "MAT_Metal_OxidizedCopper",
    ],
    meshes: 4,
    triangles: 2652,
    bytes: 192016,
    collision: {
      ...fittedCollision([2.8695, 1.2904, 1.6248]),
      profile: "custom_footprint",
      footprint: [
        [-1, 0],
        [0, 0],
        [1, 0],
      ],
    },
    tags: ["instrument", "drums", "hero_prop"],
  },
  {
    id: LONELY_STREET_BASEMENT_DRUM_STOOL_OBJECT_ID,
    name: "Basement Drum Stool",
    filename: "basement-drum-stool.glb",
    category: "furniture",
    blenderBounds: [0.549, 0.5489, 0.58],
    materials: ["MAT_Metal_DullChrome", "MAT_Rubber_SootBlack"],
    meshes: 2,
    triangles: 460,
    bytes: 33396,
    collision: fittedCollision([0.549, 0.5489, 0.58]),
    tags: ["instrument", "stool"],
  },
  {
    id: LONELY_STREET_BASEMENT_WASHER_OBJECT_ID,
    name: "Aged Basement Washer",
    filename: "basement-washer.glb",
    category: "furniture",
    blenderBounds: [0.9, 0.815, 0.9925],
    materials: [
      "MAT_Metal_DirtyEnamel",
      "MAT_Metal_DullChrome",
      "MAT_Rubber_SootBlack",
    ],
    meshes: 3,
    triangles: 456,
    bytes: 60412,
    collision: fittedCollision([0.9, 0.815, 0.9925]),
    tags: ["laundry", "appliance"],
  },
  {
    id: LONELY_STREET_BASEMENT_DRYER_OBJECT_ID,
    name: "Aged Basement Dryer",
    filename: "basement-dryer.glb",
    category: "furniture",
    blenderBounds: [0.9, 0.815, 0.96],
    materials: ["MAT_Metal_DirtyEnamel", "MAT_Rubber_SootBlack"],
    meshes: 2,
    triangles: 564,
    bytes: 64636,
    collision: fittedCollision([0.9, 0.815, 0.96]),
    tags: ["laundry", "appliance"],
  },
  {
    id: LONELY_STREET_BASEMENT_FRIDGE_OBJECT_ID,
    name: "Basement Refrigerator",
    filename: "basement-fridge.glb",
    category: "furniture",
    blenderBounds: [1.02, 0.845, 1.98],
    materials: [
      "MAT_Metal_DirtyEnamel",
      "MAT_Metal_DullChrome",
      "MAT_Paper_Aged",
    ],
    meshes: 3,
    triangles: 972,
    bytes: 122616,
    collision: fittedCollision([1.02, 0.845, 1.98]),
    tags: ["appliance", "storage"],
  },
  {
    id: LONELY_STREET_BASEMENT_STORAGE_SHELF_OBJECT_ID,
    name: "Packed Basement Storage Shelf",
    filename: "basement-storage-shelf.glb",
    category: "furniture",
    blenderBounds: [1.18, 0.52, 1.8925],
    materials: [
      "MAT_Metal_DullChrome",
      "MAT_Paper_Cardboard",
      "MAT_Paper_Label",
      "MAT_Plastic_DetergentRed",
      "MAT_Wood_DarkStained",
    ],
    meshes: 5,
    triangles: 1584,
    bytes: 195196,
    collision: fittedCollision([1.18, 0.52, 1.8925]),
    tags: ["shelf", "storage"],
  },
  {
    id: LONELY_STREET_BASEMENT_LAUNDRY_BASKET_OBJECT_ID,
    name: "Overflowing Laundry Basket",
    filename: "basement-laundry-basket.glb",
    category: "prop",
    blenderBounds: [0.76, 0.4475, 0.72],
    materials: [
      "MAT_Fabric_RugBurgundy",
      "MAT_Paper_Cardboard",
      "MAT_Rubber_SootBlack",
    ],
    meshes: 3,
    triangles: 1116,
    bytes: 110788,
    tags: ["laundry", "clutter"],
  },
  {
    id: LONELY_STREET_BASEMENT_DETERGENTS_OBJECT_ID,
    name: "Laundry Detergent Cluster",
    filename: "basement-detergents.glb",
    category: "decor",
    blenderBounds: [0.96, 0.434, 0.39],
    materials: [
      "MAT_Paper_Label",
      "MAT_Plastic_DetergentBlue",
      "MAT_Plastic_DetergentCream",
      "MAT_Plastic_DetergentRed",
      "MAT_Rubber_SootBlack",
    ],
    meshes: 5,
    triangles: 636,
    bytes: 46080,
    tags: ["laundry", "clutter"],
  },
  {
    id: LONELY_STREET_BASEMENT_BOX_STACK_OBJECT_ID,
    name: "Basement Cardboard Box Stack",
    filename: "basement-box-stack.glb",
    category: "decor",
    blenderBounds: [1.0328, 0.5235, 0.89],
    materials: ["MAT_Paper_Aged", "MAT_Paper_Cardboard"],
    meshes: 2,
    triangles: 648,
    bytes: 97040,
    tags: ["boxes", "storage", "clutter"],
  },
  {
    id: LONELY_STREET_BASEMENT_PAINT_CANS_OBJECT_ID,
    name: "Basement Paint Can Cluster",
    filename: "basement-paint-cans.glb",
    category: "decor",
    blenderBounds: [0.9347, 0.411, 0.3504],
    materials: [
      "MAT_Metal_DirtyEnamel",
      "MAT_Metal_DullChrome",
      "MAT_Paper_Label",
    ],
    meshes: 3,
    triangles: 1104,
    bytes: 98828,
    tags: ["paint", "clutter"],
  },
  {
    id: LONELY_STREET_BASEMENT_PIPES_OBJECT_ID,
    name: "Basement Copper Pipe Run",
    filename: "basement-pipes.glb",
    category: "structure",
    blenderBounds: [1.33, 0.11, 2.25],
    materials: ["MAT_Metal_DullChrome", "MAT_Metal_OxidizedCopper"],
    meshes: 2,
    triangles: 624,
    bytes: 39252,
    tags: ["pipes", "utility", "wall_dressing"],
  },
  {
    id: LONELY_STREET_BASEMENT_POSTER_OBJECT_ID,
    name: "Bad Luck Basement Poster",
    filename: "basement-bad-luck-poster.glb",
    category: "decor",
    blenderBounds: [0.7625, 0.9211, 1.2003],
    materials: ["MAT_Ink_PosterBlack", "MAT_Paper_Aged"],
    meshes: 2,
    triangles: 9132,
    bytes: 276560,
    tags: ["poster", "cat", "wall_dressing"],
  },
  {
    id: LONELY_STREET_BASEMENT_FLOOR_DEBRIS_OBJECT_ID,
    name: "Basement Floor Debris Cluster",
    filename: "basement-floor-debris.glb",
    category: "decor",
    blenderBounds: [4.9361, 4.6568, 0.158],
    materials: [
      "MAT_Paper_Aged",
      "MAT_Plastic_DetergentRed",
      "MAT_Rubber_SootBlack",
    ],
    meshes: 3,
    triangles: 676,
    bytes: 71112,
    tags: ["debris", "cans", "cord", "set_dressing"],
  },
  {
    id: LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
    name: "Basement Bare Bulb",
    filename: "basement-bare-bulb.glb",
    category: "lighting",
    blenderBounds: [0.1773, 0.18, 0.62],
    materials: [
      "MAT_Emissive_BulbWarm",
      "MAT_Metal_DullChrome",
      "MAT_Rubber_SootBlack",
    ],
    meshes: 3,
    triangles: 420,
    bytes: 33692,
    tags: ["light_fixture", "light_ceiling", "presentation_room_light"],
    light: fixedLight(0.95, 11, "#e2ae68", 0.13, ["ceiling_light"]),
  },
  {
    id: LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
    name: "Basement Stair Landing Sconce",
    filename: "basement-stair-sconce.glb",
    category: "lighting",
    blenderBounds: [0.3, 0.255, 0.26],
    materials: ["MAT_Emissive_BulbWarm", "MAT_Metal_DullChrome"],
    meshes: 2,
    triangles: 432,
    bytes: 34528,
    tags: ["light_fixture", "stairs", "presentation_room_light"],
    light: fixedLight(0.75, 9, "#f3bd78", 0.13, ["stair_light"]),
  },
];

type ExportMetrics = {
  min: [number, number, number];
  max: [number, number, number];
  vertices: number;
  textures: number;
  bytes: number;
};

// Clean Blender re-import bounds plus glTF accessor/resource counts. Keeping
// these measured values beside the registrations makes the Studio inspector,
// render offset, collision box, and shipped binary describe the same asset.
const EXPORT_METRICS: Record<string, ExportMetrics> = {
  "basement-shell.glb": {
    min: [-5.08, -4.08, -0.14],
    max: [5.08, 4.08, 4.6],
    vertices: 6840,
    textures: 3,
    bytes: 359108,
  },
  "basement-staircase.glb": {
    min: [-0.93, -2.6641, 0],
    max: [0.93, 3.32, 3.6597],
    vertices: 6264,
    textures: 2,
    bytes: 276244,
  },
  "basement-stair-door.glb": {
    min: [-0.68, -0.165, -0.01],
    max: [0.68, 0.1, 2.19],
    vertices: 2128,
    textures: 3,
    bytes: 184440,
  },
  "basement-drum-kit.glb": {
    min: [-1.4097, -0.4601, 0],
    max: [1.4598, 0.8302, 1.6248],
    vertices: 4596,
    textures: 1,
    bytes: 192016,
  },
  "basement-drum-stool.glb": {
    min: [-0.279, -0.2744, 0.06],
    max: [0.27, 0.2744, 0.64],
    vertices: 864,
    textures: 0,
    bytes: 33396,
  },
  "basement-washer.glb": {
    min: [-0.45, -0.455, 0],
    max: [0.45, 0.36, 0.9925],
    vertices: 864,
    textures: 1,
    bytes: 60412,
  },
  "basement-dryer.glb": {
    min: [-0.45, -0.455, 0],
    max: [0.45, 0.36, 0.96],
    vertices: 1012,
    textures: 1,
    bytes: 64636,
  },
  "basement-fridge.glb": {
    min: [-0.51, -0.475, 0],
    max: [0.51, 0.37, 1.98],
    vertices: 1944,
    textures: 2,
    bytes: 122616,
  },
  "basement-storage-shelf.glb": {
    min: [-0.59, -0.26, 0],
    max: [0.59, 0.26, 1.8925],
    vertices: 3096,
    textures: 2,
    bytes: 195196,
  },
  "basement-laundry-basket.glb": {
    min: [-0.39, -0.2375, 0],
    max: [0.37, 0.21, 0.72],
    vertices: 2304,
    textures: 1,
    bytes: 110788,
  },
  "basement-detergents.glb": {
    min: [-0.48, -0.224, 0],
    max: [0.48, 0.21, 0.39],
    vertices: 1152,
    textures: 0,
    bytes: 46080,
  },
  "basement-box-stack.glb": {
    min: [-0.5193, -0.2617, 0],
    max: [0.5136, 0.2618, 0.89],
    vertices: 1296,
    textures: 2,
    bytes: 97040,
  },
  "basement-paint-cans.glb": {
    min: [-0.4276, -0.191, 0],
    max: [0.5071, 0.22, 0.3504],
    vertices: 1944,
    textures: 1,
    bytes: 98828,
  },
  "basement-pipes.glb": {
    min: [-0.08, -0.055, 0.1],
    max: [1.25, 0.055, 2.35],
    vertices: 1017,
    textures: 0,
    bytes: 39252,
  },
  "basement-bad-luck-poster.glb": {
    min: [-0.3916, -0.4605, -0.6001],
    max: [0.3709, 0.4605, 0.6001],
    vertices: 6063,
    textures: 1,
    bytes: 276560,
  },
  "basement-floor-debris.glb": {
    min: [-2.1111, -3.295, 0.007],
    max: [2.825, 1.3618, 0.165],
    vertices: 1197,
    textures: 1,
    bytes: 71112,
  },
  "basement-bare-bulb.glb": {
    min: [-0.0886, -0.09, -0.62],
    max: [0.0886, 0.09, 0],
    vertices: 840,
    textures: 0,
    bytes: 33692,
  },
  "basement-stair-sconce.glb": {
    min: [-0.15, -0.22, -0.13],
    max: [0.15, 0.035, 0.13],
    vertices: 900,
    textures: 0,
    bytes: 34528,
  },
};

const makeAssetObject = (spec: AssetSpec): ObjectData => {
  const measured = EXPORT_METRICS[spec.filename];
  if (!measured) throw new Error(`Missing basement export metrics: ${spec.filename}`);
  // Blender is Z-up while glTF/Three is Y-up; Blender +Y maps to engine -Z.
  const sourceMin: [number, number, number] = [
    measured.min[0],
    measured.min[2],
    -measured.max[1],
  ];
  const sourceMax: [number, number, number] = [
    measured.max[0],
    measured.max[2],
    -measured.min[1],
  ];
  const sourceCenter: [number, number, number] = [
    (sourceMin[0] + sourceMax[0]) * 0.5,
    (sourceMin[1] + sourceMax[1]) * 0.5,
    (sourceMin[2] + sourceMax[2]) * 0.5,
  ];
  const sourceBounds: [number, number, number] = [
    sourceMax[0] - sourceMin[0],
    sourceMax[1] - sourceMin[1],
    sourceMax[2] - sourceMin[2],
  ];
  return {
    id: spec.id,
    display_name: spec.name,
    category: spec.category,
    tags: [
      "lonely_street_basement",
      "survival_horror",
      "glb",
      "engine_builtin",
      "static_asset_instance",
      LONELY_STREET_BASEMENT_ASSET_REVISION,
      ...(spec.tags || []),
    ],
    origin: "center_floor",
    bounds: sourceBounds,
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
      offset: [-sourceCenter[0], -sourceMin[1], -sourceCenter[2]],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      source_min: sourceMin,
      source_center: sourceCenter,
      source_bounds: sourceBounds,
      material_names: spec.materials,
      stats: {
        meshes: spec.meshes,
        vertices: measured.vertices,
        triangles: spec.triangles,
        materials: spec.materials.length,
        textures: measured.textures,
        bytes: measured.bytes,
      },
    },
    collision: spec.collision || { profile: "none", footprint: [[0, 0]] },
    light_source: spec.light,
  };
};

const BASEMENT_FLOOR: ObjectData = {
  id: LONELY_STREET_BASEMENT_FLOOR_OBJECT_ID,
  display_name: "Weathered Basement Concrete",
  category: "terrain",
  tags: [
    "tile",
    "ground",
    "interior",
    "concrete",
    "engine_builtin",
    LONELY_STREET_BASEMENT_ASSET_REVISION,
  ],
  origin: "center_floor",
  bounds: [1, 0.04, 1],
  materials: ["mat_lonely_street_basement_floor"],
  material_settings: [
    {
      id: "mat_lonely_street_basement_floor",
      name: "Weathered basement concrete",
      color: "#4a4540",
      emissive: "#000000",
      emissive_intensity: 0,
      opacity: 1,
      transparent: false,
      roughness: 0.96,
      metalness: 0,
      texture_kind: "stone_grain",
      texture_scale: 2.8,
      texture_strength: 0.72,
    },
  ],
  model_kind: "parts",
  parts: [
    {
      shape: "box",
      name: "basement_floor",
      position: [0, 0.005, 0],
      rotation: [0, 0, 0],
      size: [1, 0.01, 1],
      material: "mat_lonely_street_basement_floor",
    },
  ],
  decals: [],
  reference_images: [],
  collision: { profile: "none", footprint: [[0, 0]] },
};

export const LONELY_STREET_BASEMENT_OBJECTS: ObjectData[] = [
  BASEMENT_FLOOR,
  ...specs.map(makeAssetObject),
];

export const LONELY_STREET_BASEMENT_OBJECT_IDS =
  LONELY_STREET_BASEMENT_OBJECTS.map((object) => object.id);
