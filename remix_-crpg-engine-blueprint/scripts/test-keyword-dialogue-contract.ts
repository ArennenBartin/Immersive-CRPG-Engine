import assert from "node:assert/strict";
import {
  GamePackageSchema,
  createEmptyGamePackage,
  type GamePackage,
} from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";
import {
  beginKeywordConversation,
  beginNewDialogueExpedition,
  createRuntimeDynamicDialogueTopic,
  discoverDialogueTopic,
  discoverDocumentDialogueTopics,
  discoverDynamicDialogueTopic,
  discoverItemDialogueTopics,
  formatLegacyDialogueMigrationReport,
  getDialogueTopicHistory,
  getKnownDialogueTopics,
  initializeDialogueMemory,
  isDialogueTopicChanged,
  migrateLegacyDialoguePackage,
  resolveKeywordDialogueResponse,
  selectKeywordDialogueTopic,
  shouldCloseKeywordConversationImmediately,
  validateKeywordDialoguePackage,
  type DialogueTopicRef,
} from "../src/engine-core/keywordDialogue";
import { dispatchV1SelectDialogueTopic } from "../src/engine-core/v1Runtime";
import {
  migratePlaySaveV1ToV2,
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";
import {
  normalizePackageImportPayload,
  normalizePackageImportPayloadWithReport,
  serializePackageForExport,
} from "../src/store/engineStore";
import {
  buildSaveSlotPayload,
  normalizeSaveSlotPayload,
  usePlayStore,
} from "../src/store/playStore";
import { auditGamePackageReferences } from "../src/generation-facing/referenceAudit";

const DIALOGUE_ID = "dialogue:keyword-contract";
const PARTICIPANT_ID = "npc:mike";
const CISTERN: DialogueTopicRef = { kind: "static", topicId: "topic:cistern" };
const MARA: DialogueTopicRef = { kind: "dynamic", dynamicTopicId: "dynamic:mara-vale" };

const base = createEmptyGamePackage();

const gamePackage = GamePackageSchema.parse({
  ...base,
  metadata: {
    ...base.metadata,
    title: "Keyword Dialogue Contract",
    version: "keyword-contract-v1",
  },
  switches: {
    ...base.switches,
    cistern_heard: false,
    mara_found: false,
    case_seen: false,
    effect_once: false,
    effect_repeat: false,
    priority_ready: false,
  },
  keywords: [
    { id: "topic:cistern", display_label: "Old cistern", category: "places", scope: "expedition" },
    { id: "topic:mara", display_label: "Mara Vale", category: "people", scope: "campaign" },
    { id: "topic:intercessor", display_label: "Intercessor", category: "intercessors", scope: "campaign", dynamic_capable: true },
    { id: "topic:local-weather", display_label: "The rain", category: "events", scope: "conversation" },
    { id: "topic:case-origin", display_label: "Red case", category: "objects", scope: "campaign" },
    { id: "topic:evidence", display_label: "Evidence", category: "objects", scope: "campaign", known_by_default: true },
    { id: "topic:priority", display_label: "The expedition", category: "events", scope: "expedition", known_by_default: true },
    { id: "topic:followup", display_label: "What came after", category: "events", scope: "expedition", known_by_default: true },
    { id: "topic:effect-once", display_label: "One promise", category: "beliefs", scope: "expedition", known_by_default: true },
    { id: "topic:effect-repeat", display_label: "Repeatable rite", category: "beliefs", scope: "expedition", known_by_default: true },
  ],
  dynamic_topics: [
    {
      id: "dynamic:mara-vale",
      keyword_id: "topic:intercessor",
      record_id: "intercessor-record:77",
      display_name: "Mara Vale",
      category: "intercessors",
      scope: "campaign",
      source: "document:field-log",
      known_by_default: false,
      response_associations: {
        [DIALOGUE_ID]: ["mara_before", "mara_after"],
      },
    },
  ],
  entities: [
    ...base.entities,
    {
      id: PARTICIPANT_ID,
      display_name: "Mike",
      dialogue_id: DIALOGUE_ID,
      is_npc: true,
      max_hp: 12,
      max_mp: 0,
      attack: 2,
      defense: 1,
      speed: 8,
      skills: [],
    },
    {
      id: "npc:companion",
      display_name: "Pell",
      is_npc: true,
      max_hp: 14,
      max_mp: 0,
      attack: 3,
      defense: 2,
      speed: 8,
      skills: [],
    },
  ],
  items: [
    ...base.items,
    {
      id: "item:red-case",
      display_name: "Red survey case",
      category: "key",
      discover_topic_ids: ["topic:case-origin"],
    },
  ],
  documents: [
    ...base.documents,
    {
      id: "document:field-log",
      display_name: "Waterlogged field log",
      content: "Mara Vale signed the final survey line.",
      discover_topic_ids: ["topic:mara"],
      discover_dynamic_topic_ids: ["dynamic:mara-vale"],
    },
  ],
  quests: [
    ...base.quests,
    {
      id: "quest:mara",
      display_name: "The missing surveyor",
      description: "Learn what happened below the cistern.",
      objectives: [],
    },
  ],
  dialogue: [
    ...base.dialogue,
    {
      id: DIALOGUE_ID,
      display_name: "Mike's subjects",
      format: "keyword_v1",
      speaker: "Mike",
      nodes: [],
      initial_topic_ids: ["topic:local-weather"],
      action_topic_ids: [
        "action:silence",
        "action:show_item",
        "action:recruit",
        "action:goodbye",
      ],
      responses: [
        {
          id: "opening",
          role: "opening",
          speaker: "Mike",
          text: "The last survey stopped at the Old cistern.",
          mentions: [
            { phrase: "Old cistern", topic_id: "topic:cistern", discover: true },
          ],
          context_topic_ids: ["topic:cistern"],
        },
        {
          id: "cistern_first",
          topic_id: "topic:cistern",
          role: "first",
          text: "Mara went below it once. Nobody followed.",
          set_switches: [{ switch_id: "cistern_heard", switch_value: true }],
          set_quest_id: "quest:mara",
          set_quest_state: "started",
        },
        {
          id: "cistern_repeat",
          topic_id: "topic:cistern",
          role: "repeat",
          text: "It is still below the east pump-house.",
        },
        {
          id: "cistern_fallback",
          topic_id: "topic:cistern",
          role: "fallback",
          priority: -10,
          text: "That is all I know about it.",
        },
        {
          id: "mara_before",
          dynamic_topic_id: "dynamic:mara-vale",
          role: "normal",
          priority: 20,
          condition: { switch: "mara_found", switch_value: false },
          text: "She made it farther than the others. That is all I know.",
        },
        {
          id: "mara_after",
          dynamic_topic_id: "dynamic:mara-vale",
          role: "normal",
          priority: 30,
          condition: { switch: "mara_found", switch_value: true },
          text: "She is still down there, asking after the red case.",
        },
        {
          id: "intercessor_fallback",
          topic_id: "topic:intercessor",
          role: "fallback",
          text: "I do not know that Intercessor.",
        },
        {
          id: "state_specific",
          topic_id: "topic:evidence",
          role: "normal",
          priority: 50,
          condition: {
            all: [
              { switch: "mara_found", switch_value: true },
              { quest: "quest:mara", quest_state: "found" },
              { relationship: PARTICIPANT_ID, relationship_gte: 5 },
              { current_map: base.metadata.start_map_id },
              { current_expedition: "expedition:contract" },
              { current_intercessor: "intercessor:current" },
              { prior_intercessor: "intercessor:prior" },
              { party_contains: "npc:companion" },
              { has_item: "item:red-case" },
              { read_document: "document:field-log" },
              { known_topic: "topic:mara" },
              {
                entity_state_id: PARTICIPANT_ID,
                entity_state_field: "witness_state",
                entity_state_value: "witnessed",
              },
            ],
          },
          text: "With all of that, the evidence agrees.",
        },
        {
          id: "state_fallback",
          topic_id: "topic:evidence",
          role: "fallback",
          text: "The pieces do not agree yet.",
        },
        {
          id: "priority_high",
          topic_id: "topic:priority",
          role: "normal",
          priority: 20,
          condition: { switch: "priority_ready", switch_value: true },
          text: "The newest account takes precedence.",
        },
        {
          id: "priority_low",
          topic_id: "topic:priority",
          role: "normal",
          priority: 10,
          condition: { quest: "quest:mara", quest_state: "found" },
          text: "The older account is still plausible.",
        },
        {
          id: "priority_fallback",
          topic_id: "topic:priority",
          role: "fallback",
          text: "There is no useful account yet.",
        },
        {
          id: "followup_ready",
          topic_id: "topic:followup",
          role: "normal",
          priority: 10,
          condition: {
            topic_asked: "topic:cistern",
            topic_asked_dialogue: PARTICIPANT_ID,
            topic_ask_count_gte: 2,
          },
          text: "Since you keep returning to it: Mara left a second route.",
        },
        {
          id: "followup_fallback",
          topic_id: "topic:followup",
          role: "fallback",
          text: "Ask me after you have considered the cistern.",
        },
        {
          id: "effect_once",
          topic_id: "topic:effect-once",
          role: "normal",
          text: "I will mark it once.",
          set_switches: [{ switch_id: "effect_once", switch_value: true }],
          effects_repeatable: false,
        },
        {
          id: "effect_repeat",
          topic_id: "topic:effect-repeat",
          role: "normal",
          text: "I will mark it whenever you ask.",
          set_switches: [{ switch_id: "effect_repeat", switch_value: true }],
          effects_repeatable: true,
        },
        {
          id: "silence_response",
          topic_id: "action:silence",
          role: "normal",
          text: "Yeah. I know.",
        },
        {
          id: "recruit_response",
          topic_id: "action:recruit",
          role: "normal",
          text: "Pell packs without another word.",
        },
        {
          id: "show_case_first",
          topic_id: "action:show_item",
          role: "normal",
          priority: 50,
          shown_item_id: "item:red-case",
          shown_item_previously_shown: false,
          text: "That is Mara's case. The red paint was hers.",
          unlock_topic_ids: ["topic:case-origin"],
          set_switches: [{ switch_id: "case_seen", switch_value: true }],
        },
        {
          id: "show_case_repeat",
          topic_id: "action:show_item",
          role: "normal",
          priority: 50,
          shown_item_id: "item:red-case",
          shown_item_previously_shown: true,
          text: "I have seen it. Put it somewhere dry.",
        },
        {
          id: "show_item_fallback",
          topic_id: "action:show_item",
          role: "fallback",
          text: "I do not recognize it.",
        },
      ],
    },
  ],
});

const makeSave = (): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: gamePackage.metadata.start_map_id,
  player: { cell: [0, 0], facing: [0, 1] },
  playerStats: {
    hp: 24,
    max_hp: 24,
    mp: 12,
    max_mp: 12,
    attack: 4,
    defense: 2,
    speed: 8,
    energy: 10,
  },
  known_skills: [],
  flags: { ...gamePackage.switches },
  variables: {},
  relationships: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 8 * 60,
  faction_rep: {},
  read_documents: [],
  explored_cells: {},
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
});

