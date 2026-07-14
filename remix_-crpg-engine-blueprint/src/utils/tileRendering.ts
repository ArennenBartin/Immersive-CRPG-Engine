// ── 2D top-down tile rendering helpers ───────────────────────────────────────
// Shared primitives for the flat, early-Ultima-style 2D renderer (GameRenderer2D)
// and the 2D Tile Maker. The world is grid-based; every object/terrain renders as
// a pixel-art "tile sprite" (SpriteData.pixels) rasterized to an offscreen canvas,
// with a legible coloured placeholder when an object has no tile assigned yet.

import type { GamePackage, ObjectData, SpriteData } from "../schema/game";

// Animated player position, mirrored from the renderer each frame for debug and
// presentation consumers. Gameplay input is intentionally not gated on this:
// movement commands remain simulation-owned while rendering follows smoothly.
export const playerStateRef = { px: 0, py: 0, pz: 0, ready: false };

// Fallback flat colours for cells whose object has no tile sprite. Ported from the
// Legacy authored terrain keeps recognizable colours, plus the
// engine's core floor/wall presets.
const CELL_COLORS: Record<string, string> = {
  obj_floor_plate: "#23304a",
  obj_wall_block: "#4a4366",
  obj_p_door: "#b8783f",
  obj_crate: "#9a6b39",
  obj_chest: "#b9912f",
  obj_terminal: "#3f6f7a",
  obj_training_beacon: "#7a5fb0",
  obj_jam_ground: "#29412f",
  obj_jam_path: "#8a7253",
  obj_jam_stone: "#62666e",
  obj_jam_water: "#176076",
  obj_jam_scar: "#6f243d",
  obj_jam_wall: "#7c828b",
  obj_jam_cliff: "#55565d",
  obj_jam_spire: "#9ee7ff",
  obj_jam_door: "#b8783f",
};

const SURFACE_TINTS: Record<string, string> = {
  water: "rgba(125, 211, 252, 0.28)",
  oil: "rgba(40, 40, 60, 0.4)",
  blood: "rgba(160, 30, 40, 0.38)",
  poison: "rgba(120, 200, 60, 0.32)",
  firehazard: "rgba(240, 120, 40, 0.34)",
  ice: "rgba(190, 230, 255, 0.34)",
};

export function surfaceTint(tag: string | undefined): string | null {
  if (!tag || tag === "none") return null;
  return SURFACE_TINTS[tag] || null;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  if (value.length < 6) return [90, 90, 110];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * amount)}, ${Math.round(
    a[1] + (b[1] - a[1]) * amount,
  )}, ${Math.round(a[2] + (b[2] - a[2]) * amount)})`;
}

// Pick a representative colour for an object from its material settings / palette,
// used for placeholder tiles and the editor's tile picker swatches.
export function colorForObject(object: ObjectData | undefined): string {
  if (!object) return "#3f3f46";
  const direct = CELL_COLORS[object.id];
  if (direct) return direct;
  const matColor =
    object.material_settings?.[0]?.color ||
    object.materials?.[0] ||
    object.parts?.[0]?.material;
  if (matColor && /^#?[0-9a-fA-F]{6}$/.test(matColor.replace("#", ""))) {
    return matColor.startsWith("#") ? matColor : `#${matColor}`;
  }
  const cat = object.category || "";
  if (cat === "structure") return "#4a4366";
  if (cat === "story") return "#6f5a9a";
  return "#54607a";
}

// Flat colour for a cell when no tile sprite is available; raised cells lighten
// to read like walls in top-down view.
export function colorForCell(
  object: ObjectData | undefined,
  objectId: string | undefined,
  visualHeight = 0,
): string {
  const base = object ? colorForObject(object) : CELL_COLORS[objectId || ""] || "#1b2236";
  if (visualHeight <= 0) return base;
  return mix(base, "#ffffff", Math.min(0.5, Math.max(0, visualHeight / 6)));
}

// ── Sprite rasterization cache ───────────────────────────────────────────────
// Sprites are either an array of per-pixel colour strings (`pixels`) or a packed
// `data_url` image. Both are baked into an offscreen <canvas> once and reused.
type RasterEntry = { canvas: HTMLCanvasElement; ready: boolean };
type ImageEntry = { image: HTMLImageElement; ready: boolean };
export type SpriteRenderable = HTMLCanvasElement | HTMLImageElement;
const spriteCanvasCache = new Map<string, RasterEntry>();
const spriteImageCache = new Map<string, ImageEntry>();

function spriteCacheKey(sprite: SpriteData): string {
  const s = sprite as SpriteData & { data_url?: string; animated?: boolean };
  return [
    sprite.id,
    s.data_url ? `url:${s.data_url.length}` : "px",
    s.animated ? "animated" : "static",
    sprite.width || 0,
    sprite.height || 0,
    sprite.pixels?.length || 0,
  ].join("|");
}

