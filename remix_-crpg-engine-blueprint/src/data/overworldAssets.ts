import type { SpriteData } from "../schema/game";
import {
  C,
  OVERWORLD_CONTACT_SHEET_SCALE,
  OVERWORLD_PALETTE,
  OVERWORLD_PALETTE_HEX,
  OVERWORLD_TILE_SIZE,
  OVERWORLD_VOID_HEX,
  type OverworldPaletteId,
} from "./overworldPalette";
import {
  OBJECT_ART,
  OVERWORLD_ART_ERRORS,
  TILE_ART,
  type Pixels,
} from "./overworldPixelArt";
import {
  entityStylePixels,
  overlayPixels,
  playerPixels,
} from "./overworldEntityArt";

export {
  OVERWORLD_CONTACT_SHEET_SCALE,
  OVERWORLD_PALETTE,
  OVERWORLD_PALETTE_HEX,
  OVERWORLD_TILE_SIZE,
  OVERWORLD_VOID_HEX,
  OVERWORLD_ART_ERRORS,
};
export type { OverworldPaletteId };

export type OverworldDirection = "north" | "south" | "east" | "west";
export type OverworldFrame = "idle" | "step";
export type OverworldSpriteSet = Record<OverworldDirection, Record<OverworldFrame, string>>;

const DIRECTIONS: OverworldDirection[] = ["north", "south", "east", "west"];
const FRAMES: OverworldFrame[] = ["idle", "step"];

const sprite = (id: string, displayName: string, pixels: Pixels): SpriteData => ({
  id,
  display_name: displayName,
  width: OVERWORLD_TILE_SIZE,
  height: OVERWORLD_TILE_SIZE,
  pixels,
});

export type OverworldTileStyle =
  | "grass"
  | "earth"
  | "road"
  | "mud"
  | "sand"
  | "stone"
  | "reed"
  | "water"
  | "field"
  | "garden"
  | "brush"
  | "rock"
  | "cliff"
  | "bog"
  | "glass"
  | "fracture"
  | "cavern"
  | "void"
  | "transition";

export type OverworldObjectStyle =
  | "barrel"
  | "crate"
  | "fire"
  | "pool"
  | "trough"
  | "lantern"
  | "rope"
  | "bridge"
  | "lever"
  | "tree"
  | "stump"
  | "bush"
  | "boulder"
  | "log"
  | "grass"
  | "door"
  | "gate"
  | "fence"
  | "wall"
  | "window"
  | "sign"
  | "well"
  | "stall"
  | "shrine"
  | "container"
  | "stone"
  | "glass"
  | "column"
  | "emitter";

export type OverworldEntityStyle =
  | "humanoid"
  | "robed"
  | "child"
  | "guard"
  | "bird"
  | "beast"
  | "boar"
  | "wraith"
  | "echo"
  | "crawler"
  | "tall"
  | "horror"
  | "swarm"
  | "ghost";

export type OverworldTileAsset = {
  id: string;
  displayName: string;
  group: string;
  spriteId: string;
  style: OverworldTileStyle;
  base: OverworldPaletteId;
  accent: OverworldPaletteId;
  walkable: boolean;
  blocksMove?: boolean;
  blocksLos?: boolean;
  surfaceTag?: "water" | "oil" | "ice" | "poison" | "firehazard";
  chemSeed?: Record<string, number | string | boolean>;
  flags?: string[];
  reservedVoid?: boolean;
};

export type OverworldObjectFlags = {
  pushable?: boolean;
  flammable?: boolean;
  conductive?: boolean;
  fragile?: boolean;
  fellable?: boolean;
  container?: boolean;
  blocks_los?: boolean;
  blocks_move?: boolean;
};

export type OverworldObjectAsset = {
  id: string;
  displayName: string;
  group: string;
  spriteId: string;
  style: OverworldObjectStyle;
  base: OverworldPaletteId;
  accent: OverworldPaletteId;
  flags: OverworldObjectFlags;
  chemSeed?: Record<string, number | string | boolean>;
  tags?: string[];
};