const responseId = (
  pkg: GamePackage,
  save: PlaySave,
  topic: DialogueTopicRef,
  shownItemId?: string,
) => resolveKeywordDialogueResponse({
  gamePackage: pkg,
  save,
  dialogueId: DIALOGUE_ID,
  topic,
  participantKey: PARTICIPANT_ID,
  shownItemId,
})?.response.id;

const jsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Discovery, highlighted mentions, and first/repeat behavior.
const opening = beginKeywordConversation({
  gamePackage,
  save: makeSave(),
  dialogueId: DIALOGUE_ID,
  participantKey: PARTICIPANT_ID,
  participantEntityId: PARTICIPANT_ID,
});
assert.equal(opening.ok, true);
assert.equal(opening.response?.id, "opening");
assert.equal(opening.response?.mentions[0]?.phrase, "Old cistern");
assert.equal(opening.response?.mentions[0]?.topic_id, "topic:cistern");
assert.equal(opening.save.dialogue_memory?.expedition_topics["topic:cistern"]?.known, true);
assert.ok(opening.localTopicIds.includes("topic:local-weather"));

const firstCistern = selectKeywordDialogueTopic({
  gamePackage,
  save: opening.save,
  dialogueId: DIALOGUE_ID,
  topic: CISTERN,
  participantKey: PARTICIPANT_ID,
});
assert.equal(firstCistern.response?.id, "cistern_first");
assert.equal(firstCistern.save.flags.cistern_heard, true);
assert.equal(firstCistern.save.quests["quest:mara"], "started");
const repeatCistern = selectKeywordDialogueTopic({
  gamePackage,
  save: firstCistern.save,
  dialogueId: DIALOGUE_ID,
  topic: CISTERN,
  participantKey: PARTICIPANT_ID,
});
assert.equal(repeatCistern.response?.id, "cistern_repeat");
assert.equal(getDialogueTopicHistory(repeatCistern.save, PARTICIPANT_ID, "topic:cistern").ask_count, 2);
assert.equal(
  responseId(gamePackage, repeatCistern.save, { kind: "static", topicId: "topic:followup" }),
  "followup_ready",
  "topic ask counts must be available to later conditions for the same participant",
);

