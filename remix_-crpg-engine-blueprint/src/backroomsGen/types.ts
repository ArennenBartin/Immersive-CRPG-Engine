import type { z } from "zod";
import type {
  BackroomsAnchorRequestSchema,
  BackroomsAmbienceLayerSchema,
  BackroomsAmbienceProfileSchema,
  BackroomsEmbeddedMapSchema,
  BackroomsAnomalyEntrySchema,
  BackroomsAnomalyDressingPlanSchema,
  BackroomsAnomalyProfileSchema,
  BackroomsAnomalyPlacementLogSchema,
  BackroomsAnomalyRejectionSchema,
  BackroomsAnomalyRoomAssignmentSchema,
  BackroomsDefinitionLibrarySchema,
  BackroomsDiagnosticSchema,
  BackroomsEventEntrySchema,
  BackroomsEventProfileSchema,
  BackroomsGraphEdgeSchema,
  BackroomsGraphMetricsSchema,
  BackroomsGraphNodeSchema,
  BackroomsLevelProfileSchema,
  BackroomsMinMaxIntSchema,
  BackroomsMinMaxNumberSchema,
  BackroomsMotifSchema,
  BackroomsMotifStageSchema,
  BackroomsPartialEmbedAnomalySchema,
  BackroomsPacingPlanSchema,
  BackroomsPacingSampleSchema,
  BackroomsRatioRangeSchema,
  BackroomsRecursiveAnomalySchema,
  BackroomsRealizedConnectionSchema,
  BackroomsRecurrenceOccurrenceSchema,
  BackroomsRecipeSchema,
  BackroomsSemanticGraphSchema,
  BackroomsScheduledEventSchema,
  BackroomsStageIdSchema,
  BackroomsTransitionRuleSchema,
  TransitionPresentationActionSchema,
  TransitionPresentationProfileSchema,
  BackroomsWrongDecorationAnomalySchema,
  BackroomsWrongnessProgressionSchema,
  BackroomsWrongnessProgressionSummarySchema,
  BackroomsWrongnessTierSchema,
} from "./schema";

export type BackroomsStageId = z.infer<typeof BackroomsStageIdSchema>;
export type BackroomsMinMaxInt = z.infer<typeof BackroomsMinMaxIntSchema>;
export type BackroomsMinMaxNumber = z.infer<typeof BackroomsMinMaxNumberSchema>;
export type BackroomsRatioRange = z.infer<typeof BackroomsRatioRangeSchema>;
export type BackroomsRecipeDef = z.infer<typeof BackroomsRecipeSchema>;
export type BackroomsLevelProfileDef = z.infer<typeof BackroomsLevelProfileSchema>;
export type BackroomsTransitionRuleDef = z.infer<typeof BackroomsTransitionRuleSchema>;
export type TransitionPresentationAction = z.infer<
  typeof TransitionPresentationActionSchema
>;
export type TransitionPresentationProfile = z.infer<
  typeof TransitionPresentationProfileSchema
>;
export type BackroomsMotifStageDef = z.infer<typeof BackroomsMotifStageSchema>;
export type BackroomsMotifDef = z.infer<typeof BackroomsMotifSchema>;
export type BackroomsEventEntryDef = z.infer<typeof BackroomsEventEntrySchema>;
export type BackroomsEventProfileDef = z.infer<typeof BackroomsEventProfileSchema>;
export type BackroomsAnomalyEntryDef = z.infer<typeof BackroomsAnomalyEntrySchema>;
export type BackroomsAnomalyProfileDef = z.infer<typeof BackroomsAnomalyProfileSchema>;
export type BackroomsPartialEmbedAnomalyDef = z.infer<typeof BackroomsPartialEmbedAnomalySchema>;
export type BackroomsRecursiveAnomalyDef = z.infer<typeof BackroomsRecursiveAnomalySchema>;
export type BackroomsWrongDecorationAnomalyDef = z.infer<typeof BackroomsWrongDecorationAnomalySchema>;
export type BackroomsWrongnessProgressionDef = z.infer<typeof BackroomsWrongnessProgressionSchema>;
export type BackroomsWrongnessProgressionSummary = z.infer<typeof BackroomsWrongnessProgressionSummarySchema>;
export type BackroomsWrongnessTier = z.infer<typeof BackroomsWrongnessTierSchema>;
export type BackroomsAnomalyRoomAssignment = z.infer<typeof BackroomsAnomalyRoomAssignmentSchema>;
export type BackroomsAnomalyPlacementLog = z.infer<typeof BackroomsAnomalyPlacementLogSchema>;
export type BackroomsAnomalyRejection = z.infer<typeof BackroomsAnomalyRejectionSchema>;
export type BackroomsAnomalyDressingPlan = z.infer<typeof BackroomsAnomalyDressingPlanSchema>;
export type BackroomsDefinitionLibrary = z.infer<typeof BackroomsDefinitionLibrarySchema>;
export type BackroomsAnchorRequest = z.infer<typeof BackroomsAnchorRequestSchema>;
export type BackroomsAmbienceLayer = z.infer<typeof BackroomsAmbienceLayerSchema>;
export type BackroomsAmbienceProfile = z.infer<typeof BackroomsAmbienceProfileSchema>;
export type BackroomsGraphNode = z.infer<typeof BackroomsGraphNodeSchema>;
export type BackroomsGraphEdge = z.infer<typeof BackroomsGraphEdgeSchema>;
export type BackroomsGraphMetrics = z.infer<typeof BackroomsGraphMetricsSchema>;
export type BackroomsSemanticGraph = z.infer<typeof BackroomsSemanticGraphSchema>;
export type BackroomsRealizedConnection = z.infer<typeof BackroomsRealizedConnectionSchema>;
export type BackroomsEmbeddedMap = z.infer<typeof BackroomsEmbeddedMapSchema>;
export type BackroomsRecurrenceOccurrence = z.infer<typeof BackroomsRecurrenceOccurrenceSchema>;
export type BackroomsScheduledEvent = z.infer<typeof BackroomsScheduledEventSchema>;
export type BackroomsPacingSample = z.infer<typeof BackroomsPacingSampleSchema>;
export type BackroomsPacingPlan = z.infer<typeof BackroomsPacingPlanSchema>;
export type BackroomsDiagnostic = z.infer<typeof BackroomsDiagnosticSchema>;
