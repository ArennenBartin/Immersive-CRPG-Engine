import type { AlderamonticoBehaviorMode } from "./alderamonticoState";
import { getStatusDef, type StatusInstance } from "./statuses";
import type {
  ActorPhysicalStateRecord,
  SimulationNpcTaskRecord,
} from "../schema/save";

export type BehaviorContext = "combat" | "exploration";

export type BehaviorTier =
  | "incapacitated"
  | "survival"
  | "emotional"
  | "reactive"
  | "scheduled"
  | "idle";

export type BehaviorActionKind =
  | "skip"
  | "flee"
  | "attack"
  | "hold"
  | "investigate"
  | "assist"
  | "confront"
  | "raise_alarm"
  | "schedule"
  | "wander"
  | "idle";

export interface BehaviorReactiveSignal {
  kind:
    | "investigate"
    | "flee"
    | "ally_attacked"
    | "hostile_act"
    | "raise_alarm";
  reason: string;
  target_cell: [number, number];
  source_cell?: [number, number];
  target_actor_id?: string;
  source_task_id?: string;
  source_fact_id?: string;
  priority: number;
}

export interface BehaviorCommitmentRecord {
  tier: Extract<BehaviorTier, "survival" | "emotional" | "reactive">;
  action: BehaviorActionKind;
  reason: string;
  remaining_turns: number;
  target_cell?: [number, number];
  source_cell?: [number, number];
  target_actor_id?: string;
  source_task_id?: string;
  source_fact_id?: string;
}

export interface EntityBehaviorIntentRecord {
  actor_id: string;
  actor_name?: string;
  context: BehaviorContext;
  tier: BehaviorTier;
  tier_number: 1 | 2 | 3 | 4 | 5 | 6;
  action: BehaviorActionKind;
  reason: string;
  label: string;
  target_cell?: [number, number];
  source_cell?: [number, number];
  target_actor_id?: string;
  source_task_id?: string;
  source_fact_id?: string;
  decided_at_tick: number;
  from_commitment?: boolean;
}

export interface EntityBehaviorState {
  id: string;
  name?: string;
  cell: [number, number];
  hp: number;
  max_hp: number;
  dead?: boolean;
  hidden?: boolean;
  frozen?: boolean;
  integrity?: number;
  statuses?: StatusInstance[];
  physical?: ActorPhysicalStateRecord;
  emotional_behavior: AlderamonticoBehaviorMode;
  commitment?: BehaviorCommitmentRecord;
}

export interface EntityBehaviorWorldState {
  tick: number;
  threat?: {
    actor_id: string;
    cell: [number, number];
    adjacent?: boolean;
  };
  lethal_hazard?: {
    kind: string;
    cell: [number, number];
  };
  reactive?: BehaviorReactiveSignal;
  schedule?: {
    cell: [number, number];
    label?: string;
  };
  idle_action?: "wander" | "stand";
}

const TIER_NUMBER: Record<BehaviorTier, 1 | 2 | 3 | 4 | 5 | 6> = {
  incapacitated: 1,
  survival: 2,
  emotional: 3,
  reactive: 4,
  scheduled: 5,
  idle: 6,
};

const cloneCell = (cell: [number, number] | undefined): [number, number] | undefined =>
  cell ? [cell[0], cell[1]] : undefined;

const sameCell = (a: [number, number], b: [number, number]) =>
  a[0] === b[0] && a[1] === b[1];

const intentLabel = (
  tier: BehaviorTier,
  action: BehaviorActionKind,
  reason: string,
  targetCell?: [number, number],
): string => {
  const tierLabel = tier.toUpperCase();
  const detail =
    action === "schedule" && targetCell
      ? `walk to (${targetCell[0]},${targetCell[1]})`
      : action === "investigate" && targetCell
        ? `investigate (${targetCell[0]},${targetCell[1]})`
        : action === "assist" && targetCell
          ? `assist at (${targetCell[0]},${targetCell[1]})`
          : action === "raise_alarm"
            ? "raise alarm"
            : action === "flee"
              ? `flee ${reason}`
              : action === "attack"
                ? "attack"
                : action === "confront"
                  ? "confront"
                  : action === "wander"
                    ? "wander"
                    : action === "skip"
                      ? "skip turn"
                      : action === "hold"
                        ? "hold position"
                        : "stand";
  return `${tierLabel} -> ${detail}`;
};

