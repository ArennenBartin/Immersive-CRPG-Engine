/// <reference lib="webworker" />

import type {
  DungeonGeneratorWorkerRequest,
  DungeonGeneratorWorkerResponse,
} from "./dungeonGeneratorWorkerProtocol";
import { runDungeonGeneratorWorkerRequest } from "./dungeonGeneratorWorkerCore";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

const post = (response: DungeonGeneratorWorkerResponse) => workerScope.postMessage(response);

workerScope.onmessage = (event: MessageEvent<DungeonGeneratorWorkerRequest>) => {
  if (event.data.type !== "generate") return;
  const request = event.data;
  try {
    // Studio cancellation terminates this worker. Core callbacks therefore
    // remain independent from wall-clock time and partial mutable UI state.
    const result = runDungeonGeneratorWorkerRequest(request, {
      shouldCancel: () => false,
      onProgress: (progress) => post({
        type: "progress",
        stage: request.stage,
        requestId: request.requestId,
        progress,
      }),
    });
    post(result);
  } catch (error) {
    post({
      type: "error",
      stage: request.stage,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
