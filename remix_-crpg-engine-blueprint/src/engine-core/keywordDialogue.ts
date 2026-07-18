import type {
  ConditionData,
  DialogueData,
  DialogueDynamicTopicData,
  DialogueKeywordCategory,
  DialogueKeywordData,
  DialogueResponseData,
  GamePackage,
  ItemData,
} from "../schema/game";
import type {
  DialogueDynamicTopicRecord,
  DialogueMemoryState,
  DialogueTopicHistoryRecord,
  DialogueTopicKnowledgeRecord,
  DialogueTopicScope,
  PlaySave,
} from "../schema/save";
import { buildConditionContext, evaluateCondition } from "./story";

export const BUILTIN_DIALOGUE_KEYWORDS: DialogueKeywordData[] = [
  { id: "action:goodbye", display_label: "Goodbye", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "goodbye" },
  { id: "action:silence", display_label: "Silence", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "silence" },
  { id: "action:show_item", display_label: "Show item", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "show_item" },
  { id: "action:give_item", display_label: "Give item", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "give_item" },
  { id: "action:trade", display_label: "Trade", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "trade" },
  { id: "action:recruit", display_label: "Join me", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "recruit" },
  { id: "action:dismiss", display_label: "Wait here", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "dismiss" },
  { id: "action:console", display_label: "Console", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "console" },
  { id: "action:attend", display_label: "Attend", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "attend" },
  { id: "action:leave", display_label: "Leave", category: "actions", scope: "conversation", dynamic_capable: false, known_by_default: true, important: false, action_kind: "leave" },
];

export type DialogueTopicRef =
  | { kind: "static"; topicId: string }
  | { kind: "dynamic"; dynamicTopicId: string };

export interface KnownDialogueTopic {
  key: string;
  ref: DialogueTopicRef;
  displayLabel: string;
  category: DialogueKeywordCategory;
  scope: DialogueTopicScope;
  important: boolean;
  actionKind?: DialogueKeywordData["action_kind"];
  relevant: boolean;
  changed: boolean;
}

export interface KeywordResponseResolution {
  dialogue: DialogueData;
  response: DialogueResponseData;
  topic: DialogueTopicRef | null;
  topicKey: string;
  participantKey: string;
  askCount: number;
  shownItem?: ItemData;
  effectsAlreadyApplied: boolean;
}

export interface KeywordSelectionOutcome {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  response?: DialogueResponseData;
  topic?: DialogueTopicRef | null;
  topicKey?: string;
  localTopicIds: string[];
  localDynamicTopicIds: string[];
  newlyDiscoveredTopicIds: string[];
  newlyDiscoveredDynamicTopicIds: string[];
  triggerCutsceneId?: string;
  endConversation: boolean;
  effectsApplied: boolean;
}

export const shouldCloseKeywordConversationImmediately = (outcome: {
  endsDialogue: boolean;
  responseText?: string;
  triggerCutsceneId?: string;
}): boolean =>
  (outcome.endsDialogue || Boolean(outcome.triggerCutsceneId)) &&
  !outcome.responseText?.trim();

export interface DialogueValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

const cloneMemory = (memory: DialogueMemoryState): DialogueMemoryState => ({
  ...memory,
  prior_intercessor_ids: [...(memory.prior_intercessor_ids || [])],
  campaign_topics: structuredClone(memory.campaign_topics || {}),
  expedition_topics: structuredClone(memory.expedition_topics || {}),
  dynamic_topics: structuredClone(memory.dynamic_topics || {}),
  npc_topics: structuredClone(memory.npc_topics || {}),
});

export const createDialogueMemory = (
  expeditionId = "expedition:1",
): DialogueMemoryState => ({
  current_expedition_id: expeditionId,
  prior_intercessor_ids: [],
  campaign_topics: {},
  expedition_topics: {},
  dynamic_topics: {},
  npc_topics: {},
});

const knowledgeRecord = (
  topicId: string,
  scope: DialogueTopicScope,
  source: string,
  save: PlaySave,
): DialogueTopicKnowledgeRecord => ({
  topic_id: topicId,
  scope,
  known: true,
  source_of_discovery: source,
  discovered_at_tick: save.immersive_scheduler?.tick,
});

const keywordMapWithBuiltins = (gamePackage: GamePackage) => {
  const result = new Map<string, DialogueKeywordData>();
  BUILTIN_DIALOGUE_KEYWORDS.forEach((topic) => result.set(topic.id, topic));
  (gamePackage.keywords || []).forEach((topic) => result.set(topic.id, topic));
  return result;
};

export const ensureBuiltinDialogueKeywords = (
  keywords: DialogueKeywordData[],
): DialogueKeywordData[] => {
  const byId = new Map(keywords.map((keyword) => [keyword.id, keyword]));
  BUILTIN_DIALOGUE_KEYWORDS.forEach((keyword) => {
    if (!byId.has(keyword.id)) byId.set(keyword.id, keyword);
  });
  return [...byId.values()];
};

const dynamicRecordFromDefinition = (
  definition: DialogueDynamicTopicData,
): DialogueDynamicTopicRecord => ({
  id: definition.id,
  keyword_id: definition.keyword_id,
  record_id: definition.record_id,
  display_name: definition.display_name,
  category: definition.category || "people",
  scope: definition.scope,
  source_of_discovery: definition.source,
  known: definition.known_by_default,
  response_associations: structuredClone(definition.response_associations || {}),
  heard_response_ids: [],
  unread_response_ids: [],
});

