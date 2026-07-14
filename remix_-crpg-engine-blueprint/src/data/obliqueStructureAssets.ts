import type { SpriteData } from "../schema/game";

export const OBLIQUE_STRUCTURE_TILE_ORDER = [
  { id: "rough_fieldstone_wall", displayName: "Rough Fieldstone Wall" },
  { id: "dressed_ashlar_wall", displayName: "Dressed Ashlar Wall" },
  { id: "red_brick_wall", displayName: "Red Brick Wall" },
  { id: "timber_plaster_wall", displayName: "Timber And Plaster Wall" },
  { id: "dark_manor_stone_wall", displayName: "Dark Manor Stone Wall" },
  { id: "mossy_ruin_wall", displayName: "Mossy Ruin Wall" },
  { id: "reed_wattle_wall", displayName: "Reed And Wattle Wall" },
  { id: "church_limestone_wall", displayName: "Church Limestone Wall" },
  { id: "charred_wall", displayName: "Charred Wall" },
  { id: "cellar_block_wall", displayName: "Cellar Block Wall" },
  { id: "glass_veined_wall", displayName: "Glass Veined Wall" },
  { id: "wooden_plank_wall", displayName: "Wooden Plank Wall" },
  { id: "simple_wooden_door", displayName: "Simple Wooden Door" },
  { id: "iron_banded_door", displayName: "Iron Banded Door" },
  { id: "arched_church_door", displayName: "Arched Church Door" },
  { id: "dark_manor_gate", displayName: "Dark Manor Gate" },
] as const;

export type ObliqueStructureTileId = (typeof OBLIQUE_STRUCTURE_TILE_ORDER)[number]["id"];

export const obliqueStructureSpriteId = (id: ObliqueStructureTileId) =>
  `oblique_structure_${id}` as const;

export const OBLIQUE_STRUCTURE_SPRITES: SpriteData[] = OBLIQUE_STRUCTURE_TILE_ORDER.map((tile) => ({
  id: obliqueStructureSpriteId(tile.id),
  display_name: `Generated Oblique ${tile.displayName}`,
  width: 300,
  height: 300,
  pixels: [],
  data_url: `/overworld/generated/oblique/structure/${tile.id}.png`,
}));

export const OBLIQUE_STRUCTURE_OBJECT_TILE_OVERRIDES: Record<string, string> = {
  obj_wall_block: obliqueStructureSpriteId("rough_fieldstone_wall"),
  obj_wall_stone: obliqueStructureSpriteId("dressed_ashlar_wall"),
  obj_wall_brick: obliqueStructureSpriteId("red_brick_wall"),
  obj_p_door: obliqueStructureSpriteId("simple_wooden_door"),
};

export const isObliqueStructureSpriteId = (id?: string | null) =>
  Boolean(id && id.startsWith("oblique_structure_"));
