import type {
  ObjectData,
  ObjectMeshData,
  ObjectMeshFace,
  ObjectPart,
} from "../schema/game";
import {
  createMeshFromParts,
  getMeshBounds,
  recomputeMeshNormals,
  type Vec3,
} from "./meshModel";
import { createDefaultMaterialSetting } from "./objectMaterials";

export type ModelingGeneratorKind =
  | "lathe_column"
  | "lathe_vase"
  | "beveled_slab"
  | "capsule_limb"
  | "bust_head"
  | "cloth_drape"
  | "holy_veil"
  | "relief_tablet";

export type KitbashGeneratorKind =
  | "roman_nose"
  | "folded_hands"
  | "gold_halo"
  | "roman_plinth"
  | "fluted_column"
  | "candle"
  | "iron_hinge"
  | "wood_crate";

export const MODELING_GENERATORS: {
  kind: ModelingGeneratorKind;
  label: string;
}[] = [
  { kind: "lathe_column", label: "Lathe Column" },
  { kind: "lathe_vase", label: "Lathe Vase" },
  { kind: "beveled_slab", label: "Beveled Slab" },
  { kind: "capsule_limb", label: "Capsule Limb" },
  { kind: "bust_head", label: "Bust Head" },
  { kind: "cloth_drape", label: "Cloth Drape" },
  { kind: "holy_veil", label: "Holy Veil" },
  { kind: "relief_tablet", label: "Relief Stamp" },
];

export const KITBASH_GENERATORS: {
  kind: KitbashGeneratorKind;
  label: string;
}[] = [
  { kind: "roman_nose", label: "Nose" },
  { kind: "folded_hands", label: "Hands" },
  { kind: "gold_halo", label: "Halo" },
  { kind: "roman_plinth", label: "Plinth" },
  { kind: "fluted_column", label: "Column" },
  { kind: "candle", label: "Candle" },
  { kind: "iron_hinge", label: "Hinge" },
  { kind: "wood_crate", label: "Crate" },
];

const MATERIALS = {
  marble: "#DADDF2",
  oldMarble: "#AEB2CF",
  blackStone: "#100D14",
  gold: "#FFC95A",
  wood: "#6A4A5C",
  cloth: "#6320EE",
  glow: "#8CF6FF",
};

const makeSafeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "model";

const makeFootprint = (bounds: Vec3): [number, number][] => {
  const width = Math.max(1, Math.min(6, Math.ceil(bounds[0])));
  const depth = Math.max(1, Math.min(6, Math.ceil(bounds[2])));
  const minX = -Math.floor(width / 2);
  const minZ = -Math.floor(depth / 2);
  const cells: [number, number][] = [];

  for (let x = minX; x < minX + width; x += 1) {
    for (let z = minZ; z < minZ + depth; z += 1) cells.push([x, z]);
  }

  return cells;
};

const createObjectFromMesh = (
  displayName: string,
  mesh: ObjectMeshData,
  materials: string[],
  tags: string[],
): ObjectData => {
  const normalizedMesh = recomputeMeshNormals(mesh);
  const bounds = getMeshBounds(normalizedMesh);

  return {
    id: `obj_${makeSafeId(displayName)}_${Date.now()}`,
    display_name: displayName,
    category: "props",
    tags: ["generated", ...tags],
    origin: "center_floor",
    bounds,
    materials,
    material_settings: materials.map((material) =>
      createDefaultMaterialSetting(material),
    ),
    model_kind: "mesh",
    parts: [],
    mesh: normalizedMesh,
    decals: [],
    reference_images: [],
    collision: {
      profile: "custom_footprint",
      footprint: makeFootprint(bounds),
    },
  };
};

