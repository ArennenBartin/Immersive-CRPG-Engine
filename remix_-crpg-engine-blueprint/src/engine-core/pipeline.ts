// ── Command → validate → effect → event pipeline ─────────────────────────────
// The deterministic spine the base spec mandates. All player, AI, cutscene, and
// debug intent should ultimately flow through dispatch():
//
//   Command -> validation -> Effect[] -> state mutation -> Event stream
//
// Framework-agnostic. The runtime (or a test) supplies a GridWorld adapter; the
// engine never reaches into React/zustand directly.

import { Registry } from "./registry";
import { EngineEvent, EventBus } from "./events";
import { RngStreams } from "./rng";

// Minimal authoritative grid an Engine can operate on. The live runtime can
// implement this over its existing save/map data; tests use InMemoryGridWorld.
export interface GridEntity {
  id: string;
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface GridWorld {
  tick: number;
  rng: RngStreams;
  events: EventBus;
  isWalkable(x: number, y: number): boolean;
  canMoveEntity?(id: string, x: number, y: number): ValidationResult;
  getEntity(id: string): GridEntity | undefined;
  getEntityAt(x: number, y: number): GridEntity | undefined;
  moveEntity(id: string, x: number, y: number): void;
}

export interface Command {
  type: string;
  actorId?: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export interface Effect {
  type: string;
  apply(world: GridWorld): void;
}

export interface CommandHandler {
  validate(cmd: Command, world: GridWorld): ValidationResult;
  resolve(cmd: Command, world: GridWorld): Effect[];
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
  events: EngineEvent[];
}

export class Engine {
  readonly commands = new Registry<CommandHandler>("commands");
  readonly effects = new Registry<(params: Record<string, unknown>) => Effect>("effects");
  readonly conditions = new Registry<(ctx: unknown) => boolean>("conditions");

