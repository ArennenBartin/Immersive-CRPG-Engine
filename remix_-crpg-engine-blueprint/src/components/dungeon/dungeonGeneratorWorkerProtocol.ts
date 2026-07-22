import type {
  CreateFractureDungeonDraftResult,
  FractureDungeonBakeResult,
  FractureDungeonDraft,
} from "../../engine-core/fractureDungeonGeneration";
import type {
  DungeonGenerationProgress,
  DungeonGenerationResult,
  DungeonRecipeDef,
} from "../../dungeonGen";
import type { GamePackage } from "../../schema/game";

interface WorkerRequestBase {
  requestId: string;
  gamePackage: GamePackage;
  debug: boolean;
}

export type DungeonGeneratorWorkerRequest =
  | (WorkerRequestBase & {
    type: "generate";
    stage: "full";
    recipe: DungeonRecipeDef;
    generatedAt: string;
  })
  | (WorkerRequestBase & {
    type: "generate";
    stage: "draft";
    recipe: DungeonRecipeDef;
  })
  | (WorkerRequestBase & {
    type: "generate";
    stage: "geometry";
    draft: FractureDungeonDraft;
    generatedAt: string;
  });

export type DungeonGeneratorWorkerRequestPayload =
  DungeonGeneratorWorkerRequest extends infer Request
    ? Request extends { requestId: string }
      ? Omit<Request, "requestId">
      : never
    : never;

export type DungeonGeneratorWorkerResult =
  | {
    type: "result";
    stage: "full";
    requestId: string;
    result: DungeonGenerationResult;
  }
  | {
    type: "result";
    stage: "draft";
    requestId: string;
    result: CreateFractureDungeonDraftResult;
  }
  | {
    type: "result";
    stage: "geometry";
    requestId: string;
    result: FractureDungeonBakeResult;
    durationMs: number;
  };

export type DungeonGeneratorWorkerResponse =
  | DungeonGeneratorWorkerResult
  | {
    type: "progress";
    stage: DungeonGeneratorWorkerRequest["stage"];
    requestId: string;
    progress: DungeonGenerationProgress;
  }
  | {
    type: "error";
    stage: DungeonGeneratorWorkerRequest["stage"];
    requestId: string;
    error: string;
  };
