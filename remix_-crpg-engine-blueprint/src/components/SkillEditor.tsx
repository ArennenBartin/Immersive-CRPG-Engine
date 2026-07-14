import React, { useState } from "react";
import { useEngineStore } from "../store/engineStore";
import { AlertTriangle, Plus, Trash2, Sparkles, X } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";
import { SkillData } from "../schema/game";
import { ABILITY_KIND_IDS, ABILITY_PAGE_LABELS, ABILITY_PAGE_ORDER, RUNTIME_ACTION_IDS } from "../data/defaultAbilities";
import { BUILTIN_STATUSES } from "../engine-core/statuses";

type EmotionalAxisKey = "valence" | "arousal" | "grief" | "reverence" | "attachment";

// Signed deltas the verb pushes onto its target's axes. The hint names which
// pole a positive value moves toward.
const emotionalImpulseFields: { key: EmotionalAxisKey; label: string; hint: string }[] = [
  { key: "valence", label: "Valence", hint: "+ joy / − anguish" },
  { key: "arousal", label: "Arousal", hint: "+ frantic / − numb" },
  { key: "grief", label: "Grief", hint: "+ crushed / − unburdened" },
  { key: "reverence", label: "Reverence", hint: "+ reverent / − defiant" },
  { key: "attachment", label: "Attachment", hint: "+ bound / − severed" },
];

