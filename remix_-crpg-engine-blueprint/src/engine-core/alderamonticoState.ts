import type { ActorPhysicalStateRecord, PlaySave } from "../schema/save";
import type { EntityPlacementData, GamePackage, MapData, WorldRegionData } from "../schema/game";
import { applyStatus } from "./statuses";
import { entityPlacementStateKey } from "../utils/entityState";

export type AlderamonticoEmotionalAxis =
  | "valence"
  | "arousal"
  | "grief"
  | "reverence"
  | "attachment";

export type AlderamonticoGridAxis = "grief" | "reverence" | "attachment";

export interface AlderamonticoEmotionalAxes {
  // 0 = anguish, 100 = joy.
  valence: number;
  // 0 = numb, 100 = frantic.
  arousal: number;
  // 0 = unburdened, 100 = crushed.
  grief: number;
  // 0 = defiant, 100 = reverent/transfixed.
  reverence: number;
  // 0 = severed, 100 = bound/enthralled.
  attachment: number;
}

export type AlderamonticoEmotionalImpulse = Partial<Record<AlderamonticoEmotionalAxis, number>>;

export interface AlderamonticoActorStateRecord {
  emotional_axes: AlderamonticoEmotionalAxes;
  // The actor's resting disposition (authored seed axes at first contact).
  // Emotional pushes decay back toward this, never toward a global default,
  // so an authored griever stays a griever once the panic passes.
  baseline_axes?: AlderamonticoEmotionalAxes;
  glass: number;
  grid_exposure_ticks: number;
  updated_at_tick: number;
  last_behavior?: AlderamonticoBehaviorMode;
  last_grid_exposure?: AlderamonticoGridExposureSummary;
  note?: string;
}

export type AlderamonticoActorStateUpdate =
  Omit<Partial<AlderamonticoActorStateRecord>, "emotional_axes" | "updated_at_tick" | "last_behavior"> & {
    emotional_axes?: AlderamonticoEmotionalImpulse;
  };

export interface AlderamonticoAttendRecord {
  attended_at_tick: number;
  attention: number;
  reliability: number;
}

export type AlderamonticoAttendTruth = "false" | "true" | "partial";

export interface AlderamonticoAttendFlagEffect {
  switch_id: string;
  switch_value?: boolean;
}

export interface AlderamonticoAttendReadingEffect {
  set_switch?: string;
  set_switch_value?: boolean;
  set_switches?: AlderamonticoAttendFlagEffect[];
  attention_delta?: number;
  // Pressure applied to the player by the reading itself.
  emotional_impulse?: AlderamonticoEmotionalImpulse;
  // Optional pressure/relief applied to the attended target.
  target_emotional_impulse?: AlderamonticoEmotionalImpulse;
  status_effect?: string;
  status_duration?: number;
  status_magnitude?: number;
}

export interface AlderamonticoAttendReading {
  id?: string;
  text: string;
  truth: AlderamonticoAttendTruth;
  requiresAttention?: number;
  effect?: AlderamonticoAttendReadingEffect;
}

export interface AlderamonticoAttendTimeout {
  reading_id?: string;
  status_effect?: string;
  status_duration?: number;
  status_magnitude?: number;
  attention_delta?: number;
}

export interface AlderamonticoAttendNode {
  id?: string;
  target: string;
  readings: AlderamonticoAttendReading[];
  composure?: number;
  glassPressure?: AlderamonticoEmotionalImpulse;
  onTimeout?: AlderamonticoAttendTimeout;
}

export interface AlderamonticoActiveAttendNodeRecord {
  node_id: string;
  target_actor_id: string;
  opened_at_tick: number;
  composure_remaining: number;
  attention_at_open: number;
  visible_reading_ids: string[];
}

export interface AlderamonticoSaveState {
  actors: Record<string, AlderamonticoActorStateRecord>;
  attended: Record<string, AlderamonticoAttendRecord>;
  attention: number;
  active_attend?: AlderamonticoActiveAttendNodeRecord;
  grid?: {
    amplification: number;
    lens_actor_id?: string;
    lens_multiplier?: number;
    region_id?: string;
    dominant_axis?: AlderamonticoGridAxis;
    last_actor_id?: string;
    amount?: number;
    fed?: number;
    fed_by_region?: Record<string, number>;
    updated_at_tick?: number;
  };
}

export interface AlderamonticoEmotionalRegions {
  valence: "anguish" | "low" | "content" | "elated";
  arousal: "numb" | "calm" | "alert" | "frantic";
  grief: "light" | "carrying" | "heavy" | "drowning";
  reverence: "defiant" | "restless" | "attending" | "devout" | "transfixed";
  attachment: "severed" | "detached" | "fond" | "devoted" | "enthralled";
}

export type AlderamonticoNamedEmotion =
  | "scared"
  | "grieving"
  | "manic"
  | "despairing"
  | "enthralled"
  | "paralyzed-reverent"
  | "fading";

export type AlderamonticoBehaviorMode =
  | "calm"
  | "flee"
  | "attack"
  | "defend_attachment"
  | "paralyzed"
  | "fade";

export interface AlderamonticoGridAmplificationResult {
  axes: AlderamonticoEmotionalAxes;
  dominant_axis: AlderamonticoGridAxis;
  amount: number;
}

export interface AlderamonticoGridExposureSummary {
  region_id: string;
  region_name?: string;
  dominant_axis: AlderamonticoGridAxis;
  amount: number;
  lens_actor_id?: string;
  lens_multiplier: number;
  updated_at_tick: number;
}

export interface AlderamonticoGridExposureResult extends AlderamonticoGridExposureSummary {
  actor_id: string;
  entity_id?: string;
  cell: [number, number];
}

export interface AlderamonticoConditionReadout {
  actor_id: string;
  physical_labels: string[];
  physical_summary: string;
  emotional_visible: "surface" | "attended";
  emotional_summary: string;
  emotional_regions?: AlderamonticoEmotionalRegions;
  emotional_axes?: AlderamonticoEmotionalAxes;
  named_emotions: AlderamonticoNamedEmotion[];
  behavior: AlderamonticoBehaviorMode;
  condition: string;
  reliability: number;
  glass: number;
  grid_pressure?: AlderamonticoGridExposureSummary;
}

export interface AlderamonticoAttendNodeResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  attention: number;
  attention_changed: number;
  visible_readings: AlderamonticoAttendReading[];
  active?: AlderamonticoActiveAttendNodeRecord;
  selected_reading?: AlderamonticoAttendReading;
  timed_out?: boolean;
  readout?: AlderamonticoConditionReadout;
}

export interface AlderamonticoAttendNodeDispatchOptions {
  action: "open" | "select" | "tick";
  targetActorId?: string;
  readingId?: string;
  readingIndex?: number;
  tick?: number;
  ticks?: number;
  attention?: number;
  seedAxes?: AlderamonticoEmotionalImpulse;
}

const AXIS_MIN = 0;
const AXIS_MAX = 100;
const DEFAULT_ATTENTION = 20;

const clampAxis = (value: number) =>
  Math.max(AXIS_MIN, Math.min(AXIS_MAX, Math.round(value * 10) / 10));