export const initializeDialogueMemory = (
  gamePackage: GamePackage,
  save: PlaySave,
): PlaySave => {
  const memory = cloneMemory(save.dialogue_memory || createDialogueMemory());
  const keywords = keywordMapWithBuiltins(gamePackage);
  for (const keyword of keywords.values()) {
    if (!keyword.known_by_default || keyword.scope === "conversation") continue;
    const collection = keyword.scope === "campaign"
      ? memory.campaign_topics
      : memory.expedition_topics;
    if (!collection[keyword.id]) {
      collection[keyword.id] = knowledgeRecord(keyword.id, keyword.scope, "authored:default", save);
    }
  }
  for (const definition of gamePackage.dynamic_topics || []) {
    const existing = memory.dynamic_topics[definition.id];
    if (!existing) memory.dynamic_topics[definition.id] = dynamicRecordFromDefinition(definition);
    else {
      // Display names may be corrected by content updates without changing the
      // stable record binding or erasing knowledge/history.
      memory.dynamic_topics[definition.id] = {
        ...existing,
        keyword_id: definition.keyword_id,
        record_id: definition.record_id,
        display_name: definition.display_name,
        category: definition.category || existing.category,
        response_associations: {
          ...(definition.response_associations || {}),
          ...(existing.response_associations || {}),
        },
        known: existing.known || definition.known_by_default,
      };
    }
  }
  return { ...save, dialogue_memory: memory };
};

export const discoverDialogueTopic = (
  gamePackage: GamePackage,
  save: PlaySave,
  topicId: string,
  source: string,
): { save: PlaySave; local: boolean; discovered: boolean } => {
  const normalized = initializeDialogueMemory(gamePackage, save);
  const keyword = keywordMapWithBuiltins(gamePackage).get(topicId);
  if (!keyword) return { save: normalized, local: false, discovered: false };
  if (keyword.scope === "conversation") {
    return { save: normalized, local: true, discovered: true };
  }
  const memory = cloneMemory(normalized.dialogue_memory!);
  const collection = keyword.scope === "campaign"
    ? memory.campaign_topics
    : memory.expedition_topics;
  const discovered = !collection[topicId]?.known;
  collection[topicId] = {
    ...(collection[topicId] || knowledgeRecord(topicId, keyword.scope, source, normalized)),
    known: true,
    source_of_discovery: collection[topicId]?.source_of_discovery || source,
  };
  return { save: { ...normalized, dialogue_memory: memory }, local: false, discovered };
};

export const discoverDynamicDialogueTopic = (
  gamePackage: GamePackage,
  save: PlaySave,
  dynamicTopicId: string,
  source: string,
): { save: PlaySave; local: boolean; discovered: boolean } => {
  const normalized = initializeDialogueMemory(gamePackage, save);
  const definition = (gamePackage.dynamic_topics || []).find((topic) => topic.id === dynamicTopicId);
  const existing = normalized.dialogue_memory?.dynamic_topics[dynamicTopicId];
  if (!definition && !existing) return { save: normalized, local: false, discovered: false };
  const base = existing || dynamicRecordFromDefinition(definition!);
  if (base.scope === "conversation") {
    return { save: normalized, local: true, discovered: true };
  }
  const memory = cloneMemory(normalized.dialogue_memory!);
  const discovered = !base.known;
  memory.dynamic_topics[dynamicTopicId] = {
    ...base,
    known: true,
    source_of_discovery: base.known ? base.source_of_discovery : source,
  };
  return { save: { ...normalized, dialogue_memory: memory }, local: false, discovered };
};

export const createRuntimeDynamicDialogueTopic = (
  gamePackage: GamePackage,
  save: PlaySave,
  topic: Omit<DialogueDynamicTopicRecord, "known" | "heard_response_ids" | "unread_response_ids"> & { known?: boolean },
): PlaySave => {
  const normalized = initializeDialogueMemory(gamePackage, save);
  const keyword = keywordMapWithBuiltins(gamePackage).get(topic.keyword_id);
  if (!keyword?.dynamic_capable) return normalized;
  const memory = cloneMemory(normalized.dialogue_memory!);
  memory.dynamic_topics[topic.id] = {
    ...topic,
    known: topic.known ?? true,
    heard_response_ids: [],
    unread_response_ids: [],
  };
  return { ...normalized, dialogue_memory: memory };
};

export const beginNewDialogueExpedition = (
  gamePackage: GamePackage,
  save: PlaySave,
  expeditionId: string,
): PlaySave => {
  const normalized = initializeDialogueMemory(gamePackage, save);
  const memory = cloneMemory(normalized.dialogue_memory!);
  const keywordMap = keywordMapWithBuiltins(gamePackage);
  memory.current_expedition_id = expeditionId;
  memory.expedition_topics = {};
  memory.dynamic_topics = Object.fromEntries(
    Object.entries(memory.dynamic_topics).filter(([, topic]) => topic.scope === "campaign"),
  );
  memory.npc_topics = Object.fromEntries(
    Object.entries(memory.npc_topics).map(([participant, topics]) => [
      participant,
      Object.fromEntries(
        Object.entries(topics).filter(([topicKey]) => {
          if (topicKey.startsWith("dynamic:")) {
            return memory.dynamic_topics[topicKey.slice("dynamic:".length)]?.scope === "campaign";
          }
          return keywordMap.get(topicKey)?.scope === "campaign" || topicKey.startsWith("$opening");
        }),
      ),
    ]),
  );
  return initializeDialogueMemory(gamePackage, { ...normalized, dialogue_memory: memory });
};

export const topicRefKey = (topic: DialogueTopicRef | null, entryNodeId?: string) => {
  if (!topic) return `$opening:${entryNodeId || "start"}`;
  return topic.kind === "dynamic" ? `dynamic:${topic.dynamicTopicId}` : topic.topicId;
};

const responseTopicMatches = (
  response: DialogueResponseData,
  topic: DialogueTopicRef | null,
  memory: DialogueMemoryState,
) => {
  if (!topic) return response.role === "opening";
  if (response.role === "opening") return false;
  if (topic.kind === "static") return response.topic_id === topic.topicId;
  const dynamic = memory.dynamic_topics[topic.dynamicTopicId];
  return response.dynamic_topic_id === topic.dynamicTopicId ||
    (!!dynamic && response.topic_id === dynamic.keyword_id && !response.dynamic_topic_id);
};

