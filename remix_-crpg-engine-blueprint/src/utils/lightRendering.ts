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
    // The contact pool is only a source-local glow now. Scene illumination is
    // carried by the physical point light, not a full-radius yellow decal.
    poolRadius: Math.min(1.1, Math.max(0.28, worldRadius * 0.22)),
    decay: 2,
  };
};

// Three's physically decaying point lights need enough energy to shape walls,
// props, floors, and model-backed actors. Authoritative intensity still owns
// the relative brightness, while this renderer-only conversion gives it a
// useful cinematic range without changing Senses or stealth.
export const resolveAuthoritativePointLightIntensity = (
  intensity: number,
): number => {
  const normalized = Math.max(
    0,
    Math.min(1, Number.isFinite(intensity) ? intensity : 0),
  );
  return normalized <= 0 ? 0 : 0.45 + 6.55 * Math.pow(normalized, 0.82);
};

export const PLAYER_CARRIED_LIGHT_FORWARD_OFFSET = 0.34;
export const PLAYER_CARRIED_LIGHT_RIGHT_OFFSET = 0.36;
export const PLAYER_CARRIED_LIGHT_HEIGHT = 1.12;

// The carried source sits just beyond Steve's right hand instead of sharing
// his collision center. This pure transform is sampled from the continuously
// rendered player pose, so grid-cell updates cannot make the light jump.
export const resolvePlayerCarriedLightWorldPosition = (
  origin: readonly [number, number, number],
  yaw: number,
): [number, number, number] => {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  return [
    origin[0] +
      forwardX * PLAYER_CARRIED_LIGHT_FORWARD_OFFSET +
      rightX * PLAYER_CARRIED_LIGHT_RIGHT_OFFSET,
    origin[1] + PLAYER_CARRIED_LIGHT_HEIGHT,
    origin[2] +
      forwardZ * PLAYER_CARRIED_LIGHT_FORWARD_OFFSET +
      rightZ * PLAYER_CARRIED_LIGHT_RIGHT_OFFSET,
  ];
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

// A QA ceiling panel represents an institutional room fixture, not a small
// prop bulb. Space them roughly one per 48 walkable cells and let neighboring
// pools overlap so a populated room reads as lit instead of as isolated spots.
export const PRESENTATION_ROOM_LIGHT_RADIUS = 9;
export const PRESENTATION_ROOM_POINT_LIGHT_INTENSITY = 6.4;
export const PRESENTATION_ROOM_LIGHT_FILL_RADIUS = 6.25;
export const PRESENTATION_ROOM_LIGHT_FILL_STRENGTH = 0.5;
export const PRESENTATION_ROOM_LIGHT_FORWARD_DISTANCE = 36;
// Mechanical ambience remains authored at 0.05. Play uses this restrained
// presentation-only floor so the surfaces between fluorescent pools retain
// texture instead of crushing to pure black.
export const BACKROOMS_LEVEL_ZERO_PLAY_AMBIENT_LIGHT = 0.09;
// Keep a fixture mounted until its physical point-light falloff has reached
// zero. The small release margin prevents boundary noise from mounting and
// unmounting a light on consecutive fine-grid steps.
export const PRESENTATION_ROOM_LIGHT_ACTIVATION_RADIUS =
  PRESENTATION_ROOM_LIGHT_RADIUS + 0.25;

export interface PresentationRoomLightCandidate {
  key: string;
  position: readonly [number, number, number];
}

export interface PresentationRoomLightSelectionOptions {
  forward?: readonly [number, number] | null;
  forwardDistance?: number;
  localReserve?: number;
}

// Presentation fixtures are chosen around the actively rendered actor rather
// than the coarse map-streaming chunk. Culling before the safety cap prevents
// distant fixtures from consuming slots that belong to lights above and around
// the player.
export const selectLocalPresentationRoomLights = <
  T extends PresentationRoomLightCandidate,
>(
  lights: readonly T[],
  origin: readonly [number, number] | null | undefined,
  maxLights: number,
  options: PresentationRoomLightSelectionOptions = {},
): T[] => {
  const limit = Math.max(0, Math.floor(maxLights));
  if (limit === 0) return [];
  if (!origin) {
    return [...lights]
      .sort((left, right) => left.key.localeCompare(right.key))
      .slice(0, limit);
  }

  const distanceFromOrigin = (light: T) =>
    Math.hypot(
      light.position[0] - origin[0],
      light.position[2] - origin[1],
    );
  const byDistance = (left: T, right: T) =>
    distanceFromOrigin(left) -
      distanceFromOrigin(right) ||
    left.key.localeCompare(right.key);
  const local = lights
    .filter(
      (light) =>
        distanceFromOrigin(light) <=
        PRESENTATION_ROOM_LIGHT_ACTIVATION_RADIUS,
    )
    .sort(byDistance);

  const forwardLength = options.forward
    ? Math.hypot(options.forward[0], options.forward[1])
    : 0;
  if (!options.forward || forwardLength <= 0.0001) {
    return local.slice(0, limit);
  }

  const fx = options.forward[0] / forwardLength;
  const fz = options.forward[1] / forwardLength;
  const forwardDistance = Math.max(
    PRESENTATION_ROOM_LIGHT_ACTIVATION_RADIUS,
    options.forwardDistance ?? PRESENTATION_ROOM_LIGHT_FORWARD_DISTANCE,
  );
  const directional = lights
    .filter((light) => {
      const dx = light.position[0] - origin[0];
      const dz = light.position[2] - origin[1];
      const longitudinal = dx * fx + dz * fz;
      const lateral = Math.abs(dx * -fz + dz * fx);
      return (
        longitudinal > 0 &&
        longitudinal <= forwardDistance &&
        lateral <=
          PRESENTATION_ROOM_LIGHT_ACTIVATION_RADIUS * 0.62 +
            longitudinal * 0.28
      );
    })
    .sort((left, right) => {
      const score = (light: T) => {
        const dx = light.position[0] - origin[0];
        const dz = light.position[2] - origin[1];
        const longitudinal = Math.max(0, dx * fx + dz * fz);
        const lateral = Math.abs(dx * -fz + dz * fx);
        return (
          distanceFromOrigin(light) -
          longitudinal * 0.45 +
          lateral * 0.75
        );
      };
      return score(left) - score(right) || left.key.localeCompare(right.key);
    });

  const reserveCount = Math.min(
    limit,
    Math.max(0, Math.floor(options.localReserve ?? 2)),
  );
  const selected = local.slice(0, reserveCount);
  const selectedKeys = new Set(selected.map((light) => light.key));
  for (const light of [...directional, ...local]) {
    if (selected.length >= limit) break;
    if (selectedKeys.has(light.key)) continue;
    selected.push(light);
    selectedKeys.add(light.key);
  }
  return selected;
};

// Permanent room fixtures are renderer-only so dozens of ceiling panels do
// not become AI stimuli or multiply full-map perception work. Standard 3D
// materials receive their nearby point lights directly; this cheap companion
// sample gives billboard actors the same local warm-light read.
export const resolvePresentationRoomLightContribution = (
  cell: readonly [number, number],
  sources: readonly (readonly [number, number])[],
): number =>
  sources.reduce((strongest, source) => {
    const distance = Math.hypot(cell[0] - source[0], cell[1] - source[1]);
    if (distance >= PRESENTATION_ROOM_LIGHT_FILL_RADIUS) return strongest;
    const normalized = 1 - distance / PRESENTATION_ROOM_LIGHT_FILL_RADIUS;
    return Math.max(
      strongest,
      PRESENTATION_ROOM_LIGHT_FILL_STRENGTH *
        Math.pow(normalized, 0.82),
    );
  }, 0);

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

export type FogPresentationVariant = "isometric" | "first_person";

export const FIRST_PERSON_UNSEEN_STRUCTURE_COLOR = "#0d1226";

export interface StaticFogMaterialPolicy {
  brightness: number;
  preserveEmission: boolean;
  flatUnlit: boolean;
  forceOpaque: boolean;
  preserveTextureMaps: boolean;
  tint?: string;
  tintStrength: number;
  /** Whether the flat memory/unseen material participates in scene fog. */
  sceneFog: boolean;
}

// Fog never deletes static geometry. Instead, one shared visual state controls
// its material: visible geometry keeps authored color/light, explored geometry
// becomes a near-black memory silhouette, and unseen geometry becomes black.
// Emission is suppressed outside current visibility so hidden lamps and
// emissive assets cannot glow through the shroud.
//
// First person is the exception to "unseen is black": at eye height a pure
// black silhouette right in front of the camera reads as a hole in the world,
// so the first_person variant lifts unseen to a deep haze and lets the flat
// materials pick up scene fog, dissolving unknown space into atmosphere while
// the authoritative visibility data stays untouched.
export const resolveStaticFogMaterialPolicy = (
  state: FogRenderState,
  variant: FogPresentationVariant = "isometric",
): StaticFogMaterialPolicy => {
  if (state === "visible") {
    return {
      brightness: STATIC_FOG_BRIGHTNESS.visible,
      preserveEmission: true,
      flatUnlit: false,
      forceOpaque: false,
      preserveTextureMaps: true,
      tintStrength: 0,
      sceneFog: true,
    };
  }
  const firstPerson = variant === "first_person";
  return {
    brightness: STATIC_FOG_BRIGHTNESS[state],
    preserveEmission: false,
    flatUnlit: true,
    forceOpaque: true,
    preserveTextureMaps: false,
    tint:
      state === "explored"
        ? MEMORY_FOG_COLOR
        : firstPerson
          ? FIRST_PERSON_UNSEEN_STRUCTURE_COLOR
          : UNKNOWN_FOG_COLOR,
    tintStrength: state === "explored" ? 0.92 : 1,
    sceneFog: firstPerson,
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
