import type { SkillData } from "../schema/game";

export const ABILITY_PAGE_ORDER = ["physical", "combat", "elemental", "social", "utility"] as const;
export type AbilityPageId = (typeof ABILITY_PAGE_ORDER)[number];

export const ABILITY_PAGE_LABELS: Record<AbilityPageId, string> = {
  physical: "Physical",
  combat: "Combat",
  elemental: "Elemental",
  social: "Social",
  utility: "Utility",
};

export const ABILITY_BAR_PAGE_SIZE = 6;

export const ABILITY_KIND_IDS = ["skill", "world_verb", "combat_action", "utility_action"] as const;
export type AbilityKindId = (typeof ABILITY_KIND_IDS)[number];

export const RUNTIME_ACTION_IDS = [
  "basic_attack",
  "shove",
  "overwatch",
  "wait",
  "attend",
  "drop",
  "push",
  "pull",
  "throw",
  "break",
  "stack",
  "climb",
  "burn",
  "douse",
  "freeze",
  "wet",
  "electrify",
  "foam",
  "yell",
  "console",
] as const;
export type RuntimeAbilityActionId = (typeof RUNTIME_ACTION_IDS)[number];

const builtinAbility = (
  id: string,
  display_name: string,
  description: string,
  ability_page: AbilityPageId,
  runtime_action: RuntimeAbilityActionId,
  ability_kind: AbilityKindId,
  sort_order: number,
  icon: string,
  element: SkillData["element"] = "none",
): SkillData => ({
  id,
  display_name,
  description,
  ability_kind,
  runtime_action,
  ability_page,
  icon,
  sort_order,
  starts_unlocked: true,
  ap_cost: runtime_action === "attend" || runtime_action === "overwatch" || runtime_action === "shove" ? 0 : 1000,
  mp_cost: 0,
  element,
  targeting: "single",
  range: runtime_action === "pull" ? 2 : 1,
  payloads: [],
});

export const DEFAULT_BUILTIN_ABILITIES: SkillData[] = [
  builtinAbility("abl_drop", "Drop", "Drop the first carried stack onto a nearby open cell.", "physical", "drop", "world_verb", 10, "briefcase"),
  builtinAbility("abl_push", "Push", "Push an adjacent movable object away.", "physical", "push", "world_verb", 20, "move-right", "physical"),
  builtinAbility("abl_pull", "Pull", "Pull a movable object toward you when there is room.", "physical", "pull", "world_verb", 30, "move-left", "physical"),
  builtinAbility("abl_throw", "Throw", "Hurl a nearby movable object farther away.", "physical", "throw", "world_verb", 40, "crosshair", "physical"),
  builtinAbility("abl_break", "Break", "Break a nearby object out of the world.", "physical", "break", "world_verb", 50, "hammer", "physical"),
  builtinAbility("abl_stack", "Stack", "Move an object into a support position.", "physical", "stack", "world_verb", 60, "layers", "physical"),
  builtinAbility("abl_climb", "Climb", "Mark a nearby cell as climbable support.", "physical", "climb", "world_verb", 70, "chevron-up", "physical"),

  builtinAbility("abl_basic_attack", "Attack", "Strike the hostile actor you are facing.", "combat", "basic_attack", "combat_action", 10, "swords", "physical"),
  builtinAbility("abl_shove", "Shove", "Shove the faced enemy one tile; hazards and overwatch resolve through the simulation.", "combat", "shove", "combat_action", 20, "move-right", "physical"),
  builtinAbility("abl_overwatch", "Overwatch", "Spend your turn watching: the first hostile that crosses your sight takes a reaction hit.", "combat", "overwatch", "combat_action", 30, "crosshair", "physical"),

  builtinAbility("abl_burn", "Burn", "Set a cell alight; fire spreads through oil and flammables.", "elemental", "burn", "world_verb", 10, "thermometer", "fire"),
  builtinAbility("abl_douse", "Douse", "Put out fire and leave wet ground or steam.", "elemental", "douse", "world_verb", 20, "droplet", "water"),
  builtinAbility("abl_freeze", "Freeze", "Freeze water into slippery ice.", "elemental", "freeze", "world_verb", 30, "thermometer", "cold"),
  builtinAbility("abl_wet", "Wet", "Soak a cell so it can conduct electricity.", "elemental", "wet", "world_verb", 40, "droplet", "water"),
  builtinAbility("abl_electrify", "Shock", "Charge a cell; electricity chains through water.", "elemental", "electrify", "world_verb", 50, "zap", "shock"),
  builtinAbility("abl_foam", "Foam", "Douse, occlude, and leave climbable support.", "elemental", "foam", "world_verb", 60, "sparkles", "water"),

  builtinAbility("abl_attend", "Attend", "Read the faced living actor.", "social", "attend", "utility_action", 10, "eye"),
  builtinAbility("abl_yell", "Yell", "Startle a creature; fear spikes and skittish things flee.", "social", "yell", "world_verb", 20, "message-circle"),
  builtinAbility("abl_console", "Console", "Console an adjacent creature; grief eases and panic settles.", "social", "console", "world_verb", 30, "heart"),

  builtinAbility("abl_wait", "Wait", "Hold your ground or pass the current turn.", "utility", "wait", "utility_action", 10, "clock"),
];

export const DEFAULT_BUILTIN_ABILITY_IDS = DEFAULT_BUILTIN_ABILITIES.map((ability) => ability.id);
export const DEFAULT_UNLOCKED_ABILITY_IDS = DEFAULT_BUILTIN_ABILITIES
  .filter((ability) => ability.starts_unlocked)
  .map((ability) => ability.id);

export const mergeDefaultAbilities = (abilities: SkillData[]): SkillData[] => {
  const byId = new Map<string, SkillData>();
  DEFAULT_BUILTIN_ABILITIES.forEach((ability) => byId.set(ability.id, ability));
  abilities.forEach((ability) => byId.set(ability.id, ability));
  return [...byId.values()];
};