const cloneAxes = (axes: AlderamonticoEmotionalAxes): AlderamonticoEmotionalAxes => ({
  valence: clampAxis(axes.valence),
  arousal: clampAxis(axes.arousal),
  grief: clampAxis(axes.grief),
  reverence: clampAxis(axes.reverence),
  attachment: clampAxis(axes.attachment),
});

const reliabilityFromAttention = (attention: number, attended: boolean) =>
  clampAxis((attended ? 45 : 10) + attention * (attended ? 0.55 : 0.25));

const normalizeAttendAttentionRequirement = (requiresAttention = 0) =>
  clampAxis(requiresAttention <= 9 ? requiresAttention * 10 : requiresAttention);

const attendReadingId = (reading: AlderamonticoAttendReading, index: number) =>
  reading.id || `reading_${index}`;

const visibleAttendReadings = (
  readings: AlderamonticoAttendReading[],
  attention: number,
): AlderamonticoAttendReading[] =>
  readings.filter(
    (reading) =>
      normalizeAttendAttentionRequirement(reading.requiresAttention ?? 0) <= attention,
  );

export const alderamonticoAttendReadingId = attendReadingId;

export const getVisibleAlderamonticoAttendReadings = (
  node: AlderamonticoAttendNode,
  attention: number,
): AlderamonticoAttendReading[] => visibleAttendReadings(node.readings || [], clampAxis(attention));

