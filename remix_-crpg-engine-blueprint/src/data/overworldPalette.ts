// ── Phase 0 locked palette ────────────────────────────────────────────────────
// The 32-color EGA/early-VGA-feel palette every overworld sprite draws from.
// Pure #000000 is reserved for void/fog/out-of-sight and never appears inside a
// sprite; "ink" is the darkest paintable near-black.

export const OVERWORLD_TILE_SIZE = 16;
export const OVERWORLD_CONTACT_SHEET_SCALE = 4;
export const OVERWORLD_VOID_HEX = "#000000";

export const OVERWORLD_PALETTE = [
  { id: "void", hex: OVERWORLD_VOID_HEX, role: "reserved void/fog only" },
  { id: "ink", hex: "#080A10", role: "near-black outline, not void" },
  { id: "night", hex: "#101827", role: "deep blue shadow" },
  { id: "slate", hex: "#243044", role: "cool dark stone" },
  { id: "stone_dark", hex: "#46515F", role: "dark masonry" },
  { id: "stone", hex: "#7C8796", role: "mid masonry" },
  { id: "stone_light", hex: "#CBD4DF", role: "bright masonry/bone glint" },
  { id: "grass_dark", hex: "#1E4A2D", role: "deep grass" },
  { id: "grass", hex: "#3D7A3F", role: "main grass" },
  { id: "grass_light", hex: "#77A85C", role: "grass highlight" },
  { id: "reed", hex: "#6E7F3C", role: "fen reed" },
  { id: "moss", hex: "#4B6B4A", role: "moss/old growth" },
  { id: "dirt_dark", hex: "#4A3324", role: "mud/earth dark" },
  { id: "dirt", hex: "#7A5635", role: "earth/wood" },
  { id: "road", hex: "#9B7B52", role: "packed road" },
  { id: "sand", hex: "#C9A86A", role: "sand/dry grass" },
  { id: "water_dark", hex: "#17465C", role: "deep water" },
  { id: "water", hex: "#287B91", role: "standing water" },
  { id: "water_light", hex: "#67C6D8", role: "water glint" },
  { id: "wood_dark", hex: "#5B321F", role: "wood outline" },
  { id: "wood", hex: "#8D5A2B", role: "wood" },
  { id: "skin", hex: "#C98B63", role: "faces/hands" },
  { id: "bone", hex: "#E5D6B8", role: "bone/parchment" },
  { id: "red", hex: "#A13B3B", role: "blood/cloth warning" },
  { id: "orange", hex: "#D46A2A", role: "fire body" },
  { id: "gold", hex: "#E3B640", role: "lamps/locks" },
  { id: "purple_dark", hex: "#3A244E", role: "fracture dark" },
  { id: "purple", hex: "#7B4FD1", role: "Grid/fracture violet" },
  { id: "cyan", hex: "#33D6E8", role: "dark-light cyan" },
  { id: "glass", hex: "#B9F2FF", role: "Glass bright edge" },
  { id: "white", hex: "#F4F1E8", role: "eyes/tiny highlights" },
  { id: "green_glow", hex: "#A6F24A", role: "sickly amplified glow" },
] as const;

export type OverworldPaletteId = (typeof OVERWORLD_PALETTE)[number]["id"];

export const OVERWORLD_PALETTE_HEX = OVERWORLD_PALETTE.reduce(
  (acc, entry) => {
    acc[entry.id] = entry.hex;
    return acc;
  },
  {} as Record<OverworldPaletteId, string>,
);

export const C = (id: OverworldPaletteId) => OVERWORLD_PALETTE_HEX[id];

// Shading ramps: for any palette color used as a sprite's swappable body/accent,
// the dark (shadow) and light (highlight) neighbours to shade with. This is how
// entities palette-swap while keeping real 3-tone shading.
export const OVERWORLD_RAMP: Record<
  OverworldPaletteId,
  { dark: OverworldPaletteId; light: OverworldPaletteId }
> = {
  void: { dark: "void", light: "void" },
  ink: { dark: "ink", light: "night" },
  night: { dark: "ink", light: "slate" },
  slate: { dark: "night", light: "stone_dark" },
  stone_dark: { dark: "slate", light: "stone" },
  stone: { dark: "stone_dark", light: "stone_light" },
  stone_light: { dark: "stone", light: "white" },
  grass_dark: { dark: "night", light: "grass" },
  grass: { dark: "grass_dark", light: "grass_light" },
  grass_light: { dark: "grass", light: "sand" },
  reed: { dark: "moss", light: "sand" },
  moss: { dark: "grass_dark", light: "reed" },
  dirt_dark: { dark: "night", light: "dirt" },
  dirt: { dark: "dirt_dark", light: "road" },
  road: { dark: "dirt", light: "sand" },
  sand: { dark: "road", light: "bone" },
  water_dark: { dark: "night", light: "water" },
  water: { dark: "water_dark", light: "water_light" },
  water_light: { dark: "water", light: "glass" },
  wood_dark: { dark: "ink", light: "wood" },
  wood: { dark: "wood_dark", light: "road" },
  skin: { dark: "dirt", light: "bone" },
  bone: { dark: "sand", light: "white" },
  red: { dark: "wood_dark", light: "orange" },
  orange: { dark: "red", light: "gold" },
  gold: { dark: "orange", light: "bone" },
  purple_dark: { dark: "night", light: "purple" },
  purple: { dark: "purple_dark", light: "cyan" },
  cyan: { dark: "purple", light: "glass" },
  glass: { dark: "cyan", light: "white" },
  white: { dark: "stone_light", light: "white" },
  green_glow: { dark: "grass_light", light: "white" },
};

export const rampDark = (id: OverworldPaletteId) => C(OVERWORLD_RAMP[id].dark);
export const rampLight = (id: OverworldPaletteId) => C(OVERWORLD_RAMP[id].light);
