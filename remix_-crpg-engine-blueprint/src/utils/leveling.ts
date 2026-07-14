import type { EntityData } from "../schema/game";
import type { PlaySave } from "../schema/save";

export type LevelUpStat = "vitality" | "aether" | "attack" | "defense" | "speed";

export interface LevelUpChoice {
  id: LevelUpStat;
  label: string;
  effectLabel: string;
  deltas: Partial<PlaySave["playerStats"]>;
}

export interface ExperienceGrantResult {
  awarded: number;
  experience: number;
  level: number;
  levelUps: number;
  pendingLevelUps: number;
  xpToNext: number;
}

export const LEVEL_UP_CHOICES: LevelUpChoice[] = [
  {
    id: "vitality",
    label: "Vitality",
    effectLabel: "+5 Max HP",
    deltas: { max_hp: 5 },
  },
  {
    id: "aether",
    label: "Aether",
    effectLabel: "+3 Max MP",
    deltas: { max_mp: 3 },
  },
  {
    id: "attack",
    label: "Might",
    effectLabel: "+1 Attack",
    deltas: { attack: 1 },
  },
  {
    id: "defense",
    label: "Guard",
    effectLabel: "+1 Defense",
    deltas: { defense: 1 },
  },
  {
    id: "speed",
    label: "Speed",
    effectLabel: "+1 Speed",
    deltas: { speed: 1 },
  },
];

export const getXpRequiredForLevel = (level: number) => {
  const targetLevel = Math.max(1, Math.floor(level));
  if (targetLevel <= 1) return 0;
  let total = 0;
  for (let nextLevel = 2; nextLevel <= targetLevel; nextLevel += 1) {
    total += 30 + (nextLevel - 2) * 15;
  }
  return total;
};

export const getSaveLevel = (save?: PlaySave | null) =>
  Math.max(1, Math.floor(save?.level ?? 1));

export const getSaveExperience = (save?: PlaySave | null) =>
  Math.max(0, Math.floor(save?.experience ?? 0));

export const getPendingLevelUps = (save?: PlaySave | null) =>
  Math.max(0, Math.floor(save?.pending_level_ups ?? 0));

export const getCombatXpPool = (save?: PlaySave | null) =>
  Math.max(0, Math.floor(save?.combat_xp_pool ?? 0));

export const getXpRemainingForNextLevel = (save?: PlaySave | null) => {
  const level = getSaveLevel(save);
  const experience = getSaveExperience(save);
  return Math.max(0, getXpRequiredForLevel(level + 1) - experience);
};

const makeExperienceResult = (
  save: PlaySave,
  awarded: number,
  levelUps: number,
): ExperienceGrantResult => ({
  awarded,
  experience: getSaveExperience(save),
  level: getSaveLevel(save),
  levelUps,
  pendingLevelUps: getPendingLevelUps(save),
  xpToNext: getXpRemainingForNextLevel(save),
});

export const normalizeProgression = (save: PlaySave): PlaySave => ({
  ...save,
  level: getSaveLevel(save),
  experience: getSaveExperience(save),
  pending_level_ups: getPendingLevelUps(save),
  combat_xp_pool: getCombatXpPool(save),
});

export const grantExperienceToSave = (
  save: PlaySave,
  rawAmount: number,
): { save: PlaySave; result: ExperienceGrantResult } => {
  const awarded = Math.max(0, Math.floor(rawAmount));
  const currentLevel = getSaveLevel(save);
  const currentExperience = getSaveExperience(save);
  const nextExperience = currentExperience + awarded;

  let nextLevel = currentLevel;
  let levelUps = 0;
  while (nextExperience >= getXpRequiredForLevel(nextLevel + 1)) {
    nextLevel += 1;
    levelUps += 1;
  }

  const nextSave: PlaySave = {
    ...normalizeProgression(save),
    experience: nextExperience,
    level: nextLevel,
    pending_level_ups: getPendingLevelUps(save) + levelUps,
  };

  return { save: nextSave, result: makeExperienceResult(nextSave, awarded, levelUps) };
};

export const applyLevelUpChoiceToSave = (
  save: PlaySave,
  stat: LevelUpStat,
): { save: PlaySave; applied: boolean; choice?: LevelUpChoice } => {
  const choice = LEVEL_UP_CHOICES.find((candidate) => candidate.id === stat);
  const pending = getPendingLevelUps(save);
  if (!choice || pending <= 0) {
    return { save: normalizeProgression(save), applied: false };
  }

  const stats = { ...save.playerStats } as Record<string, number>;
  Object.entries(choice.deltas).forEach(([key, value]) => {
    stats[key] = (stats[key] ?? 0) + (value ?? 0);
  });

  stats.max_hp = Math.max(1, stats.max_hp);
  stats.max_mp = Math.max(0, stats.max_mp);
  stats.attack = Math.max(0, stats.attack);
  stats.defense = Math.max(0, stats.defense);
  stats.speed = Math.max(1, stats.speed);

  const hpDelta = choice.deltas.max_hp ?? 0;
  const mpDelta = choice.deltas.max_mp ?? 0;
  stats.hp = Math.min(stats.max_hp, stats.hp + Math.max(0, hpDelta));
  stats.mp = Math.min(stats.max_mp, stats.mp + Math.max(0, mpDelta));

  return {
    save: {
      ...normalizeProgression(save),
      playerStats: stats as PlaySave["playerStats"],
      pending_level_ups: pending - 1,
    },
    applied: true,
    choice,
  };
};

export const getEnemyXpReward = (entity: EntityData | undefined | null) => {
  if (!entity || entity.is_npc) return 0;
  if (typeof entity.xp_reward === "number") {
    return Math.max(0, Math.floor(entity.xp_reward));
  }
  return Math.max(
    6,
    Math.round(
      (entity.max_hp ?? 10) * 0.7 +
        (entity.attack ?? 2) * 2 +
        (entity.defense ?? 1) * 2 +
        (entity.speed ?? 10) * 0.4,
    ),
  );
};
