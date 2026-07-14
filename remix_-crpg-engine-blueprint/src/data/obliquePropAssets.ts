import type { SpriteData } from "../schema/game";

export const OBLIQUE_PROP_ORDER = [
  { id: "wooden_supply_crate", displayName: "Wooden Supply Crate" },
  { id: "iron_banded_chest", displayName: "Iron Banded Chest" },
  { id: "wooden_barrel", displayName: "Wooden Barrel" },
  { id: "open_supply_crate", displayName: "Open Supply Crate" },
  { id: "alchemy_workstation", displayName: "Alchemy Workstation" },
  { id: "info_terminal", displayName: "Info Terminal" },
  { id: "training_beacon", displayName: "Training Beacon" },
  { id: "wooden_signpost", displayName: "Wooden Signpost" },
  { id: "stone_shrine_plinth", displayName: "Stone Shrine Plinth" },
  { id: "market_stall_table", displayName: "Market Stall Table" },
  { id: "handcart", displayName: "Handcart" },
  { id: "rope_pulley_stack", displayName: "Rope And Pulley Stack" },
  { id: "tree_stump_cluster", displayName: "Tree Stump Cluster" },
  { id: "dead_tree_trunk", displayName: "Dead Tree Trunk" },
  { id: "glass_crystal_column", displayName: "Glass Crystal Column" },
  { id: "dark_light_obelisk", displayName: "Dark-Light Obelisk" },
] as const;

export const OBLIQUE_PROP_OBJECT_PASS_ORDER = [
  { id: "simple_wooden_bed", displayName: "Simple Wooden Bed" },
  { id: "straw_bedroll", displayName: "Straw Bedroll" },
  { id: "wooden_chair", displayName: "Wooden Chair" },
  { id: "small_square_table", displayName: "Small Square Table" },
  { id: "tall_bookshelf", displayName: "Tall Bookshelf" },
  { id: "standing_oil_lamp", displayName: "Standing Oil Lamp" },
  { id: "stone_well", displayName: "Stone Well" },
  { id: "rubble_pile", displayName: "Rubble Pile" },
  { id: "wooden_ladder", displayName: "Wooden Ladder" },
  { id: "shop_counter", displayName: "Shop Counter" },
  { id: "mechanism_workbench", displayName: "Mechanism Workbench" },
  { id: "stone_altar", displayName: "Stone Altar" },
  { id: "wooden_cupboard", displayName: "Wooden Cupboard" },
  { id: "iron_stove", displayName: "Iron Stove" },
  { id: "broken_statue_fragment", displayName: "Broken Statue Fragment" },
  { id: "metal_floor_hatch", displayName: "Metal Floor Hatch" },
] as const;

export const OBLIQUE_PROP_EXTERIOR_ORDER = [
  { id: "wind_bent_young_tree", displayName: "Wind-Bent Young Tree" },
  { id: "fallen_log", displayName: "Fallen Log" },
  { id: "mossy_boulder_cluster", displayName: "Mossy Boulder Cluster" },
  { id: "thorn_bramble_clump", displayName: "Thorn Bramble Clump" },
  { id: "tall_reed_clump", displayName: "Tall Reed Clump" },
  { id: "stacked_firewood_pile", displayName: "Stacked Firewood Pile" },
  { id: "hay_bale_stack", displayName: "Hay Bale Stack" },
  { id: "rain_barrel", displayName: "Rain Barrel" },
  { id: "broken_field_fence", displayName: "Broken Field Fence" },
  { id: "loose_timber_plank_pile", displayName: "Loose Timber Plank Pile" },
  { id: "roof_tile_debris_pile", displayName: "Roof Tile Debris Pile" },
  { id: "chimney_pot_and_bricks", displayName: "Chimney Pot And Bricks" },
  { id: "boarded_window_frame", displayName: "Boarded Window Frame" },
  { id: "broken_door_boards", displayName: "Broken Door Boards" },
  { id: "grave_cairn_marker", displayName: "Grave Cairn Marker" },
  { id: "roadside_shrine_signpost", displayName: "Roadside Shrine Signpost" },
] as const;

const OBLIQUE_PROP_ALL_ORDER = [
  ...OBLIQUE_PROP_ORDER,
  ...OBLIQUE_PROP_OBJECT_PASS_ORDER,
  ...OBLIQUE_PROP_EXTERIOR_ORDER,
] as const;

