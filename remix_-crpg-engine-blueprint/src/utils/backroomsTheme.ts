import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} from "../schema/presets";
import type { RoofSet, Theme } from "./mapAuthoring";

const LEVEL_ZERO_ROLES: Record<string, string> = {
  "floor.default": BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  "floor.carpet": BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  "floor.level_zero": BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  "wall.block": BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  "wall.wallpaper": BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  "wall.level_zero": BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  "light.ceiling": BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  "light.fluorescent": BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  "fixture.ceiling_light": BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  door: "obj_p_door",
  crate: "obj_crate",
  chest: "obj_chest",
  sign: "obj_terminal",
  beacon: "obj_training_beacon",
};

const LEVEL_ZERO_ROOF: RoofSet = {
  n: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  s: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  e: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  w: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  flat: BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  nw: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  ne: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  se: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  sw: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
};

export const backroomsLevelZeroTheme: Theme = {
  resolve(role: string): string {
    const id = LEVEL_ZERO_ROLES[role];
    if (!id) {
      throw new Error(`backroomsLevelZeroTheme: unknown role "${role}"`);
    }
    return id;
  },
  resolveRoof(): RoofSet {
    return LEVEL_ZERO_ROOF;
  },
};

export const backroomsTheme = backroomsLevelZeroTheme;
