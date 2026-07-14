import type {
  BarkData,
  ConditionData,
  DialogueData,
  DialogueNodeData,
  EventActionData,
  MapExitData,
  ShopData,
  ShopItemData,
  ShopPriceModifierData,
  TriggerData,
} from "../schema/game";
import type { PlaySave } from "../schema/save";

// ── Clock phases ─────────────────────────────────────────────────────────────
// Story gates, schedules, and the HUD should agree on the same phase names.

export type ClockPhaseId =
  | "late_night"
  | "night"
  | "dawn"
  | "day"
  | "dusk";

export const getClockPhaseId = (hour: number): ClockPhaseId => {
  if (hour < 1) return "late_night";
  if (hour < 5) return "night";
  if (hour < 7) return "dawn";
  if (hour < 18) return "day";
  if (hour < 22) return "dusk";
  return "night";
};

export const CLOCK_PHASE_LABELS: Record<ClockPhaseId, string> = {
  late_night: "Late Night",
  night: "Night",
  dawn: "Dawn",
  day: "Day",
  dusk: "Dusk",
};

// ── Condition evaluation ────────────────────────────────────────────────────

export interface ConditionContext {
  flags: Record<string, unknown>;
  quests: Record<string, unknown>;
  inventory: { id: string; count: number }[];
  party: string[];
  clockMinutes: number;
  factionRep: Record<string, number>;
}

export const buildConditionContext = (
  save: PlaySave | null | undefined,
): ConditionContext => ({
  flags: save?.flags || {},
  quests: save?.quests || {},
  inventory: save?.inventory || [],
  party: save?.party_members || [],
  clockMinutes: save?.clock_minutes ?? 0,
  factionRep: save?.faction_rep || {},
});

const hourInRange = (hour: number, gte?: number, lt?: number) => {
  const lo = gte ?? 0;
  const hi = lt ?? 24;
  if (lo > hi) return hour >= lo || hour < hi;
  return hour >= lo && hour < hi;
};

// A missing/empty condition always passes. Predicates within one node are
// ANDed; `all`, `any` and `not` compose nested conditions.
export const evaluateCondition = (
  condition: ConditionData | null | undefined,
  ctx: ConditionContext,
): boolean => {
  if (!condition) return true;

  if (condition.all && !condition.all.every((c) => evaluateCondition(c, ctx)))
    return false;
  if (condition.any && !condition.any.some((c) => evaluateCondition(c, ctx)))
    return false;
  if (condition.not && evaluateCondition(condition.not, ctx)) return false;

  if (
    condition.switch !== undefined &&
    !!ctx.flags[condition.switch] !== (condition.switch_value ?? true)
  )
    return false;

  if (
    condition.quest !== undefined &&
    ctx.quests[condition.quest] !== condition.quest_state
  )
    return false;

  if (condition.has_item !== undefined) {
    const count =
      ctx.inventory.find((entry) => entry.id === condition.has_item)?.count ||
      0;
    if (count < (condition.item_count ?? 1)) return false;
  }

  if (
    condition.party_contains !== undefined &&
    !ctx.party.includes(condition.party_contains)
  )
    return false;

  if (condition.faction !== undefined) {
    const rep = ctx.factionRep[condition.faction] ?? 0;
    if (condition.rep_gte !== undefined && rep < condition.rep_gte)
      return false;
    if (condition.rep_lte !== undefined && rep > condition.rep_lte)
      return false;
  }

  const hour = Math.floor(ctx.clockMinutes / 60) % 24;

  if (condition.time_of_day !== undefined) {
    const phase = getClockPhaseId(hour);
    const allowed = Array.isArray(condition.time_of_day)
      ? condition.time_of_day
      : [condition.time_of_day];
    const matches = allowed.some(
      (entry) =>
        entry === phase || (entry === "night" && phase === "late_night"),
    );
    if (!matches) return false;
  }

  if (condition.hour_gte !== undefined || condition.hour_lt !== undefined) {
    if (!hourInRange(hour, condition.hour_gte, condition.hour_lt))
      return false;
  }

  return true;
};

// ── Triggers and cutscene control flow ───────────────────────────────────────

