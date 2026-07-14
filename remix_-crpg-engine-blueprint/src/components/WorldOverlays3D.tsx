import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MapData } from "../schema/game";
import type { MapDelta } from "../schema/save";
import type {
  ImmersiveCombatIntentRecord,
  ImmersiveCombatOverwatchZone,
} from "../engine-core";
import { useEngineStore } from "../store/engineStore";
import {
  createFogLineOfSightBlockers,
  fogCellKey,
  hasFogLineOfSight,
} from "../utils/fogOfWar";
import {
  logicalCellToMacro,
  logicalCellToWorld,
  logicalCellWorldSize,
  type RendererGridSpace,
} from "../utils/renderSpace";

type OverlayCell = {
  key: string;
  x: number;
  y: number;
  z: number;
  size: number;
};

type OverlayStyle = {
  color: string;
  opacity: number;
  emissive?: string;
  emissiveIntensity?: number;
};

const SURFACE_STYLE: Record<string, OverlayStyle> = {
  water: { color: "#38bdf8", opacity: 0.34 },
  doused: { color: "#7dd3fc", opacity: 0.28 },
  foam: { color: "#e2fcff", opacity: 0.48 },
  ice: { color: "#bfdbfe", opacity: 0.46, emissive: "#bae6fd", emissiveIntensity: 0.12 },
  frozen: { color: "#bfdbfe", opacity: 0.38 },
  scorched: { color: "#1c1917", opacity: 0.58 },
  oil: { color: "#262626", opacity: 0.5 },
  honey: { color: "#b45309", opacity: 0.4 },
  corrosion: { color: "#84cc16", opacity: 0.38 },
  burned: { color: "#7f1d1d", opacity: 0.34 },
  wet: { color: "#0ea5e9", opacity: 0.24 },
  contaminated: { color: "#4ade80", opacity: 0.28 },
  damaged: { color: "#a855f7", opacity: 0.22 },
  reinforced: { color: "#facc15", opacity: 0.2 },
};

const FIELD_STYLE: Record<string, OverlayStyle> = {
  fire: { color: "#fb6a22", opacity: 0.5, emissive: "#ff3b0a", emissiveIntensity: 0.8 },
  smoke: { color: "#6b7280", opacity: 0.28 },
  light: { color: "#fde68a", opacity: 0.2, emissive: "#facc15", emissiveIntensity: 0.55 },
  sound: { color: "#c084fc", opacity: 0.2, emissive: "#a855f7", emissiveIntensity: 0.25 },
  electricity: { color: "#fde047", opacity: 0.38, emissive: "#facc15", emissiveIntensity: 0.65 },
};

const coordFromKey = (key: string): [number, number] | null => {
  const values = key.split(/[:,]/).map(Number);
  return values.length >= 2 && values.every(Number.isFinite)
    ? [values[0], values[1]]
    : null;
};

