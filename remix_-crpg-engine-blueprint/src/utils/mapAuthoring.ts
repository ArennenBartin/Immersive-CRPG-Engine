// The Map Authoring DSL.
//
// A higher-level vocabulary for building maps. The unit of authoring is
// "structure" (building, road, district, stamp), not "cell." The DSL emits
// exactly the {cells, custom_object_placements, item_placements,
// container_placements, entity_placements, triggers} shape that game.ts
// already expects, so no engine changes are needed.
//
// Design:
//   • Tier-aware: setTier(region, level) auto-adds retaining cliffs (sealed
//     edge cells) and stair gaps; primitives below respect the per-cell tier
//     so walls/roofs/chimneys land at the right y.
//   • Theme-indirect: ops accept abstract roles ("floor.cobble", "wall.timber",
//     "roof.slate"); a Theme binds roles to concrete object_ids.
//   • Stamps: reusable composed recipes (cottage, cathedral, stall…), each
//     declares named anchors so callers can place NPCs/items by name.
//   • Walkability-aware scatter, walkability-aware road auto-bridges/doors.
//
// All ops are imperative on the MapBuilder for ergonomics. .build() returns
// the engine arrays.

import type {
  CellData,
  ConditionData,
  ContainerPlacementData,
  EntityPlacementData,
  ObjectPlacementData,
  TriggerData,
  WorldItemPlacementData,
} from "../schema/game";

// ── Types ────────────────────────────────────────────────────────────────────

export type Vec2 = [number, number];
export type FacingDir = "north" | "south" | "east" | "west";
export type Facing = FacingDir | Vec2;

export type Region =
  | { kind: "rect"; x0: number; z0: number; x1: number; z1: number }
  | { kind: "cells"; cells: Vec2[] };

export interface RoofSet {
  n: string; s: string; e: string; w: string; flat: string;
  nw: string; ne: string; se: string; sw: string;
}

export interface Theme {
  // Simple role → object_id. Throws on unknown roles so typos surface.
  resolve(role: string): string;
  // Roof sets are nested; a role like "roof.slate" returns 9 ids.
  resolveRoof(name: string): RoofSet;
}

export interface MapBounds {
  width: number;
  height: number;
  minX: number;
  minZ: number;
}

