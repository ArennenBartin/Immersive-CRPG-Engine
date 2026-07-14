import type { z } from "zod";
import type { MapValidationReport } from "../engine-core/mapReadinessValidator";
import type { MapData } from "../schema/game";
import type {
  DungeonConnectionSocketSchema,
  DungeonDiagnosticSchema,
  DungeonEmbeddedDungeonSchema,
  DungeonEmbeddedFloorSchema,
  DungeonEncounterProfileSchema,
  DungeonEncounterSituationSchema,
  DungeonGenerationMetricsSchema,
  DungeonGenerationResultSchema,
  DungeonGraphEdgeSchema,
  DungeonGraphMetricsSchema,
  DungeonGraphNodeSchema,
  DungeonGraphSchema,
  DungeonGateSchema,
  DungeonHazardPatternSchema,
  DungeonHazardProfileSchema,
  DungeonInitialChemistrySchema,
  DungeonMinMaxIntSchema,
  DungeonMinMaxNumberSchema,
  DungeonNarrativeProfileSchema,
  DungeonPopulationSocketSchema,
  DungeonRecipeSchema,
  DungeonRewardProfileSchema,
  DungeonRoomArchetypeSchema,
  DungeonRoomTemplateSchema,
  DungeonStageIdSchema,
  DungeonThemeProfileSchema,
  DungeonWeightedRefSchema,
} from "./schema";

export type DungeonStageId = z.infer<typeof DungeonStageIdSchema>;
export type DungeonMinMaxInt = z.infer<typeof DungeonMinMaxIntSchema>;
export type DungeonMinMaxNumber = z.infer<typeof DungeonMinMaxNumberSchema>;
export type DungeonWeightedRef = z.infer<typeof DungeonWeightedRefSchema>;

export type DungeonRecipeDef = z.infer<typeof DungeonRecipeSchema>;
export type DungeonThemeProfileDef = z.infer<typeof DungeonThemeProfileSchema>;
export type DungeonRoomArchetypeDef = z.infer<typeof DungeonRoomArchetypeSchema>;
export type DungeonRoomTemplateDef = z.infer<typeof DungeonRoomTemplateSchema>;
export type DungeonConnectionSocketDef = z.infer<typeof DungeonConnectionSocketSchema>;
export type DungeonPopulationSocketDef = z.infer<typeof DungeonPopulationSocketSchema>;
export type DungeonEncounterSituationDef = z.infer<typeof DungeonEncounterSituationSchema>;
export type DungeonEncounterProfileDef = z.infer<typeof DungeonEncounterProfileSchema>;
export type DungeonInitialChemistryDef = z.infer<typeof DungeonInitialChemistrySchema>;
export type DungeonHazardPatternDef = z.infer<typeof DungeonHazardPatternSchema>;
export type DungeonHazardProfileDef = z.infer<typeof DungeonHazardProfileSchema>;
export type DungeonRewardProfileDef = z.infer<typeof DungeonRewardProfileSchema>;
export type DungeonNarrativeProfileDef = z.infer<typeof DungeonNarrativeProfileSchema>;

export type DungeonGate = z.infer<typeof DungeonGateSchema>;
export type DungeonGraphNode = z.infer<typeof DungeonGraphNodeSchema>;
export type DungeonGraphEdge = z.infer<typeof DungeonGraphEdgeSchema>;
export type DungeonGraphMetrics = z.infer<typeof DungeonGraphMetricsSchema>;
export type DungeonGraph = z.infer<typeof DungeonGraphSchema>;
export type DungeonDiagnostic = z.infer<typeof DungeonDiagnosticSchema>;
export type DungeonEmbeddedFloor = z.infer<typeof DungeonEmbeddedFloorSchema>;
export type EmbeddedDungeon = z.infer<typeof DungeonEmbeddedDungeonSchema>;
export type DungeonGenerationMetrics = z.infer<typeof DungeonGenerationMetricsSchema>;
export type DungeonGenerationResultMetadata = z.infer<typeof DungeonGenerationResultSchema>;
export type DungeonGenerationResult = DungeonGenerationResultMetadata & {
  /** Ordinary baked maps. The generator is not required after this boundary. */
  maps: MapData[];
  validationReports?: MapValidationReport[];
};

// Short aliases are convenient in pure generation stages; Def-suffixed names
// remain the canonical package-authoring vocabulary.
export type DungeonRecipe = DungeonRecipeDef;
export type DungeonThemeProfile = DungeonThemeProfileDef;
export type DungeonRoomArchetype = DungeonRoomArchetypeDef;
export type DungeonRoomTemplate = DungeonRoomTemplateDef;
export type DungeonEncounterProfile = DungeonEncounterProfileDef;
export type DungeonHazardProfile = DungeonHazardProfileDef;
export type DungeonRewardProfile = DungeonRewardProfileDef;
export type DungeonNarrativeProfile = DungeonNarrativeProfileDef;
