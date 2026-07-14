import type { SpriteData } from "../schema/game";

export const OBLIQUE_TERRAIN_TILE_ORDER = [
  { id: "grass", displayName: "Grass" },
  { id: "dirt_path", displayName: "Dirt Path" },
  { id: "packed_road", displayName: "Packed Road" },
  { id: "mud", displayName: "Mud" },
  { id: "sand", displayName: "Sand" },
  { id: "bare_stone", displayName: "Bare Stone" },
  { id: "moss", displayName: "Moss" },
  { id: "grave_road", displayName: "Grave Road" },
  { id: "cairn_stone", displayName: "Cairn Stone" },
  { id: "fen_reed", displayName: "Fen Reed" },
  { id: "standing_water", displayName: "Standing Water" },
  { id: "tilled_field", displayName: "Tilled Field" },
  { id: "dark_garden", displayName: "Dark Garden" },
  { id: "dense_brush", displayName: "Dense Brush" },
  { id: "fractured_ground", displayName: "Fractured Ground" },
  { id: "glass_vein", displayName: "Glass Vein" },
] as const;

export type ObliqueTerrainTileId = (typeof OBLIQUE_TERRAIN_TILE_ORDER)[number]["id"];

export const obliqueTerrainSpriteId = (id: ObliqueTerrainTileId) => `oblique_tile_${id}` as const;

export const OBLIQUE_TERRAIN_SPRITES: SpriteData[] = OBLIQUE_TERRAIN_TILE_ORDER.map((tile) => ({
  id: obliqueTerrainSpriteId(tile.id),
  display_name: `Generated Oblique ${tile.displayName}`,
  width: 320,
  height: 320,
  pixels: [],
  data_url: `/overworld/generated/oblique/terrain/${tile.id}.png`,
}));

// Active overworld floor skin. Structure wall/door tiles live in
// obliqueStructureAssets; map-scale landmarks are intentionally not single-tile
// icons and should be hand-built from terrain/structure tiles.
export const OBLIQUE_OBJECT_TILE_OVERRIDES: Record<string, string> = {
  obj_world_water: obliqueTerrainSpriteId("standing_water"),
  obj_world_coast: obliqueTerrainSpriteId("sand"),
  obj_world_plains: obliqueTerrainSpriteId("grass"),
  obj_world_hills: obliqueTerrainSpriteId("moss"),
  obj_world_forest: obliqueTerrainSpriteId("dense_brush"),
  obj_world_marsh: obliqueTerrainSpriteId("fen_reed"),
  obj_world_road: obliqueTerrainSpriteId("dirt_path"),
  obj_world_scar: obliqueTerrainSpriteId("fractured_ground"),
};

export const isObliqueTerrainSpriteId = (id?: string | null) =>
  Boolean(id && id.startsWith("oblique_tile_"));