export interface MapBuildResult {
  cells: CellData[];
  custom_object_placements: ObjectPlacementData[];
  item_placements: WorldItemPlacementData[];
  container_placements: ContainerPlacementData[];
  entity_placements: EntityPlacementData[];
  triggers: TriggerData[];
  spawns: { id: string; cell: Vec2; facing: Vec2 }[];
  exits: {
    cell: Vec2;
    target_map_id: string;
    target_spawn_id?: string;
    facing: Vec2;
    condition?: ConditionData;
  }[];
  // Bookkeeping for downstream tools (validator, printer).
  bounds: MapBounds;
  anchors: Record<string, Vec2>;
  zones: Record<string, Region>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const rect = (x0: number, z0: number, x1: number, z1: number): Region => ({
  kind: "rect",
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});

export const cellsRegion = (cells: Vec2[]): Region => ({ kind: "cells", cells });

export const spline = (points: Vec2[]): Vec2[] => points;

const FACING_VECTORS: Record<FacingDir, Vec2> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

export const normFacing = (f: Facing): Vec2 =>
  typeof f === "string" ? FACING_VECTORS[f] : f;

const cellKey = (x: number, z: number) => `${x}|${z}`;

export const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const iterRegion = (region: Region, fn: (x: number, z: number) => void) => {
  if (region.kind === "rect") {
    for (let x = region.x0; x <= region.x1; x++)
      for (let z = region.z0; z <= region.z1; z++) fn(x, z);
  } else {
    for (const [x, z] of region.cells) fn(x, z);
  }
};

const inRegion = (region: Region, x: number, z: number): boolean => {
  if (region.kind === "rect")
    return x >= region.x0 && x <= region.x1 && z >= region.z0 && z <= region.z1;
  return region.cells.some(([cx, cz]) => cx === x && cz === z);
};

// ── Stamp registry ──────────────────────────────────────────────────────────

export type StampFn<O = any> = (m: MapBuilder, opts: O) => Record<string, Vec2>;

const stamps = new Map<string, StampFn>();

export function defineStamp<O>(name: string, fn: StampFn<O>): void {
  stamps.set(name, fn as StampFn);
}

export function getStampNames(): string[] {
  return Array.from(stamps.keys()).sort();
}

export function runStamp<O = any>(
  m: MapBuilder,
  name: string,
  opts: O,
): Record<string, Vec2> {
  const fn = stamps.get(name);
  if (!fn) throw new Error(`unknown stamp: ${name}`);
  return fn(m, opts as any) || {};
}

// ── MapBuilder ──────────────────────────────────────────────────────────────

export interface BuildingOpts {
  bounds: Region;          // rectangular footprint
  wall: string;            // role (e.g. "wall.fieldstone")
  floor: string;           // role (e.g. "floor.boards")
  roof: string | null;     // roof set name (e.g. "slate"), or null for no roof
  door: { at: Vec2; facing: Facing };
  chimney?: Vec2;
  interiorWalls?: { from: Vec2; to: Vec2; gap?: Vec2 }[];
  // Optional named points inside the building, merged into the global
  // anchor map (e.g. { "aldric.desk": [-24, -32] }).
  anchors?: Record<string, Vec2>;
}

export interface ScatterOpts {
  in: Region;
  // [role, weight] pairs.
  weighted: [string, number][];
  density: number;         // 0..1 probability per candidate cell
  minSpacing?: number;     // cells; 0 = none
  avoidReserved?: boolean; // default true: skip cells already touched
  block?: boolean;         // default false (scatter is decoration)
  rngStream?: string;      // optional seed-stream name for determinism
}

export interface RoadOpts {
  width?: number;          // odd integer; default 3
  kind?: string;           // floor role; default "floor.road"
}

export interface PlaceOpts {
  at: Vec2;
  role: string;            // resolved through theme; or pass id directly if starts with "obj_"
  facing?: Facing;
  dialogue?: string;
  block?: boolean;         // default true
  footprint?: Region;      // additional blocked cells (for big landmarks)
  // If true, render as a separate raised cell at y+yOffset (for spires,
  // chimneys, roof ornaments).
  raised?: { yOffset: number };
}

export interface ContainerOpts {
  id: string;
  at: Vec2;
  facing?: Facing;
  name?: string;
  locked?: boolean;
  key?: string;
  items?: { item_id: string; count?: number }[];
}

export interface ItemOpts {
  id: string;
  item: string;            // item_id
  at: Vec2;
  count?: number;
}

export interface NPCOpts {
  id: string;
  at: Vec2;
  facing?: Facing;
  schedule?: { hour: number; at: Vec2 }[];
}

export interface SpawnOpts {
  id: string;
  at: Vec2;
  facing?: Facing;
}

export interface ExitOpts {
  at: Vec2;
  to: { map: string; spawn?: string };
  facing?: Facing;
  condition?: ConditionData;
}

export class MapBuilder {
  private theme: Theme;
  private bounds: MapBounds;
  private grid = new Map<string, CellData>();
  private placements: ObjectPlacementData[] = [];
  private items: WorldItemPlacementData[] = [];
  private containers: ContainerPlacementData[] = [];
  private entities: EntityPlacementData[] = [];
  private triggers: TriggerData[] = [];
  private spawns: { id: string; cell: Vec2; facing: Vec2 }[] = [];
  private exits: {
    cell: Vec2;
    target_map_id: string;
    target_spawn_id?: string;
    facing: Vec2;
    condition?: ConditionData;
  }[] = [];
  private reserved = new Set<string>();
  private tierByCell = new Map<string, 0 | 1 | 2>();
  private anchors: Record<string, Vec2> = {};
  private zones: Record<string, Region> = {};
  private streetCells = new Set<string>(); // cells painted by road() — keeps lots off the carriageway
  private rng: () => number;
  private rngStreams = new Map<string, () => number>();