const makeDecision = (
  actor: EntityBehaviorState,
  context: BehaviorContext,
  tick: number,
  tier: BehaviorTier,
  action: BehaviorActionKind,
  reason: string,
  options: {
    target_cell?: [number, number];
    source_cell?: [number, number];
    target_actor_id?: string;
    source_task_id?: string;
    source_fact_id?: string;
    from_commitment?: boolean;
  } = {},
): EntityBehaviorIntentRecord => ({
  actor_id: actor.id,
  actor_name: actor.name,
  context,
  tier,
  tier_number: TIER_NUMBER[tier],
  action,
  reason,
  label: intentLabel(tier, action, reason, options.target_cell),
  target_cell: cloneCell(options.target_cell),
  source_cell: cloneCell(options.source_cell),
  target_actor_id: options.target_actor_id,
  source_task_id: options.source_task_id,
  source_fact_id: options.source_fact_id,
  decided_at_tick: tick,
  from_commitment: options.from_commitment || undefined,
});

const decisionFromCommitment = (
  actor: EntityBehaviorState,
  context: BehaviorContext,
  tick: number,
  tier: BehaviorCommitmentRecord["tier"],
): EntityBehaviorIntentRecord | undefined => {
  const commitment = actor.commitment;
  if (!commitment || commitment.tier !== tier || commitment.remaining_turns <= 0) return undefined;
  return makeDecision(actor, context, tick, tier, commitment.action, commitment.reason, {
    target_cell: commitment.target_cell,
    source_cell: commitment.source_cell,
    target_actor_id: commitment.target_actor_id,
    source_task_id: commitment.source_task_id,
    source_fact_id: commitment.source_fact_id,
    from_commitment: true,
  });
};

const incapacitatedReason = (actor: EntityBehaviorState): string | undefined => {
  if (actor.dead || actor.hidden || actor.hp <= 0) return "dead";
  if (actor.frozen) return "frozen";
  const blockingStatus = (actor.statuses || []).find((status) => getStatusDef(status.id).skipTurn);
  if (blockingStatus) return blockingStatus.id;
  return undefined;
};

const survivalReason = (actor: EntityBehaviorState): string | undefined => {
  const physical = actor.physical;
  if (physical?.labels.includes("On Fire") || (physical?.heat || 0) >= 0.65) return "burning";
  if ((physical?.toxicity || 0) >= 0.72) return "toxicity";
  if ((physical?.chill || 0) >= 0.88) return "freezing exposure";
  if ((physical?.charge || 0) >= 0.88) return "dangerous charge";
  if (actor.max_hp > 0 && actor.hp / actor.max_hp <= 0.2) return "critical wounds";
  if (actor.integrity !== undefined && actor.integrity <= 0.2) return "critical integrity";
  return undefined;
};

const reactiveDecision = (
  actor: EntityBehaviorState,
  context: BehaviorContext,
  tick: number,
  signal: BehaviorReactiveSignal,
): EntityBehaviorIntentRecord => {
  const shared = {
    target_cell: signal.target_cell,
    source_cell: signal.source_cell,
    target_actor_id: signal.target_actor_id,
    source_task_id: signal.source_task_id,
    source_fact_id: signal.source_fact_id,
  };
  if (signal.kind === "flee") {
    return makeDecision(actor, context, tick, "reactive", "flee", signal.reason, shared);
  }
  if (signal.kind === "ally_attacked") {
    return makeDecision(actor, context, tick, "reactive", "assist", signal.reason, shared);
  }
  if (signal.kind === "hostile_act") {
    return makeDecision(actor, context, tick, "reactive", "confront", signal.reason, shared);
  }
  if (signal.kind === "raise_alarm") {
    return makeDecision(actor, context, tick, "reactive", "raise_alarm", signal.reason, shared);
  }
  return makeDecision(actor, context, tick, "reactive", "investigate", signal.reason, shared);
};