const createObjectFromParts = (
  displayName: string,
  parts: ObjectPart[],
  materials: string[],
  tags: string[],
): ObjectData => {
  const source: ObjectData = {
    id: `obj_${makeSafeId(displayName)}_${Date.now()}`,
    display_name: displayName,
    category: "props",
    tags: ["generated", ...tags],
    origin: "center_floor",
    bounds: [1, 1, 1],
    materials,
    material_settings: materials.map((material) =>
      createDefaultMaterialSetting(material),
    ),
    model_kind: "mesh",
    parts,
    decals: [],
    reference_images: [],
    collision: {
      profile: "single",
      footprint: [[0, 0]],
    },
  };
  const mesh = createMeshFromParts(source);
  const bounds = getMeshBounds(mesh);

  return {
    ...source,
    bounds,
    mesh,
    collision: {
      profile: "custom_footprint",
      footprint: makeFootprint(bounds),
    },
  };
};

const makeFace = (
  name: string,
  vertices: number[],
  material: string,
  group: string,
): ObjectMeshFace => ({
  name,
  vertices,
  material,
  group,
});

const createLatheMesh = (
  profile: [number, number][],
  segments: number,
  material: string,
  group: string,
): ObjectMeshData => {
  const mesh: ObjectMeshData = {
    vertices: [],
    faces: [],
    material_slots: [material],
    groups: [group],
  };

  for (let segment = 0; segment < segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    profile.forEach(([radius, y]) => {
      const safeRadius = Math.max(0.001, radius);
      mesh.vertices.push([safeRadius * cos, y, safeRadius * sin]);
    });
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    for (let ring = 0; ring < profile.length - 1; ring += 1) {
      const a = segment * profile.length + ring;
      const b = next * profile.length + ring;
      const c = next * profile.length + ring + 1;
      const d = segment * profile.length + ring + 1;
      mesh.faces.push(makeFace(`${group}_${segment}_${ring}`, [a, b, c, d], material, group));
    }
  }

  return mesh;
};

const createDrapeMesh = (
  displayName: string,
  material: string,
  width = 1.1,
  height = 1.4,
  foldCount = 5,
) => {
  const columns = 12;
  const rows = 10;
  const vertices: Vec3[] = [];
  const faces: ObjectMeshFace[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = (u - 0.5) * width * (1 - v * 0.18);
      const y = height * (1 - v);
      const wave = Math.sin(u * Math.PI * foldCount) * 0.08 * (0.25 + v);
      const z = 0.08 + wave;
      vertices.push([x, y, z]);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const stride = columns + 1;
      const a = row * stride + column;
      faces.push(
        makeFace(
          `fold_${row}_${column}`,
          [a, a + 1, a + stride + 1, a + stride],
          material,
          "drape",
        ),
      );
    }
  }

  return createObjectFromMesh(
    displayName,
    {
      vertices,
      faces,
      material_slots: [material],
      groups: ["drape"],
    },
    [material],
    ["cloth", "drape"],
  );
};

