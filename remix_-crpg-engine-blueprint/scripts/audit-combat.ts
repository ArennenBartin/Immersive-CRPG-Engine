import { type GamePackage } from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { getEnemyXpReward } from "../src/utils/leveling";

type Combatant = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
};

const strikeDamage = (attack: number, defense: number, payload = 0) =>
  Math.max(1, attack + payload - defense);

const clonePlayer = (pkg: GamePackage): Combatant => {
  const stats = pkg.settings?.player_stats || {};
  return {
    id: "player",
    name: "Player",
    hp: stats.hp ?? stats.max_hp ?? 20,
    maxHp: stats.max_hp ?? stats.hp ?? 20,
    attack: stats.attack ?? 5,
    defense: stats.defense ?? 2,
    speed: stats.speed ?? 10,
  };
};

const toEnemyCombatant = (entity: GamePackage["entities"][number]): Combatant => ({
  id: entity.id,
  name: entity.display_name,
  hp: entity.max_hp ?? 1,
  maxHp: entity.max_hp ?? 1,
  attack: entity.attack ?? 1,
  defense: entity.defense ?? 0,
  speed: entity.speed ?? 5,
});

const simulateDuel = (
  pkg: GamePackage,
  entity: GamePackage["entities"][number],
) => {
  const player = clonePlayer(pkg);
  const enemy = toEnemyCombatant(entity);
  const knownSkills = new Set((pkg.settings?.initial_known_skills as string[] | undefined) || []);
  const skill =
    pkg.abilities.find((ability) => knownSkills.has(ability.id) && ability.payloads.some((payload) => payload.type === "damage")) ||
    pkg.abilities.find((ability) => ability.payloads.some((payload) => payload.type === "damage"));
  const skillPayload =
    skill?.payloads.find((payload) => payload.type === "damage")?.value ?? 0;
  const playerDamage = strikeDamage(player.attack, enemy.defense, skillPayload);
  const enemyDamage = strikeDamage(enemy.attack, player.defense);
  let rounds = 0;

  while (player.hp > 0 && enemy.hp > 0 && rounds < 30) {
    rounds += 1;
    const playerFirst = player.speed >= enemy.speed;
    if (playerFirst) {
      enemy.hp -= playerDamage;
      if (enemy.hp > 0) player.hp -= enemyDamage;
    } else {
      player.hp -= enemyDamage;
      if (player.hp > 0) enemy.hp -= playerDamage;
    }
  }

  return {
    enemy: entity.id,
    skill: skill?.id || "basic_attack",
    rounds,
    playerHpRemaining: player.hp,
    enemyHpRemaining: enemy.hp,
    playerDamage,
    enemyDamage,
    playerWins: player.hp > 0 && enemy.hp <= 0,
    xp: getEnemyXpReward(entity),
  };
};

const pkg = createQaSuitePackage();
const hostiles = pkg.entities.filter((entity) => !entity.is_npc);
const issues: string[] = [];

if (hostiles.length === 0) {
  issues.push("No hostile entities are authored in the demo package.");
}

for (const hostile of hostiles) {
  const result = simulateDuel(pkg, hostile);
  console.log(
    `${hostile.display_name}: ${result.playerWins ? "player survives" : "player fails"} ` +
      `in ${result.rounds} round(s) using ${result.skill}; ` +
      `player HP ${Math.max(0, result.playerHpRemaining)}, enemy HP ${Math.max(0, result.enemyHpRemaining)}, XP ${result.xp}.`,
  );

  if (!result.playerWins) {
    issues.push(`${hostile.id} is not survivable for the default player.`);
  }
  if (result.xp <= 0) {
    issues.push(`${hostile.id} grants no XP.`);
  }
  if (result.rounds > 12) {
    issues.push(`${hostile.id} takes ${result.rounds} rounds, which is too slow for the feature demo.`);
  }
}

if (issues.length > 0) {
  for (const issue of issues) console.error(`[error] ${issue}`);
  process.exit(1);
}

console.log("Combat audit complete: demo combat is survivable.");