const humanList = (items: string[]) => {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

export const defaultAlderamonticoEmotionalAxes = (
  overrides: AlderamonticoEmotionalImpulse = {},
): AlderamonticoEmotionalAxes =>
  cloneAxes({
    valence: 50,
    arousal: 30,
    grief: 10,
    reverence: 20,
    attachment: 35,
    ...overrides,
  });

export const defaultAlderamonticoSaveState = (): AlderamonticoSaveState => ({
  actors: {},
  attended: {},
  attention: DEFAULT_ATTENTION,
});

export const defaultAlderamonticoActorState = (
  tick = 0,
  axes: AlderamonticoEmotionalImpulse = {},
): AlderamonticoActorStateRecord => {
  const emotional_axes = defaultAlderamonticoEmotionalAxes(axes);
  const baseline_axes = cloneAxes(emotional_axes);
  return {
    emotional_axes,
    baseline_axes,
    glass: 0,
    grid_exposure_ticks: 0,
    updated_at_tick: tick,
    last_behavior: inferAlderamonticoBehavior(emotional_axes, { baselineAxes: baseline_axes }),
  };
};

const cloneActorStateRecord = (
  record: AlderamonticoActorStateRecord,
): AlderamonticoActorStateRecord => ({
  ...record,
  emotional_axes: cloneAxes(record.emotional_axes),
  baseline_axes: record.baseline_axes ? cloneAxes(record.baseline_axes) : undefined,
  last_grid_exposure: record.last_grid_exposure ? { ...record.last_grid_exposure } : undefined,
});

export const projectAlderamonticoActorEmotionalStates = (
  state?: AlderamonticoSaveState,
): Record<string, AlderamonticoActorStateRecord> => {
  const actors = state?.actors || {};
  return Object.fromEntries(
    Object.entries(actors).map(([actorId, record]) => [
      actorId,
      cloneActorStateRecord(record),
    ]),
  );
};

export const syncAlderamonticoActorEmotionalStates = (
  save: PlaySave,
): PlaySave => {
  const projected = projectAlderamonticoActorEmotionalStates(save.alderamontico_state);
  if (Object.keys(projected).length === 0) {
    if (!save.actor_emotional_states) return save;
    const { actor_emotional_states: _actorEmotionalStates, ...rest } = save;
    return rest;
  }
  return {
    ...save,
    actor_emotional_states: projected,
  };
};

export const deriveAlderamonticoEmotionalRegions = (
  axes: AlderamonticoEmotionalAxes,
): AlderamonticoEmotionalRegions => ({
  valence: axes.valence <= 20 ? "anguish" : axes.valence <= 45 ? "low" : axes.valence < 75 ? "content" : "elated",
  arousal: axes.arousal <= 20 ? "numb" : axes.arousal <= 45 ? "calm" : axes.arousal < 75 ? "alert" : "frantic",
  grief: axes.grief <= 20 ? "light" : axes.grief <= 55 ? "carrying" : axes.grief < 85 ? "heavy" : "drowning",
  reverence:
    axes.reverence <= 20
      ? "defiant"
      : axes.reverence <= 45
        ? "restless"
        : axes.reverence < 70
          ? "attending"
          : axes.reverence < 90
            ? "devout"
            : "transfixed",
  attachment:
    axes.attachment <= 10
      ? "severed"
      : axes.attachment <= 35
        ? "detached"
        : axes.attachment < 70
          ? "fond"
          : axes.attachment < 90
            ? "devoted"
            : "enthralled",
});

export const deriveAlderamonticoNamedEmotions = (
  axes: AlderamonticoEmotionalAxes,
): AlderamonticoNamedEmotion[] => {
  const out: AlderamonticoNamedEmotion[] = [];
  if (axes.arousal >= 70 && axes.valence <= 40) out.push("scared");
  if (axes.grief >= 70 && axes.valence <= 45 && axes.arousal <= 50) out.push("grieving");
  if (axes.arousal >= 75 && axes.valence >= 70) out.push("manic");
  if (axes.valence <= 25 && axes.arousal <= 25 && axes.grief >= 70) out.push("despairing");
  if (axes.attachment >= 90 && axes.arousal <= 50) out.push("enthralled");
  if (axes.reverence >= 90 && axes.arousal <= 30) out.push("paralyzed-reverent");
  if (axes.attachment <= 10 && axes.valence <= 30 && axes.arousal <= 30 && axes.grief <= 35) out.push("fading");
  return out;
};

export const inferAlderamonticoBehavior = (
  axes: AlderamonticoEmotionalAxes,
  options: { baselineAxes?: AlderamonticoEmotionalAxes } = {},
): AlderamonticoBehaviorMode => {
  const named = deriveAlderamonticoNamedEmotions(axes);
  if (named.includes("paralyzed-reverent") || axes.grief >= 85) return "paralyzed";
  if (named.includes("fading")) return "fade";
  const baselineAttachment = (options.baselineAxes || axes).attachment;
  if (axes.attachment >= 90 && axes.arousal <= 60 && baselineAttachment >= 70) return "defend_attachment";
  if (axes.arousal >= 85 && axes.valence <= 30 && axes.grief < 70) return "flee";
  if (axes.arousal >= 70 && axes.valence <= 35) return "attack";
  return "calm";
};

export const applyAlderamonticoEmotionalImpulse = (
  axes: AlderamonticoEmotionalAxes,
  impulse: AlderamonticoEmotionalImpulse,
): AlderamonticoEmotionalAxes =>
  cloneAxes({
    valence: axes.valence + (impulse.valence || 0),
    arousal: axes.arousal + (impulse.arousal || 0),
    grief: axes.grief + (impulse.grief || 0),
    reverence: axes.reverence + (impulse.reverence || 0),
    attachment: axes.attachment + (impulse.attachment || 0),
  });

export const emotionalImpulseFromPhysicalState = (
  physical?: ActorPhysicalStateRecord,
): AlderamonticoEmotionalImpulse => {
  if (!physical) return {};
  const impulse: AlderamonticoEmotionalImpulse = {};
  if (physical.heat >= 0.3) {
    impulse.arousal = (impulse.arousal || 0) + 16 * physical.heat;
    impulse.valence = (impulse.valence || 0) - 13 * physical.heat;
  }
  if (physical.chill >= 0.3) {
    impulse.arousal = (impulse.arousal || 0) - 9 * physical.chill;
    impulse.valence = (impulse.valence || 0) - 8 * physical.chill;
  }
  if (physical.toxicity >= 0.35) {
    impulse.arousal = (impulse.arousal || 0) + 7 * physical.toxicity;
    impulse.valence = (impulse.valence || 0) - 12 * physical.toxicity;
    impulse.grief = (impulse.grief || 0) + 4 * physical.toxicity;
  }
  if (physical.charge >= 0.4) {
    impulse.arousal = (impulse.arousal || 0) + 12 * physical.charge;
    impulse.valence = (impulse.valence || 0) - 5 * physical.charge;
  }
  if (physical.wetness >= 0.55 && physical.heat < 0.3 && physical.chill < 0.3) {
    impulse.arousal = (impulse.arousal || 0) - 2;
  }
  return impulse;
};

export const dominantAlderamonticoGridAxis = (
  axes: AlderamonticoEmotionalAxes,
): AlderamonticoGridAxis => {
  const candidates: [AlderamonticoGridAxis, number][] = [
    ["grief", axes.grief],
    ["reverence", axes.reverence],
    ["attachment", axes.attachment],
  ];
  candidates.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return candidates[0][0];
};

export const applyAlderamonticoGridAmplification = (
  axes: AlderamonticoEmotionalAxes,
  options: { magnitude?: number; lensMultiplier?: number } = {},
): AlderamonticoGridAmplificationResult => {
  const dominant_axis = dominantAlderamonticoGridAxis(axes);
  const amount = clampAxis((options.magnitude ?? 4) * (options.lensMultiplier ?? 1));
  return {
    axes: applyAlderamonticoEmotionalImpulse(axes, { [dominant_axis]: amount }),
    dominant_axis,
    amount,
  };
};

export const advanceAlderamonticoGlass = (
  record: AlderamonticoActorStateRecord,
  options: { ticks?: number; rate?: number } = {},
): AlderamonticoActorStateRecord => {
  const ticks = Math.max(0, options.ticks ?? 1);
  const rate = options.rate ?? 0.75;
  const axes = record.emotional_axes;
  const extreme = Math.max(
    axes.grief,
    axes.reverence,
    axes.attachment,
    100 - axes.valence,
    axes.arousal,
  );
  if (extreme < 90 || ticks === 0) {
    return {
      ...record,
      grid_exposure_ticks: Math.max(0, record.grid_exposure_ticks - ticks),
    };
  }
  const grid_exposure_ticks = record.grid_exposure_ticks + ticks;
  const glassGain = ((extreme - 85) / 15) * rate * ticks;
  return {
    ...record,
    grid_exposure_ticks,
    glass: clampAxis(record.glass + glassGain),
  };
};

const writeAlderamonticoActorRecord = (
  save: PlaySave,
  actorId: string,
  record: AlderamonticoActorStateRecord,
): PlaySave => {
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const nextState: AlderamonticoSaveState = {
    ...state,
    actors: {
      ...(state.actors || {}),
      [actorId]: cloneActorStateRecord(record),
    },
    attended: { ...(state.attended || {}) },
  };
  return {
    ...save,
    alderamontico_state: nextState,
    actor_emotional_states: projectAlderamonticoActorEmotionalStates(nextState),
  };
};

const writeAlderamonticoState = (
  save: PlaySave,
  state: AlderamonticoSaveState,
): PlaySave => ({
  ...save,
  alderamontico_state: state,
  actor_emotional_states: projectAlderamonticoActorEmotionalStates(state),
});

const markAlderamonticoAttended = (
  save: PlaySave,
  actorId: string,
  attention: number,
  tick: number,
  activeAttend?: AlderamonticoActiveAttendNodeRecord,
): PlaySave => {
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const nextState: AlderamonticoSaveState = {
    ...state,
    actors: { ...(state.actors || {}) },
    attended: {
      ...(state.attended || {}),
      [actorId]: {
        attended_at_tick: tick,
        attention,
        reliability: reliabilityFromAttention(attention, true),
      },
    },
    attention,
    active_attend: activeAttend,
  };
  return writeAlderamonticoState(save, nextState);
};

const adjustAlderamonticoAttention = (
  save: PlaySave,
  delta: number,
  options: { actorId?: string; tick?: number } = {},
): PlaySave => {
  if (!delta) return save;
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const attention = clampAxis((state.attention ?? DEFAULT_ATTENTION) + delta);
  if (options.actorId) {
    return markAlderamonticoAttended(
      save,
      options.actorId,
      attention,
      options.tick ?? save.clock_minutes ?? 0,
      state.active_attend,
    );
  }
  return writeAlderamonticoState(save, {
    ...state,
    actors: { ...(state.actors || {}) },
    attended: { ...(state.attended || {}) },
    attention,
  });
};

const applyAlderamonticoPlayerStatus = (
  save: PlaySave,
  statusId: string | undefined,
  options: { duration?: number; magnitude?: number } = {},
): PlaySave => {
  if (!statusId) return save;
  return {
    ...save,
    actor_statuses: {
      ...(save.actor_statuses || {}),
      player: applyStatus(save.actor_statuses?.player, statusId, {
        duration: options.duration,
        magnitude: options.magnitude,
      }),
    },
  };
};

const applyAlderamonticoAttendReadingEffect = (
  save: PlaySave,
  targetActorId: string,
  effect: AlderamonticoAttendReadingEffect | undefined,
  tick: number,
): PlaySave => {
  if (!effect) return save;
  let nextSave = save;
  const flagUpdates: AlderamonticoAttendFlagEffect[] = [];
  if (effect.set_switch) {
    flagUpdates.push({
      switch_id: effect.set_switch,
      switch_value: effect.set_switch_value ?? true,
    });
  }
  flagUpdates.push(...(effect.set_switches || []));
  if (flagUpdates.length) {
    nextSave = {
      ...nextSave,
      flags: {
        ...(nextSave.flags || {}),
        ...Object.fromEntries(
          flagUpdates.map((flag) => [
            flag.switch_id,
            flag.switch_value ?? true,
          ]),
        ),
      },
    };
  }
  if (effect.status_effect) {
    nextSave = applyAlderamonticoPlayerStatus(nextSave, effect.status_effect, {
      duration: effect.status_duration,
      magnitude: effect.status_magnitude,
    });
  }
  if (effect.attention_delta) {
    nextSave = adjustAlderamonticoAttention(nextSave, effect.attention_delta, {
      actorId: targetActorId,
      tick,
    });
  }
  if (alderamonticoImpulseHasEffect(effect.emotional_impulse)) {
    nextSave = applyAlderamonticoImpulseToSave(nextSave, "player", effect.emotional_impulse!, {
      tick,
    });
  }
  if (alderamonticoImpulseHasEffect(effect.target_emotional_impulse)) {
    nextSave = applyAlderamonticoImpulseToSave(
      nextSave,
      targetActorId,
      effect.target_emotional_impulse!,
      { tick },
    );
  }
  return nextSave;
};

export const upsertAlderamonticoActorState = (
  save: PlaySave,
  actorId: string,
  updates: AlderamonticoActorStateUpdate,
  tick = save.clock_minutes ?? 0,
): PlaySave => {
  const existing =
    save.alderamontico_state?.actors?.[actorId] ||
    defaultAlderamonticoActorState(tick);
  const emotional_axes = updates.emotional_axes
    ? applyAlderamonticoEmotionalImpulse(existing.emotional_axes, updates.emotional_axes)
    : existing.emotional_axes;
  const next: AlderamonticoActorStateRecord = {
    ...existing,
    ...updates,
    emotional_axes,
    updated_at_tick: tick,
    last_behavior: inferAlderamonticoBehavior(emotional_axes, {
      baselineAxes: updates.baseline_axes || existing.baseline_axes || defaultAlderamonticoEmotionalAxes(),
    }),
  };
  return writeAlderamonticoActorRecord(save, actorId, next);
};

const EMOTIONAL_AXIS_KEYS: AlderamonticoEmotionalAxis[] = [
  "valence",
  "arousal",
  "grief",
  "reverence",
  "attachment",
];

// True when an impulse actually moves at least one axis, so callers can skip
// writing/logging no-op verbs.
export const alderamonticoImpulseHasEffect = (
  impulse?: AlderamonticoEmotionalImpulse | null,
): boolean =>
  Boolean(impulse) &&
  EMOTIONAL_AXIS_KEYS.some(
    (axis) => typeof impulse![axis] === "number" && impulse![axis] !== 0,
  );

// Create the actor's emotional record if it does not exist yet, seeding it from
// authored entity axes (falling back to engine defaults for unset axes). This
// is how authored `entity.emotional_axes` reach the runtime the first time the
// Grid, a verb, Attend, or the AI touches an actor.
export const ensureAlderamonticoActorState = (
  save: PlaySave,
  actorId: string,
  options: { tick?: number; seedAxes?: AlderamonticoEmotionalImpulse } = {},
): PlaySave => {
  if (save.alderamontico_state?.actors?.[actorId]) return save;
  const tick = options.tick ?? save.clock_minutes ?? 0;
  return writeAlderamonticoActorRecord(
    save,
    actorId,
    defaultAlderamonticoActorState(tick, options.seedAxes || {}),
  );
};

// The actor's live emotional axes if it has a record, otherwise the authored
// seed axes (merged over defaults). Never mutates the save.
export const resolveAlderamonticoActorAxes = (
  save: PlaySave,
  actorId: string,
  seedAxes: AlderamonticoEmotionalImpulse = {},
): AlderamonticoEmotionalAxes => {
  const stored = save.alderamontico_state?.actors?.[actorId]?.emotional_axes;
  return stored ? cloneAxes(stored) : defaultAlderamonticoEmotionalAxes(seedAxes);
};

// Behavior mode for an actor, reading its live axes (or authored seed axes when
// it has no record yet). This is the read AI/combat consult instead of scripts.
export const resolveAlderamonticoBehavior = (
  save: PlaySave,
  actorId: string,
  seedAxes: AlderamonticoEmotionalImpulse = {},
): AlderamonticoBehaviorMode => {
  const record = save.alderamontico_state?.actors?.[actorId];
  if (record) {
    return inferAlderamonticoBehavior(record.emotional_axes, {
      baselineAxes: record.baseline_axes || defaultAlderamonticoEmotionalAxes(),
    });
  }
  const axes = defaultAlderamonticoEmotionalAxes(seedAxes);
  return inferAlderamonticoBehavior(axes, { baselineAxes: axes });
};

// Push a verb/skill's emotional impulse onto a target, seeding the target's
// record from its authored axes first. Verbs are operators on axes: this is the
// emotional-layer counterpart to `applyChemistryVerbToSave`.
export const applyAlderamonticoImpulseToSave = (
  save: PlaySave,
  actorId: string,
  impulse: AlderamonticoEmotionalImpulse,
  options: { tick?: number; seedAxes?: AlderamonticoEmotionalImpulse } = {},
): PlaySave => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const seeded = ensureAlderamonticoActorState(save, actorId, {
    tick,
    seedAxes: options.seedAxes,
  });
  return upsertAlderamonticoActorState(seeded, actorId, { emotional_axes: impulse }, tick);
};

