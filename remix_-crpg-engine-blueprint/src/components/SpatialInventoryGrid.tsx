import React, { useEffect, useMemo, useRef, useState } from "react";
import { Heart, RotateCw, Trash2 } from "lucide-react";
import type { GamePackage } from "../schema/game";
import type { InventoryLayoutEntry, PlaySave } from "../schema/save";
import {
  INVENTORY_GRID_COLS,
  INVENTORY_GRID_ROWS,
  itemSize,
  itemWeightKg,
  occupiedCellsExcept,
  placementFits,
  reconcileLayout,
  type GridSize,
} from "../utils/spatialInventory";

type ItemDef = GamePackage["items"][number];
type HealTarget = { id: string; name: string; hp: number; maxHp: number; dead: boolean };

interface Props {
  gamePackage: GamePackage;
  save: PlaySave;
  onCommitLayout: (layout: InventoryLayoutEntry[]) => void;
  onUse: (itemDef: ItemDef, itemId: string, targetId?: string) => void;
  onDrop: (itemId: string) => void;
  healingTargets: HealTarget[];
  playSfx?: (id: string, opts?: { volume?: number; cooldownMs?: number }) => void;
}

const CELL = 42; // px per grid cell
const GAP = 2; // px gap between cells

const span = (n: number) => n * CELL + Math.max(0, n - 1) * GAP;
const pos = (n: number) => n * (CELL + GAP);

interface DragState {
  itemId: string;
  rotation: number;
  grabPxX: number; // pointer offset within the token at grab time
  grabPxY: number;
  pointerX: number;
  pointerY: number;
}

interface HoverResult {
  ax: number;
  ay: number;
  size: GridSize;
  valid: boolean;
}