  // Validate, resolve, apply, and report the events produced by one command.
  dispatch(cmd: Command, world: GridWorld): DispatchResult {
    const handler = this.commands.get(cmd.type);
    if (!handler) {
      return { ok: false, reason: `unknown command "${cmd.type}"`, events: [] };
    }

    const validation = handler.validate(cmd, world);
    if (!validation.ok) {
      world.events.emit("command_rejected", world.tick, {
        actorIds: cmd.actorId ? [cmd.actorId] : undefined,
        payload: { command: cmd.type, reason: validation.reason },
      });
      return { ok: false, reason: validation.reason, events: [] };
    }

    const before = world.events.getLog().length;
    const effects = handler.resolve(cmd, world);
    for (const effect of effects) effect.apply(world);
    world.events.emit("command_accepted", world.tick, {
      actorIds: cmd.actorId ? [cmd.actorId] : undefined,
      payload: { command: cmd.type, effects: effects.map((e) => e.type) },
    });

    return { ok: true, events: world.events.getLog().slice(before) };
  }
}

// ── Built-in commands/effects ────────────────────────────────────────────────

export const moveEntityEffect = (
  id: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Effect => ({
  type: "move_entity",
  apply(world) {
    const interactive = world as InteractiveGridWorld;
    const opportunityAttacks =
      interactive.resolveOpportunityAttacks?.(id, [fromX, fromY], [toX, toY]) || [];
    for (const attack of opportunityAttacks) {
      world.events.emit("opportunity_attack_resolved", world.tick, {
        actorIds: [attack.attackerId, attack.targetId],
        payload: attack as unknown as Record<string, unknown>,
      });
      world.events.emit("melee_attack_resolved", world.tick, {
        actorIds: [attack.attackerId, attack.targetId],
        payload: attack as unknown as Record<string, unknown>,
      });
      for (const completion of attack.objectiveCompletions || []) {
        world.events.emit("quest_objective_completed", world.tick, {
          actorIds: [attack.attackerId],
          payload: {
            objective_id: completion.objectiveId,
            target_id: completion.targetId,
            objective_type: completion.objectiveType,
          },
        });
      }
    }
    if (opportunityAttacks.some((attack) => attack.targetId === id && attack.targetDead)) return;
    if (!world.getEntity(id)) return;
    world.moveEntity(id, toX, toY);
    world.events.emit("entity_moved", world.tick, {
      actorIds: [id],
      payload: { from: [fromX, fromY], to: [toX, toY] },
    });
  },
});

export const MoveEntityHandler: CommandHandler = {
  validate(cmd, world) {
    if (!cmd.actorId) return { ok: false, reason: "no actor" };
    const entity = world.getEntity(cmd.actorId);
    if (!entity) return { ok: false, reason: "actor not found" };
    const dx = Number(cmd.params?.dx ?? 0);
    const dy = Number(cmd.params?.dy ?? 0);
    if (dx === 0 && dy === 0) return { ok: false, reason: "no movement" };
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    const worldValidation = world.canMoveEntity?.(entity.id, nx, ny);
    if (worldValidation && !worldValidation.ok) return worldValidation;
    if (worldValidation?.ok) return { ok: true };
    if (!world.isWalkable(nx, ny)) return { ok: false, reason: "blocked" };
    if (world.getEntityAt(nx, ny)) return { ok: false, reason: "occupied" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const entity = world.getEntity(cmd.actorId!)!;
    const dx = Number(cmd.params?.dx ?? 0);
    const dy = Number(cmd.params?.dy ?? 0);
    return [moveEntityEffect(entity.id, entity.x, entity.y, entity.x + dx, entity.y + dy)];
  },
};

// A deliberately passed turn: the actor stays put and lets time advance. The
// command itself mutates nothing — the dispatcher applies any energy/clock cost
// (deterministic time) through applyActionCost, exactly like the other
// exploration verbs. It emits a `waited` event so listeners (schedules, barks,
// the runtime event inspector) can react to a turn passing.
export const WaitHandler: CommandHandler = {
  validate(cmd, world) {
    if (!cmd.actorId) return { ok: false, reason: "no actor" };
    if (!world.getEntity(cmd.actorId)) return { ok: false, reason: "actor not found" };
    return { ok: true };
  },
  resolve(cmd) {
    const actorId = cmd.actorId!;
    return [
      {
        type: "wait",
        apply(target) {
          target.events.emit("waited", target.tick, { actorIds: [actorId] });
        },
      },
    ];
  },
};

// ── Interactive world capabilities (ground items, doors, map transitions) ─────
// Optional capabilities a richer GridWorld can provide so the interaction
// commands below work. The v1 adapter implements these over the real save/map.
export interface GroundItemRef {
  id: string;
  itemId: string;
  count: number;
  dropped: boolean;
}

export interface DroppedItemRef {
  id: string;
  itemId: string;
  count: number;
  cell: [number, number];
}

export interface DoorRef {
  key: string;
  displayName?: string;
  cell?: [number, number];
  locked: boolean;
  keyItemId?: string;
  consumeKey: boolean;
}

export interface PushableObjectRef {
  key: string;
  objectId: string;
  displayName?: string;
  cell: [number, number];
  facing: [number, number];
  massKg?: number;
  bulk?: number;
  awkwardness?: number;
  pushDifficulty?: number;
  pushEnergyCost?: number;
  requiresCooperation?: boolean;
}

export interface BreakableObjectRef extends PushableObjectRef {}

export interface SurfaceLayerRef {
  cell: [number, number];
  layerIds: string[];
  kinds: string[];
  count: number;
}

export interface EnvironmentCellRef {
  cell: [number, number];
  fieldIds: string[];
  kinds: string[];
  count: number;
}

export interface MapTransitionRef {
  fromMapId: string;
  toMapId: string;
  targetSpawnId?: string;
  exitId?: string;
  cell: [number, number];
  facing: [number, number];
}

export interface TriggerRef {
  id: string;
  type: string;
  cutsceneId: string;
  once: boolean;
  cell?: [number, number];
}

export interface ContainerRef {
  id: string;
  displayName?: string;
  locked: boolean;
  opened: boolean;
  keyItemId?: string;
  consumeKey: boolean;
  cell: [number, number];
}

export interface ContainerItemRef {
  containerId: string;
  itemId: string;
  count: number;
  entryIndex: number;
}

export interface QuestObjectiveCompletion {
  objectiveId: string;
  objectiveType?: string;
  targetId?: string;
}

export interface CombatAttackOutcome {
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  targetCell: [number, number];
  damage: number;
  crit: boolean;
  targetHp: number;
  targetDead: boolean;
  targetKind: "player" | "party" | "entity";
  assists?: {
    actorId: string;
    actorName: string;
    damage: number;
    crit: boolean;
  }[];
  experience?: {
    awarded: number;
    level?: number;
    levelUps?: number;
    pendingLevelUps?: number;
    queued?: boolean;
  };
  objectiveCompletions?: QuestObjectiveCompletion[];
}

export interface SkillCastHit {
  targetId: string;
  targetName: string;
  targetKind: "player" | "party" | "entity";
  cell: [number, number];
  payloadType: "damage" | "heal" | "status" | "emotional";
  amount?: number;
  crit?: boolean;
  statusId?: string;
  targetHp?: number;
  targetDead?: boolean;
  // For "emotional" hits: the signed axis deltas pushed onto the target and the
  // behavior mode its emotional state resolves to afterward.
  emotionalImpulse?: Partial<Record<"valence" | "arousal" | "grief" | "reverence" | "attachment", number>>;
  emotionalBehavior?: "calm" | "flee" | "attack" | "defend_attachment" | "paralyzed" | "fade";
}

export interface SkillCastOutcome {
  casterId: string;
  casterName: string;
  skillId: string;
  skillName: string;
  targetCells: [number, number][];
  hits: SkillCastHit[];
  mpCost: number;
  energyCost: number;
  experience?: CombatAttackOutcome["experience"][];
  objectiveCompletions?: QuestObjectiveCompletion[];
}

export interface CombatPartyFollowerRef {
  entityId: string;
  cell: [number, number];
}

export interface CombatSessionUpdateOptions {
  threatRadius?: number;
  chaseRadius?: number;
  partyFollowers?: CombatPartyFollowerRef[];
  forceEnd?: boolean;
}

export interface CombatSessionUpdateOutcome {
  status: "started" | "reinforced" | "ended" | "unchanged";
  queue?: string[];
  hostiles?: string[];
  newcomers?: string[];
  experience?: CombatAttackOutcome["experience"];
}

export interface CombatTurnAdvanceOutcome {
  previousTurnId?: string | null;
  activeTurnId?: string | null;
}

export interface EnemyTurnOutcome {
  kind: "attack" | "move" | "skip";
  actorId: string;
  actorName?: string;
  targetId?: string;
  fromCell?: [number, number];
  toCell?: [number, number];
  attack?: CombatAttackOutcome;
  objectiveCompletions?: QuestObjectiveCompletion[];
  nextTurnId?: string | null;
  reason?: string;
}

export interface NpcTaskAdvanceOutcome {
  queued: number;
  activated: number;
  moved: number;
  completed: number;
  failed: number;
  cleaned: number;
  repaired: number;
  restocked: number;
  reports: number;
  memory_records: number;
}

export interface SimulationProcessStartOptions {
  processId?: string;
  processType: string;
  cell: [number, number];
  workstationId?: string;
  shopId?: string;
  actorIds?: string[];
  requiredTicks: number;
  inputItems?: { item_id: string; count: number }[];
  outputItems?: { item_id: string; count: number }[];
  wasteItems?: { item_id: string; count: number }[];
  emits?: {
    heat?: number;
    sound?: number;
    scent?: number;
    trace_kind?: string;
  };
}

export interface SimulationProcessOutcome {
  started?: string;
  activated: number;
  advanced: number;
  completed: number;
  failed: number;
  outputs: number;
  waste: number;
  emissions: number;
  interrupted: number;
  economy_updates: number;
  regions_updated?: number;
}

export interface SimulationSemanticAdapterOutcome {
  map_id: string;
  sources_scanned: number;
  observations_created: number;
  claims_created: number;
  evidence_links_created: number;
  skipped_existing: number;
}

export interface DialogueChoiceEffectOutcome {
  type: "set_switch" | "set_quest";
  switchId?: string;
  value?: boolean;
  questId?: string;
  state?: string;
}

export interface DialogueChoiceOutcome {
  dialogueId: string;
  nodeId: string;
  optionIndex: number;
  optionText: string;
  nextNodeId?: string;
  endsDialogue: boolean;
  triggerCutsceneId?: string;
  effects: DialogueChoiceEffectOutcome[];
}

export interface ShopTransactionOutcome {
  shopId?: string;
  itemId: string;
  itemName?: string;
  count: number;
  unitPrice: number;
  totalPrice: number;
  money: number;
  stockIndex?: number;
  mode: "buy" | "sell";
}

export interface InteractiveGridWorld extends GridWorld {
  getGroundItemAt?(x: number, y: number): GroundItemRef | undefined;
  takeGroundItem?(item: GroundItemRef): void;
  canDropItemAt?(itemId: string, count: number, cell: [number, number]): ValidationResult;
  dropItemAt?(itemId: string, count: number, cell: [number, number]): DroppedItemRef;
  getClosedDoorAt?(x: number, y: number): DoorRef | undefined;
  getOpenDoorAt?(x: number, y: number): DoorRef | undefined;
  openDoor?(door: DoorRef): void;
  closeDoor?(door: DoorRef): void;
  getPushableObjectAt?(x: number, y: number): PushableObjectRef | undefined;
  getPushObjectEnergyCost?(ref: PushableObjectRef): number;
  getManipulationEnergyCost?(ref: PushableObjectRef, action: "push" | "pull" | "drag" | "carry"): number;
  canPushObjectTo?(ref: PushableObjectRef, dx: number, dy: number, actorIds?: string[]): ValidationResult;
  pushObject?(ref: PushableObjectRef, dx: number, dy: number): { from: [number, number]; to: [number, number] };
  pullObject?(ref: PushableObjectRef, dx: number, dy: number): { from: [number, number]; to: [number, number] };
  dragObject?(ref: PushableObjectRef, dx: number, dy: number): { from: [number, number]; to: [number, number] };
  canCarryObject?(ref: PushableObjectRef, actorIds?: string[]): ValidationResult;
  carryObject?(ref: PushableObjectRef, actorIds: string[]): { from: [number, number]; carriedBy: string[] };
  getBreakableObjectAt?(x: number, y: number): BreakableObjectRef | undefined;
  breakObject?(ref: BreakableObjectRef): { cell: [number, number] };
  getSurfaceLayersAt?(x: number, y: number): SurfaceLayerRef | undefined;
  cleanSurface?(ref: SurfaceLayerRef, actorId?: string): { cell: [number, number]; removed: number; kinds: string[] };
  decaySurfaceLayers?(ticks: number): { removed: number; aged: number };
  getIgnitableCellAt?(x: number, y: number): EnvironmentCellRef | undefined;
  igniteCell?(ref: EnvironmentCellRef, actorId?: string): { cell: [number, number]; intensity: number };
  getFireAt?(x: number, y: number): EnvironmentCellRef | undefined;
  extinguishFire?(ref: EnvironmentCellRef, actorId?: string): { cell: [number, number]; removed: number };
  advanceEnvironmentFields?(ticks: number): { aged: number; removed: number; spread: number; emitted: number; damaged: number };
  emitSoundAt?(
    cell: [number, number],
    loudness: number,
    tag: string,
    actorId?: string,
    materialTag?: string,
  ): { origin: [number, number]; cells: number; loudness: number; tag: string };
  advanceNpcTasks?(ticks: number): NpcTaskAdvanceOutcome;
  canStartSimulationProcess?(options: SimulationProcessStartOptions): ValidationResult;
  startSimulationProcess?(options: SimulationProcessStartOptions): SimulationProcessOutcome;
  advanceSimulationProcesses?(ticks: number): SimulationProcessOutcome;
  interruptSimulationProcess?(processId: string, reason?: string): SimulationProcessOutcome;
  advanceSimulationRegions?(ticks: number): SimulationProcessOutcome;
  adaptSimulationSemantics?(mapId?: string, actorId?: string): SimulationSemanticAdapterOutcome;
  getMapTransition?(
    targetMapId: string,
    targetSpawnId?: string,
    facingOverride?: [number, number],
    exitId?: string,
  ): MapTransitionRef | undefined;
  changeMap?(transition: MapTransitionRef): void;
  getTrigger?(triggerId: string): TriggerRef | undefined;
  hasTriggerFired?(trigger: TriggerRef): boolean;
  fireTrigger?(trigger: TriggerRef): void;
  getContainer?(containerId: string): ContainerRef | undefined;
  hasItem?(itemId: string, count?: number): boolean;
  unlockContainer?(container: ContainerRef): void;
  openContainer?(container: ContainerRef): void;
  getContainerItem?(containerId: string, entryIndex: number): ContainerItemRef | undefined;
  getContainerItems?(containerId: string): ContainerItemRef[];
  searchContainer?(container: ContainerRef): void;
  takeContainerItem?(container: ContainerRef, entryIndex: number): void;
  takeAllFromContainer?(container: ContainerRef): void;
  stowItemInContainer?(container: ContainerRef, itemId: string, count?: number): void;
  // ── State-mutation capabilities (story / cutscene / dialogue effects) ──
  giveItem?(itemId: string, count: number): void;
  removeItem?(itemId: string, count: number): void;
  setFlag?(switchId: string, value: boolean): void;
  setQuestState?(questId: string, state: string): void;
  addMoney?(amount: number): void;
  adjustFactionRep?(factionId: string, delta: number): void;
  markDocumentRead?(documentId: string): void;
  learnSkill?(skillId: string): void;
  completeQuestObjective?(objectiveId: string, targetId?: string, objectiveType?: string): void;
  setPlayerPosition?(cell: [number, number], facing?: [number, number]): void;
  teleportPlayer?(mapId: string | undefined, cell: [number, number], facing?: [number, number]): void;
  setEntityPosition?(entityId: string, cell: [number, number], facing?: [number, number]): void;
  setPlayerSprite?(spriteId?: string): void;
  healPlayer?(amount: number): void;
  restoreParty?(): void;
  addPartyMember?(entityId: string): void;
  removePartyMember?(entityId: string): void;
  advanceClock?(minutes: number): void;
  modifyPlayerStats?(stats: Record<string, number>): void;
  setEntityHidden?(entityId: string, hidden: boolean): void;
  recordBarkPlayed?(barkId: string, clockMinutes?: number): void;
  endGame?(endingId?: string, title?: string): void;
  canChooseDialogueOption?(dialogueId: string, nodeId: string, optionIndex: number): ValidationResult;
  chooseDialogueOption?(dialogueId: string, nodeId: string, optionIndex: number): DialogueChoiceOutcome;
  canBuyShopItem?(shopId: string, stockIndex: number): ValidationResult;
  buyShopItem?(shopId: string, stockIndex: number): ShopTransactionOutcome;
  canSellInventoryItem?(shopId: string | undefined, itemId: string, count: number): ValidationResult;
  sellInventoryItem?(shopId: string | undefined, itemId: string, count: number): ShopTransactionOutcome;
  canMeleeAttack?(actorId: string, targetId: string): ValidationResult;
  resolveMeleeAttack?(actorId: string, targetId: string): CombatAttackOutcome;
  resolveOpportunityAttacks?(actorId: string, fromCell: [number, number], toCell: [number, number]): CombatAttackOutcome[];
  canCastSkill?(actorId: string, skillId: string, targetCells: [number, number][]): ValidationResult;
  resolveSkillCast?(actorId: string, skillId: string, targetCells: [number, number][]): SkillCastOutcome;
  updateCombatSession?(options: CombatSessionUpdateOptions): CombatSessionUpdateOutcome;
  advanceCombatTurn?(): CombatTurnAdvanceOutcome;
  canResolveEnemyTurn?(actorId?: string): ValidationResult;
  resolveEnemyTurn?(
    actorId?: string,
    advanceTurn?: boolean,
    movementSteps?: number,
    allowAttack?: boolean,
  ): EnemyTurnOutcome;
}

const readVec2Param = (value: unknown): [number, number] | undefined => {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return [x, y];
};

const readPositiveIntegerParam = (value: unknown, fallback?: number): number | undefined => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return undefined;
  const count = Math.floor(parsed);
  return count > 0 ? count : undefined;
};

const readNonNegativeIntegerParam = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const index = Math.floor(parsed);
  return index >= 0 ? index : undefined;
};

const readIntegerParam = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
};

const readNumberRecordParam = (value: unknown): Record<string, number> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;
    result[key] = parsed;
  }
  return Object.keys(result).length ? result : undefined;
};

