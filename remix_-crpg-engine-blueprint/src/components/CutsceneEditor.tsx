import React, { useMemo, useState } from "react";
import { useEngineStore } from "../store/engineStore";
import { CutsceneData, CutsceneSchema, EventActionData } from "../schema/game";
import { AlertTriangle, Plus, Trash2, Film, Sparkles } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";
import { ConditionEditor } from "./ConditionEditor";
import { SwitchPicker } from "./SwitchPicker";

const supportedActionTypes = [
  "wait",
  "show_dialogue",
  "move_player",
  "move_entity",
  "set_switch",
  "teleport_player",
  "give_item",
  "remove_item",
  "set_player_sprite",
  "read_document",
  "heal_player",
  "open_shop",
  "give_currency",
  "remove_currency",
  "add_party_member",
  "remove_party_member",
  "label",
  "branch",
  "play_music",
  "screen_fade",
  "camera_pan",
  "adjust_faction_rep",
  "open_save_menu",
  "advance_clock",
  "modify_player_stats",
  "learn_skill",
  "set_entity_hidden",
  "play_sound",
  "restore_party",
  "chem_spill",
  "game_end",
] as const;

const unsupportedActionTypes = ["start_combat", "custom"] as const;

const actionLabels: Record<string, string> = {
  wait: "Wait",
  show_dialogue: "Dialogue",
  move_player: "Move Player",
  move_entity: "Move Entity",
  set_switch: "Set Switch",
  teleport_player: "Teleport Player",
  give_item: "Give Item",
  remove_item: "Remove Item",
  set_player_sprite: "Set Player Sprite",
  read_document: "Read Document",
  heal_player: "Heal Player",
  open_shop: "Open Shop",
  give_currency: "Give Currency",
  remove_currency: "Remove Currency",
  add_party_member: "Add Party Member",
  remove_party_member: "Remove Party Member",
  label: "Label",
  branch: "Branch",
  play_music: "Play Music",
  screen_fade: "Screen Fade",
  camera_pan: "Camera Pan",
  adjust_faction_rep: "Adjust Faction Rep",
  open_save_menu: "Open Save Menu",
  advance_clock: "Advance Clock",
  modify_player_stats: "Modify Player Stats",
  learn_skill: "Learn Skill",
  set_entity_hidden: "Set Entity Hidden",
  play_sound: "Play Sound",
  restore_party: "Restore Party",
  chem_spill: "Chemistry Spill",
  game_end: "End Game",
  start_combat: "Start Combat (unsupported)",
  custom: "Custom (unsupported)",
};

const statDeltaFields = ["hp", "max_hp", "mp", "max_mp", "attack", "defense", "speed"];

