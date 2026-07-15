import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MapData } from "../schema/game";
import type { MapDelta } from "../schema/save";
import type {
  ImmersiveCombatIntentRecord,
  ImmersiveCombatOverwatchZone,
  ImmersiveViewerVisibilitySnapshot,
} from "../engine-core";
import { useEngineStore } from "../store/engineStore";
import {
  classifyFogRenderStateForCells,
  createFogLineOfSightBlockers,
  fogCellKey,
  hasFogLineOfSight,
} from "../utils/fogOfWar";
import {
  fineCellsCoveredByWorldMacroCell,
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

type FogCurtain = {
  key: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotationY: number;
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
  unlit = false,
}: {
  cells: OverlayCell[];
  style: OverlayStyle;
  renderOrder?: number;
  coverage?: number;
  depthTest?: boolean;
  unlit?: boolean;
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
      {unlit ? (
        <meshBasicMaterial
          color={style.color}
          transparent
          opacity={style.opacity}
          depthTest={depthTest}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      ) : (
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
      )}
    </instancedMesh>
  );
}

const FOG_CURTAIN_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FOG_CURTAIN_FRAGMENT_SHADER = `
  uniform vec3 fogColor;
  uniform float fogOpacity;
  varying vec2 vUv;
  void main() {
    float verticalMist = 0.22 + 0.78 * (1.0 - smoothstep(0.08, 1.0, vUv.y));
    float feather = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
    gl_FragColor = vec4(fogColor, fogOpacity * verticalMist * feather);
  }
`;

