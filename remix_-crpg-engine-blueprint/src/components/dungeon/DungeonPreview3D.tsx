import React, { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { Box, Layers3, Mountain, Move } from "lucide-react";
import type { MapData } from "../../schema/game";
import type {
  DungeonDiagnostic,
  DungeonGraph,
  EmbeddedDungeon,
} from "../../dungeonGen/types";
import { GameRenderer3D } from "../GameRenderer3D";

export interface DungeonPreview3DProps {
  maps: MapData[];
  embedded?: EmbeddedDungeon;
  graph?: DungeonGraph;
  diagnostics?: DungeonDiagnostic[];
  floorIndex: number;
  onFloorChange: (floorIndex: number) => void;
}

export function DungeonPreview3D({
  maps,
  embedded,
  graph,
  diagnostics = [],
  floorIndex,
  onFloorChange,
}: DungeonPreview3DProps) {
  const [topDown, setTopDown] = useState(false);
  const [showRooms, setShowRooms] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const controlsRef = useRef<any>(null);
  const floor = embedded?.maps.find((candidate) => candidate.floorIndex === floorIndex)
    || embedded?.maps[0];
  const map = floor
    ? maps.find((candidate) => candidate.id === floor.mapId)
    : maps[floorIndex] || maps[0];
  const rooms = useMemo(
    () => embedded?.rooms.filter((room) => room.mapId === map?.id) || [],
    [embedded, map?.id],
  );
  const corridors = useMemo(
    () => embedded?.corridors.filter((corridor) => corridor.mapId === map?.id) || [],
    [embedded, map?.id],
  );
  const diagnosticsForMap = diagnostics.filter((diagnostic) => diagnostic.mapId === map?.id && diagnostic.cell);
  const center = useMemo<[number, number]>(() => {
    if (!map?.cells.length) return [0, 0];
    const bounds = map.cells.reduce(
      (result, cell) => ({
        minX: Math.min(result.minX, cell.x),
        maxX: Math.max(result.maxX, cell.x),
        minZ: Math.min(result.minZ, cell.z),
        maxZ: Math.max(result.maxZ, cell.z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
  }, [map]);

  if (!map) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-sm text-neutral-500">
        Generate and bake ordinary preview maps to inspect the dungeon in 3D.
      </div>
    );
  }

  const radius = Math.max(36, Math.ceil(Math.max(map.width, map.height) * 0.8));

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900/90 p-3">
        <select
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-sky-500"
          value={floor?.floorIndex ?? floorIndex}
          onChange={(event) => onFloorChange(Number(event.target.value))}
        >
          {(embedded?.maps || maps.map((candidate, index) => ({ mapId: candidate.id, displayName: candidate.display_name, floorIndex: index })))
            .slice()
            .sort((left, right) => left.floorIndex - right.floorIndex)
            .map((candidate) => (
              <option key={candidate.mapId} value={candidate.floorIndex}>
                Floor {candidate.floorIndex + 1} · {candidate.displayName}
              </option>
            ))}
        </select>
        <button
          onClick={() => setTopDown((value) => !value)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${topDown ? "bg-sky-500/15 text-sky-200" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Mountain className="h-4 w-4" /> {topDown ? "Top-down" : "Isometric"}
        </button>
        <button
          onClick={() => controlsRef.current?.reset?.()}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <Move className="h-4 w-4" /> Fit
        </button>
        <button
          onClick={() => setShowRooms((value) => !value)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${showRooms ? "bg-purple-500/15 text-purple-200" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Box className="h-4 w-4" /> Rooms
        </button>
        <button
          onClick={() => setShowRoutes((value) => !value)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${showRoutes ? "bg-amber-500/15 text-amber-200" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Layers3 className="h-4 w-4" /> Routes
        </button>
        <span className="ml-auto font-mono text-xs text-neutral-500">{map.id}</span>
      </header>

      <div className="relative min-h-[560px] flex-1">
        <Canvas
          shadows="basic"
          dpr={[1, 1.5]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          {topDown ? (
            <OrthographicCamera
              makeDefault
              position={[center[0], 100, center[1] + 0.001]}
              zoom={Math.max(2, Math.min(34, 560 / Math.max(map.width, map.height)))}
              near={0.1}
              far={1000}
            />
          ) : (
            <PerspectiveCamera
              makeDefault
              position={[center[0] + radius * 0.7, radius * 0.75, center[1] + radius * 0.7]}
              fov={45}
            />
          )}
          <color attach="background" args={["#0a0a0a"]} />
          <ambientLight intensity={0.28} />
          <directionalLight position={[10, 24, 10]} intensity={0.72} castShadow />
          <GameRenderer3D
            map={map}
            gridSpace="macro"
            playerPos={map.spawns[0]?.cell as [number, number] | undefined}
            playerFacing={map.spawns[0]?.facing as [number, number] | undefined}
            showGrid
            renderCenter={center}
            renderRadius={radius}
          />
          <DungeonPreviewOverlays
            rooms={rooms}
            corridors={corridors}
            graph={graph}
            diagnostics={diagnosticsForMap}
            showRooms={showRooms}
            showRoutes={showRoutes}
          />
          <OrbitControls
            key={`${map.id}:${topDown ? "top" : "iso"}`}
            ref={controlsRef}
            target={[center[0], 0, center[1]]}
            enableRotate={!topDown}
            maxPolarAngle={Math.PI / 2.15}
            minDistance={3}
            maxDistance={Math.max(100, radius * 3)}
          />
        </Canvas>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-neutral-800 bg-neutral-950/85 px-3 py-2 text-[11px] text-neutral-400 backdrop-blur">
          Authored macro preview · runtime expands this map to the 3×3 fine grid
        </div>
      </div>
    </div>
  );
}

function DungeonPreviewOverlays({
  rooms,
  corridors,
  graph,
  diagnostics,
  showRooms,
  showRoutes,
}: {
  rooms: NonNullable<EmbeddedDungeon["rooms"]>;
  corridors: NonNullable<EmbeddedDungeon["corridors"]>;
  graph?: DungeonGraph;
  diagnostics: DungeonDiagnostic[];
  showRooms: boolean;
  showRoutes: boolean;
}) {
  const nodeById = new Map(graph?.nodes.map((node) => [node.id, node]) || []);
  return (
    <group>
      {showRooms && rooms.map((room) => {
        const node = nodeById.get(room.nodeId);
        const color = node?.secret ? "#c084fc" : node?.mandatory ? "#38bdf8" : "#94a3b8";
        return (
          <mesh
            key={room.nodeId}
            position={[
              room.bounds.x + (room.bounds.width - 1) / 2,
              1.15,
              room.bounds.z + (room.bounds.depth - 1) / 2,
            ]}
            raycast={() => null}
          >
            <boxGeometry args={[room.bounds.width, 2.1, room.bounds.depth]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.5} depthTest={false} />
          </mesh>
        );
      })}
      {showRoutes && corridors.flatMap((corridor) => corridor.cells.map(([x, z], index) => (
        <mesh
          key={`${corridor.id}:${index}`}
          position={[x, 2.28, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[Math.max(0.22, corridor.width * 0.25), Math.max(0.22, corridor.width * 0.25)]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} depthTest={false} />
        </mesh>
      )))}
      {diagnostics.map((diagnostic, index) => (
        <mesh
          key={`${diagnostic.code}:${index}`}
          position={[diagnostic.cell![0], 2.5, diagnostic.cell![1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[0.3, 0.48, 18]} />
          <meshBasicMaterial
            color={diagnostic.severity === "fatal" || diagnostic.severity === "error" ? "#ef4444" : diagnostic.severity === "warning" ? "#f59e0b" : "#3b82f6"}
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}
