import type { ObjectData, SpriteData } from "./game";
import { defaultTileSprites, defaultObjectTileMap } from "../utils/defaultTiles";
import { OVERWORLD_SPRITES } from "../data/overworldAssets";
import { OBLIQUE_TERRAIN_SPRITES } from "../data/obliqueTerrainAssets";
import { OBLIQUE_STRUCTURE_SPRITES } from "../data/obliqueStructureAssets";
import { OBLIQUE_BARRIER_SPRITES } from "../data/obliqueBarrierAssets";
import { OBLIQUE_PROP_SPRITES } from "../data/obliquePropAssets";
import { GENERATED_INTERCESSOR_PLAYER_SPRITES } from "../data/generatedPlayerAssets";

export const asciiToPixels = (
  ascii: string,
  palette: Record<string, string>,
): string[] => {
  const lines = ascii
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const pixels: string[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const char = lines[y]?.[x] || ".";
      pixels.push(palette[char] || "transparent");
    }
  }
  return pixels;
};

export const asciiToPixelsWH = (
  ascii: string,
  palette: Record<string, string>,
  width: number,
  height: number,
): string[] => {
  const lines = ascii
    .trim()
    .split("\n")
    .map((line) => line.trimEnd());
  const pixels: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const char = lines[y]?.[x] || ".";
      pixels.push(palette[char] || "transparent");
    }
  }
  return pixels;
};

const demoPalette = {
  ".": "transparent",
  K: "#161A22",
  k: "#2A303A",
  B: "#475569",
  b: "#334155",
  C: "#38BDF8",
  c: "#0E7490",
  G: "#22C55E",
  g: "#15803D",
  P: "#A78BFA",
  p: "#6D28D9",
  O: "#F97316",
  o: "#C2410C",
  W: "#E5E7EB",
  w: "#94A3B8",
  Y: "#FACC15",
  y: "#A16207",
  R: "#EF4444",
  r: "#991B1B",
};

const playerPattern = `
................
.....KKKKK......
....KWWWWWK.....
....KWCCCWK.....
....KWCCCWK.....
.....KWWWK......
....KKBBBKK.....
...KBBBBBBBK....
..KBBBGGBBBBK...
..KBBBGGBBBBK...
...KBBBBBBBK....
....KBB.BBK.....
....KBB.BBK.....
....Kbb.Kbb.....
...KKK...KKK....
................
`;

const guidePattern = `
................
.....KKKKK......
....KWWWWWK.....
....KWGGGWK.....
....KWGGGWK.....
.....KWWWK......
....KKpppKK.....
...KPPPPPPPK....
..KPPPYYYPPPK...
..KPPPYYYPPPK...
...KPPPPPPPK....
....KPP.PPK.....
....KPP.PPK.....
....Kpp.Kpp.....
...KKK...KKK....
................
`;

const companionPattern = `
................
.....KKKKK......
....KWWWWWK.....
....KWOOOWK.....
....KWOOOWK.....
.....KWWWK......
....KKbbbKK.....
...KBBBBBBBK....
..KBBBRRBBBBK...
..KBBBRRBBBBK...
...KBBBBBBBK....
....KBB.BBK.....
....KBB.BBK.....
....Kbb.Kbb.....
...KKK...KKK....
................
`;

const botPattern = `
................
................
.....KKKKK......
....KBBBBBK.....
...KBBCCCKBK....
...KBCYYYCBK....
...KBBCCCBK.....
....KBBBBK......
...KKBBBBKK.....
..KBBKBBKBBK....
..KBBKBBKBBK....
....KBBBK.......
....KKBKK.......
...KK...KK......
................
................
`;

const tonicPattern = `
................
................
.......CC.......
......CWWC......
......CCCC......
.....KGGGGK.....
....KGGGGGGK....
....KGGGGGGK....
....KGGGGGGK....
.....KGGGGK.....
......KKKK......
................
................
................
................
................
`;

const tokenPattern = `
................
................
.....KYYYYK.....
....KYYYYYYK....
...KYYKYYKYYK...
...KYYYYYYYYK...
...KYYKYYKYYK...
....KYYYYYYK....
.....KYYYYK.....
................
................
................
................
................
................
................
`;

const keyPattern = `
................
................
....YYYY........
...Y....Y.......
...Y....Y.......
....YYYYYYYYY...
.......Y...Y.Y..
................
................
................
................
................
................
................
................
................
`;

const baseSpriteLibraryPresets: SpriteData[] = [
  {
    id: "spr_player",
    display_name: "Demo Player",
    width: 16,
    height: 16,
    pixels: asciiToPixels(playerPattern, demoPalette),
  },
  {
    id: "spr_guide",
    display_name: "Guide",
    width: 16,
    height: 16,
    pixels: asciiToPixels(guidePattern, demoPalette),
  },
  {
    id: "spr_companion",
    display_name: "Companion",
    width: 16,
    height: 16,
    pixels: asciiToPixels(companionPattern, demoPalette),
  },
  {
    id: "spr_training_bot",
    display_name: "Training Bot",
    width: 16,
    height: 16,
    pixels: asciiToPixels(botPattern, demoPalette),
  },
  {
    id: "spr_itm_health_tonic",
    display_name: "Health Tonic",
    width: 16,
    height: 16,
    pixels: asciiToPixels(tonicPattern, demoPalette),
  },
  {
    id: "spr_itm_training_token",
    display_name: "Training Token",
    width: 16,
    height: 16,
    pixels: asciiToPixels(tokenPattern, demoPalette),
  },
  {
    id: "spr_itm_practice_key",
    display_name: "Practice Key",
    width: 16,
    height: 16,
    pixels: asciiToPixels(keyPattern, demoPalette),
  },
];

// Character/item sprites, the generated default top-down tile sprites, and the
// hand-authored Phase 0/1 overworld library plus the active oblique terrain skin.
export const spriteLibraryPresets: SpriteData[] = [
  ...baseSpriteLibraryPresets,
  ...defaultTileSprites,
  ...OVERWORLD_SPRITES,
  ...OBLIQUE_TERRAIN_SPRITES,
  ...OBLIQUE_STRUCTURE_SPRITES,
  ...OBLIQUE_BARRIER_SPRITES,
  ...OBLIQUE_PROP_SPRITES,
  ...GENERATED_INTERCESSOR_PLAYER_SPRITES,
];

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

type SimulationPreset = Partial<NonNullable<ObjectData["simulation"]>>;

const simulationPreset = (simulation?: SimulationPreset): ObjectData["simulation"] | undefined =>
  simulation
    ? {
        condition: "intact",
        integrity: 1,
        condition_tags: [],
        mass_kg: 1,
        bulk: 1,
        awkwardness: 0,
        push_difficulty: 1,
        carry_size: "hand",
        requires_cooperation: false,
        ...simulation,
      }
    : undefined;

