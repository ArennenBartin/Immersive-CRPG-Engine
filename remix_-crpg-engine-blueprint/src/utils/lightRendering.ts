import type { FogRenderState } from "./fogOfWar";

export interface AuthoritativeLightRenderMetrics {
  worldRadius: number;
  pointDistance: number;
  poolRadius: number;
  decay: number;
}

// Keep the visible light footprint on the same literal radius boundary used by
// perception. The renderer may soften the falloff inside that boundary, but it
// must not silently shrink or inflate authored illumination distance.
export const resolveAuthoritativeLightRenderMetrics = (
  radius: number,
  cellWorldSize: number,
): AuthoritativeLightRenderMetrics => {
  const worldRadius = Math.max(0.5, Math.max(0, radius) * cellWorldSize);
  return {
    worldRadius,
    pointDistance: worldRadius,
    poolRadius: worldRadius,
    decay: 1,
  };
};

// Billboard sprites do not receive Three point lights. Shade the entire actor
// from the authoritative light value at its feet so screen-space fog cannot
// darken only the portion that happens to overlap another cell. A small floor
// preserves the player's silhouette in true darkness; the tactical ring stays
// independently visible.
export const resolveActorSpriteBrightness = (illumination: number): number => {
  const light = Math.max(0, Math.min(1, illumination));
  return 0.3 + 0.7 * Math.sqrt(light);
};

export type StructureIlluminationCell = readonly [number, number];

const clampIllumination = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// Rendering keeps the mechanical illumination field intact, but presents its
// outer values much more aggressively. A linear wash leaves distant cells
// readable even when Senses considers them barely illuminated; this squared
// smoothstep lets a strong source stay bright while its tail dissolves into
// the black fog field instead of ending as a broad, flat amber floor.
export const AUTHORITATIVE_GROUND_LIGHT_VISUAL_FLOOR = 0.06;

export const resolveAuthoritativeGroundLightPresentationStrength = (
  illumination: number,
): number => {
  const light = clampIllumination(illumination);
  const normalized = Math.max(
    0,
    Math.min(
      1,
      (light - AUTHORITATIVE_GROUND_LIGHT_VISUAL_FLOOR) /
        (1 - AUTHORITATIVE_GROUND_LIGHT_VISUAL_FLOOR),
    ),
  );
  const smooth = normalized * normalized * (3 - 2 * normalized);
  return smooth * smooth;
};

// Mechanical visibility begins at a deliberately sensitive light threshold,
// while the dramatic presentation curve above intentionally compresses that
// weakest tail to almost nothing. Keep those barely-lit cells on the indigo
// memory backdrop until the rendered light has enough energy to reveal the
// authored present. This is presentation-only and never changes Senses, AI,
// stealth, discovery, or the authoritative terrain_visible collection.
export const AUTHORITATIVE_PRESENT_LIGHT_STRENGTH_MIN = 0.04;

export const hasAuthoritativePresentLight = (illumination: number): boolean =>
  resolveAuthoritativeGroundLightPresentationStrength(illumination) >=
  AUTHORITATIVE_PRESENT_LIGHT_STRENGTH_MIN;

// A macro structure is one visual mesh backed by several authoritative fine
// cells. Sample its complete footprint and retain the strongest light that can
// reach any exposed edge. This prevents the mesh from appearing black merely
// because its center (or another occluded fine cell) receives no light.
// Ambient remains the fallback for missing samples and empty footprints.
export const resolveStructureFootprintIllumination = (
  footprint: readonly StructureIlluminationCell[],
  illuminationAtCell: (
    cell: StructureIlluminationCell,
  ) => number | undefined,
  ambientLight: number,
): number => {
  const ambient = clampIllumination(ambientLight);
  let strongest = ambient;

  footprint.forEach((cell) => {
    const sample = illuminationAtCell(cell);
    strongest = Math.max(
      strongest,
      sample === undefined || !Number.isFinite(sample)
        ? ambient
        : clampIllumination(sample),
    );
  });

  return strongest;
};

export const STRUCTURE_EMISSIVE_FILL_MIN = 0.06;
export const STRUCTURE_EMISSIVE_FILL_MAX = 0.38;

export const STATIC_FOG_BRIGHTNESS: Record<FogRenderState, number> = {
  visible: 1,
  explored: 0.12,
  unseen: 0,
};

