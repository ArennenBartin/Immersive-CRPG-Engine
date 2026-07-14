import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Code2, Plus, Trash2 } from "lucide-react";
import { ConditionData } from "../schema/game";
import { useEngineStore } from "../store/engineStore";

const timePhases = ["late_night", "night", "dawn", "day", "dusk"];

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const cleanCondition = (condition: ConditionData): ConditionData | undefined => {
  const entries = Object.entries(condition).filter(([, value]) => !isBlank(value));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as ConditionData;
};

const hasAdvancedShape = (condition?: ConditionData) =>
  Boolean(condition?.all?.length || condition?.any?.length || condition?.not);

const conditionSummary = (condition?: ConditionData) => {
  if (!condition) return "Always";
  const parts: string[] = [];
  if (condition.switch) {
    parts.push(`${condition.switch} is ${condition.switch_value ?? true}`);
  }
  if (condition.quest) parts.push(`${condition.quest} = ${condition.quest_state || "active"}`);
  if (condition.has_item) {
    parts.push(`${condition.has_item} x${condition.item_count || 1}`);
  }
  if (condition.party_contains) parts.push(`party has ${condition.party_contains}`);
  if (condition.faction) {
    const lo = condition.rep_gte !== undefined ? `>=${condition.rep_gte}` : "";
    const hi = condition.rep_lte !== undefined ? `<=${condition.rep_lte}` : "";
    parts.push(`${condition.faction} rep ${[lo, hi].filter(Boolean).join(" ") || "set"}`);
  }
  if (condition.time_of_day) {
    const phases = Array.isArray(condition.time_of_day)
      ? condition.time_of_day
      : [condition.time_of_day];
    parts.push(`time: ${phases.join(", ")}`);
  }
  if (condition.hour_gte !== undefined || condition.hour_lt !== undefined) {
    parts.push(`hour ${condition.hour_gte ?? 0}-${condition.hour_lt ?? 24}`);
  }
  if (condition.all?.length) parts.push(`all(${condition.all.length})`);
  if (condition.any?.length) parts.push(`any(${condition.any.length})`);
  if (condition.not) parts.push("not(...)");
  return parts.length ? parts.join(" + ") : "Always";
};

interface ConditionEditorProps {
  value?: ConditionData;
  onChange: (condition?: ConditionData) => void;
  label?: string;
  compact?: boolean;
}

