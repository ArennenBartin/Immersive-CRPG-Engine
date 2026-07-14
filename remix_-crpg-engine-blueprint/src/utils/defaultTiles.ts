// ── Default 2D tile sprites for the preset object library ────────────────────
// "Sprite tiles only": every bundled object needs a real pixel-art tile so the
// demo renders as a complete top-down map out of the box. Rather than hand-paint
// dozens of tiles, we generate deterministic 16×16 pixel sprites per object from
// a small style table. Terrain/walls/floors are opaque full-bleed tiles; props
// (doors, chests, signs, trees…) are silhouettes on a transparent background so
// the floor beneath shows through.

import type { SpriteData } from "../schema/game";
import { OBLIQUE_OBJECT_TILE_OVERRIDES } from "../data/obliqueTerrainAssets";
import { OBLIQUE_STRUCTURE_OBJECT_TILE_OVERRIDES } from "../data/obliqueStructureAssets";
import { OBLIQUE_BARRIER_OBJECT_TILE_OVERRIDES } from "../data/obliqueBarrierAssets";
import { OBLIQUE_PROP_OBJECT_TILE_OVERRIDES } from "../data/obliquePropAssets";

const SIZE = 16;
const T = "transparent";

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}
function rgbHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbHex(r + amt * 255, g + amt * 255, b + amt * 255);
}
// Deterministic per-tile noise so generated tiles look the same every run.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Buf = string[];
function blank(): Buf {
  return new Array(SIZE * SIZE).fill(T);
}
function set(buf: Buf, x: number, y: number, color: string) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  buf[y * SIZE + x] = color;
}
function rect(buf: Buf, x0: number, y0: number, x1: number, y1: number, color: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(buf, x, y, color);
}
function fill(buf: Buf, color: string) {
  rect(buf, 0, 0, SIZE - 1, SIZE - 1, color);
}
function border(buf: Buf, x0: number, y0: number, x1: number, y1: number, color: string) {
  for (let x = x0; x <= x1; x++) {
    set(buf, x, y0, color);
    set(buf, x, y1, color);
  }
  for (let y = y0; y <= y1; y++) {
    set(buf, x0, y, color);
    set(buf, x1, y, color);
  }
}

type Style =
  | "floor"
  | "wall"
  | "wood"
  | "water"
  | "grass"
  | "dirt"
  | "path"
  | "landmark"
  | "door"
  | "crate"
  | "chest"
  | "panel"
  | "beacon"
  | "tree"
  | "bush";