// Stable identities, scopes, and expedition reset rules.
let scoped = discoverDialogueTopic(gamePackage, makeSave(), "topic:mara", "test:campaign").save;
scoped = discoverDialogueTopic(gamePackage, scoped, "topic:cistern", "test:expedition").save;
const localDiscovery = discoverDialogueTopic(gamePackage, scoped, "topic:local-weather", "test:local");
assert.equal(localDiscovery.local, true);
assert.equal(localDiscovery.save.dialogue_memory?.campaign_topics["topic:local-weather"], undefined);
assert.equal(localDiscovery.save.dialogue_memory?.expedition_topics["topic:local-weather"], undefined);
const scopedWithDynamic = createRuntimeDynamicDialogueTopic(gamePackage, scoped, {
  id: "dynamic:expedition-witness",
  keyword_id: "topic:intercessor",
  record_id: "intercessor-record:expedition-only",
  display_name: "The nameless witness",
  category: "intercessors",
  scope: "expedition",
  source_of_discovery: "runtime:expedition",
  response_associations: {},
  known: true,
});
const nextExpedition = beginNewDialogueExpedition(gamePackage, scopedWithDynamic, "expedition:2");
assert.equal(nextExpedition.dialogue_memory?.campaign_topics["topic:mara"]?.known, true);
assert.equal(nextExpedition.dialogue_memory?.expedition_topics["topic:cistern"], undefined);
assert.equal(nextExpedition.dialogue_memory?.dynamic_topics["dynamic:expedition-witness"], undefined);