export type OverworldEntityAsset = {
  id: string;
  displayName: string;
  group: string;
  archetype: string;
  style: OverworldEntityStyle;
  body: OverworldPaletteId;
  accent: OverworldPaletteId;
  sprites: OverworldSpriteSet;
  emotionalBaseline: {
    valence?: number;
    arousal?: number;
    grief?: number;
    reverence?: number;
    attachment?: number;
  };
  schedule: "diurnal" | "nocturnal" | "fixed" | "companion" | "fracture";
};

export type OverworldPlayerAsset = {
  id: "intercessor";
  displayName: string;
  sprites: OverworldSpriteSet;
  overlays: Record<"on_fire" | "wet" | "frozen", string>;
};

const tile = (
  id: string,
  displayName: string,
  group: string,
  style: OverworldTileStyle,
  base: OverworldPaletteId,
  accent: OverworldPaletteId,
  options: Omit<Partial<OverworldTileAsset>, "id" | "displayName" | "group" | "style" | "base" | "accent" | "spriteId"> = {},
): OverworldTileAsset => ({
  id,
  displayName,
  group,
  style,
  base,
  accent,
  spriteId: `ovr_tile_${id}`,
  walkable: true,
  ...options,
});

const object = (
  id: string,
  displayName: string,
  group: string,
  style: OverworldObjectStyle,
  base: OverworldPaletteId,
  accent: OverworldPaletteId,
  flags: OverworldObjectFlags,
  options: Pick<OverworldObjectAsset, "chemSeed" | "tags"> = {},
): OverworldObjectAsset => ({
  id,
  displayName,
  group,
  style,
  base,
  accent,
  flags,
  spriteId: `ovr_obj_${id}`,
  ...options,
});

const spriteSetFor = (id: string): OverworldSpriteSet =>
  Object.fromEntries(
    DIRECTIONS.map((direction) => [
      direction,
      Object.fromEntries(
        FRAMES.map((frame) => [frame, `ovr_ent_${id}_${direction}_${frame}`]),
      ) as Record<OverworldFrame, string>,
    ]),
  ) as OverworldSpriteSet;

const entity = (
  id: string,
  displayName: string,
  group: string,
  archetype: string,
  style: OverworldEntityStyle,
  body: OverworldPaletteId,
  accent: OverworldPaletteId,
  emotionalBaseline: OverworldEntityAsset["emotionalBaseline"],
  schedule: OverworldEntityAsset["schedule"],
): OverworldEntityAsset => ({
  id,
  displayName,
  group,
  archetype,
  style,
  body,
  accent,
  emotionalBaseline,
  schedule,
  sprites: spriteSetFor(id),
});