const countConditionPredicates = (condition?: ConditionData): number => {
  if (!condition) return 0;
  return Object.entries(condition).reduce((count, [key, value]) => {
    if (value === undefined) return count;
    if (key === "all" || key === "any") {
      return count + (value as ConditionData[]).reduce((sum, entry) => sum + countConditionPredicates(entry), 0);
    }
    if (key === "not") return count + countConditionPredicates(value as ConditionData);
    return count + 1;
  }, 0);
};

const responseSpecificity = (response: DialogueResponseData, topic: DialogueTopicRef | null) =>
  countConditionPredicates(response.condition) +
  (response.dynamic_topic_id && topic?.kind === "dynamic" ? 4 : 0) +
  (response.shown_item_id ? 4 : 0) +
  (response.shown_item_blueprint_id ? 3 : 0) +
  (response.shown_item_category ? 2 : 0) +
  (response.shown_item_previously_shown !== undefined ? 1 : 0) +
  (["first", "repeat", "sequential"].includes(response.role) ? 1 : 0);

const defaultHistory = (): DialogueTopicHistoryRecord => ({
  ask_count: 0,
  heard_response_ids: [],
  shown_item_ids: [],
});

export const getDialogueTopicHistory = (
  save: PlaySave,
  participantKey: string,
  topicKey: string,
): DialogueTopicHistoryRecord =>
  save.dialogue_memory?.npc_topics?.[participantKey]?.[topicKey] || defaultHistory();

const responseRoleMatches = (
  response: DialogueResponseData,
  askCount: number,
  sequenceMax: number,
) => {
  if (response.role === "first") return askCount === 0;
  if (response.role === "repeat") return askCount > 0;
  if (response.role === "sequential") {
    const desired = Math.min(askCount, Math.max(0, sequenceMax));
    return (response.sequence_index ?? 0) === desired;
  }
  return true;
};

export const resolveKeywordDialogueResponse = (options: {
  gamePackage: GamePackage;
  save: PlaySave;
  dialogueId: string;
  topic: DialogueTopicRef | null;
  participantKey?: string;
  shownItemId?: string;
  entryNodeId?: string;
}): KeywordResponseResolution | undefined => {
  const save = initializeDialogueMemory(options.gamePackage, options.save);
  const dialogue = options.gamePackage.dialogue.find((entry) => entry.id === options.dialogueId);
  if (!dialogue || dialogue.format !== "keyword_v1") return undefined;
  const participantKey = options.participantKey || dialogue.id;
  const topicKey = topicRefKey(options.topic, options.entryNodeId);
  const history = getDialogueTopicHistory(save, participantKey, topicKey);
  const shownItem = options.shownItemId
    ? options.gamePackage.items.find((item) => item.id === options.shownItemId)
    : undefined;
  const responses = dialogue.responses || [];
  const sequenceMax = Math.max(
    0,
    ...responses
      .filter((response) => responseTopicMatches(response, options.topic, save.dialogue_memory!))
      .map((response) => response.role === "sequential" ? response.sequence_index ?? 0 : 0),
  );
  const candidates = responses.filter((response) => {
    if (!responseTopicMatches(response, options.topic, save.dialogue_memory!)) return false;
    if (!options.topic && options.entryNodeId && response.entry_node_id && response.entry_node_id !== options.entryNodeId) return false;
    if (!options.topic && options.entryNodeId && !response.entry_node_id && responses.some((entry) => entry.role === "opening" && entry.entry_node_id === options.entryNodeId)) return false;
    if (!responseRoleMatches(response, history.ask_count, sequenceMax)) return false;
    const hasItemConstraint = Boolean(response.shown_item_id || response.shown_item_category || response.shown_item_blueprint_id || response.shown_item_previously_shown !== undefined);
    if (hasItemConstraint && !shownItem) return false;
    if (response.shown_item_id && response.shown_item_id !== shownItem?.id) return false;
    if (response.shown_item_category && response.shown_item_category !== shownItem?.category) return false;
    if (response.shown_item_blueprint_id && response.shown_item_blueprint_id !== shownItem?.blueprint_id) return false;
    if (response.shown_item_previously_shown !== undefined && shownItem) {
      const wasShown = history.shown_item_ids.includes(shownItem.id);
      if (wasShown !== response.shown_item_previously_shown) return false;
    }
    return evaluateCondition(response.condition, buildConditionContext(save));
  });
  if (!candidates.length) return undefined;
  candidates.sort((left, right) =>
    Number(left.role === "fallback") - Number(right.role === "fallback") ||
    (right.priority || 0) - (left.priority || 0) ||
    responseSpecificity(right, options.topic) - responseSpecificity(left, options.topic) ||
    left.id.localeCompare(right.id),
  );
  const response = candidates[0];
  return {
    dialogue,
    response,
    topic: options.topic,
    topicKey,
    participantKey,
    askCount: history.ask_count,
    shownItem,
    effectsAlreadyApplied: history.heard_response_ids.includes(response.id),
  };
};

const collectResponseDiscoveries = (response: DialogueResponseData) => ({
  topics: [
    ...(response.unlock_topic_ids || []),
    ...(response.mentions || []).filter((mention) => mention.discover && mention.topic_id).map((mention) => mention.topic_id!),
  ],
  dynamic: [
    ...(response.unlock_dynamic_topic_ids || []),
    ...(response.mentions || []).filter((mention) => mention.discover && mention.dynamic_topic_id).map((mention) => mention.dynamic_topic_id!),
  ],
});

