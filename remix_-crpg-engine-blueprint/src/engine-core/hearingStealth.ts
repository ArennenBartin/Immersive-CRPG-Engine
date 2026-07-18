import type { GamePackage } from "../schema/game";
import type { PlaySave } from "../schema/save";

/**
 * Mechanical movement/hearing tuning. These values are simulation data and
 * deliberately do not depend on rendered audio volume.
 */
export interface MovementHearingSettings {
  normal_movement_loudness: number;
  stealth_noise_multiplier: number;
  stealth_speed_multiplier: number;
  running_noise_multiplier: number;
  sound_attenuation_per_cell: number;
  barrier_reduction: number;
  surface_noise_modifiers: Record<string, number>;
  party_stealth_rule: "collective";
}

export interface PlayerStealthState {
  active: boolean;
  changed_at_tick: number;
}

export const DEFAULT_MOVEMENT_HEARING_SETTINGS: MovementHearingSettings = {
  // Authored in macro cells. The v1 adapter scales this to the active grid.
  normal_movement_loudness: 2.4,
  stealth_noise_multiplier: 0.3,
  stealth_speed_multiplier: 0.55,
  running_noise_multiplier: 1.65,
  sound_attenuation_per_cell: 1,
  barrier_reduction: 0.28,
  surface_noise_modifiers: {
    default: 1,
    floor: 1,
    stone: 1,
    soil: 0.82,
    grass: 0.78,
    water: 1.3,
    metal: 1.4,
    glass: 1.55,
    debris: 1.35,
    soft: 0.72,
  },
  // A single explicit rule keeps companion behavior legible: when the player
  // enters the stance, following/controlled party members use it too.
  party_stealth_rule: "collective",
};

const finiteAtLeast = (value: unknown, fallback: number, minimum: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
};

const finiteMultiplier = (value: unknown, fallback: number) =>
  Math.max(0, Math.min(4, finiteAtLeast(value, fallback, 0)));

export const resolveMovementHearingSettings = (
  gamePackage: Pick<GamePackage, "settings">,
): MovementHearingSettings => {
  const authored = (gamePackage.settings?.movement_hearing || {}) as Record<
    string,
    unknown
  >;
  const authoredSurfaces =
    authored.surface_noise_modifiers &&
    typeof authored.surface_noise_modifiers === "object"
      ? (authored.surface_noise_modifiers as Record<string, unknown>)
      : {};
  const surfaceNoiseModifiers = {
    ...DEFAULT_MOVEMENT_HEARING_SETTINGS.surface_noise_modifiers,
    ...Object.fromEntries(
      Object.entries(authoredSurfaces).map(([key, value]) => [
        key.trim().toLowerCase(),
        finiteMultiplier(value, 1),
      ]),
    ),
  };

  return {
    normal_movement_loudness: finiteAtLeast(
      authored.normal_movement_loudness,
      DEFAULT_MOVEMENT_HEARING_SETTINGS.normal_movement_loudness,
      0.05,
    ),
    stealth_noise_multiplier: Math.max(
      0.05,
      finiteMultiplier(
        authored.stealth_noise_multiplier,
        DEFAULT_MOVEMENT_HEARING_SETTINGS.stealth_noise_multiplier,
      ),
    ),
    stealth_speed_multiplier: Math.max(
      0.1,
      Math.min(
        1,
        finiteAtLeast(
          authored.stealth_speed_multiplier,
          DEFAULT_MOVEMENT_HEARING_SETTINGS.stealth_speed_multiplier,
          0.1,
        ),
      ),
    ),
    running_noise_multiplier: finiteMultiplier(
      authored.running_noise_multiplier,
      DEFAULT_MOVEMENT_HEARING_SETTINGS.running_noise_multiplier,
    ),
    sound_attenuation_per_cell: finiteAtLeast(
      authored.sound_attenuation_per_cell,
      DEFAULT_MOVEMENT_HEARING_SETTINGS.sound_attenuation_per_cell,
      0.05,
    ),
    barrier_reduction: Math.max(
      0,
      Math.min(
        0.95,
        finiteAtLeast(
          authored.barrier_reduction,
          DEFAULT_MOVEMENT_HEARING_SETTINGS.barrier_reduction,
          0,
        ),
      ),
    ),
    surface_noise_modifiers: surfaceNoiseModifiers,
    party_stealth_rule: "collective",
  };
};

