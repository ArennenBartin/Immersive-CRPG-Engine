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

export type HeldInputRepeatContext = {
  inCombat: boolean;
  enemyNearby: boolean;
  locomotionHeld: boolean;
};

export type CombatInputTransition = {
  previousTurnId: string | null;
  nextTurnId: string | null;
  explorationActorId?: string;
};

export type PlayVisualScalePreset =
  | "performance"
  | "balanced"
  | "high"
  | "ultra";

// Level Zero expands its authored 33×33 macro grid to 9,801 fine runtime
// cells. Keep it on the large-scene budgets instead of missing the old
// 10,000-cell cutoff by a single fine row.
export const LARGE_PLAY_MAP_CELL_THRESHOLD = 9_000;

const PLAY_RENDER_RADIUS_MACRO: Record<PlayVisualScalePreset, number> = {
  performance: 8,
  balanced: 10,
  high: 12,
  ultra: 14,
};

const LARGE_MAP_RENDER_RADIUS_MACRO_CAP: Record<
  PlayVisualScalePreset,
  number
> = {
  performance: 7,
  balanced: 8,
  high: 10,
  ultra: 12,
};

const PLAY_ARCHITECTURE_RADIUS_MACRO: Record<
  PlayVisualScalePreset,
  number
> = {
  performance: 18,
  balanced: 22,
  high: 26,
  ultra: 30,
};

const LARGE_MAP_ARCHITECTURE_RADIUS_MACRO_CAP: Record<
  PlayVisualScalePreset,
  number
> = {
  performance: 16,
  balanced: 19,
  high: 22,
  ultra: 25,
};

const SMALL_MAP_FRAME_INTERVAL_MS: Record<PlayVisualScalePreset, number> = {
  performance: 1000 / 30,
  balanced: 1000 / 45,
  high: 1000 / 45,
  ultra: 1000 / 60,
};

const LARGE_MAP_FRAME_INTERVAL_MS: Record<PlayVisualScalePreset, number> = {
  performance: 1000 / 30,
  balanced: 1000 / 30,
  high: 1000 / 45,
  ultra: 1000 / 45,
};

// A persistent chunk renderer keeps large authored topology out of React's
// movement path and submits only the nearby spatial diamond. Those scenes no
// longer need the conservative cadence that protects legacy large maps from
// rebuilding broad cell windows. Performance remains an explicit 30 Hz
// choice; the presentation-oriented presets can use smooth chase-camera
// cadence and let the adaptive DPR probe manage actual GPU pressure.
const CHUNKED_LARGE_MAP_FRAME_INTERVAL_MS: Record<
  PlayVisualScalePreset,
  number
> = {
  performance: 1000 / 30,
  balanced: 1000 / 45,
  high: 1000 / 60,
  ultra: 1000 / 60,
};

const LARGE_MAP_DPR_CAP: Record<PlayVisualScalePreset, number> = {
  performance: 1,
  balanced: 1.15,
  high: 1.25,
  ultra: 1.4,
};

const LARGE_MAP_POINT_LIGHT_CAP: Record<PlayVisualScalePreset, number> = {
  performance: 2,
  balanced: 3,
  high: 3,
  ultra: 4,
};

export const isLargePlayMap = (mapCellCount: number): boolean =>
  Number.isFinite(mapCellCount) &&
  mapCellCount >= LARGE_PLAY_MAP_CELL_THRESHOLD;

export const resolvePlayRenderRadiusMacro = (
  preset: PlayVisualScalePreset,
  mapCellCount: number,
): number =>
  isLargePlayMap(mapCellCount)
    ? Math.min(
        PLAY_RENDER_RADIUS_MACRO[preset],
        LARGE_MAP_RENDER_RADIUS_MACRO_CAP[preset],
      )
    : PLAY_RENDER_RADIUS_MACRO[preset];

// Full materials, animated models, and physical lights remain in the near
// field. A much larger architecture-only field can then preserve real map
// silhouettes without paying the full scene cost or exposing the void.
export const resolvePlayArchitectureRadiusMacro = (
  preset: PlayVisualScalePreset,
  mapCellCount: number,
): number =>
  isLargePlayMap(mapCellCount)
    ? Math.min(
        PLAY_ARCHITECTURE_RADIUS_MACRO[preset],
        LARGE_MAP_ARCHITECTURE_RADIUS_MACRO_CAP[preset],
      )
    : PLAY_ARCHITECTURE_RADIUS_MACRO[preset];

