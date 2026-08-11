import type { MapData } from "../schema/game";
import { stableContentHash } from "../generation-facing/stableHash";
import { bakeBackroomsMap } from "./bake";
import { embedBackroomsGraph } from "./embedding";
import { planBackroomsPacing } from "./pacing";
import {
  LEVEL0_CMT_PHASE6_AMBIENCE,
  LEVEL0_CMT_PHASE6_EVENT_PROFILE,
  LEVEL0_CMT_PHASE6_MOTIF,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
} from "./presets/level0Cmt";
import type { BackroomsQualityReport } from "./quality";
import { generateBackroomsSemanticGraph } from "./topology";
import type {
  BackroomsAnchorRequest,
  BackroomsAnomalyDressingPlan,
  BackroomsAnomalyProfileDef,
  BackroomsDiagnostic,
  BackroomsEmbeddedMap,
  BackroomsPacingPlan,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface GenerateBackroomsMapInput {
  recipe: BackroomsRecipeDef;
  requiredAnchors?: readonly BackroomsAnchorRequest[];
  generatedAt?: string;
  contentLibraryHash?: string;
  debug?: boolean;
  /** Phase-specific regression tests may stop at the Phase 5 spatial bake. */
  includePacing?: boolean;
  /**
   * Optional authored anomaly profile. Undefined keeps the bundled Level 0
   * preset; null explicitly produces an anomaly-free bake. This keeps the
   * pure generator usable by Studio/package callers instead of silently
   * ignoring their selected profile.
   */
  anomalyProfile?: BackroomsAnomalyProfileDef | null;
}

export interface BackroomsMapGenerationResult {
  success: boolean;
  map?: MapData;
  graph?: BackroomsSemanticGraph;
  embedded?: BackroomsEmbeddedMap;
  quality?: BackroomsQualityReport;
  pacing?: BackroomsPacingPlan;
  anomalies?: BackroomsAnomalyDressingPlan;
  attempts: number;
  diagnostics: BackroomsDiagnostic[];
  canonicalResultHash?: string;
}

/** Phase 5's end-to-end pure boundary: semantic graph -> ordinary MapData. */
export const generateBackroomsMap = (
  input: GenerateBackroomsMapInput,
): BackroomsMapGenerationResult => {
  const topology = generateBackroomsSemanticGraph({
    recipe: input.recipe,
    requiredAnchors: input.requiredAnchors,
    debug: input.debug,
  });
  if (!topology.success || !topology.graph) {
    return {
      success: false,
      graph: topology.graph,
      quality: topology.quality,
      attempts: topology.attempts,
      diagnostics: topology.diagnostics,
    };
  }
  const pacing = input.includePacing === false
    ? undefined
    : planBackroomsPacing({
        recipe: input.recipe,
        graph: topology.graph,
        motif: LEVEL0_CMT_PHASE6_MOTIF,
        eventProfile: LEVEL0_CMT_PHASE6_EVENT_PROFILE,
        ambienceProfile: LEVEL0_CMT_PHASE6_AMBIENCE,
        attemptIndex: topology.attempts - 1,
      });
  if (pacing && (!pacing.success || !pacing.plan)) {
    return {
      success: false,
      graph: topology.graph,
      quality: topology.quality,
      attempts: topology.attempts,
      diagnostics: [...topology.diagnostics, ...pacing.diagnostics],
    };
  }
  const embedding = embedBackroomsGraph({
    recipe: input.recipe,
    graph: topology.graph,
    pacingPlan: pacing?.plan,
    attemptIndex: topology.attempts - 1,
  });
  if (!embedding.success || !embedding.embedded) {
    return {
      success: false,
      graph: topology.graph,
      quality: topology.quality,
      pacing: pacing?.plan,
      attempts: topology.attempts,
      diagnostics: [...topology.diagnostics, ...embedding.diagnostics],
    };
  }
  const bake = bakeBackroomsMap({
    recipe: input.recipe,
    graph: topology.graph,
    embedded: embedding.embedded,
    pacingPlan: pacing?.plan,
    anomalyProfile: input.includePacing === false || input.anomalyProfile === null
      ? undefined
      : input.anomalyProfile ?? LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
    generatedAt: input.generatedAt,
    contentLibraryHash: input.contentLibraryHash,
    attemptIndex: topology.attempts - 1,
  });
  const canonicalResultHash = stableContentHash({
    graph: topology.graph.metrics.canonicalHash,
    embedded: embedding.embedded.canonicalHash,
    pacing: pacing?.plan?.canonicalHash,
    anomalies: bake.anomalies?.canonicalHash,
  });
  return {
    success: bake.success,
    map: bake.map,
    graph: topology.graph,
    embedded: embedding.embedded,
    quality: topology.quality,
    pacing: pacing?.plan,
    anomalies: bake.anomalies,
    attempts: topology.attempts,
    diagnostics: [
      ...topology.diagnostics,
      ...(pacing?.diagnostics ?? []),
      ...embedding.diagnostics,
      ...bake.diagnostics,
    ],
    canonicalResultHash,
  };
};