export const OVERWORLD_TILES: OverworldTileAsset[] = [
  tile("grass", "Grass", "base_ground", "grass", "grass", "grass_light"),
  tile("dirt_path", "Dirt Path", "base_ground", "road", "dirt", "sand"),
  tile("packed_road", "Packed Road", "base_ground", "road", "road", "dirt_dark"),
  tile("mud", "Mud", "base_ground", "mud", "dirt_dark", "water_dark", { flags: ["slows"] }),
  tile("sand", "Sand", "base_ground", "sand", "sand", "road"),
  tile("bare_stone", "Bare Stone", "base_ground", "stone", "stone", "stone_light"),
  tile("moss", "Moss", "base_ground", "grass", "moss", "grass_light"),
  tile("grave_road", "Grave-Road", "watchfold", "road", "stone_dark", "bone", { flags: ["flagged"] }),
  tile("cairn_stone", "Cairn-Stone", "watchfold", "rock", "stone_dark", "stone_light"),
  tile("turned_earth", "Turned Earth", "watchfold", "earth", "dirt_dark", "dirt"),
  tile("threshold_line", "Threshold Line", "watchfold", "stone", "slate", "bone", { flags: ["flagged"] }),
  tile("fen_reed", "Fen-Reed", "watchfold", "reed", "moss", "reed", {
    flags: ["flammable"],
    chemSeed: { material: "reed", flammable: true },
  }),
  tile("standing_water", "Standing Water", "watchfold", "water", "water", "water_light", {
    surfaceTag: "water",
    chemSeed: { saturation: 90 },
  }),
  tile("fen_mud", "Fen-Mud", "watchfold", "bog", "dirt_dark", "water_dark", { flags: ["slows"] }),
  tile("tilled_field", "Tilled Field", "combe", "field", "dirt", "sand"),
  tile("cobbles", "Cobbles", "combe", "stone", "stone", "stone_light"),
  tile("churchyard_grass", "Churchyard Grass", "combe", "grass", "moss", "bone"),
  tile("hollow_floor", "Hollow Floor", "combe", "earth", "dirt_dark", "stone_dark"),
  tile("flagstone", "Flagstone", "marrowhouse", "stone", "stone_dark", "stone"),
  tile("dark_garden", "Dark Garden", "marrowhouse", "garden", "grass_dark", "purple_dark"),
  tile("gravel", "Gravel", "marrowhouse", "rock", "stone_dark", "stone_light"),
  tile("estate_lawn", "Estate Lawn", "marrowhouse", "grass", "grass_dark", "grass_light"),
  tile("forest_floor", "Forest Floor", "wilds", "earth", "dirt_dark", "moss"),
  tile("dense_brush", "Dense Brush", "wilds", "brush", "grass_dark", "grass_light", {
    flags: ["flammable"],
    blocksLos: true,
    chemSeed: { material: "brush", flammable: true },
  }),
  tile("rock", "Rock", "wilds", "rock", "stone_dark", "stone_light"),
  tile("scree", "Scree", "wilds", "rock", "slate", "stone"),
  tile("cliff_edge", "Cliff Edge", "wilds", "cliff", "stone_dark", "stone_light", {
    blocksMove: true,
    walkable: false,
    flags: ["height"],
  }),
  tile("river", "River", "wilds", "water", "water_dark", "water_light", {
    blocksMove: true,
    walkable: false,
    surfaceTag: "water",
    chemSeed: { saturation: 100 },
  }),
  tile("ford", "Ford", "wilds", "water", "water", "sand", {
    surfaceTag: "water",
    chemSeed: { saturation: 55 },
  }),
  tile("bog", "Bog", "wilds", "bog", "moss", "water_dark", { flags: ["hazard", "slows"] }),
  tile("glass_growth_floor", "Glass-Growth Floor", "fracture", "glass", "purple_dark", "cyan", {
    flags: ["glass"],
  }),
  tile("glass_vein", "Glass-Vein", "fracture", "glass", "slate", "glass", { flags: ["glass", "glow"] }),
  tile("fractured_ground", "Fractured Ground", "fracture", "fracture", "slate", "purple"),
  tile("dark_light_pool", "Dark-Light Pool", "fracture", "water", "purple_dark", "cyan", {
    flags: ["glow"],
  }),
  tile("cavern_rock", "Cavern Rock", "fracture", "cavern", "night", "stone_dark"),
  tile("cramped_tunnel_floor", "Cramped Tunnel Floor", "fracture", "earth", "slate", "purple_dark"),
  tile("void", "Void", "void", "void", "void", "void", {
    walkable: false,
    blocksMove: true,
    blocksLos: true,
    reservedVoid: true,
  }),
  tile("grass_water_edge", "Grass/Water Edge", "transitions", "transition", "grass", "water"),
  tile("road_grass_edge", "Road/Grass Edge", "transitions", "transition", "road", "grass"),
  tile("grass_mud_edge", "Grass/Mud Edge", "transitions", "transition", "grass", "dirt_dark"),
  tile("stone_grass_edge", "Stone/Grass Edge", "transitions", "transition", "stone", "grass"),
  tile("reed_water_edge", "Reed/Water Edge", "transitions", "transition", "reed", "water"),
  tile("fracture_stone_edge", "Fracture/Stone Edge", "transitions", "transition", "purple_dark", "stone"),
];

