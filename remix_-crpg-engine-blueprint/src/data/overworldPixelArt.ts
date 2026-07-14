// ── Hand-authored overworld pixel art: helpers, terrain tiles, objects ────────
// Every sprite here is drawn by hand as a 16×16 ASCII grid and mapped onto the
// locked Phase 0 palette. Shading follows one rule set: light from the top-left,
// 3-tone ramps (shadow / base / highlight), ink outlines on props and actors,
// hand-placed dithering only — no gradients, no generated noise.

import {
  C,
  OVERWORLD_TILE_SIZE,
  rampDark,
  rampLight,
  type OverworldPaletteId,
} from "./overworldPalette";

export type Pixels = string[];
export const T = "transparent";
export type CharMap = Record<string, string>;

// Authoring mistakes (wrong row count / width, unmapped chars) are collected
// here instead of throwing, so one audit run reports every problem at once.
// The audit script fails hard if this list is non-empty.
export const OVERWORLD_ART_ERRORS: string[] = [];

export const grid = (name: string, art: string): string[] => {
  const rows = art
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  if (rows.length !== OVERWORLD_TILE_SIZE) {
    OVERWORLD_ART_ERRORS.push(`${name}: ${rows.length} rows (want 16)`);
  }
  const fixed: string[] = [];
  for (let y = 0; y < OVERWORLD_TILE_SIZE; y += 1) {
    let row = rows[y] ?? ".".repeat(OVERWORLD_TILE_SIZE);
    if (row.length !== OVERWORLD_TILE_SIZE) {
      OVERWORLD_ART_ERRORS.push(`${name} row ${y}: ${row.length} cols "${row}"`);
      row = row.length > OVERWORLD_TILE_SIZE
        ? row.slice(0, OVERWORLD_TILE_SIZE)
        : row.padEnd(OVERWORLD_TILE_SIZE, row[row.length - 1] ?? ".");
    }
    fixed.push(row);
  }
  return fixed;
};

export const paint = (name: string, rows: string[], map: CharMap): Pixels => {
  const pixels: Pixels = [];
  for (const row of rows) {
    for (const ch of row) {
      const color = map[ch];
      if (color === undefined) {
        OVERWORLD_ART_ERRORS.push(`${name}: unmapped char "${ch}"`);
        pixels.push(T);
      } else {
        pixels.push(color);
      }
    }
  }
  return pixels;
};

export const mirrorRows = (rows: string[]): string[] =>
  rows.map((row) => [...row].reverse().join(""));

export const art = (name: string, ascii: string, map: CharMap): Pixels =>
  paint(name, grid(name, ascii), map);

// Fixed palette shorthand shared by prop/actor charmaps. Swappable ramp chars
// (B/D/H, A/a/h, S/s) are layered on per sprite.
export const FIXED_CHARS: CharMap = {
  ".": T,
  O: C("ink"),
  K: C("night"),
  L: C("stone_light"),
  M: C("stone"),
  m: C("stone_dark"),
  W: C("white"),
  V: C("bone"),
  R: C("red"),
  F: C("orange"),
  Y: C("gold"),
  C: C("cyan"),
  G: C("glass"),
  U: C("purple"),
  u: C("purple_dark"),
  N: C("green_glow"),
  w: C("water_light"),
  d: C("wood_dark"),
  o: C("wood"),
  J: C("road"),
  I: C("dirt"),
  i: C("dirt_dark"),
  g: C("grass"),
  e: C("grass_light"),
  q: C("grass_dark"),
  z: C("slate"),
  x: C("moss"),
  r: C("reed"),
  n: C("sand"),
  b: C("water"),
  k: C("water_dark"),
};

// ══════════════════════════════════════════════════════════════════════════════
// TERRAIN TILES — full-bleed 16×16 ground textures.
// Template chars: "," base   "'" light   ";" dark   ":" deep/second dark
// plus fixed extras noted per template.
// ══════════════════════════════════════════════════════════════════════════════

const terrainMap = (
  base: OverworldPaletteId,
  light: string,
  dark: string,
  deep?: string,
): CharMap => ({
  ",": C(base),
  "'": light,
  ";": dark,
  ":": deep ?? dark,
});

// Meadow grass: sparse hand-placed tufts, each a light blade over a dark root.
const GRASS_TUFTS = `
,,,,,,,,,,,,,,,,
,,,,,,,,,,;,,,,,
,'',,,,,,';;,,,,
,;;',,,,,,,,,,,,
,,;,,,,,,,,,,',,
,,,,,,',,,,,'';,
,,,,,';;,,,,,;,,
,,,,,,;,,,,,,,,,
,,,,,,,,,,,,,,,,
,'',,,,,,,,;,,,,
,;;,,,,,,,';',,,
,,,,,,,,,,,;;,,,
,,,',,,,,,,,,,,,
,,';;,,,,,,,,',,
,,,;,,,,',,,';;,
,,,,,,,,,,,,,;,,
`;

// Bare earth: pebbles and short dry strokes.
const EARTH_SCATTER = `
,,,,,,,,,,,,,,,,
,,;;,,,,,,',,,,,
,,,,,,,;,,,,,,,,
,',,,,,;;,,,,;,,
,,,,,,,,,,,,,,,,
,,,,;,,,,,'',,,,
,,,;;',,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,;,,,,,',,
,';,,,,,,,,,;;,,
,,,,,,',,,,,,,,,
,,,,,,,,,,,,,,,,
,;,,,,,,;;,,,,,,
,,,,,',,,;,,,,,,
,,,,,,,,,,,,',,,
,,,,,,,,,,,,,,,,
`;

// Packed road: two worn wheel-ruts with breaks, kicked stones between.
const ROAD_RUTS = `
,,;,,',,,,,,;,,,
,,;,,,,,,,,,;,,,
,,,,,,,',,,,;,,'
,,;,,,,,,,,,,,,,
,,;,,,,;,,,,;,,,
,,;,',,,,,,,;,,,
,,,,,,,,,,,,;,',
,,;,,,,,,,,,,,,,
,,;,,,,',,,,;,,,
,,;,,,,,,,,,;,,,
,,,,;,,,,,,,,,,,
,,;,,,,,,,,,;,,,
,,;,,,',,,,,;,,,
,,,,,,,,,;,,,,,,
,,;,,,,,,,,,;,',
,,;,,,,,,,,,;,,,
`;

// Mud: sunken wet pools (deep) with dark rims, a few dull glints.
const MUD_POOLS = `
,,,,,,,,,,,,,,,,
,,,;;;,,,,,,,,,,
,,;:::;,,,,,;;,,
,,;::':,,,,;'::,
,,,;;;,,,,,;::;,
,,,,,,,,,,,,;;,,
,,,,,,,;,,,,,,,,
,;;,,,,,,,,,,,,,
;'::,,,,,,,,,,,,
,;;:;,,,,,;;;,,,
,,;;,,,,,;:::;,,
,,,,,,,,,,;;;,,,
,,,,;;;;,,,,,,,,
,,,;:'::;,,,,;,,
,,,,;;;;,,,,,,,,
,,,,,,,,,,,,,,,,
`;