const object = (
  id: string,
  displayName: string,
  category: string,
  tags: string[],
  bounds: [number, number, number],
  parts: ObjectData["parts"],
  collision: ObjectData["collision"],
  materials: string[],
  simulation?: SimulationPreset,
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
  simulation: simulationPreset(simulation),
});

const roofObject = (
  id: string,
  displayName: string,
  accent: "flat" | "north" | "south" | "east" | "west" | "nw" | "ne" | "se" | "sw",
  baseColor = "#8B5A2B",
  trimColor = "#5C2E1D",
): ObjectData => {
  const accentParts: ObjectData["parts"] = [];
  if (accent !== "flat") {
    const eastWest = accent === "east" || accent === "west";
    const corner = accent.length === 2;
    accentParts.push(
      part(
        "box",
        "eave",
        [
          accent.includes("w") || accent === "west" ? -0.34 : accent.includes("e") || accent === "east" ? 0.34 : 0,
          0.15,
          accent.includes("n") || accent === "north" ? -0.34 : accent.includes("s") || accent === "south" ? 0.34 : 0,
        ],
        corner ? [0.38, 0.1, 0.38] : eastWest ? [0.16, 0.12, 1.04] : [1.04, 0.12, 0.16],
        trimColor,
      ),
    );
  }

  return object(
    id,
    displayName,
    "structure",
    ["roof", "tile", "overhead"],
    [1, 0.18, 1],
    [
      part("box", "roof", [0, 0.08, 0], [1.08, 0.16, 1.08], baseColor),
      part("box", "ridge", [0, 0.18, 0], [0.82, 0.04, 0.08], trimColor),
      ...accentParts,
    ],
    { profile: "none", footprint: [[0, 0]] },
    [baseColor, trimColor],
  );
};

