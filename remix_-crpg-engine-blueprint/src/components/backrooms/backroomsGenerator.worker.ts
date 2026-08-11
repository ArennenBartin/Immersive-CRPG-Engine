/// <reference lib="webworker" />

import { generateBackroomsMap } from "../../backroomsGen";
import type {
  BackroomsGeneratorWorkerRequest,
  BackroomsGeneratorWorkerResponse,
} from "./backroomsGeneratorWorkerProtocol";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<BackroomsGeneratorWorkerRequest>) => {
  const request = event.data;
  try {
    const result = generateBackroomsMap({
      recipe: request.recipe,
      requiredAnchors: request.requiredAnchors,
      anomalyProfile: request.anomalyProfile,
      generatedAt: new Date().toISOString(),
      debug: true,
    });
    workerScope.postMessage({ requestId: request.requestId, ok: true, result } satisfies BackroomsGeneratorWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Backrooms generation failed.",
    } satisfies BackroomsGeneratorWorkerResponse);
  }
};