export const OVERWORLD_OBJECTS: OverworldObjectAsset[] = [
  object("barrel", "Barrel", "systemic_props", "barrel", "wood", "gold", { pushable: true, flammable: true, container: true }, { chemSeed: { material: "wood" } }),
  object("crate", "Crate", "systemic_props", "crate", "wood", "sand", { pushable: true, flammable: true, fragile: true, container: true }, { chemSeed: { material: "wood" } }),
  object("torch_sconce", "Torch/Sconce", "systemic_props", "fire", "wood_dark", "orange", { flammable: true, blocks_los: false }, { chemSeed: { temperature: 350, light: 1 } }),
  object("brazier", "Brazier", "systemic_props", "fire", "stone_dark", "orange", { blocks_move: true }, { chemSeed: { temperature: 400, light: 1 } }),
  object("oil_pool", "Oil Pool", "systemic_props", "pool", "dirt_dark", "orange", {}, { chemSeed: { surface_tag: "oil", fuel: 90 } }),
  object("water_trough", "Water Trough", "systemic_props", "trough", "wood", "water_light", { pushable: true, blocks_move: true }, { chemSeed: { saturation: 100 } }),
  object("lantern", "Lantern", "systemic_props", "lantern", "stone_dark", "gold", { fragile: true }, { chemSeed: { light: 1, fuel: 30 } }),
  object("rope", "Rope", "systemic_props", "rope", "road", "sand", { flammable: true, fragile: true }, { chemSeed: { material: "fiber" } }),
  object("rope_bridge", "Rope Bridge", "systemic_props", "bridge", "wood", "road", { flammable: true, fragile: true }, { chemSeed: { material: "wood" } }),
  object("lever_mechanism", "Lever/Mechanism", "systemic_props", "lever", "wood", "red", { fragile: true, conductive: true }),
  object("tree", "Tree", "nature", "tree", "grass_dark", "grass_light", { flammable: true, fellable: true, blocks_los: true, blocks_move: true }, { chemSeed: { material: "wood" } }),
  object("stump", "Stump", "nature", "stump", "wood", "sand", { flammable: true, blocks_move: true }),
  object("bush", "Bush", "nature", "bush", "grass", "grass_light", { flammable: true, blocks_los: true }, { chemSeed: { material: "brush" } }),
  object("boulder", "Boulder", "nature", "boulder", "stone_dark", "stone_light", { pushable: true, blocks_los: true, blocks_move: true }),
  object("fallen_log", "Fallen Log", "nature", "log", "wood", "sand", { flammable: true, blocks_move: true }),
  object("tall_grass", "Tall Grass", "nature", "grass", "grass_dark", "grass_light", { flammable: true, blocks_los: true }),
  object("door", "Door", "built", "door", "wood", "gold", { flammable: true, blocks_los: true, blocks_move: true }),
  object("gate", "Gate", "built", "gate", "wood_dark", "gold", { flammable: true, blocks_los: true, blocks_move: true }),
  object("fence", "Fence", "built", "fence", "wood", "road", { flammable: true, blocks_move: true }),
  object("wall_segment", "Wall Segment", "built", "wall", "stone_dark", "stone", { blocks_los: true, blocks_move: true }),
  object("window", "Window", "built", "window", "wood", "water_light", { fragile: true, blocks_los: false, blocks_move: true }),
  object("signpost", "Signpost", "built", "sign", "wood", "bone", { flammable: true }),
  object("well", "Well", "built", "well", "stone_dark", "water_light", { blocks_move: true }, { chemSeed: { saturation: 100 } }),
  object("market_stall", "Market Stall", "built", "stall", "wood", "red", { flammable: true, fragile: true, container: true, blocks_move: true }),
  object("shrine", "Shrine", "built", "shrine", "stone_light", "gold", { blocks_move: true }),
  object("chest", "Chest", "containers_loot", "container", "wood", "gold", { flammable: true, fragile: true, container: true, blocks_move: true }),
  object("sack", "Sack", "containers_loot", "container", "dirt", "sand", { flammable: true, fragile: true, container: true }),
  object("urn", "Urn", "containers_loot", "container", "stone", "bone", { fragile: true, container: true }),
  object("reliquary", "Reliquary", "containers_loot", "container", "stone_light", "gold", { fragile: true, container: true, blocks_move: true }),
  object("grave_goods_cairn", "Grave-Goods Cairn", "containers_loot", "stone", "stone_dark", "bone", { fragile: true, container: true, blocks_move: true }),
  object("the_stone", "The Stone", "story_critical", "stone", "slate", "cyan", { blocks_los: true, blocks_move: true }, { tags: ["unique", "lens-site", "glow"] }),
  object("glass_key_mass", "Glass Key Mass", "story_critical", "glass", "purple", "glass", { blocks_los: true, blocks_move: true }, { tags: ["unique", "glass", "glow"] }),
  object("covenant_marker", "Covenant Marker", "story_critical", "stone", "stone_dark", "gold", { blocks_move: true }),
  object("comfort_shard", "Comfort-Shard", "story_critical", "glass", "cyan", "glass", { fragile: true }, { tags: ["glass", "glow"] }),
  object("glass_stalactite", "Glass Stalactite", "fracture_objects", "glass", "purple_dark", "glass", { fragile: true, blocks_los: true }, { tags: ["glass", "ceiling"] }),
  object("glass_column", "Glass Column", "fracture_objects", "column", "purple", "glass", { fragile: true, blocks_los: true, blocks_move: true }, { tags: ["glass"] }),
  object("glass_growth_cluster", "Glass-Growth Cluster", "fracture_objects", "glass", "cyan", "green_glow", { fragile: true, blocks_move: true }, { tags: ["glass", "glow"] }),
  object("dark_light_emitter", "Dark-Light Emitter", "fracture_objects", "emitter", "purple_dark", "cyan", { fragile: true, blocks_move: true }, { tags: ["glow"] }),
];