// ── Emotional decay ──────────────────────────────────────────────────────────
// Contract §4A: "remove the physical cause and the emotional effect decays."
// Axes relax toward the actor's baseline disposition a little each tick, so a
// scare wears off, a consoled griever stays lifted only as far as their nature
// allows, and Grid amplification (which pushes every step) still outpaces the
// decay while an actor stands inside a region.

export const relaxAlderamonticoEmotionalAxes = (
  axes: AlderamonticoEmotionalAxes,
  baseline: AlderamonticoEmotionalAxes,
  rate = 1.2,
): AlderamonticoEmotionalAxes => {
  const step = (value: number, target: number) => {
    const delta = target - value;
    if (Math.abs(delta) <= rate) return target;
    return value + Math.sign(delta) * rate;
  };
  return cloneAxes({
    valence: step(axes.valence, baseline.valence),
    arousal: step(axes.arousal, baseline.arousal),
    grief: step(axes.grief, baseline.grief),
    reverence: step(axes.reverence, baseline.reverence),
    attachment: step(axes.attachment, baseline.attachment),
  });
};

const axesEqual = (a: AlderamonticoEmotionalAxes, b: AlderamonticoEmotionalAxes) =>
  EMOTIONAL_AXIS_KEYS.every((axis) => a[axis] === b[axis]);

// Relax every recorded actor toward its baseline. Returns the same save
// reference when nothing moved, so callers can commit conditionally.
export const advanceAlderamonticoEmotionalDecayForSave = (
  save: PlaySave,
  options: { ticks?: number; tick?: number; rate?: number } = {},
): { save: PlaySave; changed_actor_ids: string[] } => {
  const actors = save.alderamontico_state?.actors;
  if (!actors || Object.keys(actors).length === 0) {
    return { save, changed_actor_ids: [] };
  }
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const ticks = Math.max(0, options.ticks ?? 1);
  const rate = (options.rate ?? 1.2) * ticks;
  if (rate <= 0) return { save, changed_actor_ids: [] };
  let nextSave = save;
  const changed_actor_ids: string[] = [];
  for (const [actorId, record] of Object.entries(actors)) {
    const baseline = record.baseline_axes || defaultAlderamonticoEmotionalAxes();
    const relaxed = relaxAlderamonticoEmotionalAxes(record.emotional_axes, baseline, rate);
    if (axesEqual(relaxed, record.emotional_axes)) continue;
    nextSave = writeAlderamonticoActorRecord(nextSave, actorId, {
      ...record,
      emotional_axes: relaxed,
      updated_at_tick: tick,
      last_behavior: inferAlderamonticoBehavior(relaxed, {
        baselineAxes: record.baseline_axes || defaultAlderamonticoEmotionalAxes(),
      }),
    });
    changed_actor_ids.push(actorId);
  }
  return { save: nextSave, changed_actor_ids };
};

// ── Emotional verbs ──────────────────────────────────────────────────────────
// Contract §5: a verb does not produce an outcome, it pushes axes by a
// magnitude and the outcome falls out of the target's thresholds. These are
// the built-in player-facing emotional operators; authored skills carry their
// own impulses through `SkillData.emotional_impulse`.

