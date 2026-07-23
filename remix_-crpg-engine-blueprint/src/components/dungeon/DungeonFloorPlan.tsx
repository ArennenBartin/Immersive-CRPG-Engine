import React, { useMemo } from "react";
import type { MapData } from "../../schema/game";
import type {
  DungeonDiagnostic,
  DungeonGraph,
  EmbeddedDungeon,
} from "../../dungeonGen/types";

export interface DungeonFloorPlanProps {
  embedded?: EmbeddedDungeon;
  graph?: DungeonGraph;
  maps?: MapData[];
  diagnostics?: DungeonDiagnostic[];
  floorIndex: number;
  selectedRoomId?: string | null;
  onFloorChange: (floorIndex: number) => void;
  onSelectRoom?: (nodeId: string) => void;
}

export function DungeonFloorPlan({
  embedded,
  graph,
  maps = [],
  diagnostics = [],
  floorIndex,
  selectedRoomId,
  onFloorChange,
  onSelectRoom,
}: DungeonFloorPlanProps) {
  const floor = embedded?.maps.find((candidate) => candidate.floorIndex === floorIndex)
    || embedded?.maps[0];
  const activeFloorIndex = floor?.floorIndex ?? 0;
  const floorRooms = useMemo(
    () => embedded?.rooms.filter((room) => room.mapId === floor?.mapId) || [],
    [embedded, floor?.mapId],
  );
  const floorCorridors = useMemo(
    () => embedded?.corridors.filter((corridor) => corridor.mapId === floor?.mapId) || [],
    [embedded, floor?.mapId],
  );
  const activeMap = maps.find((map) => map.id === floor?.mapId);

  if (!embedded || !floor) {
    return (
      <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-sm text-neutral-500">
        Generate a spatial layout to inspect its floor plan.
      </div>
    );
  }

  const minX = -Math.floor(floor.width / 2);
  const minZ = -Math.floor(floor.depth / 2);
  const unit = Math.max(8, Math.min(22, 760 / Math.max(floor.width, floor.depth)));
  const pad = 32;
  const viewWidth = floor.width * unit + pad * 2;
  const viewHeight = floor.depth * unit + pad * 2;
  const point = (x: number, z: number) => ({
    x: pad + (x - minX) * unit,
    y: pad + (z - minZ) * unit,
  });
  const nodeById = new Map(graph?.nodes.map((node) => [node.id, node]) || []);
  const diagnosticCells = diagnostics.filter((diagnostic) =>
    diagnostic.mapId === floor.mapId && diagnostic.cell);
  const selectedRoom = floorRooms.find((room) => room.nodeId === selectedRoomId);
  const criticalCenters = floorRooms
    .map((room) => ({ room, node: nodeById.get(room.nodeId) }))
    .filter((entry) => entry.node?.mandatory && !entry.node.secret)
    .sort((left, right) => (left.node?.depth || 0) - (right.node?.depth || 0))
    .map(({ room }) => point(
      room.bounds.x + room.bounds.width / 2,
      room.bounds.z + room.bounds.depth / 2,
    ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {embedded.maps
          .slice()
          .sort((left, right) => left.floorIndex - right.floorIndex)
          .map((candidate) => (
            <button
              key={candidate.mapId}
              onClick={() => onFloorChange(candidate.floorIndex)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                candidate.floorIndex === activeFloorIndex
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                  : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-100"
              }`}
            >
              Floor {candidate.floorIndex + 1}
              <span className="ml-2 text-[10px] opacity-60">{candidate.mapId}</span>
            </button>
          ))}
        <span className="ml-auto text-xs text-neutral-500">
          {floor.width}×{floor.depth} macro cells · {floorRooms.length} rooms
        </span>
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-h-[560px] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <svg
            className="mx-auto block min-h-[520px] max-h-[76vh] w-auto max-w-full"
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label={`Floor plan for ${floor.displayName}`}
          >
            <defs>
              <pattern id={`floor-grid-${floor.floorIndex}`} width={unit} height={unit} patternUnits="userSpaceOnUse">
                <path d={`M ${unit} 0 L 0 0 0 ${unit}`} fill="none" stroke="#262626" strokeWidth="0.7" />
              </pattern>
            </defs>
            <rect x={pad} y={pad} width={floor.width * unit} height={floor.depth * unit} fill="#101010" stroke="#525252" />
            <rect x={pad} y={pad} width={floor.width * unit} height={floor.depth * unit} fill={`url(#floor-grid-${floor.floorIndex})`} />

            {floorCorridors.flatMap((corridor) => corridor.cells.map(([x, z]) => {
              // `cells` is the canonical widened occupied set, not a
              // centerline. Paint each macro cell so sorted rows never create
              // false diagonal segments in the plan.
              const p = point(x, z);
              return (
                <rect
                  key={`${corridor.id}:${x}:${z}`}
                  x={p.x}
                  y={p.y}
                  width={unit}
                  height={unit}
                  fill="#64748b"
                  fillOpacity={0.74}
                  stroke="#94a3b8"
                  strokeOpacity={0.25}
                  strokeWidth={0.5}
                />
              );
            }))}

            {criticalCenters.length > 1 && (
              <polyline
                points={criticalCenters.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3"
                strokeDasharray="8 6"
                opacity={0.65}
              />
            )}

            {floorRooms.map((room) => {
              const node = nodeById.get(room.nodeId);
              const origin = point(room.bounds.x, room.bounds.z);
              const selected = room.nodeId === selectedRoomId;
              const entrance = room.nodeId === graph?.entranceNodeId;
              const objective = room.nodeId === graph?.objectiveNodeId;
              const fill = node?.secret
                ? "#3f3f46"
                : node?.mandatory
                  ? "#164e63"
                  : "#334155";
              return (
                <g
                  key={room.nodeId}
                  onClick={() => onSelectRoom?.(room.nodeId)}
                  className="cursor-pointer"
                >
                  <rect
                    x={origin.x}
                    y={origin.y}
                    width={room.bounds.width * unit}
                    height={room.bounds.depth * unit}
                    rx={3}
                    fill={fill}
                    fillOpacity={0.92}
                    stroke={selected ? "#f8fafc" : node?.secret ? "#c084fc" : "#38bdf8"}
                    strokeWidth={selected ? 4 : 2}
                    strokeDasharray={node?.secret ? "7 5" : undefined}
                  />
                  <text
                    x={origin.x + room.bounds.width * unit / 2}
                    y={origin.y + room.bounds.depth * unit / 2 - 3}
                    textAnchor="middle"
                    fill="#f5f5f5"
                    fontSize={Math.max(8, Math.min(12, unit * 0.62))}
                    fontWeight="700"
                  >
                    {entrance ? "ENTRANCE" : objective ? "OBJECTIVE" : (node?.archetypeId || room.nodeId).replace(/^room_/, "").slice(0, 18)}
                  </text>
                  <text
                    x={origin.x + room.bounds.width * unit / 2}
                    y={origin.y + room.bounds.depth * unit / 2 + 12}
                    textAnchor="middle"
                    fill="#a3a3a3"
                    fontSize="8"
                  >
                    {room.nodeId.slice(-18)}
                  </text>
                  {room.sockets.map((socket) => {
                    const socketPoint = point(socket.cell[0] + 0.5, socket.cell[1] + 0.5);
                    return (
                      <rect
                        key={socket.id}
                        x={socketPoint.x - 3}
                        y={socketPoint.y - 3}
                        width={6}
                        height={6}
                        fill={socket.tags.includes("secret") ? "#c084fc" : "#f59e0b"}
                      />
                    );
                  })}
                </g>
              );
            })}

            {embedded.transitions.flatMap((transition) => {
              const entries: Array<{ mapId: string; cell: [number, number]; label: string }> = [
                { mapId: transition.fromMapId, cell: transition.fromCell, label: "UP/DN" },
                { mapId: transition.toMapId, cell: transition.toCell, label: "UP/DN" },
              ];
              return entries
                .filter((entry) => entry.mapId === floor.mapId)
                .map((entry, index) => {
                  const p = point(entry.cell[0] + 0.5, entry.cell[1] + 0.5);
                  return (
                    <g key={`${transition.id}:${index}`} transform={`translate(${p.x} ${p.y})`}>
                      <circle r={8} fill="#7c3aed" stroke="#ddd6fe" strokeWidth="2" />
                      <text y={3} textAnchor="middle" fill="white" fontSize="6" fontWeight="700">{entry.label}</text>
                    </g>
                  );
                });
            })}

            {activeMap?.spawns.map((spawn) => {
              const p = point(spawn.cell[0] + 0.5, spawn.cell[1] + 0.5);
              return <circle key={spawn.id} cx={p.x} cy={p.y} r={6} fill="#22c55e" stroke="#dcfce7" strokeWidth="2" />;
            })}
            {activeMap?.exits.map((exit, index) => {
              const p = point(exit.cell[0] + 0.5, exit.cell[1] + 0.5);
              return <rect key={exit.id || index} x={p.x - 6} y={p.y - 6} width={12} height={12} fill="#8b5cf6" stroke="#ede9fe" />;
            })}
            {activeMap?.generation_sockets?.map((socket) => {
              const p = point(socket.cell[0] + 0.5, socket.cell[1] + 0.5);
              const color = socket.kind === "entrance"
                ? "#22c55e"
                : socket.kind === "culmination"
                  ? "#ef4444"
                  : socket.kind === "artifact_origin"
                    ? "#f59e0b"
                    : socket.kind === "extraction"
                      ? "#06b6d4"
                      : "#e879f9";
              return (
                <g key={socket.id} transform={`translate(${p.x} ${p.y})`}>
                  <circle r={socket.required ? 8 : 6} fill="#09090b" stroke={color} strokeWidth={socket.required ? 3 : 2} />
                  <circle r={2.5} fill={color} />
                  <title>{`${socket.kind}${socket.label ? ` · ${socket.label}` : ""}`}</title>
                </g>
              );
            })}
            {diagnosticCells.map((diagnostic, index) => {
              const p = point(diagnostic.cell![0] + 0.5, diagnostic.cell![1] + 0.5);
              const color = diagnostic.severity === "fatal" || diagnostic.severity === "error" ? "#ef4444" : diagnostic.severity === "warning" ? "#f59e0b" : "#3b82f6";
              return <circle key={`${diagnostic.code}:${index}`} cx={p.x} cy={p.y} r={9} fill="none" stroke={color} strokeWidth="3" />;
            })}
          </svg>
        </section>

        <aside className="space-y-3">
          <InfoCard label="Map ID" value={floor.mapId} mono />
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="Rooms" value={String(floorRooms.length)} />
            <InfoCard label="Corridors" value={String(floorCorridors.length)} />
            <InfoCard label="Transitions" value={String(embedded.transitions.filter((entry) => entry.fromMapId === floor.mapId || entry.toMapId === floor.mapId).length)} />
            <InfoCard label="Issues" value={String(diagnosticCells.length)} />
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-sm font-semibold text-neutral-100">Room inspector</h3>
            {selectedRoom ? (
              <div className="mt-3 space-y-2 text-xs text-neutral-300">
                <p className="break-all font-mono text-sky-300">{selectedRoom.nodeId}</p>
                <p>{nodeById.get(selectedRoom.nodeId)?.archetypeId || "Unknown archetype"}</p>
                <p>{selectedRoom.bounds.width}×{selectedRoom.bounds.depth} at {selectedRoom.bounds.x},{selectedRoom.bounds.z}</p>
                <p>{selectedRoom.templateId ? `Template ${selectedRoom.templateId}` : `Builder ${selectedRoom.builderId || "procedural"}`}</p>
                <p>{selectedRoom.sockets.length} connection sockets</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-neutral-500">Select a room in the plan.</p>
            )}
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
            <p><span className="text-sky-300">Cyan</span> rooms are mandatory.</p>
            <p className="mt-1"><span className="text-purple-300">Dashed</span> rooms are secret.</p>
            <p className="mt-1"><span className="text-amber-300">Squares</span> are sockets.</p>
            <p className="mt-1"><span className="text-green-300">Green</span> marks a spawn.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InfoCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-1 break-words text-sm text-neutral-100 ${mono ? "font-mono" : "font-semibold"}`}>{value}</div>
    </div>
  );
}