function genPixels(style: Style, base: string, accent: string, seed: number): Buf {
  const buf = blank();
  const rng = mulberry32(seed);
  const dark = shade(base, -0.12);
  const darker = shade(base, -0.22);
  const light = shade(base, 0.12);

  const speckle = (amt: number, hi: string, lo: string) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const r = rng();
        if (r < amt) set(buf, x, y, r < amt / 2 ? lo : hi);
      }
  };

  switch (style) {
    case "floor": {
      fill(buf, base);
      // 8×8 slab grout lines.
      for (let i = 0; i < SIZE; i++) {
        set(buf, 0, i, darker);
        set(buf, 8, i, darker);
        set(buf, i, 0, darker);
        set(buf, i, 8, darker);
      }
      speckle(0.14, light, dark);
      break;
    }
    case "grass":
    case "dirt":
    case "path":
    case "landmark": {
      fill(buf, base);
      speckle(style === "grass" ? 0.3 : 0.2, light, dark);
      if (style === "landmark") {
        // A small marker glyph so towns/spires stand out on the overworld.
        rect(buf, 6, 5, 9, 12, accent);
        rect(buf, 5, 11, 10, 12, shade(accent, -0.15));
        set(buf, 7, 4, shade(accent, 0.2));
      }
      break;
    }
    case "water": {
      fill(buf, base);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if ((x + y * 2 + Math.floor(rng() * 3)) % 7 === 0) set(buf, x, y, light);
        }
      break;
    }
    case "wall": {
      fill(buf, base);
      // Brick courses 4px tall, offset every other row, mortar lines darker.
      for (let y = 0; y < SIZE; y++) {
        if (y % 4 === 0) {
          for (let x = 0; x < SIZE; x++) set(buf, x, y, darker);
          continue;
        }
        const row = Math.floor(y / 4);
        const offset = row % 2 === 0 ? 0 : 4;
        for (let x = 0; x < SIZE; x++) {
          if ((x + offset) % 8 === 0) set(buf, x, y, darker);
          else if (rng() < 0.08) set(buf, x, y, dark);
        }
      }
      // Top highlight to suggest a raised wall in top-down view.
      rect(buf, 0, 0, SIZE - 1, 0, shade(base, 0.18));
      break;
    }
    case "wood": {
      fill(buf, base);
      for (let x = 0; x < SIZE; x += 4)
        for (let y = 0; y < SIZE; y++) set(buf, x, y, darker);
      speckle(0.08, light, dark);
      break;
    }
    case "door": {
      fill(buf, shade(base, -0.3)); // frame
      rect(buf, 2, 1, 13, 15, base); // door slab
      for (let x = 2; x <= 13; x += 3) rect(buf, x, 1, x, 15, dark); // planks
      rect(buf, 10, 7, 11, 8, accent); // handle
      border(buf, 2, 1, 13, 15, darker);
      break;
    }
    case "crate": {
      rect(buf, 2, 2, 13, 13, base);
      border(buf, 2, 2, 13, 13, darker);
      rect(buf, 2, 2, 13, 13, base);
      border(buf, 2, 2, 13, 13, darker);
      // Diagonal cross bands.
      for (let i = 0; i <= 11; i++) {
        set(buf, 2 + i, 2 + i, accent);
        set(buf, 13 - i, 2 + i, accent);
      }
      border(buf, 2, 2, 13, 13, darker);
      break;
    }
    case "chest": {
      rect(buf, 2, 6, 13, 13, base); // body
      rect(buf, 2, 4, 13, 6, shade(base, 0.14)); // lid
      border(buf, 2, 4, 13, 13, darker);
      rect(buf, 7, 8, 8, 10, accent); // lock
      break;
    }
    case "panel": {
      rect(buf, 6, 9, 9, 14, shade(base, 0.05)); // post
      rect(buf, 3, 2, 12, 9, shade(base, -0.1)); // screen housing
      rect(buf, 4, 3, 11, 8, accent); // screen glow
      for (let y = 4; y <= 7; y += 2) rect(buf, 4, y, 11, y, shade(accent, 0.25));
      border(buf, 3, 2, 12, 9, darker);
      break;
    }
    case "beacon": {
      rect(buf, 6, 7, 9, 14, shade(base, -0.05)); // column
      rect(buf, 4, 13, 11, 14, base); // base
      rect(buf, 6, 3, 9, 6, accent); // orb
      set(buf, 7, 2, shade(accent, 0.3));
      set(buf, 8, 2, shade(accent, 0.3));
      break;
    }
    case "tree": {
      rect(buf, 7, 10, 8, 14, "#5b3b1f"); // trunk
      rect(buf, 4, 3, 11, 10, base); // canopy
      rect(buf, 5, 2, 10, 3, shade(base, 0.12));
      for (let i = 0; i < 18; i++) set(buf, 4 + Math.floor(rng() * 8), 3 + Math.floor(rng() * 7), shade(base, -0.15));
      break;
    }
    case "bush": {
      rect(buf, 4, 7, 11, 13, base);
      rect(buf, 5, 6, 10, 7, shade(base, 0.12));
      for (let i = 0; i < 12; i++) set(buf, 4 + Math.floor(rng() * 8), 7 + Math.floor(rng() * 6), shade(base, -0.15));
      break;
    }
  }
  return buf;
}