export const selectKeywordDialogueTopic = (options: {
  gamePackage: GamePackage;
  save: PlaySave;
  dialogueId: string;
  topic: DialogueTopicRef | null;
  participantKey?: string;
  shownItemId?: string;
  entryNodeId?: string;
  countAsk?: boolean;
}): KeywordSelectionOutcome => {
  let save = initializeDialogueMemory(options.gamePackage, options.save);
  const keyword = options.topic?.kind === "static"
    ? keywordMapWithBuiltins(options.gamePackage).get(options.topic.topicId)
    : undefined;
  const resolution = resolveKeywordDialogueResponse({ ...options, save });
  if (!resolution) {
    if (keyword?.action_kind === "goodbye") {
      return {
        ok: true,
        save,
        topic: options.topic,
        topicKey: topicRefKey(options.topic),
        localTopicIds: [],
        localDynamicTopicIds: [],
        newlyDiscoveredTopicIds: [],
        newlyDiscoveredDynamicTopicIds: [],
        endConversation: true,
        effectsApplied: false,
      };
    }
    return {
      ok: false,
      reason: "No valid response for this topic.",
      save,
      topic: options.topic,
      localTopicIds: [],
      localDynamicTopicIds: [],
      newlyDiscoveredTopicIds: [],
      newlyDiscoveredDynamicTopicIds: [],
      endConversation: false,
      effectsApplied: false,
    };
  }

  const { response, participantKey, topicKey } = resolution;
  const memory = cloneMemory(save.dialogue_memory!);
  const previous = memory.npc_topics[participantKey]?.[topicKey] || defaultHistory();
  const effectsApplied = response.effects_repeatable || !previous.heard_response_ids.includes(response.id);
  const history: DialogueTopicHistoryRecord = {
    ...previous,
    ask_count: previous.ask_count + (options.countAsk === false || !options.topic ? 0 : 1),
    heard_response_ids: previous.heard_response_ids.includes(response.id)
      ? [...previous.heard_response_ids]
      : [...previous.heard_response_ids, response.id],
    last_response_id: response.id,
    shown_item_ids: resolution.shownItem && !previous.shown_item_ids.includes(resolution.shownItem.id)
      ? [...previous.shown_item_ids, resolution.shownItem.id]
      : [...previous.shown_item_ids],
    last_asked_tick: save.immersive_scheduler?.tick,
  };
  memory.npc_topics[participantKey] = {
    ...(memory.npc_topics[participantKey] || {}),
    [topicKey]: history,
  };
  if (options.topic?.kind === "dynamic") {
    const dynamic = memory.dynamic_topics[options.topic.dynamicTopicId];
    if (dynamic) {
      memory.dynamic_topics[options.topic.dynamicTopicId] = {
        ...dynamic,
        heard_response_ids: Array.from(new Set([...(dynamic.heard_response_ids || []), response.id])),
        unread_response_ids: (dynamic.unread_response_ids || []).filter((id) => id !== response.id),
      };
    }
  }
  save = { ...save, dialogue_memory: memory };

  if (effectsApplied) {
    if (response.set_switches?.length) {
      save = {
        ...save,
        flags: {
          ...(save.flags || {}),
          ...Object.fromEntries(response.set_switches.map((entry) => [entry.switch_id, entry.switch_value ?? true])),
        },
      };
    }
    if (response.set_quest_id && response.set_quest_state) {
      save = {
        ...save,
        quests: { ...(save.quests || {}), [response.set_quest_id]: response.set_quest_state },
      };
    }
  }

  const discoveries = collectResponseDiscoveries(response);
  const localTopicIds: string[] = [];
  const localDynamicTopicIds: string[] = [];
  const newlyDiscoveredTopicIds: string[] = [];
  const newlyDiscoveredDynamicTopicIds: string[] = [];
  for (const topicId of new Set(discoveries.topics)) {
    const result = discoverDialogueTopic(options.gamePackage, save, topicId, `dialogue:${options.dialogueId}:${response.id}`);
    save = result.save;
    if (result.local) localTopicIds.push(topicId);
    else if (result.discovered) newlyDiscoveredTopicIds.push(topicId);
  }
  for (const dynamicTopicId of new Set(discoveries.dynamic)) {
    const result = discoverDynamicDialogueTopic(options.gamePackage, save, dynamicTopicId, `dialogue:${options.dialogueId}:${response.id}`);
    save = result.save;
    if (result.local) localDynamicTopicIds.push(dynamicTopicId);
    else if (result.discovered) newlyDiscoveredDynamicTopicIds.push(dynamicTopicId);
  }

  return {
    ok: true,
    save,
    response,
    topic: options.topic,
    topicKey,
    localTopicIds,
    localDynamicTopicIds,
    newlyDiscoveredTopicIds,
    newlyDiscoveredDynamicTopicIds,
    triggerCutsceneId: effectsApplied ? response.trigger_cutscene_id : undefined,
    endConversation: response.end_conversation,
    effectsApplied,
  };
};

export const beginKeywordConversation = (options: {
  gamePackage: GamePackage;
  save: PlaySave;
  dialogueId: string;
  participantKey?: string;
  participantEntityId?: string;
  entryNodeId?: string;
}): KeywordSelectionOutcome => {
  let save = initializeDialogueMemory(options.gamePackage, options.save);
  const dialogue = options.gamePackage.dialogue.find((entry) => entry.id === options.dialogueId);
  if (!dialogue) {
    return { ok: false, reason: "Dialogue not found.", save, localTopicIds: [], localDynamicTopicIds: [], newlyDiscoveredTopicIds: [], newlyDiscoveredDynamicTopicIds: [], endConversation: true, effectsApplied: false };
  }
  const localTopicIds: string[] = [];
  const localDynamicTopicIds: string[] = [];
  const newlyDiscoveredTopicIds: string[] = [];
  const newlyDiscoveredDynamicTopicIds: string[] = [];
  const entity = options.participantEntityId
    ? options.gamePackage.entities.find((entry) => entry.id === options.participantEntityId)
    : options.gamePackage.entities.find((entry) => entry.dialogue_id === options.dialogueId || entry.party_dialogue_id === options.dialogueId);
  for (const topicId of [...(dialogue.initial_topic_ids || []), ...(entity?.discover_topic_ids || [])]) {
    const result = discoverDialogueTopic(options.gamePackage, save, topicId, `conversation:${options.dialogueId}`);
    save = result.save;
    if (result.local) localTopicIds.push(topicId);
    else if (result.discovered) newlyDiscoveredTopicIds.push(topicId);
  }
  for (const dynamicId of [...(dialogue.initial_dynamic_topic_ids || []), ...(entity?.discover_dynamic_topic_ids || [])]) {
    const result = discoverDynamicDialogueTopic(options.gamePackage, save, dynamicId, `conversation:${options.dialogueId}`);
    save = result.save;
    if (result.local) localDynamicTopicIds.push(dynamicId);
    else if (result.discovered) newlyDiscoveredDynamicTopicIds.push(dynamicId);
  }
  const opening = selectKeywordDialogueTopic({
    ...options,
    save,
    topic: null,
    countAsk: false,
  });
  return {
    ...opening,
    localTopicIds: Array.from(new Set([...localTopicIds, ...opening.localTopicIds])),
    localDynamicTopicIds: Array.from(new Set([...localDynamicTopicIds, ...opening.localDynamicTopicIds])),
    newlyDiscoveredTopicIds: Array.from(new Set([...newlyDiscoveredTopicIds, ...opening.newlyDiscoveredTopicIds])),
    newlyDiscoveredDynamicTopicIds: Array.from(new Set([...newlyDiscoveredDynamicTopicIds, ...opening.newlyDiscoveredDynamicTopicIds])),
  };
};