export const createGeneratedModel = (kind: ModelingGeneratorKind): ObjectData => {
  if (kind === "lathe_column") {
    return createObjectFromMesh(
      "Lathed Roman Column",
      createLatheMesh(
        [
          [0.38, 0],
          [0.44, 0.1],
          [0.28, 0.18],
          [0.24, 1.5],
          [0.31, 1.62],
          [0.42, 1.74],
        ],
        18,
        MATERIALS.oldMarble,
        "lathe_column",
      ),
      [MATERIALS.oldMarble],
      ["lathe", "column", "roman"],
    );
  }

  if (kind === "lathe_vase") {
    return createObjectFromMesh(
      "Lathed Offering Vase",
      createLatheMesh(
        [
          [0.2, 0],
          [0.36, 0.12],
          [0.46, 0.48],
          [0.3, 0.82],
          [0.18, 0.98],
          [0.26, 1.08],
        ],
        18,
        MATERIALS.marble,
        "lathe_vase",
      ),
      [MATERIALS.marble],
      ["lathe", "vase", "relic"],
    );
  }

  if (kind === "cloth_drape") {
    return createDrapeMesh("Hanging Cloth Drape", MATERIALS.cloth, 1.2, 1.35, 6);
  }

  if (kind === "holy_veil") {
    return createDrapeMesh("Marble Holy Veil", MATERIALS.oldMarble, 0.85, 1.2, 4);
  }

  if (kind === "relief_tablet") {
    return createObjectFromParts(
      "Carved Relief Tablet",
      [
        {
          shape: "box",
          name: "tablet",
          position: [0, 0.42, 0],
          rotation: [0, 0, 0],
          size: [0.92, 0.72, 0.12],
          material: MATERIALS.marble,
        },
        {
          shape: "box",
          name: "raised_glyph_a",
          position: [-0.18, 0.45, 0.075],
          rotation: [0, 0, 0],
          size: [0.06, 0.42, 0.04],
          material: MATERIALS.blackStone,
        },
        {
          shape: "box",
          name: "raised_glyph_b",
          position: [0.14, 0.45, 0.075],
          rotation: [0, 0, 0.22],
          size: [0.06, 0.4, 0.04],
          material: MATERIALS.blackStone,
        },
      ],
      [MATERIALS.marble, MATERIALS.blackStone],
      ["relief", "stamp", "inscription"],
    );
  }

  if (kind === "capsule_limb") {
    return createKitbashModel("folded_hands");
  }

  if (kind === "bust_head") {
    return createObjectFromParts(
      "Roman Bust Head",
      [
        {
          shape: "cylinder",
          name: "neck",
          position: [0, 0.52, 0],
          rotation: [0, 0, 0],
          size: [0.22, 0.46, 0.22],
          segments: 10,
          material: MATERIALS.marble,
        },
        {
          shape: "sphere",
          name: "head",
          position: [0, 0.96, 0],
          rotation: [0, 0, 0],
          size: [0.48, 0.56, 0.46],
          material: MATERIALS.marble,
        },
        {
          shape: "box",
          name: "roman_nose",
          position: [0, 0.98, 0.27],
          rotation: [0, 0, 0],
          size: [0.055, 0.16, 0.05],
          material: MATERIALS.oldMarble,
        },
        {
          shape: "sphere",
          name: "shoulder_mass",
          position: [0, 0.25, 0],
          rotation: [0, 0, 0],
          size: [0.92, 0.34, 0.52],
          material: MATERIALS.oldMarble,
        },
      ],
      [MATERIALS.marble, MATERIALS.oldMarble],
      ["bust", "head", "roman"],
    );
  }

  return createObjectFromParts(
    "Beveled Stone Slab",
    [
      {
        shape: "box",
        name: "core",
        position: [0, 0.2, 0],
        rotation: [0, 0, 0],
        size: [1.05, 0.32, 0.78],
        material: MATERIALS.marble,
      },
      {
        shape: "box",
        name: "top_inset",
        position: [0, 0.39, 0],
        rotation: [0, 0, 0],
        size: [0.86, 0.08, 0.58],
        material: MATERIALS.oldMarble,
      },
      {
        shape: "box",
        name: "shadow_chamfer",
        position: [0, 0.06, 0],
        rotation: [0, 0, 0],
        size: [1.22, 0.08, 0.95],
        material: MATERIALS.blackStone,
      },
    ],
    [MATERIALS.marble, MATERIALS.oldMarble, MATERIALS.blackStone],
    ["beveled", "slab", "architecture"],
  );
};