export const OVERWORLD_ENTITIES: OverworldEntityAsset[] = [
  entity("brother_aldric", "Brother Aldric", "named_story_npcs", "companion", "robed", "stone_light", "gold", { reverence: 62, grief: 48 }, "companion"),
  entity("esk", "Esk", "named_story_npcs", "companion", "humanoid", "road", "red", { valence: 52, arousal: 58, attachment: 42 }, "companion"),
  entity("reni", "Reni", "named_story_npcs", "companion", "humanoid", "purple_dark", "cyan", { attachment: 70, valence: 44 }, "companion"),
  entity("mother_hollin", "Mother Hollin", "named_story_npcs", "companion", "robed", "moss", "bone", { grief: 62, reverence: 45 }, "companion"),
  entity("wenna", "Wenna", "named_story_npcs", "watchfold", "robed", "stone", "bone", { grief: 78, reverence: 64, arousal: 28 }, "fixed"),
  entity("ode", "Ode", "named_story_npcs", "watchfold", "humanoid", "dirt", "bone", { grief: 64, valence: 38 }, "diurnal"),
  entity("maren", "Maren", "named_story_npcs", "watchfold", "robed", "slate", "purple", { reverence: 72, grief: 55 }, "fixed"),
  entity("prioress_cael", "Prioress Cael", "named_story_npcs", "combe", "robed", "bone", "gold", { grief: 72, reverence: 58 }, "fixed"),
  entity("sister_linnet", "Sister Linnet", "named_story_npcs", "combe", "robed", "grass_light", "bone", { grief: 58, valence: 48 }, "diurnal"),
  entity("doran", "Doran", "named_story_npcs", "combe", "humanoid", "stone_dark", "red", { grief: 80, arousal: 22, valence: 32 }, "fixed"),
  entity("ister", "Ister", "named_story_npcs", "marrowhouse", "robed", "purple_dark", "gold", { attachment: 76, reverence: 38 }, "fixed"),
  entity("orla", "Orla", "named_story_npcs", "marrowhouse", "humanoid", "night", "cyan", { attachment: 68, arousal: 42 }, "diurnal"),
  entity("girl_at_the_stone", "The Girl at the Stone", "named_story_npcs", "lens", "child", "white", "cyan", { reverence: 90, attachment: 88, arousal: 12 }, "fixed"),
  entity("watcher", "Watcher", "generic_townsfolk", "townsfolk", "humanoid", "stone", "bone", { reverence: 55 }, "diurnal"),
  entity("parishioner", "Parishioner", "generic_townsfolk", "townsfolk", "robed", "grass", "bone", { grief: 58 }, "diurnal"),
  entity("house_vessel", "House Vessel", "generic_townsfolk", "townsfolk", "robed", "purple_dark", "gold", { attachment: 72 }, "fixed"),
  entity("villager", "Villager", "generic_townsfolk", "townsfolk", "humanoid", "dirt", "sand", { valence: 50 }, "diurnal"),
  entity("child", "Child", "generic_townsfolk", "townsfolk", "child", "road", "grass_light", { valence: 55, arousal: 55 }, "diurnal"),
  entity("elder", "Elder", "generic_townsfolk", "townsfolk", "robed", "stone", "white", { grief: 50, arousal: 25 }, "diurnal"),
  entity("merchant", "Merchant", "generic_townsfolk", "townsfolk", "humanoid", "sand", "gold", { valence: 55, attachment: 45 }, "diurnal"),
  entity("guard", "Guard", "generic_townsfolk", "townsfolk", "guard", "slate", "red", { arousal: 45, attachment: 55 }, "diurnal"),
  entity("carrion_bird", "Carrion-Bird", "wildlife_threats", "wildlife", "bird", "slate", "red", { arousal: 55 }, "diurnal"),
  entity("fen_thing", "Fen-Thing", "wildlife_threats", "wildlife", "beast", "moss", "water_light", { arousal: 62, valence: 35 }, "nocturnal"),
  entity("wolf_hound", "Wolf/Hound", "wildlife_threats", "wildlife", "beast", "stone_dark", "white", { arousal: 66, valence: 38 }, "nocturnal"),
  entity("boar", "Boar", "wildlife_threats", "wildlife", "boar", "dirt_dark", "bone", { arousal: 70 }, "diurnal"),
  entity("grief_wraith", "Grief-Wraith", "grid_amplified_threats", "grid_threat", "wraith", "purple", "cyan", { grief: 90, valence: 18, arousal: 28 }, "nocturnal"),
  entity("hollowed_echo", "Hollowed-Echo", "grid_amplified_threats", "grid_threat", "echo", "stone_light", "purple", { reverence: 85, arousal: 12 }, "fixed"),
  entity("amplified_beast", "Amplified-Beast", "grid_amplified_threats", "grid_threat", "beast", "purple_dark", "green_glow", { arousal: 82, valence: 20 }, "nocturnal"),
  entity("ravener", "Ravener", "grid_amplified_threats", "grid_threat", "beast", "red", "purple", { attachment: 82, arousal: 78, valence: 18 }, "nocturnal"),
  entity("screaming_crawler", "Screaming-Faced Crawler", "alderamontican_horrors", "fracture_horror", "crawler", "night", "skin", { arousal: 75, valence: 10 }, "fracture"),
  entity("screaming_tall", "Tall Screaming-Faced Thing", "alderamontican_horrors", "fracture_horror", "tall", "purple_dark", "skin", { reverence: 20, arousal: 70 }, "fracture"),
  entity("screaming_swarm", "Screaming-Faced Swarm", "alderamontican_horrors", "fracture_horror", "swarm", "slate", "skin", { arousal: 85, valence: 5 }, "fracture"),
  entity("false_person", "False-Person", "alderamontican_horrors", "fracture_horror", "humanoid", "skin", "red", { attachment: 10, arousal: 60 }, "fracture"),
  entity("face_in_the_joint", "Face in the Joint", "alderamontican_horrors", "fracture_horror", "horror", "wood_dark", "skin", { grief: 65, arousal: 65 }, "fracture"),
  entity("lanternless", "Lanternless", "fracture_faction", "fracture_inhabitant", "robed", "night", "gold", { reverence: 18, arousal: 40 }, "fracture"),
  entity("uncounted", "Uncounted", "fracture_faction", "fracture_inhabitant", "humanoid", "slate", "glass", { attachment: 15, valence: 42 }, "fracture"),
  entity("ghost_shelter_keeper", "Ghost-Shelter Keeper", "fracture_faction", "fracture_inhabitant", "ghost", "glass", "purple", { grief: 45, reverence: 35 }, "fracture"),
  entity("cyber_ghost", "Cyber-Ghost", "fracture_faction", "fracture_inhabitant", "ghost", "cyan", "green_glow", { arousal: 45, reverence: 5 }, "fracture"),
];

