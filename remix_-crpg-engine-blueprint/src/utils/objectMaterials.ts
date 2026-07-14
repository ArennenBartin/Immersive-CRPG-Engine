import type {
  ObjectData,
  ObjectDecalData,
  ObjectMaterialData,
} from "../schema/game";
import * as THREE from "three";

export const MATERIAL_TEXTURE_OPTIONS = [
  { id: "none", label: "Flat" },
  { id: "stone_grain", label: "Stone Grain" },
  { id: "marble_veins", label: "Marble Veins" },
  { id: "wood_grain", label: "Wood Grain" },
  { id: "metal_scratches", label: "Metal Scratches" },
  { id: "cloth_weave", label: "Cloth Weave" },
  { id: "paper_fiber", label: "Paper Fiber" },
  { id: "soil_grit", label: "Soil Grit" },
  { id: "water_shimmer", label: "Water Shimmer" },
  { id: "glass_facets", label: "Glass Facets" },
  { id: "blood_sheen", label: "Blood Sheen" },
  { id: "bone_pores", label: "Bone Pores" },
] as const;

export type MaterialTextureKind =
  (typeof MATERIAL_TEXTURE_OPTIONS)[number]["id"];

const MATERIAL_TEXTURE_KIND_SET = new Set<MaterialTextureKind>(
  MATERIAL_TEXTURE_OPTIONS.map((option) => option.id),
);

export type ResolvedObjectMaterial = {
  id: string;
  name: string;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  roughness: number;
  metalness: number;
  textureKind: MaterialTextureKind;
  textureScale: number;
  textureStrength: number;
  textureImageUrl?: string;
};

export const DECAL_KIND_PRESETS: Record<
  ObjectDecalData["kind"],
  { label: string; color: string; opacity: number; emissive: boolean }
> = {
  blood: {
    label: "Blood",
    color: "#FF1E4D",
    opacity: 0.82,
    emissive: false,
  },
  crack: {
    label: "Crack",
    color: "#100D14",
    opacity: 0.72,
    emissive: false,
  },
  marble_vein: {
    label: "Marble Vein",
    color: "#9A8FD6",
    opacity: 0.5,
    emissive: false,
  },
  inscription: {
    label: "Inscription",
    color: "#FFC95A",
    opacity: 0.72,
    emissive: true,
  },
  grid_glow: {
    label: "Grid Glow",
    color: "#8CF6FF",
    opacity: 0.86,
    emissive: true,
  },
  custom: {
    label: "Custom",
    color: "#E5E9F0",
    opacity: 0.7,
    emissive: false,
  },
};

export const isHexColor = (value?: string) =>
  /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value || "");

export const normalizeMaterialRef = (value?: string) =>
  (value || "").trim() || "#A3BE8C";

export const getMaterialDisplayName = (materialRef: string) =>
  isHexColor(materialRef) ? materialRef.toUpperCase() : materialRef;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeTextureKind = (value?: string): MaterialTextureKind =>
  MATERIAL_TEXTURE_KIND_SET.has(value as MaterialTextureKind)
    ? (value as MaterialTextureKind)
    : "none";

export const createDefaultMaterialSetting = (
  materialRef: string,
): ObjectMaterialData => ({
  id: normalizeMaterialRef(materialRef),
  name: getMaterialDisplayName(normalizeMaterialRef(materialRef)),
  color: isHexColor(materialRef) ? normalizeMaterialRef(materialRef) : "#A3BE8C",
  emissive: "#000000",
  emissive_intensity: 0,
  opacity: 1,
  transparent: false,
  roughness: 0.7,
  metalness: 0.02,
  texture_kind: "none",
  texture_scale: 1,
  texture_strength: 0.45,
});

export const getObjectMaterialRefs = (object: ObjectData) => {
  const refs = new Set<string>();

  (object.materials || []).forEach((material) =>
    refs.add(normalizeMaterialRef(material)),
  );
  (object.mesh?.material_slots || []).forEach((material) =>
    refs.add(normalizeMaterialRef(material)),
  );
  object.mesh?.faces.forEach((face) =>
    refs.add(normalizeMaterialRef(face.material)),
  );
  object.parts.forEach((part) =>
    refs.add(normalizeMaterialRef(part.material)),
  );
  (object.material_settings || []).forEach((material) =>
    refs.add(normalizeMaterialRef(material.id)),
  );

  return Array.from(refs).filter(Boolean);
};

