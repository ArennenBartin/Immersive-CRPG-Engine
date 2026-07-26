// First-person crawler support for the fine ("micro") grid.
//
// The authored view mode is a per-game presentation choice: the simulation
// (movement legality, energy, LOS, perception, combat) is identical in both
// views. First person only changes the camera, the fog presentation, and how
// held keys resolve into fine-grid steps: W/S step along the current facing,
// A/D turn the facing through the 8-direction ring in 45° increments, and Q/E
// strafe without turning. Combat, targeting, party command, and story beats
// always fall back to the tactical isometric camera; first person is an
// exploration-only stance.

export type AuthoredViewMode = "isometric" | "first_person";

export const resolveAuthoredViewMode = (
  settings: Record<string, unknown> | undefined | null,
): AuthoredViewMode =>
  settings?.view_mode === "first_person" ? "first_person" : "isometric";

// Exploration is the only camera mode that stays in first person. Every other
// play camera (tactical combat/targeting, story panels) needs the top-down
// readable view its UI was designed for.
export const isFirstPersonExploreActive = (
  viewMode: AuthoredViewMode,
  cameraMode: "explore" | "tactical" | "story",
): boolean => viewMode === "first_person" && cameraMode === "explore";

// The 8 legal facings, clockwise as seen from above (+x east, +z south).
// Index order matters: rotating by ±1 step is a 45° turn, ±2 is a strafe
// basis rotation.
export const FIRST_PERSON_FACING_RING: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

const facingRingIndex = (facing: readonly [number, number]): number => {
  const fx = Math.sign(facing[0]);
  const fz = Math.sign(facing[1]);
  const index = FIRST_PERSON_FACING_RING.findIndex(
    (candidate) => candidate[0] === fx && candidate[1] === fz,
  );
  return index >= 0 ? index : 0;
};

// Saves normalize facing through Math.sign already, but a zero vector can
// arrive from malformed data; treat it as north so turning stays defined.
export const normalizeFirstPersonFacing = (
  facing: readonly [number, number] | undefined | null,
): [number, number] => {
  if (!facing) return [0, -1];
  const fx = Math.sign(facing[0]);
  const fz = Math.sign(facing[1]);
  if (fx === 0 && fz === 0) return [0, -1];
  return [fx, fz];
};

// Turn the facing by `steps` 45° increments; positive is clockwise (a right
// turn as seen on screen).
export const rotateFacing45 = (
  facing: readonly [number, number],
  steps: number,
): [number, number] => {
  const index = facingRingIndex(normalizeFirstPersonFacing(facing));
  const next =
    FIRST_PERSON_FACING_RING[(((index + steps) % 8) + 8) % 8];
  return [next[0], next[1]];
};

export interface HeldFirstPersonIntent {
  /** +1 step toward facing, -1 backstep, 0 none. */
  forward: number;
  /** +1 turn clockwise (right), -1 counterclockwise (left), 0 none. */
  turn: number;
  /** +1 strafe right, -1 strafe left, 0 none. */
  strafe: number;
  wait: boolean;
}

// The crawler-mode counterpart of resolveHeldMovementIntent: same held/consumed
// key discipline, different semantics. Arrow keys mirror WASD so the virtual
// joystick's synthesized arrows drive forward/turn without any joystick-side
// special casing.
export const resolveHeldFirstPersonIntent = (
  heldKeys: ReadonlySet<string>,
  consumedKeys: ReadonlySet<string>,
): HeldFirstPersonIntent => {
  const held = (key: string) => heldKeys.has(key) && !consumedKeys.has(key);
  let forward = 0;
  let turn = 0;
  let strafe = 0;
  if (held("arrowup") || held("w")) forward += 1;
  if (held("arrowdown") || held("s")) forward -= 1;
  if (held("arrowleft") || held("a")) turn -= 1;
  if (held("arrowright") || held("d")) turn += 1;
  if (held("q")) strafe -= 1;
  if (held("e")) strafe += 1;
  return {
    forward,
    turn,
    strafe,
    wait: held("z") || held("."),
  };
};

// Resolve forward/strafe pressure into one fine-grid step relative to the
// facing. Components clamp to a single cell so a diagonal facing plus a
// strafe cannot produce a two-cell lunge.
export const firstPersonStepVector = (
  facing: readonly [number, number],
  forward: number,
  strafe: number,
): [number, number] => {
  const face = normalizeFirstPersonFacing(facing);
  const right = rotateFacing45(face, 2);
  const clampComponent = (value: number) => {
    const clamped = Math.max(-1, Math.min(1, value));
    return clamped === 0 ? 0 : clamped;
  };
  return [
    clampComponent(forward * face[0] + strafe * right[0]),
    clampComponent(forward * face[1] + strafe * right[1]),
  ];
};

// ── First-person atmosphere ────────────────────────────────────────────────
// The isometric camera reads the world from ~36 units away, so its scene fog
// starts far outside the playfield. At eye height the same fog would never be
// visible, while the authoritative sight radius (8 macro tiles = 8 world
// units) would end in an abrupt black wall. These presets keep one shared
// scene-fog rig and swap its targets with the camera stance.
export interface PlayAtmosphereProfile {
  background: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
}

export const ISOMETRIC_ATMOSPHERE: PlayAtmosphereProfile = {
  background: "#111735",
  fogColor: "#161D36",
  fogNear: 78,
  fogFar: 190,
};

export const FIRST_PERSON_ATMOSPHERE: PlayAtmosphereProfile = {
  background: "#0b0f22",
  fogColor: "#10152e",
  fogNear: 2.4,
  fogFar: 11.5,
};

// Unseen structure in first person lifts to a deep haze —
// FIRST_PERSON_UNSEEN_STRUCTURE_COLOR in lightRendering.ts owns that value
// alongside the other fog colors.

export const FIRST_PERSON_EYE_HEIGHT = 0.62;
export const FIRST_PERSON_FOV = 68;
