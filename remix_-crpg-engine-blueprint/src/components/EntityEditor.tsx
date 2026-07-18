import React, { useState } from "react";
import { useEngineStore } from "../store/engineStore";
import {
  type EntityData,
  type SensoryChannelData,
  type SensoryProfileData,
} from "../schema/game";
import { Copy, Plus, Skull, Trash2, ChevronLeft, Sparkles } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";
import { SwitchPicker } from "./SwitchPicker";

const statFields: { key: keyof EntityData; label: string; fallback: number }[] = [
  { key: "max_hp", label: "Max HP", fallback: 10 },
  { key: "max_mp", label: "Max MP", fallback: 0 },
  { key: "attack", label: "Attack", fallback: 2 },
  { key: "defense", label: "Defense", fallback: 1 },
  { key: "speed", label: "Speed", fallback: 10 },
  { key: "xp_reward", label: "XP", fallback: 0 },
];

type EmotionalAxisKey = "valence" | "arousal" | "grief" | "reverence" | "attachment";

type SensoryPresetId =
  | "standard"
  | "sight-dominant"
  | "hearing-dominant"
  | "light-glass-sensitive"
  | "deaf";

type EditableSensoryChannel = SensoryChannelData & {
  ignored_stimulus_tags?: string[];
  stimulus_tag_multipliers?: Record<string, number>;
  repeated_sound_gain?: number;
  positional_uncertainty?: number;
  barrier_response?: "normal" | "reduced" | "ignore";
};

const SENSORY_STIMULUS_KINDS: SensoryChannelData["stimulus_kinds"] = [
  "visible_player",
  "sound",
  "light",
  "fire",
  "smoke",
  "danger_gas",
];

const sensoryCsv = (values: string[] | undefined) => (values || []).join(", ");

const parseSensoryCsv = (value: string) =>
  [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];

const sensoryMultiplierText = (values: Record<string, number> | undefined) =>
  Object.entries(values || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, multiplier]) => `${tag}=${multiplier}`)
    .join(", ");

const parseSensoryMultipliers = (value: string) =>
  Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .flatMap((entry) => {
        const [tag, rawMultiplier] = entry.split("=").map((part) => part.trim());
        const multiplier = Number(rawMultiplier);
        return tag && Number.isFinite(multiplier) ? [[tag, Math.max(0, multiplier)]] : [];
      }),
  );

const sensoryChannel = (
  id: string,
  stimulusKinds: SensoryChannelData["stimulus_kinds"],
  overrides: Partial<EditableSensoryChannel> = {},
): SensoryChannelData => ({
  id,
  stimulus_kinds: stimulusKinds,
  range: 8,
  threshold: 0.2,
  sensitivity: 1,
  requires_los: false,
  requires_view_cone: false,
  view_cone_degrees: 120,
  requires_illumination: false,
  tracks_live_target: false,
  source_tracking: "none",
  ignored_stimulus_tags: [],
  stimulus_tag_multipliers: {},
  repeated_sound_gain: 0,
  positional_uncertainty: 0,
  barrier_response: "normal",
  ...overrides,
} as SensoryChannelData);

const SENSORY_PRESETS: Record<SensoryPresetId, SensoryProfileData> = {
  standard: {
    id: "standard",
    memory_ticks: 90,
    search_ticks: 90,
    channels: [
      sensoryChannel("sight", ["visible_player"], {
        requires_los: true,
        requires_view_cone: true,
        requires_illumination: true,
        tracks_live_target: true,
      }),
      sensoryChannel("hearing", ["sound"]),
    ],
  },
  "sight-dominant": {
    id: "sight-dominant",
    memory_ticks: 100,
    search_ticks: 80,
    channels: [
      sensoryChannel("sight", ["visible_player"], {
        range: 10,
        threshold: 0.15,
        sensitivity: 1.15,
        requires_los: true,
        requires_view_cone: true,
        view_cone_degrees: 150,
        requires_illumination: true,
        tracks_live_target: true,
      }),
      sensoryChannel("hearing", ["sound"], {
        range: 7,
        threshold: 0.24,
        sensitivity: 0.8,
        repeated_sound_gain: 0.08,
        positional_uncertainty: 1.5,
      }),
    ],
  },
  "hearing-dominant": {
    id: "hearing-dominant",
    memory_ticks: 120,
    search_ticks: 120,
    channels: [
      sensoryChannel("hearing", ["sound"], {
        range: 12,
        threshold: 0.12,
        sensitivity: 1.35,
        stimulus_tag_multipliers: {
          footstep: 1.35,
          object_push: 1.2,
          impact: 1.2,
        },
        repeated_sound_gain: 0.2,
        positional_uncertainty: 0.5,
        barrier_response: "reduced",
      }),
      sensoryChannel("sight", ["visible_player"], {
        range: 7,
        threshold: 0.22,
        sensitivity: 0.8,
        requires_los: true,
        requires_view_cone: true,
        view_cone_degrees: 110,
        requires_illumination: true,
        tracks_live_target: true,
      }),
    ],
  },
  "light-glass-sensitive": {
    id: "light-glass-sensitive",
    memory_ticks: 110,
    search_ticks: 100,
    channels: [
      sensoryChannel("light-glass", ["light"], {
        stimulus_tags: ["light", "glass"],
        range: 10,
        threshold: 0.1,
        sensitivity: 1.25,
        requires_los: true,
        tracks_live_target: true,
        source_tracking: "lock_after_acquisition",
      }),
      sensoryChannel("sight", ["visible_player"], {
        range: 7,
        threshold: 0.22,
        sensitivity: 0.8,
        requires_los: true,
        requires_view_cone: true,
        view_cone_degrees: 110,
        requires_illumination: true,
        tracks_live_target: true,
      }),
      sensoryChannel("hearing", ["sound"], {
        range: 6,
        threshold: 0.28,
        sensitivity: 0.7,
        ignored_stimulus_tags: ["glass"],
        repeated_sound_gain: 0.06,
        positional_uncertainty: 2,
      }),
    ],
  },
  deaf: {
    id: "deaf",
    memory_ticks: 90,
    search_ticks: 80,
    channels: [
      sensoryChannel("sight", ["visible_player"], {
        range: 9,
        threshold: 0.18,
        sensitivity: 1,
        requires_los: true,
        requires_view_cone: true,
        requires_illumination: true,
        tracks_live_target: true,
      }),
    ],
  },
};

