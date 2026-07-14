import type { SpriteData } from "../schema/game";

export const GENERATED_PLAYER_DIRECTIONS = ["south", "north", "east", "west"] as const;
export const GENERATED_PLAYER_FRAMES = ["idle", "step"] as const;
const GENERATED_PLAYER_ASSET_VERSION = "20260702-east-west-swap";

export type GeneratedPlayerDirection = (typeof GENERATED_PLAYER_DIRECTIONS)[number];
export type GeneratedPlayerFrame = (typeof GENERATED_PLAYER_FRAMES)[number];

export const generatedIntercessorSpriteId = (
  direction: GeneratedPlayerDirection,
  frame: GeneratedPlayerFrame,
) => `generated_player_intercessor_${direction}_${frame}` as const;

export const GENERATED_INTERCESSOR_DEFAULT_SPRITE_ID = generatedIntercessorSpriteId("south", "idle");

export const GENERATED_INTERCESSOR_PLAYER_SPRITES: SpriteData[] = GENERATED_PLAYER_DIRECTIONS.flatMap((direction) =>
  GENERATED_PLAYER_FRAMES.map((frame) => ({
    id: generatedIntercessorSpriteId(direction, frame),
    display_name: `Generated Intercessor ${direction} ${frame}`,
    width: 627,
    height: 627,
    pixels: [],
    data_url: `/overworld/generated/player/intercessor/${direction}_${frame}.png?v=${GENERATED_PLAYER_ASSET_VERSION}`,
  })),
);

export const isGeneratedPlayerSpriteId = (id?: string | null) =>
  Boolean(id && id.startsWith("generated_player_intercessor_"));