export const isPlayerStealthActive = (save: PlaySave | null | undefined) =>
  save?.player_stealth?.active === true;

export const isActorUsingStealthStance = (
  save: PlaySave,
  actorId: string,
) =>
  isPlayerStealthActive(save) &&
  (actorId === "player" || (save.party_members || []).includes(actorId));

export const setPlayerStealthActive = (
  save: PlaySave,
  active: boolean,
): PlaySave => ({
  ...save,
  player_stealth: {
    active,
    changed_at_tick: Math.max(0, Math.floor(save.clock_minutes || 0)),
  },
});

export const togglePlayerStealth = (save: PlaySave): PlaySave =>
  setPlayerStealthActive(save, !isPlayerStealthActive(save));

export const movementSurfaceNoiseMultiplier = (
  settings: MovementHearingSettings,
  surface: string | null | undefined,
) => {
  const key = String(surface || "default").trim().toLowerCase();
  return (
    settings.surface_noise_modifiers[key] ??
    settings.surface_noise_modifiers.default ??
    1
  );
};

export const movementNoiseLoudness = (
  gamePackage: Pick<GamePackage, "settings">,
  save: PlaySave,
  actorId: string,
  surface?: string,
) => {
  const settings = resolveMovementHearingSettings(gamePackage);
  const stanceMultiplier = isActorUsingStealthStance(save, actorId)
    ? settings.stealth_noise_multiplier
    : 1;
  return (
    settings.normal_movement_loudness *
    stanceMultiplier *
    movementSurfaceNoiseMultiplier(settings, surface)
  );
};

export type StealthBlockedAction =
  | "act"
  | "attack"
  | "skill"
  | "interact"
  | "talk"
  | "door"
  | "container"
  | "pickup"
  | "switch"
  | "throw"
  | "item"
  | "attend";

export const stealthBlockedActionMessage = (
  action: StealthBlockedAction = "act",
) => {
  if (action === "attack") return "Exit stealth mode before attacking.";
  if (action === "skill") return "Exit stealth mode before using a skill.";
  if (action === "talk") return "Exit stealth mode before speaking.";
  if (action === "throw") return "Exit stealth mode before throwing anything.";
  if (action === "pickup" || action === "item")
    return "Exit stealth mode before handling items.";
  return "Exit stealth mode to do that.";
};

export interface HearingStealthAuthoringIssue {
  severity: "error" | "warning" | "info";
  code: string;
  path: string;
  message: string;
}