const readTargetCellsParam = (value: unknown): [number, number][] => {
  if (!Array.isArray(value)) return [];
  const cells: [number, number][] = [];
  for (const entry of value) {
    const cell = readVec2Param(entry);
    if (cell) cells.push(cell);
  }
  return cells;
};

const readItemStackParams = (value: unknown): { item_id: string; count: number }[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined;
      const itemId =
        typeof (entry as { item_id?: unknown }).item_id === "string"
          ? (entry as { item_id: string }).item_id
          : typeof (entry as { itemId?: unknown }).itemId === "string"
            ? (entry as { itemId: string }).itemId
            : "";
      const count = readPositiveIntegerParam((entry as { count?: unknown }).count, 1);
      return itemId && count ? { item_id: itemId, count } : undefined;
    })
    .filter((entry): entry is { item_id: string; count: number } => Boolean(entry));
};

const readActorIdsParam = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
};

const readPartyFollowersParam = (value: unknown): CombatPartyFollowerRef[] => {
  if (!Array.isArray(value)) return [];
  const followers: CombatPartyFollowerRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const entityId = typeof (entry as { entityId?: unknown }).entityId === "string"
      ? (entry as { entityId: string }).entityId
      : typeof (entry as { entity_id?: unknown }).entity_id === "string"
        ? (entry as { entity_id: string }).entity_id
        : "";
    const cell = readVec2Param((entry as { cell?: unknown }).cell);
    if (entityId && cell) followers.push({ entityId, cell });
  }
  return followers;
};

export const TakeItemHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getGroundItemAt || !w.takeGroundItem) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (!w.getGroundItemAt(x, y)) return { ok: false, reason: "no item" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const item = w.getGroundItemAt!(x, y)!;
    return [
      {
        type: "take_item",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.takeGroundItem!(item);
          tw.events.emit("item_acquired", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { item_id: item.itemId, count: item.count, cell: [x, y] },
          });
        },
      },
    ];
  },
};

export const DropItemHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.hasItem || !w.canDropItemAt || !w.dropItemAt) return { ok: false, reason: "unsupported" };
    const itemId = typeof cmd.params?.itemId === "string" ? cmd.params.itemId : "";
    const count = readPositiveIntegerParam(cmd.params?.count, 1);
    const cell = readVec2Param(cmd.params?.cell);
    if (!itemId) return { ok: false, reason: "no item" };
    if (!count) return { ok: false, reason: "bad count" };
    if (!cell) return { ok: false, reason: "no cell" };
    if (!w.hasItem(itemId, count)) return { ok: false, reason: "missing item" };
    return w.canDropItemAt(itemId, count, cell);
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const itemId = cmd.params!.itemId as string;
    const count = readPositiveIntegerParam(cmd.params?.count, 1)!;
    const cell = readVec2Param(cmd.params?.cell)!;
    return [
      {
        type: "drop_item",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const dropped = tw.dropItemAt!(itemId, count, cell);
          tw.events.emit("item_dropped", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { item_id: itemId, count, dropped_id: dropped.id, cell: dropped.cell },
          });
        },
      },
    ];
  },
};

export const OpenDoorHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getClosedDoorAt || !w.openDoor) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    const door = w.getClosedDoorAt(x, y);
    if (!door) return { ok: false, reason: "no closed door" };
    if (door.locked) {
      if (!door.keyItemId) return { ok: false, reason: "locked: no key configured" };
      if (!w.hasItem || !w.hasItem(door.keyItemId, 1)) return { ok: false, reason: "missing key" };
    }
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const door = w.getClosedDoorAt!(x, y)!;
    return [
      {
        type: "open_door",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.openDoor!(door);
          if (door.locked) {
            tw.events.emit("door_unlocked", tw.tick, {
              actorIds: cmd.actorId ? [cmd.actorId] : undefined,
              payload: {
                door: door.key,
                key_item_id: door.keyItemId,
                consume_key: door.consumeKey,
                cell: [x, y],
              },
            });
          }
          tw.events.emit("door_opened", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { door: door.key, cell: [x, y] },
          });
        },
      },
    ];
  },
};

export const CloseDoorHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getOpenDoorAt || !w.closeDoor) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (!w.getOpenDoorAt(x, y)) return { ok: false, reason: "no open door" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const door = w.getOpenDoorAt!(x, y)!;
    return [
      {
        type: "close_door",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.closeDoor!(door);
          tw.events.emit("door_closed", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { door: door.key, cell: [x, y] },
          });
        },
      },
    ];
  },
};

const helperActorIds = (cmd: Command): string[] => {
  const helpers = Array.isArray(cmd.params?.helperActorIds)
    ? cmd.params.helperActorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return [...new Set([cmd.actorId, ...helpers].filter((id): id is string => Boolean(id)))];
};

const manipulationPayload = (
  ref: PushableObjectRef,
  moved: { from: [number, number]; to?: [number, number]; cell?: [number, number]; carriedBy?: string[] },
  action: "push" | "pull" | "drag" | "carry",
) => ({
  object_id: ref.objectId,
  placement_key: ref.key,
  from: moved.from,
  to: moved.to,
  cell: moved.to || moved.cell || moved.from,
  carried_by: moved.carriedBy,
  manipulation: action,
  mass_kg: ref.massKg,
  bulk: ref.bulk,
  awkwardness: ref.awkwardness,
  push_difficulty: ref.pushDifficulty,
  push_energy_cost: ref.pushEnergyCost,
  requires_cooperation: ref.requiresCooperation,
});

const createObjectMoveHandler = (
  action: "push" | "pull" | "drag",
  eventType: "object_pushed" | "object_pulled" | "object_dragged",
  method: "pushObject" | "pullObject" | "dragObject",
  missingReason: string,
): CommandHandler => ({
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getPushableObjectAt || !w[method] || !w.canPushObjectTo) {
      return { ok: false, reason: "unsupported" };
    }
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    const dx = Number(cmd.params?.dx ?? 0);
    const dy = Number(cmd.params?.dy ?? 0);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (dx === 0 && dy === 0) return { ok: false, reason: "no direction" };
    const ref = w.getPushableObjectAt(x, y);
    if (!ref) return { ok: false, reason: missingReason };
    return w.canPushObjectTo(ref, dx, dy, helperActorIds(cmd));
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const dx = Number(cmd.params?.dx ?? 0);
    const dy = Number(cmd.params?.dy ?? 0);
    const ref = w.getPushableObjectAt!(x, y)!;
    return [
      {
        type: `${action}_object`,
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const moved = tw[method]!(ref, dx, dy);
          const actors = helperActorIds(cmd);
          tw.events.emit(eventType, tw.tick, {
            actorIds: actors.length ? actors : undefined,
            payload: manipulationPayload(ref, moved, action),
          });
        },
      },
    ];
  },
});

// K3/S2 manipulation: move movable objects through different physical affordances.
export const PushObjectHandler = createObjectMoveHandler("push", "object_pushed", "pushObject", "not pushable");
export const PullObjectHandler = createObjectMoveHandler("pull", "object_pulled", "pullObject", "not pullable");
export const DragObjectHandler = createObjectMoveHandler("drag", "object_dragged", "dragObject", "not draggable");

