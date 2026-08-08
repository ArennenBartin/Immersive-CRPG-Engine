import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Copy,
  GitBranch,
  MessageSquare,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type {
  DialogueData,
  DialogueNodeData,
} from "../schema/game";
import { convertKeywordDialogueToChoiceTree } from "../engine-core/keywordDialogue";
import { useEngineStore } from "../store/engineStore";
import { ConditionEditor } from "./ConditionEditor";
import { SwitchPicker } from "./SwitchPicker";

type DialogueOption = DialogueNodeData["options"][number];

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none transition focus:border-red-800";
const compactClass =
  "min-w-0 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 outline-none focus:border-red-800";

const uniqueId = (prefix: string, ids: string[]) => {
  const used = new Set(ids);
  if (!used.has(prefix)) return prefix;
  let index = 2;
  while (used.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
};

const safeNodeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "node";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
      {children}
    </div>
  );
}

export function StandardDialogueEditor() {
  const {
    gamePackage,
    selectedDialogueId,
    setSelectedDialogueId,
    addDialogue,
    updateDialogue,
    setGamePackage,
  } = useEngineStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const activeDialogue = useMemo(
    () =>
      gamePackage.dialogue.find((dialogue) => dialogue.id === selectedDialogueId) ||
      null,
    [gamePackage.dialogue, selectedDialogueId],
  );
  const activeNode = useMemo(
    () =>
      activeDialogue?.nodes.find((node) => node.id === selectedNodeId) || null,
    [activeDialogue, selectedNodeId],
  );

  useEffect(() => {
    if (!activeDialogue) {
      setSelectedNodeId(null);
      return;
    }
    if (!activeDialogue.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(activeDialogue.nodes[0]?.id || null);
    }
  }, [activeDialogue, selectedNodeId]);

  const createDialogue = () => {
    const id = uniqueId(
      "dialogue",
      gamePackage.dialogue.map((dialogue) => dialogue.id),
    );
    const dialogue: DialogueData = {
      id,
      display_name: "New Conversation",
      format: "tree_v1",
      speaker: "NPC",
      nodes: [
        {
          id: "start",
          speaker: "NPC",
          text: "Hello.",
          options: [{ text: "Goodbye." }],
        },
      ],
    };
    addDialogue(dialogue);
    setSelectedDialogueId(id);
    setSelectedNodeId("start");
  };

  const duplicateDialogue = () => {
    if (!activeDialogue) return;
    const id = uniqueId(
      `${activeDialogue.id}_copy`,
      gamePackage.dialogue.map((dialogue) => dialogue.id),
    );
    const clone: DialogueData = {
      ...structuredClone(activeDialogue),
      id,
      display_name: `${activeDialogue.display_name} (copy)`,
      format: "tree_v1",
    };
    addDialogue(clone);
    setSelectedDialogueId(id);
    setSelectedNodeId(clone.nodes[0]?.id || null);
  };

  const deleteDialogue = () => {
    if (!activeDialogue) return;
    setGamePackage({
      ...gamePackage,
      dialogue: gamePackage.dialogue.filter(
        (dialogue) => dialogue.id !== activeDialogue.id,
      ),
    });
    setSelectedDialogueId(null);
    setSelectedNodeId(null);
  };

  const updateNodes = (nodes: DialogueNodeData[]) => {
    if (!activeDialogue) return;
    updateDialogue(activeDialogue.id, { format: "tree_v1", nodes });
  };

  const updateActiveNode = (updates: Partial<DialogueNodeData>) => {
    if (!activeDialogue || !activeNode) return;
    updateNodes(
      activeDialogue.nodes.map((node) =>
        node.id === activeNode.id ? { ...node, ...updates } : node,
      ),
    );
  };

  const addNode = () => {
    if (!activeDialogue) return;
    const id = uniqueId(
      "node",
      activeDialogue.nodes.map((node) => node.id),
    );
    updateNodes([
      ...activeDialogue.nodes,
      { id, speaker: activeDialogue.speaker || "NPC", text: "...", options: [] },
    ]);
    setSelectedNodeId(id);
  };

  const duplicateNode = () => {
    if (!activeDialogue || !activeNode) return;
    const id = uniqueId(
      `${activeNode.id}_copy`,
      activeDialogue.nodes.map((node) => node.id),
    );
    updateNodes([...activeDialogue.nodes, { ...structuredClone(activeNode), id }]);
    setSelectedNodeId(id);
  };

  const deleteNode = () => {
    if (!activeDialogue || !activeNode || activeDialogue.nodes.length <= 1) return;
    const nodes = activeDialogue.nodes
      .filter((node) => node.id !== activeNode.id)
      .map((node) => ({
        ...node,
        options: node.options.map((option) =>
          option.next_node_id === activeNode.id
            ? { ...option, next_node_id: undefined }
            : option,
        ),
      }));
    updateNodes(nodes);
    setSelectedNodeId(nodes[0]?.id || null);
  };

  const renameNode = (nextIdValue: string) => {
    if (!activeDialogue || !activeNode) return;
    const nextId = safeNodeId(nextIdValue);
    if (
      nextId === activeNode.id ||
      activeDialogue.nodes.some((node) => node.id === nextId)
    )
      return;
    updateNodes(
      activeDialogue.nodes.map((node) => ({
        ...node,
        id: node.id === activeNode.id ? nextId : node.id,
        options: node.options.map((option) =>
          option.next_node_id === activeNode.id
            ? { ...option, next_node_id: nextId }
            : option,
        ),
      })),
    );
    setSelectedNodeId(nextId);
  };

  const addOption = () => {
    if (!activeNode) return;
    updateActiveNode({
      options: [...activeNode.options, { text: "Reply" }],
    });
  };

  const updateOption = (index: number, updates: Partial<DialogueOption>) => {
    if (!activeNode) return;
    const options = activeNode.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, ...updates } : option,
    );
    updateActiveNode({ options });
  };

  const removeOption = (index: number) => {
    if (!activeNode) return;
    updateActiveNode({
      options: activeNode.options.filter((_, optionIndex) => optionIndex !== index),
    });
  };

  const convertKeyword = () => {
    if (!activeDialogue) return;
    const converted = convertKeywordDialogueToChoiceTree(
      gamePackage,
      activeDialogue,
    );
    setGamePackage({
      ...gamePackage,
      dialogue: gamePackage.dialogue.map((dialogue) =>
        dialogue.id === activeDialogue.id ? converted : dialogue,
      ),
    });
    setSelectedNodeId(converted.nodes[0]?.id || null);
  };

  return (
    <div className="flex h-full min-h-0 w-full bg-neutral-950">
      <aside
        className={`${activeDialogue ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 lg:w-72`}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
              <GitBranch className="h-4 w-4 text-red-400" /> Dialogue Trees
            </div>
            <div className="mt-1 text-[10px] text-neutral-600">
              NPC lines, player choices, and branches
            </div>
          </div>
          <button
            type="button"
            onClick={createDialogue}
            title="Create conversation tree"
            className="rounded-lg bg-red-950/60 p-2 text-red-300 hover:bg-red-900/70"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {gamePackage.dialogue.map((dialogue) => {
            const isKeywordOnly =
              dialogue.format === "keyword_v1" && !dialogue.nodes.length;
            return (
              <button
                key={dialogue.id}
                type="button"
                onClick={() => {
                  setSelectedDialogueId(dialogue.id);
                  setSelectedNodeId(dialogue.nodes[0]?.id || null);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left transition ${
                  selectedDialogueId === dialogue.id
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {dialogue.display_name}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-neutral-600">
                  <span className="truncate">{dialogue.id}</span>
                  <span className={isKeywordOnly ? "text-amber-500" : ""}>
                    {isKeywordOnly ? "convert" : `${dialogue.nodes.length} nodes`}
                  </span>
                </div>
              </button>
            );
          })}
          {!gamePackage.dialogue.length && (
            <button
              type="button"
              onClick={createDialogue}
              className="w-full rounded-lg border border-dashed border-neutral-700 p-6 text-xs text-neutral-500 hover:border-red-900 hover:text-red-300"
            >
              Create the first conversation tree
            </button>
          )}
        </div>
      </aside>

      {activeDialogue ? (
        activeDialogue.format === "keyword_v1" && !activeDialogue.nodes.length ? (
          <main className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-lg rounded-2xl border border-amber-900/50 bg-amber-950/10 p-6 text-center">
              <RotateCcw className="mx-auto h-7 w-7 text-amber-300" />
              <h2 className="mt-3 text-lg font-semibold text-neutral-100">
                Convert this keyword conversation
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                This is older keyword-only content. Convert it into NPC nodes and
                visible player choices so it can be edited and played as a normal
                dialogue tree. Existing keyword data remains in the package as a
                compatibility backup.
              </p>
              <button
                type="button"
                onClick={convertKeyword}
                className="mt-5 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Convert to dialogue tree
              </button>
              <button
                type="button"
                onClick={() => setSelectedDialogueId(null)}
                className="ml-2 mt-5 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
              >
                Back
              </button>
            </div>
          </main>
        ) : (
          <div className="flex min-w-0 flex-1">
            <aside
              className={`${activeNode ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/55 lg:w-64`}
            >
              <div className="flex items-center justify-between border-b border-neutral-800 p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDialogueId(null)}
                    className="rounded p-1 text-neutral-500 hover:text-white lg:hidden"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <SectionLabel>Nodes</SectionLabel>
                </div>
                <button
                  type="button"
                  onClick={addNode}
                  className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {activeDialogue.nodes.map((node, index) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left ${
                      selectedNodeId === node.id
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="text-neutral-600">{index + 1}</span>
                      <span className="truncate">{node.id}</span>
                    </div>
                    <div className="mt-1 truncate text-[11px] opacity-70">
                      {node.speaker}: {node.text}
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <main className={`${activeNode ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto p-4 lg:p-7`}>
              <div className="mx-auto max-w-4xl space-y-5">
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="rounded-lg border border-neutral-800 p-2 text-neutral-400 lg:hidden"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <label className="min-w-52 flex-1 space-y-1.5">
                    <SectionLabel>Conversation name</SectionLabel>
                    <input
                      value={activeDialogue.display_name}
                      onChange={(event) =>
                        updateDialogue(activeDialogue.id, {
                          display_name: event.target.value,
                          format: "tree_v1",
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={duplicateDialogue}
                    className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-900"
                  >
                    <Copy className="mr-1 inline h-3.5 w-3.5" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={deleteDialogue}
                    className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-red-300 hover:bg-red-950/30"
                  >
                    <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
                  </button>
                </div>

                {activeNode ? (
                  <div className="space-y-5 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 lg:p-6">
                    <div className="flex flex-wrap gap-3">
                      <label className="min-w-44 flex-1 space-y-1.5">
                        <SectionLabel>Node ID</SectionLabel>
                        <input
                          defaultValue={activeNode.id}
                          key={activeNode.id}
                          onBlur={(event) => renameNode(event.target.value)}
                          className={`${inputClass} font-mono`}
                        />
                      </label>
                      <label className="min-w-44 flex-1 space-y-1.5">
                        <SectionLabel>Speaker</SectionLabel>
                        <input
                          value={activeNode.speaker}
                          onChange={(event) =>
                            updateActiveNode({ speaker: event.target.value })
                          }
                          className={inputClass}
                        />
                      </label>
                      <div className="flex items-end gap-1">
                        <button
                          type="button"
                          onClick={duplicateNode}
                          title="Duplicate node"
                          className="rounded-lg border border-neutral-800 p-2.5 text-neutral-400 hover:bg-neutral-900 hover:text-white"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={deleteNode}
                          disabled={activeDialogue.nodes.length <= 1}
                          title="Delete node"
                          className="rounded-lg border border-neutral-800 p-2.5 text-red-400 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:text-neutral-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <label className="block space-y-1.5">
                      <SectionLabel>NPC dialogue</SectionLabel>
                      <textarea
                        value={activeNode.text}
                        onChange={(event) =>
                          updateActiveNode({ text: event.target.value })
                        }
                        rows={4}
                        className={`${inputClass} resize-y font-serif leading-6`}
                      />
                    </label>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5">
                        <SectionLabel>Scene image URL (optional)</SectionLabel>
                        <input
                          value={activeNode.scene_image_url || ""}
                          onChange={(event) =>
                            updateActiveNode({
                              scene_image_url: event.target.value || undefined,
                            })
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <SectionLabel>Image description</SectionLabel>
                        <input
                          value={activeNode.scene_image_alt || ""}
                          onChange={(event) =>
                            updateActiveNode({
                              scene_image_alt: event.target.value || undefined,
                            })
                          }
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="border-t border-neutral-800 pt-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <SectionLabel>Player choices</SectionLabel>
                          <p className="mt-1 text-xs text-neutral-600">
                            Each choice can branch to another node or end the conversation.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addOption}
                          className="rounded-lg bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/70"
                        >
                          <Plus className="mr-1 inline h-3.5 w-3.5" /> Add choice
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {activeNode.options.map((option, index) => (
                          <div
                            key={`${activeNode.id}-option-${index}`}
                            className="rounded-xl border border-neutral-800 bg-neutral-950/75 p-3 lg:p-4"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-neutral-600">
                                {index + 1}.
                              </span>
                              <input
                                value={option.text}
                                onChange={(event) =>
                                  updateOption(index, { text: event.target.value })
                                }
                                placeholder="Player response"
                                className={`${inputClass} flex-1`}
                              />
                              <button
                                type="button"
                                onClick={() => removeOption(index)}
                                className="rounded-lg p-2 text-neutral-600 hover:bg-red-950/30 hover:text-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="mt-3 grid gap-2 border-l border-neutral-800 pl-4 md:grid-cols-2">
                              <label className="flex items-center gap-2 text-xs text-neutral-500">
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                <select
                                  value={option.next_node_id || ""}
                                  onChange={(event) =>
                                    updateOption(index, {
                                      next_node_id: event.target.value || undefined,
                                    })
                                  }
                                  className={`${compactClass} flex-1`}
                                >
                                  <option value="">End conversation</option>
                                  {activeDialogue.nodes.map((node) => (
                                    <option key={node.id} value={node.id}>
                                      Go to: {node.id}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex items-center gap-2 text-xs text-neutral-500">
                                Require quest
                                <select
                                  value={option.required_quest || ""}
                                  onChange={(event) =>
                                    updateOption(index, {
                                      required_quest: event.target.value || undefined,
                                    })
                                  }
                                  className={`${compactClass} flex-1`}
                                >
                                  <option value="">None</option>
                                  {gamePackage.quests.map((quest) => (
                                    <option key={quest.id} value={quest.id}>
                                      {quest.display_name}
                                    </option>
                                  ))}
                                </select>
                                {option.required_quest && (
                                  <select
                                    value={option.required_quest_state || "active"}
                                    onChange={(event) =>
                                      updateOption(index, {
                                        required_quest_state: event.target.value,
                                      })
                                    }
                                    className={compactClass}
                                  >
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                  </select>
                                )}
                              </label>

                              <label className="flex items-center gap-2 text-xs text-neutral-500">
                                Require switch
                                <SwitchPicker
                                  value={option.required_switch || ""}
                                  onChange={(value) =>
                                    updateOption(index, {
                                      required_switch: value || undefined,
                                    })
                                  }
                                  className={`${compactClass} flex-1 font-mono`}
                                />
                                {option.required_switch && (
                                  <select
                                    value={String(option.required_switch_value ?? true)}
                                    onChange={(event) =>
                                      updateOption(index, {
                                        required_switch_value:
                                          event.target.value === "true",
                                      })
                                    }
                                    className={compactClass}
                                  >
                                    <option value="true">On</option>
                                    <option value="false">Off</option>
                                  </select>
                                )}
                              </label>

                              <label className="flex items-center gap-2 text-xs text-neutral-500">
                                Start/update quest
                                <select
                                  value={option.trigger_quest || ""}
                                  onChange={(event) =>
                                    updateOption(index, {
                                      trigger_quest: event.target.value || undefined,
                                    })
                                  }
                                  className={`${compactClass} flex-1`}
                                >
                                  <option value="">None</option>
                                  {gamePackage.quests.map((quest) => (
                                    <option key={quest.id} value={quest.id}>
                                      {quest.display_name}
                                    </option>
                                  ))}
                                </select>
                                {option.trigger_quest && (
                                  <select
                                    value={option.trigger_quest_state || "active"}
                                    onChange={(event) =>
                                      updateOption(index, {
                                        trigger_quest_state: event.target.value,
                                      })
                                    }
                                    className={compactClass}
                                  >
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                  </select>
                                )}
                              </label>

                              <label className="flex items-center gap-2 text-xs text-neutral-500">
                                Set switch
                                <SwitchPicker
                                  value={option.set_switch || ""}
                                  onChange={(value) =>
                                    updateOption(index, {
                                      set_switch: value || undefined,
                                    })
                                  }
                                  className={`${compactClass} flex-1 font-mono`}
                                />
                                {option.set_switch && (
                                  <select
                                    value={String(option.set_switch_value ?? true)}
                                    onChange={(event) =>
                                      updateOption(index, {
                                        set_switch_value: event.target.value === "true",
                                      })
                                    }
                                    className={compactClass}
                                  >
                                    <option value="true">On</option>
                                    <option value="false">Off</option>
                                  </select>
                                )}
                              </label>

                              <label className="flex items-center gap-2 text-xs text-neutral-500">
                                Trigger cutscene
                                <select
                                  value={option.trigger_cutscene || ""}
                                  onChange={(event) =>
                                    updateOption(index, {
                                      trigger_cutscene: event.target.value || undefined,
                                    })
                                  }
                                  className={`${compactClass} flex-1`}
                                >
                                  <option value="">None</option>
                                  {gamePackage.cutscenes.map((cutscene) => (
                                    <option key={cutscene.id} value={cutscene.id}>
                                      {cutscene.display_name || cutscene.id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <div className="mt-3">
                              <ConditionEditor
                                label="Advanced visibility condition"
                                compact
                                value={option.condition}
                                onChange={(condition) =>
                                  updateOption(index, { condition })
                                }
                              />
                            </div>
                          </div>
                        ))}
                        {!activeNode.options.length && (
                          <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">
                            No player choices. This node closes when the player continues.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-sm text-neutral-600">
                    Select a node to edit it.
                  </div>
                )}
              </div>
            </main>
          </div>
        )
      ) : (
        <main className="hidden flex-1 items-center justify-center text-center lg:flex">
          <div>
            <GitBranch className="mx-auto h-10 w-10 text-neutral-800" />
            <h2 className="mt-3 text-lg font-semibold text-neutral-300">
              Standard dialogue trees
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Select a conversation or create a new branching tree.
            </p>
            <button
              type="button"
              onClick={createDialogue}
              className="mt-5 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Plus className="mr-1 inline h-4 w-4" /> New conversation
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