export const resolveObjectMaterial = (
  object: ObjectData | null | undefined,
  materialRef?: string,
): ResolvedObjectMaterial => {
  const ref = normalizeMaterialRef(
    materialRef ||
      object?.materials?.[0] ||
      object?.mesh?.material_slots?.[0] ||
      object?.material_settings?.[0]?.id,
  );
  const setting = object?.material_settings?.find(
    (candidate) =>
      candidate.id === ref ||
      candidate.name === ref ||
      candidate.color.toLowerCase() === ref.toLowerCase(),
  );
  const fallback = createDefaultMaterialSetting(ref);
  const material = setting || fallback;
  const color = isHexColor(material.color)
    ? material.color
    : isHexColor(ref)
      ? ref
      : fallback.color;
  const opacity = Math.max(0.02, Math.min(1, Number(material.opacity ?? 1)));

  return {
    id: material.id || ref,
    name: material.name || getMaterialDisplayName(ref),
    color,
    emissive: isHexColor(material.emissive) ? material.emissive : "#000000",
    emissiveIntensity: Math.max(0, Number(material.emissive_intensity || 0)),
    opacity,
    transparent: Boolean(material.transparent) || opacity < 1,
    roughness: clamp(Number(material.roughness ?? 0.7), 0, 1),
    metalness: clamp(Number(material.metalness ?? 0.02), 0, 1),
    textureKind: normalizeTextureKind(material.texture_kind),
    textureScale: clamp(Number(material.texture_scale ?? 1), 0.25, 6),
    textureStrength: clamp(Number(material.texture_strength ?? 0.45), 0, 1),
    textureImageUrl: material.texture_image_url?.trim() || undefined,
  };
};

const textureCache = new Map<string, THREE.Texture>();
const normalMapCache = new Map<string, THREE.Texture>();
const roughnessMapCache = new Map<string, THREE.Texture>();

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed: number) => {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
};

const between = (random: () => number, min: number, max: number) =>
  min + (max - min) * random();

const rgba = (shade: number, opacity: number) =>
  `rgba(${shade}, ${shade}, ${shade}, ${clamp(opacity, 0, 1)})`;

const drawDots = (
  ctx: CanvasRenderingContext2D,
  random: () => number,
  count: number,
  shade: number,
  opacity: number,
  maxSize = 1.5,
) => {
  for (let index = 0; index < count; index += 1) {
    const size = between(random, 0.35, maxSize);
    ctx.fillStyle = rgba(shade + between(random, -18, 18), opacity * random());
    ctx.fillRect(between(random, 0, 64), between(random, 0, 64), size, size);
  }
};

const drawJaggedLine = (
  ctx: CanvasRenderingContext2D,
  random: () => number,
  startX: number,
  startY: number,
  length: number,
  angle: number,
  strokeStyle: string,
  width: number,
) => {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(startX, startY);

  for (let step = 1; step <= 5; step += 1) {
    const progress = step / 5;
    ctx.lineTo(
      startX + Math.cos(angle) * length * progress + between(random, -4, 4),
      startY + Math.sin(angle) * length * progress + between(random, -4, 4),
    );
  }

  ctx.stroke();
};