// objectId -> [style, base, accent]
const TILE_TABLE: Record<string, [Style, string, string]> = {
  obj_floor_plate: ["floor", "#26324c", "#26324c"],
  obj_floor_stone: ["floor", "#4b5563", "#4b5563"],
  obj_floor_dirt: ["dirt", "#6b4f2f", "#6b4f2f"],
  obj_floor_wood: ["wood", "#7a5230", "#7a5230"],
  obj_wall_block: ["wall", "#4a4366", "#4a4366"],
  obj_wall_brick: ["wall", "#7c3f33", "#7c3f33"],
  obj_wall_stone: ["wall", "#5a5f6b", "#5a5f6b"],
  obj_chimney: ["wall", "#52555c", "#52555c"],
  obj_p_door: ["door", "#8B5A2B", "#FACC15"],
  obj_crate: ["crate", "#7C4A24", "#F59E0B"],
  obj_chest: ["chest", "#78350F", "#FACC15"],
  obj_terminal: ["panel", "#1f2a44", "#38BDF8"],
  obj_training_beacon: ["beacon", "#64748B", "#A78BFA"],
  obj_tree: ["tree", "#2f7d3a", "#2f7d3a"],
  obj_dead_tree: ["tree", "#6b5a3a", "#6b5a3a"],
  obj_bush: ["bush", "#2f7d3a", "#2f7d3a"],
  // Overworld terrain markers.
  obj_world_water: ["water", "#176076", "#176076"],
  obj_world_coast: ["dirt", "#caa56a", "#caa56a"],
  obj_world_plains: ["grass", "#3f7a3f", "#3f7a3f"],
  obj_world_hills: ["grass", "#5a7a3a", "#5a7a3a"],
  obj_world_forest: ["grass", "#1f5a2f", "#1f5a2f"],
  obj_world_marsh: ["grass", "#46603f", "#46603f"],
  obj_world_road: ["path", "#8a7253", "#8a7253"],
  obj_world_scar: ["path", "#6f243d", "#6f243d"],
  obj_world_fracture: ["landmark", "#3a1f4a", "#c084fc"],
  obj_world_town: ["landmark", "#5a4a36", "#facc15"],
  obj_world_city: ["landmark", "#4a4a55", "#e5e7eb"],
  obj_world_estate: ["landmark", "#4a5a36", "#a3e635"],
  obj_world_spire: ["landmark", "#1f2433", "#a855f7"],
};

let seedCounter = 100;
const sprites: SpriteData[] = [];
const objectMap: Record<string, string> = {};

for (const [objectId, [style, base, accent]] of Object.entries(TILE_TABLE)) {
  const spriteId = `tile_${objectId.replace(/^obj_/, "")}`;
  sprites.push({
    id: spriteId,
    display_name: `${objectId} tile`,
    width: SIZE,
    height: SIZE,
    pixels: genPixels(style, base, accent, seedCounter++),
  });
  objectMap[objectId] = spriteId;
}

// Generated bindings before the hand-authored overworld art takes precedence.
// Kept so persisted packages that still point at a generated tile can be
// migrated to the overworld sprite (see applyDefaultTiles in engineStore).
export const legacyObjectTileMap: Record<string, string> = { ...objectMap };

// Preset objects with a hand-authored Phase 1 overworld sprite use it instead
// of the generated tile. Sprite ids live in src/data/overworldAssets.ts.
export const overworldObjectTileOverrides: Record<string, string> = {
  obj_floor_dirt: "ovr_tile_dirt_path",
  obj_floor_stone: "ovr_tile_flagstone",
  obj_wall_block: "ovr_obj_wall_segment",
  obj_wall_stone: "ovr_obj_wall_segment",
  obj_p_door: "ovr_obj_door",
  obj_crate: "ovr_obj_crate",
  obj_chest: "ovr_obj_chest",
  obj_tree: "ovr_obj_tree",
  obj_bush: "ovr_obj_bush",
  obj_world_water: "ovr_tile_river",
  obj_world_coast: "ovr_tile_sand",
  obj_world_plains: "ovr_tile_grass",
  obj_world_hills: "ovr_tile_moss",
  obj_world_forest: "ovr_tile_forest_floor",
  obj_world_marsh: "ovr_tile_bog",
  obj_world_road: "ovr_tile_packed_road",
  obj_world_scar: "ovr_tile_fractured_ground",
  obj_world_fracture: "ovr_obj_dark_light_emitter",
  obj_world_town: "ovr_obj_market_stall",
  obj_world_city: "ovr_obj_shrine",
  obj_world_estate: "ovr_obj_covenant_marker",
  obj_world_spire: "ovr_obj_glass_column",
};

Object.assign(
  objectMap,
  overworldObjectTileOverrides,
  OBLIQUE_OBJECT_TILE_OVERRIDES,
  OBLIQUE_STRUCTURE_OBJECT_TILE_OVERRIDES,
  OBLIQUE_BARRIER_OBJECT_TILE_OVERRIDES,
  OBLIQUE_PROP_OBJECT_TILE_OVERRIDES,
);

export const defaultTileSprites: SpriteData[] = sprites;
export const defaultObjectTileMap: Record<string, string> = objectMap;
