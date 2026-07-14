// ASCII map printer.
//
// Renders a built map as a text grid so I can read it from tool output
// without screenshotting the preview. One char per cell, optional region
// filter for huge maps, axis labels every 5 columns.

import type { MapBuildResult, Region, Vec2 } from "./mapAuthoring";

const key = (x: number, z: number) => `${x}|${z}`;

// Glyph priority (later overrides earlier).
const TERRAIN_GLYPH = (objectId: string | undefined, walkable: boolean): string => {
  if (!objectId) return walkable ? "." : "x";
  if (objectId.includes("turf")) return "'";
  if (objectId.includes("cobble")) return ".";
  if (objectId.includes("road")) return "_";
  if (objectId.includes("flagstone")) return "=";
  if (objectId.includes("boards")) return ":";
  if (objectId.includes("mud") || objectId.includes("dirt")) return "%";
  if (objectId.includes("plot")) return "/";
  if (objectId.includes("river") || objectId.includes("water")) return "~";
  return ".";
};

const PLACEMENT_GLYPH = (objectId: string): string => {
  if (objectId.includes("wall")) return "#";
  if (objectId.startsWith("obj_p_door") || objectId === "obj_p_door") return "+";
  if (objectId.includes("cell_bars")) return "|";
  if (objectId.includes("fence")) return "'";
  if (objectId.includes("terminal") || objectId.includes("notice") || objectId.includes("placard")) return "?";
  if (objectId.includes("beacon") || objectId.includes("lamp") || objectId.includes("lantern") || objectId.includes("candles")) return "!";
  if (objectId.includes("arch")) return "n";
  if (objectId.includes("well")) return "w";
  if (objectId.includes("stocks")) return "S";
  if (objectId.includes("stall")) return "s";
  if (objectId.includes("inn_sign")) return "I";
  if (objectId.includes("cart")) return "v";
  if (objectId.includes("barrel")) return "b";
  if (objectId.includes("crate")) return "c";
  if (objectId.includes("trapdoor")) return "t";
  if (objectId.includes("stairs")) return ">";
  if (objectId.includes("smokestack")) return "H";
  if (objectId.includes("furnace")) return "f";
  if (objectId.includes("pipes")) return "=";
  if (objectId.includes("railcart")) return "r";
  if (objectId.includes("bridge")) return "≡";
  if (objectId.includes("dock")) return "—";
  if (objectId.includes("reeds")) return "ψ";
  if (objectId.includes("yew") || objectId.includes("tree_dark")) return "Y";
  if (objectId.includes("oak") || objectId === "obj_p_tree" || objectId.endsWith("_tree")) return "T";
  if (objectId.includes("shrub") || objectId.includes("bush")) return "·";
  if (objectId.includes("desk") || objectId.includes("table")) return "d";
  if (objectId.includes("shelf")) return "h";
  if (objectId.includes("pallet_bed") || objectId.includes("bed")) return "_";
  return "?";
};

const inRegion = (region: Region | undefined, x: number, z: number): boolean => {
  if (!region) return true;
  if (region.kind === "rect")
    return x >= region.x0 && x <= region.x1 && z >= region.z0 && z <= region.z1;
  return region.cells.some(([cx, cz]) => cx === x && cz === z);
};

export interface PrintOpts {
  region?: Region;
  showRoofs?: boolean;
  showEntities?: boolean;
  showItems?: boolean;
  showSpawnsExits?: boolean;
  showContainers?: boolean;
  legend?: boolean;
  axisEvery?: number;
}