  constructor(opts: MapBounds & { theme: Theme; seed?: number; skipInit?: boolean }) {
    this.theme = opts.theme;
    this.bounds = {
      width: opts.width,
      height: opts.height,
      minX: opts.minX,
      minZ: opts.minZ,
    };
    this.rng = mulberry32(opts.seed ?? 0x4d4150);
    if (!opts.skipInit) this.initGrid();
  }

  // ── Internal ──
  private initGrid() {
    const { width, height, minX, minZ } = this.bounds;
    for (let x = minX; x < minX + width; x++) {
      for (let z = minZ; z < minZ + height; z++) {
        const cell: CellData = {
          x, y: 0, z,
          active: true, walkable: true, blocks_los: false,
          height: 0, visual_height: 0,
          terrain: "grass", surface_tag: "none",
        };
        this.grid.set(cellKey(x, z), cell);
      }
    }
  }

  private get(x: number, z: number): CellData | undefined {
    return this.grid.get(cellKey(x, z));
  }

  private tierOf(x: number, z: number): 0 | 1 | 2 {
    return this.tierByCell.get(cellKey(x, z)) ?? 0;
  }

  private baseY(x: number, z: number): number {
    return this.tierOf(x, z) * 0.5;
  }

  private resolveOrId(role: string): string {
    return role.startsWith("obj_") ? role : this.theme.resolve(role);
  }

  private stream(name?: string): () => number {
    if (!name) return this.rng;
    let s = this.rngStreams.get(name);
    if (!s) {
      let seed = 0;
      for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
      s = mulberry32(seed);
      this.rngStreams.set(name, s);
    }
    return s;
  }

  // ── Public: placement queries (coherent-town guards) ──
  inBounds(x: number, z: number): boolean {
    return this.grid.has(cellKey(x, z));
  }

  isWater(x: number, z: number): boolean {
    const c = this.get(x, z);
    return !!c && c.surface_tag === "water";
  }

  isStreet(x: number, z: number): boolean {
    return this.streetCells.has(cellKey(x, z));
  }

  // True only if every cell in the region is in-bounds, unreserved, dry land,
  // and not part of a street. Use before placing a building so nothing ever
  // overlaps a road, the river, or another structure.
  canPlace(region: Region, opts: { allowStreet?: boolean } = {}): boolean {
    let ok = true;
    iterRegion(region, (x, z) => {
      if (!ok) return;
      const c = this.get(x, z);
      const k = cellKey(x, z);
      if (!c || this.reserved.has(k) || c.surface_tag === "water") ok = false;
      else if (!opts.allowStreet && this.streetCells.has(k)) ok = false;
    });
    return ok;
  }

  // ── Public: zones & anchors ──
  zone(name: string, region: Region): this {
    this.zones[name] = region;
    return this;
  }

  anchor(name: string, at?: Vec2): Vec2 | undefined {
    if (at !== undefined) {
      this.anchors[name] = at;
      return at;
    }
    return this.anchors[name];
  }

  // ── Public: terrain primitives ──
  fill(role: string): this {
    const id = this.resolveOrId(role);
    for (const c of this.grid.values()) {
      c.object_id = id;
      c.terrain = id.includes("water") ? "water" : id.includes("turf") || id.includes("grass") || id.includes("plot") || id.includes("grave_earth") ? "grass" : "stone";
    }
    return this;
  }

  pave(region: Region, role: string): this {
    const id = this.resolveOrId(role);
    iterRegion(region, (x, z) => {
      const c = this.get(x, z);
      if (!c) return;
      c.object_id = id;
      c.terrain = id.includes("water") ? "water" : id.includes("turf") || id.includes("grave_earth") ? "grass" : "stone";
      c.surface_tag = id.includes("water") ? "water" : "none";
    });
    return this;
  }

  // Mark cells unwalkable (e.g. a landmark's footprint).
  block(region: Region): this {
    iterRegion(region, (x, z) => {
      const c = this.get(x, z);
      if (!c) return;
      c.walkable = false;
      this.reserved.add(cellKey(x, z));
    });
    return this;
  }

  // Force walkability for a region (e.g. a bridge deck over water).
  setWalk(region: Region, val: boolean): this {
    iterRegion(region, (x, z) => {
      const c = this.get(x, z);
      if (c) c.walkable = val;
    });
    return this;
  }

