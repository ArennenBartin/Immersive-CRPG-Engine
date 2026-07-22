import { auditGamePackageReferences, type ReferenceAuditReport } from "../../generation-facing/referenceAudit";
import { validateOrdinaryMap, type MapValidationReport } from "../../engine-core/mapReadinessValidator";
import { GamePackageSchema, type GamePackage, type MapData } from "../../schema/game";
import type { DungeonDiagnostic, DungeonRecipeDef, DungeonRoomArchetypeDef } from "../types";
import { dungeonDiagnostic, failedStage, successfulStage, type DungeonStageOutput } from "../diagnostics";
import type { DungeonBakeResult } from "../bake";

export interface DungeonRecipeReferenceAudit {
  diagnostics: DungeonDiagnostic[];
  valid: boolean;
}

const missingReference = (kind: string, id: string) => dungeonDiagnostic(
  "fatal", "recipe", "DNG_CONTENT_REFERENCE_MISSING",
  `Dungeon recipe references missing ${kind} ${id}.`, { relatedIds: [id] },
);

export const auditDungeonRecipeReferences = (
  recipe: DungeonRecipeDef,
  gamePackage: GamePackage,
): DungeonRecipeReferenceAudit => {
  const diagnostics: DungeonDiagnostic[] = [];
  const requireIds = (kind: string, ids: readonly string[], available: readonly { id: string }[]) => {
    const index = new Set(available.map((entry) => entry.id));
    ids.forEach((id) => { if (!index.has(id)) diagnostics.push(missingReference(kind, id)); });
  };
  requireIds("theme", [recipe.themeId], gamePackage.dungeon_themes);
  requireIds("room archetype", recipe.architecture.roomArchetypePool.map((entry) => entry.id), gamePackage.dungeon_room_archetypes);
  requireIds("room archetype", recipe.constraints.requiredRoomArchetypes, gamePackage.dungeon_room_archetypes);
  requireIds("room template", recipe.architecture.roomTemplatePool.map((entry) => entry.id), gamePackage.dungeon_room_templates);
  if (recipe.population.encounterProfileId) requireIds("encounter profile", [recipe.population.encounterProfileId], gamePackage.dungeon_encounter_profiles);
  if (recipe.population.hazardProfileId) requireIds("hazard profile", [recipe.population.hazardProfileId], gamePackage.dungeon_hazard_profiles);
  if (recipe.population.rewardProfileId) requireIds("reward profile", [recipe.population.rewardProfileId], gamePackage.dungeon_reward_profiles);
  if (recipe.population.narrativeProfileId) requireIds("narrative profile", [recipe.population.narrativeProfileId], gamePackage.dungeon_narrative_profiles);
  if (recipe.population.startingLightItemId) {
    const startingLight = gamePackage.items.find(
      (item) => item.id === recipe.population.startingLightItemId,
    );
    if (!startingLight) {
      diagnostics.push(missingReference("starting light item", recipe.population.startingLightItemId));
    } else if (
      !startingLight.light_source ||
      !startingLight.light_source.active_by_default ||
      startingLight.light_source.mobility !== "portable" ||
      !startingLight.light_source.extinguishable
    ) {
      diagnostics.push(dungeonDiagnostic(
        "fatal",
        "recipe",
        "DNG_STARTING_LIGHT_ITEM_INVALID",
        `Starting light item ${startingLight.id} must be an active, portable, extinguishable light source.`,
        { relatedIds: [startingLight.id] },
      ));
    }
  }
  const archetypeById = new Map(gamePackage.dungeon_room_archetypes.map((entry) => [entry.id, entry]));
  for (const archetypeId of recipe.architecture.roomArchetypePool.map((entry) => entry.id)) {
    const archetype = archetypeById.get(archetypeId) as DungeonRoomArchetypeDef | undefined;
    if (archetype && (Math.max(recipe.scale.roomWidth.min, archetype.minWidth) > Math.min(recipe.scale.roomWidth.max, archetype.maxWidth) ||
      Math.max(recipe.scale.roomDepth.min, archetype.minDepth) > Math.min(recipe.scale.roomDepth.max, archetype.maxDepth))) diagnostics.push(dungeonDiagnostic(
      "fatal", "recipe", "DNG_ARCHETYPE_SIZE_INTERSECTION_EMPTY",
      `Archetype ${archetypeId} has no size intersection with the recipe's room ranges.`, { relatedIds: [archetypeId] },
    ));
  }

  // The acceptance audit below treats package reference errors as fatal. Run
  // the same pure audit once up front so an immutable missing object, item, or
  // profile does not waste every bounded layout attempt before failing for the
  // exact same reason. Warnings remain post-bake audit output and do not block
  // generation here.
  const packageReferences = auditGamePackageReferences(gamePackage, {
    knownGenerationRecipeIds: [
      ...gamePackage.dungeon_recipes.map((entry) => entry.id),
      recipe.id,
    ],
  });
  for (const issue of packageReferences.issues.filter((entry) => entry.severity === "error")) {
    diagnostics.push(dungeonDiagnostic(
      "fatal",
      "recipe",
      issue.code,
      `${issue.path}: ${issue.message}`,
      {
        mapId: issue.mapId,
        cell: issue.cell,
        relatedIds: issue.reference ? [issue.reference] : undefined,
      },
    ));
  }
  return { diagnostics, valid: !diagnostics.some((entry) => entry.severity === "fatal") };
};

