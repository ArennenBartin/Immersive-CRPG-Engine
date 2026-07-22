import { generateDungeon, type DungeonGenerationProgress } from "../../dungeonGen";
import {
  bakeFractureDungeonDraft,
  createFractureDungeonDraft,
} from "../../engine-core/fractureDungeonGeneration";
import type {
  DungeonGeneratorWorkerRequest,
  DungeonGeneratorWorkerResult,
} from "./dungeonGeneratorWorkerProtocol";

export interface RunDungeonGeneratorWorkerRequestOptions {
  shouldCancel?: () => boolean;
  onProgress?: (progress: DungeonGenerationProgress) => void;
  now?: () => number;
}

/**
 * Environment-neutral worker entry point. The browser worker delegates here,
 * while headless tests can prove that every stage receives the same immutable
 * request snapshot and produces the same deterministic core output.
 */
export const runDungeonGeneratorWorkerRequest = (
  request: DungeonGeneratorWorkerRequest,
  options: RunDungeonGeneratorWorkerRequestOptions = {},
): DungeonGeneratorWorkerResult => {
  const shouldCancel = options.shouldCancel ?? (() => false);
  const now = options.now ?? (() => performance.now());
  if (request.stage === "full") {
    return {
      type: "result",
      stage: request.stage,
      requestId: request.requestId,
      result: generateDungeon({
        recipe: request.recipe,
        gamePackage: request.gamePackage,
        generatedAt: request.generatedAt,
        debug: request.debug,
        shouldCancel,
        onProgress: options.onProgress,
      }),
    };
  }
  if (request.stage === "draft") {
    options.onProgress?.({
      stage: "topology",
      attempt: 1,
      completedStages: 0,
      totalStages: 1,
      message: "Creating a non-destructive topology draft…",
    });
    return {
      type: "result",
      stage: request.stage,
      requestId: request.requestId,
      result: createFractureDungeonDraft({
        profile: request.recipe,
        gamePackage: request.gamePackage,
        debug: request.debug,
        shouldCancel,
      }),
    };
  }
  options.onProgress?.({
    stage: "geometry",
    attempt: request.draft.provenance.attemptIndex + 1,
    completedStages: 0,
    totalStages: 1,
    message: "Baking this exact topology into ordinary preview maps…",
  });
  const startedAt = now();
  const result = bakeFractureDungeonDraft({
    draft: request.draft,
    gamePackage: request.gamePackage,
    generatedAt: request.generatedAt,
    shouldCancel,
  });
  return {
    type: "result",
    stage: request.stage,
    requestId: request.requestId,
    result,
    durationMs: Math.max(0, now() - startedAt),
  };
};
