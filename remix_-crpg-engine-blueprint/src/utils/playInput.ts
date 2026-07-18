export type DemandFrameContext = {
  pageVisible: boolean;
  performanceMode: boolean;
  bottomPanelOpen: boolean;
};

export type HeldMovementIntent = {
  ax: number;
  az: number;
  wait: boolean;
};

// Resolve keyboard and virtual-joystick aliases through one path. Keys already
// consumed by a quick chord stay inert until their matching release so a
// partially released chord cannot become a second movement command.
export const resolveHeldMovementIntent = (
  heldKeys: ReadonlySet<string>,
  consumedKeys: ReadonlySet<string>,
): HeldMovementIntent => {
  const held = (key: string) => heldKeys.has(key) && !consumedKeys.has(key);
  let ax = 0;
  let az = 0;
  if (held("arrowup") || held("w")) az -= 1;
  if (held("arrowdown") || held("s")) az += 1;
  if (held("arrowleft") || held("a")) ax -= 1;
  if (held("arrowright") || held("d")) ax += 1;
  return {
    ax,
    az,
    wait: held("z") || held("."),
  };
};

// Every quality preset uses a demand-loop Canvas with one bounded invalidation
// clock. This caps ProMotion displays at the engine's intended cadence instead
// of rendering the complete scene at 120 Hz. Hidden pages stay dormant.
export const shouldDriveDemandFrames = ({
  pageVisible,
}: DemandFrameContext): boolean => pageVisible;

// Grid movement accepts eight directions. Scale the repeat period by the
// resolved vector length so a diagonal hold covers world distance at the same
// rate as a cardinal hold. A zero vector (used by wait-like input) retains the
// base cadence.
export const getNormalizedMovementRepeatIntervalMs = (
  baseIntervalMs: number,
  dx: number,
  dz: number,
): number => baseIntervalMs * Math.max(1, Math.hypot(dx, dz));
