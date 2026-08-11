import { stableContentHash } from "../generation-facing/stableHash";
import { backroomsDiagnostic, sortBackroomsDiagnostics } from "./diagnostics";
import { backroomsGraphDistance } from "./quality";
import {
  BackroomsAmbienceProfileSchema,
  BackroomsEventProfileSchema,
  BackroomsMotifSchema,
  BackroomsPacingPlanSchema,
  BackroomsRecipeSchema,
  BackroomsSemanticGraphSchema,
} from "./schema";
import { createBackroomsSeedContext } from "./seedContext";
import type {
  BackroomsAmbienceProfile,
  BackroomsDiagnostic,
  BackroomsEventProfileDef,
  BackroomsGraphNode,
  BackroomsMotifDef,
  BackroomsPacingPlan,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface PlanBackroomsPacingInput {
  recipe: BackroomsRecipeDef;
  graph: BackroomsSemanticGraph;
  motif: BackroomsMotifDef;
  eventProfile: BackroomsEventProfileDef;
  ambienceProfile: BackroomsAmbienceProfile;
  attemptIndex?: number;
}

export interface BackroomsPacingResult {
  success: boolean;
  plan?: BackroomsPacingPlan;
  diagnostics: BackroomsDiagnostic[];
}

const nodeOrder = (graph: BackroomsSemanticGraph) => graph.nodes
  .map((node) => ({
    node,
    distance: backroomsGraphDistance(graph, graph.startNodeId, node.id),
  }))
  .sort((left, right) =>
    left.distance - right.distance ||
    left.node.ordinal - right.node.ordinal ||
    left.node.id.localeCompare(right.node.id),
  );

interface RecurrenceCandidate {
  id: string;
  nodeIds: [string, string, string, string];
  score: number;
}

const recurrenceCandidates = (
  graph: BackroomsSemanticGraph,
  motif: BackroomsMotifDef,
): RecurrenceCandidate[] => {
  if (motif.stages.length < 4 || motif.maxOccurrences < 4) return [];
  const minimumSpacing = motif.minSpacingRooms;
  const distances = new Map(graph.nodes.map((node) => [
    node.id,
    backroomsGraphDistance(graph, graph.startNodeId, node.id),
  ]));
  const ordinary = graph.nodes
    .filter((node) => !node.required && ["connective", "landmark"].includes(node.kind))
    .sort((left, right) =>
      (distances.get(left.id) ?? 0) - (distances.get(right.id) ?? 0) ||
      left.id.localeCompare(right.id));
  const finals = graph.nodes
    // The fourth return itself becomes a newly protected story island. It
    // does not need to consume one of the graph's pre-authored anchors; the
    // pacing pass runs before embedding and therefore reserves it in time.
    .filter((node) =>
      node.id !== graph.startNodeId &&
      node.id !== graph.transitionNodeId &&
      ["connective", "landmark", "anchor", "set_piece", "culmination"].includes(node.kind))
    .sort((left, right) =>
      (distances.get(right.id) ?? 0) - (distances.get(left.id) ?? 0) ||
      left.id.localeCompare(right.id));
  const solutions: RecurrenceCandidate[] = [];
  const farEnough = (left: string, right: string) =>
    backroomsGraphDistance(graph, left, right) >= minimumSpacing;

  for (const final of finals) {
    const finalDistance = distances.get(final.id) ?? 0;
    for (const third of ordinary) {
      const thirdDistance = distances.get(third.id) ?? 0;
      if (third.id === final.id || !farEnough(third.id, final.id)) continue;
      for (const second of ordinary) {
        const secondDistance = distances.get(second.id) ?? 0;
        if (second.id === final.id || second.id === third.id ||
            !farEnough(second.id, third.id)) continue;
        for (const first of ordinary) {
          const firstDistance = distances.get(first.id) ?? 0;
          if (firstDistance < 2 || first.id === final.id ||
              first.id === second.id || first.id === third.id ||
              !farEnough(first.id, second.id)) continue;
          const nodeIds: RecurrenceCandidate["nodeIds"] = [first.id, second.id, third.id, final.id];
          solutions.push({
            id: nodeIds.join("|"),
            nodeIds,
            score: finalDistance + thirdDistance + secondDistance + firstDistance,
          });
          if (solutions.length >= 256) return solutions;
        }
      }
    }
  }
  return solutions;
};

const existingNovelty = (node: BackroomsGraphNode) =>
  !node.quiet ||
  ["anchor", "landmark", "set_piece", "culmination", "transition"].includes(node.kind) ||
  node.tags.includes("novelty_boost");

export const planBackroomsPacing = (
  input: PlanBackroomsPacingInput,
): BackroomsPacingResult => {
  const recipeResult = BackroomsRecipeSchema.safeParse(input.recipe);
  const graphResult = BackroomsSemanticGraphSchema.safeParse(input.graph);
  const motifResult = BackroomsMotifSchema.safeParse(input.motif);
  const eventResult = BackroomsEventProfileSchema.safeParse(input.eventProfile);
  const ambienceResult = BackroomsAmbienceProfileSchema.safeParse(input.ambienceProfile);
  if (!recipeResult.success || !graphResult.success || !motifResult.success ||
      !eventResult.success || !ambienceResult.success) {
    const issues = [
      ...(!recipeResult.success ? recipeResult.error.issues : []),
      ...(!graphResult.success ? graphResult.error.issues : []),
      ...(!motifResult.success ? motifResult.error.issues : []),
      ...(!eventResult.success ? eventResult.error.issues : []),
      ...(!ambienceResult.success ? ambienceResult.error.issues : []),
    ];
    return {
      success: false,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "recurrence",
        "BRG_PACING_INPUT_INVALID",
        issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      )],
    };
  }

  const recipe = recipeResult.data;
  const graph = graphResult.data;
  const motif = motifResult.data;
  const eventProfile = eventResult.data;
  const ambienceProfile = ambienceResult.data;
  const seedContext = createBackroomsSeedContext({
    generatorVersion: recipe.generatorVersion,
    recipeId: recipe.id,
    seed: recipe.seed,
    stageSalts: recipe.stageSalts,
    attemptIndex: input.attemptIndex ?? 0,
  });
  const recurrenceRng = seedContext.stream("recurrence");
  const eventRng = seedContext.stream("events");
  const diagnostics: BackroomsDiagnostic[] = [];
  const recurrenceOptions = recurrenceCandidates(graph, motif);
  if (!recurrenceOptions.length) {
    return {
      success: false,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "recurrence",
        "BRG_RECURRENCE_SPACING_FAILED",
        `No four-stage ${motif.id} schedule satisfies its ${motif.minSpacingRooms}-room minimum spacing.`,
        [motif.id],
      )],
    };
  }
  const selectedRecurrence = recurrenceRng.weighted(
    recurrenceOptions.map((option) => ({
      id: option.id,
      weight: Math.max(1, option.score),
      value: option,
    })),
    "phase6-recurrence-sequence",
  );
  const recurrence = selectedRecurrence.nodeIds.map((nodeId, stageIndex) => ({
    id: `${motif.id}.occurrence.${String(stageIndex + 1).padStart(2, "0")}`,
    motifId: motif.id,
    stageId: motif.stages[stageIndex].id,
    stageIndex,
    nodeId,
    graphDistanceFromPrevious: stageIndex === 0
      ? null
      : backroomsGraphDistance(graph, selectedRecurrence.nodeIds[stageIndex - 1], nodeId),
    protected: stageIndex === motif.stages.length - 1,
    tags: [...new Set([
      ...motif.tags,
      ...motif.stages[stageIndex].roomTags,
      `recurrence_stage_${stageIndex + 1}`,
    ])].sort(),
  }));

  const protectedNodeIds = [...new Set([
    ...graph.nodes.filter((node) => node.required).map((node) => node.id),
    ...recurrence.filter((entry) => entry.protected).map((entry) => entry.nodeId),
  ])].sort();
  const protectedSet = new Set(protectedNodeIds);
  const recurrenceSet = new Set(recurrence.map((entry) => entry.nodeId));
  const ordered = nodeOrder(graph);

  let quietStreak = 0;
  let noveltyDebt = 0;
  const provisionalDebt = new Map<string, number>();
  for (const { node } of ordered) {
    if (existingNovelty(node) || recurrenceSet.has(node.id)) {
      quietStreak = 0;
      noveltyDebt = 0;
    } else if (node.quiet) {
      quietStreak += 1;
      noveltyDebt += 1;
    }
    provisionalDebt.set(node.id, noveltyDebt);
  }

  const eventEntries = eventProfile.events.filter((entry) =>
    entry.kind !== "hostile" && Boolean(entry.cutsceneId));
  if (!eventEntries.length) {
    return {
      success: false,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "events",
        "BRG_NONCOMBAT_EVENT_POOL_EMPTY",
        `Event profile ${eventProfile.id} contains no ordinary non-combat cutscene events.`,
        [eventProfile.id],
      )],
    };
  }

  const targetEventCount = Math.min(eventProfile.maxEventsPerMap, 3);
  const eventNodes: BackroomsGraphNode[] = [];
  const candidates = ordered
    .map(({ node }) => node)
    .filter((node) =>
      !protectedSet.has(node.id) &&
      !recurrenceSet.has(node.id) &&
      node.kind !== "start" &&
      node.kind !== "transition")
    .sort((left, right) =>
      (provisionalDebt.get(right.id) ?? 0) - (provisionalDebt.get(left.id) ?? 0) ||
      left.id.localeCompare(right.id));
  const canScheduleEventAt = (candidate: BackroomsGraphNode) =>
    !eventNodes.some((selected) => selected.id === candidate.id) &&
    eventNodes.every((selected) =>
      backroomsGraphDistance(graph, selected.id, candidate.id) >= eventProfile.minSpacingRooms);

  // First pay any actual novelty debt. This pass is deliberately ordered by
  // traversal rather than random weight: once a quiet streak would exceed the
  // recipe's ceiling, the event is functional pacing infrastructure.
  let runningQuietStreak = 0;
  for (let index = 0; index < ordered.length && eventNodes.length < eventProfile.maxEventsPerMap; index += 1) {
    const node = ordered[index].node;
    if (existingNovelty(node) || recurrenceSet.has(node.id)) {
      runningQuietStreak = 0;
      continue;
    }
    if (!node.quiet) continue;
    runningQuietStreak += 1;
    if (runningQuietStreak <= recipe.pacing.maxQuietRoomsBeforeNoveltyBoost) continue;
    const windowStart = Math.max(0, index - runningQuietStreak + 1);
    const debtCandidates = ordered
      .slice(windowStart, index + 1)
      .map((entry) => entry.node)
      .reverse()
      .filter((candidate) => candidates.some((entry) => entry.id === candidate.id))
      .filter(canScheduleEventAt);
    if (!debtCandidates.length) continue;
    eventNodes.push(debtCandidates[0]);
    runningQuietStreak = 0;
  }

  while (eventNodes.length < targetEventCount) {
    const eligible = candidates.filter(canScheduleEventAt);
    if (!eligible.length) break;
    const selected = eventRng.weighted(
      eligible.map((node) => ({
        id: node.id,
        weight: 1 + (provisionalDebt.get(node.id) ?? 0),
        value: node,
      })),
      `phase6-event-node-${eventNodes.length}`,
    );
    eventNodes.push(selected);
  }
  if (eventNodes.length < targetEventCount) {
    diagnostics.push(backroomsDiagnostic(
      "warning",
      "events",
      "BRG_EVENT_TARGET_REDUCED",
      `Scheduled ${eventNodes.length} of ${targetEventCount} desired events without violating spacing.`,
    ));
  }
  const events = eventNodes.map((node, index) => {
    const event = eventRng.weighted(
      eventEntries.map((entry) => ({ id: entry.id, weight: entry.weight, value: entry })),
      `phase6-event-kind-${index}`,
    );
    return {
      id: `scheduled.${event.id}.${String(index + 1).padStart(2, "0")}`,
      eventProfileId: eventProfile.id,
      eventId: event.id,
      nodeId: node.id,
      cutsceneId: event.cutsceneId!,
      kind: event.kind,
      once: event.oneShot,
      noveltyDebtBefore: provisionalDebt.get(node.id) ?? 0,
    };
  });

  const eventByNodeId = new Map(events.map((event) => [event.nodeId, event]));
  quietStreak = 0;
  noveltyDebt = 0;
  let maximumQuietStreak = 0;
  const samples = ordered.map(({ node }, traversalIndex) => {
    const noveltySourceIds: string[] = [];
    if (existingNovelty(node)) noveltySourceIds.push(`graph:${node.id}`);
    const recurrenceEntry = recurrence.find((entry) => entry.nodeId === node.id);
    if (recurrenceEntry) noveltySourceIds.push(recurrenceEntry.id);
    const scheduledEvent = eventByNodeId.get(node.id);
    if (scheduledEvent) noveltySourceIds.push(scheduledEvent.id);
    if (noveltySourceIds.length) {
      quietStreak = 0;
      noveltyDebt = 0;
    } else if (node.quiet) {
      quietStreak += 1;
      noveltyDebt += 1;
      maximumQuietStreak = Math.max(maximumQuietStreak, quietStreak);
    }
    return {
      nodeId: node.id,
      traversalIndex,
      quietStreak,
      noveltyDebt,
      noveltySourceIds: noveltySourceIds.sort(),
    };
  });

  const structural = {
    motifId: motif.id,
    eventProfileId: eventProfile.id,
    ambienceProfile,
    protectedNodeIds,
    recurrence,
    events,
    samples,
    maximumQuietStreak,
    mandatoryHostileActors: 0,
  };
  const plan = BackroomsPacingPlanSchema.parse({
    ...structural,
    canonicalHash: stableContentHash(structural),
  });
  return { success: true, plan, diagnostics: sortBackroomsDiagnostics(diagnostics) };
};