// Dark enough to read as absence of light, saturated enough that remembered
// architecture cannot be mistaken for the navy/black authored world beneath
// it after the final screen grade.
export const MEMORY_FOG_COLOR = "#2d2055";
export const MEMORY_FOG_MID_COLOR = "#351026";
export const MEMORY_FOG_FAR_COLOR = "#090106";
export const MEMORY_FOG_NEAR_DISTANCE = 1;
export const MEMORY_FOG_FAR_DISTANCE = 9;
export const MEMORY_FOG_DISTANCE_BANDS = 24;
export const UNKNOWN_FOG_COLOR = "#000000";

// Remembered architecture is presentation, not present-tense perception. It
// begins as indigo around the player, passes through a dark black-pink, then
// settles into near-black at the edge of the remembered view. A small fixed
// number of bands keeps asset-backed memory materials reusable while reading
// as a continuous fade at world scale.
export const resolveMemoryFogDistanceFactor = (distance: number): number => {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  return Math.max(
    0,
    Math.min(
      1,
      (safeDistance - MEMORY_FOG_NEAR_DISTANCE) /
        (MEMORY_FOG_FAR_DISTANCE - MEMORY_FOG_NEAR_DISTANCE),
    ),
  );
};

const parseHexColor = (color: string): [number, number, number] => {
  const hex = color.replace("#", "");
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

const mixHexColor = (from: string, to: string, amount: number): string => {
  const start = parseHexColor(from);
  const end = parseHexColor(to);
  const channel = (index: number) =>
    Math.round(start[index] + (end[index] - start[index]) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
};

export const resolveMemoryFogColor = (distance: number): string => {
  const linear = resolveMemoryFogDistanceFactor(distance);
  if (linear <= 0) return MEMORY_FOG_COLOR;
  if (linear >= 1) return MEMORY_FOG_FAR_COLOR;

  const smooth = linear * linear * (3 - 2 * linear);
  const banded =
    Math.round(smooth * MEMORY_FOG_DISTANCE_BANDS) /
    MEMORY_FOG_DISTANCE_BANDS;
  return banded <= 0.5
    ? mixHexColor(MEMORY_FOG_COLOR, MEMORY_FOG_MID_COLOR, banded * 2)
    : mixHexColor(
        MEMORY_FOG_MID_COLOR,
        MEMORY_FOG_FAR_COLOR,
        (banded - 0.5) * 2,
      );
};

export interface StaticFogMaterialPolicy {
  brightness: number;
  preserveEmission: boolean;
  flatUnlit: boolean;
  forceOpaque: boolean;
  preserveTextureMaps: boolean;
  tint?: string;
  tintStrength: number;
}

// Fog never deletes static geometry. Instead, one shared visual state controls
// its material: visible geometry keeps authored color/light, explored geometry
// becomes a near-black memory silhouette, and unseen geometry becomes black.
// Emission is suppressed outside current visibility so hidden lamps and
// emissive assets cannot glow through the shroud.
export const resolveStaticFogMaterialPolicy = (
  state: FogRenderState,
): StaticFogMaterialPolicy => {
  if (state === "visible") {
    return {
      brightness: STATIC_FOG_BRIGHTNESS.visible,
      preserveEmission: true,
      flatUnlit: false,
      forceOpaque: false,
      preserveTextureMaps: true,
      tintStrength: 0,
    };
  }
  return {
    brightness: STATIC_FOG_BRIGHTNESS[state],
    preserveEmission: false,
    flatUnlit: true,
    forceOpaque: true,
    preserveTextureMaps: false,
    tint: state === "explored" ? MEMORY_FOG_COLOR : UNKNOWN_FOG_COLOR,
    tintStrength: state === "explored" ? 0.92 : 1,
  };
};

// Structure materials still receive authored point lights. This small
// albedo-colored emissive contribution only keeps mechanically illuminated
// faces readable when their Three.js normals face away from the point light.
// True darkness intentionally receives no fill at all.
export const resolveStructureEmissiveFillStrength = (
  illumination: number,
): number => {
  const light = clampIllumination(illumination);
  if (light === 0) return 0;
  return (
    STRUCTURE_EMISSIVE_FILL_MIN +
    (STRUCTURE_EMISSIVE_FILL_MAX - STRUCTURE_EMISSIVE_FILL_MIN) *
      Math.sqrt(light)
  );
};
