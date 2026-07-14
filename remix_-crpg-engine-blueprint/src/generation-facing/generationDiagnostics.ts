import type { MapValidationReport } from "../engine-core/mapReadinessValidator";
import type { MapData } from "../schema/game";
import { hashMapOutput } from "./deterministicIds";
import { stableContentHash, stableJsonStringify } from "./stableHash";

export const GENERATION_DIAGNOSTICS_SCHEMA = "crpg_generation_diagnostics_v1" as const;

export interface GenerationTiming {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  retryCount: number;
}

export interface GenerationDiagnosticsInput {
  generatorId: string;
  generatorVersion: string;
  recipeId: string;
  recipeVersion: string;
  recipeSnapshot: unknown;
  seed: string;
  /** Named stream snapshots or deterministic derivation keys. */
  rngStreams: Record<string, unknown>;
  abstractGraph: unknown;
  spatialLayout: unknown;
  validationReport: MapValidationReport;
  outputMap: MapData;
  timing: GenerationTiming;
}

export interface GenerationDiagnosticsArtifact extends GenerationDiagnosticsInput {
  schema: typeof GENERATION_DIAGNOSTICS_SCHEMA;
  attemptId: string;
  outputHash: string;
}

const assertIsoTimestamp = (value: string, label: string) => {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
};

/**
 * Packages every replay/debug surface behind a generator-agnostic boundary.
 * The artifact contains only serializable data and the same baked ordinary map
 * that Studio, Play Mode, validation, and saves consume.
 */
export const createGenerationDiagnostics = (
  input: GenerationDiagnosticsInput,
): GenerationDiagnosticsArtifact => {
  assertIsoTimestamp(input.timing.startedAt, "timing.startedAt");
  assertIsoTimestamp(input.timing.finishedAt, "timing.finishedAt");
  if (!Number.isFinite(input.timing.durationMs) || input.timing.durationMs < 0) {
    throw new TypeError("timing.durationMs must be a finite non-negative number");
  }
  if (!Number.isInteger(input.timing.retryCount) || input.timing.retryCount < 0) {
    throw new TypeError("timing.retryCount must be a non-negative integer");
  }

  const outputHash = hashMapOutput(input.outputMap);
  if (input.outputMap.generation?.outputHash && input.outputMap.generation.outputHash !== outputHash) {
    throw new Error(
      `Generation diagnostics rejected stale output hash ${input.outputMap.generation.outputHash}; computed ${outputHash}`,
    );
  }
  const replayIdentity = {
    generatorId: input.generatorId,
    generatorVersion: input.generatorVersion,
    recipeId: input.recipeId,
    recipeVersion: input.recipeVersion,
    recipeSnapshot: input.recipeSnapshot,
    seed: input.seed,
    rngStreams: input.rngStreams,
    outputHash,
  };
  return structuredClone({
    schema: GENERATION_DIAGNOSTICS_SCHEMA,
    ...input,
    attemptId: stableContentHash(replayIdentity),
    outputHash,
  });
};

export const serializeGenerationDiagnostics = (
  artifact: GenerationDiagnosticsArtifact,
): string => `${stableJsonStringify(artifact)}\n`;
