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
  classifyFogRenderState,
  createFogLineOfSightBlockers,
  expandStructuralMemoryAcrossPresentationFootprints,
  fogCellKey,
  hasFogLineOfSight,
  resolveFogCurtainProfile,
  type AuthoritativeFogPresentationCell,
  type FogRenderState,
} from "../utils/fogOfWar";
import {
  hasAuthoritativePresentLight,
  MEMORY_FOG_COLOR,
} from "../utils/lightRendering";
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
  smoke: {
    color: "#6b7280",
    opacity: 0.34,
    emissive: "#374151",
    emissiveIntensity: 0.18,
  },
  light: { color: "#fde68a", opacity: 0.2, emissive: "#facc15", emissiveIntensity: 0.55 },
  sound: { color: "#c084fc", opacity: 0.2, emissive: "#a855f7", emissiveIntensity: 0.25 },
  electricity: { color: "#fde047", opacity: 0.38, emissive: "#facc15", emissiveIntensity: 0.65 },
};

const AUTHORED_SMOKE_TERMS = /smoke|fog|mist|miasma|obscur/;

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
          toneMapped={false}
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

const groundY = (map: MapData) => {
  const lookup = new Map<string, number>();
  map.cells.forEach((cell) => {
    const key = fogCellKey(cell.x, cell.z);
    const value = cell.y || 0;
    lookup.set(key, Math.min(lookup.get(key) ?? Infinity, value));
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
  authoritativeFogPlan?: AuthoritativeFogPresentationCell[] | null;
  showPerceptionDebug?: boolean;
  showMemoryDebug?: boolean;
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
  authoritativeFogPlan,
  showPerceptionDebug,
  showMemoryDebug,
  performanceMode = false,
}: WorldOverlays3DProps) {
  const gamePackage = useEngineStore((state) => state.gamePackage);
  const cellTopY = useMemo(() => topY(map), [map]);
  const cellGroundY = useMemo(() => groundY(map), [map]);
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
  const authoredSmokeCells = useMemo(
    () =>
      map.cells.filter((cell) =>
        AUTHORED_SMOKE_TERMS.test(
          `${cell.tag || ""} ${cell.hazard || ""} ${cell.terrain || ""}`.toLowerCase(),
        ),
      ),
    [map.cells],
  );

  // The runtime delta also contains invisible footstep sound propagation and
  // trace layers. Filter it once into the small set that can actually draw a
  // plane. The previous signature pass JSON-serialized the full delta and the
  // geometry pass immediately walked it again, which made long High-mode runs
  // increasingly expensive even though sound records are never rendered.
  const showWorldSimulationOverlays = !performanceMode || Boolean(showPerceptionDebug);
  const currentlyVisibleTerrain = useMemo(
    () =>
      authoritativeVisibility
        ? new Set(
            authoritativeVisibility.terrain_visible.map((cell) =>
              fogCellKey(cell[0], cell[1]),
            ),
          )
        : null,
    [authoritativeVisibility],
  );
  const visibleSimulationOverlays = useMemo(() => {
    const surfaces: Array<{ cell: [number, number]; key: string; kind: string }> = [];
    const conditions: Array<{ cell: [number, number]; key: string; kind: string }> = [];
    const fields: Array<{ cell: [number, number]; key: string; kind: string }> = [];
    if (!showWorldSimulationOverlays) return { surfaces, conditions, fields };

    Object.entries(mapDelta?.surface_layers || {}).forEach(([key, layers]) => {
      const cell = coordFromKey(key);
      if (!cell) return;
      layers.forEach((layer, index) => {
        if (layer.source === "trace") return;
        surfaces.push({ cell, key: `${key}:${index}`, kind: layer.kind });
      });
    });
    Object.values(mapDelta?.simulation_conditions || {}).forEach((condition) => {
      if (!condition.cell) return;
      conditions.push({
        cell: condition.cell,
        key: condition.target_id,
        kind: condition.state,
      });
    });
    Object.entries(mapDelta?.environment_fields || {}).forEach(([key, entries]) => {
      const cell = coordFromKey(key);
      if (!cell) return;
      entries.forEach((field, index) => {
        if (field.kind === "sound") return;
        fields.push({ cell, key: `${key}:${index}`, kind: field.kind });
      });
    });
    return { surfaces, conditions, fields };
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
      // Runtime surfaces, hazards, targeting, and tactical annotations are
      // present-tense information. Never let them survive in remembered or
      // unknown space beneath a translucent veil.
      if (
        currentlyVisibleTerrain &&
        !currentlyVisibleTerrain.has(fogCellKey(x, z))
      ) {
        return;
      }
      const cells = groups.get(styleKey) || [];
      cells.push(makeCell(x, z, key, offset));
      groups.set(styleKey, cells);
    };

    // Authored smoke participates in authoritative LOS even before the first
    // runtime delta exists. Draw that same field as world haze so obscurance
    // never looks like an invisible wall.
    authoredSmokeCells.forEach((cell) =>
      add(
        "field:smoke",
        cell.x,
        cell.z,
        `authored-smoke:${cell.x}:${cell.z}`,
        0.045,
      ),
    );

    visibleSimulationOverlays.surfaces.forEach((surface) =>
      add(
        `surface:${surface.kind}`,
        surface.cell[0],
        surface.cell[1],
        surface.key,
      ),
    );
    visibleSimulationOverlays.conditions.forEach((condition) =>
      add(
        `surface:${condition.kind}`,
        condition.cell[0],
        condition.cell[1],
        condition.key,
        0.035,
      ),
    );
    visibleSimulationOverlays.fields.forEach((field) =>
      add(
        `field:${field.kind}`,
        field.cell[0],
        field.cell[1],
        field.key,
        0.045,
      ),
    );
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
    visibleSimulationOverlays,
    authoredSmokeCells,
    currentlyVisibleTerrain,
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
      // Derive persistence work without mutating renderer-owned memory during
      // render. The save/store remains the authority and will feed the merged
      // set back through initialExplored after the effect commits.
      const savedExplored = new Set(initialExplored?.[map.id] || []);
      const newlyExplored = [...visible].filter(
        (key) => !savedExplored.has(key),
      );

      const unseenCells: OverlayCell[] = [];
      const exploredCells: OverlayCell[] = [];
      (authoritativeFogPlan || []).forEach((presentationCell) => {
        if (presentationCell.state === "visible") return;
        if (
          !inWindow(
            presentationCell.logical_center[0],
            presentationCell.logical_center[1],
          )
        ) {
          return;
        }

        // Fog haze is anchored at the geometry's base, never at the top of a
        // wall/model. Static materials own vertical darkness; this plane only
        // provides the soft ground haze and cannot float as a fake wall cap.
        const baseY = presentationCell.fine_cells.reduce(
          (lowest, fineCell) =>
            Math.min(
              lowest,
              cellGroundY.get(fogCellKey(fineCell[0], fineCell[1])) ?? 0,
            ),
          Infinity,
        );
        const cell: OverlayCell = {
          key: `visibility:${presentationCell.key}`,
          x: presentationCell.world_cell[0],
          z: presentationCell.world_cell[1],
          y: (Number.isFinite(baseY) ? baseY : 0) + 0.035,
          size: gridSpace === "fine" ? 1 : cellSize,
        };

        if (presentationCell.state === "explored") {
          exploredCells.push(cell);
        } else {
          unseenCells.push(cell);
        }
      });
      return {
        unseen: unseenCells,
        explored: exploredCells,
        darkness: [],
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
    authoritativeFogPlan,
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
    cellGroundY,
    visibilityCellTemplates,
  ]);

  // Terrain meshes are authored once per macro tile, while visibility is
  // authoritative per fine cell. If one fine cell makes a macro mesh visible,
  // cover only its still-dark siblings here. This preserves complete wall
  // topology while preventing a lit corner from visually promoting the whole
  // floor tile beyond the Senses field.
  const fineFogCorrection = useMemo(() => {
    const empty = {
      explored: [] as OverlayCell[],
      unseen: [] as OverlayCell[],
    };
    if (
      !fogOfWar ||
      gridSpace !== "fine" ||
      !authoritativeVisibility ||
      !authoritativeFogPlan
    ) {
      return empty;
    }

    const illuminationByCell = new Map(
      authoritativeVisibility.illumination.cells.map((entry) => [
        fogCellKey(entry.cell[0], entry.cell[1]),
        entry.value,
      ]),
    );
    const visible = new Set(
      authoritativeVisibility.terrain_visible
        .filter((cell) =>
          hasAuthoritativePresentLight(
            illuminationByCell.get(fogCellKey(cell[0], cell[1])) ?? 0,
          ),
        )
        .map((cell) => fogCellKey(cell[0], cell[1])),
    );
    const discovered = new Set(
      authoritativeVisibility.discovered.map((cell) =>
        fogCellKey(cell[0], cell[1]),
      ),
    );
    const structuralMemory =
      expandStructuralMemoryAcrossPresentationFootprints(
        authoritativeFogPlan,
        discovered,
      );
    const memoryLineOfSight = new Set(
      (authoritativeVisibility.line_of_sight ||
        authoritativeVisibility.terrain_visible).map((cell) =>
        fogCellKey(cell[0], cell[1]),
      ),
    );
    const macroState = new Map(
      authoritativeFogPlan.map((cell) => [cell.key, cell.state]),
    );
    const explored: OverlayCell[] = [];
    const unseen: OverlayCell[] = [];

    visibilityCellTemplates.forEach(({ key, x, z }) => {
      if (visible.has(key) || !inWindow(x, z)) return;
      const macro = logicalCellToMacro([x, z], gridSpace);
      const coarseState = macroState.get(fogCellKey(macro[0], macro[1]));
      if (!coarseState || coarseState === "unseen") return;
      const state = classifyFogRenderState(
        key,
        true,
        visible,
        structuralMemory,
        memoryLineOfSight,
      );
      const world = logicalCellToWorld([x, z], gridSpace, fineRatio);
      const cell: OverlayCell = {
        key: `fine-fog:${key}`,
        x: world[0],
        z: world[1],
        // The old ground-only offset could sit inside a modeled floor and make
        // the indigo correction vanish through depth testing. Resolve the
        // actual top surface while retaining the stable ground fallback.
        y: Math.max(
          (cellGroundY.get(key) ?? 0) + 0.058,
          (cellTopY.get(key) ?? 0) + 0.012,
        ),
        size: cellSize,
      };
      if (coarseState === "visible") {
        (state === "explored" ? explored : unseen).push(cell);
      } else if (coarseState === "explored" && state === "unseen") {
        unseen.push(cell);
      }
    });

    return { explored, unseen };
  }, [
    fogOfWar,
    gridSpace,
    fineRatio,
    authoritativeVisibility,
    authoritativeFogPlan,
    visibilityCellTemplates,
    windowCenterX,
    windowCenterZ,
    renderRadius,
    cellGroundY,
    cellTopY,
    cellSize,
  ]);

  const fogCurtains = useMemo(() => {
    const spatialKey = (x: number, z: number) =>
      `${x.toFixed(4)}:${z.toFixed(4)}`;
    const blockerWorldKeys = new Set<string>();
    map.cells.forEach((cell) => {
      if (!cell.blocks_los) return;
      const macro = logicalCellToMacro([cell.x, cell.z], gridSpace);
      const logical: [number, number] =
        gridSpace === "fine"
          ? [
              macro[0] * fineRatio + Math.floor(fineRatio / 2),
              macro[1] * fineRatio + Math.floor(fineRatio / 2),
            ]
          : [cell.x, cell.z];
      const world = logicalCellToWorld(logical, gridSpace, fineRatio);
      blockerWorldKeys.add(spatialKey(world[0], world[1]));
    });
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
      state: "explored" | "unseen",
      neighborIsCovered: (key: string) => boolean,
      prefix: string,
    ) => {
      const fullHeight: FogCurtain[] = [];
      const openFloor: FogCurtain[] = [];
      cells.forEach((cell) =>
        edges.forEach((edge, edgeIndex) => {
          const neighborKey = spatialKey(
            cell.x + edge.dx * cell.size,
            cell.z + edge.dz * cell.size,
          );
          if (neighborIsCovered(neighborKey)) return;
          const profile = resolveFogCurtainProfile(
            state,
            blockerWorldKeys.has(spatialKey(cell.x, cell.z)) ||
              blockerWorldKeys.has(neighborKey),
          );
          const baseY = cell.y - 0.035;
          const curtain: FogCurtain = {
            key: `${prefix}:${cell.key}:${edgeIndex}`,
            x: cell.x + edge.offsetX * cell.size,
            y: baseY + profile.height * 0.5,
            z: cell.z + edge.offsetZ * cell.size,
            width: cell.size * 1.08,
            height: profile.height,
            rotationY: edge.rotationY,
          };
          (profile.full_height ? fullHeight : openFloor).push(curtain);
        }),
      );
      return { fullHeight, openFloor };
    };

    const explored = build(
      fogResult.explored,
      "explored",
      (key) => exploredKeys.has(key) || unseenKeys.has(key),
      "explored",
    );
    const unseen = build(
      fogResult.unseen,
      "unseen",
      (key) => unseenKeys.has(key),
      "unseen",
    );

    return {
      explored: explored.fullHeight,
      exploredOpen: explored.openFloor,
      unseen: unseen.fullHeight,
      unseenOpen: unseen.openFloor,
    };
  }, [fogResult.explored, fogResult.unseen, map.cells, gridSpace, fineRatio]);

  const newlyExploredSignature = useMemo(
    () => [...fogResult.newlyExplored].sort().join("|"),
    [fogResult.newlyExplored],
  );
  const committedExplorationSignatureRef = useRef("");
  useEffect(() => {
    if (!newlyExploredSignature) {
      committedExplorationSignatureRef.current = "";
      return;
    }
    // Fog arrays are renderer products and receive fresh identities whenever
    // the presentation field is rebuilt. Persist a coordinate set once, not
    // once per array identity. This also prevents a malformed/legacy explored
    // coordinate set from becoming a render -> store -> render update loop.
    const signature = `${map.id}:${newlyExploredSignature}`;
    if (committedExplorationSignatureRef.current === signature) return;
    committedExplorationSignatureRef.current = signature;
    onExplore?.(map.id, fogResult.newlyExplored);
  }, [map.id, newlyExploredSignature, onExplore]);

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

  const memoryDebugGroups = useMemo(() => {
    if (!showMemoryDebug || !authoritativeFogPlan) {
      return [] as { key: string; cells: OverlayCell[]; style: OverlayStyle }[];
    }
    const buckets: Record<FogRenderState, OverlayCell[]> = {
      visible: [],
      explored: [],
      unseen: [],
    };
    authoritativeFogPlan.forEach((presentationCell) => {
      if (
        !inWindow(
          presentationCell.logical_center[0],
          presentationCell.logical_center[1],
        )
      ) {
        return;
      }
      const baseY = presentationCell.fine_cells.reduce(
        (lowest, fineCell) =>
          Math.min(
            lowest,
            cellGroundY.get(fogCellKey(fineCell[0], fineCell[1])) ?? 0,
          ),
        Infinity,
      );
      buckets[presentationCell.state].push({
        key: `memory-debug:${presentationCell.key}`,
        x: presentationCell.world_cell[0],
        z: presentationCell.world_cell[1],
        y: (Number.isFinite(baseY) ? baseY : 0) + 0.19,
        size: gridSpace === "fine" ? 1 : cellSize,
      });
    });
    return [
      {
        key: "memory-visible",
        cells: buckets.visible,
        style: { color: "#22d3ee", opacity: 0.52 },
      },
      {
        key: "memory-remembered",
        cells: buckets.explored,
        style: { color: "#8b5cf6", opacity: 0.56 },
      },
      {
        key: "memory-unknown",
        cells: buckets.unseen,
        style: { color: "#ef4444", opacity: 0.48 },
      },
    ];
  }, [
    showMemoryDebug,
    authoritativeFogPlan,
    windowCenterX,
    windowCenterZ,
    renderRadius,
    cellGroundY,
    gridSpace,
    cellSize,
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
        curtains={fogCurtains.exploredOpen}
        color={MEMORY_FOG_COLOR}
        opacity={resolveFogCurtainProfile("explored", false).opacity}
        renderOrder={76}
      />
      <InstancedFogCurtainField
        curtains={fogCurtains.unseenOpen}
        color="#020306"
        opacity={resolveFogCurtainProfile("unseen", false).opacity}
        renderOrder={77}
      />
      <InstancedFogCurtainField
        curtains={fogCurtains.explored}
        color={MEMORY_FOG_COLOR}
        opacity={resolveFogCurtainProfile("explored", true).opacity}
        renderOrder={78}
      />
      <InstancedFogCurtainField
        curtains={fogCurtains.unseen}
        color="#020306"
        opacity={resolveFogCurtainProfile("unseen", true).opacity}
        renderOrder={79}
      />
      <InstancedPlaneField
        cells={fogResult.explored}
        style={{ color: MEMORY_FOG_COLOR, opacity: 0.1 }}
        renderOrder={80}
        coverage={1.02}
        depthTest
        unlit
      />
      <InstancedPlaneField
        cells={fogResult.unseen}
        style={{ color: "#000000", opacity: 1 }}
        renderOrder={81}
        coverage={1.02}
        depthTest
        unlit
      />
      <InstancedPlaneField
        cells={fogResult.darkness}
        style={{ color: "#03050a", opacity: 0.86 }}
        renderOrder={82}
        coverage={1.02}
        depthTest
        unlit
      />
      <InstancedPlaneField
        cells={fineFogCorrection.explored}
        style={{ color: MEMORY_FOG_COLOR, opacity: 0.98 }}
        renderOrder={83}
        coverage={1.01}
        depthTest
        unlit
      />
      <InstancedPlaneField
        cells={fineFogCorrection.unseen}
        style={{ color: "#000000", opacity: 1 }}
        renderOrder={84}
        coverage={1.01}
        depthTest
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
      {memoryDebugGroups.map((group) => (
        <InstancedPlaneField
          key={group.key}
          cells={group.cells}
          style={group.style}
          renderOrder={96}
          coverage={0.62}
          depthTest={false}
          unlit
        />
      ))}
    </group>
  );
}