const roofLibraryPresets: ObjectData[] = [
  roofObject("obj_roof_tile", "Clay Roof Plateau", "flat", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_flat", "Clay Roof Flat", "flat", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_n", "Clay Roof North Eave", "north", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_s", "Clay Roof South Eave", "south", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_e", "Clay Roof East Eave", "east", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_w", "Clay Roof West Eave", "west", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_hip_ne", "Clay Roof Hip NE", "ne", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_hip_nw", "Clay Roof Hip NW", "nw", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_hip_se", "Clay Roof Hip SE", "se", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_clay_hip_sw", "Clay Roof Hip SW", "sw", "#A65F2B", "#6B331F"),
  roofObject("obj_p_roof_flat", "Slate Roof Flat", "flat", "#334155", "#111827"),
  roofObject("obj_p_roof_n", "Slate Roof North Eave", "north", "#334155", "#111827"),
  roofObject("obj_p_roof_s", "Slate Roof South Eave", "south", "#334155", "#111827"),
  roofObject("obj_p_roof_e", "Slate Roof East Eave", "east", "#334155", "#111827"),
  roofObject("obj_p_roof_w", "Slate Roof West Eave", "west", "#334155", "#111827"),
  roofObject("obj_p_roof_hip_ne", "Slate Roof Hip NE", "ne", "#334155", "#111827"),
  roofObject("obj_p_roof_hip_nw", "Slate Roof Hip NW", "nw", "#334155", "#111827"),
  roofObject("obj_p_roof_hip_se", "Slate Roof Hip SE", "se", "#334155", "#111827"),
  roofObject("obj_p_roof_hip_sw", "Slate Roof Hip SW", "sw", "#334155", "#111827"),
];

const spearZoneObjectPresets: ObjectData[] = [
  object(
    "obj_grief_glass",
    "Grief-Glass Shard",
    "story",
    ["spear", "glass", "anchor", "grief"],
    [1, 0.75, 1],
    [
      part("cylinder", "setting", [0, 0.08, 0], [0.58, 0.16, 0.58], "#475569"),
      part("sphere", "soft_glass", [0, 0.42, 0], [0.34, 0.5, 0.34], "#BAE6FD"),
      part("ring", "comfort_ring", [0, 0.43, 0], [0.48, 0.06, 0.48], "#E0F2FE"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#475569", "#BAE6FD", "#E0F2FE"],
  ),
  object(
    "obj_spear_relic",
    "Cold Spear Relic",
    "story",
    ["spear", "relic", "anchor", "pre_grid"],
    [1, 1.45, 1],
    [
      part("cylinder", "shaft", [0, 0.58, 0], [0.08, 1.18, 0.08], "#1F2937", [0.28, 0, -0.22]),
      part("cone", "head", [0.2, 1.12, -0.16], [0.22, 0.44, 0.22], "#CBD5E1", [0.28, 0, -0.22]),
      part("box", "cold_shadow", [-0.08, 0.05, 0.08], [0.7, 0.04, 0.18], "#0F172A", [0, 0.8, 0]),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#1F2937", "#CBD5E1", "#0F172A"],
  ),
  object(
    "obj_bell_keeper_glass",
    "Bell-Keeper Glass Wall",
    "story",
    ["spear", "glass", "anchor", "bell_keeper"],
    [1, 1.75, 1],
    [
      part("box", "wall_shard", [0, 0.72, 0], [0.76, 1.38, 0.2], "#93C5FD"),
      part("cylinder", "small_bell", [0, 1.42, 0.02], [0.28, 0.22, 0.28], "#B45309"),
      part("box", "sealed_line", [0, 0.7, 0.13], [0.56, 0.04, 0.04], "#F8FAFC"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#93C5FD", "#B45309", "#F8FAFC"],
  ),
  object(
    "obj_reclamation_vat",
    "Reclamation Glass Vat",
    "story",
    ["spear", "glass", "anchor", "reclamation"],
    [1, 1.1, 1],
    [
      part("cylinder", "vat", [0, 0.35, 0], [0.78, 0.7, 0.78], "#64748B"),
      part("cylinder", "liquid_glass", [0, 0.72, 0], [0.66, 0.08, 0.66], "#67E8F9"),
      part("box", "ledger_slot", [0, 0.48, 0.42], [0.36, 0.18, 0.06], "#1E293B"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#64748B", "#67E8F9", "#1E293B"],
  ),
  object(
    "obj_vampire_ledger",
    "Crimson Ledger Stand",
    "story",
    ["spear", "anchor", "consent", "vampire"],
    [1, 1.0, 1],
    [
      part("box", "stand", [0, 0.34, 0], [0.16, 0.68, 0.16], "#3F1D2B"),
      part("box", "ledger", [0, 0.78, 0], [0.72, 0.08, 0.48], "#7F1D1D", [-0.18, 0, 0]),
      part("box", "page_line", [0, 0.84, 0.02], [0.54, 0.02, 0.04], "#FECACA", [-0.18, 0, 0]),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#3F1D2B", "#7F1D1D", "#FECACA"],
  ),
  object(
    "obj_saint_reliquary",
    "Saint Reliquary Threshold",
    "story",
    ["spear", "anchor", "saint", "reliquary"],
    [1, 1.8, 1],
    [
      part("cylinder", "plinth", [0, 0.16, 0], [0.88, 0.32, 0.88], "#E5E7EB"),
      part("arch", "threshold_arch", [0, 0.95, 0], [0.86, 1.52, 0.22], "#CBD5E1"),
      part("sphere", "false_halo", [0, 1.62, 0], [0.36, 0.08, 0.36], "#FACC15"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#E5E7EB", "#CBD5E1", "#FACC15"],
  ),
];

const baseObjectLibraryPresets: ObjectData[] = [
  object(
    "obj_floor_plate",
    "Floor Plate",
    "terrain",
    ["tile", "ground"],
    [1, 0.06, 1],
    [part("box", "plate", [0, 0.02, 0], [1, 0.04, 1], "#334155")],
    { profile: "none", footprint: [[0, 0]] },
    ["#334155"],
    { material_id: "sim_mat_stone", mass_kg: 12, bulk: 1, carry_size: "oversized" },
  ),
  object(
    "obj_wall_block",
    "Wall Block",
    "structure",
    ["wall", "tile"],
    [1, 1.8, 1],
    [
      part("box", "base", [0, 0.9, 0], [1, 1.8, 1], "#475569"),
      part("box", "cap", [0, 1.84, 0], [1.08, 0.12, 1.08], "#64748B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#475569", "#64748B"],
    {
      material_id: "sim_mat_stone",
      mass_kg: 800,
      bulk: 8,
      awkwardness: 1,
      push_difficulty: 20,
      carry_size: "immovable",
      requires_cooperation: true,
    },
  ),
  object(
    "obj_p_door",
    "Door",
    "structure",
    ["door", "interactable"],
    [1, 1.65, 0.18],
    [
      part("box", "door", [0, 0.8, 0], [0.92, 1.6, 0.14], "#8B5A2B"),
      part("box", "handle", [0.26, 0.84, 0.09], [0.08, 0.08, 0.05], "#FACC15"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#8B5A2B", "#FACC15"],
    {
      material_id: "sim_mat_wood",
      mass_kg: 35,
      bulk: 2,
      awkwardness: 0.25,
      push_difficulty: 2,
      carry_size: "oversized",
    },
  ),
  object(
    "obj_crate",
    "Supply Crate",
    "prop",
    ["crate", "cover"],
    [1, 0.8, 1],
    [
      part("box", "crate", [0, 0.4, 0], [0.86, 0.8, 0.86], "#7C4A24"),
      part("box", "band_x", [0, 0.44, 0.46], [0.72, 0.08, 0.04], "#F59E0B"),
      part("box", "band_z", [0.46, 0.44, 0], [0.04, 0.08, 0.72], "#F59E0B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#F59E0B"],
    {
      material_id: "sim_mat_wood",
      mass_kg: 35,
      bulk: 2,
      awkwardness: 0.35,
      push_difficulty: 3,
      carry_size: "oversized",
    },
  ),
  object(
    "obj_chest",
    "Storage Chest",
    "container",
    ["container", "interactable"],
    [1, 0.7, 1],
    [
      part("box", "base", [0, 0.32, 0], [0.9, 0.54, 0.72], "#78350F"),
      part("box", "lid", [0, 0.66, 0], [0.94, 0.18, 0.76], "#92400E"),
      part("box", "lock", [0, 0.44, 0.39], [0.16, 0.18, 0.06], "#FACC15"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#78350F", "#92400E", "#FACC15"],
    {
      material_id: "sim_mat_wood",
      mass_kg: 55,
      bulk: 3,
      awkwardness: 0.55,
      push_difficulty: 5,
      carry_size: "oversized",
    },
  ),
  object(
    "obj_terminal",
    "Info Terminal",
    "prop",
    ["interactable", "sign"],
    [1, 1.5, 1],
    [
      part("box", "post", [0, 0.55, 0], [0.16, 1.1, 0.16], "#475569"),
      part("box", "screen", [0, 1.12, 0], [0.88, 0.46, 0.12], "#0F172A"),
      part("box", "glow", [0, 1.13, 0.07], [0.68, 0.28, 0.03], "#38BDF8"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#475569", "#0F172A", "#38BDF8"],
  ),
  object(
    "obj_training_beacon",
    "Training Beacon",
    "prop",
    ["marker"],
    [1, 1.4, 1],
    [
      part("cylinder", "base", [0, 0.12, 0], [0.72, 0.24, 0.72], "#334155"),
      part("cylinder", "column", [0, 0.72, 0], [0.22, 1.2, 0.22], "#64748B"),
      part("sphere", "light", [0, 1.42, 0], [0.38, 0.38, 0.38], "#A78BFA"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#334155", "#64748B", "#A78BFA"],
  ),
  object(
    "obj_bed",
    "Simple Wooden Bed",
    "furniture",
    ["prop", "furniture", "rest"],
    [1, 0.75, 1],
    [
      part("box", "frame", [0, 0.24, 0], [0.96, 0.28, 0.9], "#7C4A24"),
      part("box", "mattress", [0, 0.45, 0.02], [0.82, 0.2, 0.76], "#94A3B8"),
      part("box", "pillow", [0, 0.58, -0.25], [0.62, 0.16, 0.22], "#E5E7EB"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#94A3B8", "#E5E7EB"],
    { material_id: "sim_mat_wood", mass_kg: 45, bulk: 3, awkwardness: 0.7, push_difficulty: 4, carry_size: "oversized" },
  ),
  object(
    "obj_bedroll",
    "Straw Bedroll",
    "furniture",
    ["prop", "furniture", "rest", "flammable"],
    [1, 0.24, 1],
    [part("box", "roll", [0, 0.1, 0], [0.82, 0.18, 0.68], "#C2A365")],
    { profile: "none", footprint: [[0, 0]] },
    ["#C2A365"],
    { material_id: "sim_mat_cloth", mass_kg: 6, bulk: 1.2, awkwardness: 0.2, push_difficulty: 1, carry_size: "armful" },
  ),
  object(
    "obj_chair",
    "Wooden Chair",
    "furniture",
    ["prop", "furniture", "seat", "pushable"],
    [1, 0.95, 1],
    [
      part("box", "seat", [0, 0.38, 0], [0.56, 0.12, 0.52], "#7C4A24"),
      part("box", "back", [0, 0.74, -0.22], [0.56, 0.64, 0.1], "#8B5A2B"),
      part("box", "front_rail", [0, 0.22, 0.26], [0.62, 0.08, 0.08], "#5C2E1D"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#8B5A2B", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 8, bulk: 1, awkwardness: 0.25, push_difficulty: 1, carry_size: "armful" },
  ),
  object(
    "obj_small_table",
    "Small Square Table",
    "furniture",
    ["prop", "furniture", "table", "pushable"],
    [1, 0.75, 1],
    [
      part("box", "top", [0, 0.62, 0], [0.78, 0.12, 0.78], "#8B5A2B"),
      part("box", "front_leg", [-0.25, 0.3, 0.25], [0.1, 0.58, 0.1], "#5C2E1D"),
      part("box", "front_leg_2", [0.25, 0.3, 0.25], [0.1, 0.58, 0.1], "#5C2E1D"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#8B5A2B", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 18, bulk: 1.5, awkwardness: 0.35, push_difficulty: 2, carry_size: "oversized" },
  ),
  object(
    "obj_bookshelf",
    "Tall Bookshelf",
    "furniture",
    ["prop", "furniture", "shelf", "blocks_los"],
    [1, 1.7, 1],
    [
      part("box", "case", [0, 0.84, 0], [0.92, 1.62, 0.34], "#7C4A24"),
      part("box", "shelf_a", [0, 0.55, 0.2], [0.82, 0.06, 0.08], "#5C2E1D"),
      part("box", "shelf_b", [0, 1.0, 0.2], [0.82, 0.06, 0.08], "#5C2E1D"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 70, bulk: 4, awkwardness: 0.9, push_difficulty: 7, carry_size: "oversized" },
  ),
  object(
    "obj_oil_lamp",
    "Standing Oil Lamp",
    "prop",
    ["prop", "light", "fragile", "flammable"],
    [1, 1.2, 1],
    [
      part("cylinder", "base", [0, 0.08, 0], [0.34, 0.12, 0.34], "#475569"),
      part("cylinder", "stand", [0, 0.52, 0], [0.08, 0.86, 0.08], "#374151"),
      part("sphere", "flame", [0, 1.03, 0], [0.18, 0.24, 0.18], "#F97316"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#475569", "#374151", "#F97316"],
    { material_id: "sim_mat_metal", mass_kg: 4, bulk: 0.6, awkwardness: 0.2, push_difficulty: 1, carry_size: "hand" },
  ),
  object(
    "obj_well",
    "Stone Well",
    "structure",
    ["prop", "well", "water_source", "blocks_move"],
    [1, 1.25, 1],
    [
      part("cylinder", "stone_ring", [0, 0.32, 0], [0.86, 0.54, 0.86], "#6B7280"),
      part("box", "roof", [0, 1.05, 0], [0.98, 0.16, 0.82], "#7C4A24"),
      part("cylinder", "bucket", [0, 0.72, 0], [0.24, 0.24, 0.24], "#8B5A2B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#6B7280", "#7C4A24", "#8B5A2B"],
    { material_id: "sim_mat_stone", mass_kg: 500, bulk: 5, awkwardness: 1, push_difficulty: 15, carry_size: "immovable", requires_cooperation: true },
  ),
  object(
    "obj_rubble_pile",
    "Rubble Pile",
    "structure",
    ["prop", "rubble", "cover", "blocks_move"],
    [1, 0.65, 1],
    [
      part("box", "stone_a", [-0.22, 0.16, 0.04], [0.42, 0.24, 0.36], "#6B7280", [0, 0.24, 0]),
      part("box", "stone_b", [0.2, 0.22, -0.06], [0.46, 0.3, 0.32], "#9CA3AF", [0, -0.18, 0]),
      part("box", "plank", [0.06, 0.42, 0.12], [0.7, 0.08, 0.16], "#7C4A24", [0, 0.4, 0.16]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#6B7280", "#9CA3AF", "#7C4A24"],
    { material_id: "sim_mat_stone", mass_kg: 180, bulk: 3, awkwardness: 0.8, push_difficulty: 10, carry_size: "oversized" },
  ),
  object(
    "obj_ladder",
    "Wooden Ladder",
    "prop",
    ["prop", "ladder", "climb", "flammable"],
    [1, 0.28, 1],
    [
      part("box", "rail_a", [-0.24, 0.1, 0], [0.08, 0.12, 0.88], "#7C4A24"),
      part("box", "rail_b", [0.24, 0.1, 0], [0.08, 0.12, 0.88], "#7C4A24"),
      part("box", "rung", [0, 0.16, 0], [0.58, 0.08, 0.08], "#5C2E1D"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#7C4A24", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 12, bulk: 1.4, awkwardness: 0.55, push_difficulty: 2, carry_size: "oversized" },
  ),
  object(
    "obj_shop_counter",
    "Shop Counter",
    "furniture",
    ["prop", "counter", "container", "blocks_move"],
    [1, 0.95, 1],
    [
      part("box", "counter", [0, 0.42, 0], [0.94, 0.78, 0.72], "#7C4A24"),
      part("box", "top", [0, 0.84, 0], [0.98, 0.1, 0.76], "#A16207"),
      part("box", "drawer", [0, 0.48, 0.38], [0.34, 0.18, 0.05], "#5C2E1D"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#A16207", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 75, bulk: 4, awkwardness: 0.8, push_difficulty: 7, carry_size: "oversized" },
  ),
  object(
    "obj_mechanism_workbench",
    "Mechanism Workbench",
    "furniture",
    ["prop", "workbench", "mechanism", "conductive", "interactable"],
    [1, 1.0, 1],
    [
      part("box", "bench", [0, 0.42, 0], [0.9, 0.72, 0.72], "#7C4A24"),
      part("cylinder", "wheel", [0.26, 0.86, 0.06], [0.28, 0.08, 0.28], "#475569", [1.5708, 0, 0]),
      part("box", "vise", [-0.22, 0.82, 0.08], [0.24, 0.18, 0.16], "#64748B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#475569", "#64748B"],
    { material_id: "sim_mat_wood", mass_kg: 85, bulk: 4, awkwardness: 0.85, push_difficulty: 7, carry_size: "oversized" },
  ),
  object(
    "obj_stone_altar",
    "Stone Altar",
    "story",
    ["prop", "altar", "ritual", "blocks_move"],
    [1, 0.9, 1],
    [
      part("box", "base", [0, 0.32, 0], [0.9, 0.58, 0.72], "#CBD5E1"),
      part("box", "slab", [0, 0.66, 0], [0.96, 0.16, 0.82], "#E5E7EB"),
      part("sphere", "candle", [0.24, 0.84, 0.12], [0.1, 0.18, 0.1], "#FACC15"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#CBD5E1", "#E5E7EB", "#FACC15"],
    { material_id: "sim_mat_stone", mass_kg: 260, bulk: 4, awkwardness: 1, push_difficulty: 12, carry_size: "immovable" },
  ),
  object(
    "obj_cupboard",
    "Wooden Cupboard",
    "container",
    ["prop", "container", "cupboard", "blocks_move"],
    [1, 1.45, 1],
    [
      part("box", "case", [0, 0.72, 0], [0.86, 1.34, 0.42], "#7C4A24"),
      part("box", "door_a", [-0.22, 0.72, 0.24], [0.36, 1.08, 0.04], "#8B5A2B"),
      part("box", "door_b", [0.22, 0.72, 0.24], [0.36, 1.08, 0.04], "#8B5A2B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#8B5A2B"],
    { material_id: "sim_mat_wood", mass_kg: 65, bulk: 3.5, awkwardness: 0.8, push_difficulty: 6, carry_size: "oversized" },
  ),
  object(
    "obj_iron_stove",
    "Iron Stove",
    "prop",
    ["prop", "stove", "heat_source", "metal", "blocks_move"],
    [1, 1.05, 1],
    [
      part("box", "body", [0, 0.42, 0], [0.72, 0.72, 0.68], "#1F2937"),
      part("cylinder", "pipe", [0, 0.95, -0.08], [0.26, 0.4, 0.26], "#374151"),
      part("box", "door", [0, 0.38, 0.36], [0.42, 0.32, 0.05], "#111827"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#1F2937", "#374151", "#111827"],
    { material_id: "sim_mat_metal", mass_kg: 120, bulk: 2.8, awkwardness: 0.6, push_difficulty: 8, carry_size: "oversized" },
  ),
  object(
    "obj_broken_statue",
    "Broken Statue Fragment",
    "story",
    ["prop", "statue", "stone", "cover"],
    [1, 1.25, 1],
    [
      part("box", "base", [0, 0.14, 0], [0.76, 0.24, 0.68], "#9CA3AF"),
      part("column", "fragment", [0.05, 0.66, 0], [0.36, 1.0, 0.32], "#CBD5E1", [0.18, 0, -0.12]),
      part("box", "fallen_chip", [-0.28, 0.22, 0.24], [0.26, 0.12, 0.18], "#E5E7EB", [0, 0.5, 0]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#9CA3AF", "#CBD5E1", "#E5E7EB"],
    { material_id: "sim_mat_stone", mass_kg: 190, bulk: 3, awkwardness: 0.8, push_difficulty: 10, carry_size: "oversized" },
  ),
  object(
    "obj_floor_hatch",
    "Metal Floor Hatch",
    "structure",
    ["prop", "hatch", "openable", "metal"],
    [1, 0.12, 1],
    [
      part("box", "plate", [0, 0.04, 0], [0.86, 0.08, 0.86], "#374151"),
      part("box", "bar_a", [0, 0.1, 0], [0.72, 0.04, 0.08], "#111827"),
      part("ring", "handle", [-0.22, 0.14, 0.2], [0.18, 0.04, 0.18], "#64748B"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#374151", "#111827", "#64748B"],
    { material_id: "sim_mat_metal", mass_kg: 35, bulk: 1.2, awkwardness: 0.4, push_difficulty: 4, carry_size: "oversized" },
  ),
  object(
    "obj_wind_bent_tree",
    "Wind-Bent Young Tree",
    "nature",
    ["prop", "nature", "tree", "fellable", "flammable", "blocks_los", "blocks_move"],
    [1, 1.75, 1],
    [
      part("cylinder", "trunk", [-0.06, 0.66, 0], [0.18, 1.32, 0.18], "#4A3326", [0.12, 0, -0.28]),
      part("sphere", "crown_low", [0.16, 1.3, -0.08], [0.72, 0.34, 0.5], "#166534"),
      part("sphere", "crown_high", [0.34, 1.56, -0.12], [0.62, 0.28, 0.42], "#3F7A3F"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#4A3326", "#166534", "#3F7A3F"],
    { material_id: "sim_mat_wood", mass_kg: 140, bulk: 4, awkwardness: 0.9, push_difficulty: 9, carry_size: "immovable" },
  ),
  object(
    "obj_fallen_log",
    "Fallen Log",
    "nature",
    ["prop", "nature", "log", "cover", "flammable", "blocks_move"],
    [1, 0.55, 1],
    [
      part("cylinder", "log", [0, 0.28, 0], [0.32, 0.88, 0.32], "#5B4632", [0, 0, 1.5708]),
      part("box", "roots", [-0.32, 0.18, 0.18], [0.34, 0.12, 0.22], "#4A3326", [0.2, 0.45, 0.1]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#5B4632", "#4A3326"],
    { material_id: "sim_mat_wood", mass_kg: 110, bulk: 3.5, awkwardness: 0.8, push_difficulty: 8, carry_size: "oversized" },
  ),
  object(
    "obj_mossy_boulders",
    "Mossy Boulder Cluster",
    "nature",
    ["prop", "nature", "stone", "boulder", "cover", "blocks_los", "blocks_move"],
    [1, 0.9, 1],
    [
      part("sphere", "boulder_a", [-0.18, 0.36, 0.02], [0.52, 0.52, 0.48], "#6B7280"),
      part("sphere", "boulder_b", [0.22, 0.28, -0.08], [0.42, 0.42, 0.38], "#9CA3AF"),
      part("sphere", "moss", [-0.12, 0.62, 0.04], [0.36, 0.08, 0.28], "#4D7C0F"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#6B7280", "#9CA3AF", "#4D7C0F"],
    { material_id: "sim_mat_stone", mass_kg: 420, bulk: 4.5, awkwardness: 1, push_difficulty: 15, carry_size: "immovable" },
  ),
  object(
    "obj_thorn_bramble",
    "Thorn Bramble Clump",
    "nature",
    ["prop", "nature", "bramble", "thorn", "flammable", "blocks_los", "blocks_move"],
    [1, 0.9, 1],
    [
      part("ring", "vine_a", [-0.16, 0.42, 0], [0.58, 0.08, 0.58], "#5B4632", [0.6, 0.2, 0.3]),
      part("ring", "vine_b", [0.14, 0.5, 0.08], [0.5, 0.08, 0.5], "#4A3326", [-0.3, 0.4, -0.4]),
      part("sphere", "leaves", [0.04, 0.42, 0], [0.58, 0.24, 0.5], "#166534"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#5B4632", "#4A3326", "#166534"],
    { material_id: "sim_mat_wood", mass_kg: 25, bulk: 2, awkwardness: 0.5, push_difficulty: 5, carry_size: "oversized" },
  ),
  object(
    "obj_reed_clump",
    "Tall Reed Clump",
    "nature",
    ["prop", "nature", "reed", "flammable", "blocks_los"],
    [1, 1.15, 1],
    [
      part("box", "reed_a", [-0.18, 0.5, 0], [0.05, 1.0, 0.05], "#4D7C0F", [0.16, 0, -0.08]),
      part("box", "reed_b", [0.05, 0.58, 0.08], [0.05, 1.12, 0.05], "#3F6212", [-0.12, 0, 0.1]),
      part("sphere", "seed_heads", [0.02, 1.04, 0], [0.52, 0.12, 0.16], "#A16207"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#4D7C0F", "#3F6212", "#A16207"],
    { material_id: "sim_mat_wood", mass_kg: 8, bulk: 1.2, awkwardness: 0.25, push_difficulty: 2, carry_size: "armful" },
  ),
  object(
    "obj_firewood_pile",
    "Stacked Firewood Pile",
    "prop",
    ["prop", "wood", "fuel", "flammable", "cover", "blocks_move"],
    [1, 0.72, 1],
    [
      part("box", "stack_low", [0, 0.2, 0.08], [0.86, 0.16, 0.46], "#7C4A24"),
      part("box", "stack_mid", [0, 0.38, -0.02], [0.76, 0.16, 0.4], "#5C2E1D"),
      part("box", "stack_high", [0.05, 0.56, 0.06], [0.62, 0.14, 0.36], "#8B5A2B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#5C2E1D", "#8B5A2B"],
    { material_id: "sim_mat_wood", mass_kg: 45, bulk: 2.2, awkwardness: 0.45, push_difficulty: 4, carry_size: "oversized" },
  ),
  object(
    "obj_hay_bales",
    "Hay Bale Stack",
    "prop",
    ["prop", "hay", "flammable", "cover", "blocks_move"],
    [1, 0.8, 1],
    [
      part("box", "bale_a", [-0.22, 0.28, 0.12], [0.42, 0.36, 0.42], "#C2A365"),
      part("box", "bale_b", [0.22, 0.28, 0.08], [0.42, 0.36, 0.42], "#A16207"),
      part("box", "bale_top", [0, 0.62, -0.08], [0.5, 0.34, 0.42], "#D6B86A"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#C2A365", "#A16207", "#D6B86A"],
    { material_id: "sim_mat_cloth", mass_kg: 35, bulk: 2.5, awkwardness: 0.55, push_difficulty: 4, carry_size: "oversized" },
  ),
  object(
    "obj_rain_barrel",
    "Rain Barrel",
    "prop",
    ["prop", "barrel", "water_source", "container", "blocks_move"],
    [1, 0.95, 1],
    [
      part("cylinder", "barrel", [0, 0.44, 0], [0.68, 0.86, 0.68], "#7C4A24"),
      part("ring", "hoop_a", [0, 0.26, 0], [0.72, 0.06, 0.72], "#374151"),
      part("ring", "water", [0, 0.9, 0], [0.58, 0.04, 0.58], "#176076"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#374151", "#176076"],
    { material_id: "sim_mat_wood", mass_kg: 80, bulk: 2.8, awkwardness: 0.6, push_difficulty: 6, carry_size: "oversized" },
  ),
  object(
    "obj_broken_field_fence",
    "Broken Field Fence",
    "structure",
    ["prop", "fence", "broken", "flammable", "blocks_move"],
    [1, 0.85, 1],
    [
      part("box", "post_a", [-0.32, 0.36, 0], [0.12, 0.72, 0.12], "#7C4A24"),
      part("box", "post_b", [0.34, 0.32, 0], [0.12, 0.64, 0.12], "#7C4A24"),
      part("box", "rail", [0, 0.48, 0.04], [0.82, 0.1, 0.1], "#5C2E1D", [0.12, 0, -0.12]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 28, bulk: 1.6, awkwardness: 0.45, push_difficulty: 3, carry_size: "oversized" },
  ),
  object(
    "obj_plank_pile",
    "Loose Timber Plank Pile",
    "prop",
    ["prop", "wood", "planks", "flammable", "cover"],
    [1, 0.45, 1],
    [
      part("box", "plank_a", [-0.08, 0.15, 0.02], [0.92, 0.08, 0.16], "#8B5A2B", [0, 0.28, 0]),
      part("box", "plank_b", [0.04, 0.25, -0.08], [0.78, 0.08, 0.14], "#7C4A24", [0, -0.3, 0]),
      part("box", "plank_c", [0.1, 0.34, 0.08], [0.58, 0.08, 0.14], "#5C2E1D", [0, 0.52, 0]),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#8B5A2B", "#7C4A24", "#5C2E1D"],
    { material_id: "sim_mat_wood", mass_kg: 24, bulk: 1.6, awkwardness: 0.45, push_difficulty: 3, carry_size: "oversized" },
  ),
  object(
    "obj_roof_tile_debris",
    "Roof Tile Debris",
    "prop",
    ["prop", "debris", "roof_tile", "cover"],
    [1, 0.45, 1],
    [
      part("box", "tile_a", [-0.18, 0.12, 0.08], [0.5, 0.08, 0.22], "#A65F2B", [0.08, 0.28, 0]),
      part("box", "tile_b", [0.18, 0.18, -0.02], [0.54, 0.08, 0.22], "#8A4A2A", [0, -0.22, 0]),
      part("box", "brick", [0.02, 0.28, 0.22], [0.26, 0.14, 0.18], "#7C3F33"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#A65F2B", "#8A4A2A", "#7C3F33"],
    { material_id: "sim_mat_stone", mass_kg: 35, bulk: 1.5, awkwardness: 0.35, push_difficulty: 3, carry_size: "oversized" },
  ),
  object(
    "obj_chimney_bricks",
    "Chimney Pot And Bricks",
    "prop",
    ["prop", "debris", "chimney", "stone", "blocks_move"],
    [1, 0.85, 1],
    [
      part("cylinder", "chimney_pot", [-0.12, 0.44, -0.04], [0.32, 0.7, 0.32], "#8A4A2A"),
      part("box", "brick_a", [0.22, 0.2, 0.16], [0.32, 0.18, 0.18], "#7C3F33"),
      part("box", "brick_b", [0.12, 0.38, -0.18], [0.36, 0.18, 0.2], "#A65F2B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#8A4A2A", "#7C3F33", "#A65F2B"],
    { material_id: "sim_mat_stone", mass_kg: 90, bulk: 2.2, awkwardness: 0.5, push_difficulty: 6, carry_size: "oversized" },
  ),
  object(
    "obj_boarded_window_frame",
    "Boarded Window Frame",
    "structure",
    ["prop", "window", "boarded", "flammable", "fragile", "blocks_los", "blocks_move"],
    [1, 1.1, 1],
    [
      part("box", "frame", [0, 0.52, 0], [0.78, 0.88, 0.08], "#5C2E1D"),
      part("box", "board_a", [0, 0.52, 0.08], [0.9, 0.12, 0.08], "#8B5A2B", [0, 0, 0.32]),
      part("box", "board_b", [0, 0.72, 0.1], [0.84, 0.1, 0.08], "#7C4A24", [0, 0, -0.24]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#5C2E1D", "#8B5A2B", "#7C4A24"],
    { material_id: "sim_mat_wood", mass_kg: 30, bulk: 1.8, awkwardness: 0.45, push_difficulty: 4, carry_size: "oversized" },
  ),
  object(
    "obj_broken_door_boards",
    "Broken Door Boards",
    "prop",
    ["prop", "door", "broken", "wood", "flammable", "cover"],
    [1, 0.45, 1],
    [
      part("box", "door_plank_a", [-0.08, 0.14, 0.04], [0.78, 0.1, 0.22], "#7C4A24", [0, 0.18, 0]),
      part("box", "door_plank_b", [0.08, 0.28, -0.04], [0.72, 0.1, 0.18], "#5C2E1D", [0, -0.24, 0]),
      part("ring", "handle", [0.18, 0.36, 0.16], [0.18, 0.04, 0.18], "#A16207"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#7C4A24", "#5C2E1D", "#A16207"],
    { material_id: "sim_mat_wood", mass_kg: 22, bulk: 1.4, awkwardness: 0.35, push_difficulty: 2, carry_size: "oversized" },
  ),
  object(
    "obj_grave_cairn_marker",
    "Grave Cairn Marker",
    "story",
    ["prop", "grave", "cairn", "marker", "stone", "blocks_move"],
    [1, 1.05, 1],
    [
      part("box", "marker", [0, 0.48, -0.04], [0.32, 0.82, 0.18], "#9CA3AF"),
      part("sphere", "cairn_a", [-0.2, 0.16, 0.16], [0.24, 0.18, 0.22], "#6B7280"),
      part("sphere", "cairn_b", [0.22, 0.16, 0.12], [0.28, 0.18, 0.24], "#CBD5E1"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#9CA3AF", "#6B7280", "#CBD5E1"],
    { material_id: "sim_mat_stone", mass_kg: 120, bulk: 2.3, awkwardness: 0.6, push_difficulty: 7, carry_size: "oversized" },
  ),
  object(
    "obj_roadside_shrine",
    "Roadside Shrine Signpost",
    "story",
    ["prop", "shrine", "signpost", "marker", "flammable"],
    [1, 1.45, 1],
    [
      part("box", "post", [0, 0.58, 0], [0.14, 1.12, 0.14], "#7C4A24"),
      part("box", "shrine_box", [0, 1.02, 0.06], [0.52, 0.54, 0.28], "#5C2E1D"),
      part("box", "little_roof", [0, 1.34, 0.02], [0.64, 0.12, 0.38], "#8B5A2B"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#7C4A24", "#5C2E1D", "#8B5A2B"],
    { material_id: "sim_mat_wood", mass_kg: 26, bulk: 1.6, awkwardness: 0.45, push_difficulty: 3, carry_size: "oversized" },
  ),
  ...spearZoneObjectPresets,
  object(
    "obj_floor_dirt",
    "Dirt Ground",
    "terrain",
    ["tile", "ground", "dirt"],
    [1, 0.05, 1],
    [part("box", "dirt", [0, 0.015, 0], [1, 0.03, 1], "#6B4F2A")],
    { profile: "none", footprint: [[0, 0]] },
    ["#6B4F2A"],
  ),
  object(
    "obj_floor_stone",
    "Stone Paving",
    "terrain",
    ["tile", "ground", "stone"],
    [1, 0.06, 1],
    [
      part("box", "stone", [0, 0.018, 0], [1, 0.036, 1], "#6B7280"),
      part("box", "joint", [0, 0.04, 0], [0.92, 0.01, 0.08], "#374151"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#6B7280", "#374151"],
  ),
  object(
    "obj_floor_wood",
    "Wood Floor",
    "terrain",
    ["tile", "ground", "wood"],
    [1, 0.06, 1],
    [
      part("box", "boards", [0, 0.018, 0], [1, 0.036, 1], "#8B5A2B"),
      part("box", "seam", [0, 0.04, 0], [0.08, 0.01, 0.92], "#5C2E1D"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#8B5A2B", "#5C2E1D"],
  ),
  object(
    "obj_wall_stone",
    "Stone Wall",
    "structure",
    ["wall", "building"],
    [1, 1.95, 1],
    [
      part("box", "wall", [0, 0.98, 0], [1, 1.9, 1], "#6B7280"),
      part("box", "cap", [0, 1.96, 0], [1.08, 0.12, 1.08], "#9CA3AF"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#6B7280", "#9CA3AF"],
  ),
  object(
    "obj_wall_brick",
    "Brick Wall",
    "structure",
    ["wall", "building"],
    [1, 1.85, 1],
    [
      part("box", "wall", [0, 0.92, 0], [1, 1.8, 1], "#8A4A2A"),
      part("box", "lintel", [0, 1.86, 0], [1.08, 0.1, 1.08], "#5C2E1D"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#8A4A2A", "#5C2E1D"],
  ),
  ...roofLibraryPresets,
  object(
    "obj_chimney",
    "Roof Chimney",
    "structure",
    ["roof", "chimney"],
    [0.5, 0.7, 0.5],
    [
      part("box", "stack", [0, 0.32, 0], [0.36, 0.64, 0.36], "#5C2E1D"),
      part("box", "cap", [0, 0.68, 0], [0.48, 0.08, 0.48], "#374151"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#5C2E1D", "#374151"],
  ),
  object(
    "obj_tree",
    "Pine Tree",
    "nature",
    ["prop", "nature", "tree"],
    [1, 2.1, 1],
    [
      part("cylinder", "trunk", [0, 0.55, 0], [0.22, 1.1, 0.22], "#4A3326", [0.05, 0, -0.04]),
      part("cone", "lower_needles", [0, 1.06, 0], [0.95, 0.86, 0.95], "#14532D"),
      part("cone", "middle_needles", [0.02, 1.46, -0.03], [0.72, 0.72, 0.72], "#166534"),
      part("cone", "top_needles", [-0.02, 1.82, 0.02], [0.48, 0.56, 0.48], "#15803D"),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#4A3326", "#14532D", "#166534", "#15803D"],
  ),
  object(
    "obj_dead_tree",
    "Dead Tree",
    "nature",
    ["prop", "nature", "dead_tree"],
    [1, 1.75, 1],
    [
      part("cylinder", "crooked_trunk", [0, 0.68, 0], [0.22, 1.32, 0.22], "#4B3A2A", [0.12, 0, -0.08]),
      part("box", "branch_east", [0.28, 1.0, 0.02], [0.62, 0.09, 0.1], "#5B4632", [0, 0.2, 0.48]),
      part("box", "branch_west", [-0.22, 1.18, 0.08], [0.52, 0.08, 0.09], "#5B4632", [0.2, -0.35, -0.38]),
      part("box", "branch_back", [0.02, 1.34, -0.22], [0.1, 0.08, 0.48], "#5B4632", [-0.42, 0.1, 0.1]),
    ],
    { profile: "single", footprint: [[0, 0]] },
    ["#4B3A2A", "#5B4632"],
  ),
  object(
    "obj_bush",
    "Bush",
    "nature",
    ["prop", "nature", "bush"],
    [1, 0.65, 1],
    [
      part("sphere", "main", [0, 0.34, 0], [0.62, 0.52, 0.62], "#166534"),
      part("sphere", "left", [-0.26, 0.28, 0.1], [0.42, 0.34, 0.42], "#15803D"),
      part("sphere", "right", [0.25, 0.26, -0.12], [0.38, 0.32, 0.38], "#14532D"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#166534", "#15803D", "#14532D"],
  ),
  object(
    "obj_world_water",
    "World Water",
    "terrain",
    ["tile", "terrain", "overworld", "water"],
    [1, 0.04, 1],
    [part("box", "water", [0, 0.01, 0], [1, 0.02, 1], "#1D4ED8")],
    { profile: "none", footprint: [[0, 0]] },
    ["#1D4ED8"],
  ),
  object(
    "obj_world_coast",
    "World Coast",
    "terrain",
    ["tile", "terrain", "overworld", "coast"],
    [1, 0.05, 1],
    [part("box", "coast", [0, 0.015, 0], [1, 0.03, 1], "#D6B66D")],
    { profile: "none", footprint: [[0, 0]] },
    ["#D6B66D"],
  ),
  object(
    "obj_world_marsh",
    "World Marsh",
    "terrain",
    ["tile", "terrain", "overworld", "marsh"],
    [1, 0.05, 1],
    [part("box", "marsh", [0, 0.015, 0], [1, 0.03, 1], "#3F6212")],
    { profile: "none", footprint: [[0, 0]] },
    ["#3F6212"],
  ),
  object(
    "obj_world_plains",
    "World Plains",
    "terrain",
    ["tile", "terrain", "overworld", "plains"],
    [1, 0.05, 1],
    [part("box", "plains", [0, 0.015, 0], [1, 0.03, 1], "#65A30D")],
    { profile: "none", footprint: [[0, 0]] },
    ["#65A30D"],
  ),
  object(
    "obj_world_forest",
    "World Forest",
    "terrain",
    ["tile", "terrain", "overworld", "forest"],
    [1, 0.16, 1],
    [
      part("box", "forest_floor", [0, 0.015, 0], [1, 0.03, 1], "#166534"),
      part("cone", "canopy", [0, 0.12, 0], [0.52, 0.18, 0.52], "#14532D"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#166534", "#14532D"],
  ),
  object(
    "obj_world_hills",
    "World Hills",
    "terrain",
    ["tile", "terrain", "overworld", "hills"],
    [1, 0.14, 1],
    [
      part("box", "hill_floor", [0, 0.015, 0], [1, 0.03, 1], "#78716C"),
      part("sphere", "rise", [0, 0.09, 0], [0.66, 0.14, 0.66], "#57534E"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#78716C", "#57534E"],
  ),
  object(
    "obj_world_scar",
    "World Scar",
    "terrain",
    ["tile", "terrain", "overworld", "scar"],
    [1, 0.05, 1],
    [part("box", "scar", [0, 0.015, 0], [1, 0.03, 1], "#3F1D2B")],
    { profile: "none", footprint: [[0, 0]] },
    ["#3F1D2B"],
  ),
  object(
    "obj_world_road",
    "World Road",
    "terrain",
    ["tile", "terrain", "overworld", "road"],
    [1, 0.06, 1],
    [part("box", "road", [0, 0.018, 0], [1, 0.036, 1], "#A16207")],
    { profile: "none", footprint: [[0, 0]] },
    ["#A16207"],
  ),
  object(
    "obj_world_city",
    "World City Marker",
    "landmark",
    ["overworld", "landmark", "city"],
    [1, 1.25, 1],
    [
      part("cylinder", "plaza", [0, 0.05, 0], [0.88, 0.1, 0.88], "#475569"),
      part("box", "tower_a", [-0.18, 0.48, -0.04], [0.24, 0.86, 0.24], "#CBD5E1"),
      part("box", "tower_b", [0.14, 0.34, 0.14], [0.22, 0.58, 0.22], "#94A3B8"),
      part("cone", "spire", [-0.18, 0.98, -0.04], [0.28, 0.28, 0.28], "#FACC15"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#475569", "#CBD5E1", "#94A3B8", "#FACC15"],
  ),
  object(
    "obj_world_town",
    "World Town Marker",
    "landmark",
    ["overworld", "landmark", "town"],
    [1, 0.75, 1],
    [
      part("box", "hall", [-0.16, 0.23, 0], [0.34, 0.34, 0.34], "#EAB308"),
      part("cone", "hall_roof", [-0.16, 0.48, 0], [0.42, 0.22, 0.42], "#92400E"),
      part("box", "house", [0.22, 0.18, 0.1], [0.26, 0.26, 0.26], "#FDE68A"),
      part("cone", "house_roof", [0.22, 0.38, 0.1], [0.32, 0.18, 0.32], "#B45309"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#EAB308", "#92400E", "#FDE68A", "#B45309"],
  ),
  object(
    "obj_world_estate",
    "World Estate Marker",
    "landmark",
    ["overworld", "landmark", "estate"],
    [1, 0.8, 1],
    [
      part("box", "manor", [0, 0.28, 0], [0.58, 0.48, 0.36], "#E5E7EB"),
      part("box", "roof", [0, 0.56, 0], [0.68, 0.14, 0.44], "#64748B"),
      part("column", "column_a", [-0.18, 0.18, 0.22], [0.08, 0.36, 0.08], "#CBD5E1"),
      part("column", "column_b", [0.18, 0.18, 0.22], [0.08, 0.36, 0.08], "#CBD5E1"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#E5E7EB", "#64748B", "#CBD5E1"],
  ),
  object(
    "obj_world_fracture",
    "World Fracture Marker",
    "landmark",
    ["overworld", "landmark", "fracture"],
    [1, 0.16, 1],
    [
      part("box", "crack_a", [0, 0.05, 0], [0.82, 0.06, 0.12], "#1F2937"),
      part("box", "crack_b", [0.18, 0.055, 0.18], [0.12, 0.07, 0.6], "#7F1D1D"),
      part("box", "glow", [-0.14, 0.06, -0.08], [0.5, 0.04, 0.08], "#EF4444"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#1F2937", "#7F1D1D", "#EF4444"],
  ),
  object(
    "obj_world_spire",
    "World Spire Marker",
    "landmark",
    ["overworld", "landmark", "spire"],
    [1, 1.45, 1],
    [
      part("cylinder", "base", [0, 0.12, 0], [0.46, 0.24, 0.46], "#111827"),
      part("cone", "needle", [0, 0.82, 0], [0.38, 1.3, 0.38], "#A855F7"),
      part("sphere", "crown", [0, 1.42, 0], [0.22, 0.22, 0.22], "#FACC15"),
    ],
    { profile: "none", footprint: [[0, 0]] },
    ["#111827", "#A855F7", "#FACC15"],
  ),
];

// Bind each preset object to its generated default top-down tile sprite, so the
// bundled game renders as a complete tile map in the 2D renderer.
export const objectLibraryPresets: ObjectData[] = baseObjectLibraryPresets.map(
  (o) => ({
    ...o,
    tile_sprite_id: o.tile_sprite_id ?? defaultObjectTileMap[o.id],
  }),
);