export function CutsceneEditor() {
  const { gamePackage, setGamePackage } = useEngineStore();
  const [selectedId, setSelectedId] = useState<string | null>(gamePackage.cutscenes[0]?.id || null);
  const [showAIModal, setShowAIModal] = useState(false);

  const activeCutscene = gamePackage.cutscenes.find((cutscene) => cutscene.id === selectedId) || null;
  const musicTrackIds = Object.keys((gamePackage.settings?.music_tracks || {}) as Record<string, string>);
  const labelIds = activeCutscene?.actions
    .filter((action) => action.type === "label" && action.label)
    .map((action) => action.label!) || [];

  const entityPlacementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    gamePackage.maps.forEach((map) =>
      map.entity_placements?.forEach((placement) => {
        counts.set(placement.entity_id, (counts.get(placement.entity_id) || 0) + 1);
      }),
    );
    return counts;
  }, [gamePackage.maps]);

  const updateGamePackage = (updates: any) => setGamePackage({ ...gamePackage, ...updates });

  const handleCreate = () => {
    const id = `cutscene_${Date.now()}`;
    const newCutscene: CutsceneData = {
      id,
      display_name: "New Cutscene",
      is_blocking: true,
      actions: [],
    };
    updateGamePackage({ cutscenes: [...gamePackage.cutscenes, newCutscene] });
    setSelectedId(id);
  };

  const updateActive = (updates: Partial<CutsceneData>) => {
    if (!activeCutscene) return;
    const cutscenes = gamePackage.cutscenes.map((cutscene) =>
      cutscene.id === activeCutscene.id ? { ...cutscene, ...updates } : cutscene,
    );
    updateGamePackage({ cutscenes });
  };

  const addAction = () => {
    if (!activeCutscene) return;
    updateActive({
      actions: [...activeCutscene.actions, { type: "wait", duration: 1000 }],
    });
  };

  const updateAction = (index: number, updates: Partial<EventActionData>) => {
    if (!activeCutscene) return;
    const actions = [...activeCutscene.actions];
    actions[index] = { ...actions[index], ...updates };
    updateActive({ actions });
  };

  const removeAction = (index: number) => {
    if (!activeCutscene) return;
    updateActive({ actions: activeCutscene.actions.filter((_, idx) => idx !== index) });
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full relative">
      <div className={`${activeCutscene ? "hidden md:flex" : "flex"} w-full md:w-64 bg-neutral-900 border-r border-neutral-800 flex-col h-full shrink-0`}>
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Cutscenes</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowAIModal(true)} title="Generate Cutscene" className="p-1.5 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors">
              <Sparkles className="w-4 h-4" />
            </button>
            <button onClick={handleCreate} className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {gamePackage.cutscenes.map((cutscene) => (
            <button
              key={cutscene.id}
              onClick={() => setSelectedId(cutscene.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${selectedId === cutscene.id ? "bg-neutral-800 text-white font-medium" : "text-neutral-400 hover:bg-neutral-800/50"}`}
            >
              <Film className="w-4 h-4 shrink-0" />
              <span className="truncate">{cutscene.display_name || cutscene.id}</span>
            </button>
          ))}
          {gamePackage.cutscenes.length === 0 && <p className="text-xs text-neutral-500 p-4 text-center">No cutscenes created yet.</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-neutral-950">
        {activeCutscene ? (
          <div className="max-w-4xl space-y-6">
            <button onClick={() => setSelectedId(null)} className="md:hidden text-sm text-neutral-400 hover:text-white mb-2">Back to List</button>

            <div className="space-y-4 bg-neutral-900 p-4 rounded-xl border border-neutral-800">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Field label="Name">
                    <input
                      type="text"
                      value={activeCutscene.display_name || activeCutscene.id}
                      onChange={(event) => updateActive({ display_name: event.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-neutral-200 outline-none"
                    />
                  </Field>
                </div>
                <button
                  onClick={() => {
                    const id = `${activeCutscene.id}_copy`;
                    updateGamePackage({
                      cutscenes: [
                        ...gamePackage.cutscenes,
                        {
                          ...JSON.parse(JSON.stringify(activeCutscene)),
                          id,
                          display_name: `${activeCutscene.display_name || activeCutscene.id} (copy)`,
                        },
                      ],
                    });
                    setSelectedId(id);
                  }}
                  title="Duplicate this cutscene"
                  className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
                >
                  Duplicate
                </button>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeCutscene.is_blocking}
                  onChange={(event) => updateActive({ is_blocking: event.target.checked })}
                  className="w-4 h-4 bg-neutral-950 border border-neutral-800 rounded"
                />
                <span className="text-sm text-neutral-300">Blocking (pauses player input)</span>
              </label>
            </div>

            <section className="space-y-4 border-t border-neutral-800 pt-4">
              <div className="flex justify-between items-center bg-neutral-900 px-4 py-2 rounded-lg border border-neutral-800">
                <h3 className="font-medium text-neutral-200">Event Actions</h3>
                <button onClick={addAction} className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded flex items-center gap-1.5">
                  <Plus className="w-3 h-3" /> Add Action
                </button>
              </div>

              {activeCutscene.actions.map((action, index) => {
                const unsupported = (unsupportedActionTypes as readonly string[]).includes(action.type);
                const duplicateEntityTarget =
                  action.entity_id && (action.type === "move_entity" || action.type === "set_entity_hidden")
                    ? (entityPlacementCounts.get(action.entity_id) || 0) > 1
                    : false;
                return (
                  <div key={index} className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800 relative group space-y-3">
                    <div className="flex gap-4 items-start">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500 w-8">{index + 1}.</span>
                          <select
                            value={action.type}
                            onChange={(event) => updateAction(index, { type: event.target.value as any })}
                            className="bg-neutral-950 border border-neutral-800 rounded py-1.5 px-2 text-sm text-neutral-300 outline-none min-w-52"
                          >
                            {supportedActionTypes.map((type) => (
                              <option key={type} value={type}>{actionLabels[type]}</option>
                            ))}
                            {unsupportedActionTypes.map((type) => (
                              <option key={type} value={type} disabled={action.type !== type}>
                                {actionLabels[type]}
                              </option>
                            ))}
                          </select>
                          {unsupported && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Unsupported action; remove it before this package can pass readiness validation
                            </span>
                          )}
                        </div>

                        {duplicateEntityTarget && (
                          <div className="rounded border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                            This entity id appears multiple times in maps; runtime targets the first placement on the active map.
                          </div>
                        )}

                        <ActionFields
                          action={action}
                          index={index}
                          labelIds={labelIds}
                          musicTrackIds={musicTrackIds}
                          updateAction={updateAction}
                        />
                      </div>
                      <button onClick={() => removeAction(index)} className="text-neutral-500 hover:text-red-400 p-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {activeCutscene.actions.length === 0 && <p className="text-sm text-neutral-500 text-center py-4">No actions.</p>}
            </section>
          </div>
        ) : (
          <div className="hidden md:flex h-full w-full items-center justify-center text-neutral-500">
            Select or create a cutscene
          </div>
        )}
      </div>

      {showAIModal && (
        <AIGenerationModal
          title="Generate Cutscene"
          placeholder="e.g. A guard spots you, walks over, talks to you, then sets a flag..."
          schema={{
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                display_name: { type: "STRING" },
                is_blocking: { type: "BOOLEAN" },
                actions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      type: { type: "STRING", description: `Supported: ${supportedActionTypes.join(", ")}` },
                      duration: { type: "NUMBER" },
                      dialogue_id: { type: "STRING" },
                      node_id: { type: "STRING" },
                      switch_id: { type: "STRING" },
                      switch_value: { type: "BOOLEAN" },
                      entity_id: { type: "STRING" },
                      cell: { type: "ARRAY", items: { type: "NUMBER" } },
                      facing: { type: "ARRAY", items: { type: "NUMBER" } },
                      map_id: { type: "STRING" },
                      item_id: { type: "STRING" },
                      amount: { type: "NUMBER" },
                      skill_id: { type: "STRING" },
                    },
                    required: ["type"],
                  },
                },
              },
              required: ["id", "display_name", "actions"],
            },
          }}
          onGenerate={(data) => {
            const candidates = Array.isArray(data) ? data : [data];
            const parsed = candidates.map((candidate, index) => {
              const result = CutsceneSchema.safeParse(candidate);
              if (!result.success) {
                throw new Error(`Generated cutscene ${index + 1} is invalid: ${result.error.issues[0]?.message || "schema error"}`);
              }
              const unsupported = result.data.actions.find(
                (action) => !(supportedActionTypes as readonly string[]).includes(action.type),
              );
              if (unsupported) {
                throw new Error(`Generated action “${unsupported.type}” is not supported and was not added.`);
              }
              return result.data;
            });
            updateGamePackage({ cutscenes: [...gamePackage.cutscenes, ...parsed] });
            if (parsed.length > 0) setSelectedId(parsed[0].id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}

interface ActionFieldsProps {
  action: EventActionData;
  index: number;
  labelIds: string[];
  musicTrackIds: string[];
  updateAction: (index: number, updates: Partial<EventActionData>) => void;
}

function ActionFields({ action, index, labelIds, musicTrackIds, updateAction }: ActionFieldsProps) {
  const { gamePackage } = useEngineStore();
  const selectedDialogue = gamePackage.dialogue.find((dialogue) => dialogue.id === action.dialogue_id);
  const soundEffectIds = Object.keys((gamePackage.settings?.sound_effects || {}) as Record<string, string>);
  const endingIds = ((gamePackage.endings || []) as Array<{ id?: string; title?: string }>).filter(
    (ending): ending is { id: string; title?: string } => typeof ending?.id === "string",
  );
  const factionIds = ((gamePackage.factions || []) as Array<{ id?: string; display_name?: string }>).filter(
    (faction): faction is { id: string; display_name?: string } => typeof faction?.id === "string",
  );

  const setCellPart = (part: 0 | 1, value: number) => {
    const current = action.cell || [0, 0];
    updateAction(index, { cell: part === 0 ? [value, current[1]] : [current[0], value] });
  };

  const setFacingPart = (part: 0 | 1, value: number) => {
    const current = action.facing || [0, 1];
    updateAction(index, { facing: part === 0 ? [value, current[1]] : [current[0], value] });
  };

  return (
    <div className="pl-0 md:pl-10 grid grid-cols-1 md:grid-cols-2 gap-3">
      {action.type === "wait" && (
        <NumberField label="Duration ms" value={action.duration ?? 1000} onChange={(duration) => updateAction(index, { duration })} />
      )}

      {action.type === "show_dialogue" && (
        <>
          <SelectField label="Dialogue" value={action.dialogue_id || ""} onChange={(dialogue_id) => updateAction(index, { dialogue_id })}>
            <option value="">Select Dialogue...</option>
            {gamePackage.dialogue.map((dialogue) => <option key={dialogue.id} value={dialogue.id}>{dialogue.display_name || dialogue.id}</option>)}
          </SelectField>
          <SelectField label="Start Node" value={action.node_id || ""} onChange={(node_id) => updateAction(index, { node_id: node_id || undefined })}>
            <option value="">First node</option>
            {selectedDialogue?.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}
          </SelectField>
        </>
      )}

      {(action.type === "move_player" || action.type === "move_entity" || action.type === "teleport_player" || action.type === "camera_pan") && (
        <>
          {action.type === "move_entity" && (
            <EntitySelect value={action.entity_id || ""} onChange={(entity_id) => updateAction(index, { entity_id })} />
          )}
          {action.type === "teleport_player" && (
            <SelectField label="Target Map" value={action.map_id || ""} onChange={(map_id) => updateAction(index, { map_id: map_id || undefined })}>
              <option value="">Current map</option>
              {gamePackage.maps.map((map) => <option key={map.id} value={map.id}>{map.display_name || map.id}</option>)}
            </SelectField>
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Cell X" value={action.cell?.[0] ?? 0} onChange={(value) => setCellPart(0, value)} />
            <NumberField label="Cell Z" value={action.cell?.[1] ?? 0} onChange={(value) => setCellPart(1, value)} />
          </div>
          {action.type !== "camera_pan" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Face X" value={action.facing?.[0] ?? 0} onChange={(value) => setFacingPart(0, value)} />
              <NumberField label="Face Z" value={action.facing?.[1] ?? 1} onChange={(value) => setFacingPart(1, value)} />
            </div>
          )}
          {action.type === "camera_pan" && (
            <NumberField label="Duration ms" value={action.duration ?? 800} onChange={(duration) => updateAction(index, { duration })} />
          )}
        </>
      )}

      {action.type === "chem_spill" && (
        <>
          <SelectField
            label="Substance"
            value={action.liquid_id || "water"}
            onChange={(liquid_id) => updateAction(index, { liquid_id })}
          >
            <option value="water">Water (floods & pools)</option>
            <option value="honey">Honey (slow viscous crawl)</option>
            <option value="oil">Oil (flammable spill)</option>
            <option value="miasma">Miasma (gas — fills & dissipates)</option>
            <option value="fire">Fire (ignition impulse)</option>
          </SelectField>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Cell X" value={action.cell?.[0] ?? 0} onChange={(value) => setCellPart(0, value)} />
            <NumberField label="Cell Z" value={action.cell?.[1] ?? 0} onChange={(value) => setCellPart(1, value)} />
          </div>
          <NumberField
            label="Amount (volume / vapor / burn ×100)"
            value={action.amount ?? 150}
            onChange={(amount) => updateAction(index, { amount })}
          />
          <p className="text-xs text-neutral-500">
            Injects quantity only — flooding, burning, and dissipating are the live
            chemistry simulation advancing on player moves.
          </p>
        </>
      )}

      {action.type === "set_switch" && (
        <>
          <label className="block">
            <span className="text-xs text-neutral-500">Switch ID</span>
            <SwitchPicker
              value={action.switch_id || ""}
              onChange={(switch_id) => updateAction(index, { switch_id })}
              className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-2 text-sm text-neutral-300 outline-none font-mono"
            />
          </label>
          <SelectField label="Value" value={String(action.switch_value ?? true)} onChange={(value) => updateAction(index, { switch_value: value === "true" })}>
            <option value="true">True</option>
            <option value="false">False</option>
          </SelectField>
        </>
      )}

      {action.type === "play_sound" && (
        <>
          <SelectField label="Sound" value={action.sound_id || ""} onChange={(sound_id) => updateAction(index, { sound_id: sound_id || undefined })}>
            <option value="">Select Sound...</option>
            {soundEffectIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </SelectField>
          <NumberField label="Volume (0-1)" value={action.volume ?? 0.5} step={0.05} onChange={(volume) => updateAction(index, { volume })} />
        </>
      )}

      {action.type === "game_end" && (
        <>
          <SelectField label="Ending" value={action.ending_id || ""} onChange={(ending_id) => updateAction(index, { ending_id: ending_id || undefined })}>
            <option value="">-- No named ending --</option>
            {endingIds.map((entry) => <option key={entry.id} value={entry.id}>{entry.title || entry.id}</option>)}
          </SelectField>
          <TextField label="Title override" value={action.title || ""} onChange={(title) => updateAction(index, { title: title || undefined })} />
        </>
      )}

      {(action.type === "give_item" || action.type === "remove_item") && (
        <>
          <SelectField label="Item" value={action.item_id || ""} onChange={(item_id) => updateAction(index, { item_id })}>
            <option value="">Select Item...</option>
            {gamePackage.items?.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.id}</option>)}
          </SelectField>
          <NumberField label="Amount" value={action.amount ?? 1} onChange={(amount) => updateAction(index, { amount })} />
        </>
      )}

      {action.type === "set_player_sprite" && (
        <SelectField label="Player Sprite" value={action.sprite_id || ""} onChange={(sprite_id) => updateAction(index, { sprite_id: sprite_id || undefined })}>
          <option value="">Default Player Sprite</option>
          {gamePackage.sprite_library?.map((sprite) => <option key={sprite.id} value={sprite.id}>{sprite.display_name || sprite.id}</option>)}
        </SelectField>
      )}

      {action.type === "read_document" && (
        <SelectField label="Document" value={action.document_id || ""} onChange={(document_id) => updateAction(index, { document_id })}>
          <option value="">Select Document...</option>
          {gamePackage.documents?.map((document) => <option key={document.id} value={document.id}>{document.display_name || document.id}</option>)}
        </SelectField>
      )}

      {action.type === "open_shop" && (
        <SelectField label="Shop" value={action.shop_id || ""} onChange={(shop_id) => updateAction(index, { shop_id })}>
          <option value="">Select Shop...</option>
          {gamePackage.shops?.map((shop) => <option key={shop.id} value={shop.id}>{shop.display_name || shop.id}</option>)}
        </SelectField>
      )}

      {(action.type === "heal_player" || action.type === "give_currency" || action.type === "remove_currency" || action.type === "advance_clock") && (
        <NumberField label={action.type === "advance_clock" ? "Minutes" : "Amount"} value={action.amount ?? 0} onChange={(amount) => updateAction(index, { amount })} />
      )}

      {(action.type === "add_party_member" || action.type === "remove_party_member" || action.type === "set_entity_hidden") && (
        <>
          <EntitySelect value={action.entity_id || ""} onChange={(entity_id) => updateAction(index, { entity_id })} />
          {action.type === "set_entity_hidden" && (
            <SelectField label="Hidden" value={String(action.hidden ?? true)} onChange={(value) => updateAction(index, { hidden: value === "true" })}>
              <option value="true">Hide</option>
              <option value="false">Reveal</option>
            </SelectField>
          )}
        </>
      )}

      {action.type === "label" && (
        <TextField label="Label" value={action.label || ""} onChange={(label) => updateAction(index, { label })} />
      )}

      {action.type === "branch" && (
        <div className="md:col-span-2 space-y-3">
          <SelectField label="Target Label" value={action.target_label || ""} onChange={(target_label) => updateAction(index, { target_label })}>
            <option value="">Select label...</option>
            {labelIds.map((label) => <option key={label} value={label}>{label}</option>)}
          </SelectField>
          <ConditionEditor
            label="Branch Condition"
            value={action.condition}
            onChange={(condition) => updateAction(index, { condition })}
          />
        </div>
      )}

      {action.type === "play_music" && (
        <>
          <SelectField label="Music Track" value={action.music_id || ""} onChange={(music_id) => updateAction(index, { music_id: music_id || undefined })}>
            <option value="">Stop music / direct URL</option>
            {musicTrackIds.map((trackId) => <option key={trackId} value={trackId}>{trackId}</option>)}
          </SelectField>
          <TextField label="Music URL" value={action.music_url || ""} onChange={(music_url) => updateAction(index, { music_url: music_url || undefined })} />
          <NumberField label="Volume 0-1" value={action.volume ?? 1} step={0.1} onChange={(volume) => updateAction(index, { volume })} />
        </>
      )}

      {action.type === "screen_fade" && (
        <>
          <SelectField label="Fade" value={action.fade || "out"} onChange={(fade) => updateAction(index, { fade: fade as any })}>
            <option value="out">Out</option>
            <option value="in">In</option>
          </SelectField>
          <TextField label="Color" value={action.color || "#000000"} onChange={(color) => updateAction(index, { color })} />
          <NumberField label="Duration ms" value={action.duration ?? 600} onChange={(duration) => updateAction(index, { duration })} />
        </>
      )}

      {action.type === "adjust_faction_rep" && (
        <>
          {factionIds.length > 0 ? (
            <SelectField label="Faction" value={action.faction_id || ""} onChange={(faction_id) => updateAction(index, { faction_id })}>
              <option value="">Select Faction...</option>
              {factionIds.map((faction) => (
                <option key={faction.id} value={faction.id}>{faction.display_name || faction.id}</option>
              ))}
            </SelectField>
          ) : (
            <TextField label="Faction ID (declare in Game · Factions)" value={action.faction_id || ""} onChange={(faction_id) => updateAction(index, { faction_id })} />
          )}
          <NumberField label="Delta" value={action.amount ?? 0} onChange={(amount) => updateAction(index, { amount })} />
        </>
      )}

      {action.type === "restore_party" && (
        <div className="text-xs text-neutral-500 md:col-span-2">Fully heals the player and every party member.</div>
      )}

      {action.type === "modify_player_stats" && (
        <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          {statDeltaFields.map((key) => (
            <NumberField
              key={key}
              label={key}
              value={action.stats?.[key] ?? 0}
              onChange={(value) => updateAction(index, { stats: { ...(action.stats || {}), [key]: value } })}
            />
          ))}
        </div>
      )}

      {action.type === "learn_skill" && (
        <SelectField label="Skill" value={action.skill_id || ""} onChange={(skill_id) => updateAction(index, { skill_id })}>
          <option value="">Select Skill...</option>
          {gamePackage.abilities?.map((skill) => <option key={skill.id} value={skill.id}>{skill.display_name || skill.id}</option>)}
        </SelectField>
      )}

      {action.type === "open_save_menu" && (
        <div className="text-xs text-neutral-500 md:col-span-2">Opens the save/load slot panel when the action runs.</div>
      )}
    </div>
  );
}

function EntitySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { gamePackage } = useEngineStore();
  return (
    <SelectField label="Entity" value={value} onChange={onChange}>
      <option value="">Select Entity...</option>
      {gamePackage.entities.map((entity) => (
        <option key={entity.id} value={entity.id}>{entity.display_name || entity.id}</option>
      ))}
    </SelectField>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs text-neutral-500 font-medium">{label}</span>
      {children}
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-2 text-sm text-neutral-300 outline-none"
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-2 text-sm text-neutral-300 outline-none"
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-neutral-950 border border-neutral-800 rounded py-1.5 px-2 text-sm text-neutral-300 outline-none"
      >
        {children}
      </select>
    </Field>
  );
}