export const OVERWORLD_PLAYER: OverworldPlayerAsset = {
  id: "intercessor",
  displayName: "The Intercessor",
  sprites: spriteSetFor("intercessor"),
  overlays: {
    on_fire: "ovr_overlay_player_on_fire",
    wet: "ovr_overlay_player_wet",
    frozen: "ovr_overlay_player_frozen",
  },
};

// One-page north star: tile / object / NPC / enemy, plus supporting examples.
export const OVERWORLD_STYLE_REFERENCE_SPRITE_IDS = [
  "ovr_tile_grass",
  "ovr_obj_the_stone",
  "ovr_ent_girl_at_the_stone_south_idle",
  "ovr_ent_screaming_crawler_south_idle",
  "ovr_ent_intercessor_south_idle",
  "ovr_obj_tree",
  "ovr_tile_standing_water",
  "ovr_ent_grief_wraith_south_idle",
];

const missingTile = (): Pixels =>
  new Array(OVERWORLD_TILE_SIZE * OVERWORLD_TILE_SIZE).fill(C("red"));

export const overworldTileSprites: SpriteData[] = OVERWORLD_TILES.map((entry) => {
  const draw = TILE_ART[entry.id];
  if (!draw) OVERWORLD_ART_ERRORS.push(`tile ${entry.id}: no hand-authored art`);
  return sprite(entry.spriteId, entry.displayName, draw ? draw() : missingTile());
});