/** Pure Studio/CLI validation for the data that z.record(settings) cannot. */
export const validateHearingStealthAuthoring = (
  gamePackage: Pick<GamePackage, "settings" | "entities">,
): HearingStealthAuthoringIssue[] => {
  const issues: HearingStealthAuthoringIssue[] = [];
  const raw = (gamePackage.settings?.movement_hearing || {}) as Record<
    string,
    unknown
  >;
  const requireRange = (
    key: string,
    minimum: number,
    maximum: number,
    message: string,
  ) => {
    if (raw[key] === undefined) return;
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      issues.push({
        severity: "error",
        code: `movement_hearing_${key}_invalid`,
        path: `$.settings.movement_hearing.${key}`,
        message,
      });
    }
  };
  requireRange(
    "normal_movement_loudness",
    0.05,
    12,
    "Normal movement loudness must be between 0.05 and 12 macro cells.",
  );
  requireRange(
    "stealth_noise_multiplier",
    0.05,
    1,
    "Stealth noise multiplier must be between 0.05 and 1; stealth may be quiet, never perfectly silent.",
  );
  requireRange(
    "stealth_speed_multiplier",
    0.1,
    1,
    "Stealth speed multiplier must be greater than 0 and no greater than 1.",
  );
  requireRange(
    "sound_attenuation_per_cell",
    0.05,
    12,
    "Sound attenuation must be a positive finite number.",
  );
  requireRange(
    "barrier_reduction",
    0,
    0.95,
    "Barrier reduction must be between 0 and 0.95.",
  );

  const surfaces = raw.surface_noise_modifiers;
  if (surfaces !== undefined && (!surfaces || typeof surfaces !== "object" || Array.isArray(surfaces))) {
    issues.push({
      severity: "error",
      code: "movement_hearing_surface_modifiers_invalid",
      path: "$.settings.movement_hearing.surface_noise_modifiers",
      message: "Surface noise modifiers must be a key/value object.",
    });
  } else if (surfaces) {
    Object.entries(surfaces as Record<string, unknown>).forEach(([surface, rawValue]) => {
      const value = Number(rawValue);
      if (!surface.trim() || !Number.isFinite(value) || value < 0 || value > 4) {
        issues.push({
          severity: "error",
          code: "movement_hearing_surface_modifier_invalid",
          path: `$.settings.movement_hearing.surface_noise_modifiers.${surface || "<empty>"}`,
          message: "Every surface modifier needs a name and a value between 0 and 4.",
        });
      }
    });
  }

  gamePackage.entities.forEach((entity, entityIndex) => {
    const profile = entity.sensory_profile;
    if (!profile) return;
    const ids = new Set<string>();
    profile.channels.forEach((channel, channelIndex) => {
      const path = `$.entities[${entityIndex}].sensory_profile.channels[${channelIndex}]`;
      if (ids.has(channel.id)) {
        issues.push({
          severity: "error",
          code: "sensory_channel_duplicate_id",
          path: `${path}.id`,
          message: `Sensory channel id “${channel.id}” is duplicated on ${entity.display_name}.`,
        });
      }
      ids.add(channel.id);
      const isSound = channel.stimulus_kinds.includes("sound");
      if (isSound && channel.tracks_live_target) {
        issues.push({
          severity: "error",
          code: "hearing_live_tracking_forbidden",
          path: `${path}.tracks_live_target`,
          message: "A hearing channel may remember a sound location but may not live-track its source.",
        });
      }
      if (isSound && channel.source_tracking !== "none") {
        issues.push({
          severity: "warning",
          code: "hearing_source_lock_ignored",
          path: `${path}.source_tracking`,
          message: "Sound identity locks are ignored; hearing supplies location evidence only.",
        });
      }
      const channelRecord = channel as typeof channel & {
        repeated_sound_gain?: number;
        positional_uncertainty?: number;
        stimulus_tag_multipliers?: Record<string, number>;
      };
      if (
        channelRecord.repeated_sound_gain !== undefined &&
        (!Number.isFinite(channelRecord.repeated_sound_gain) ||
          channelRecord.repeated_sound_gain < 0 ||
          channelRecord.repeated_sound_gain > 1)
      ) {
        issues.push({
          severity: "error",
          code: "hearing_repeat_gain_invalid",
          path: `${path}.repeated_sound_gain`,
          message: "Repeated-sound gain must be between 0 and 1.",
        });
      }
      if (
        channelRecord.positional_uncertainty !== undefined &&
        (!Number.isFinite(channelRecord.positional_uncertainty) ||
          channelRecord.positional_uncertainty < 0)
      ) {
        issues.push({
          severity: "error",
          code: "hearing_uncertainty_invalid",
          path: `${path}.positional_uncertainty`,
          message: "Hearing positional uncertainty cannot be negative.",
        });
      }
      Object.entries(channelRecord.stimulus_tag_multipliers || {}).forEach(
        ([tag, multiplier]) => {
          if (!tag.trim() || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 4) {
            issues.push({
              severity: "error",
              code: "hearing_tag_multiplier_invalid",
              path: `${path}.stimulus_tag_multipliers.${tag || "<empty>"}`,
              message: "Sound tag multipliers require a tag and a value between 0 and 4.",
            });
          }
        },
      );
    });
  });
  return issues;
};