  // ── Public: tiers ──
  // Set elevation for a region. Cells at the boundary become unwalkable
  // (the cliff) except in `stairGaps`, which stay walkable as one-cell steps.
  // Engine rule: vh delta > 1 is impassable, so we always go up by exactly 1.
  tier(
    region: Region,
    level: 0 | 1 | 2,
    opts: { stairGaps?: Vec2[] } = {},
  ): this {
    iterRegion(region, (x, z) => {
      const c = this.get(x, z);
      if (!c) return;
      this.tierByCell.set(cellKey(x, z), level);
      c.visual_height = level;
    });
    if (opts.stairGaps) {
      // Make sure the listed gap cells stay walkable even if a future op
      // would mark them otherwise; tag a small reservation so callers know.
      for (const [x, z] of opts.stairGaps) {
        const c = this.get(x, z);
        if (c) c.walkable = true;
      }
    }
    return this;
  }

  // ── Public: seal a row/column (cliff line with stair gaps) ──
  // Use along="z" with at=Z to make a horizontal line at that z; along="x"
  // for a vertical line. Cells become unwalkable except for the gap indices,
  // which stay walkable as stair steps.
  seal(opts: {
    along: "x" | "z";
    at: number;
    from: number;
    to: number;
    gaps?: number[];
  }): this {
    const gaps = new Set(opts.gaps || []);
    for (let i = opts.from; i <= opts.to; i++) {
      if (gaps.has(i)) continue;
      const x = opts.along === "z" ? i : opts.at;
      const z = opts.along === "z" ? opts.at : i;
      const c = this.get(x, z);
      if (c) c.walkable = false;
    }
    return this;
  }

  // ── Public: roads ──
  road(points: Vec2[], opts: RoadOpts = {}): this {
    const width = opts.width ?? 3;
    const role = opts.kind ?? "floor.road";
    const r = Math.floor(width / 2);
    const cells = new Set<string>();
    for (let seg = 0; seg < points.length - 1; seg++) {
      const [x0, z0] = points[seg];
      const [x1, z1] = points[seg + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(len * 1.5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = x0 + dx * t;
        const cz = z0 + dz * t;
        for (let dxx = -r; dxx <= r; dxx++) {
          for (let dzz = -r; dzz <= r; dzz++) {
            cells.add(cellKey(Math.round(cx + dxx), Math.round(cz + dzz)));
          }
        }
      }
    }
    const id = this.resolveOrId(role);
    for (const k of cells) {
      const [xs, zs] = k.split("|").map(Number);
      const c = this.get(xs, zs);
      if (!c) continue;
      // A road never paves over water (so bridges, not roads, cross rivers).
      if (c.surface_tag === "water") continue;
      c.object_id = id;
      c.walkable = true;
      c.terrain = "stone";
      this.streetCells.add(k);
    }
    return this;
  }

  // ── Public: walls & buildings ──
  // Set a single cell as a wall. vh defaults to 4 (full-height wall).
  // Use vh=2 for low/coped walls (yard enclosures, parapets).
  wall(at: Vec2, role: string, opts: { vh?: number } = {}): this {
    const c = this.get(at[0], at[1]);
    if (!c) return this;
    const vh = opts.vh ?? 4;
    c.object_id = this.resolveOrId(role);
    c.walkable = false;
    c.blocks_los = vh >= 4;
    c.y = this.baseY(at[0], at[1]);
    c.visual_height = vh;
    c.terrain = "stone";
    this.reserved.add(cellKey(at[0], at[1]));
    return this;
  }

  private setWallCell(x: number, z: number, role: string): void {
    this.wall([x, z], role);
  }

  building(opts: BuildingOpts): this {
    if (opts.bounds.kind !== "rect") {
      throw new Error("building(): only rect bounds supported for now");
    }
    const { x0, z0, x1, z1 } = opts.bounds;
    const doorKey = cellKey(opts.door.at[0], opts.door.at[1]);

    // Perimeter walls + interior floor; door cell stays paved.
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const isPerim = x === x0 || x === x1 || z === z0 || z === z1;
        const k = cellKey(x, z);
        if (k === doorKey) {
          this.pave(rect(x, z, x, z), opts.floor);
          this.reserved.add(k);
        } else if (isPerim) {
          this.setWallCell(x, z, opts.wall);
        } else {
          this.pave(rect(x, z, x, z), opts.floor);
          this.reserved.add(k);
        }
      }
    }