const renamedPackage = GamePackageSchema.parse({
  ...gamePackage,
  keywords: gamePackage.keywords.map((topic) =>
    topic.id === "topic:mara" ? { ...topic, display_label: "Mara Vale, Surveyor" } : topic,
  ),
});
const renamedKnown = getKnownDialogueTopics({
  gamePackage: renamedPackage,
  save: scoped,
  dialogueId: DIALOGUE_ID,
  participantKey: PARTICIPANT_ID,
});
assert.equal(
  renamedKnown.find((topic) => topic.key === "topic:mara")?.displayLabel,
  "Mara Vale, Surveyor",
);
assert.ok(scoped.dialogue_memory?.campaign_topics["topic:mara"], "renaming a label must not change save identity");

// Documents/items discover topics without embedding dialogue branches in those systems.
let worldDiscovery = discoverDocumentDialogueTopics(
  gamePackage,
  makeSave(),
  "document:field-log",
);
assert.equal(worldDiscovery.dialogue_memory?.campaign_topics["topic:mara"]?.known, true);
assert.equal(worldDiscovery.dialogue_memory?.dynamic_topics["dynamic:mara-vale"]?.known, true);
worldDiscovery = discoverItemDialogueTopics(gamePackage, worldDiscovery, "item:red-case");
assert.equal(worldDiscovery.dialogue_memory?.campaign_topics["topic:case-origin"]?.known, true);

// Dynamic people bind to exact persistent records even when display names collide.
let dynamicSave = createRuntimeDynamicDialogueTopic(gamePackage, worldDiscovery, {
  id: "dynamic:mara-namesake",
  keyword_id: "topic:intercessor",
  record_id: "intercessor-record:88",
  display_name: "Mara Vale",
  category: "intercessors",
  scope: "campaign",
  source_of_discovery: "runtime:test",
  response_associations: { [DIALOGUE_ID]: ["intercessor_fallback"] },
  known: true,
});
dynamicSave = discoverDynamicDialogueTopic(
  gamePackage,
  dynamicSave,
  "dynamic:mara-vale",
  "test:document",
).save;
assert.equal(dynamicSave.dialogue_memory?.dynamic_topics["dynamic:mara-vale"]?.record_id, "intercessor-record:77");
assert.equal(dynamicSave.dialogue_memory?.dynamic_topics["dynamic:mara-namesake"]?.record_id, "intercessor-record:88");
assert.equal(responseId(gamePackage, dynamicSave, MARA), "mara_before");
assert.equal(
  responseId(gamePackage, dynamicSave, { kind: "dynamic", dynamicTopicId: "dynamic:mara-namesake" }),
  "intercessor_fallback",
);

// Existing world-state conditions and explicit priority resolve deterministically.
let conditioned = discoverDialogueTopic(gamePackage, dynamicSave, "topic:mara", "test:known").save;
conditioned = {
  ...conditioned,
  flags: { ...conditioned.flags, mara_found: true, priority_ready: true },
  quests: { ...conditioned.quests, "quest:mara": "found" },
  relationships: { ...conditioned.relationships, [PARTICIPANT_ID]: 7 },
  inventory: [{ id: "item:red-case", count: 1 }],
  party_members: ["npc:companion"],
  read_documents: ["document:field-log"],
  entity_states: { [PARTICIPANT_ID]: { witness_state: "witnessed" } },
  dialogue_memory: {
    ...conditioned.dialogue_memory!,
    current_expedition_id: "expedition:contract",
    current_intercessor_id: "intercessor:current",
    prior_intercessor_ids: ["intercessor:prior"],
  },
};
assert.equal(responseId(gamePackage, conditioned, { kind: "static", topicId: "topic:evidence" }), "state_specific");
assert.equal(responseId(gamePackage, conditioned, { kind: "static", topicId: "topic:priority" }), "priority_high");

const tiePackage = GamePackageSchema.parse({
  ...gamePackage,
  dialogue: gamePackage.dialogue.map((dialogue) => dialogue.id !== DIALOGUE_ID ? dialogue : {
    ...dialogue,
    responses: [
      ...(dialogue.responses || []),
      { id: "tie_b", topic_id: "topic:priority", role: "normal", priority: 100, condition: { switch: "priority_ready", switch_value: true }, text: "B" },
      { id: "tie_a", topic_id: "topic:priority", role: "normal", priority: 100, condition: { switch: "priority_ready", switch_value: true }, text: "A" },
    ],
  }),
});
assert.equal(responseId(tiePackage, conditioned, { kind: "static", topicId: "topic:priority" }), "tie_a");
assert.ok(validateKeywordDialoguePackage(tiePackage).some((issue) => issue.code === "DIALOGUE_DUPLICATE_PRIORITY_CONDITION"));

