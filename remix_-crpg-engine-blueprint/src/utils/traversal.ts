import type { CellData } from "../schema/game";
import { getJamEngineVisualHeight } from "./legacyJamCompatibility";

// visual_height is rendered at half scale, so one authored height unit is a
// half-cell curb/step in the 3D world. Ordinary locomotion may negotiate that
// much in either direction; larger changes require stairs, a ramp, or another
// explicit traversal mechanic.
export const MAX_AUTOMATIC_STEP_VISUAL_HEIGHT = 1;

export const getTraversalVisualHeight = (
  cell: Pick<CellData, "y" | "visual_height"> &
    Partial<Pick<CellData, "object_id" | "tag" | "walkable" | "blocks_los">> | null | undefined,
) => (cell?.y || 0) * 2 + getJamEngineVisualHeight(cell);

export const getAutomaticStepHeightDelta = (
  current: Parameters<typeof getTraversalVisualHeight>[0],
  target: Parameters<typeof getTraversalVisualHeight>[0],
) => getTraversalVisualHeight(target) - getTraversalVisualHeight(current);

export const canAutomaticallyStepBetween = (
  current: Parameters<typeof getTraversalVisualHeight>[0],
  target: Parameters<typeof getTraversalVisualHeight>[0],
) =>
  Math.abs(getAutomaticStepHeightDelta(current, target)) <=
  MAX_AUTOMATIC_STEP_VISUAL_HEIGHT + 1e-6;