export const createKitbashModel = (kind: KitbashGeneratorKind): ObjectData => {
  if (kind === "roman_nose") {
    return createObjectFromParts(
      "Roman Nose Kit",
      [
        {
          shape: "box",
          name: "nose_bridge",
          position: [0, 0.22, 0.02],
          rotation: [0, 0, 0],
          size: [0.07, 0.28, 0.08],
          material: MATERIALS.marble,
        },
        {
          shape: "box",
          name: "nose_tip",
          position: [0, 0.08, 0.05],
          rotation: [0, 0, 0],
          size: [0.11, 0.08, 0.08],
          material: MATERIALS.oldMarble,
        },
      ],
      [MATERIALS.marble, MATERIALS.oldMarble],
      ["kitbash", "face"],
    );
  }

  if (kind === "folded_hands") {
    return createObjectFromParts(
      "Folded Hands Kit",
      [
        {
          shape: "cylinder",
          name: "left_forearm",
          position: [-0.13, 0.2, 0],
          rotation: [0, 0.25, 1.35],
          size: [0.12, 0.48, 0.12],
          segments: 10,
          material: MATERIALS.marble,
        },
        {
          shape: "cylinder",
          name: "right_forearm",
          position: [0.13, 0.14, 0],
          rotation: [0, -0.25, -1.35],
          size: [0.12, 0.48, 0.12],
          segments: 10,
          material: MATERIALS.marble,
        },
        {
          shape: "sphere",
          name: "left_hand",
          position: [-0.04, 0.26, 0.18],
          rotation: [0, 0, 0],
          size: [0.13, 0.11, 0.1],
          material: MATERIALS.oldMarble,
        },
        {
          shape: "sphere",
          name: "right_hand",
          position: [0.04, 0.18, 0.18],
          rotation: [0, 0, 0],
          size: [0.13, 0.11, 0.1],
          material: MATERIALS.oldMarble,
        },
      ],
      [MATERIALS.marble, MATERIALS.oldMarble],
      ["kitbash", "limb", "hands"],
    );
  }

  if (kind === "gold_halo") {
    return createObjectFromParts(
      "Gold Halo Kit",
      [
        {
          shape: "cylinder",
          name: "halo_disc",
          position: [0, 0.54, 0],
          rotation: [Math.PI / 2, 0, 0],
          size: [0.78, 0.045, 0.78],
          segments: 18,
          material: MATERIALS.gold,
        },
        {
          shape: "cylinder",
          name: "marble_mask",
          position: [0, 0.54, 0.02],
          rotation: [Math.PI / 2, 0, 0],
          size: [0.5, 0.03, 0.5],
          segments: 18,
          material: MATERIALS.marble,
        },
      ],
      [MATERIALS.gold, MATERIALS.marble],
      ["kitbash", "halo", "holy"],
    );
  }

  if (kind === "fluted_column") return createGeneratedModel("lathe_column");
  if (kind === "roman_plinth") return createGeneratedModel("beveled_slab");

  if (kind === "candle") {
    return createObjectFromParts(
      "Candle Kit",
      [
        {
          shape: "cylinder",
          name: "wax",
          position: [0, 0.18, 0],
          rotation: [0, 0, 0],
          size: [0.16, 0.36, 0.16],
          segments: 10,
          material: MATERIALS.marble,
        },
        {
          shape: "cone",
          name: "flame",
          position: [0, 0.44, 0],
          rotation: [0, 0, 0],
          size: [0.13, 0.22, 0.13],
          segments: 8,
          material: MATERIALS.gold,
        },
      ],
      [MATERIALS.marble, MATERIALS.gold],
      ["kitbash", "light", "candle"],
    );
  }

  if (kind === "iron_hinge") {
    return createObjectFromParts(
      "Iron Hinge Kit",
      [
        {
          shape: "box",
          name: "plate",
          position: [0, 0.18, 0],
          rotation: [0, 0, 0],
          size: [0.42, 0.28, 0.05],
          material: MATERIALS.blackStone,
        },
        {
          shape: "cylinder",
          name: "pin",
          position: [0, 0.18, 0.05],
          rotation: [Math.PI / 2, 0, 0],
          size: [0.12, 0.08, 0.12],
          segments: 8,
          material: MATERIALS.gold,
        },
      ],
      [MATERIALS.blackStone, MATERIALS.gold],
      ["kitbash", "hinge", "metal"],
    );
  }

  return createObjectFromParts(
    "Wood Crate Kit",
    [
      {
        shape: "box",
        name: "crate_body",
        position: [0, 0.24, 0],
        rotation: [0, 0, 0],
        size: [0.58, 0.48, 0.52],
        material: MATERIALS.wood,
      },
      {
        shape: "box",
        name: "front_slat",
        position: [0, 0.28, 0.285],
        rotation: [0, 0, 0.12],
        size: [0.56, 0.06, 0.035],
        material: MATERIALS.blackStone,
      },
      {
        shape: "box",
        name: "side_slat",
        position: [0.3, 0.28, 0],
        rotation: [0, 0, -0.12],
        size: [0.035, 0.06, 0.5],
        material: MATERIALS.blackStone,
      },
    ],
    [MATERIALS.wood, MATERIALS.blackStone],
    ["kitbash", "crate", "wood"],
  );
};
