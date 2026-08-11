import type {
  BackroomsAnchorRequest,
  BackroomsAnomalyProfileDef,
  BackroomsMapGenerationResult,
  BackroomsRecipeDef,
} from "../../backroomsGen";

export interface BackroomsGeneratorWorkerRequest {
  requestId: string;
  recipe: BackroomsRecipeDef;
  requiredAnchors: BackroomsAnchorRequest[];
  anomalyProfile: BackroomsAnomalyProfileDef;
}

export type BackroomsGeneratorWorkerResponse =
  | {
      requestId: string;
      ok: true;
      result: BackroomsMapGenerationResult;
    }
  | {
      requestId: string;
      ok: false;
      error: string;
    };