export const isTriggerEligible = (
  trigger: TriggerData,
  ctx: ConditionContext,
): boolean => {
  const legacyOk = (trigger.conditions || []).every(
    (condition) =>
      !!ctx.flags[condition.switch_id] === condition.expected_value,
  );
  return legacyOk && evaluateCondition(trigger.condition, ctx);
};

/**
 * Resolve switch-change triggers on the false -> true edge of their authored
 * condition. An ungated switch-change trigger observes any real story-switch
 * change. Engine bookkeeping flags are excluded so firing a once trigger does
 * not recursively trigger the switch system again.
 */
export const findEligibleSwitchChangeTriggers = (
  triggers: TriggerData[] | undefined,
  before: ConditionContext,
  after: ConditionContext,
): TriggerData[] => {
  const changedSwitchIds = new Set(
    [...new Set([...Object.keys(before.flags), ...Object.keys(after.flags)])]
      .filter((id) => !id.startsWith("trig_run_"))
      .filter((id) => before.flags[id] !== after.flags[id]),
  );
  if (changedSwitchIds.size === 0) return [];

  return (triggers || []).filter((trigger) => {
    if (trigger.type !== "switch_change") return false;
    if (trigger.once && after.flags[`trig_run_${trigger.id}`]) return false;
    const eligibleAfter = isTriggerEligible(trigger, after);
    if (!eligibleAfter) return false;
    const hasGate = Boolean(trigger.condition) || (trigger.conditions || []).length > 0;
    return !hasGate || !isTriggerEligible(trigger, before);
  });
};

export const isMapExitEligible = (
  exit: MapExitData,
  ctx: ConditionContext,
): boolean => evaluateCondition(exit.condition, ctx);

export const shouldRunCutsceneBranch = (
  action: EventActionData,
  ctx: ConditionContext,
): boolean => action.type === "branch" && evaluateCondition(action.condition, ctx);

export const findCutsceneLabelIndex = (
  actions: EventActionData[],
  targetLabel: string | undefined,
): number => {
  if (!targetLabel) return -1;
  return actions.findIndex(
    (action) => action.type === "label" && action.label === targetLabel,
  );
};

// ── Dialogue graph read model ────────────────────────────────────────────────

export type DialogueOptionData = DialogueNodeData["options"][number];

export const resolveDialogueNode = (
  dialogue: DialogueData | null | undefined,
  nodeId: string | null | undefined,
): DialogueNodeData | undefined => {
  if (!dialogue) return undefined;
  return dialogue.nodes.find((node) => node.id === nodeId) || dialogue.nodes[0];
};

export const isDialogueOptionVisible = (
  option: DialogueOptionData,
  ctx: ConditionContext,
): boolean => {
  if (
    option.required_quest &&
    option.required_quest_state &&
    ctx.quests[option.required_quest] !== option.required_quest_state
  )
    return false;

  if (
    option.required_switch &&
    !!ctx.flags[option.required_switch] !== (option.required_switch_value ?? true)
  )
    return false;

  return evaluateCondition(option.condition, ctx);
};

export const getVisibleDialogueOptions = (
  node: DialogueNodeData,
  ctx: ConditionContext,
): DialogueOptionData[] =>
  node.options.filter((option) => isDialogueOptionVisible(option, ctx));

export type DialogueChoiceEffect =
  | { type: "set_switch"; switchId: string; value: boolean }
  | { type: "set_quest"; questId: string; state: string };

export interface DialogueChoiceResolution {
  dialogueId: string;
  nodeId: string;
  optionIndex: number;
  optionText: string;
  nextNodeId?: string;
  endsDialogue: boolean;
  triggerCutsceneId?: string;
  effects: DialogueChoiceEffect[];
}