export type AlderamonticoEmotionalVerbKind = "yell" | "console";

export interface AlderamonticoEmotionalVerbDefinition {
  kind: AlderamonticoEmotionalVerbKind;
  label: string;
  description: string;
  // Manhattan range from the acting player.
  range: number;
  impulse: AlderamonticoEmotionalImpulse;
  // Binding extremes (grief/reverence/attachment ≥ 90) resist this verb: the
  // transfixed watcher cannot be startled awake. Console is the counter-tool
  // and is exempt — lowering grief is how paralysis is *supposed* to break.
  resisted_by_extremes: boolean;
  // Radius of the audible disturbance the verb makes (0 = quiet).
  sound_radius: number;
}

export const ALDERAMONTICO_EMOTIONAL_VERBS: AlderamonticoEmotionalVerbDefinition[] = [
  {
    kind: "yell",
    label: "Yell",
    description:
      "Startle a creature — arousal and fear spike; small or skittish things break and flee. Loud: nearby ears will turn.",
    range: 4,
    impulse: { arousal: 32, valence: -14, reverence: -6 },
    resisted_by_extremes: true,
    sound_radius: 6,
  },
  {
    kind: "console",
    label: "Console",
    description:
      "Sit with a grieving creature — grief eases, valence lifts, panic settles. The parish's weapon and its mercy.",
    range: 1,
    impulse: { grief: -24, valence: 14, arousal: -12, attachment: 3 },
    resisted_by_extremes: false,
    sound_radius: 0,
  },
];

export const getAlderamonticoEmotionalVerb = (
  kind: string,
): AlderamonticoEmotionalVerbDefinition | undefined =>
  ALDERAMONTICO_EMOTIONAL_VERBS.find((verb) => verb.kind === kind);

export const isAlderamonticoEmotionalVerb = (
  kind: string,
): kind is AlderamonticoEmotionalVerbKind => Boolean(getAlderamonticoEmotionalVerb(kind));

export interface AlderamonticoEmotionalVerbReadout {
  behavior: AlderamonticoBehaviorMode;
  named_emotions: AlderamonticoNamedEmotion[];
  summary: string;
}

export interface AlderamonticoEmotionalVerbResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  verb: AlderamonticoEmotionalVerbKind;
  actor_id: string;
  resisted: boolean;
  before: AlderamonticoEmotionalVerbReadout;
  after: AlderamonticoEmotionalVerbReadout;
  behavior_changed: boolean;
}

const emotionalVerbReadout = (
  axes: AlderamonticoEmotionalAxes,
  baselineAxes?: AlderamonticoEmotionalAxes,
): AlderamonticoEmotionalVerbReadout => ({
  behavior: inferAlderamonticoBehavior(axes, { baselineAxes }),
  named_emotions: deriveAlderamonticoNamedEmotions(axes),
  summary: attendedEmotionalSummary(axes),
});

// How strongly a binding extreme dampens an incoming push. Doc 05: "Same verb
// fails on a high-courage or reverence-maxed target, and that failure is
// legible and fair."
const bindingResistance = (axes: AlderamonticoEmotionalAxes): number => {
  const binding = Math.max(axes.grief, axes.reverence, axes.attachment);
  if (binding >= 90) return 0.15;
  if (binding >= 75) return 0.5;
  return 1;
};

export const applyAlderamonticoEmotionalVerbToSave = (
  save: PlaySave,
  options: {
    verb: AlderamonticoEmotionalVerbKind | string;
    actorId: string;
    seedAxes?: AlderamonticoEmotionalImpulse;
    tick?: number;
  },
): AlderamonticoEmotionalVerbResult => {
  const definition = getAlderamonticoEmotionalVerb(options.verb);
  const tick = options.tick ?? save.clock_minutes ?? 0;
  if (!definition) {
    const axes = resolveAlderamonticoActorAxes(save, options.actorId, options.seedAxes);
    const readout = emotionalVerbReadout(
      axes,
      save.alderamontico_state?.actors?.[options.actorId]?.baseline_axes || axes,
    );
    return {
      ok: false,
      reason: "not an emotional verb",
      save,
      verb: options.verb as AlderamonticoEmotionalVerbKind,
      actor_id: options.actorId,
      resisted: false,
      before: readout,
      after: readout,
      behavior_changed: false,
    };
  }
  const seeded = ensureAlderamonticoActorState(save, options.actorId, {
    tick,
    seedAxes: options.seedAxes,
  });
  const beforeAxes = resolveAlderamonticoActorAxes(seeded, options.actorId);
  const beforeBaseline = seeded.alderamontico_state?.actors?.[options.actorId]?.baseline_axes || beforeAxes;
  const resistance = definition.resisted_by_extremes ? bindingResistance(beforeAxes) : 1;
  const impulse: AlderamonticoEmotionalImpulse = {};
  for (const axis of EMOTIONAL_AXIS_KEYS) {
    const push = definition.impulse[axis];
    if (typeof push === "number" && push !== 0) impulse[axis] = push * resistance;
  }
  const next = upsertAlderamonticoActorState(seeded, options.actorId, { emotional_axes: impulse }, tick);
  const afterAxes = resolveAlderamonticoActorAxes(next, options.actorId);
  const afterBaseline = next.alderamontico_state?.actors?.[options.actorId]?.baseline_axes || beforeBaseline;
  const before = emotionalVerbReadout(beforeAxes, beforeBaseline);
  const after = emotionalVerbReadout(afterAxes, afterBaseline);
  return {
    ok: true,
    save: next,
    verb: definition.kind,
    actor_id: options.actorId,
    resisted: resistance < 1,
    before,
    after,
    behavior_changed: before.behavior !== after.behavior,
  };
};

export const advanceAlderamonticoActorFromPhysical = (
  save: PlaySave,
  actorId: string,
  options: { ticks?: number; tick?: number; applyGlass?: boolean } = {},
): PlaySave => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const existing =
    save.alderamontico_state?.actors?.[actorId] ||
    defaultAlderamonticoActorState(tick);
  const impulse = emotionalImpulseFromPhysicalState(save.actor_physical_states?.[actorId]);
  const emotional_axes = applyAlderamonticoEmotionalImpulse(existing.emotional_axes, impulse);
  const withImpulse: AlderamonticoActorStateRecord = {
    ...existing,
    emotional_axes,
    updated_at_tick: tick,
    last_behavior: inferAlderamonticoBehavior(emotional_axes, {
      baselineAxes: existing.baseline_axes || defaultAlderamonticoEmotionalAxes(),
    }),
  };
  const next = options.applyGlass === false
    ? withImpulse
    : advanceAlderamonticoGlass(withImpulse, { ticks: options.ticks ?? 1 });
  return writeAlderamonticoActorRecord(save, actorId, next);
};

