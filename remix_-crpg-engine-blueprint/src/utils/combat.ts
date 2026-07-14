// Shared combat tuning + dice. One damage model for bump attacks, Act
// attacks, follower assists, enemy hits, and skill payloads so numbers stay
// legible across the whole game.

import { RNG, hashSeed } from "../engine-core";
import { scaleMacroDistanceToFine } from "../engine-core/gridCoordinates";

// Authoritative combat randomness comes from engine-core's seeded stream, never
// ambient Math.random, so an encounter resolves deterministically from its seed.
// The runtime calls seedCombatRng() when a fight starts; the default keeps
// standby rolls working before any combat begins.
let combatRng = new RNG(hashSeed("combat", "default"));
export const seedCombatRng = (...parts: Array<string | number>): void => {
  combatRng = new RNG(hashSeed("combat", ...parts));
};
export const combatRandom = (): number => combatRng.next();

// Hostiles within this Manhattan distance count as "engaged": they show HP
// bars and threat rings, the HUD shows the danger panel, movement drops to
// step-by-step, and combat music takes over. Authored in MACRO tiles,
// resolved in fine cells.
export const THREAT_RADIUS = scaleMacroDistanceToFine(6);

// Hostile AI gives chase within this distance (corridor design = encounter
// design, per the production plan — keep it fixed). Macro-authored.
export const CHASE_RADIUS = scaleMacroDistanceToFine(8);

export const CRIT_CHANCE = 0.1;
export const CRIT_MULT = 1.5;

export interface DamageRoll {
  dmg: number;
  crit: boolean;
}

// Basic melee: attack vs defense, 10% crits at 1.5x, never below 1.
export const rollMeleeDamage = (
  attack: number,
  defense: number,
): DamageRoll => {
  const base = Math.max(1, attack - defense);
  const crit = combatRandom() < CRIT_CHANCE;
  return { dmg: crit ? Math.max(1, Math.round(base * CRIT_MULT)) : base, crit };
};

// Skill damage: payload value scaled by half the caster's attack, reduced by
// target defense. Keeps authored payload numbers meaningful while letting
// stats matter.
export const rollSkillDamage = (
  payloadValue: number,
  attack: number,
  defense: number,
): DamageRoll => {
  const base = Math.max(1, payloadValue + Math.floor(attack / 2) - defense);
  const crit = combatRandom() < CRIT_CHANCE;
  return { dmg: crit ? Math.max(1, Math.round(base * CRIT_MULT)) : base, crit };
};