export function printMapAscii(result: MapBuildResult, opts: PrintOpts = {}): string {
  const showRoofs = opts.showRoofs ?? false;
  const showEntities = opts.showEntities ?? true;
  const showItems = opts.showItems ?? true;
  const showSpawnsExits = opts.showSpawnsExits ?? true;
  const showContainers = opts.showContainers ?? true;
  const legend = opts.legend ?? true;
  const axisEvery = opts.axisEvery ?? 5;

  // Pick the rendering region.
  const region: Region = opts.region ?? {
    kind: "rect",
    x0: result.bounds.minX,
    z0: result.bounds.minZ,
    x1: result.bounds.minX + result.bounds.width - 1,
    z1: result.bounds.minZ + result.bounds.height - 1,
  };
  if (region.kind !== "rect") {
    throw new Error("printMapAscii: only rect regions supported");
  }
  const { x0, z0, x1, z1 } = region;

  // Build the grid of glyphs.
  const groundByXZ = new Map<string, typeof result.cells[number]>();
  const overheadByXZ = new Map<string, typeof result.cells[number]>();
  for (const c of result.cells) {
    if (!inRegion(region, c.x, c.z)) continue;
    const k = key(c.x, c.z);
    if ((c.y || 0) >= 1.5) {
      const prev = overheadByXZ.get(k);
      if (!prev || (c.y || 0) > (prev.y || 0)) overheadByXZ.set(k, c);
    } else {
      const prev = groundByXZ.get(k);
      if (!prev || (c.y || 0) > (prev.y || 0)) groundByXZ.set(k, c);
    }
  }

  const placementByXZ = new Map<string, string>();
  for (const p of result.custom_object_placements) {
    if (!inRegion(region, p.cell[0], p.cell[1])) continue;
    // Keep the most "important" placement: longer ids (landmarks) override generic.
    const k = key(p.cell[0], p.cell[1]);
    const existing = placementByXZ.get(k);
    if (!existing || p.object_id.length > existing.length) placementByXZ.set(k, p.object_id);
  }
  const entityByXZ = new Map<string, Vec2>();
  if (showEntities) {
    for (const e of result.entity_placements) {
      if (inRegion(region, e.cell[0], e.cell[1])) entityByXZ.set(key(e.cell[0], e.cell[1]), [e.cell[0], e.cell[1]]);
    }
  }
  const itemByXZ = new Set<string>();
  if (showItems) for (const it of result.item_placements) if (inRegion(region, it.cell[0], it.cell[1])) itemByXZ.add(key(it.cell[0], it.cell[1]));
  const containerByXZ = new Set<string>();
  if (showContainers) for (const cn of result.container_placements) if (inRegion(region, cn.cell[0], cn.cell[1])) containerByXZ.add(key(cn.cell[0], cn.cell[1]));
  const spawnByXZ = new Set<string>();
  const exitByXZ = new Set<string>();
  if (showSpawnsExits) {
    for (const s of result.spawns) if (inRegion(region, s.cell[0], s.cell[1])) spawnByXZ.add(key(s.cell[0], s.cell[1]));
    for (const e of result.exits) if (inRegion(region, e.cell[0], e.cell[1])) exitByXZ.add(key(e.cell[0], e.cell[1]));
  }

  const glyphAt = (x: number, z: number): string => {
    const k = key(x, z);
    if (spawnByXZ.has(k)) return "P";
    if (exitByXZ.has(k)) return "X";
    if (entityByXZ.has(k)) return "N";
    if (containerByXZ.has(k)) return "C";
    if (itemByXZ.has(k)) return "i";
    if (showRoofs && overheadByXZ.has(k)) return "r";
    const p = placementByXZ.get(k);
    if (p) return PLACEMENT_GLYPH(p);
    const c = groundByXZ.get(k);
    if (!c) return " ";
    return TERRAIN_GLYPH(c.object_id, c.walkable !== false);
  };

  // Build the output lines: top axis, rows with z-label.
  const out: string[] = [];
  const width = x1 - x0 + 1;
  // Top axis: print every Nth x coord above the grid (vertical labels).
  const topAxisRows = [
    " ".repeat(5) + Array.from({ length: width }, (_, i) => {
      const x = x0 + i;
      return x % axisEvery === 0 ? (Math.abs(x).toString().padStart(2, "0")[0]) : " ";
    }).join(""),
    " ".repeat(5) + Array.from({ length: width }, (_, i) => {
      const x = x0 + i;
      return x % axisEvery === 0 ? (Math.abs(x).toString().padStart(2, "0")[1]) : " ";
    }).join(""),
  ];
  out.push(...topAxisRows);
  for (let z = z0; z <= z1; z++) {
    const zLabel = z.toString().padStart(4, " ") + " ";
    let row = "";
    for (let x = x0; x <= x1; x++) row += glyphAt(x, z);
    out.push(zLabel + row);
  }

  if (legend) {
    out.push("");
    out.push("legend: ' turf  . cobble  _ road  = flag  : boards  % dirt  / plot  ~ water");
    out.push("        # wall  + door  > stairs  | bars  w well  ? terminal/notice  ! beacon");
    out.push("        T tree  · shrub  ≡ bridge  — dock  ψ reeds");
    out.push("        s stall  I inn  c crate b barrel v cart  H stack f furnace");
    out.push("        N npc  P spawn  X exit  C container  i item  r roof");
  }
  return out.join("\n");
}