const sensoryProfileForPreset = (id: SensoryPresetId): SensoryProfileData => {
  const profile = SENSORY_PRESETS[id];
  return {
    ...profile,
    channels: profile.channels.map((channel) => {
      const editable = channel as EditableSensoryChannel;
      return {
        ...channel,
        stimulus_kinds: [...channel.stimulus_kinds],
        stimulus_tags: channel.stimulus_tags ? [...channel.stimulus_tags] : undefined,
        ignored_stimulus_tags: [...(editable.ignored_stimulus_tags || [])],
        stimulus_tag_multipliers: { ...(editable.stimulus_tag_multipliers || {}) },
      };
    }),
  };
};

// Authored starting emotions. Fallbacks mirror defaultAlderamonticoEmotionalAxes
// so an unset axis shows the value the engine would use anyway.
const emotionalAxisFields: {
  key: EmotionalAxisKey;
  label: string;
  low: string;
  high: string;
  fallback: number;
}[] = [
  { key: "valence", label: "Valence", low: "anguish", high: "joy", fallback: 50 },
  { key: "arousal", label: "Arousal", low: "numb", high: "frantic", fallback: 30 },
  { key: "grief", label: "Grief-load", low: "unburdened", high: "crushed", fallback: 10 },
  { key: "reverence", label: "Reverence", low: "defiant", high: "reverent", fallback: 20 },
  { key: "attachment", label: "Attachment", low: "severed", high: "bound", fallback: 35 },
];