// Camera motion needs more than the previous universal 30 Hz cap on compact
// maps. Large maps retain conservative submission rates while the adaptive DPR
// probe continues to manage pixel cost inside each cadence.
export const resolvePlayFrameIntervalMs = (
  preset: PlayVisualScalePreset,
  mapCellCount: number,
  persistentChunkArchitecture = false,
): number =>
  (isLargePlayMap(mapCellCount)
    ? persistentChunkArchitecture
      ? CHUNKED_LARGE_MAP_FRAME_INTERVAL_MS
      : LARGE_MAP_FRAME_INTERVAL_MS
    : SMALL_MAP_FRAME_INTERVAL_MS)[preset];

export const resolvePlayDprCap = (
  preset: PlayVisualScalePreset,
  requestedCap: number,
  mapCellCount: number,
): number =>
  isLargePlayMap(mapCellCount)
    ? Math.min(requestedCap, LARGE_MAP_DPR_CAP[preset])
    : requestedCap;

export const resolvePlayPointLightBudget = (
  preset: PlayVisualScalePreset,
  requestedBudget: number,
  mapCellCount: number,
): number =>
  Math.max(
    0,
    Math.floor(
      isLargePlayMap(mapCellCount)
        ? Math.min(requestedBudget, LARGE_MAP_POINT_LIGHT_CAP[preset])
        : requestedBudget,
    ),
  );

// Third-person presentation lights are the only play lights that normally
// allocate live shadow maps. Dense scenes trade those maps for a stable frame
// cadence; authored lighting and all non-shadow illumination remain intact.
export const shouldEnableThirdPersonShadowMaps = (
  preset: PlayVisualScalePreset,
  mapCellCount: number,
  bottomPanelOpen: boolean,
): boolean =>
  !bottomPanelOpen &&
  preset !== "performance" &&
  !isLargePlayMap(mapCellCount);

// The composer adds multiple full-screen framebuffer passes. Large scenes
// reserve that GPU cost for Ultra; compact High scenes retain the established
// post-processing stack, while Performance and Balanced stay composer-free.
export const shouldEnablePlayScreenFx = (
  preset: PlayVisualScalePreset,
  largeScene: boolean,
): boolean =>
  (preset === "high" || preset === "ultra") &&
  (!largeScene || preset === "ultra");

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

const NO_CONSUMED_LIVE_MOVEMENT_KEYS: ReadonlySet<string> = new Set();

// Tap-consumption is a keyup de-duplication concern. A physically held key
// must remain live in the RAF loop even if it participated in a quick chord;
// otherwise releasing one half of that chord can freeze the other half until
// it is released and pressed again.
export const resolveLiveHeldMovementIntent = (
  heldKeys: ReadonlySet<string>,
): HeldMovementIntent =>
  resolveHeldMovementIntent(heldKeys, NO_CONSUMED_LIVE_MOVEMENT_KEYS);

// Nearby enemies used to suppress the entire held-input repeat loop. That
// made a single press turn Steve, then froze translation while an aggressive
// real-time enemy was nearby. Locomotion must always keep repeating; the
// proximity guard remains only for wait/turn-only repeats outside combat.
export const shouldDispatchHeldInputRepeat = ({
  inCombat,
  enemyNearby,
  locomotionHeld,
}: HeldInputRepeatContext): boolean =>
  inCombat || locomotionHeld || !enemyNearby;

// Detection can begin combat in the middle of a held movement command. Keep
// that physical hold only when control remains on the exploration actor.
// Actual actor-to-actor turn changes still require a fresh press so input
// cannot leak into a party member's turn.
export const shouldPreserveHeldInputOnCombatStart = ({
  previousTurnId,
  nextTurnId,
  explorationActorId = "player",
}: CombatInputTransition): boolean =>
  previousTurnId === null && nextTurnId === explorationActorId;

// Every quality preset uses a demand-loop Canvas with one bounded invalidation
// clock. This caps ProMotion displays at the engine's intended cadence instead
// of rendering the complete scene at 120 Hz. Hidden pages stay dormant.
export const shouldDriveDemandFrames = ({
  pageVisible,
}: DemandFrameContext): boolean => pageVisible;

// Persistent authored chunks are actor-centered and invariant under camera
// yaw. Publishing a 12-degree direction bucket for them only rerenders the
// complete Play tree and re-filters the streamed simulation cells without
// changing any architecture that can be seen.
export const shouldUseThirdPersonDirectionalStreaming = (
  thirdPersonActive: boolean,
  persistentChunkArchitecture: boolean,
): boolean => thirdPersonActive && !persistentChunkArchitecture;

// Grid movement accepts eight directions. Scale the repeat period by the
// resolved vector length so a diagonal hold covers world distance at the same
// rate as a cardinal hold. A zero vector (used by wait-like input) retains the
// base cadence.
export const getNormalizedMovementRepeatIntervalMs = (
  baseIntervalMs: number,
  dx: number,
  dz: number,
): number => baseIntervalMs * Math.max(1, Math.hypot(dx, dz));