export type ObliquePropId = (typeof OBLIQUE_PROP_ALL_ORDER)[number]["id"];

export const obliquePropSpriteId = (id: ObliquePropId) => `oblique_prop_${id}` as const;

const spriteForProp = (
  prop: { id: ObliquePropId; displayName: string },
  folder: "prop" | "prop_objects" | "prop_exterior",
): SpriteData => ({
  id: obliquePropSpriteId(prop.id),
  display_name: `Generated Oblique ${prop.displayName}`,
  width: 314,
  height: 314,
  pixels: [],
  data_url: `/overworld/generated/oblique/${folder}/${prop.id}.png`,
});

export const OBLIQUE_PROP_SPRITES: SpriteData[] = [
  ...OBLIQUE_PROP_ORDER.map((prop) => spriteForProp(prop, "prop")),
  ...OBLIQUE_PROP_OBJECT_PASS_ORDER.map((prop) => spriteForProp(prop, "prop_objects")),
  ...OBLIQUE_PROP_EXTERIOR_ORDER.map((prop) => spriteForProp(prop, "prop_exterior")),
];

export const OBLIQUE_PROP_OBJECT_TILE_OVERRIDES: Record<string, string> = {
  obj_crate: obliquePropSpriteId("wooden_supply_crate"),
  obj_chest: obliquePropSpriteId("iron_banded_chest"),
  obj_terminal: obliquePropSpriteId("info_terminal"),
  obj_training_beacon: obliquePropSpriteId("training_beacon"),
  obj_dead_tree: obliquePropSpriteId("dead_tree_trunk"),
  obj_bed: obliquePropSpriteId("simple_wooden_bed"),
  obj_bedroll: obliquePropSpriteId("straw_bedroll"),
  obj_chair: obliquePropSpriteId("wooden_chair"),
  obj_small_table: obliquePropSpriteId("small_square_table"),
  obj_bookshelf: obliquePropSpriteId("tall_bookshelf"),
  obj_oil_lamp: obliquePropSpriteId("standing_oil_lamp"),
  obj_well: obliquePropSpriteId("stone_well"),
  obj_rubble_pile: obliquePropSpriteId("rubble_pile"),
  obj_ladder: obliquePropSpriteId("wooden_ladder"),
  obj_shop_counter: obliquePropSpriteId("shop_counter"),
  obj_mechanism_workbench: obliquePropSpriteId("mechanism_workbench"),
  obj_stone_altar: obliquePropSpriteId("stone_altar"),
  obj_cupboard: obliquePropSpriteId("wooden_cupboard"),
  obj_iron_stove: obliquePropSpriteId("iron_stove"),
  obj_broken_statue: obliquePropSpriteId("broken_statue_fragment"),
  obj_floor_hatch: obliquePropSpriteId("metal_floor_hatch"),
  obj_tree: obliquePropSpriteId("wind_bent_young_tree"),
  obj_wind_bent_tree: obliquePropSpriteId("wind_bent_young_tree"),
  obj_fallen_log: obliquePropSpriteId("fallen_log"),
  obj_mossy_boulders: obliquePropSpriteId("mossy_boulder_cluster"),
  obj_thorn_bramble: obliquePropSpriteId("thorn_bramble_clump"),
  obj_reed_clump: obliquePropSpriteId("tall_reed_clump"),
  obj_firewood_pile: obliquePropSpriteId("stacked_firewood_pile"),
  obj_hay_bales: obliquePropSpriteId("hay_bale_stack"),
  obj_rain_barrel: obliquePropSpriteId("rain_barrel"),
  obj_broken_field_fence: obliquePropSpriteId("broken_field_fence"),
  obj_plank_pile: obliquePropSpriteId("loose_timber_plank_pile"),
  obj_roof_tile_debris: obliquePropSpriteId("roof_tile_debris_pile"),
  obj_chimney_bricks: obliquePropSpriteId("chimney_pot_and_bricks"),
  obj_boarded_window_frame: obliquePropSpriteId("boarded_window_frame"),
  obj_broken_door_boards: obliquePropSpriteId("broken_door_boards"),
  obj_grave_cairn_marker: obliquePropSpriteId("grave_cairn_marker"),
  obj_roadside_shrine: obliquePropSpriteId("roadside_shrine_signpost"),
};

export const isObliquePropSpriteId = (id?: string | null) =>
  Boolean(id && id.startsWith("oblique_prop_"));
