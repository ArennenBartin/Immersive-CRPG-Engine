import { create } from "zustand";
import { ContainerSaveState, MapDelta, PlaySave } from "../schema/save";
import {
  migratePlaySaveV1ToV2,
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
  type PlaySaveV2,
} from "../schema/v2";
import { persist } from "zustand/middleware";
import {
  applyLevelUpChoiceToSave,
  getCombatXpPool,
  grantExperienceToSave,
  normalizeProgression,
} from "../utils/leveling";
import type { ExperienceGrantResult, LevelUpStat } from "../utils/leveling";
import type { EngineEvent } from "../engine-core";
import { FINE_PER_MACRO } from "../engine-core/gridCoordinates";
import { isGeneratedPlayerSpriteId } from "../data/generatedPlayerAssets";

// Store-wide monotonically increasing id for captured engine events (each
// dispatch's EventBus restarts its own ids at 1).
let nextEngineEventId = 1;

interface PlayState {
  saveData: PlaySave | null;
  logMessages: string[];
  // Rolling log of structured engine-core events (move/take/open/change/trigger, ...)
  // for the runtime event stream + debug inspector. Transient; capped.
  engineEvents: EngineEvent[];
  pushEngineEvents: (events: EngineEvent[]) => void;
  activeDialogueId: string | null;
  activeDialogueNodeId: string | null;
  activeShopId: string | null;
  activeContainerId: string | null;
  initSave: (
    startMapId: string,
    startCell: [number, number],
    startFacing: [number, number],
    version: string,
    statOverrides?: Partial<PlaySave["playerStats"]>,
    clockStartMinutes?: number,
    options?: {
      playerSpriteId?: string;
      initialKnownSkills?: string[];
      startingPartyMembers?: string[];
    },
  ) => void;
  // ── Turn-queue combat ──
  // Queue ids: "player", party entity ids, enemy entity-state keys.
  startCombat: (queue: string[]) => void;
  // Advance to the next living actor in the queue.
  advanceTurn: () => void;
  // Leave combat; party members go back to follower mode (their combat cell
  // is dropped, downed members stand back up at 1 HP).
  endCombat: (partyIds: string[]) => ExperienceGrantResult | null;
  // Late arrivals join the back of the initiative order.
  extendCombatQueue: (ids: string[]) => void;
  queueCombatExperience: (amount: number) => void;
  updatePlayer: (cell: [number, number], facing: [number, number]) => void;
  movePlayer: (
    cell: [number, number],
    facing: [number, number],
    energyChange?: number,
  ) => void;
  commitRuntimeSave: (saveData: PlaySave) => void;
  setPlayerSprite: (spriteId?: string) => void;
  addLog: (msg: string) => void;
  updatePlayerHp: (hpChange: number) => void;
  updatePlayerMp: (mpChange: number) => void;
  openShop: (shopId: string) => void;
  closeShop: () => void;
  resetRun: () => void;
  startDialogue: (dialogueId: string, startNodeId: string) => void;
  advanceDialogue: (nextNodeId?: string) => void;
  endDialogue: () => void;
  setQuestState: (questId: string, state: string) => void;
  setFlag: (flagId: string, value: boolean) => void;
  updateEntityState: (entityId: string, updates: any) => void;
  updatePlayerStats: (updates: any) => void;
  addPartyMember: (entityId: string) => void;
  removePartyMember: (entityId: string) => void;
  loadMap: (
    mapId: string,
    cell: [number, number],
    facing: [number, number],
  ) => void;
  giveItem: (itemId: string, amount: number) => void;
  removeItem: (itemId: string, amount: number) => void;
  updateMoney: (amount: number) => void;
  // World item / container persistence (per-map deltas)
  takeAuthoredWorldItem: (mapId: string, placementId: string) => void;
  addDroppedItem: (
    mapId: string,
    dropped: { id: string; item_id: string; cell: [number, number]; count: number },
  ) => void;
  removeDroppedItem: (mapId: string, droppedId: string) => void;
  updateContainerState: (
    mapId: string,
    containerId: string,
    updates: ContainerSaveState,
  ) => void;
  openContainer: (containerId: string) => void;
  closeContainer: () => void;
  // Game clock
  advanceClock: (minutes: number) => void;
  // Faction reputation
  adjustFactionRep: (factionId: string, amount: number) => void;
  // Class/progression: apply additive stat deltas (raising max_hp/max_mp
  // also raises the current value so growth never feels like a wound).
  modifyPlayerStats: (deltas: Record<string, number>) => void;
  grantExperience: (amount: number) => ExperienceGrantResult | null;
  chooseLevelUpStat: (stat: LevelUpStat) => boolean;
  learnSkill: (skillId: string) => void;
  markDocumentRead: (documentId: string) => void;
  // Save-backed fog of war: merge newly-seen cell keys ("x:z") for a map.
  markCellsExplored: (mapId: string, cellKeys: string[]) => void;
  // Save slots: returns false when there is no active run to save.
  saveToSlot: (slot: number) => boolean;
  // Returns an error message, or null on success.
  loadFromSlot: (slot: number, expectedVersion: string) => string | null;
}