// One-time and repeatable response side effects remain distinct.
const onceTopic: DialogueTopicRef = { kind: "static", topicId: "topic:effect-once" };
let once = selectKeywordDialogueTopic({ gamePackage, save: makeSave(), dialogueId: DIALOGUE_ID, topic: onceTopic, participantKey: PARTICIPANT_ID });
assert.equal(once.save.flags.effect_once, true);
once = selectKeywordDialogueTopic({
  gamePackage,
  save: { ...once.save, flags: { ...once.save.flags, effect_once: false } },
  dialogueId: DIALOGUE_ID,
  topic: onceTopic,
  participantKey: PARTICIPANT_ID,
});
assert.equal(once.effectsApplied, false);
assert.equal(once.save.flags.effect_once, false);

const repeatEffectTopic: DialogueTopicRef = { kind: "static", topicId: "topic:effect-repeat" };
let repeatEffect = selectKeywordDialogueTopic({ gamePackage, save: makeSave(), dialogueId: DIALOGUE_ID, topic: repeatEffectTopic, participantKey: PARTICIPANT_ID });
repeatEffect = selectKeywordDialogueTopic({
  gamePackage,
  save: { ...repeatEffect.save, flags: { ...repeatEffect.save.flags, effect_repeat: false } },
  dialogueId: DIALOGUE_ID,
  topic: repeatEffectTopic,
  participantKey: PARTICIPANT_ID,
});
assert.equal(repeatEffect.effectsApplied, true);
assert.equal(repeatEffect.save.flags.effect_repeat, true);

// Silence and practical action topics are subjects of authored NPC responses.
const actionTopics = getKnownDialogueTopics({
  gamePackage,
  save: initializeDialogueMemory(gamePackage, makeSave()),
  dialogueId: DIALOGUE_ID,
  participantKey: PARTICIPANT_ID,
});
assert.equal(actionTopics.find((topic) => topic.key === "action:silence")?.actionKind, "silence");
assert.equal(actionTopics.find((topic) => topic.key === "action:recruit")?.actionKind, "recruit");
const silence = selectKeywordDialogueTopic({
  gamePackage,
  save: makeSave(),
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "action:silence" },
  participantKey: PARTICIPANT_ID,
});
assert.equal(silence.response?.id, "silence_response");
assert.equal(silence.endConversation, false);
const recruit = selectKeywordDialogueTopic({
  gamePackage,
  save: makeSave(),
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "action:recruit" },
  participantKey: PARTICIPANT_ID,
});
assert.equal(recruit.response?.id, "recruit_response");
const goodbye = selectKeywordDialogueTopic({
  gamePackage,
  save: makeSave(),
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "action:goodbye" },
  participantKey: PARTICIPANT_ID,
});
assert.equal(goodbye.ok, true);
assert.equal(goodbye.endConversation, true);
assert.equal(goodbye.response, undefined, "bare Goodbye must end directly without an empty response panel");
assert.equal(goodbye.triggerCutsceneId, undefined);
assert.equal(
  shouldCloseKeywordConversationImmediately({
    endsDialogue: goodbye.endConversation,
    responseText: goodbye.response?.text,
    triggerCutsceneId: goodbye.triggerCutsceneId,
  }),
  true,
);

// Conversation endings have three distinct presentation outcomes: an
// unadorned Goodbye closes immediately, an authored farewell gets exactly one
// final response, and a cutscene-bearing ending hands off after that response.
const authoredEndingPackage = GamePackageSchema.parse({
  ...gamePackage,
  keywords: [
    ...gamePackage.keywords,
    {
      id: "topic:cutscene-handoff",
      display_label: "Begin the handoff",
      category: "actions",
      scope: "conversation",
      known_by_default: true,
      action_kind: "custom",
    },
  ],
  dialogue: gamePackage.dialogue.map((dialogue) => dialogue.id !== DIALOGUE_ID ? dialogue : {
    ...dialogue,
    responses: [
      ...(dialogue.responses || []),
      {
        id: "goodbye_final_response",
        topic_id: "action:goodbye",
        role: "normal",
        text: "Until next time.",
        end_conversation: true,
      },
      {
        id: "cutscene_handoff_response",
        topic_id: "topic:cutscene-handoff",
        role: "normal",
        text: "The pump answers.",
        trigger_cutscene_id: "cut_world_surface_probe",
        end_conversation: true,
      },
    ],
  }),
});
const authoredGoodbye = selectKeywordDialogueTopic({
  gamePackage: authoredEndingPackage,
  save: makeSave(),
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "action:goodbye" },
  participantKey: PARTICIPANT_ID,
});
assert.equal(authoredGoodbye.response?.id, "goodbye_final_response");
assert.equal(authoredGoodbye.response?.text, "Until next time.");
assert.equal(authoredGoodbye.endConversation, true);
assert.equal(authoredGoodbye.triggerCutsceneId, undefined);
assert.equal(
  shouldCloseKeywordConversationImmediately({
    endsDialogue: authoredGoodbye.endConversation,
    responseText: authoredGoodbye.response?.text,
    triggerCutsceneId: authoredGoodbye.triggerCutsceneId,
  }),
  false,
  "an authored farewell remains visible exactly once",
);