export const discoverDocumentDialogueTopics = (
  gamePackage: GamePackage,
  save: PlaySave,
  documentId: string,
): PlaySave => {
  const document = gamePackage.documents.find((entry) => entry.id === documentId);
  if (!document) return initializeDialogueMemory(gamePackage, save);
  let next = initializeDialogueMemory(gamePackage, save);
  for (const topicId of document.discover_topic_ids || []) {
    next = discoverDialogueTopic(gamePackage, next, topicId, `document:${documentId}`).save;
  }
  for (const dynamicId of document.discover_dynamic_topic_ids || []) {
    next = discoverDynamicDialogueTopic(gamePackage, next, dynamicId, `document:${documentId}`).save;
  }
  return next;
};

export const discoverItemDialogueTopics = (
  gamePackage: GamePackage,
  save: PlaySave,
  itemId: string,
): PlaySave => {
  const item = gamePackage.items.find((entry) => entry.id === itemId);
  if (!item) return initializeDialogueMemory(gamePackage, save);
  let next = initializeDialogueMemory(gamePackage, save);
  for (const topicId of item.discover_topic_ids || []) {
    next = discoverDialogueTopic(gamePackage, next, topicId, `item:${itemId}`).save;
  }
  for (const dynamicId of item.discover_dynamic_topic_ids || []) {
    next = discoverDynamicDialogueTopic(gamePackage, next, dynamicId, `item:${itemId}`).save;
  }
  return next;
};

export const discoverMapDialogueTopics = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): PlaySave => {
  const map = gamePackage.maps.find((entry) => entry.id === mapId);
  if (!map) return initializeDialogueMemory(gamePackage, save);
  let next = initializeDialogueMemory(gamePackage, save);
  for (const topicId of map.discover_topic_ids || []) {
    next = discoverDialogueTopic(gamePackage, next, topicId, `location:${mapId}`).save;
  }
  for (const dynamicId of map.discover_dynamic_topic_ids || []) {
    next = discoverDynamicDialogueTopic(gamePackage, next, dynamicId, `location:${mapId}`).save;
  }
  return next;
};

const dialogueHasTopic = (
  dialogue: DialogueData,
  ref: DialogueTopicRef,
  memory: DialogueMemoryState,
) => (dialogue.responses || []).some((response) => responseTopicMatches(response, ref, memory));

export const isDialogueTopicChanged = (options: {
  gamePackage: GamePackage;
  save: PlaySave;
  dialogueId: string;
  topic: DialogueTopicRef;
  participantKey?: string;
}): boolean => {
  const save = initializeDialogueMemory(options.gamePackage, options.save);
  const participantKey = options.participantKey || options.dialogueId;
  const key = topicRefKey(options.topic);
  const history = getDialogueTopicHistory(save, participantKey, key);
  if (history.ask_count < 1) return false;
  const resolved = resolveKeywordDialogueResponse({ ...options, save, participantKey });
  return Boolean(resolved && !history.heard_response_ids.includes(resolved.response.id));
};

export const getKnownDialogueTopics = (options: {
  gamePackage: GamePackage;
  save: PlaySave;
  dialogueId: string;
  participantKey?: string;
  localTopicIds?: string[];
  localDynamicTopicIds?: string[];
}): KnownDialogueTopic[] => {
  const save = initializeDialogueMemory(options.gamePackage, options.save);
  const dialogue = options.gamePackage.dialogue.find((entry) => entry.id === options.dialogueId);
  if (!dialogue) return [];
  const memory = save.dialogue_memory!;
  const keywords = keywordMapWithBuiltins(options.gamePackage);
  const knownIds = new Set([
    ...Object.entries(memory.campaign_topics).filter(([, record]) => record.known).map(([id]) => id),
    ...Object.entries(memory.expedition_topics).filter(([, record]) => record.known).map(([id]) => id),
    ...(options.localTopicIds || []),
    ...(dialogue.action_topic_ids || []),
  ]);
  const staticTopics: KnownDialogueTopic[] = [...knownIds].flatMap((id) => {
    const keyword = keywords.get(id);
    if (!keyword) return [];
    const ref: DialogueTopicRef = { kind: "static", topicId: id };
    return [{
      key: id,
      ref,
      displayLabel: displayKeywordLabel(keyword),
      category: keyword.category,
      scope: keyword.scope,
      important: keyword.important,
      actionKind: keyword.action_kind,
      relevant: dialogueHasTopic(dialogue, ref, memory) || (dialogue.action_topic_ids || []).includes(id),
      changed: isDialogueTopicChanged({ ...options, save, topic: ref }),
    }];
  });
  const localDynamic = new Set(options.localDynamicTopicIds || []);
  const dynamicTopics: KnownDialogueTopic[] = Object.values(memory.dynamic_topics)
    .filter((topic) => topic.known || localDynamic.has(topic.id))
    .map((topic) => {
      const ref: DialogueTopicRef = { kind: "dynamic", dynamicTopicId: topic.id };
      const keyword = keywords.get(topic.keyword_id);
      return {
        key: `dynamic:${topic.id}`,
        ref,
        displayLabel: topic.display_name,
        category: (topic.category || keyword?.category || "people") as DialogueKeywordCategory,
        scope: topic.scope,
        important: keyword?.important || false,
        actionKind: keyword?.action_kind,
        relevant: dialogueHasTopic(dialogue, ref, memory),
        changed: isDialogueTopicChanged({ ...options, save, topic: ref }),
      };
    });
  return [...staticTopics, ...dynamicTopics].sort((left, right) =>
    Number(right.relevant) - Number(left.relevant) ||
    Number(right.changed) - Number(left.changed) ||
    Number(right.important) - Number(left.important) ||
    left.category.localeCompare(right.category) ||
    left.displayLabel.localeCompare(right.displayLabel),
  );
};