export const CarryObjectHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getPushableObjectAt || !w.canCarryObject || !w.carryObject) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    const ref = w.getPushableObjectAt(x, y);
    if (!ref) return { ok: false, reason: "not carriable" };
    return w.canCarryObject(ref, helperActorIds(cmd));
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const ref = w.getPushableObjectAt!(x, y)!;
    return [
      {
        type: "carry_object",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const actors = helperActorIds(cmd);
          const carried = tw.carryObject!(ref, actors);
          tw.events.emit("object_carried", tw.tick, {
            actorIds: carried.carriedBy,
            payload: manipulationPayload(ref, carried, "carry"),
          });
        },
      },
    ];
  },
};

export const BreakObjectHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getBreakableObjectAt || !w.breakObject) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (!w.getBreakableObjectAt(x, y)) return { ok: false, reason: "not breakable" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const ref = w.getBreakableObjectAt!(x, y)!;
    return [
      {
        type: "break_object",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const broken = tw.breakObject!(ref);
          tw.events.emit("object_broken", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              object_id: ref.objectId,
              placement_key: ref.key,
              cell: broken.cell,
            },
          });
        },
      },
    ];
  },
};

export const CleanSurfaceHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getSurfaceLayersAt || !w.cleanSurface) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (!w.getSurfaceLayersAt(x, y)) return { ok: false, reason: "no surface" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const ref = w.getSurfaceLayersAt!(x, y)!;
    return [
      {
        type: "clean_surface",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const cleaned = tw.cleanSurface!(ref, cmd.actorId);
          tw.events.emit("surface_cleaned", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: cleaned as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const DecaySurfacesHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.decaySurfaceLayers) return { ok: false, reason: "unsupported" };
    const ticks = Number(cmd.params?.ticks ?? 0);
    if (!Number.isFinite(ticks) || ticks <= 0) return { ok: false, reason: "bad ticks" };
    return { ok: true };
  },
  resolve(cmd) {
    const ticks = Math.max(1, Math.floor(Number(cmd.params?.ticks ?? 1)));
    return [
      {
        type: "decay_surfaces",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const decayed = tw.decaySurfaceLayers!(ticks);
          tw.events.emit("surfaces_decayed", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { ticks, ...decayed },
          });
        },
      },
    ];
  },
};

export const IgniteFireHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getIgnitableCellAt || !w.igniteCell) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (!w.getIgnitableCellAt(x, y)) return { ok: false, reason: "not ignitable" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const ref = w.getIgnitableCellAt!(x, y)!;
    return [
      {
        type: "ignite_fire",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const ignited = tw.igniteCell!(ref, cmd.actorId);
          tw.events.emit("fire_ignited", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: ignited as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const ExtinguishFireHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getFireAt || !w.extinguishFire) return { ok: false, reason: "unsupported" };
    const x = Number(cmd.params?.x ?? NaN);
    const y = Number(cmd.params?.y ?? NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, reason: "no cell" };
    if (!w.getFireAt(x, y)) return { ok: false, reason: "no fire" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const x = Number(cmd.params?.x);
    const y = Number(cmd.params?.y);
    const ref = w.getFireAt!(x, y)!;
    return [
      {
        type: "extinguish_fire",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const extinguished = tw.extinguishFire!(ref, cmd.actorId);
          tw.events.emit("fire_extinguished", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: extinguished as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const AdvanceEnvironmentHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.advanceEnvironmentFields) return { ok: false, reason: "unsupported" };
    const ticks = Number(cmd.params?.ticks ?? 0);
    if (!Number.isFinite(ticks) || ticks <= 0) return { ok: false, reason: "bad ticks" };
    return { ok: true };
  },
  resolve(cmd) {
    const ticks = Math.max(1, Math.floor(Number(cmd.params?.ticks ?? 1)));
    return [
      {
        type: "advance_environment",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const advanced = tw.advanceEnvironmentFields!(ticks);
          tw.events.emit("environment_advanced", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { ticks, ...advanced },
          });
        },
      },
    ];
  },
};

export const EmitSoundHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.emitSoundAt) return { ok: false, reason: "unsupported" };
    const cell = readVec2Param(cmd.params?.cell);
    const loudness = Number(cmd.params?.loudness ?? 0);
    if (!cell) return { ok: false, reason: "no cell" };
    if (!Number.isFinite(loudness) || loudness <= 0) return { ok: false, reason: "bad loudness" };
    return { ok: true };
  },
  resolve(cmd) {
    const cell = readVec2Param(cmd.params?.cell)!;
    const loudness = Math.max(1, Number(cmd.params?.loudness ?? 1));
    const tag = typeof cmd.params?.tag === "string" ? cmd.params.tag : "sound";
    const materialTag = typeof cmd.params?.materialTag === "string" ? cmd.params.materialTag : undefined;
    return [
      {
        type: "emit_sound",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const propagated = tw.emitSoundAt!(cell, loudness, tag, cmd.actorId, materialTag);
          tw.events.emit("sound_propagated", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: propagated as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const AdvanceNpcTasksHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.advanceNpcTasks) return { ok: false, reason: "unsupported" };
    const ticks = Number(cmd.params?.ticks ?? 0);
    if (!Number.isFinite(ticks) || ticks <= 0) return { ok: false, reason: "bad ticks" };
    return { ok: true };
  },
  resolve(cmd) {
    const ticks = Math.max(1, Math.floor(Number(cmd.params?.ticks ?? 1)));
    return [
      {
        type: "advance_npc_tasks",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const advanced = tw.advanceNpcTasks!(ticks);
          tw.events.emit("npc_tasks_advanced", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { ticks, ...advanced },
          });
        },
      },
    ];
  },
};

export const StartProcessHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canStartSimulationProcess || !w.startSimulationProcess) return { ok: false, reason: "unsupported" };
    const processId = typeof cmd.params?.processId === "string" ? cmd.params.processId : undefined;
    const processType = typeof cmd.params?.processType === "string" ? cmd.params.processType : "";
    const cell = readVec2Param(cmd.params?.cell);
    const requiredTicks = readPositiveIntegerParam(cmd.params?.requiredTicks, 1);
    if (!processId && !processType) return { ok: false, reason: "no process" };
    if (!cell) return { ok: false, reason: "no cell" };
    if (!processId && !requiredTicks) return { ok: false, reason: "bad ticks" };
    return w.canStartSimulationProcess({
      processId,
      processType,
      cell,
      workstationId: typeof cmd.params?.workstationId === "string" ? cmd.params.workstationId : undefined,
      shopId: typeof cmd.params?.shopId === "string" ? cmd.params.shopId : undefined,
      actorIds: readActorIdsParam(cmd.params?.actorIds),
      requiredTicks: requiredTicks || 1,
      inputItems: readItemStackParams(cmd.params?.inputItems),
      outputItems: readItemStackParams(cmd.params?.outputItems),
      wasteItems: readItemStackParams(cmd.params?.wasteItems),
      emits: cmd.params?.emits && typeof cmd.params.emits === "object"
        ? cmd.params.emits as SimulationProcessStartOptions["emits"]
        : undefined,
    });
  },
  resolve(cmd) {
    const options: SimulationProcessStartOptions = {
      processId: typeof cmd.params?.processId === "string" ? cmd.params.processId : undefined,
      processType: typeof cmd.params?.processType === "string" ? cmd.params.processType : "",
      cell: readVec2Param(cmd.params!.cell)!,
      workstationId: typeof cmd.params?.workstationId === "string" ? cmd.params.workstationId : undefined,
      shopId: typeof cmd.params?.shopId === "string" ? cmd.params.shopId : undefined,
      actorIds: readActorIdsParam(cmd.params?.actorIds),
      requiredTicks: readPositiveIntegerParam(cmd.params?.requiredTicks, 1) || 1,
      inputItems: readItemStackParams(cmd.params?.inputItems),
      outputItems: readItemStackParams(cmd.params?.outputItems),
      wasteItems: readItemStackParams(cmd.params?.wasteItems),
      emits: cmd.params?.emits && typeof cmd.params.emits === "object"
        ? cmd.params.emits as SimulationProcessStartOptions["emits"]
        : undefined,
    };
    return [
      {
        type: "start_process",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const started = tw.startSimulationProcess!(options);
          tw.events.emit("simulation_process_started", tw.tick, {
            actorIds: options.actorIds?.length ? options.actorIds : cmd.actorId ? [cmd.actorId] : undefined,
            payload: { process_type: options.processType, cell: options.cell, ...started },
          });
        },
      },
    ];
  },
};

export const InterruptProcessHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.interruptSimulationProcess) return { ok: false, reason: "unsupported" };
    const processId = typeof cmd.params?.processId === "string" ? cmd.params.processId : "";
    if (!processId) return { ok: false, reason: "no process" };
    return { ok: true };
  },
  resolve(cmd) {
    const processId = cmd.params!.processId as string;
    const reason = typeof cmd.params?.reason === "string" ? cmd.params.reason : undefined;
    return [
      {
        type: "interrupt_process",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const interrupted = tw.interruptSimulationProcess!(processId, reason);
          tw.events.emit("simulation_process_interrupted", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { process_id: processId, reason, ...interrupted },
          });
        },
      },
    ];
  },
};

export const AdvanceProcessesHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.advanceSimulationProcesses) return { ok: false, reason: "unsupported" };
    const ticks = Number(cmd.params?.ticks ?? 0);
    if (!Number.isFinite(ticks) || ticks <= 0) return { ok: false, reason: "bad ticks" };
    return { ok: true };
  },
  resolve(cmd) {
    const ticks = Math.max(1, Math.floor(Number(cmd.params?.ticks ?? 1)));
    return [
      {
        type: "advance_processes",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const advanced = tw.advanceSimulationProcesses!(ticks);
          tw.events.emit("simulation_processes_advanced", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { ticks, ...advanced },
          });
        },
      },
    ];
  },
};

export const AdvanceSimulationRegionsHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.advanceSimulationRegions) return { ok: false, reason: "unsupported" };
    const ticks = Number(cmd.params?.ticks ?? 0);
    if (!Number.isFinite(ticks) || ticks <= 0) return { ok: false, reason: "bad ticks" };
    return { ok: true };
  },
  resolve(cmd) {
    const ticks = Math.max(1, Math.floor(Number(cmd.params?.ticks ?? 1)));
    return [
      {
        type: "advance_simulation_regions",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const advanced = tw.advanceSimulationRegions!(ticks);
          tw.events.emit("simulation_regions_advanced", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { ticks, ...advanced },
          });
        },
      },
    ];
  },
};

export const AdaptSimulationSemanticsHandler: CommandHandler = {
  validate(_cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.adaptSimulationSemantics) return { ok: false, reason: "unsupported" };
    return { ok: true };
  },
  resolve(cmd) {
    const mapId = typeof cmd.params?.mapId === "string" ? cmd.params.mapId : undefined;
    return [
      {
        type: "adapt_simulation_semantics",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const adapted = tw.adaptSimulationSemantics!(mapId, cmd.actorId);
          tw.events.emit("simulation_semantics_adapted", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: { ...adapted },
          });
        },
      },
    ];
  },
};

export const ChangeMapHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!cmd.actorId) return { ok: false, reason: "no actor" };
    if (!world.getEntity(cmd.actorId)) return { ok: false, reason: "actor not found" };
    if (!w.getMapTransition || !w.changeMap) return { ok: false, reason: "unsupported" };
    const targetMapId = typeof cmd.params?.targetMapId === "string" ? cmd.params.targetMapId : "";
    if (!targetMapId) return { ok: false, reason: "no target map" };
    const targetSpawnId = typeof cmd.params?.targetSpawnId === "string" ? cmd.params.targetSpawnId : undefined;
    const exitId = typeof cmd.params?.exitId === "string" ? cmd.params.exitId : undefined;
    const facing = readVec2Param(cmd.params?.facing);
    if (!w.getMapTransition(targetMapId, targetSpawnId, facing, exitId)) {
      return { ok: false, reason: "invalid map transition" };
    }
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const targetMapId = cmd.params!.targetMapId as string;
    const targetSpawnId = typeof cmd.params?.targetSpawnId === "string" ? cmd.params.targetSpawnId : undefined;
    const exitId = typeof cmd.params?.exitId === "string" ? cmd.params.exitId : undefined;
    const facing = readVec2Param(cmd.params?.facing);
    const transition = w.getMapTransition!(targetMapId, targetSpawnId, facing, exitId)!;
    return [
      {
        type: "change_map",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.changeMap!(transition);
          tw.events.emit("map_changed", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              from_map_id: transition.fromMapId,
              to_map_id: transition.toMapId,
              target_spawn_id: transition.targetSpawnId,
              exit_id: transition.exitId,
              cell: transition.cell,
              facing: transition.facing,
            },
          });
        },
      },
    ];
  },
};

export const FireTriggerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getTrigger || !w.fireTrigger) return { ok: false, reason: "unsupported" };
    const triggerId = typeof cmd.params?.triggerId === "string" ? cmd.params.triggerId : "";
    if (!triggerId) return { ok: false, reason: "no trigger" };
    const trigger = w.getTrigger(triggerId);
    if (!trigger) return { ok: false, reason: "no trigger" };
    if (trigger.once && w.hasTriggerFired?.(trigger)) {
      return { ok: false, reason: "trigger already fired" };
    }
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const trigger = w.getTrigger!(cmd.params!.triggerId as string)!;
    return [
      {
        type: "fire_trigger",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.fireTrigger!(trigger);
          tw.events.emit("trigger_fired", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              trigger_id: trigger.id,
              trigger_type: trigger.type,
              cutscene_id: trigger.cutsceneId,
              once: trigger.once,
              cell: trigger.cell,
            },
          });
        },
      },
    ];
  },
};

export const UnlockContainerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getContainer || !w.hasItem || !w.unlockContainer) return { ok: false, reason: "unsupported" };
    const containerId = typeof cmd.params?.containerId === "string" ? cmd.params.containerId : "";
    if (!containerId) return { ok: false, reason: "no container" };
    const container = w.getContainer(containerId);
    if (!container) return { ok: false, reason: "no container" };
    if (!container.locked) return { ok: false, reason: "not locked" };
    if (!container.keyItemId || !w.hasItem(container.keyItemId, 1)) {
      return { ok: false, reason: "missing key" };
    }
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const container = w.getContainer!(cmd.params!.containerId as string)!;
    return [
      {
        type: "unlock_container",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.unlockContainer!(container);
          tw.events.emit("container_unlocked", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              container_id: container.id,
              key_item_id: container.keyItemId,
              consume_key: container.consumeKey,
              cell: container.cell,
            },
          });
        },
      },
    ];
  },
};

export const OpenContainerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getContainer || !w.openContainer) return { ok: false, reason: "unsupported" };
    const containerId = typeof cmd.params?.containerId === "string" ? cmd.params.containerId : "";
    if (!containerId) return { ok: false, reason: "no container" };
    const container = w.getContainer(containerId);
    if (!container) return { ok: false, reason: "no container" };
    if (container.locked) return { ok: false, reason: "locked" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const container = w.getContainer!(cmd.params!.containerId as string)!;
    return [
      {
        type: "open_container",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.openContainer!(container);
          tw.events.emit("container_opened", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              container_id: container.id,
              cell: container.cell,
            },
          });
        },
      },
    ];
  },
};

export const SearchContainerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getContainer || !w.searchContainer) return { ok: false, reason: "unsupported" };
    const containerId = typeof cmd.params?.containerId === "string" ? cmd.params.containerId : "";
    if (!containerId) return { ok: false, reason: "no container" };
    const container = w.getContainer(containerId);
    if (!container) return { ok: false, reason: "no container" };
    if (container.locked) return { ok: false, reason: "locked" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const container = w.getContainer!(cmd.params!.containerId as string)!;
    return [
      {
        type: "search_container",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.searchContainer!(container);
          tw.events.emit("container_searched", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              container_id: container.id,
              cell: container.cell,
              item_count: tw.getContainerItems?.(container.id).length ?? 0,
            },
          });
        },
      },
    ];
  },
};

export const TakeFromContainerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getContainer || !w.getContainerItem || !w.takeContainerItem) {
      return { ok: false, reason: "unsupported" };
    }
    const containerId = typeof cmd.params?.containerId === "string" ? cmd.params.containerId : "";
    if (!containerId) return { ok: false, reason: "no container" };
    const entryIndex = readNonNegativeIntegerParam(cmd.params?.entryIndex);
    if (entryIndex === undefined) return { ok: false, reason: "no item" };
    const container = w.getContainer(containerId);
    if (!container) return { ok: false, reason: "no container" };
    if (container.locked) return { ok: false, reason: "locked" };
    if (!container.opened) return { ok: false, reason: "not open" };
    if (!w.getContainerItem(container.id, entryIndex)) return { ok: false, reason: "no item" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const container = w.getContainer!(cmd.params!.containerId as string)!;
    const entryIndex = Number(cmd.params!.entryIndex);
    const item = w.getContainerItem!(container.id, entryIndex)!;
    return [
      {
        type: "take_from_container",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.takeContainerItem!(container, entryIndex);
          tw.events.emit("container_item_taken", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              container_id: container.id,
              item_id: item.itemId,
              count: item.count,
              entry_index: entryIndex,
            },
          });
        },
      },
    ];
  },
};

export const TakeAllFromContainerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getContainer || !w.getContainerItems || !w.takeAllFromContainer) {
      return { ok: false, reason: "unsupported" };
    }
    const containerId = typeof cmd.params?.containerId === "string" ? cmd.params.containerId : "";
    if (!containerId) return { ok: false, reason: "no container" };
    const container = w.getContainer(containerId);
    if (!container) return { ok: false, reason: "no container" };
    if (container.locked) return { ok: false, reason: "locked" };
    if (!container.opened) return { ok: false, reason: "not open" };
    if (w.getContainerItems(container.id).length === 0) return { ok: false, reason: "empty" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const container = w.getContainer!(cmd.params!.containerId as string)!;
    const items = w.getContainerItems!(container.id).map((item) => ({
      item_id: item.itemId,
      count: item.count,
      entry_index: item.entryIndex,
    }));
    return [
      {
        type: "take_all_from_container",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.takeAllFromContainer!(container);
          tw.events.emit("container_items_taken", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              container_id: container.id,
              items,
            },
          });
        },
      },
    ];
  },
};