const cutsceneHandoff = selectKeywordDialogueTopic({
  gamePackage: authoredEndingPackage,
  save: makeSave(),
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "topic:cutscene-handoff" },
  participantKey: PARTICIPANT_ID,
});
assert.equal(cutsceneHandoff.response?.id, "cutscene_handoff_response");
assert.equal(cutsceneHandoff.endConversation, true);
assert.equal(cutsceneHandoff.triggerCutsceneId, "cut_world_surface_probe");
assert.equal(
  shouldCloseKeywordConversationImmediately({
    endsDialogue: cutsceneHandoff.endConversation,
    responseText: cutsceneHandoff.response?.text,
    triggerCutsceneId: cutsceneHandoff.triggerCutsceneId,
  }),
  false,
  "cutscene handoffs must retain their Continue transition",
);

// The UI owns presentation, while the play store owns whether any dialogue
// remains active. Teardown must clear every keyword-conversation field in one
// state update so React cannot render a second, response-less shell.
usePlayStore.getState().resetRun();
usePlayStore.getState().startDialogue(DIALOGUE_ID, "", {
  participantKey: PARTICIPANT_ID,
  participantEntityId: PARTICIPANT_ID,
});
usePlayStore.getState().updateKeywordConversation({
  responseId: "goodbye_final_response",
  localTopicIds: ["topic:local-weather"],
  localDynamicTopicIds: ["dynamic:mara-vale"],
  recentTopicKeys: ["action:goodbye"],
  shownItemId: "item:red-case",
  ending: true,
});
usePlayStore.getState().endDialogue();
const endedConversation = usePlayStore.getState();
assert.equal(endedConversation.activeDialogueId, null);
assert.equal(endedConversation.activeDialogueNodeId, null);
assert.equal(endedConversation.activeConversationResponseId, null);
assert.equal(endedConversation.activeConversationParticipantKey, null);
assert.equal(endedConversation.activeConversationEntityId, null);
assert.deepEqual(endedConversation.activeConversationLocalTopicIds, []);
assert.deepEqual(endedConversation.activeConversationLocalDynamicTopicIds, []);
assert.deepEqual(endedConversation.activeConversationRecentTopicKeys, []);
assert.equal(endedConversation.activeConversationShownItemId, null);
assert.equal(endedConversation.activeConversationEnding, false);
usePlayStore.getState().resetRun();

// Show-item responses inspect identity/history and never consume the item.
const showTopic: DialogueTopicRef = { kind: "static", topicId: "action:show_item" };
const showStart = { ...makeSave(), inventory: [{ id: "item:red-case", count: 1 }] };
const shownFirst = selectKeywordDialogueTopic({
  gamePackage,
  save: showStart,
  dialogueId: DIALOGUE_ID,
  topic: showTopic,
  participantKey: PARTICIPANT_ID,
  shownItemId: "item:red-case",
});
assert.equal(shownFirst.response?.id, "show_case_first");
assert.deepEqual(shownFirst.save.inventory, showStart.inventory);
assert.equal(shownFirst.save.flags.case_seen, true);
assert.equal(shownFirst.save.dialogue_memory?.campaign_topics["topic:case-origin"]?.known, true);
const shownAgain = selectKeywordDialogueTopic({
  gamePackage,
  save: shownFirst.save,
  dialogueId: DIALOGUE_ID,
  topic: showTopic,
  participantKey: PARTICIPANT_ID,
  shownItemId: "item:red-case",
});
assert.equal(shownAgain.response?.id, "show_case_repeat");
assert.deepEqual(shownAgain.save.inventory, showStart.inventory);

// A state change creates a subtle unread response; hearing it clears the mark.
let changedSave = selectKeywordDialogueTopic({
  gamePackage,
  save: dynamicSave,
  dialogueId: DIALOGUE_ID,
  topic: MARA,
  participantKey: PARTICIPANT_ID,
}).save;
changedSave = { ...changedSave, flags: { ...changedSave.flags, mara_found: true } };
assert.equal(isDialogueTopicChanged({ gamePackage, save: changedSave, dialogueId: DIALOGUE_ID, topic: MARA, participantKey: PARTICIPANT_ID }), true);

// Save V2, named-slot, JSON/browser, and package round trips preserve memory.
const saveJson = JSON.stringify(migratePlaySaveV1ToV2(changedSave));
const restoredSave = unwrapPlaySaveV1(normalizePlaySaveToV2(JSON.parse(saveJson)));
assert.deepEqual(restoredSave.dialogue_memory, jsonValue(changedSave.dialogue_memory));
assert.equal(isDialogueTopicChanged({ gamePackage, save: restoredSave, dialogueId: DIALOGUE_ID, topic: MARA, participantKey: PARTICIPANT_ID }), true);
const slotJson = JSON.stringify(buildSaveSlotPayload(1, changedSave, "2026-07-15T12:00:00.000Z"));
const restoredSlot = normalizeSaveSlotPayload(1, JSON.parse(slotJson));
assert.deepEqual(restoredSlot?.saveData.dialogue_memory, jsonValue(changedSave.dialogue_memory));