export function SpatialInventoryGrid({
  gamePackage,
  save,
  onCommitLayout,
  onUse,
  onDrop,
  healingTargets,
  playSfx,
}: Props) {
  const cols = INVENTORY_GRID_COLS;
  const rows = INVENTORY_GRID_ROWS;
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const itemById = useMemo(
    () => new Map(gamePackage.items.map((item) => [item.id, item] as const)),
    [gamePackage.items],
  );
  const countById = useMemo(() => {
    const map = new Map<string, number>();
    (save.inventory || []).forEach((entry) => {
      if (entry.count > 0) map.set(entry.id, entry.count);
    });
    return map;
  }, [save.inventory]);

  const reconciled = useMemo(
    () => reconcileLayout(gamePackage, save.inventory, save.inventory_layout, cols, rows),
    [gamePackage, save.inventory, save.inventory_layout, cols, rows],
  );
  const placedEntries = useMemo(() => Array.from(reconciled.placed.values()), [reconciled]);

  // Keep selection valid as inventory changes.
  useEffect(() => {
    if (selectedId && !countById.has(selectedId)) setSelectedId(null);
  }, [countById, selectedId]);

  const totalWeight = useMemo(() => {
    let sum = 0;
    countById.forEach((count, id) => {
      sum += itemWeightKg(itemById.get(id)) * count;
    });
    return sum;
  }, [countById, itemById]);
  const maxCarry = Math.max(
    10,
    18 + (save.playerStats.attack || 0) * 2 + (save.playerStats.defense || 0),
  );
  const usedSlots = useMemo(
    () =>
      placedEntries.reduce((sum, entry) => {
        const size = itemSize(itemById.get(entry.item_id), entry.rotation);
        return sum + size.w * size.h;
      }, 0),
    [placedEntries, itemById],
  );
  const overweight = totalWeight > maxCarry;

  const computeHover = (state: DragState): HoverResult | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const size = itemSize(itemById.get(state.itemId), state.rotation);
    const localX = state.pointerX - rect.left - state.grabPxX;
    const localY = state.pointerY - rect.top - state.grabPxY;
    const ax = Math.round(localX / (CELL + GAP));
    const ay = Math.round(localY / (CELL + GAP));
    const occupied = occupiedCellsExcept(gamePackage, reconciled.placed, state.itemId);
    const valid = placementFits(size, ax, ay, cols, rows, occupied);
    return { ax, ay, size, valid };
  };

  const liveHover = drag ? computeHover(drag) : null;

  // Window-level pointer + key handling for the active drag. Inventory does not
  // change mid-drag, so closing over `reconciled`/`placedEntries` is safe.
  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      setDrag((current) => {
        if (!current) return current;
        const next = { ...current, pointerX: event.clientX, pointerY: event.clientY };
        dragRef.current = next;
        return next;
      });
    };
    const onUp = () => {
      const state = dragRef.current;
      if (state) {
        const hover = computeHover(state);
        if (hover && hover.valid) {
          const next = [...placedEntries];
          const entry: InventoryLayoutEntry = {
            item_id: state.itemId,
            x: hover.ax,
            y: hover.ay,
            rotation: state.rotation,
          };
          const idx = next.findIndex((candidate) => candidate.item_id === state.itemId);
          if (idx >= 0) next[idx] = entry;
          else next.push(entry);
          onCommitLayout(next);
          playSfx?.("ui_click", { volume: 0.18, cooldownMs: 80 });
        }
      }
      dragRef.current = null;
      setDrag(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setDrag((current) => {
          if (!current) return current;
          const next = { ...current, rotation: (current.rotation + 1) % 4 };
          dragRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const startDrag = (event: React.PointerEvent, entry: InventoryLayoutEntry) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const state: DragState = {
      itemId: entry.item_id,
      rotation: entry.rotation,
      grabPxX: event.clientX - rect.left,
      grabPxY: event.clientY - rect.top,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    dragRef.current = state;
    setDrag(state);
    setSelectedId(entry.item_id);
    playSfx?.("ui_click", { volume: 0.14, cooldownMs: 80 });
    event.preventDefault();
  };

  const rotateSelected = () => {
    if (!selectedId) return;
    const entry = reconciled.placed.get(selectedId);
    if (!entry) return;
    const rotation = (entry.rotation + 1) % 4;
    const size = itemSize(itemById.get(entry.item_id), rotation);
    const occupied = occupiedCellsExcept(gamePackage, reconciled.placed, entry.item_id);
    let { x, y } = entry;
    if (!placementFits(size, x, y, cols, rows, occupied)) {
      x = Math.min(x, cols - size.w);
      y = Math.min(y, rows - size.h);
    }
    if (x < 0 || y < 0 || !placementFits(size, x, y, cols, rows, occupied)) {
      playSfx?.("ui_back", { volume: 0.16, cooldownMs: 120 });
      return;
    }
    const next = placedEntries.map((candidate) =>
      candidate.item_id === entry.item_id ? { ...candidate, x, y, rotation } : candidate,
    );
    onCommitLayout(next);
    playSfx?.("ui_click", { volume: 0.18, cooldownMs: 80 });
  };

  const selectedItem = selectedId ? itemById.get(selectedId) : undefined;
  const selectedCount = selectedId ? countById.get(selectedId) || 0 : 0;
  const selectedSize = selectedItem
    ? itemSize(selectedItem, reconciled.placed.get(selectedId!)?.rotation || 0)
    : null;

  const isEmpty = countById.size === 0;

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row">
      {/* ── Grid ── */}
      <div className="flex flex-col gap-2">
        <div
          ref={gridRef}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
          className="relative rounded-lg bg-neutral-950/60 p-1"
          style={{ width: span(cols) + 8, height: span(rows) + 8 }}
        >
          {/* background cells */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
              gap: GAP,
            }}
          >
            {Array.from({ length: cols * rows }).map((_, index) => (
              <div
                key={index}
                className="rounded-sm border border-neutral-800 bg-neutral-900/50"
                style={{ width: CELL, height: CELL }}
              />
            ))}
          </div>

          {/* drag placement highlight */}
          {liveHover && (
            <div
              className={`pointer-events-none absolute rounded-md border-2 ${
                liveHover.valid
                  ? "border-emerald-400 bg-emerald-500/25"
                  : "border-rose-400 bg-rose-500/25"
              }`}
              style={{
                left: 4 + pos(liveHover.ax),
                top: 4 + pos(liveHover.ay),
                width: span(liveHover.size.w),
                height: span(liveHover.size.h),
              }}
            />
          )}

          {/* placed item tokens */}
          {placedEntries.map((entry) => {
            const item = itemById.get(entry.item_id);
            const size = itemSize(item, entry.rotation);
            const count = countById.get(entry.item_id) || 0;
            const dragging = drag?.itemId === entry.item_id;
            return (
              <div
                key={entry.item_id}
                onPointerDown={(event) => startDrag(event, entry)}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(entry.item_id);
                }}
                title={item?.display_name || entry.item_id}
                className={`absolute flex cursor-grab items-center justify-center rounded-md border bg-neutral-800 text-2xl shadow-md transition-shadow active:cursor-grabbing ${
                  selectedId === entry.item_id
                    ? "border-indigo-400 ring-2 ring-indigo-400/60"
                    : "border-neutral-700 hover:border-neutral-500"
                }`}
                style={{
                  left: 4 + pos(entry.x),
                  top: 4 + pos(entry.y),
                  width: span(size.w),
                  height: span(size.h),
                  opacity: dragging ? 0.25 : 1,
                  touchAction: "none",
                }}
              >
                <span>{item?.icon || "📦"}</span>
                {count > 1 && (
                  <span className="absolute bottom-0.5 right-1 rounded bg-neutral-950/90 px-1 font-mono text-[10px] text-neutral-200">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* readouts */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-neutral-400">
          <span className={overweight ? "text-amber-400" : ""}>
            Weight {totalWeight.toFixed(1)} / {maxCarry} kg
          </span>
          <span>
            Slots {usedSlots} / {cols * rows}
          </span>
          <span className="text-neutral-600">Drag to arrange · R to rotate</span>
        </div>

        {reconciled.unplaced.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
            No room for: {reconciled.unplaced.map((id) => itemById.get(id)?.display_name || id).join(", ")}
          </div>
        )}
      </div>

      {/* ── Side panel: selected item ── */}
      <div className="flex-1 min-w-[12rem]">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">
            Your inventory is empty.
          </div>
        ) : selectedItem ? (
          <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-neutral-800 bg-neutral-950 text-3xl">
                {selectedItem.icon || "📦"}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white">
                  {selectedItem.display_name}
                </h3>
                <p className="text-xs text-neutral-500">
                  {selectedSize ? `${selectedSize.w}×${selectedSize.h}` : ""} ·{" "}
                  {itemWeightKg(selectedItem).toFixed(1)} kg
                  {selectedCount > 1 ? ` · ×${selectedCount}` : ""}
                </p>
              </div>
            </div>
            {selectedItem.description && (
              <p className="text-xs leading-relaxed text-neutral-400">{selectedItem.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {selectedItem.category === "consumable" &&
                (selectedItem.effects?.heal ? (
                  healingTargets.map((target) => (
                    <button
                      key={`${selectedItem.id}_${target.id}`}
                      className="inline-flex items-center gap-1.5 rounded bg-indigo-500 px-2.5 py-1 text-xs text-white transition-colors hover:bg-indigo-600"
                      title={`${target.name}: ${target.dead ? "Fallen" : `${target.hp}/${target.maxHp} HP`}`}
                      onClick={() => onUse(selectedItem, selectedItem.id, target.id)}
                    >
                      <Heart className="h-3 w-3" />
                      <span className="max-w-[7.5rem] truncate">
                        {target.id === "player" ? "Use: You" : `Use: ${target.name}`}
                      </span>
                    </button>
                  ))
                ) : (
                  <button
                    className="inline-flex items-center gap-1.5 rounded bg-indigo-500 px-2.5 py-1 text-xs text-white transition-colors hover:bg-indigo-600"
                    onClick={() => onUse(selectedItem, selectedItem.id)}
                  >
                    Use
                  </button>
                ))}
              <button
                className="inline-flex items-center gap-1.5 rounded bg-neutral-700 px-2.5 py-1 text-xs text-neutral-100 transition-colors hover:bg-neutral-600"
                onClick={rotateSelected}
              >
                <RotateCw className="h-3 w-3" />
                Rotate
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded bg-neutral-800 px-2.5 py-1 text-xs text-rose-300 transition-colors hover:bg-rose-900/50"
                onClick={() => onDrop(selectedItem.id)}
              >
                <Trash2 className="h-3 w-3" />
                Drop
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">
            Select an item to inspect or use it.
          </div>
        )}
      </div>

      {/* floating drag ghost */}
      {drag &&
        (() => {
          const item = itemById.get(drag.itemId);
          const size = itemSize(item, drag.rotation);
          return (
            <div
              className="pointer-events-none fixed z-[60] flex items-center justify-center rounded-md border border-indigo-400 bg-neutral-800/90 text-2xl shadow-xl"
              style={{
                left: drag.pointerX - drag.grabPxX,
                top: drag.pointerY - drag.grabPxY,
                width: span(size.w),
                height: span(size.h),
              }}
            >
              {item?.icon || "📦"}
            </div>
          );
        })()}
    </div>
  );
}