export const StowInContainerHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.getContainer || !w.hasItem || !w.stowItemInContainer) {
      return { ok: false, reason: "unsupported" };
    }
    const containerId = typeof cmd.params?.containerId === "string" ? cmd.params.containerId : "";
    if (!containerId) return { ok: false, reason: "no container" };
    const itemId = typeof cmd.params?.itemId === "string" ? cmd.params.itemId : "";
    if (!itemId) return { ok: false, reason: "no item" };
    const count = readPositiveIntegerParam(cmd.params?.count, 1);
    if (count === undefined) return { ok: false, reason: "invalid count" };
    const container = w.getContainer(containerId);
    if (!container) return { ok: false, reason: "no container" };
    if (container.locked) return { ok: false, reason: "locked" };
    if (!container.opened) return { ok: false, reason: "not open" };
    if (!w.hasItem(itemId, count)) return { ok: false, reason: "missing item" };
    return { ok: true };
  },
  resolve(cmd, world) {
    const w = world as InteractiveGridWorld;
    const container = w.getContainer!(cmd.params!.containerId as string)!;
    const itemId = cmd.params!.itemId as string;
    const count = readPositiveIntegerParam(cmd.params!.count, 1)!;
    return [
      {
        type: "stow_in_container",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          tw.stowItemInContainer!(container, itemId, count);
          tw.events.emit("container_item_stowed", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: {
              container_id: container.id,
              item_id: itemId,
              count,
            },
          });
        },
      },
    ];
  },
};

// ── State-mutation commands (story / cutscene / dialogue effects) ─────────────
// These verbs carry no grid position: each is a deterministic save mutation that
// emits a structured event so quests, the inspector, and later layers can react
// (the base spec's "ensure all state changes produce events"). A small factory
// keeps them DRY — a spec declares the capability it needs, how to parse params,
// the mutation to run, and the event to emit.
interface StateCommandSpec {
  effectType: string;
  eventType: string;
  capability: keyof InteractiveGridWorld;
  prepare(cmd: Command): {
    ok: boolean;
    reason?: string;
    run?: (world: InteractiveGridWorld) => void;
    payload?: Record<string, unknown>;
  };
}

const makeStateCommand = (spec: StateCommandSpec): CommandHandler => ({
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (typeof w[spec.capability] !== "function") return { ok: false, reason: "unsupported" };
    const prepared = spec.prepare(cmd);
    return prepared.ok ? { ok: true } : { ok: false, reason: prepared.reason };
  },
  resolve(cmd) {
    const prepared = spec.prepare(cmd);
    return [
      {
        type: spec.effectType,
        apply(target) {
          const tw = target as InteractiveGridWorld;
          prepared.run?.(tw);
          tw.events.emit(spec.eventType, tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: prepared.payload,
          });
        },
      },
    ];
  },
});

export const SetSwitchHandler = makeStateCommand({
  effectType: "set_switch",
  eventType: "switch_set",
  capability: "setFlag",
  prepare(cmd) {
    const switchId = typeof cmd.params?.switchId === "string" ? cmd.params.switchId : "";
    if (!switchId) return { ok: false, reason: "no switch" };
    const value = cmd.params?.value === undefined ? true : Boolean(cmd.params.value);
    return { ok: true, run: (w) => w.setFlag!(switchId, value), payload: { switch_id: switchId, value } };
  },
});

export const SetQuestHandler = makeStateCommand({
  effectType: "set_quest",
  eventType: "quest_updated",
  capability: "setQuestState",
  prepare(cmd) {
    const questId = typeof cmd.params?.questId === "string" ? cmd.params.questId : "";
    const state = typeof cmd.params?.state === "string" ? cmd.params.state : "";
    if (!questId) return { ok: false, reason: "no quest" };
    if (!state) return { ok: false, reason: "no state" };
    return { ok: true, run: (w) => w.setQuestState!(questId, state), payload: { quest_id: questId, state } };
  },
});

export const GiveItemHandler = makeStateCommand({
  effectType: "give_item",
  eventType: "item_granted",
  capability: "giveItem",
  prepare(cmd) {
    const itemId = typeof cmd.params?.itemId === "string" ? cmd.params.itemId : "";
    const count = readPositiveIntegerParam(cmd.params?.count, 1);
    if (!itemId) return { ok: false, reason: "no item" };
    if (!count) return { ok: false, reason: "bad count" };
    return { ok: true, run: (w) => w.giveItem!(itemId, count), payload: { item_id: itemId, count } };
  },
});

export const RemoveItemHandler = makeStateCommand({
  effectType: "remove_item",
  eventType: "item_removed",
  capability: "removeItem",
  prepare(cmd) {
    const itemId = typeof cmd.params?.itemId === "string" ? cmd.params.itemId : "";
    const count = readPositiveIntegerParam(cmd.params?.count, 1);
    if (!itemId) return { ok: false, reason: "no item" };
    if (!count) return { ok: false, reason: "bad count" };
    return { ok: true, run: (w) => w.removeItem!(itemId, count), payload: { item_id: itemId, count } };
  },
});

export const GiveCurrencyHandler = makeStateCommand({
  effectType: "give_currency",
  eventType: "currency_changed",
  capability: "addMoney",
  prepare(cmd) {
    const amount = readPositiveIntegerParam(cmd.params?.amount, 1);
    if (!amount) return { ok: false, reason: "bad amount" };
    return { ok: true, run: (w) => w.addMoney!(amount), payload: { amount } };
  },
});

export const RemoveCurrencyHandler = makeStateCommand({
  effectType: "remove_currency",
  eventType: "currency_changed",
  capability: "addMoney",
  prepare(cmd) {
    const amount = readPositiveIntegerParam(cmd.params?.amount, 1);
    if (!amount) return { ok: false, reason: "bad amount" };
    return { ok: true, run: (w) => w.addMoney!(-amount), payload: { amount: -amount } };
  },
});

export const AdjustFactionRepHandler = makeStateCommand({
  effectType: "adjust_faction_rep",
  eventType: "faction_rep_changed",
  capability: "adjustFactionRep",
  prepare(cmd) {
    const factionId = typeof cmd.params?.factionId === "string" ? cmd.params.factionId : "";
    const amount = readIntegerParam(cmd.params?.amount);
    if (!factionId) return { ok: false, reason: "no faction" };
    if (amount === undefined) return { ok: false, reason: "bad amount" };
    return { ok: true, run: (w) => w.adjustFactionRep!(factionId, amount), payload: { faction_id: factionId, amount } };
  },
});

export const ReadDocumentHandler = makeStateCommand({
  effectType: "read_document",
  eventType: "document_read",
  capability: "markDocumentRead",
  prepare(cmd) {
    const documentId = typeof cmd.params?.documentId === "string" ? cmd.params.documentId : "";
    if (!documentId) return { ok: false, reason: "no document" };
    return { ok: true, run: (w) => w.markDocumentRead!(documentId), payload: { document_id: documentId } };
  },
});

export const LearnSkillHandler = makeStateCommand({
  effectType: "learn_skill",
  eventType: "skill_learned",
  capability: "learnSkill",
  prepare(cmd) {
    const skillId = typeof cmd.params?.skillId === "string" ? cmd.params.skillId : "";
    if (!skillId) return { ok: false, reason: "no skill" };
    return { ok: true, run: (w) => w.learnSkill!(skillId), payload: { skill_id: skillId } };
  },
});

export const CompleteQuestObjectiveHandler = makeStateCommand({
  effectType: "complete_quest_objective",
  eventType: "quest_objective_completed",
  capability: "completeQuestObjective",
  prepare(cmd) {
    const objectiveId = typeof cmd.params?.objectiveId === "string" ? cmd.params.objectiveId : "";
    const targetId = typeof cmd.params?.targetId === "string" ? cmd.params.targetId : undefined;
    const objectiveType = typeof cmd.params?.objectiveType === "string" ? cmd.params.objectiveType : undefined;
    if (!objectiveId) return { ok: false, reason: "no objective" };
    return {
      ok: true,
      run: (w) => w.completeQuestObjective!(objectiveId, targetId, objectiveType),
      payload: { objective_id: objectiveId, target_id: targetId, objective_type: objectiveType },
    };
  },
});

export const SetPlayerPositionHandler = makeStateCommand({
  effectType: "set_player_position",
  eventType: "player_position_set",
  capability: "setPlayerPosition",
  prepare(cmd) {
    const cell = readVec2Param(cmd.params?.cell);
    const facing = readVec2Param(cmd.params?.facing);
    if (!cell) return { ok: false, reason: "no cell" };
    return {
      ok: true,
      run: (w) => w.setPlayerPosition!(cell, facing),
      payload: { cell, facing },
    };
  },
});

export const TeleportPlayerHandler = makeStateCommand({
  effectType: "teleport_player",
  eventType: "player_teleported",
  capability: "teleportPlayer",
  prepare(cmd) {
    const cell = readVec2Param(cmd.params?.cell);
    const facing = readVec2Param(cmd.params?.facing);
    const mapId = typeof cmd.params?.mapId === "string" ? cmd.params.mapId : undefined;
    if (!cell) return { ok: false, reason: "no cell" };
    return {
      ok: true,
      run: (w) => w.teleportPlayer!(mapId, cell, facing),
      payload: { map_id: mapId, cell, facing },
    };
  },
});

export const SetEntityPositionHandler = makeStateCommand({
  effectType: "set_entity_position",
  eventType: "entity_position_set",
  capability: "setEntityPosition",
  prepare(cmd) {
    const entityId = typeof cmd.params?.entityId === "string" ? cmd.params.entityId : "";
    const cell = readVec2Param(cmd.params?.cell);
    const facing = readVec2Param(cmd.params?.facing);
    if (!entityId) return { ok: false, reason: "no entity" };
    if (!cell) return { ok: false, reason: "no cell" };
    return {
      ok: true,
      run: (w) => w.setEntityPosition!(entityId, cell, facing),
      payload: { entity_id: entityId, cell, facing },
    };
  },
});

