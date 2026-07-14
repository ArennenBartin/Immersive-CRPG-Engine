import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useEngineStore } from "../store/engineStore";
import {
  dispatchV1MoveEntity,
  dispatchV1Wait,
  dispatchV1ChangeMap,
  dispatchV1FireTrigger,
  dispatchV1OpenContainer,
  dispatchV1StowInContainer,
  dispatchV1TakeAllFromContainer,
  dispatchV1TakeFromContainer,
  dispatchV1UnlockContainer,
  dispatchV1TakeItem,
  dispatchV1DropItem,
  dispatchV1OpenDoor,
  dispatchV1PushObject,
  dispatchV1SetSwitch,
  dispatchV1SetQuest,
  dispatchV1GiveItem,
  dispatchV1RemoveItem,
  dispatchV1GiveCurrency,
  dispatchV1RemoveCurrency,
  dispatchV1AdjustFactionRep,
  dispatchV1ReadDocument,
  dispatchV1LearnSkill,
  dispatchV1CompleteQuestObjective,
  dispatchV1SetPlayerPosition,
  dispatchV1TeleportPlayer,
  dispatchV1SetEntityPosition,
  dispatchV1SetPlayerSprite,
  dispatchV1HealPlayer,
  dispatchV1RestoreParty,
  dispatchV1AddPartyMember,
  dispatchV1RemovePartyMember,
  dispatchV1AdvanceClock,
  dispatchV1ModifyPlayerStats,
  dispatchV1SetEntityHidden,
  dispatchV1RecordBark,
  dispatchV1GameEnd,
  dispatchV1ChooseDialogueOption,
  dispatchV1AttendNode,
  dispatchV1BuyShopItem,
  dispatchV1SellInventoryItem,
  dispatchV1MeleeAttack,
  dispatchV1CastSkill,
  dispatchV1StartProcess,
  dispatchV1InterruptProcess,
  dispatchV1AdvanceProcesses,
  dispatchV1UpdateCombatSession,
  dispatchV1AdvanceCombatTurn,
  dispatchV1EmitSound,
  dispatchV1EnemyPulse,
  getV1NearbyHostiles,
  getV1ControlledCombatant,
  getV1SkillTargetCells,
  getV1SkillRangeCells,
  activeReactiveTaskForActor,
  advanceImmersivePerceptionForSave,
  advanceImmersiveWorldStateForSave,
  applyImmersiveCombatAttackToSave,
  applyImmersiveCombatForcedMovementToSave,
  applyImmersiveGlobalVerbToSave,
  applyChemistrySpillToSave,
  applyChemistryVerbToSave,
  advanceChemistryForSave,
  initializeAuthoredChemistryForSave,
  attendAlderamonticoActor,
  advanceAlderamonticoActorFromPhysical,
  advanceAlderamonticoEmotionalDecayForSave,
  advanceAlderamonticoGridRegionsForSave,
  applyAlderamonticoEmotionalVerbToSave,
  applyImmersiveOverwatchToMovementSave,
  applyImmersivePlayerOverwatchToSave,
  buildAlderamonticoConditionReadout,
  closeAlderamonticoAttendNode,
  ensureAlderamonticoActorState,
  entityEmotionalSeed,
  fineCoordKey,
  ENERGY_PER_FINE_STEP,
  FINE_HALF_EXTENT,
  FINE_PER_MACRO,
  actorFootprintCells,
  areAdjacentMacro,
  expandGamePackageToFine,
  expandMapToFine,
  isLargeAuthoredMap,
  materializeLargeMapWindow,
  footprintContainsCell,
  footprintIntersectsLeadingEdge,
  footprintsOverlap,
  macroKeyOfFine,
  sameMacroCoord,
  scaleMacroDistanceToFine,
  getAlderamonticoEmotionalVerb,
  isAlderamonticoEmotionalVerb,
  isChemistryVerb,
  decideEntityAction,
  reactiveSignalFromTask,
  recordEntityBehaviorDecision,
  resolveAlderamonticoBehavior,
  createImmersiveCombatTacticalSnapshotFromV1,
  createImmersivePerceptionSnapshotFromV1,
  evaluateImmersiveWorldStateForSave,
  type AlderamonticoConditionReadout,
  type AlderamonticoAttendNode,
  type AlderamonticoAttendReading,
  type BehaviorCommitmentRecord,
  type BehaviorReactiveSignal,
  type ChemActorExposure,
  type ChemReactionRecord,
  type ImmersiveGlobalVerbKind,
  tickStatuses,
  statModifiers,
  getStatusDef,
  buildConditionContext,
  getAvailableShopStock,
  getVisibleDialogueOptions,
  getClockPhaseId,
  CLOCK_PHASE_LABELS,
  findEligibleSwitchChangeTriggers,
  isTriggerEligible,
  isMapExitEligible,
  selectEligibleBark,
  shouldRunCutsceneBranch,
  findCutsceneLabelIndex,
  type CombatAttackOutcome,
  type CombatSessionUpdateOutcome,
  type EnemyTurnOutcome,
  type SkillCastOutcome,
  type StatusInstance,
  type DispatchResult,
  type ImmersiveAlertnessState,
  type ImmersiveCombatAttackResult,
  type ImmersiveCombatForcedMovementResult,
  type ImmersiveStage4PerceptionAdvanceResult,
  type ImmersiveStage4PerceptionSnapshot,
  type ImmersiveStage6TacticalSnapshot,
  type ImmersiveGlobalVerbOptions,
  type ImmersiveGlobalVerbResult,
  type ImmersiveWorldStateAdvanceResult,
  type ImmersiveWorldStateEvaluation,
  type ImmersiveWorldStateGateResult,
  type EntityBehaviorIntentRecord,
} from "../engine-core";
import {
  usePlayStore,
  SAVE_SLOT_COUNT,
  readSaveSlot,
  deleteSaveSlot,
} from "../store/playStore";
import { GameRenderer3D } from "./GameRenderer3D";
import {
  AdaptiveQualityProbe,
  BlackStarLightRig,
  getInitialPlayCameraPosition,
  ISO_CAMERA_BASE_AZIMUTH,
  IsometricCameraRig,
  PLAY_CAMERA_PROFILES,
  type PlayCameraMode,
} from "./PlayScene3D";
import { ScreenFX } from "./ScreenFX";
import { SpatialInventoryGrid } from "./SpatialInventoryGrid";
import {
  PLAYMODE_VERB_PAST_TENSE,
  type PlayModeWheelVerbKind,
} from "../utils/playModeCommands";
import {
  ABILITY_BAR_PAGE_SIZE,
  ABILITY_PAGE_LABELS,
  ABILITY_PAGE_ORDER,
  type AbilityPageId,
  type RuntimeAbilityActionId,
} from "../data/defaultAbilities";
import {
  MapData,
  CellData,
  ContainerPlacementData,
  ObjectPlacementData,
  ScheduleEntryData,
  GamePackage,
  SkillData,
  SimulationWorkstationData,
} from "../schema/game";
import { ActorPhysicalStateRecord, InventoryLayoutEntry, MapDelta, PlaySave, SimulationProcessRecord } from "../schema/save";
import {
  playMusic,
  playSound,
  stopMusic,
  getCurrentMusicUrl,
} from "../utils/audioManager";
import { useFxStore } from "../store/fxStore";
import {
  SCREEN_VISUAL_PRESETS,
  VISUAL_SCALE_PRESET_ORDER,
  useVisualSettingsStore,
  type VisualScalePreset,
} from "../store/visualSettingsStore";
import {
  THREAT_RADIUS,
  CHASE_RADIUS,
} from "../utils/combat";
import {
  LEVEL_UP_CHOICES,
  getEnemyXpReward,
  getPendingLevelUps,
  getSaveExperience,
  getSaveLevel,
  getXpRemainingForNextLevel,
  getXpRequiredForLevel,
} from "../utils/leveling";
import type { ExperienceGrantResult, LevelUpStat } from "../utils/leveling";
import {
  applyPlacementDeltas,
  getPlacementFootprint,
  isPushableObject,
  placementHasCollision,
  placementOccupiesCell,
} from "../utils/objectFootprint";
import { getJamEngineVisualHeight } from "../utils/legacyJamCompatibility";
import {
  doorPlacementKey,
  isBuildingDoorPlacement,
  isDoorPlacementOpen,
} from "../utils/doorPlacement";
import { entityPlacementStateKey } from "../utils/entityState";
import { resolvePlayModeMap } from "../utils/playModeMap";
import { logicalCellToWorld } from "../utils/renderSpace";
import {
  Briefcase,
  BookOpen,
  CheckCircle2,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Hand,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  Save,
  Swords,
  Trash2,
  Heart,
  Zap,
  Droplet,
  AlertTriangle,
  Thermometer,
  Utensils,
  SlidersHorizontal,
  Wand2,
  MoveRight,
  Eye,
  Hammer,
  Crosshair,
} from "lucide-react";

const arrayOrEmpty = <T,>(value: T[] | undefined): T[] =>
  Array.isArray(value) ? value : [];

const withRuntimeMapArrays = (map: MapData): MapData => {
  const partial = map as Partial<MapData>;
  return {
    ...map,
    spawns: arrayOrEmpty(partial.spawns),
    cells: arrayOrEmpty(partial.cells),
    props: arrayOrEmpty(partial.props),
    custom_object_placements: arrayOrEmpty(partial.custom_object_placements),
    entity_placements: arrayOrEmpty(partial.entity_placements),
    item_placements: arrayOrEmpty(partial.item_placements),
    container_placements: arrayOrEmpty(partial.container_placements),
    triggers: arrayOrEmpty(partial.triggers),
    exits: arrayOrEmpty(partial.exits),
    regions: arrayOrEmpty(partial.regions),
  };
};

const withRuntimePackageArrays = (pkg: GamePackage): GamePackage => {
  const partial = pkg as Partial<GamePackage>;
  return {
    ...pkg,
    metadata: partial.metadata || {
      title: "CRPG Engine",
      version: "1.0.0",
      start_map_id: "map_overworld",
      start_spawn_id: "spawn_world_start",
    },
    settings: partial.settings || {},
    maps: arrayOrEmpty(partial.maps).map(withRuntimeMapArrays),
    object_library: arrayOrEmpty(partial.object_library),
    sprite_library: arrayOrEmpty(partial.sprite_library),
    entities: arrayOrEmpty(partial.entities),
    dialogue: arrayOrEmpty(partial.dialogue),
    documents: arrayOrEmpty(partial.documents),
    quests: arrayOrEmpty(partial.quests),
    cutscenes: arrayOrEmpty(partial.cutscenes),
    switches: partial.switches || {},
    items: arrayOrEmpty(partial.items),
    abilities: arrayOrEmpty(partial.abilities),
    encounters: arrayOrEmpty(partial.encounters),
    shops: arrayOrEmpty(partial.shops),
    factions: arrayOrEmpty(partial.factions),
    endings: arrayOrEmpty(partial.endings),
    barks: arrayOrEmpty(partial.barks),
    object_blueprints: arrayOrEmpty(partial.object_blueprints),
    simulation_materials: arrayOrEmpty(partial.simulation_materials),
    simulation_processes: arrayOrEmpty(partial.simulation_processes),
    simulation_workstations: arrayOrEmpty(partial.simulation_workstations),
    validators: partial.validators || {},
  };
};

// The runtime plays the FINE world: the authored macro package expands ×
// FINE_PER_MACRO at load (cells, placements, triggers, exits, skill ranges).
// Memoized on the raw store package so per-dispatch calls stay cheap.
let fineRuntimeSource: GamePackage | undefined;
let fineRuntimeExpanded: GamePackage | undefined;
const fineRuntimeMapWindows = new Map<string, MapData>();
const getRuntimeGamePackage = () => {
  const raw = useEngineStore.getState().gamePackage;
  if (fineRuntimeSource !== raw || !fineRuntimeExpanded) {
    fineRuntimeSource = raw;
    fineRuntimeMapWindows.clear();
    fineRuntimeExpanded = expandGamePackageToFine(withRuntimePackageArrays(raw));
  }
  return fineRuntimeExpanded;
};

const registerRuntimeMapWindow = (map: MapData) => {
  fineRuntimeMapWindows.set(map.id, map);
  if (!fineRuntimeExpanded) return;
  fineRuntimeExpanded = {
    ...fineRuntimeExpanded,
    maps: fineRuntimeExpanded.maps.map((candidate) => candidate.id === map.id ? map : candidate),
  };
};

const MOVEMENT_REPEAT_START_MS = 105;
// Held-to-move cadence: three fine steps should take roughly one legacy macro
// step. Use 100/ratio instead of 105/ratio so the repeat lands cleanly on a
// 60fps frame cadence instead of aliasing into visible 50ms chunks.
const MOVEMENT_REPEAT_INTERVAL_MS = 100 / FINE_PER_MACRO;
const PLAYER_FOOTSTEP_FINE_STEP_INTERVAL = FINE_PER_MACRO;
// Three held-movement fine steps take about 100 ms. Keep the audio cooldown
// below that cadence so it does not silently turn every third step into every
// sixth step while movement is repeating quickly.
const PLAYER_FOOTSTEP_COOLDOWN_MS = 70;
const COMBAT_ACTOR_SWITCH_INPUT_DELAY_MS = 180;
const PLAY_RENDER_RADIUS = scaleMacroDistanceToFine(20);
const PLAY_NATIVE_DPR = Math.max(
  1,
  typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
);
// Render at native DPR or a modest supersample where there is headroom, while
// keeping the ceiling high enough that character art does not turn soft.
const PLAY_DPR_MAX = Math.max(
  1.5,
  Math.min(PLAY_NATIVE_DPR + 0.25, 2.25),
);
const NPC_SIMULATION_RADIUS = scaleMacroDistanceToFine(16);
const NPC_SCHEDULE_PATH_LIMIT = scaleMacroDistanceToFine(96);
// Shove distance is authored in macro tiles and resolved cell-by-cell in fine
// (§5.4) so a shoved actor drags across fine hazards en route.
const COMBAT_SHOVE_DISTANCE = scaleMacroDistanceToFine(1);

const COMBAT_INTENT_LABELS: Record<string, string> = {
  melee_attack: "Melee",
  ranged_attack: "Ranged",
  advance: "Advance",
  overwatch: "Overwatch",
};

const ALERTNESS_LABELS: Record<ImmersiveAlertnessState, string> = {
  oblivious: "Hidden",
  suspicious: "Suspicious",
  searching: "Searching",
  combat: "Spotted",
};

const ALERTNESS_HUD_STYLES: Record<ImmersiveAlertnessState, string> = {
  oblivious: "border-emerald-700/70 bg-emerald-950/82 text-emerald-100",
  suspicious: "border-amber-700/70 bg-amber-950/82 text-amber-100",
  searching: "border-orange-700/70 bg-orange-950/84 text-orange-100",
  combat: "border-rose-700/75 bg-rose-950/86 text-rose-100",
};

const ALERTNESS_RANK: Record<ImmersiveAlertnessState, number> = {
  oblivious: 0,
  suspicious: 1,
  searching: 2,
  combat: 3,
};

const ALERTNESS_POPUP_STYLE: Record<ImmersiveAlertnessState, { text: string; color: string; sfxRate: number }> = {
  oblivious: { text: "Clear", color: "#86efac", sfxRate: 0.75 },
  suspicious: { text: "?", color: "#facc15", sfxRate: 0.9 },
  searching: { text: "Searching", color: "#fb923c", sfxRate: 1.05 },
  combat: { text: "!", color: "#fb7185", sfxRate: 1.2 },
};

type StealthFeedbackRecord = {
  tick?: number;
  highest_alertness?: ImmersiveAlertnessState;
  visible_to_count?: number;
  alerted_count?: number;
  strongest_score?: number;
};

type SurvivalAxisKey = "hunger" | "thirst" | "fatigue" | "exposure";

const SURVIVAL_AXIS_DEFS: {
  key: SurvivalAxisKey;
  label: string;
  color: string;
  icon: "hunger" | "thirst" | "fatigue" | "exposure";
}[] = [
  { key: "hunger", label: "Hunger", color: "#fbbf24", icon: "hunger" },
  { key: "thirst", label: "Thirst", color: "#38bdf8", icon: "thirst" },
  { key: "fatigue", label: "Fatigue", color: "#c4b5fd", icon: "fatigue" },
  { key: "exposure", label: "Exposure", color: "#fb923c", icon: "exposure" },
];

const WORLD_GATE_STYLES: Record<ImmersiveWorldStateGateResult["severity"], string> = {
  info: "border-emerald-700/75 bg-emerald-950/86 text-emerald-100",
  warning: "border-amber-700/80 bg-amber-950/88 text-amber-100",
  deny: "border-rose-700/85 bg-rose-950/90 text-rose-100",
};

const WORLD_GATE_BLOCK_POPUP: Record<ImmersiveWorldStateGateResult["kind"], string> = {
  region_reputation: "Denied",
  survival: "Crisis",
  passive_check: "Barred",
  inventory_load: "Overloaded",
};
const WORLD_SPATIAL_DENIAL_KINDS = new Set<ImmersiveWorldStateGateResult["kind"]>([
  "region_reputation",
  "passive_check",
]);

const WORKSTATION_ACTION_ENERGY_COST = 1000;

const getWorldGateBlock = (
  evaluation: ImmersiveWorldStateEvaluation | null | undefined,
  action: "move" | "verb" | "act",
  verb?: PlayModeWheelVerbKind,
) => {
  const denials = evaluation?.denials || [];
  if (!denials.length) return null;
  if (action === "verb" && verb === "drop" && denials.every((gate) => gate.kind === "inventory_load")) {
    return null;
  }
  return denials[0] || null;
};

const getReachableWorkstation = (
  gamePackage: GamePackage,
  mapId: string,
  cells: [number, number][],
): SimulationWorkstationData | undefined =>
  gamePackage.simulation_workstations.find(
    (station) =>
      station.map_id === mapId &&
      // Workstations are macro-tile interactions: standing in or facing the
      // station's tile reaches it (station.cell is the tile's center fine cell).
      cells.some((cell) => sameMacroCoord([station.cell[0], station.cell[1]], cell)),
  );

const getActiveProcessForWorkstation = (
  save: PlaySave,
  mapId: string,
  workstationId: string,
): SimulationProcessRecord | undefined =>
  (save.map_deltas?.[mapId]?.simulation_processes || []).find(
    (process) =>
      process.workstation_id === workstationId &&
      (process.state === "active" || process.state === "queued"),
  );

type CombatAttackReadout = {
  targetName: string;
  baseDamage: number;
  estimatedDamage: number;
  coverLabel?: string;
  coverReduction: number;
  flanked: boolean;
  facingBonus: number;
  heightDelta: number;
  heightBonus: number;
};

const combatCellsEqual = (a: [number, number], b: [number, number]) =>
  a[0] === b[0] && a[1] === b[1];

const combatPrimaryDirection = (from: [number, number], to: [number, number]): [number, number] => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) return [Math.sign(dx), 0];
  if (dz !== 0) return [0, Math.sign(dz)];
  return [0, -1];
};

// ── Ambient barks ────────────────────────────────────────────────────────────
// Two NPCs bark at each other when within this Manhattan distance, but only if
// the player is close enough to overhear (earshot). Each exchange holds a
// cooldown in in-game minutes so the same gossip doesn't loop, plus a real-time
// floor so back-to-back player turns don't stack exchanges on top of each other.
const BARK_TALK_RADIUS = 2;
const BARK_EARSHOT = 9;
const BARK_DEFAULT_COOLDOWN_MIN = 480;
const BARK_MIN_REAL_INTERVAL_MS = 5000;

const MOVEMENT_COMMAND_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "w",
  "a",
  "s",
  "d",
  "z",
  ".",
]);

const isMovementCommandKey = (key: string) => MOVEMENT_COMMAND_KEYS.has(key);
const isCombatCommandKey = (key: string) =>
  isMovementCommandKey(key) || key === " " || key === "enter" || /^[1-6]$/.test(key);
const inputNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

type DialoguePortraitConfig = {
  id: string;
  src: string;
  alt: string;
  side: "left" | "right";
  active: boolean;
  flipX?: boolean;
};

type DialoguePortraitSettings = Record<
  string,
  {
    src?: string;
    alt?: string;
    side?: "left" | "right";
    flipX?: boolean;
  }
>;

const NON_PERSON_DIALOGUE_SPEAKERS = new Set([
  "scene",
  "system",
  "notice",
]);

const playCellKey = fineCoordKey;
const pathCellKey = fineCoordKey;

// Hotbar accents per skill element.
const ELEMENT_STYLES: Record<string, string> = {
  fire: "border-orange-500/70 text-orange-200",
  shock: "border-yellow-400/70 text-yellow-100",
  water: "border-sky-500/70 text-sky-200",
  cold: "border-cyan-400/70 text-cyan-100",
  poison: "border-green-500/70 text-green-200",
  physical: "border-stone-400/70 text-stone-200",
  none: "border-indigo-500/70 text-indigo-200",
};

const PLAYMODE_OBJECT_VERBS = new Set<PlayModeWheelVerbKind>([
  "push",
  "pull",
  "throw",
  "stack",
  "break",
]);

const PLAYMODE_DIRECT_CELL_VERBS = new Set<PlayModeWheelVerbKind>([
  "burn",
  "douse",
  "freeze",
  "wet",
  "electrify",
  "foam",
  "climb",
]);

const PLAYMODE_BAR_VERB_ACTIONS = new Set<string>([
  "drop",
  "burn",
  "douse",
  "freeze",
  "wet",
  "electrify",
  "foam",
  "push",
  "pull",
  "throw",
  "break",
  "stack",
  "climb",
  "yell",
  "console",
]);

const isPlayModeVerbAction = (action?: string): action is PlayModeWheelVerbKind =>
  Boolean(action && PLAYMODE_BAR_VERB_ACTIONS.has(action));

type AbilityBarEntry = {
  ability: SkillData;
  disabled: boolean;
  disabledReason?: string;
  costLabel?: string;
};

function AbilityIcon({ ability }: { ability: SkillData }) {
  const action = ability.runtime_action as RuntimeAbilityActionId | undefined;
  const icon = ability.icon || action || ability.element;
  if (action === "basic_attack" || icon === "swords") return <Swords className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "shove" || action === "push" || icon === "move-right") return <MoveRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "overwatch" || action === "throw" || icon === "crosshair") return <Crosshair className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "wait" || icon === "clock") return <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "attend" || icon === "eye") return <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "drop" || icon === "briefcase") return <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "break" || icon === "hammer") return <Hammer className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "douse" || action === "wet" || icon === "droplet") return <Droplet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "electrify" || icon === "zap") return <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "burn" || action === "freeze" || icon === "thermometer") return <Thermometer className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "yell" || icon === "message-circle") return <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (action === "console" || icon === "heart") return <Heart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  if (icon === "chevron-up") return <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
  return <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
}

const abilityPageFor = (ability: SkillData): AbilityPageId => {
  if (ABILITY_PAGE_ORDER.includes(ability.ability_page as AbilityPageId)) return ability.ability_page as AbilityPageId;
  if (ability.ability_kind === "world_verb" && ["burn", "douse", "freeze", "wet", "electrify", "foam"].includes(String(ability.runtime_action))) {
    return "elemental";
  }
  if (ability.ability_kind === "world_verb") return "physical";
  if (ability.ability_kind === "utility_action") return String(ability.runtime_action) === "attend" ? "social" : "utility";
  if (["fire", "shock", "water", "cold", "poison"].includes(ability.element)) return "elemental";
  return "combat";
};

const cardinalDirectionFromTo = (
  from: [number, number],
  to: [number, number],
): [number, number] | null => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (dx !== 0 && dz !== 0) return null;
  if (dx === 0 && dz === 0) return null;
  return [Math.sign(dx), Math.sign(dz)];
};

const manhattanCells = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const PHYSICAL_AXIS_DEFS: {
  key: "temperature" | "wetness" | "heat" | "chill" | "charge" | "coating" | "toxicity";
  label: string;
  color: string;
  value: (state: ActorPhysicalStateRecord) => number;
}[] = [
  {
    key: "temperature",
    label: "Temp",
    color: "#fb923c",
    value: (state) => Math.max(0, Math.min(1, (state.temperature + 10) / 140)),
  },
  { key: "wetness", label: "Wet", color: "#38bdf8", value: (state) => state.wetness },
  { key: "heat", label: "Heat", color: "#f97316", value: (state) => state.heat },
  { key: "chill", label: "Chill", color: "#67e8f9", value: (state) => state.chill },
  { key: "charge", label: "Charge", color: "#fde047", value: (state) => state.charge },
  { key: "coating", label: "Coat", color: "#e2e8f0", value: (state) => state.coating },
  { key: "toxicity", label: "Toxin", color: "#86efac", value: (state) => state.toxicity },
];

const EMOTIONAL_AXIS_DEFS: {
  key: "valence" | "arousal" | "grief" | "reverence" | "attachment";
  label: string;
  color: string;
}[] = [
  { key: "valence", label: "Val", color: "#fbbf24" },
  { key: "arousal", label: "Arousal", color: "#fb7185" },
  { key: "grief", label: "Grief", color: "#60a5fa" },
  { key: "reverence", label: "Rev", color: "#34d399" },
  { key: "attachment", label: "Attach", color: "#f472b6" },
];

const physicalStateIsActive = (state: ActorPhysicalStateRecord | undefined) =>
  Boolean(
    state &&
      (
        state.labels.length > 0 ||
        state.wetness > 0.05 ||
        state.heat > 0.05 ||
        state.chill > 0.05 ||
        state.charge > 0.05 ||
        state.coating > 0.05 ||
        state.toxicity > 0.05
      ),
  );

type VerbFeedbackTone =
  | "fire"
  | "water"
  | "ice"
  | "shock"
  | "foam"
  | "drop"
  | "neutral"
  | "fail";

type VerbFeedback = {
  id: number;
  title: string;
  detail: string;
  tone: VerbFeedbackTone;
  cell: [number, number];
};

const IMMERSIVE_VERB_FEEDBACK_MS = 2200;

const VERB_FEEDBACK_STYLES: Record<VerbFeedbackTone, string> = {
  fire: "border-orange-500/80 bg-orange-950/88 text-orange-100",
  water: "border-sky-400/80 bg-sky-950/88 text-sky-100",
  ice: "border-cyan-300/80 bg-cyan-950/88 text-cyan-100",
  shock: "border-yellow-300/80 bg-yellow-950/88 text-yellow-100",
  foam: "border-teal-200/80 bg-teal-950/88 text-teal-50",
  drop: "border-amber-400/80 bg-amber-950/88 text-amber-100",
  neutral: "border-violet-400/80 bg-violet-950/88 text-violet-100",
  fail: "border-red-400/80 bg-red-950/90 text-red-100",
};

const IMMERSIVE_VERB_PRESENTATION: Partial<Record<
  PlayModeWheelVerbKind,
  {
    title: string;
    popup: string;
    color: string;
    tone: VerbFeedbackTone;
    sfx: string;
    volume: number;
    playbackRate?: number;
    pulse: number;
  }
>> = {
  drop: {
    title: "Dropped",
    popup: "Dropped",
    color: "#fbbf24",
    tone: "drop",
    sfx: "item_pickup",
    volume: 0.34,
    pulse: 0.25,
  },
  burn: {
    title: "Fire took",
    popup: "Burn",
    color: "#fb923c",
    tone: "fire",
    sfx: "spell_cast",
    volume: 0.48,
    playbackRate: 0.88,
    pulse: 0.68,
  },
  douse: {
    title: "Water hit",
    popup: "Doused",
    color: "#7dd3fc",
    tone: "water",
    sfx: "spell_hit",
    volume: 0.42,
    playbackRate: 0.94,
    pulse: 0.48,
  },
  freeze: {
    title: "Cold snapped",
    popup: "Freeze",
    color: "#bae6fd",
    tone: "ice",
    sfx: "spell_cast",
    volume: 0.42,
    playbackRate: 1.22,
    pulse: 0.52,
  },
  wet: {
    title: "Ground soaked",
    popup: "Wet",
    color: "#38bdf8",
    tone: "water",
    sfx: "spell_hit",
    volume: 0.34,
    playbackRate: 0.86,
    pulse: 0.38,
  },
  electrify: {
    title: "Charge arced",
    popup: "Shock",
    color: "#fde047",
    tone: "shock",
    sfx: "spell_hit",
    volume: 0.48,
    playbackRate: 1.36,
    pulse: 0.72,
  },
  foam: {
    title: "Foam bloomed",
    popup: "Foam",
    color: "#ccfbf1",
    tone: "foam",
    sfx: "spell_cast",
    volume: 0.44,
    playbackRate: 0.76,
    pulse: 0.58,
  },
  push: {
    title: "Object pushed",
    popup: "Push",
    color: "#fcd34d",
    tone: "neutral",
    sfx: "bump",
    volume: 0.32,
    pulse: 0.18,
  },
  pull: {
    title: "Object pulled",
    popup: "Pull",
    color: "#fcd34d",
    tone: "neutral",
    sfx: "bump",
    volume: 0.3,
    pulse: 0.16,
  },
  throw: {
    title: "Object thrown",
    popup: "Throw",
    color: "#fbbf24",
    tone: "neutral",
    sfx: "bump",
    volume: 0.4,
    pulse: 0.32,
  },
  stack: {
    title: "Object stacked",
    popup: "Stack",
    color: "#fde68a",
    tone: "neutral",
    sfx: "bump",
    volume: 0.28,
    pulse: 0.18,
  },
  climb: {
    title: "Support marked",
    popup: "Climb",
    color: "#bef264",
    tone: "neutral",
    sfx: "bump",
    volume: 0.22,
    pulse: 0.14,
  },
  break: {
    title: "Object broken",
    popup: "Break",
    color: "#fb7185",
    tone: "neutral",
    sfx: "bump",
    volume: 0.42,
    pulse: 0.36,
  },
  yell: {
    title: "Voice raised",
    popup: "Yell",
    color: "#fda4af",
    tone: "neutral",
    sfx: "warning",
    volume: 0.4,
    playbackRate: 1.2,
    pulse: 0.4,
  },
  console: {
    title: "Consoled",
    popup: "Console",
    color: "#a5b4fc",
    tone: "neutral",
    sfx: "heal",
    volume: 0.32,
    playbackRate: 0.9,
    pulse: 0.2,
  },
};

const IMMERSIVE_REACTION_LABELS: Record<string, string> = {
  water_extinguishes_fire_to_steam: "Steam bloom",
  cold_freezes_water: "Ice formed",
  fire_ignites_oil: "Oil ignited",
  electricity_conducts_water: "Shock chained",
  electricity_chains_through_wet_cell: "Shock chained",
  fire_spreads_to_flammable_neighbor: "Fire spread",
  fire_vaporizes_poison: "Poison gas",
  smoke_diffuses_to_neighbor: "Smoke drifted",
  poison_gas_diffuses_to_neighbor: "Gas drifted",
  acid_corroded_material: "Corrosion",
};

const uniqueShortList = (values: string[], limit = 3) => {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length <= limit) return unique.join(", ");
  return `${unique.slice(0, limit).join(", ")} +${unique.length - limit}`;
};

const titleCaseEffect = (value: string) =>
  value
    .replace(/^global_verb_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const reactionSummaryForVerbResult = (result: ImmersiveGlobalVerbResult) =>
  uniqueShortList(
    result.reactions.map((reaction) =>
      IMMERSIVE_REACTION_LABELS[reaction.rule_id] || titleCaseEffect(reaction.rule_id),
    ),
  );

const effectCellForVerbResult = (result: ImmersiveGlobalVerbResult): [number, number] => {
  const effectCell = result.world_facts[0]?.direct_consequences?.effect_cell;
  if (
    Array.isArray(effectCell) &&
    typeof effectCell[0] === "number" &&
    typeof effectCell[1] === "number"
  ) {
    return [effectCell[0], effectCell[1]];
  }
  return result.verb.targetCell || result.verb.cell;
};

const worldSummaryForVerbResult = (result: ImmersiveGlobalVerbResult) => {
  const reactionSummary = reactionSummaryForVerbResult(result);
  if (reactionSummary) return `${reactionSummary}.`;
  const visibleEffects = uniqueShortList([
    ...result.surface_layers.map((layer) => titleCaseEffect(layer.kind)),
    ...result.environment_fields
      .filter((field) => field.kind !== "sound" && field.kind !== "light")
      .map((field) => titleCaseEffect(field.kind)),
    ...result.condition_records.map((condition) => titleCaseEffect(condition.state)),
  ]);
  return visibleEffects ? `${visibleEffects} now marks the tile.` : "The world state changed.";
};

// ── World item / container helpers ─────────────────────────────────────────

type EffectiveWorldItem = {
  id: string;
  item_id: string;
  cell: [number, number];
  count: number;
  dropped: boolean;
};

// Items currently on the ground for a map: authored placements the player
// hasn't taken, plus everything dropped there this run.
const getEffectiveWorldItems = (
  map: MapData,
  delta: MapDelta | undefined,
): EffectiveWorldItem[] => {
  const taken = new Set(delta?.taken_items || []);
  return [
    ...(map.item_placements || [])
      .filter((p) => !taken.has(p.id))
      .map((p) => ({
        id: p.id,
        item_id: p.item_id,
        cell: [p.cell[0], p.cell[1]] as [number, number],
        count: p.count ?? 1,
        dropped: false,
      })),
    ...((delta?.dropped_items || []).map((d) => ({
      id: d.id,
      item_id: d.item_id,
      cell: d.cell,
      count: d.count,
      dropped: true,
    }))),
  ];
};

// Authored container values overridden by anything the save remembers.
const getContainerRuntimeState = (
  container: ContainerPlacementData,
  save: PlaySave | null,
  mapId: string,
) => {
  const state = save?.map_deltas?.[mapId]?.containers?.[container.id];
  return {
    items: state?.items ?? container.items.map((entry) => ({ ...entry })),
    locked: state?.locked ?? container.locked ?? false,
    opened: state?.opened ?? false,
  };
};

// ── Game clock ──────────────────────────────────────────────────────────────

// Minutes that pass per simulation tick, calibrated so a baseline-speed
// (10) actor's turn (100 ticks) advances `minutes_per_turn` game minutes.
const clockMinutesPerTick = (settings: Record<string, any> | undefined) =>
  ((settings?.minutes_per_turn as number) ?? 2) / 100;

// Phase 2/4 adoption: route a cutscene/story effect through the engine-core
// state-mutation command, committing the core-produced save and pushing its
// structured events. The legacy store mutator stays as a fallback so unchanged
// content keeps working if a command rejects. `getState()` is not a hook, so
// this is a plain helper callable from anywhere.
const commitCutsceneState = (
  result: ReturnType<typeof dispatchV1GiveItem> | null,
  legacy: () => void,
): void => {
  if (result?.ok) {
    usePlayStore.getState().commitRuntimeSave(result.save);
    usePlayStore.getState().pushEngineEvents(result.events);
  } else {
    legacy();
  }
};

// Cap on branch jumps per cutscene run so a bad label loop can't spin forever.
const MAX_CUTSCENE_JUMPS = 200;

// ── Threat detection ────────────────────────────────────────────────────────
// Living hostiles within `radius` (Manhattan) of the player. Drives the
// danger HUD, combat music, engaged HP bars, and step-by-step movement.

type NearbyHostile = {
  key: string;
  name: string;
  cell: [number, number];
  hp: number;
  maxHp: number;
  speed: number;
  dist: number;
};

const getNearbyHostiles = (
  save: PlaySave | null,
  map: MapData | null,
  gp: GamePackage,
  radius: number,
): NearbyHostile[] => {
  if (!save || !map) return [];
  return getV1NearbyHostiles({ gamePackage: gp, save, mapId: map.id, radius }).map((hostile) => ({
    key: hostile.id,
    name: hostile.name,
    cell: hostile.cell,
    hp: hostile.hp,
    maxHp: hostile.maxHp,
    speed: hostile.speed,
    dist: hostile.dist ?? 0,
  }));
};

// ── The controlled actor ────────────────────────────────────────────────────
// Out of combat input drives the player. In combat it drives the current
// speed-ordered player-side actor; enemies answer through the shared pulse.

type ControlledActor = {
  key: string; // "player" or a party entity id
  isPlayer: boolean;
  name: string;
  cell: [number, number];
  facing: [number, number];
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  mp: number;
  maxMp: number;
  skills: string[];
};

type AttendTarget = {
  actorId: string;
  entityId: string;
  name: string;
  cell: [number, number];
  isNpc: boolean;
};

type AttendNodePanelState = {
  target: AttendTarget;
  node: AlderamonticoAttendNode;
  visibleReadings: AlderamonticoAttendReading[];
  attention: number;
  attentionChanged: number;
  composureRemaining: number;
  condition: string;
  hiddenReadingCount: number;
};

const attendReadingKey = (reading: AlderamonticoAttendReading, index: number) =>
  reading.id || `reading_${index}`;

const attentionDisplay = (attention: number) =>
  `${Math.round((attention / 10) * 10) / 10}/9`;

const getControlledActor = (
  save: PlaySave | null,
  gp: GamePackage,
): ControlledActor | null => {
  if (!save) return null;
  const actor = getV1ControlledCombatant({ gamePackage: gp, save });
  if (!actor) return null;
  return {
    key: actor.id,
    isPlayer: actor.kind === "player",
    name: actor.name,
    cell: actor.cell,
    facing: actor.facing || [0, 1],
    hp: actor.hp,
    maxHp: actor.maxHp,
    attack: actor.attack,
    defense: actor.defense,
    speed: actor.speed,
    mp: actor.mp,
    maxMp: actor.maxMp,
    skills: actor.skills,
  };
};

// The first fine cell past a footprint actor's leading edge in its facing
// direction — the "cell in front" for interactions and faced targeting.
const facedProbeCell = (
  cell: [number, number],
  facing: [number, number],
): [number, number] => [
  cell[0] + facing[0] * (FINE_HALF_EXTENT + 1),
  cell[1] + facing[1] * (FINE_HALF_EXTENT + 1),
];

// The living, visible actor whose FOOTPRINT covers a cell, if any. Used by
// Attend (faced cell) and by the emotional verbs (targeted cell).
const getLivingActorAtCell = (
  save: PlaySave | null,
  map: MapData | null,
  gp: GamePackage,
  tx: number,
  tz: number,
): AttendTarget | null => {
  if (!save || !map) return null;
  const placements = map.entity_placements || [];
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const actorId = entityPlacementStateKey(map.id, placement, index);
    const entityState =
      (save.entity_states || {})[actorId] ||
      (save.entity_states || {})[placement.entity_id] ||
      {};
    const cx = entityState.cell?.[0] ?? placement.cell[0];
    const cz = entityState.cell?.[1] ?? placement.cell[1];
    if (!footprintContainsCell([cx, cz], [tx, tz]) || entityState.dead || entityState.hidden)
      continue;

    const entity = gp.entities.find((candidate) => candidate.id === placement.entity_id);
    return {
      actorId,
      entityId: placement.entity_id,
      name: entity?.display_name || placement.entity_id,
      cell: [cx, cz],
      isNpc: Boolean(entity?.is_npc),
    };
  }
  return null;
};

const getFacedAttendTarget = (
  save: PlaySave | null,
  map: MapData | null,
  gp: GamePackage,
): AttendTarget | null => {
  if (!save || !map) return null;
  const actor = getControlledActor(save, gp);
  if (!actor) return null;
  const probe = facedProbeCell(
    [actor.cell[0], actor.cell[1]],
    [actor.facing[0], actor.facing[1]],
  );
  return getLivingActorAtCell(save, map, gp, probe[0], probe[1]);
};

// The schedule entry in effect at `hour`: the latest entry whose hour has
// passed, wrapping to the last entry of the day before the first one starts.
const getActiveScheduleEntry = (
  schedule: ScheduleEntryData[] | undefined,
  hour: number,
) => {
  if (!schedule || schedule.length === 0) return null;
  const sorted = [...schedule].sort((a, b) => a.hour - b.hour);
  let active = sorted[sorted.length - 1];
  for (const entry of sorted) {
    if (entry.hour <= hour) active = entry;
  }
  return active;
};

const getCameraRelativeGridMove = (
  ax: number,
  az: number,
  cameraAzimuth: number,
): [number, number] => {
  const sin = Math.sin(cameraAzimuth);
  const cos = Math.cos(cameraAzimuth);
  return [
    Math.round(ax * sin + az * cos),
    Math.round(-ax * cos + az * sin),
  ];
};

const normalizeDialogueSpeaker = (speaker: string) =>
  speaker.trim().toLowerCase().replace(/\s+/g, " ");

const getDialoguePortraits = (
  speaker: string,
  gamePackage: GamePackage,
  dialogueId?: string | null,
): DialoguePortraitConfig[] => {
  const normalized = normalizeDialogueSpeaker(speaker);
  const settings = gamePackage.settings;
  const portraits = (settings?.dialogue_portraits || {}) as DialoguePortraitSettings;
  const playerSrc = String(settings?.player_portrait_url || "");
  const playerPortrait = playerSrc
    ? {
        id: "player",
        src: playerSrc,
        alt: "Player",
        flipX: true,
      }
    : null;
  const speakerPortrait = portraits[normalized] || portraits[speaker] || null;

  if (!normalized || NON_PERSON_DIALOGUE_SPEAKERS.has(normalized)) {
    return [];
  }

  const portraitEntity =
    gamePackage.entities.find(
      (entity) =>
        normalizeDialogueSpeaker(entity.display_name) === normalized ||
        normalizeDialogueSpeaker(entity.id) === normalized,
    ) ||
    (dialogueId
      ? gamePackage.entities.find(
          (entity) =>
            entity.dialogue_id === dialogueId ||
            entity.party_dialogue_id === dialogueId ||
            entity.combat_attend_dialogue_id === dialogueId,
        )
      : undefined);
  const entitySprite = portraitEntity?.sprite_id
    ? gamePackage.sprite_library.find((sprite) => sprite.id === portraitEntity.sprite_id)
    : undefined;
  const entitySpriteSrc = entitySprite?.data_url || "";
  const portraitSrc = speakerPortrait?.src || entitySpriteSrc;

  if (!portraitSrc) {
    return [];
  }

  const primary: DialoguePortraitConfig = {
    id: portraitEntity?.id || normalized || speaker,
    src: portraitSrc,
    alt: speakerPortrait?.alt || portraitEntity?.display_name || speaker,
    side: speakerPortrait?.side || "left",
    active: true,
    flipX: speakerPortrait?.flipX,
  };

  if (playerPortrait && primary.side === "left") {
    return [primary, { ...playerPortrait, side: "right", active: false }];
  }
  return [primary];
};

function DialoguePortraitStage({
  speaker,
  gamePackage,
  dialogueId,
}: {
  speaker: string;
  gamePackage: GamePackage;
  dialogueId?: string | null;
}) {
  const portraits = getDialoguePortraits(speaker, gamePackage, dialogueId);
  if (portraits.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 -top-[18rem] sm:-top-[24rem] md:-top-[28rem] bottom-0 z-10 overflow-hidden">
      {portraits.map((portrait) => {
        const leftSide = portrait.side === "left";
        return (
          <div
            key={portrait.id + "_" + portrait.side}
            className={
              "absolute bottom-0 sm:bottom-[-2.5rem] " +
              (leftSide ? "left-[-1.5rem] sm:left-4" : "right-[-1.5rem] sm:right-4")
            }
            style={{
              transform: leftSide ? "translateX(-5%)" : "translateX(5%)",
            }}
          >
            <img
              src={portrait.src}
              alt=""
              aria-hidden="true"
              className={
                "h-[28rem] sm:h-[32rem] md:h-[36rem] max-w-none object-contain object-bottom select-none drop-shadow-[0_0_26px_rgba(0,0,0,0.9)] " +
                (portrait.active ? "opacity-100" : "opacity-[0.58]")
              }
              style={{
                transform: portrait.flipX ? "scaleX(-1)" : undefined,
                transformOrigin: "bottom center",
              }}
              draggable={false}
            />
          </div>
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/18 to-transparent" />
    </div>
  );
}

function DialogueSceneImageStage({ src, alt }: { src: string; alt?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <img
        src={src}
        alt={alt || ""}
        aria-hidden={alt ? undefined : true}
        className="absolute inset-0 h-full w-full object-cover object-center opacity-95 select-none"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.18)_34%,rgba(0,0,0,0.14)_66%,rgba(0,0,0,0.62)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.90)_0%,rgba(0,0,0,0.54)_28%,rgba(0,0,0,0.12)_62%,rgba(0,0,0,0.36)_100%)]" />
    </div>
  );
}

// Create a basic 5x5 test map for Milestone B
const createTestMap = (): MapData => {
  const cells: CellData[] = [];
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      // Make one cell blocked to test explaining why
      const isBlocked = x === 1 && z === 1;
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable: !isBlocked,
        blocks_los: isBlocked,
        height: 0,
        visual_height: isBlocked ? 1 : 0,
        terrain: "default",
        surface_tag: "none",
      });
    }
  }
  return {
    id: "map_test_01",
    display_name: "Test Grid",
    width: 5,
    height: 5,
    spawns: [{ id: "start", cell: [0, 0], facing: [0, -1] }],
    cells,
    props: [],
    custom_object_placements: [],
    entity_placements: [],
    item_placements: [],
    container_placements: [],
    triggers: [],
    exits: [],
  };
};

type QuestStepStatus = "done" | "current" | "locked";

interface QuestJournalStep {
  id: string;
  text: string;
  status: QuestStepStatus;
}

interface QuestJournalEntry {
  id: string;
  title: string;
  state: string;
  description: string;
  steps: QuestJournalStep[];
}

const stateLabel = (state: string) =>
  state
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const firstCurrentStep = (steps: QuestJournalStep[]) =>
  steps.find((step) => step.status === "current") ||
  steps.find((step) => step.status !== "done") ||
  null;

const getObjectiveStatus = (
  objective: GamePackage["quests"][number]["objectives"][number],
  save: PlaySave,
): QuestStepStatus => {
  const flags = save.flags || {};
  const quests = save.quests || {};
  if (flags[`obj_done_${objective.id}`] || flags[`done_${objective.target_id}`]) {
    return "done";
  }
  if (objective.type === "talk" && flags[`talked_${objective.target_id}`]) return "done";
  if (objective.type === "collect") {
    const count = (save.inventory || [])
      .filter((entry) => entry.id === objective.target_id)
      .reduce((total, entry) => total + entry.count, 0);
    if (count >= (objective.count || 1)) return "done";
  }
  if (objective.type === "interact") {
    if ((save.read_documents || []).includes(objective.target_id)) return "done";
    if (flags[objective.target_id]) return "done";
  }
  const questState = String(quests[objective.target_id] || "");
  if (questState === "done" || questState === "complete" || questState === "completed") {
    return "done";
  }
  return "current";
};

const buildQuestJournal = (
  save: PlaySave,
  gamePackage: GamePackage,
): { entries: QuestJournalEntry[]; activeStep: QuestJournalStep | null } => {
  const quests = save.quests || {};
  const entries = gamePackage.quests.map((quest) => {
    const state = String(quests[quest.id] || (save.flags?.demo_tour_started ? "started" : "available"));
    const steps = quest.objectives.map((objective) => ({
      id: objective.id,
      text: objective.description,
      status: getObjectiveStatus(objective, save),
    }));
    return {
      id: quest.id,
      title: quest.display_name || stateLabel(quest.id),
      state,
      description: quest.description || "",
      steps,
    };
  });

  const activeEntry =
    entries.find((entry) => entry.steps.some((step) => step.status === "current")) ||
    entries[0];
  return {
    entries,
    activeStep: activeEntry ? firstCurrentStep(activeEntry.steps) : null,
  };
};

function LevelUpOverlay({
  level,
  pending,
  onChoose,
}: {
  level: number;
  pending: number;
  onChoose: (stat: LevelUpStat) => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-md border-2 border-[var(--color-ui-accent)] bg-ui-panel px-5 py-5 shadow-[0_0_35px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-ui-accent-dark)]/60 pb-3">
          <div>
            <div className="font-[family-name:var(--font-display)] text-[11px] font-bold uppercase tracking-widest text-[var(--color-ui-accent)]">
              Level {level}
            </div>
            <h2 className="mt-1 font-serif text-2xl font-bold text-[var(--color-ui-text)]">
              Choose a stat
            </h2>
          </div>
          {pending > 1 && (
            <div className="rounded-sm border border-[var(--color-ui-accent-dark)] bg-black/25 px-2 py-1 font-serif text-xs font-bold text-[var(--color-ui-accent)]">
              {pending} choices
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LEVEL_UP_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onChoose(choice.id)}
              className="min-h-16 border border-[var(--color-ui-accent-dark)] bg-black/20 px-3 py-3 text-left transition-colors hover:bg-[var(--color-ui-accent-dark)]/25 active:scale-[0.99]"
            >
              <span className="block font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-widest text-[var(--color-ui-accent)]">
                {choice.label}
              </span>
              <span className="mt-1 block font-serif text-sm font-bold text-[var(--color-ui-text)]">
                {choice.effectLabel}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlayEngine({ onGameEnd }: { onGameEnd?: () => void } = {}) {
  // Kept in a ref so the cutscene runner's closure always calls the latest
  // callback (the runner effect is long-lived and would otherwise capture a
  // stale prop).
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const rawGamePackage = useEngineStore((state) => state.gamePackage);
  // Play mode simulates the FINE world — expand the authored macro package.
  const baseGamePackage = useMemo(
    () => expandGamePackageToFine(withRuntimePackageArrays(rawGamePackage)),
    [rawGamePackage],
  );
  const {
    saveData,
    logMessages,
    initSave,
    updatePlayer,
    commitRuntimeSave,
    addLog,
    resetRun,
    activeDialogueId,
    activeDialogueNodeId,
    advanceDialogue,
    endDialogue,
    setQuestState,
    updatePlayerHp,
    activeShopId,
    openShop,
    closeShop,
    updateMoney,
    activeContainerId,
    closeContainer,
    chooseLevelUpStat,
  } = usePlayStore();
  const [activeMapState, setActiveMap] = useState<MapData | null>(null);
  const activeMap = useMemo(() => {
    if (!saveData?.current_map_id) return activeMapState;
    const saveMap = baseGamePackage.maps.find((map) => map.id === saveData.current_map_id);
    if (!saveMap) return activeMapState;
    return activeMapState?.id === saveMap.id ? activeMapState : saveMap;
  }, [activeMapState, baseGamePackage.maps, saveData?.current_map_id]);
  const gamePackage = useMemo(() => {
    if (!activeMap) return baseGamePackage;
    return {
      ...baseGamePackage,
      maps: baseGamePackage.maps.map((map) => map.id === activeMap.id ? activeMap : map),
    };
  }, [activeMap, baseGamePackage]);
  const largeMapWindowKeyRef = useRef("");
  useEffect(() => {
    const mapId = saveData?.current_map_id;
    const playerCell = saveData?.player?.cell;
    if (!mapId || !playerCell) return;
    const authored = rawGamePackage.maps.find((map) => map.id === mapId);
    if (!authored || !isLargeAuthoredMap(authored)) return;
    const sectorX = Math.floor(playerCell[0] / (32 * FINE_PER_MACRO));
    const sectorZ = Math.floor(playerCell[1] / (32 * FINE_PER_MACRO));
    const windowKey = `${authored.id}:${sectorX}:${sectorZ}`;
    if (largeMapWindowKeyRef.current === windowKey) return;
    largeMapWindowKeyRef.current = windowKey;
    const windowMap = materializeLargeMapWindow(authored, playerCell);
    registerRuntimeMapWindow(windowMap);
    setActiveMap(windowMap);
  }, [rawGamePackage.maps, saveData?.current_map_id, saveData?.player?.cell]);

  // The player's MACRO tile. Exploration-cadence simulation (chemistry ooze,
  // emotional/grid pressure, perception, survival) is macro-paced by design
  // (spec §4.4: fine walking is "effectively free"). Keying those effects on
  // the macro tile — not the fine cell — fires them once per tile crossed
  // instead of once per fine step, so a long held-walk does 1/FINE_PER_MACRO
  // the per-second simulation work.
  const playerMacroX =
    saveData?.player?.cell ? Math.floor(saveData.player.cell[0] / FINE_PER_MACRO) : undefined;
  const playerMacroZ =
    saveData?.player?.cell ? Math.floor(saveData.player.cell[1] / FINE_PER_MACRO) : undefined;

  // Any live non-party actor can consume environmental perception now. Hostile
  // actors additionally perceive the player; friendly actors only react to
  // danger and disturbances.
  const mapHasPerceivingActor = useMemo(() => {
    if (!activeMap) return false;
    return (activeMap.entity_placements || []).some((placement, index) => {
      if ((saveData?.party_members || []).includes(placement.entity_id)) return false;
      const entity = gamePackage.entities.find((candidate) => candidate.id === placement.entity_id);
      if (!entity) return false;
      const key = entityPlacementStateKey(activeMap.id, placement, index);
      const state =
        saveData?.entity_states?.[key] || saveData?.entity_states?.[placement.entity_id] || {};
      return !state.dead && !state.hidden;
    });
  }, [activeMap, gamePackage, saveData?.entity_states, saveData?.party_members]);

  const [activeCutscene, setActiveCutscene] = useState<any | null>(null);
  const [cutsceneActionIndex, setCutsceneActionIndex] = useState(0);
  const observedSwitchFlagsRef = useRef<Record<string, boolean> | null>(null);
  const observedSwitchMapRef = useRef<string | null>(null);
  const pendingSwitchTriggerIdsRef = useRef<string[]>([]);

  // Per-map ambient music (settings.map_music: map_id -> music_tracks id or
  // URL). Fires on map entry; a cutscene's play_music afterwards still wins
  // because this only runs when the map id changes.
  const prevMusicMapRef = useRef<string | null>(null);
  useEffect(() => {
    const mapId = saveData?.current_map_id;
    if (!mapId || prevMusicMapRef.current === mapId) return;
    prevMusicMapRef.current = mapId;
    const settings = gamePackage.settings || {};
    const assignment = ((settings.map_music || {}) as Record<string, string>)[mapId];
    if (!assignment) return;
    const url = ((settings.music_tracks || {}) as Record<string, string>)[assignment] || assignment;
    if (url) playMusic(url, { loop: true });
  }, [saveData?.current_map_id, gamePackage.settings]);

  const [showInventory, setShowInventory] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  // Bumped after slot writes/deletes so the menu re-reads localStorage.
  const [saveSlotRevision, setSaveSlotRevision] = useState(0);
  const [targetingSkillId, setTargetingSkillId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);
  const [activeAbilityPageIndex, setActiveAbilityPageIndex] = useState(0);
  // Immersive global-verb target-cell cursor, now launched from the ability bar.
  const [verbTargeting, setVerbTargeting] = useState<{
    verb: PlayModeWheelVerbKind;
    itemId?: string;
  } | null>(null);
  const [selectedWorkstationProcessId, setSelectedWorkstationProcessId] = useState<string | null>(null);
  const [verbFeedback, setVerbFeedback] = useState<VerbFeedback | null>(null);
  const [attendedActor, setAttendedActor] = useState<AttendTarget | null>(null);
  const [activeAttendNodePanel, setActiveAttendNodePanel] = useState<AttendNodePanelState | null>(null);
  const verbTargetingRef = useRef<{ verb: PlayModeWheelVerbKind; itemId?: string } | null>(null);
  const perceptionAdvanceKeyRef = useRef("");
  const stealthAlertStateRef = useRef<Map<string, ImmersiveAlertnessState>>(new Map());
  const worldStateAdvanceKeyRef = useRef("");
  const worldStateNoticeKeyRef = useRef("");
  useEffect(() => {
    verbTargetingRef.current = verbTargeting;
  }, [verbTargeting]);
  // Chemistry advances one tick per player step / clock move; the effect
  // itself now lives after `playSfx` so its feedback presenter can speak.
  const chemistryStepRef = useRef("");
  // Last behavior we narrated per exploration actor, so the log announces
  // "bolts in terror" once per state change instead of every pump.
  const explorationBehaviorNoteRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!verbFeedback) return undefined;
    const timeout = window.setTimeout(() => {
      setVerbFeedback((current) =>
        current?.id === verbFeedback.id ? null : current,
      );
    }, IMMERSIVE_VERB_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [verbFeedback]);
  // Always points at the latest confirm closure so the memoized playfield click
  // handler can invoke it without going stale.
  const confirmVerbTargetRef = useRef<(x: number, z: number) => void>(() => {});
  const [cameraQuarterTurns, setCameraQuarterTurns] = useState(0);
  const cameraAzimuth =
    ISO_CAMERA_BASE_AZIMUTH + cameraQuarterTurns * (Math.PI / 2);
  const cameraAzimuthRef = useRef(cameraAzimuth);
  useEffect(() => {
    cameraAzimuthRef.current = cameraAzimuth;
  }, [cameraAzimuth]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [cameraFocusOverride, setCameraFocusOverride] = useState<
    [number, number] | null
  >(null);
  const [screenFade, setScreenFade] = useState({
    color: "#000000",
    opacity: 0,
    duration: 600,
  });
  const [playDpr, setPlayDpr] = useState(PLAY_DPR_MAX);
  const visualPreset = useVisualSettingsStore((s) => s.preset);
  const setVisualPreset = useVisualSettingsStore((s) => s.setPreset);
  const fogOfWar = useVisualSettingsStore((s) => s.fogOfWar);
  const setFogOfWar = useVisualSettingsStore((s) => s.setFogOfWar);
  const engineEvents = usePlayStore((s) => s.engineEvents);
  const combatTurnSerial = useMemo(
    () =>
      [...engineEvents]
        .reverse()
        .find((event) => event.type === "combat_turn_advanced")?.id || 0,
    [engineEvents],
  );
  const [showEngineEvents, setShowEngineEvents] = useState(false);
  const [showBehaviorIntents, setShowBehaviorIntents] = useState(false);
  const visualConfig = SCREEN_VISUAL_PRESETS[visualPreset];
  const visualDprCap = Math.min(PLAY_DPR_MAX, visualConfig.dprCap);
  const effectivePlayDpr = Math.min(playDpr, visualDprCap);
  const cutsceneJumpsRef = useRef(0);
  const activeCellByCoord = useMemo(() => {
    const lookup = new Map<string, CellData>();
    activeMap?.cells.forEach((cell) => {
      const key = playCellKey(cell.x, cell.z);
      const existing = lookup.get(key);
      if (
        !existing ||
        (cell.walkable && !existing.walkable) ||
        (cell.walkable === existing.walkable && (cell.y || 0) < (existing.y || 0))
      ) {
        lookup.set(key, cell);
      }
    });
    return lookup;
  }, [activeMap?.cells]);
  const getActiveCell = useCallback(
    (x: number, z: number) => activeCellByCoord.get(playCellKey(x, z)),
    [activeCellByCoord],
  );
  const objectByIdForPlay = useMemo(
    () =>
      new Map(
        gamePackage.object_library.map((object) => [
          object.id,
          object,
        ]),
      ),
    [gamePackage.object_library],
  );
  const activeMapDelta = activeMap
    ? saveData?.map_deltas?.[activeMap.id]
    : undefined;
  const isDoorOpenForPlay = useCallback(
    (placement: ObjectPlacementData) => isDoorPlacementOpen(activeMapDelta, placement),
    [activeMapDelta],
  );
  // Authored object placements with kernel push/remove deltas applied, so
  // collision/navigation/rendering all see objects at their current cells.
  const effectiveObjectPlacements = useMemo(
    () => applyPlacementDeltas(activeMap?.custom_object_placements, activeMapDelta),
    [activeMap?.custom_object_placements, activeMapDelta],
  );
  const blockingPlacementCells = useMemo(() => {
    const blocked = new Set<string>();
    effectiveObjectPlacements.forEach((placement) => {
      const objDef = objectByIdForPlay.get(placement.object_id);
      if (!placementHasCollision(placement, objDef)) return;
      if (isBuildingDoorPlacement(placement)) {
        if (isDoorOpenForPlay(placement)) return;
        getPlacementFootprint(placement, objDef).forEach(([x, z]) => {
          blocked.add(playCellKey(x, z));
        });
        return;
      }
      getPlacementFootprint(placement, objDef).forEach(([x, z]) => {
        blocked.add(playCellKey(x, z));
      });
    });
    return blocked;
  }, [effectiveObjectPlacements, isDoorOpenForPlay, objectByIdForPlay]);
  // Containers occupy their whole MACRO tile on the fine grid (their cell is
  // the tile's center fine cell), so lookups key on the macro tile.
  const containerByCoord = useMemo(() => {
    const lookup = new Map<string, ContainerPlacementData>();
    activeMap?.container_placements?.forEach((container) => {
      lookup.set(macroKeyOfFine([container.cell[0], container.cell[1]]) as string, container);
    });
    return lookup;
  }, [activeMap?.container_placements]);
  const getContainerAtCell = useCallback(
    (x: number, z: number) => containerByCoord.get(macroKeyOfFine([x, z]) as string),
    [containerByCoord],
  );
  const isBlockedByPlacement = useCallback(
    (x: number, z: number) => blockingPlacementCells.has(playCellKey(x, z)),
    [blockingPlacementCells],
  );
  const baseWalkableCells = useMemo(() => {
    const walkable = new Set<string>();
    activeMap?.cells.forEach((cell) => {
      if (cell.walkable === false) return;
      if (cell.object_id) {
        const objDef = objectByIdForPlay.get(cell.object_id);
        if (objDef && objDef.collision?.profile !== "none") return;
      }
      walkable.add(pathCellKey(cell.x, cell.z));
    });

    effectiveObjectPlacements.forEach((placement) => {
      const objDef = objectByIdForPlay.get(placement.object_id);
      if (!placementHasCollision(placement, objDef)) return;
      if (isBuildingDoorPlacement(placement)) {
        if (isDoorOpenForPlay(placement)) return;
        getPlacementFootprint(placement, objDef).forEach(([x, z]) => {
          walkable.delete(pathCellKey(x, z));
        });
        return;
      }
      getPlacementFootprint(placement, objDef).forEach(([x, z]) => {
        walkable.delete(pathCellKey(x, z));
      });
    });
    activeMap?.container_placements?.forEach((container) => {
      // Containers block their whole macro tile.
      for (let dx = -FINE_HALF_EXTENT; dx <= FINE_HALF_EXTENT; dx += 1) {
        for (let dz = -FINE_HALF_EXTENT; dz <= FINE_HALF_EXTENT; dz += 1) {
          walkable.delete(pathCellKey(container.cell[0] + dx, container.cell[1] + dz));
        }
      }
    });

    return walkable;
  }, [
    activeMap?.cells,
    effectiveObjectPlacements,
    activeMap?.container_placements,
    isDoorOpenForPlay,
    objectByIdForPlay,
  ]);

  // Footprint-eroded walkability: a fine cell is a legal FOOTPRINT CENTER only
  // when its whole FINE_PER_MACRO² block is walkable. NPC pathing uses this so
  // 3×3-footprint actors never clip walls or objects.
  const footprintWalkableCells = useMemo(() => {
    if (FINE_HALF_EXTENT === 0) return baseWalkableCells;
    const centers = new Set<string>();
    baseWalkableCells.forEach((key) => {
      const [x, z] = key.split(":").map(Number);
      for (let dx = -FINE_HALF_EXTENT; dx <= FINE_HALF_EXTENT; dx += 1) {
        for (let dz = -FINE_HALF_EXTENT; dz <= FINE_HALF_EXTENT; dz += 1) {
          if (!baseWalkableCells.has(pathCellKey(x + dx, z + dz))) return;
        }
      }
      centers.add(key);
    });
    return centers;
  }, [baseWalkableCells]);

  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMapRef = useRef<MapData | null>(null);
  const latestPartyFollowersRef = useRef<{ entity_id: string; cell: [number, number] }[]>([]);
  const inputBlockedRef = useRef(false);
  const playerFootstepFineStepsRef = useRef(0);
  // bark id -> in-game minute it last played; throttles repeat gossip.
  const barkCooldownRef = useRef<Map<string, number>>(new Map());
  const lastBarkRealRef = useRef(0);
  const handleMoveRef = useRef<((dx: number, dz: number) => void) | null>(null);
  const handleActRef = useRef<(() => void) | null>(null);
  const waitRef = useRef<(() => void) | null>(null);
  const pendingLevelUps = getPendingLevelUps(saveData);
  const levelUpOpen = pendingLevelUps > 0;
  const levelUpOpenRef = useRef(false);
  const pulseForSfx = useCallback((idOrUrl: string | undefined, volume = 0.6) => {
    if (!idOrUrl) return;
    const id = idOrUrl.split("/").pop()?.replace(/\.[^.]+$/, "") || idOrUrl;
    if (id.startsWith("footstep")) return;
    const pulses: Record<string, number> = {
      ui_click: 0.08,
      ui_back: 0.06,
      dialogue_open: 0.18,
      dialogue_next: 0.12,
      document_open: 0.24,
      item_pickup: 0.22,
      coin: 0.2,
      save_chime: 0.55,
      shop_open: 0.26,
      door_transition: 0.48,
      bump: 0.22,
      melee_swing: 0.2,
      melee_hit: 0.58,
      melee_crit: 0.9,
      enemy_defeat: 0.74,
      spell_cast: 0.62,
      spell_hit: 0.68,
      heal: 0.42,
      level_up: 0.95,
      warning: 0.5,
    };
    const strength = pulses[id] ?? (idOrUrl.startsWith("/") ? 0.26 : 0.12);
    useFxStore.getState().pulseScreen(strength * Math.max(0.35, Math.min(1.2, volume)));
  }, []);
  const playSfx = useCallback(
    (
      idOrUrl: string | undefined,
      opts: {
        volume?: number;
        playbackRate?: number;
        cooldownMs?: number;
        channel?: string;
      } = {},
    ) => {
      const settings = getRuntimeGamePackage().settings || {};
      pulseForSfx(idOrUrl, opts.volume);
      playSound(idOrUrl, {
        ...opts,
        channel:
          opts.channel ??
          (idOrUrl?.startsWith("footstep") ? "movement-footsteps" : undefined),
        customSounds: settings.sound_effects || {},
      });
    },
    [pulseForSfx],
  );
  const alderamonticoGridStepRef = useRef("");
  const alderamonticoGridNoticeRef = useRef("");
  useEffect(() => {
    const save = usePlayStore.getState().saveData;
    if (!save) return;
    const mapId = save.current_map_id;
    const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
    if (!map?.regions?.some((region) => region.alderamontico_grid?.enabled)) return;
    const stepKey = `${mapId}:${save.player.cell[0]}:${save.player.cell[1]}:${save.clock_minutes || 0}`;
    if (alderamonticoGridStepRef.current === stepKey) return;
    alderamonticoGridStepRef.current = stepKey;

    const result = advanceAlderamonticoGridRegionsForSave(gamePackage, save, mapId, {
      tick: save.clock_minutes ?? 0,
    });
    if (result.exposures.length === 0 || result.save === save) return;
    usePlayStore.getState().commitRuntimeSave(result.save);

    const attendedExposure = attendedActor
      ? result.exposures.find((exposure) => exposure.actor_id === attendedActor.actorId)
      : undefined;
    const playerExposure = result.exposures.find((exposure) => exposure.actor_id === "player");
    const exposure = attendedExposure || playerExposure;
    if (!exposure) return;

    const noticeKey = `${exposure.region_id}:${exposure.lens_actor_id || "unfocused"}`;
    if (alderamonticoGridNoticeRef.current === noticeKey) return;
    alderamonticoGridNoticeRef.current = noticeKey;
    const regionName = exposure.region_name || exposure.region_id.replace(/_/g, " ");
    const lensNote = exposure.lens_actor_id ? `, lens x${exposure.lens_multiplier}` : "";
    addLog(
      `Grid pressure in ${regionName}: ${exposure.dominant_axis} +${Math.round(exposure.amount * 10) / 10}${lensNote}.`,
    );
    playSfx("spell_hit", { volume: 0.16, cooldownMs: 500 });
  }, [
    addLog,
    attendedActor,
    gamePackage,
    playSfx,
    saveData?.current_map_id,
    playerMacroX,
    playerMacroZ,
    saveData?.clock_minutes,
  ]);

  // ── Chemistry feedback ─────────────────────────────────────────────────────
  // The chemistry grid keeps evolving between commands (fire spreads, ice
  // melts, arcs chain). Surface the notable transitions so the sim never
  // changes the world silently: popups on the affected cells, one aggregated
  // log line, and body-state callouts when an actor's exposure changes.
  const presentChemistryFeedback = useCallback(
    (
      reactions: ChemReactionRecord[],
      exposures: ChemActorExposure[],
      options: { logReactions?: boolean } = {},
    ) => {
      const fx = useFxStore.getState();
      const gp = getRuntimeGamePackage();
      const NOTABLE: Record<string, { popup: string; color: string }> = {
        ignited: { popup: "🔥 Ignites", color: "#fb923c" },
        extinguished: { popup: "Fire dies", color: "#94a3b8" },
        froze: { popup: "❄️ Freezes", color: "#bae6fd" },
        melted: { popup: "Melts", color: "#7dd3fc" },
        arc: { popup: "⚡ Arc", color: "#fde047" },
      };
      const seen = new Set<string>();
      const counts = new Map<string, number>();
      let popups = 0;
      for (const reaction of reactions) {
        const style = NOTABLE[reaction.kind];
        if (!style) continue;
        const key = `${reaction.kind}:${reaction.cell[0]}:${reaction.cell[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        counts.set(reaction.kind, (counts.get(reaction.kind) || 0) + 1);
        if (popups < 4) {
          popups += 1;
          fx.addPopup(reaction.cell, style.popup, style.color, 1.5);
        }
      }
      if (options.logReactions !== false && counts.size > 0) {
        const phrases: string[] = [];
        const ignitions = counts.get("ignited") || 0;
        if (ignitions > 0) phrases.push(ignitions === 1 ? "fire spreads" : `fire spreads to ${ignitions} tiles`);
        if (counts.get("extinguished")) phrases.push("a fire dies");
        if (counts.get("froze")) phrases.push("water freezes over");
        if (counts.get("melted")) phrases.push("ice melts");
        if (counts.get("arc")) phrases.push("charge arcs");
        if (phrases.length) {
          addLog(`${phrases.join("; ").replace(/^./, (c) => c.toUpperCase())}.`);
        }
        if (ignitions > 0) playSfx("spell_cast", { volume: 0.26, playbackRate: 0.86, cooldownMs: 600 });
        if (counts.get("arc")) playSfx("spell_hit", { volume: 0.3, playbackRate: 1.4, cooldownMs: 600 });
      }
      for (const exposure of exposures) {
        if (!exposure.new_labels.length) continue;
        const name =
          exposure.actor_id === "player"
            ? "You"
            : gp.entities.find((entity) => entity.id === exposure.entity_id)?.display_name ||
              "Someone";
        const headline = exposure.new_labels[0];
        const color = headline === "On Fire" ? "#f87171" : headline === "Freezing" ? "#bae6fd" : "#e2e8f0";
        fx.addPopup(exposure.cell, headline, color, 1.7);
        const verbPhrase =
          headline === "On Fire"
            ? exposure.actor_id === "player" ? "are on fire!" : "catches fire!"
            : `${exposure.actor_id === "player" ? "are" : "is"} ${exposure.new_labels.join(", ").toLowerCase()}.`;
        addLog(`${name} ${verbPhrase}`);
        if (exposure.actor_id === "player" && headline === "On Fire") {
          fx.markPlayerHurt();
          playSfx("warning", { volume: 0.4, cooldownMs: 800 });
        }
      }
    },
    [addLog, playSfx],
  );

  // Advance grid chemistry one tick whenever the player takes a step (or the
  // clock moves), so fire keeps spreading and ice keeps melting between
  // commands. No-op (same save reference) when nothing is energetic, which
  // also prevents this from looping on its own committed save.
  useEffect(() => {
    let save = usePlayStore.getState().saveData;
    if (!save) return;
    const mapId = save.current_map_id;
    const stepKey = `${mapId}:${save.player.cell[0]}:${save.player.cell[1]}:${save.clock_minutes || 0}`;
    if (chemistryStepRef.current === stepKey) return;
    chemistryStepRef.current = stepKey;
    const initialized = initializeAuthoredChemistryForSave(
      getRuntimeGamePackage(),
      save,
      mapId,
    );
    if (initialized !== save) {
      usePlayStore.getState().commitRuntimeSave(initialized);
      save = initialized;
    }
    // Chemistry may be persisted point-sparse, run-length-encoded, or as a
    // live active set — any of them means the map has state to advance.
    if (
      !save.chemistry?.[mapId] &&
      !save.chemistry_runs?.[mapId] &&
      !save.chemistry_active?.[mapId]
    )
      return;
    const advanced = advanceChemistryForSave(
      getRuntimeGamePackage(),
      save,
      mapId,
      1,
    );
    if (advanced.save !== save) {
      usePlayStore.getState().commitRuntimeSave(advanced.save);
      presentChemistryFeedback(advanced.reactions, advanced.exposures);
    }
  }, [
    presentChemistryFeedback,
    saveData?.current_map_id,
    playerMacroX,
    playerMacroZ,
    saveData?.clock_minutes,
  ]);

  // Emotional axes relax toward each actor's baseline as time passes (doc 05
  // §4A: remove the cause and the feeling decays). Runs on the same step/clock
  // cadence as chemistry, with its own ref guard against replaying commits.
  const emotionalDecayStepRef = useRef("");
  useEffect(() => {
    const save = usePlayStore.getState().saveData;
    if (!save) return;
    const stepKey = `${save.current_map_id}:${save.clock_minutes || 0}`;
    if (emotionalDecayStepRef.current === stepKey) return;
    emotionalDecayStepRef.current = stepKey;
    const decayed = advanceAlderamonticoEmotionalDecayForSave(save, {
      tick: save.clock_minutes ?? 0,
    });
    if (decayed.save !== save) usePlayStore.getState().commitRuntimeSave(decayed.save);
  }, [saveData?.current_map_id, saveData?.clock_minutes]);

  // A bark exchange may have delayed lines. Remove every current and pending
  // line as soon as its speaker dies, regardless of whether death came from a
  // melee strike, skill, shove, overwatch, chemistry, or scripted damage.
  useEffect(() => {
    const deadActorIds = Object.entries(saveData?.entity_states || {})
      .filter(([, state]) => Boolean(state?.dead) || Number(state?.hp ?? 1) <= 0)
      .map(([actorId]) => actorId);
    if (deadActorIds.length > 0) {
      useFxStore.getState().dismissBarksForActors(deadActorIds);
    }
  }, [saveData?.entity_states]);

  const presentStealthPerceptionFeedback = useCallback(
    (result: ImmersiveStage4PerceptionAdvanceResult, previousSave: PlaySave) => {
      const fx = useFxStore.getState();
      const memory = new Map(stealthAlertStateRef.current);
      let presented = 0;
      result.snapshot.alerts.slice(0, 3).forEach((alert) => {
        const previousAlertness =
          memory.get(alert.actor_id) ||
          (previousSave.entity_states?.[alert.actor_id]?.alertness as ImmersiveAlertnessState | undefined) ||
          "oblivious";
        memory.set(alert.actor_id, alert.alertness);
        if (ALERTNESS_RANK[alert.alertness] <= ALERTNESS_RANK[previousAlertness]) return;
        if (presented >= 2) return;
        presented += 1;

        const entityName =
          gamePackage.entities.find((entity) => entity.id === alert.entity_id)?.display_name ||
          "Watcher";
        const isNeutralReaction = Boolean(
          gamePackage.entities.find((entity) => entity.id === alert.entity_id)?.is_npc,
        );
        const style = ALERTNESS_POPUP_STYLE[alert.alertness];
        const barkText =
          isNeutralReaction && alert.stimulus.kind === "fire"
            ? "Fire!"
            : isNeutralReaction && alert.stimulus.kind === "danger_gas"
              ? "Get clear!"
              : isNeutralReaction
                ? "What was that?"
              : alert.alertness === "combat"
            ? "There!"
            : alert.alertness === "searching"
              ? "Search there."
              : "What was that?";

        fx.addPopup(alert.cell, style.text, style.color, 1.65);
        fx.enqueueBark([
          {
            cell: alert.cell,
            actorId: alert.actor_id,
            text: barkText,
            speaker: entityName,
          },
        ]);
        if (isNeutralReaction) {
          addLog(`${entityName} reacts to ${titleCaseEffect(alert.stimulus.kind).toLowerCase()}.`);
        } else {
          playSfx("warning", {
            volume: alert.alertness === "combat" ? 0.34 : 0.22,
            playbackRate: style.sfxRate,
            cooldownMs: 360,
          });
          addLog(
            `${entityName} is ${ALERTNESS_LABELS[alert.alertness].toLowerCase()} (${Math.round(alert.score * 100)}).`,
          );
        }
      });

      result.decayed_alerts.slice(0, 2).forEach((alert) => {
        const previousAlertness = memory.get(alert.actor_id) || "oblivious";
        if (alert.alertness === "oblivious") {
          memory.delete(alert.actor_id);
        } else {
          memory.set(alert.actor_id, alert.alertness);
        }
        if (alert.alertness !== "oblivious" || ALERTNESS_RANK[previousAlertness] <= 0) return;

        const entityName =
          gamePackage.entities.find((entity) => entity.id === alert.entity_id)?.display_name ||
          "Watcher";
        const isNeutralReaction = Boolean(
          gamePackage.entities.find((entity) => entity.id === alert.entity_id)?.is_npc,
        );
        fx.addPopup(alert.cell, isNeutralReaction ? "Settled" : "Gave up", "#86efac", 1.62);
        fx.enqueueBark([
          {
            cell: alert.cell,
            actorId: alert.actor_id,
            text: isNeutralReaction ? "All quiet." : "Must have been nothing.",
            speaker: entityName,
          },
        ]);
        addLog(
          isNeutralReaction
            ? `${entityName} returns to routine.`
            : `${entityName} gives up the search.`,
        );
      });

      stealthAlertStateRef.current = memory;
    },
    [addLog, gamePackage.entities, playSfx],
  );

  const presentWorldStateFeedback = useCallback(
    (result: ImmersiveWorldStateAdvanceResult) => {
      const gate =
        result.evaluation.denials[0] ||
        result.evaluation.gates.find((candidate) => !candidate.passed && candidate.severity === "warning");
      if (!gate) return;

      const noticeKey = [
        result.evaluation.map_id,
        result.evaluation.region_id,
        gate.id,
        gate.severity,
        Math.floor(Number(gate.score || 0)),
      ].join(":");
      if (worldStateNoticeKeyRef.current === noticeKey) return;
      worldStateNoticeKeyRef.current = noticeKey;

      playSfx("warning", {
        volume: gate.severity === "deny" ? 0.38 : 0.24,
        playbackRate: gate.severity === "deny" ? 0.82 : 1,
        cooldownMs: 500,
      });
      addLog(gate.reason);
    },
    [addLog, playSfx],
  );

  const presentWorldStateBlockFeedback = useCallback(
    (gate: ImmersiveWorldStateGateResult, cell: [number, number]) => {
      const label = WORLD_GATE_BLOCK_POPUP[gate.kind] || "Blocked";
      useFxStore.getState().addPopup(
        cell,
        label,
        gate.severity === "deny" ? "#fb7185" : "#facc15",
        1.7,
      );
      playSfx("warning", {
        volume: gate.severity === "deny" ? 0.36 : 0.22,
        playbackRate: gate.kind === "inventory_load" ? 0.72 : 0.9,
        cooldownMs: 360,
      });
      addLog(`Blocked: ${gate.reason}`);
    },
    [addLog, playSfx],
  );

  const logExperienceGrant = useCallback(
    (result: ExperienceGrantResult | null) => {
      if (!result || result.awarded <= 0) return;
      addLog(`Gained ${result.awarded} XP.`);
      if (result.levelUps > 0) {
        playSfx("level_up", { volume: 0.65, cooldownMs: 400 });
        addLog(`Level ${result.level} reached. Choose a stat.`);
      } else {
        playSfx("coin", { volume: 0.35, cooldownMs: 160 });
      }
    },
    [addLog, playSfx],
  );

  const handleEnemyDefeatedExperience = useCallback(
    (entityData: GamePackage["entities"][number] | undefined | null) => {
      // Killing a soul-bearing being is witnessed. The road docks its hidden
      // reputation and says its one cold line; there is no other feedback.
      if (entityData?.soul_bearing) {
        usePlayStore.getState().adjustFactionRep("the_road", -3);
        addLog("The road remembers that too.");
      }
      // Authored defeat hooks: set a story switch and/or fire a cutscene when
      // this entity dies. A switch named `done_<target_id>` completes kill
      // quest objectives via the journal's flags check.
      if (entityData?.on_defeat_switch) {
        usePlayStore.getState().setFlag(entityData.on_defeat_switch, true);
      }
      if (entityData?.on_defeat_cutscene_id) {
        const cutscene = gamePackage.cutscenes.find(
          (candidate) => candidate.id === entityData.on_defeat_cutscene_id,
        );
        if (cutscene) {
          setActiveCutscene(cutscene);
          setCutsceneActionIndex(0);
        }
      }
      const xp = getEnemyXpReward(entityData);
      if (xp <= 0) return;
      const store = usePlayStore.getState();
      if (store.saveData?.in_combat) {
        store.queueCombatExperience(xp);
        return;
      }
      logExperienceGrant(store.grantExperience(xp));
    },
    [logExperienceGrant, gamePackage.cutscenes],
  );

  const handleLevelUpChoice = useCallback(
    (stat: LevelUpStat) => {
      const choice = LEVEL_UP_CHOICES.find((candidate) => candidate.id === stat);
      if (chooseLevelUpStat(stat)) {
        playSfx("level_up", { volume: 0.55, cooldownMs: 500 });
        addLog(`${choice?.label || "Stat"} increased.`);
      }
    },
    [addLog, chooseLevelUpStat, playSfx],
  );

  const logCoreExperience = useCallback(
    (experience?: CombatAttackOutcome["experience"]) => {
      if (!experience || experience.queued || experience.awarded <= 0) return;
      addLog(`Gained ${experience.awarded} XP.`);
      if ((experience.levelUps || 0) > 0) {
        playSfx("level_up", { volume: 0.65, cooldownMs: 400 });
        addLog(`Level ${experience.level} reached. Choose a stat.`);
      } else {
        playSfx("coin", { volume: 0.35, cooldownMs: 160 });
      }
    },
    [addLog, playSfx],
  );

  const presentMeleeOutcome = useCallback(
    (outcome: CombatAttackOutcome) => {
      const fx = useFxStore.getState();
      const attackerIsPlayer = outcome.attackerId === "player";
      playSfx("melee_swing", {
        volume: attackerIsPlayer ? 0.28 : 0.24,
        playbackRate: attackerIsPlayer ? 1 : 0.92,
        cooldownMs: 70,
      });
      playSfx(outcome.crit ? "melee_crit" : "melee_hit", {
        volume: outcome.crit ? 0.58 : 0.44,
        cooldownMs: 80,
      });
      fx.addPopup(
        outcome.targetCell,
        `${outcome.damage}${outcome.crit ? "!" : ""}`,
        outcome.crit ? "#fbbf24" : attackerIsPlayer ? "#ffffff" : "#f87171",
      );
      if (outcome.targetKind === "player") fx.markPlayerHurt();
      else fx.flashEntity(outcome.targetId);

      if (outcome.targetKind === "player") {
        addLog(`${outcome.attackerName} hits you for ${outcome.damage}${outcome.crit ? " — a vicious blow!" : "."}`);
      } else {
        const verb = attackerIsPlayer ? "You hit" : `${outcome.attackerName} hits`;
        addLog(
          outcome.crit
            ? `Critical! ${verb} ${outcome.targetName} for ${outcome.damage}!`
            : `${verb} ${outcome.targetName} for ${outcome.damage}.`,
        );
      }

      for (const assist of outcome.assists || []) {
        fx.addPopup(outcome.targetCell, `${assist.damage}${assist.crit ? "!" : ""}`, "#7dd3fc");
        fx.flashEntity(outcome.targetId);
        addLog(`${assist.actorName} follows up for ${assist.damage}!`);
      }

      if (outcome.targetDead) {
        fx.addPopup(outcome.targetCell, "x", "#f87171");
        playSfx("enemy_defeat", { volume: outcome.targetKind === "entity" ? 0.5 : 0.35, cooldownMs: 180 });
        addLog(outcome.targetKind === "player" ? "You have fallen." : `${outcome.targetName} is defeated!`);
        logCoreExperience(outcome.experience);
      }
    },
    [addLog, logCoreExperience, playSfx],
  );

  const presentImmersiveCombatAttackOutcome = useCallback(
    (
      result: ImmersiveCombatAttackResult,
      attackerName: string,
      targetName: string,
      targetCell: [number, number],
    ) => {
      const fx = useFxStore.getState();
      const attackerIsPlayer = result.actor_id === "player";
      playSfx("melee_swing", {
        volume: attackerIsPlayer ? 0.3 : 0.25,
        playbackRate: attackerIsPlayer ? 1 : 0.92,
        cooldownMs: 70,
      });
      playSfx(result.defeated ? "melee_crit" : "melee_hit", {
        volume: result.defeated ? 0.56 : 0.42,
        cooldownMs: 80,
      });
      fx.addPopup(
        targetCell,
        `${result.mitigated_damage}`,
        attackerIsPlayer ? "#ffffff" : "#f87171",
      );
      fx.flashEntity(result.target_actor_id);
      if (result.cover_reduction > 0) {
        fx.addPopup(targetCell, `Cover -${result.cover_reduction}`, "#7dd3fc", 1.52);
      }
      if (result.flanked) {
        fx.addPopup(targetCell, "Flanked +2", "#fbbf24", 1.78);
      }
      if (result.height_bonus !== 0) {
        fx.addPopup(
          targetCell,
          result.height_bonus > 0 ? `High +${result.height_bonus}` : `Low ${result.height_bonus}`,
          result.height_bonus > 0 ? "#bef264" : "#fb7185",
          2.04,
        );
      }
      if (result.defeated) {
        fx.addPopup(targetCell, "x", "#f87171", 2.28);
        playSfx("enemy_defeat", { volume: 0.5, cooldownMs: 180 });
      }

      const modifiers: string[] = [];
      if (result.cover_reduction > 0) {
        modifiers.push(`${result.cover?.strength || "cover"} cover -${result.cover_reduction}`);
      }
      if (result.flanked) modifiers.push(`flanked +${result.facing_bonus}`);
      if (result.height_bonus !== 0) modifiers.push(`height ${result.height_bonus > 0 ? "+" : ""}${result.height_bonus}`);
      const modifierText = modifiers.length ? ` (${modifiers.join(", ")})` : "";
      const verb = attackerIsPlayer ? "You strike" : `${attackerName} strikes`;
      addLog(`${verb} ${targetName} for ${result.mitigated_damage}${modifierText}.`);
      if (result.defeated) addLog(`${targetName} is defeated!`);
    },
    [addLog, playSfx],
  );

  const presentSkillOutcome = useCallback(
    (outcome: SkillCastOutcome) => {
      const fx = useFxStore.getState();
      addLog(
        outcome.casterId === "player"
          ? `You cast ${outcome.skillName}!`
          : `${outcome.casterName} casts ${outcome.skillName}!`,
      );
      playSfx("spell_cast", { volume: 0.45, cooldownMs: 180 });
      if (outcome.hits.length === 0) {
        playSfx("warning", { volume: 0.28, cooldownMs: 200 });
        addLog("It strikes nothing but air.");
      }
      for (const hit of outcome.hits) {
        if (hit.payloadType === "damage") {
          fx.addPopup(hit.cell, `${hit.amount}${hit.crit ? "!" : ""}`, hit.crit ? "#fbbf24" : "#c4b5fd");
          if (hit.targetKind === "player") fx.markPlayerHurt();
          else fx.flashEntity(hit.targetId);
          playSfx("spell_hit", { volume: hit.crit ? 0.58 : 0.42, cooldownMs: 80 });
          addLog(
            hit.targetKind === "player"
              ? `You were hit for ${hit.amount} damage.`
              : hit.crit
                ? `Critical! ${outcome.skillName} hits ${hit.targetName} for ${hit.amount}!`
                : `${outcome.skillName} hits ${hit.targetName} for ${hit.amount}.`,
          );
        } else if (hit.payloadType === "heal") {
          fx.addPopup(hit.cell, `+${hit.amount}`, "#4ade80");
          playSfx("heal", { volume: 0.42, cooldownMs: 120 });
          addLog(hit.targetKind === "player" ? `Restored ${hit.amount} HP.` : `Healed ${hit.targetName} for ${hit.amount} HP.`);
        } else if (hit.payloadType === "status" && hit.statusId) {
          const def = getStatusDef(hit.statusId);
          fx.addPopup(hit.cell, def.icon, def.kind === "buff" ? "#4ade80" : "#c084fc");
          addLog(hit.targetKind === "player" ? `You gain ${def.displayName}.` : `${hit.targetName}: ${def.displayName}.`);
        } else if (hit.payloadType === "emotional") {
          const deltas = hit.emotionalImpulse || {};
          const parts = EMOTIONAL_AXIS_DEFS
            .map((axis) => ({ axis, delta: Math.round(deltas[axis.key] ?? 0) }))
            .filter((entry) => entry.delta !== 0);
          const summary = parts
            .map(({ axis, delta }) => `${axis.label} ${delta > 0 ? "+" : ""}${delta}`)
            .join(", ");
          const strongest = parts.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
          const behaviorNote =
            hit.emotionalBehavior && hit.emotionalBehavior !== "calm" && hit.emotionalBehavior !== "attack"
              ? ` — ${hit.emotionalBehavior.replace(/_/g, " ")}`
              : "";
          if (strongest) {
            fx.addPopup(
              hit.cell,
              `${strongest.axis.label} ${strongest.delta > 0 ? "+" : ""}${strongest.delta}`,
              strongest.axis.color,
            );
          }
          playSfx("dialogue_next", { volume: 0.26, cooldownMs: 120 });
          addLog(
            hit.targetKind === "player"
              ? `It lands on you: ${summary}${behaviorNote}.`
              : `${hit.targetName} feels it: ${summary || "nothing shifts"}${behaviorNote}.`,
          );
        }
        if (hit.targetDead) {
          fx.addPopup(hit.cell, "x", "#f87171");
          playSfx("enemy_defeat", { volume: 0.45, cooldownMs: 180 });
          addLog(hit.targetKind === "player" ? "You have fallen." : `${hit.targetName} is defeated!`);
        }
      }
      for (const experience of outcome.experience || []) {
        logCoreExperience(experience);
      }
    },
    [addLog, logCoreExperience, playSfx],
  );

  const presentCombatShoveOutcome = useCallback(
    (result: ImmersiveCombatForcedMovementResult, targetName: string) => {
      const fx = useFxStore.getState();
      const finalCell = result.to || result.from || [0, 0];
      const reactionSummary = uniqueShortList(
        result.reactions.map((reaction) =>
          IMMERSIVE_REACTION_LABELS[reaction.rule_id] || titleCaseEffect(reaction.rule_id),
        ),
      );
      const defeated = Boolean(
        result.world_facts.some(
          (fact) => fact.direct_consequences?.defeated === true,
        ),
      );

      playSfx("bump", { volume: 0.38, cooldownMs: 90 });
      fx.pulseScreen(result.hazard_damage > 0 ? 0.62 : 0.32);
      fx.addPopup(finalCell, "Shoved", "#fcd34d", 1.42);
      fx.flashEntity(result.target_actor_id);

      if (result.hazard_damage > 0) {
        playSfx("spell_hit", { volume: 0.46, cooldownMs: 120 });
        fx.addPopup(finalCell, `-${result.hazard_damage}`, "#fb7185", 1.76);
      }
      result.overwatch_triggers.slice(0, 2).forEach((trigger, index) => {
        fx.addPopup(trigger.cell, `Overwatch -${trigger.damage}`, "#f87171", 1.92 + index * 0.28);
      });
      if (defeated) {
        playSfx("enemy_defeat", { volume: 0.45, cooldownMs: 180 });
        fx.addPopup(finalCell, "x", "#f87171", 2.08);
      }

      if (result.from && result.to) {
        addLog(
          `Shoved ${targetName} from (${result.from[0]}, ${result.from[1]}) to (${result.to[0]}, ${result.to[1]}).`,
        );
      } else {
        addLog(`Shoved ${targetName}.`);
      }
      if (result.hazard_damage > 0) {
        const sources = uniqueShortList(result.hazard_sources.map(titleCaseEffect));
        addLog(`${targetName} takes ${result.hazard_damage} hazard damage${sources ? ` from ${sources}` : ""}.`);
      }
      if (reactionSummary) addLog(`World reaction: ${reactionSummary}.`);
      if (result.overwatch_triggers.length > 0) {
        addLog(`Overwatch fired ${result.overwatch_triggers.length} time${result.overwatch_triggers.length === 1 ? "" : "s"}.`);
      }
      if (defeated) addLog(`${targetName} is defeated!`);
    },
    [addLog, playSfx],
  );

  const presentImmersiveVerbFailure = useCallback(
    (verb: PlayModeWheelVerbKind, cell: [number, number], reason: string) => {
      const fx = useFxStore.getState();
      playSfx("warning", { volume: 0.34, cooldownMs: 180 });
      fx.addPopup(cell, "No effect", "#f87171", 1.35);
      setVerbFeedback({
        id: inputNow(),
        title: `${PLAYMODE_VERB_PAST_TENSE[verb] || titleCaseEffect(verb)} failed`,
        detail: reason,
        tone: "fail",
        cell,
      });
      addLog(reason);
    },
    [addLog, playSfx],
  );

  const presentImmersiveVerbOutcome = useCallback(
    (result: ImmersiveGlobalVerbResult, itemName?: string) => {
      const fx = useFxStore.getState();
      const verb = result.verb.verb;
      const presentation =
        IMMERSIVE_VERB_PRESENTATION[verb] || {
          title: titleCaseEffect(verb),
          popup: titleCaseEffect(verb),
          color: "#ddd6fe",
          tone: "neutral" as VerbFeedbackTone,
          sfx: "spell_cast",
          volume: 0.34,
          pulse: 0.35,
        };
      const effectCell = effectCellForVerbResult(result);
      const detail = worldSummaryForVerbResult(result);
      const reactionSummary = reactionSummaryForVerbResult(result);
      const title = verb === "drop" && itemName ? `Dropped ${itemName}` : presentation.title;

      playSfx(presentation.sfx, {
        volume: presentation.volume,
        playbackRate: presentation.playbackRate,
        cooldownMs: 90,
      });
      if (result.reactions.length > 0) {
        playSfx("spell_hit", {
          volume: Math.min(0.65, presentation.volume + 0.16),
          playbackRate: verb === "electrify" ? 1.42 : 0.96,
          cooldownMs: 120,
        });
      }
      fx.pulseScreen(presentation.pulse);
      fx.addPopup(
        effectCell,
        verb === "drop" && itemName ? itemName : presentation.popup,
        presentation.color,
        1.38,
      );
      result.reactions.slice(0, 3).forEach((reaction, index) => {
        fx.addPopup(
          reaction.cell,
          IMMERSIVE_REACTION_LABELS[reaction.rule_id] || titleCaseEffect(reaction.rule_id),
          "#fef3c7",
          1.78 + index * 0.28,
        );
      });

      setVerbFeedback({
        id: inputNow(),
        title,
        detail,
        tone: presentation.tone,
        cell: effectCell,
      });

      if (verb === "drop" && itemName) {
        addLog(`Dropped ${itemName} at (${effectCell[0]}, ${effectCell[1]}).`);
      } else {
        addLog(`${presentation.title} at (${effectCell[0]}, ${effectCell[1]}).`);
      }
      if (reactionSummary) addLog(`World reaction: ${reactionSummary}.`);
      else addLog(detail);
    },
    [addLog, playSfx],
  );

  const completeTalkObjectivesForEntity = useCallback(
    (entityId: string, baseSave?: PlaySave | null) => {
      let nextSave = baseSave || usePlayStore.getState().saveData;
      if (!nextSave) return;
      const objectives = gamePackage.quests.flatMap((quest) =>
        quest.objectives.filter((objective) => objective.type === "talk" && objective.target_id === entityId),
      );
      for (const objective of objectives) {
        if (nextSave.flags?.[`obj_done_${objective.id}`]) continue;
        const result = dispatchV1CompleteQuestObjective({
          gamePackage,
          save: nextSave,
          objectiveId: objective.id,
          targetId: objective.target_id,
          objectiveType: objective.type,
        });
        if (result.ok) {
          commitRuntimeSave(result.save);
          usePlayStore.getState().pushEngineEvents(result.events);
          nextSave = result.save;
        }
      }
    },
    [commitRuntimeSave, gamePackage],
  );

  // Combat movement budget: a combat turn of walking covers one macro tile,
  // i.e. FINE_PER_MACRO fine steps, before the turn passes (§5.3). Any other
  // action (attack, skill, wait) ends the turn immediately and resets this.
  const combatMoveStepsRef = useRef(0);
  const combatPulseRef = useRef<
    ((options?: { advancePlayerTurn?: boolean; tickFullAction?: boolean }) => void) | null
  >(null);

  const advanceCombatTurnCore = useCallback(() => {
    combatMoveStepsRef.current = 0;
    const save = usePlayStore.getState().saveData;
    if (!save?.in_combat) return;
    if (combatPulseRef.current) {
      combatPulseRef.current();
      return;
    }
    const result = dispatchV1AdvanceCombatTurn({ gamePackage, save });
    if (result.ok) {
      commitRuntimeSave(result.save);
      usePlayStore.getState().pushEngineEvents(result.events);
    } else {
      usePlayStore.getState().advanceTurn();
    }
  }, [commitRuntimeSave, gamePackage]);

  const computeTargetPattern = useCallback(
    (targetX?: number, targetZ?: number) => {
      if (!targetingSkillId || !saveData) return [];
      const skill = gamePackage.abilities.find(
        (s) => s.id === targetingSkillId,
      );
      if (!skill) return [];

      // Patterns originate from whoever is being commanded (player, or a
      // party member on their combat turn).
      const caster = getControlledActor(saveData, gamePackage);
      if (!caster) return [];
      const hx = targetX !== undefined ? targetX : hoveredCell?.[0];
      const hz = targetZ !== undefined ? targetZ : hoveredCell?.[1];

      if (hx === undefined || hz === undefined) return [];

      const result = getV1SkillTargetCells({
        gamePackage,
        save: saveData,
        actorId: caster.key,
        skillId: skill.id,
        targetCell: [hx, hz],
      });
      return result.ok ? result.cells.map(([x, z]) => ({ x, z })) : [];
    },
    [targetingSkillId, hoveredCell, saveData, gamePackage],
  );

  const handleCellHover = useCallback(
    (x: number, z: number) => {
      if (targetingSkillId || verbTargetingRef.current) setHoveredCell([x, z]);
    },
    [targetingSkillId],
  );

  const handlePointerOut = useCallback(() => {
    setHoveredCell(null);
  }, []);

  const handleCellClick = useCallback(
    (x: number, z: number) => {
      if (!targetingSkillId || !saveData || !activeMap) return;
      if (levelUpOpenRef.current) return;
      const skill = gamePackage.abilities.find(
        (s) => s.id === targetingSkillId,
      );
      if (!skill) return;

      // Require a tap to select first if using touch, or allow direct click if hovered
      if (hoveredCell?.[0] !== x || hoveredCell?.[1] !== z) {
        setHoveredCell([x, z]);
        return;
      }

      const inCombat = !!saveData.in_combat;
      const caster = getControlledActor(saveData, gamePackage);
      if (!caster) return;

      const pattern = computeTargetPattern(x, z);
      if (pattern.length === 0) {
        playSfx("warning", { volume: 0.35, cooldownMs: 200 });
        addLog("Invalid target or out of range.");
        setTargetingSkillId(null);
        return;
      }

      // Check Costs
      if (
        !inCombat &&
        caster.isPlayer &&
        (saveData.playerStats.energy || 0) < skill.ap_cost
      ) {
        playSfx("warning", { volume: 0.35, cooldownMs: 200 });
        addLog("Not enough AP/Energy to cast.");
        setTargetingSkillId(null);
        return;
      }
      if (caster.mp < skill.mp_cost) {
        playSfx("warning", { volume: 0.35, cooldownMs: 200 });
        addLog("Not enough MP to cast.");
        setTargetingSkillId(null);
        return;
      }

      const castResult = dispatchV1CastSkill({
        gamePackage,
        save: saveData,
        actorId: caster.key,
        skillId: skill.id,
        targetCells: pattern.map((targetCell) => [targetCell.x, targetCell.z] as [number, number]),
      });
      if (!castResult.ok) {
        playSfx("warning", { volume: 0.35, cooldownMs: 200 });
        addLog(castResult.reason === "missing mp" ? "Not enough MP to cast." : "Could not cast that skill.");
        setTargetingSkillId(null);
        return;
      }
      commitRuntimeSave(castResult.save);
      usePlayStore.getState().pushEngineEvents(castResult.events);
      const outcome = castResult.events.find((event) => event.type === "skill_cast_resolved")?.payload as unknown as
        | SkillCastOutcome
        | undefined;
      if (outcome) presentSkillOutcome(outcome);

      setTargetingSkillId(null);
      setHoveredCell(null);

      // A cast is a full combat action.
      if (inCombat) advanceCombatTurnCore();
    },
    [
      targetingSkillId,
      saveData,
      activeMap,
      computeTargetPattern,
      gamePackage,
      hoveredCell,
      addLog,
      commitRuntimeSave,
      presentSkillOutcome,
      advanceCombatTurnCore,
      playSfx,
    ],
  );

  const computeTargetPatternMemo = useMemo(
    () => (targetingSkillId ? computeTargetPattern() : undefined),
    [targetingSkillId, computeTargetPattern],
  );

  // Enter targeting mode for a skill (from the hotbar, hotkeys 1-6, or the
  // skills panel). Checks costs up front so the player learns "can't afford"
  // before aiming, not after.
  const beginTargeting = useCallback(
    (skillId: string) => {
      const save = usePlayStore.getState().saveData;
      if (!save || save.playerStats.hp <= 0) return;
      if (getPendingLevelUps(save) > 0) return;
      const actor = getControlledActor(save, gamePackage);
      if (!actor) return; // an enemy is acting
      const skill = gamePackage.abilities.find((s) => s.id === skillId);
      if (!skill) return;
      if (!actor.skills.includes(skillId)) return;
      if (
        !save.in_combat &&
        actor.isPlayer &&
        (save.playerStats.energy || 0) < skill.ap_cost
      ) {
        playSfx("warning", { volume: 0.35, cooldownMs: 200 });
        addLog("Not ready to act yet.");
        return;
      }
      if (actor.mp < skill.mp_cost) {
        playSfx("warning", { volume: 0.35, cooldownMs: 200 });
        addLog(`Not enough MP for ${skill.display_name}.`);
        return;
      }
      clearInputState();
      setShowSkills(false);
      setHoveredCell(null);
      setTargetingSkillId(skillId);
      playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
      addLog(
        `${actor.isPlayer ? "Aiming" : `${actor.name} readies`} ${skill.display_name} — tap a tile, tap again to cast.`,
      );
    },
    [gamePackage, addLog, playSfx],
  );

  const targetingSkillIdRef = useRef<string | null>(null);
  useEffect(() => {
    targetingSkillIdRef.current = targetingSkillId;
  }, [targetingSkillId]);
  const abilityBarEntriesRef = useRef<AbilityBarEntry[]>([]);
  const activateAbilityRef = useRef<((entry: AbilityBarEntry) => void) | null>(null);

  const isEnemyNearbyRef = useRef<(() => boolean) & { getNearbyEnemyIds?: () => string[] } | null>(null);
  const keysDownRef = useRef<Set<string>>(new Set());
  const combatInputLockUntilRef = useRef(0);
  const combatInputNeedsReleaseRef = useRef(false);
  const combatInputHeldKeysRef = useRef<Set<string>>(new Set());
  const activeCombatTurnRef = useRef<string | null>(null);
  const repeatStateRef = useRef({
    dx: 0,
    dz: 0,
    startTime: 0,
    lastTick: 0,
    bufferStart: 0,
    active: false,
  });
  const resetRepeatInputState = useCallback(() => {
    repeatStateRef.current.active = false;
    repeatStateRef.current.bufferStart = 0;
  }, []);
  const releaseCombatInputGateIfReady = useCallback((time = inputNow()) => {
    if (time < combatInputLockUntilRef.current) return false;
    combatInputNeedsReleaseRef.current = false;
    return true;
  }, []);
  const isCombatInputGateActive = useCallback(
    (time = inputNow()) => !releaseCombatInputGateIfReady(time),
    [releaseCombatInputGateIfReady],
  );

  useEffect(() => {
    activeMapRef.current = activeMap;
  }, [activeMap]);

  // Fresh jump budget each time a cutscene starts.
  useEffect(() => {
    cutsceneJumpsRef.current = 0;
  }, [activeCutscene]);

  useEffect(() => {
    setPlayDpr(visualDprCap);
  }, [visualDprCap]);

  useEffect(() => {
    levelUpOpenRef.current = levelUpOpen;
    inputBlockedRef.current = Boolean(
      activeCutscene?.is_blocking ||
        levelUpOpen ||
        showInventory ||
        showSkills ||
        showSaveMenu ||
        showJournal ||
        targetingSkillId ||
        activeDialogueId ||
        activeShopId ||
        activeDocumentId ||
        activeContainerId ||
        activeAttendNodePanel,
    );
    if (inputBlockedRef.current) resetRepeatInputState();
    if (levelUpOpen) keysDownRef.current.clear();
  }, [
    activeCutscene,
    levelUpOpen,
    showInventory,
    showSkills,
    showSaveMenu,
    showJournal,
    targetingSkillId,
    activeDialogueId,
    activeShopId,
    activeDocumentId,
    activeContainerId,
    activeAttendNodePanel,
    resetRepeatInputState,
  ]);

  const simulateKey = useCallback((key: string, isDown: boolean) => {
    const normalizedKey = key.toLowerCase();
    if (isMovementCommandKey(normalizedKey)) {
      if (!isDown) {
        combatInputHeldKeysRef.current.delete(normalizedKey);
        releaseCombatInputGateIfReady();
      } else if (combatInputHeldKeysRef.current.has(normalizedKey) || isCombatInputGateActive()) {
        combatInputHeldKeysRef.current.add(normalizedKey);
        keysDownRef.current.delete(normalizedKey);
        resetRepeatInputState();
        return;
      }
    }
    if (isDown) keysDownRef.current.add(normalizedKey);
    else keysDownRef.current.delete(normalizedKey);
  }, [isCombatInputGateActive, releaseCombatInputGateIfReady, resetRepeatInputState]);

  // ── Virtual Joystick ──────────────────────────────────────────────────────
  const JOYSTICK_DEAD = 14;
  const JOYSTICK_MAX = 54;

  const joystickActive = useRef(false);
  const joystickPointerId = useRef<number | null>(null);
  const joystickBase = useRef({ x: 0, y: 0 });
  const joystickKeysRef = useRef(new Set<string>());
  const joystickOverlayRef = useRef<HTMLDivElement>(null);

  // Flush all held keys and joystick state — call before opening any blocking panel so
  // inputs can't re-fire the moment the panel closes.
  const clearInputState = () => {
    keysDownRef.current.clear();
    joystickKeysRef.current.forEach((k) => simulateKey(k, false));
    joystickKeysRef.current.clear();
    combatInputHeldKeysRef.current.clear();
    combatInputNeedsReleaseRef.current = false;
    joystickActive.current = false;
    joystickPointerId.current = null;
    resetRepeatInputState();
    setJoystickVis({ visible: false, baseX: 0, baseY: 0, thumbX: 0, thumbY: 0 });
  };

  useEffect(() => {
    const activeTurn = saveData?.in_combat
      ? (saveData.active_turn_id ?? null)
      : null;
    const previousTurn = activeCombatTurnRef.current;

    if (!activeTurn) {
      activeCombatTurnRef.current = null;
      combatInputLockUntilRef.current = 0;
      combatInputNeedsReleaseRef.current = false;
      combatInputHeldKeysRef.current.clear();
      return;
    }

    if (previousTurn === activeTurn) return;

    // Suppress only keyboard keys physically held at the turn boundary.
    // A carried-over key should not auto-spend the new turn, but it also
    // should not block a fresh different direction.
    // Joystick keys live in combatInputHeldKeysRef (not keysDownRef) and are
    // continuously re-fired by pointer events, so including them here would
    // permanently lock the gate — the joystick never "releases".
    const heldKeyboardKeys = new Set(
      [...keysDownRef.current].filter(isMovementCommandKey),
    );
    activeCombatTurnRef.current = activeTurn;
    clearInputState();
    combatInputHeldKeysRef.current = heldKeyboardKeys;
    combatInputNeedsReleaseRef.current = false;
    combatInputLockUntilRef.current =
      inputNow() + COMBAT_ACTOR_SWITCH_INPUT_DELAY_MS;
  }, [saveData?.in_combat, saveData?.active_turn_id]);

  // Status-effect tick: when player-side control changes, advance that actor's
  // statuses. Enemy statuses advance inside the simultaneous combat pulse.
  const prevStatusTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const save = usePlayStore.getState().saveData;
    const turn = save?.in_combat ? (save.active_turn_id ?? null) : null;
    const turnKey = turn ? `${turn}:${combatTurnSerial}` : null;
    if (prevStatusTurnRef.current === turnKey) return;
    prevStatusTurnRef.current = turnKey;
    if (!save || !turn) return;
    const statuses: StatusInstance[] | undefined =
      turn === "player"
        ? save.actor_statuses?.["player"]
        : (save.entity_states?.[turn] as any)?.statuses;
    if (!statuses || statuses.length === 0) return;
    const result = tickStatuses(statuses);
    const fx = useFxStore.getState();
    const popup = (cell: [number, number]) => {
      if (result.hpDelta === 0) return;
      fx.addPopup(cell, `${result.hpDelta > 0 ? "+" : ""}${result.hpDelta}`, result.hpDelta > 0 ? "#4ade80" : "#f87171");
    };
    if (turn === "player") {
      let next = { ...save, actor_statuses: { ...(save.actor_statuses || {}), player: result.instances } };
      if (result.hpDelta !== 0) {
        const hp = Math.max(0, Math.min(next.playerStats.max_hp, next.playerStats.hp + result.hpDelta));
        next = { ...next, playerStats: { ...next.playerStats, hp } };
        popup(save.player.cell);
        if (result.hpDelta < 0) fx.markPlayerHurt();
      }
      usePlayStore.getState().commitRuntimeSave(next);
    } else {
      const est: any = { ...(save.entity_states?.[turn] || {}) };
      est.statuses = result.instances;
      let dotKilled = false;
      if (result.hpDelta !== 0 && est.cell) {
        est.hp = Math.max(0, (est.hp ?? 9999) + result.hpDelta);
        popup(est.cell);
        if (est.hp <= 0 && !est.dead) {
          est.dead = true;
          dotKilled = true;
        }
      }
      usePlayStore.getState().commitRuntimeSave({
        ...save,
        entity_states: { ...(save.entity_states || {}), [turn]: est },
      });
      // Player-side damage over time can drop a companion before they act.
      if (dotKilled && activeMap) {
        const idx = (activeMap.entity_placements || []).findIndex(
          (pl, i) => entityPlacementStateKey(activeMap.id, pl, i) === turn,
        );
        const def =
          idx >= 0
            ? useEngineStore
                .getState()
                .gamePackage.entities.find(
                  (e) => e.id === activeMap.entity_placements[idx].entity_id,
                )
            : undefined;
        if (def) {
          playSfx("enemy_defeat", { volume: 0.4, cooldownMs: 180 });
          addLog(`${def.display_name} falls to their wounds.`);
        }
      }
    }
    // A skipped ally still advances the whole field before control passes.
    if (result.skipTurn) {
      usePlayStore
        .getState()
        .addLog("Stunned — the action is lost.");
      advanceCombatTurnCore();
    }
  }, [
    advanceCombatTurnCore,
    combatTurnSerial,
    saveData?.active_turn_id,
    saveData?.in_combat,
  ]);

  // Non-passive touchmove on document so preventDefault() actually stops iOS page scroll
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => { if (joystickActive.current) e.preventDefault(); };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, []);
  const [joystickVis, setJoystickVis] = useState<{
    visible: boolean; baseX: number; baseY: number; thumbX: number; thumbY: number;
  }>({ visible: false, baseX: 0, baseY: 0, thumbX: 0, thumbY: 0 });

  const joystickStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickActive.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    joystickActive.current = true;
    joystickPointerId.current = e.pointerId;
    joystickBase.current = { x, y };
    setJoystickVis({ visible: true, baseX: x, baseY: y, thumbX: x, thumbY: y });
  }, []);

  const joystickMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickActive.current || e.pointerId !== joystickPointerId.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const dx = cx - joystickBase.current.x;
    const dy = cy - joystickBase.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = dist > JOYSTICK_MAX ? JOYSTICK_MAX / dist : 1;
    const thumbX = joystickBase.current.x + dx * clamp;
    const thumbY = joystickBase.current.y + dy * clamp;
    setJoystickVis({ visible: true, baseX: joystickBase.current.x, baseY: joystickBase.current.y, thumbX, thumbY });

    const prev = joystickKeysRef.current;
    const next = new Set<string>();
    if (dist >= JOYSTICK_DEAD) {
      const deg = Math.atan2(dy, dx) * (180 / Math.PI);
      // Snap to one of 8 fixed 45° sectors so diagonal zones never jitter at boundaries.
      // Math.round(deg/45) gives -4..4; normalise to 0-7.
      // Sector map (screen coords, y-axis down):
      //   0=E  1=SE  2=S  3=SW  4=W  5=NW  6=N  7=NE
      const s = ((Math.round(deg / 45) % 8) + 8) % 8;
      if (s === 5 || s === 6 || s === 7) next.add("arrowup");    // NW, N, NE
      if (s === 1 || s === 2 || s === 3) next.add("arrowdown");  // SE, S, SW
      if (s === 7 || s === 0 || s === 1) next.add("arrowright"); // NE, E, SE
      if (s === 3 || s === 4 || s === 5) next.add("arrowleft");  // SW, W, NW
    }
    prev.forEach(k => { if (!next.has(k)) simulateKey(k, false); });
    next.forEach(k => { if (!prev.has(k)) simulateKey(k, true); });
    joystickKeysRef.current = next;
  }, [simulateKey]);

  const joystickEnd = useCallback(() => {
    joystickActive.current = false;
    joystickPointerId.current = null;
    joystickKeysRef.current.forEach(k => simulateKey(k, false));
    joystickKeysRef.current.clear();
    setJoystickVis(v => ({ ...v, visible: false }));
  }, [simulateKey]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    isEnemyNearbyRef.current = () => {
      const currentSave = usePlayStore.getState().saveData;
      const currentMap = activeMapRef.current;
      if (!currentSave || !currentMap) return false;
      const px = currentSave.player.cell[0];
      const pz = currentSave.player.cell[1];

      for (let i = 0; i < currentMap.entity_placements.length; i++) {
        const p = currentMap.entity_placements[i];
        if ((currentSave.party_members || []).includes(p.entity_id)) continue;
        const key = entityPlacementStateKey(currentMap.id, p, i);
        const state = currentSave.entity_states?.[key];
        if (state?.dead || state?.hidden) continue;

        const ex = state?.cell ? state.cell[0] : p.cell[0];
        const ez = state?.cell ? state.cell[1] : p.cell[1];

        const dist = Math.abs(px - ex) + Math.abs(pz - ez);
        if (dist <= 2) {
          const entityData = useEngineStore
            .getState()
            .gamePackage.entities.find((e) => e.id === p.entity_id);
          if (entityData && !entityData.is_npc) {
            return true;
          }
        }
      }
      return false;
    };
  }, []);

  // Combat / ambient music switcher. Engaging any living hostile swaps to the
  // combat track; disengaging restores whatever ambient track was playing
  // before (map music set by on_load cutscenes survives the fight).
  const ambientMusicRef = useRef<string | null>(null);
  useEffect(() => {
    const DEFAULT_COMBAT_TRACK = "/music/le-cauchemar-abstrait.mp3";
    const TOWN_TRACK = "/music/l-ombre-des-bles.mp3";
    const interval = setInterval(() => {
      if (activeCutscene) return;

      const save = usePlayStore.getState().saveData;
      const map = activeMapRef.current;
      const gp = getRuntimeGamePackage();
      const combatTrack =
        gp.settings?.music_tracks?.combat || DEFAULT_COMBAT_TRACK;
      const engaged =
        getNearbyHostiles(save, map, gp, THREAT_RADIUS).length > 0;
      const current = getCurrentMusicUrl();

      if (engaged) {
        if (current !== combatTrack) {
          ambientMusicRef.current = current;
          playMusic(combatTrack, { loop: true });
        }
      } else if (current === combatTrack) {
        playMusic(ambientMusicRef.current || TOWN_TRACK, { loop: true });
      } else if (!current) {
        playMusic(TOWN_TRACK, { loop: true });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [activeCutscene]);

  useEffect(() => {
    const currentSave = usePlayStore.getState().saveData;
    if (!currentSave || !activeMap || activeCutscene || currentSave.in_combat) return;
    if (!mapHasPerceivingActor) return;
    const playerCell = currentSave.player.cell || [0, 0];
    const key = [
      activeMap.id,
      Math.floor(currentSave.clock_minutes || 0),
      playerCell[0],
      playerCell[1],
    ].join(":");
    if (perceptionAdvanceKeyRef.current === key) return;
    perceptionAdvanceKeyRef.current = key;

    const result = advanceImmersivePerceptionForSave(gamePackage, currentSave, activeMap.id);
    presentStealthPerceptionFeedback(result, currentSave);
    const previousFeedback = currentSave.flags?.immersive_stealth_feedback as StealthFeedbackRecord | undefined;
    const nextFeedback = result.save.flags?.immersive_stealth_feedback as StealthFeedbackRecord | undefined;
    const feedbackChanged =
      (previousFeedback?.highest_alertness || "oblivious") !== (nextFeedback?.highest_alertness || "oblivious") ||
      Number(previousFeedback?.visible_to_count || 0) !== Number(nextFeedback?.visible_to_count || 0) ||
      Number(previousFeedback?.alerted_count || 0) !== Number(nextFeedback?.alerted_count || 0) ||
      Number(previousFeedback?.strongest_score || 0) !== Number(nextFeedback?.strongest_score || 0);

    if (result.world_facts.length > 0 || result.decayed_alerts.length > 0 || feedbackChanged) {
      commitRuntimeSave(result.save);
    }
  }, [
    activeCutscene,
    activeMap,
    commitRuntimeSave,
    gamePackage,
    mapHasPerceivingActor,
    presentStealthPerceptionFeedback,
    saveData?.clock_minutes,
    saveData?.current_map_id,
    saveData?.in_combat,
    playerMacroX,
    playerMacroZ,
  ]);

  useEffect(() => {
    const currentSave = usePlayStore.getState().saveData;
    if (!currentSave || !activeMap || activeCutscene || currentSave.in_combat) return;
    const playerCell = currentSave.player.cell || [0, 0];
    // O(1) region lookup — the full-map cell scan this used to do ran on every
    // fine step.
    const currentCell = getActiveCell(playerCell[0], playerCell[1]);
    const regionId = currentCell?.region_id || currentCell?.room_id || "map";
    const key = [
      activeMap.id,
      regionId,
      Math.floor((currentSave.clock_minutes || 0) / 60),
    ].join(":");
    if (worldStateAdvanceKeyRef.current === key) return;
    worldStateAdvanceKeyRef.current = key;

    const result = advanceImmersiveWorldStateForSave(gamePackage, currentSave, {
      mapId: activeMap.id,
    });
    presentWorldStateFeedback(result);
    commitRuntimeSave(result.save);
  }, [
    activeCutscene,
    activeMap,
    commitRuntimeSave,
    gamePackage,
    presentWorldStateFeedback,
    saveData?.clock_minutes,
    saveData?.current_map_id,
    saveData?.in_combat,
    playerMacroX,
    playerMacroZ,
  ]);

  // ── Combat orchestration ──────────────────────────────────────────────────
  // Engage when a living hostile closes to THREAT_RADIUS: party followers
  // become positioned combatants and initiative is rolled from speed
  // (player, party, and enemies all in one queue). Reinforcements join the
  // back of the order; combat ends when nothing hostile remains within
  // CHASE_RADIUS.
  useEffect(() => {
    if (!saveData || !activeMap || activeCutscene) return;
    if (saveData.playerStats.hp <= 0) return;
    const gp = getRuntimeGamePackage();
    const store = usePlayStore.getState();

    const result = dispatchV1UpdateCombatSession({
      gamePackage: gp,
      save: saveData,
      mapId: activeMap.id,
      threatRadius: THREAT_RADIUS,
      chaseRadius: CHASE_RADIUS,
      partyFollowers: (latestPartyFollowersRef.current || []).map((follower) => ({
        entityId: follower.entity_id,
        cell: follower.cell,
      })),
    });
    const sessionEvent = result.events.find((event) =>
      event.type === "combat_started" ||
      event.type === "combat_reinforced" ||
      event.type === "combat_ended",
    );
    if (!result.ok) return;
    if (!sessionEvent) {
      const queueChanged =
        result.save.active_turn_id !== saveData.active_turn_id ||
        (result.save.combat_queue || []).join("|") !==
          (saveData.combat_queue || []).join("|");
      if (queueChanged) commitRuntimeSave(result.save);
      return;
    }

    commitRuntimeSave(result.save);
    store.pushEngineEvents(result.events);
    const outcome = sessionEvent.payload as unknown as CombatSessionUpdateOutcome;
    if (outcome.status === "started") {
      playSfx("warning", { volume: 0.3, cooldownMs: 180 });
      store.addLog("Battle joined — the field moves when you act.");
    } else if (outcome.status === "reinforced") {
      playSfx("warning", { volume: 0.22, cooldownMs: 180 });
      store.addLog("Something else has noticed you.");
    } else if (outcome.status === "ended") {
      store.addLog("Combat ends. You regroup.");
      playSfx("ui_back", { volume: 0.2, cooldownMs: 180 });
      logCoreExperience(outcome.experience);
    }
  }, [saveData, activeMap, activeCutscene, commitRuntimeSave, logCoreExperience, playSfx]);

  // Every player fine step advances hostile movement by one fine cell. Full
  // actions additionally tick statuses and pass control to the next living
  // player/party actor in speed order.
  const resolveCombatPulse = useCallback((options: {
    advancePlayerTurn?: boolean;
    tickFullAction?: boolean;
  } = {}) => {
    const advancePlayerTurn = options.advancePlayerTurn !== false;
    const tickFullAction = options.tickFullAction !== false;
    const store = usePlayStore.getState();
    let nextSave = store.saveData;
    if (!nextSave?.in_combat || !activeMap || nextSave.playerStats.hp <= 0) return;
    if (activeCutscene) return;

    const gp = getRuntimeGamePackage();
    const events: typeof store.engineEvents = [];
    const defeated = new Map<string, GamePackage["entities"][number]>();
    const hostiles = getV1NearbyHostiles({
      gamePackage: gp,
      save: nextSave,
      mapId: activeMap.id,
      radius: CHASE_RADIUS,
    });

    const actingHostileIds: string[] = [];
    for (const hostile of hostiles) {
      const state = nextSave.entity_states?.[hostile.id] || {};
      const statuses = state.statuses as StatusInstance[] | undefined;
      if (tickFullAction && statuses?.length) {
        const tick = tickStatuses(statuses);
        const hp = Math.max(0, (state.hp ?? hostile.maxHp) + tick.hpDelta);
        nextSave = {
          ...nextSave,
          entity_states: {
            ...(nextSave.entity_states || {}),
            [hostile.id]: {
              ...state,
              statuses: tick.instances,
              hp,
              dead: state.dead || hp <= 0,
            },
          },
        };
        if (tick.hpDelta !== 0) {
          useFxStore.getState().addPopup(
            hostile.cell,
            `${tick.hpDelta > 0 ? "+" : ""}${tick.hpDelta}`,
            tick.hpDelta > 0 ? "#4ade80" : "#f87171",
          );
        }
        if (hp <= 0) {
          const def = gp.entities.find((entity) => entity.id === hostile.entityId);
          if (def) defeated.set(hostile.id, def);
          playSfx("enemy_defeat", { volume: 0.4, cooldownMs: 180 });
          addLog(`${hostile.name} succumbs to its wounds.`);
          continue;
        }
        if (tick.skipTurn) {
          addLog(`${hostile.name} is stunned and cannot act.`);
          continue;
        }
      }

      actingHostileIds.push(hostile.id);
    }

    const pulse = dispatchV1EnemyPulse({
        gamePackage: gp,
        save: nextSave,
        mapId: activeMap.id,
        actorIds: actingHostileIds,
        movementSteps: 1,
        allowAttack: tickFullAction,
    });
    if (pulse.ok) {
      nextSave = pulse.save;
      events.push(...pulse.events);
    }

    pulse.events
      .filter((event) => event.type === "melee_attack_resolved")
      .forEach((event) => presentMeleeOutcome(event.payload as unknown as CombatAttackOutcome));

    const enemyOutcomes = pulse.events
      .filter((event) => event.type === "enemy_turn_resolved")
      .map((event) => event.payload as unknown as EnemyTurnOutcome);
    if (enemyOutcomes.some((outcome) => outcome.kind === "move")) {
      playSfx("footstep_stone", { volume: 0.18, playbackRate: 0.9, cooldownMs: 90 });
    }
    for (const outcome of enemyOutcomes) {
      if (outcome?.kind === "move") {
        if (outcome.reason === "flee") addLog(`${outcome.actorName || "The enemy"} breaks and flees.`);
        if (outcome.toCell && outcome.actorId) {
          const watch = applyImmersiveOverwatchToMovementSave(gp, nextSave, {
            mapId: activeMap.id,
            actorId: outcome.actorId,
            path: [outcome.toCell],
          });
          if (watch.triggers.length > 0) {
            nextSave = watch.save;
            const fx = useFxStore.getState();
            watch.triggers.forEach((trigger) => {
              fx.addPopup(trigger.cell, `Overwatch! ${trigger.damage}`, "#93c5fd", 1.5);
              fx.flashEntity(trigger.target_actor_id);
              const watcherName = trigger.actor_id === "player" ? "You" : trigger.actor_id;
              addLog(
                `${watcherName} ${trigger.actor_id === "player" ? "catch" : "catches"} ${
                  outcome.actorName || "the enemy"
                } moving — reaction hit for ${trigger.damage}.`,
              );
            });
            playSfx("melee_hit", { volume: 0.5, cooldownMs: 120 });
            if (watch.save.entity_states?.[outcome.actorId]?.dead) {
              const hostile = hostiles.find((candidate) => candidate.id === outcome.actorId);
              const def = gp.entities.find((entity) => entity.id === hostile?.entityId);
              if (def) defeated.set(outcome.actorId, def);
              addLog(`${outcome.actorName || "The enemy"} drops mid-stride.`);
            }
          }
        }
      } else if (outcome?.kind === "skip") {
        const who = outcome.actorName || "The enemy";
        if (outcome.reason === "paralyzed") addLog(`${who} is transfixed and cannot act.`);
        else if (outcome.reason === "fade") addLog(`${who} has stopped struggling.`);
        else if (outcome.reason === "defending") addLog(`${who} holds its ground, guarding.`);
        else if (outcome.reason === "flee_blocked") addLog(`${who} is cornered, frozen in fear.`);
      }
    }

    if (advancePlayerTurn) {
      const advanced = dispatchV1AdvanceCombatTurn({ gamePackage: gp, save: nextSave });
      if (advanced.ok) {
        nextSave = advanced.save;
        events.push(...advanced.events);
      }
    }
    commitRuntimeSave(nextSave);
    store.pushEngineEvents(events);
    defeated.forEach((def) => handleEnemyDefeatedExperience(def));
  }, [
    activeCutscene,
    activeMap,
    addLog,
    commitRuntimeSave,
    handleEnemyDefeatedExperience,
    playSfx,
    presentMeleeOutcome,
  ]);

  useEffect(() => {
    combatPulseRef.current = resolveCombatPulse;
    return () => {
      if (combatPulseRef.current === resolveCombatPulse) combatPulseRef.current = null;
    };
  }, [resolveCombatPulse]);

  // Overwatch is a combat stance — disarm it when combat ends so the flag
  // doesn't linger into exploration.
  useEffect(() => {
    const save = usePlayStore.getState().saveData;
    if (!save || save.in_combat) return;
    if (!save.flags?.immersive_overwatch_player) return;
    commitRuntimeSave({
      ...save,
      flags: { ...(save.flags || {}), immersive_overwatch_player: false },
    });
  }, [saveData?.in_combat, commitRuntimeSave]);

  // Cutscene Runner
  useEffect(() => {
    if (
      !activeCutscene ||
      activeDialogueId !== null ||
      activeDocumentId !== null ||
      activeShopId !== null ||
      activeContainerId !== null
    )
      return;

    let isCancelled = false;

    const runAction = async () => {
      const action = activeCutscene.actions[cutsceneActionIndex];
      if (!action) {
        setActiveCutscene(null);
        setCutsceneActionIndex(0);
        // A finished cutscene always hands the camera back to the player.
        setCameraFocusOverride(null);
        return;
      }

      const finishAction = () => {
        if (!isCancelled) setCutsceneActionIndex((prev) => prev + 1);
      };

      if (action.type === "wait") {
        setTimeout(finishAction, action.duration || 1000);
      } else if (action.type === "show_dialogue") {
        setScreenFade((current) => ({
          ...current,
          opacity: 0,
          duration: Math.min(current.duration, 250),
        }));
        const dialogue = useEngineStore
          .getState()
          .gamePackage.dialogue.find((d) => d.id === action.dialogue_id);
        const startNodeId = action.node_id || dialogue?.nodes[0]?.id || "start";
        usePlayStore
          .getState()
          .startDialogue(action.dialogue_id, startNodeId);
        playSfx("dialogue_open", { volume: action.volume ?? 0.34, cooldownMs: 120 });
        finishAction();
      } else if (action.type === "set_switch") {
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1SetSwitch({
                gamePackage: getRuntimeGamePackage(),
                save,
                switchId: action.switch_id,
                value: action.switch_value ?? true,
              })
            : null,
          () => usePlayStore.getState().setFlag(action.switch_id, action.switch_value ?? true),
        );
        finishAction();
      } else if (action.type === "move_player") {
        if (action.cell) {
          const save = usePlayStore.getState().saveData;
          const facing =
            action.facing ||
            usePlayStore.getState().saveData?.player.facing || [0, 1];
          commitCutsceneState(
            save
              ? dispatchV1SetPlayerPosition({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  cell: action.cell,
                  facing,
                })
              : null,
            () => usePlayStore.getState().updatePlayer(action.cell, facing),
          );
        }
        finishAction();
      } else if (action.type === "move_entity") {
        if (action.entity_id && action.cell && activeMap) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1SetEntityPosition({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  entityId: action.entity_id,
                  cell: action.cell,
                  facing: action.facing,
                })
              : null,
            () => {
              const entityIndex = activeMap.entity_placements.findIndex(
                (placement) => placement.entity_id === action.entity_id,
              );
              if (entityIndex >= 0) {
                usePlayStore
                  .getState()
                  .updateEntityState(
                    entityPlacementStateKey(
                      activeMap.id,
                      activeMap.entity_placements[entityIndex],
                      entityIndex,
                    ),
                    {
                      cell: action.cell,
                      facing: action.facing,
                    },
                  );
              }
            },
          );
        }
        finishAction();
      } else if (action.type === "teleport_player") {
        playSfx("door_transition", {
          volume: action.volume ?? 0.42,
          cooldownMs: 140,
        });
        const save = usePlayStore.getState().saveData;
        const cell = action.cell || [0, 0];
        const facing = action.facing || [0, -1];
        commitCutsceneState(
          save
            ? dispatchV1TeleportPlayer({
                gamePackage: getRuntimeGamePackage(),
                save,
                mapId: action.map_id,
                cell,
                facing,
              })
            : null,
          () => {
            if (
              action.map_id &&
              action.map_id !== usePlayStore.getState().saveData?.current_map_id
            ) {
              usePlayStore.getState().loadMap(action.map_id, cell, facing);
            } else {
              usePlayStore.getState().updatePlayer(cell, facing);
            }
          },
        );
        finishAction();
      } else if (action.type === "give_item") {
        if (action.item_id) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1GiveItem({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  itemId: action.item_id,
                  count: action.amount || 1,
                })
              : null,
            () => usePlayStore.getState().giveItem(action.item_id, action.amount || 1),
          );
          playSfx("item_pickup", {
            volume: action.volume ?? 0.4,
            cooldownMs: 120,
          });
          const item = useEngineStore
            .getState()
            .gamePackage.items.find((i) => i.id === action.item_id);
          if (item)
            usePlayStore
              .getState()
              .addLog(`Obtained ${action.amount || 1}x ${item.display_name}.`);
        }
        finishAction();
      } else if (action.type === "remove_item") {
        if (action.item_id) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1RemoveItem({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  itemId: action.item_id,
                  count: action.amount || 1,
                })
              : null,
            () => usePlayStore.getState().removeItem(action.item_id, action.amount || 1),
          );
          playSfx("ui_back", { volume: 0.18, cooldownMs: 120 });
        }
        finishAction();
      } else if (action.type === "set_player_sprite") {
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1SetPlayerSprite({
                gamePackage: getRuntimeGamePackage(),
                save,
                spriteId: action.sprite_id,
              })
            : null,
          () => usePlayStore.getState().setPlayerSprite(action.sprite_id),
        );
        finishAction();
      } else if (action.type === "read_document") {
        if (action.document_id) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1ReadDocument({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  documentId: action.document_id,
                })
              : null,
            () => usePlayStore.getState().markDocumentRead(action.document_id),
          );
          setActiveDocumentId(action.document_id);
          playSfx("document_open", {
            volume: action.volume ?? 0.34,
            cooldownMs: 120,
          });
        }
        finishAction();
      } else if (action.type === "heal_player") {
        const amount = action.amount || 20;
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1HealPlayer({
                gamePackage: getRuntimeGamePackage(),
                save,
                amount,
              })
            : null,
          () => usePlayStore.getState().updatePlayerHp(amount),
        );
        playSfx("heal", { volume: action.volume ?? 0.42, cooldownMs: 120 });
        finishAction();
      } else if (action.type === "chem_spill") {
        // Release a liquid / gas / ignition onto an authored cell (already
        // fine-expanded). The spill only injects quantity into the chemistry
        // grid — the flood/burn/dissipation that follows is the live
        // simulation advancing on player moves.
        const save = usePlayStore.getState().saveData;
        if (save && action.cell) {
          const spill = applyChemistrySpillToSave(getRuntimeGamePackage(), save, {
            cell: [action.cell[0], action.cell[1]],
            liquid: action.liquid_id,
            amount: action.amount,
            mapId: action.map_id || save.current_map_id,
          });
          if (spill.ok) {
            commitRuntimeSave(spill.save);
            presentChemistryFeedback(spill.reactions, spill.exposures, { logReactions: false });
            playSfx("spell_cast", { volume: action.volume ?? 0.4, cooldownMs: 120 });
          }
        }
        finishAction();
      } else if (action.type === "restore_party") {
        const store = usePlayStore.getState();
        const currentSave = store.saveData;
        commitCutsceneState(
          currentSave
            ? dispatchV1RestoreParty({
                gamePackage: getRuntimeGamePackage(),
                save: currentSave,
              })
            : null,
          () => {
            if (currentSave) {
              store.updatePlayerStats({
                hp: currentSave.playerStats.max_hp,
                mp: currentSave.playerStats.max_mp,
                energy: 1000,
              });
              (currentSave.party_members || []).forEach((partyId) => {
                const entity = useEngineStore
                  .getState()
                  .gamePackage.entities.find((candidate) => candidate.id === partyId);
                if (!entity) return;
                store.updateEntityState(partyId, {
                  hp: entity.max_hp ?? 1,
                  mp: entity.max_mp ?? 0,
                  dead: false,
                });
              });
            }
          },
        );
        if (currentSave) store.addLog("The party rests. HP and Aether restored.");
        playSfx("heal", { volume: action.volume ?? 0.42, cooldownMs: 120 });
        finishAction();
      } else if (action.type === "give_currency") {
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1GiveCurrency({
                gamePackage: getRuntimeGamePackage(),
                save,
                amount: action.amount || 1,
              })
            : null,
          () => usePlayStore.getState().updateMoney(action.amount || 1),
        );
        playSfx("coin", { volume: action.volume ?? 0.35, cooldownMs: 100 });
        finishAction();
      } else if (action.type === "remove_currency") {
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1RemoveCurrency({
                gamePackage: getRuntimeGamePackage(),
                save,
                amount: action.amount || 1,
              })
            : null,
          () => usePlayStore.getState().updateMoney(-(action.amount || 1)),
        );
        playSfx("coin", { volume: action.volume ?? 0.3, cooldownMs: 100 });
        finishAction();
      } else if (action.type === "add_party_member") {
        if (action.entity_id) {
          const currentParty =
            usePlayStore.getState().saveData?.party_members || [];
          const alreadyInParty = currentParty.includes(action.entity_id);
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1AddPartyMember({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  entityId: action.entity_id,
                })
              : null,
            () => usePlayStore.getState().addPartyMember(action.entity_id),
          );
          const entity = useEngineStore
            .getState()
            .gamePackage.entities.find((e) => e.id === action.entity_id);
          playSfx("ui_click", { volume: 0.2, cooldownMs: 120 });
          if (entity && !alreadyInParty)
            usePlayStore.getState().addLog(`${entity.display_name} joined the party.`);
        }
        finishAction();
      } else if (action.type === "remove_party_member") {
        if (action.entity_id) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1RemovePartyMember({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  entityId: action.entity_id,
                })
              : null,
            () => usePlayStore.getState().removePartyMember(action.entity_id),
          );
          playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
          const entity = useEngineStore
            .getState()
            .gamePackage.entities.find((e) => e.id === action.entity_id);
          if (entity) usePlayStore.getState().addLog(`${entity.display_name} left the party.`);
        }
        finishAction();
      } else if (action.type === "open_shop") {
        if (action.shop_id) {
          usePlayStore.getState().openShop(action.shop_id);
          playSfx("shop_open", {
            volume: action.volume ?? 0.34,
            cooldownMs: 120,
          });
        }
        finishAction();
      } else if (action.type === "label") {
        // No-op jump target.
        finishAction();
      } else if (action.type === "branch") {
        const save = usePlayStore.getState().saveData;
        const shouldJump = shouldRunCutsceneBranch(action, buildConditionContext(save));
        if (shouldJump && action.target_label) {
          const labelIndex = findCutsceneLabelIndex(activeCutscene.actions, action.target_label);
          if (labelIndex >= 0 && cutsceneJumpsRef.current < MAX_CUTSCENE_JUMPS) {
            cutsceneJumpsRef.current += 1;
            if (!isCancelled) setCutsceneActionIndex(labelIndex);
            return;
          }
          if (labelIndex < 0) {
            console.warn(
              `Cutscene branch: label "${action.target_label}" not found.`,
            );
          } else {
            console.warn("Cutscene branch: jump limit reached; continuing.");
          }
        }
        finishAction();
      } else if (action.type === "play_music") {
        const settings = getRuntimeGamePackage().settings || {};
        const url =
          action.music_url ||
          (action.music_id
            ? (settings.music_tracks || {})[action.music_id]
            : undefined);
        if (url) {
          playMusic(url, { volume: action.volume });
        } else {
          stopMusic();
        }
        finishAction();
      } else if (action.type === "play_sound") {
        const settings = getRuntimeGamePackage().settings || {};
        const soundUrl =
          action.sound_id
            ? (settings.sound_effects || {})[action.sound_id] || action.sound_id
            : action.music_url;
        playSfx(soundUrl, {
          volume: action.volume,
          cooldownMs: 30,
        });
        finishAction();
      } else if (action.type === "screen_fade") {
        const duration = action.duration ?? 600;
        setScreenFade({
          color: action.color || "#000000",
          opacity: action.fade === "in" ? 0 : 1,
          duration,
        });
        setTimeout(finishAction, duration);
      } else if (action.type === "camera_pan") {
        setCameraFocusOverride(action.cell ? [action.cell[0], action.cell[1]] : null);
        setTimeout(finishAction, action.duration ?? 800);
      } else if (action.type === "adjust_faction_rep") {
        if (action.faction_id) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1AdjustFactionRep({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  factionId: action.faction_id,
                  amount: action.amount ?? 0,
                })
              : null,
            () => usePlayStore.getState().adjustFactionRep(action.faction_id, action.amount ?? 0),
          );
        }
        finishAction();
      } else if (action.type === "open_save_menu") {
        clearInputState();
        setShowSaveMenu(true);
        playSfx("save_chime", {
          volume: action.volume ?? 0.34,
          cooldownMs: 120,
        });
        finishAction();
      } else if (action.type === "advance_clock") {
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1AdvanceClock({
                gamePackage: getRuntimeGamePackage(),
                save,
                minutes: action.amount ?? 60,
              })
            : null,
          () => usePlayStore.getState().advanceClock(action.amount ?? 60),
        );
        finishAction();
      } else if (action.type === "modify_player_stats") {
        if (action.stats) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1ModifyPlayerStats({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  stats: action.stats,
                })
              : null,
            () => usePlayStore.getState().modifyPlayerStats(action.stats),
          );
        }
        finishAction();
      } else if (action.type === "learn_skill") {
        if (action.skill_id) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1LearnSkill({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  skillId: action.skill_id,
                })
              : null,
            () => usePlayStore.getState().learnSkill(action.skill_id),
          );
          playSfx("level_up", {
            volume: action.volume ?? 0.42,
            cooldownMs: 180,
          });
          const skill = useEngineStore
            .getState()
            .gamePackage.abilities.find((s) => s.id === action.skill_id);
          if (skill) {
            usePlayStore.getState().addLog(`Learned ${skill.display_name}.`);
          }
        }
        finishAction();
      } else if (action.type === "set_entity_hidden") {
        if (action.entity_id && activeMap) {
          const save = usePlayStore.getState().saveData;
          commitCutsceneState(
            save
              ? dispatchV1SetEntityHidden({
                  gamePackage: getRuntimeGamePackage(),
                  save,
                  entityId: action.entity_id,
                  hidden: action.hidden ?? true,
                })
              : null,
            () => {
              const entityIndex = activeMap.entity_placements.findIndex(
                (placement) => placement.entity_id === action.entity_id,
              );
              if (entityIndex >= 0) {
                usePlayStore
                  .getState()
                  .updateEntityState(
                    entityPlacementStateKey(
                      activeMap.id,
                      activeMap.entity_placements[entityIndex],
                      entityIndex,
                    ),
                    { hidden: action.hidden ?? true },
                  );
              }
            },
          );
        }
        finishAction();
      } else if (action.type === "game_end") {
        const save = usePlayStore.getState().saveData;
        commitCutsceneState(
          save
            ? dispatchV1GameEnd({
                gamePackage: getRuntimeGamePackage(),
                save,
                endingId: action.ending_id,
                title: action.title,
              })
            : null,
          () => usePlayStore.getState().setFlag("game_ended", true),
        );
        onGameEndRef.current?.();
        finishAction();
      } else {
        const unsupportedType = String((action as { type?: unknown }).type || "unknown");
        console.error(`Cutscene stopped: unsupported action “${unsupportedType}”.`);
        usePlayStore
          .getState()
          .addLog(`Cutscene stopped: unsupported action “${unsupportedType}”.`);
        setActiveCutscene(null);
        setCutsceneActionIndex(0);
        setCameraFocusOverride(null);
      }
    };

    runAction();

    return () => {
      isCancelled = true;
    };
  }, [
    activeCutscene,
    activeMap,
    cutsceneActionIndex,
    activeDialogueId,
    activeDocumentId,
    activeShopId,
    activeContainerId,
    playSfx,
  ]);

  useEffect(() => {
    let animId: number;

    const loop = (time: number) => {
      animId = requestAnimationFrame(loop);

      if (inputBlockedRef.current) {
        resetRepeatInputState();
        return;
      }
      if (isCombatInputGateActive(time)) {
        resetRepeatInputState();
        return;
      }
      const currentSave = usePlayStore.getState().saveData;
      if (
        currentSave?.playerStats.hp !== undefined &&
        currentSave.playerStats.hp <= 0
      ) {
        resetRepeatInputState();
        return;
      }

      let ax = 0;
      let az = 0;
      let wait = false;
      const keys = keysDownRef.current;

      if (keys.has("arrowup") || keys.has("w")) az -= 1;
      if (keys.has("arrowdown") || keys.has("s")) az += 1;
      if (keys.has("arrowleft") || keys.has("a")) ax -= 1;
      if (keys.has("arrowright") || keys.has("d")) ax += 1;
      if (keys.has("z") || keys.has(".")) wait = true;

      const isPressing = ax !== 0 || az !== 0 || wait;

      if (isPressing) {
        const [rx, rz] = getCameraRelativeGridMove(
          ax,
          az,
          cameraAzimuthRef.current,
        );

        const state = repeatStateRef.current;
        
        // Input buffer for diagonal targeting (80ms)
        if (!state.active) {
          if (!state.bufferStart) {
            state.bufferStart = time;
            return;
          } else if (time - state.bufferStart < 80) {
            return;
          }
        }

        if (!state.active || state.dx !== rx || state.dz !== rz) {
          state.active = true;
          state.dx = rx;
          state.dz = rz;
          state.startTime = time;
          state.lastTick = time;
          if (wait) {
            if (waitRef.current) waitRef.current();
          } else {
            if (handleMoveRef.current && (rx !== 0 || rz !== 0))
              handleMoveRef.current(rx, rz);
          }
        } else {
          // Combat uses the same held fine-step movement as exploration. A
          // player/party actor switch still flushes carried input below, so a
          // held key cannot accidentally drive the next controlled actor.
          const inCombat = Boolean(usePlayStore.getState().saveData?.in_combat);
          const enemyNearby = isEnemyNearbyRef.current
            ? isEnemyNearbyRef.current()
            : false;
          if (inCombat || !enemyNearby) {
            const holdDuration = time - state.startTime;
            if (holdDuration > MOVEMENT_REPEAT_START_MS) {
              const tickDiff = time - state.lastTick;
              if (tickDiff >= MOVEMENT_REPEAT_INTERVAL_MS) {
                state.lastTick +=
                  MOVEMENT_REPEAT_INTERVAL_MS *
                  Math.max(1, Math.floor(tickDiff / MOVEMENT_REPEAT_INTERVAL_MS));
                if (wait) {
                  if (waitRef.current) waitRef.current();
                } else {
                  if (handleMoveRef.current && (rx !== 0 || rz !== 0))
                    handleMoveRef.current(rx, rz);
                }
              }
            }
          }
        }
      } else {
        resetRepeatInputState();
      }
    };

    animId = requestAnimationFrame(loop);

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const targetTag = target?.tagName;
      const targetIsFormControl =
        targetTag === "SELECT" ||
        targetTag === "INPUT" ||
        targetTag === "TEXTAREA" ||
        Boolean(target?.isContentEditable);
      if (targetIsFormControl) {
        if (isCombatCommandKey(key) || key === "q" || key === "e") {
          keysDownRef.current.delete(key);
          if (isMovementCommandKey(key)) {
            combatInputHeldKeysRef.current.delete(key);
            releaseCombatInputGateIfReady();
          }
          resetRepeatInputState();
        }
        return;
      }

      // Prevent scrolling
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        if (e.target === document.body) e.preventDefault();
      }

      if (levelUpOpenRef.current) {
        e.preventDefault();
        return;
      }

      if (isMovementCommandKey(key) && combatInputHeldKeysRef.current.has(key)) {
        keysDownRef.current.delete(key);
        resetRepeatInputState();
        e.preventDefault();
        return;
      }

      if (isCombatCommandKey(key) && isCombatInputGateActive()) {
        if (isMovementCommandKey(key)) {
          combatInputHeldKeysRef.current.add(key);
          keysDownRef.current.delete(key);
        }
        resetRepeatInputState();
        e.preventDefault();
        return;
      }

      if (key === "q" || key === "e") {
        if (e.target === document.body) e.preventDefault();
      } else {
        keysDownRef.current.add(key);
      }

      // single press actions
      if (!e.repeat) {
        // Targeting mode: Esc backs out without spending the turn.
        if (key === "escape" && targetingSkillIdRef.current) {
          setTargetingSkillId(null);
          setHoveredCell(null);
          return;
        }
        // Ability hotkeys 1-6 mirror the visible bottom-bar page.
        if (/^[1-6]$/.test(key) && !inputBlockedRef.current) {
          const entry = abilityBarEntriesRef.current[parseInt(key, 10) - 1];
          if (entry) activateAbilityRef.current?.(entry);
          return;
        }
        switch (key) {
          case " ":
          case "enter":
            if (!inputBlockedRef.current) handleActRef.current?.();
            break;
          case "i":
            setShowInventory((prev) => !prev);
            break;
          case "q":
            setCameraQuarterTurns((turns) => turns + 1);
            resetRepeatInputState();
            break;
          case "e":
            setCameraQuarterTurns((turns) => turns - 1);
            resetRepeatInputState();
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysDownRef.current.delete(key);
      if (isMovementCommandKey(key)) {
        combatInputHeldKeysRef.current.delete(key);
        releaseCombatInputGateIfReady();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isCombatInputGateActive,
    releaseCombatInputGateIfReady,
    resetRepeatInputState,
  ]);

  const didInitialMapLoadRef = useRef(false);

  useEffect(() => {
    // Resolve which map to play. Mid-session the save's current_map_id wins so
    // teleport_player and map exits can change maps without wiping the run.
    // On first entry an explicit editor selection wins, then a resumable save,
    // then the package's declared start map, then its first map, then the
    // built-in test map.
    const { map: resolvedMap, versionOk } = resolvePlayModeMap({
      gamePackage,
      selectedMapId: useEngineStore.getState().selectedMapId,
      saveData,
      didInitialMapLoad: didInitialMapLoadRef.current,
    });
    const mapToLoad = resolvedMap || expandMapToFine(createTestMap());
    didInitialMapLoadRef.current = true;
    setActiveMap(mapToLoad);

    // A save written at a different grid-subdivision ratio has coordinates on
    // a different grid — rebuild it rather than resuming mid-wall.
    const ratioOk = (saveData?.fine_ratio ?? 1) === FINE_PER_MACRO;

    // Initialize save if missing, map mismatch, or package changed enough to
    // rebuild old saves or mismatched package versions against this package.
    if (!saveData || saveData.current_map_id !== mapToLoad.id || !versionOk || !ratioOk) {
      // The package may name a specific start spawn; otherwise use the map's
      // first spawn.
      const declaredSpawn =
        mapToLoad.id === gamePackage.metadata.start_map_id
          ? mapToLoad.spawns.find(
              (s) => s.id === gamePackage.metadata.start_spawn_id,
            )
          : undefined;
      const spawn =
        declaredSpawn ||
        (mapToLoad.spawns.length > 0
          ? mapToLoad.spawns[0]
          : {
              cell: [0, 0] as [number, number],
              facing: [0, -1] as [number, number],
            });
      initSave(
        mapToLoad.id,
        spawn.cell as [number, number],
        spawn.facing as [number, number],
        gamePackage.metadata.version,
        gamePackage.settings?.player_stats,
        ((gamePackage.settings?.clock_start_hour as number) ?? 8) * 60,
        {
          playerSpriteId: gamePackage.settings?.player_sprite_id as string | undefined,
          initialKnownSkills:
            (gamePackage.settings?.initial_known_skills as string[] | undefined) || [],
          startingPartyMembers:
            (gamePackage.settings?.starting_party_members as string[] | undefined) || [],
        },
      );
    }
  }, [
    gamePackage.maps,
    gamePackage.metadata.version,
    saveData?.current_map_id,
  ]);

  useEffect(() => {
    if (!activeMap) return;
    // A scripted cutscene may be mid-flight across a map change. Ambient
    // on_load triggers must never clobber it.
    if (activeCutscene) return;
    const loadTriggers =
      activeMap.triggers?.filter((t) => t.type === "on_load") || [];
    for (const trigger of loadTriggers) {
      const save = usePlayStore.getState().saveData;
      const flags = save?.flags || {};
      const conditionsMet = isTriggerEligible(trigger, buildConditionContext(save));
      const runFlag = `trig_run_${trigger.id}`;
      if (conditionsMet && !(trigger.once && flags[runFlag])) {
        if (!save) continue;
        const triggerResult = dispatchV1FireTrigger({
          gamePackage: getRuntimeGamePackage(),
          save,
          triggerId: trigger.id,
        });
        if (!triggerResult.ok) continue;
        usePlayStore.getState().commitRuntimeSave(triggerResult.save);
        usePlayStore.getState().pushEngineEvents(triggerResult.events);
        // Cutscenes must come from the FINE-expanded runtime package so
        // cell-bearing actions (teleports, spills, pans) carry converted
        // coordinates.
        const cutscene = getRuntimeGamePackage().cutscenes.find(
          (c) => c.id === trigger.cutscene_id,
        );
        if (cutscene) {
          setActiveCutscene(cutscene);
          break; // Only run one cutscene at a time
        }
      }
    }
  }, [activeMap?.id]);

  // Switch-change triggers are condition edges, not a per-frame poll. Queue
  // them while another cutscene is running and dispatch them through the same
  // trigger command/save path used by step, interact, and on-load triggers.
  useEffect(() => {
    if (!activeMap || !saveData) return;
    const currentFlags = saveData.flags || {};
    if (observedSwitchMapRef.current !== activeMap.id) {
      observedSwitchMapRef.current = activeMap.id;
      observedSwitchFlagsRef.current = { ...currentFlags };
      pendingSwitchTriggerIdsRef.current = [];
      return;
    }

    const previousFlags = observedSwitchFlagsRef.current;
    if (previousFlags) {
      const beforeSave = { ...saveData, flags: previousFlags };
      const matches = findEligibleSwitchChangeTriggers(
        activeMap.triggers,
        buildConditionContext(beforeSave),
        buildConditionContext(saveData),
      );
      for (const trigger of matches) {
        if (!pendingSwitchTriggerIdsRef.current.includes(trigger.id)) {
          pendingSwitchTriggerIdsRef.current.push(trigger.id);
        }
      }
    }
    observedSwitchFlagsRef.current = { ...currentFlags };
  }, [activeMap?.id, saveData?.flags]);

  useEffect(() => {
    if (!activeMap || !saveData || activeCutscene) return;
    const triggerId = pendingSwitchTriggerIdsRef.current.shift();
    if (!triggerId) return;
    const trigger = activeMap.triggers?.find(
      (candidate) => candidate.id === triggerId && candidate.type === "switch_change",
    );
    if (!trigger || !isTriggerEligible(trigger, buildConditionContext(saveData))) return;
    if (trigger.once && saveData.flags?.[`trig_run_${trigger.id}`]) return;

    const triggerResult = dispatchV1FireTrigger({
      gamePackage: getRuntimeGamePackage(),
      save: saveData,
      triggerId: trigger.id,
    });
    if (!triggerResult.ok) return;
    commitRuntimeSave(triggerResult.save);
    usePlayStore.getState().pushEngineEvents(triggerResult.events);
    const cutscene = getRuntimeGamePackage().cutscenes.find(
      (candidate) => candidate.id === trigger.cutscene_id,
    );
    if (cutscene) {
      setCutsceneActionIndex(0);
      setActiveCutscene(cutscene);
    }
  }, [activeMap?.id, activeCutscene, saveData?.flags, commitRuntimeSave]);

  // After the world has settled for the turn, see whether two NPCs ended up
  // standing together with the player in earshot, and play an overheard
  // exchange if one matches the current authored state. Reads the already
  // committed save so the NPC positions are final for this turn.
  const maybeFireBarks = () => {
    if (inputBlockedRef.current) return;
    const sData = usePlayStore.getState().saveData;
    const gp = getRuntimeGamePackage();
    const map = activeMapRef.current;
    if (!sData || !map || sData.in_combat) return;
    const barks = gp.barks;
    if (!barks || barks.length === 0) return;

    const nowReal = performance.now();
    if (nowReal - lastBarkRealRef.current < BARK_MIN_REAL_INTERVAL_MS) return;

    const clockMin = sData.clock_minutes ?? 0;
    const playerCell = sData.player.cell;
    const states = sData.entity_states || {};
    const partyMembers = sData.party_members || [];

    // Live, audible NPCs on this map with their final cell for the turn.
    const npcs = (map.entity_placements || [])
      .map((placement, index) => {
        const def = gp.entities.find((e) => e.id === placement.entity_id);
        const key = entityPlacementStateKey(map.id, placement, index);
        const st = states[key] || {};
        return {
          id: placement.entity_id,
          key,
          def,
          cell: (st.cell || placement.cell) as [number, number],
          out: !!st.dead || !!st.hidden,
        };
      })
      .filter(
        (n) =>
          n.def &&
          n.def.is_npc &&
          !n.out &&
          !partyMembers.includes(n.id),
      );
    if (npcs.length < 2) return;

    const ctx = buildConditionContext(sData);

    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const a = npcs[i];
        const b = npcs[j];
        const pairDist =
          Math.abs(a.cell[0] - b.cell[0]) + Math.abs(a.cell[1] - b.cell[1]);
        if (pairDist > scaleMacroDistanceToFine(BARK_TALK_RADIUS)) continue;
        const earshot = Math.min(
          Math.abs(playerCell[0] - a.cell[0]) +
            Math.abs(playerCell[1] - a.cell[1]),
          Math.abs(playerCell[0] - b.cell[0]) +
            Math.abs(playerCell[1] - b.cell[1]),
        );
        if (earshot > scaleMacroDistanceToFine(BARK_EARSHOT)) continue;

        const bark = selectEligibleBark({
          barks,
          speakerA: a.id,
          speakerB: b.id,
          ctx,
          clockMinutes: clockMin,
          lastPlayed: sData.bark_cooldowns || {},
          defaultCooldownMinutes: BARK_DEFAULT_COOLDOWN_MIN,
        });
        if (!bark) continue;

        const record = dispatchV1RecordBark({
          gamePackage: gp,
          save: sData,
          barkId: bark.id,
          clockMinutes: clockMin,
        });
        if (record.ok) {
          usePlayStore.getState().commitRuntimeSave(record.save);
          usePlayStore.getState().pushEngineEvents(record.events);
        } else {
          barkCooldownRef.current.set(bark.id, clockMin);
        }
        lastBarkRealRef.current = nowReal;
        const cellOf = (entityId: string) =>
          entityId === a.id ? a.cell : b.cell;
        const actorOf = (entityId: string) =>
          entityId === a.id ? a.key : b.key;
        useFxStore.getState().enqueueBark(
          bark.lines.map((line) => ({
            cell: cellOf(line.speaker),
            actorId: actorOf(line.speaker),
            text: line.text,
            speaker:
              gp.entities.find((e) => e.id === line.speaker)?.display_name ||
              "",
          })),
        );
        return;
      }
    }
  };

  const pumpEngine = () => {
    usePlayStore.setState((state) => {
      const sData = state.saveData;
      const gp = getRuntimeGamePackage();
      if (!activeMap || !sData) return state;
      // In combat the explicit turn queue owns all actor scheduling — the
      // energy pump (and the world clock with it) holds its breath.
      if (sData.in_combat) return state;

      let playerHp = sData.playerStats.hp;
      let playerEnergy = sData.playerStats.energy || 0;
      const playerSpeed = Math.max(1, sData.playerStats.speed || 10);
      let playerCell = [...sData.player.cell];

      const messages: string[] = [];
      let nextEntities = { ...(sData.entity_states || {}) };

      const mapEntities =
        activeMap.entity_placements
          ?.map((p, index) => ({ p, index }))
          // Party members don't simulate — they follow the player and act
          // only on their combat turns.
          ?.filter(({ p }) => !(sData.party_members || []).includes(p.entity_id))
          ?.map(({ p, index }) => {
            const def = gp.entities.find((e) => e.id === p.entity_id);
            // Use instance key
            const key = entityPlacementStateKey(activeMap.id, p, index);
            const saved = nextEntities[key] || {};
            return {
              key,
              def,
              placement: p,
              cell: saved.cell || p.cell,
              hp: saved.hp ?? def?.max_hp ?? 10,
              energy: saved.energy ?? 0,
              isDead: !!saved.dead || !!saved.hidden,
                    };
                  })
                  .filter((n) => {
                    if (!n.def || n.isDead) return false;
                    const dist =
                      Math.abs(playerCell[0] - n.cell[0]) +
                      Math.abs(playerCell[1] - n.cell[1]);
                    // Exact behavior is a foreground simulation. Distant
                    // schedules are reconciled by the regional simulation;
                    // running their paths on every fine player step caused
                    // large populated maps to hitch while walking.
                    return n.def.is_npc
                      ? dist <= NPC_SIMULATION_RADIUS
                      : dist <= CHASE_RADIUS + 4;
                  }) || [];

      let walkableMapCache: Set<string> | null = null;
      const getTurnWalkableMap = () => {
        if (walkableMapCache) return walkableMapCache;
        // NPCs are footprint actors: their centers may only stand where the
        // whole footprint fits.
        walkableMapCache = footprintWalkableCells;
        return walkableMapCache;
      };

      // Occupancy for footprint actors: a candidate CENTER is occupied when
      // it would overlap another actor's footprint — dilate each occupant's
      // center by (FINE_PER_MACRO - 1) in Chebyshev distance.
      const addOccupiedFootprint = (set: Set<string>, cell: [number, number]) => {
        const reach = FINE_PER_MACRO - 1;
        for (let dx = -reach; dx <= reach; dx += 1) {
          for (let dz = -reach; dz <= reach; dz += 1) {
            set.add(pathCellKey(cell[0] + dx, cell[1] + dz));
          }
        }
      };

      // One bounded BFS returns the first few route cells. A macro-paced NPC
      // action therefore searches once instead of repeating the same search
      // for each of its fine-grid steps.
      const findPathSteps = (
        sx: number,
        sz: number,
        isGoal: (x: number, z: number) => boolean,
        walkableMap: Set<string>,
        occupiedMap: Set<string>,
        maxPathLength: number,
        stepLimit: number,
      ): [number, number][] => {
        const moves: [number, number][] = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ];
        const queue: {
          x: number;
          z: number;
          parent: number;
          depth: number;
        }[] = [
          { x: sx, z: sz, parent: -1, depth: 0 },
        ];
        const visited = new Set([pathCellKey(sx, sz)]);
        const maxExpansions = Math.min(
          walkableMap.size,
          Math.max(300, maxPathLength * maxPathLength),
        );
        let expansions = 0;
        let head = 0;
        let goalIndex = -1;

        while (head < queue.length && expansions++ < maxExpansions) {
          const currentIndex = head++;
          const current = queue[currentIndex]!;
          if (isGoal(current.x, current.z)) {
            goalIndex = currentIndex;
            break;
          }
          if (current.depth >= maxPathLength) continue;

          for (const [mx, mz] of moves) {
            const nx = current.x + mx;
            const nz = current.z + mz;
            const cellKey = pathCellKey(nx, nz);
            if (visited.has(cellKey)) continue;
            visited.add(cellKey);
            if (walkableMap.has(cellKey) && !occupiedMap.has(cellKey)) {
              queue.push({
                x: nx,
                z: nz,
                parent: currentIndex,
                depth: current.depth + 1,
              });
            }
          }
        }
        if (goalIndex < 0) return [];
        const reversed: [number, number][] = [];
        let cursor = goalIndex;
        while (cursor >= 0 && queue[cursor]!.parent >= 0) {
          const node = queue[cursor]!;
          reversed.push([node.x, node.z]);
          cursor = node.parent;
        }
        reversed.reverse();
        return reversed.slice(0, Math.max(1, stepLimit));
      };

      const minutesPerTick = clockMinutesPerTick(gp.settings);
      const clockStart = sData.clock_minutes ?? 0;
      let elapsedTicks = 0;
      const currentHour = Math.floor(clockStart / 60) % 24;
      const currentMapDelta = sData.map_deltas?.[activeMap.id] || {};
      let nextNpcTasks = (currentMapDelta.npc_tasks || []).map((task) => ({ ...task }));
      let npcTasksChanged = false;

      let iterations = 0;
      // Player and NPC movement both resolve in fine-action units. Equal-speed
      // actors therefore receive one one-cell response per player fine step.
      const npcFineActionEnergy = ENERGY_PER_FINE_STEP;

      // Pump until the player has 1000 energy or dead.
      while (iterations++ < 1000) {
        if (playerHp <= 0) break;

        // Find NPC ready to act
        const readyNpc = mapEntities.find(
          (n) => n.energy >= npcFineActionEnergy && !n.isDead,
        );

        if (playerEnergy >= 1000 && !readyNpc) break;

        if (readyNpc) {
          readyNpc.energy -= npcFineActionEnergy;
          const behavior = resolveAlderamonticoBehavior(
            sData,
            readyNpc.key,
            entityEmotionalSeed(gp, readyNpc.placement.entity_id),
          );
          const distToPlayer =
            Math.abs(playerCell[0] - readyNpc.cell[0]) +
            Math.abs(playerCell[1] - readyNpc.cell[1]);
          const actorState = nextEntities[readyNpc.key] || {};
          const turnTick = clockStart + elapsedTicks * minutesPerTick;
          const scheduledTarget = readyNpc.def!.is_npc
            ? getActiveScheduleEntry(readyNpc.placement.schedule, currentHour)
            : undefined;
          const activeTask = activeReactiveTaskForActor(nextNpcTasks, readyNpc.key, turnTick);
          let reactive = reactiveSignalFromTask(activeTask);
          if (!readyNpc.def!.is_npc && distToPlayer <= CHASE_RADIUS) {
            reactive = {
              kind: "hostile_act",
              reason: "player detected",
              target_cell: [playerCell[0], playerCell[1]],
              target_actor_id: "player",
              priority: Math.max(10, reactive?.priority || 0),
            };
          }

          // A recent attack on a same-team actor becomes a one-shot assist
          // signal for nearby witnesses. It is read directly from world facts,
          // then remembered on the witnessing entity so it cannot loop.
          if (!reactive) {
            const seenFactIds = new Set<string>(actorState.behavior_seen_fact_ids || []);
            const attackFact = [...(sData.world_facts || [])]
              .reverse()
              .find((fact) => {
                if (
                  fact.map_id !== activeMap.id ||
                  fact.action_type !== "immersive_combat_attack_resolved" ||
                  !fact.target_id ||
                  seenFactIds.has(fact.id) ||
                  fact.actor_id === readyNpc.key ||
                  fact.target_id === readyNpc.key
                )
                  return false;
                const targetPlacement = (activeMap.entity_placements || []).find((placement, index) => {
                  const key = entityPlacementStateKey(activeMap.id, placement, index);
                  return key === fact.target_id || placement.entity_id === fact.target_id;
                });
                const targetDef = targetPlacement
                  ? gp.entities.find((entity) => entity.id === targetPlacement.entity_id)
                  : undefined;
                if (!targetDef || targetDef.is_npc !== readyNpc.def!.is_npc) return false;
                const witnessCell = fact.cells?.at(-1);
                return Boolean(
                  witnessCell &&
                    Math.abs(witnessCell[0] - readyNpc.cell[0]) +
                      Math.abs(witnessCell[1] - readyNpc.cell[1]) <=
                      scaleMacroDistanceToFine(8),
                );
              });
            const attackerCell = attackFact?.cells?.[0];
            if (attackFact && attackerCell) {
              reactive = {
                kind: "ally_attacked",
                reason: "ally attacked",
                target_cell: [attackerCell[0], attackerCell[1]],
                target_actor_id: attackFact.actor_id,
                source_fact_id: attackFact.id,
                priority: 8,
              };
            }
          }

          const threat =
            !readyNpc.def!.is_npc || behavior === "flee" || behavior === "attack"
              ? {
                  actor_id: "player",
                  cell: [playerCell[0], playerCell[1]] as [number, number],
                  adjacent: areAdjacentMacro(
                    [readyNpc.cell[0], readyNpc.cell[1]],
                    [playerCell[0], playerCell[1]],
                  ),
                }
              : undefined;
          const idlePulse =
            !scheduledTarget &&
            (turnTick + readyNpc.key.length) % 4 === 0;
          const decision = decideEntityAction(
            {
              id: readyNpc.key,
              name: readyNpc.def!.display_name,
              cell: [readyNpc.cell[0], readyNpc.cell[1]],
              hp: readyNpc.hp,
              max_hp: readyNpc.def!.max_hp,
              dead: readyNpc.isDead,
              hidden: actorState.hidden,
              frozen: Boolean(actorState.frozen || actorState.frozen_latched),
              integrity: actorState.integrity,
              statuses: actorState.statuses,
              physical:
                sData.actor_physical_states?.[readyNpc.key] ||
                sData.actor_physical_states?.[readyNpc.placement.entity_id],
              emotional_behavior: behavior,
              commitment: actorState.behavior_commitment as BehaviorCommitmentRecord | undefined,
            },
            {
              tick: turnTick,
              threat,
              reactive,
              schedule: scheduledTarget
                ? { cell: [scheduledTarget.cell[0], scheduledTarget.cell[1]], label: "routine" }
                : undefined,
              idle_action: idlePulse ? "wander" : "stand",
            },
            "exploration",
          );
          const noteIntent = (line: string) => {
            const noteKey = `${decision.tier}:${decision.action}:${decision.reason}`;
            if (explorationBehaviorNoteRef.current.get(readyNpc.key) === noteKey) return;
            explorationBehaviorNoteRef.current.set(readyNpc.key, noteKey);
            if (distToPlayer <= scaleMacroDistanceToFine(8)) messages.push(line);
          };
          const occupiedForTurn = () => {
            const occupiedMap = new Set<string>();
            mapEntities
              .filter((n) => !n.isDead && n !== readyNpc)
              .forEach((n) => addOccupiedFootprint(occupiedMap, [n.cell[0], n.cell[1]]));
            addOccupiedFootprint(occupiedMap, [playerCell[0], playerCell[1]]);
            return occupiedMap;
          };
          const fleeOneStep = (danger: [number, number]) => {
            const walkableMap = getTurnWalkableMap();
            const occupiedMap = occupiedForTurn();
            const fromDist =
              Math.abs(readyNpc.cell[0] - danger[0]) +
              Math.abs(readyNpc.cell[1] - danger[1]);
            const options: [number, number][] = (
              [
                [readyNpc.cell[0], readyNpc.cell[1] - 1],
                [readyNpc.cell[0] + 1, readyNpc.cell[1]],
                [readyNpc.cell[0], readyNpc.cell[1] + 1],
                [readyNpc.cell[0] - 1, readyNpc.cell[1]],
              ] as [number, number][]
            )
              .filter(
                ([x, z]) =>
                  walkableMap.has(pathCellKey(x, z)) &&
                  !occupiedMap.has(pathCellKey(x, z)),
              )
              .sort(
                (a, b) =>
                  Math.abs(b[0] - danger[0]) + Math.abs(b[1] - danger[1]) -
                    (Math.abs(a[0] - danger[0]) + Math.abs(a[1] - danger[1])) ||
                  a[0] - b[0] ||
                  a[1] - b[1],
              );
            const away = options[0];
            if (
              away &&
              Math.abs(away[0] - danger[0]) + Math.abs(away[1] - danger[1]) > fromDist
            ) {
              readyNpc.cell = [away[0], away[1]];
            }
          };
          const moveToward = (
            target: [number, number],
            stopAdjacent: boolean,
            maxPathLength = NPC_SCHEDULE_PATH_LIMIT,
          ) => {
            const walkableMap = getTurnWalkableMap();
            const occupiedMap = occupiedForTurn();
            const path = findPathSteps(
              readyNpc.cell[0],
              readyNpc.cell[1],
              (x, z) =>
                stopAdjacent
                  ? areAdjacentMacro([x, z], target)
                  : x === target[0] && z === target[1],
              walkableMap,
              occupiedMap,
              maxPathLength,
              1,
            );
            const destination = path.at(-1);
            if (destination) readyNpc.cell = [destination[0], destination[1]];
          };
          const updateTask = (state: "active" | "done") => {
            if (!decision.source_task_id) return;
            nextNpcTasks = nextNpcTasks.map((task) =>
              task.id === decision.source_task_id
                ? {
                    ...task,
                    state,
                    updated_at_tick: turnTick,
                    ...(state === "done"
                      ? { completed_at_tick: turnTick, result: decision.action }
                      : {}),
                  }
                : task,
            );
            npcTasksChanged = true;
          };
          if (decision.source_task_id) updateTask("active");

          if (decision.action === "skip" || decision.action === "hold") {
            noteIntent(
              decision.reason === "paralyzed"
                ? `${readyNpc.def!.display_name} stands transfixed, unmoving.`
                : decision.reason === "fade"
                  ? `${readyNpc.def!.display_name} has stopped responding to the world.`
                  : `${readyNpc.def!.display_name} holds position.`,
            );
          } else if (decision.action === "flee") {
            noteIntent(
              decision.tier === "survival"
                ? `${readyNpc.def!.display_name} flees immediate danger!`
                : `${readyNpc.def!.display_name} bolts away!`,
            );
            const danger = decision.source_cell || decision.target_cell || [playerCell[0], playerCell[1]];
            fleeOneStep([danger[0], danger[1]]);
            updateTask("done");
          } else if (decision.action === "attack" || decision.action === "confront") {
            if (areAdjacentMacro([readyNpc.cell[0], readyNpc.cell[1]], [playerCell[0], playerCell[1]])) {
              const dmg = Math.max(
                1,
                readyNpc.def!.attack - sData.playerStats.defense,
              );
              playerHp -= dmg;
              messages.push(
                `${readyNpc.def!.display_name} hits you for ${dmg}!`,
              );
              const fx = useFxStore.getState();
              fx.addPopup(
                [playerCell[0], playerCell[1]],
                `${dmg}`,
                "#f87171",
              );
              fx.markPlayerHurt();
              if (playerHp <= 0) {
                messages.push("You have died.");
                break;
              }
            } else if (decision.target_cell) {
              moveToward(
                [decision.target_cell[0], decision.target_cell[1]],
                true,
                scaleMacroDistanceToFine(9),
              );
            }
          } else if (
            (decision.action === "investigate" ||
              decision.action === "assist" ||
              decision.action === "schedule") &&
            decision.target_cell
          ) {
            const target: [number, number] = [decision.target_cell[0], decision.target_cell[1]];
            moveToward(
              target,
              decision.action !== "schedule",
              decision.action === "schedule"
                ? NPC_SCHEDULE_PATH_LIMIT
                : scaleMacroDistanceToFine(12),
            );
            const reached =
              decision.action === "schedule"
                ? readyNpc.cell[0] === target[0] && readyNpc.cell[1] === target[1]
                : areAdjacentMacro([readyNpc.cell[0], readyNpc.cell[1]], target);
            if (reached) updateTask("done");
          } else if (decision.action === "raise_alarm") {
            noteIntent(`${readyNpc.def!.display_name} raises the alarm!`);
            updateTask("done");
          } else if (decision.action === "wander") {
            const home = readyNpc.placement.cell as [number, number];
            const walkableMap = getTurnWalkableMap();
            const occupiedMap = occupiedForTurn();
            const options: [number, number][] = [
              [readyNpc.cell[0] + 1, readyNpc.cell[1]],
              [readyNpc.cell[0], readyNpc.cell[1] + 1],
              [readyNpc.cell[0] - 1, readyNpc.cell[1]],
              [readyNpc.cell[0], readyNpc.cell[1] - 1],
            ];
            const step = options.find(
              ([x, z]) =>
                Math.abs(x - home[0]) + Math.abs(z - home[1]) <=
                  scaleMacroDistanceToFine(1) &&
                walkableMap.has(pathCellKey(x, z)) &&
                !occupiedMap.has(pathCellKey(x, z)),
            );
            if (step) {
              readyNpc.cell = [step[0], step[1]];
            }
          }

          let recordedState = recordEntityBehaviorDecision(actorState, decision);
          if (decision.source_fact_id) {
            recordedState = {
              ...recordedState,
              behavior_seen_fact_ids: [
                ...(actorState.behavior_seen_fact_ids || []),
                decision.source_fact_id,
              ].slice(-24),
            };
          }
          nextEntities[readyNpc.key] = {
            ...recordedState,
            cell: readyNpc.cell,
            energy: readyNpc.energy,
            hp: readyNpc.hp,
            dead: readyNpc.isDead,
          };
                } else {
                  const waits = [Math.ceil((1000 - playerEnergy) / playerSpeed)];
                  mapEntities.forEach((n) => {
                    if (n.isDead || n.energy >= npcFineActionEnergy) return;
                    waits.push(
                      Math.ceil(
                        (npcFineActionEnergy - n.energy) /
                          Math.max(1, n.def!.speed || 10),
                      ),
                    );
                  });
                  const ticks = Math.max(1, Math.min(...waits.filter((wait) => wait > 0)));

                  elapsedTicks += ticks;
                  playerEnergy += playerSpeed * ticks;
                  mapEntities.forEach((n) => {
                    n.energy += Math.max(1, n.def!.speed || 10) * ticks;
                    nextEntities[n.key] = {
                      ...(nextEntities[n.key] || {}),
                      cell: n.cell,
                      hp: n.hp,
                      energy: n.energy,
                      dead: n.isDead,
                    };
                  });
                }
      }

      return {
        saveData: {
          ...sData,
          playerStats: {
            ...sData.playerStats,
            hp: playerHp,
            energy: playerEnergy,
          },
          entity_states: nextEntities,
          map_deltas: npcTasksChanged
            ? {
                ...(sData.map_deltas || {}),
                [activeMap.id]: {
                  ...currentMapDelta,
                  npc_tasks: nextNpcTasks,
                },
              }
            : sData.map_deltas,
          clock_minutes: clockStart + elapsedTicks * minutesPerTick,
        },
        logMessages:
          messages.length > 0
            ? [...state.logMessages, ...messages].slice(-20)
            : state.logMessages,
      };
    });
    // World has settled for this turn — check for an overheard exchange.
    maybeFireBarks();
  };

  useEffect(() => {
    // Automatically pump engine if player energy drops below 1000.
    // The pump is suspended while the combat queue is running.
    if (
      saveData &&
      !saveData.in_combat &&
      (saveData.playerStats.energy || 0) < 1000 &&
      (saveData.playerStats.hp || 0) > 0
    ) {
      pumpEngine();
    }
  }, [saveData?.playerStats.energy, saveData?.playerStats.hp, activeMap, saveData?.in_combat]);

  const performWait = useCallback(() => {
    const save = usePlayStore.getState().saveData;
    if (!save) return;
    if (getPendingLevelUps(save) > 0) return;
    // In combat, Wait passes the controlled actor's turn — a real tactical
    // choice (let the enemy come to you), not a rest.
    if (save.in_combat) {
      const gp = getRuntimeGamePackage();
      const actor = getControlledActor(save, gp);
      if (!actor) return;
      playSfx("ui_click", { volume: 0.18, cooldownMs: 120 });
      usePlayStore
        .getState()
        .addLog(actor.isPlayer ? "You hold your ground." : `${actor.name} holds.`);
      advanceCombatTurnCore();
      return;
    }
    const energy = save.playerStats.energy || 0;
    if (energy >= 1000) {
      // The engine-core `wait` command is now the authoritative turn/energy gate
      // for an out-of-combat wait, committing the core-produced save and emitting
      // `waited` + `resource_spent`. The legacy energy mutator stays as a
      // fallback; HP/MP regen and feedback remain presentation side effects.
      const gp = getRuntimeGamePackage();
      const waitResult = dispatchV1Wait({ gamePackage: gp, save, energyCost: 1000 });
      if (waitResult.ok) {
        usePlayStore.getState().commitRuntimeSave(waitResult.save);
        usePlayStore.getState().pushEngineEvents(waitResult.events);
      } else {
        usePlayStore.getState().updatePlayerStats({ energy: energy - 1000 });
      }
      usePlayStore.getState().updatePlayerHp(1);
      usePlayStore.getState().updatePlayerMp(1);
      playSfx("heal", { volume: 0.36, cooldownMs: 180 });
      usePlayStore
        .getState()
        .addLog("You wait a turn. Restored 1 HP and 1 MP.");
    }
  }, [advanceCombatTurnCore, playSfx]);

  useEffect(() => {
    waitRef.current = performWait;
  }, [performWait]);

  const handlePartyTalk = useCallback(() => {
    const currentSave = usePlayStore.getState().saveData;
    if (
      !currentSave ||
      activeDialogueId ||
      activeShopId ||
      activeDocumentId ||
      activeContainerId
    )
      return;

    const partyMemberId = currentSave.party_members?.[0];
    if (!partyMemberId) return;

    const partyMember = gamePackage.entities.find((e) => e.id === partyMemberId);
    const partyDialogueId =
      partyMember?.party_dialogue_id || partyMember?.dialogue_id;
    const dialogue = gamePackage.dialogue.find((d) => d.id === partyDialogueId);

    if (dialogue?.nodes.length) {
      clearInputState();
      completeTalkObjectivesForEntity(partyMemberId, currentSave);
      usePlayStore.getState().startDialogue(dialogue.id, dialogue.nodes[0].id);
      playSfx("dialogue_open", { volume: 0.32, cooldownMs: 120 });
      addLog(`Spoke with ${partyMember?.display_name || "party member"}.`);
    }
  }, [
    activeDialogueId,
    activeShopId,
    activeDocumentId,
    activeContainerId,
    gamePackage.entities,
    gamePackage.dialogue,
    completeTalkObjectivesForEntity,
    addLog,
    playSfx,
  ]);

  // One melee strike from the controlled actor against a hostile. In combat
  // this routes through the Stage 6 tactical resolver for cover/flank/height;
  // outside combat, party members adjacent to the target can still pile on.
  const executeMeleeAttack = useCallback(
    (
      attacker: { key: string; name: string; attack: number; isPlayer: boolean; cell: [number, number] },
      targetKey: string,
      entityData: any,
    ): boolean => {
      const currentSave = usePlayStore.getState().saveData;
      if (!currentSave) return false;
      const gp = getRuntimeGamePackage();
      if (currentSave.in_combat && activeMap) {
        const targetState = currentSave.entity_states?.[targetKey] || {};
        const targetStateCell = targetState.cell;
        const placementCell = activeMap.entity_placements
          ?.find(
            (placement, index) =>
              entityPlacementStateKey(activeMap.id, placement, index) === targetKey,
          )
          ?.cell;
        const targetCell: [number, number] =
          Array.isArray(targetStateCell) &&
          typeof targetStateCell[0] === "number" &&
          typeof targetStateCell[1] === "number"
            ? [targetStateCell[0], targetStateCell[1]]
            : placementCell &&
                typeof placementCell[0] === "number" &&
                typeof placementCell[1] === "number"
              ? [placementCell[0], placementCell[1]]
              : attacker.cell;
        const tacticalAttack = applyImmersiveCombatAttackToSave(gp, currentSave, {
          mapId: activeMap.id,
          actorId: attacker.key,
          targetActorId: targetKey,
          baseDamage: Math.max(1, Math.floor(attacker.attack || 1)),
          range: 1,
          energyCost: 0,
        });
        if (!tacticalAttack.ok) {
          playSfx("warning", { volume: 0.22, cooldownMs: 120 });
          addLog(
            tacticalAttack.reason === "out of range"
              ? "Too far away."
              : `Could not strike ${entityData.display_name}.`,
          );
          return false;
        }
        commitRuntimeSave(tacticalAttack.save);
        presentImmersiveCombatAttackOutcome(
          tacticalAttack,
          attacker.name,
          entityData.display_name,
          targetCell,
        );
        if (tacticalAttack.defeated) handleEnemyDefeatedExperience(entityData);
        return true;
      }
      const result = dispatchV1MeleeAttack({
        gamePackage: gp,
        save: currentSave,
        actorId: attacker.key,
        targetId: targetKey,
        energyCost: attacker.isPlayer && !currentSave.in_combat ? 1000 : 0,
      });
      if (!result.ok) {
        playSfx("warning", { volume: 0.22, cooldownMs: 120 });
        addLog(result.reason === "out of range" ? "Too far away." : `Could not strike ${entityData.display_name}.`);
        return false;
      }
      commitRuntimeSave(result.save);
      usePlayStore.getState().pushEngineEvents(result.events);
      const outcome = result.events.find((event) => event.type === "melee_attack_resolved")?.payload as unknown as
        | CombatAttackOutcome
        | undefined;
      if (outcome) presentMeleeOutcome(outcome);
      return true;
    },
    [
      activeMap,
      addLog,
      commitRuntimeSave,
      handleEnemyDefeatedExperience,
      presentImmersiveCombatAttackOutcome,
      presentMeleeOutcome,
      playSfx,
    ],
  );

  const executeFacedBasicAttack = useCallback((): boolean => {
    const currentSave = usePlayStore.getState().saveData;
    if (!currentSave || !activeMap) return false;
    if (currentSave.playerStats.hp <= 0) return false;
    if (getPendingLevelUps(currentSave) > 0) return false;
    const gp = getRuntimeGamePackage();
    const actor = getControlledActor(currentSave, gp);
    if (!actor) return false;
    const enemyIndex = activeMap.entity_placements?.findIndex((placement, index) => {
      if ((currentSave.party_members || []).includes(placement.entity_id)) return false;
      const key = entityPlacementStateKey(activeMap.id, placement, index);
      const state = currentSave.entity_states?.[key];
      const cx = state?.cell?.[0] ?? placement.cell[0];
      const cz = state?.cell?.[1] ?? placement.cell[1];
      return footprintIntersectsLeadingEdge(
        [actor.cell[0], actor.cell[1]],
        [actor.facing[0], actor.facing[1]],
        [cx, cz],
      ) && !state?.dead && !state?.hidden;
    });
    if (enemyIndex === undefined || enemyIndex < 0) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog(actor.isPlayer ? "No one is close enough to strike." : `${actor.name} has no target.`);
      return false;
    }
    const placement = activeMap.entity_placements[enemyIndex];
    const targetDef = gp.entities.find((entity) => entity.id === placement.entity_id);
    if (!targetDef || targetDef.is_npc) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog("That target will not fight you.");
      return false;
    }
    const attacked = executeMeleeAttack(
      actor,
      entityPlacementStateKey(activeMap.id, placement, enemyIndex),
      targetDef,
    );
    if (attacked && currentSave.in_combat) advanceCombatTurnCore();
    return attacked;
  }, [activeMap, addLog, advanceCombatTurnCore, executeMeleeAttack, playSfx]);

  const executeCombatShove = useCallback((): boolean => {
    const currentSave = usePlayStore.getState().saveData;
    if (!activeMap || !currentSave?.in_combat) return false;
    if (currentSave.playerStats.hp <= 0) return false;
    if (getPendingLevelUps(currentSave) > 0) return false;

    const gp = getRuntimeGamePackage();
    const actor = getControlledActor(currentSave, gp);
    if (!actor) return false;
    const enemyIndex = activeMap.entity_placements?.findIndex((placement, index) => {
      if ((currentSave.party_members || []).includes(placement.entity_id)) return false;
      const key = entityPlacementStateKey(activeMap.id, placement, index);
      const state = currentSave.entity_states?.[key];
      const cx = state?.cell?.[0] ?? placement.cell[0];
      const cz = state?.cell?.[1] ?? placement.cell[1];
      return footprintIntersectsLeadingEdge(
        [actor.cell[0], actor.cell[1]],
        [actor.facing[0], actor.facing[1]],
        [cx, cz],
      ) && !state?.dead && !state?.hidden;
    });
    if (enemyIndex === undefined || enemyIndex < 0) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog(actor.isPlayer ? "No one is close enough to shove." : `${actor.name} has no shove target.`);
      return false;
    }

    const placement = activeMap.entity_placements[enemyIndex];
    const targetDef = gp.entities.find((entity) => entity.id === placement.entity_id);
    if (!targetDef || targetDef.is_npc) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog("That target will not fight you.");
      return false;
    }

    const targetKey = entityPlacementStateKey(activeMap.id, placement, enemyIndex);
    const direction: [number, number] = [actor.facing[0], actor.facing[1]];
    if (direction[0] === 0 && direction[1] === 0) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog("No shove direction.");
      return false;
    }

    const result = applyImmersiveCombatForcedMovementToSave(gp, currentSave, {
      mapId: activeMap.id,
      actorId: actor.key,
      targetActorId: targetKey,
      direction,
      distance: COMBAT_SHOVE_DISTANCE,
      energyCost: 0,
    });
    if (!result.ok) {
      playSfx("warning", { volume: 0.26, cooldownMs: 120 });
      addLog(
        result.reason === "blocked"
          ? `${targetDef.display_name} has nowhere to go.`
          : `Could not shove ${targetDef.display_name}.`,
      );
      return false;
    }

    commitRuntimeSave(result.save);
    presentCombatShoveOutcome(result, targetDef.display_name);
    if (result.save.entity_states?.[targetKey]?.dead) {
      handleEnemyDefeatedExperience(targetDef);
    }
    advanceCombatTurnCore();
    return true;
  }, [
    activeMap,
    addLog,
    advanceCombatTurnCore,
    commitRuntimeSave,
    handleEnemyDefeatedExperience,
    playSfx,
    presentCombatShoveOutcome,
  ]);

  // Player-set overwatch (Stage 6): spend the turn to arm a reactive zone.
  // The first hostile that moves through a watched cell takes the reaction
  // hit during its own turn, resolved by the same simulation rule that
  // already governs forced movement through overwatch.
  const executeCombatOverwatch = useCallback((): boolean => {
    const currentSave = usePlayStore.getState().saveData;
    if (!activeMap || !currentSave?.in_combat) return false;
    if (currentSave.playerStats.hp <= 0) return false;
    if (getPendingLevelUps(currentSave) > 0) return false;
    if (currentSave.active_turn_id !== "player") return false;
    if (currentSave.flags?.immersive_overwatch_player) {
      playSfx("warning", { volume: 0.22, cooldownMs: 160 });
      addLog("Overwatch is already set.");
      return false;
    }
    const gp = getRuntimeGamePackage();
    const result = applyImmersivePlayerOverwatchToSave(gp, currentSave, {
      mapId: activeMap.id,
    });
    if (!result.ok) {
      playSfx("warning", { volume: 0.24, cooldownMs: 160 });
      addLog("Cannot set overwatch right now.");
      return false;
    }
    commitRuntimeSave(result.save);
    playSfx("ui_click", { volume: 0.3, cooldownMs: 120 });
    useFxStore.getState().addPopup(currentSave.player.cell, "Overwatch", "#93c5fd", 1.45);
    addLog(
      `You set overwatch — ${result.zone_cells.length} cells watched. The first hostile to cross your sight takes a reaction hit.`,
    );
    advanceCombatTurnCore();
    return true;
  }, [activeMap, addLog, advanceCombatTurnCore, commitRuntimeSave, playSfx]);

  const handleMove = useCallback(
    (dx: number, dz: number) => {
      const currentSave = usePlayStore.getState().saveData;
      if (!activeMap || !currentSave) return;
      if (currentSave.playerStats.hp <= 0) return;
      if (getPendingLevelUps(currentSave) > 0) return;
      
      // If targeting mode is active, directional bumps move the target cursor instead
      if (targetingSkillIdRef.current) {
        setHoveredCell((prev) => {
          const px = prev ? prev[0] : currentSave.player.cell[0];
          const pz = prev ? prev[1] : currentSave.player.cell[1];
          return [px + dx, pz + dz];
        });
        return;
      }

      const gp = getRuntimeGamePackage();
      const inCombat = !!currentSave.in_combat;
      const actor = getControlledActor(currentSave, gp);
      if (!actor) return; // an enemy is acting
      if (!inCombat && (currentSave.playerStats.energy || 0) < ENERGY_PER_FINE_STEP) return;

      const actorCell = actor.cell;
      let turnConsumed = false;
      let turnEnergyConsumed = false;
      let steppedThisTurn = false;
      const newFacing = [dx, dz] as [number, number];
      let nx = actorCell[0] + dx;
      let nz = actorCell[1] + dz;

      const currentCell = getActiveCell(actorCell[0], actorCell[1]);
      const movementCommand = dispatchV1MoveEntity({
        gamePackage: gp,
        save: currentSave,
        actorId: actor.key,
        dx,
        dy: dz,
        // Exploration walking costs energy per macro tile of distance — a
        // fine step is a third of the legacy step price (§4.4).
        energyCost: actor.isPlayer && !inCombat ? ENERGY_PER_FINE_STEP : 0,
        allowDoorwayAssist: actor.isPlayer && !inCombat,
      });
      if (movementCommand.ok) {
        const resolvedCell = actor.isPlayer
          ? movementCommand.save.player.cell
          : movementCommand.save.entity_states?.[actor.key]?.cell;
        if (resolvedCell) {
          nx = resolvedCell[0];
          nz = resolvedCell[1];
        }
      }
      const targetCell = getActiveCell(nx, nz);

      // The v1 engine-core adapter is now the first movement legality gate
      // (footprint-aware). Legacy local checks stay in place while adjacent
      // interactions, exits, triggers, audio, and combat side effects are
      // still owned by PlayMode. Actors are FINE_PER_MACRO² footprints, so
      // every cell of the destination footprint is checked.
      let blocked = !movementCommand.ok;
      for (const [fx, fz] of actorFootprintCells([nx, nz])) {
        const footCell = getActiveCell(fx, fz);
        if (
          !footCell ||
          !footCell.walkable ||
          getJamEngineVisualHeight(footCell) -
            getJamEngineVisualHeight(currentCell) >
            1
        ) {
          blocked = true;
          break;
        }
        // Object collisions (cell-baked objects like walls).
        if (footCell.object_id) {
          const cellObjDef = useEngineStore
            .getState()
            .gamePackage.object_library.find(
              (o) => o.id === footCell.object_id,
            );
          if (cellObjDef && cellObjDef.collision?.profile !== "none") {
            blocked = true;
            break;
          }
        }
        if (isBlockedByPlacement(fx, fz)) {
          blocked = true;
          break;
        }
        // Containers occupy their whole macro tile.
        if (getContainerAtCell(fx, fz)) {
          blocked = true;
          break;
        }
      }

      // In combat every combatant holds their footprint: the player blocks
      // party members and vice versa.
      if (inCombat) {
        if (
          !actor.isPlayer &&
          footprintsOverlap(
            [currentSave.player.cell[0], currentSave.player.cell[1]],
            [nx, nz],
          )
        )
          blocked = true;
        for (const pid of currentSave.party_members || []) {
          if (pid === actor.key) continue;
          const pEst = (currentSave.entity_states || {})[pid];
          if (
            pEst?.cell &&
            !pEst.dead &&
            footprintsOverlap([pEst.cell[0], pEst.cell[1]], [nx, nz])
          )
            blocked = true;
        }
      }

      // Entity collisions: walking into any entity whose footprint would
      // overlap the destination footprint counts as a bump (talk / attack).
      const entityIndex = activeMap.entity_placements?.findIndex((e, idx) => {
        if ((currentSave.party_members || []).includes(e.entity_id)) return false;
        const key = entityPlacementStateKey(activeMap.id, e, idx);
        const est = (currentSave.entity_states || {})[key];
        const cx = est?.cell?.[0] ?? e.cell[0];
        const cz = est?.cell?.[1] ?? e.cell[1];
        return footprintIntersectsLeadingEdge(
          [actorCell[0], actorCell[1]],
          [dx, dz],
          [cx, cz],
        ) && !est?.dead && !est?.hidden;
      });

      const entityPlacement =
        entityIndex !== undefined && entityIndex >= 0
          ? activeMap.entity_placements[entityIndex]
          : undefined;
      const entityKey = entityPlacement
        ? entityPlacementStateKey(activeMap.id, entityPlacement, entityIndex)
        : "";

      // Turning in place / facing updates for whichever body we control.
      const faceActor = (facing: [number, number]) => {
        if (actor.isPlayer) {
          updatePlayer(currentSave.player.cell, facing);
        } else {
          const est = {
            ...((currentSave.entity_states || {})[actor.key] || {}),
          };
          est.facing = facing;
          usePlayStore.getState().updateEntityState(actor.key, est);
        }
      };

      if (actor.isPlayer && !inCombat && targetCell) {
        const targetWorldState = evaluateImmersiveWorldStateForSave(gp, currentSave, {
          mapId: activeMap.id,
          cell: [nx, nz],
        });
        const gateBlock = getWorldGateBlock(targetWorldState, "move");
        if (gateBlock) {
          faceActor(newFacing);
          presentWorldStateBlockFeedback(gateBlock, [nx, nz]);
          return;
        }
      }

      if (entityPlacement) {
        const entityData = useEngineStore
          .getState()
          .gamePackage.entities.find((e) => e.id === entityPlacement.entity_id);
        if (entityData) {
          faceActor(newFacing);

          if (entityData.is_npc) {
            // Mid-combat there is no time for talk — the NPC just blocks.
            if (actor.isPlayer && !inCombat && entityData.dialogue_id) {
              const dialogue = useEngineStore
                .getState()
                .gamePackage.dialogue.find(
                  (d) => d.id === entityData.dialogue_id,
                );
              if (dialogue && dialogue.nodes.length > 0) {
                clearInputState();
                completeTalkObjectivesForEntity(entityData.id, currentSave);
                usePlayStore
                  .getState()
                  .startDialogue(dialogue.id, dialogue.nodes[0].id);
                playSfx("dialogue_open", { volume: 0.32, cooldownMs: 120 });
                addLog(`Started conversation with ${entityData.display_name}...`);
              }
            }
            turnConsumed = !inCombat;
          } else {
            // Bump attack — walking into a hostile strikes it instead.
            const attacked = executeMeleeAttack(actor, entityKey, entityData);
            if (attacked && actor.isPlayer && !inCombat) turnEnergyConsumed = true;
            turnConsumed = true;
          }
        }
      }

      if (!entityPlacement) {
        if (blocked) {
          faceActor(newFacing);
          if (actor.isPlayer) {
            playSfx("bump", { volume: 0.24, cooldownMs: 90 });
          }
        } else {
          // Map exits: stepping onto an exit cell travels to another map.
          // Only the player can lead the party out — fleeing ends the fight.
          const exitConditionCtx = actor.isPlayer ? buildConditionContext(currentSave) : null;
          // Exits are macro-tile semantics (§3.5): stepping anywhere in the
          // exit's macro tile travels.
          const playerExit =
            actor.isPlayer && exitConditionCtx
              ? activeMap.exits?.find(
                  (e) =>
                    e.cell &&
                    sameMacroCoord([e.cell[0], e.cell[1]], [nx, nz]) &&
                    isMapExitEligible(e, exitConditionCtx),
                )
              : undefined;
          if (playerExit) {
            const exitFacing = playerExit.facing
              ? ([Number(playerExit.facing[0] ?? 0), Number(playerExit.facing[1] ?? -1)] as [number, number])
              : undefined;
            const previewMapChange = dispatchV1ChangeMap({
              gamePackage: gp,
              save: movementCommand.save,
              targetMapId: playerExit.target_map_id,
              targetSpawnId: playerExit.target_spawn_id,
              facing: exitFacing,
              exitId: playerExit.id,
            });
            if (!previewMapChange.ok) {
              usePlayStore
                .getState()
                .addLog(`The way is sealed. (${previewMapChange.reason || "missing map"})`);
              playSfx("warning", { volume: 0.24, cooldownMs: 120 });
            } else {
              let transitionBaseSave = movementCommand.save;
              const transitionEvents = [...movementCommand.events];
              if (inCombat) {
                const fleeResult = dispatchV1UpdateCombatSession({
                  gamePackage: gp,
                  save: movementCommand.save,
                  mapId: activeMap.id,
                  forceEnd: true,
                });
                if (fleeResult.ok) {
                  transitionBaseSave = fleeResult.save;
                  transitionEvents.push(...fleeResult.events);
                  const ended = fleeResult.events.find((event) => event.type === "combat_ended")?.payload as unknown as
                    | CombatSessionUpdateOutcome
                    | undefined;
                  logCoreExperience(ended?.experience);
                }
                addLog("You flee through the passage!");
              }
              const mapChange =
                inCombat
                  ? dispatchV1ChangeMap({
                      gamePackage: gp,
                      save: transitionBaseSave,
                      targetMapId: playerExit.target_map_id,
                      targetSpawnId: playerExit.target_spawn_id,
                      facing: exitFacing,
                      exitId: playerExit.id,
                    })
                  : previewMapChange;
              if (mapChange.ok) {
                const destinationMap = gp.maps.find((map) => map.id === mapChange.save.current_map_id);
                clearInputState();
                setHoveredCell(null);
                setVerbTargeting(null);
                setAttendedActor(null);
                setActiveCutscene(null);
                setCutsceneActionIndex(0);
                setCameraFocusOverride(null);
                perceptionAdvanceKeyRef.current = "";
                stealthAlertStateRef.current.clear();
                worldStateAdvanceKeyRef.current = "";
                worldStateNoticeKeyRef.current = "";
                chemistryStepRef.current = "";
                alderamonticoGridStepRef.current = "";
                alderamonticoGridNoticeRef.current = "";
                if (destinationMap) {
                  setActiveMap(destinationMap);
                  activeMapRef.current = destinationMap;
                }
                commitRuntimeSave(mapChange.save);
                usePlayStore.getState().pushEngineEvents([...transitionEvents, ...mapChange.events]);
                playerFootstepFineStepsRef.current = 0;
                playSfx("door_transition", { volume: 0.42, cooldownMs: 140 });
                usePlayStore.getState().addLog(`Entered map: ${mapChange.save.current_map_id}`);
                return;
              }
              usePlayStore
                .getState()
                .addLog(`The way is sealed. (${mapChange.reason || "missing map"})`);
              playSfx("warning", { volume: 0.24, cooldownMs: 120 });
            }
          }

          commitRuntimeSave(movementCommand.save);
          usePlayStore.getState().pushEngineEvents(movementCommand.events);
          if (actor.isPlayer) {
            playerFootstepFineStepsRef.current += 1;
            if (
              playerFootstepFineStepsRef.current >=
              PLAYER_FOOTSTEP_FINE_STEP_INTERVAL
            ) {
              playSfx("footstep_stone", { volume: 0.2, cooldownMs: PLAYER_FOOTSTEP_COOLDOWN_MS });
              playerFootstepFineStepsRef.current = 0;
            }
            turnEnergyConsumed = !inCombat;
          }
          turnConsumed = true;
          steppedThisTurn = true;

          if (actor.isPlayer) {
            // Check step triggers (player only). Several triggers may share
            // a cell with mutually exclusive conditions — take the first
            // one that is actually eligible right now.
            const save = usePlayStore.getState().saveData;
            const flags = save?.flags || {};
            const triggerConditionCtx = buildConditionContext(save);
            // Step triggers are macro-tile semantics: they fire when the
            // player ENTERS the trigger's macro tile (crossing a tile
            // boundary), never once per fine cell inside it (§3.5).
            const enteredNewMacroTile = !sameMacroCoord(
              [actorCell[0], actorCell[1]],
              [nx, nz],
            );
            const trigger = enteredNewMacroTile
              ? activeMap.triggers?.find(
                  (t) =>
                    t.type === "step" &&
                    t.cell &&
                    sameMacroCoord([t.cell[0], t.cell[1]], [nx, nz]) &&
                    isTriggerEligible(t, triggerConditionCtx) &&
                    !(t.once && flags[`trig_run_${t.id}`]),
                )
              : undefined;
            if (trigger && save) {
              const triggerResult = dispatchV1FireTrigger({
                gamePackage: gp,
                save,
                triggerId: trigger.id,
              });
              if (triggerResult.ok) {
                commitRuntimeSave(triggerResult.save);
                usePlayStore.getState().pushEngineEvents(triggerResult.events);
                // Fine-expanded package: action cells arrive converted.
                const cutscene = getRuntimeGamePackage().cutscenes.find(
                  (c) => c.id === trigger.cutscene_id,
                );
                if (cutscene) setActiveCutscene(cutscene);
              }
            }
          }
        }
      }

      if (turnConsumed) {
        if (inCombat) {
          // Hostiles answer every fine movement step with one fine movement
          // step of their own. The third step completes the player's macro
          // movement budget and rotates player/party control.
          if (steppedThisTurn) {
            combatMoveStepsRef.current += 1;
            if (combatMoveStepsRef.current >= FINE_PER_MACRO) {
              advanceCombatTurnCore();
            } else {
              combatPulseRef.current?.({
                advancePlayerTurn: false,
                tickFullAction: false,
              });
            }
          } else {
            advanceCombatTurnCore();
          }
        } else if (!turnEnergyConsumed) {
          usePlayStore.getState().updatePlayerStats({
            energy: (currentSave.playerStats.energy || 0) - 1000,
          });
        }
      }
    },
    [
      activeMap,
      commitRuntimeSave,
      completeTalkObjectivesForEntity,
      updatePlayer,
      executeMeleeAttack,
      getActiveCell,
      getContainerAtCell,
      isBlockedByPlacement,
      logCoreExperience,
      advanceCombatTurnCore,
      playSfx,
      presentWorldStateBlockFeedback,
    ],
  );

  useEffect(() => {
    handleMoveRef.current = handleMove;
  }, [handleMove]);

  const handlePlayfieldCellClick = useCallback(
    (x: number, z: number) => {
      if (verbTargetingRef.current) {
        confirmVerbTargetRef.current(x, z);
        return;
      }
      if (targetingSkillIdRef.current) {
        handleCellClick(x, z);
        return;
      }
      if (inputBlockedRef.current) return;
      const currentSave = usePlayStore.getState().saveData;
      const gp = getRuntimeGamePackage();
      const actor = getControlledActor(currentSave, gp);
      if (!actor) return;
      const dx = Math.sign(x - actor.cell[0]);
      const dz = Math.sign(z - actor.cell[1]);
      if (dx === 0 && dz === 0) {
        handleActRef.current?.();
        return;
      }
      handleMove(dx, dz);
    },
    [handleCellClick, handleMove],
  );

  // Commit a dispatch result and surface its engine events. The v1 dispatchers
  // already append the interaction's kernel world facts to `result.save`
  // (object_taken, door_opened, container_*, object_pushed, …); this just
  // commits that save and pushes the events to the debug inspector.
  const commitWithFacts = (
    _beforeSave: PlaySave,
    result: DispatchResult & { save: PlaySave },
  ) => {
    commitRuntimeSave(result.save);
    usePlayStore.getState().pushEngineEvents(result.events);
  };

  const collectWorkstationOutput = (station: SimulationWorkstationData) => {
    const currentSave = usePlayStore.getState().saveData;
    const gp = getRuntimeGamePackage();
    if (!currentSave || !activeMap) return false;
    if ((currentSave.playerStats.energy || 0) < WORKSTATION_ACTION_ENERGY_COST) {
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      addLog("Not ready to collect.");
      return true;
    }
    const outputDrop = getEffectiveWorldItems(activeMap, currentSave.map_deltas?.[activeMap.id]).find(
      (item) => item.dropped && item.cell[0] === station.cell[0] && item.cell[1] === station.cell[1],
    );
    if (!outputDrop) return false;

    const pickup = dispatchV1TakeItem({
      gamePackage: gp,
      save: currentSave,
      x: outputDrop.cell[0],
      y: outputDrop.cell[1],
      energyCost: WORKSTATION_ACTION_ENERGY_COST,
    });
    const itemDef = gp.items.find((item) => item.id === outputDrop.item_id);
    if (!pickup.ok) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog(`Could not collect ${itemDef?.display_name || outputDrop.item_id}.`);
      return true;
    }
    commitWithFacts(currentSave, pickup);
    useFxStore.getState().addPopup(
      outputDrop.cell,
      itemDef?.display_name || "Collected",
      "#a7f3d0",
      1.5,
    );
    playSfx("item_pickup", { volume: 0.36, cooldownMs: 120 });
    addLog(`Collected ${outputDrop.count > 1 ? `${outputDrop.count}x ` : ""}${itemDef?.display_name || outputDrop.item_id}.`);
    return true;
  };

  const runWorkstationUse = (station: SimulationWorkstationData, requestedProcessId?: string | null) => {
    const currentSave = usePlayStore.getState().saveData;
    const gp = getRuntimeGamePackage();
    if (!currentSave || !activeMap) return;
    if (currentSave.in_combat) {
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      addLog("No time to use the workstation in combat.");
      return;
    }
    if ((currentSave.playerStats.energy || 0) < WORKSTATION_ACTION_ENERGY_COST) {
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      addLog("Not ready to work.");
      return;
    }

    const activeProcess = getActiveProcessForWorkstation(currentSave, activeMap.id, station.id);
    if (activeProcess) {
      const processDef = gp.simulation_processes.find((process) => process.id === activeProcess.process_def_id);
      const ticks = Math.max(1, Math.min(1, activeProcess.required_ticks - activeProcess.progress_ticks));
      const advanceResult = dispatchV1AdvanceProcesses({
        gamePackage: gp,
        save: currentSave,
        ticks,
        energyCost: WORKSTATION_ACTION_ENERGY_COST,
      });
      if (!advanceResult.ok) {
        playSfx("warning", { volume: 0.24, cooldownMs: 120 });
        addLog("The workstation stalls.");
        return;
      }
      commitWithFacts(currentSave, advanceResult);
      const nextProcess = advanceResult.save.map_deltas?.[activeMap.id]?.simulation_processes?.find(
        (process) => process.id === activeProcess.id,
      );
      if (nextProcess?.state === "complete") {
        const outputLabel = (nextProcess.output_items || activeProcess.output_items || [])
          .map((entry) => {
            const item = gp.items.find((candidate) => candidate.id === entry.item_id);
            return `${entry.count > 1 ? `${entry.count}x ` : ""}${item?.display_name || entry.item_id}`;
          })
          .join(", ");
        useFxStore.getState().addPopup([station.cell[0], station.cell[1]] as [number, number], "Complete", "#c4b5fd", 1.7);
        playSfx("item_pickup", { volume: 0.34, cooldownMs: 140 });
        addLog(
          `${processDef?.label || titleCaseEffect(activeProcess.process_type)} complete.${
            outputLabel ? ` ${outputLabel} ready at ${station.label}.` : ""
          }`,
        );
      } else {
        playSfx("bump", { volume: 0.2, cooldownMs: 120 });
        addLog(`${station.label} advances (${nextProcess?.progress_ticks ?? activeProcess.progress_ticks + ticks}/${activeProcess.required_ticks}).`);
      }
      return;
    }

    if (collectWorkstationOutput(station)) return;

    const stationProcesses = gp.simulation_processes.filter((process) =>
      station.process_ids.length ? station.process_ids.includes(process.id) : process.workstation_id === station.id,
    );
    const selectedProcessId = requestedProcessId || selectedWorkstationProcessId;
    const processDef =
      stationProcesses.find((process) => process.id === selectedProcessId) ||
      stationProcesses[0];
    if (!processDef) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog(`${station.label} has no authored process.`);
      return;
    }
    const startResult = dispatchV1StartProcess({
      gamePackage: gp,
      save: currentSave,
      processId: processDef.id,
      workstationId: station.id,
      cell: [station.cell[0], station.cell[1]] as [number, number],
      actorIds: ["player"],
      energyCost: WORKSTATION_ACTION_ENERGY_COST,
    });
    if (!startResult.ok) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog(
        startResult.reason === "missing input"
          ? `${processDef.label} needs ${processDef.input_items.map((entry) => gp.items.find((item) => item.id === entry.item_id)?.display_name || entry.item_id).join(", ")}.`
          : `${station.label} cannot start (${startResult.reason || "blocked"}).`,
      );
      return;
    }
    commitWithFacts(currentSave, startResult);
    playSfx("ui_click", { volume: 0.24, cooldownMs: 120 });
    addLog(`Started ${processDef.label}.`);
  };

  const interruptWorkstationProcess = (station: SimulationWorkstationData) => {
    const currentSave = usePlayStore.getState().saveData;
    if (!currentSave || !activeMap) return;
    const activeProcess = getActiveProcessForWorkstation(currentSave, activeMap.id, station.id);
    if (!activeProcess) return;
    const interruptResult = dispatchV1InterruptProcess({
      gamePackage: getRuntimeGamePackage(),
      save: currentSave,
      processId: activeProcess.id,
      reason: "manual_interrupt",
    });
    if (!interruptResult.ok) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog("Could not cancel that process.");
      return;
    }
    commitWithFacts(currentSave, interruptResult);
    playSfx("ui_back", { volume: 0.18, cooldownMs: 120 });
    addLog(`${station.label} process cancelled.`);
  };

  // ── Immersive global-verb command wheel ──────────────────────────────────
  // Phase 1 (`drop`), Phase 2 elemental verbs, and Phase 3 movement/traversal
  // verbs route through the canonical `applyImmersiveGlobalVerbToSave`
  // pipeline. Hack is intentionally not player-facing for now.

  // Legal target cells for the active verb's cursor. Direct cell verbs mark a
  // nearby cell. Object verbs mark nearby objects only when the derived
  // destination is open, so the first click usually produces visible movement.
  const verbTargetCells = useMemo(() => {
    if (!verbTargeting || !activeMap || !saveData) return [];
    const { cell } = saveData.player;
    // Emotional verbs target living actors within the verb's range.
    const emotionalVerb = getAlderamonticoEmotionalVerb(verbTargeting.verb);
    if (emotionalVerb) {
      const gp = getRuntimeGamePackage();
      const cells: { x: number; z: number }[] = [];
      (activeMap.entity_placements || []).forEach((placement, index) => {
        const key = entityPlacementStateKey(activeMap.id, placement, index);
        const state =
          saveData.entity_states?.[key] || saveData.entity_states?.[placement.entity_id] || {};
        if (state.dead || state.hidden) return;
        const actorCell = (state.cell || placement.cell) as [number, number];
        // Emotional verb ranges are authored in macro tiles.
        if (
          manhattanCells(cell, [actorCell[0], actorCell[1]]) >
          scaleMacroDistanceToFine(emotionalVerb.range)
        )
          return;
        if (!gp.entities.some((entity) => entity.id === placement.entity_id)) return;
        cells.push({ x: actorCell[0], z: actorCell[1] });
      });
      return cells;
    }
    const isDrop = verbTargeting.verb === "drop";
    const ground = getEffectiveWorldItems(activeMap, saveData.map_deltas?.[activeMap.id]);
    const actorAtCell = (x: number, z: number) => {
      if (footprintContainsCell(saveData.player.cell, [x, z])) return true;
      return Boolean(activeMap.entity_placements?.some((placement, index) => {
        if ((saveData.party_members || []).includes(placement.entity_id)) return false;
        const key = entityPlacementStateKey(activeMap.id, placement, index);
        const state = saveData.entity_states?.[key] || {};
        if (state.dead || state.hidden) return false;
        const actorCell = (state.cell || placement.cell) as [number, number];
        return footprintContainsCell([actorCell[0], actorCell[1]], [x, z]);
      }));
    };
    const dropFree = (x: number, z: number) => {
      const target = activeMap.cells.find((c) => c.x === x && c.z === z && c.walkable);
      if (!target) return false;
      if (getContainerAtCell(x, z)) return false;
      if (ground.some((w) => w.cell[0] === x && w.cell[1] === z)) return false;
      if (isBlockedByPlacement(x, z)) return false;
      if (actorAtCell(x, z)) return false;
      return true;
    };
    const exists = (x: number, z: number) =>
      activeMap.cells.some((c) => c.x === x && c.z === z && c.active !== false);
    const destinationOpen = (x: number, z: number) => {
      const target = activeMap.cells.find((candidate) => candidate.x === x && candidate.z === z && candidate.walkable);
      if (!target) return false;
      if (getContainerAtCell(x, z)) return false;
      if (ground.some((w) => w.cell[0] === x && w.cell[1] === z)) return false;
      if (isBlockedByPlacement(x, z)) return false;
      if (actorAtCell(x, z)) return false;
      return true;
    };
    const objectAt = (x: number, z: number) =>
      effectiveObjectPlacements.find((placement) => {
        const objectDef = objectByIdForPlay.get(placement.object_id);
        return placementOccupiesCell(placement, objectDef, x, z);
      });
    const objectVerbCanTarget = (x: number, z: number) => {
      const placement = objectAt(x, z);
      if (!placement) return false;
      const objectDef = objectByIdForPlay.get(placement.object_id);
      // Reach is macro-authored: the object's PLACEMENT (macro-center cell)
      // must be within macro adjacency of the actor; manipulation itself
      // nudges the object in fine cells (§5.4 — objects drag across fine
      // chemistry en route).
      if (verbTargeting.verb === "break")
        return areAdjacentMacro(cell, [placement.cell[0], placement.cell[1]]);
      if (!placementHasCollision(placement, objectDef) || !isPushableObject(objectDef)) return false;
      const direction = cardinalDirectionFromTo(cell, [placement.cell[0], placement.cell[1]]);
      if (!direction) return false;
      const macroDistance = manhattanCells(cell, [placement.cell[0], placement.cell[1]]);
      if (verbTargeting.verb === "pull") {
        if (macroDistance > scaleMacroDistanceToFine(2) || macroDistance <= FINE_PER_MACRO - 1)
          return false;
        return destinationOpen(placement.cell[0] - direction[0], placement.cell[1] - direction[1]);
      }
      if (!areAdjacentMacro(cell, [placement.cell[0], placement.cell[1]])) return false;
      const multiplier = verbTargeting.verb === "throw" ? 2 : 1;
      return destinationOpen(
        placement.cell[0] + direction[0] * multiplier,
        placement.cell[1] + direction[1] * multiplier,
      );
    };
    const cells: { x: number; z: number }[] = [];
    // Scan radius covers the reachable macro tiles plus the object cells at
    // their edges.
    const range =
      (verbTargeting.verb === "pull" ? 2 : 1) * FINE_PER_MACRO + FINE_HALF_EXTENT;
    for (let dz = -range; dz <= range; dz += 1) {
      for (let dx = -range; dx <= range; dx += 1) {
        if ((isDrop || verbTargeting.verb === "climb") && dx === 0 && dz === 0) continue;
        const x = cell[0] + dx;
        const z = cell[1] + dz;
        if (isDrop ? dropFree(x, z) : PLAYMODE_OBJECT_VERBS.has(verbTargeting.verb) ? objectVerbCanTarget(x, z) : exists(x, z)) {
          cells.push({ x, z });
        }
      }
    }
    return cells;
  }, [
    verbTargeting,
    activeMap,
    saveData,
    effectiveObjectPlacements,
    getContainerAtCell,
    isBlockedByPlacement,
    objectByIdForPlay,
  ]);

  const beginVerb = (kind: string) => {
    setVerbFeedback(null);
    const verb = kind as PlayModeWheelVerbKind;
    if (saveData && activeMap) {
      const worldState = evaluateImmersiveWorldStateForSave(getRuntimeGamePackage(), saveData, {
        mapId: activeMap.id,
        cell: saveData.player.cell,
      });
      const gateBlock = getWorldGateBlock(worldState, "verb", verb);
      if (gateBlock) {
        presentWorldStateBlockFeedback(gateBlock, saveData.player.cell);
        return;
      }
    }
    if (verb === "drop") {
      const firstStack = (saveData?.inventory || []).find((entry) => entry.count > 0);
      if (!firstStack) {
        playSfx("warning", { volume: 0.28, cooldownMs: 180 });
        addLog("Nothing to drop.");
        return;
      }
      setVerbTargeting({ verb, itemId: firstStack.id });
    } else {
      // Elemental verbs operate directly on a target cell — no item needed.
      setVerbTargeting({ verb });
    }
    setHoveredCell(null);
    playSfx("ui_click", { volume: 0.2, cooldownMs: 120 });
  };

  const cancelVerbTargeting = () => {
    setVerbTargeting(null);
    setHoveredCell(null);
    setVerbFeedback(null);
    playSfx("ui_back", { volume: 0.18, cooldownMs: 120 });
  };

  const confirmVerbTarget = (x: number, z: number) => {
    const targeting = verbTargetingRef.current;
    if (!targeting) return;
    if (!verbTargetCells.some((c) => c.x === x && c.z === z)) {
      presentImmersiveVerbFailure(targeting.verb, [x, z], "Can't target there.");
      return;
    }
    const currentSave = usePlayStore.getState().saveData;
    const gp = getRuntimeGamePackage();
    if (!currentSave || !activeMap) return;
    const currentWorldState = evaluateImmersiveWorldStateForSave(gp, currentSave, {
      mapId: activeMap.id,
      cell: currentSave.player.cell,
    });
    const currentGateBlock = getWorldGateBlock(currentWorldState, "verb", targeting.verb);
    if (currentGateBlock) {
      presentWorldStateBlockFeedback(currentGateBlock, currentSave.player.cell);
      return;
    }
    // Emotional verbs are operators on a target actor's emotional axes
    // (doc 05 §5): Yell pushes arousal/fear, Console lowers grief. The outcome
    // — flee, calm, or a legible failure against a bound extreme — falls out
    // of the target's thresholds, and behavior changes are reported plainly.
    if (isAlderamonticoEmotionalVerb(targeting.verb)) {
      const target = getLivingActorAtCell(currentSave, activeMap, gp, x, z);
      if (!target) {
        presentImmersiveVerbFailure(targeting.verb, [x, z], "No one is there.");
        return;
      }
      const verbDef = getAlderamonticoEmotionalVerb(targeting.verb)!;
      const result = applyAlderamonticoEmotionalVerbToSave(currentSave, {
        verb: targeting.verb,
        actorId: target.actorId,
        seedAxes: entityEmotionalSeed(gp, target.entityId),
      });
      if (!result.ok) {
        presentImmersiveVerbFailure(targeting.verb, [x, z], "That has no effect.");
        return;
      }
      let nextSave = result.save;
      // Yelling is loud: write an audible disturbance so perception treats it
      // like any other noise (nearby ears investigate the source cell).
      if (verbDef.sound_radius > 0) {
        const soundResult = dispatchV1EmitSound({
          gamePackage: gp,
          save: nextSave,
          mapId: activeMap.id,
          cell: currentSave.player.cell,
          loudness: verbDef.sound_radius,
          tag: "voice",
        });
        if (soundResult.ok) {
          nextSave = soundResult.save;
          usePlayStore.getState().pushEngineEvents(soundResult.events);
        }
      }
      commitRuntimeSave(nextSave);
      const presentation = IMMERSIVE_VERB_PRESENTATION[targeting.verb];
      const fx = useFxStore.getState();
      if (presentation) {
        playSfx(presentation.sfx, {
          volume: presentation.volume,
          playbackRate: presentation.playbackRate,
          cooldownMs: 90,
        });
        fx.pulseScreen(presentation.pulse);
        fx.addPopup(target.cell, presentation.popup, presentation.color, 1.38);
      }
      const label = PLAYMODE_VERB_PAST_TENSE[targeting.verb] || titleCaseEffect(targeting.verb);
      if (result.resisted) {
        addLog(`${label} ${target.name} — it barely lands. Something binds them too tightly.`);
        fx.addPopup(target.cell, "Resisted", "#f9a8d4", 1.7);
      } else if (result.behavior_changed) {
        const behaviorNote =
          result.after.behavior === "flee"
            ? "they break and run"
            : result.after.behavior === "calm"
              ? "they settle"
              : result.after.behavior === "attack"
                ? "they turn on you"
                : result.after.behavior === "paralyzed"
                  ? "they go still"
                  : `now ${result.after.summary}`;
        addLog(`${label} ${target.name} — ${behaviorNote} (${result.before.summary} → ${result.after.summary}).`);
      } else {
        addLog(`${label} ${target.name} — ${result.after.summary}.`);
      }
      setVerbTargeting(null);
      setHoveredCell(null);
      return;
    }
    // Elemental verbs resolve through the authoritative grid-chemistry core
    // (numeric axes → derived conditions: fire spreads over wood, ice melts,
    // douse leaves scorch) rather than the legacy field-token reaction table.
    if (isChemistryVerb(targeting.verb)) {
      const chem = applyChemistryVerbToSave(gp, currentSave, {
        verb: targeting.verb,
        cell: [x, z],
        mapId: activeMap.id,
      });
      if (chem.ok) {
        commitRuntimeSave(chem.save);
        const label = PLAYMODE_VERB_PAST_TENSE[targeting.verb] || titleCaseEffect(targeting.verb);
        const note = chem.conditionSummary ? ` — ${chem.conditionSummary}` : "";
        addLog(`${label} (${x}, ${z}).${note}`);
        playSfx("spell_cast", { volume: 0.3, cooldownMs: 120 });
        // Cell popups for what the settle ticks did, plus body-state callouts
        // for any actor the verb just soaked/ignited/charged.
        presentChemistryFeedback(chem.reactions, chem.exposures, { logReactions: false });
      } else {
        presentImmersiveVerbFailure(
          targeting.verb,
          [x, z],
          chem.reason ? `Can't do that: ${chem.reason}.` : "Can't do that there.",
        );
      }
      setVerbTargeting(null);
      setHoveredCell(null);
      return;
    }
    // Emotional verbs returned above, so what remains is a global verb.
    const globalVerb = targeting.verb as ImmersiveGlobalVerbKind;
    const buildOptions = (): ImmersiveGlobalVerbOptions | null => {
      const targetCell = [x, z] as [number, number];
      const base: ImmersiveGlobalVerbOptions = {
        verb: globalVerb,
        cell: targetCell,
        actorId: "player",
        itemId: targeting.itemId,
        mapId: activeMap.id,
      };
      if (globalVerb === "drop" || PLAYMODE_DIRECT_CELL_VERBS.has(globalVerb)) return base;
      if (globalVerb === "break") return base;
      if (!PLAYMODE_OBJECT_VERBS.has(globalVerb)) return null;
      const direction = cardinalDirectionFromTo(currentSave.player.cell, targetCell);
      if (!direction) return null;
      const distance = manhattanCells(currentSave.player.cell, targetCell);
      if (globalVerb === "pull") {
        if (distance !== 2) return null;
        return {
          ...base,
          targetCell: [targetCell[0] - direction[0], targetCell[1] - direction[1]],
          direction,
          distance: 1,
        };
      }
      if (distance !== 1) return null;
      const multiplier = globalVerb === "throw" ? 2 : 1;
      return {
        ...base,
        targetCell: [targetCell[0] + direction[0] * multiplier, targetCell[1] + direction[1] * multiplier],
        direction,
        distance: multiplier,
      };
    };
    const options = buildOptions();
    if (!options) {
      presentImmersiveVerbFailure(targeting.verb, [x, z], "Can't target there.");
      return;
    }
    const targetWorldState = evaluateImmersiveWorldStateForSave(gp, currentSave, {
      mapId: activeMap.id,
      cell: options.targetCell || options.cell,
    });
    const targetGateBlock = getWorldGateBlock(targetWorldState, "verb", targeting.verb);
    if (targetGateBlock) {
      presentWorldStateBlockFeedback(targetGateBlock, options.targetCell || options.cell);
      return;
    }
    const result = applyImmersiveGlobalVerbToSave(gp, currentSave, options);
    if (result.ok) {
      commitRuntimeSave(result.save);
      const itemName =
        targeting.verb === "drop"
          ? gp.items.find((i) => i.id === targeting.itemId)?.display_name || "item"
          : undefined;
      presentImmersiveVerbOutcome(result, itemName);
    } else {
      presentImmersiveVerbFailure(
        targeting.verb,
        [x, z],
        result.reason ? `Can't do that: ${result.reason}.` : "Can't do that there.",
      );
    }
    setVerbTargeting(null);
    setHoveredCell(null);
  };
  confirmVerbTargetRef.current = confirmVerbTarget;

  const handleAttend = () => {
    if (!saveData) return;
    if (saveData.playerStats.hp <= 0) return;
    if (getPendingLevelUps(saveData) > 0) return;
    if (activeCutscene && activeCutscene.is_blocking) return;
    if (activeAttendNodePanel) return;
    if (!attendTarget) {
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      addLog("Face a living actor to Attend.");
      return;
    }

    const tick = saveData.clock_minutes ?? 0;
    const gp = getRuntimeGamePackage();
    const seedAxes = entityEmotionalSeed(gp, attendTarget.entityId);
    const seeded = ensureAlderamonticoActorState(saveData, attendTarget.actorId, { tick, seedAxes });
    const withPhysical = advanceAlderamonticoActorFromPhysical(seeded, attendTarget.actorId, {
      tick,
    });
    const entityDef = gp.entities.find((entity) => entity.id === attendTarget.entityId);
    const authoredAttendNode = entityDef?.attend_node;
    if (authoredAttendNode?.readings?.length) {
      const result = dispatchV1AttendNode({
        gamePackage: gp,
        save: withPhysical,
        node: authoredAttendNode,
        action: "open",
        targetActorId: attendTarget.actorId,
        tick,
        seedAxes,
      });
      if (!result.ok) {
        playSfx("warning", { volume: 0.22, cooldownMs: 120 });
        addLog(result.reason ? `Can't Attend: ${result.reason}.` : "Can't Attend that.");
        return;
      }
      commitRuntimeSave(result.save);
      setAttendedActor(attendTarget);
      const hiddenReadingCount = Math.max(0, authoredAttendNode.readings.length - result.visible_readings.length);
      setActiveAttendNodePanel({
        target: attendTarget,
        node: authoredAttendNode,
        visibleReadings: result.visible_readings,
        attention: result.attention,
        attentionChanged: result.attention_changed,
        composureRemaining: result.active?.composure_remaining ?? authoredAttendNode.composure ?? 0,
        condition: result.readout?.condition || buildAlderamonticoConditionReadout(result.save, attendTarget.actorId).condition,
        hiddenReadingCount,
      });
      playSfx("dialogue_open", { volume: 0.24, cooldownMs: 120 });
      const fx = useFxStore.getState();
      fx.pulseScreen(0.18);
      fx.addPopup(attendTarget.cell, result.attention_changed > 0 ? "Attend +1" : "Attend", "#67e8f9", 1.55);
      const attentionNote = result.attention_changed > 0 ? ` Attention ${attentionDisplay(result.attention)}.` : "";
      const hiddenNote = hiddenReadingCount > 0 ? ` ${hiddenReadingCount} reading${hiddenReadingCount === 1 ? "" : "s"} remain hidden.` : "";
      addLog(`Attending ${attendTarget.name}: ${result.readout?.condition || "focus holds"}.${attentionNote}${hiddenNote}`);
      return;
    }

    const state = withPhysical.alderamontico_state;
    const baseAttention = state?.attention ?? 20;
    const floorDelta =
      !state || Object.keys(state.attended || {}).length === 0 || !state.attended?.[attendTarget.actorId]
        ? 1
        : 0;
    const attention = Math.min(100, baseAttention + floorDelta);
    const attended = attendAlderamonticoActor(withPhysical, attendTarget.actorId, {
      attention,
      tick,
    });
    const readout = buildAlderamonticoConditionReadout(attended, attendTarget.actorId);
    commitRuntimeSave(attended);
    setAttendedActor(attendTarget);
    playSfx("dialogue_next", { volume: 0.2, cooldownMs: 120 });
    if (floorDelta > 0) {
      useFxStore.getState().addPopup(attendTarget.cell, "Attention +1", "#67e8f9", 1.45);
    }
    addLog(
      `Attended ${attendTarget.name}: ${readout.condition}.${
        floorDelta > 0 ? ` Attention ${attentionDisplay(attention)}.` : ""
      }`,
    );
  };

  const closeAttendNodePanel = () => {
    const currentSave = usePlayStore.getState().saveData;
    if (currentSave?.alderamontico_state?.active_attend) {
      commitRuntimeSave(closeAlderamonticoAttendNode(currentSave));
    }
    setActiveAttendNodePanel(null);
    playSfx("ui_back", { volume: 0.14, cooldownMs: 120 });
    addLog("You break attention before choosing a reading.");
  };

  const chooseAttendReading = (reading: AlderamonticoAttendReading, index: number) => {
    const currentSave = usePlayStore.getState().saveData;
    const panel = activeAttendNodePanel;
    if (!currentSave || !panel) return;
    const readingId = attendReadingKey(reading, index);
    const result = dispatchV1AttendNode({
      gamePackage: getRuntimeGamePackage(),
      save: currentSave,
      node: panel.node,
      action: "select",
      targetActorId: panel.target.actorId,
      readingId,
      tick: currentSave.clock_minutes ?? 0,
    });
    if (!result.ok) {
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      addLog(result.reason ? `Reading blocked: ${result.reason}.` : "That reading slips away.");
      return;
    }
    commitRuntimeSave(result.save);
    setAttendedActor(panel.target);
    setActiveAttendNodePanel(null);
    const fx = useFxStore.getState();
    const truth = result.selected_reading?.truth || reading.truth;
    const color = truth === "true" ? "#5eead4" : truth === "partial" ? "#facc15" : "#fb7185";
    fx.addPopup(panel.target.cell, truth === "false" ? "False certainty" : truth === "partial" ? "Cannot tell" : "True reading", color, 1.9);
    if (result.attention_changed > 0) {
      fx.addPopup(panel.target.cell, `Attention +${result.attention_changed}`, "#67e8f9", 2.15);
    }
    fx.pulseScreen(truth === "false" ? 0.34 : 0.22);
    playSfx(truth === "false" ? "warning" : "dialogue_next", { volume: truth === "false" ? 0.22 : 0.24, cooldownMs: 120 });
    const attentionNote = result.attention_changed > 0 ? ` Attention ${attentionDisplay(result.attention)}.` : "";
    addLog(`Reading chosen — ${reading.text}${attentionNote}`);
    if (result.readout?.condition) addLog(`Attended truth: ${result.readout.condition}.`);
  };

  useEffect(() => {
    if (!activeAttendNodePanel) return undefined;
    if (!saveData?.alderamontico_state?.active_attend) return undefined;
    if (activeDialogueId || activeShopId || activeDocumentId || activeContainerId || levelUpOpen) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      const currentSave = usePlayStore.getState().saveData;
      const panel = activeAttendNodePanel;
      if (!currentSave || !panel) return;
      const result = dispatchV1AttendNode({
        gamePackage: getRuntimeGamePackage(),
        save: currentSave,
        node: panel.node,
        action: "tick",
        ticks: 1,
        tick: currentSave.clock_minutes ?? 0,
      });
      if (!result.ok) {
        setActiveAttendNodePanel(null);
        return;
      }
      commitRuntimeSave(result.save);
      if (result.timed_out) {
        setActiveAttendNodePanel(null);
        setAttendedActor(panel.target);
        const selected = result.selected_reading?.text || "A false certainty closes over the moment.";
        const fx = useFxStore.getState();
        fx.addPopup(panel.target.cell, "Glass residue", "#c4b5fd", 2.1);
        fx.pulseScreen(0.48);
        playSfx("warning", { volume: 0.28, cooldownMs: 120 });
        addLog(`Composure broke. ${selected}`);
        if (result.readout?.condition) addLog(`Attended truth: ${result.readout.condition}.`);
        return;
      }
      setActiveAttendNodePanel({
        ...panel,
        visibleReadings: result.visible_readings,
        attention: result.attention,
        attentionChanged: result.attention_changed,
        composureRemaining: result.active?.composure_remaining ?? Math.max(0, panel.composureRemaining - 1),
        hiddenReadingCount: Math.max(0, panel.node.readings.length - result.visible_readings.length),
      });
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [
    activeAttendNodePanel,
    saveData?.alderamontico_state?.active_attend,
    activeDialogueId,
    activeShopId,
    activeDocumentId,
    activeContainerId,
    levelUpOpen,
    addLog,
    commitRuntimeSave,
    playSfx,
  ]);

  const handleAct = () => {
    if (!activeMap || !saveData) return;
    if (saveData.playerStats.hp <= 0) return;
    if (getPendingLevelUps(saveData) > 0) return;
    if (activeCutscene && activeCutscene.is_blocking) return;
    
    const gp = getRuntimeGamePackage();
    const inCombat = !!saveData.in_combat;
    const actor = getControlledActor(saveData, gp);
    if (!actor) return; // an enemy is acting
    if (!inCombat && (saveData.playerStats.energy || 0) < 1000) return;

    const actorCell = actor.cell;
    const actorFacing = actor.facing;

    let turnConsumed = false;
    // The faced target is one footprint-edge probe ahead of the actor's
    // center — the first fine cell past the actor's own footprint, which
    // lands inside the adjacent macro tile. Matching then happens per macro
    // tile (containers, triggers, items, workstations) or per footprint
    // (entities); exact fine-cell equality would only ever hit when both
    // parties were standing dead-center.
    const [tx, tz] = facedProbeCell(
      [actorCell[0], actorCell[1]],
      [actorFacing[0], actorFacing[1]],
    );

    // In combat, Act is a strike: hit the faced hostile or whiff harmlessly.
    // The world's levers (triggers, chests, ground items) wait for peace.
    if (inCombat) {
      const enemyIndex = activeMap.entity_placements?.findIndex((e, idx) => {
        if ((saveData.party_members || []).includes(e.entity_id)) return false;
        const key = entityPlacementStateKey(activeMap.id, e, idx);
        const est = (saveData.entity_states || {})[key];
        const cx = est?.cell?.[0] ?? e.cell[0];
        const cz = est?.cell?.[1] ?? e.cell[1];
        return footprintIntersectsLeadingEdge(
          [actorCell[0], actorCell[1]],
          [actorFacing[0], actorFacing[1]],
          [cx, cz],
        ) && !est?.dead && !est?.hidden;
      });
      if (enemyIndex !== undefined && enemyIndex >= 0) {
        const placement = activeMap.entity_placements[enemyIndex];
        const def = gp.entities.find((e) => e.id === placement.entity_id);
        if (def && !def.is_npc) {
          if (executeMeleeAttack(
            actor,
            entityPlacementStateKey(activeMap.id, placement, enemyIndex),
            def,
          )) {
            advanceCombatTurnCore();
          }
          return;
        }
      }
      addLog(
        actor.isPlayer
          ? "You swing at nothing."
          : `${actor.name} finds nothing to strike.`,
      );
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      return; // a whiff costs nothing — reposition instead
    }

    // Check interact triggers on the faced cell first, then the actor's cell.
    // Some authored interactables are walkable, so standing on the target
    // should be as valid as facing it from an adjacent tile.
    {
      const flags = saveData?.flags || {};
      const triggerConditionCtx = buildConditionContext(saveData);
      const interactCells = [
        [tx, tz],
        actorCell,
      ];
      const trigger = activeMap.triggers?.find(
        (t) => {
          if (
            t.type !== "interact" ||
            !isTriggerEligible(t, triggerConditionCtx) ||
            (t.once && flags[`trig_run_${t.id}`])
          ) {
            return false;
          }
          // Interact triggers are macro-tile semantics (§3.5): facing or
          // standing anywhere in the trigger's tile reaches it.
          return interactCells.some(
            ([cellX, cellZ]) =>
              t.cell && sameMacroCoord([t.cell[0], t.cell[1]], [cellX, cellZ]),
          );
        },
      );
      if (trigger) {
        const triggerResult = dispatchV1FireTrigger({
          gamePackage: gp,
          save: saveData,
          triggerId: trigger.id,
        });
        if (triggerResult.ok) {
          commitRuntimeSave(triggerResult.save);
          usePlayStore.getState().pushEngineEvents(triggerResult.events);
          // Fine-expanded package: action cells arrive converted.
          const cutscene = getRuntimeGamePackage().cutscenes.find(
            (c) => c.id === trigger.cutscene_id,
          );
          if (cutscene) {
            setActiveCutscene(cutscene);
            return;
          }
        }
      }
    }

    const reachableWorkstation = getReachableWorkstation(gp, activeMap.id, [
      [tx, tz],
      actorCell,
    ]);
    if (reachableWorkstation) {
      runWorkstationUse(reachableWorkstation);
      return;
    }

    // Check for entity interaction first
    const entityIndex = activeMap.entity_placements?.findIndex((e, idx) => {
      if ((saveData.party_members || []).includes(e.entity_id)) return false;
      const key = entityPlacementStateKey(activeMap.id, e, idx);
      const est = (saveData.entity_states || {})[key];
      const cx = est?.cell?.[0] ?? e.cell[0];
      const cz = est?.cell?.[1] ?? e.cell[1];
      return footprintIntersectsLeadingEdge(
        [actorCell[0], actorCell[1]],
        [actorFacing[0], actorFacing[1]],
        [cx, cz],
      ) && !est?.dead && !est?.hidden;
    });

    const entityPlacement =
      entityIndex !== undefined && entityIndex >= 0
        ? activeMap.entity_placements[entityIndex]
        : undefined;
    if (entityPlacement) {
      const entityData = useEngineStore
        .getState()
        .gamePackage.entities.find((e) => e.id === entityPlacement.entity_id);
      if (entityData && !entityData.is_npc) {
        // Act on a faced hostile = melee attack.
        const entityKey = entityPlacementStateKey(activeMap.id, entityPlacement, entityIndex!);
        executeMeleeAttack(actor, entityKey, entityData);
        return;
      }
      if (entityData && entityData.is_npc) {
        if (entityData.dialogue_id) {
          const dialogue = useEngineStore
            .getState()
            .gamePackage.dialogue.find((d) => d.id === entityData.dialogue_id);
          if (dialogue && dialogue.nodes.length > 0) {
            clearInputState();
            completeTalkObjectivesForEntity(entityData.id, saveData);
            usePlayStore
              .getState()
              .startDialogue(dialogue.id, dialogue.nodes[0].id);
            playSfx("dialogue_open", { volume: 0.32, cooldownMs: 120 });
            addLog(`Started conversation with ${entityData.display_name}...`);
          } else {
            playSfx("warning", { volume: 0.22, cooldownMs: 120 });
            addLog(`${entityData.display_name} has nothing to say.`);
          }
        } else {
          playSfx("warning", { volume: 0.22, cooldownMs: 120 });
          addLog(`${entityData.display_name} ignores you.`);
        }
        turnConsumed = true;
      }
      // The interaction is resolved — don't fall through to the empty-cell
      // "Nothing happened" branch below.
      if (turnConsumed) {
        usePlayStore.getState().updatePlayerStats({
          energy: (usePlayStore.getState().saveData?.playerStats.energy || saveData.playerStats.energy || 0) - 1000,
        });
        return;
      }
    }

    // Containers: unlock or open the one we're facing.
    const container = getContainerAtCell(tx, tz);
    if (container) {
      const containerState = getContainerRuntimeState(
        container,
        saveData,
        activeMap.id,
      );
      const containerName =
        container.display_name ||
        gamePackage.object_library.find((o) => o.id === container.object_id)
          ?.display_name ||
        "Container";

      if (containerState.locked) {
        const unlockResult = dispatchV1UnlockContainer({
          gamePackage: gp,
          save: saveData,
          containerId: container.id,
          energyCost: 1000,
        });
        if (unlockResult.ok) {
          commitWithFacts(saveData, unlockResult);
          const keyName =
            gamePackage.items.find((i) => i.id === container.key_item_id)
              ?.display_name || "the key";
          playSfx("ui_click", { volume: 0.24, cooldownMs: 120 });
          addLog(`Unlocked ${containerName} with ${keyName}.`);
        } else {
          playSfx("warning", { volume: 0.24, cooldownMs: 120 });
          addLog(`${containerName} is locked.`);
        }
        return;
      }

      const openResult = dispatchV1OpenContainer({
        gamePackage: gp,
        save: saveData,
        containerId: container.id,
        energyCost: 1000,
      });
      if (openResult.ok) {
        clearInputState();
        commitWithFacts(saveData, openResult);
        usePlayStore.getState().openContainer(container.id);
        playSfx("ui_click", { volume: 0.24, cooldownMs: 120 });
        addLog(`Opened ${containerName}.`);
      } else {
        playSfx("warning", { volume: 0.24, cooldownMs: 120 });
        addLog(`${containerName} is locked.`);
      }
      return;
    }

    // World items: pick up from the faced cell, or the one underfoot.
    const worldItems = getEffectiveWorldItems(
      activeMap,
      saveData.map_deltas?.[activeMap.id],
    );
    const worldItem =
      worldItems.find((w) => sameMacroCoord([w.cell[0], w.cell[1]], [tx, tz])) ||
      worldItems.find((w) =>
        sameMacroCoord([w.cell[0], w.cell[1]], [actorCell[0], actorCell[1]]),
      );
    if (worldItem) {
      const itemDef = gamePackage.items.find((i) => i.id === worldItem.item_id);
      // Authoritative pickup runs through the engine-core take_item command,
      // which mutates the save (inventory + map delta) and emits item_acquired.
      const pickup = dispatchV1TakeItem({
        gamePackage: gp,
        save: saveData,
        x: worldItem.cell[0],
        y: worldItem.cell[1],
        energyCost: 1000,
      });
      if (pickup.ok) {
        commitWithFacts(saveData, pickup);
      } else {
        // Fallback to the legacy mutators if the adapter can't resolve it.
        usePlayStore.getState().giveItem(worldItem.item_id, worldItem.count);
        if (worldItem.dropped) {
          usePlayStore.getState().removeDroppedItem(activeMap.id, worldItem.id);
        } else {
          usePlayStore.getState().takeAuthoredWorldItem(activeMap.id, worldItem.id);
        }
        usePlayStore.getState().updatePlayerStats({
          energy: (saveData.playerStats.energy || 0) - 1000,
        });
      }
      addLog(
        `Picked up ${worldItem.count > 1 ? `${worldItem.count}x ` : ""}${itemDef?.display_name || worldItem.item_id}.`,
      );
      playSfx("item_pickup", { volume: 0.38, cooldownMs: 120 });
      return;
    }

    // Check object placements
    // K3 manipulation: push a movable object the player is facing.
    const pushable = effectiveObjectPlacements.find((pl) => {
      const obj = objectByIdForPlay.get(pl.object_id);
      return placementHasCollision(pl, obj) && isPushableObject(obj) && placementOccupiesCell(pl, obj, tx, tz);
    });
    if (pushable) {
      const objName = objectByIdForPlay.get(pushable.object_id)?.display_name || "object";
      const pushResult = dispatchV1PushObject({
        gamePackage: gp,
        save: saveData,
        x: tx,
        y: tz,
        // Push one fine cell in the facing direction (the probe is several
        // cells out, so its delta is not a unit step).
        dx: actorFacing[0],
        dy: actorFacing[1],
        energyCost: 1000,
      });
      if (pushResult.ok) {
        commitWithFacts(saveData, pushResult);
        playSfx("door_transition", { volume: 0.3, cooldownMs: 150 });
        addLog(`You push the ${objName}.`);
      } else {
        playSfx("bump", { volume: 0.24, cooldownMs: 90 });
        addLog(`The ${objName} won't budge.`);
      }
      return;
    }

    const placement = activeMap.custom_object_placements.find((p) => {
      const objDef = useEngineStore
        .getState()
        .gamePackage.object_library.find((o) => o.id === p.object_id);
      return placementOccupiesCell(p, objDef, tx, tz);
    });
    const placementObject = placement
      ? gp.object_library.find((o) => o.id === placement.object_id)
      : undefined;
    if (
      placement &&
      isBuildingDoorPlacement(placement) &&
      !isDoorPlacementOpen(saveData.map_deltas?.[activeMap.id], placement)
    ) {
      const dialogue = placement.dialogue_id
        ? gp.dialogue.find((d) => d.id === placement.dialogue_id)
        : undefined;
      // Authoritative open runs through the engine-core open_door command,
      // which records the door in the save's map delta and emits door_opened.
      const doorResult = dispatchV1OpenDoor({
        gamePackage: gp,
        save: saveData,
        x: placement.cell[0],
        y: placement.cell[1],
        energyCost: 1000,
      });
      if (doorResult.ok) {
        commitWithFacts(saveData, doorResult);
      } else {
        playSfx("bump", { volume: 0.24, cooldownMs: 90 });
        addLog(
          doorResult.reason === "missing key"
            ? `${placementObject?.display_name || "Doorway"} is locked. You do not have its key.`
            : `${placementObject?.display_name || "Doorway"} cannot be opened (${doorResult.reason || "blocked"}).`,
        );
        return;
      }
      if (dialogue && dialogue.nodes.length > 0) {
        clearInputState();
        usePlayStore
          .getState()
          .startDialogue(dialogue.id, dialogue.nodes[0].id);
        playSfx("door_transition", { volume: 0.28, cooldownMs: 180 });
        playSfx("dialogue_open", { volume: 0.3, cooldownMs: 120 });
        addLog(`Knocked at ${placementObject?.display_name || "Doorway"}...`);
        return;
      }
      playSfx("door_transition", { volume: 0.32, cooldownMs: 180 });
      addLog(`${placementObject?.display_name || "Doorway"} opens.`);
      return;
    }
    if (placement && placement.dialogue_id) {
      const dialogue = useEngineStore
        .getState()
        .gamePackage.dialogue.find((d) => d.id === placement.dialogue_id);
      if (dialogue && dialogue.nodes.length > 0) {
        clearInputState();
        usePlayStore
          .getState()
          .startDialogue(dialogue.id, dialogue.nodes[0].id);
        playSfx("dialogue_open", { volume: 0.32, cooldownMs: 120 });
        addLog(`Started conversation with ${dialogue.nodes[0].speaker}...`);
        return;
      }
    }
    if (placement && isBuildingDoorPlacement(placement)) {
      playSfx("ui_click", { volume: 0.18, cooldownMs: 180 });
      addLog(`${placementObject?.display_name || "Doorway"} is already open.`);
      return;
    }
    if (placement && placementObject?.tags?.includes("door")) {
      playSfx("door_transition", { volume: 0.28, cooldownMs: 180 });
      addLog(`${placementObject.display_name || "Doorway"} opens onto the threshold.`);
      return;
    }

    const targetCell = activeMap.cells.find((c) => c.x === tx && c.z === tz);
    if (!targetCell) {
      playSfx("warning", { volume: 0.22, cooldownMs: 120 });
      addLog("Nothing there.");
      return;
    }

    playSfx("warning", { volume: 0.18, cooldownMs: 120 });
    addLog(`Interacted with [${tx}, ${tz}]. Nothing happened.`);
    turnConsumed = true;
    if (turnConsumed) {
      usePlayStore.getState().updatePlayerStats({
        energy: (saveData.playerStats.energy || 0) - 1000,
      });
    }
  };

  useEffect(() => {
    handleActRef.current = handleAct;
  });

  // Drop one of an inventory item onto the ground using deterministic
  // placement: faced tile first, then orthogonals, then diagonals.
  const handleDropItem = (itemId: string) => {
    const currentSave = usePlayStore.getState().saveData;
    if (!currentSave || !activeMap) return;
    if ((currentSave.playerStats.energy || 0) < 1000) {
      addLog("Not ready to act.");
      return;
    }

    const { cell, facing } = currentSave.player;
    const groundItems = getEffectiveWorldItems(
      activeMap,
      currentSave.map_deltas?.[activeMap.id],
    );

    const isFreeForItem = (x: number, z: number) => {
      const targetCell = activeMap.cells.find(
        (c) => c.x === x && c.z === z && c.walkable,
      );
      if (!targetCell) return false;
      if (getContainerAtCell(x, z)) return false;
      if (groundItems.some((w) => w.cell[0] === x && w.cell[1] === z))
        return false;
      if (isBlockedByPlacement(x, z)) return false;
      const entityThere = activeMap.entity_placements?.some((e, idx) => {
        if ((currentSave.party_members || []).includes(e.entity_id))
          return false;
        const key = entityPlacementStateKey(activeMap.id, e, idx);
        const est = (currentSave.entity_states || {})[key];
        if (est?.dead || est?.hidden) return false;
        const cx = est?.cell?.[0] ?? e.cell[0];
        const cz = est?.cell?.[1] ?? e.cell[1];
        return cx === x && cz === z;
      });
      return !entityThere;
    };

    const candidates: [number, number][] = [
      [facing[0], facing[1]],
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    let dropCell: [number, number] | null = null;
    for (const [dx, dz] of candidates) {
      if (dx === 0 && dz === 0) continue;
      const x = cell[0] + dx;
      const z = cell[1] + dz;
      if (isFreeForItem(x, z)) {
        dropCell = [x, z];
        break;
      }
    }

    if (!dropCell) {
      addLog("No space to drop.");
      return;
    }

    const itemDef = gamePackage.items.find((i) => i.id === itemId);
    const dropResult = dispatchV1DropItem({
      gamePackage,
      save: currentSave,
      itemId,
      count: 1,
      cell: dropCell,
      energyCost: 1000,
    });
    if (dropResult.ok) {
      commitWithFacts(currentSave, dropResult);
      addLog(`Dropped ${itemDef?.display_name || itemId}.`);
    } else {
      addLog(dropResult.reason === "missing item" ? "You don't have that." : "No space to drop.");
    }
  };

  const commitInventoryLayout = (layout: InventoryLayoutEntry[]) => {
    const currentSave = usePlayStore.getState().saveData;
    if (!currentSave) return;
    commitRuntimeSave({ ...currentSave, inventory_layout: layout });
  };

  const getHealingItemTargets = () => {
    if (!saveData) return [];
    return [
      {
        id: "player",
        name: "You",
        hp: saveData.playerStats.hp,
        maxHp: saveData.playerStats.max_hp,
        dead: saveData.playerStats.hp <= 0,
      },
      ...(saveData.party_members || []).flatMap((partyId) => {
        const def = gamePackage.entities.find((entity) => entity.id === partyId);
        if (!def) return [];
        const est = (saveData.entity_states || {})[partyId] || {};
        const hp = est.hp ?? def.max_hp ?? 1;
        return [{
          id: partyId,
          name: def.display_name,
          hp,
          maxHp: def.max_hp ?? 1,
          dead: Boolean(est.dead) || hp <= 0,
        }];
      }),
    ];
  };

  const useConsumableItem = (
    itemDef: GamePackage["items"][number],
    itemId: string,
    targetId = "player",
  ) => {
    const store = usePlayStore.getState();
    const currentSave = store.saveData;
    if (!currentSave) return;

    const effects = itemDef.effects;
    let used = false;
    const fx = useFxStore.getState();

    if (effects?.heal) {
      if (targetId === "player") {
        store.updatePlayerHp(effects.heal);
        fx.addPopup(currentSave.player.cell, `+${effects.heal}`, "#4ade80");
        addLog(
          `Used ${itemDef.display_name} on you. Restored ${effects.heal} HP.`,
        );
      } else {
        const targetDef = gamePackage.entities.find((entity) => entity.id === targetId);
        if (!targetDef) {
          playSfx("warning", { volume: 0.24, cooldownMs: 120 });
          addLog("No valid target.");
          return;
        }
        const targetState = {
          ...((currentSave.entity_states || {})[targetId] || {}),
        } as any;
        const maxHp = targetDef.max_hp ?? 1;
        const currentHp = Math.max(0, targetState.hp ?? maxHp);
        const nextHp = Math.min(maxHp, currentHp + effects.heal);
        store.updateEntityState(targetId, { hp: nextHp, dead: false });
        const popupCell =
          (targetState.cell as [number, number] | undefined) ||
          latestPartyFollowersRef.current.find((follower) => follower.entity_id === targetId)?.cell ||
          currentSave.player.cell;
        fx.addPopup(popupCell, `+${effects.heal}`, "#4ade80");
        fx.flashEntity(targetId);
        addLog(
          `Used ${itemDef.display_name} on ${targetDef.display_name}. Restored ${effects.heal} HP.`,
        );
      }
      used = true;
    }

    if (effects?.mp_restore) {
      if (targetId === "player") {
        store.updatePlayerMp(effects.mp_restore);
        addLog(
          `Used ${itemDef.display_name}. Restored ${effects.mp_restore} MP.`,
        );
        used = true;
      } else {
        const targetDef = gamePackage.entities.find((entity) => entity.id === targetId);
        if (targetDef) {
          const targetState = {
            ...((currentSave.entity_states || {})[targetId] || {}),
          } as any;
          const maxMp = targetDef.max_mp ?? 0;
          const currentMp = targetState.mp ?? maxMp;
          store.updateEntityState(targetId, {
            mp: Math.min(maxMp, currentMp + effects.mp_restore),
          });
          addLog(
            `Used ${itemDef.display_name} on ${targetDef.display_name}. Restored ${effects.mp_restore} MP.`,
          );
          used = true;
        }
      }
    }

    if (targetId === "player" && effects?.energy_restore) {
      const stats = store.saveData?.playerStats;
      if (stats) {
        store.updatePlayerStats({
          energy: (stats.energy || 0) + effects.energy_restore,
        });
        addLog(`Used ${itemDef.display_name}. Restored energy.`);
        used = true;
      }
    }

    if (targetId === "player" && effects?.survival_restore) {
      const latestSave = store.saveData || currentSave;
      const restore = effects.survival_restore;
      const nextFlags = { ...(latestSave.flags || {}) };
      const eased: string[] = [];
      ([
        ["hunger", restore.hunger],
        ["thirst", restore.thirst],
        ["fatigue", restore.fatigue],
        ["exposure", restore.exposure],
      ] as const).forEach(([axis, amount]) => {
        const value = Math.max(0, Number(amount || 0));
        if (value <= 0) return;
        const flag = `survival_${axis}`;
        const before = Math.max(0, Number(nextFlags[flag] || 0));
        const after = Math.max(0, before - value);
        nextFlags[flag] = after;
        if (after < before) eased.push(axis);
      });
      if (eased.length > 0) {
        store.commitRuntimeSave({ ...latestSave, flags: nextFlags });
        fx.addPopup(currentSave.player.cell, "Stabilized", "#a7f3d0", 1.6);
        addLog(`Used ${itemDef.display_name}. Eased ${eased.join(", ")}.`);
        used = true;
      }
    }

    if (
      targetId === "player" &&
      (effects?.max_hp_bonus ||
        effects?.attack_bonus ||
        effects?.defense_bonus ||
        effects?.speed_bonus)
    ) {
      const stats = store.saveData?.playerStats;
      if (stats) {
        store.updatePlayerStats({
          max_hp: (stats.max_hp || 10) + (effects.max_hp_bonus || 0),
          attack: (stats.attack || 2) + (effects.attack_bonus || 0),
          defense: (stats.defense || 1) + (effects.defense_bonus || 0),
          speed: (stats.speed || 10) + (effects.speed_bonus || 0),
        });
        if (effects.max_hp_bonus) {
          store.updatePlayerHp(effects.max_hp_bonus);
        }
        addLog(`Used ${itemDef.display_name}. Gained stats!`);
        used = true;
      }
    }

    if (!used) {
      playSfx("warning", { volume: 0.24, cooldownMs: 120 });
      addLog(`Used ${itemDef.display_name}. Nothing happened.`);
    } else {
      playSfx("heal", { volume: 0.32, cooldownMs: 120 });
    }

    store.removeItem(itemId, 1);
    if (store.saveData?.in_combat) {
      setShowInventory(false);
      advanceCombatTurnCore();
    }
  };

  // Stable render inputs for GameRenderer (recomputed only when the world
  // actually changes, not on every player step).
  const renderMapDelta = useMemo(
    () => (activeMap ? activeMapDelta : undefined),
    [activeMap, activeMapDelta],
  );
  const containerRenderPlacements = useMemo(
    () =>
      (activeMap?.container_placements || []).map((c) => ({
        object_id: c.object_id,
        cell: c.cell,
        facing: c.facing,
      })),
    [activeMap?.container_placements],
  );
  const worldItemsRender = useMemo(() => {
    if (!activeMap)
      return [] as { id: string; cell: [number, number]; icon: string }[];
    const iconOf = (itemId: string) =>
      gamePackage.items.find((i) => i.id === itemId)?.icon || "📦";
    return getEffectiveWorldItems(activeMap, renderMapDelta).map((w) => ({
      id: w.id,
      cell: w.cell,
      icon: iconOf(w.item_id),
    }));
  }, [activeMap, renderMapDelta, gamePackage.items]);

  // Living hostiles in threat range — drives the danger HUD panel and the
  // engaged feel (HP bars + threat rings render in GameRenderer).
  const nearbyHostiles = useMemo(
    () =>
      saveData?.in_combat
        ? []
        : getNearbyHostiles(saveData, activeMap, gamePackage, THREAT_RADIUS),
    [saveData, activeMap, gamePackage],
  );

  // All cells inside the aimed skill's range, shown as a faint field while
  // targeting so reach is legible before committing.
  const targetingRangeCells = useMemo(() => {
    if (!targetingSkillId || !saveData)
      return undefined as { x: number; z: number }[] | undefined;
    const skill = gamePackage.abilities.find((s) => s.id === targetingSkillId);
    if (!skill) return undefined;
    const caster = getControlledActor(saveData, gamePackage);
    if (!caster) return undefined;
    return getV1SkillRangeCells({
      gamePackage,
      save: saveData,
      actorId: caster.key,
      skillId: skill.id,
    }).map(([x, z]) => ({ x, z }));
  }, [targetingSkillId, saveData, gamePackage]);

  const combatTacticalSnapshot = useMemo((): ImmersiveStage6TacticalSnapshot | null => {
    if (!activeMap || !saveData?.in_combat) return null;
    try {
      return createImmersiveCombatTacticalSnapshotFromV1(gamePackage, saveData, activeMap.id);
    } catch {
      return null;
    }
  }, [activeMap, gamePackage, saveData]);

  const lastExplorationPerceptionRef = useRef<ImmersiveStage4PerceptionSnapshot | null>(null);
  const perceptionSnapshot = useMemo((): ImmersiveStage4PerceptionSnapshot | null => {
    if (!activeMap || !saveData || !mapHasPerceivingActor) return null;
    // Combat alert state is already persisted on actors. Keep the last
    // exploration snapshot for HUD/cone presentation instead of rebuilding
    // full-map stimuli and LOS for every one-cell hostile pulse.
    if (saveData.in_combat && lastExplorationPerceptionRef.current) {
      return lastExplorationPerceptionRef.current;
    }
    try {
      const snapshot = createImmersivePerceptionSnapshotFromV1(gamePackage, saveData, activeMap.id);
      lastExplorationPerceptionRef.current = snapshot;
      return snapshot;
    } catch {
      return null;
    }
  }, [activeMap, gamePackage, saveData, mapHasPerceivingActor]);

  const worldStateEvaluation = useMemo((): ImmersiveWorldStateEvaluation | null => {
    if (!activeMap || !saveData) return null;
    try {
      return evaluateImmersiveWorldStateForSave(gamePackage, saveData, {
        mapId: activeMap.id,
      });
    } catch {
      return null;
    }
  }, [activeMap, gamePackage, saveData]);
  // The only cells that can be spatially denied are walkable cells inside a
  // region that carries a reputation gate or a denial passive-check. Most maps
  // have none — precompute the candidate set once per map so the per-commit
  // denial pass below is O(gated cells) instead of O(whole 9× map).
  const gatedRegionCells = useMemo(() => {
    if (!activeMap) return [] as CellData[];
    const gatedRegionIds = new Set(
      (activeMap.regions || [])
        .filter(
          (region) =>
            (region.reputation_threshold !== undefined && !region.neutral) ||
            (region.passive_checks || []).some((check) => check.denial),
        )
        .map((region) => region.id),
    );
    if (gatedRegionIds.size === 0) return [] as CellData[];
    return activeMap.cells.filter(
      (cell) =>
        cell.active && cell.walkable && cell.region_id && gatedRegionIds.has(cell.region_id),
    );
  }, [activeMap]);
  const worldDeniedCells = useMemo(() => {
    const denied: { x: number; z: number; kind: ImmersiveWorldStateGateResult["kind"] }[] = [];
    if (!activeMap || !saveData || gatedRegionCells.length === 0) return denied;
    for (const cell of gatedRegionCells) {
      try {
        const evaluation = evaluateImmersiveWorldStateForSave(gamePackage, saveData, {
          mapId: activeMap.id,
          cell: [cell.x, cell.z],
        });
        const gate = evaluation.denials.find((candidate) => WORLD_SPATIAL_DENIAL_KINDS.has(candidate.kind));
        if (gate) denied.push({ x: cell.x, z: cell.z, kind: gate.kind });
      } catch {
        // A bad authored region should not take down play rendering.
      }
    }
    return denied;
  }, [activeMap, gamePackage, gatedRegionCells, saveData]);
  const attendTarget = useMemo(
    () => getFacedAttendTarget(saveData, activeMap, gamePackage),
    [saveData, activeMap, gamePackage],
  );
  const attendedConditionReadout = useMemo((): AlderamonticoConditionReadout | null => {
    if (!saveData || !attendedActor) return null;
    try {
      return buildAlderamonticoConditionReadout(saveData, attendedActor.actorId);
    } catch {
      return null;
    }
  }, [saveData, attendedActor]);

  // Timestamp of the last hit the player took; keys the red vignette flash.
  const playerHurtAt = useFxStore((s) => s.playerHurtAt);
  const screenPulseAt = useFxStore((s) => s.screenPulseAt);
  const screenPulseStrength = useFxStore((s) => s.screenPulseStrength);

  // Workstation process selection is synced via an effect. It MUST run on every
  // render (Rules of Hooks), so it lives before the loading-guard early return
  // below — its inputs are computed null-safely here rather than after the guard.
  const reachableWorkstation =
    activeMap && saveData && !saveData.in_combat
      ? getReachableWorkstation(gamePackage, activeMap.id, [
          saveData.player.cell || [0, 0],
          [
            (saveData.player.cell?.[0] ?? 0) + (saveData.player.facing?.[0] ?? 0),
            (saveData.player.cell?.[1] ?? 0) + (saveData.player.facing?.[1] ?? 0),
          ],
        ])
      : undefined;
  const workstationProcessDefs = reachableWorkstation
    ? gamePackage.simulation_processes.filter((process) =>
        reachableWorkstation.process_ids.length
          ? reachableWorkstation.process_ids.includes(process.id)
          : process.workstation_id === reachableWorkstation.id,
      )
    : [];
  const workstationProcessIds = workstationProcessDefs.map((process) => process.id).join("|");
  useEffect(() => {
    if (!reachableWorkstation || workstationProcessDefs.length === 0) {
      setSelectedWorkstationProcessId(null);
      return;
    }
    setSelectedWorkstationProcessId((current) =>
      current && workstationProcessDefs.some((process) => process.id === current)
        ? current
        : workstationProcessDefs[0].id,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachableWorkstation?.id, workstationProcessIds]);

  if (!activeMap || !saveData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        Loading map...
      </div>
    );
  }

  const inCombat = !!saveData.in_combat;
  const controlledActor = getControlledActor(saveData, gamePackage);
  const activeTurnId = inCombat ? (saveData.active_turn_id ?? null) : null;

  // The HUD bars and the camera follow whoever is being commanded — the
  // player normally, a party member on their combat turn.
  const commandingParty = Boolean(controlledActor && !controlledActor.isPlayer);
  const activeFocusPos: [number, number] =
    commandingParty && controlledActor
      ? controlledActor.cell
      : saveData.player.cell || [0, 0];
  const activeStats =
    commandingParty && controlledActor
      ? {
          hp: controlledActor.hp,
          max_hp: controlledActor.maxHp,
          mp: controlledActor.mp,
          max_mp: controlledActor.maxMp,
          energy: 1000,
          attack: controlledActor.attack,
          defense: controlledActor.defense,
          speed: controlledActor.speed,
        }
      : saveData.playerStats;

  const playerPos = saveData.player.cell || [0, 0];
  const playerFacing = saveData.player.facing || [0, -1];
  const activeMapSpawn = activeMap.spawns[0];
  const saveMatchesRenderedMap = saveData.current_map_id === activeMap.id;
  const renderedPlayerPos: [number, number] = saveMatchesRenderedMap
    ? playerPos
    : ((activeMapSpawn?.cell as [number, number] | undefined) || playerPos);
  const renderedPlayerFacing: [number, number] = saveMatchesRenderedMap
    ? playerFacing
    : ((activeMapSpawn?.facing as [number, number] | undefined) || playerFacing);
  const renderedFocusPos: [number, number] = saveMatchesRenderedMap
    ? activeFocusPos
    : renderedPlayerPos;
  const playerPhysicalState = saveData.actor_physical_states?.player;
  const playerPhysicalActive = physicalStateIsActive(playerPhysicalState);
  const overlayOpen = Boolean(
    activeShopId ||
      activeDialogueId ||
      activeDocumentId ||
      activeContainerId ||
      activeAttendNodePanel ||
      levelUpOpen,
  );
  // `reachableWorkstation` / `workstationProcessDefs` / `workstationProcessIds`
  // are computed above the loading guard (see the workstation sync effect).
  const activeWorkstationProcess = reachableWorkstation
    ? getActiveProcessForWorkstation(saveData, activeMap.id, reachableWorkstation.id)
    : undefined;
  const activeWorkstationProcessDef = activeWorkstationProcess
    ? gamePackage.simulation_processes.find((process) => process.id === activeWorkstationProcess.process_def_id)
    : undefined;
  const selectedWorkstationProcess =
    workstationProcessDefs.find((process) => process.id === selectedWorkstationProcessId) ||
    workstationProcessDefs[0];
  const displayedWorkstationProcess = activeWorkstationProcessDef || selectedWorkstationProcess;
  const itemStackLabel = (entry: { item_id: string; count: number }) => {
    const item = gamePackage.items.find((candidate) => candidate.id === entry.item_id);
    return `${entry.count > 1 ? `${entry.count}x ` : ""}${item?.display_name || entry.item_id}`;
  };
  const inventoryCount = (itemId: string) =>
    (saveData.inventory || [])
      .filter((entry) => entry.id === itemId)
      .reduce((total, entry) => total + Math.max(0, entry.count || 0), 0);
  const workstationMissingInputs =
    !activeWorkstationProcess && selectedWorkstationProcess
      ? selectedWorkstationProcess.input_items.filter((entry) => inventoryCount(entry.item_id) < entry.count)
      : [];
  const workstationOutputDrops = reachableWorkstation
    ? getEffectiveWorldItems(activeMap, saveData.map_deltas?.[activeMap.id]).filter(
        (item) =>
          item.dropped &&
          item.cell[0] === reachableWorkstation.cell[0] &&
          item.cell[1] === reachableWorkstation.cell[1],
      )
    : [];
  const workstationOutputLabel = workstationOutputDrops.length
    ? workstationOutputDrops.map((entry) => itemStackLabel({ item_id: entry.item_id, count: entry.count })).join(", ")
    : (displayedWorkstationProcess?.output_items || []).map(itemStackLabel).join(", ");
  const workstationProgress =
    activeWorkstationProcess
      ? Math.round((activeWorkstationProcess.progress_ticks / Math.max(1, activeWorkstationProcess.required_ticks)) * 100)
      : 0;
  const workstationPromptVisible =
    Boolean(reachableWorkstation) &&
    Boolean(activeWorkstationProcess || selectedWorkstationProcess || workstationOutputDrops.length) &&
    !overlayOpen &&
    !targetingSkillId &&
    !verbTargeting &&
    !showInventory &&
    !showSkills &&
    !showSaveMenu &&
    !showJournal;
  const clockTotalMinutes = Math.floor(saveData.clock_minutes ?? 0);
  const clockDay = Math.floor(clockTotalMinutes / 1440) + 1;
  const clockHour = Math.floor(clockTotalMinutes / 60) % 24;
  const clockMinute = clockTotalMinutes % 60;
  const clockPhase = CLOCK_PHASE_LABELS[getClockPhaseId(clockHour)];
  const playerLevel = getSaveLevel(saveData);
  const playerExperience = getSaveExperience(saveData);
  const currentLevelXp = getXpRequiredForLevel(playerLevel);
  const nextLevelXp = getXpRequiredForLevel(playerLevel + 1);
  const xpSpan = Math.max(1, nextLevelXp - currentLevelXp);
  const xpProgress = Math.max(
    0,
    Math.min(100, ((playerExperience - currentLevelXp) / xpSpan) * 100),
  );
  const xpRemaining = getXpRemainingForNextLevel(saveData);
  const shopConditionCtx = buildConditionContext(saveData);
  const questJournal = buildQuestJournal(saveData, gamePackage);
  const activeQuestStep = questJournal.activeStep;
  const partyMemberIds = saveData.party_members || [];
  const knownAbilityIds = new Set([
    ...(saveData.known_skills || []),
    ...gamePackage.abilities.filter((ability) => ability.starts_unlocked).map((ability) => ability.id),
  ]);
  const actorAbilityIds = new Set(controlledActor?.skills || []);
  const allAbilityEntries: AbilityBarEntry[] = gamePackage.abilities
    .filter((ability) => {
      if (ability.ability_kind === "skill") {
        return controlledActor
          ? actorAbilityIds.has(ability.id) || knownAbilityIds.has(ability.id)
          : knownAbilityIds.has(ability.id);
      }
      return knownAbilityIds.has(ability.id);
    })
    .map((ability) => {
      const action = ability.runtime_action;
      let disabled = false;
      let disabledReason: string | undefined;
      const requireActor = () => {
        if (!controlledActor) {
          disabled = true;
          disabledReason = "No actor is ready.";
        }
      };
      const requirePlayerControl = () => {
        if (commandingParty) {
          disabled = true;
          disabledReason = "Only the player can use this outside their own body.";
        }
      };

      if (ability.ability_kind === "skill") {
        requireActor();
        if (!disabled && controlledActor) {
          if ((controlledActor.mp ?? 0) < ability.mp_cost) {
            disabled = true;
            disabledReason = `Needs ${ability.mp_cost} MP.`;
          } else if (!inCombat && controlledActor.isPlayer && (activeStats.energy || 0) < ability.ap_cost) {
            disabled = true;
            disabledReason = "Not ready to act yet.";
          }
        }
      } else if (action === "basic_attack") {
        requireActor();
        if (!disabled && !inCombat && controlledActor?.isPlayer && (activeStats.energy || 0) < 1000) {
          disabled = true;
          disabledReason = "Not ready to attack yet.";
        }
      } else if (action === "shove") {
        requireActor();
        if (!disabled && !inCombat) {
          disabled = true;
          disabledReason = "Shove is a combat action.";
        }
      } else if (action === "overwatch") {
        requireActor();
        if (!disabled && commandingParty) {
          disabled = true;
          disabledReason = "Only the player can set overwatch.";
        } else if (!disabled && !inCombat) {
          disabled = true;
          disabledReason = "Overwatch is a combat action.";
        } else if (!disabled && saveData.flags?.immersive_overwatch_player) {
          disabled = true;
          disabledReason = "Overwatch is already armed.";
        }
      } else if (action === "attend") {
        requirePlayerControl();
        if (!disabled && !attendTarget) {
          disabled = true;
          disabledReason = "Face a living actor.";
        }
      } else if (action === "wait") {
        requireActor();
        if (!disabled && !inCombat && (activeStats.energy || 0) < 1000) {
          disabled = true;
          disabledReason = "Not ready to wait.";
        }
      } else if (isPlayModeVerbAction(action)) {
        requirePlayerControl();
        if (!disabled && !inCombat && (activeStats.energy || 0) < 1000) {
          disabled = true;
          disabledReason = "Not ready to act yet.";
        }
        if (!disabled && action === "drop" && !(saveData.inventory || []).some((entry) => entry.count > 0)) {
          disabled = true;
          disabledReason = "Nothing to drop.";
        }
      }

      const costs: string[] = [];
      if (ability.ap_cost > 0) costs.push(`${Math.round(ability.ap_cost / 1000)} AP`);
      if (ability.mp_cost > 0) costs.push(`${ability.mp_cost} MP`);
      return {
        ability,
        disabled,
        disabledReason,
        costLabel: costs.join(" / "),
      };
    })
    .sort((a, b) => {
      const pageDelta = ABILITY_PAGE_ORDER.indexOf(abilityPageFor(a.ability)) - ABILITY_PAGE_ORDER.indexOf(abilityPageFor(b.ability));
      if (pageDelta !== 0) return pageDelta;
      return (a.ability.sort_order ?? 999) - (b.ability.sort_order ?? 999) || a.ability.display_name.localeCompare(b.ability.display_name);
    });
  const abilityBarPages = ABILITY_PAGE_ORDER.flatMap((page) => {
    const entries = allAbilityEntries.filter((entry) => abilityPageFor(entry.ability) === page);
    const pageCount = Math.max(1, Math.ceil(entries.length / ABILITY_BAR_PAGE_SIZE));
    return Array.from({ length: pageCount }, (_, index) => {
      const chunk = entries.slice(index * ABILITY_BAR_PAGE_SIZE, (index + 1) * ABILITY_BAR_PAGE_SIZE);
      if (chunk.length === 0) return null;
      return {
        page,
        label: pageCount > 1 ? `${ABILITY_PAGE_LABELS[page]} ${index + 1}/${pageCount}` : ABILITY_PAGE_LABELS[page],
        entries: chunk,
      };
    }).filter((pageData): pageData is { page: AbilityPageId; label: string; entries: AbilityBarEntry[] } => Boolean(pageData));
  });
  const safeAbilityPageIndex = abilityBarPages.length
    ? ((activeAbilityPageIndex % abilityBarPages.length) + abilityBarPages.length) % abilityBarPages.length
    : 0;
  const activeAbilityPageData = abilityBarPages[safeAbilityPageIndex];
  const visibleAbilityEntries = activeAbilityPageData?.entries || [];
  const abilityBarVisible = abilityBarPages.length > 0 && !levelUpOpen && !targetingSkillId && !overlayOpen;
  const abilityPageLabel = activeAbilityPageData?.label || "Abilities";
  const setAbilityPageByOffset = (offset: number) => {
    if (!abilityBarPages.length) return;
    setActiveAbilityPageIndex((current) => current + offset);
    playSfx("ui_click", { volume: 0.16, cooldownMs: 100 });
  };
  const activateAbility = (entry: AbilityBarEntry) => {
    const { ability } = entry;
    if (entry.disabled) {
      playSfx("warning", { volume: 0.22, cooldownMs: 140 });
      if (entry.disabledReason) addLog(entry.disabledReason);
      return;
    }
    if (ability.ability_kind === "skill" || !ability.runtime_action) {
      beginTargeting(ability.id);
      return;
    }
    const action = ability.runtime_action;
    if (isPlayModeVerbAction(action)) {
      beginVerb(action);
      return;
    }
    switch (action) {
      case "basic_attack":
        executeFacedBasicAttack();
        return;
      case "shove":
        executeCombatShove();
        return;
      case "overwatch":
        executeCombatOverwatch();
        return;
      case "wait":
        performWait();
        return;
      case "attend":
        handleAttend();
        return;
      default:
        playSfx("warning", { volume: 0.22, cooldownMs: 140 });
        addLog(`${ability.display_name} is not wired yet.`);
    }
  };
  abilityBarEntriesRef.current = visibleAbilityEntries;
  activateAbilityRef.current = activateAbility;
  const isOpenFollowerCell = (x: number, z: number) => {
    const cell = getActiveCell(x, z);
    if (cell && !cell.walkable) return false;
    if (!cell) return false;
    if (getContainerAtCell(x, z)) return false;
    return !isBlockedByPlacement(x, z);
  };
  const partyFollowers = partyMemberIds.map((entity_id, index) => {
    // In combat, party members hold real positions of their own.
    if (inCombat) {
      const est = (saveData.entity_states || {})[entity_id];
      if (est?.cell) {
        return { entity_id, cell: est.cell as [number, number] };
      }
    }
    const offsets: [number, number][] = [
      [-(playerFacing[0] || 0) * (index + 1), -(playerFacing[1] || 0) * (index + 1)],
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
      [-1, 1],
      [1, 1],
    ];
    const offset =
      offsets.find(([dx, dz]) => isOpenFollowerCell(playerPos[0] + dx, playerPos[1] + dz)) ||
      offsets[0];
    return {
      entity_id,
      cell: [playerPos[0] + offset[0], playerPos[1] + offset[1]] as [number, number],
    };
  });

  latestPartyFollowersRef.current = partyFollowers;

  // Player-side action order. Enemies resolve in the shared pulse and never
  // occupy a separate input-blocking turn.
  const combatQueueInfo = inCombat
    ? (saveData.combat_queue || []).map((id) => {
        if (id === "player") {
          return {
            id,
            name: "You",
            hp: saveData.playerStats.hp,
            maxHp: saveData.playerStats.max_hp,
            kind: "player" as const,
            dead: saveData.playerStats.hp <= 0,
          };
        }
        if (partyMemberIds.includes(id)) {
          const def = gamePackage.entities.find((e) => e.id === id);
          const est = (saveData.entity_states || {})[id] || {};
          return {
            id,
            name: def?.display_name || id,
            hp: est.hp ?? def?.max_hp ?? 0,
            maxHp: def?.max_hp ?? 1,
            kind: "party" as const,
            dead: !!est.dead,
          };
        }
        let name = "Foe";
        let maxHp = 1;
        let hp = 0;
        let dead = false;
        activeMap.entity_placements?.forEach((p, idx) => {
          if (entityPlacementStateKey(activeMap.id, p, idx) !== id) return;
          const def = gamePackage.entities.find((e) => e.id === p.entity_id);
          const est = (saveData.entity_states || {})[id] || {};
          name = def?.display_name || "Foe";
          maxHp = def?.max_hp ?? 1;
          hp = est.hp ?? maxHp;
          dead = !!est.dead || !!est.hidden;
        });
        return { id, name, hp, maxHp, kind: "enemy" as const, dead };
      })
    : [];
  const combatNameById = new Map(combatQueueInfo.map((entry) => [entry.id, entry.name]));
  const combatTeamById = new Map(
    combatTacticalSnapshot?.actors.map((actor) => [actor.actor_id, actor.team]) || [],
  );
  const hostileIntentRows =
    combatTacticalSnapshot?.intents
      .filter((intent) => combatTeamById.get(intent.actor_id) === "hostile")
      .slice(0, 3)
      .map((intent) => ({
        key: `${intent.actor_id}:${intent.action_type}:${intent.target_cells.map((cell) => cell.join(",")).join("|")}`,
        actorName: combatNameById.get(intent.actor_id) || "Foe",
        label: COMBAT_INTENT_LABELS[intent.action_type] || titleCaseEffect(intent.action_type),
        target:
          intent.target_actor_id === "player"
            ? "You"
            : intent.target_actor_id
              ? combatNameById.get(intent.target_actor_id) || "Target"
              : intent.target_cells[0]
                ? `(${intent.target_cells[0][0]}, ${intent.target_cells[0][1]})`
                : "",
        damage: intent.estimated_damage,
      })) || [];
  const behaviorIntentRows = Object.values(saveData.entity_states || {})
    .flatMap((state: any) =>
      ((state?.behavior_intent_log || []) as EntityBehaviorIntentRecord[]).slice(-8),
    )
    .sort((a, b) => b.decided_at_tick - a.decided_at_tick)
    .slice(0, 12);
  const combatCoverEdgeCount = combatTacticalSnapshot?.totals.cover_edges || 0;
  const combatOverwatchZoneCount = combatTacticalSnapshot?.totals.overwatch_zones || 0;
  const facedCombatReadout: CombatAttackReadout | null = (() => {
    if (!inCombat || !controlledActor || !combatTacticalSnapshot) return null;
    const attacker = combatTacticalSnapshot.actors.find(
      (actor) =>
        actor.actor_id === controlledActor.key ||
        actor.entity_id === controlledActor.key ||
        (controlledActor.isPlayer && actor.actor_id === "player") ||
        combatCellsEqual(actor.cell, controlledActor.cell),
    );
    if (!attacker) return null;

    const target = combatTacticalSnapshot.actors.find(
      (actor) =>
        actor.team === "hostile" &&
        footprintIntersectsLeadingEdge(
          [controlledActor.cell[0], controlledActor.cell[1]],
          [controlledActor.facing[0], controlledActor.facing[1]],
          [actor.cell[0], actor.cell[1]],
        ),
    );
    if (!target) return null;

    const incoming = combatPrimaryDirection(target.cell, attacker.cell);
    const cover = combatTacticalSnapshot.cover_edges.find(
      (edge) => combatCellsEqual(edge.cell, target.cell) && combatCellsEqual(edge.direction, incoming),
    );
    const flanked = incoming[0] * target.facing[0] + incoming[1] * target.facing[1] < 0;
    const coverReduction = cover && !flanked ? (cover.strength === "full" ? 4 : 2) : 0;
    const heightDelta = attacker.height - target.height;
    const heightBonus = heightDelta > 0 ? 2 : heightDelta < 0 ? -1 : 0;
    const facingBonus = flanked ? 2 : 0;
    const baseDamage = Math.max(1, Math.floor(controlledActor.attack || 1));
    const estimatedDamage = Math.max(0, baseDamage + heightBonus + facingBonus - coverReduction);
    const targetName =
      (target.entity_id
        ? gamePackage.entities.find((entity) => entity.id === target.entity_id)?.display_name
        : undefined) ||
      combatNameById.get(target.actor_id) ||
      "Target";

    return {
      targetName,
      baseDamage,
      estimatedDamage,
      coverLabel: cover ? `${cover.strength} cover` : undefined,
      coverReduction,
      flanked,
      facingBonus,
      heightDelta,
      heightBonus,
    };
  })();
  const stealthFeedback = saveData.flags?.immersive_stealth_feedback as StealthFeedbackRecord | undefined;
  const strongestPerceptionAlert = perceptionSnapshot?.alerts
    .slice()
    .sort((a, b) => b.score - a.score)[0];
  const stealthAlertness =
    stealthFeedback?.highest_alertness ||
    strongestPerceptionAlert?.alertness ||
    "oblivious";
  const stealthScore = Math.max(
    0,
    Math.min(1, stealthFeedback?.strongest_score ?? strongestPerceptionAlert?.score ?? 0),
  );
  const perceptionAlertRows =
    perceptionSnapshot?.alerts
      .filter(
        (alert) =>
          !gamePackage.entities.find((entity) => entity.id === alert.entity_id)?.is_npc,
      )
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((alert) => ({
        key: alert.actor_id,
        name: gamePackage.entities.find((entity) => entity.id === alert.entity_id)?.display_name || "Watcher",
        alertness: alert.alertness,
        score: alert.score,
        stimulus: titleCaseEffect(alert.stimulus.kind),
      })) || [];
  const worldStateGate =
    worldStateEvaluation?.denials[0] ||
    worldStateEvaluation?.gates.find((gate) => !gate.passed && gate.severity === "warning") ||
    null;
  const worldStateRegionName =
    activeMap.regions?.find((region) => region.id === worldStateEvaluation?.region_id)?.display_name ||
    worldStateEvaluation?.region_id?.replace(/_/g, " ") ||
    "Region";
  const survivalRows = worldStateEvaluation
    ? SURVIVAL_AXIS_DEFS.map((axis) => ({
        ...axis,
        value: Math.max(0, Math.min(100, Math.round(worldStateEvaluation.survival[axis.key] || 0))),
      }))
    : [];
  const survivalPressureRows = survivalRows.filter((row) => row.value > 0);
  const survivalPanelVisible =
    !overlayOpen &&
    worldStateEvaluation &&
    (survivalPressureRows.length > 0 || Boolean(worldStateGate) || worldStateEvaluation.inventory.ap_penalty > 0);
  const activeAlderamonticoCell = activeMap.cells.find(
    (cell) => cell.x === playerPos[0] && cell.z === playerPos[1],
  );
  const activeAlderamonticoRegionId =
    activeAlderamonticoCell?.region_id || activeAlderamonticoCell?.room_id || "map";
  const activeAlderamonticoGridRegion = activeMap.regions?.find(
    (region) => region.id === activeAlderamonticoRegionId,
  );
  const activeAlderamonticoGridConfig =
    activeAlderamonticoGridRegion?.alderamontico_grid?.enabled
      ? activeAlderamonticoGridRegion.alderamontico_grid
      : undefined;
  const activeGridLensIndex =
    activeAlderamonticoGridConfig?.lens_entity_id
      ? activeMap.entity_placements.findIndex(
          (placement) => placement.entity_id === activeAlderamonticoGridConfig.lens_entity_id,
        )
      : -1;
  const activeGridLensPlacement =
    activeGridLensIndex >= 0 ? activeMap.entity_placements[activeGridLensIndex] : undefined;
  const activeGridLensStateKey =
    activeGridLensPlacement
      ? entityPlacementStateKey(activeMap.id, activeGridLensPlacement, activeGridLensIndex)
      : undefined;
  const activeGridLensState =
    activeGridLensStateKey
      ? (saveData.entity_states || {})[activeGridLensStateKey] ||
        (saveData.entity_states || {})[activeGridLensPlacement!.entity_id]
      : undefined;
  const activeGridLensCell: [number, number] | undefined = activeGridLensPlacement
    ? [
        activeGridLensState?.cell?.[0] ?? activeGridLensPlacement.cell[0],
        activeGridLensState?.cell?.[1] ?? activeGridLensPlacement.cell[1],
      ]
    : undefined;
  const activeGridLensDistance = activeGridLensCell
    ? manhattanCells(playerPos, activeGridLensCell)
    : undefined;
  const activeGridLensActive =
    Boolean(activeAlderamonticoGridConfig?.lens_entity_id && activeGridLensCell) &&
    (activeGridLensDistance ?? Infinity) <= (activeAlderamonticoGridConfig?.lens_radius ?? 0);
  const playerGridExposure = saveData.alderamontico_state?.actors.player?.last_grid_exposure;
  const activeGridExposure =
    playerGridExposure?.region_id === activeAlderamonticoRegionId ? playerGridExposure : undefined;
  const activeGridFed =
    saveData.alderamontico_state?.grid?.fed_by_region?.[activeAlderamonticoRegionId] ||
    (saveData.alderamontico_state?.grid?.region_id === activeAlderamonticoRegionId
      ? saveData.alderamontico_state.grid.fed
      : undefined);
  const activeDialogue = activeDialogueId
    ? gamePackage.dialogue.find((d) => d.id === activeDialogueId)
    : undefined;
  const activeDialogueNode = activeDialogue?.nodes.find(
    (n) => n.id === activeDialogueNodeId,
  );
  const dialogueHasSceneImage = Boolean(activeDialogueNode?.scene_image_url);
  const bottomPanelOpen = Boolean(
    activeShopId ||
      activeDocumentId ||
      activeDialogueId ||
      activeContainerId,
  );
  const storyCameraActive = Boolean(
    activeCutscene ||
      cameraFocusOverride ||
      activeDialogueId ||
      activeDocumentId ||
      activeContainerId ||
      activeShopId ||
      levelUpOpen,
  );
  const cameraMode: PlayCameraMode =
    inCombat || targetingSkillId || verbTargeting || commandingParty
      ? "tactical"
      : storyCameraActive
        ? "story"
        : "explore";
  const visualPlayerPos = logicalCellToWorld(
    renderedPlayerPos,
    "fine",
    FINE_PER_MACRO,
  );
  const cameraFocusLogical = saveMatchesRenderedMap
    ? cameraFocusOverride ?? (commandingParty ? activeFocusPos : null)
    : renderedPlayerPos;
  const visualCameraFocus = cameraFocusLogical
    ? logicalCellToWorld(cameraFocusLogical, "fine", FINE_PER_MACRO)
    : null;
  const initialCameraPosition = getInitialPlayCameraPosition(
    visualPlayerPos,
    cameraAzimuth,
    cameraMode,
  );

  return (
    <div className="flex flex-col h-full bg-neutral-950 relative overflow-hidden pb-16 sm:pb-0" style={{ touchAction: 'none' }}>
      <div className="flex-1 relative min-h-0">
        <Canvas
          shadows="basic"
          camera={{
            position: initialCameraPosition,
            fov: PLAY_CAMERA_PROFILES[cameraMode].fov,
          }}
          dpr={effectivePlayDpr}
          gl={{
            antialias: false,
            alpha: false,
            stencil: false,
            powerPreference: "high-performance",
          }}
        >
          <IsometricCameraRig
            playerPos={visualPlayerPos}
            playerFacing={renderedPlayerFacing}
            azimuth={cameraAzimuth}
            mode={cameraMode}
            focusOverride={visualCameraFocus}
            glide={Boolean(activeCutscene || cameraFocusOverride || commandingParty)}
          />
          <color attach="background" args={["#111735"]} />
          <fog attach="fog" args={["#161D36", 78, 190]} />
          <BlackStarLightRig playerPos={visualPlayerPos} />
          <AdaptiveQualityProbe
            dpr={effectivePlayDpr}
            minDpr={Math.min(1.05, visualDprCap)}
            maxDpr={visualDprCap}
            setDpr={setPlayDpr}
          />
          <GameRenderer3D
            map={activeMap}
            gridSpace="fine"
            fineRatio={FINE_PER_MACRO}
            playerPos={renderedPlayerPos}
            playerFacing={renderedPlayerFacing}
            playerSpriteId={saveData.player?.sprite_id}
            worldItems={worldItemsRender}
            extraPlacements={containerRenderPlacements}
            onCellClick={handlePlayfieldCellClick}
            onCellHover={targetingSkillId || verbTargeting ? handleCellHover : undefined}
            onPointerOut={handlePointerOut}
            targetPattern={
              verbTargeting
                ? hoveredCell
                  ? [{ x: hoveredCell[0], z: hoveredCell[1] }]
                  : []
                : computeTargetPatternMemo
            }
            rangeCells={verbTargeting ? verbTargetCells : targetingRangeCells}
            hoveredCell={hoveredCell}
            entityStates={saveData.entity_states}
            actorPhysicalStates={saveData.actor_physical_states}
            partyFollowers={partyFollowers}
            partyMemberIds={partyMemberIds}
            mapDelta={renderMapDelta}
            inCombat={inCombat}
            activeTurnKey={activeTurnId}
            combatOverwatchZones={combatTacticalSnapshot?.overwatch_zones}
            combatIntents={combatTacticalSnapshot?.intents}
            perceptionAlerts={perceptionSnapshot?.alerts}
            showBehaviorIntents={showBehaviorIntents}
            worldDeniedCells={worldDeniedCells}
            showGrid={false}
            enableOcclusion
            occlusionAzimuth={cameraAzimuth}
            renderCenter={cameraFocusOverride || renderedFocusPos}
            renderRadius={PLAY_RENDER_RADIUS}
            fogOfWar={fogOfWar}
            fogResolution={(gamePackage.settings?.fog_los_resolution as "macro" | "fine" | undefined) ?? "macro"}
            initialExplored={saveData.explored_cells}
            onExplore={(mapId, keys) =>
              usePlayStore.getState().markCellsExplored(mapId, keys)
            }
          />
          <ScreenFX inCombat={inCombat} mapId={activeMap.id} />
        </Canvas>

        {/* Virtual Joystick touch zone — covers the full game canvas */}
        {!levelUpOpen && !targetingSkillId && !verbTargeting && !activeShopId && !activeDialogueId && !activeDocumentId && !activeContainerId && !activeAttendNodePanel && (
          <div
            ref={joystickOverlayRef}
            className="absolute inset-0 z-10"
            style={{ touchAction: 'none' }}
            onPointerDown={joystickStart}
            onPointerMove={joystickMove}
            onPointerUp={joystickEnd}
            onPointerCancel={joystickEnd}
          >
            {joystickVis.visible && (
              <>
                {/* Base ring */}
                <div
                  className="absolute pointer-events-none rounded-full border-2 border-white/25 bg-black/20"
                  style={{
                    left: joystickVis.baseX - JOYSTICK_MAX,
                    top: joystickVis.baseY - JOYSTICK_MAX,
                    width: JOYSTICK_MAX * 2,
                    height: JOYSTICK_MAX * 2,
                  }}
                />
                {/* Inner dead-zone ring */}
                <div
                  className="absolute pointer-events-none rounded-full border border-white/10"
                  style={{
                    left: joystickVis.baseX - JOYSTICK_DEAD,
                    top: joystickVis.baseY - JOYSTICK_DEAD,
                    width: JOYSTICK_DEAD * 2,
                    height: JOYSTICK_DEAD * 2,
                  }}
                />
                {/* Thumb */}
                <div
                  className="absolute pointer-events-none rounded-full bg-white/30 border-2 border-white/50 shadow-lg"
                  style={{
                    left: joystickVis.thumbX - 26,
                    top: joystickVis.thumbY - 26,
                    width: 52,
                    height: 52,
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Floating Act button — contextual interaction stays separate from abilities. */}
        {!levelUpOpen && !targetingSkillId && !activeShopId && !activeDialogueId && !activeDocumentId && !activeContainerId && !activeAttendNodePanel && (
          <div className="absolute right-3 z-20 flex flex-col gap-2 pointer-events-auto" style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <button
              className="w-12 h-12 sm:w-16 sm:h-16 bg-ui-panel active:brightness-150 rounded-full flex flex-col items-center justify-center active:scale-90 transition-all select-none shadow-[0_0_15px_rgba(0,0,0,0.8)] border-ui-accent text-[var(--color-ui-accent)] touch-manipulation gap-0.5"
              style={{ borderStyle: "solid", borderWidth: "2px" }}
              onClick={handleAct}
              title="Interact / Act"
            >
              <Hand className="w-5 h-5 sm:w-7 sm:h-7 drop-shadow-md" />
              <span className="text-[8px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase opacity-90 text-accent-glow">Act</span>
            </button>
          </div>
        )}

        {/* Paged ability bar — skills and former wheel verbs share one launcher. */}
        {abilityBarVisible && (
          <div
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 pointer-events-auto ${
              commandingParty ? "drop-shadow-[0_0_10px_rgba(16,185,129,0.35)]" : ""
            }`}
            style={{ bottom: "calc(0.85rem + env(safe-area-inset-bottom))" }}
          >
            <div className="rounded-full border border-[var(--color-ui-accent-dark)]/70 bg-black/72 px-3 py-0.5 text-[9px] font-[family-name:var(--font-display)] font-bold uppercase tracking-[0.24em] text-[var(--color-ui-accent)] shadow-[0_0_14px_rgba(0,0,0,0.75)]">
              {abilityPageLabel}
            </div>
            <div className="flex items-end gap-1.5 rounded-sm border border-neutral-800/80 bg-black/30 p-1.5 shadow-[0_0_22px_rgba(0,0,0,0.82)] backdrop-blur-[1px]">
              <button
                type="button"
                aria-label="Previous ability page"
                onClick={() => setAbilityPageByOffset(-1)}
                className="mb-1 flex h-10 w-8 items-center justify-center rounded-sm border border-neutral-700 bg-ui-panel text-neutral-300 transition-colors hover:border-[var(--color-ui-accent-dark)] hover:text-[var(--color-ui-accent)] active:scale-95 sm:h-12 sm:w-9"
                title="Previous ability page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {visibleAbilityEntries.map((entry, i) => {
                const ability = entry.ability;
                const colorClass = ELEMENT_STYLES[ability.element] || ELEMENT_STYLES.none;
                return (
                  <button
                    key={ability.id}
                    type="button"
                    aria-label={ability.display_name}
                    onClick={() => activateAbility(entry)}
                    disabled={entry.disabled}
                    className={`relative flex h-12 w-[46px] flex-col items-center justify-center gap-0.5 rounded-sm bg-ui-panel text-center shadow-[0_0_15px_rgba(0,0,0,0.8)] transition-all select-none touch-manipulation sm:h-16 sm:w-[60px] ${
                      entry.disabled ? "opacity-40 grayscale" : "active:scale-90 brightness-100"
                    } ${colorClass}`}
                    style={{ borderStyle: "solid", borderWidth: "1px" }}
                    title={`${ability.display_name}${ability.description ? ` — ${ability.description}` : ""}${entry.disabledReason ? ` (${entry.disabledReason})` : ""}`}
                  >
                    <span className="absolute left-1 top-0.5 text-[9px] font-serif font-bold text-[var(--color-ui-accent)] drop-shadow-md">
                      {i + 1}
                    </span>
                    <AbilityIcon ability={ability} />
                    <span className="line-clamp-2 px-0.5 text-[7px] font-[family-name:var(--font-display)] font-bold uppercase leading-tight tracking-wider text-[var(--color-ui-text)] sm:text-[8px]">
                      {ability.display_name}
                    </span>
                    {entry.costLabel && (
                      <span className="text-[7px] font-serif font-bold text-[#7dd3fc] drop-shadow-md sm:text-[8px]">
                        {entry.costLabel}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                aria-label="Next ability page"
                onClick={() => setAbilityPageByOffset(1)}
                className="mb-1 flex h-10 w-8 items-center justify-center rounded-sm border border-neutral-700 bg-ui-panel text-neutral-300 transition-colors hover:border-[var(--color-ui-accent-dark)] hover:text-[var(--color-ui-accent)] active:scale-95 sm:h-12 sm:w-9"
                title="Next ability page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active ally + player-side action order (combat only) */}
        {inCombat && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none" style={{ maxWidth: 'calc(100vw - 9rem)' }}>
            <div
              className={`px-3 py-1 sm:px-6 sm:py-2 border text-[10px] sm:text-sm font-[family-name:var(--font-display)] font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(0,0,0,0.9)] bg-ui-panel border-ui-accent text-accent-glow whitespace-nowrap ${
                controlledActor
                  ? controlledActor.isPlayer
                    ? "text-[var(--color-ui-accent)]"
                    : "text-emerald-300"
                  : "text-[#e63946] border-[#8b1c1c]"
              }`}
              style={{ borderStyle: "solid", borderWidth: "2px", borderImage: "none" }}
            >
              {controlledActor
                ? controlledActor.isPlayer
                  ? "You act — the field answers"
                  : `${controlledActor.name.split(" ")[0]} acts — the field answers`
                : "Resolving..."}
            </div>
            <div className="flex gap-1 flex-nowrap justify-center overflow-hidden max-w-full">
              {combatQueueInfo
                .filter((c) => !c.dead)
                .slice(0, 6)
                .map((c) => {
                  const active = c.id === saveData.active_turn_id;
                  const accent =
                    c.kind === "player" || c.kind === "party"
                      ? "border-[var(--color-ui-accent-dark)] text-[var(--color-ui-text)]"
                      : "border-[#8b1c1c] text-[#e63946]";
                  return (
                    <div
                      key={c.id}
                      className={`px-1.5 sm:px-3 py-0.5 sm:py-1 bg-ui-panel border ${accent} ${
                        active ? "scale-110 shadow-[0_0_15px_var(--color-ui-accent)] brightness-125 z-10" : "opacity-60 grayscale"
                      } transition-all flex flex-col items-center shrink-0`}
                      style={{ borderStyle: "solid", borderWidth: "1px" }}
                    >
                      <span className="text-[8px] sm:text-[10px] font-serif font-bold truncate max-w-[2.5rem] sm:max-w-20 leading-tight">
                        {c.name.split(" ")[0]}
                      </span>
                      <div className="w-8 sm:w-14 h-0.5 sm:h-1 bg-black border border-[#111] mt-0.5 overflow-hidden">
                        <div
                          className={`h-full ${c.kind === "enemy" ? "bg-[#8b1c1c]" : "bg-[var(--color-ui-accent-dark)]"}`}
                          style={{
                            width: `${Math.max(0, Math.min(100, (c.hp / Math.max(1, c.maxHp)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            {combatTacticalSnapshot && (
              <div className="flex max-w-full flex-wrap justify-center gap-1">
                {hostileIntentRows.map((intent) => (
                  <span
                    key={intent.key}
                    className="rounded-sm border border-red-800/70 bg-neutral-950/86 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-red-100 shadow"
                    title={`${intent.actorName}: ${intent.label}${intent.target ? ` → ${intent.target}` : ""}`}
                  >
                    {intent.actorName.split(" ")[0]} {intent.label}
                    {intent.damage > 0 ? ` ${intent.damage}` : ""}
                  </span>
                ))}
                {combatOverwatchZoneCount > 0 && (
                  <span className="rounded-sm border border-amber-700/70 bg-neutral-950/86 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-100 shadow">
                    Overwatch {combatOverwatchZoneCount}
                  </span>
                )}
                {combatCoverEdgeCount > 0 && (
                  <span className="rounded-sm border border-cyan-800/70 bg-neutral-950/86 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-cyan-100 shadow">
                    Cover {combatCoverEdgeCount}
                  </span>
                )}
              </div>
            )}
            {facedCombatReadout && (
              <div className="flex max-w-full flex-wrap justify-center gap-1 rounded-sm border border-neutral-700/80 bg-neutral-950/88 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-neutral-100 shadow-[0_0_14px_rgba(0,0,0,0.7)]">
                <span className="text-neutral-300">{facedCombatReadout.targetName.split(" ")[0]}</span>
                <span className="text-neutral-400">Base {facedCombatReadout.baseDamage}</span>
                <span className={facedCombatReadout.estimatedDamage > facedCombatReadout.baseDamage ? "text-lime-200" : facedCombatReadout.estimatedDamage < facedCombatReadout.baseDamage ? "text-rose-200" : "text-amber-100"}>
                  Hit {facedCombatReadout.estimatedDamage}
                </span>
                {facedCombatReadout.coverReduction > 0 && (
                  <span className="text-cyan-100">
                    {facedCombatReadout.coverLabel} -{facedCombatReadout.coverReduction}
                  </span>
                )}
                {facedCombatReadout.flanked && (
                  <span className="text-lime-200">Flank +{facedCombatReadout.facingBonus}</span>
                )}
                {facedCombatReadout.heightBonus !== 0 && (
                  <span className={facedCombatReadout.heightBonus > 0 ? "text-lime-200" : "text-rose-200"}>
                    {facedCombatReadout.heightDelta > 0 ? "High" : "Low"}{" "}
                    {facedCombatReadout.heightBonus > 0 ? "+" : ""}
                    {facedCombatReadout.heightBonus}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Targeting banner */}
        {targetingSkillId &&
          (() => {
            const skill = gamePackage.abilities.find(
              (s) => s.id === targetingSkillId,
            );
            return (
              <div
                className={`absolute ${inCombat ? "top-[5.5rem]" : "top-3"} left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-indigo-950/90 border border-indigo-600/60 rounded-lg text-indigo-100 text-xs font-bold tracking-wide shadow-xl pointer-events-none flex items-center gap-2`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {commandingParty && controlledActor
                    ? `${controlledActor.name} — `
                    : ""}
                  {skill?.display_name}: tap a tile, tap again to cast · Esc
                  cancels
                </span>
              </div>
            );
          })()}

        {!targetingSkillId &&
          verbTargeting &&
          (() => {
            const presentation =
              IMMERSIVE_VERB_PRESENTATION[verbTargeting.verb] || {
                title: titleCaseEffect(verbTargeting.verb),
                tone: "neutral" as VerbFeedbackTone,
              };
            return (
              <div
                className={`absolute ${inCombat ? "top-[5.5rem]" : "top-3"} left-1/2 z-20 flex max-w-[calc(100vw-7rem)] -translate-x-1/2 items-center gap-2 rounded-sm border px-3 py-2 text-xs font-bold tracking-wide shadow-xl backdrop-blur-sm pointer-events-none sm:max-w-[22rem] ${VERB_FEEDBACK_STYLES[presentation.tone]}`}
              >
                <Wand2 className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {presentation.title}: choose a highlighted tile · Esc cancels
                </span>
              </div>
            );
          })()}

        {verbFeedback && !verbTargeting && (
          <div
            key={verbFeedback.id}
            className={`absolute ${inCombat ? "top-[5.5rem]" : "top-3"} left-1/2 z-20 flex max-w-[calc(100vw-7rem)] -translate-x-1/2 items-start gap-2 rounded-sm border px-3 py-2 text-left shadow-xl backdrop-blur-sm pointer-events-none animate-in fade-in slide-in-from-top-2 sm:max-w-[24rem] ${VERB_FEEDBACK_STYLES[verbFeedback.tone]}`}
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="truncate font-[family-name:var(--font-display)] text-[11px] font-bold uppercase tracking-widest">
                {verbFeedback.title}
              </div>
              <div className="mt-0.5 line-clamp-2 font-serif text-xs font-bold leading-snug opacity-95">
                {verbFeedback.detail}
              </div>
            </div>
          </div>
        )}

        {!overlayOpen && worldStateGate && (
          <div
            className={`absolute right-3 top-3 z-20 flex max-w-[calc(100vw-9rem)] items-start gap-2 rounded-sm border px-3 py-2 text-left shadow-[0_0_18px_rgba(0,0,0,0.75)] backdrop-blur-sm pointer-events-none sm:max-w-[19rem] ${WORLD_GATE_STYLES[worldStateGate.severity]}`}
            style={{ borderStyle: "solid", borderWidth: "1px" }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-widest">
                <span className="truncate">{titleCaseEffect(worldStateRegionName)}</span>
                <span className="shrink-0 opacity-85">
                  {worldStateGate.severity === "deny" ? "Denied" : "Pressure"}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-2 font-serif text-[11px] font-bold leading-snug opacity-95">
                {worldStateGate.reason}
              </div>
            </div>
          </div>
        )}

        {/* HUD / Controls Overlay */}
        <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 pointer-events-auto">
          {/* Player Vitals - compact */}
          <div
            className="px-2.5 py-2 sm:px-4 sm:py-3 bg-ui-panel border-ui-accent rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.8)] flex flex-col gap-1.5 sm:gap-2.5 w-36 sm:w-48"
            style={{ borderStyle: "solid", borderWidth: "2px" }}
          >
            <div>
              <div className="flex justify-between items-end mb-0.5 px-0.5">
                <span className="text-[#e63946] text-[9px] sm:text-[11px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase">Vitality</span>
                <span className="font-serif font-bold text-[9px] sm:text-[11px] text-[var(--color-ui-text)] drop-shadow-sm">
                  {saveData.playerStats.hp} / {saveData.playerStats.max_hp}
                </span>
              </div>
              <div className="w-full bg-black/80 h-2 border border-[#4a1010] shadow-[inset_0_0_5px_rgba(0,0,0,1)] relative">
                <div
                  className="h-full bg-gradient-to-r from-[#8b1c1c] to-[#e63946] transition-all duration-300 shadow-[0_0_8px_rgba(230,57,70,0.5)]"
                  style={{
                    width: `${Math.max(0, Math.min(100, (saveData.playerStats.hp / saveData.playerStats.max_hp) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-end mb-0.5 px-0.5">
                <span className="text-[#457b9d] text-[9px] sm:text-[11px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase">Aether</span>
                <span className="font-serif font-bold text-[9px] sm:text-[11px] text-[var(--color-ui-text)] drop-shadow-sm">
                  {saveData.playerStats.mp ?? 10} / {saveData.playerStats.max_mp ?? 10}
                </span>
              </div>
              <div className="w-full bg-black/80 h-2 border border-[#0f1f38] shadow-[inset_0_0_5px_rgba(0,0,0,1)] relative">
                <div
                  className="h-full bg-gradient-to-r from-[#1d3557] to-[#457b9d] transition-all duration-300 shadow-[0_0_8px_rgba(69,123,157,0.5)]"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((saveData.playerStats.mp ?? 10) / (saveData.playerStats.max_mp ?? 10)) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between font-serif text-[9px] text-[var(--color-ui-text)] px-0.5 font-bold">
              <span title="Attack" className="flex items-center gap-0.5"><span className="text-[var(--color-ui-accent)]">⚔</span> {saveData.playerStats.attack}</span>
              <span title="Defense" className="flex items-center gap-0.5"><span className="text-[var(--color-ui-accent)]">🛡</span> {saveData.playerStats.defense}</span>
              <span title="Speed" className="flex items-center gap-0.5"><span className="text-[var(--color-ui-accent)]">⚡</span> {saveData.playerStats.speed}</span>
            </div>
            <div className="pt-1 border-t border-[var(--color-ui-accent-dark)]/35">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[var(--color-ui-accent)] text-[9px] sm:text-[10px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase">
                  Level {playerLevel}
                </span>
                <span className="font-serif text-[8px] sm:text-[9px] font-bold text-[var(--color-ui-text)]">
                  {xpRemaining} XP
                  {pendingLevelUps > 0 ? ` +${pendingLevelUps}` : ""}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full border border-[var(--color-ui-accent-dark)] bg-black/75">
                <div
                  className="h-full bg-gradient-to-r from-[var(--color-ui-accent-dark)] to-[var(--color-ui-accent)] transition-all duration-300"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
            </div>
            <div className="pt-1 border-t border-[var(--color-ui-accent-dark)]/50 flex justify-between items-center px-0.5">
              <span className="text-[var(--color-ui-accent)] text-[9px] sm:text-[11px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase">
                {clockPhase}
              </span>
              <span className="font-serif font-bold text-[9px] sm:text-[10px] text-[var(--color-ui-text)] drop-shadow-sm">
                Day {clockDay} · {String(clockHour).padStart(2, "0")}:
                {String(clockMinute).padStart(2, "0")}
              </span>
            </div>
          </div>

          {/* Party panel — the people beside you, with their real stats */}
          {partyMemberIds.length > 0 && (
            <div
              className="px-2.5 py-2 sm:px-4 sm:py-3 bg-ui-panel border-[var(--color-ui-accent-dark)] rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.8)] flex flex-col gap-1.5 sm:gap-2.5 w-36 sm:w-48 mt-0.5"
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              {partyMemberIds.map((pid) => {
                const def = gamePackage.entities.find((e) => e.id === pid);
                if (!def) return null;
                const est = (saveData.entity_states || {})[pid] || {};
                const hp = est.hp ?? def.max_hp;
                const mp = est.mp ?? def.max_mp;
                const theirTurn = inCombat && saveData.active_turn_id === pid;
                return (
                  <div
                    key={pid}
                    className={
                      theirTurn
                        ? "ring-1 ring-[var(--color-ui-accent)] bg-black/20 p-1 -m-1"
                        : ""
                    }
                  >
                    <div className="flex justify-between items-end mb-1 px-1">
                      <span className="text-[var(--color-ui-text)] text-[10px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase truncate pr-1">
                        {def.display_name}
                      </span>
                      <span className="font-serif font-bold text-[10px] text-[var(--color-ui-text-muted)] shrink-0">
                        {est.dead ? "Fallen" : `${hp} / ${def.max_hp}`}
                      </span>
                    </div>
                    <div className="w-full bg-black/80 h-1.5 border border-[var(--color-ui-accent-dark)] shadow-[inset_0_0_5px_rgba(0,0,0,1)] relative">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--color-ui-accent-dark)] to-[var(--color-ui-accent)] transition-all duration-300"
                        style={{
                          width: `${Math.max(0, Math.min(100, (hp / Math.max(1, def.max_hp)) * 100))}%`,
                        }}
                      />
                    </div>
                    {(def.max_mp ?? 0) > 0 && (
                      <div className="w-full bg-black/80 h-1 border border-[#0f1f38] shadow-[inset_0_0_5px_rgba(0,0,0,1)] relative mt-1">
                        <div
                          className="h-full bg-gradient-to-r from-[#1d3557] to-[#457b9d] transition-all duration-300"
                          style={{
                            width: `${Math.max(0, Math.min(100, (mp / Math.max(1, def.max_mp)) * 100))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!overlayOpen && perceptionSnapshot && (
            <div
              className={`mt-0.5 w-36 rounded-sm border px-2.5 py-2 shadow-[0_0_20px_rgba(0,0,0,0.75)] sm:w-48 ${ALERTNESS_HUD_STYLES[stealthAlertness]}`}
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[9px] font-[family-name:var(--font-display)] font-bold uppercase tracking-widest sm:text-[10px]">
                  <Eye className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                  Stealth
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wide sm:text-[10px]">
                  {ALERTNESS_LABELS[stealthAlertness]}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-black/70">
                <div
                  className="h-full bg-current transition-all duration-300"
                  style={{ width: `${Math.round(stealthScore * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[8px] font-bold uppercase tracking-wide opacity-90 sm:text-[9px]">
                <span>{stealthFeedback?.visible_to_count ?? perceptionSnapshot.totals.combat} seeing</span>
                <span>{stealthFeedback?.alerted_count ?? perceptionSnapshot.totals.alerted_actors} alerted</span>
              </div>
              {perceptionAlertRows.length > 0 && (
                <div className="mt-1 space-y-0.5 border-t border-current/25 pt-1">
                  {perceptionAlertRows.map((alert) => (
                    <div key={alert.key} className="flex justify-between gap-2 text-[8px] font-bold leading-tight sm:text-[9px]">
                      <span className="truncate">{alert.name.split(" ")[0]}</span>
                      <span className="shrink-0 opacity-90">
                        {ALERTNESS_LABELS[alert.alertness]} {Math.round(alert.score * 100)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!overlayOpen && activeAlderamonticoGridConfig && (
            <div
              className="mt-0.5 w-36 rounded-sm border border-emerald-700/80 bg-neutral-950/88 px-2.5 py-2 text-emerald-100 shadow-[0_0_20px_rgba(0,0,0,0.75)] sm:w-48"
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-[9px] font-[family-name:var(--font-display)] font-bold uppercase tracking-widest sm:text-[10px]">
                  <Sparkles className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                  <span className="truncate">Grid</span>
                </span>
                <span className="truncate text-right text-[8px] font-bold uppercase tracking-wide text-emerald-300 sm:text-[9px]">
                  {activeAlderamonticoGridRegion?.display_name || activeAlderamonticoRegionId}
                </span>
              </div>
              <div className="mt-1 flex justify-between gap-2 text-[8px] font-bold uppercase tracking-wide text-emerald-300/90 sm:text-[9px]">
                <span>
                  Mag {Math.round((activeAlderamonticoGridConfig.magnitude ?? 2) * 10) / 10}
                </span>
                <span className={activeGridLensActive ? "text-cyan-200" : "text-neutral-400"}>
                  {activeAlderamonticoGridConfig.lens_entity_id
                    ? activeGridLensActive
                      ? `Lens x${activeAlderamonticoGridConfig.lens_multiplier ?? 1}`
                      : "Lens distant"
                    : "Unfocused"}
                </span>
              </div>
              {activeGridExposure && (
                <div className="mt-1 border-t border-emerald-800/45 pt-1 text-[8px] font-bold uppercase tracking-wide text-neutral-200 sm:text-[9px]">
                  {activeGridExposure.dominant_axis} +{Math.round(activeGridExposure.amount * 10) / 10}
                </div>
              )}
              {activeGridFed !== undefined && activeGridFed > 0 && (
                <div className="mt-1 border-t border-emerald-800/45 pt-1 text-[8px] font-bold uppercase tracking-wide text-emerald-200 sm:text-[9px]">
                  Fed {Math.round(activeGridFed * 10) / 10}
                </div>
              )}
            </div>
          )}

          {activeAttendNodePanel && (
            <div
              className="mt-0.5 w-[18rem] max-w-[calc(100vw-1rem)] rounded-sm border border-cyan-400/80 bg-neutral-950/94 px-3 py-2.5 text-cyan-100 shadow-[0_0_24px_rgba(0,0,0,0.85)] backdrop-blur-sm sm:w-72"
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-[10px] font-[family-name:var(--font-display)] font-bold uppercase tracking-widest">
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Attend</span>
                </span>
                <button
                  type="button"
                  onClick={closeAttendNodePanel}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-cyan-800/70 bg-black/45 text-cyan-200 transition hover:border-cyan-300 hover:text-white"
                  title="Break attention"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 border-b border-cyan-800/55 pb-1 text-[8px] font-bold uppercase tracking-wide text-cyan-300 sm:text-[9px]">
                <span className="truncate">{activeAttendNodePanel.target.name}</span>
                <span className="shrink-0">Attention {attentionDisplay(activeAttendNodePanel.attention)}</span>
              </div>
              <div className="mt-1.5 line-clamp-2 font-serif text-[11px] font-bold leading-snug text-neutral-100 sm:text-xs">
                {activeAttendNodePanel.condition}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px] font-bold uppercase tracking-wide text-neutral-300 sm:text-[9px]">
                <div className="rounded-sm border border-cyan-900/70 bg-black/45 px-2 py-1">
                  Composure {activeAttendNodePanel.composureRemaining}
                </div>
                <div className="rounded-sm border border-cyan-900/70 bg-black/45 px-2 py-1">
                  Hidden {activeAttendNodePanel.hiddenReadingCount}
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {activeAttendNodePanel.visibleReadings.map((reading, index) => {
                  const sourceIndex = activeAttendNodePanel.node.readings.indexOf(reading);
                  const readingIndex = sourceIndex >= 0 ? sourceIndex : index;
                  return (
                    <button
                      key={attendReadingKey(reading, readingIndex)}
                      type="button"
                      onClick={() => chooseAttendReading(reading, readingIndex)}
                      className="w-full rounded-sm border border-cyan-800/80 bg-cyan-950/35 px-2.5 py-2 text-left font-serif text-[11px] font-bold leading-snug text-neutral-100 transition hover:border-cyan-300 hover:bg-cyan-900/45 active:scale-[0.99] sm:text-xs"
                    >
                      {reading.text}
                    </button>
                  );
                })}
                {activeAttendNodePanel.visibleReadings.length === 0 && (
                  <div className="rounded-sm border border-cyan-900/70 bg-black/45 px-2.5 py-2 font-serif text-[11px] font-bold text-neutral-300">
                    Nothing resolves at this attention.
                  </div>
                )}
              </div>
              {activeAttendNodePanel.attentionChanged > 0 && (
                <div className="mt-2 border-t border-cyan-800/55 pt-1 text-[8px] font-bold uppercase tracking-wide text-cyan-200 sm:text-[9px]">
                  Attention rose by {activeAttendNodePanel.attentionChanged}
                </div>
              )}
            </div>
          )}

          {!overlayOpen && attendedConditionReadout && attendedActor && (
            <div
              className="mt-0.5 w-36 rounded-sm border border-cyan-700/80 bg-neutral-950/88 px-2.5 py-2 text-cyan-100 shadow-[0_0_20px_rgba(0,0,0,0.75)] sm:w-48"
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-[9px] font-[family-name:var(--font-display)] font-bold uppercase tracking-widest sm:text-[10px]">
                  <Eye className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                  <span className="truncate">Attend</span>
                </span>
                <span className="truncate text-right text-[8px] font-bold uppercase tracking-wide text-cyan-300 sm:text-[9px]">
                  {attendedActor.name}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 font-serif text-[10px] font-bold leading-snug text-neutral-100 sm:text-[11px]">
                {attendedConditionReadout.emotional_summary}
              </div>
              <div className="mt-1 flex justify-between gap-2 text-[8px] font-bold uppercase tracking-wide text-cyan-300/90 sm:text-[9px]">
                <span>{attendedConditionReadout.behavior.replace(/_/g, " ")}</span>
                <span>{Math.round(attendedConditionReadout.reliability)}%</span>
              </div>
              {attendedConditionReadout.physical_labels.length > 0 && (
                <div className="mt-1 truncate border-t border-cyan-800/45 pt-1 text-[8px] font-bold uppercase tracking-wide text-neutral-300 sm:text-[9px]">
                  {attendedConditionReadout.physical_labels.join(" / ")}
                </div>
              )}
              {attendedConditionReadout.emotional_axes && (
                <div className="mt-1 space-y-1 border-t border-cyan-800/45 pt-1">
                  {EMOTIONAL_AXIS_DEFS.map((axis) => {
                    const value = Math.max(
                      0,
                      Math.min(100, attendedConditionReadout.emotional_axes?.[axis.key] ?? 0),
                    );
                    return (
                      <div key={axis.key} className="grid grid-cols-[3rem_1fr_1.3rem] items-center gap-1 text-[8px] font-bold uppercase tracking-wide sm:text-[9px]">
                        <span className="truncate text-neutral-400">{axis.label}</span>
                        <span className="h-1.5 overflow-hidden rounded-sm bg-black/70">
                          <span
                            className="block h-full transition-all duration-300"
                            style={{ width: `${Math.round(value)}%`, backgroundColor: axis.color }}
                          />
                        </span>
                        <span className="text-right text-neutral-300">{Math.round(value)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {attendedConditionReadout.glass > 0 && (
                <div className="mt-1 border-t border-cyan-800/45 pt-1 text-[8px] font-bold uppercase tracking-wide text-slate-200 sm:text-[9px]">
                  Glass {Math.round(attendedConditionReadout.glass)}
                </div>
              )}
              {attendedConditionReadout.grid_pressure && (
                <div className="mt-1 border-t border-cyan-800/45 pt-1 text-[8px] font-bold uppercase tracking-wide text-emerald-200 sm:text-[9px]">
                  Grid {attendedConditionReadout.grid_pressure.dominant_axis} +
                  {Math.round(attendedConditionReadout.grid_pressure.amount * 10) / 10}
                  {attendedConditionReadout.grid_pressure.lens_actor_id
                    ? ` x${attendedConditionReadout.grid_pressure.lens_multiplier}`
                    : ""}
                </div>
              )}
            </div>
          )}

          {survivalPanelVisible && (
            <div
              className="mt-0.5 w-36 rounded-sm border border-stone-700/80 bg-stone-950/86 px-2.5 py-2 text-stone-100 shadow-[0_0_20px_rgba(0,0,0,0.75)] sm:w-48"
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[9px] font-[family-name:var(--font-display)] font-bold uppercase tracking-widest sm:text-[10px]">
                  <AlertTriangle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                  Condition
                </span>
                <span className="truncate text-[8px] font-bold uppercase tracking-wide text-stone-300 sm:text-[9px]">
                  {titleCaseEffect(worldStateRegionName)}
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                {survivalRows.map((row) => {
                  const Icon =
                    row.icon === "hunger"
                      ? Utensils
                      : row.icon === "thirst"
                        ? Droplet
                        : row.icon === "exposure"
                          ? Thermometer
                          : Clock;
                  return (
                    <div key={row.key} className="grid grid-cols-[3.4rem_1fr_1.7rem] items-center gap-1 text-[8px] font-bold uppercase tracking-wide sm:text-[9px]">
                      <span className="flex items-center gap-1 text-stone-300">
                        <Icon className="h-2.5 w-2.5 shrink-0" />
                        {row.label}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-sm bg-black/70">
                        <span
                          className="block h-full transition-all duration-300"
                          style={{ width: `${row.value}%`, backgroundColor: row.color }}
                        />
                      </span>
                      <span className={row.value >= 75 ? "text-amber-200" : "text-stone-400"}>
                        {row.value}
                      </span>
                    </div>
                  );
                })}
              </div>
              {(worldStateEvaluation?.inventory.ap_penalty || 0) > 0 && (
                <div className="mt-1.5 flex justify-between border-t border-stone-600/45 pt-1 text-[8px] font-bold uppercase tracking-wide text-amber-100 sm:text-[9px]">
                  <span>Load Penalty</span>
                  <span>+{worldStateEvaluation?.inventory.ap_penalty} energy</span>
                </div>
              )}
              {worldStateGate && (
                <div className={`mt-1.5 border-t border-current/25 pt-1 text-[8px] font-bold leading-tight sm:text-[9px] ${worldStateGate.severity === "deny" ? "text-rose-200" : "text-amber-100"}`}>
                  {worldStateGate.severity === "deny" ? "Blocked: " : "Warning: "}
                  {worldStateGate.reason}
                </div>
              )}
            </div>
          )}

          {/* Danger panel — who's hunting you, how hurt they are.
              In combat the initiative strip carries this information. */}
          {!inCombat && nearbyHostiles.length > 0 && (
            <div
              className="px-4 py-3 bg-ui-panel border-[#8b1c1c] rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.8)] flex flex-col gap-2.5 w-48 mt-1"
              style={{ borderStyle: "solid", borderWidth: "1px" }}
            >
              <div className="flex items-center justify-center gap-1.5 text-[#e63946] text-[11px] font-[family-name:var(--font-display)] font-bold tracking-widest uppercase text-accent-glow">
                <Swords className="w-4 h-4" />
                Hostiles
              </div>
              {nearbyHostiles.slice(0, 3).map((h) => (
                <div key={h.key}>
                  <div className="flex justify-between items-end mb-1 px-1">
                    <span className="text-[10px] font-serif font-bold text-[#e63946] truncate pr-1">
                      {h.name}
                    </span>
                    <span className="font-[family-name:var(--font-display)] font-bold text-[9px] text-[#e63946]/80 shrink-0 uppercase tracking-widest">
                      {h.dist === 1 ? "Melee!" : `${h.dist} Steps`}
                    </span>
                  </div>
                  <div className="w-full bg-black/80 h-1.5 border border-[#4a1010] shadow-[inset_0_0_5px_rgba(0,0,0,1)] relative">
                    <div
                      className="h-full bg-gradient-to-r from-[#8b1c1c] to-[#e63946] transition-all duration-300 shadow-[0_0_5px_rgba(230,57,70,0.5)]"
                      style={{
                        width: `${Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {nearbyHostiles.length > 3 && (
                <div className="text-center text-[10px] font-serif font-bold text-[#8b1c1c] pt-1 italic">
                  + {nearbyHostiles.length - 3} More
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top-right icon buttons */}
        <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
                setShowInventory(true);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-neutral-900/90 border border-neutral-700 hover:bg-neutral-700 text-neutral-300 rounded-full shadow-lg transition-all flex items-center justify-center"
              title="Inventory"
            >
              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => {
                playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
                setShowSkills(true);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-900/90 border border-indigo-700 hover:bg-indigo-700 text-indigo-200 rounded-full shadow-lg transition-all flex items-center justify-center"
              title="Spells & Skills"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => {
                clearInputState();
                playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
                setShowJournal(true);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-sky-950/90 border border-sky-800 hover:bg-sky-800 text-sky-200 rounded-full shadow-lg transition-all flex items-center justify-center"
              title="Journal"
            >
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => {
                clearInputState();
                playSfx("save_chime", { volume: 0.32, cooldownMs: 120 });
                setShowSaveMenu(true);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-950/90 border border-amber-800 hover:bg-amber-800 text-amber-200 rounded-full shadow-lg transition-all flex items-center justify-center"
              title="Save / Load"
            >
              <Save className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            {(saveData.party_members || []).length > 0 && (
              <button
                onClick={handlePartyTalk}
                className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-900/90 border border-emerald-700 hover:bg-emerald-700 text-emerald-100 rounded-full shadow-lg transition-all flex items-center justify-center"
                title="Talk to Party"
              >
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
          {!overlayOpen &&
            !targetingSkillId &&
            !showInventory &&
            !showSkills &&
            !showSaveMenu &&
            !showJournal && (
              <div className="flex h-8 items-center gap-1.5 rounded-sm border border-neutral-700/80 bg-neutral-950/88 px-2 shadow-lg backdrop-blur-sm sm:h-9">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-cyan-200/90 sm:h-4 sm:w-4" />
                <select
                  aria-label="Visual scaling preset"
                  title={`Visual scaling: ${visualConfig.label} (${effectivePlayDpr.toFixed(2)} DPR)`}
                  value={visualPreset}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    clearInputState();
                  }}
                  onFocus={clearInputState}
                  onBlur={clearInputState}
                  onKeyDown={(event) => {
                    if (
                      isCombatCommandKey(event.key.toLowerCase()) ||
                      event.key.toLowerCase() === "q" ||
                      event.key.toLowerCase() === "e"
                    ) {
                      clearInputState();
                    }
                    event.stopPropagation();
                  }}
                  onKeyUp={(event) => {
                    clearInputState();
                    event.stopPropagation();
                  }}
                  onChange={(event) => {
                    clearInputState();
                    const nextPreset = event.target.value as VisualScalePreset;
                    setVisualPreset(nextPreset);
                    playSfx("ui_click", { volume: 0.18, cooldownMs: 120 });
                  }}
                  className="h-7 w-[7.25rem] bg-transparent font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-wider text-neutral-100 outline-none sm:w-[8.25rem] sm:text-[11px]"
                >
                  {VISUAL_SCALE_PRESET_ORDER.map((preset) => (
                    <option
                      key={preset}
                      value={preset}
                      className="bg-neutral-950 text-neutral-100"
                    >
                      {SCREEN_VISUAL_PRESETS[preset].label}
                    </option>
                  ))}
                </select>
                <button
                  onPointerDown={(event) => { event.stopPropagation(); clearInputState(); }}
                  onClick={() => {
                    clearInputState();
                    setFogOfWar(!fogOfWar);
                    playSfx("ui_click", { volume: 0.18, cooldownMs: 120 });
                  }}
                  title={fogOfWar ? "Fog of war: on" : "Fog of war: off"}
                  className={`h-7 shrink-0 rounded-sm px-2 font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-wider transition-colors sm:text-[11px] ${
                    fogOfWar ? "bg-cyan-500/25 text-cyan-100" : "text-neutral-400 hover:text-neutral-100"
                  }`}
                >
                  Fog
                </button>
                <button
                  onPointerDown={(event) => { event.stopPropagation(); clearInputState(); }}
                  onClick={() => { clearInputState(); setShowEngineEvents((v) => !v); }}
                  title="Engine-core event stream (debug)"
                  className={`h-7 shrink-0 rounded-sm px-2 font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-wider transition-colors sm:text-[11px] ${
                    showEngineEvents ? "bg-violet-500/25 text-violet-100" : "text-neutral-400 hover:text-neutral-100"
                  }`}
                >
                  Events
                </button>
                <button
                  onPointerDown={(event) => { event.stopPropagation(); clearInputState(); }}
                  onClick={() => { clearInputState(); setShowBehaviorIntents((value) => !value); }}
                  title="NPC behavior intent tags and decision log"
                  className={`h-7 shrink-0 rounded-sm px-2 font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-wider transition-colors sm:text-[11px] ${
                    showBehaviorIntents
                      ? "bg-amber-500/25 text-amber-100"
                      : "text-neutral-400 hover:text-neutral-100"
                  }`}
                >
                  Intents
                </button>
              </div>
            )}
          {showBehaviorIntents && (
            <div className="pointer-events-none absolute left-2 top-24 z-30 w-[calc(100vw-1rem)] max-w-72 rounded-sm border border-amber-800/70 bg-neutral-950/92 p-2 font-mono text-[10px] leading-snug text-amber-100 shadow-lg backdrop-blur-sm sm:top-80">
              <div className="mb-1 font-bold uppercase tracking-wider text-amber-300">
                NPC decisions
              </div>
              {behaviorIntentRows.length === 0 ? (
                <div className="text-neutral-500">No NPC has taken a turn yet.</div>
              ) : (
                behaviorIntentRows.map((intent, index) => (
                  <div
                    key={`${intent.actor_id}:${intent.decided_at_tick}:${index}`}
                    className="truncate"
                    title={`${intent.actor_name || intent.actor_id}: ${intent.label} (${intent.reason})`}
                  >
                    <span className="text-neutral-200">{intent.actor_name || intent.actor_id}</span>
                    <span className="text-neutral-500">: </span>
                    <span className="text-amber-200">{intent.label}</span>
                  </div>
                ))
              )}
            </div>
          )}
          {showEngineEvents && (
            <div className="pointer-events-none absolute right-2 top-24 z-30 w-60 rounded-sm border border-violet-800/70 bg-neutral-950/90 p-2 font-mono text-[10px] leading-snug text-violet-100 shadow-lg backdrop-blur-sm">
              <div className="mb-1 font-bold uppercase tracking-wider text-violet-300">
                Engine events
              </div>
              {engineEvents.length === 0 ? (
                <div className="text-neutral-500">No events yet — move, loot, or open a door.</div>
              ) : (
                engineEvents.slice(-8).reverse().map((ev, i) => (
                  <div key={`${ev.id}-${i}`} className="flex justify-between gap-2 truncate">
                    <span className="text-violet-200">{ev.type}</span>
                    <span className="shrink-0 text-neutral-500">@{ev.tick}</span>
                  </div>
                ))
              )}
              <div className="mt-2 mb-1 border-t border-violet-900/60 pt-1 font-bold uppercase tracking-wider text-amber-300">
                Kernel world facts
              </div>
              {(saveData.world_facts?.length ?? 0) === 0 ? (
                <div className="text-neutral-500">None yet — take an item or open a door/chest.</div>
              ) : (
                saveData.world_facts!.slice(-8).reverse().map((f, i) => (
                  <div key={`${f.id}-${i}`} className="truncate" title={`${f.action_type} · ${f.permission_state ?? ""}`}>
                    <span className="text-amber-200">{f.action_type}</span>
                    <span className="text-neutral-500"> · {f.actor_id || "?"}</span>
                  </div>
                ))
              )}
            </div>
          )}
          {/* Active player status effects (renders only when present). */}
          {(saveData.actor_statuses?.["player"]?.length ?? 0) > 0 && (
            <div className="pointer-events-none absolute left-2 top-[210px] z-20 flex flex-wrap gap-1">
              {saveData.actor_statuses!["player"].map((s) => {
                const def = getStatusDef(s.id);
                return (
                  <span
                    key={s.id}
                    title={`${def.displayName} (${s.remaining} turn${s.remaining === 1 ? "" : "s"})`}
                    className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold ${
                      def.kind === "buff"
                        ? "border-emerald-700/70 bg-emerald-950/80 text-emerald-200"
                        : "border-fuchsia-800/70 bg-fuchsia-950/80 text-fuchsia-200"
                    }`}
                  >
                    {def.icon} {def.displayName} {s.remaining}
                  </span>
                );
              })}
            </div>
          )}
          {playerPhysicalActive && playerPhysicalState && (
            <div className="pointer-events-none absolute left-2 top-[244px] z-20 w-52 rounded-sm border border-slate-600/70 bg-neutral-950/88 p-2 shadow-lg">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Body</span>
                <span className="text-[10px] font-bold text-slate-100">
                  {playerPhysicalState.labels.length > 0 ? playerPhysicalState.labels.join(" / ") : "Stable"}
                </span>
              </div>
              <div className="space-y-1">
                {PHYSICAL_AXIS_DEFS.map((axis) => {
                  const value = Math.max(0, Math.min(1, axis.value(playerPhysicalState)));
                  const visible = axis.key === "temperature" || value > 0.04;
                  if (!visible) return null;
                  return (
                    <div key={axis.key} className="grid grid-cols-[3.2rem_1fr] items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">{axis.label}</span>
                      <span className="h-1.5 overflow-hidden rounded-sm bg-neutral-800">
                        <span
                          className="block h-full"
                          style={{
                            width: `${Math.round(value * 100)}%`,
                            backgroundColor: axis.color,
                          }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeQuestStep &&
            !targetingSkillId &&
            !activeShopId &&
            !activeDialogueId &&
            !activeDocumentId &&
            !activeContainerId &&
            !showInventory &&
            !showSkills &&
            !showSaveMenu &&
            !showJournal && (
              <button
                onClick={() => {
                  clearInputState();
                  playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
                  setShowJournal(true);
                }}
                className="max-w-[15rem] sm:max-w-[18rem] rounded-sm border border-sky-800/80 bg-neutral-950/86 px-3 py-2 text-left shadow-lg transition-colors hover:bg-sky-950/90"
                title="Open Journal"
              >
                <div className="flex items-center gap-2 text-[10px] font-[family-name:var(--font-display)] font-bold uppercase tracking-widest text-sky-300">
                  <ListChecks className="h-3.5 w-3.5 shrink-0" />
                  <span>Current Objective</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs font-serif leading-snug text-neutral-100">
                  {activeQuestStep.text}
                </div>
              </button>
            )}
          {targetingSkillId && (
            <div className="flex flex-col gap-2 items-end">
              <button
                onClick={() => {
                  playSfx("ui_back", { volume: 0.22, cooldownMs: 120 });
                  setTargetingSkillId(null);
                }}
                className="px-3 py-2 bg-red-900/90 border border-red-700 hover:bg-red-800 text-red-100 rounded-lg shadow-lg transition-all flex items-center gap-2 text-sm"
              >
                <X className="w-4 h-4" />
                <span>Cancel Targeting</span>
              </button>
              {hoveredCell && (
                <button
                  onClick={() =>
                    handleCellClick(hoveredCell[0], hoveredCell[1])
                  }
                  className="px-4 py-3 bg-amber-600/90 border border-amber-500 hover:bg-amber-500 text-amber-50 rounded shadow-lg transition-all flex items-center gap-2 font-bold animate-pulse"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Confirm Cast</span>
                </button>
              )}
            </div>
          )}
        </div>

        {workstationPromptVisible && reachableWorkstation && (
          <div
            className="absolute left-1/2 z-20 flex w-[min(30rem,calc(100vw-1rem))] -translate-x-1/2 items-start gap-3 rounded-sm border border-indigo-700/75 bg-neutral-950/90 px-3 py-2 text-indigo-100 shadow-[0_0_24px_rgba(0,0,0,0.75)] backdrop-blur-sm pointer-events-auto"
            style={{
              bottom: abilityBarVisible
                ? "calc(4.8rem + env(safe-area-inset-bottom))"
                : "calc(1rem + env(safe-area-inset-bottom))",
            }}
          >
            <Hammer className="h-5 w-5 shrink-0 text-indigo-200" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-widest text-indigo-200">
                  {reachableWorkstation.label}
                </span>
                {activeWorkstationProcess ? (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-indigo-300">
                    {activeWorkstationProcess.progress_ticks}/{activeWorkstationProcess.required_ticks}
                  </span>
                ) : workstationOutputDrops.length > 0 ? (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                    Ready
                  </span>
                ) : null}
              </div>
              {!activeWorkstationProcess && workstationOutputDrops.length === 0 && workstationProcessDefs.length > 1 && (
                <div className="mt-1 flex max-w-full gap-1 overflow-x-auto pb-0.5">
                  {workstationProcessDefs.map((process) => {
                    const selected = process.id === selectedWorkstationProcess?.id;
                    return (
                      <button
                        key={process.id}
                        onClick={() => setSelectedWorkstationProcessId(process.id)}
                        className={`shrink-0 rounded-sm border px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors ${
                          selected
                            ? "border-indigo-300 bg-indigo-600 text-white"
                            : "border-neutral-700 bg-black/35 text-neutral-300 hover:border-indigo-500 hover:text-indigo-100"
                        }`}
                      >
                        {process.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-0.5 truncate text-xs font-bold text-neutral-100">
                {activeWorkstationProcess
                  ? `${activeWorkstationProcessDef?.label || titleCaseEffect(activeWorkstationProcess.process_type)} in progress`
                  : workstationOutputDrops.length > 0
                    ? "Outputs ready"
                    : displayedWorkstationProcess?.label || "Use workstation"}
              </div>
              {activeWorkstationProcess ? (
                <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-black/70">
                  <div
                    className="h-full bg-indigo-300 transition-all duration-300"
                    style={{ width: `${Math.max(4, Math.min(100, workstationProgress))}%` }}
                  />
                </div>
              ) : workstationOutputDrops.length > 0 ? (
                <div className="mt-0.5 truncate text-[10px] font-bold text-emerald-200">
                  Collect {workstationOutputLabel}
                </div>
              ) : (
                <div
                  className={`mt-0.5 truncate text-[10px] font-bold ${
                    workstationMissingInputs.length > 0 ? "text-amber-200" : "text-emerald-200"
                  }`}
                >
                  {workstationMissingInputs.length > 0
                    ? `Needs ${workstationMissingInputs.map(itemStackLabel).join(", ")}`
                    : displayedWorkstationProcess?.input_items.length
                      ? `Consumes ${displayedWorkstationProcess.input_items.map(itemStackLabel).join(", ")}`
                      : "Ready"}
                  {workstationOutputLabel ? ` → ${workstationOutputLabel}` : ""}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <button
                onClick={() => runWorkstationUse(reachableWorkstation, selectedWorkstationProcess?.id)}
                className={`rounded-sm px-3 py-1.5 font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  workstationOutputDrops.length > 0
                    ? "border border-emerald-500/70 bg-emerald-700/85 text-white hover:bg-emerald-600"
                    : workstationMissingInputs.length > 0
                      ? "border border-amber-700/70 bg-amber-950/70 text-amber-200 hover:bg-amber-900/80"
                      : "border border-indigo-500/70 bg-indigo-700/85 text-white hover:bg-indigo-600"
                }`}
              >
                {activeWorkstationProcess ? "Work" : workstationOutputDrops.length > 0 ? "Collect" : "Start"}
              </button>
              {activeWorkstationProcess && (
                <button
                  onClick={() => interruptWorkstationProcess(reachableWorkstation)}
                  className="rounded-sm border border-neutral-700 bg-neutral-900/85 px-2.5 py-1.5 font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-wider text-neutral-300 transition-colors hover:bg-neutral-800"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className="absolute left-2 pointer-events-none flex flex-col items-start justify-end gap-1 max-h-[30%] overflow-hidden z-10"
          style={{
            bottom: abilityBarVisible
              ? 'calc(4rem + env(safe-area-inset-bottom))'
              : 'calc(0.5rem + env(safe-area-inset-bottom))',
            maxWidth: 'min(55%, 16rem)',
          }}
        >
          {logMessages.slice(-3).map((msg, i, arr) => {
            const age = arr.length - 1 - i;
            return (
              <div
                key={i}
                className="bg-neutral-900/85 border border-neutral-800/50 text-neutral-200 text-[10px] sm:text-[11px] py-1 px-2 sm:px-2.5 rounded-md shadow-lg pointer-events-auto transition-all animate-in fade-in slide-in-from-left-4 break-words"
                style={{ opacity: Math.max(0.15, 1 - age * 0.35) }}
              >
                {msg}
              </div>
            );
          })}
        </div>
      </div>

      {/* General screen pulse for loud actions, spells, element verbs, and impacts. */}
      {screenPulseAt > 0 && (
        <div
          key={`screen-pulse-${screenPulseAt}`}
          className="absolute inset-0 z-30 pointer-events-none"
          style={{
            opacity: Math.min(0.55, 0.18 + screenPulseStrength * 0.32),
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.22) 0%, rgba(112,232,255,0.16) 42%, transparent 72%)",
            boxShadow: `inset 0 0 ${Math.round(36 + screenPulseStrength * 64)}px rgba(112, 232, 255, 0.45)`,
            animation: "screen-pulse 620ms ease-out forwards",
          }}
        />
      )}

      {/* Red vignette flash whenever the player takes a hit */}
      {playerHurtAt > 0 && (
        <div
          key={`player-hurt-${playerHurtAt}`}
          className="absolute inset-0 z-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(220,38,38,0.5) 100%)",
            animation: "hurt-vignette 500ms ease-out forwards",
          }}
        />
      )}

      {/* Screen fade overlay (screen_fade cutscene verb) */}
      <div
        className="absolute inset-0 z-40 pointer-events-none"
        style={{
          backgroundColor: screenFade.color,
          opacity: screenFade.opacity,
          transition: `opacity ${screenFade.duration}ms ease`,
        }}
      />

      {levelUpOpen && saveData.playerStats.hp > 0 && (
        <LevelUpOverlay
          level={playerLevel}
          pending={pendingLevelUps}
          onChoose={handleLevelUpChoice}
        />
      )}

      {/* Game Over Overlay */}
      {saveData &&
        saveData.playerStats.hp !== undefined &&
        saveData.playerStats.hp <= 0 && (
          <div className="absolute inset-0 bg-red-950/80 z-50 flex flex-col items-center justify-center p-4">
            <h1 className="text-6xl font-bold font-serif text-red-500 mb-4 tracking-widest drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">
              YOU DIED
            </h1>
            <p className="text-red-200/60 mb-8 max-w-sm text-center">
              Your run has ended. Load a save or begin again.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
                  resetRun();
                }}
                className="px-8 py-3 bg-red-900 hover:bg-red-800 text-red-100 rounded shadow-[0_0_15px_rgba(153,27,27,0.5)] font-bold tracking-widest hover:scale-105 transition-all"
              >
                RESTART
              </button>
              <button
                onClick={() => {
                  playSfx("save_chime", { volume: 0.32, cooldownMs: 120 });
                  setShowSaveMenu(true);
                }}
                className="px-8 py-3 bg-amber-950 hover:bg-amber-900 text-amber-100 border border-amber-800 rounded font-bold tracking-widest hover:scale-105 transition-all"
              >
                LOAD SAVE
              </button>
            </div>
          </div>
        )}

      {/* Journal Overlay */}
      {showJournal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-sky-900/70 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[82vh]">
            <div className="px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
              <h2 className="font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-sky-300" />
                Journal
              </h2>
              <button
                onClick={() => {
                  playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                  setShowJournal(false);
                }}
                className="text-neutral-400 hover:text-white transition-colors p-1"
                title="Close Journal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <section className="md:col-span-2 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quest Log</h3>
                  {questJournal.entries.length > 0 ? (
                    <div className="space-y-3">
                      {questJournal.entries.map((entry) => (
                        <div key={entry.id} className="rounded border border-neutral-800 bg-neutral-900/95 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-neutral-100">{entry.title}</div>
                              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                                {stateLabel(entry.state)}
                              </div>
                            </div>
                          </div>
                          {entry.description && (
                            <p className="mt-2 text-xs leading-relaxed text-neutral-500">{entry.description}</p>
                          )}
                          <div className="mt-3 space-y-2">
                            {entry.steps.map((step) => {
                              const done = step.status === "done";
                              const current = step.status === "current";
                              const Icon = done ? CheckCircle2 : current ? Circle : LockKeyhole;
                              return (
                                <div
                                  key={step.id}
                                  className={`flex items-start gap-2 rounded px-2 py-1.5 ${
                                    current
                                      ? "bg-sky-950/45 text-neutral-100"
                                      : done
                                        ? "text-neutral-400"
                                        : "text-neutral-600"
                                  }`}
                                >
                                  <Icon
                                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                                      done ? "text-emerald-400" : current ? "text-sky-300" : "text-neutral-700"
                                    }`}
                                  />
                                  <span className={`text-xs leading-snug ${done ? "line-through decoration-neutral-600" : ""}`}>
                                    {step.text}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded border border-dashed border-neutral-800 p-3 text-sm text-neutral-600">
                      No quests are defined in the active package.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Read Documents</h3>
                  {(saveData.read_documents || []).length > 0 ? (
                    (saveData.read_documents || []).map((documentId) => {
                      const doc = gamePackage.documents?.find((candidate) => candidate.id === documentId);
                      if (!doc) return null;
                      return (
                        <button
                          key={documentId}
                          onClick={() => {
                            playSfx("document_open", { volume: 0.32, cooldownMs: 120 });
                            setShowJournal(false);
                            usePlayStore.getState().markDocumentRead(documentId);
                            setActiveDocumentId(documentId);
                          }}
                          className="w-full text-left rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-2"
                        >
                          <div className="text-sm font-medium text-neutral-100">{doc.display_name}</div>
                          <div className="text-xs text-neutral-500 line-clamp-2 mt-1">{doc.content}</div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="rounded-lg border border-dashed border-neutral-800 p-3 text-sm text-neutral-500">
                      No documents have been read yet.
                    </p>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Inventory</h3>
                  {(saveData.inventory || []).filter((entry) => entry.count > 0).length > 0 ? (
                    (saveData.inventory || [])
                      .filter((entry) => entry.count > 0)
                      .map((entry) => {
                        const item = gamePackage.items.find((candidate) => candidate.id === entry.id);
                        return (
                          <div key={entry.id} className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-neutral-200 truncate">{item?.display_name || entry.id}</span>
                              <span className="text-xs text-neutral-500">x{entry.count}</span>
                            </div>
                            {item?.description && (
                              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{item.description}</p>
                            )}
                          </div>
                        );
                      })
                  ) : (
                    <p className="text-sm text-neutral-600">Inventory is empty.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Package Documents</h3>
                  {(gamePackage.documents || []).length > 0 ? (
                    <div className="space-y-2">
                      {(gamePackage.documents || []).map((doc) => {
                        const read = (saveData.read_documents || []).includes(doc.id);
                        return (
                          <div key={doc.id} className="rounded border border-neutral-800 bg-neutral-900/70 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-neutral-200 truncate">{doc.display_name}</span>
                              <span className={`text-[10px] font-semibold uppercase tracking-wide ${read ? "text-emerald-300" : "text-neutral-600"}`}>
                                {read ? "Read" : "Unread"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-600">No documents in package.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {verbTargeting && (
        <div className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-cyan-700/70 bg-neutral-950/92 px-4 py-2 shadow-lg">
          <span className="text-sm text-cyan-100">
            {verbTargeting.verb === "drop" ? (
              <>
                Drop{" "}
                <span className="font-semibold text-white">
                  {gamePackage.items.find((i) => i.id === verbTargeting.itemId)?.display_name ||
                    "item"}
                </span>
              </>
            ) : (
              <span className="font-semibold capitalize text-white">{verbTargeting.verb}</span>
            )}{" "}
            — tap a highlighted {PLAYMODE_OBJECT_VERBS.has(verbTargeting.verb) ? "object" : "cell"}
          </span>
          <button
            onClick={cancelVerbTargeting}
            className="rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 transition-colors hover:bg-neutral-700"
          >
            Cancel
          </button>
        </div>
      )}

      {showInventory && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-4 py-3 border-b border-neutral-800 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Inventory
                </h2>
                <div className="text-amber-400 font-mono text-sm px-2 py-0.5 bg-amber-500/10 rounded flex items-center gap-1.5 border border-amber-500/20">
                  🪙 {saveData.money || 0}
                </div>
              </div>
              <button
                onClick={() => {
                  playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                  setShowInventory(false);
                }}
                className="text-neutral-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SpatialInventoryGrid
                gamePackage={gamePackage}
                save={saveData}
                onCommitLayout={commitInventoryLayout}
                onUse={(itemDef, itemId, targetId) =>
                  useConsumableItem(itemDef, itemId, targetId)
                }
                onDrop={(itemId) => {
                  playSfx("ui_back", { volume: 0.18, cooldownMs: 120 });
                  handleDropItem(itemId);
                }}
                healingTargets={getHealingItemTargets()}
                playSfx={playSfx}
              />
            </div>
          </div>
        </div>
      )}

      {/* Spells Dialog Overlay */}
      {showSkills && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-indigo-700/50 w-full max-w-md rounded-xl flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-neutral-800 flex justify-between items-center bg-indigo-950/20">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-indigo-200 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Spells & Abilities
                </h2>
              </div>
              <button
                onClick={() => {
                  playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                  setShowSkills(false);
                }}
                className="text-neutral-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {gamePackage.abilities
                .filter((skill) =>
                  (saveData.known_skills || []).includes(skill.id),
                )
                .map((skill) => {
                return (
                  <div
                    key={skill.id}
                    className="bg-neutral-800/50 border border-neutral-800/80 rounded-lg p-3 flex flex-col gap-2 relative"
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-indigo-100">
                        {skill.display_name}
                      </h3>
                      <div className="flex gap-2 text-xs font-mono">
                        <span className="text-amber-400">
                          AP: {skill.ap_cost}
                        </span>
                        {skill.mp_cost > 0 && (
                          <span className="text-blue-400">
                            MP: {skill.mp_cost}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-neutral-400">
                      {skill.description}
                    </p>
                    <div className="flex gap-2 text-[10px] text-neutral-500 uppercase tracking-wider mt-1">
                      <span className="px-1.5 py-0.5 bg-neutral-900 rounded border border-neutral-700/50">
                        Target: {skill.targeting}
                      </span>
                      <span className="px-1.5 py-0.5 bg-neutral-900 rounded border border-neutral-700/50">
                        Range: {skill.range}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 bg-neutral-900 rounded border border-neutral-700/50 ${skill.element === "none" ? "" : "text-" + skill.element + "-400"}`}
                      >
                        El: {skill.element}
                      </span>
                    </div>
                    <button
                      className="mt-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition-colors w-full flex items-center justify-center gap-2 font-bold"
                      onClick={() => beginTargeting(skill.id)}
                    >
                      <Hand className="w-3.5 h-3.5" />
                      Cast
                    </button>
                  </div>
                );
              })}
              {gamePackage.abilities.filter((skill) =>
                (saveData.known_skills || []).includes(skill.id),
              ).length === 0 && (
                <div className="p-8 text-center text-neutral-500 text-sm">
                  You know no rites yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save / Load Menu Overlay */}
      {showSaveMenu && (
        <div className="absolute inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-amber-900/60 w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-neutral-800 flex justify-between items-center bg-amber-950/20">
              <h2 className="font-bold text-amber-100 flex items-center gap-2">
                <Save className="w-5 h-5" />
                Save Slots
              </h2>
              <button
                onClick={() => {
                  playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                  setShowSaveMenu(false);
                }}
                className="text-neutral-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => i + 1).map(
                (slot) => {
                  // saveSlotRevision keeps this read fresh after writes.
                  void saveSlotRevision;
                  const data = readSaveSlot(slot);
                  const meta = data?.meta;
                  const minutes = Math.floor(meta?.clock_minutes ?? 0);
                  const metaLine = meta
                    ? `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} — ${new Date(meta.saved_at).toLocaleString()}`
                    : "Empty slot";
                  const versionOk =
                    meta?.package_version === gamePackage.metadata.version;
                  return (
                    <div
                      key={slot}
                      className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-3 flex flex-col gap-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-neutral-200 text-sm">
                          Slot {slot}
                        </span>
                        {meta && !versionOk && (
                          <span className="text-[10px] uppercase tracking-wider text-red-400">
                            older build
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500">{metaLine}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (usePlayStore.getState().saveToSlot(slot)) {
                              playSfx("save_chime", {
                                volume: 0.34,
                                cooldownMs: 120,
                              });
                              addLog(`Saved to slot ${slot}.`);
                              setSaveSlotRevision((r) => r + 1);
                            }
                          }}
                          className="flex-1 text-xs bg-amber-600/90 hover:bg-amber-500 text-amber-50 px-3 py-1.5 rounded font-medium transition-colors"
                        >
                          Save
                        </button>
                        <button
                          disabled={!data || !versionOk}
                          onClick={() => {
                            const error = usePlayStore
                              .getState()
                              .loadFromSlot(slot, gamePackage.metadata.version);
                            if (error) {
                              playSfx("warning", { volume: 0.24, cooldownMs: 120 });
                              addLog(error);
                            } else {
                              playSfx("ui_click", { volume: 0.22, cooldownMs: 120 });
                              setShowSaveMenu(false);
                            }
                          }}
                          className="flex-1 text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-200 px-3 py-1.5 rounded font-medium transition-colors"
                        >
                          Load
                        </button>
                        <button
                          disabled={!data}
                          onClick={() => {
                            playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                            deleteSaveSlot(slot);
                            setSaveSlotRevision((r) => r + 1);
                          }}
                          className="text-xs bg-neutral-800 hover:bg-red-900/60 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-400 px-2.5 py-1.5 rounded transition-colors"
                          title="Delete this save"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Panel — only visible for dialogue / shop / document interactions */}
      <div
        className={`shrink-0 transition-all duration-300 ${bottomPanelOpen ? `h-[18rem] sm:h-[22rem] z-30 border-t-2 border-ui-accent ${dialogueHasSceneImage ? "bg-black/25" : "bg-ui-surface"} shadow-[0_-10px_30px_rgba(0,0,0,0.9)]` : "h-0 overflow-hidden"} flex flex-col justify-center items-center relative`}
      >
        {activeShopId ? (
          (() => {
            const shop = gamePackage.shops?.find((s) => s.id === activeShopId);
            if (!shop) {
              return (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-neutral-500">Shop not found.</p>
                  <button
                    onClick={() => {
                      playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                      closeShop();
                    }}
                    className="px-4 py-2 bg-neutral-800 rounded"
                  >
                    Close
                  </button>
                </div>
              );
            }
            return (
              <div className="w-full h-full flex flex-col bg-transparent relative z-20">
                <div className="px-6 py-4 border-b border-[var(--color-ui-accent-dark)] flex justify-between items-center relative">
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-ui-accent)] flex items-center gap-2 uppercase tracking-wider text-accent-glow">
                    <Briefcase className="w-5 h-5 text-[var(--color-ui-accent)]" />
                    {shop.display_name}
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="text-[var(--color-ui-text)] font-serif font-bold text-lg px-3 py-1 flex items-center gap-1.5 drop-shadow-md">
                      <span className="text-[var(--color-ui-accent)]">☩</span> {saveData.money || 0}
                    </div>
                    <button
                      onClick={() => {
                        playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                        closeShop();
                      }}
                      className="p-1 hover:bg-black/20 rounded text-[var(--color-ui-text-muted)] hover:text-[var(--color-ui-text)] transition-colors"
                    >
                      <X className="w-6 h-6 drop-shadow-md" />
                    </button>
                  </div>
                </div>
                <div className="p-6 flex-1 overflow-y-auto">
                  {(() => {
                    const stock = getAvailableShopStock(shop, shopConditionCtx);
                    if (stock.length === 0) {
                      return (
                        <p className="text-neutral-500 text-center py-8">
                          This shop has no items.
                        </p>
                      );
                    }
                    return (
                    <div className="space-y-2">
                      {stock.map(({ item, stockIndex, price, basePrice }) => {
                        const itemDef = gamePackage.items?.find(
                          (i) => i.id === item.item_id,
                        );
                        if (!itemDef) return null;
                        const canAfford = (saveData.money || 0) >= price;

                        return (
                          <div
                            key={stockIndex}
                            className="flex justify-between items-center p-4 bg-transparent border-b border-[var(--color-ui-accent-dark)]/30 hover:bg-black/10 transition-colors"
                          >
                            <div>
                              <div className="font-[family-name:var(--font-display)] text-[var(--color-ui-text)] font-bold tracking-wider text-lg">
                                {itemDef.display_name}
                              </div>
                              <div className="font-serif text-[var(--color-ui-text-muted)] italic">
                                {itemDef.description}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div
                                className={`font-serif font-bold text-lg ${canAfford ? "text-[var(--color-ui-text)]" : "text-[#8b1c1c]"}`}
                              >
                                {price} <span className="text-[var(--color-ui-accent)]">☩</span>
                                {price !== basePrice && (
                                  <span className="text-sm text-[var(--color-ui-text-muted)] line-through ml-2">
                                    {basePrice}
                                  </span>
                                )}
                              </div>
                              <button
                                disabled={!canAfford}
                                onClick={() => {
                                  if (canAfford) {
                                    const purchase = dispatchV1BuyShopItem({
                                      gamePackage,
                                      save: usePlayStore.getState().saveData || saveData,
                                      shopId: shop.id,
                                      stockIndex,
                                    });
                                    if (purchase.ok) {
                                      commitRuntimeSave(purchase.save);
                                      usePlayStore.getState().pushEngineEvents(purchase.events);
                                      playSfx("coin", { volume: 0.34, cooldownMs: 100 });
                                      addLog(`Bought ${itemDef.display_name}.`);
                                    } else {
                                      playSfx("warning", {
                                        volume: 0.24,
                                        cooldownMs: 120,
                                      });
                                    }
                                  } else {
                                    playSfx("warning", {
                                      volume: 0.24,
                                      cooldownMs: 120,
                                    });
                                  }
                                }}
                                className="px-4 py-2 bg-ui-panel border border-ui-accent text-[var(--color-ui-accent)] hover:brightness-125 disabled:opacity-50 disabled:grayscale rounded-sm font-[family-name:var(--font-display)] tracking-wider text-sm shadow-md transition-all"
                              >
                                Purchase
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}
                  {(() => {
                    const sellableInventory = (saveData.inventory || []).filter(
                      (entry) => entry.count > 0,
                    );
                    if (sellableInventory.length === 0) return null;
                    const stock = getAvailableShopStock(shop, shopConditionCtx);
                    return (
                      <div className="mt-5 pt-4 border-t border-[var(--color-ui-accent-dark)]/40">
                        <div className="text-[10px] uppercase tracking-widest text-[var(--color-ui-text-muted)] mb-2">
                          Your Pack
                        </div>
                        <div className="space-y-1.5">
                          {sellableInventory.map((entry) => {
                            const itemDef = gamePackage.items?.find((i) => i.id === entry.id);
                            if (!itemDef) return null;
                            const stockPrices = stock
                              .filter((candidate) => candidate.item.item_id === entry.id)
                              .map((candidate) => candidate.price);
                            const unitPrice = Math.max(
                              1,
                              Math.floor((stockPrices.length ? Math.min(...stockPrices) : 2) / 2),
                            );
                            return (
                              <div
                                key={entry.id}
                                className="flex justify-between items-center p-3 bg-transparent border-b border-[var(--color-ui-accent-dark)]/25 hover:bg-black/10 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="font-[family-name:var(--font-display)] text-[var(--color-ui-text)] font-bold tracking-wider text-base truncate">
                                    {itemDef.display_name} <span className="text-[var(--color-ui-accent)]">x</span>{entry.count}
                                  </div>
                                  <div className="font-serif text-[var(--color-ui-text-muted)] italic text-sm truncate">
                                    {unitPrice} <span className="text-[var(--color-ui-accent)]">☩</span> resale
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    const sale = dispatchV1SellInventoryItem({
                                      gamePackage,
                                      save: usePlayStore.getState().saveData || saveData,
                                      shopId: shop.id,
                                      itemId: entry.id,
                                      count: 1,
                                    });
                                    if (!sale.ok) {
                                      playSfx("warning", {
                                        volume: 0.24,
                                        cooldownMs: 120,
                                      });
                                      return;
                                    }
                                    commitRuntimeSave(sale.save);
                                    usePlayStore.getState().pushEngineEvents(sale.events);
                                    playSfx("coin", { volume: 0.3, cooldownMs: 100 });
                                    addLog(`Sold ${itemDef.display_name}.`);
                                  }}
                                  className="px-4 py-2 bg-black border border-[var(--color-ui-accent-dark)] text-[var(--color-ui-text)] hover:brightness-125 rounded-sm text-xs font-[family-name:var(--font-display)] font-bold tracking-wider transition-all shadow-md shrink-0"
                                >
                                  Sell
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()
        ) : activeContainerId ? (
          (() => {
            const container = activeMap.container_placements?.find(
              (c) => c.id === activeContainerId,
            );
            if (!container) {
              return (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-neutral-500">Container not found.</p>
                  <button
                    onClick={() => {
                      playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                      closeContainer();
                    }}
                    className="px-4 py-2 bg-neutral-800 rounded"
                  >
                    Close
                  </button>
                </div>
              );
            }
            const containerState = getContainerRuntimeState(
              container,
              saveData,
              activeMap.id,
            );
            const containerName = container.display_name || "Container";
            const takeEntry = (index: number) => {
              const entry = containerState.items[index];
              if (!entry) return;
              const transfer = dispatchV1TakeFromContainer({
                gamePackage,
                save: saveData,
                containerId: container.id,
                entryIndex: index,
              });
              if (!transfer.ok) {
                playSfx("warning", { volume: 0.22, cooldownMs: 100 });
                addLog(`Could not take from ${containerName}.`);
                return;
              }
              commitRuntimeSave(transfer.save);
              usePlayStore.getState().pushEngineEvents(transfer.events);
              playSfx("item_pickup", { volume: 0.34, cooldownMs: 100 });
              const itemDef = gamePackage.items.find(
                (i) => i.id === entry.item_id,
              );
              addLog(
                `Took ${entry.count > 1 ? `${entry.count}x ` : ""}${itemDef?.display_name || entry.item_id}.`,
              );
            };
            const stowItem = (itemId: string) => {
              const transfer = dispatchV1StowInContainer({
                gamePackage,
                save: saveData,
                containerId: container.id,
                itemId,
                count: 1,
              });
              if (!transfer.ok) {
                playSfx("warning", { volume: 0.22, cooldownMs: 100 });
                addLog(`Could not stow item in ${containerName}.`);
                return;
              }
              commitRuntimeSave(transfer.save);
              usePlayStore.getState().pushEngineEvents(transfer.events);
              playSfx("ui_click", { volume: 0.22, cooldownMs: 100 });
              const itemDef = gamePackage.items.find((i) => i.id === itemId);
              addLog(`Stowed ${itemDef?.display_name || itemId}.`);
            };
            const stowableInventory = (saveData.inventory || []).filter(
              (entry) => entry.count > 0,
            );

            return (
              <div className="w-full h-full flex flex-col bg-transparent relative z-20">
                <div className="px-6 py-4 border-b border-[var(--color-ui-accent-dark)] flex justify-between items-center relative">
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-ui-accent)] flex items-center gap-2 uppercase tracking-wider text-accent-glow">
                    <Briefcase className="w-5 h-5 text-[var(--color-ui-accent)]" />
                    {containerName}
                  </h3>
                  <div className="flex items-center gap-3">
                    {containerState.items.length > 0 && (
                      <button
                        onClick={() => {
                          const transfer = dispatchV1TakeAllFromContainer({
                            gamePackage,
                            save: saveData,
                            containerId: container.id,
                          });
                          if (!transfer.ok) {
                            playSfx("warning", { volume: 0.22, cooldownMs: 120 });
                            addLog(`Could not empty ${containerName}.`);
                            return;
                          }
                          commitRuntimeSave(transfer.save);
                          usePlayStore.getState().pushEngineEvents(transfer.events);
                          playSfx("item_pickup", { volume: 0.38, cooldownMs: 120 });
                          addLog(`Emptied ${containerName}.`);
                        }}
                        className="px-4 py-2 bg-ui-panel border border-ui-accent text-[var(--color-ui-accent)] hover:brightness-125 rounded-sm text-xs font-[family-name:var(--font-display)] font-bold tracking-wider transition-all shadow-md"
                      >
                        Take All
                      </button>
                    )}
                    <button
                      onClick={() => {
                        playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                        closeContainer();
                      }}
                      className="p-1 hover:bg-black/20 rounded text-[var(--color-ui-text-muted)] hover:text-[var(--color-ui-text)] transition-colors"
                    >
                      <X className="w-6 h-6 drop-shadow-md" />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-2">
                  {containerState.items.length === 0 ? (
                    <p className="text-neutral-600 text-center text-sm py-3">
                      Empty.
                    </p>
                  ) : (
                    containerState.items.map((entry, index) => {
                      const itemDef = gamePackage.items.find(
                        (i) => i.id === entry.item_id,
                      );
                      return (
                        <div
                          key={`${entry.item_id}_${index}`}
                          className="flex justify-between items-center p-3 bg-transparent border-b border-[var(--color-ui-accent-dark)]/30 hover:bg-black/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xl">
                              {itemDef?.icon || "📦"}
                            </span>
                            <span className="text-lg font-[family-name:var(--font-display)] font-bold tracking-wider text-[var(--color-ui-text)] truncate">
                              {itemDef?.display_name || entry.item_id}
                              {entry.count > 1 ? ` x${entry.count}` : ""}
                            </span>
                          </div>
                          <button
                            onClick={() => takeEntry(index)}
                            className="px-4 py-2 bg-ui-panel border border-ui-accent text-[var(--color-ui-accent)] hover:brightness-125 rounded-sm text-xs font-[family-name:var(--font-display)] font-bold tracking-wider transition-all shadow-md shrink-0"
                          >
                            Take
                          </button>
                        </div>
                      );
                    })
                  )}
                  <div className="pt-2 border-t border-neutral-800">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                      Your Pack
                    </div>
                    {stowableInventory.length === 0 ? (
                      <p className="text-neutral-600 text-sm">
                        Nothing to stow.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {stowableInventory.map((entry) => {
                          const itemDef = gamePackage.items.find(
                            (i) => i.id === entry.id,
                          );
                          return (
                            <div
                              key={entry.id}
                              className="flex justify-between items-center p-3 bg-transparent border-b border-[var(--color-ui-accent-dark)]/30 hover:bg-black/10 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xl">
                                  {itemDef?.icon || "📦"}
                                </span>
                                <span className="text-md font-serif text-[var(--color-ui-text)] truncate drop-shadow-sm">
                                  {itemDef?.display_name || entry.id} <span className="text-[var(--color-ui-accent)]">x</span>
                                  {entry.count}
                                </span>
                              </div>
                              <button
                                onClick={() => stowItem(entry.id)}
                                className="px-4 py-2 bg-black border border-[var(--color-ui-accent-dark)] text-[var(--color-ui-text)] hover:brightness-125 rounded-sm text-xs font-[family-name:var(--font-display)] font-bold tracking-wider transition-all shadow-md shrink-0"
                              >
                                Stow
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        ) : activeDocumentId ? (
          (() => {
            const document = gamePackage.documents?.find(
              (d) => d.id === activeDocumentId,
            );
            if (!document) {
              return (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-neutral-500">Document not found.</p>
                  <button
                    onClick={() => {
                      playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                      setActiveDocumentId(null);
                    }}
                    className="px-4 py-2 bg-neutral-800 rounded"
                  >
                    Close
                  </button>
                </div>
              );
            }
            return (
              <div className="w-full max-w-2xl h-full flex flex-col bg-transparent relative z-20">
                <div className="px-4 py-2 sm:px-6 sm:py-4 border-b border-[var(--color-ui-accent-dark)] flex justify-between items-center relative shrink-0">
                  <h3 className="font-[family-name:var(--font-display)] font-bold text-base sm:text-2xl text-[var(--color-ui-accent)] uppercase tracking-[0.2em] text-accent-glow leading-tight">
                    {document.display_name}
                  </h3>
                  <button
                    onClick={() => {
                      playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                      setActiveDocumentId(null);
                    }}
                    className="p-1 hover:bg-black/20 rounded text-[var(--color-ui-text-muted)] hover:text-[var(--color-ui-text)] transition-colors shrink-0 ml-2"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow-md" />
                  </button>
                </div>
                <div
                  className="px-4 py-3 sm:p-8 flex-1 overflow-y-auto font-serif text-sm sm:text-xl leading-relaxed sm:leading-loose text-[var(--color-ui-text)] whitespace-pre-wrap tracking-wide drop-shadow-sm text-justify"
                  style={{ touchAction: 'pan-y' }}
                >
                  {document.content}
                </div>
              </div>
            );
          })()
        ) : activeDialogueId && activeDialogueNodeId ? (
          (() => {
            const dialogue = gamePackage.dialogue.find(
              (d) => d.id === activeDialogueId,
            );
            const node = dialogue?.nodes.find(
              (n) => n.id === activeDialogueNodeId,
            );
            if (!node) {
              return (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-neutral-500">Conversation ended.</p>
                  <button
                    onClick={() => {
                      playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                      endDialogue();
                    }}
                    className="px-4 py-2 bg-neutral-800 rounded"
                  >
                    Close
                  </button>
                </div>
              );
            }
            const visibleOptions = getVisibleDialogueOptions(
              node,
              buildConditionContext(saveData),
            );
            const sceneImageUrl = node.scene_image_url;
            const hasSceneImage = Boolean(sceneImageUrl);
            return (
              <>
              {hasSceneImage && sceneImageUrl ? (
              <DialogueSceneImageStage
                src={sceneImageUrl}
                alt={node.scene_image_alt}
              />
              ) : (
                <DialoguePortraitStage
                  speaker={node.speaker}
                  gamePackage={gamePackage}
                  dialogueId={dialogue?.id || activeDialogueId}
                />
              )}
              <div className={`w-full ${hasSceneImage ? "max-w-3xl bg-black/68 backdrop-blur-[2px] border-x border-[var(--color-ui-accent)]/55 shadow-[0_0_34px_rgba(0,0,0,0.8)]" : "max-w-2xl bg-black/45 backdrop-blur-[1px] border-x border-[var(--color-ui-accent-dark)]/40 shadow-[0_0_28px_rgba(0,0,0,0.55)]"} h-full flex flex-col relative z-20`}>
                <div className={`px-4 py-2 sm:px-6 sm:py-4 flex flex-col items-center justify-center border-b ${hasSceneImage ? "border-[var(--color-ui-accent)]/45" : "border-[var(--color-ui-accent-dark)]"} relative`}>
                  <h3 className="font-[family-name:var(--font-display)] text-base sm:text-xl font-bold text-[var(--color-ui-accent)] uppercase tracking-[0.2em] text-accent-glow">
                    {node.speaker}
                  </h3>
                  {/* Ornate decorative accent below speaker */}
                  <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-[var(--color-ui-accent-dark)] to-transparent mt-1 sm:mt-2"></div>
                </div>
                <div className="px-4 py-2 sm:p-6 flex-1 overflow-y-auto">
                  <p className={`${hasSceneImage ? "text-neutral-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" : "text-[var(--color-ui-text)] drop-shadow-sm"} font-serif text-sm sm:text-lg leading-relaxed text-center`}>
                    {node.text}
                  </p>
                </div>
                <div className={`px-3 py-2 sm:p-4 flex flex-col gap-1.5 sm:gap-2 shrink-0 max-h-[45%] overflow-y-auto overflow-x-hidden border-t ${hasSceneImage ? "border-[var(--color-ui-accent)]/45" : "border-[var(--color-ui-accent-dark)]"}`}>
                  {visibleOptions.map((opt, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-3 py-1.5 sm:py-2 bg-neutral-800/50 hover:bg-neutral-700 rounded text-xs sm:text-sm text-neutral-300 transition-colors"
                        onClick={() => {
                          playSfx("dialogue_next", {
                            volume: 0.24,
                            cooldownMs: 100,
                          });
                          const currentSave = usePlayStore.getState().saveData || saveData;
                          const result = currentSave
                            ? dispatchV1ChooseDialogueOption({
                                gamePackage,
                                save: currentSave,
                                dialogueId: activeDialogueId,
                                nodeId: activeDialogueNodeId,
                                optionIndex: i,
                              })
                            : null;
                          let nextNodeId = opt.next_node_id;
                          let triggerCutsceneId = opt.trigger_cutscene;
                          if (result?.ok && result.outcome) {
                            commitRuntimeSave(result.save);
                            usePlayStore.getState().pushEngineEvents(result.events);
                            nextNodeId = result.outcome.nextNodeId;
                            triggerCutsceneId = result.outcome.triggerCutsceneId;
                            result.outcome.effects
                              .filter((effect) => effect.type === "set_quest" && effect.questId && effect.state)
                              .forEach((effect) => {
                                const questName =
                                  gamePackage.quests.find((q) => q.id === effect.questId)?.display_name ||
                                  effect.questId;
                                addLog(`Quest Updated: ${questName} -> ${effect.state}`);
                              });
                          } else {
                            if (opt.set_switch) {
                              usePlayStore
                                .getState()
                                .setFlag(opt.set_switch, opt.set_switch_value ?? true);
                            }
                            opt.set_switches?.forEach((switchUpdate) => {
                              usePlayStore
                                .getState()
                                .setFlag(switchUpdate.switch_id, switchUpdate.switch_value ?? true);
                            });
                            if (opt.trigger_quest && opt.trigger_quest_state) {
                              setQuestState(opt.trigger_quest, opt.trigger_quest_state);
                              const questName =
                                gamePackage.quests.find((q) => q.id === opt.trigger_quest)?.display_name ||
                                opt.trigger_quest;
                              addLog(`Quest Updated: ${questName} -> ${opt.trigger_quest_state}`);
                            }
                          }
                          advanceDialogue(nextNodeId);
                          if (triggerCutsceneId) {
                            const cutscene = gamePackage.cutscenes.find(
                              (c) => c.id === triggerCutsceneId,
                            );
                            if (cutscene) setActiveCutscene(cutscene);
                          }
                        }}
                      >
                        {opt.text}
                      </button>
                    ))}
                  {visibleOptions.length === 0 && (
                    <button
                      onClick={() => {
                        playSfx("ui_back", { volume: 0.2, cooldownMs: 120 });
                        endDialogue();
                      }}
                      className="w-full text-center px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700 rounded text-sm text-neutral-300 transition-colors italic"
                    >
                      (Close)
                    </button>
                  )}
                </div>
              </div>
              </>
            );
          })()
        ) : (
          null
        )}
      </div>
    </div>
  );
}

export function PlayMode() {
  const [state, setState] = useState<"title" | "playing" | "end">("title");
  const { gamePackage } = useEngineStore();
  const hasSave = !!usePlayStore((s) => s.saveData);
  const titleMusicUrl =
    (gamePackage.settings?.title_music_url as string | undefined) ||
    ((gamePackage.settings?.title_music_id &&
      gamePackage.settings?.music_tracks?.[gamePackage.settings.title_music_id]) as
      | string
      | undefined);
  const titleImageUrl = gamePackage.settings?.title_image_url as string | undefined;
  const endTitle =
    (gamePackage.settings?.end_title as string | undefined) ||
    "Feature Demo Complete";
  const playTitleSfx = useCallback(
    (id: string, volume = 0.24) => {
      playSound(id, {
        volume,
        customSounds: gamePackage.settings?.sound_effects || {},
      });
    },
    [gamePackage.settings],
  );

  useEffect(() => {
    if (state === "title") {
      if (titleMusicUrl) {
        playMusic(titleMusicUrl);
      } else {
        stopMusic();
      }
    }
  }, [state, titleMusicUrl]);

  if (state === "end") {
    return (
      <div className="h-full bg-neutral-950 text-white relative overflow-hidden flex flex-col items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,20,40,0.98)_0%,rgba(0,0,0,1)_100%)]" />
        <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center max-w-lg">
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-[var(--color-ui-accent)] to-transparent" />
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold uppercase tracking-[0.28em] text-[var(--color-ui-accent)]">
            Complete
          </h2>
          <p className="font-[family-name:var(--font-body)] text-base leading-relaxed text-neutral-300 italic">
            {endTitle}
          </p>
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-[var(--color-ui-accent)] to-transparent" />
          <button
            className="mt-4 border border-[var(--color-ui-accent-dark)] bg-black/68 px-7 py-4 font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-[0.22em] text-[var(--color-ui-text)] transition-all hover:border-[var(--color-ui-accent)] hover:bg-black/82 hover:text-[var(--color-ui-accent)] active:scale-[0.98]"
            onClick={() => setState("title")}
          >
            Return to Title
          </button>
        </div>
      </div>
    );
  }

  if (state === "title") {
    return (
      <div className="h-full bg-neutral-950 text-white relative overflow-hidden">
        {titleImageUrl ? (
          <img
            src={titleImageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,12,0.94)_0%,rgba(7,12,18,0.7)_38%,rgba(7,12,18,0.28)_70%,rgba(5,8,12,0.5)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.18)_34%,rgba(0,0,0,0.3)_100%)]" />

        <div className="relative z-10 flex h-full w-full flex-col justify-end px-6 pb-8 pt-8 sm:px-12 sm:pb-12 lg:px-16">
          <div className="max-w-[46rem]">
            <h1 className="font-[family-name:var(--font-display)] text-5xl font-black uppercase tracking-[0.18em] text-[var(--color-ui-text)] drop-shadow-[0_5px_20px_rgba(0,0,0,0.95)] sm:text-7xl lg:text-8xl">
              {gamePackage.metadata.title || "CRPG Engine"}
            </h1>
            <div className="mt-4 h-px w-44 bg-gradient-to-r from-[var(--color-ui-accent)] via-[var(--color-ui-accent-dark)] to-transparent" />
            <p className="mt-4 font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-[0.34em] text-[var(--color-ui-accent)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              Version {gamePackage.metadata.version}
            </p>
          </div>

          <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row">
          <button
            className="border border-[var(--color-ui-accent-dark)] bg-black/68 px-7 py-4 text-left font-[family-name:var(--font-display)] text-base font-bold uppercase tracking-[0.22em] text-[var(--color-ui-text)] shadow-[0_0_18px_rgba(0,0,0,0.75)] transition-all hover:border-[var(--color-ui-accent)] hover:bg-black/82 hover:text-[var(--color-ui-accent)] active:scale-[0.98] sm:min-w-52 sm:text-center"
            onClick={() => {
              playTitleSfx("ui_click");
              usePlayStore.getState().resetRun();
              usePlayStore.setState({ saveData: null });
              setState("playing");
            }}
          >
            New Game
          </button>
          <button
            className={`border px-7 py-4 text-left font-[family-name:var(--font-display)] text-base font-bold uppercase tracking-[0.22em] shadow-[0_0_18px_rgba(0,0,0,0.65)] transition-all sm:min-w-52 sm:text-center ${
              hasSave
                ? "border-[var(--color-ui-accent-dark)] bg-black/54 text-[var(--color-ui-text-muted)] hover:border-[var(--color-ui-accent)] hover:bg-black/78 hover:text-[var(--color-ui-accent)] active:scale-[0.98]"
                : "cursor-not-allowed border-neutral-800/70 bg-black/34 text-neutral-600"
            }`}
            onClick={() => {
              if (hasSave) {
                playTitleSfx("ui_click");
                setState("playing");
              } else {
                playTitleSfx("warning", 0.2);
              }
            }}
            disabled={!hasSave}
          >
            Continue Game
          </button>
          </div>
        </div>
      </div>
    );
  }

  return <PlayEngine onGameEnd={() => setState("end")} />;
}