// Sand: wind ripples as broken light curves.
const SAND_RIPPLES = `
,,,,,,,,,,,,,,,,
,,''',,,,,,,,,,,
,,,,,''',,,,,,,,
,,,,,,,,,,,'',,,
,;,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,''',,,,,;,,
,,'',,,,'',,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
,,;,,,,,''',,,,,
,''',,,,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,'',,,,,,,
,,,,,,,,,'',,;,,
,,,,,,,,,,,,,,,,
`;

// Bare stone: one long hairline crack, chipped glints.
const STONE_CRACK = `
,,,,,,,,,,,,,,,,
,,,,,,,,,,',,,,,
,,;,,,,,,,,,,,,,
,,,;,,,,,,,,,,,,
,,,,;;,,,,,,',,,
,,,,,,;,,,,,,,,,
,',,,,,;,,,,,,,,
,,,,,,,,;;,,,,,,
,,,,,,,,,,;,,,,,
,,,,',,,,,;,,,,,
,,,,,,,,,,,;,,,,
,,,,,,,,,,,,;,,,
,,',,,,,,,,,,;,,
,,,,,,,,',,,,,,,
,,,,,,,,,,,,,,',
,,,,,,,,,,,,,,,,
`;

// Cobbles: offset rounded stones, grout in shadow, lit top-left corners.
const COBBLE_ROWS = `
',,;',,;',,;',,;
,,,;,,,;,,,;,,,;
;;;;;;;;;;;;;;;;
,;',,;',,;',,;',
,;,,,;,,,;,,,;,,
;;;;;;;;;;;;;;;;
',,;',,;',,;',,;
,,,;,,,;,,,;,,,;
;;;;;;;;;;;;;;;;
,;',,;',,;',,;',
,;,,,;,,,;,,,;,,
;;;;;;;;;;;;;;;;
',,;',,;',,;',,;
,,,;,,,;,,,;,,,;
;;;;;;;;;;;;;;;;
,;',,;',,;',,;',
`;

// Large flagstone slabs, offset grout, worn corners.
const FLAGSTONE_SLABS = `
'',,,,,;'',,,,,,
,,,,,,,;,,,,,,,,
,,,,,,,;,,,,,,,,
,,,;,,,;,,,,;,,,
,,,,,,,;,,,,,,,,
,,,,,,,;,,,,,,,,
,,,,,,,;;,,,,,,,
;;;;;;;;;;;;;;;;
,,,''',,,,,,'',,
,,,;,,,,,,,,;,,,
,,,;,,,,,,,,;,,,
,;,;,,,,;,,,;,,,
,,,;,,,,,,,,;,,,
,,,;,,,,,,,,;,,,
,,,;,,,,,,,,;;,,
;;;;;;;;;;;;;;;;
`;

// Open water: layered swells, dark troughs, sparse glints.
const WATER_SWELLS = `
,,,,,,,,,,,,,,,,
,,,''',,,,,,,,,,
,,,,,,,,,,'',,,,
,:::,,,,,,,,,,,,
,,,,,,,,:::,,,,,
,,,,,,,,,,,,,,,,
,'',,,,,,,,,,',,
,,,,,,,'',,,,,,,
,,,,,,,,,,,,,,,,
,,:::,,,,,,::,,,
,,,,,,,,,,,,,,,,
,,,,,',,,,,,,,,,
,'',,,,,,,'',,,,
,,,,,,,,,,,,,,,,
,,,,:::,,,,,,,,,
,,,,,,,,,,,,,,,,
`;

// Fen reeds: leaning stalks (fixed char r = reed) over wet dark ground.
const REED_BED = `
,,',,,,,,,,',,,,
,,r,,,,',,,r,,,,
,,r,,,,r,,,r,,,,
,,r,,,,r,,,r,,,;
,,r,,,,r,,,r,,,,
;,r,,,,r,,,r,,,,
,,r,;,,r,,,,,',,
,,,,,,,r,,,,,r,,
,',,,,,r,,,,,r,,
,r,,,,,,,;,,,r,,
,r,,,,,,,,,,,r,,
,r,,,',,,,,,,r,;
,r,,,r,,,,,,,,,,
,,,,,r,,,;,,,,,,
,;,,,r,,,,,,',,,
,,,,,,,,,,,,,,,,
`;

// Tilled field: furrow rows with young sprouts (fixed char e = grass_light).
const FIELD_FURROWS = `
,,,,,,,,,,,,,,,,
;;;;;;;;;;;;;;;;
,,e,,,,,,,e,,,,,
,,,,,,e,,,,,,,e,
;;;;;;;;;;;;;;;;
,e,,,,,,,e,,,,,,
,,,,,e,,,,,,e,,,
;;;;;;;;;;;;;;;;
,,,e,,,,,,,e,,,,
,e,,,,,e,,,,,,e,
;;;;;;;;;;;;;;;;
,,e,,,,,,e,,,,,,
,,,,,e,,,,,,e,,,
;;;;;;;;;;;;;;;;
,e,,,,,,,,e,,,,,
,,,,,,,,,,,,,,,,
`;

// Dense brush: interlocked leaf clumps, three tones deep.
const BRUSH_CANOPY = `
,;;',,';,,,;',,;
;,,',;;,',;,,';,
,'';,,,;;,'',;,,
,;,,'',,,;;,,,';
,,,;;,'';,,,';;,
';,,,;,,,'',;,,,
,,'',,;';,,,,,;'
;,,;;,,,,;;',,,,
,';,,,';;,,,;;,'
,,,;',,,,'',,,;,
'',,,;;,;,,';,,,
,,;;,,',,;;,,,;;
;,,,';,,;,,,'';,
,,';,,,;;,,';,,,
,;,,,'',,,;,,,;'
',,;;,,,';,,'',,
`;

// Broken rock: angular facets, cracks running to lower-right.
const ROCK_FACETS = `
,,,,,,;,,,,,,,,,
,''',,;,,,,,,,,,
,',,,,,;,,''',,,
,,,,,,,;,,,,,,,,
;;;,,,,,;,,,,,,,
,,,;;,,,;,,,,',,
,,,,,;;;;;,,,,,,
,',,,,,,,;;,,,,,
,,,,'',,,,;,,,,,
,,,,,,,,,,;;,,,,
,;,,,,,,,,,;,,',
,;;,,,'',,,;,,,,
,,;;;,,,,,,;;,,,
,,,,;;;,,,,,;,,,
,,,,,,;;;,,,,,,,
,,,,,,,,;;,,,,,,
`;

// Scree: loose sliding shards, all small diagonal strokes.
const SCREE_SHARDS = `
,,;,,',,,,;,,,,,
,;',,,,,;',,,,;,
,,,,,;,,,,,,,';,
,',,;',,,,;,,,,,
,,,,,,,,,';,,,,,
,;,,,,';,,,,,;,,
,,';,,,,,,,;,',,
,,,,,,;,,,,,,,,,
,,;,,,',;,,,,;',
,',,,;,,,,,',,,,
,,,,,,,,;;,,,,,,
,;,,',,,,,,,;,,,
,,,,,,,;,,',,,,,
,,';,,,,,,,,,;,,
,;,,,,,';,,,,,,,
,,,,;,,,,,,;,,,,
`;