export const applyAlderamonticoGridToActor = (
  save: PlaySave,
  actorId: string,
  options: {
    magnitude?: number;
    lensMultiplier?: number;
    tick?: number;
    ticks?: number;
    regionId?: string;
    regionName?: string;
    lensActorId?: string;
  } = {},
): { save: PlaySave; dominant_axis: AlderamonticoGridAxis; amount: number } => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const existing =
    save.alderamontico_state?.actors?.[actorId] ||
    defaultAlderamonticoActorState(tick);
  const amplified = applyAlderamonticoGridAmplification(existing.emotional_axes, options);
  const last_grid_exposure =
    options.regionId
      ? {
          region_id: options.regionId,
          region_name: options.regionName,
          dominant_axis: amplified.dominant_axis,
          amount: amplified.amount,
          lens_actor_id: options.lensActorId,
          lens_multiplier: options.lensMultiplier ?? 1,
          updated_at_tick: tick,
        }
      : existing.last_grid_exposure;
  const record = advanceAlderamonticoGlass(
    {
      ...existing,
      emotional_axes: amplified.axes,
      updated_at_tick: tick,
      last_behavior: inferAlderamonticoBehavior(amplified.axes, {
        baselineAxes: existing.baseline_axes || defaultAlderamonticoEmotionalAxes(),
      }),
      last_grid_exposure,
    },
    { ticks: options.ticks ?? 1 },
  );
  return {
    save: writeAlderamonticoActorRecord(save, actorId, record),
    dominant_axis: amplified.dominant_axis,
    amount: amplified.amount,
  };
};

type AlderamonticoRuntimeActor = {
  actor_id: string;
  entity_id?: string;
  cell: [number, number];
};

const manhattan = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const actorCell = (
  save: PlaySave,
  mapId: string,
  placement: EntityPlacementData,
  index: number,
  fallback: [number, number],
): [number, number] => {
  const key = entityPlacementStateKey(mapId, placement, index);
  const entityState =
    (save.entity_states || {})[key] ||
    (save.entity_states || {})[placement.entity_id] ||
    {};
  return [
    entityState.cell?.[0] ?? fallback[0],
    entityState.cell?.[1] ?? fallback[1],
  ];
};

const collectAlderamonticoRuntimeActors = (
  save: PlaySave,
  map: MapData,
): AlderamonticoRuntimeActor[] => {
  const actors: AlderamonticoRuntimeActor[] = [
    {
      actor_id: "player",
      entity_id: "player",
      cell: save.player.cell || [0, 0],
    },
  ];

  (map.entity_placements || []).forEach((placement, index) => {
    const actor_id = entityPlacementStateKey(map.id, placement, index);
    const entityState =
      (save.entity_states || {})[actor_id] ||
      (save.entity_states || {})[placement.entity_id] ||
      {};
    if (entityState.dead || entityState.hidden) return;
    actors.push({
      actor_id,
      entity_id: placement.entity_id,
      cell: actorCell(save, map.id, placement, index, [
        placement.cell[0] ?? 0,
        placement.cell[1] ?? 0,
      ]),
    });
  });

  return actors;
};

const regionIdForCell = (map: MapData, cell: [number, number]) =>
  map.cells.find((candidate) => candidate.x === cell[0] && candidate.z === cell[1])?.region_id ||
  map.cells.find((candidate) => candidate.x === cell[0] && candidate.z === cell[1])?.room_id ||
  "map";

const gridConfigForRegion = (region: WorldRegionData | undefined) =>
  region?.alderamontico_grid?.enabled ? region.alderamontico_grid : undefined;

const writeAlderamonticoGridSummary = (
  save: PlaySave,
  exposure: AlderamonticoGridExposureResult,
): PlaySave => {
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const previousGrid = state.grid;
  const previousFedByRegion = previousGrid?.fed_by_region || {};
  const fed = Math.round(((previousGrid?.fed || 0) + exposure.amount) * 10) / 10;
  const regionFed =
    Math.round(((previousFedByRegion[exposure.region_id] || 0) + exposure.amount) * 10) / 10;
  return {
    ...save,
    alderamontico_state: {
      ...state,
      actors: { ...(state.actors || {}) },
      attended: { ...(state.attended || {}) },
      grid: {
        ...(previousGrid || { amplification: 0 }),
        amplification: exposure.amount,
        lens_actor_id: exposure.lens_actor_id,
        lens_multiplier: exposure.lens_multiplier,
        region_id: exposure.region_id,
        dominant_axis: exposure.dominant_axis,
        last_actor_id: exposure.actor_id,
        amount: exposure.amount,
        fed,
        fed_by_region: {
          ...previousFedByRegion,
          [exposure.region_id]: regionFed,
        },
        updated_at_tick: exposure.updated_at_tick,
      },
    },
  };
};

// Authored starting emotional axes for an on-map entity, used to seed a
// runtime actor record the first time the Grid touches it.
export const entityEmotionalSeed = (
  gamePackage: GamePackage,
  entityId?: string,
): AlderamonticoEmotionalImpulse | undefined => {
  if (!entityId || entityId === "player") return undefined;
  return gamePackage.entities?.find((candidate) => candidate.id === entityId)?.emotional_axes;
};

export const zoneProfileEmotionalSeed = (
  gamePackage: GamePackage,
  entityId: string | undefined,
  region?: WorldRegionData,
): AlderamonticoEmotionalImpulse | undefined => {
  const entitySeed = entityEmotionalSeed(gamePackage, entityId);
  const offsets = region?.emotional_profile?.baseline_axis_offsets;
  if (!offsets || !alderamonticoImpulseHasEffect(offsets)) return entitySeed;
  const base = defaultAlderamonticoEmotionalAxes(entitySeed || {});
  return cloneAxes({
    valence: base.valence + (offsets.valence || 0),
    arousal: base.arousal + (offsets.arousal || 0),
    grief: base.grief + (offsets.grief || 0),
    reverence: base.reverence + (offsets.reverence || 0),
    attachment: base.attachment + (offsets.attachment || 0),
  });
};

export const advanceAlderamonticoGridRegionsForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id,
  options: { tick?: number; ticks?: number; magnitude?: number } = {},
): { save: PlaySave; exposures: AlderamonticoGridExposureResult[] } => {
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  if (!map) return { save, exposures: [] };

  const regions = new Map(
    (map.regions || [])
      .filter((region) => gridConfigForRegion(region))
      .map((region) => [region.id, region]),
  );
  if (regions.size === 0) return { save, exposures: [] };

  const actors = collectAlderamonticoRuntimeActors(save, map);
  const tick = options.tick ?? save.clock_minutes ?? 0;
  let nextSave = save;
  const exposures: AlderamonticoGridExposureResult[] = [];

  actors.forEach((actor) => {
    const regionId = regionIdForCell(map, actor.cell);
    const region = regions.get(regionId);
    const config = gridConfigForRegion(region);
    if (!region || !config) return;

    const lensActor = config.lens_entity_id
      ? actors.find((candidate) =>
          candidate.entity_id === config.lens_entity_id ||
          candidate.actor_id === config.lens_entity_id,
        )
      : undefined;
    const lensRadius = Math.max(0, config.lens_radius ?? 0);
    const lensActive =
      Boolean(lensActor && config.lens_entity_id) &&
      manhattan(actor.cell, lensActor!.cell) <= lensRadius;
    const lensMultiplier = lensActive ? Math.max(1, config.lens_multiplier ?? 1) : 1;
    const magnitude = Math.max(0, options.magnitude ?? config.magnitude ?? 2);
    if (magnitude <= 0) return;

    // Seed from authored entity axes so an authored griever/holdout enters the
    // Grid with the right dominant axis instead of the generic default.
    nextSave = ensureAlderamonticoActorState(nextSave, actor.actor_id, {
      tick,
      seedAxes: zoneProfileEmotionalSeed(gamePackage, actor.entity_id, region),
    });

    const result = applyAlderamonticoGridToActor(nextSave, actor.actor_id, {
      magnitude,
      lensMultiplier,
      tick,
      ticks: options.ticks ?? 1,
      regionId,
      regionName: region.display_name,
      lensActorId: lensActive ? lensActor?.actor_id : undefined,
    });
    nextSave = result.save;

    const exposure: AlderamonticoGridExposureResult = {
      actor_id: actor.actor_id,
      entity_id: actor.entity_id,
      cell: [...actor.cell],
      region_id: regionId,
      region_name: region.display_name,
      dominant_axis: result.dominant_axis,
      amount: result.amount,
      lens_actor_id: lensActive ? lensActor?.actor_id : undefined,
      lens_multiplier: lensMultiplier,
      updated_at_tick: tick,
    };
    exposures.push(exposure);
    nextSave = writeAlderamonticoGridSummary(nextSave, exposure);
  });

  return { save: nextSave, exposures };
};

