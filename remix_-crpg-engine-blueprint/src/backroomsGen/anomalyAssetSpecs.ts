import {
  BACKROOMS_BACKWARDS_DESK_OBJECT_ID,
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
  BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID,
  BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID,
  BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID,
  BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID,
  BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID,
  BACKROOMS_WRONG_CLOCK_OBJECT_ID,
  BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID,
} from "../data/backroomsAnomalyAssets";

export interface BackroomsAnomalyAssetPlacementSpec {
  objectId: string;
  anchor: "floor" | "wall" | "partition" | "reserved_room";
  /** Bottom-of-model lift; every validated GLB uses center_floor origin. */
  heightOffset: number;
  collisionPolicy: "none";
}

const spec = (
  objectId: string,
  anchor: BackroomsAnomalyAssetPlacementSpec["anchor"],
  heightOffset = 0,
): BackroomsAnomalyAssetPlacementSpec => ({
  objectId,
  anchor,
  heightOffset,
  collisionPolicy: "none",
});

/**
 * Runtime placement metadata intentionally lives outside ObjectData: the GLBs
 * all share the engine's center-floor origin contract, while installation
 * height and anomaly anchoring are generator semantics rather than mesh data.
 */
export const BACKROOMS_PHASE7_ANOMALY_ASSET_SPECS = [
  spec(BACKROOMS_DESK_OBJECT_ID, "floor"),
  spec(BACKROOMS_FILING_CABINET_OBJECT_ID, "floor"),
  spec(BACKROOMS_WRONG_CLOCK_OBJECT_ID, "wall", 1.42),
  spec(BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID, "wall", 0.92),
  spec(BACKROOMS_BACKWARDS_DESK_OBJECT_ID, "floor"),
  spec(BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID, "reserved_room"),
  spec(BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID, "wall", 1.72),
  spec(BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID, "floor"),
  spec(BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID, "partition"),
  spec(BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID, "wall"),
] as const satisfies readonly BackroomsAnomalyAssetPlacementSpec[];

export const backroomsPhase7AnomalyAssetSpecById = new Map(
  BACKROOMS_PHASE7_ANOMALY_ASSET_SPECS.map((entry) => [entry.objectId, entry]),
);