// Cliff edge: lit brink up top, sheer striated face falling away below.
const CLIFF_FACE = `
''''''''''''''''
,,,,,,,,,,,,,,,,
,;;,;;;;,;;;,;;;
;;;;;;;;;;;;;;;;
;:;;;:;;;;:;;;:;
;:,;;:,;;;:,;;:,
;:,;;:,;;;:,;;:,
;:;;;:,;;;:;;;:,
;;:;;:;;;;:;;;:;
;;:;;;:;;;:;;;:;
;;:,;;:;;::,;;:,
;;:,;;:;;:;,;;:,
;;;:;;:;;:;;;;:;
;;;:;;;:;:;;;;:;
::;;::;;::;;:::;
::::::::::::::::
`;

// Bog: sucking peat with dark waterholes and rising bubbles.
const BOG_HOLES = `
,,,,,,,,,,,,,,,,
,,;;;,,,,,,,,,,,
,;:::;,,,,,;,,,,
,;::':,,,,,,,,,,
,,;::;,,,,,,,;;,
,,,;;,,,,',,;::,
,,,,,,,,,,,,,;;,
,;,,,,,;;;,,,,,,
,,,,,,;:::;,,,,,
,,,,,,;:':;,,,,,
,',,,,,;;;,,,,,,
,,,,,,,,,,,,,,,,
,,,;;,,,,,,;;;,,
,,;'::,,,,;:::;,
,,,;;,,,,,,;;',,
,,,,,,,,,,,,,,,,
`;

// Glass-growth floor: crystals seeding up through fractured dark ground.
// Fixed chars: C cyan, G glass, U purple.
const GLASS_FLOOR = `
,,,,,,,,,,,,,,,,
,,C,,,,,,,,,,,,,
,CGC,,,,,,,U,,,,
,,C,,,,,,,,,,,,,
,,U,,,,,,C,,,,,,
,,,,,,,,CGC,,,,,
,,,,,,,,,C,,,,,,
,,,,U,,,,U,,,,,,
,;,,,,,,,,,,,C,,
,,,,,,,,,,,,CGC,
,,,C,,,;,,,,,C,,
,,CGC,,,,,,,,U,,
,,,C,,,,,,,,,,,,
,,,U,,,,,C,,,,,,
,,,,,,,,,U,,;,,,
,,,,,,,,,,,,,,,,
`;

// Glass-vein: a branching bright vein crossing dark stone.
const GLASS_VEIN = `
,,,,,,,,,,,,,C,,
,,,,,,,,,,,,C,,,
,,,,,,,,,,,CG,,,
,,,,,,,,,,CG,,,,
,,,,,,,,,CG,,,,,
,,,,,,,,CG,,,,,,
,,,,,,,CGC,,,,,,
,,,,,,CG,C,,,,,,
,,,,,CG,,,C,,,,,
,,,,CG,,,,,C,,,,
,,,CG,,,,,,,,,,,
,,CG,,,,,,,,,,,,
,,C,,,,,,,,,,,,,
,C,,,,,,,,,,,,,,
,C,,,,,,,,,,,,,,
C,,,,,,,,,,,,,,,
`;

// Fractured ground: crazing cracks radiating from a struck point.
const FRACTURE_CRACKS = `
,,,,,;,,,,,,,,,,
,,,,,;,,,,,,,;,,
,;,,,,;,,,,,;,,,
,,;,,,;,,,,;,,,,
,,,;,,;,,,;,,,,,
,,,,;,;,,;,,,,,,
,,,,,;;;;,,,,,,,
;;;;;;C;;;;;;;;;
,,,,,;;;,,,,,,,,
,,,,;,,;;,,,,,,,
,,,;,,,,;;,,,,,,
,,;,,,,,,;,,,,,,
,;,,,,,,,,;,,,,,
,;,,,,,,,,;,,,,,
;,,,,,,,,,,;,,,,
;,,,,,,,,,,,;,,,
`;

// Dark-light pool: a still cyan pool bleeding light up out of the dark.
const DARKLIGHT_POOL = `
,,,,,,,,,,,,,,,,
,,,,,;;;;;,,,,,,
,,,;;CCCCC;;,,,,
,,;CCwwwwwCC;,,,
,;CwwGGGGwwC;,,,
,;CwGGGGGGwC;,,,
,;CwGGWGGGwC;,,,
,;CwGGGGGGwC;,,,
,;CwwGGGGwwC;,,,
,,;CCwwwwCC;,,,,
,,,;;CCCC;;,,,,,
,,,,,;;;;,,,,,,,
,,U,,,,,,,,C,,,,
,,,,,,,,,,,,,,,,
,,,,,C,,,,,,,U,,
,,,,,,,,,,,,,,,,
`;

// Cavern rock: uneven dark stone, faint pale mineral flecks.
const CAVERN_ROCK = `
,,,,,,,,,,,,,,,,
,,;,,,,,,',,,,,,
,,,,,,;,,,,,,,;,
,,,,,,,,,,,,,,,,
,';,,,,,,,;;,,,,
,,,,,,,,,,,,,,,,
,,,,;,,',,,,,,,,
,,,,,,,,,,,,;,,,
,,,,,,,,,,,,,,,,
,;,,,,,;,,,,,,',
,,,,,,,,,,,,,,,,
,,,',,,,,,;,,,,,
,,,,,,,,,,,,,,,,
,,,,,;,,,,,,,;,,
,',,,,,,,',,,,,,
,,,,,,,,,,,,,,,,
`;

// Cramped tunnel: rubble against the walls, worn path down the middle.
const TUNNEL_FLOOR = `
;:;,,,,,,,,,;;:;
:;,,,,,,,,,,,;:;
;;,,,,,,,,,,,,;;
:;,,,,',,,,,,;;:
;,,,,,,,,,,,,,;;
;;,,,,,,,;,,,,;:
:;,,;,,,,,,,,,;;
;;,,,,,,,,,,,,:;
;:,,,,,,,,,,,,;;
;;,,,,,',,,,,,;:
:;,,,,,,,,,,,;;;
;;,,;,,,,,,,,,;:
;:,,,,,,,;,,,,;;
;;,,,,,,,,,,,;;:
:;;,,,,,,,,,,;:;
;:;;,,,,,,,;;;:;
`;

// Turned earth: fresh spade-rows heaped left to right.
const TURNED_EARTH = `
,,,,,,,,,,,,,,,,
,'';;,,,'';;,,,,
,,,,;,,,,,,;,,,,
,,,,,,,,,,,,,,,,
,,'';;,,,,'';;,,
,,,,,;,,,,,,,;,,
,,,,,,,,,,,,,,,,
,'';;,,,'';;,,,,
,,,,;,,,,,,;,,,,
,,,,,,,,,,,,,,,,
,,,'';;,,,'';;,,
,,,,,,;,,,,,,;,,
,,,,,,,,,,,,,,,,
,'';;,,,,'';;,,,
,,,,;,,,,,,,;,,,
,,,,,,,,,,,,,,,,
`;

