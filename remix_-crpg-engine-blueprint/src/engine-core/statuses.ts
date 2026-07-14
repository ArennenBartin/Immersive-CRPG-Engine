// ── Status-effect runtime ────────────────────────────────────────────────────
// Framework-agnostic status system the base spec (§12.4) requires: definitions
// with duration, periodic effects, stat modifiers, and turn-skip, plus pure
// apply/tick/modifier functions. Skills already carry `status` payloads
// (status_effect id + value); this turns them into real runtime effects.

export type StatusKind = "buff" | "debuff";

export interface StatusDef {
  id: string;
  displayName: string;
  kind: StatusKind;
  icon: string;
  defaultDuration: number; // turns
  // Per-tick resource change is `direction * magnitude` (direction encodes
  // heal vs. harm; magnitude comes from the skill payload value).
  periodicHpDir?: number; // -1 poison/bleed/burn, +1 regen
  periodicMpDir?: number;
  attackMod?: number; // flat stat deltas while active
  defenseMod?: number;
  speedMod?: number;
  skipTurn?: boolean; // stun: the actor loses its turn
}

export interface StatusInstance {
  id: string;
  remaining: number; // turns left
  magnitude: number; // payload value (per-tick amount / stack strength)
}

// Built-in status library, keyed by the `status_effect` id authors reference.
export const BUILTIN_STATUSES: Record<string, StatusDef> = {
  poison: { id: "poison", displayName: "Poison", kind: "debuff", icon: "☠", defaultDuration: 3, periodicHpDir: -1 },
  bleed: { id: "bleed", displayName: "Bleed", kind: "debuff", icon: "🩸", defaultDuration: 2, periodicHpDir: -1 },
  burn: { id: "burn", displayName: "Burn", kind: "debuff", icon: "🔥", defaultDuration: 2, periodicHpDir: -1 },
  regen: { id: "regen", displayName: "Regen", kind: "buff", icon: "✚", defaultDuration: 3, periodicHpDir: 1 },
  weaken: { id: "weaken", displayName: "Weaken", kind: "debuff", icon: "▼", defaultDuration: 3, attackMod: -2 },
  guard: { id: "guard", displayName: "Guard", kind: "buff", icon: "🛡", defaultDuration: 2, defenseMod: 2 },
  haste: { id: "haste", displayName: "Haste", kind: "buff", icon: "⚡", defaultDuration: 3, speedMod: 3 },
  slow: { id: "slow", displayName: "Slow", kind: "debuff", icon: "🐌", defaultDuration: 3, speedMod: -3 },
  stun: { id: "stun", displayName: "Stun", kind: "debuff", icon: "✦", defaultDuration: 1, skipTurn: true },
};

// Resolve a definition for any status id (unknown ids become a neutral
// 2-turn marker so authored content never silently no-ops).
export function getStatusDef(id: string): StatusDef {
  return (
    BUILTIN_STATUSES[id] || {
      id,
      displayName: id,
      kind: "debuff",
      icon: "●",
      defaultDuration: 2,
    }
  );
}

// Add/refresh a status on an actor's instance list (immutable). Refresh keeps
// the longer remaining duration and the stronger magnitude.
export function applyStatus(
  instances: StatusInstance[] | undefined,
  statusId: string,
  opts: { duration?: number; magnitude?: number } = {},
): StatusInstance[] {
  const def = getStatusDef(statusId);
  const duration = Math.max(1, opts.duration ?? def.defaultDuration);
  const magnitude = opts.magnitude ?? 1;
  const list = (instances || []).map((s) => ({ ...s }));
  const existing = list.find((s) => s.id === statusId);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, duration);
    existing.magnitude = Math.max(existing.magnitude, magnitude);
    return list;
  }
  list.push({ id: statusId, remaining: duration, magnitude });
  return list;
}

export interface StatusTickResult {
  instances: StatusInstance[];
  hpDelta: number;
  mpDelta: number;
  skipTurn: boolean;
  expired: string[];
}

// Advance statuses by one turn: accumulate periodic hp/mp, report skipTurn,
// decrement durations, and drop expired entries.
export function tickStatuses(instances: StatusInstance[] | undefined): StatusTickResult {
  let hpDelta = 0;
  let mpDelta = 0;
  let skipTurn = false;
  const next: StatusInstance[] = [];
  const expired: string[] = [];
  for (const inst of instances || []) {
    const def = getStatusDef(inst.id);
    if (def.periodicHpDir) hpDelta += def.periodicHpDir * inst.magnitude;
    if (def.periodicMpDir) mpDelta += def.periodicMpDir * inst.magnitude;
    if (def.skipTurn) skipTurn = true;
    const remaining = inst.remaining - 1;
    if (remaining > 0) next.push({ ...inst, remaining });
    else expired.push(inst.id);
  }
  return { instances: next, hpDelta, mpDelta, skipTurn, expired };
}

// Net flat stat modifiers from all active statuses.
export function statModifiers(instances: StatusInstance[] | undefined): {
  attack: number;
  defense: number;
  speed: number;
} {
  let attack = 0, defense = 0, speed = 0;
  for (const inst of instances || []) {
    const def = getStatusDef(inst.id);
    attack += def.attackMod || 0;
    defense += def.defenseMod || 0;
    speed += def.speedMod || 0;
  }
  return { attack, defense, speed };
}
