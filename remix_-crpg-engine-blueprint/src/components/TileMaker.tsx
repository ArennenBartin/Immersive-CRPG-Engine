/**
 * @deprecated Historical 2D tile editor. ModelMaker owns active object/tile
 * authoring. Production modules must not import this file.
 */
// ── TileMaker ────────────────────────────────────────────────────────────────
// The 2D studio's tile editor (replaces the 3D Model Maker). Authors top-down
// pixel-art tile sprites and binds them to objects in the library via the
// object's `tile_sprite_id`, so the 2D renderer draws them in Map + Play.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEngineStore } from "../store/engineStore";
import type { ObjectData, SpriteData } from "../schema/game";
import {
  getSpriteCanvas,
  colorForObject,
  buildSpriteIndex,
  objectTileSprite,
} from "../utils/tileRendering";
import { CHEM_MATERIALS } from "../engine-core/chemistry";

const PALETTE = [
  "transparent", "#0b1020", "#1b2236", "#26324c", "#4a4366", "#64748b",
  "#94a3b8", "#e5e9f0", "#7c4a24", "#8b5a2b", "#b9912f", "#facc15",
  "#3f7a3f", "#2f7d3a", "#176076", "#38bdf8", "#bf616a", "#e76f51",
  "#a78bfa", "#c084fc", "#5b3b1f", "#6b4f2f",
];

// Small canvas thumbnail for an object's tile (or a placeholder swatch).
function TileThumb({ object, sprite, size = 40 }: { object: ObjectData; sprite?: SpriteData; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const img = sprite ? getSpriteCanvas(sprite) : null;
    if (img) {
      ctx.drawImage(img, 0, 0, size, size);
    } else {
      ctx.fillStyle = colorForObject(object);
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(2, 2, size - 4, size - 4);
      ctx.clearRect(4, 4, size - 8, size - 8);
    }
  }, [object, sprite, size]);
  return <canvas ref={ref} width={size} height={size} className="rounded" style={{ imageRendering: "pixelated" }} />;
}