// Grave-road: worn flags with a bone grave-slab set into the road.
// Fixed chars: V bone, n sand, R red.
const GRAVE_ROAD = `
,,,;,,,,,,,,;,,,
,',;,,,,,,,,;,,,
,,,;,,,,,,,,;,',
;;;;;;;;;;;;;;;;
,,,,,,,,,,,,,,,,
,,,,,VVVVVV,,,,,
,,,,VVnnnnVV,,,,
,,,,Vnn,,nnV,,,,
,,,,Vn,R,,nV,,,,
,,,,Vnn,,nnV,,,,
,,,,VVnnnnVV,,,,
,,,,,VVVVVV,,,,,
,,,,,,,,,,,,,,,,
;;;;;;;;;;;;;;;;
,,;,,,,,,,,,;,,,
,',;,,,,,,,,;,',
`;

// Cairn-stone ground: piled watch-stones on rocky earth.
const CAIRN_GROUND = `
,,,,,,,,,,,,,,,,
,,;,,,,,',,,,;,,
,,,,,''',,,,,,,,
,,,,';;;;,,,,,,,
,,,,;;,;;;,,,',,
,,,''';;;,,,,,,,
,,,;;;;;;;,,,,,,
,,,,;;;;;,,,,,,,
,',,,,,,,,,,,,,,
,,,,,,,,,'',,,,,
,,;,,,,,,;;;,,,,
,,,,,,,,';;;;,,,
,,,,;,,,;;;;,,,,
,,,,,,,,,;;,,',,
,,',,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
`;

// Threshold-line: a carved bone line crossing dark stone, one red seal.
const THRESHOLD_LINE = `
,,,,,,,,,,,,,,,,
,,;,,,,,',,,,,,,
,,,,,,,,,,,,;,,,
,',,,,;,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,',,
VVVVVVVVVVVVVVVV
,,V,,,V,,R,V,,V,
VVVVVVVVVVVVVVVV
,,,,,,,,,,,,,,,,
,;,,,,,',,,,,,,,
,,,,,,,,,,,;,,,,
,,,,',,,,,,,,,,,
,,,,,,,;,,,,,',,
,,;,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
`;

// Dark garden: night-pruned beds, pale blooms swallowed by shadow.
// Fixed chars: u purple_dark, x moss.
const DARK_GARDEN = `
,,,,,,,,,,,,,,,,
,,u,,,,,;,,,u,,,
,uxu,,,,,,,uxu,,
,,u,,,,u,,,,u,,,
,,,,,,uxu,,,,,,,
,;,,,,,u,,,,,;,,
,,,,,,,,,,,,,,,,
,,,u,,,,,,u,,,,,
,,uxu,,,,uxu,,,,
,,,u,,;,,,u,,,,,
,,,,,,,,,,,,,,,,
,u,,,,,u,,,,,u,,
,uxu,,uxu,,,uxu,
,,u,,,,u,,,,,u,,
,,,,,,,,,;,,,,,,
,,,,,,,,,,,,,,,,
`;

// Gravel: dense small stones, no two clusters alike.
const GRAVEL_BED = `
,';,,';,,,';,,;,
;,,',;,',;,,';,,
,;',,,;;,,';,,,'
',,;',,,';,,;;,,
,;,,,;',,,;,,,';
,,';,,,,;',,';,,
;,,,';,;,,,;,,,;
,,;,,,,',;',,';,
';,,;';,,,,;;,,,
,,',,,,;',;,,,;'
,;,,';,,,,,,';,,
;,,;,,,;;,';,,,;
,';,,,',,,,,,;',
,,,;';,,';,;,,,,
';,,,,,;,,,,';,,
,,,';,,,,;;,,,,;
`;

// Estate lawn: mown stripes, immaculate and cold.
const ESTATE_LAWN = `
''''''''''''''''
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;
''''''''''''''''
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,
;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;
`;

// Forest floor: root lines, leaf litter, moss shadow.
// Fixed char x = moss.
const FOREST_FLOOR = `
,,,,,,,,,,,,,,,,
,,xx,,,,,,',,,,,
,,xxx,,;,,,,,,,,
,,,x,,,;;,,,,;,,
,,,,,,,,,;,,,,,,
,',,,,,,,,;;,,,,
,,,,;,,,,,,,;;,,
,,,;;',,,,,,,,;,
,,,,,,,,xx,,,,,,
,';,,,,,xxx,,,,,
,,,,,,',,x,,,,,,
,,,,,,,,,,,,,,,,
,;,,,;;,,,,,,',,
,,,,,,;;;,,,,,,,
,,',,,,,;;,,x,,,
,,,,,,,,,,,,,,,,
`;

// Churchyard grass: quiet turf with sunken bone chips.
const CHURCHYARD = `
,,,,,,,,,,,,,,,,
,,,,,,,,,,;,,,,,
,'',,,,,,,,,,,,,
,;;,,,,,V,,,,,,,
,,,,,,,,,,,,,',,
,,,,,,',,,,,';;,
,,,,,';;,,,,,;,,
,,V,,,;,,,,,,,,,
,,,,,,,,,,,,,,,,
,,,,,,,,,,,;,,,,
,'',,,,,,,';',,,
,;;,,,V,,,,;;,,,
,,,,,,,,,,,,,,,,
,,,',,,,,,,,,',,
,,';;,,,',,,';;,
,,,;,,,,,,,,,;,,
`;

// Ford: shallow water over pale gravel bars.
// Fixed char n = sand.
const FORD_SHALLOWS = `
,,,,,,,,,,,,,,,,
,,''',,,,,,,,,,,
,,,,,,,nn,,,,,,,
,,,,,,nnnn,,,,,,
,'',,,,nn,,,,',,
,,,,,,,,,,,,,,,,
,,,nn,,,,,,'',,,
,,nnnn,,,,,,,,,,
,,,nnn,,,,nn,,,,
,,,,,,,,,nnnn,,,
,'',,,,,,,nn,,,,
,,,,,,'',,,,,,,,
,,,,,,,,,,,,,,,,
,,,nn,,,,,,,',,,
,,,,,,,,'',,,,,,
,,,,,,,,,,,,,,,,
`;

// Hollow floor: packed earth worn smooth in the middle.
const HOLLOW_FLOOR = `
;;,,,,,,,,,,,,;;
;,,,,,,,,,,,,,,;
,,,,,,;,,,,,,,,,
,,,,,,,,,,,,',,,
,,',,,,,,,,,,,,,
,,,,,,,,,;,,,,,,
,,,,,,,,,,,,,,,,
,,,;,,,,,,,,,,,,
,,,,,,,,,,,,;,,,
,,,,,,',,,,,,,,,
,,,,,,,,,,,,,,,,
,,;,,,,,,,',,,,,
,,,,,,,;,,,,,,,,
,,,,,,,,,,,,,,,,
;,,,,',,,,,,,,,;
;;,,,,,,,,,,,,;;
`;

const VOID_TILE: Pixels = new Array(OVERWORLD_TILE_SIZE * OVERWORLD_TILE_SIZE).fill(
  "#000000",
);

