import React, { useState } from "react";
import { useEngineStore } from "../store/engineStore";
import { QuestData, QuestObjectiveData } from "../schema/game";
import { Plus, Target, Trash2, ChevronLeft, Sparkles } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";
import { SwitchPicker } from "./SwitchPicker";

export function QuestEditor() {
  const { gamePackage, selectedQuestId, setSelectedQuestId, addQuest, updateQuest } = useEngineStore();
  const [showAIModal, setShowAIModal] = useState(false);

  const activeQuest = gamePackage.quests.find(q => q.id === selectedQuestId) || null;

  const handleCreateQuest = () => {
    const id = `quest_${Date.now()}`;
    const newQuest: QuestData = {
      id,
      display_name: "New Quest",
      description: "A description of what needs to be done.",
      objectives: []
    };
    addQuest(newQuest);
    setSelectedQuestId(id);
  };

  const handleAddObjective = () => {
    if (!activeQuest) return;
    const newObjectives = [...activeQuest.objectives, {
      id: `obj_${Date.now()}`,
      description: "Do something specific.",
      type: "explore",
      target_id: "",
      count: 1
    } as QuestObjectiveData];
    updateQuest(activeQuest.id, { objectives: newObjectives });
  };

  const updateObjective = (index: number, updates: any) => {
    if (!activeQuest) return;
    const newObjectives = [...activeQuest.objectives];
    newObjectives[index] = { ...newObjectives[index], ...updates };
    updateQuest(activeQuest.id, { objectives: newObjectives });
  };

  const removeObjective = (index: number) => {
    if (!activeQuest) return;
    const newObjectives = activeQuest.objectives.filter((_, i) => i !== index);
    updateQuest(activeQuest.id, { objectives: newObjectives });
  };

  return (
    <div className="flex h-full w-full relative">
      {/* Quest List */}
      <div className={`${activeQuest ? "hidden lg:flex" : "flex"} w-full lg:w-64 bg-neutral-900 border-r border-neutral-800 flex-col h-full z-10 shrink-0`}>
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Quests</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowAIModal(true)}
              title="Generate Quest"
              className="p-1.5 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button 
              onClick={handleCreateQuest}
              className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {gamePackage.quests.map(q => (
            <button
              key={q.id}
              onClick={() => setSelectedQuestId(q.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${selectedQuestId === q.id ? "bg-neutral-800 text-white font-medium" : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"}`}
            >
              <Target className="w-4 h-4 shrink-0" />
              <span className="truncate">{q.display_name}</span>
            </button>
          ))}
          {gamePackage.quests.length === 0 && (
            <p className="text-xs text-neutral-500 p-4 text-center">No quests created yet.</p>
          )}
        </div>
      </div>

      {/* Editor Panel */}
      {activeQuest ? (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-neutral-950 w-full block">
          {activeQuest && (
             <div className="lg:hidden mb-4 flex items-center gap-2">
               <button 
                 onClick={() => setSelectedQuestId(null)}
                 className="p-1.5 -ml-1.5 text-neutral-400 hover:text-white bg-neutral-900 rounded-md"
               >
                 <ChevronLeft className="w-5 h-5" />
               </button>
               <span className="text-sm font-medium text-neutral-300">Back to Quests</span>
             </div>
          )}
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500 font-medium tracking-wide">Quest ID</label>
                <input 
                  type="text" 
                  value={activeQuest.id}
                  disabled
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-500 opacity-50 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500 font-medium tracking-wide">Quest Name</label>
                <input 
                  type="text" 
                  value={activeQuest.display_name}
                  onChange={(e) => updateQuest(activeQuest.id, { display_name: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500 font-medium tracking-wide">Description</label>
                <textarea 
                  value={activeQuest.description}
                  onChange={(e) => updateQuest(activeQuest.id, { description: e.target.value })}
                  rows={4}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-800">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-neutral-200">Objectives</h3>
                <button 
                  onClick={handleAddObjective}
                  className="text-sm bg-neutral-800 text-white hover:bg-neutral-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Objective
                </button>
              </div>

              <div className="space-y-4">
                {activeQuest.objectives.map((obj, i) => (
                  <div key={obj.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4 relative group">
                    <button 
                      onClick={() => removeObjective(i)}
                      className="absolute top-3 right-3 p-1.5 text-neutral-500 hover:text-red-400 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-950 rounded-md z-10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="pr-10 space-y-1.5">
                      <label className="text-xs text-neutral-500 font-medium">Objective Description</label>
                      <input 
                        type="text" 
                        value={obj.description}
                        onChange={(e) => updateObjective(i, { description: e.target.value })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                      />
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-neutral-500 font-medium">Type</label>
                        <select
                          value={obj.type}
                          onChange={(e) => updateObjective(i, { type: e.target.value })}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        >
                          <option value="talk">Talk to NPC</option>
                          <option value="kill">Defeat Entity</option>
                          <option value="collect">Collect Item</option>
                          <option value="explore">Explore Location</option>
                          <option value="interact">Interact Object</option>
                          <option value="custom">Custom Condition</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-neutral-500 font-medium">
                          {obj.type === "collect"
                            ? "Item"
                            : obj.type === "talk" || obj.type === "kill"
                              ? "Entity"
                              : obj.type === "interact"
                                ? "Switch or document (done when it turns on / is read)"
                                : "Target ID"}
                        </label>
                        {obj.type === "collect" ? (
                          <select
                            value={obj.target_id}
                            onChange={(e) => updateObjective(i, { target_id: e.target.value })}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                          >
                            <option value="">Select item…</option>
                            {gamePackage.items.map((item) => (
                              <option key={item.id} value={item.id}>{item.display_name || item.id}</option>
                            ))}
                          </select>
                        ) : obj.type === "talk" || obj.type === "kill" ? (
                          <select
                            value={obj.target_id}
                            onChange={(e) => updateObjective(i, { target_id: e.target.value })}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                          >
                            <option value="">Select entity…</option>
                            {gamePackage.entities.map((entity) => (
                              <option key={entity.id} value={entity.id}>{entity.display_name || entity.id}</option>
                            ))}
                          </select>
                        ) : obj.type === "interact" ? (
                          <SwitchPicker
                            value={obj.target_id}
                            onChange={(value) => updateObjective(i, { target_id: value })}
                            placeholder="switch_or_document_id"
                            className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 font-mono"
                          />
                        ) : (
                          <input
                            type="text"
                            value={obj.target_id}
                            onChange={(e) => updateObjective(i, { target_id: e.target.value })}
                            placeholder="e.g. npc_smith"
                            className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                          />
                        )}
                      </div>

                      {["kill", "collect", "interact"].includes(obj.type) && (
                        <div className="space-y-1.5 md:w-24 flex-none">
                          <label className="text-xs text-neutral-500 font-medium">Count</label>
                          <input 
                            type="number" 
                            min="1"
                            value={obj.count}
                            onChange={(e) => updateObjective(i, { count: parseInt(e.target.value) || 1 })}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {activeQuest.objectives.length === 0 && (
                  <p className="text-sm text-neutral-500 italic p-4 text-center border border-neutral-800/50 rounded-xl border-dashed">No objectives defined.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-neutral-400 bg-neutral-950">
          <Target className="w-12 h-12 mb-4 opacity-20" />
          <h2 className="text-xl font-medium">No Quest Selected</h2>
          <p className="text-sm mt-1 opacity-70">Create or select a quest to define its objectives.</p>
          <button 
            onClick={handleCreateQuest}
            className="mt-6 bg-neutral-100 hover:bg-white text-neutral-900 font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create First Quest
          </button>
        </div>
      )}
      {showAIModal && (
        <AIGenerationModal
          title="Generate Quests"
          placeholder="e.g. Generate a quest line about finding a lost sword..."
          schema={{
            type: "ARRAY",
            items: {
               type: "OBJECT",
               properties: {
                  id: { type: "STRING" },
                  display_name: { type: "STRING" },
                  description: { type: "STRING" },
                  objectives: {
                     type: "ARRAY",
                     items: {
                        type: "OBJECT",
                        properties: {
                           id: { type: "STRING" },
                           description: { type: "STRING" },
                           type: { type: "STRING", description: "Must be one of: talk, kill, collect, explore, interact, custom" },
                           target_id: { type: "STRING" },
                           count: { type: "NUMBER" }
                        },
                        required: ["id", "description", "type", "target_id", "count"]
                     }
                  }
               },
               required: ["id", "display_name", "description", "objectives"]
            }
          }}
          onGenerate={(data) => {
             const newQuests = Array.isArray(data) ? data : [data];
             newQuests.forEach(q => addQuest(q));
             if (newQuests.length > 0) setSelectedQuestId(newQuests[0].id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}