const heardChange = selectKeywordDialogueTopic({
  gamePackage,
  save: restoredSave,
  dialogueId: DIALOGUE_ID,
  topic: MARA,
  participantKey: PARTICIPANT_ID,
});
assert.equal(heardChange.response?.id, "mara_after");
assert.equal(isDialogueTopicChanged({ gamePackage, save: heardChange.save, dialogueId: DIALOGUE_ID, topic: MARA, participantKey: PARTICIPANT_ID }), false);

const exported = serializePackageForExport(gamePackage);
const imported = normalizePackageImportPayload(JSON.parse(exported));
for (const keyword of gamePackage.keywords) {
  assert.deepEqual(
    imported.keywords.find((candidate) => candidate.id === keyword.id),
    keyword,
    `package round trip changed keyword ${keyword.id}`,
  );
}
assert.deepEqual(imported.dynamic_topics, gamePackage.dynamic_topics);
assert.deepEqual(
  imported.dialogue.find((dialogue) => dialogue.id === DIALOGUE_ID),
  gamePackage.dialogue.find((dialogue) => dialogue.id === DIALOGUE_ID),
);

// Runtime dispatch and direct resolver consume the same authored response data.
const previewResolution = resolveKeywordDialogueResponse({
  gamePackage,
  save: conditioned,
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "topic:priority" },
  participantKey: PARTICIPANT_ID,
});
const playResolution = dispatchV1SelectDialogueTopic({
  gamePackage,
  save: structuredClone(conditioned),
  dialogueId: DIALOGUE_ID,
  topic: { kind: "static", topicId: "topic:priority" },
  participantKey: PARTICIPANT_ID,
});
assert.equal(playResolution.ok, true, playResolution.reason);
assert.equal(playResolution.outcome?.responseId, previewResolution?.response.id);

// Saves retain response identities, not stale prose or leaked current state.
assert.equal(JSON.stringify(heardChange.save.dialogue_memory).includes("She is still down there"), false);
const revisedPackage = GamePackageSchema.parse({
  ...gamePackage,
  dialogue: gamePackage.dialogue.map((dialogue) => dialogue.id !== DIALOGUE_ID ? dialogue : {
    ...dialogue,
    responses: dialogue.responses?.map((response) =>
      response.id === "mara_after" ? { ...response, text: "Current authored truth, revised." } : response,
    ),
  }),
});
assert.equal(
  resolveKeywordDialogueResponse({
    gamePackage: revisedPackage,
    save: heardChange.save,
    dialogueId: DIALOGUE_ID,
    topic: MARA,
    participantKey: PARTICIPANT_ID,
  })?.response.text,
  "Current authored truth, revised.",
);
assert.equal(
  responseId(gamePackage, { ...heardChange.save, flags: { ...heardChange.save.flags, mara_found: false } }, MARA),
  "mara_before",
  "resolver must re-evaluate current state instead of replaying a stale saved response",
);

