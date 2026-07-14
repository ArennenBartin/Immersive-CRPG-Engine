/**
 * @deprecated Legacy authoring-only geometry lint for `MapBuildResult`.
 *
 * This is not the engine's readiness authority. New generation and editor
 * code must validate the baked `GameMap` with
 * `engine-core/mapReadinessValidator.validateOrdinaryMap`, which owns the
 * stable issue codes, reference/progression checks, and production budgets.
 */

import type { MapBuildResult, Vec2 } from "./mapAuthoring";

export type Severity = "error" | "warn" | "info";

export interface MapProblem {
  severity: Severity;
  kind: string;
  cell?: Vec2;
  message: string;
}

const key = (x: number, z: number) => `${x}|${z}`;

export interface ValidateOpts {
  // Optional map registry so exit targets can be checked.
  knownMaps?: { id: string; spawns: { id: string }[] }[];
  // Skip categories you don't want noise from.
  skip?: Set<string>;
}

export function validateMap(result: MapBuildResult, opts: ValidateOpts = {}): MapProblem[] {
  const problems: MapProblem[] = [];
  const skip = opts.skip ?? new Set<string>();
  const push = (p: MapProblem) => { if (!skip.has(p.kind)) problems.push(p); };

  // Index cells by (x,z). For overhead cells (roofs, raised props) we collect
  // *all* of them so we can detect roofs with no wall underneath.
  const groundByXZ = new Map<string, typeof result.cells[number]>();
  const overheadByXZ = new Map<string, typeof result.cells[number][]>();
  for (const c of result.cells) {
    const k = key(c.x, c.z);
    if ((c.y || 0) === 0 || (c.y || 0) < 1.5) {
      // Treat anything below 1.5 as "ground-level" for the floor lookup.
      // (Walls have y = tier base = 0 or 0.5 or 1.0; roofs sit at y>=2.1.)
      const existing = groundByXZ.get(k);
      if (!existing || (c.y || 0) > (existing.y || 0)) groundByXZ.set(k, c);
    } else {
      const arr = overheadByXZ.get(k) || [];
      arr.push(c);
      overheadByXZ.set(k, arr);
    }
  }

  // ── floating-roof: roof at y>=2 without an underlying wall/floor at proper tier ──
  for (const [k, arr] of overheadByXZ) {
    for (const c of arr) {
      if (!c.object_id) continue;
      const isRoof = c.object_id.startsWith("obj_p_roof") || c.object_id.startsWith("obj_roof");
      if (!isRoof) continue;
      const below = groundByXZ.get(k);
      const cell: Vec2 = [c.x, c.z];
      if (!below) {
        push({ severity: "error", kind: "roof_no_ground", cell, message: `roof at y=${c.y} with no ground cell beneath` });
        continue;
      }
      // The float bug: a roof's tier (y - 2.1) must match either the ground
      // cell's tier (y) or one of its tier candidates (visual_height * 0.5).
      // Interiors set visual_height so the box top reaches the wall — that
      // counts as supported.
      const roofTier = (c.y || 0) - 2.1;
      const groundY = below.y || 0;
      const groundTop = groundY + (below.visual_height || 0) * 0.5;
      const supportedByY = Math.abs(groundY - roofTier) < 0.05;
      const supportedByTop = groundTop >= roofTier - 0.05;
      if (!supportedByY && !supportedByTop) {
        push({
          severity: "warn", kind: "roof_floating", cell,
          message: `roof at y=${c.y} not supported by ground (y=${groundY}, top=${groundTop.toFixed(2)})`,
        });
      }
    }
  }

  // ── tier-violation: walkable neighbors with vh delta > 1 ──
  // (Engine rule: a step is impassable when delta > 1 — silent breakage of stairs.)
  for (const c of groundByXZ.values()) {
    if (c.walkable === false) continue;
    const cv = (c.visual_height || 0) + ((c.y || 0) * 2); // collapse to a single scale
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Vec2[]) {
      const n = groundByXZ.get(key(c.x + dx, c.z + dz));
      if (!n || n.walkable === false) continue;
      const nv = (n.visual_height || 0) + ((n.y || 0) * 2);
      if (Math.abs(cv - nv) > 1.01) {
        const cell: Vec2 = [c.x, c.z];
        push({ severity: "warn", kind: "tier_step_too_high", cell, message: `walkable step to (${n.x},${n.z}) is ${(nv-cv).toFixed(1)} units — engine blocks anything > 1` });
      }
    }
  }

  // ── exit-no-spawn: exit references missing map or spawn ──
  if (opts.knownMaps) {
    const mapsById = new Map(opts.knownMaps.map((m) => [m.id, m]));
    for (const e of result.exits) {
      const target = mapsById.get(e.target_map_id);
      if (!target) {
        push({ severity: "error", kind: "exit_no_map", cell: e.cell, message: `exit targets unknown map "${e.target_map_id}"` });
        continue;
      }
      if (e.target_spawn_id && !target.spawns.some((s) => s.id === e.target_spawn_id)) {
        push({ severity: "error", kind: "exit_no_spawn", cell: e.cell, message: `exit targets ${e.target_map_id}#${e.target_spawn_id} — spawn missing` });
      }
    }
  }

  // ── npc placed on blocked / nonexistent cell ──
  for (const e of result.entity_placements) {
    const eCell: Vec2 = [e.cell[0], e.cell[1]];
    const c = groundByXZ.get(key(eCell[0], eCell[1]));
    if (!c) {
      push({ severity: "error", kind: "npc_off_map", cell: eCell, message: `entity ${e.entity_id} placed outside the map` });
    } else if (c.walkable === false) {
      push({ severity: "warn", kind: "npc_on_blocked", cell: eCell, message: `entity ${e.entity_id} placed on a blocked cell (${c.object_id || "n/a"})` });
    }
    for (const s of e.schedule || []) {
      const sCell: Vec2 = [s.cell[0], s.cell[1]];
      const sc = groundByXZ.get(key(sCell[0], sCell[1]));
      if (!sc) {
        push({ severity: "warn", kind: "schedule_off_map", cell: sCell, message: `${e.entity_id} schedule@${s.hour}h targets off-map cell` });
      } else if (sc.walkable === false) {
        push({ severity: "warn", kind: "schedule_on_blocked", cell: sCell, message: `${e.entity_id} schedule@${s.hour}h targets blocked cell (${sc.object_id || "n/a"})` });
      }
    }
  }

  // ── container/item on blocked cell ──
  for (const it of result.item_placements) {
    const cell: Vec2 = [it.cell[0], it.cell[1]];
    const c = groundByXZ.get(key(cell[0], cell[1]));
    if (!c) push({ severity: "warn", kind: "item_off_map", cell, message: `item ${it.id} off the map` });
  }
  for (const cn of result.container_placements) {
    const cell: Vec2 = [cn.cell[0], cn.cell[1]];
    const c = groundByXZ.get(key(cell[0], cell[1]));
    if (!c) push({ severity: "warn", kind: "container_off_map", cell, message: `container ${cn.id} off the map` });
  }

  // ── entity overlap (same cell) — info only ──
  const seen = new Map<string, string[]>();
  for (const e of result.entity_placements) {
    const k = key(e.cell[0], e.cell[1]);
    const arr = seen.get(k) || [];
    arr.push(e.entity_id);
    seen.set(k, arr);
  }
  for (const [k, ids] of seen) {
    if (ids.length > 1) {
      const parts = k.split("|");
      const cell: Vec2 = [Number(parts[0]), Number(parts[1])];
      push({ severity: "info", kind: "entity_stack", cell, message: `${ids.length} entities share cell: ${ids.join(", ")}` });
    }
  }

  // ── spawn check: at least one ──
  if (result.spawns.length === 0) {
    push({ severity: "error", kind: "no_spawn", message: "map has no spawn point" });
  }

  return problems;
}

export function formatProblems(problems: MapProblem[]): string {
  if (!problems.length) return "✓ map clean";
  const counts = { error: 0, warn: 0, info: 0 };
  for (const p of problems) counts[p.severity]++;
  const lines: string[] = [];
  lines.push(`map lint: ${counts.error} error · ${counts.warn} warn · ${counts.info} info`);
  for (const p of problems.slice(0, 50)) {
    const cell = p.cell ? `(${p.cell[0]},${p.cell[1]})` : "       ";
    const sev = p.severity === "error" ? "ERR " : p.severity === "warn" ? "WARN" : "INFO";
    lines.push(`  ${sev}  ${cell.padEnd(10)}  ${p.kind.padEnd(22)}  ${p.message}`);
  }
  if (problems.length > 50) lines.push(`  …and ${problems.length - 50} more`);
  return lines.join("\n");
}