export function SkillEditor() {
  const { gamePackage, addSkill, updateSkill, selectedSkillId, setSelectedSkillId } = useEngineStore();
  const [showAIModal, setShowAIModal] = useState(false);

  const activeSkill = gamePackage.abilities?.find((i) => i.id === selectedSkillId) || null;

  const handleCreate = () => {
    const id = `skl_${Date.now()}`;
    const newSkill: SkillData = {
      id,
      display_name: "New Skill",
      description: "",
      ap_cost: 1000,
      mp_cost: 0,
      ability_kind: "skill",
      ability_page: "combat",
      sort_order: 100,
      starts_unlocked: true,
      element: "none",
      targeting: "single",
      range: 1,
      payloads: []
    };
    addSkill(newSkill);
    setSelectedSkillId(id);
  };

  const handleUpdate = (updates: Partial<SkillData>) => {
    if (!activeSkill) return;
    updateSkill(activeSkill.id, updates);
  };

  const setEmotionalImpulse = (key: EmotionalAxisKey, value: number | undefined) => {
    if (!activeSkill) return;
    const next = { ...(activeSkill.emotional_impulse || {}) };
    if (value === undefined || Number.isNaN(value) || value === 0) delete next[key];
    else next[key] = Math.max(-100, Math.min(100, value));
    handleUpdate({ emotional_impulse: Object.keys(next).length ? next : undefined });
  };

  const handleDelete = () => {
     if (!activeSkill) return;
     // simple skip delete for now
  };

  return (
    <div className="flex h-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden m-4">
      {/* Sidebar ListView */}
      <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
          <h2 className="text-sm font-semibold text-neutral-200">Skills</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAIModal(true)}
              className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-md transition-colors"
              title="Generate Skill"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={handleCreate}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto w-full">
          {(gamePackage.abilities || []).map((i) => (
            <button
              key={i.id}
              onClick={() => setSelectedSkillId(i.id)}
              className={`w-full text-left px-4 py-3 border-b flex items-center justify-between transition-colors ${
                selectedSkillId === i.id
                  ? "bg-neutral-800 border-neutral-700 border-l-2 border-l-indigo-500"
                  : "border-neutral-800/50 hover:bg-neutral-800/50 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-neutral-200 truncate">{i.display_name}</span>
                <span className="text-xs text-neutral-500 truncate">
                  {ABILITY_PAGE_LABELS[i.ability_page || "combat"] || i.ability_page} / {i.ability_kind || "skill"}
                </span>
              </div>
            </button>
          ))}
          {(gamePackage.abilities || []).length === 0 && (
            <div className="p-4 text-center text-neutral-500 text-sm">
              No skills yet. Create one!
            </div>
          )}
        </div>
      </div>

      {/* Editor Main */}
      <div className="flex-1 flex flex-col bg-neutral-900 overflow-y-auto">
        {activeSkill ? (
          <div className="max-w-2xl w-full p-6 space-y-6">
            <div className="flex justify-between items-start">
               <div>
                  <h2 className="text-lg font-bold text-white mb-1">Edit Skill</h2>
                  <p className="text-xs text-neutral-500 font-mono">{activeSkill.id}</p>
               </div>
               <button
                 onClick={handleDelete}
                 className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
               >
                 <Trash2 className="w-4 h-4" />
               </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Display Name</label>
                 <input
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.display_name}
                   onChange={(e) => handleUpdate({ display_name: e.target.value })}
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Element</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.element}
                   onChange={(e) => handleUpdate({ element: e.target.value as any })}
                 >
                   <option value="none">None</option>
                   <option value="fire">Fire</option>
                   <option value="shock">Shock</option>
                   <option value="water">Water</option>
                   <option value="cold">Cold</option>
                   <option value="poison">Poison</option>
                   <option value="physical">Physical</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Ability Kind</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.ability_kind || "skill"}
                   onChange={(e) => handleUpdate({ ability_kind: e.target.value as any })}
                 >
                   {ABILITY_KIND_IDS.map((kind) => (
                     <option key={kind} value={kind}>{kind.replace("_", " ")}</option>
                   ))}
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Ability Page</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.ability_page || "combat"}
                   onChange={(e) => handleUpdate({ ability_page: e.target.value as any })}
                 >
                   {ABILITY_PAGE_ORDER.map((page) => (
                     <option key={page} value={page}>{ABILITY_PAGE_LABELS[page]}</option>
                   ))}
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Runtime Action</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.runtime_action || ""}
                   onChange={(e) => handleUpdate({ runtime_action: e.target.value ? e.target.value as any : undefined })}
                 >
                   <option value="">Authored skill cast</option>
                   {RUNTIME_ACTION_IDS.map((action) => (
                     <option key={action} value={action}>{action.replace("_", " ")}</option>
                   ))}
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Icon</label>
                 <input
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.icon || ""}
                   onChange={(e) => handleUpdate({ icon: e.target.value || undefined })}
                 />
               </div>
               <div className="space-y-1 col-span-2">
                 <label className="text-xs font-medium text-neutral-400">Description</label>
                 <textarea
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white h-24 resize-none focus:outline-none focus:border-neutral-600"
                   value={activeSkill.description || ""}
                   onChange={(e) => handleUpdate({ description: e.target.value })}
                 />
               </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">AP Cost</label>
                 <input
                   type="number"
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.ap_cost}
                   onChange={(e) => handleUpdate({ ap_cost: parseInt(e.target.value) || 0 })}
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">MP Cost</label>
                 <input
                   type="number"
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.mp_cost}
                   onChange={(e) => handleUpdate({ mp_cost: parseInt(e.target.value) || 0 })}
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Sort Order</label>
                 <input
                   type="number"
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.sort_order ?? 100}
                   onChange={(e) => handleUpdate({ sort_order: parseInt(e.target.value) || 0 })}
                 />
               </div>
               <label className="col-span-3 flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-300">
                 <input
                   type="checkbox"
                   checked={Boolean(activeSkill.starts_unlocked)}
                   onChange={(e) => handleUpdate({ starts_unlocked: e.target.checked })}
                 />
                 Starts unlocked
               </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Targeting</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.targeting}
                   onChange={(e) => handleUpdate({ targeting: e.target.value as any })}
                 >
                   <option value="single">Single Target</option>
                   <option value="line">Line / Beam</option>
                   <option value="cone">Cone</option>
                   <option value="cross">Cross</option>
                   <option value="block">3x3 Block</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Range</label>
                 <input
                   type="number"
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeSkill.range}
                   onChange={(e) => handleUpdate({ range: parseInt(e.target.value) || 1 })}
                 />
               </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                 <h3 className="text-sm font-semibold text-neutral-300">Payloads</h3>
                 <button 
                   onClick={() => handleUpdate({ payloads: [...activeSkill.payloads, { type: "damage", value: 1 }] })}
                   className="text-xs text-indigo-400 hover:text-indigo-300"
                 >
                   + Add Payload
                 </button>
              </div>
              
              <div className="space-y-2">
                 {activeSkill.payloads.map((payload, idx) => (
                    <div key={idx} className="bg-neutral-950/50 border border-neutral-800 p-2 rounded-md space-y-2">
                       <div className="flex gap-2 items-center">
                         <select
                           className="bg-black border border-neutral-800 rounded p-1 text-sm text-white w-32"
                           value={payload.type}
                           onChange={(e) => {
                              const newPayloads = [...activeSkill.payloads];
                              const type = e.target.value as "damage" | "heal" | "status";
                              newPayloads[idx] = {
                                ...newPayloads[idx],
                                type,
                                status_effect:
                                  type === "status"
                                    ? newPayloads[idx].status_effect || Object.keys(BUILTIN_STATUSES)[0]
                                    : undefined,
                                entity_id: undefined,
                              };
                              handleUpdate({ payloads: newPayloads });
                           }}
                         >
                           <option value="damage">Damage</option>
                           <option value="heal">Heal</option>
                           <option value="status">Status</option>
                           <option value="summon" disabled={payload.type !== "summon"}>Summon (import-only, unsupported)</option>
                         </select>
                         <input
                           type="number"
                           className="flex-1 bg-black border border-neutral-800 rounded p-1 text-sm text-white"
                           placeholder="Value"
                           value={payload.value || ""}
                           onChange={(e) => {
                              const newPayloads = [...activeSkill.payloads];
                              newPayloads[idx] = { ...newPayloads[idx], value: parseInt(e.target.value) || undefined };
                              handleUpdate({ payloads: newPayloads });
                           }}
                         />
                         <button
                           className="p-1 text-rose-500 hover:text-rose-400"
                           onClick={() => {
                              const newPayloads = [...activeSkill.payloads];
                              newPayloads.splice(idx, 1);
                              handleUpdate({ payloads: newPayloads });
                           }}
                         >
                           <X className="w-4 h-4" />
                         </button>
                       </div>
                       {(payload.type === "status" || payload.type === "summon" || payload.target_tags?.length) && (
                         <div className={`rounded p-2 text-xs space-y-2 ${payload.type === "status" ? "border border-emerald-700/40 bg-emerald-950/20 text-emerald-100" : "border border-amber-700/40 bg-amber-950/20 text-amber-200"}`}>
                           {payload.type === "status" && (
                             <>
                               <div>Status payloads are supported by combat. Value is the status magnitude.</div>
                               <select
                                 value={payload.status_effect || Object.keys(BUILTIN_STATUSES)[0]}
                                 onChange={(event) => {
                                   const newPayloads = [...activeSkill.payloads];
                                   newPayloads[idx] = { ...newPayloads[idx], status_effect: event.target.value };
                                   handleUpdate({ payloads: newPayloads });
                                 }}
                                 className="w-full bg-black/40 border border-emerald-800/40 rounded px-2 py-1 text-emerald-100"
                               >
                                 {Object.values(BUILTIN_STATUSES).map((status) => (
                                   <option key={status.id} value={status.id}>{status.displayName}</option>
                                 ))}
                               </select>
                             </>
                           )}
                           {payload.type === "summon" && (
                             <>
                               <div className="flex items-center gap-2">
                                 <AlertTriangle className="w-3.5 h-3.5" />
                                 Summon is preserved for imported content but has no runtime implementation.
                               </div>
                               <input
                                 disabled
                                 value={payload.entity_id || ""}
                                 placeholder="entity_id"
                                 className="w-full bg-black/40 border border-amber-800/40 rounded px-2 py-1 text-amber-100 disabled:opacity-70"
                               />
                             </>
                           )}
                           {payload.target_tags?.length ? (
                             <div className="space-y-1">
                               <div className="flex items-center gap-2 text-amber-200">
                                 <AlertTriangle className="w-3.5 h-3.5" />
                                 Target tags are import-only and are not applied by target resolution.
                               </div>
                               <input
                                 disabled
                                 value={payload.target_tags.join(", ")}
                                 className="w-full bg-black/40 border border-amber-800/40 rounded px-2 py-1 text-amber-100 disabled:opacity-70"
                               />
                             </div>
                           ) : null}
                         </div>
                       )}
                    </div>
                 ))}
                 {activeSkill.payloads.length === 0 && (
                    <div className="text-xs text-neutral-500 italic">No payloads defined. Skill will have no effect.</div>
                 )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                 <h3 className="text-sm font-semibold text-neutral-300">Emotional Impulse</h3>
                 {activeSkill.emotional_impulse && (
                   <button
                     onClick={() => handleUpdate({ emotional_impulse: undefined })}
                     className="text-xs text-neutral-400 hover:text-white"
                   >
                     Clear
                   </button>
                 )}
              </div>
              <p className="text-xs text-neutral-500 -mt-2">
                Signed deltas this verb pushes onto the target's Alderamontico axes when it resolves
                (e.g. a Yell pushes Arousal up + Valence down; a Console pushes Grief down). Behavior
                falls out of the new axis values. Leave blank for a purely physical skill.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {emotionalImpulseFields.map((field) => {
                  const raw = activeSkill.emotional_impulse?.[field.key];
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-medium text-neutral-400">
                        {field.label} <span className="text-neutral-600">{field.hint}</span>
                      </label>
                      <input
                        type="number"
                        min={-100}
                        max={100}
                        placeholder="0"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                        value={typeof raw === "number" ? raw : ""}
                        onChange={(e) =>
                          setEmotionalImpulse(
                            field.key,
                            e.target.value === "" ? undefined : parseInt(e.target.value, 10),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8">
            <Sparkles className="w-12 h-12 mb-4 opacity-20" />
            <p>Select an ability from the sidebar to edit it.</p>
          </div>
        )}
      </div>

      {showAIModal && (
        <AIGenerationModal
          title="Generate Skill"
          placeholder="e.g. A massive fireball, a healing aura..."
          schema={{
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                 id: { type: "STRING" },
                 display_name: { type: "STRING" },
                 description: { type: "STRING" },
                 element: { type: "STRING", enum: ["none", "fire", "shock", "water", "cold", "poison", "physical"] },
                 targeting: { type: "STRING", enum: ["single", "line", "cone", "cross", "block"] },
                 range: { type: "NUMBER" },
                 ap_cost: { type: "NUMBER" },
                 mp_cost: { type: "NUMBER" },
                 payloads: {
                    type: "ARRAY",
                    items: {
                       type: "OBJECT",
                       properties: {
                          type: { type: "STRING", enum: ["damage", "heal", "status", "summon"] },
                          value: { type: "NUMBER" }
                       }
                    }
                 },
                 emotional_impulse: {
                    type: "OBJECT",
                    properties: {
                       valence: { type: "NUMBER" },
                       arousal: { type: "NUMBER" },
                       grief: { type: "NUMBER" },
                       reverence: { type: "NUMBER" },
                       attachment: { type: "NUMBER" },
                    }
                 }
              },
              required: ["id", "display_name", "description", "targeting", "range", "payloads"]
            }
          }}
          onGenerate={(data) => {
             const items = Array.isArray(data) ? data : [data];
             items.forEach(d => addSkill(d));
             if (items.length > 0) setSelectedSkillId(items[0].id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}
