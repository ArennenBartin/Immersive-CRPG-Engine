import type { RoofSet, Theme } from "./mapAuthoring";

const SIMPLE: Record<string, string> = {
  "floor.default": "obj_floor_plate",
  "wall.block": "obj_wall_block",
  door: "obj_p_door",
  crate: "obj_crate",
  chest: "obj_chest",
  sign: "obj_terminal",
  beacon: "obj_training_beacon",
};

const BASIC_ROOF: RoofSet = {
  n: "obj_wall_block",
  s: "obj_wall_block",
  e: "obj_wall_block",
  w: "obj_wall_block",
  flat: "obj_floor_plate",
  nw: "obj_wall_block",
  ne: "obj_wall_block",
  se: "obj_wall_block",
  sw: "obj_wall_block",
};

export const basicTheme: Theme = {
  resolve(role: string): string {
    const id = SIMPLE[role];
    if (!id) throw new Error(`basicTheme: unknown role "${role}"`);
    return id;
  },
  resolveRoof(): RoofSet {
    return BASIC_ROOF;
  },
};