export const overworldObjectSprites: SpriteData[] = OVERWORLD_OBJECTS.map((entry) => {
  const draw = OBJECT_ART[entry.id];
  if (!draw) OVERWORLD_ART_ERRORS.push(`object ${entry.id}: no hand-authored art`);
  return sprite(entry.spriteId, entry.displayName, draw ? draw() : missingTile());
});

export const overworldEntitySprites: SpriteData[] = OVERWORLD_ENTITIES.flatMap((entry) =>
  DIRECTIONS.flatMap((direction) =>
    FRAMES.map((frame) =>
      sprite(
        entry.sprites[direction][frame],
        `${entry.displayName} ${direction} ${frame}`,
        entityStylePixels(entry.style, entry.body, entry.accent, direction, frame),
      ),
    ),
  ),
);

export const overworldPlayerSprites: SpriteData[] = DIRECTIONS.flatMap((direction) =>
  FRAMES.map((frame) =>
    sprite(
      OVERWORLD_PLAYER.sprites[direction][frame],
      `${OVERWORLD_PLAYER.displayName} ${direction} ${frame}`,
      playerPixels(direction, frame),
    ),
  ),
);

export const overworldOverlaySprites: SpriteData[] = [
  sprite(OVERWORLD_PLAYER.overlays.on_fire, "Player On-Fire Overlay", overlayPixels("on_fire")),
  sprite(OVERWORLD_PLAYER.overlays.wet, "Player Wet Overlay", overlayPixels("wet")),
  sprite(OVERWORLD_PLAYER.overlays.frozen, "Player Frozen Overlay", overlayPixels("frozen")),
];

export const OVERWORLD_SPRITES: SpriteData[] = [
  ...overworldTileSprites,
  ...overworldObjectSprites,
  ...overworldEntitySprites,
  ...overworldPlayerSprites,
  ...overworldOverlaySprites,
];

export const OVERWORLD_ASSET_MANIFEST = {
  version: 2,
  tileSize: OVERWORLD_TILE_SIZE,
  palette: OVERWORLD_PALETTE,
  tiles: OVERWORLD_TILES,
  objects: OVERWORLD_OBJECTS,
  entities: OVERWORLD_ENTITIES,
  player: OVERWORLD_PLAYER,
  styleReferenceSpriteIds: OVERWORLD_STYLE_REFERENCE_SPRITE_IDS,
} as const;

export const getOverworldAssetSummary = () => ({
  paletteColors: OVERWORLD_PALETTE.length,
  tiles: OVERWORLD_TILES.length,
  objects: OVERWORLD_OBJECTS.length,
  entities: OVERWORLD_ENTITIES.length,
  playerSpriteFrames: DIRECTIONS.length * FRAMES.length,
  overlaySprites: overworldOverlaySprites.length,
  sprites: OVERWORLD_SPRITES.length,
});