function InstancedFogCurtainField({
  curtains,
  color,
  opacity,
  renderOrder,
}: {
  curtains: FogCurtain[];
  color: string;
  opacity: number;
  renderOrder: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const uniforms = useMemo(
    () => ({
      fogColor: { value: new THREE.Color(color) },
      fogOpacity: { value: opacity },
    }),
    [color, opacity],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    curtains.forEach((curtain, index) => {
      dummy.position.set(curtain.x, curtain.y, curtain.z);
      dummy.rotation.set(0, curtain.rotationY, 0);
      dummy.scale.set(curtain.width, curtain.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = curtains.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [curtains]);

  if (curtains.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined as any, undefined as any, curtains.length]}
      frustumCulled
      raycast={() => null}
      renderOrder={renderOrder}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={FOG_CURTAIN_VERTEX_SHADER}
        fragmentShader={FOG_CURTAIN_FRAGMENT_SHADER}
        transparent
        depthTest
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
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
  authoritativeVisibility?: ImmersiveViewerVisibilitySnapshot | null;
  showPerceptionDebug?: boolean;
  performanceMode?: boolean;
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
  authoritativeVisibility,
  showPerceptionDebug,
  performanceMode = false,
}: WorldOverlays3DProps) {
  const gamePackage = useEngineStore((state) => state.gamePackage);
  const cellTopY = useMemo(() => topY(map), [map]);
  const cellSize = logicalCellWorldSize(gridSpace, fineRatio);
  // Overlay render windows shift at macro cadence. The camera and actor still
  // move every fine step, but thousands of fog instance matrices can remain
  // untouched until the player actually crosses a macro boundary.
  const windowCenterX = renderCenter
    ? gridSpace === "fine"
      ? Math.floor(renderCenter[0] / fineRatio) * fineRatio + Math.floor(fineRatio / 2)
      : renderCenter[0]
    : undefined;
  const windowCenterZ = renderCenter
    ? gridSpace === "fine"
      ? Math.floor(renderCenter[1] / fineRatio) * fineRatio + Math.floor(fineRatio / 2)
      : renderCenter[1]
    : undefined;
  const inWindow = (x: number, z: number, padding = 0) => {
    if (windowCenterX === undefined || windowCenterZ === undefined || renderRadius === undefined) return true;
    const dx = x - windowCenterX;
    const dz = z - windowCenterZ;
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

  // Fine-grid visibility changes every step, but the map coordinates, world
  // positions, heights, and cell sizes do not. Reuse these templates instead
  // of rebuilding/parsing thousands of coordinate objects for every snapshot.
  const visibilityCellTemplates = useMemo(() => {
    const coordinates = new Map<ReturnType<typeof fogCellKey>, [number, number]>();
    map.cells.forEach((cell) => {
      const key = fogCellKey(cell.x, cell.z);
      if (!coordinates.has(key)) coordinates.set(key, [cell.x, cell.z]);
    });
    return Array.from(coordinates.entries()).map(([key, [x, z]]) => ({
      key,
      x,
      z,
      cell: makeCell(x, z, `visibility:${key}`, 0.11),
    }));
  }, [map.cells, cellTopY, gridSpace, fineRatio, cellSize]);

  // The runtime delta also contains invisible footstep sound propagation and
  // trace layers. Those records change every movement step; key the visible
  // overlay geometry only to records that can actually draw a plane.
  const showWorldSimulationOverlays = !performanceMode || Boolean(showPerceptionDebug);
  const visibleMapOverlaySignature = useMemo(() => {
    if (!showWorldSimulationOverlays) return "simulation-overlays-suppressed";
    return JSON.stringify({
      surfaces: Object.entries(mapDelta?.surface_layers || {}).flatMap(
        ([key, layers]) =>
          layers
            .filter((layer) => layer.source !== "trace")
            .map((layer) => [key, layer.id, layer.kind]),
      ),
      conditions: Object.values(mapDelta?.simulation_conditions || {}).map(
        (condition) => [condition.target_id, condition.state, condition.cell],
      ),
      fields: Object.entries(mapDelta?.environment_fields || {}).flatMap(
        ([key, fields]) =>
          fields
            .filter((field) => field.kind !== "sound")
            .map((field) => [key, field.id, field.kind]),
      ),
    });
  }, [
    showWorldSimulationOverlays,
    mapDelta?.surface_layers,
    mapDelta?.simulation_conditions,
    mapDelta?.environment_fields,
  ]);

  const overlayGroups = useMemo(() => {
    const groups = new Map<string, OverlayCell[]>();
    const add = (styleKey: string, x: number, z: number, key: string, offset = 0.025) => {
      if (!inWindow(x, z, fineRatio * 2)) return;
      const cells = groups.get(styleKey) || [];
      cells.push(makeCell(x, z, key, offset));
      groups.set(styleKey, cells);
    };

    if (showWorldSimulationOverlays) {
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
    }
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
    visibleMapOverlaySignature,
    showWorldSimulationOverlays,
    rangeCells,
    targetPattern,
    hoveredCell,
    combatOverwatchZones,
    combatIntents,
    worldDeniedCells,
    windowCenterX,
    windowCenterZ,
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
    const empty = {
      unseen: [] as OverlayCell[],
      explored: [] as OverlayCell[],
      darkness: [] as OverlayCell[],
      newlyExplored: [] as string[],
    };

    if (authoritativeVisibility) {
      const visible = new Set(
        authoritativeVisibility.terrain_visible.map((cell) =>
          fogCellKey(cell[0], cell[1]),
        ),
      );
      const discovered = new Set(
        authoritativeVisibility.discovered.map((cell) =>
          fogCellKey(cell[0], cell[1]),
        ),
      );
      const explored = exploredRef.current.get(map.id) || new Set<string>();
      exploredRef.current.set(map.id, explored);
      const newlyExplored: string[] = [];
      visible.forEach((key) => {
        if (!explored.has(key)) {
          explored.add(key);
          newlyExplored.push(key);
        }
      });
      discovered.forEach((key) => explored.add(key));

      const unseenCells: OverlayCell[] = [];
      const exploredCells: OverlayCell[] = [];
      const darknessCells: OverlayCell[] = [];
      if (gridSpace === "fine") {
        // Static terrain and walls render once per macro tile. Aggregate their
        // visual fog to that same footprint so unseen fine subcells cannot
        // paint darkness over a macro wall whose approach-facing edge is
        // mechanically visible. Actors, items, and perception stay exact-fine.
        const visualMacros = new Map<string, [number, number]>();
        map.cells.forEach((mapCell) => {
          const macro = logicalCellToMacro(
            [mapCell.x, mapCell.z],
            gridSpace,
          );
          visualMacros.set(fogCellKey(macro[0], macro[1]), macro);
        });

        visualMacros.forEach((macro, macroKey) => {
          const coveredFineCells = fineCellsCoveredByWorldMacroCell(
            macro[0],
            macro[1],
            fineRatio,
          );
          const state = classifyFogRenderStateForCells(
            coveredFineCells,
            true,
            visible,
            explored,
          );
          if (state === "visible") return;

          const center: [number, number] = [
            macro[0] * fineRatio + Math.floor(fineRatio / 2),
            macro[1] * fineRatio + Math.floor(fineRatio / 2),
          ];
          if (!inWindow(center[0], center[1])) return;
          const world = logicalCellToWorld(center, gridSpace, fineRatio);
          const top = coveredFineCells.reduce(
            (highest, fineCell) =>
              Math.max(
                highest,
                cellTopY.get(fogCellKey(fineCell[0], fineCell[1])) || 0.01,
              ),
            0.01,
          );
          const cell: OverlayCell = {
            key: `visibility:macro:${macroKey}`,
            x: world[0],
            z: world[1],
            y: top + 0.11,
            size: 1,
          };

          if (!fogOfWar) {
            darknessCells.push(cell);
          } else if (state === "explored") {
            exploredCells.push(cell);
          } else {
            unseenCells.push(cell);
          }
        });
      } else {
        visibilityCellTemplates.forEach(({ key, x, z, cell }) => {
          if (visible.has(key)) return;
          if (!inWindow(x, z)) return;
          if (!fogOfWar) {
            darknessCells.push(cell);
          } else if (explored.has(key)) {
            exploredCells.push(cell);
          } else {
            unseenCells.push(cell);
          }
        });
      }
      return {
        unseen: unseenCells,
        explored: exploredCells,
        darkness: darknessCells,
        newlyExplored,
      };
    }

    if (!fogOfWar || !playerPos) {
      return empty;
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
    return { unseen: unseenCells, explored: exploredCells, darkness: [], newlyExplored };
  }, [
    authoritativeVisibility,
    fogOfWar,
    fogResolution,
    fogRadius,
    authoritativeVisibility ? null : playerPos?.[0],
    authoritativeVisibility ? null : playerPos?.[1],
    map,
    authoritativeVisibility ? null : mapDelta,
    gamePackage.object_library,
    initialExplored,
    gridSpace,
    fineRatio,
    windowCenterX,
    windowCenterZ,
    renderRadius,
    cellTopY,
    visibilityCellTemplates,
  ]);

  const fogCurtains = useMemo(() => {
    const spatialKey = (x: number, z: number) =>
      `${x.toFixed(4)}:${z.toFixed(4)}`;
    const unseenKeys = new Set(
      fogResult.unseen.map((cell) => spatialKey(cell.x, cell.z)),
    );
    const exploredKeys = new Set(
      fogResult.explored.map((cell) => spatialKey(cell.x, cell.z)),
    );
    const edges = [
      { dx: 1, dz: 0, offsetX: 0.5, offsetZ: 0, rotationY: Math.PI / 2 },
      { dx: -1, dz: 0, offsetX: -0.5, offsetZ: 0, rotationY: Math.PI / 2 },
      { dx: 0, dz: 1, offsetX: 0, offsetZ: 0.5, rotationY: 0 },
      { dx: 0, dz: -1, offsetX: 0, offsetZ: -0.5, rotationY: 0 },
    ] as const;
    const build = (
      cells: OverlayCell[],
      height: number,
      neighborIsCovered: (key: string) => boolean,
      prefix: string,
    ) =>
      cells.flatMap((cell) =>
        edges.flatMap((edge, edgeIndex): FogCurtain[] => {
          const neighborKey = spatialKey(
            cell.x + edge.dx * cell.size,
            cell.z + edge.dz * cell.size,
          );
          if (neighborIsCovered(neighborKey)) return [];
          const baseY = cell.y - 0.1;
          return [{
            key: `${prefix}:${cell.key}:${edgeIndex}`,
            x: cell.x + edge.offsetX * cell.size,
            y: baseY + height * 0.5,
            z: cell.z + edge.offsetZ * cell.size,
            width: cell.size * 1.08,
            height,
            rotationY: edge.rotationY,
          }];
        }),
      );

    return {
      explored: build(
        fogResult.explored,
        1.65,
        (key) => exploredKeys.has(key) || unseenKeys.has(key),
        "explored",
      ),
      unseen: build(
        fogResult.unseen,
        2.8,
        (key) => unseenKeys.has(key),
        "unseen",
      ),
    };
  }, [fogResult.explored, fogResult.unseen]);

  useEffect(() => {
    if (fogResult.newlyExplored.length > 0) {
      onExplore?.(map.id, fogResult.newlyExplored);
    }
  }, [fogResult.newlyExplored, map.id, onExplore]);

  const perceptionDebugGroups = useMemo(() => {
    if (!showPerceptionDebug || !authoritativeVisibility) {
      return [] as { key: string; cells: OverlayCell[]; style: OverlayStyle }[];
    }
    const buckets = Array.from({ length: 5 }, () => [] as OverlayCell[]);
    authoritativeVisibility.illumination.cells.forEach((entry) => {
      if (entry.value <= 0) return;
      if (!inWindow(entry.cell[0], entry.cell[1])) return;
      const bucket = Math.min(4, Math.max(0, Math.floor(entry.value * 5)));
      buckets[bucket].push(
        makeCell(
          entry.cell[0],
          entry.cell[1],
          `illumination:${entry.cell[0]}:${entry.cell[1]}`,
          0.145,
        ),
      );
    });
    const palette: OverlayStyle[] = [
      { color: "#172554", opacity: 0.34, emissive: "#1e3a8a", emissiveIntensity: 0.12 },
      { color: "#2563eb", opacity: 0.34, emissive: "#1d4ed8", emissiveIntensity: 0.2 },
      { color: "#06b6d4", opacity: 0.38, emissive: "#0891b2", emissiveIntensity: 0.28 },
      { color: "#facc15", opacity: 0.42, emissive: "#eab308", emissiveIntensity: 0.36 },
      { color: "#fef3c7", opacity: 0.48, emissive: "#fde68a", emissiveIntensity: 0.5 },
    ];
    const groups = buckets.map((cells, index) => ({
      key: `illumination:${index}`,
      cells,
      style: palette[index],
    }));
    const sensed = authoritativeVisibility.sensed
      .filter((cell) => inWindow(cell[0], cell[1]))
      .map((cell) => makeCell(cell[0], cell[1], `sensed:${cell[0]}:${cell[1]}`, 0.17));
    groups.push({
      key: "sensed",
      cells: sensed,
      style: { color: "#e879f9", opacity: 0.58, emissive: "#d946ef", emissiveIntensity: 0.52 },
    });
    return groups;
  }, [
    showPerceptionDebug,
    authoritativeVisibility,
    windowCenterX,
    windowCenterZ,
    renderRadius,
    cellTopY,
    gridSpace,
    fineRatio,
  ]);

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
      <InstancedFogCurtainField
        curtains={fogCurtains.explored}
        color="#111827"
        opacity={0.42}
        renderOrder={78}
      />
      <InstancedFogCurtainField
        curtains={fogCurtains.unseen}
        color="#020306"
        opacity={0.92}
        renderOrder={79}
      />
      <InstancedPlaneField
        cells={fogResult.explored}
        style={{ color: "#060912", opacity: 0.62 }}
        renderOrder={80}
        coverage={1.02}
        depthTest={false}
        unlit
      />
      <InstancedPlaneField
        cells={fogResult.unseen}
        style={{ color: "#020306", opacity: 0.98 }}
        renderOrder={81}
        coverage={1.02}
        depthTest={false}
        unlit
      />
      <InstancedPlaneField
        cells={fogResult.darkness}
        style={{ color: "#03050a", opacity: 0.86 }}
        renderOrder={82}
        coverage={1.02}
        depthTest={false}
        unlit
      />
      {perceptionDebugGroups.map((group) => (
        <InstancedPlaneField
          key={group.key}
          cells={group.cells}
          style={group.style}
          renderOrder={90}
          coverage={0.72}
          depthTest={false}
          unlit
        />
      ))}
    </group>
  );
}