export const attendAlderamonticoActor = (
  save: PlaySave,
  actorId: string,
  options: { attention?: number; tick?: number } = {},
): PlaySave => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const attention = clampAxis(options.attention ?? state.attention ?? DEFAULT_ATTENTION);
  const reliability = reliabilityFromAttention(attention, true);
  const actorRecord = state.actors?.[actorId] || defaultAlderamonticoActorState(tick);
  const nextState: AlderamonticoSaveState = {
    ...state,
    actors: {
      ...(state.actors || {}),
      [actorId]: cloneActorStateRecord(actorRecord),
    },
    attended: {
      ...(state.attended || {}),
      [actorId]: {
        attended_at_tick: tick,
        attention,
        reliability,
      },
    },
    attention,
  };
  return {
    ...save,
    alderamontico_state: nextState,
    actor_emotional_states: projectAlderamonticoActorEmotionalStates(nextState),
  };
};

const resolveAttendReading = (
  node: AlderamonticoAttendNode,
  options: { readingId?: string; readingIndex?: number },
): AlderamonticoAttendReading | undefined => {
  if (typeof options.readingIndex === "number") return node.readings[options.readingIndex];
  if (options.readingId) {
    return node.readings.find(
      (reading, index) => attendReadingId(reading, index) === options.readingId,
    );
  }
  return undefined;
};

export const openAlderamonticoAttendNode = (
  save: PlaySave,
  node: AlderamonticoAttendNode,
  options: {
    targetActorId?: string;
    tick?: number;
    attention?: number;
    seedAxes?: AlderamonticoEmotionalImpulse;
  } = {},
): AlderamonticoAttendNodeResult => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const targetActorId = options.targetActorId || node.target;
  if (!targetActorId) {
    return {
      ok: false,
      reason: "no attend target",
      save,
      attention: save.alderamontico_state?.attention ?? DEFAULT_ATTENTION,
      attention_changed: 0,
      visible_readings: [],
    };
  }
  if (!node.readings?.length) {
    return {
      ok: false,
      reason: "no attend readings",
      save,
      attention: save.alderamontico_state?.attention ?? DEFAULT_ATTENTION,
      attention_changed: 0,
      visible_readings: [],
    };
  }

  let nextSave = ensureAlderamonticoActorState(save, targetActorId, {
    tick,
    seedAxes: options.seedAxes,
  });
  const state = nextSave.alderamontico_state || defaultAlderamonticoSaveState();
  const baseAttention = clampAxis(options.attention ?? state.attention ?? DEFAULT_ATTENTION);
  const hasAnyAttend = Object.keys(state.attended || {}).length > 0;
  const hasTargetAttend = Boolean(state.attended?.[targetActorId]);
  const floorDelta = !hasAnyAttend || !hasTargetAttend ? 1 : 0;
  const attention = clampAxis(baseAttention + floorDelta);
  const visible_readings = visibleAttendReadings(node.readings, attention);
  const active: AlderamonticoActiveAttendNodeRecord = {
    node_id: node.id || `attend:${targetActorId}`,
    target_actor_id: targetActorId,
    opened_at_tick: tick,
    composure_remaining: Math.max(0, Math.floor(node.composure ?? 3)),
    attention_at_open: attention,
    visible_reading_ids: visible_readings.map((reading) =>
      attendReadingId(reading, node.readings.indexOf(reading)),
    ),
  };
  nextSave = markAlderamonticoAttended(nextSave, targetActorId, attention, tick, active);
  if (alderamonticoImpulseHasEffect(node.glassPressure)) {
    nextSave = applyAlderamonticoImpulseToSave(nextSave, "player", node.glassPressure!, {
      tick,
    });
  }
  return {
    ok: true,
    save: nextSave,
    attention,
    attention_changed: floorDelta,
    visible_readings,
    active,
    readout: buildAlderamonticoConditionReadout(nextSave, targetActorId, {
      attended: true,
      attention,
    }),
  };
};

export const selectAlderamonticoAttendReading = (
  save: PlaySave,
  node: AlderamonticoAttendNode,
  options: {
    targetActorId?: string;
    readingId?: string;
    readingIndex?: number;
    tick?: number;
    allowHidden?: boolean;
    timeoutEffect?: AlderamonticoAttendReadingEffect;
  } = {},
): AlderamonticoAttendNodeResult => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const targetActorId = options.targetActorId || state.active_attend?.target_actor_id || node.target;
  const attention = clampAxis(state.attention ?? DEFAULT_ATTENTION);
  const reading = resolveAttendReading(node, options);
  if (!targetActorId || !reading) {
    return {
      ok: false,
      reason: !targetActorId ? "no attend target" : "no attend reading",
      save,
      attention,
      attention_changed: 0,
      visible_readings: visibleAttendReadings(node.readings || [], attention),
    };
  }
  const visible_readings = visibleAttendReadings(node.readings || [], attention);
  const selectedId = attendReadingId(reading, node.readings.indexOf(reading));
  const isVisible = visible_readings.some(
    (visible, index) =>
      attendReadingId(visible, node.readings.indexOf(visible)) === selectedId ||
      visible === reading ||
      index === options.readingIndex,
  );
  if (!options.allowHidden && !isVisible) {
    return {
      ok: false,
      reason: "reading hidden",
      save,
      attention,
      attention_changed: 0,
      visible_readings,
    };
  }

  const truthAttentionDelta = reading.truth === "true" || reading.truth === "partial" ? 1 : 0;
  const combinedEffect: AlderamonticoAttendReadingEffect = {
    ...(reading.effect || {}),
    ...(options.timeoutEffect || {}),
    attention_delta:
      (reading.effect?.attention_delta || 0) +
      (options.timeoutEffect?.attention_delta || 0) +
      truthAttentionDelta,
  };
  let nextSave = markAlderamonticoAttended(save, targetActorId, attention, tick, undefined);
  nextSave = applyAlderamonticoAttendReadingEffect(
    nextSave,
    targetActorId,
    combinedEffect,
    tick,
  );
  const nextAttention = nextSave.alderamontico_state?.attention ?? attention;
  nextSave = markAlderamonticoAttended(nextSave, targetActorId, nextAttention, tick, undefined);

  return {
    ok: true,
    save: nextSave,
    attention: nextAttention,
    attention_changed: nextAttention - attention,
    visible_readings,
    selected_reading: reading,
    readout: buildAlderamonticoConditionReadout(nextSave, targetActorId, {
      attended: true,
      attention: nextAttention,
    }),
  };
};

