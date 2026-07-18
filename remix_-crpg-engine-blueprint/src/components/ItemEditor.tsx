import React, { useState } from "react";
import { useEngineStore } from "../store/engineStore";
import { Plus, Trash2, Sparkles, Briefcase } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";
import { ItemData, ItemSchema, type LightSourceProfile } from "../schema/game";

const DEFAULT_ITEM_LIGHT_SOURCE: LightSourceProfile = {
  intensity: 0.8,
  radius: 10,
  color: "#facc15",
  active_by_default: true,
  extinguishable: true,
  mobility: "portable",
  persistent: true,
  stimulus_tags: ["light"],
  exposes_carrier: true,
};

export function ItemEditor() {
  const { gamePackage, addItem, updateItem, selectedItemId, setSelectedItemId } = useEngineStore();
  const [showAIModal, setShowAIModal] = useState(false);

  const activeItem = gamePackage.items.find((i) => i.id === selectedItemId) || null;

  const handleCreate = () => {
    const id = `item_${Date.now()}`;
    const newItem: ItemData = {
      id,
      display_name: "New Item",
      description: "",
      icon: "📦",
      category: "consumable",
      effects: {}
    };
    addItem(newItem);
    setSelectedItemId(id);
  };

  const handleUpdate = (updates: Partial<ItemData>) => {
    if (!activeItem) return;
    updateItem(activeItem.id, updates);
  };

  const patchLightSource = (updates: Partial<LightSourceProfile>) => {
    if (!activeItem?.light_source) return;
    handleUpdate({ light_source: { ...activeItem.light_source, ...updates } });
  };

  const handleDelete = () => {
     if (!activeItem) return;
     // To keep simple, we won't fully delete from array since no deleteItem yet.
     // In a real engine, we'd have deleteItem.
  };

  return (
    <div className="flex h-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden m-4">
      {/* Sidebar ListView */}
      <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
          <h2 className="text-sm font-semibold text-neutral-200">Items</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAIModal(true)}
              className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-md transition-colors"
              title="Generate Item"
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
          {gamePackage.items.map((i) => (
            <button
              key={i.id}
              onClick={() => setSelectedItemId(i.id)}
              className={`w-full text-left px-4 py-3 border-b flex items-center justify-between transition-colors ${
                selectedItemId === i.id
                  ? "bg-neutral-800 border-neutral-700 border-l-2 border-l-indigo-500"
                  : "border-neutral-800/50 hover:bg-neutral-800/50 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-neutral-200 truncate">{i.display_name}</span>
                <span className="text-xs text-neutral-500 truncate">{i.category}</span>
              </div>
            </button>
          ))}
          {gamePackage.items.length === 0 && (
            <div className="p-4 text-center text-neutral-500 text-sm">
              No items yet. Create one!
            </div>
          )}
        </div>
      </div>

      {/* Editor Main */}
      <div className="flex-1 flex flex-col bg-neutral-900 overflow-y-auto">
        {activeItem ? (
          <div className="max-w-2xl w-full p-6 space-y-6">
            <div className="flex justify-between items-start">
               <div>
                  <h2 className="text-lg font-bold text-white mb-1">Edit Item</h2>
                  <p className="text-xs text-neutral-500 font-mono">{activeItem.id}</p>
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
                   value={activeItem.display_name}
                   onChange={(e) => handleUpdate({ display_name: e.target.value })}
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Icon / Emoji</label>
                 <input
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeItem.icon || ""}
                   onChange={(e) => handleUpdate({ icon: e.target.value })}
                   placeholder="📦"
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Sprite</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeItem.sprite_id || ""}
                   onChange={(e) => handleUpdate({ sprite_id: e.target.value })}
                 >
                   <option value="">None (Use Icon)</option>
                   {gamePackage.sprite_library.map((s) => (
                     <option key={s.id} value={s.id}>
                       {s.id}
                     </option>
                   ))}
                 </select>
               </div>
               <div className="space-y-1 col-span-2">
                 <label className="text-xs font-medium text-neutral-400">Description</label>
                 <textarea
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white h-24 resize-none focus:outline-none focus:border-neutral-600"
                   value={activeItem.description || ""}
                   onChange={(e) => handleUpdate({ description: e.target.value })}
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-xs font-medium text-neutral-400">Category</label>
                 <select
                   className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600"
                   value={activeItem.category}
                   onChange={(e) => handleUpdate({ category: e.target.value as any })}
                 >
                   <option value="consumable">Consumable</option>
                   <option value="weapon">Weapon</option>
                   <option value="armor">Armor</option>
                   <option value="key">Key</option>
                 </select>
               </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-300 border-b border-neutral-800 pb-2">Effects</h3>
              <div className="grid grid-cols-2 gap-4 bg-neutral-950/50 border border-neutral-800 p-4 rounded-md">
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Heal</label>
                    <input
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.heal || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, heal: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">MP Restore</label>
                    <input
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.mp_restore || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, mp_restore: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Energy Restore</label>
                    <input 
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.energy_restore || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, energy_restore: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Max HP Bonus</label>
                    <input 
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.max_hp_bonus || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, max_hp_bonus: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Damage (unsupported)</label>
                    <input 
                      type="number"
                      disabled
                      className="w-full bg-black border border-amber-800/60 rounded p-1 text-amber-200 disabled:opacity-60"
                      value={activeItem.effects?.damage || ""}
                    />
                    <p className="text-[11px] text-amber-400/80">Import-only scaffold: the item-use runtime does not apply damage.</p>
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Attack Bonus</label>
                    <input 
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.attack_bonus || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, attack_bonus: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Defense Bonus</label>
                    <input 
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.defense_bonus || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, defense_bonus: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
                 <div className="space-y-1 text-sm">
                    <label className="text-neutral-400">Speed Bonus</label>
                    <input 
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded p-1"
                      value={activeItem.effects?.speed_bonus || ""}
                      onChange={(e) => handleUpdate({ effects: { ...activeItem.effects, speed_bonus: parseInt(e.target.value) || undefined } })}
                    />
                 </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-neutral-800 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300">Light Source</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Makes this item an authored mechanical light source for illumination and perception.
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={Boolean(activeItem.light_source)}
                    onChange={(event) =>
                      handleUpdate({
                        light_source: event.target.checked
                          ? { ...DEFAULT_ITEM_LIGHT_SOURCE, stimulus_tags: [...DEFAULT_ITEM_LIGHT_SOURCE.stimulus_tags] }
                          : undefined,
                      })
                    }
                  />
                  Enabled
                </label>
              </div>

              {activeItem.light_source && (
                <div className="space-y-4 rounded-md border border-neutral-800 bg-neutral-950/50 p-4">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="space-y-1 text-sm">
                      <label className="text-neutral-400">Intensity</label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        className="w-full rounded border border-neutral-800 bg-black p-1.5"
                        value={activeItem.light_source.intensity}
                        onChange={(event) =>
                          patchLightSource({
                            intensity: Math.max(0, Math.min(1, Number(event.target.value) || 0)),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1 text-sm">
                      <label className="text-neutral-400">Radius</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="w-full rounded border border-neutral-800 bg-black p-1.5"
                        value={activeItem.light_source.radius}
                        onChange={(event) =>
                          patchLightSource({ radius: Math.max(0, Number(event.target.value) || 0) })
                        }
                      />
                    </div>
                    <div className="space-y-1 text-sm">
                      <label className="text-neutral-400">Duration ticks</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded border border-neutral-800 bg-black p-1.5"
                        value={activeItem.light_source.duration_ticks ?? ""}
                        placeholder="No expiry"
                        onChange={(event) =>
                          patchLightSource({
                            duration_ticks:
                              event.target.value === ""
                                ? undefined
                                : Math.max(1, parseInt(event.target.value, 10) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1 text-sm">
                      <label className="text-neutral-400">Mobility</label>
                      <select
                        className="w-full rounded border border-neutral-800 bg-black p-1.5"
                        value={activeItem.light_source.mobility}
                        onChange={(event) =>
                          patchLightSource({ mobility: event.target.value as LightSourceProfile["mobility"] })
                        }
                      >
                        <option value="fixed">Fixed</option>
                        <option value="portable">Portable</option>
                        <option value="throwable">Throwable</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                      <label className="text-neutral-400">Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          className="h-9 w-12 rounded border border-neutral-800 bg-black p-1"
                          value={activeItem.light_source.color}
                          onChange={(event) => patchLightSource({ color: event.target.value })}
                        />
                        <input
                          className="min-w-0 flex-1 rounded border border-neutral-800 bg-black p-1.5 font-mono"
                          value={activeItem.light_source.color}
                          onChange={(event) => patchLightSource({ color: event.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <label className="text-neutral-400">Stimulus tags</label>
                      <input
                        className="w-full rounded border border-neutral-800 bg-black p-1.5"
                        value={activeItem.light_source.stimulus_tags.join(", ")}
                        placeholder="light, glass"
                        onChange={(event) =>
                          patchLightSource({
                            stimulus_tags: event.target.value
                              .split(",")
                              .map((tag) => tag.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300 md:grid-cols-4">
                    {([
                      ["active_by_default", "Starts active"],
                      ["extinguishable", "Extinguishable"],
                      ["persistent", "Persists in saves"],
                      ["exposes_carrier", "Exposes carrier"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded border border-neutral-800 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={activeItem.light_source?.[key] || false}
                          onChange={(event) => patchLightSource({ [key]: event.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-neutral-800 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-indigo-100">Topics learned on acquisition</h3>
                <p className="mt-1 text-xs text-neutral-500">Receiving or recovering this item can add stable subjects to conversation memory.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {gamePackage.keywords?.map((topic) => {
                  const selected = (activeItem.discover_topic_ids || []).includes(topic.id);
                  return (
                    <label key={topic.id} className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => handleUpdate({
                          discover_topic_ids: event.target.checked
                            ? Array.from(new Set([...(activeItem.discover_topic_ids || []), topic.id]))
                            : (activeItem.discover_topic_ids || []).filter((id) => id !== topic.id),
                        })}
                      />
                      {topic.display_label}
                    </label>
                  );
                })}
                {gamePackage.dynamic_topics?.map((topic) => {
                  const selected = (activeItem.discover_dynamic_topic_ids || []).includes(topic.id);
                  return (
                    <label key={topic.id} className="flex items-center gap-1.5 rounded border border-violet-500/20 bg-violet-950/10 px-2 py-1 text-[11px] text-violet-100">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => handleUpdate({
                          discover_dynamic_topic_ids: event.target.checked
                            ? Array.from(new Set([...(activeItem.discover_dynamic_topic_ids || []), topic.id]))
                            : (activeItem.discover_dynamic_topic_ids || []).filter((id) => id !== topic.id),
                        })}
                      />
                      {topic.display_name}
                    </label>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8">
            <Briefcase className="w-12 h-12 mb-4 opacity-20" />
            <p>Select an item from the sidebar to edit it.</p>
          </div>
        )}
      </div>

      {showAIModal && (
        <AIGenerationModal
          title="Generate Item"
          placeholder="e.g. A rusty old sword, a glowing healing potion..."
          schema={{
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                 id: { type: "STRING" },
                 display_name: { type: "STRING" },
                 description: { type: "STRING" },
                 icon: { type: "STRING", description: "Use a simple emoji representing the item" },
                 category: { type: "STRING", enum: ["consumable", "weapon", "armor", "key"] },
                 effects: {
                    type: "OBJECT",
                    properties: {
                      heal: { type: "NUMBER" },
                      mp_restore: { type: "NUMBER" },
                      energy_restore: { type: "NUMBER" },
                      max_hp_bonus: { type: "NUMBER" },
                      attack_bonus: { type: "NUMBER" },
                      defense_bonus: { type: "NUMBER" },
                      speed_bonus: { type: "NUMBER" }
                    }
                 },
                 light_source: {
                    type: "OBJECT",
                    properties: {
                      intensity: { type: "NUMBER" },
                      radius: { type: "NUMBER" },
                      duration_ticks: { type: "NUMBER" },
                      color: { type: "STRING" },
                      active_by_default: { type: "BOOLEAN" },
                      extinguishable: { type: "BOOLEAN" },
                      mobility: { type: "STRING", enum: ["fixed", "portable", "throwable"] },
                      persistent: { type: "BOOLEAN" },
                      stimulus_tags: { type: "ARRAY", items: { type: "STRING" } },
                      exposes_carrier: { type: "BOOLEAN" }
                    }
                 }
              },
              required: ["id", "display_name", "description", "category", "icon"]
            }
          }}
          onGenerate={(data) => {
             const candidates = Array.isArray(data) ? data : [data];
             const items = candidates.map((candidate, index) => {
               const parsed = ItemSchema.safeParse(candidate);
               if (!parsed.success) {
                 throw new Error(`Generated item ${index + 1} is invalid: ${parsed.error.issues[0]?.message || "schema error"}`);
               }
               if (parsed.data.effects?.damage !== undefined) {
                 throw new Error(`Generated item ${index + 1} uses unsupported item damage and was not added.`);
               }
               return parsed.data;
             });
             items.forEach((item) => addItem(item));
             if (items.length > 0) setSelectedItemId(items[0].id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}
