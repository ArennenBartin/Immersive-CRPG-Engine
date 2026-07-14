import {
  defineStamp,
  rect,
  type Facing,
  type MapBuilder,
  type Region,
  type Vec2,
} from "./mapAuthoring";

const ringWall = (m: MapBuilder, bounds: Region, door?: Vec2) => {
  if (bounds.kind !== "rect") throw new Error("ringWall: rect bounds only");
  const { x0, z0, x1, z1 } = bounds;
  for (let x = x0; x <= x1; x++) {
    if (!door || door[0] !== x || door[1] !== z0) m.wall([x, z0], "wall.block");
    if (!door || door[0] !== x || door[1] !== z1) m.wall([x, z1], "wall.block");
  }
  for (let z = z0 + 1; z <= z1 - 1; z++) {
    if (!door || door[0] !== x0 || door[1] !== z) m.wall([x0, z], "wall.block");
    if (!door || door[0] !== x1 || door[1] !== z) m.wall([x1, z], "wall.block");
  }
};

export interface BasicRoomOpts {
  bounds: Region;
  door: { at: Vec2; facing: Facing };
}

defineStamp<BasicRoomOpts>("basicRoom", (m, opts) => {
  m.pave(opts.bounds, "floor.default");
  ringWall(m, opts.bounds, opts.door.at);
  m.place({ at: opts.door.at, role: "door", facing: opts.door.facing, block: false });
  return { door: opts.door.at };
});

export interface BasicCorridorOpts {
  from: Vec2;
  to: Vec2;
  width?: number;
}

defineStamp<BasicCorridorOpts>("basicCorridor", (m, opts) => {
  const width = Math.max(1, opts.width ?? 1);
  const half = Math.floor(width / 2);
  const x0 = Math.min(opts.from[0], opts.to[0]);
  const x1 = Math.max(opts.from[0], opts.to[0]);
  const z0 = Math.min(opts.from[1], opts.to[1]);
  const z1 = Math.max(opts.from[1], opts.to[1]);
  const bounds =
    x0 === x1
      ? rect(x0 - half, z0, x1 + half, z1)
      : rect(x0, z0 - half, x1, z1 + half);
  m.pave(bounds, "floor.default");
  return { start: opts.from, end: opts.to };
});

export interface BlockedYardOpts {
  bounds: Region;
  gate: Vec2;
}

defineStamp<BlockedYardOpts>("blockedYard", (m, opts) => {
  m.pave(opts.bounds, "floor.default");
  ringWall(m, opts.bounds, opts.gate);
  if (opts.bounds.kind !== "rect") return { gate: opts.gate };
  const { x0, z0, x1, z1 } = opts.bounds;
  m.place({ at: [x0 + 2, z0 + 2], role: "crate", facing: "south" });
  m.place({ at: [x1 - 2, z1 - 2], role: "crate", facing: "west" });
  m.place({ at: [Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2)], role: "beacon" });
  return { gate: opts.gate };
});

export interface TreasureNookOpts {
  anchor: Vec2;
}

defineStamp<TreasureNookOpts>("treasureNook", (m, opts) => {
  const [x, z] = opts.anchor;
  const bounds = rect(x - 2, z - 2, x + 2, z + 2);
  m.pave(bounds, "floor.default");
  ringWall(m, bounds, [x, z + 2]);
  m.place({ at: [x - 1, z], role: "sign", facing: "south", block: false });
  m.container({
    id: `chest_${x}_${z}`,
    at: [x + 1, z],
    facing: "south",
    name: "Treasure Nook Chest",
    items: [{ item_id: "itm_health_tonic", count: 1 }],
  });
  return { chest: [x + 1, z], sign: [x - 1, z] };
});

export interface StampPreset {
  presetName: string;
  stampName: string;
  build: (x: number, z: number) => unknown;
}

export const STAMP_PRESETS: StampPreset[] = [
  {
    presetName: "Room",
    stampName: "basicRoom",
    build: (x, z): BasicRoomOpts => ({
      bounds: rect(x - 3, z - 3, x + 3, z + 3),
      door: { at: [x, z + 3], facing: "south" },
    }),
  },
  {
    presetName: "Corridor",
    stampName: "basicCorridor",
    build: (x, z): BasicCorridorOpts => ({
      from: [x - 4, z],
      to: [x + 4, z],
      width: 3,
    }),
  },
  {
    presetName: "Blocked Yard",
    stampName: "blockedYard",
    build: (x, z): BlockedYardOpts => ({
      bounds: rect(x - 4, z - 4, x + 4, z + 4),
      gate: [x, z + 4],
    }),
  },
  {
    presetName: "Treasure Nook",
    stampName: "treasureNook",
    build: (x, z): TreasureNookOpts => ({ anchor: [x, z] }),
  },
];