// ── Save slots ──────────────────────────────────────────────────────────────
// Explicit save/load lives beside the continuous autosave (`crpg-run-save`):
// three named slots in localStorage, each a full PlaySave snapshot plus
// metadata for the menu.

export const SAVE_SLOT_COUNT = 3;

export interface SaveSlotData {
  schema: "crpg_engine_save_slot_v2";
  meta: {
    slot: number;
    saved_at: string;
    clock_minutes: number;
    map_id: string;
    package_version: string;
    save_schema: PlaySave["schema"] | PlaySaveV2["schema"];
  };
  saveData: PlaySave;
}

const slotKey = (slot: number) => `crpg-save-slot-${slot}`;

interface StoredSaveSlotData {
  schema?: string;
  meta?: Partial<SaveSlotData["meta"]>;
  saveData?: unknown;
}

const LEGACY_PLAYER_SPRITE_IDS = new Set(["spr_player", "ovr_ent_intercessor_south_idle"]);

const normalizeRuntimeSave = (input: unknown): PlaySave | null => {
  try {
    const save = normalizeProgression(unwrapPlaySaveV1(normalizePlaySaveToV2(input)));
    const spriteId = save.player?.sprite_id;
    return LEGACY_PLAYER_SPRITE_IDS.has(spriteId) || isGeneratedPlayerSpriteId(spriteId)
      ? {
          ...save,
          player: { ...save.player, sprite_id: undefined },
        }
      : save;
  } catch {
    return null;
  }
};

export const buildSaveSlotPayload = (
  slot: number,
  save: PlaySave,
  savedAt = new Date().toISOString(),
): StoredSaveSlotData => {
  const saveV2 = migratePlaySaveV1ToV2(save);
  return {
    schema: "crpg_engine_save_slot_v2",
    meta: {
      slot,
      saved_at: savedAt,
      clock_minutes: save.clock_minutes ?? 0,
      map_id: save.current_map_id,
      package_version: save.package_version,
      save_schema: saveV2.schema,
    },
    saveData: saveV2,
  };
};

export const normalizeSaveSlotPayload = (
  slot: number,
  payload: unknown,
): SaveSlotData | null => {
  if (!payload || typeof payload !== "object") return null;
  const stored = payload as StoredSaveSlotData;
  const save = normalizeRuntimeSave(stored.saveData);
  if (!save) return null;
  return {
    schema: "crpg_engine_save_slot_v2",
    meta: {
      slot,
      saved_at:
        typeof stored.meta?.saved_at === "string"
          ? stored.meta.saved_at
          : new Date().toISOString(),
      clock_minutes:
        typeof stored.meta?.clock_minutes === "number"
          ? stored.meta.clock_minutes
          : save.clock_minutes ?? 0,
      map_id:
        typeof stored.meta?.map_id === "string"
          ? stored.meta.map_id
          : save.current_map_id,
      package_version:
        typeof stored.meta?.package_version === "string"
          ? stored.meta.package_version
          : save.package_version,
      save_schema:
        stored.meta?.save_schema === "crpg_engine_save_v2"
          ? "crpg_engine_save_v2"
          : save.schema,
    },
    saveData: save,
  };
};

export const readSaveSlot = (slot: number): SaveSlotData | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    return normalizeSaveSlotPayload(slot, JSON.parse(raw));
  } catch {
    return null;
  }
};

export const deleteSaveSlot = (slot: number) => {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(slotKey(slot));
};