export const resolveDialogueChoice = (
  dialogue: DialogueData,
  nodeId: string | null | undefined,
  visibleOptionIndex: number,
  ctx: ConditionContext,
): DialogueChoiceResolution | undefined => {
  const node = resolveDialogueNode(dialogue, nodeId);
  if (!node) return undefined;
  const visible = getVisibleDialogueOptions(node, ctx);
  const option = visible[visibleOptionIndex];
  if (!option) return undefined;
  const effects: DialogueChoiceEffect[] = [];
  if (option.set_switch) {
    effects.push({
      type: "set_switch",
      switchId: option.set_switch,
      value: option.set_switch_value ?? true,
    });
  }
  for (const switchUpdate of option.set_switches || []) {
    effects.push({
      type: "set_switch",
      switchId: switchUpdate.switch_id,
      value: switchUpdate.switch_value ?? true,
    });
  }
  if (option.trigger_quest && option.trigger_quest_state) {
    effects.push({
      type: "set_quest",
      questId: option.trigger_quest,
      state: option.trigger_quest_state,
    });
  }
  return {
    dialogueId: dialogue.id,
    nodeId: node.id,
    optionIndex: visibleOptionIndex,
    optionText: option.text,
    nextNodeId: option.next_node_id,
    endsDialogue: !option.next_node_id,
    triggerCutsceneId: option.trigger_cutscene,
    effects,
  };
};

// ── Shops ───────────────────────────────────────────────────────────────────

// Applies each passing modifier in order: price * multiplier + delta.
// Result is rounded and never negative.
export const computeShopPrice = (
  basePrice: number,
  modifiers: ShopPriceModifierData[] | undefined,
  ctx: ConditionContext,
): number => {
  let price = basePrice;
  for (const modifier of modifiers || []) {
    if (!evaluateCondition(modifier.condition, ctx)) continue;
    price = price * (modifier.multiplier ?? 1) + (modifier.delta ?? 0);
  }
  return Math.max(0, Math.round(price));
};

export interface ShopStockEntry {
  item: ShopItemData;
  stockIndex: number;
  price: number;
  basePrice: number;
}

export const getAvailableShopStock = (
  shop: ShopData,
  ctx: ConditionContext,
): ShopStockEntry[] =>
  shop.items
    .map((item, stockIndex) => ({ item, stockIndex }))
    .filter(({ item }) => evaluateCondition(item.condition, ctx))
    .map(({ item, stockIndex }) => ({
      item,
      stockIndex,
      basePrice: item.price,
      price: computeShopPrice(item.price, item.price_modifiers, ctx),
    }));

// ── Ambient barks ───────────────────────────────────────────────────────────

export interface BarkSelectionOptions {
  barks: BarkData[];
  speakerA: string;
  speakerB: string;
  ctx: ConditionContext;
  clockMinutes: number;
  lastPlayed?: Map<string, number> | Record<string, number | undefined>;
  defaultCooldownMinutes?: number;
}

const readLastPlayed = (
  source: BarkSelectionOptions["lastPlayed"],
  barkId: string,
): number | undefined => {
  if (!source) return undefined;
  if (source instanceof Map) return source.get(barkId);
  return source[barkId];
};

export const selectEligibleBark = ({
  barks,
  speakerA,
  speakerB,
  ctx,
  clockMinutes,
  lastPlayed,
  defaultCooldownMinutes = 90,
}: BarkSelectionOptions): BarkData | undefined =>
  barks.find((bark) => {
    const [left, right] = bark.speakers;
    const matchesPair =
      (left === speakerA && right === speakerB) ||
      (left === speakerB && right === speakerA);
    if (!matchesPair) return false;
    if (!evaluateCondition(bark.condition, ctx)) return false;
    const last = readLastPlayed(lastPlayed, bark.id);
    const cooldown = bark.cooldown_minutes ?? defaultCooldownMinutes;
    if (last !== undefined && clockMinutes - last < cooldown) return false;
    return true;
  });

// ── Endings ─────────────────────────────────────────────────────────────────

export interface EndingResolution {
  endingId?: string;
  title: string;
  data?: unknown;
}

export const resolveEnding = (
  endings: unknown[] | undefined,
  endingId?: string,
  fallbackTitle = "The End",
): EndingResolution => {
  const ending =
    endingId && Array.isArray(endings)
      ? endings.find(
          (candidate) =>
            !!candidate &&
            typeof candidate === "object" &&
            (candidate as { id?: unknown }).id === endingId,
        )
      : undefined;
  const title =
    (ending &&
      typeof ending === "object" &&
      (typeof (ending as { title?: unknown }).title === "string"
        ? (ending as { title: string }).title
        : typeof (ending as { display_name?: unknown }).display_name === "string"
          ? (ending as { display_name: string }).display_name
          : undefined)) ||
    fallbackTitle;
  return {
    endingId,
    title,
    data: ending,
  };
};