const drawTexturePattern = (
  ctx: CanvasRenderingContext2D,
  material: ResolvedObjectMaterial,
) => {
  const random = createRandom(
    hashString(
      `${material.id}:${material.color}:${material.textureKind}:${material.textureScale}`,
    ),
  );
  const strength = material.textureStrength;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 64);

  switch (material.textureKind) {
    case "stone_grain":
      drawDots(ctx, random, 230, 80, 0.55 * strength, 1.8);
      drawDots(ctx, random, 90, 220, 0.28 * strength, 1.2);
      for (let index = 0; index < 7; index += 1) {
        drawJaggedLine(
          ctx,
          random,
          between(random, -6, 64),
          between(random, 0, 64),
          between(random, 20, 54),
          between(random, -1.3, 1.3),
          rgba(30, 0.38 * strength),
          between(random, 0.8, 1.6),
        );
      }
      break;
    case "marble_veins":
      drawDots(ctx, random, 90, 230, 0.22 * strength, 1);
      for (let index = 0; index < 9; index += 1) {
        ctx.strokeStyle = rgba(index % 3 === 0 ? 95 : 145, 0.26 * strength);
        ctx.lineWidth = between(random, 0.8, 2.4);
        ctx.beginPath();
        const y = between(random, -8, 70);
        ctx.moveTo(-8, y);
        ctx.bezierCurveTo(
          between(random, 10, 24),
          y + between(random, -18, 18),
          between(random, 32, 50),
          y + between(random, -18, 18),
          72,
          y + between(random, -10, 10),
        );
        ctx.stroke();
      }
      break;
    case "wood_grain":
      for (let x = -8; x < 72; x += between(random, 4, 9)) {
        ctx.strokeStyle = rgba(58, between(random, 0.12, 0.32) * strength);
        ctx.lineWidth = between(random, 1, 2.8);
        ctx.beginPath();
        ctx.moveTo(x, -4);
        ctx.bezierCurveTo(
          x + between(random, -8, 8),
          16,
          x + between(random, -8, 8),
          44,
          x + between(random, -5, 5),
          68,
        );
        ctx.stroke();
      }
      for (let index = 0; index < 5; index += 1) {
        ctx.strokeStyle = rgba(240, 0.18 * strength);
        ctx.strokeRect(
          between(random, 4, 52),
          between(random, 6, 50),
          between(random, 6, 16),
          between(random, 2, 8),
        );
      }
      break;
    case "metal_scratches":
      drawDots(ctx, random, 70, 60, 0.26 * strength, 1.2);
      for (let index = 0; index < 50; index += 1) {
        const x = between(random, -4, 64);
        const y = between(random, 0, 64);
        drawJaggedLine(
          ctx,
          random,
          x,
          y,
          between(random, 5, 18),
          between(random, -0.25, 0.25),
          rgba(random() > 0.45 ? 235 : 65, 0.28 * strength),
          0.75,
        );
      }
      break;
    case "cloth_weave":
      ctx.lineWidth = 1;
      for (let pos = 0; pos < 64; pos += 4) {
        ctx.strokeStyle = rgba(44, 0.18 * strength);
        ctx.beginPath();
        ctx.moveTo(pos + (random() > 0.5 ? 1 : 0), 0);
        ctx.lineTo(pos + between(random, -1, 1), 64);
        ctx.stroke();
        ctx.strokeStyle = rgba(230, 0.14 * strength);
        ctx.beginPath();
        ctx.moveTo(0, pos + between(random, -1, 1));
        ctx.lineTo(64, pos + (random() > 0.5 ? 1 : 0));
        ctx.stroke();
      }
      break;
    case "paper_fiber":
      drawDots(ctx, random, 120, 210, 0.28 * strength, 1);
      for (let index = 0; index < 28; index += 1) {
        drawJaggedLine(
          ctx,
          random,
          between(random, 0, 64),
          between(random, 0, 64),
          between(random, 6, 22),
          between(random, -Math.PI, Math.PI),
          rgba(90, 0.16 * strength),
          0.65,
        );
      }
      break;
    case "soil_grit":
      drawDots(ctx, random, 320, 55, 0.62 * strength, 2.2);
      drawDots(ctx, random, 110, 225, 0.18 * strength, 1);
      break;
    case "water_shimmer":
      for (let y = -4; y < 72; y += 7) {
        ctx.strokeStyle = rgba(235, 0.34 * strength);
        ctx.lineWidth = between(random, 1, 2);
        ctx.beginPath();
        ctx.moveTo(-4, y);
        ctx.bezierCurveTo(16, y + 6, 36, y - 6, 68, y + between(random, -4, 4));
        ctx.stroke();
      }
      drawDots(ctx, random, 40, 255, 0.2 * strength, 1.5);
      break;
    case "glass_facets":
      for (let index = 0; index < 18; index += 1) {
        ctx.fillStyle = rgba(random() > 0.45 ? 245 : 90, 0.12 * strength);
        ctx.beginPath();
        ctx.moveTo(between(random, 0, 64), between(random, 0, 64));
        ctx.lineTo(between(random, 0, 64), between(random, 0, 64));
        ctx.lineTo(between(random, 0, 64), between(random, 0, 64));
        ctx.closePath();
        ctx.fill();
      }
      for (let index = 0; index < 18; index += 1) {
        drawJaggedLine(
          ctx,
          random,
          between(random, 0, 64),
          between(random, 0, 64),
          between(random, 10, 34),
          between(random, -Math.PI, Math.PI),
          rgba(255, 0.36 * strength),
          0.8,
        );
      }
      break;
    case "blood_sheen":
      drawDots(ctx, random, 60, 45, 0.38 * strength, 1.6);
      for (let index = 0; index < 14; index += 1) {
        drawJaggedLine(
          ctx,
          random,
          between(random, -6, 64),
          between(random, 0, 64),
          between(random, 16, 48),
          between(random, -0.8, 0.8),
          rgba(random() > 0.45 ? 245 : 30, 0.34 * strength),
          between(random, 1.2, 3.2),
        );
      }
      break;
    case "bone_pores":
      drawDots(ctx, random, 140, 80, 0.28 * strength, 1.5);
      drawDots(ctx, random, 60, 238, 0.16 * strength, 1.2);
      for (let index = 0; index < 12; index += 1) {
        drawJaggedLine(
          ctx,
          random,
          between(random, 0, 64),
          between(random, 0, 64),
          between(random, 8, 22),
          between(random, -Math.PI, Math.PI),
          rgba(92, 0.13 * strength),
          0.7,
        );
      }
      break;
  }
};

