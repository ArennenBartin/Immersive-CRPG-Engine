import type { ObjectData } from "../schema/game";

const part = (
  shape: ObjectData["parts"][number]["shape"],
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: string,
  rotation: [number, number, number] = [0, 0, 0],
): ObjectData["parts"][number] => ({
  shape,
  name,
  position,
  rotation,
  size,
  material,
});

const object = (
  id: string,
  displayName: string,
  category: string,
  tags: string[],
  bounds: [number, number, number],
  parts: ObjectData["parts"],
  collision: ObjectData["collision"],
  materials: string[],
): ObjectData => ({
  id,
  display_name: displayName,
  category,
  tags,
  origin: "center_floor",
  bounds,
  materials,
  material_settings: [],
  model_kind: "parts",
  parts,
  decals: [],
  reference_images: [],
  collision,
});

const tile = (id: string, displayName: string, color: string, tags: string[]) =>
  object(
    id,
    displayName,
    "jam_tile",
    ["jam", "tile", ...tags],
    [1, 0.04, 1],
    [part("box", "surface", [0, 0.01, 0], [1, 0.02, 1], color)],
    { profile: "none", footprint: [[0, 0]] },
    [color],
  );

// Kept only to load maps previously authored with the retired generator.
export const JAM_OBJECT_LIBRARY: ObjectData[] = [
  tile("obj_jam_ground", "Jam Ground Loam", "#314532", ["ground", "grass"]),
  tile("obj_jam_path", "Jam Worn Path", "#776247", ["path", "road"]),
  tile("obj_jam_stone", "Jam Old Stone", "#555a61", ["stone", "floor"]),
  tile("obj_jam_water", "Jam Dark Water", "#164e63", ["water"]),
  tile("obj_jam_scar", "Jam Scar Earth", "#5b2335", ["scar", "danger"]),
  object(
    "obj_jam_wall",
    "Jam Field Wall",
    "jam_structure",
    ["jam", "wall", "blocker"],
    [1, 3.2, 1],
    [
      part("box", "wall", [0, 1.45, 0], [1, 2.9, 1], "#5f6670"),
      part("box", "cap", [0, 2.94, 0], [1.06, 0.16, 1.06], "#7b818a"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#5f6670", "#7b818a"],
  ),
  object(
    "obj_jam_door",
    "Jam Simple Door",
    "jam_structure",
    ["jam", "door"],
    [1, 1.5, 0.16],
    [
      part("box", "slab", [0, 0.75, 0], [0.82, 1.5, 0.12], "#6b3f24"),
      part("sphere", "knob", [0.28, 0.76, -0.08], [0.08, 0.08, 0.08], "#d6b56d"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#6b3f24", "#d6b56d"],
  ),
  object(
    "obj_jam_tree",
    "Jam Leaning Tree",
    "jam_nature",
    ["jam", "tree", "nature"],
    [1, 3.2, 1],
    [
      part("cylinder", "trunk", [0, 0.8, 0], [0.26, 1.6, 0.26], "#56391f"),
      part("cone", "crown_low", [0, 1.75, 0], [1.15, 1.25, 1.15], "#234833"),
      part("cone", "crown_high", [0.08, 2.55, -0.06], [0.82, 1.05, 0.82], "#2f6445"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#56391f", "#234833", "#2f6445"],
  ),
  object(
    "obj_jam_ruin",
    "Jam Broken Ruin",
    "jam_structure",
    ["jam", "ruin", "stone"],
    [1, 1.4, 1],
    [
      part("box", "stub_a", [-0.25, 0.45, -0.1], [0.3, 0.9, 0.52], "#77736a"),
      part("box", "stub_b", [0.22, 0.32, 0.16], [0.42, 0.64, 0.28], "#5d5b55", [0, 0.28, 0]),
      part("slab", "fallen", [0.02, 0.08, 0.08], [0.9, 0.12, 0.42], "#68645d", [0.12, 0.42, 0]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#77736a", "#5d5b55", "#68645d"],
  ),
  object(
    "obj_jam_cliff",
    "Jam Cliff Face",
    "jam_landform",
    ["jam", "cliff", "blocker"],
    [1, 5, 1],
    [
      part("box", "mass", [0, 2.45, 0], [1.04, 4.9, 1.04], "#4b4b4f"),
      part("box", "ledge", [0.12, 4.95, -0.06], [0.72, 0.16, 0.86], "#6b6864"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#4b4b4f", "#6b6864"],
  ),
  object(
    "obj_jam_spire",
    "Jam High Spire",
    "jam_landmark",
    ["jam", "spire", "landmark", "tall"],
    [2.4, 50, 2.4],
    [
      part("cylinder", "shaft", [0, 17, 0], [1.1, 34, 1.1], "#51515f"),
      part("cone", "needle", [0, 42, 0], [2.2, 16, 2.2], "#727083"),
      part("sphere", "cold_light", [0, 50, 0], [0.42, 0.42, 0.42], "#9ee7ff"),
    ],
    {
      profile: "custom_footprint",
      footprint: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
    },
    ["#51515f", "#727083", "#9ee7ff"],
  ),
];

export const JAM_OBJECT_IDS = new Set(JAM_OBJECT_LIBRARY.map((objectDef) => objectDef.id));

export const getJamObjectById = (id: string) =>
  JAM_OBJECT_LIBRARY.find((objectDef) => objectDef.id === id);
