import React, { useState } from "react";
import { useEngineStore } from "../store/engineStore";
import { DialogueData, DialogueNodeData } from "../schema/game";
import { Plus, MessageSquare, Trash2, ArrowRight, ChevronLeft, Sparkles } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";
import { ConditionEditor } from "./ConditionEditor";
import { SwitchPicker } from "./SwitchPicker";

export function DialogueEditor() {
  const { gamePackage, selectedDialogueId, setSelectedDialogueId, addDialogue, updateDialogue } = useEngineStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);

  const activeDialogue = gamePackage.dialogue.find(d => d.id === selectedDialogueId) || null;
  const activeNode = activeDialogue?.nodes.find(n => n.id === selectedNodeId) || null;

  const handleCreateDialogue = () => {
    const id = `dg_${Date.now()}`;
    const newDialogue: DialogueData = {
      id,
      display_name: "New Dialogue",
      nodes: [{
        id: "start",
        speaker: "NPC",
        text: "Hello there!",
        options: []
      }]
    };
    addDialogue(newDialogue);
    setSelectedDialogueId(id);
    setSelectedNodeId("start");
  };

  const handleAddNode = () => {
    if (!activeDialogue) return;
    const id = `node_${Date.now()}`;
    updateDialogue(activeDialogue.id, {
      nodes: [...activeDialogue.nodes, {
        id,
        speaker: "NPC",
        text: "...",
        options: []
      }]
    });
    setSelectedNodeId(id);
  };

  // Deep-copies the active dialogue — the fastest way to reuse a working
  // pattern (e.g. an Attend tree) on a new target.
  const handleDuplicateDialogue = () => {
    if (!activeDialogue) return;
    const id = `${activeDialogue.id}_copy`;
    addDialogue({
      ...JSON.parse(JSON.stringify(activeDialogue)),
      id,
      display_name: `${activeDialogue.display_name || activeDialogue.id} (copy)`,
    });
    setSelectedDialogueId(id);
    setSelectedNodeId(null);
  };

  const handleAddOption = () => {
    if (!activeDialogue || !activeNode) return;
    const updatedNodes = activeDialogue.nodes.map(n => {
      if (n.id === activeNode.id) {
        return {
          ...n,
          options: [...n.options, { text: "Reply", next_node_id: "" }]
        };
      }
      return n;
    });
    updateDialogue(activeDialogue.id, { nodes: updatedNodes });
  };

  const updateActiveNode = (updates: Partial<DialogueNodeData>) => {
    if (!activeDialogue || !activeNode) return;
    const updatedNodes = activeDialogue.nodes.map(n => {
      if (n.id === activeNode.id) return { ...n, ...updates };
      return n;
    });
    updateDialogue(activeDialogue.id, { nodes: updatedNodes });
  };

  const updateOption = (index: number, updates: any) => {
    if (!activeDialogue || !activeNode) return;
    const newOptions = [...activeNode.options];
    newOptions[index] = { ...newOptions[index], ...updates };
    
    // Clear empties
    if (newOptions[index].trigger_quest === "") newOptions[index].trigger_quest = undefined;
    if (newOptions[index].required_quest === "") newOptions[index].required_quest = undefined;
    if (newOptions[index].next_node_id === "") newOptions[index].next_node_id = undefined;
    if (newOptions[index].required_switch === "") newOptions[index].required_switch = undefined;
    if (newOptions[index].set_switch === "") newOptions[index].set_switch = undefined;
    if (newOptions[index].trigger_cutscene === "") newOptions[index].trigger_cutscene = undefined;
    
    updateActiveNode({ options: newOptions });
  };

  const removeOption = (index: number) => {
    if (!activeDialogue || !activeNode) return;
    const newOptions = activeNode.options.filter((_, i) => i !== index);
    updateActiveNode({ options: newOptions });
  };

  return (
    <div className="flex h-full w-full relative">
      {/* Dialogue List Panel */}
      <div className={`${activeDialogue ? "hidden lg:flex" : "flex"} w-full lg:w-64 bg-neutral-900 border-r border-neutral-800 flex-col h-full z-10 shrink-0`}>
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Dialogues</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowAIModal(true)}
              title="Generate Dialogue"
              className="p-1.5 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button 
              onClick={handleCreateDialogue}
              title="Create Dialogue"
              className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {gamePackage.dialogue.map(d => (
            <button
              key={d.id}
              onClick={() => {
                setSelectedDialogueId(d.id);
                setSelectedNodeId(d.nodes[0]?.id || null);
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${selectedDialogueId === d.id ? "bg-neutral-800 text-white font-medium" : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"}`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate">{d.display_name}</span>
            </button>
          ))}
          {gamePackage.dialogue.length === 0 && (
            <p className="text-xs text-neutral-500 p-4 text-center">No dialogues created yet.</p>
          )}
        </div>
      </div>

      {/* Editor Panel */}
      {activeDialogue ? (
        <div className="flex-1 flex w-full overflow-hidden">
          {/* Nodes List */}
          <div className={`${activeNode ? "hidden lg:flex" : "flex"} w-full lg:w-64 bg-neutral-900/50 border-r border-neutral-800 flex-col overflow-y-auto`}>
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950 lg:bg-transparent">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedDialogueId(null)}
                  className="lg:hidden p-1 -ml-1 text-neutral-400 hover:text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xs font-medium text-neutral-400">Nodes</h3>
              </div>
              <button 
                onClick={handleAddNode}
                className="p-1 text-neutral-400 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4 lg:w-3 lg:h-3" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              {activeDialogue.nodes.map(node => (
                <button
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedNodeId === node.id ? "bg-neutral-800 text-white" : "text-neutral-500 hover:bg-neutral-800/50 hover:text-neutral-300"}`}
                >
                  <div className="font-medium truncate">{node.id}</div>
                  <div className="text-xs truncate opacity-70">{node.speaker}: {node.text}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Node Editor */}
          <div className={`${!activeNode ? "hidden lg:block lg:flex-1" : "flex-1 block"} w-full overflow-y-auto p-4 lg:p-8 bg-neutral-950`}>
            {activeNode && (
               <div className="lg:hidden mb-4 flex items-center gap-2">
                 <button 
                   onClick={() => setSelectedNodeId(null)}
                   className="p-1.5 -ml-1.5 text-neutral-400 hover:text-white bg-neutral-900 rounded-md"
                 >
                   <ChevronLeft className="w-5 h-5" />
                 </button>
                 <span className="text-sm font-medium text-neutral-300">Back to Nodes</span>
               </div>
            )}
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="space-y-4">
                <div className="flex items-end gap-4">
                  <div className="space-y-1.5 flex-1">
                    <label className="text-xs text-neutral-500 font-medium tracking-wide">Dialogue Name</label>
                    <input 
                      type="text" 
                      value={activeDialogue.display_name}
                      onChange={(e) => updateDialogue(activeDialogue.id, { display_name: e.target.value })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleDuplicateDialogue}
                    title="Duplicate this dialogue (fastest way to reuse a working pattern)"
                    className="mb-0.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
                  >
                    Duplicate
                  </button>
                </div>
              </div>

              {activeNode ? (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 lg:p-5 space-y-5 mt-4 lg:mt-8">
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="space-y-1.5 flex-1">
                      <label className="text-xs text-neutral-500 font-medium tracking-wide">Node ID</label>
                      <input 
                        type="text" 
                        value={activeNode.id}
                        disabled
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-500 opacity-50 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <label className="text-xs text-neutral-500 font-medium tracking-wide">Speaker</label>
                      <input 
                        type="text" 
                        value={activeNode.speaker}
                        onChange={(e) => updateActiveNode({ speaker: e.target.value })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-neutral-500 font-medium tracking-wide">Text</label>
                    <textarea
                      value={activeNode.text}
                      onChange={(e) => updateActiveNode({ text: e.target.value })}
                      rows={4}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors resize-none"
                    />
                  </div>

                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="space-y-1.5 flex-1">
                      <label className="text-xs text-neutral-500 font-medium tracking-wide">Scene image URL <span className="text-neutral-600">(optional — full-bleed art above the text, e.g. quest cards)</span></label>
                      <input
                        type="text"
                        value={activeNode.scene_image_url || ""}
                        placeholder="https://… or data:image/…"
                        onChange={(e) => updateActiveNode({ scene_image_url: e.target.value || undefined })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors"
                      />
                    </div>
                    {activeNode.scene_image_url && (
                      <div className="space-y-1.5 lg:w-56">
                        <label className="text-xs text-neutral-500 font-medium tracking-wide">Image alt text</label>
                        <input
                          type="text"
                          value={activeNode.scene_image_alt || ""}
                          onChange={(e) => updateActiveNode({ scene_image_alt: e.target.value || undefined })}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-600 transition-colors"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-neutral-800 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-medium text-neutral-300">Player Options</h4>
                      <button 
                        onClick={handleAddOption}
                        className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Option
                      </button>
                    </div>

                    <div className="space-y-3">
                      {activeNode.options.map((opt, i) => (
                        <div key={i} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 lg:p-4 space-y-3 relative group">
                          <button 
                            onClick={() => removeOption(i)}
                            className="absolute top-2 right-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 hover:text-red-400 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          
                          <div className="flex items-center gap-3 pr-8">
                            <span className="text-xs text-neutral-600 font-mono">{i + 1}.</span>
                            <input 
                              type="text" 
                              value={opt.text}
                              onChange={(e) => updateOption(i, { text: e.target.value })}
                              placeholder="Player reply..."
                              className="flex-1 bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                            />
                          </div>

                          <div className="flex flex-col gap-2 pl-6 mt-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <ArrowRight className="w-3 h-3 text-neutral-600 shrink-0" />
                              <select
                                value={opt.next_node_id || ""}
                                onChange={(e) => updateOption(i, { next_node_id: e.target.value })}
                                className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px]"
                              >
                                <option value="">(End Conversation)</option>
                                {activeDialogue.nodes.map(n => (
                                  <option key={n.id} value={n.id}>Goto: {n.id}</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-neutral-500 font-medium w-16 shrink-0">Require:</span>
                              <select
                                value={opt.required_quest || ""}
                                onChange={(e) => updateOption(i, { required_quest: e.target.value })}
                                className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px]"
                              >
                                <option value="">None</option>
                                {gamePackage.quests.map(q => (
                                  <option key={q.id} value={q.id}>{q.display_name}</option>
                                ))}
                              </select>
                              {opt.required_quest && (
                                 <select
                                   value={opt.required_quest_state || "active"}
                                   onChange={(e) => updateOption(i, { required_quest_state: e.target.value })}
                                   className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none w-auto"
                                 >
                                   <option value="active">Active</option>
                                   <option value="completed">Completed</option>
                                  </select>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-neutral-500 font-medium w-16 shrink-0">Switch:</span>
                              <SwitchPicker
                                value={opt.required_switch || ""}
                                onChange={(value) => updateOption(i, { required_switch: value })}
                                placeholder="required_flag"
                                className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px] font-mono"
                              />
                              {opt.required_switch && (
                                <select
                                  value={String(opt.required_switch_value ?? true)}
                                  onChange={(e) => updateOption(i, { required_switch_value: e.target.value === "true" })}
                                  className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none w-auto"
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-neutral-500 font-medium w-16 shrink-0">Trigger:</span>
                              <select
                                value={opt.trigger_quest || ""}
                                onChange={(e) => updateOption(i, { trigger_quest: e.target.value })}
                                className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px]"
                              >
                                <option value="">None</option>
                                {gamePackage.quests.map(q => (
                                  <option key={q.id} value={q.id}>{q.display_name}</option>
                                ))}
                              </select>
                              {opt.trigger_quest && (
                                 <select
                                   value={opt.trigger_quest_state || "active"}
                                   onChange={(e) => updateOption(i, { trigger_quest_state: e.target.value })}
                                   className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none w-auto"
                                 >
                                   <option value="active">Active</option>
                                   <option value="completed">Completed</option>
                                  </select>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-neutral-500 font-medium w-16 shrink-0">Set:</span>
                              <SwitchPicker
                                value={opt.set_switch || ""}
                                onChange={(value) => updateOption(i, { set_switch: value })}
                                placeholder="flag_to_set"
                                className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px] font-mono"
                              />
                              {opt.set_switch && (
                                <select
                                  value={String(opt.set_switch_value ?? true)}
                                  onChange={(e) => updateOption(i, { set_switch_value: e.target.value === "true" })}
                                  className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none w-auto"
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              )}
                            </div>

                            {(opt.set_switches?.length ? opt.set_switches : []).map((sw, swIndex) => (
                              <div key={swIndex} className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-neutral-600 font-medium w-16 shrink-0">also set:</span>
                                <SwitchPicker
                                  value={sw.switch_id}
                                  onChange={(value) => {
                                    const set_switches = (opt.set_switches || []).map((entry, ei) =>
                                      ei === swIndex ? { ...entry, switch_id: value } : entry,
                                    );
                                    updateOption(i, { set_switches });
                                  }}
                                  className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px] font-mono"
                                />
                                <select
                                  value={String(sw.switch_value ?? true)}
                                  onChange={(e) => {
                                    const set_switches = (opt.set_switches || []).map((entry, ei) =>
                                      ei === swIndex ? { ...entry, switch_value: e.target.value === "true" } : entry,
                                    );
                                    updateOption(i, { set_switches });
                                  }}
                                  className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none w-auto"
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                                <button
                                  onClick={() => {
                                    const set_switches = (opt.set_switches || []).filter((_, ei) => ei !== swIndex);
                                    updateOption(i, { set_switches: set_switches.length ? set_switches : undefined });
                                  }}
                                  className="p-1 text-neutral-600 hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                updateOption(i, {
                                  set_switches: [...(opt.set_switches || []), { switch_id: "" }],
                                })
                              }
                              className="self-start text-[11px] text-neutral-500 hover:text-neutral-300 pl-16"
                            >
                              + set another switch
                            </button>

                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-xs text-neutral-500 font-medium w-16 shrink-0">Cutscene:</span>
                              <select
                                value={opt.trigger_cutscene || ""}
                                onChange={(e) => updateOption(i, { trigger_cutscene: e.target.value })}
                                className="bg-neutral-900 border border-neutral-800 rounded py-1.5 px-2 text-xs text-neutral-400 outline-none flex-1 min-w-[120px]"
                              >
                                <option value="">None</option>
                                {gamePackage.cutscenes.map(c => (
                                  <option key={c.id} value={c.id}>{c.display_name || c.id}</option>
                                ))}
                              </select>
                            </div>

                            <div className="pl-0 lg:pl-6 mt-2">
                              <ConditionEditor
                                label="Advanced Option Condition"
                                compact
                                value={opt.condition}
                                onChange={(condition) => updateOption(i, { condition })}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {activeNode.options.length === 0 && (
                        <p className="text-xs text-neutral-500 italic">No options; conversation ends here.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden lg:block text-center text-sm text-neutral-500 mt-12 py-12 border border-neutral-800/50 rounded-xl border-dashed">
                  Select a node from the left to edit it.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-neutral-400 bg-neutral-950">
          <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
          <h2 className="text-xl font-medium">No Dialogue Selected</h2>
          <p className="text-sm mt-1 opacity-70">Create or select a dialogue to edit.</p>
          <button 
            onClick={handleCreateDialogue}
            className="mt-6 bg-neutral-100 hover:bg-white text-neutral-900 font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create First Dialogue
          </button>
        </div>
      )}

      {showAIModal && (
        <AIGenerationModal
          title="Generate Dialogue Tree"
          placeholder="e.g. Generate a dialogue for a grumpy spell scroll merchant..."
          schema={{
             type: "ARRAY",
             items: {
                type: "OBJECT",
                properties: {
                   id: { type: "STRING" },
                   display_name: { type: "STRING" },
                   nodes: {
                      type: "ARRAY",
                      items: {
                         type: "OBJECT",
                         properties: {
                            id: { type: "STRING" },
                            speaker: { type: "STRING" },
                            text: { type: "STRING" },
                            options: {
                               type: "ARRAY",
                               items: {
                                  type: "OBJECT",
                                  properties: {
                                     text: { type: "STRING" },
                                     next_node_id: { type: "STRING" }
                                  },
                                  required: ["text"]
                               }
                            }
                         },
                         required: ["id", "speaker", "text", "options"]
                      }
                   }
                },
                required: ["id", "display_name", "nodes"]
             }
          }}
          onGenerate={(data) => {
             // data should be an array of dialogues
             const newDialogues = Array.isArray(data) ? data : [data];
             newDialogues.forEach(d => addDialogue(d));
             if (newDialogues.length > 0) setSelectedDialogueId(newDialogues[0].id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}
