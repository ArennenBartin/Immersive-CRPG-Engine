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