export function TileMaker() {
  const {
    gamePackage,
    addSprite,
    updateSprite,
    addObject,
    updateObject,
    selectedObjectId,
    setSelectedObjectId,
  } = useEngineStore();

  const spriteIndex = useMemo(() => buildSpriteIndex(gamePackage), [gamePackage]);
  const objects = gamePackage.object_library as ObjectData[];
  const chemMaterialIds = useMemo(() => {
    const custom = Object.keys(
      ((gamePackage.settings as Record<string, unknown>)?.chem_materials as Record<string, unknown>) || {},
    );
    return Array.from(new Set([...custom, ...Object.keys(CHEM_MATERIALS)]));
  }, [gamePackage.settings]);

  const [filter, setFilter] = useState("");
  const [activeObjectId, setActiveObjectId] = useState<string | null>(
    selectedObjectId || objects[0]?.id || null,
  );
  const [currentColor, setCurrentColor] = useState("#64748b");
  const [tool, setTool] = useState<"brush" | "eraser" | "fill">("brush");

  const activeObject = objects.find((o) => o.id === activeObjectId) || null;
  const activeTileId = (activeObject as any)?.tile_sprite_id as string | undefined;
  const activeSprite = activeTileId ? spriteIndex.get(activeTileId) : undefined;

  const editorRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);
  const EDITOR_PX = 384;

  const W = activeSprite?.width || 16;
  const H = activeSprite?.height || 16;
  const cell = EDITOR_PX / Math.max(W, H);

  // Redraw the pixel editor.
  useEffect(() => {
    const canvas = editorRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Checkerboard for transparency.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#1a1a1f" : "#222228";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    const pixels = activeSprite?.pixels || [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = pixels[y * W + x];
        if (c && c !== "transparent" && c !== "") {
          ctx.fillStyle = c;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, H * cell); ctx.stroke(); }
    for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(W * cell, y * cell); ctx.stroke(); }
  }, [activeSprite, W, H, cell]);

  const createTileForObject = (object: ObjectData): string => {
    const id = `tile_custom_${object.id}_${Date.now().toString(36)}`;
    const baseColor = colorForObject(object);
    addSprite({
      id,
      display_name: `${object.display_name} tile`,
      width: 16,
      height: 16,
      pixels: new Array(16 * 16).fill(baseColor),
    });
    updateObject(object.id, { tile_sprite_id: id });
    return id;
  };

  const paintAt = (clientX: number, clientY: number) => {
    if (!activeObject) return;
    let sprite = activeSprite;
    if (!sprite) {
      const id = createTileForObject(activeObject);
      sprite = useEngineStore.getState().gamePackage.sprite_library.find((s) => s.id === id) as SpriteData;
      if (!sprite) return;
    }
    const canvas = editorRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor(((clientX - rect.left) / rect.width) * W);
    const py = Math.floor(((clientY - rect.top) / rect.height) * H);
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const pixels = [...(sprite.pixels || new Array(W * H).fill("transparent"))];
    const value = tool === "eraser" ? "transparent" : currentColor;
    if (tool === "fill") {
      const target = pixels[py * W + px];
      if (target === value) return;
      const stack: [number, number][] = [[px, py]];
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
        if (pixels[cy * W + cx] !== target) continue;
        pixels[cy * W + cx] = value;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    } else {
      pixels[py * W + px] = value;
    }
    updateSprite(sprite.id, { pixels });
  };

  const createNewObject = () => {
    const id = `obj_custom_${Date.now().toString(36)}`;
    const spriteId = `tile_${id}`;
    addSprite({
      id: spriteId,
      display_name: "New tile",
      width: 16,
      height: 16,
      pixels: new Array(16 * 16).fill("#54607a"),
    });
    addObject({
      id,
      display_name: "New Tile Object",
      category: "terrain",
      tags: ["tile", "ground"],
      tile_sprite_id: spriteId,
      bounds: [1, 0.1, 1],
      materials: ["#54607a"],
      material_settings: [],
      model_kind: "parts",
      parts: [],
      decals: [],
      reference_images: [],
      collision: { profile: "none", footprint: [[0, 0]] },
    });
    setActiveObjectId(id);
    setSelectedObjectId(id);
  };

  const filtered = objects.filter(
    (o) =>
      !filter ||
      o.display_name.toLowerCase().includes(filter.toLowerCase()) ||
      o.id.toLowerCase().includes(filter.toLowerCase()) ||
      (o.category || "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex h-full bg-neutral-950 text-neutral-100">
      {/* Object list */}
      <div className="w-72 border-r border-neutral-800 flex flex-col min-h-0">
        <div className="p-3 border-b border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tiles</h2>
            <button onClick={createNewObject} className="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-1 rounded hover:bg-indigo-600/50">+ New</button>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search objects…"
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs"
          />
        </div>
        <div className="flex-1 overflow-auto p-2 grid grid-cols-3 gap-2 content-start">
          {filtered.map((o) => {
            const sprite = objectTileSprite(o, spriteIndex);
            const active = o.id === activeObjectId;
            return (
              <button
                key={o.id}
                onClick={() => { setActiveObjectId(o.id); setSelectedObjectId(o.id); }}
                className={`flex flex-col items-center gap-1 p-1.5 rounded border ${active ? "border-indigo-400 bg-indigo-500/10" : "border-neutral-800 hover:border-neutral-600"}`}
                title={o.id}
              >
                <TileThumb object={o} sprite={sprite} />
                <span className="text-[10px] text-neutral-400 truncate w-full text-center">{o.display_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pixel editor */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 p-6">
        {activeObject ? (
          <>
            <div className="mb-3 text-center">
              <div className="text-sm font-semibold">{activeObject.display_name}</div>
              <div className="text-[11px] text-neutral-500">{activeObject.id} · {W}×{H} tile</div>
            </div>
            {!activeSprite && (
              <button
                onClick={() => activeObject && createTileForObject(activeObject)}
                className="mb-3 text-xs bg-emerald-600/30 text-emerald-300 px-3 py-1.5 rounded hover:bg-emerald-600/50"
              >
                Create tile for this object
              </button>
            )}
            <canvas
              ref={editorRef}
              width={EDITOR_PX}
              height={EDITOR_PX}
              className="border border-neutral-700 rounded cursor-crosshair"
              style={{ imageRendering: "pixelated", touchAction: "none", width: EDITOR_PX, height: EDITOR_PX }}
              onPointerDown={(e) => { paintingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); paintAt(e.clientX, e.clientY); }}
              onPointerMove={(e) => { if (paintingRef.current && tool !== "fill") paintAt(e.clientX, e.clientY); }}
              onPointerUp={() => { paintingRef.current = false; }}
              onPointerCancel={() => { paintingRef.current = false; }}
            />
          </>
        ) : (
          <div className="text-neutral-500 text-sm">Select an object to paint its tile.</div>
        )}
      </div>

      {/* Tools */}
      <div className="w-56 border-l border-neutral-800 p-3 space-y-4 overflow-auto">
        <div>
          <div className="text-xs font-semibold mb-2">Tool</div>
          <div className="flex gap-1">
            {(["brush", "eraser", "fill"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`flex-1 text-xs py-1.5 rounded capitalize ${tool === t ? "bg-indigo-600/40 text-indigo-200" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold mb-2">Color</div>
          <div className="flex items-center gap-2 mb-2">
            <input type="color" value={currentColor.startsWith("#") ? currentColor : "#000000"} onChange={(e) => setCurrentColor(e.target.value)} className="w-10 h-8 bg-transparent" />
            <span className="text-[11px] text-neutral-400">{currentColor}</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setCurrentColor(c)}
                title={c}
                className={`w-7 h-7 rounded border ${currentColor === c ? "border-white" : "border-neutral-700"}`}
                style={c === "transparent"
                  ? { backgroundImage: "linear-gradient(45deg,#444 25%,transparent 25%,transparent 75%,#444 75%),linear-gradient(45deg,#444 25%,#222 25%,#222 75%,#444 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,4px 4px" }
                  : { background: c }}
              />
            ))}
          </div>
        </div>
        {activeObject && (
          <div className="border-t border-neutral-800 pt-3 space-y-2">
            <div className="text-xs font-semibold">Chemistry material</div>
            <select
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
              value={(activeObject as any).chem_material_id || ""}
              onChange={(e) =>
                updateObject(activeObject.id, { chem_material_id: e.target.value || undefined } as any)
              }
            >
              <option value="">Auto (inferred from name)</option>
              {chemMaterialIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              What this object is made of for burning, dousing, freezing,
              conduction, and shattering. Custom materials come from the Game
              panel's Chemistry tab.
            </p>
          </div>
        )}
        <div className="text-[11px] text-neutral-500 leading-relaxed border-t border-neutral-800 pt-3">
          Tiles paint as flat top-down sprites. Floors and walls fill the whole
          tile; props (doors, chests, signs) should leave a transparent
          background so the floor shows through.
        </div>
      </div>
    </div>
  );
}

export default TileMaker;