// Legacy trees migrate additively, retain backups, and report ambiguous speech.
const legacyPackage = GamePackageSchema.parse({
  ...base,
  dialogue: [
    {
      id: "dialogue:legacy-contract",
      display_name: "Legacy contract",
      nodes: [
        {
          id: "start",
          speaker: "Surveyor",
          text: "What do you need?",
          options: [
            { text: "What can you tell me about the old mine?", next_node_id: "mine" },
            { text: "I forgive you.", next_node_id: "forgiven" },
            { text: "Goodbye" },
            { text: "Open it.", trigger_cutscene: "cut_world_surface_probe" },
          ],
        },
        { id: "mine", speaker: "Surveyor", text: "It flooded.", options: [] },
        { id: "forgiven", speaker: "Surveyor", text: "I did not ask.", options: [] },
      ],
    },
  ],
});
const migrationA = migrateLegacyDialoguePackage(legacyPackage);
const migrationB = migrateLegacyDialoguePackage(legacyPackage);
const migratedDialogue = migrationA.package.dialogue[0];
assert.equal(migratedDialogue.format, "keyword_v1");
assert.equal(migratedDialogue.legacy_migration?.original_nodes[0]?.options[0]?.text, "What can you tell me about the old mine?");
assert.deepEqual(
  migrationA.package.keywords.map((topic) => topic.id),
  migrationB.package.keywords.map((topic) => topic.id),
  "legacy migration must generate deterministic stable topic identities",
);
assert.equal(
  migrationA.package.keywords.find((topic) => topic.description?.includes("old mine"))?.display_label,
  "the old mine",
);
assert.ok(migrationA.issues.some((issue) => issue.code === "DIALOGUE_MIGRATION_AMBIGUOUS_PLAYER_LINE"));
assert.match(formatLegacyDialogueMigrationReport(migrationA), /Original nodes retained/);
const migratedGoodbye = selectKeywordDialogueTopic({
  gamePackage: migrationA.package,
  save: makeSave(),
  dialogueId: "dialogue:legacy-contract",
  topic: { kind: "static", topicId: "action:goodbye" },
  participantKey: "dialogue:legacy-contract",
});
assert.ok(migratedGoodbye.response?.id, "migration preserves a stable response identity");
assert.equal(migratedGoodbye.response?.text, "");
assert.equal(
  shouldCloseKeywordConversationImmediately({
    endsDialogue: migratedGoodbye.endConversation,
    responseText: migratedGoodbye.response?.text,
    triggerCutsceneId: migratedGoodbye.triggerCutsceneId,
  }),
  true,
  "an ID-bearing migrated Goodbye with no text must close without a second panel",
);
const migratedOpenTopic = migrationA.package.keywords.find((topic) =>
  topic.description === "Migrated from: Open it."
);
assert.equal(migratedOpenTopic?.display_label, "Open");
const persistedWeakLabelPackage = GamePackageSchema.parse({
  ...migrationA.package,
  keywords: migrationA.package.keywords.map((topic) =>
    topic.id === migratedOpenTopic?.id ? { ...topic, display_label: "it" } : topic,
  ),
});
assert.equal(
  getKnownDialogueTopics({
    gamePackage: persistedWeakLabelPackage,
    save: makeSave(),
    dialogueId: "dialogue:legacy-contract",
    participantKey: "dialogue:legacy-contract",
    localTopicIds: [migratedOpenTopic!.id],
  }).find((topic) => topic.key === migratedOpenTopic!.id)?.displayLabel,
  "Open",
  "previously persisted pronoun-only migration labels receive a safe runtime presentation repair",
);
const migratedOpen = selectKeywordDialogueTopic({
  gamePackage: migrationA.package,
  save: makeSave(),
  dialogueId: "dialogue:legacy-contract",
  topic: { kind: "static", topicId: migratedOpenTopic!.id },
  participantKey: "dialogue:legacy-contract",
});
assert.ok(migratedOpen.response?.id, "migration preserves the cutscene action response identity");
assert.equal(migratedOpen.response?.text, "");
assert.equal(migratedOpen.triggerCutsceneId, "cut_world_surface_probe");
assert.equal(
  shouldCloseKeywordConversationImmediately({
    endsDialogue: migratedOpen.endConversation,
    responseText: migratedOpen.response?.text,
    triggerCutsceneId: migratedOpen.triggerCutsceneId,
  }),
  true,
  "a blank migrated cutscene action must hand off without an empty Continue panel",
);
const importedMigration = normalizePackageImportPayloadWithReport(legacyPackage);
assert.ok(importedMigration.warnings.some((warning) => warning.code === "legacy_dialogue_detected"));
assert.notEqual(importedMigration.package.dialogue[0]?.format, "keyword_v1");
assert.equal(
  importedMigration.package.dialogue[0]?.nodes[0]?.options[0]?.text,
  "What can you tell me about the old mine?",
  "ordinary import must preserve legacy data until Studio's explicit migration action",
);

// Validation covers invalid references, unreachable fallbacks, and ambiguous priority.
const invalidPackage = GamePackageSchema.parse({
  ...gamePackage,
  dialogue: gamePackage.dialogue.map((dialogue) => dialogue.id !== DIALOGUE_ID ? dialogue : {
    ...dialogue,
    responses: [
      ...(dialogue.responses || []),
      {
        id: "invalid_response",
        topic_id: "topic:missing",
        role: "normal",
        priority: 1,
        condition: { known_topic: "topic:also-missing" },
        text: "Missing highlighted subject.",
        mentions: [{ phrase: "Missing", topic_id: "topic:missing", discover: true }],
        unlock_topic_ids: ["topic:missing"],
        context_dynamic_topic_ids: ["dynamic:missing"],
        shown_item_id: "item:missing",
      },
    ],
  }),
});
const coreValidation = validateKeywordDialoguePackage(invalidPackage);
assert.ok(coreValidation.some((issue) => issue.code === "DIALOGUE_RESPONSE_TOPIC_INVALID"));
assert.ok(coreValidation.some((issue) => issue.code === "DIALOGUE_UNLOCK_TOPIC_INVALID"));
assert.ok(coreValidation.some((issue) => issue.code === "DIALOGUE_MENTION_TOPIC_INVALID"));
assert.ok(coreValidation.some((issue) => issue.code === "DIALOGUE_FALLBACK_MISSING"));
const referenceValidation = auditGamePackageReferences(invalidPackage);
for (const code of [
  "DIALOGUE_RESPONSE_TOPIC_INVALID",
  "DIALOGUE_CONTEXT_DYNAMIC_TOPIC_INVALID",
  "DIALOGUE_SHOWN_ITEM_INVALID",
  "DIALOGUE_CONDITION_TOPIC_INVALID",
]) {
  assert.ok(referenceValidation.issues.some((issue) => issue.code === code), `reference audit omitted ${code}`);
}

console.log(
  "Keyword dialogue contract passed: discovery, scopes, dynamic records, conditions, priority, first/repeat, effects, mentions, silence/actions, show-item, unread state, save/browser/package round trips, migration, parity, validation, and stale-state isolation.",
);