export const SetPlayerSpriteHandler = makeStateCommand({
  effectType: "set_player_sprite",
  eventType: "player_sprite_set",
  capability: "setPlayerSprite",
  prepare(cmd) {
    const spriteId = typeof cmd.params?.spriteId === "string" ? cmd.params.spriteId : undefined;
    return {
      ok: true,
      run: (w) => w.setPlayerSprite!(spriteId),
      payload: { sprite_id: spriteId },
    };
  },
});

export const HealPlayerHandler = makeStateCommand({
  effectType: "heal_player",
  eventType: "player_healed",
  capability: "healPlayer",
  prepare(cmd) {
    const amount = readPositiveIntegerParam(cmd.params?.amount, 1);
    if (!amount) return { ok: false, reason: "bad amount" };
    return {
      ok: true,
      run: (w) => w.healPlayer!(amount),
      payload: { amount },
    };
  },
});

export const RestorePartyHandler = makeStateCommand({
  effectType: "restore_party",
  eventType: "party_restored",
  capability: "restoreParty",
  prepare() {
    return { ok: true, run: (w) => w.restoreParty!(), payload: {} };
  },
});

export const AddPartyMemberHandler = makeStateCommand({
  effectType: "add_party_member",
  eventType: "party_member_added",
  capability: "addPartyMember",
  prepare(cmd) {
    const entityId = typeof cmd.params?.entityId === "string" ? cmd.params.entityId : "";
    if (!entityId) return { ok: false, reason: "no entity" };
    return {
      ok: true,
      run: (w) => w.addPartyMember!(entityId),
      payload: { entity_id: entityId },
    };
  },
});

export const RemovePartyMemberHandler = makeStateCommand({
  effectType: "remove_party_member",
  eventType: "party_member_removed",
  capability: "removePartyMember",
  prepare(cmd) {
    const entityId = typeof cmd.params?.entityId === "string" ? cmd.params.entityId : "";
    if (!entityId) return { ok: false, reason: "no entity" };
    return {
      ok: true,
      run: (w) => w.removePartyMember!(entityId),
      payload: { entity_id: entityId },
    };
  },
});

export const AdvanceClockHandler = makeStateCommand({
  effectType: "advance_clock",
  eventType: "clock_advanced",
  capability: "advanceClock",
  prepare(cmd) {
    const minutes = readIntegerParam(cmd.params?.minutes);
    if (minutes === undefined) return { ok: false, reason: "bad minutes" };
    return {
      ok: true,
      run: (w) => w.advanceClock!(minutes),
      payload: { minutes },
    };
  },
});

export const ModifyPlayerStatsHandler = makeStateCommand({
  effectType: "modify_player_stats",
  eventType: "player_stats_modified",
  capability: "modifyPlayerStats",
  prepare(cmd) {
    const stats = readNumberRecordParam(cmd.params?.stats);
    if (!stats) return { ok: false, reason: "no stats" };
    return {
      ok: true,
      run: (w) => w.modifyPlayerStats!(stats),
      payload: { stats },
    };
  },
});

export const SetEntityHiddenHandler = makeStateCommand({
  effectType: "set_entity_hidden",
  eventType: "entity_hidden_set",
  capability: "setEntityHidden",
  prepare(cmd) {
    const entityId = typeof cmd.params?.entityId === "string" ? cmd.params.entityId : "";
    if (!entityId) return { ok: false, reason: "no entity" };
    const hidden = cmd.params?.hidden === undefined ? true : Boolean(cmd.params.hidden);
    return {
      ok: true,
      run: (w) => w.setEntityHidden!(entityId, hidden),
      payload: { entity_id: entityId, hidden },
    };
  },
});

export const RecordBarkHandler = makeStateCommand({
  effectType: "record_bark",
  eventType: "bark_recorded",
  capability: "recordBarkPlayed",
  prepare(cmd) {
    const barkId = typeof cmd.params?.barkId === "string" ? cmd.params.barkId : "";
    const clockMinutes = readIntegerParam(cmd.params?.clockMinutes);
    if (!barkId) return { ok: false, reason: "no bark" };
    return {
      ok: true,
      run: (w) => w.recordBarkPlayed!(barkId, clockMinutes),
      payload: { bark_id: barkId, clock_minutes: clockMinutes },
    };
  },
});

export const GameEndHandler = makeStateCommand({
  effectType: "game_end",
  eventType: "game_ended",
  capability: "endGame",
  prepare(cmd) {
    const endingId = typeof cmd.params?.endingId === "string" ? cmd.params.endingId : undefined;
    const title = typeof cmd.params?.title === "string" ? cmd.params.title : undefined;
    return {
      ok: true,
      run: (w) => w.endGame!(endingId, title),
      payload: { ending_id: endingId, title },
    };
  },
});

export const ChooseDialogueOptionHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canChooseDialogueOption || !w.chooseDialogueOption) return { ok: false, reason: "unsupported" };
    const dialogueId = typeof cmd.params?.dialogueId === "string" ? cmd.params.dialogueId : "";
    const nodeId = typeof cmd.params?.nodeId === "string" ? cmd.params.nodeId : "";
    const optionIndex = readNonNegativeIntegerParam(cmd.params?.optionIndex);
    if (!dialogueId) return { ok: false, reason: "no dialogue" };
    if (!nodeId) return { ok: false, reason: "no node" };
    if (optionIndex === undefined) return { ok: false, reason: "no option" };
    return w.canChooseDialogueOption(dialogueId, nodeId, optionIndex);
  },
  resolve(cmd) {
    const dialogueId = cmd.params!.dialogueId as string;
    const nodeId = cmd.params!.nodeId as string;
    const optionIndex = readNonNegativeIntegerParam(cmd.params!.optionIndex)!;
    return [
      {
        type: "choose_dialogue_option",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.chooseDialogueOption!(dialogueId, nodeId, optionIndex);
          for (const effect of outcome.effects) {
            if (effect.type === "set_switch") {
              tw.events.emit("switch_set", tw.tick, {
                actorIds: cmd.actorId ? [cmd.actorId] : undefined,
                payload: { switch_id: effect.switchId, value: effect.value },
              });
            } else if (effect.type === "set_quest") {
              tw.events.emit("quest_updated", tw.tick, {
                actorIds: cmd.actorId ? [cmd.actorId] : undefined,
                payload: { quest_id: effect.questId, state: effect.state },
              });
            }
          }
          tw.events.emit("dialogue_option_chosen", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: outcome as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const BuyShopItemHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canBuyShopItem || !w.buyShopItem) return { ok: false, reason: "unsupported" };
    const shopId = typeof cmd.params?.shopId === "string" ? cmd.params.shopId : "";
    const stockIndex = readNonNegativeIntegerParam(cmd.params?.stockIndex);
    if (!shopId) return { ok: false, reason: "no shop" };
    if (stockIndex === undefined) return { ok: false, reason: "no stock" };
    return w.canBuyShopItem(shopId, stockIndex);
  },
  resolve(cmd) {
    const shopId = cmd.params!.shopId as string;
    const stockIndex = readNonNegativeIntegerParam(cmd.params!.stockIndex)!;
    return [
      {
        type: "buy_shop_item",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.buyShopItem!(shopId, stockIndex);
          tw.events.emit("shop_item_bought", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: outcome as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const SellInventoryItemHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canSellInventoryItem || !w.sellInventoryItem) return { ok: false, reason: "unsupported" };
    const shopId = typeof cmd.params?.shopId === "string" ? cmd.params.shopId : undefined;
    const itemId = typeof cmd.params?.itemId === "string" ? cmd.params.itemId : "";
    const count = readPositiveIntegerParam(cmd.params?.count, 1);
    if (!itemId) return { ok: false, reason: "no item" };
    if (!count) return { ok: false, reason: "bad count" };
    return w.canSellInventoryItem(shopId, itemId, count);
  },
  resolve(cmd) {
    const shopId = typeof cmd.params?.shopId === "string" ? cmd.params.shopId : undefined;
    const itemId = cmd.params!.itemId as string;
    const count = readPositiveIntegerParam(cmd.params!.count, 1)!;
    return [
      {
        type: "sell_inventory_item",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.sellInventoryItem!(shopId, itemId, count);
          tw.events.emit("shop_item_sold", tw.tick, {
            actorIds: cmd.actorId ? [cmd.actorId] : undefined,
            payload: outcome as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const MeleeAttackHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canMeleeAttack || !w.resolveMeleeAttack) return { ok: false, reason: "unsupported" };
    if (!cmd.actorId) return { ok: false, reason: "no actor" };
    const targetId = typeof cmd.params?.targetId === "string" ? cmd.params.targetId : "";
    if (!targetId) return { ok: false, reason: "no target" };
    return w.canMeleeAttack(cmd.actorId, targetId);
  },
  resolve(cmd) {
    const actorId = cmd.actorId!;
    const targetId = cmd.params!.targetId as string;
    return [
      {
        type: "melee_attack",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.resolveMeleeAttack!(actorId, targetId);
          tw.events.emit("melee_attack_resolved", tw.tick, {
            actorIds: [actorId, targetId],
            payload: outcome as unknown as Record<string, unknown>,
          });
          for (const completion of outcome.objectiveCompletions || []) {
            tw.events.emit("quest_objective_completed", tw.tick, {
              actorIds: [actorId],
              payload: {
                objective_id: completion.objectiveId,
                target_id: completion.targetId,
                objective_type: completion.objectiveType,
              },
            });
          }
        },
      },
    ];
  },
};

export const CastSkillHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canCastSkill || !w.resolveSkillCast) return { ok: false, reason: "unsupported" };
    if (!cmd.actorId) return { ok: false, reason: "no actor" };
    const skillId = typeof cmd.params?.skillId === "string" ? cmd.params.skillId : "";
    if (!skillId) return { ok: false, reason: "no skill" };
    const targetCells = readTargetCellsParam(cmd.params?.targetCells);
    if (targetCells.length === 0) return { ok: false, reason: "no target" };
    return w.canCastSkill(cmd.actorId, skillId, targetCells);
  },
  resolve(cmd) {
    const actorId = cmd.actorId!;
    const skillId = cmd.params!.skillId as string;
    const targetCells = readTargetCellsParam(cmd.params?.targetCells);
    return [
      {
        type: "cast_skill",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.resolveSkillCast!(actorId, skillId, targetCells);
          tw.events.emit("skill_cast_resolved", tw.tick, {
            actorIds: [actorId],
            payload: outcome as unknown as Record<string, unknown>,
          });
          for (const completion of outcome.objectiveCompletions || []) {
            tw.events.emit("quest_objective_completed", tw.tick, {
              actorIds: [actorId],
              payload: {
                objective_id: completion.objectiveId,
                target_id: completion.targetId,
                objective_type: completion.objectiveType,
              },
            });
          }
        },
      },
    ];
  },
};

export const UpdateCombatSessionHandler: CommandHandler = {
  validate(_cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.updateCombatSession) return { ok: false, reason: "unsupported" };
    return { ok: true };
  },
  resolve(cmd) {
    const threatRadius = readPositiveIntegerParam(cmd.params?.threatRadius);
    const chaseRadius = readPositiveIntegerParam(cmd.params?.chaseRadius);
    const partyFollowers = readPartyFollowersParam(cmd.params?.partyFollowers);
    const forceEnd = cmd.params?.forceEnd === true;
    return [
      {
        type: "update_combat_session",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.updateCombatSession!({ threatRadius, chaseRadius, partyFollowers, forceEnd });
          if (outcome.status !== "unchanged") {
            const eventType =
              outcome.status === "started"
                ? "combat_started"
                : outcome.status === "reinforced"
                  ? "combat_reinforced"
                  : "combat_ended";
            tw.events.emit(eventType, tw.tick, {
              payload: outcome as unknown as Record<string, unknown>,
            });
          }
        },
      },
    ];
  },
};