export const advanceAlderamonticoAttendNode = (
  save: PlaySave,
  node: AlderamonticoAttendNode,
  options: { ticks?: number; tick?: number } = {},
): AlderamonticoAttendNodeResult => {
  const tick = options.tick ?? save.clock_minutes ?? 0;
  const ticks = Math.max(1, Math.floor(options.ticks ?? 1));
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const active = state.active_attend;
  const attention = clampAxis(state.attention ?? DEFAULT_ATTENTION);
  if (!active) {
    return {
      ok: false,
      reason: "no active attend node",
      save,
      attention,
      attention_changed: 0,
      visible_readings: visibleAttendReadings(node.readings || [], attention),
    };
  }
  const composure_remaining = active.composure_remaining - ticks;
  if (composure_remaining > 0) {
    const nextActive = { ...active, composure_remaining };
    const nextSave = writeAlderamonticoState(save, {
      ...state,
      active_attend: nextActive,
    });
    return {
      ok: true,
      save: nextSave,
      attention,
      attention_changed: 0,
      visible_readings: visibleAttendReadings(node.readings || [], attention),
      active: nextActive,
    };
  }

  const timeoutReading =
    (node.onTimeout?.reading_id
      ? node.readings.find(
          (reading, index) =>
            attendReadingId(reading, index) === node.onTimeout!.reading_id,
        )
      : undefined) ||
    node.readings.find((reading) => reading.truth === "false") ||
    node.readings[0];
  const timeoutReadingIndex = node.readings.indexOf(timeoutReading);
  const timeoutEffect: AlderamonticoAttendReadingEffect = {
    status_effect: node.onTimeout?.status_effect || "glass_residue",
    status_duration: node.onTimeout?.status_duration ?? 2,
    status_magnitude: node.onTimeout?.status_magnitude ?? 1,
    attention_delta: node.onTimeout?.attention_delta ?? 0,
  };
  const selected = selectAlderamonticoAttendReading(save, node, {
    targetActorId: active.target_actor_id,
    readingIndex: timeoutReadingIndex,
    tick,
    allowHidden: true,
    timeoutEffect,
  });
  return { ...selected, timed_out: selected.ok };
};

export const dispatchAlderamonticoAttendNode = (
  save: PlaySave,
  node: AlderamonticoAttendNode,
  options: AlderamonticoAttendNodeDispatchOptions,
): AlderamonticoAttendNodeResult => {
  if (options.action === "open") {
    return openAlderamonticoAttendNode(save, node, options);
  }
  if (options.action === "select") {
    return selectAlderamonticoAttendReading(save, node, options);
  }
  return advanceAlderamonticoAttendNode(save, node, options);
};

export const closeAlderamonticoAttendNode = (save: PlaySave): PlaySave => {
  const state = save.alderamontico_state;
  if (!state?.active_attend) return save;
  return writeAlderamonticoState(save, {
    ...state,
    active_attend: undefined,
  });
};

const physicalSummary = (physical?: ActorPhysicalStateRecord) => {
  const labels = physical?.labels || [];
  if (!labels.length) return "physically sound";
  return labels.map((label) => label.toLowerCase()).join(", ");
};

const surfaceEmotionalGuess = (
  axes: AlderamonticoEmotionalAxes,
  physical?: ActorPhysicalStateRecord,
) => {
  const labels = physical?.labels || [];
  if (labels.includes("On Fire")) return "panicking";
  if (labels.includes("Freezing")) return "withdrawn";
  if (axes.arousal >= 70 && axes.valence <= 40) return "agitated";
  if (axes.arousal <= 25 && axes.valence <= 35) return "withdrawn";
  if (axes.valence >= 65 && axes.arousal <= 45) return "at peace";
  if (Math.max(axes.grief, axes.reverence, axes.attachment) >= 85) return "unusually still";
  return "unclear";
};

const attendedEmotionalSummary = (axes: AlderamonticoEmotionalAxes) => {
  const named = deriveAlderamonticoNamedEmotions(axes);
  if (axes.reverence >= 90 && axes.arousal <= 30) {
    return "transfixed, drowning in borrowed reverence";
  }
  if (axes.grief >= 85 && axes.valence <= 45) {
    return "grieving, begging to stop";
  }
  if (axes.attachment >= 90 && axes.arousal <= 50) {
    return "enthralled, bound beyond consent";
  }
  if (named.length) return humanList(named);
  const regions = deriveAlderamonticoEmotionalRegions(axes);
  if (regions.grief === "drowning") return "drowning in grief";
  if (regions.reverence === "transfixed") return "transfixed";
  if (regions.attachment === "enthralled") return "enthralled";
  if (regions.arousal === "frantic" && regions.valence === "elated") return "manic";
  if (regions.arousal === "calm" && regions.valence === "content") return "calm";
  if (regions.valence === "anguish") return "anguished";
  return `${regions.valence}, ${regions.arousal}`;
};

export const buildAlderamonticoConditionReadout = (
  save: PlaySave,
  actorId: string,
  options: { attended?: boolean; attention?: number; physical?: ActorPhysicalStateRecord } = {},
): AlderamonticoConditionReadout => {
  const state = save.alderamontico_state || defaultAlderamonticoSaveState();
  const actor = state.actors?.[actorId] || defaultAlderamonticoActorState(save.clock_minutes ?? 0);
  const physical = options.physical || save.actor_physical_states?.[actorId];
  const attendRecord = state.attended?.[actorId];
  const attention = clampAxis(options.attention ?? attendRecord?.attention ?? state.attention ?? DEFAULT_ATTENTION);
  const attended = Boolean(options.attended ?? attendRecord);
  const emotional_visible = attended || attention >= 75 ? "attended" : "surface";
  const named_emotions = deriveAlderamonticoNamedEmotions(actor.emotional_axes);
  const behavior = inferAlderamonticoBehavior(actor.emotional_axes, {
    baselineAxes: actor.baseline_axes || defaultAlderamonticoEmotionalAxes(),
  });
  const emotional_summary =
    emotional_visible === "attended"
      ? attendedEmotionalSummary(actor.emotional_axes)
      : surfaceEmotionalGuess(actor.emotional_axes, physical);
  const physical_summary = physicalSummary(physical);
  const condition = `a ${physical_summary} actor, ${emotional_summary}`;

  return {
    actor_id: actorId,
    physical_labels: [...(physical?.labels || [])],
    physical_summary,
    emotional_visible,
    emotional_summary,
    emotional_regions:
      emotional_visible === "attended"
        ? deriveAlderamonticoEmotionalRegions(actor.emotional_axes)
        : undefined,
    emotional_axes: emotional_visible === "attended" ? cloneAxes(actor.emotional_axes) : undefined,
    named_emotions,
    behavior,
    condition,
    reliability: reliabilityFromAttention(attention, emotional_visible === "attended"),
    glass: actor.glass,
    grid_pressure: actor.last_grid_exposure,
  };
};