export const decideEntityAction = (
  actor: EntityBehaviorState,
  world: EntityBehaviorWorldState,
  context: BehaviorContext,
): EntityBehaviorIntentRecord => {
  const unable = incapacitatedReason(actor);
  if (unable) return makeDecision(actor, context, world.tick, "incapacitated", "skip", unable);

  const acuteDistress = survivalReason(actor);
  if (acuteDistress || world.lethal_hazard) {
    const reason = acuteDistress || world.lethal_hazard!.kind;
    const sourceCell = world.lethal_hazard?.cell || actor.physical?.cell || actor.cell;
    return makeDecision(actor, context, world.tick, "survival", "flee", reason, {
      source_cell: sourceCell,
      target_cell: sourceCell,
      target_actor_id: world.threat?.actor_id,
    });
  }
  const survivalCommitment = decisionFromCommitment(actor, context, world.tick, "survival");
  if (survivalCommitment) return survivalCommitment;

  if (actor.emotional_behavior === "paralyzed" || actor.emotional_behavior === "fade") {
    return makeDecision(
      actor,
      context,
      world.tick,
      "emotional",
      "skip",
      actor.emotional_behavior,
    );
  }
  if (actor.emotional_behavior === "flee") {
    return makeDecision(actor, context, world.tick, "emotional", "flee", "fear", {
      source_cell: world.threat?.cell || actor.cell,
      target_cell: world.threat?.cell,
      target_actor_id: world.threat?.actor_id,
    });
  }
  if (actor.emotional_behavior === "attack" && world.threat) {
    return makeDecision(actor, context, world.tick, "emotional", "attack", "rage", {
      target_cell: world.threat.cell,
      target_actor_id: world.threat.actor_id,
    });
  }
  if (actor.emotional_behavior === "defend_attachment") {
    return makeDecision(actor, context, world.tick, "emotional", "hold", "attachment");
  }
  const emotionalCommitment = decisionFromCommitment(actor, context, world.tick, "emotional");
  if (emotionalCommitment) return emotionalCommitment;

  if (world.reactive) return reactiveDecision(actor, context, world.tick, world.reactive);
  const reactiveCommitment = decisionFromCommitment(actor, context, world.tick, "reactive");
  if (reactiveCommitment) return reactiveCommitment;

  if (context === "combat" && world.threat) {
    return makeDecision(actor, context, world.tick, "reactive", "attack", "combat target", {
      target_cell: world.threat.cell,
      target_actor_id: world.threat.actor_id,
    });
  }

  if (world.schedule && !sameCell(actor.cell, world.schedule.cell)) {
    return makeDecision(actor, context, world.tick, "scheduled", "schedule", world.schedule.label || "routine", {
      target_cell: world.schedule.cell,
    });
  }

  if (context === "combat") {
    return makeDecision(actor, context, world.tick, "idle", "hold", "no target");
  }
  if (world.idle_action === "wander") {
    return makeDecision(actor, context, world.tick, "idle", "wander", "within leash");
  }
  return makeDecision(actor, context, world.tick, "idle", "idle", "routine satisfied");
};

export const activeReactiveTaskForActor = (
  tasks: SimulationNpcTaskRecord[] | undefined,
  actorId: string,
  tick: number,
): SimulationNpcTaskRecord | undefined =>
  (tasks || [])
    .filter(
      (task) =>
        task.actor_id === actorId &&
        task.source_kind !== "schedule" &&
        task.state !== "done" &&
        task.state !== "failed" &&
        (!task.expires_at_tick || task.expires_at_tick > tick),
    )
    .sort((a, b) => b.priority - a.priority || a.created_at_tick - b.created_at_tick)[0];

export const reactiveSignalFromTask = (
  task: SimulationNpcTaskRecord | undefined,
): BehaviorReactiveSignal | undefined => {
  if (!task) return undefined;
  const kind: BehaviorReactiveSignal["kind"] =
    task.task_type === "flee"
      ? "flee"
      : task.task_type === "report"
        ? "raise_alarm"
        : task.source_kind === "ally_attacked"
          ? "ally_attacked"
          : task.source_kind === "hostile_act"
            ? "hostile_act"
            : "investigate";
  return {
    kind,
    reason: task.source_kind || task.task_type,
    target_cell: cloneCell(task.target_cell)!,
    source_cell: cloneCell(task.task_type === "flee" ? task.target_cell : task.origin_cell),
    source_task_id: task.id,
    priority: task.priority,
  };
};

const isCommittedTier = (
  tier: BehaviorTier,
): tier is BehaviorCommitmentRecord["tier"] =>
  tier === "survival" || tier === "emotional" || tier === "reactive";

export const recordEntityBehaviorDecision = (
  state: Record<string, any> | undefined,
  decision: EntityBehaviorIntentRecord,
  commitmentTurns = 2,
): Record<string, any> => {
  const current = state || {};
  const previous = current.behavior_commitment as BehaviorCommitmentRecord | undefined;
  let behavior_commitment: BehaviorCommitmentRecord | undefined;
  const actionCommits =
    isCommittedTier(decision.tier) &&
    (decision.action === "flee" ||
      decision.action === "attack" ||
      decision.action === "investigate" ||
      decision.action === "assist" ||
      decision.action === "confront" ||
      decision.action === "raise_alarm");
  if (actionCommits) {
    const remaining = decision.from_commitment
      ? Math.max(0, (previous?.remaining_turns || 0) - 1)
      : Math.max(1, Math.floor(commitmentTurns));
    if (remaining > 0) {
      behavior_commitment = {
        tier: decision.tier as BehaviorCommitmentRecord["tier"],
        action: decision.action,
        reason: decision.reason,
        remaining_turns: remaining,
        target_cell: cloneCell(decision.target_cell),
        source_cell: cloneCell(decision.source_cell),
        target_actor_id: decision.target_actor_id,
        source_task_id: decision.source_task_id,
        source_fact_id: decision.source_fact_id,
      };
    }
  }
  return {
    ...current,
    behavior_intent: decision,
    behavior_intent_log: [...(current.behavior_intent_log || []), decision].slice(-24),
    behavior_commitment,
  };
};