const getSurfaceKey = (material: ResolvedObjectMaterial, kind: string) =>
  [
    kind,
    material.id,
    material.color,
    material.textureKind,
    material.textureScale.toFixed(2),
    material.textureStrength.toFixed(2),
  ].join("|");

const configureSurfaceMap = (texture: THREE.CanvasTexture, material: ResolvedObjectMaterial) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(material.textureScale, material.textureScale);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const drawSurfaceHeightPattern = (
  ctx: CanvasRenderingContext2D,
  material: ResolvedObjectMaterial,
) => {
  const random = createRandom(
    hashString(
      `height:${material.id}:${material.color}:${material.textureKind}:${material.textureScale}`,
    ),
  );
  const strength = material.textureStrength;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, 64, 64);

  switch (material.textureKind) {
    case "stone_grain":
      drawDots(ctx, random, 260, 70, 0.72 * strength, 2.4);
      drawDots(ctx, random, 90, 210, 0.32 * strength, 1.2);
      ctx.strokeStyle = rgba(42, 0.58 * strength);
      ctx.lineWidth = 1.2;
      for (let x = -12; x < 76; x += between(random, 12, 19)) {
        drawJaggedLine(ctx, random, x, -4, 74, Math.PI / 2 + between(random, -0.1, 0.1), ctx.strokeStyle, ctx.lineWidth);
      }
      for (let y = -8; y < 72; y += between(random, 10, 16)) {
        drawJaggedLine(ctx, random, -6, y, 78, between(random, -0.08, 0.08), rgba(48, 0.46 * strength), 1);
      }
      break;
    case "marble_veins":
      for (let index = 0; index < 12; index += 1) {
        const y = between(random, -8, 70);
        ctx.strokeStyle = rgba(index % 2 === 0 ? 62 : 210, 0.34 * strength);
        ctx.lineWidth = between(random, 0.9, 2.6);
        ctx.beginPath();
        ctx.moveTo(-8, y);
        ctx.bezierCurveTo(18, y + between(random, -16, 16), 42, y + between(random, -20, 20), 72, y + between(random, -8, 8));
        ctx.stroke();
      }
      break;
    case "wood_grain":
      for (let x = -10; x < 76; x += between(random, 3, 7)) {
        drawJaggedLine(ctx, random, x, -4, 74, Math.PI / 2 + between(random, -0.12, 0.12), rgba(random() > 0.5 ? 82 : 188, 0.42 * strength), between(random, 0.8, 2));
      }
      break;
    case "metal_scratches":
      drawDots(ctx, random, 90, 110, 0.24 * strength, 1.2);
      for (let index = 0; index < 72; index += 1) {
        drawJaggedLine(ctx, random, between(random, -4, 64), between(random, 0, 64), between(random, 5, 22), between(random, -0.22, 0.22), rgba(random() > 0.5 ? 230 : 72, 0.38 * strength), 0.7);
      }
      break;
    case "cloth_weave":
      ctx.lineWidth = 1;
      for (let pos = 0; pos < 64; pos += 4) {
        ctx.strokeStyle = rgba(70, 0.36 * strength);
        ctx.beginPath();
        ctx.moveTo(pos + between(random, -1, 1), 0);
        ctx.lineTo(pos + between(random, -1, 1), 64);
        ctx.stroke();
        ctx.strokeStyle = rgba(190, 0.26 * strength);
        ctx.beginPath();
        ctx.moveTo(0, pos + between(random, -1, 1));
        ctx.lineTo(64, pos + between(random, -1, 1));
        ctx.stroke();
      }
      break;
    case "paper_fiber":
      drawDots(ctx, random, 160, 210, 0.3 * strength, 1);
      for (let index = 0; index < 42; index += 1) {
        drawJaggedLine(ctx, random, between(random, 0, 64), between(random, 0, 64), between(random, 6, 20), between(random, -Math.PI, Math.PI), rgba(84, 0.2 * strength), 0.6);
      }
      break;
    case "soil_grit":
      drawDots(ctx, random, 420, 58, 0.74 * strength, 2.6);
      drawDots(ctx, random, 120, 215, 0.22 * strength, 1);
      break;
    case "water_shimmer":
      for (let y = -4; y < 72; y += 6) {
        ctx.strokeStyle = rgba(224, 0.42 * strength);
        ctx.lineWidth = between(random, 1, 2.2);
        ctx.beginPath();
        ctx.moveTo(-4, y);
        ctx.bezierCurveTo(14, y + 5, 38, y - 5, 70, y + between(random, -4, 4));
        ctx.stroke();
      }
      break;
    case "glass_facets":
      for (let index = 0; index < 24; index += 1) {
        ctx.fillStyle = rgba(random() > 0.5 ? 232 : 72, 0.22 * strength);
        ctx.beginPath();
        ctx.moveTo(between(random, 0, 64), between(random, 0, 64));
        ctx.lineTo(between(random, 0, 64), between(random, 0, 64));
        ctx.lineTo(between(random, 0, 64), between(random, 0, 64));
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "blood_sheen":
      drawDots(ctx, random, 120, 58, 0.5 * strength, 2.2);
      for (let index = 0; index < 18; index += 1) {
        drawJaggedLine(ctx, random, between(random, -6, 64), between(random, 0, 64), between(random, 14, 48), between(random, -0.75, 0.75), rgba(random() > 0.5 ? 235 : 38, 0.4 * strength), between(random, 1, 3));
      }
      break;
    case "bone_pores":
      drawDots(ctx, random, 190, 78, 0.32 * strength, 1.8);
      drawDots(ctx, random, 80, 224, 0.16 * strength, 1.2);
      break;
  }
};

