import React, { useMemo } from "react";
import type { DungeonGraph } from "../../dungeonGen/types";

export interface DungeonGraphViewProps {
  graph?: DungeonGraph;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
}

const NODE_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#fb7185"];

const archetypeColor = (archetypeId: string) => {
  let hash = 0;
  for (const char of archetypeId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return NODE_COLORS[hash % NODE_COLORS.length];
};

export function DungeonGraphView({
  graph,
  selectedNodeId,
  onSelectNode,
}: DungeonGraphViewProps) {
  const layout = useMemo(() => {
    if (!graph) return new Map<string, { x: number; y: number }>();
    const branchIds = Array.from(
      new Set(graph.nodes.map((node) => node.branchId).filter(Boolean) as string[]),
    ).sort();
    const branchLane = new Map(branchIds.map((id, index) => [id, index]));
    const depthCounts = new Map<string, number>();
    const result = new Map<string, { x: number; y: number }>();
    for (const node of [...graph.nodes].sort((left, right) =>
      left.depth - right.depth || left.id.localeCompare(right.id))) {
      const depthKey = node.depth.toFixed(4);
      const collisionOffset = depthCounts.get(depthKey) || 0;
      depthCounts.set(depthKey, collisionOffset + 1);
      let y = 220;
      if (node.branchId) {
        const lane = branchLane.get(node.branchId) || 0;
        const distance = 92 + Math.floor(lane / 2) * 68;
        y += lane % 2 === 0 ? -distance : distance;
      } else if (node.secret) {
        y = 410;
      }
      y += collisionOffset * 18;
      result.set(node.id, {
        x: 76 + Math.max(0, Math.min(1, node.depth)) * 848,
        y,
      });
    }
    return result;
  }, [graph]);

  if (!graph) {
    return <EmptyPreview label="Generate a dungeon to inspect its topology." />;
  }

  const selected = graph.nodes.find((node) => node.id === selectedNodeId);
  const gateById = new Map(graph.gates.map((gate) => [gate.id, gate]));

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-h-[520px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
        <svg
          className="h-full min-h-[520px] w-full"
          viewBox="0 0 1000 500"
          role="img"
          aria-label="Generated dungeon topology graph"
        >
          <defs>
            <pattern id="dungeon-graph-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#262626" strokeWidth="1" />
            </pattern>
            <marker id="dungeon-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#737373" />
            </marker>
          </defs>
          <rect width="1000" height="500" fill="url(#dungeon-graph-grid)" />
          {graph.edges.map((edge) => {
            const from = layout.get(edge.fromNodeId);
            const to = layout.get(edge.toNodeId);
            if (!from || !to) return null;
            const gate = edge.gateId ? gateById.get(edge.gateId) : undefined;
            const isLoop = edge.tags.includes("loop");
            const curve = isLoop ? Math.max(45, Math.abs(to.x - from.x) * 0.18) : 0;
            const path = isLoop
              ? `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - curve} ${to.x} ${to.y}`
              : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
            const color = edge.kind === "locked" ? "#f59e0b" : edge.kind === "vertical" ? "#a78bfa" : "#737373";
            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={edge.tags.includes("critical") ? 4 : 2.5}
                  strokeDasharray={edge.kind === "secret" ? "8 7" : undefined}
                  markerEnd={edge.oneWay ? "url(#dungeon-edge-arrow)" : undefined}
                  opacity={0.9}
                />
                {(gate || edge.kind === "vertical") && (
                  <g transform={`translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`}>
                    <rect x={-28} y={-11} width={56} height={22} rx={6} fill="#171717" stroke={color} />
                    <text textAnchor="middle" dominantBaseline="middle" fill="#e5e5e5" fontSize="10">
                      {gate?.type || "vertical"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {graph.nodes.map((node) => {
            const point = layout.get(node.id);
            if (!point) return null;
            const selectedNode = selectedNodeId === node.id;
            const entrance = node.id === graph.entranceNodeId;
            const objective = node.id === graph.objectiveNodeId;
            const color = archetypeColor(node.archetypeId);
            return (
              <g
                key={node.id}
                transform={`translate(${point.x} ${point.y})`}
                onClick={() => onSelectNode?.(node.id)}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${node.archetypeId} ${node.id}`}
              >
                <circle
                  r={selectedNode ? 29 : 24}
                  fill="#171717"
                  stroke={selectedNode ? "#ffffff" : color}
                  strokeWidth={selectedNode ? 4 : 3}
                  strokeDasharray={node.secret ? "5 4" : undefined}
                />
                <text textAnchor="middle" y={4} fill="#fafafa" fontSize="11" fontWeight="700">
                  {entrance ? "IN" : objective ? "OBJ" : node.floorHint !== undefined ? `F${node.floorHint + 1}` : "·"}
                </text>
                <text textAnchor="middle" y={43} fill={color} fontSize="10">
                  {node.archetypeId.replace(/^room_/, "").slice(0, 18)}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <aside className="space-y-4">
        <MetricGrid graph={graph} />
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="text-sm font-semibold text-neutral-100">Node inspector</h3>
          {selected ? (
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="ID" value={selected.id} mono />
              <Row label="Archetype" value={selected.archetypeId} />
              <Row label="Depth" value={selected.depth.toFixed(2)} />
              <Row label="Floor" value={selected.floorHint === undefined ? "unassigned" : String(selected.floorHint + 1)} />
              <Row label="Route" value={selected.secret ? "secret" : selected.mandatory ? "mandatory" : "optional"} />
              <Row label="Pressure" value={selected.pressureTier.toFixed(1)} />
              <Row label="Reward" value={selected.rewardTier.toFixed(1)} />
              <Row label="Tags" value={selected.tags.join(", ") || "none"} />
            </dl>
          ) : (
            <p className="mt-3 text-xs text-neutral-500">Select a graph node to inspect it.</p>
          )}
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
          <p><span className="text-sky-300">Solid</span> routes are visible.</p>
          <p className="mt-1"><span className="text-amber-300">Amber</span> routes are gated.</p>
          <p className="mt-1"><span className="text-purple-300">Purple</span> routes change floors.</p>
          <p className="mt-1">Dashed routes and nodes are secrets.</p>
        </div>
      </aside>
    </div>
  );
}

function MetricGrid({ graph }: { graph: DungeonGraph }) {
  const entries = [
    ["Rooms", graph.metrics.nodeCount],
    ["Edges", graph.metrics.edgeCount],
    ["Critical", graph.metrics.criticalPathLength],
    ["Branches", graph.metrics.branchCount],
    ["Loops", graph.metrics.loopCount],
    ["Secrets", graph.metrics.secretCount],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`break-words text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function EmptyPreview({ label }: { label: string }) {
  return (
    <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-sm text-neutral-500">
      {label}
    </div>
  );
}

