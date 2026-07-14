/// <reference lib="webworker" />

import {
  generateDungeon,
  type DungeonRecipeDef,
} from "../../dungeonGen";
import type { GamePackage } from "../../schema/game";

interface GenerateWorkerRequest {
  type: "generate";
  requestId: string;
  recipe: DungeonRecipeDef;
  gamePackage: GamePackage;
  generatedAt: string;
  debug: boolean;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<GenerateWorkerRequest>) => {
  if (event.data.type !== "generate") return;
  const request = event.data;
  try {
    const result = generateDungeon({
      recipe: request.recipe,
      gamePackage: request.gamePackage,
      generatedAt: request.generatedAt,
      debug: request.debug,
      // Studio cancellation terminates this worker. The callback remains part
      // of the deterministic core contract and never depends on wall-clock
      // time or partial mutable UI state.
      shouldCancel: () => false,
      onProgress: (progress) => workerScope.postMessage({
        type: "progress",
        requestId: request.requestId,
        progress,
      }),
    });
    workerScope.postMessage({ type: "result", requestId: request.requestId, result });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};