export interface DungeonValidationInput {
  recipe: DungeonRecipeDef;
  gamePackage: GamePackage;
  bake: DungeonBakeResult;
}

export interface DungeonValidationResult {
  reports: MapValidationReport[];
  referenceReport: ReferenceAuditReport;
}

export const validateDungeonBake = (
  input: DungeonValidationInput,
): DungeonStageOutput<DungeonValidationResult> => {
  const generatedIds = new Set(input.bake.maps.map((map) => map.id));
  const packageWithMaps = GamePackageSchema.parse({
    ...input.gamePackage,
    maps: [...input.gamePackage.maps.filter((map) => !generatedIds.has(map.id)), ...input.bake.maps],
  });
  const diagnostics: DungeonDiagnostic[] = [];
  const reports = input.bake.maps.map((map: MapData) => {
    const objectiveCell = input.bake.objectiveCells[map.id];
    const report = validateOrdinaryMap(map, {
      package: packageWithMaps,
      primarySpawnId: input.bake.primarySpawnIds[map.id],
      requiredCells: objectiveCell ? [{ id: "objective", cell: objectiveCell }] : [],
      requiredExitIds: map.exits.map((exit) => exit.id).filter((id): id is string => Boolean(id)),
      returnRouteRequired: input.recipe.topology.requireReturnPath,
      safeStartRadius: 2,
    });
    for (const issue of report.issues) diagnostics.push(dungeonDiagnostic(
      issue.severity === "error" ? "fatal" : issue.severity,
      "audit",
      issue.code,
      issue.message,
      { mapId: map.id, cell: issue.cells?.[0], relatedIds: issue.placementIds },
    ));
    return report;
  });
  const referenceReport = auditGamePackageReferences(packageWithMaps, { knownGenerationRecipeIds: [input.recipe.id] });
  for (const issue of referenceReport.issues) diagnostics.push(dungeonDiagnostic(
    issue.severity === "error" ? "fatal" : issue.severity,
    "audit", issue.code, issue.message,
    { mapId: issue.mapId, cell: issue.cell, relatedIds: issue.reference ? [issue.reference] : undefined },
  ));
  const metrics = {
    validationErrors: reports.reduce((sum, report) => sum + report.issues.filter((issue) => issue.severity === "error").length, 0),
    referenceErrors: referenceReport.counts.errors,
  };
  return diagnostics.some((entry) => entry.severity === "fatal")
    ? failedStage(diagnostics, metrics)
    : successfulStage({ reports, referenceReport }, diagnostics, metrics);
};