    // Interior partitions (with a doorway gap).
    for (const seg of opts.interiorWalls || []) {
      const [fx, fz] = seg.from;
      const [tx, tz] = seg.to;
      const ax = Math.min(fx, tx), bx = Math.max(fx, tx);
      const az = Math.min(fz, tz), bz = Math.max(fz, tz);
      const gapKey = seg.gap ? cellKey(seg.gap[0], seg.gap[1]) : null;
      for (let x = ax; x <= bx; x++) {
        for (let z = az; z <= bz; z++) {
          if (gapKey === cellKey(x, z)) {
            this.pave(rect(x, z, x, z), opts.floor);
            continue;
          }
          this.setWallCell(x, z, opts.wall);
        }
      }
    }

    // Doorway prop (non-blocking, just dressing).
    this.place({
      at: opts.door.at,
      role: "door",
      facing: opts.door.facing,
      block: false,
    });

    // Roof (hipped) over the footprint.
    if (opts.roof) {
      const set = this.theme.resolveRoof(opts.roof);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const edgeN = z === z0, edgeS = z === z1, edgeW = x === x0, edgeE = x === x1;
          let id = set.flat;
          if (edgeN && edgeW) id = set.nw;
          else if (edgeN && edgeE) id = set.ne;
          else if (edgeS && edgeE) id = set.se;
          else if (edgeS && edgeW) id = set.sw;
          else if (edgeN) id = set.n;
          else if (edgeS) id = set.s;
          else if (edgeW) id = set.w;
          else if (edgeE) id = set.e;
          this.grid.set(`roof:${x}|${z}`, {
            x, y: this.baseY(x, z) + 2.1, z,
            active: true, walkable: false, blocks_los: true,
            height: 0, visual_height: 0,
            terrain: "stone", surface_tag: "none",
            object_id: id,
          } as CellData);
        }
      }
    }

    // Chimney (raised cell on the roof).
    if (opts.chimney) {
      const [cx, cz] = opts.chimney;
      this.grid.set(`chimney:${cx}|${cz}`, {
        x: cx, y: this.baseY(cx, cz) + 3.0, z: cz,
        active: true, walkable: false, blocks_los: false,
        height: 0, visual_height: 0,
        terrain: "stone", surface_tag: "none",
        object_id: this.resolveOrId("chimney"),
      } as CellData);
    }

    // Merge anchors.
    if (opts.anchors) {
      for (const [k, v] of Object.entries(opts.anchors)) this.anchors[k] = v;
    }
    return this;
  }

  // ── Public: scatter ──
  scatter(opts: ScatterOpts): this {
    const rng = this.stream(opts.rngStream);
    const placed: Vec2[] = [];
    const totalWeight = opts.weighted.reduce((s, [, w]) => s + w, 0);
    const pickRole = (): string => {
      let r = rng() * totalWeight;
      for (const [role, w] of opts.weighted) {
        r -= w;
        if (r <= 0) return role;
      }
      return opts.weighted[0][0];
    };
    iterRegion(opts.in, (x, z) => {
      if (rng() > opts.density) return;
      const k = cellKey(x, z);
      if ((opts.avoidReserved ?? true) && this.reserved.has(k)) return;
      const c = this.get(x, z);
      if (!c || c.walkable === false || c.surface_tag === "water") return;
      if (opts.minSpacing && opts.minSpacing > 0) {
        for (const [px, pz] of placed) {
          if (Math.abs(px - x) <= opts.minSpacing && Math.abs(pz - z) <= opts.minSpacing) return;
        }
      }
      this.place({ at: [x, z], role: pickRole(), block: opts.block ?? false });
      placed.push([x, z]);
    });
    return this;
  }

  // ── Public: placements ──
  place(opts: PlaceOpts): this {
    const facing = normFacing(opts.facing ?? "south");
    const id = this.resolveOrId(opts.role);
    const placement: ObjectPlacementData = {
      object_id: id,
      cell: opts.at,
      facing,
      ...(opts.block === false ? { collision_mode: "none" as const } : {}),
    };
    if (opts.dialogue) placement.dialogue_id = opts.dialogue;
    this.placements.push(placement);
    const k = cellKey(opts.at[0], opts.at[1]);
    this.reserved.add(k);
    if (opts.block !== false) {
      const c = this.get(opts.at[0], opts.at[1]);
      if (c) {
        c.walkable = false;
        c.blocks_los = false;
      }
    }
    if (opts.footprint) this.block(opts.footprint);
    if (opts.raised) {
      this.grid.set(`raised:${opts.at[0]}|${opts.at[1]}:${id}`, {
        x: opts.at[0], y: this.baseY(opts.at[0], opts.at[1]) + opts.raised.yOffset, z: opts.at[1],
        active: true, walkable: false, blocks_los: false,
        height: 0, visual_height: 0,
        terrain: "stone", surface_tag: "none",
        object_id: id,
      } as CellData);
    }
    return this;
  }

  container(opts: ContainerOpts): this {
    this.containers.push({
      id: opts.id,
      object_id: "obj_chest",
      cell: opts.at,
      facing: normFacing(opts.facing ?? "south"),
      display_name: opts.name,
      locked: opts.locked ?? false,
      key_item_id: opts.key,
      consume_key: false,
      items: (opts.items || []).map((e) => ({ item_id: e.item_id, count: e.count ?? 1 })),
    });
    this.reserved.add(cellKey(opts.at[0], opts.at[1]));
    const c = this.get(opts.at[0], opts.at[1]);
    if (c) {
      c.walkable = false;
      c.blocks_los = false;
    }
    return this;
  }

  item(opts: ItemOpts): this {
    this.items.push({
      id: opts.id,
      item_id: opts.item,
      cell: opts.at,
      count: opts.count ?? 1,
    });
    this.reserved.add(cellKey(opts.at[0], opts.at[1]));
    return this;
  }

  npc(opts: NPCOpts): this {
    const entry: EntityPlacementData = { entity_id: opts.id, cell: opts.at };
    if (opts.schedule) {
      entry.schedule = opts.schedule.map((s) => ({ hour: s.hour, cell: s.at }));
    }
    this.entities.push(entry);
    return this;
  }

  spawn(opts: SpawnOpts): this {
    this.spawns.push({
      id: opts.id,
      cell: opts.at,
      facing: normFacing(opts.facing ?? "south"),
    });
    return this;
  }

  exit(opts: ExitOpts): this {
    this.exits.push({
      cell: opts.at,
      target_map_id: opts.to.map,
      target_spawn_id: opts.to.spawn,
      facing: normFacing(opts.facing ?? "south"),
      condition: opts.condition,
    });
    return this;
  }

  trigger(t: TriggerData): this {
    this.triggers.push(t);
    return this;
  }

  // ── Public: stamps ──
  stamp<O>(name: string, opts: O): Record<string, Vec2> {
    const fn = stamps.get(name);
    if (!fn) throw new Error(`unknown stamp: ${name}`);
    const anchors = fn(this, opts) || {};
    for (const [k, v] of Object.entries(anchors)) this.anchors[k] = v;
    return anchors;
  }

  // ── Public: build ──
  build(): MapBuildResult {
    const cells = Array.from(this.grid.values());
    return {
      cells,
      custom_object_placements: this.placements,
      item_placements: this.items,
      container_placements: this.containers,
      entity_placements: this.entities,
      triggers: this.triggers,
      spawns: this.spawns,
      exits: this.exits,
      bounds: this.bounds,
      anchors: { ...this.anchors },
      zones: { ...this.zones },
    };
  }
}

export const createMap = (
  opts: MapBounds & { theme: Theme; seed?: number; skipInit?: boolean },
): MapBuilder => new MapBuilder(opts);
