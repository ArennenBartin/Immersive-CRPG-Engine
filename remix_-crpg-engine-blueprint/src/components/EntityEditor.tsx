import React, { useState } from "react";
import { useEngineStore } from "../store/engineStore";
import { EntityData } from "../schema/game";
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