const createHeightCanvas = (material: ResolvedObjectMaterial) => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawSurfaceHeightPattern(ctx, material);
  return canvas;
};

const createNormalCanvasFromHeight = (
  heightCanvas: HTMLCanvasElement,
  strength: number,
) => {
  const sourceCtx = heightCanvas.getContext("2d");
  if (!sourceCtx) return null;

  const source = sourceCtx.getImageData(0, 0, heightCanvas.width, heightCanvas.height);
  const canvas = document.createElement("canvas");
  canvas.width = heightCanvas.width;
  canvas.height = heightCanvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const output = ctx.createImageData(canvas.width, canvas.height);
  const sample = (x: number, y: number) => {
    const wrappedX = (x + canvas.width) % canvas.width;
    const wrappedY = (y + canvas.height) % canvas.height;
    return source.data[(wrappedY * canvas.width + wrappedX) * 4] / 255;
  };

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx / length;
      const ny = -dy / length;
      const nz = 1 / length;
      const offset = (y * canvas.width + x) * 4;
      output.data[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      output.data[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      output.data[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      output.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
};

export const getObjectMaterialTexture = (
  material: ResolvedObjectMaterial,
): THREE.Texture | null => {
  if (material.textureImageUrl && typeof document !== "undefined") {
    const key = [
      "image",
      material.textureImageUrl,
      material.textureScale.toFixed(2),
    ].join("|");
    const cached = textureCache.get(key);
    if (cached) return cached;

    const texture = new THREE.TextureLoader().load(material.textureImageUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(material.textureScale, material.textureScale);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    textureCache.set(key, texture);
    return texture;
  }

  if (
    material.textureKind === "none" ||
    material.textureStrength <= 0.01 ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const key = [
    material.id,
    material.color,
    material.textureKind,
    material.textureScale.toFixed(2),
    material.textureStrength.toFixed(2),
  ].join("|");
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  drawTexturePattern(ctx, material);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(material.textureScale, material.textureScale);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
};

const shouldUseProceduralSurfaceMaps = (material: ResolvedObjectMaterial) =>
  material.textureKind !== "none" &&
  material.textureStrength > 0.01 &&
  !material.textureImageUrl &&
  typeof document !== "undefined";

export const getObjectMaterialNormalScale = (
  material: ResolvedObjectMaterial,
) => {
  const kindStrength: Record<MaterialTextureKind, number> = {
    none: 0,
    stone_grain: 0.72,
    marble_veins: 0.38,
    wood_grain: 0.48,
    metal_scratches: 0.32,
    cloth_weave: 0.42,
    paper_fiber: 0.24,
    soil_grit: 0.68,
    water_shimmer: 0.2,
    glass_facets: 0.34,
    blood_sheen: 0.18,
    bone_pores: 0.36,
  };

  return kindStrength[material.textureKind] * material.textureStrength;
};

export const getObjectMaterialNormalMap = (
  material: ResolvedObjectMaterial,
): THREE.Texture | null => {
  if (!shouldUseProceduralSurfaceMaps(material)) return null;

  const key = getSurfaceKey(material, "normal");
  const cached = normalMapCache.get(key);
  if (cached) return cached;

  const heightCanvas = createHeightCanvas(material);
  if (!heightCanvas) return null;
  const normalCanvas = createNormalCanvasFromHeight(
    heightCanvas,
    5 + getObjectMaterialNormalScale(material) * 13,
  );
  if (!normalCanvas) return null;

  const texture = configureSurfaceMap(new THREE.CanvasTexture(normalCanvas), material);
  normalMapCache.set(key, texture);
  return texture;
};

export const getObjectMaterialRoughnessMap = (
  material: ResolvedObjectMaterial,
): THREE.Texture | null => {
  if (!shouldUseProceduralSurfaceMaps(material)) return null;

  const key = getSurfaceKey(material, "roughness");
  const cached = roughnessMapCache.get(key);
  if (cached) return cached;

  const heightCanvas = createHeightCanvas(material);
  const sourceCtx = heightCanvas?.getContext("2d");
  if (!heightCanvas || !sourceCtx) return null;

  const source = sourceCtx.getImageData(0, 0, heightCanvas.width, heightCanvas.height);
  const canvas = document.createElement("canvas");
  canvas.width = heightCanvas.width;
  canvas.height = heightCanvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const output = ctx.createImageData(canvas.width, canvas.height);
  const variation = 72 * material.textureStrength;
  const base = material.roughness * 255;

  for (let index = 0; index < source.data.length; index += 4) {
    const height = source.data[index] - 128;
    const roughness = clamp((base + height * 0.34 + variation * 0.18) / 255, 0.06, 0.98);
    const encoded = Math.round(roughness * 255);
    output.data[index] = encoded;
    output.data[index + 1] = encoded;
    output.data[index + 2] = encoded;
    output.data[index + 3] = 255;
  }

  ctx.putImageData(output, 0, 0);
  const texture = configureSurfaceMap(new THREE.CanvasTexture(canvas), material);
  roughnessMapCache.set(key, texture);
  return texture;
};

export const getMaterialBudgetWarnings = (object: ObjectData) => {
  const refs = getObjectMaterialRefs(object);
  const settings = object.material_settings || [];
  const uniqueMaterialCount = refs.length;
  const transparentCount = settings.filter(
    (material) => material.transparent || material.opacity < 1,
  ).length;
  const emissiveCount = settings.filter(
    (material) => Number(material.emissive_intensity || 0) > 0,
  ).length;
  const decalCount = object.decals?.length || 0;
  const warnings: string[] = [];

  if (uniqueMaterialCount > 8) {
    warnings.push(`${uniqueMaterialCount} material refs may create extra draw calls.`);
  }
  if (transparentCount > 4) {
    warnings.push(`${transparentCount} transparent materials can sort poorly in-game.`);
  }
  if (emissiveCount > 4) {
    warnings.push(`${emissiveCount} emissive materials can overpower the low-light scene.`);
  }
  if (decalCount > 16) {
    warnings.push(`${decalCount} decals is above the current prop budget.`);
  }

  return warnings;
};