const stableToken = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "entry";

const legacyPronounActionLabel = (text: string): string | undefined => {
  const match = text.trim().match(
    /^(open|read|use|take|show|inspect|examine|activate|start|run|raise|reveal|grant|restore|hit|push|pull|throw|break|stack|hack|attend|console)\s+(?:it|this|that|one)[.!?]*$/i,
  );
  if (!match) return undefined;
  return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
};

const displayKeywordLabel = (keyword: DialogueKeywordData): string => {
  if (!/^(?:it|this|that|one)$/i.test(keyword.display_label.trim())) {
    return keyword.display_label;
  }
  const migratedSource = keyword.description?.match(/^Migrated from:\s*(.+)$/i)?.[1];
  return (migratedSource && legacyPronounActionLabel(migratedSource)) || keyword.display_label;
};

const legacyActionTopic = (text: string): string | undefined => {
  const normalized = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (/^(close|goodbye|understood|got it|back|later|begin)$/.test(normalized)) return "action:goodbye";
  if (/^trade/.test(normalized)) return "action:trade";
  if (/^(join me|recruit)/.test(normalized)) return "action:recruit";
  if (/^(go home|stay here|wait here|dismiss)/.test(normalized)) return "action:dismiss";
  if (/^show (an )?item/.test(normalized)) return "action:show_item";
  if (/^silence$/.test(normalized)) return "action:silence";
  if (/^console/.test(normalized)) return "action:console";
  if (/^attend/.test(normalized)) return "action:attend";
  if (/^(leave|step through)/.test(normalized)) return "action:leave";
  return undefined;
};

const neutralizeLegacyChoice = (text: string, fallbackIndex: number) => {
  const trimmed = text.trim();
  const pronounAction = legacyPronounActionLabel(trimmed);
  if (pronounAction) return { label: pronounAction, ambiguous: false };
  const question = trimmed.match(/^(?:what (?:can you tell me|do you know) about|can you tell me about|tell me about)\s+(.+?)[?.]*$/i);
  if (question) return { label: question[1].trim(), ambiguous: false };
  let label = trimmed
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/^→\s*/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/^I carry (?:an?\s+)?/i, "")
    .replace(/^The ([A-Za-z]+) respect me$/i, "$1")
    .replace(/^It is past noon$/i, "After noon")
    .replace(/^(?:Start|Read|Run|Raise|Open|Reveal|Grant|Heal and restore)\s+(?:the\s+)?/i, "")
    .trim();
  const words = label.split(/\s+/).filter(Boolean);
  const performative = /^(i|we|you)\b|\b(forgive|promise|sorry|love|hate)\b/i.test(trimmed);
  const ambiguous = performative || words.length > 6 || label.length === 0;
  if (ambiguous) label = `Review topic ${fallbackIndex + 1}`;
  return { label, ambiguous };
};

const combineLegacyCondition = (
  option: DialogueData["nodes"][number]["options"][number],
): ConditionData | undefined => {
  const conditions: ConditionData[] = [];
  if (option.required_quest && option.required_quest_state) {
    conditions.push({ quest: option.required_quest, quest_state: option.required_quest_state });
  }
  if (option.required_switch) {
    conditions.push({ switch: option.required_switch, switch_value: option.required_switch_value ?? true });
  }
  if (option.condition) conditions.push(option.condition);
  if (!conditions.length) return undefined;
  return conditions.length === 1 ? conditions[0] : { all: conditions };
};

export interface LegacyDialogueMigrationResult {
  package: GamePackage;
  issues: DialogueValidationIssue[];
  migratedDialogueIds: string[];
}