// Transition: ragged vertical seam, A ground left, B ground right.
// Chars: "," A base  ";" A dark(seam)  "." B base  "'" B light
const TRANSITION_SEAM = `
,,,,,,,;.'......
,,,,,,,,;.......
,,,,,,,;.'......
,,,,,,;.........
,,,,,,,;..'.....
,,,,,,,,;.......
,,,,,,,;........
,,,,,,;.'.......
,,,,,,,;........
,,,,,,,,;.'.....
,,,,,,,;........
,,,,,,;..'......
,,,,,,,;........
,,,,,,,,;.......
,,,,,,,;.'......
,,,,,,,,;.......
`;

const transitionTile = (
  name: string,
  a: OverworldPaletteId,
  b: OverworldPaletteId,
): Pixels =>
  art(name, TRANSITION_SEAM, {
    ",": C(a),
    ";": rampDark(a),
    ".": C(b),
    "'": rampLight(b),
  });

const terrainTile = (
  name: string,
  ascii: string,
  base: OverworldPaletteId,
  light: OverworldPaletteId,
  dark: OverworldPaletteId,
  extra: CharMap = {},
  deep?: OverworldPaletteId,
): Pixels =>
  art(name, ascii, {
    ...terrainMap(base, C(light), C(dark), deep ? C(deep) : undefined),
    ...extra,
  });

export const TILE_ART: Record<string, () => Pixels> = {
  grass: () => terrainTile("grass", GRASS_TUFTS, "grass", "grass_light", "grass_dark"),
  dirt_path: () => terrainTile("dirt_path", EARTH_SCATTER, "dirt", "road", "dirt_dark"),
  packed_road: () => terrainTile("packed_road", ROAD_RUTS, "road", "sand", "dirt"),
  mud: () =>
    terrainTile("mud", MUD_POOLS, "dirt_dark", "dirt", "night", {}, "water_dark"),
  sand: () => terrainTile("sand", SAND_RIPPLES, "sand", "bone", "road"),
  bare_stone: () => terrainTile("bare_stone", STONE_CRACK, "stone", "stone_light", "stone_dark"),
  moss: () => terrainTile("moss", GRASS_TUFTS, "moss", "reed", "grass_dark"),
  grave_road: () =>
    terrainTile("grave_road", GRAVE_ROAD, "stone_dark", "stone", "slate", {
      V: C("bone"),
      n: C("sand"),
      R: C("red"),
    }),
  cairn_stone: () =>
    terrainTile("cairn_stone", CAIRN_GROUND, "stone_dark", "stone_light", "slate"),
  turned_earth: () =>
    terrainTile("turned_earth", TURNED_EARTH, "dirt_dark", "dirt", "night"),
  threshold_line: () =>
    terrainTile("threshold_line", THRESHOLD_LINE, "slate", "stone_dark", "night", {
      V: C("bone"),
      R: C("red"),
    }),
  fen_reed: () =>
    terrainTile("fen_reed", REED_BED, "moss", "reed", "grass_dark", {
      r: C("reed"),
    }),
  standing_water: () =>
    terrainTile("standing_water", WATER_SWELLS, "water", "water_light", "water_dark", {}, "water_dark"),
  fen_mud: () =>
    terrainTile("fen_mud", BOG_HOLES, "dirt_dark", "dirt", "night", {}, "water_dark"),
  tilled_field: () =>
    terrainTile("tilled_field", FIELD_FURROWS, "dirt", "road", "dirt_dark", {
      e: C("grass_light"),
    }),
  cobbles: () => terrainTile("cobbles", COBBLE_ROWS, "stone", "stone_light", "stone_dark"),
  churchyard_grass: () =>
    terrainTile("churchyard_grass", CHURCHYARD, "moss", "grass_light", "grass_dark", {
      V: C("bone"),
    }),
  hollow_floor: () =>
    terrainTile("hollow_floor", HOLLOW_FLOOR, "dirt_dark", "dirt", "night"),
  flagstone: () =>
    terrainTile("flagstone", FLAGSTONE_SLABS, "stone_dark", "stone", "slate"),
  dark_garden: () =>
    terrainTile("dark_garden", DARK_GARDEN, "grass_dark", "grass", "night", {
      u: C("purple_dark"),
      x: C("moss"),
    }),
  gravel: () => terrainTile("gravel", GRAVEL_BED, "stone_dark", "stone", "slate"),
  estate_lawn: () =>
    terrainTile("estate_lawn", ESTATE_LAWN, "grass_dark", "grass", "night"),
  forest_floor: () =>
    terrainTile("forest_floor", FOREST_FLOOR, "dirt_dark", "dirt", "night", {
      x: C("moss"),
    }),
  dense_brush: () =>
    terrainTile("dense_brush", BRUSH_CANOPY, "grass_dark", "grass_light", "night", {}, "night"),
  rock: () => terrainTile("rock", ROCK_FACETS, "stone_dark", "stone_light", "slate"),
  scree: () => terrainTile("scree", SCREE_SHARDS, "slate", "stone", "night"),
  cliff_edge: () =>
    terrainTile("cliff_edge", CLIFF_FACE, "stone_dark", "stone_light", "slate", {}, "night"),
  river: () =>
    terrainTile("river", WATER_SWELLS, "water_dark", "water", "night", {}, "night"),
  ford: () =>
    terrainTile("ford", FORD_SHALLOWS, "water", "water_light", "water_dark", {
      n: C("sand"),
    }),
  bog: () => terrainTile("bog", BOG_HOLES, "moss", "reed", "grass_dark", {}, "water_dark"),
  glass_growth_floor: () =>
    terrainTile("glass_growth_floor", GLASS_FLOOR, "purple_dark", "purple", "night", {
      C: C("cyan"),
      G: C("glass"),
      U: C("purple"),
    }),
  glass_vein: () =>
    terrainTile("glass_vein", GLASS_VEIN, "slate", "stone_dark", "night", {
      C: C("cyan"),
      G: C("glass"),
    }),
  fractured_ground: () =>
    terrainTile("fractured_ground", FRACTURE_CRACKS, "slate", "stone_dark", "purple_dark", {
      C: C("cyan"),
    }),
  dark_light_pool: () =>
    terrainTile("dark_light_pool", DARKLIGHT_POOL, "purple_dark", "purple", "night", {
      C: C("cyan"),
      G: C("glass"),
      W: C("white"),
      w: C("water_light"),
      U: C("purple"),
    }),
  cavern_rock: () =>
    terrainTile("cavern_rock", CAVERN_ROCK, "night", "stone_dark", "ink"),
  cramped_tunnel_floor: () =>
    terrainTile("cramped_tunnel_floor", TUNNEL_FLOOR, "slate", "stone_dark", "night", {}, "purple_dark"),
  void: () => VOID_TILE,
  grass_water_edge: () => transitionTile("grass_water_edge", "grass", "water"),
  road_grass_edge: () => transitionTile("road_grass_edge", "road", "grass"),
  grass_mud_edge: () => transitionTile("grass_mud_edge", "grass", "dirt_dark"),
  stone_grass_edge: () => transitionTile("stone_grass_edge", "stone", "grass"),
  reed_water_edge: () => transitionTile("reed_water_edge", "moss", "water"),
  fracture_stone_edge: () => transitionTile("fracture_stone_edge", "purple_dark", "stone_dark"),
};

// ══════════════════════════════════════════════════════════════════════════════
// OBJECTS — props on transparent ground, ink-outlined, lit top-left.
// Char key per sprite uses FIXED_CHARS (see top of file).
// ══════════════════════════════════════════════════════════════════════════════

