import type { SpriteData } from "../schema/game";

export const OBLIQUE_BARRIER_TILE_ORDER = [
  { id: "rough_wood_fence", displayName: "Rough Wood Fence" },
  { id: "palisade_stakes", displayName: "Palisade Stakes" },
  { id: "iron_bar_gate", displayName: "Iron Bar Gate" },
  { id: "heavy_wood_gate", displayName: "Heavy Wood Gate" },
  { id: "barred_stone_window", displayName: "Barred Stone Window" },
  { id: "shuttered_timber_window", displayName: "Shuttered Timber Window" },
  { id: "church_stained_window", displayName: "Church Stained-Glass Window" },
  { id: "cellar_grate", displayName: "Cellar Grate" },
  { id: "thorn_hedge", displayName: "Thorn Hedge Barrier" },
  { id: "dense_bramble_wall", displayName: "Dense Bramble Wall" },
  { id: "reed_screen", displayName: "Reed Screen" },
  { id: "wattle_fence", displayName: "Wattle Fence" },
  { id: "rubble_barricade", displayName: "Collapsed Rubble Barricade" },
  { id: "timber_barricade", displayName: "Broken Timber Barricade" },
  { id: "glass_growth_barrier", displayName: "Glass Growth Barrier" },
  { id: "black_light_lattice", displayName: "Black-Light Lattice Barrier" },
] as const;

export type ObliqueBarrierTileId = (typeof OBLIQUE_BARRIER_TILE_ORDER)[number]["id"];

export const obliqueBarrierSpriteId = (id: ObliqueBarrierTileId) =>
  `oblique_barrier_${id}` as const;

export const OBLIQUE_BARRIER_SPRITES: SpriteData[] = OBLIQUE_BARRIER_TILE_ORDER.map((tile) => ({
  id: obliqueBarrierSpriteId(tile.id),
  display_name: `Generated Oblique ${tile.displayName}`,
  width: 300,
  height: 300,
  pixels: [],
  data_url: `/overworld/generated/oblique/barrier/${tile.id}.png`,
}));

export const OBLIQUE_BARRIER_OBJECT_TILE_OVERRIDES: Record<string, string> = {
  obj_bush: obliqueBarrierSpriteId("thorn_hedge"),
};

export const isObliqueBarrierSpriteId = (id?: string | null) =>
  Boolean(id && id.startsWith("oblique_barrier_"));