function InstancedPlaneField({
  cells,
  style,
  renderOrder = 10,
  coverage = 0.94,
  depthTest = true,
}: {
  cells: OverlayCell[];
  style: OverlayStyle;
  renderOrder?: number;
  coverage?: number;
  depthTest?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    cells.forEach((cell, index) => {
      dummy.position.set(cell.x, cell.y, cell.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(cell.size * coverage, cell.size * coverage, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, coverage]);

  if (cells.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined as any, undefined as any, cells.length]}
      frustumCulled
      raycast={() => null}
      renderOrder={renderOrder}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={style.color}
        emissive={style.emissive || "#000000"}
        emissiveIntensity={style.emissiveIntensity || 0}
        transparent
        opacity={style.opacity}
        depthTest={depthTest}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

const topY = (map: MapData) => {
  const lookup = new Map<string, number>();
  map.cells.forEach((cell) => {
    const key = fogCellKey(cell.x, cell.z);
    const value = (cell.y || 0) + Math.max(0.01, (cell.visual_height || 0) * 0.5);
    lookup.set(key, Math.max(lookup.get(key) ?? -Infinity, value));
  });
  return lookup;
};

export interface WorldOverlays3DProps {
  map: MapData;
  mapDelta?: MapDelta;
  gridSpace: RendererGridSpace;
  fineRatio: number;
  playerPos?: [number, number];
  targetPattern?: { x: number; z: number }[];
  rangeCells?: { x: number; z: number }[];
  hoveredCell?: [number, number] | null;
  combatOverwatchZones?: ImmersiveCombatOverwatchZone[];
  combatIntents?: ImmersiveCombatIntentRecord[];
  worldDeniedCells?: { x: number; z: number; kind?: string }[];
  renderCenter?: [number, number];
  renderRadius?: number;
  fogOfWar?: boolean;
  fogRadius?: number;
  fogResolution?: "macro" | "fine";
  initialExplored?: Record<string, string[]>;
  onExplore?: (mapId: string, cellKeys: string[]) => void;
}

export function WorldOverlays3D({
  map,
  mapDelta,
  gridSpace,
  fineRatio,
  playerPos,
  targetPattern,
  rangeCells,
  hoveredCell,
  combatOverwatchZones,
  combatIntents,
  worldDeniedCells,
  renderCenter,
  renderRadius,
  fogOfWar,
  fogRadius = 5,
  fogResolution = "macro",
  initialExplored,
  onExplore,
}: WorldOverlays3DProps) {
  const gamePackage = useEngineStore((state) => state.gamePackage);
  const cellTopY = useMemo(() => topY(map), [map]);
  const cellSize = logicalCellWorldSize(gridSpace, fineRatio);
  const inWindow = (x: number, z: number, padding = 0) => {
    if (!renderCenter || renderRadius === undefined) return true;
    const dx = x - renderCenter[0];
    const dz = z - renderCenter[1];
    const radius = renderRadius + padding;
    return dx * dx + dz * dz <= radius * radius;
  };
  const makeCell = (
    x: number,
    z: number,
    key: string,
    yOffset = 0.025,
    size = cellSize,
  ): OverlayCell => {
    const world = logicalCellToWorld([x, z], gridSpace, fineRatio);
    return {
      key,
      x: world[0],
      z: world[1],
      y: (cellTopY.get(fogCellKey(x, z)) || 0.01) + yOffset,
      size,
    };
  };

  const overlayGroups = useMemo(() => {
    const groups = new Map<string, OverlayCell[]>();
    const add = (styleKey: string, x: number, z: number, key: string, offset = 0.025) => {
      if (!inWindow(x, z, fineRatio * 2)) return;
      const cells = groups.get(styleKey) || [];
      cells.push(makeCell(x, z, key, offset));
      groups.set(styleKey, cells);
    };

    Object.entries(mapDelta?.surface_layers || {}).forEach(([key, layers]) => {
      const coord = coordFromKey(key);
      if (!coord) return;
      layers
        .filter((layer) => layer.source !== "trace")
        .forEach((layer, index) => add(`surface:${layer.kind}`, coord[0], coord[1], `${key}:${index}`));
    });
    Object.values(mapDelta?.simulation_conditions || {}).forEach((condition) => {
      if (condition.cell) add(`surface:${condition.state}`, condition.cell[0], condition.cell[1], condition.target_id, 0.035);
    });
    Object.entries(mapDelta?.environment_fields || {}).forEach(([key, fields]) => {
      const coord = coordFromKey(key);
      if (!coord) return;
      fields
        // Sound is simulation/perception data, not a visible world surface.
        // Rendering every propagated footstep cell produced a purple wake.
        .filter((field) => field.kind !== "sound")
        .forEach((field, index) => add(`field:${field.kind}`, coord[0], coord[1], `${key}:${index}`, 0.045));
    });
    (rangeCells || []).forEach((cell, index) => add("range", cell.x, cell.z, `range:${index}`, 0.055));
    (targetPattern || []).forEach((cell, index) => add("target", cell.x, cell.z, `target:${index}`, 0.065));
    if (hoveredCell) add("hover", hoveredCell[0], hoveredCell[1], "hover", 0.075);
    (combatOverwatchZones || []).forEach((zone, zoneIndex) =>
      zone.cells.forEach((cell, index) => add("overwatch", cell[0], cell[1], `overwatch:${zoneIndex}:${index}`, 0.06)),
    );
    (combatIntents || []).forEach((intent, intentIndex) =>
      intent.target_cells.forEach((cell, index) => add("intent", cell[0], cell[1], `intent:${intentIndex}:${index}`, 0.07)),
    );
    (worldDeniedCells || []).forEach((cell, index) => add("denied", cell.x, cell.z, `denied:${index}`, 0.08));
    return groups;
  }, [
    mapDelta,
    rangeCells,
    targetPattern,
    hoveredCell,
    combatOverwatchZones,
    combatIntents,
    worldDeniedCells,
    renderCenter,
    renderRadius,
    cellTopY,
    gridSpace,
    fineRatio,
  ]);

  const exploredRef = useRef<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    exploredRef.current.set(
      map.id,
      new Set(initialExplored?.[map.id] || []),
    );
  }, [map.id, initialExplored]);

  const fogResult = useMemo(() => {
    if (!fogOfWar || !playerPos) {
      return { unseen: [] as OverlayCell[], explored: [] as OverlayCell[], newlyExplored: [] as string[] };
    }
    const objectIndex = new Map(gamePackage.object_library.map((object) => [object.id, object]));
    const doorBlockers = createFogLineOfSightBlockers(
      map.custom_object_placements || [],
      objectIndex,
      mapDelta,
    );
    const fineBlockers = new Set<string>(
      map.cells
        .filter((cell) => cell.blocks_los)
        .map((cell) => fogCellKey(cell.x, cell.z)),
    );
    doorBlockers.forEach((key) => fineBlockers.add(key));
    const explored = exploredRef.current.get(map.id) || new Set<string>();
    exploredRef.current.set(map.id, explored);
    const newlyExplored: string[] = [];
    const visible = new Set<string>();
    const unseenCells: OverlayCell[] = [];
    const exploredCells: OverlayCell[] = [];

    if (fogResolution === "fine") {
      const radius = Math.round(fogRadius * fineRatio);
      const px = Math.round(playerPos[0]);
      const pz = Math.round(playerPos[1]);
      for (let z = pz - radius; z <= pz + radius; z += 1) {
        for (let x = px - radius; x <= px + radius; x += 1) {
          if (Math.max(Math.abs(x - px), Math.abs(z - pz)) > radius) continue;
          if (
            Math.max(Math.abs(x - px), Math.abs(z - pz)) <= fineRatio ||
            hasFogLineOfSight([px, pz], [x, z], (bx, bz) => fineBlockers.has(fogCellKey(bx, bz)))
          ) {
            visible.add(fogCellKey(x, z));
          }
        }
      }
      visible.forEach((key) => {
        if (!explored.has(key)) {
          explored.add(key);
          newlyExplored.push(key);
        }
      });
      const coords = new Set(map.cells.map((cell) => fogCellKey(cell.x, cell.z)));
      coords.forEach((key) => {
        const coord = coordFromKey(key);
        if (!coord || !inWindow(coord[0], coord[1])) return;
        if (visible.has(key)) return;
        const cell = makeCell(coord[0], coord[1], `fog:${key}`, 0.11);
        (explored.has(key) ? exploredCells : unseenCells).push(cell);
      });
    } else {
      const playerMacro = logicalCellToMacro(playerPos, gridSpace);
      const macroRadius = fogRadius;
      const macroBlocker = (mx: number, mz: number) => {
        for (let dz = 0; dz < fineRatio; dz += 1) {
          for (let dx = 0; dx < fineRatio; dx += 1) {
            if (fineBlockers.has(fogCellKey(mx * fineRatio + dx, mz * fineRatio + dz))) return true;
          }
        }
        return false;
      };
      for (let mz = playerMacro[1] - macroRadius; mz <= playerMacro[1] + macroRadius; mz += 1) {
        for (let mx = playerMacro[0] - macroRadius; mx <= playerMacro[0] + macroRadius; mx += 1) {
          if (Math.max(Math.abs(mx - playerMacro[0]), Math.abs(mz - playerMacro[1])) > macroRadius) continue;
          if (
            Math.max(Math.abs(mx - playerMacro[0]), Math.abs(mz - playerMacro[1])) <= 1 ||
            hasFogLineOfSight(playerMacro, [mx, mz], macroBlocker)
          ) {
            visible.add(fogCellKey(mx, mz));
          }
        }
      }
      visible.forEach((key) => {
        if (!explored.has(key)) {
          explored.add(key);
          newlyExplored.push(key);
        }
      });
      const macroCoords = new Set(
        map.cells.map((cell) => {
          const macro = logicalCellToMacro([cell.x, cell.z], gridSpace);
          return fogCellKey(macro[0], macro[1]);
        }),
      );
      macroCoords.forEach((key) => {
        const macro = coordFromKey(key);
        if (!macro) return;
        const logical: [number, number] =
          gridSpace === "fine"
            ? [macro[0] * fineRatio + Math.floor(fineRatio / 2), macro[1] * fineRatio + Math.floor(fineRatio / 2)]
            : macro;
        if (!inWindow(logical[0], logical[1])) return;
        if (visible.has(key)) return;
        const world = logicalCellToWorld(logical, gridSpace, fineRatio);
        const y = cellTopY.get(fogCellKey(logical[0], logical[1])) || 0.01;
        const cell: OverlayCell = { key: `fog:${key}`, x: world[0], z: world[1], y: y + 0.11, size: 1 };
        (explored.has(key) ? exploredCells : unseenCells).push(cell);
      });
    }
    return { unseen: unseenCells, explored: exploredCells, newlyExplored };
  }, [
    fogOfWar,
    fogResolution,
    fogRadius,
    playerPos,
    map,
    mapDelta,
    gamePackage.object_library,
    initialExplored,
    gridSpace,
    fineRatio,
    renderCenter,
    renderRadius,
    cellTopY,
  ]);

  useEffect(() => {
    if (fogResult.newlyExplored.length > 0) {
      onExplore?.(map.id, fogResult.newlyExplored);
    }
  }, [fogResult.newlyExplored, map.id, onExplore]);

  const styleForGroup = (key: string): OverlayStyle => {
    if (key.startsWith("surface:")) {
      return SURFACE_STYLE[key.slice("surface:".length)] || { color: "#94a3b8", opacity: 0.24 };
    }
    if (key.startsWith("field:")) {
      return FIELD_STYLE[key.slice("field:".length)] || { color: "#a78bfa", opacity: 0.22 };
    }
    if (key === "range") return { color: "#88C0D0", opacity: 0.16 };
    if (key === "target") return { color: "#D08770", opacity: 0.58, emissive: "#D08770", emissiveIntensity: 0.18 };
    if (key === "hover") return { color: "#ECEFF4", opacity: 0.34 };
    if (key === "overwatch") return { color: "#f59e0b", opacity: 0.18 };
    if (key === "intent") return { color: "#ef4444", opacity: 0.2 };
    return { color: "#fb7185", opacity: 0.3 };
  };

  return (
    <group>
      {Array.from(overlayGroups.entries()).map(([key, cells]) => (
        <InstancedPlaneField key={key} cells={cells} style={styleForGroup(key)} />
      ))}
      <InstancedPlaneField
        cells={fogResult.explored}
        style={{ color: "#060912", opacity: 0.62 }}
        renderOrder={80}
        coverage={1.02}
        depthTest={false}
      />
      <InstancedPlaneField
        cells={fogResult.unseen}
        style={{ color: "#020306", opacity: 0.98 }}
        renderOrder={81}
        coverage={1.02}
        depthTest={false}
      />
    </group>
  );
}