export function EntityEditor() {
  const {
    gamePackage,
    selectedEntityId,
    setSelectedEntityId,
    addEntity,
    updateEntity,
    deleteEntity,
  } = useEngineStore();
  const [showAIModal, setShowAIModal] = useState(false);

  const activeEntity =
    gamePackage.entities.find((entity) => entity.id === selectedEntityId) || null;

  const handleCreateEntity = () => {
    const id = `entity_${Date.now()}`;
    const newEntity: EntityData = {
      id,
      display_name: "New Entity",
      is_npc: false,
      max_hp: 10,
      max_mp: 0,
      attack: 2,
      defense: 1,
      speed: 10,
      skills: [],
    };
    addEntity(newEntity);
    setSelectedEntityId(id);
  };

  const handleUpdate = (updates: Partial<EntityData>) => {
    if (!activeEntity) return;
    updateEntity(activeEntity.id, updates);
  };

  const toggleSkill = (skillId: string, enabled: boolean) => {
    if (!activeEntity) return;
    const current = activeEntity.skills || [];
    const skills = enabled
      ? Array.from(new Set([...current, skillId]))
      : current.filter((id) => id !== skillId);
    handleUpdate({ skills });
  };

  const setEmotionalAxis = (key: EmotionalAxisKey, value: number | undefined) => {
    if (!activeEntity) return;
    const next = { ...(activeEntity.emotional_axes || {}) };
    if (value === undefined || Number.isNaN(value)) delete next[key];
    else next[key] = Math.max(0, Math.min(100, value));
    handleUpdate({ emotional_axes: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="flex h-full w-full relative">
      <div className={`${activeEntity ? "hidden lg:flex" : "flex"} w-full lg:w-64 bg-neutral-900 border-r border-neutral-800 flex-col h-full z-10 shrink-0`}>
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Entities</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAIModal(true)}
              title="Generate Entity"
              className="p-1.5 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={handleCreateEntity}
              title="Create Entity"
              className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {gamePackage.entities.map((entity) => (
            <button
              key={entity.id}
              onClick={() => setSelectedEntityId(entity.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between group ${
                selectedEntityId === entity.id
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Skull className={`w-4 h-4 shrink-0 ${selectedEntityId === entity.id ? "text-emerald-500" : "text-neutral-600"}`} />
                <span className="truncate">{entity.display_name || "Unnamed Entity"}</span>
              </div>
              <span className="ml-2 text-[10px] uppercase text-neutral-600">
                {entity.is_npc ? "NPC" : "Hostile"}
              </span>
            </button>
          ))}
          {gamePackage.entities.length === 0 && (
            <div className="text-center text-xs text-neutral-600 mt-8">
              No entities created yet.
            </div>
          )}
        </div>
      </div>

      {activeEntity ? (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-neutral-950 w-full block">
          <div className="lg:hidden mb-4 flex items-center gap-2">
            <button
              onClick={() => setSelectedEntityId(null)}
              className="p-1.5 -ml-1.5 text-neutral-400 hover:text-white bg-neutral-900 rounded-md"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-neutral-300">Back to Entities</span>
          </div>

          <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Entity</h2>
                <p className="text-xs text-neutral-500 font-mono">{activeEntity.id}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Duplicate entity"
                  onClick={() => {
                    const id = `${activeEntity.id}_copy`;
                    addEntity({ ...activeEntity, id, display_name: `${activeEntity.display_name} (copy)` });
                    setSelectedEntityId(id);
                  }}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Delete entity (also removes its map placements)"
                  onClick={() => {
                    const placements = gamePackage.maps.reduce(
                      (sum, map) => sum + (map.entity_placements || []).filter((p) => p.entity_id === activeEntity.id).length,
                      0,
                    );
                    const message = placements
                      ? `Delete ${activeEntity.display_name || activeEntity.id} and its ${placements} map placement(s)?`
                      : `Delete ${activeEntity.display_name || activeEntity.id}?`;
                    if (window.confirm(message)) {
                      deleteEntity(activeEntity.id);
                      setSelectedEntityId(null);
                    }
                  }}
                  className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-md transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <section className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="ID">
                  <input
                    type="text"
                    value={activeEntity.id}
                    disabled
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-500 cursor-not-allowed"
                  />
                </Field>
                <Field label="Display Name">
                  <input
                    type="text"
                    value={activeEntity.display_name || ""}
                    onChange={(event) => handleUpdate({ display_name: event.target.value })}
                    placeholder="e.g. Guide"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={activeEntity.is_npc || false}
                  onChange={(event) => handleUpdate({ is_npc: event.target.checked })}
                  className="rounded bg-neutral-900 border-neutral-700"
                />
                Friendly NPC / talkable entity
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="World Dialogue">
                  <select
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    value={activeEntity.dialogue_id || ""}
                    onChange={(event) => handleUpdate({ dialogue_id: event.target.value || undefined })}
                  >
                    <option value="">-- None --</option>
                    {gamePackage.dialogue.map((dialogue) => (
                      <option key={dialogue.id} value={dialogue.id}>
                        {dialogue.display_name || dialogue.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Party Dialogue">
                  <select
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    value={activeEntity.party_dialogue_id || ""}
                    onChange={(event) => handleUpdate({ party_dialogue_id: event.target.value || undefined })}
                  >
                    <option value="">Fallback to world dialogue</option>
                    {gamePackage.dialogue.map((dialogue) => (
                      <option key={dialogue.id} value={dialogue.id}>
                        {dialogue.display_name || dialogue.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/10 p-3">
                <div className="text-xs font-semibold text-indigo-100">Topics learned by meeting this entity</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {gamePackage.keywords?.map((topic) => {
                    const selected = (activeEntity.discover_topic_ids || []).includes(topic.id);
                    return (
                      <label key={topic.id} className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => handleUpdate({
                            discover_topic_ids: event.target.checked
                              ? Array.from(new Set([...(activeEntity.discover_topic_ids || []), topic.id]))
                              : (activeEntity.discover_topic_ids || []).filter((id) => id !== topic.id),
                          })}
                        />
                        {topic.display_label}
                      </label>
                    );
                  })}
                  {gamePackage.dynamic_topics?.map((topic) => {
                    const selected = (activeEntity.discover_dynamic_topic_ids || []).includes(topic.id);
                    return (
                      <label key={topic.id} className="flex items-center gap-1.5 rounded border border-violet-500/20 bg-violet-950/10 px-2 py-1 text-[11px] text-violet-100">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => handleUpdate({
                            discover_dynamic_topic_ids: event.target.checked
                              ? Array.from(new Set([...(activeEntity.discover_dynamic_topic_ids || []), topic.id]))
                              : (activeEntity.discover_dynamic_topic_ids || []).filter((id) => id !== topic.id),
                          })}
                        />
                        {topic.display_name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <Field label="Entity Sprite">
                <select
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={activeEntity.sprite_id || ""}
                  onChange={(event) => handleUpdate({ sprite_id: event.target.value || undefined })}
                >
                  <option value="">-- None (Simple Box) --</option>
                  {gamePackage.sprite_library.map((sprite) => (
                    <option key={sprite.id} value={sprite.id}>{sprite.display_name || sprite.id}</option>
                  ))}
                </select>
              </Field>
            </section>

            <section className="space-y-4 border-t border-neutral-800 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-neutral-300">Combat Stats</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Used by hostiles and by party members when a cutscene adds this entity to the party.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {statFields.map((field) => (
                  <Field key={String(field.key)} label={field.label}>
                    <input
                      type="number"
                      value={(activeEntity[field.key] as number | undefined) ?? field.fallback}
                      onChange={(event) =>
                        handleUpdate({ [field.key]: parseInt(event.target.value, 10) || 0 } as Partial<EntityData>)
                      }
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </Field>
                ))}
              </div>
            </section>

            <SensoryProfileSection entity={activeEntity} onUpdate={handleUpdate} />

            <section className="space-y-4 border-t border-neutral-800 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-neutral-300">Skills</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Party members can use these on their combat turns. Hostiles keep their normal melee/chase behavior.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(gamePackage.abilities || []).map((skill) => (
                  <label
                    key={skill.id}
                    className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={(activeEntity.skills || []).includes(skill.id)}
                      onChange={(event) => toggleSkill(skill.id, event.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-100">{skill.display_name || skill.id}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {skill.element} / {skill.targeting} / AP {skill.ap_cost}
                      </span>
                    </span>
                  </label>
                ))}
                {(gamePackage.abilities || []).length === 0 && (
                  <p className="rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
                    No skills exist yet. Create them in the Skills editor first.
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-4 border-t border-neutral-800 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300">Emotional Axes</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Authored starting emotions (0–100). Seeds this entity's Alderamontico state the
                    first time the Grid, a verb, or Attend touches it. Unset axes use engine defaults.
                  </p>
                </div>
                {activeEntity.emotional_axes && (
                  <button
                    type="button"
                    onClick={() => handleUpdate({ emotional_axes: undefined })}
                    className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {emotionalAxisFields.map((field) => {
                  const raw = activeEntity.emotional_axes?.[field.key];
                  const authored = typeof raw === "number";
                  const value = authored ? (raw as number) : field.fallback;
                  return (
                    <div
                      key={field.key}
                      className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3"
                    >
                      <span className="text-xs font-medium text-neutral-300">
                        {field.label}
                        {!authored && <span className="ml-1 text-[10px] text-neutral-600">(default)</span>}
                      </span>
                      <div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={value}
                          onChange={(event) => setEmotionalAxis(field.key, parseInt(event.target.value, 10))}
                          className="w-full accent-emerald-500"
                        />
                        <div className="flex justify-between text-[10px] uppercase tracking-wide text-neutral-600">
                          <span>{field.low}</span>
                          <span>{field.high}</span>
                        </div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={authored ? value : ""}
                        placeholder={String(field.fallback)}
                        onChange={(event) =>
                          setEmotionalAxis(
                            field.key,
                            event.target.value === "" ? undefined : parseInt(event.target.value, 10),
                          )
                        }
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-4 border-t border-neutral-800 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-neutral-300">Story Hooks</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  What the world remembers about this entity's death.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={activeEntity.soul_bearing || false}
                  onChange={(event) => handleUpdate({ soul_bearing: event.target.checked || undefined })}
                  className="rounded bg-neutral-900 border-neutral-700"
                />
                Soul-bearing — killing it docks hidden road reputation (−3) and logs the cold line
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="On defeat, set switch">
                  <SwitchPicker
                    value={(activeEntity as Record<string, any>).on_defeat_switch || ""}
                    onChange={(value) => handleUpdate({ on_defeat_switch: value || undefined } as Partial<EntityData>)}
                    placeholder="none"
                  />
                </Field>
                <Field label="On defeat, play cutscene">
                  <select
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    value={(activeEntity as Record<string, any>).on_defeat_cutscene_id || ""}
                    onChange={(event) =>
                      handleUpdate({ on_defeat_cutscene_id: event.target.value || undefined } as Partial<EntityData>)
                    }
                  >
                    <option value="">-- None --</option>
                    {gamePackage.cutscenes.map((cutscene) => (
                      <option key={cutscene.id} value={cutscene.id}>
                        {cutscene.display_name || cutscene.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            {!activeEntity.is_npc && (
              <section className="space-y-4 border-t border-neutral-800 pt-6">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300">Combat Attend</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Lets the player Attend this hostile mid-fight: a combat-only button opens the
                    dialogue below and spends the turn. Success can flip it permanently peaceful.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={(activeEntity as Record<string, any>).combat_attend_enabled || false}
                    onChange={(event) =>
                      handleUpdate({ combat_attend_enabled: event.target.checked || undefined } as Partial<EntityData>)
                    }
                    className="rounded bg-neutral-900 border-neutral-700"
                  />
                  Enable mid-combat Attend
                </label>
                {(activeEntity as Record<string, any>).combat_attend_enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Attend dialogue">
                      <select
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        value={(activeEntity as Record<string, any>).combat_attend_dialogue_id || ""}
                        onChange={(event) =>
                          handleUpdate({ combat_attend_dialogue_id: event.target.value || undefined } as Partial<EntityData>)
                        }
                      >
                        <option value="">-- Pick dialogue --</option>
                        {gamePackage.dialogue.map((dialogue) => (
                          <option key={dialogue.id} value={dialogue.id}>
                            {dialogue.display_name || dialogue.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Marks attended via switch (one-shot)">
                      <SwitchPicker
                        value={(activeEntity as Record<string, any>).combat_attend_switch || ""}
                        onChange={(value) => handleUpdate({ combat_attend_switch: value || undefined } as Partial<EntityData>)}
                        placeholder="attended_<id>"
                      />
                    </Field>
                    <Field label="Success switch (set by the dialogue)">
                      <SwitchPicker
                        value={(activeEntity as Record<string, any>).combat_attend_success_switch || ""}
                        onChange={(value) =>
                          handleUpdate({ combat_attend_success_switch: value || undefined } as Partial<EntityData>)
                        }
                        placeholder="<id>_spared"
                      />
                    </Field>
                    <Field label="On success, swap to peaceful entity">
                      <select
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        value={(activeEntity as Record<string, any>).combat_attend_pacify_entity_id || ""}
                        onChange={(event) =>
                          handleUpdate({ combat_attend_pacify_entity_id: event.target.value || undefined } as Partial<EntityData>)
                        }
                      >
                        <option value="">-- Stays hostile --</option>
                        {gamePackage.entities
                          .filter((entity) => entity.is_npc)
                          .map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {entity.display_name || entity.id}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                )}
              </section>
            )}

            <AttendNodeSection entity={activeEntity} onUpdate={handleUpdate} />
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-neutral-400 bg-neutral-950">
          <Skull className="w-12 h-12 mb-4 opacity-20" />
          <h2 className="text-xl font-medium">No Entity Selected</h2>
          <p className="text-sm mt-1 opacity-70">Create or select an entity to define its behavior.</p>
        </div>
      )}

      {showAIModal && (
        <AIGenerationModal
          title="Generate Entities"
          placeholder="e.g. Generate a priest NPC, a river spirit enemy, and a party companion..."
          schema={{
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                display_name: { type: "STRING" },
                is_npc: { type: "BOOLEAN" },
                sprite_id: { type: "STRING" },
                dialogue_id: { type: "STRING" },
                party_dialogue_id: { type: "STRING" },
                max_hp: { type: "NUMBER" },
                max_mp: { type: "NUMBER" },
                attack: { type: "NUMBER" },
                defense: { type: "NUMBER" },
                speed: { type: "NUMBER" },
                xp_reward: { type: "NUMBER" },
                skills: { type: "ARRAY", items: { type: "STRING" } },
                emotional_axes: {
                  type: "OBJECT",
                  properties: {
                    valence: { type: "NUMBER" },
                    arousal: { type: "NUMBER" },
                    grief: { type: "NUMBER" },
                    reverence: { type: "NUMBER" },
                    attachment: { type: "NUMBER" },
                  },
                },
                sensory_profile: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "STRING" },
                    memory_ticks: { type: "NUMBER" },
                    search_ticks: { type: "NUMBER" },
                    channels: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          id: { type: "STRING" },
                          stimulus_kinds: { type: "ARRAY", items: { type: "STRING" } },
                          stimulus_tags: { type: "ARRAY", items: { type: "STRING" } },
                          ignored_stimulus_tags: { type: "ARRAY", items: { type: "STRING" } },
                          stimulus_tag_multipliers: {
                            type: "OBJECT",
                            additionalProperties: { type: "NUMBER" },
                          },
                          range: { type: "NUMBER" },
                          threshold: { type: "NUMBER" },
                          sensitivity: { type: "NUMBER" },
                          repeated_sound_gain: { type: "NUMBER" },
                          positional_uncertainty: { type: "NUMBER" },
                          barrier_response: {
                            type: "STRING",
                            enum: ["normal", "reduced", "ignore"],
                          },
                          requires_los: { type: "BOOLEAN" },
                          requires_view_cone: { type: "BOOLEAN" },
                          view_cone_degrees: { type: "NUMBER" },
                          requires_illumination: { type: "BOOLEAN" },
                          tracks_live_target: { type: "BOOLEAN" },
                          source_tracking: {
                            type: "STRING",
                            enum: ["none", "lock_after_acquisition"],
                          },
                        },
                      },
                    },
                  },
                },
              },
              required: ["id", "display_name", "is_npc"],
            },
          }}
          onGenerate={(data) => {
            const entities = Array.isArray(data) ? data : [data];
            entities.forEach((entity) => addEntity(entity));
            if (entities.length > 0) setSelectedEntityId(entities[0].id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs text-neutral-500 font-medium tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function SensoryProfileSection({
  entity,
  onUpdate,
}: {
  entity: EntityData;
  onUpdate: (updates: Partial<EntityData>) => void;
}) {
  const profile = entity.sensory_profile;
  const authoredChannels = (profile?.channels || []) as EditableSensoryChannel[];
  const makeCustomProfile = (base: SensoryProfileData) => ({
    ...base,
    id: Object.prototype.hasOwnProperty.call(SENSORY_PRESETS, base.id)
      ? `custom-${entity.id}`
      : base.id,
  });
  const patchProfile = (updates: Partial<SensoryProfileData>) => {
    const base = profile || sensoryProfileForPreset("standard");
    onUpdate({ sensory_profile: { ...makeCustomProfile(base), ...updates } });
  };
  const updateChannel = (index: number, updates: Partial<EditableSensoryChannel>) => {
    const base = profile || sensoryProfileForPreset("standard");
    patchProfile({
      channels: base.channels.map((channel, channelIndex) =>
        channelIndex === index ? { ...channel, ...updates } : channel,
      ),
    });
  };
  const addChannel = () => {
    const base = profile || sensoryProfileForPreset("standard");
    const usedIds = new Set(base.channels.map((channel) => channel.id));
    let suffix = base.channels.length + 1;
    while (usedIds.has(`channel-${suffix}`)) suffix += 1;
    patchProfile({
      channels: [...base.channels, sensoryChannel(`channel-${suffix}`, ["sound"])],
    });
  };

  return (
    <section className="space-y-4 border-t border-neutral-800 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-300">Sensory Profile</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Author independent sight, hearing, light, and hazard channels. Hearing options affect
            mechanical sound only; speaker volume does not change detection.
          </p>
        </div>
        {profile && (
          <button
            type="button"
            onClick={() => onUpdate({ sensory_profile: undefined })}
            className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
          >
            Use default
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Profile preset">
          <select
            className={inputCls}
            value={
              profile
                ? Object.prototype.hasOwnProperty.call(SENSORY_PRESETS, profile.id)
                  ? profile.id
                  : "custom"
                : ""
            }
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                onUpdate({ sensory_profile: undefined });
                return;
              }
              if (value === "custom") return;
              onUpdate({ sensory_profile: sensoryProfileForPreset(value as SensoryPresetId) });
            }}
          >
            <option value="">Engine default</option>
            <option value="standard">Standard sight + hearing</option>
            <option value="sight-dominant">Sight-dominant</option>
            <option value="hearing-dominant">Hearing-dominant</option>
            <option value="light-glass-sensitive">Light / Glass-sensitive</option>
            <option value="deaf">Deaf — sight only</option>
            {profile && !Object.prototype.hasOwnProperty.call(SENSORY_PRESETS, profile.id) && (
              <option value="custom">Custom: {profile.id}</option>
            )}
          </select>
        </Field>
        <Field label="Memory ticks">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={profile?.memory_ticks ?? 90}
            onChange={(event) =>
              patchProfile({ memory_ticks: Math.max(0, parseInt(event.target.value, 10) || 0) })
            }
          />
        </Field>
        <Field label="Search ticks">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={profile?.search_ticks ?? 90}
            onChange={(event) =>
              patchProfile({ search_ticks: Math.max(0, parseInt(event.target.value, 10) || 0) })
            }
          />
        </Field>
      </div>

      {!profile && (
        <p className="rounded-lg border border-dashed border-neutral-800 p-3 text-xs text-neutral-500">
          No authored override. Choose a preset or add a channel to write an explicit profile.
        </p>
      )}

      <div className="space-y-3">
        {authoredChannels.map((channel, index) => {
          const hasSound = channel.stimulus_kinds.includes("sound");
          return (
            <div
              key={index}
              className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/55 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Field label={`Channel ${index + 1} ID`}>
                    <input
                      className={inputCls}
                      value={channel.id}
                      onChange={(event) => updateChannel(index, { id: event.target.value })}
                    />
                  </Field>
                </div>
                <span
                  className={`mt-5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    hasSound
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                  }`}
                >
                  {hasSound ? "hearing" : "non-auditory"}
                </span>
                <button
                  type="button"
                  title="Remove sensory channel"
                  onClick={() =>
                    patchProfile({ channels: authoredChannels.filter((_, candidate) => candidate !== index) })
                  }
                  className="ml-auto mt-5 rounded-md p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium tracking-wide text-neutral-500">
                  Stimulus kinds
                </div>
                <div className="flex flex-wrap gap-2">
                  {SENSORY_STIMULUS_KINDS.map((kind) => (
                    <label
                      key={kind}
                      className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[11px] text-neutral-300"
                    >
                      <input
                        type="checkbox"
                        checked={channel.stimulus_kinds.includes(kind)}
                        onChange={(event) =>
                          updateChannel(index, {
                            stimulus_kinds: event.target.checked
                              ? [...channel.stimulus_kinds, kind]
                              : channel.stimulus_kinds.filter((candidate) => candidate !== kind),
                          })
                        }
                      />
                      {kind.replaceAll("_", " ")}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Required tags (comma-separated)">
                  <input
                    key={sensoryCsv(channel.stimulus_tags)}
                    className={inputCls}
                    defaultValue={sensoryCsv(channel.stimulus_tags)}
                    placeholder="glass, lamp"
                    onBlur={(event) =>
                      updateChannel(index, {
                        stimulus_tags: parseSensoryCsv(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Ignored tags (comma-separated)">
                  <input
                    key={sensoryCsv(channel.ignored_stimulus_tags)}
                    className={inputCls}
                    defaultValue={sensoryCsv(channel.ignored_stimulus_tags)}
                    placeholder="footstep, voice"
                    onBlur={(event) =>
                      updateChannel(index, {
                        ignored_stimulus_tags: parseSensoryCsv(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Tag sensitivity (tag=multiplier)">
                  <input
                    key={sensoryMultiplierText(channel.stimulus_tag_multipliers)}
                    className={inputCls}
                    defaultValue={sensoryMultiplierText(channel.stimulus_tag_multipliers)}
                    placeholder="footstep=1.35, impact=1.2"
                    onBlur={(event) =>
                      updateChannel(index, {
                        stimulus_tag_multipliers: parseSensoryMultipliers(event.target.value),
                      })
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {(
                  [
                    ["range", "Range", 0, undefined, 0.5],
                    ["threshold", "Threshold", 0, 1, 0.01],
                    ["sensitivity", "Sensitivity", 0, undefined, 0.05],
                    ["repeated_sound_gain", "Repeat gain", 0, 1, 0.01],
                    ["positional_uncertainty", "Uncertainty", 0, undefined, 0.25],
                    ["view_cone_degrees", "View cone °", 1, 360, 1],
                  ] as const
                ).map(([key, label, min, max, step]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      disabled={key === "view_cone_degrees" && !channel.requires_view_cone}
                      className={`${inputCls} disabled:opacity-40`}
                      value={channel[key] ?? 0}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) updateChannel(index, { [key]: value });
                      }}
                    />
                  </Field>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Barrier response (sound only)">
                  <select
                    className={inputCls}
                    value={channel.barrier_response || "normal"}
                    onChange={(event) =>
                      updateChannel(index, {
                        barrier_response: event.target.value as EditableSensoryChannel["barrier_response"],
                      })
                    }
                  >
                    <option value="normal">Normal attenuation</option>
                    <option value="reduced">Reduced attenuation</option>
                    <option value="ignore">Ignore barriers</option>
                  </select>
                </Field>
                <Field label="Source tracking">
                  <select
                    className={inputCls}
                    value={channel.source_tracking || "none"}
                    onChange={(event) =>
                      updateChannel(index, {
                        source_tracking: event.target.value as SensoryChannelData["source_tracking"],
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="lock_after_acquisition">Lock after acquisition</option>
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(
                  [
                    ["requires_los", "Requires line of sight"],
                    ["requires_view_cone", "Requires view cone"],
                    ["requires_illumination", "Requires illumination"],
                    ["tracks_live_target", "Tracks live target"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={Boolean(channel[key])}
                      onChange={(event) => updateChannel(index, { [key]: event.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addChannel}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-emerald-500/50 hover:text-emerald-300"
      >
        <Plus className="h-3.5 w-3.5" />
        Add sensory channel
      </button>
      {profile && authoredChannels.length === 0 && (
        <p className="text-xs text-amber-300/80">
          This actor currently has no sensory channels and cannot perceive any stimulus.
        </p>
      )}
    </section>
  );
}

// ── Authored Attend node ──────────────────────────────────────────────────────
// Doc 06's deep-look data: hidden readings the player can surface by holding
// Attention on the target, plus composure pressure and a timeout consequence.
// Without one, Play falls back to a generated condition read.
type AttendNode = NonNullable<EntityData["attend_node"]>;
type AttendReading = AttendNode["readings"][number];

const inputCls =
  "w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500";

function AttendNodeSection({
  entity,
  onUpdate,
}: {
  entity: EntityData;
  onUpdate: (updates: Partial<EntityData>) => void;
}) {
  const node = entity.attend_node;
  const patchNode = (updates: Partial<AttendNode>) =>
    onUpdate({ attend_node: { ...(node as AttendNode), ...updates } });
  const patchReading = (index: number, updates: Partial<AttendReading>) =>
    patchNode({
      readings: (node?.readings || []).map((reading, i) =>
        i === index ? { ...reading, ...updates } : reading,
      ),
    });

  return (
    <section className="space-y-4 border-t border-neutral-800 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-300">Authored Attend Node</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Hidden readings the player can surface by Attending this entity. TRUE readings reward
            insight; FALSE ones are the comfortable misread; PARTIAL admits uncertainty. Without
            an authored node, Play generates a plain condition read.
          </p>
        </div>
        {node ? (
          <button
            type="button"
            onClick={() => onUpdate({ attend_node: undefined })}
            className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              onUpdate({
                attend_node: {
                  id: `attend_${entity.id}`,
                  target: entity.id,
                  composure: 3,
                  readings: [],
                },
              })
            }
            className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
          >
            + Create
          </button>
        )}
      </div>

      {node && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Composure (turns of pressure)">
              <input
                type="number"
                className={inputCls}
                value={node.composure ?? 3}
                onChange={(event) => patchNode({ composure: parseInt(event.target.value, 10) || 0 })}
              />
            </Field>
          </div>

          <div>
            <span className="text-xs text-neutral-500 font-medium tracking-wide">
              Glass pressure while attended (signed axis push per turn)
            </span>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
              {(["valence", "arousal", "grief", "reverence", "attachment"] as const).map((axis) => (
                <Field key={axis} label={axis}>
                  <input
                    type="number"
                    className={inputCls}
                    value={node.glassPressure?.[axis] ?? ""}
                    placeholder="0"
                    onChange={(event) => {
                      const next = { ...(node.glassPressure || {}) };
                      if (event.target.value === "") delete next[axis];
                      else next[axis] = parseInt(event.target.value, 10) || 0;
                      patchNode({ glassPressure: Object.keys(next).length ? next : undefined });
                    }}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium tracking-wide">Readings</span>
              <button
                type="button"
                onClick={() =>
                  patchNode({
                    readings: [
                      ...(node.readings || []),
                      {
                        id: `reading_${(node.readings || []).length + 1}`,
                        text: "",
                        truth: "true",
                        requiresAttention: 0,
                      },
                    ],
                  })
                }
                className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:text-white hover:border-neutral-500"
              >
                + Reading
              </button>
            </div>
            {(node.readings || []).map((reading, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="flex items-start gap-2">
                  <textarea
                    className={`${inputCls} min-h-[2.5rem] flex-1 text-xs`}
                    value={reading.text}
                    placeholder="What the player reads when this surfaces…"
                    onChange={(event) => patchReading(index, { text: event.target.value })}
                  />
                  <button
                    type="button"
                    className="p-1.5 text-neutral-500 hover:text-red-400"
                    onClick={() =>
                      patchNode({ readings: (node.readings || []).filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="Truth">
                    <select
                      className={inputCls}
                      value={reading.truth}
                      onChange={(event) =>
                        patchReading(index, { truth: event.target.value as AttendReading["truth"] })
                      }
                    >
                      <option value="true">true — the real thing</option>
                      <option value="false">false — the misread</option>
                      <option value="partial">partial — honest doubt</option>
                    </select>
                  </Field>
                  <Field label="Needs attention ≥">
                    <input
                      type="number"
                      className={inputCls}
                      value={reading.requiresAttention ?? 0}
                      onChange={(event) =>
                        patchReading(index, { requiresAttention: parseInt(event.target.value, 10) || 0 })
                      }
                    />
                  </Field>
                  <Field label="On pick, set switch">
                    <SwitchPicker
                      value={reading.effect?.set_switch || ""}
                      onChange={(value) =>
                        patchReading(index, {
                          effect: { ...(reading.effect || {}), set_switch: value || undefined },
                        })
                      }
                      placeholder="none"
                    />
                  </Field>
                  <Field label="Attention delta">
                    <input
                      type="number"
                      className={inputCls}
                      value={reading.effect?.attention_delta ?? ""}
                      placeholder="0"
                      onChange={(event) =>
                        patchReading(index, {
                          effect: {
                            ...(reading.effect || {}),
                            attention_delta:
                              event.target.value === "" ? undefined : parseInt(event.target.value, 10),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
            {(node.readings || []).length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-800 p-3 text-xs text-neutral-500">
                No readings yet — add at least one TRUE and one FALSE so the look has stakes.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="On timeout, force reading">
              <select
                className={inputCls}
                value={node.onTimeout?.reading_id || ""}
                onChange={(event) =>
                  patchNode({
                    onTimeout: event.target.value
                      ? { ...(node.onTimeout || {}), reading_id: event.target.value }
                      : node.onTimeout?.status_effect
                        ? { ...(node.onTimeout || {}), reading_id: undefined }
                        : undefined,
                  })
                }
              >
                <option value="">-- Nothing --</option>
                {(node.readings || []).map((reading) => (
                  <option key={reading.id || reading.text} value={reading.id || ""}>
                    {reading.id || reading.text.slice(0, 32)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Timeout status effect">
              <input
                className={inputCls}
                value={node.onTimeout?.status_effect || ""}
                placeholder="e.g. glass_residue"
                onChange={(event) =>
                  patchNode({
                    onTimeout:
                      event.target.value || node.onTimeout?.reading_id
                        ? { ...(node.onTimeout || {}), status_effect: event.target.value || undefined }
                        : undefined,
                  })
                }
              />
            </Field>
            <Field label="Timeout status turns">
              <input
                type="number"
                className={inputCls}
                value={node.onTimeout?.status_duration ?? ""}
                placeholder="2"
                onChange={(event) =>
                  patchNode({
                    onTimeout: node.onTimeout
                      ? {
                          ...node.onTimeout,
                          status_duration:
                            event.target.value === "" ? undefined : parseInt(event.target.value, 10),
                        }
                      : undefined,
                  })
                }
              />
            </Field>
          </div>
        </div>
      )}
    </section>
  );
}
