import React from "react";
import type { MapData } from "../../schema/game";
import type { DungeonGraph, EmbeddedDungeon } from "../../dungeonGen/types";

export function DungeonPopulationView({
  maps,
  graph,
  embedded,
}: {
  maps: MapData[];
  graph?: DungeonGraph;
  embedded?: EmbeddedDungeon;
}) {
  if (!maps.length) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-sm text-neutral-500">
        Generate a dungeon to inspect its ordinary population records.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Total label="Actors" value={maps.reduce((sum, map) => sum + map.entity_placements.length, 0)} />
        <Total label="Objects" value={maps.reduce((sum, map) => sum + map.custom_object_placements.length, 0)} />
        <Total label="Items" value={maps.reduce((sum, map) => sum + map.item_placements.length, 0)} />
        <Total label="Containers" value={maps.reduce((sum, map) => sum + map.container_placements.length, 0)} />
        <Total label="Triggers" value={maps.reduce((sum, map) => sum + map.triggers.length, 0)} />
        <Total label="Exits" value={maps.reduce((sum, map) => sum + map.exits.length, 0)} />
        <Total label="Hazard cells" value={maps.reduce((sum, map) => sum + map.cells.filter((cell) => cell.surface_tag !== "none").length, 0)} />
        <Total label="Rooms" value={embedded?.rooms.length || graph?.nodes.length || 0} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {maps.map((map, floorIndex) => {
          const floor = embedded?.maps.find((candidate) => candidate.mapId === map.id);
          const nodeIds = new Set(floor?.nodeIds || []);
          const nodes = graph?.nodes.filter((node) => nodeIds.has(node.id)) || [];
          return (
            <article key={map.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
              <header className="border-b border-neutral-800 p-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-semibold text-neutral-100">Floor {floorIndex + 1} · {map.display_name}</h3>
                    <p className="mt-1 font-mono text-[10px] text-neutral-500">{map.id}</p>
                  </div>
                  <span className="ml-auto rounded bg-neutral-950 px-2 py-1 text-xs text-neutral-400">
                    {nodes.length} rooms
                  </span>
                </div>
              </header>
              <div className="grid grid-cols-3 gap-px bg-neutral-800 text-center text-xs">
                <FloorMetric label="Actors" value={map.entity_placements.length} />
                <FloorMetric label="Props" value={map.custom_object_placements.length} />
                <FloorMetric label="Loot" value={map.item_placements.length + map.container_placements.length} />
              </div>
              <div className="p-4">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pressure rhythm</h4>
                <div className="mt-3 flex h-24 items-end gap-1">
                  {nodes
                    .slice()
                    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id))
                    .map((node) => (
                      <div key={node.id} className="group relative min-w-0 flex-1">
                        <div
                          className={`w-full rounded-t ${node.secret ? "bg-purple-500/70" : node.mandatory ? "bg-sky-500/70" : "bg-slate-500/70"}`}
                          style={{ height: `${Math.max(8, Math.min(92, 12 + node.pressureTier * 14))}px` }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-36 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-950 p-2 text-left text-[10px] text-neutral-300 shadow-xl group-hover:block">
                          {node.archetypeId}<br />pressure {node.pressureTier.toFixed(1)} · reward {node.rewardTier.toFixed(1)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-100">{value.toLocaleString()}</div>
    </div>
  );
}

function FloorMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-neutral-950 p-3">
      <div className="text-neutral-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-neutral-200">{value}</div>
    </div>
  );
}

