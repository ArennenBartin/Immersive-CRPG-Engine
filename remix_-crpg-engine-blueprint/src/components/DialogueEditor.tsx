import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  ChevronLeft,
  CircleDot,
  Copy,
  Eye,
  FileClock,
  GitBranch,
  Library,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react";
import { ConditionEditor } from "./ConditionEditor";
import { SwitchPicker } from "./SwitchPicker";
import { useEngineStore } from "../store/engineStore";
import type {
  ConditionData,
  DialogueData,
  DialogueDynamicTopicData,
  DialogueKeywordCategory,
  DialogueKeywordData,
  DialogueKeywordScope,
  DialogueResponseData,
  GamePackage,
} from "../schema/game";
import type { PlaySave } from "../schema/save";
import {
  BUILTIN_DIALOGUE_KEYWORDS,
  createDialogueMemory,
  ensureBuiltinDialogueKeywords,
  formatLegacyDialogueMigrationReport,
  migrateLegacyDialoguePackage,
  resolveKeywordDialogueResponse,
  topicRefKey,
  validateKeywordDialoguePackage,
  type DialogueTopicRef,
  type DialogueValidationIssue,
} from "../engine-core";

type EditorView = "conversations" | "keywords" | "dynamic" | "migration";
type TopicOption = { value: string; label: string; category: string };

const KEYWORD_CATEGORIES: DialogueKeywordCategory[] = [
  "subjects",
  "people",
  "intercessors",
  "places",
  "objects",
  "events",
  "beliefs",
  "actions",
];
const KEYWORD_SCOPES: DialogueKeywordScope[] = ["conversation", "expedition", "campaign"];
const RESPONSE_ROLES: DialogueResponseData["role"][] = [
  "opening",
  "normal",
  "first",
  "repeat",
  "fallback",
  "sequential",
];
const ACTION_KINDS: NonNullable<DialogueKeywordData["action_kind"]>[] = [
  "silence",
  "goodbye",
  "show_item",
  "give_item",
  "join",
  "wait",
  "trade",
  "console",
  "attend",
  "recruit",
  "dismiss",
  "leave",
  "custom",
];

const fieldClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none transition-colors focus:border-indigo-500";
const compactFieldClass =
  "w-full rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-indigo-500";

const stableToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "topic";

const uniqueId = (prefix: string, used: Iterable<string>) => {
  const ids = new Set(used);
  const base = `${prefix}:${Date.now().toString(36)}`;
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
};

const newResponse = (dialogue: DialogueData, topicId?: string): DialogueResponseData => {
  const hasOpening = (dialogue.responses || []).some((response) => response.role === "opening");
  return {
    id: uniqueId(
      "response",
      (dialogue.responses || []).map((response) => response.id),
    ),
    role: hasOpening ? "fallback" : "opening",
    topic_id: hasOpening ? topicId : undefined,
    text: hasOpening ? "..." : "What is it?",
    priority: 0,
    mentions: [],
    unlock_topic_ids: [],
    unlock_dynamic_topic_ids: [],
    context_topic_ids: [],
    context_dynamic_topic_ids: [],
    set_switches: [],
    effects_repeatable: false,
    end_conversation: false,
  };
};

const targetValue = (response: DialogueResponseData) => {
  if (response.dynamic_topic_id) return `dynamic:${response.dynamic_topic_id}`;
  if (response.topic_id) return `static:${response.topic_id}`;
  return "";
};

const parseTopicTarget = (value: string): Pick<DialogueResponseData, "topic_id" | "dynamic_topic_id"> => {
  if (value.startsWith("dynamic:")) {
    return { topic_id: undefined, dynamic_topic_id: value.slice("dynamic:".length) };
  }
  if (value.startsWith("static:")) {
    return { topic_id: value.slice("static:".length), dynamic_topic_id: undefined };
  }
  return { topic_id: undefined, dynamic_topic_id: undefined };
};

const topicRefFromValue = (value: string): DialogueTopicRef | null => {
  if (value.startsWith("dynamic:")) {
    return { kind: "dynamic", dynamicTopicId: value.slice("dynamic:".length) };
  }
  if (value.startsWith("static:")) {
    return { kind: "static", topicId: value.slice("static:".length) };
  }
  return null;
};

const topicOptionsFor = (
  keywords: DialogueKeywordData[],
  dynamicTopics: DialogueDynamicTopicData[],
): TopicOption[] => [
  ...keywords.map((keyword) => ({
    value: `static:${keyword.id}`,
    label: keyword.display_label,
    category: keyword.category,
  })),
  ...dynamicTopics.map((topic) => ({
    value: `dynamic:${topic.id}`,
    label: topic.display_name,
    category: topic.category || "people",
  })),
];

const patchPackage = (mutator: (current: GamePackage) => GamePackage) => {
  const store = useEngineStore.getState();
  store.setGamePackage(mutator(store.gamePackage));
};