export function ConditionEditor({
  value,
  onChange,
  label = "Condition",
  compact = false,
}: ConditionEditorProps) {
  const { gamePackage } = useEngineStore();
  const [expanded, setExpanded] = useState(false);
  const [advanced, setAdvanced] = useState(hasAdvancedShape(value));
  const [jsonText, setJsonText] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const factionIds = useMemo(() => {
    const ids = new Set<string>();
    gamePackage.factions?.forEach((f: any) => {
      if (typeof f === "string") ids.add(f);
      else if (f?.id) ids.add(f.id);
    });
    const visit = (condition?: ConditionData) => {
      if (!condition) return;
      if (condition.faction) ids.add(condition.faction);
      condition.all?.forEach(visit);
      condition.any?.forEach(visit);
      visit(condition.not);
    };
    gamePackage.dialogue.forEach((dialogue) =>
      dialogue.nodes.forEach((node) => node.options.forEach((opt) => visit(opt.condition))),
    );
    gamePackage.cutscenes.forEach((cutscene) =>
      cutscene.actions.forEach((action) => {
        visit(action.condition);
        if (action.faction_id) ids.add(action.faction_id);
      }),
    );
    gamePackage.shops?.forEach((shop) =>
      shop.items.forEach((item) => {
        visit(item.condition);
        item.price_modifiers?.forEach((modifier) => visit(modifier.condition));
      }),
    );
    if (ids.size === 0) ids.add("town");
    return Array.from(ids).sort();
  }, [gamePackage]);

  useEffect(() => {
    if (advanced || hasAdvancedShape(value)) {
      setJsonText(JSON.stringify(value || {}, null, 2));
    }
  }, [advanced, value]);

  const update = (updates: Partial<ConditionData>) => {
    onChange(cleanCondition({ ...(value || {}), ...updates }));
  };

  const setMaybeNumber = (key: keyof ConditionData, raw: string) => {
    update({ [key]: raw === "" ? undefined : Number(raw) } as Partial<ConditionData>);
  };

  const setTimePhase = (phase: string, checked: boolean) => {
    const current = value?.time_of_day
      ? Array.isArray(value.time_of_day)
        ? value.time_of_day
        : [value.time_of_day]
      : [];
    const next = checked
      ? Array.from(new Set([...current, phase]))
      : current.filter((entry) => entry !== phase);
    update({ time_of_day: next.length ? next : undefined });
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText || "{}");
      setJsonError(null);
      onChange(cleanCondition(parsed));
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  if (!expanded) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-950/70 p-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-w-0 text-left"
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {label}
            </div>
            <div className="truncate text-xs text-neutral-300">
              {conditionSummary(value)}
            </div>
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
              title="Clear condition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onChange({ switch: "new_flag" });
                setExpanded(true);
              }}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              title="Add condition"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/80 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-neutral-200">{label}</div>
          <div className="text-[11px] text-neutral-500">All visible fields are ANDed together.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdvanced((next) => !next)}
            className={`rounded px-2 py-1 text-xs ${advanced ? "bg-amber-500/20 text-amber-200" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}
          >
            <Code2 className="mr-1 inline h-3 w-3" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-400 hover:text-white"
          >
            Done
          </button>
        </div>
      </div>

      {advanced ? (
        <div className="space-y-2">
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            rows={compact ? 5 : 8}
            className="w-full rounded border border-neutral-800 bg-black px-2 py-2 font-mono text-xs text-neutral-200 outline-none focus:border-amber-600"
          />
          {jsonError && (
            <div className="flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {jsonError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyJson}
              className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
            >
              Apply JSON
            </button>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${compact ? "grid-cols-1" : "md:grid-cols-2"}`}>
          <Labeled label="Switch">
            <div className="flex gap-2">
              <input
                value={value?.switch || ""}
                onChange={(event) => update({ switch: event.target.value || undefined })}
                placeholder="flag_id"
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
              <select
                value={String(value?.switch_value ?? true)}
                onChange={(event) => update({ switch_value: event.target.value === "true" })}
                className="rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
          </Labeled>

          <Labeled label="Quest State">
            <div className="flex gap-2">
              <select
                value={value?.quest || ""}
                onChange={(event) => update({ quest: event.target.value || undefined })}
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              >
                <option value="">None</option>
                {gamePackage.quests.map((quest) => (
                  <option key={quest.id} value={quest.id}>{quest.display_name || quest.id}</option>
                ))}
              </select>
              <input
                value={value?.quest_state || ""}
                onChange={(event) => update({ quest_state: event.target.value || undefined })}
                placeholder="active"
                className="w-24 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
            </div>
          </Labeled>

          <Labeled label="Has Item">
            <div className="flex gap-2">
              <select
                value={value?.has_item || ""}
                onChange={(event) => update({ has_item: event.target.value || undefined })}
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              >
                <option value="">None</option>
                {gamePackage.items?.map((item) => (
                  <option key={item.id} value={item.id}>{item.display_name || item.id}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={value?.item_count ?? ""}
                onChange={(event) => setMaybeNumber("item_count", event.target.value)}
                placeholder="1"
                className="w-20 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
            </div>
          </Labeled>

          <Labeled label="Party Contains">
            <select
              value={value?.party_contains || ""}
              onChange={(event) => update({ party_contains: event.target.value || undefined })}
              className="w-full rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
            >
              <option value="">None</option>
              {gamePackage.entities.map((entity) => (
                <option key={entity.id} value={entity.id}>{entity.display_name || entity.id}</option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Faction Reputation">
            <div className="grid grid-cols-3 gap-2">
              <input
                list="condition-faction-ids"
                value={value?.faction || ""}
                onChange={(event) => update({ faction: event.target.value || undefined })}
                placeholder="faction"
                className="rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
              <datalist id="condition-faction-ids">
                {factionIds.map((id) => <option key={id} value={id} />)}
              </datalist>
              <input
                type="number"
                value={value?.rep_gte ?? ""}
                onChange={(event) => setMaybeNumber("rep_gte", event.target.value)}
                placeholder="min"
                className="rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
              <input
                type="number"
                value={value?.rep_lte ?? ""}
                onChange={(event) => setMaybeNumber("rep_lte", event.target.value)}
                placeholder="max"
                className="rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
            </div>
          </Labeled>

          <Labeled label="Time Phase">
            <div className="flex flex-wrap gap-2">
              {timePhases.map((phase) => {
                const selected = value?.time_of_day
                  ? (Array.isArray(value.time_of_day)
                      ? value.time_of_day
                      : [value.time_of_day]).includes(phase)
                  : false;
                return (
                  <label key={phase} className="flex items-center gap-1 text-[11px] text-neutral-300">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => setTimePhase(phase, event.target.checked)}
                    />
                    {phase}
                  </label>
                );
              })}
            </div>
          </Labeled>

          <Labeled label="Hour Range">
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={value?.hour_gte ?? ""}
                onChange={(event) => setMaybeNumber("hour_gte", event.target.value)}
                placeholder="from"
                className="w-24 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
              <input
                type="number"
                min={0}
                max={24}
                value={value?.hour_lt ?? ""}
                onChange={(event) => setMaybeNumber("hour_lt", event.target.value)}
                placeholder="to"
                className="w-24 rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
              />
            </div>
          </Labeled>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      {children}
    </label>
  );
}