export const migrateLegacyDialoguePackage = (
  source: GamePackage,
): LegacyDialogueMigrationResult => {
  const keywords = new Map(ensureBuiltinDialogueKeywords(source.keywords || []).map((entry) => [entry.id, entry]));
  const issues: DialogueValidationIssue[] = [];
  const migratedDialogueIds: string[] = [];
  const dialogue = source.dialogue.map((entry) => {
    if (entry.format === "keyword_v1" || (entry.responses || []).length > 0 || entry.nodes.length === 0) return entry;
    migratedDialogueIds.push(entry.id);
    const originalNodes = structuredClone(entry.nodes);
    const topicsByNode = new Map<string, string[]>();
    entry.nodes.forEach((node) => {
      const topicIds = node.options.map((option, optionIndex) => {
        const actionId = legacyActionTopic(option.text);
        if (actionId) {
          if (/^(understood|got it|back|later|begin)/i.test(option.text.trim())) {
            issues.push({
              severity: "warning",
              code: "DIALOGUE_MIGRATION_AMBIGUOUS_ACTION",
              path: `dialogue.${entry.id}.nodes.${node.id}.options.${optionIndex}`,
              message: `“${option.text}” was mapped to Goodbye and requires author review.`,
            });
          }
          return actionId;
        }
        const topicId = `legacy:${stableToken(entry.id)}:${stableToken(node.id)}:${optionIndex + 1}`;
        const neutral = neutralizeLegacyChoice(option.text, optionIndex);
        keywords.set(topicId, {
          id: topicId,
          display_label: neutral.label,
          category: "subjects",
          scope: "conversation",
          dynamic_capable: false,
          known_by_default: false,
          important: false,
          description: `Migrated from: ${option.text}`,
        });
        if (neutral.ambiguous) {
          issues.push({
            severity: "warning",
            code: "DIALOGUE_MIGRATION_AMBIGUOUS_PLAYER_LINE",
            path: `dialogue.${entry.id}.nodes.${node.id}.options.${optionIndex}`,
            message: `“${option.text}” could not be safely reduced to a neutral subject.`,
          });
        }
        return topicId;
      });
      topicsByNode.set(node.id, topicIds);
    });

    const responses: DialogueResponseData[] = [];
    entry.nodes.forEach((node, nodeIndex) => {
      responses.push({
        id: `legacy_opening:${stableToken(entry.id)}:${stableToken(node.id)}`,
        entry_node_id: node.id,
        role: "opening",
        speaker: node.speaker,
        text: node.text,
        priority: node.id === entry.nodes[0]?.id ? 10 : 0,
        mentions: [],
        unlock_topic_ids: [],
        unlock_dynamic_topic_ids: [],
        context_topic_ids: topicsByNode.get(node.id) || [],
        context_dynamic_topic_ids: [],
        set_switches: [],
        effects_repeatable: false,
        end_conversation: false,
        scene_image_url: node.scene_image_url,
        scene_image_alt: node.scene_image_alt,
        type: node.type,
        attend_node: node.attend_node,
      });
      node.options.forEach((option, optionIndex) => {
        const topicId = topicsByNode.get(node.id)?.[optionIndex];
        const target = option.next_node_id
          ? entry.nodes.find((candidate) => candidate.id === option.next_node_id)
          : undefined;
        if (!target) {
          issues.push({
            severity: "warning",
            code: "DIALOGUE_MIGRATION_MISSING_NPC_REPLY",
            path: `dialogue.${entry.id}.nodes.${node.id}.options.${optionIndex}`,
            message: `“${option.text}” ended the legacy graph without an authored NPC reply; effects were preserved.`,
          });
        }
        responses.push({
          id: `legacy_response:${stableToken(entry.id)}:${stableToken(node.id)}:${optionIndex + 1}`,
          topic_id: topicId,
          role: "fallback",
          speaker: target?.speaker || node.speaker,
          text: target?.text || "",
          // Legacy nodes were separate branches. Preserve their authored order
          // as a deterministic priority so identical close/fallback actions
          // from different nodes do not become an ambiguous flat topic pair.
          priority: -nodeIndex,
          condition: combineLegacyCondition(option),
          mentions: [],
          unlock_topic_ids: [],
          unlock_dynamic_topic_ids: [],
          context_topic_ids: target ? topicsByNode.get(target.id) || [] : [],
          context_dynamic_topic_ids: [],
          set_switches: [
            ...(option.set_switch ? [{ switch_id: option.set_switch, switch_value: option.set_switch_value }] : []),
            ...(option.set_switches || []),
          ],
          set_quest_id: option.trigger_quest,
          set_quest_state: option.trigger_quest_state,
          trigger_cutscene_id: option.trigger_cutscene,
          effects_repeatable: true,
          end_conversation: !option.next_node_id,
          scene_image_url: target?.scene_image_url,
          scene_image_alt: target?.scene_image_alt,
          type: target?.type,
          attend_node: target?.attend_node,
        });
      });
    });
    const ownIssues = issues.filter((issue) => issue.path.startsWith(`dialogue.${entry.id}.`));
    return {
      ...entry,
      format: "keyword_v1" as const,
      speaker: entry.nodes[0]?.speaker || entry.display_name,
      nodes: [],
      responses,
      initial_topic_ids: topicsByNode.get(entry.nodes[0]?.id || "") || [],
      initial_dynamic_topic_ids: [],
      action_topic_ids: Array.from(new Set([
        "action:goodbye",
        ...responses.map((response) => response.topic_id).filter((id): id is string => Boolean(id?.startsWith("action:"))),
      ])),
      legacy_migration: {
        status: ownIssues.length ? "review_required" as const : "ready" as const,
        migrated_at: "1970-01-01T00:00:00.000Z",
        source_format: "legacy_tree" as const,
        issues: ownIssues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        })),
        original_nodes: originalNodes,
      },
    };
  });
  return {
    package: { ...source, keywords: [...keywords.values()], dialogue },
    issues,
    migratedDialogueIds,
  };
};

export const formatLegacyDialogueMigrationReport = (
  result: LegacyDialogueMigrationResult,
) => {
  const lines = [
    `Keyword dialogue migration: ${result.migratedDialogueIds.length} dialogue(s) converted.`,
    `Original nodes retained in each dialogue's legacy_migration.original_nodes backup.`,
  ];
  result.issues.forEach((issue) => lines.push(`${issue.severity.toUpperCase()} ${issue.code} ${issue.path}: ${issue.message}`));
  return lines.join("\n");
};

const stableConditionSignature = (condition?: ConditionData) => {
  if (!condition) return "always";
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalize(entry)]));
  };
  return JSON.stringify(normalize(condition));
};