const referencesInPackage = (gamePackage: GamePackage, id: string, kind: "keyword" | "dynamic") => {
  const searchable = kind === "keyword"
    ? { ...gamePackage, keywords: (gamePackage.keywords || []).filter((entry) => entry.id !== id) }
    : { ...gamePackage, dynamic_topics: (gamePackage.dynamic_topics || []).filter((entry) => entry.id !== id) };
  const serialized = JSON.stringify(searchable);
  return serialized.split(`\"${id}\"`).length - 1;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex flex-wrap items-baseline gap-2 text-xs font-medium text-neutral-400">
        {label}
        {hint && <span className="font-normal text-neutral-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 accent-indigo-500"
      />
      <span>
        <span className="block text-xs font-medium text-neutral-200">{label}</span>
        {hint && <span className="block text-[11px] leading-4 text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

function TopicSelect({
  value,
  options,
  onChange,
  allowBlank = true,
  blankLabel = "Choose a topic",
  className = compactFieldClass,
}: {
  value: string;
  options: TopicOption[];
  onChange: (value: string) => void;
  allowBlank?: boolean;
  blankLabel?: string;
  className?: string;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, TopicOption[]>();
    options.forEach((option) => grouped.set(option.category, [...(grouped.get(option.category) || []), option]));
    return grouped;
  }, [options]);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
      {allowBlank && <option value="">{blankLabel}</option>}
      {[...groups.entries()].map(([category, entries]) => (
        <optgroup key={category} label={category}>
          {entries.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} · {option.value.replace(/^(static|dynamic):/, "")}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ReferenceChecklist({
  title,
  hint,
  options,
  staticValues,
  dynamicValues,
  onChange,
}: {
  title: string;
  hint: string;
  options: TopicOption[];
  staticValues: string[];
  dynamicValues: string[];
  onChange: (staticIds: string[], dynamicIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = options.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = new Set([
    ...staticValues.map((id) => `static:${id}`),
    ...dynamicValues.map((id) => `dynamic:${id}`),
  ]);
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(
      [...next].filter((entry) => entry.startsWith("static:")).map((entry) => entry.slice(7)),
      [...next].filter((entry) => entry.startsWith("dynamic:")).map((entry) => entry.slice(8)),
    );
  };
  return (
    <details className="rounded-lg border border-neutral-800 bg-neutral-950/60">
      <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-300">
        {title} <span className="text-neutral-600">({selected.size})</span>
        <span className="ml-2 text-[11px] text-neutral-600">{hint}</span>
      </summary>
      <div className="border-t border-neutral-800 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-neutral-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter topics"
            className={`${compactFieldClass} pl-7`}
          />
        </div>
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {filtered.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
            >
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-indigo-500"
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-[10px] uppercase text-neutral-600">{option.category}</span>
            </label>
          ))}
          {!filtered.length && <div className="px-2 py-3 text-xs text-neutral-600">No matching topics.</div>}
        </div>
      </div>
    </details>
  );
}

function HighlightedResponse({
  response,
  onTopic,
}: {
  response: DialogueResponseData;
  onTopic: (value: string) => void;
}) {
  const chunks: React.ReactNode[] = [];
  let cursor = 0;
  const mentions = (response.mentions || [])
    .map((mention) => ({ mention, index: response.text.indexOf(mention.phrase) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index);
  mentions.forEach(({ mention, index }, mentionIndex) => {
    if (index < cursor) return;
    if (index > cursor) chunks.push(response.text.slice(cursor, index));
    const value = mention.dynamic_topic_id
      ? `dynamic:${mention.dynamic_topic_id}`
      : mention.topic_id
        ? `static:${mention.topic_id}`
        : "";
    chunks.push(
      <button
        key={`${mention.phrase}-${mentionIndex}`}
        type="button"
        disabled={!value}
        onClick={() => value && onTopic(value)}
        className="rounded-sm border-b border-violet-400/60 bg-violet-400/10 px-0.5 font-medium text-violet-200 hover:bg-violet-400/20 disabled:cursor-default"
        title={mention.discover ? "Click to preview this newly discovered topic" : "Click to preview this topic"}
      >
        {mention.phrase}
      </button>,
    );
    cursor = index + mention.phrase.length;
  });
  if (cursor < response.text.length) chunks.push(response.text.slice(cursor));
  return <>{chunks.length ? chunks : response.text}</>;
}

function ValidationPanel({ issues }: { issues: DialogueValidationIssue[] }) {
  const [expanded, setExpanded] = useState(false);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  if (!issues.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
        <Check className="h-4 w-4" /> Topic graph validation passed.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-900/60 bg-amber-950/20">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-amber-200"
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="flex-1">{errors} errors · {warnings} warnings</span>
        <span className="text-[10px] uppercase text-amber-500">{expanded ? "hide" : "inspect"}</span>
      </button>
      {expanded && (
        <div className="max-h-56 space-y-1 overflow-y-auto border-t border-amber-900/50 p-2">
          {issues.map((issue, index) => (
            <div key={`${issue.code}-${index}`} className="rounded bg-black/30 px-2 py-1.5 text-[11px]">
              <div className={issue.severity === "error" ? "text-rose-300" : "text-amber-300"}>
                {issue.code}
              </div>
              <div className="text-neutral-300">{issue.message}</div>
              <div className="font-mono text-neutral-600">{issue.path}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cleanCondition = (condition: ConditionData): ConditionData | undefined => {
  const entries = Object.entries(condition).filter(([, value]) =>
    value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0),
  );
  return entries.length ? Object.fromEntries(entries) as ConditionData : undefined;
};

function DialogueConditionEditor({
  value,
  onChange,
  gamePackage,
  topicOptions,
}: {
  value?: ConditionData;
  onChange: (condition?: ConditionData) => void;
  gamePackage: GamePackage;
  topicOptions: TopicOption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const update = (updates: Partial<ConditionData>) => onChange(cleanCondition({ ...(value || {}), ...updates }));
  const setNumber = (key: keyof ConditionData, raw: string) => {
    update({ [key]: raw === "" ? undefined : Number(raw) } as Partial<ConditionData>);
  };
  const knownValue = value?.known_topic
    ? topicOptions.find((option) =>
        option.value === `static:${value.known_topic}` || option.value === `dynamic:${value.known_topic}`,
      )?.value || ""
    : "";
  const askedValue = value?.topic_asked
    ? value.topic_asked.startsWith("dynamic:")
      ? value.topic_asked
      : `static:${value.topic_asked}`
    : "";
  const dialoguePredicateCount = [
    value?.variable,
    value?.relationship,
    value?.current_map,
    value?.current_expedition,
    value?.current_intercessor,
    value?.prior_intercessor,
    value?.read_document,
    value?.known_topic,
    value?.topic_asked,
    value?.entity_state_id,
  ].filter(Boolean).length;
  return (
    <div className="space-y-2">
      <ConditionEditor
        value={value}
        onChange={onChange}
        label="Common world-state conditions"
      />
      <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/10">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <GitBranch className="h-3.5 w-3.5 text-indigo-300" />
          <span className="flex-1 text-xs font-medium text-indigo-100">Conversation and campaign predicates</span>
          <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-300">{dialoguePredicateCount} set</span>
        </button>
        {expanded && (
          <div className="space-y-4 border-t border-indigo-900/40 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Known keyword or exact dynamic record">
                <TopicSelect
                  value={knownValue}
                  options={topicOptions}
                  onChange={(target) => update({
                    known_topic: target.startsWith("static:")
                      ? target.slice(7)
                      : target.startsWith("dynamic:")
                        ? target.slice(8)
                        : undefined,
                  })}
                />
              </Field>
              <Field label="Previously asked topic">
                <TopicSelect
                  value={askedValue}
                  options={topicOptions}
                  onChange={(target) => update({
                    topic_asked: target.startsWith("static:") ? target.slice(7) : target || undefined,
                  })}
                />
              </Field>
              <Field label="Asked in conversation" hint="Blank counts across all NPCs">
                <select
                  value={value?.topic_asked_dialogue || ""}
                  onChange={(event) => update({ topic_asked_dialogue: event.target.value || undefined })}
                  className={compactFieldClass}
                >
                  <option value="">Any conversation</option>
                  {gamePackage.dialogue.map((dialogue) => (
                    <option key={dialogue.id} value={dialogue.id}>{dialogue.display_name} · {dialogue.id}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ask count ≥">
                  <input
                    type="number"
                    min={0}
                    value={value?.topic_ask_count_gte ?? ""}
                    onChange={(event) => setNumber("topic_ask_count_gte", event.target.value)}
                    className={compactFieldClass}
                  />
                </Field>
                <Field label="Ask count ≤">
                  <input
                    type="number"
                    min={0}
                    value={value?.topic_ask_count_lte ?? ""}
                    onChange={(event) => setNumber("topic_ask_count_lte", event.target.value)}
                    className={compactFieldClass}
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Variable ID">
                <input value={value?.variable || ""} onChange={(event) => update({ variable: event.target.value || undefined })} placeholder="campaign_variable" className={compactFieldClass} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Equals">
                  <input
                    value={value?.variable_value === undefined ? "" : String(value.variable_value)}
                    onChange={(event) => update({ variable_value: event.target.value || undefined })}
                    className={compactFieldClass}
                  />
                </Field>
                <Field label="Value ≥">
                  <input type="number" value={value?.variable_gte ?? ""} onChange={(event) => setNumber("variable_gte", event.target.value)} className={compactFieldClass} />
                </Field>
                <Field label="Value ≤">
                  <input type="number" value={value?.variable_lte ?? ""} onChange={(event) => setNumber("variable_lte", event.target.value)} className={compactFieldClass} />
                </Field>
              </div>
              <Field label="Relationship record">
                <input
                  list="dialogue-condition-entities"
                  value={value?.relationship || ""}
                  onChange={(event) => update({ relationship: event.target.value || undefined })}
                  placeholder="npc_or_record_id"
                  className={compactFieldClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Relationship ≥">
                  <input type="number" value={value?.relationship_gte ?? ""} onChange={(event) => setNumber("relationship_gte", event.target.value)} className={compactFieldClass} />
                </Field>
                <Field label="Relationship ≤">
                  <input type="number" value={value?.relationship_lte ?? ""} onChange={(event) => setNumber("relationship_lte", event.target.value)} className={compactFieldClass} />
                </Field>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Current map">
                <select value={value?.current_map || ""} onChange={(event) => update({ current_map: event.target.value || undefined })} className={compactFieldClass}>
                  <option value="">Any map</option>
                  {gamePackage.maps.map((map) => <option key={map.id} value={map.id}>{map.display_name || map.id}</option>)}
                </select>
              </Field>
              <Field label="Current expedition ID">
                <input value={value?.current_expedition || ""} onChange={(event) => update({ current_expedition: event.target.value || undefined })} className={compactFieldClass} />
              </Field>
              <Field label="Current Intercessor record">
                <input value={value?.current_intercessor || ""} onChange={(event) => update({ current_intercessor: event.target.value || undefined })} className={compactFieldClass} />
              </Field>
              <Field label="Prior Intercessor record">
                <input value={value?.prior_intercessor || ""} onChange={(event) => update({ prior_intercessor: event.target.value || undefined })} className={compactFieldClass} />
              </Field>
              <Field label="Document has been read">
                <select value={value?.read_document || ""} onChange={(event) => update({ read_document: event.target.value || undefined })} className={compactFieldClass}>
                  <option value="">Any document state</option>
                  {gamePackage.documents.map((document) => <option key={document.id} value={document.id}>{document.display_name} · {document.id}</option>)}
                </select>
              </Field>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">NPC / persistent record state</div>
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  list="dialogue-condition-entities"
                  value={value?.entity_state_id || ""}
                  onChange={(event) => update({ entity_state_id: event.target.value || undefined })}
                  placeholder="entity or record ID"
                  className={compactFieldClass}
                />
                <input value={value?.entity_state_field || ""} onChange={(event) => update({ entity_state_field: event.target.value || undefined })} placeholder="state field (alive, witnessed…)" className={compactFieldClass} />
                <input
                  value={value?.entity_state_value === undefined ? "" : String(value.entity_state_value)}
                  onChange={(event) => update({ entity_state_value: event.target.value || undefined })}
                  placeholder="required value"
                  className={compactFieldClass}
                />
              </div>
            </div>
            <datalist id="dialogue-condition-entities">
              {gamePackage.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.display_name}</option>)}
            </datalist>
          </div>
        )}
      </div>
    </div>
  );
}

function ResponseEditor({
  gamePackage,
  dialogue,
  response,
  topicOptions,
  onChange,
  onDelete,
}: {
  gamePackage: GamePackage;
  dialogue: DialogueData;
  response: DialogueResponseData;
  topicOptions: TopicOption[];
  onChange: (updates: Partial<DialogueResponseData>) => void;
  onDelete: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isOpening = response.role === "opening";
  const addMention = () => {
    const fallback = topicOptions[0]?.value || "";
    const target = parseTopicTarget(fallback);
    onChange({
      mentions: [
        ...(response.mentions || []),
        { phrase: "New topic", discover: true, ...target },
      ],
    });
  };
  const updateMention = (index: number, updates: Partial<DialogueResponseData["mentions"][number]>) => {
    onChange({
      mentions: (response.mentions || []).map((mention, mentionIndex) =>
        mentionIndex === index ? { ...mention, ...updates } : mention,
      ),
    });
  };
  const removeMention = (index: number) => {
    onChange({ mentions: (response.mentions || []).filter((_, mentionIndex) => mentionIndex !== index) });
  };
  return (
    <div className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 lg:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-indigo-400" />
            <h3 className="truncate text-sm font-semibold text-neutral-100">
              {response.role === "opening" ? "Conversation opening" : response.id}
            </h3>
          </div>
          <div className="mt-1 font-mono text-[10px] text-neutral-600">{response.id}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-2 text-neutral-600 hover:bg-rose-500/10 hover:text-rose-300"
          title="Delete response"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Stable response ID" hint="Save identity">
          <input value={response.id} readOnly className={`${compactFieldClass} font-mono text-neutral-500`} />
        </Field>
        <Field label="Role">
          <select
            value={response.role}
            onChange={(event) => {
              const role = event.target.value as DialogueResponseData["role"];
              onChange({
                role,
                ...(role === "opening" ? { topic_id: undefined, dynamic_topic_id: undefined } : {}),
              });
            }}
            className={compactFieldClass}
          >
            {RESPONSE_ROLES.map((role) => <option key={role}>{role}</option>)}
          </select>
        </Field>
        <Field label="Priority" hint="Higher wins">
          <input
            type="number"
            value={response.priority}
            onChange={(event) => onChange({ priority: Number(event.target.value) || 0 })}
            className={compactFieldClass}
          />
        </Field>
        {response.role === "sequential" ? (
          <Field label="Sequence index">
            <input
              type="number"
              min={0}
              value={response.sequence_index ?? 0}
              onChange={(event) => onChange({ sequence_index: Math.max(0, Number(event.target.value) || 0) })}
              className={compactFieldClass}
            />
          </Field>
        ) : (
          <Field label="Speaker">
            <input
              value={response.speaker || dialogue.speaker || ""}
              onChange={(event) => onChange({ speaker: event.target.value || undefined })}
              placeholder={dialogue.speaker || "NPC"}
              className={compactFieldClass}
            />
          </Field>
        )}
      </div>

      {!isOpening && (
        <Field label="Responds to" hint="The selected subject, person, object, place, event, belief, or action">
          <TopicSelect
            value={targetValue(response)}
            options={topicOptions}
            onChange={(value) => onChange(parseTopicTarget(value))}
            className={fieldClass}
          />
        </Field>
      )}

      <Field label="NPC response" hint="The player never speaks an authored sentence">
        <textarea
          value={response.text}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={5}
          className={`${fieldClass} resize-y font-serif text-base leading-7`}
        />
      </Field>

      <DialogueConditionEditor
        value={response.condition}
        onChange={(condition) => onChange({ condition })}
        gamePackage={gamePackage}
        topicOptions={topicOptions}
      />

      <div className="space-y-2 rounded-lg border border-violet-900/50 bg-violet-950/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-violet-200">Discoverable phrases</div>
            <div className="text-[11px] text-neutral-500">Highlighted in NPC prose and clickable during play.</div>
          </div>
          <button
            type="button"
            onClick={addMention}
            disabled={!topicOptions.length}
            className="rounded bg-violet-500/15 px-2 py-1 text-xs text-violet-200 hover:bg-violet-500/25 disabled:opacity-40"
          >
            <Plus className="mr-1 inline h-3 w-3" /> Phrase
          </button>
        </div>
        {(response.mentions || []).map((mention, index) => {
          const mentionTarget = mention.dynamic_topic_id
            ? `dynamic:${mention.dynamic_topic_id}`
            : mention.topic_id
              ? `static:${mention.topic_id}`
              : "";
          const absent = mention.phrase && !response.text.includes(mention.phrase);
          return (
            <div key={`${mention.phrase}-${index}`} className="grid gap-2 rounded bg-black/30 p-2 md:grid-cols-[1fr_1fr_auto_auto]">
              <input
                value={mention.phrase}
                onChange={(event) => updateMention(index, { phrase: event.target.value })}
                placeholder="Exact phrase in response"
                className={`${compactFieldClass} ${absent ? "border-amber-700" : ""}`}
                title={absent ? "This exact phrase is not present in the NPC response." : undefined}
              />
              <TopicSelect
                value={mentionTarget}
                options={topicOptions}
                onChange={(value) => updateMention(index, parseTopicTarget(value))}
              />
              <label className="flex items-center gap-1 text-[11px] text-neutral-300">
                <input
                  type="checkbox"
                  checked={mention.discover}
                  onChange={(event) => updateMention(index, { discover: event.target.checked })}
                  className="accent-violet-500"
                />
                learn
              </label>
              <button
                type="button"
                onClick={() => removeMention(index)}
                className="rounded p-1 text-neutral-600 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {!(response.mentions || []).length && (
          <div className="rounded border border-dashed border-neutral-800 px-3 py-4 text-center text-xs text-neutral-600">
            Add a phrase to teach a keyword from this response.
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReferenceChecklist
          title="Unlock topics"
          hint="Learn without highlighting"
          options={topicOptions}
          staticValues={response.unlock_topic_ids || []}
          dynamicValues={response.unlock_dynamic_topic_ids || []}
          onChange={(staticIds, dynamicIds) => onChange({
            unlock_topic_ids: staticIds,
            unlock_dynamic_topic_ids: dynamicIds,
          })}
        />
        <ReferenceChecklist
          title="Contextual topics"
          hint="Promote into compact list"
          options={topicOptions}
          staticValues={response.context_topic_ids || []}
          dynamicValues={response.context_dynamic_topic_ids || []}
          onChange={(staticIds, dynamicIds) => onChange({
            context_topic_ids: staticIds,
            context_dynamic_topic_ids: dynamicIds,
          })}
        />
      </div>

      <details className="rounded-lg border border-neutral-800 bg-neutral-950/40" open={advancedOpen}>
        <summary
          className="cursor-pointer px-3 py-2 text-xs font-medium text-neutral-300"
          onClick={(event) => {
            event.preventDefault();
            setAdvancedOpen((value) => !value);
          }}
        >
          Item matching, effects, and presentation
        </summary>
        {advancedOpen && (
          <div className="space-y-4 border-t border-neutral-800 p-3">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Shown-item match</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Exact item">
                  <select
                    value={response.shown_item_id || ""}
                    onChange={(event) => onChange({ shown_item_id: event.target.value || undefined })}
                    className={compactFieldClass}
                  >
                    <option value="">Any / none</option>
                    {gamePackage.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.display_name} · {item.id}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Item category">
                  <select
                    value={response.shown_item_category || ""}
                    onChange={(event) => onChange({
                      shown_item_category: (event.target.value || undefined) as DialogueResponseData["shown_item_category"],
                    })}
                    className={compactFieldClass}
                  >
                    <option value="">Any</option>
                    {(["consumable", "weapon", "armor", "key"] as const).map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Blueprint ID">
                  <input
                    value={response.shown_item_blueprint_id || ""}
                    onChange={(event) => onChange({ shown_item_blueprint_id: event.target.value || undefined })}
                    placeholder="artifact_blueprint"
                    className={compactFieldClass}
                  />
                </Field>
                <Field label="Shown before">
                  <select
                    value={response.shown_item_previously_shown === undefined ? "any" : String(response.shown_item_previously_shown)}
                    onChange={(event) => onChange({
                      shown_item_previously_shown: event.target.value === "any" ? undefined : event.target.value === "true",
                    })}
                    className={compactFieldClass}
                  >
                    <option value="any">Any</option>
                    <option value="false">First showing</option>
                    <option value="true">Shown previously</option>
                  </select>
                </Field>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Existing state effects</div>
                  <div className="text-[11px] text-neutral-600">Effects run once unless marked repeatable.</div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ set_switches: [...(response.set_switches || []), { switch_id: "" }] })}
                  className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:text-white"
                >
                  <Plus className="mr-1 inline h-3 w-3" /> Switch
                </button>
              </div>
              <div className="space-y-2">
                {(response.set_switches || []).map((entry, index) => (
                  <div key={`${entry.switch_id}-${index}`} className="grid gap-2 md:grid-cols-[1fr_7rem_auto]">
                    <SwitchPicker
                      value={entry.switch_id}
                      onChange={(switchId) => onChange({
                        set_switches: response.set_switches.map((candidate, candidateIndex) =>
                          candidateIndex === index ? { ...candidate, switch_id: switchId } : candidate,
                        ),
                      })}
                      className={compactFieldClass}
                    />
                    <select
                      value={String(entry.switch_value ?? true)}
                      onChange={(event) => onChange({
                        set_switches: response.set_switches.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, switch_value: event.target.value === "true" }
                            : candidate,
                        ),
                      })}
                      className={compactFieldClass}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onChange({ set_switches: response.set_switches.filter((_, candidateIndex) => candidateIndex !== index) })}
                      className="rounded p-1 text-neutral-600 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label="Set quest">
                  <select
                    value={response.set_quest_id || ""}
                    onChange={(event) => onChange({ set_quest_id: event.target.value || undefined })}
                    className={compactFieldClass}
                  >
                    <option value="">None</option>
                    {gamePackage.quests.map((quest) => (
                      <option key={quest.id} value={quest.id}>{quest.display_name} · {quest.id}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quest state">
                  <input
                    value={response.set_quest_state || ""}
                    onChange={(event) => onChange({ set_quest_state: event.target.value || undefined })}
                    placeholder="active / complete"
                    className={compactFieldClass}
                  />
                </Field>
                <Field label="Trigger cutscene">
                  <select
                    value={response.trigger_cutscene_id || ""}
                    onChange={(event) => onChange({ trigger_cutscene_id: event.target.value || undefined })}
                    className={compactFieldClass}
                  >
                    <option value="">None</option>
                    {gamePackage.cutscenes.map((cutscene) => (
                      <option key={cutscene.id} value={cutscene.id}>{cutscene.id}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Toggle
                  checked={response.effects_repeatable}
                  onChange={(checked) => onChange({ effects_repeatable: checked })}
                  label="Repeat effects"
                  hint="Allow state effects every time this response wins."
                />
                <Toggle
                  checked={response.end_conversation}
                  onChange={(checked) => onChange({ end_conversation: checked })}
                  label="End conversation"
                  hint="Useful for Goodbye and authored Leave actions."
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Scene image URL">
                <input
                  value={response.scene_image_url || ""}
                  onChange={(event) => onChange({ scene_image_url: event.target.value || undefined })}
                  className={compactFieldClass}
                />
              </Field>
              <Field label="Scene image alt text">
                <input
                  value={response.scene_image_alt || ""}
                  onChange={(event) => onChange({ scene_image_alt: event.target.value || undefined })}
                  className={compactFieldClass}
                />
              </Field>
            </div>
          </div>
        )}
      </details>
    </div>
  );
}

interface PreviewOverrides {
  flags?: Record<string, unknown>;
  quests?: Record<string, unknown>;
  variables?: Record<string, string | number | boolean>;
  relationships?: Record<string, number>;
  party_members?: string[];
  read_documents?: string[];
  entity_states?: Record<string, unknown>;
  faction_rep?: Record<string, number>;
}

function ConversationPreview({
  gamePackage,
  dialogue,
  topicOptions,
}: {
  gamePackage: GamePackage;
  dialogue: DialogueData;
  topicOptions: TopicOption[];
}) {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [askedBefore, setAskedBefore] = useState(false);
  const [shownBefore, setShownBefore] = useState(false);
  const [shownItemId, setShownItemId] = useState("");
  const [stateJson, setStateJson] = useState("{}");
  const parsedState = useMemo(() => {
    try {
      return { value: JSON.parse(stateJson || "{}") as PreviewOverrides, error: "" };
    } catch (error) {
      return { value: {} as PreviewOverrides, error: error instanceof Error ? error.message : "Invalid JSON" };
    }
  }, [stateJson]);
  useEffect(() => {
    setSelectedTopic("");
    setAskedBefore(false);
    setShownBefore(false);
  }, [dialogue.id]);
  const resolution = useMemo(() => {
    if (parsedState.error) return undefined;
    const topic = topicRefFromValue(selectedTopic);
    const memory = createDialogueMemory("studio-preview");
    const key = topicRefKey(topic);
    if (askedBefore || shownBefore) {
      memory.npc_topics[dialogue.id] = {
        [key]: {
          ask_count: askedBefore ? 1 : 0,
          heard_response_ids: [],
          shown_item_ids: shownBefore && shownItemId ? [shownItemId] : [],
        },
      };
    }
    const save: PlaySave = {
      schema: "crpg_engine_save_v1",
      package_version: gamePackage.metadata.version,
      current_map_id: gamePackage.metadata.start_map_id,
      player: { cell: [0, 0], facing: [0, 1] },
      playerStats: { hp: 10, max_hp: 10, mp: 10, max_mp: 10, attack: 1, defense: 1, speed: 1, energy: 10 },
      known_skills: [],
      flags: { ...(gamePackage.switches || {}), ...(parsedState.value.flags || {}) },
      variables: parsedState.value.variables || {},
      relationships: parsedState.value.relationships || {},
      quests: parsedState.value.quests || {},
      inventory: gamePackage.items.map((item) => ({ id: item.id, count: 1 })),
      money: 0,
      entity_states: parsedState.value.entity_states || {},
      party_members: parsedState.value.party_members || [],
      faction_rep: parsedState.value.faction_rep || {},
      read_documents: parsedState.value.read_documents || [],
      dialogue_memory: memory,
    };
    return resolveKeywordDialogueResponse({
      gamePackage,
      save,
      dialogueId: dialogue.id,
      topic,
      participantKey: dialogue.id,
      shownItemId: shownItemId || undefined,
    });
  }, [askedBefore, dialogue, gamePackage, parsedState, selectedTopic, shownBefore, shownItemId]);
  return (
    <div className="space-y-3 rounded-xl border border-cyan-900/50 bg-cyan-950/10 p-4">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-cyan-300" />
        <div>
          <div className="text-sm font-semibold text-cyan-100">Resolver preview</div>
          <div className="text-[11px] text-neutral-500">Uses the same deterministic response resolver as Play mode.</div>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Player directs attention to">
          <TopicSelect
            value={selectedTopic}
            options={topicOptions}
            onChange={setSelectedTopic}
            blankLabel="Conversation opening"
          />
        </Field>
        <Field label="Show item">
          <select value={shownItemId} onChange={(event) => setShownItemId(event.target.value)} className={compactFieldClass}>
            <option value="">No item shown</option>
            {gamePackage.items.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name} · {item.id}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle checked={askedBefore} onChange={setAskedBefore} label="Topic asked before" hint="Tests first-time and repeat response roles." />
        <Toggle checked={shownBefore} onChange={setShownBefore} label="Item shown before" hint="Tests item-history matching for the selected topic." />
      </div>
      <details className="rounded border border-neutral-800 bg-black/20">
        <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-400">Simulated state JSON</summary>
        <div className="space-y-2 border-t border-neutral-800 p-2">
          <textarea
            value={stateJson}
            onChange={(event) => setStateJson(event.target.value)}
            rows={5}
            placeholder={'{"flags":{"mara_found":true},"quests":{"cistern":"active"},"relationships":{"npc_mike":2}}'}
            className={`${compactFieldClass} font-mono`}
          />
          {parsedState.error && <div className="text-xs text-rose-300">{parsedState.error}</div>}
        </div>
      </details>
      <div className="min-h-28 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        {resolution ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
              <span>{resolution.response.role}</span>
              <span>priority {resolution.response.priority}</span>
              <span className="font-mono normal-case">{resolution.response.id}</span>
            </div>
            <div className="font-serif text-base leading-7 text-neutral-100">
              <HighlightedResponse response={resolution.response} onTopic={setSelectedTopic} />
            </div>
          </>
        ) : (
          <div className="flex min-h-20 items-center justify-center text-center text-xs text-neutral-600">
            No valid response. Add a reachable opening or a fallback for this topic, or change the simulated state.
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationWorkspace({
  gamePackage,
  dialogue,
  keywords,
  dynamicTopics,
  issues,
  onBack,
}: {
  gamePackage: GamePackage;
  dialogue: DialogueData;
  keywords: DialogueKeywordData[];
  dynamicTopics: DialogueDynamicTopicData[];
  issues: DialogueValidationIssue[];
  onBack: () => void;
}) {
  const { updateDialogue, addDialogue, setSelectedDialogueId } = useEngineStore();
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(dialogue.responses?.[0]?.id || null);
  const topicOptions = useMemo(() => topicOptionsFor(keywords, dynamicTopics), [dynamicTopics, keywords]);
  useEffect(() => {
    if (!(dialogue.responses || []).some((response) => response.id === selectedResponseId)) {
      setSelectedResponseId(dialogue.responses?.[0]?.id || null);
    }
  }, [dialogue.id, dialogue.responses, selectedResponseId]);
  const activeResponse = (dialogue.responses || []).find((response) => response.id === selectedResponseId) || null;
  const patchResponse = (responseId: string, updates: Partial<DialogueResponseData>) => {
    updateDialogue(dialogue.id, {
      responses: (dialogue.responses || []).map((response) =>
        response.id === responseId ? { ...response, ...updates } : response,
      ),
    });
  };
  const addResponse = () => {
    const defaultTopic = (dialogue.initial_topic_ids || [])[0] || keywords.find((keyword) => !keyword.action_kind)?.id;
    const response = newResponse(dialogue, defaultTopic);
    updateDialogue(dialogue.id, { responses: [...(dialogue.responses || []), response] });
    setSelectedResponseId(response.id);
  };
  const duplicateDialogue = () => {
    const id = uniqueId("dialogue", gamePackage.dialogue.map((entry) => entry.id));
    const responseIdMap = new Map<string, string>();
    const responses = (dialogue.responses || []).map((response) => {
      const copyId = `${response.id}:copy:${Date.now().toString(36)}`;
      responseIdMap.set(response.id, copyId);
      return { ...structuredClone(response), id: copyId };
    });
    addDialogue({
      ...structuredClone(dialogue),
      id,
      display_name: `${dialogue.display_name} (copy)`,
      responses,
      legacy_migration: undefined,
    });
    setSelectedDialogueId(id);
  };
  const dialogueIndex = gamePackage.dialogue.findIndex((entry) => entry.id === dialogue.id);
  const dialogueIssues = issues.filter((issue) =>
    issue.path.startsWith(`dialogue.${dialogueIndex}.`) || issue.message.includes(dialogue.id),
  );
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <aside className={`${activeResponse ? "hidden xl:flex" : "flex"} w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60 xl:w-72`}>
        <div className="border-b border-neutral-800 p-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white xl:hidden">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-neutral-200">Responses</div>
              <div className="truncate font-mono text-[10px] text-neutral-600">{dialogue.id}</div>
            </div>
            <button type="button" onClick={addResponse} className="rounded bg-indigo-500/15 p-1.5 text-indigo-300 hover:bg-indigo-500/25" title="Add response">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {(dialogue.responses || []).map((response) => {
            const target = response.dynamic_topic_id
              ? dynamicTopics.find((topic) => topic.id === response.dynamic_topic_id)?.display_name || response.dynamic_topic_id
              : response.topic_id
                ? keywords.find((topic) => topic.id === response.topic_id)?.display_label || response.topic_id
                : "Opening";
            return (
              <button
                key={response.id}
                type="button"
                onClick={() => setSelectedResponseId(response.id)}
                className={`w-full rounded-lg px-3 py-2 text-left ${selectedResponseId === response.id ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800/50"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{target}</span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] uppercase text-neutral-500">{response.role}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-neutral-600">{response.text || "Empty response"}</div>
              </button>
            );
          })}
          {!(dialogue.responses || []).length && (
            <button type="button" onClick={addResponse} className="w-full rounded-lg border border-dashed border-neutral-700 p-4 text-xs text-neutral-500 hover:border-indigo-700 hover:text-indigo-300">
              <Plus className="mx-auto mb-2 h-4 w-4" /> Create the opening response
            </button>
          )}
        </div>
      </aside>

      <main className={`${activeResponse ? "block" : "hidden xl:block"} min-w-0 flex-1 overflow-y-auto bg-neutral-950 p-4 lg:p-6`}>
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex items-start gap-3 xl:hidden">
            <button type="button" onClick={() => setSelectedResponseId(null)} className="rounded bg-neutral-900 p-1.5 text-neutral-400 hover:text-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm text-neutral-300">Back to responses</div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Field label="Conversation name">
                  <input
                    value={dialogue.display_name}
                    onChange={(event) => updateDialogue(dialogue.id, { display_name: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <div className="min-w-40 flex-1">
                <Field label="Default speaker">
                  <input
                    value={dialogue.speaker || ""}
                    onChange={(event) => updateDialogue(dialogue.id, { speaker: event.target.value || undefined })}
                    placeholder="NPC display name"
                    className={fieldClass}
                  />
                </Field>
              </div>
              <button type="button" onClick={duplicateDialogue} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:border-neutral-600 hover:text-white">
                <Copy className="mr-1 inline h-3.5 w-3.5" /> Duplicate
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <ReferenceChecklist
                title="Topics known when conversation begins"
                hint="Discover using authored scope"
                options={topicOptions.filter((option) => !option.value.startsWith("static:action:"))}
                staticValues={dialogue.initial_topic_ids || []}
                dynamicValues={dialogue.initial_dynamic_topic_ids || []}
                onChange={(staticIds, dynamicIds) => updateDialogue(dialogue.id, {
                  initial_topic_ids: staticIds,
                  initial_dynamic_topic_ids: dynamicIds,
                })}
              />
              <ReferenceChecklist
                title="Practical action topics"
                hint="Silence, Goodbye, Show item, party actions…"
                options={topicOptions.filter((option) => option.category === "actions")}
                staticValues={dialogue.action_topic_ids || []}
                dynamicValues={[]}
                onChange={(staticIds) => updateDialogue(dialogue.id, { action_topic_ids: staticIds })}
              />
            </div>
          </div>

          <ValidationPanel issues={dialogueIssues} />

          {dialogue.legacy_migration && (
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/15 px-3 py-2 text-xs text-amber-200">
              <FileClock className="mr-2 inline h-4 w-4" />
              Migrated from a legacy dialogue tree · {dialogue.legacy_migration.status.replace("_", " ")} · {dialogue.legacy_migration.original_nodes.length} original nodes retained.
            </div>
          )}

          {activeResponse ? (
            <ResponseEditor
              gamePackage={gamePackage}
              dialogue={dialogue}
              response={activeResponse}
              topicOptions={topicOptions}
              onChange={(updates) => patchResponse(activeResponse.id, updates)}
              onDelete={() => {
                updateDialogue(dialogue.id, {
                  responses: (dialogue.responses || []).filter((response) => response.id !== activeResponse.id),
                });
                setSelectedResponseId(null);
              }}
            />
          ) : (
            <div className="hidden rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-600 xl:block">
              Select a response from the list or create one.
            </div>
          )}

          <ConversationPreview gamePackage={gamePackage} dialogue={dialogue} topicOptions={topicOptions} />
        </div>
      </main>
    </div>
  );
}

function KeywordLibrary({
  gamePackage,
  keywords,
}: {
  gamePackage: GamePackage;
  keywords: DialogueKeywordData[];
}) {
  const [selectedId, setSelectedId] = useState(keywords[0]?.id || "");
  const [query, setQuery] = useState("");
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const selected = keywords.find((keyword) => keyword.id === selectedId) || null;
  const builtinIds = useMemo(() => new Set(BUILTIN_DIALOGUE_KEYWORDS.map((keyword) => keyword.id)), []);
  const storedIds = new Set((gamePackage.keywords || []).map((keyword) => keyword.id));
  const filtered = keywords.filter((keyword) =>
    `${keyword.display_label} ${keyword.id} ${keyword.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const update = (id: string, updates: Partial<DialogueKeywordData>) => {
    patchPackage((current) => {
      const existing = (current.keywords || []).find((keyword) => keyword.id === id)
        || BUILTIN_DIALOGUE_KEYWORDS.find((keyword) => keyword.id === id);
      if (!existing) return current;
      const next = { ...existing, ...updates };
      return {
        ...current,
        keywords: [...(current.keywords || []).filter((keyword) => keyword.id !== id), next],
      };
    });
  };
  const createKeyword = () => {
    const id = newId.trim();
    const label = newLabel.trim();
    if (!id || !label || keywords.some((keyword) => keyword.id === id)) return;
    patchPackage((current) => ({
      ...current,
      keywords: [...(current.keywords || []), {
        id,
        display_label: label,
        category: "subjects",
        scope: "expedition",
        dynamic_capable: false,
        known_by_default: false,
        important: false,
      }],
    }));
    setSelectedId(id);
    setNewId("");
    setNewLabel("");
  };
  const referenceCount = selected ? referencesInPackage(gamePackage, selected.id, "keyword") : 0;
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <aside className={`${selected ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60 lg:w-80`}>
        <div className="space-y-2 border-b border-neutral-800 p-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-indigo-300" />
            <div className="text-sm font-semibold text-neutral-200">Keyword registry</div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-600" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter labels or stable IDs" className={`${fieldClass} pl-8`} />
          </div>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {filtered.map((keyword) => (
            <button
              key={keyword.id}
              type="button"
              onClick={() => setSelectedId(keyword.id)}
              className={`w-full rounded-lg px-3 py-2 text-left ${selectedId === keyword.id ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800/50"}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{keyword.display_label}</span>
                {keyword.action_kind && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] uppercase text-cyan-300">action</span>}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-neutral-600">{keyword.id}</div>
            </button>
          ))}
        </div>
        <div className="space-y-2 border-t border-neutral-800 bg-neutral-950 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Create with a stable identity</div>
          <input
            value={newLabel}
            onChange={(event) => {
              setNewLabel(event.target.value);
              if (!newId) setNewId(`topic:${stableToken(event.target.value)}`);
            }}
            placeholder="Display label"
            className={compactFieldClass}
          />
          <input value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="topic:stable_id" className={`${compactFieldClass} font-mono`} />
          {newId && keywords.some((keyword) => keyword.id === newId.trim()) && <div className="text-[11px] text-rose-300">That stable ID already exists.</div>}
          <button
            type="button"
            onClick={createKeyword}
            disabled={!newId.trim() || !newLabel.trim() || keywords.some((keyword) => keyword.id === newId.trim())}
            className="w-full rounded bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" /> Create keyword
          </button>
        </div>
      </aside>

      <main className={`${selected ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto bg-neutral-950 p-4 lg:p-8`}>
        {selected ? (
          <div className="mx-auto max-w-3xl space-y-5">
            <button type="button" onClick={() => setSelectedId("")} className="rounded bg-neutral-900 p-1.5 text-neutral-400 lg:hidden">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-neutral-100">{selected.display_label}</h2>
                {builtinIds.has(selected.id) && <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase text-cyan-300">built-in</span>}
                {!storedIds.has(selected.id) && <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] uppercase text-neutral-400">inherited</span>}
              </div>
              <p className="mt-1 text-sm text-neutral-500">Rename the label freely. The stable ID remains the save identity.</p>
            </div>
            <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
              <Field label="Stable ID" hint="Immutable after creation; safe across display-name changes">
                <input value={selected.id} readOnly className={`${fieldClass} font-mono text-neutral-500`} />
              </Field>
              <Field label="Display label">
                <input value={selected.display_label} onChange={(event) => update(selected.id, { display_label: event.target.value })} className={fieldClass} />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Archive category">
                  <select
                    value={selected.category}
                    onChange={(event) => update(selected.id, { category: event.target.value as DialogueKeywordCategory })}
                    className={fieldClass}
                  >
                    {KEYWORD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Knowledge scope">
                  <select
                    value={selected.scope}
                    onChange={(event) => update(selected.id, { scope: event.target.value as DialogueKeywordScope })}
                    className={fieldClass}
                  >
                    {KEYWORD_SCOPES.map((scope) => <option key={scope}>{scope}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Authoring notes" hint="Not shown to the player">
                <textarea value={selected.description || ""} onChange={(event) => update(selected.id, { description: event.target.value || undefined })} rows={3} className={fieldClass} />
              </Field>
              <div className="grid gap-3 md:grid-cols-3">
                <Toggle checked={selected.dynamic_capable} onChange={(checked) => update(selected.id, { dynamic_capable: checked })} label="Dynamic-capable" hint="May bind generated people, artifacts, or Intercessor records." />
                <Toggle checked={selected.known_by_default} onChange={(checked) => update(selected.id, { known_by_default: checked })} label="Known by default" hint="Seed vocabulary at the authored scope." />
                <Toggle checked={selected.important} onChange={(checked) => update(selected.id, { important: checked })} label="Important / pinned" hint="Prefer in contextual topic ordering." />
              </div>
              <Field label="Nonverbal action kind" hint="Leave blank for ordinary subjects">
                <select
                  value={selected.action_kind || ""}
                  onChange={(event) => update(selected.id, {
                    action_kind: (event.target.value || undefined) as DialogueKeywordData["action_kind"],
                    ...(event.target.value ? { category: "actions" } : {}),
                  })}
                  className={fieldClass}
                >
                  <option value="">Ordinary keyword</option>
                  {ACTION_KINDS.map((kind) => <option key={kind}>{kind}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-neutral-800 p-3 text-xs">
              <div className="text-neutral-500">Referenced {referenceCount} time{referenceCount === 1 ? "" : "s"} across content.</div>
              <button
                type="button"
                disabled={builtinIds.has(selected.id) || referenceCount > 0}
                onClick={() => {
                  patchPackage((current) => ({ ...current, keywords: (current.keywords || []).filter((keyword) => keyword.id !== selected.id) }));
                  setSelectedId("");
                }}
                className="rounded px-2 py-1 text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:text-neutral-700"
                title={builtinIds.has(selected.id) ? "Built-in action keywords cannot be deleted." : referenceCount ? "Remove references before deleting this keyword." : "Delete keyword"}
              >
                <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-600">Select a keyword to edit it.</div>
        )}
      </main>
    </div>
  );
}

function DynamicTopicLibrary({
  gamePackage,
  keywords,
  dynamicTopics,
}: {
  gamePackage: GamePackage;
  keywords: DialogueKeywordData[];
  dynamicTopics: DialogueDynamicTopicData[];
}) {
  const [selectedId, setSelectedId] = useState(dynamicTopics[0]?.id || "");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRecordId, setNewRecordId] = useState("");
  const selected = dynamicTopics.find((topic) => topic.id === selectedId) || null;
  const capableKeywords = keywords.filter((keyword) => keyword.dynamic_capable);
  const update = (id: string, updates: Partial<DialogueDynamicTopicData>) => {
    patchPackage((current) => ({
      ...current,
      dynamic_topics: (current.dynamic_topics || []).map((topic) => topic.id === id ? { ...topic, ...updates } : topic),
    }));
  };
  const create = () => {
    const keyword = capableKeywords[0];
    if (!keyword || !newId.trim() || !newName.trim() || !newRecordId.trim() || dynamicTopics.some((topic) => topic.id === newId.trim())) return;
    const topic: DialogueDynamicTopicData = {
      id: newId.trim(),
      keyword_id: keyword.id,
      record_id: newRecordId.trim(),
      display_name: newName.trim(),
      category: keyword.category,
      scope: "campaign",
      source: "authored",
      known_by_default: false,
      response_associations: {},
    };
    patchPackage((current) => ({ ...current, dynamic_topics: [...(current.dynamic_topics || []), topic] }));
    setSelectedId(topic.id);
    setNewId("");
    setNewName("");
    setNewRecordId("");
  };
  const associations = selected
    ? gamePackage.dialogue.flatMap((dialogue) => (dialogue.responses || [])
        .filter((response) => response.dynamic_topic_id === selected.id || (!response.dynamic_topic_id && response.topic_id === selected.keyword_id))
        .map((response) => ({ dialogue, response })))
    : [];
  const referenceCount = selected ? referencesInPackage(gamePackage, selected.id, "dynamic") : 0;
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <aside className={`${selected ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60 lg:w-80`}>
        <div className="border-b border-neutral-800 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <UserRound className="h-4 w-4 text-fuchsia-300" /> Dynamic named topics
          </div>
          <div className="mt-1 text-[11px] leading-4 text-neutral-500">Exact runtime records: past Intercessors, named ghosts, generated people, and artifacts.</div>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {dynamicTopics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => setSelectedId(topic.id)}
              className={`w-full rounded-lg px-3 py-2 text-left ${selectedId === topic.id ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800/50"}`}
            >
              <div className="truncate text-sm">{topic.display_name}</div>
              <div className="mt-1 truncate font-mono text-[10px] text-neutral-600">{topic.record_id}</div>
            </button>
          ))}
          {!dynamicTopics.length && <div className="p-4 text-center text-xs text-neutral-600">No authored dynamic records.</div>}
        </div>
        <div className="space-y-2 border-t border-neutral-800 bg-neutral-950 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Create bound record</div>
          {!capableKeywords.length && <div className="rounded border border-amber-900/50 bg-amber-950/20 p-2 text-[11px] text-amber-200">Mark a keyword dynamic-capable first.</div>}
          <input
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              if (!newId) setNewId(`dynamic:${stableToken(event.target.value)}`);
              if (!newRecordId) setNewRecordId(`record:${stableToken(event.target.value)}`);
            }}
            placeholder="Display name"
            className={compactFieldClass}
          />
          <input value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="dynamic:stable_id" className={`${compactFieldClass} font-mono`} />
          <input value={newRecordId} onChange={(event) => setNewRecordId(event.target.value)} placeholder="record:exact_identity" className={`${compactFieldClass} font-mono`} />
          <button type="button" onClick={create} disabled={!capableKeywords.length || !newId.trim() || !newName.trim() || !newRecordId.trim() || dynamicTopics.some((topic) => topic.id === newId.trim())} className="w-full rounded bg-fuchsia-700 px-3 py-2 text-xs font-medium text-white hover:bg-fuchsia-600 disabled:opacity-40">
            <Plus className="mr-1 inline h-3.5 w-3.5" /> Create dynamic topic
          </button>
        </div>
      </aside>

      <main className={`${selected ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto bg-neutral-950 p-4 lg:p-8`}>
        {selected ? (
          <div className="mx-auto max-w-3xl space-y-5">
            <button type="button" onClick={() => setSelectedId("")} className="rounded bg-neutral-900 p-1.5 text-neutral-400 lg:hidden">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-neutral-100">{selected.display_name}</h2>
              <p className="mt-1 text-sm text-neutral-500">This name is bound to one persistent record, not merely matching display text.</p>
            </div>
            <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Dynamic topic ID" hint="Save identity">
                  <input value={selected.id} readOnly className={`${fieldClass} font-mono text-neutral-500`} />
                </Field>
                <Field label="Exact record ID" hint="Person, artifact, or Intercessor identity">
                  <input value={selected.record_id} onChange={(event) => update(selected.id, { record_id: event.target.value })} className={`${fieldClass} font-mono`} />
                </Field>
              </div>
              <Field label="Display name">
                <input value={selected.display_name} onChange={(event) => update(selected.id, { display_name: event.target.value })} className={fieldClass} />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Base keyword definition">
                  <select value={selected.keyword_id} onChange={(event) => update(selected.id, { keyword_id: event.target.value })} className={fieldClass}>
                    {capableKeywords.map((keyword) => <option key={keyword.id} value={keyword.id}>{keyword.display_label} · {keyword.id}</option>)}
                    {!capableKeywords.some((keyword) => keyword.id === selected.keyword_id) && <option value={selected.keyword_id}>{selected.keyword_id} (not dynamic-capable)</option>}
                  </select>
                </Field>
                <Field label="Archive category">
                  <select value={selected.category || "people"} onChange={(event) => update(selected.id, { category: event.target.value as DialogueKeywordCategory })} className={fieldClass}>
                    {KEYWORD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Knowledge scope">
                  <select value={selected.scope} onChange={(event) => update(selected.id, { scope: event.target.value as DialogueKeywordScope })} className={fieldClass}>
                    {KEYWORD_SCOPES.map((scope) => <option key={scope}>{scope}</option>)}
                  </select>
                </Field>
                <Field label="Discovery source">
                  <input value={selected.source} onChange={(event) => update(selected.id, { source: event.target.value })} className={fieldClass} />
                </Field>
              </div>
              <Toggle checked={selected.known_by_default} onChange={(checked) => update(selected.id, { known_by_default: checked })} label="Known by default" hint="Normally false: discover this exact record through play." />
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-xs font-semibold text-neutral-300">Associated NPC responses</div>
              <div className="mt-1 text-[11px] text-neutral-500">Direct bindings and base-keyword fallbacks that can answer this exact record.</div>
              <div className="mt-3 space-y-1">
                {associations.map(({ dialogue, response }) => (
                  <div key={`${dialogue.id}-${response.id}`} className="flex items-center gap-2 rounded bg-black/30 px-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-neutral-300">{dialogue.display_name}</span>
                    <span className="font-mono text-[10px] text-neutral-600">{response.id}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${response.dynamic_topic_id === selected.id ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-neutral-800 text-neutral-500"}`}>
                      {response.dynamic_topic_id === selected.id ? "exact" : "base fallback"}
                    </span>
                  </div>
                ))}
                {!associations.length && <div className="rounded border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-600">Bind a response to this dynamic topic in a conversation.</div>}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-neutral-800 p-3 text-xs">
              <div className="text-neutral-500">Referenced {referenceCount} time{referenceCount === 1 ? "" : "s"} across content.</div>
              <button
                type="button"
                disabled={referenceCount > 0}
                onClick={() => {
                  patchPackage((current) => ({ ...current, dynamic_topics: (current.dynamic_topics || []).filter((topic) => topic.id !== selected.id) }));
                  setSelectedId("");
                }}
                className="rounded px-2 py-1 text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:text-neutral-700"
              >
                <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-600">Select a dynamic topic to edit it.</div>
        )}
      </main>
    </div>
  );
}

function MigrationWorkspace({ gamePackage }: { gamePackage: GamePackage }) {
  const [report, setReport] = useState("");
  const migrations = gamePackage.dialogue.filter((dialogue) => dialogue.legacy_migration);
  const remainingLegacy = gamePackage.dialogue.filter((dialogue) => dialogue.format !== "keyword_v1");
  const runMigration = () => {
    const current = useEngineStore.getState().gamePackage;
    const result = migrateLegacyDialoguePackage(current);
    useEngineStore.getState().setGamePackage(result.package);
    setReport(formatLegacyDialogueMigrationReport(result));
  };
  const confirm = (dialogueId: string) => {
    patchPackage((current) => ({
      ...current,
      dialogue: current.dialogue.map((dialogue) => dialogue.id === dialogueId && dialogue.legacy_migration
        ? { ...dialogue, legacy_migration: { ...dialogue.legacy_migration, status: "confirmed" } }
        : dialogue),
    }));
  };
  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-4 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-neutral-100">Legacy migration & recovery</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">Conversion retains the original tree verbatim. Ambiguous authored player lines stay visible for manual review instead of being silently reinterpreted.</p>
          </div>
          <button type="button" onClick={runMigration} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500">
            <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Scan and migrate ({remainingLegacy.length})
          </button>
        </div>
        {report && <pre className="whitespace-pre-wrap rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100">{report}</pre>}
        <div className="space-y-3">
          {migrations.map((dialogue) => {
            const migration = dialogue.legacy_migration!;
            return (
              <div key={dialogue.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Archive className="mt-0.5 h-4 w-4 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-100">{dialogue.display_name}</div>
                    <div className="font-mono text-[10px] text-neutral-600">{dialogue.id}</div>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] uppercase ${migration.status === "confirmed" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                    {migration.status.replace("_", " ")}
                  </span>
                  {migration.status !== "confirmed" && (
                    <button type="button" onClick={() => confirm(dialogue.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500">
                      <Check className="mr-1 inline h-3 w-3" /> Confirm review
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded bg-black/20 p-2 text-xs"><div className="text-neutral-500">Original nodes</div><div className="mt-1 text-lg text-neutral-200">{migration.original_nodes.length}</div></div>
                  <div className="rounded bg-black/20 p-2 text-xs"><div className="text-neutral-500">Keyword responses</div><div className="mt-1 text-lg text-neutral-200">{dialogue.responses?.length || 0}</div></div>
                  <div className="rounded bg-black/20 p-2 text-xs"><div className="text-neutral-500">Review issues</div><div className="mt-1 text-lg text-neutral-200">{migration.issues.length}</div></div>
                </div>
                {!!migration.issues.length && (
                  <div className="mt-3 space-y-1">
                    {migration.issues.map((issue, index) => (
                      <div key={`${issue.code}-${index}`} className="rounded bg-amber-950/20 px-2 py-1.5 text-xs">
                        <span className="text-amber-300">{issue.code}</span>
                        <span className="ml-2 text-neutral-300">{issue.message}</span>
                        {issue.original_text && <div className="mt-1 font-serif italic text-neutral-500">“{issue.original_text}”</div>}
                      </div>
                    ))}
                  </div>
                )}
                <details className="mt-3 rounded border border-neutral-800 bg-black/20">
                  <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-400">Recoverable original tree</summary>
                  <pre className="max-h-80 overflow-auto border-t border-neutral-800 p-3 text-[10px] leading-4 text-neutral-500">{JSON.stringify(migration.original_nodes, null, 2)}</pre>
                </details>
              </div>
            );
          })}
          {!migrations.length && (
            <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-600">No migration backups are present yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DialogueEditor() {
  const {
    gamePackage,
    selectedDialogueId,
    setSelectedDialogueId,
    addDialogue,
  } = useEngineStore();
  const [view, setView] = useState<EditorView>("conversations");
  const allKeywords = useMemo(
    () => ensureBuiltinDialogueKeywords(gamePackage.keywords || []),
    [gamePackage.keywords],
  );
  const validationIssues = useMemo(() => validateKeywordDialoguePackage(gamePackage), [gamePackage]);
  const activeDialogue = gamePackage.dialogue.find((dialogue) => dialogue.id === selectedDialogueId) || null;
  const createDialogue = () => {
    const id = uniqueId("dialogue", gamePackage.dialogue.map((dialogue) => dialogue.id));
    const dialogue: DialogueData = {
      id,
      display_name: "New Keyword Conversation",
      format: "keyword_v1",
      speaker: "NPC",
      nodes: [],
      responses: [],
      initial_topic_ids: [],
      initial_dynamic_topic_ids: [],
      action_topic_ids: ["action:silence", "action:goodbye"],
    };
    const opening = newResponse(dialogue);
    dialogue.responses = [opening];
    addDialogue(dialogue);
    setSelectedDialogueId(id);
    setView("conversations");
  };
  const nav = [
    { id: "conversations" as const, label: "Conversations", icon: MessageSquare, count: gamePackage.dialogue.length },
    { id: "keywords" as const, label: "Keywords", icon: Library, count: allKeywords.length },
    { id: "dynamic" as const, label: "Dynamic", icon: UserRound, count: gamePackage.dynamic_topics?.length || 0 },
    { id: "migration" as const, label: "Migration", icon: FileClock, count: gamePackage.dialogue.filter((dialogue) => dialogue.legacy_migration).length },
  ];
  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-neutral-950">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
        <div className="mr-2 hidden items-center gap-2 text-sm font-semibold text-neutral-200 md:flex">
          <GitBranch className="h-4 w-4 text-indigo-300" /> Topic Graph
        </div>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${view === item.id ? "bg-neutral-800 text-white" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"}`}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
                <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] text-neutral-500">{item.count}</span>
              </button>
            );
          })}
        </nav>
        <div className="w-56 max-w-full">
          <ValidationPanel issues={validationIssues} />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        {view === "conversations" && (
          <>
            <aside className={`${activeDialogue ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 lg:w-64`}>
              <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 p-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-300">NPC conversations</div>
                  <div className="mt-0.5 text-[10px] text-neutral-600">NPCs speak. Players choose topics.</div>
                </div>
                <button type="button" onClick={createDialogue} className="rounded bg-indigo-500/15 p-1.5 text-indigo-300 hover:bg-indigo-500/25" title="Create keyword conversation">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {gamePackage.dialogue.map((dialogue) => (
                  <button
                    key={dialogue.id}
                    type="button"
                    onClick={() => setSelectedDialogueId(dialogue.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left ${selectedDialogueId === dialogue.id ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800/50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm">{dialogue.display_name}</span>
                      {dialogue.format !== "keyword_v1" && <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-neutral-600">{dialogue.responses?.length || 0} responses · {dialogue.id}</div>
                  </button>
                ))}
                {!gamePackage.dialogue.length && (
                  <button type="button" onClick={createDialogue} className="w-full rounded-lg border border-dashed border-neutral-700 p-5 text-xs text-neutral-500 hover:border-indigo-700 hover:text-indigo-300">
                    <Sparkles className="mx-auto mb-2 h-4 w-4" /> Create the first keyword conversation
                  </button>
                )}
              </div>
            </aside>
            {activeDialogue ? (
              <ConversationWorkspace
                gamePackage={gamePackage}
                dialogue={activeDialogue}
                keywords={allKeywords}
                dynamicTopics={gamePackage.dynamic_topics || []}
                issues={validationIssues}
                onBack={() => setSelectedDialogueId(null)}
              />
            ) : (
              <main className="hidden flex-1 items-center justify-center bg-neutral-950 text-center lg:flex">
                <div className="max-w-md">
                  <BookOpen className="mx-auto h-8 w-8 text-neutral-700" />
                  <div className="mt-3 text-sm text-neutral-400">Select an NPC conversation.</div>
                  <div className="mt-1 text-xs leading-5 text-neutral-600">Responses are resolved from stable topics, conditions, priority, first/repeat history, and shown evidence.</div>
                </div>
              </main>
            )}
          </>
        )}
        {view === "keywords" && <KeywordLibrary gamePackage={gamePackage} keywords={allKeywords} />}
        {view === "dynamic" && <DynamicTopicLibrary gamePackage={gamePackage} keywords={allKeywords} dynamicTopics={gamePackage.dynamic_topics || []} />}
        {view === "migration" && <MigrationWorkspace gamePackage={gamePackage} />}
      </div>
    </div>
  );
}