export function isAnimatedSprite(sprite: SpriteData | undefined | null): boolean {
  if (!sprite) return false;
  const s = sprite as SpriteData & { data_url?: string; animated?: boolean };
  return Boolean(
    s.animated ||
      s.data_url?.startsWith("data:image/gif") ||
      /\.gif(?:[?#].*)?$/i.test(s.data_url || ""),
  );
}

export function getSpriteImage(
  sprite: SpriteData | undefined | null,
): HTMLImageElement | null {
  if (!sprite) return null;
  const s = sprite as SpriteData & { data_url?: string };
  if (!s.data_url) return null;
  const key = spriteCacheKey(sprite);
  const cached = spriteImageCache.get(key);
  if (cached) return cached.image;

  const entry: ImageEntry = { image: new Image(), ready: false };
  spriteImageCache.set(key, entry);
  entry.image.onload = () => {
    entry.ready = true;
  };
  entry.image.src = s.data_url;
  return entry.image;
}

export function getSpriteCanvas(
  sprite: SpriteData | undefined | null,
): HTMLCanvasElement | null {
  if (!sprite) return null;
  if (isAnimatedSprite(sprite)) return null;
  const key = spriteCacheKey(sprite);
  const cached = spriteCanvasCache.get(key);
  if (cached) return cached.canvas;

  const s = sprite as SpriteData & { data_url?: string };
  const canvas = document.createElement("canvas");

  if (s.data_url) {
    // Width/height unknown until the image loads; size to declared dims and
    // refine on load. Returns a (possibly blank) canvas the RAF loop redraws.
    canvas.width = sprite.width || 64;
    canvas.height = sprite.height || 64;
    const entry: RasterEntry = { canvas, ready: false };
    spriteCanvasCache.set(key, entry);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || canvas.width;
      canvas.height = img.naturalHeight || canvas.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
      }
      entry.ready = true;
    };
    img.src = s.data_url;
    return canvas;
  }

  const w = sprite.width || 16;
  const h = sprite.height || 16;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const entry: RasterEntry = { canvas, ready: true };
  spriteCanvasCache.set(key, entry);
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const pixels = sprite.pixels || [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = pixels[y * w + x];
      if (color && color !== "transparent" && color !== "") {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

export function getSpriteRenderable(
  sprite: SpriteData | undefined | null,
): SpriteRenderable | null {
  if (!sprite) return null;
  return isAnimatedSprite(sprite) ? getSpriteImage(sprite) : getSpriteCanvas(sprite);
}

export function spriteRenderableReady(renderable: SpriteRenderable | null): boolean {
  if (!renderable) return false;
  if (renderable instanceof HTMLImageElement) {
    return renderable.complete && renderable.naturalWidth > 0 && renderable.naturalHeight > 0;
  }
  return renderable.width > 0 && renderable.height > 0;
}

export function spriteRenderableSize(
  renderable: SpriteRenderable | null,
  sprite?: SpriteData,
): { width: number; height: number } {
  if (renderable instanceof HTMLImageElement && renderable.naturalWidth && renderable.naturalHeight) {
    return { width: renderable.naturalWidth, height: renderable.naturalHeight };
  }
  if (renderable) return { width: renderable.width, height: renderable.height };
  return { width: sprite?.width || 1, height: sprite?.height || 1 };
}

export function drawSpriteRenderable(
  ctx: CanvasRenderingContext2D,
  renderable: SpriteRenderable | null,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!spriteRenderableReady(renderable)) return false;
  ctx.drawImage(renderable, x, y, width, height);
  return true;
}

// Emoji / single-glyph icons (ground item fallbacks) baked to a canvas.
const emojiCanvasCache = new Map<string, HTMLCanvasElement>();
export function getEmojiCanvas(icon: string): HTMLCanvasElement {
  const cached = emojiCanvasCache.get(icon);
  if (cached) return cached;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = `${Math.floor(size * 0.8)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, size / 2, size / 2 + 2);
  }
  emojiCanvasCache.set(icon, canvas);
  return canvas;
}

// ── Sprite / tile lookups against the game package ───────────────────────────
export function buildSpriteIndex(pkg: GamePackage): Map<string, SpriteData> {
  return new Map(pkg.sprite_library.map((s) => [s.id, s as SpriteData]));
}

export function buildObjectIndex(pkg: GamePackage): Map<string, ObjectData> {
  return new Map(pkg.object_library.map((o) => [o.id, o as ObjectData]));
}

// Resolve an object's top-down tile sprite (its `tile_sprite_id`), if any.
export function objectTileSprite(
  object: ObjectData | undefined,
  spriteIndex: Map<string, SpriteData>,
): SpriteData | undefined {
  const tileId = (object as (ObjectData & { tile_sprite_id?: string }) | undefined)
    ?.tile_sprite_id;
  if (!tileId) return undefined;
  return spriteIndex.get(tileId);
}

// ── Directional / walk-frame sprite sets ──────────────────────────────────────
// The overworld actor library ships 4-facing × idle/step frames named
// `<base>_<direction>_<frame>`. When a configured sprite id follows that
// convention, swap in the frame matching the actor's facing and gait; anything
// else (single-sprite actors) passes through untouched.
const DIRECTIONAL_SPRITE_RE = /_(north|south|east|west)_(idle|step)$/;
const WALK_FRAME_MS = 180;

export function resolveDirectionalSpriteId(
  spriteIndex: Map<string, SpriteData>,
  spriteId: string | undefined,
  facing: [number, number] | undefined,
  moving: boolean,
  nowMs: number,
): string | undefined {
  if (!spriteId || !DIRECTIONAL_SPRITE_RE.test(spriteId)) return spriteId;
  const [fx, fz] = facing || [0, 1];
  const direction =
    Math.abs(fx) > Math.abs(fz)
      ? fx > 0
        ? "east"
        : "west"
      : fz < 0
        ? "north"
        : "south";
  const frame = moving && Math.floor(nowMs / WALK_FRAME_MS) % 2 === 1 ? "step" : "idle";
  const candidate = spriteId.replace(DIRECTIONAL_SPRITE_RE, `_${direction}_${frame}`);
  return spriteIndex.has(candidate) ? candidate : spriteId;
}