export const validateKeywordDialoguePackage = (
  gamePackage: GamePackage,
): DialogueValidationIssue[] => {
  const issues: DialogueValidationIssue[] = [];
  const keywordIds = new Set<string>();
  ensureBuiltinDialogueKeywords(gamePackage.keywords || []).forEach((keyword, index) => {
    if (keywordIds.has(keyword.id)) issues.push({ severity: "error", code: "DIALOGUE_DUPLICATE_KEYWORD", path: `keywords.${index}.id`, message: `Duplicate keyword ID ${keyword.id}.` });
    keywordIds.add(keyword.id);
  });
  const dynamicIds = new Set<string>();
  (gamePackage.dynamic_topics || []).forEach((topic, index) => {
    if (dynamicIds.has(topic.id)) issues.push({ severity: "error", code: "DIALOGUE_DUPLICATE_DYNAMIC_TOPIC", path: `dynamic_topics.${index}.id`, message: `Duplicate dynamic topic ID ${topic.id}.` });
    dynamicIds.add(topic.id);
    if (!keywordIds.has(topic.keyword_id)) issues.push({ severity: "error", code: "DIALOGUE_DYNAMIC_KEYWORD_MISSING", path: `dynamic_topics.${index}.keyword_id`, message: `Dynamic topic ${topic.id} references missing keyword ${topic.keyword_id}.` });
    const definition = (gamePackage.keywords || []).find((keyword) => keyword.id === topic.keyword_id);
    if (definition && !definition.dynamic_capable) issues.push({ severity: "warning", code: "DIALOGUE_DYNAMIC_KEYWORD_NOT_CAPABLE", path: `dynamic_topics.${index}.keyword_id`, message: `Keyword ${topic.keyword_id} is not marked dynamic-capable.` });
  });
  gamePackage.dialogue.forEach((dialogue, dialogueIndex) => {
    const path = `dialogue.${dialogueIndex}`;
    if (dialogue.format !== "keyword_v1") {
      issues.push({ severity: "warning", code: "DIALOGUE_LEGACY_FORMAT", path: `${path}.format`, message: `${dialogue.id} still requires keyword migration.` });
      return;
    }
    const responseIds = new Set<string>();
    const responses = dialogue.responses || [];
    responses.forEach((response, responseIndex) => {
      const owner = `${path}.responses.${responseIndex}`;
      if (responseIds.has(response.id)) issues.push({ severity: "error", code: "DIALOGUE_DUPLICATE_RESPONSE", path: `${owner}.id`, message: `Duplicate response ID ${response.id}.` });
      responseIds.add(response.id);
      if (response.role !== "opening" && !response.topic_id && !response.dynamic_topic_id) issues.push({ severity: "error", code: "DIALOGUE_RESPONSE_TOPIC_MISSING", path: owner, message: `Response ${response.id} has no topic.` });
      if (response.topic_id && !keywordIds.has(response.topic_id)) issues.push({ severity: "error", code: "DIALOGUE_RESPONSE_TOPIC_INVALID", path: `${owner}.topic_id`, message: `Response ${response.id} references missing topic ${response.topic_id}.` });
      if (response.dynamic_topic_id && !dynamicIds.has(response.dynamic_topic_id)) issues.push({ severity: "error", code: "DIALOGUE_RESPONSE_DYNAMIC_TOPIC_INVALID", path: `${owner}.dynamic_topic_id`, message: `Response ${response.id} references missing dynamic topic ${response.dynamic_topic_id}.` });
      response.unlock_topic_ids.forEach((id) => { if (!keywordIds.has(id)) issues.push({ severity: "error", code: "DIALOGUE_UNLOCK_TOPIC_INVALID", path: `${owner}.unlock_topic_ids`, message: `Response ${response.id} unlocks missing topic ${id}.` }); });
      response.unlock_dynamic_topic_ids.forEach((id) => { if (!dynamicIds.has(id)) issues.push({ severity: "error", code: "DIALOGUE_UNLOCK_DYNAMIC_TOPIC_INVALID", path: `${owner}.unlock_dynamic_topic_ids`, message: `Response ${response.id} unlocks missing dynamic topic ${id}.` }); });
      response.mentions.forEach((mention, mentionIndex) => {
        if (!mention.topic_id && !mention.dynamic_topic_id) issues.push({ severity: "error", code: "DIALOGUE_MENTION_TOPIC_MISSING", path: `${owner}.mentions.${mentionIndex}`, message: `Mention “${mention.phrase}” has no stable topic reference.` });
        if (mention.topic_id && !keywordIds.has(mention.topic_id)) issues.push({ severity: "error", code: "DIALOGUE_MENTION_TOPIC_INVALID", path: `${owner}.mentions.${mentionIndex}.topic_id`, message: `Mention references missing topic ${mention.topic_id}.` });
        if (mention.dynamic_topic_id && !dynamicIds.has(mention.dynamic_topic_id)) issues.push({ severity: "error", code: "DIALOGUE_MENTION_DYNAMIC_TOPIC_INVALID", path: `${owner}.mentions.${mentionIndex}.dynamic_topic_id`, message: `Mention references missing dynamic topic ${mention.dynamic_topic_id}.` });
        if (mention.phrase && !response.text.includes(mention.phrase)) issues.push({ severity: "warning", code: "DIALOGUE_MENTION_PHRASE_ABSENT", path: `${owner}.mentions.${mentionIndex}.phrase`, message: `Highlighted phrase “${mention.phrase}” is not present in response ${response.id}.` });
      });
    });
    const groups = new Map<string, DialogueResponseData[]>();
    responses.filter((response) => response.role !== "opening").forEach((response) => {
      const key = response.dynamic_topic_id ? `dynamic:${response.dynamic_topic_id}` : response.topic_id || "missing";
      groups.set(key, [...(groups.get(key) || []), response]);
    });
    groups.forEach((responses, topicKey) => {
      const fallback = responses.some((response) => response.role === "fallback" || (response.role === "normal" && !response.condition && !response.shown_item_id && !response.shown_item_category && !response.shown_item_blueprint_id));
      if (!fallback) issues.push({ severity: "warning", code: "DIALOGUE_FALLBACK_MISSING", path: `${path}.responses`, message: `${dialogue.id} has no general fallback for ${topicKey}.` });
      const signatures = new Map<string, string>();
      responses.forEach((response) => {
        const signature = [response.priority, response.role, stableConditionSignature(response.condition), response.shown_item_id || "", response.shown_item_category || "", response.shown_item_blueprint_id || ""].join("|");
        const prior = signatures.get(signature);
        if (prior) issues.push({ severity: "warning", code: "DIALOGUE_DUPLICATE_PRIORITY_CONDITION", path: `${path}.responses`, message: `${prior} and ${response.id} have indistinguishable priority and conditions; stable ID will break the tie.` });
        else signatures.set(signature, response.id);
      });
    });
    if (!responses.some((response) => response.role === "opening")) issues.push({ severity: "error", code: "DIALOGUE_OPENING_MISSING", path: `${path}.responses`, message: `${dialogue.id} has no reachable opening response.` });
  });
  return issues;
};