export const AdvanceCombatTurnHandler: CommandHandler = {
  validate(_cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.advanceCombatTurn) return { ok: false, reason: "unsupported" };
    return { ok: true };
  },
  resolve() {
    return [
      {
        type: "advance_combat_turn",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.advanceCombatTurn!();
          tw.events.emit("combat_turn_advanced", tw.tick, {
            actorIds: outcome.activeTurnId ? [outcome.activeTurnId] : undefined,
            payload: outcome as unknown as Record<string, unknown>,
          });
        },
      },
    ];
  },
};

export const EnemyTurnHandler: CommandHandler = {
  validate(cmd, world) {
    const w = world as InteractiveGridWorld;
    if (!w.canResolveEnemyTurn || !w.resolveEnemyTurn) return { ok: false, reason: "unsupported" };
    return w.canResolveEnemyTurn(cmd.actorId);
  },
  resolve(cmd) {
    return [
      {
        type: "enemy_turn",
        apply(target) {
          const tw = target as InteractiveGridWorld;
          const outcome = tw.resolveEnemyTurn!(
            cmd.actorId,
            cmd.params?.advanceTurn !== false,
            Number(cmd.params?.movementSteps || 0) || undefined,
            cmd.params?.allowAttack !== false,
          );
          if (outcome.attack) {
            tw.events.emit("melee_attack_resolved", tw.tick, {
              actorIds: [outcome.attack.attackerId, outcome.attack.targetId],
              payload: outcome.attack as unknown as Record<string, unknown>,
            });
            for (const completion of outcome.attack.objectiveCompletions || []) {
              tw.events.emit("quest_objective_completed", tw.tick, {
                actorIds: [outcome.attack.attackerId],
                payload: {
                  objective_id: completion.objectiveId,
                  target_id: completion.targetId,
                  objective_type: completion.objectiveType,
                },
              });
            }
          }
          if (outcome.kind === "move" && outcome.fromCell && outcome.toCell) {
            tw.events.emit("entity_moved", tw.tick, {
              actorIds: [outcome.actorId],
              payload: { from: outcome.fromCell, to: outcome.toCell },
            });
          }
          tw.events.emit("enemy_turn_resolved", tw.tick, {
            actorIds: [outcome.actorId],
            payload: outcome as unknown as Record<string, unknown>,
          });
          if (cmd.params?.advanceTurn !== false) {
            tw.events.emit("combat_turn_advanced", tw.tick, {
              actorIds: outcome.nextTurnId ? [outcome.nextTurnId] : undefined,
              payload: {
                previousTurnId: outcome.actorId,
                activeTurnId: outcome.nextTurnId,
              },
            });
          }
        },
      },
    ];
  },
};

export function registerCoreCommands(engine: Engine): void {
  engine.commands.register("move_entity", MoveEntityHandler);
  engine.commands.register("wait", WaitHandler);
  engine.commands.register("push_object", PushObjectHandler);
  engine.commands.register("pull_object", PullObjectHandler);
  engine.commands.register("drag_object", DragObjectHandler);
  engine.commands.register("carry_object", CarryObjectHandler);
  engine.commands.register("break_object", BreakObjectHandler);
  engine.commands.register("clean_surface", CleanSurfaceHandler);
  engine.commands.register("decay_surfaces", DecaySurfacesHandler);
  engine.commands.register("ignite_fire", IgniteFireHandler);
  engine.commands.register("extinguish_fire", ExtinguishFireHandler);
  engine.commands.register("advance_environment", AdvanceEnvironmentHandler);
  engine.commands.register("emit_sound", EmitSoundHandler);
  engine.commands.register("advance_npc_tasks", AdvanceNpcTasksHandler);
  engine.commands.register("start_process", StartProcessHandler);
  engine.commands.register("interrupt_process", InterruptProcessHandler);
  engine.commands.register("advance_processes", AdvanceProcessesHandler);
  engine.commands.register("advance_simulation_regions", AdvanceSimulationRegionsHandler);
  engine.commands.register("adapt_simulation_semantics", AdaptSimulationSemanticsHandler);
  engine.commands.register("take_item", TakeItemHandler);
  engine.commands.register("drop_item", DropItemHandler);
  engine.commands.register("open_door", OpenDoorHandler);
  engine.commands.register("close_door", CloseDoorHandler);
  engine.commands.register("change_map", ChangeMapHandler);
  engine.commands.register("fire_trigger", FireTriggerHandler);
  engine.commands.register("unlock_container", UnlockContainerHandler);
  engine.commands.register("open_container", OpenContainerHandler);
  engine.commands.register("search_container", SearchContainerHandler);
  engine.commands.register("take_from_container", TakeFromContainerHandler);
  engine.commands.register("take_all_from_container", TakeAllFromContainerHandler);
  engine.commands.register("stow_in_container", StowInContainerHandler);
  engine.commands.register("set_switch", SetSwitchHandler);
  engine.commands.register("set_quest", SetQuestHandler);
  engine.commands.register("give_item", GiveItemHandler);
  engine.commands.register("remove_item", RemoveItemHandler);
  engine.commands.register("give_currency", GiveCurrencyHandler);
  engine.commands.register("remove_currency", RemoveCurrencyHandler);
  engine.commands.register("adjust_faction_rep", AdjustFactionRepHandler);
  engine.commands.register("read_document", ReadDocumentHandler);
  engine.commands.register("learn_skill", LearnSkillHandler);
  engine.commands.register("complete_quest_objective", CompleteQuestObjectiveHandler);
  engine.commands.register("set_player_position", SetPlayerPositionHandler);
  engine.commands.register("teleport_player", TeleportPlayerHandler);
  engine.commands.register("set_entity_position", SetEntityPositionHandler);
  engine.commands.register("set_player_sprite", SetPlayerSpriteHandler);
  engine.commands.register("heal_player", HealPlayerHandler);
  engine.commands.register("restore_party", RestorePartyHandler);
  engine.commands.register("add_party_member", AddPartyMemberHandler);
  engine.commands.register("remove_party_member", RemovePartyMemberHandler);
  engine.commands.register("advance_clock", AdvanceClockHandler);
  engine.commands.register("modify_player_stats", ModifyPlayerStatsHandler);
  engine.commands.register("set_entity_hidden", SetEntityHiddenHandler);
  engine.commands.register("record_bark", RecordBarkHandler);
  engine.commands.register("game_end", GameEndHandler);
  engine.commands.register("choose_dialogue_option", ChooseDialogueOptionHandler);
  engine.commands.register("buy_shop_item", BuyShopItemHandler);
  engine.commands.register("sell_inventory_item", SellInventoryItemHandler);
  engine.commands.register("melee_attack", MeleeAttackHandler);
  engine.commands.register("cast_skill", CastSkillHandler);
  engine.commands.register("update_combat_session", UpdateCombatSessionHandler);
  engine.commands.register("advance_combat_turn", AdvanceCombatTurnHandler);
  engine.commands.register("enemy_turn", EnemyTurnHandler);
}