// Immutable helper: apply an update to one map's delta inside saveData.
const withMapDelta = (
  save: PlaySave,
  mapId: string,
  update: (delta: MapDelta) => MapDelta,
): PlaySave => ({
  ...save,
  map_deltas: {
    ...(save.map_deltas || {}),
    [mapId]: update({ ...(save.map_deltas?.[mapId] || {}) }),
  },
});

export const usePlayStore = create<PlayState>()(
  persist(
    (set, get) => ({
      saveData: null,
      logMessages: [],
      engineEvents: [],
      activeDialogueId: null,
      activeDialogueNodeId: null,
      activeShopId: null,
      activeContainerId: null,
      initSave: (
        current_map_id,
        cell,
        facing,
        package_version,
        statOverrides,
        clockStartMinutes,
        options,
      ) =>
        set(() => {
          const playerStats = {
            hp: 20,
            max_hp: 20,
            mp: 10,
            max_mp: 10,
            attack: 5,
            defense: 2,
            speed: 10,
            energy: 1000,
            ...(statOverrides || {}),
          };
          // If an author raises max hp/mp without specifying current values,
          // start full rather than at the engine default.
          if (statOverrides?.max_hp !== undefined && statOverrides.hp === undefined)
            playerStats.hp = statOverrides.max_hp;
          if (statOverrides?.max_mp !== undefined && statOverrides.mp === undefined)
            playerStats.mp = statOverrides.max_mp;
          return {
          saveData: {
            schema: "crpg_engine_save_v1",
            package_version,
            fine_ratio: FINE_PER_MACRO,
            current_map_id,
            player: { cell, facing, sprite_id: options?.playerSpriteId },
            playerStats,
            level: 1,
            experience: 0,
            pending_level_ups: 0,
            known_skills: [...(options?.initialKnownSkills || [])],
            flags: {},
            quests: {},
            inventory: [],
            money: 0,
            entity_states: {},
            party_members: [...(options?.startingPartyMembers || [])],
            map_deltas: {},
            clock_minutes: clockStartMinutes ?? 8 * 60,
            faction_rep: {},
            read_documents: [],
            in_combat: false,
            combat_queue: [],
            active_turn_id: "player",
            combat_xp_pool: 0,
          },
          logMessages: [`Entered map: ${current_map_id}`],
          activeDialogueId: null,
          activeDialogueNodeId: null,
          activeShopId: null,
          activeContainerId: null,
          };
        }),
      updatePlayer: (cell, facing) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              player: {
                cell,
                facing,
                sprite_id: state.saveData.player.sprite_id,
              },
            },
          };
        }),
      movePlayer: (cell, facing, energyChange = 0) =>
        set((state) => {
          if (!state.saveData) return state;
          const playerStats =
            energyChange === 0
              ? state.saveData.playerStats
              : {
                  ...state.saveData.playerStats,
                  energy: (state.saveData.playerStats.energy || 0) + energyChange,
                };

          return {
            saveData: {
              ...state.saveData,
              player: {
                cell,
                facing,
                sprite_id: state.saveData.player.sprite_id,
              },
              playerStats,
            },
          };
        }),
      commitRuntimeSave: (saveData) => set({ saveData }),
      setPlayerSprite: (spriteId) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              player: { ...state.saveData.player, sprite_id: spriteId },
            },
          };
        }),
      addLog: (msg) =>
        set((state) => ({
          logMessages: [...state.logMessages, msg].slice(-20),
        })),
      pushEngineEvents: (events) =>
        set((state) =>
          events.length
            ? {
                // Each dispatch uses its own EventBus (ids restart at 1), so
                // re-stamp a store-wide unique id for stable React keys/order.
                engineEvents: [
                  ...state.engineEvents,
                  ...events.map((event) => ({ ...event, id: nextEngineEventId++ })),
                ].slice(-60),
              }
            : state,
        ),
      updatePlayerHp: (hpChange) =>
        set((state) => {
          if (!state.saveData) return state;
          const newHp = Math.max(
            0,
            Math.min(
              state.saveData.playerStats.max_hp,
              state.saveData.playerStats.hp + hpChange,
            ),
          );
          return {
            saveData: {
              ...state.saveData,
              playerStats: { ...state.saveData.playerStats, hp: newHp },
            },
          };
        }),
      updatePlayerMp: (mpChange) =>
        set((state) => {
          if (!state.saveData) return state;
          const newMp = Math.max(
            0,
            Math.min(
              state.saveData.playerStats.max_mp ?? 10,
              (state.saveData.playerStats.mp ?? 10) + mpChange,
            ),
          );
          return {
            saveData: {
              ...state.saveData,
              playerStats: { ...state.saveData.playerStats, mp: newMp },
            },
          };
        }),
      resetRun: () =>
        set({
          saveData: null,
          logMessages: [],
          activeDialogueId: null,
          activeDialogueNodeId: null,
          activeShopId: null,
          activeContainerId: null,
        }),
      startDialogue: (dialogueId, startNodeId) =>
        set({
          activeDialogueId: dialogueId,
          activeDialogueNodeId: startNodeId,
        }),
      advanceDialogue: (nextNodeId) =>
        set((state) => {
          if (!nextNodeId) {
            return { activeDialogueId: null, activeDialogueNodeId: null };
          }
          return { activeDialogueNodeId: nextNodeId };
        }),
      endDialogue: () =>
        set({ activeDialogueId: null, activeDialogueNodeId: null }),
      setQuestState: (questId, questState) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              quests: {
                ...state.saveData.quests,
                [questId]: questState,
              },
            },
          };
        }),
      setFlag: (flagId, value) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              flags: { ...state.saveData.flags, [flagId]: value },
            },
          };
        }),
      updateEntityState: (entityId, updates) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              entity_states: {
                ...state.saveData.entity_states,
                [entityId]: {
                  ...(state.saveData.entity_states?.[entityId] || {}),
                  ...updates,
                },
              },
            },
          };
        }),
      updatePlayerStats: (updates) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              playerStats: { ...state.saveData.playerStats, ...updates },
            },
          };
        }),
      addPartyMember: (entityId) =>
        set((state) => {
          if (!state.saveData) return state;
          const party = state.saveData.party_members || [];
          if (party.includes(entityId)) return state;
          return {
            saveData: {
              ...state.saveData,
              party_members: [...party, entityId],
            },
          };
        }),
      markDocumentRead: (documentId) =>
        set((state) => {
          if (!state.saveData) return state;
          const current = state.saveData.read_documents || [];
          if (current.includes(documentId)) return state;
          return {
            saveData: { ...state.saveData, read_documents: [...current, documentId] },
          };
        }),
      markCellsExplored: (mapId, cellKeys) =>
        set((state) => {
          if (!state.saveData || cellKeys.length === 0) return state;
          const existing = state.saveData.explored_cells?.[mapId] || [];
          const merged = new Set(existing);
          let added = false;
          for (const key of cellKeys) {
            if (!merged.has(key)) {
              merged.add(key);
              added = true;
            }
          }
          if (!added) return state; // nothing new → no re-render
          return {
            saveData: {
              ...state.saveData,
              explored_cells: {
                ...(state.saveData.explored_cells || {}),
                [mapId]: [...merged],
              },
            },
          };
        }),
      removePartyMember: (entityId) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              party_members: (state.saveData.party_members || []).filter(
                (id) => id !== entityId,
              ),
            },
          };
        }),
      startCombat: (queue) =>
        set((state) => {
          if (!state.saveData || queue.length === 0) return state;
          return {
            saveData: {
              ...state.saveData,
              in_combat: true,
              combat_queue: queue,
              active_turn_id: queue[0],
              combat_xp_pool: 0,
            },
          };
        }),
      advanceTurn: () =>
        set((state) => {
          const save = state.saveData;
          if (!save || !save.in_combat) return state;
          const queue = save.combat_queue || [];
          if (queue.length === 0) return state;

          const isAlive = (id: string) => {
            if (id === "player") return save.playerStats.hp > 0;
            const est = (save.entity_states || {})[id];
            return !est?.dead && !est?.hidden;
          };

          const currentIndex = queue.indexOf(save.active_turn_id || "");
          for (let step = 1; step <= queue.length; step += 1) {
            const candidate = queue[(currentIndex + step) % queue.length];
            if (isAlive(candidate)) {
              return {
                saveData: { ...save, active_turn_id: candidate },
              };
            }
          }
          return { saveData: { ...save, active_turn_id: "player" } };
        }),
      endCombat: (partyIds) => {
        const state = get();
        const save = state.saveData;
        if (!save) return null;
        let result: ExperienceGrantResult | null = null;
        set((currentState) => {
          const currentSave = currentState.saveData;
          if (!currentSave) return currentState;
          // Party members shed their combat position and stand back up.
          const entityStates = { ...(currentSave.entity_states || {}) };
          partyIds.forEach((id) => {
            const est = entityStates[id];
            if (!est) return;
            const { cell: _cell, ...rest } = est;
            entityStates[id] = {
              ...rest,
              dead: false,
              hp: Math.max(1, est.hp ?? 1),
            };
          });
          const xpPool = getCombatXpPool(currentSave);
          let nextSave: PlaySave = {
            ...currentSave,
            in_combat: false,
            combat_queue: [],
            active_turn_id: "player",
            entity_states: entityStates,
            combat_xp_pool: 0,
          };
          if (xpPool > 0) {
            const granted = grantExperienceToSave(nextSave, xpPool);
            nextSave = { ...granted.save, combat_xp_pool: 0 };
            result = granted.result;
          }
          return {
            saveData: nextSave,
          };
        });
        return result;
      },
      extendCombatQueue: (ids) =>
        set((state) => {
          const save = state.saveData;
          if (!save || !save.in_combat || ids.length === 0) return state;
          const queue = save.combat_queue || [];
          const newcomers = ids.filter((id) => !queue.includes(id));
          if (newcomers.length === 0) return state;
          return {
            saveData: { ...save, combat_queue: [...queue, ...newcomers] },
          };
        }),
      queueCombatExperience: (amount) =>
        set((state) => {
          if (!state.saveData || amount <= 0) return state;
          return {
            saveData: {
              ...state.saveData,
              combat_xp_pool:
                getCombatXpPool(state.saveData) + Math.max(0, Math.floor(amount)),
            },
          };
        }),
      loadMap: (mapId, cell, facing) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              current_map_id: mapId,
              player: {
                cell,
                facing,
                sprite_id: state.saveData.player.sprite_id,
              },
            },
            logMessages: [...state.logMessages, `Entered map: ${mapId}`].slice(-20),
          };
        }),
      giveItem: (itemId, amount) =>
        set((state) => {
          if (!state.saveData) return state;
          const inventory = [...(state.saveData.inventory || [])];
          const existing = inventory.find((i) => i.id === itemId);
          if (existing) {
            existing.count += amount;
          } else {
            inventory.push({ id: itemId, count: amount });
          }
          return { saveData: { ...state.saveData, inventory } };
        }),
      removeItem: (itemId, amount) =>
        set((state) => {
          if (!state.saveData) return state;
          const inventory = (state.saveData.inventory || [])
            .map((i) => {
              if (i.id === itemId) {
                return { ...i, count: Math.max(0, i.count - amount) };
              }
              return i;
            })
            .filter((i) => i.count > 0);
          return { saveData: { ...state.saveData, inventory } };
        }),
      updateMoney: (amount) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: {
              ...state.saveData,
              money: Math.max(0, (state.saveData.money || 0) + amount),
            },
          };
        }),
      openShop: (shopId) => set({ activeShopId: shopId }),
      closeShop: () => set({ activeShopId: null }),
      takeAuthoredWorldItem: (mapId, placementId) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: withMapDelta(state.saveData, mapId, (delta) => ({
              ...delta,
              taken_items: [...(delta.taken_items || []), placementId],
            })),
          };
        }),
      addDroppedItem: (mapId, dropped) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: withMapDelta(state.saveData, mapId, (delta) => ({
              ...delta,
              dropped_items: [...(delta.dropped_items || []), dropped],
            })),
          };
        }),
      removeDroppedItem: (mapId, droppedId) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: withMapDelta(state.saveData, mapId, (delta) => ({
              ...delta,
              dropped_items: (delta.dropped_items || []).filter(
                (d) => d.id !== droppedId,
              ),
            })),
          };
        }),
      updateContainerState: (mapId, containerId, updates) =>
        set((state) => {
          if (!state.saveData) return state;
          return {
            saveData: withMapDelta(state.saveData, mapId, (delta) => ({
              ...delta,
              containers: {
                ...(delta.containers || {}),
                [containerId]: {
                  ...(delta.containers?.[containerId] || {}),
                  ...updates,
                },
              },
            })),
          };
        }),
      openContainer: (containerId) => set({ activeContainerId: containerId }),
      closeContainer: () => set({ activeContainerId: null }),
      advanceClock: (minutes) =>
        set((state) => {
          if (!state.saveData || minutes <= 0) return state;
          return {
            saveData: {
              ...state.saveData,
              clock_minutes: (state.saveData.clock_minutes || 0) + minutes,
            },
          };
        }),
      adjustFactionRep: (factionId, amount) =>
        set((state) => {
          if (!state.saveData) return state;
          const current = state.saveData.faction_rep?.[factionId] ?? 0;
          return {
            saveData: {
              ...state.saveData,
              faction_rep: {
                ...(state.saveData.faction_rep || {}),
                [factionId]: current + amount,
              },
            },
          };
        }),
      modifyPlayerStats: (deltas) =>
        set((state) => {
          if (!state.saveData) return state;
          const stats = { ...state.saveData.playerStats } as Record<string, number>;
          Object.entries(deltas).forEach(([key, delta]) => {
            stats[key] = (stats[key] ?? 0) + delta;
          });
          // Floors so a harsh class trade can't brick a run.
          stats.max_hp = Math.max(1, stats.max_hp);
          stats.max_mp = Math.max(0, stats.max_mp);
          stats.attack = Math.max(0, stats.attack);
          stats.defense = Math.max(0, stats.defense);
          stats.speed = Math.max(1, stats.speed);
          // Raising a maximum grants the difference immediately; lowering
          // one clamps the current value down to it.
          if (deltas.max_hp) stats.hp = Math.max(1, Math.min(stats.max_hp, stats.hp + Math.max(0, deltas.max_hp)));
          else stats.hp = Math.min(stats.max_hp, stats.hp);
          if (deltas.max_mp) stats.mp = Math.max(0, Math.min(stats.max_mp, stats.mp + Math.max(0, deltas.max_mp)));
          else stats.mp = Math.min(stats.max_mp, stats.mp);
          return {
            saveData: {
              ...state.saveData,
              playerStats: stats as PlaySave["playerStats"],
            },
          };
        }),
      grantExperience: (amount) => {
        const save = get().saveData;
        if (!save || amount <= 0) return null;
        const granted = grantExperienceToSave(save, amount);
        set({ saveData: granted.save });
        return granted.result;
      },
      chooseLevelUpStat: (stat) => {
        const save = get().saveData;
        if (!save) return false;
        const applied = applyLevelUpChoiceToSave(save, stat);
        if (!applied.applied) return false;
        set({ saveData: applied.save });
        return true;
      },
      learnSkill: (skillId) =>
        set((state) => {
          if (!state.saveData) return state;
          if ((state.saveData.known_skills || []).includes(skillId)) return state;
          return {
            saveData: {
              ...state.saveData,
              known_skills: [...(state.saveData.known_skills || []), skillId],
            },
          };
        }),
      saveToSlot: (slot) => {
        const save = get().saveData;
        if (!save) return false;
        const payload = buildSaveSlotPayload(slot, save);
        try {
          localStorage.setItem(slotKey(slot), JSON.stringify(payload));
          return true;
        } catch (err) {
          console.error("Failed to write save slot", err);
          return false;
        }
      },
      loadFromSlot: (slot, expectedVersion) => {
        const data = readSaveSlot(slot);
        if (!data?.saveData) return "That save slot is empty.";
        if (data.saveData.package_version !== expectedVersion) {
          return "That save belongs to another package version.";
        }
        set({
          saveData: normalizeProgression(data.saveData),
          activeDialogueId: null,
          activeDialogueNodeId: null,
          activeShopId: null,
          activeContainerId: null,
          logMessages: ["Save restored."],
        });
        return null;
      },
    }),
    {
      name: "crpg-run-save",
      merge: (persisted, current) => {
        const saved = persisted as Partial<PlayState> | undefined;
        return {
          ...current,
          ...(saved || {}),
          // engineEvents are transient debug data — never restore them.
          engineEvents: [],
          saveData: saved?.saveData
            ? normalizeRuntimeSave(saved.saveData)
            : (saved?.saveData ?? current.saveData),
        };
      },
    },
  ),
);