const prop = (name: string, ascii: string, extra: CharMap = {}): Pixels =>
  art(name, ascii, { ...FIXED_CHARS, ...extra });

export const OBJECT_ART: Record<string, () => Pixels> = {
  barrel: () =>
    prop(
      "barrel",
      `
      ................
      ....OOOOOO......
      ...OJooooodO....
      ..OmmmmmmmmmO...
      ..OoJoooooddO...
      ..OoJoooooddO...
      ..OoJoooooddO...
      ..OmmmmmmmmmO...
      ..OoJoooooddO...
      ..OoJoooooddO...
      ..OoJoooooddO...
      ..OmmmmmmmmmO...
      ...OddoooddO....
      ....OOOOOO......
      ................
      ................
      `,
    ),
  crate: () =>
    prop(
      "crate",
      `
      ................
      ..OOOOOOOOOOO...
      ..OJJJJJJJJoO...
      ..OJoooooodoO...
      ..OJodooooodO...
      ..OJoodoloodO...
      ..OJooodooodO...
      ..OJoooodood0...
      ..OJoodooodO....
      ..OJodoooododO..
      ..OJdooooooodO..
      ..OJoooooooodO..
      ..OddddddddddO..
      ..OOOOOOOOOOO...
      ................
      ................
      `,
      { l: C("gold"), "0": C("ink") },
    ),
  torch_sconce: () =>
    prop(
      "torch_sconce",
      `
      ................
      ......YF........
      .....FYYF.......
      .....FFYF.......
      ......RF........
      ......FR........
      .....OddO.......
      .....OdoO.......
      ......OdO.......
      ......OdO.......
      ......OdO.......
      .....OmdmO......
      .....OdddO......
      ......OOO.......
      ................
      ................
      `,
    ),
  brazier: () =>
    prop(
      "brazier",
      `
      ................
      ....Y...F.......
      ......FYF..Y....
      .....FYYFF......
      ....FFYYYFF.....
      ....FRFFFRF.....
      ...OmRRFRRmO....
      ..OmmmmmmmmmO...
      ..OLmmmmmmmzO...
      ...OmmmmmmzO....
      ....OzO.OzO.....
      ....OzO.OzO.....
      ...OzzO.OzzO....
      ...OOOO.OOOO....
      ................
      ................
      `,
    ),
  oil_pool: () =>
    prop(
      "oil_pool",
      `
      ................
      ................
      ................
      ......KKKK......
      ....KKKiKKKK....
      ...KKiKKKKKKK...
      ..KKKKKKuKKKKK..
      ..KiKKuKKKKKiK..
      ..KKKKKKKKiKKK..
      ...KKiKKKKKKK...
      ....KKKKiKK.....
      ......KKKK......
      ................
      ................
      ................
      ................
      `,
    ),
  water_trough: () =>
    prop(
      "water_trough",
      `
      ................
      ................
      ................
      ................
      ..OOOOOOOOOOOO..
      .OoJJJJJJJJJodO.
      .OoWbbbbbbbbodO.
      .Oobbbwbbbbbod0.
      .Oobbbbbbbwbod0.
      .OoddddddddoodO.
      .OOdO......OdOO.
      ..OdO......OdO..
      ..OOO......OOO..
      ................
      ................
      ................
      `,
      { "0": C("ink") },
    ),
  lantern: () =>
    prop(
      "lantern",
      `
      ................
      ......OOO.......
      .....Om.mO......
      ......OOO.......
      .....OmmmO......
      ....OmYYYmO.....
      ....OYYWYYO.....
      ....OYYYYYO.....
      ....OFYYYFO.....
      ....OmFYFmO.....
      .....OmmmO......
      ......OOO.......
      ................
      ................
      ................
      ................
      `,
    ),
  rope: () =>
    prop(
      "rope",
      `
      ................
      ................
      ................
      ................
      ....OOOOOOO.....
      ...OJnnnnnJO....
      ..OJnOOOOOnJO...
      ..OJnO...OnJO...
      ..OJnO...OnJO...
      ..OJnOOOOnnJO...
      ...OJnnnnnJO....
      ....OOOOOOJO....
      ..........OJO...
      ...........O....
      ................
      ................
      `,
    ),
  rope_bridge: () =>
    prop(
      "rope_bridge",
      `
      .O............O.
      .OJ..........JO.
      .OnOOOOOOOOOOnO.
      .OJoJoodoJoodJO.
      .OJ..........JO.
      .OnOOOOOOOOOOnO.
      .OJodoJoodJooJO.
      .OJ..........JO.
      .OnOOOOOOOOOOnO.
      .OJooJoodoJodJO.
      .OJ..........JO.
      .OnOOOOOOOOOOnO.
      .OJoJoodooJooJO.
      .OJ..........JO.
      .OnOOOOOOOOOOnO.
      .O............O.
      `,
    ),
  lever_mechanism: () =>
    prop(
      "lever_mechanism",
      `
      ................
      ................
      ..........ORO...
      .........ORRO...
      .........OoO....
      ........OoO.....
      ........OoO.....
      .......OoO......
      .......OoO......
      ......OYO.......
      ....OmmmmmO.....
      ...OmLmmmmmO....
      ...OmmmmmzmO....
      ...OzzzzzzzO....
      ....OOOOOOO.....
      ................
      `,
    ),
  tree: () =>
    prop(
      "tree",
      `
      ................
      .....OOOOO......
      ...OOeeee,OO....
      ..Oeee,,,,;,O...
      ..Oee,,,,,;;O...
      .Oee,,,,,;,;;O..
      .Oe,,,,;,,;;;O..
      .O,,e,,,,;;;;O..
      .O,;,,,;;;;;;O..
      ..O;;,;;;;;;O...
      ...OO;;;;;OO....
      .....OodO.......
      .....OodO.......
      ....OoodddO.....
      ................
      ................
      `,
      { ",": C("grass"), ";": C("grass_dark"), e: C("grass_light") },
    ),
  stump: () =>
    prop(
      "stump",
      `
      ................
      ................
      ................
      ................
      ................
      ....OOOOOOO.....
      ...OnJJJJJnO....
      ..OnJnnnnJJdO...
      ..OnJnJJnJJdO...
      ..OnJnnnnJJdO...
      ..OoJJJJJJodO...
      ..OooooooooddO..
      ..OoodddddoddO..
      ...OOOOOOOOOO...
      ................
      ................
      `,
    ),
  bush: () =>
    prop(
      "bush",
      `
      ................
      ................
      ................
      ................
      ......OOOO......
      ....OOe,,;OO....
      ...Oee,,,,;;O...
      ..Oe,,e,,;,;;O..
      ..O,,,,,;;;;;O..
      ..O,;,,;;;;;;O..
      ...O;;;;;;;;O...
      ....OO;;;;OO....
      ......OOOO......
      ................
      ................
      ................
      `,
      { ",": C("grass"), ";": C("grass_dark"), e: C("grass_light") },
    ),
  boulder: () =>
    prop(
      "boulder",
      `
      ................
      ................
      ................
      .....OOOOO......
      ...OOLLLMMOO....
      ..OLLLLMMMMMO...
      ..OLLMMMMMMzO...
      .OLLMMMMzMMzzO..
      .OLMMMMzMMzzzO..
      .OMMMzMMMzzzzO..
      .OMMMMMzzzzzzO..
      ..OMzzzzzzzzO...
      ...OOzzzzzOO....
      .....OOOOO......
      ................
      ................
      `,
    ),
  fallen_log: () =>
    prop(
      "fallen_log",
      `
      ................
      ................
      ................
      ................
      ................
      ..OOOOOOOOOOOO..
      .OxJJJJJoJJJoOO.
      .OoooooooooooJO.
      .OoooxoooooodnO.
      .OoddoooddoodJO.
      .OddddddddddoO..
      ..OOOOOOOOOOOO..
      ................
      ................
      ................
      ................
      `,
    ),
  tall_grass: () =>
    prop(
      "tall_grass",
      `
      ................
      ................
      ..e,......e.....
      ..O,..e...O,.e..
      .eO,..O..eO,.O..
      .OO,e.O,.OO,.O,.
      .OO,O.O,.OO,eO,.
      .OOOO;O,.OOOOO,.
      .OO;OOO;.OO;OO;.
      ..O;O;O;..O;O;..
      ..;OO;O;..;OO;..
      ..O;;;O...O;;;..
      ..,O;O;...,O;O..
      ..;O;;O...;O;;..
      ................
      ................
      `,
      { ",": C("grass"), ";": C("grass_dark"), e: C("grass_light") },
    ),
  door: () =>
    prop(
      "door",
      `
      ................
      ..OOOOOOOOOOO...
      ..OmoJoJoJomO...
      ..OmoooJooomO...
      ..OmodoJodomO...
      ..OmodoJodomO...
      ..OmodoJodomO...
      ..OmodoJodomO...
      ..OmodoJYdomO...
      ..OmodoJYdomO...
      ..OmodoJodomO...
      ..OmodoJodomO...
      ..OmodoJodomO...
      ..OmdddddddmO...
      ..OOOOOOOOOOO...
      ................
      `,
    ),
  gate: () =>
    prop(
      "gate",
      `
      ................
      ................
      .OOO........OOO.
      .OoJOOOOOOOOJoO.
      .OoJoooJoooJodO.
      .OodO..O...OodO.
      .OoJOOOOOOOOJoO.
      .OoJoJoooJoJodO.
      .OodO..O...OodO.
      .OoJOOOOOOOOJoO.
      .OoJooJoooJoodO.
      .OodO..O...OodO.
      .OodO..O...OodO.
      .OOOO..O...OOOO.
      ................
      ................
      `,
    ),
  fence: () =>
    prop(
      "fence",
      `
      ................
      ................
      ................
      ..OO.......OO...
      .OJoO.....OJoO..
      .OoJOOOOOOOoJO..
      .OoJoooJoooJoO..
      .OodddoddoddoO..
      .OoJOOOOOOOoJO..
      .OoJooJoooJodO..
      .OoddoddooddoO..
      .OodO......OdO..
      .OodO......OdO..
      .OOOO......OOO..
      ................
      ................
      `,
    ),
  wall_segment: () =>
    prop(
      "wall_segment",
      `
      LLLLLLLLLLLLLLLL
      MMMMMMMzMMMMMMMz
      MLMMMMMzMMLMMMMz
      MMMMMMMzMMMMMMMz
      zzzzzzzzzzzzzzzz
      MMMzMMMMMMMzMMMM
      MLMzMMLMMMMzMMLM
      MMMzMMMMMMMzMMMM
      zzzzzzzzzzzzzzzz
      MMMMMMMzMMMMMMMz
      MLMMMMMzMLMMMMMz
      MMMMMMMzMMMMMMMz
      zzzzzzzzzzzzzzzz
      MMMzMMMMMMMzMMMM
      MMMzMMLMMMMzMMMM
      KKKKKKKKKKKKKKKK
      `,
    ),
  window: () =>
    prop(
      "window",
      `
      LLLLLLLLLLLLLLLL
      MMMMMMMzMMMMMMMz
      MLMMMMMzMMLMMMMz
      MMOOOOOOOOOOOMMz
      zzOooJoooJoozzzz
      MMOoWwwOwwwozMMM
      MLOowwwOwbwozMLM
      MMOowbwOwwbozMMM
      zzOoOOOOOOOozzzz
      MMOowwbOwwwozMMz
      MLOobwwOwbwozMMz
      MMOowwwObwwozMMz
      zzOooJoooJoozzzz
      MMOOOOOOOOOOOMMM
      MMMzMMLMMMMzMMMM
      KKKKKKKKKKKKKKKK
      `,
    ),
  signpost: () =>
    prop(
      "signpost",
      `
      ................
      ................
      ..OOOOOOOOOO....
      .OVnnnnnnnnnO...
      .OnOdOOdOOnnOO..
      .OnnnnnnnnnnndO.
      .OnOOdOdOOOnnO..
      .OVnnnnnnnnnO...
      ..OOOOOdOOOO....
      ......OodO......
      ......OodO......
      ......OodO......
      ......OodO......
      .....OmodmO.....
      ......OOOO......
      ................
      `,
    ),
  well: () =>
    prop(
      "well",
      `
      ................
      .....OOOOOO.....
      ....OddddddO....
      ...OdoooooodO...
      ..OdoOOOOOOodO..
      ..OoO......OoO..
      ..OLMOOOOOOMzO..
      .OLMMLMMzMMMMzO.
      .OMMOkkkkkkOMzO.
      .OLMOkwkkkkOMzO.
      .OMMOkkkkwkOMzO.
      .OMzOkkkkkkOzzO.
      .OMMMzMMzMMMzzO.
      ..OMzzMMMzzzzO..
      ...OOOOOOOOOO...
      ................
      `,
    ),
  market_stall: () =>
    prop(
      "market_stall",
      `
      ................
      .OOOOOOOOOOOOOO.
      .OVRRVVRRVVRRVO.
      .ORRVVRRVVRRVVO.
      .OVVRRVVRRVVRRO.
      ..OdO......OdO..
      ..OdO......OdO..
      .OOOOOOOOOOOOOO.
      .OJooJoooJooJoO.
      .OoYoRRoVVonnoO.
      .OoYYoRoVnnFooO.
      .OooooooooooooO.
      .OddO......OddO.
      .OddO......OddO.
      .OOOO......OOOO.
      ................
      `,
    ),
  shrine: () =>
    prop(
      "shrine",
      `
      ................
      ......OOOO......
      ....OOLLLLOO....
      ...OLLLLLLMMO...
      ...OLLOOOOMMO...
      ...OLOKKKKOMO...
      ...OLOKYYKOMO...
      ...OLOKYYKOMO...
      ...OLOKKWKOMO...
      ...OLLOOOOMMO...
      ...OLLLLLMMMO...
      ..OLLLLLLMMMzO..
      ..OLMMMMMMzzzO..
      .OLMMMMMMMzzzzO.
      .OOOOOOOOOOOOOO.
      ................
      `,
    ),
  chest: () =>
    prop(
      "chest",
      `
      ................
      ................
      ................
      ...OOOOOOOOOO...
      ..OJooooooooJO..
      ..OoJJJJJJJJdO..
      ..OYYYYYYYYYYO..
      ..OoooooooooodO.
      ..OooooYYoooodO.
      ..OooooYYoooodO.
      ..OodoodddooddO.
      ..OddddddddddO..
      ..OOOOOOOOOOOO..
      ................
      ................
      ................
      `,
    ),
  sack: () =>
    prop(
      "sack",
      `
      ................
      ................
      ................
      .......OO.......
      ......OnJO......
      ......OJnO......
      .....OdOOd0.....
      ....OnnnnJI0....
      ...OnnnnnnJI0...
      ...OnnnnnnJI0...
      ..OnnnnnnnJII0..
      ..OnnnnnnJJII0..
      ..OnJJJJJJIII0..
      ...OIIIIIIII0...
      ....OOOOOOOO....
      ................
      `,
      { "0": C("ink") },
    ),
  urn: () =>
    prop(
      "urn",
      `
      ................
      ................
      .....OOOOO......
      ....OVVVVVO.....
      .....OmmmO......
      ....OmLLMmO.....
      ...OmLLMMMmO....
      ..OmLLMMMMMzO...
      ..OmLVVVVMMzO...
      ..OmLMMMMMzzO...
      ..OmLMMMMMzzO...
      ...OmMMMMzzO....
      ....OmMMzzO.....
      .....OmzzO......
      ....OOOOOOO.....
      ................
      `,
    ),
  reliquary: () =>
    prop(
      "reliquary",
      `
      ................
      ................
      ................
      ....OOOOOOOO....
      ...OYLLLLLLYO...
      ...OLLYYYYLMO...
      ..OYYYYRRYYYYO..
      ..OLLLYRRYLLMO..
      ..OLLLYYYYLLMO..
      ..OLLLLLLLLLMO..
      ..OYMMMMMMMMYO..
      ...OOOOOOOOOO...
      ....OmmmmmmO....
      ...OmmmmmmmmO...
      ...OOOOOOOOOO...
      ................
      `,
    ),
  grave_goods_cairn: () =>
    prop(
      "grave_goods_cairn",
      `
      ................
      ................
      ................
      ......OOO.......
      .....OLLMO......
      ....OLLMMMO.....
      ....OLMMMzO.....
      ...OLLMMMMzO....
      ...OLMMzMMzO....
      ..OLLMMMMMzzO...
      ..OLMMzMMzzzO...
      .OVOMMMMMMzOYO..
      .OVVOzzzzzOYYO..
      ..OVOOOOOOOOO...
      ...OO.......O...
      ................
      `,
    ),
  the_stone: () =>
    prop(
      "the_stone",
      `
      .......C........
      ......OOO...U...
      .....OzzzO......
      ..C..OzCzzO.....
      ....OzzzCzO..C..
      ....OzCzzzzO....
      ...OzzzCzzzO....
      ...OzzzzCzzO..U.
      ...OzCzzzCzzO...
      ..OzzzCzzzzzO...
      .U.OzzzzCzzzO...
      ..OzzCzzzzCzO...
      ..OzzzzzCzzzO...
      .OzzCzzzzzzzzO..
      .OOOOOOOOOOOOO..
      ....C.....U.....
      `,
    ),
  glass_key_mass: () =>
    prop(
      "glass_key_mass",
      `
      .......G........
      ......OGO..C....
      .....OGCUO......
      .C...OCUUO..G...
      ....OGCUUUO.....
      ....OCUUWUO..C..
      ...OGCUUUUUO....
      ...OCUUNUUUO....
      ..OGCUUUUUUUO...
      ..OCUUUGUUUUO...
      ..OCUNUUUUUCO...
      .OGCUUUUUUUUCO..
      .OCUUUCUUUUUCO..
      .OOOOOOOOOOOOO..
      ...C....G..U....
      ................
      `,
    ),
  covenant_marker: () =>
    prop(
      "covenant_marker",
      `
      ................
      ................
      ......OOO.......
      .....OLLMO......
      ....OLLLMMO.....
      ....OLOOOMO.....
      ....OLOMOMO.....
      ....OLOOOMO.....
      ....OYYYYYO.....
      ....OLMMMMO.....
      ....OLMMMzO.....
      ....OLMMMzO.....
      ...OxLMMzzxO....
      ...OOOOOOOOO....
      ................
      ................
      `,
    ),
  comfort_shard: () =>
    prop(
      "comfort_shard",
      `
      ................
      ................
      ................
      .......G........
      ......OGO.......
      .....OGWCO......
      .....OGCCO......
      ....OGCCCUO.....
      ....OCCCUO......
      .....OCUUO......
      .....OCUO.......
      ......OUO.......
      .......O........
      ......U.C.......
      ................
      ................
      `,
    ),
  glass_stalactite: () =>
    prop(
      "glass_stalactite",
      `
      OOOOOOOOOOOOOOOO
      OuuUuuuuuUuuuuuO
      .OuuOGUuuOuuuO..
      ..OGUO.OGUuO....
      ..OGUO.OGUuO....
      ...OGO..OGUO....
      ...OGO..OGuO....
      ...OCO...OCO....
      ...OCO...OCO....
      ....O....OCO....
      ....C.....O.....
      ..........C.....
      ................
      ................
      ................
      ................
      `,
    ),
  glass_column: () =>
    prop(
      "glass_column",
      `
      ....OOOOOO......
      ...OGGUUUuO.....
      ...OGCUUuuO.....
      ....OGCUUO......
      ....OGCUuO......
      ...OGCUUUuO.....
      ...OGCsUUuO.....
      ...OGCssUuO.....
      ...OGCsUUuO.....
      ....OGCUuO......
      ....OGCUuO......
      ...OGCUUUuO.....
      ...OGCUUUuuO....
      ..OGCUUUUuuuO...
      ..OOOOOOOOOOO...
      ................
      `,
      { s: C("skin") },
    ),
  glass_growth_cluster: () =>
    prop(
      "glass_growth_cluster",
      `
      ................
      .......G........
      ......OGO.......
      ......OGCO......
      ..G...OCCO......
      .OGO..OCUO..C...
      .OGCO.OCUO.OCO..
      .OCCO.OCUOOGCO..
      .OCUOOGCUUOCUO..
      .OCUOOCCUUOCUO..
      .OCUUOCUUuOCUuO.
      OCUUuNCUuuOCUuO.
      OCUuuOCUuuNUuuO.
      OOOOOOOOOOOOOOO.
      ................
      ................
      `,
    ),
  dark_light_emitter: () =>
    prop(
      "dark_light_emitter",
      `
      .......C........
      ......OGO.......
      .....OOOOO......
      ....OuuuuuO..C..
      ....OuOCOuO.....
      ...OuuOCOuuO....
      .C.OuuOCOuuO....
      ...OuuOCOuuO....
      ...OuuOWOuuO....
      ..OuuuOCOuuuO...
      ..OuuuOCOuuuO...
      ..OuuuuuuuuuO.U.
      .OuuUuuuuUuuuO..
      .OOOOOOOOOOOOO..
      ....U.....C.....
      ................
      `,
    ),
};
