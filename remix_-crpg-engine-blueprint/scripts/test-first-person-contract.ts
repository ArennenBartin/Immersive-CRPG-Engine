import assert from "node:assert/strict";
import {
  FIRST_PERSON_ATMOSPHERE,
  FIRST_PERSON_FACING_RING,
  FIRST_PERSON_MAX_PITCH_RADIANS,
  FIRST_PERSON_TURN_HOLD_START_MS,
  FIRST_PERSON_TURN_REPEAT_MS,
  ISOMETRIC_ATMOSPHERE,
  firstPersonStepVector,
  isFirstPersonExploreActive,
  normalizeFirstPersonFacing,
  resolveAuthoredViewMode,
  resolveFirstPersonPitchTarget,
  resolveHeldFirstPersonIntent,
  rotateFacing45,
} from "../src/utils/firstPersonControls";
import {
  FIRST_PERSON_UNSEEN_STRUCTURE_COLOR,
  MEMORY_FOG_COLOR,
  UNKNOWN_FOG_COLOR,
  resolveStaticFogMaterialPolicy,
} from "../src/utils/lightRendering";

// ── Authored view mode ─────────────────────────────────────────────────────
assert.equal(
  resolveAuthoredViewMode(undefined),
  "isometric",
  "missing settings must default to the isometric view",
);
assert.equal(
  resolveAuthoredViewMode({}),
  "isometric",
  "settings without view_mode must default to the isometric view",
);
assert.equal(
  resolveAuthoredViewMode({ view_mode: "first_person" }),
  "first_person",
  "an authored first_person view must be honored",
);
assert.equal(
  resolveAuthoredViewMode({ view_mode: "banana" }),
  "isometric",
  "unknown view_mode values must fall back to isometric",
);

// First person is exploration-only; combat/targeting and story cameras always
// return to the tactical isometric presentation.
assert.equal(isFirstPersonExploreActive("first_person", "explore"), true);
assert.equal(isFirstPersonExploreActive("first_person", "tactical"), false);
assert.equal(isFirstPersonExploreActive("first_person", "story"), false);
assert.equal(isFirstPersonExploreActive("isometric", "explore"), false);

// ── 8-direction facing ring ────────────────────────────────────────────────
assert.equal(FIRST_PERSON_FACING_RING.length, 8, "the facing ring is 8 wide");

// A full clockwise revolution returns to the starting facing, hitting every
// ring entry exactly once.
{
  let facing: [number, number] = [0, -1];
  const seen = new Set<string>();
  for (let step = 0; step < 8; step += 1) {
    seen.add(`${facing[0]}:${facing[1]}`);
    facing = rotateFacing45(facing, 1);
  }
  assert.equal(seen.size, 8, "eight clockwise turns must visit all 8 facings");
  assert.deepEqual(facing, [0, -1], "eight 45° turns must complete the circle");
}

assert.deepEqual(rotateFacing45([0, -1], 1), [1, -1], "north turns right to northeast");
assert.deepEqual(rotateFacing45([0, -1], -1), [-1, -1], "north turns left to northwest");
assert.deepEqual(rotateFacing45([1, 1], 1), [0, 1], "southeast turns right to south");
assert.deepEqual(rotateFacing45([-1, 0], -1), [-1, 1], "west turns left to southwest");
assert.deepEqual(
  rotateFacing45([0, 0], 1),
  [1, -1],
  "a malformed zero facing normalizes to north before turning",
);
assert.deepEqual(normalizeFirstPersonFacing([3, -2]), [1, -1], "facing normalizes by sign");
assert.deepEqual(normalizeFirstPersonFacing(null), [0, -1], "missing facing defaults north");

// ── Held-key intent ────────────────────────────────────────────────────────
{
  const intent = resolveHeldFirstPersonIntent(new Set(["w", "d"]), new Set());
  assert.deepEqual(
    {
      forward: intent.forward,
      turn: intent.turn,
      strafe: intent.strafe,
      pitch: intent.pitch,
      wait: intent.wait,
    },
    { forward: 1, turn: 1, strafe: 0, pitch: 0, wait: false },
    "W+D holds forward pressure and a clockwise turn",
  );
}
{
  const intent = resolveHeldFirstPersonIntent(
    new Set(["arrowup", "arrowleft"]),
    new Set(),
  );
  assert.deepEqual(
    { forward: intent.forward, turn: intent.turn, strafe: intent.strafe },
    { forward: 1, turn: -1, strafe: 0 },
    "synthesized joystick arrows resolve to forward plus a left turn",
  );
}
{
  const intent = resolveHeldFirstPersonIntent(new Set(["w", "s"]), new Set());
  assert.deepEqual(
    { forward: intent.forward, turn: intent.turn, strafe: intent.strafe },
    { forward: 0, turn: 0, strafe: 0 },
    "opposing holds cancel to no pressure",
  );
}
{
  const intent = resolveHeldFirstPersonIntent(new Set(["w", "z"]), new Set(["w"]));
  assert.equal(intent.forward, 0, "consumed tap keys stay inert until release");
  assert.equal(intent.wait, true, "wait aliases still resolve in first person");
}

// Shift converts the A/D turn into a strafe, keeping lateral movement
// reachable now that Q/E own the look pitch.
{
  const turning = resolveHeldFirstPersonIntent(new Set(["a"]), new Set());
  assert.deepEqual(
    { turn: turning.turn, strafe: turning.strafe },
    { turn: -1, strafe: 0 },
    "A alone turns left",
  );
  const strafing = resolveHeldFirstPersonIntent(new Set(["a", "shift"]), new Set());
  assert.deepEqual(
    { turn: strafing.turn, strafe: strafing.strafe },
    { turn: 0, strafe: -1 },
    "Shift+A strafes left instead of turning",
  );
  const strafingRight = resolveHeldFirstPersonIntent(
    new Set(["d", "shift", "w"]),
    new Set(),
  );
  assert.deepEqual(
    {
      forward: strafingRight.forward,
      turn: strafingRight.turn,
      strafe: strafingRight.strafe,
    },
    { forward: 1, turn: 0, strafe: 1 },
    "Shift+W+D walks forward-right without rotating",
  );
}

// ── Look pitch (Q/E) ───────────────────────────────────────────────────────
{
  assert.equal(
    resolveHeldFirstPersonIntent(new Set(["q"]), new Set()).pitch,
    1,
    "Q looks up while held",
  );
  assert.equal(
    resolveHeldFirstPersonIntent(new Set(["e"]), new Set()).pitch,
    -1,
    "E looks down while held",
  );
  assert.equal(
    resolveHeldFirstPersonIntent(new Set(["q", "e"]), new Set()).pitch,
    0,
    "holding both cancels to level",
  );
  // Releasing the key must leave no residual pitch pressure — the camera rig
  // damps back to level from a zero target.
  assert.equal(
    resolveHeldFirstPersonIntent(new Set(), new Set()).pitch,
    0,
    "releasing Q/E returns the pitch input to level",
  );
  // Pitch is presentation-only: it must never become movement or turning.
  const looking = resolveHeldFirstPersonIntent(new Set(["q"]), new Set());
  assert.deepEqual(
    { forward: looking.forward, turn: looking.turn, strafe: looking.strafe },
    { forward: 0, turn: 0, strafe: 0 },
    "looking up commands no movement, turn, or strafe",
  );

  assert.equal(
    resolveFirstPersonPitchTarget(1),
    FIRST_PERSON_MAX_PITCH_RADIANS,
    "full up pressure reaches the authored maximum tilt",
  );
  assert.equal(
    resolveFirstPersonPitchTarget(-1),
    -FIRST_PERSON_MAX_PITCH_RADIANS,
    "full down pressure reaches the authored maximum tilt",
  );
  assert.equal(resolveFirstPersonPitchTarget(0), 0, "no pressure is level");
  assert.equal(
    resolveFirstPersonPitchTarget(4),
    FIRST_PERSON_MAX_PITCH_RADIANS,
    "pitch pressure clamps and cannot exceed the maximum tilt",
  );
  assert.ok(
    FIRST_PERSON_MAX_PITCH_RADIANS > 0 &&
      FIRST_PERSON_MAX_PITCH_RADIANS < Math.PI / 2,
    "max pitch stays short of straight up/down so the horizon never inverts",
  );
}

// ── Turn cadence ───────────────────────────────────────────────────────────
// The bug this guards: reusing the fast movement hold delay for turning let a
// single ~150 ms keypress fire twice and overshoot by 90°. Auto-repeat must
// not engage until well past the length of an ordinary tap.
{
  const TYPICAL_KEYPRESS_MS = 150;
  assert.ok(
    FIRST_PERSON_TURN_HOLD_START_MS > TYPICAL_KEYPRESS_MS * 2,
    "a held turn must not auto-repeat within the span of an ordinary keypress",
  );
  assert.ok(
    FIRST_PERSON_TURN_HOLD_START_MS > FIRST_PERSON_TURN_REPEAT_MS,
    "the first repeat waits longer than the steady held cadence",
  );
  assert.ok(
    FIRST_PERSON_TURN_REPEAT_MS >= 120,
    "sustained turning stays a deliberate beat rather than a spin",
  );
}

// ── Step vectors on the fine grid ──────────────────────────────────────────
assert.deepEqual(firstPersonStepVector([0, -1], 1, 0), [0, -1], "forward steps along facing");
assert.deepEqual(firstPersonStepVector([0, -1], -1, 0), [0, 1], "backstep opposes facing");
assert.deepEqual(firstPersonStepVector([0, -1], 0, 1), [1, 0], "right strafe from north is east");
assert.deepEqual(firstPersonStepVector([0, -1], 0, -1), [-1, 0], "left strafe from north is west");
assert.deepEqual(
  firstPersonStepVector([1, -1], 1, 0),
  [1, -1],
  "a diagonal facing steps diagonally across the fine grid",
);
assert.deepEqual(
  firstPersonStepVector([1, -1], 0, 1),
  [1, 1],
  "strafing right of a northeast facing moves southeast",
);
assert.deepEqual(
  firstPersonStepVector([0, -1], 1, 1),
  [1, -1],
  "forward plus strafe combines into a single diagonal fine step",
);
assert.deepEqual(
  firstPersonStepVector([1, -1], 1, 1),
  [1, 0],
  "combined pressure clamps each component to one fine cell",
);

// ── Fog presentation variants ──────────────────────────────────────────────
{
  const isoUnseen = resolveStaticFogMaterialPolicy("unseen");
  assert.equal(isoUnseen.tint, UNKNOWN_FOG_COLOR, "isometric unseen stays pure black");
  assert.equal(isoUnseen.sceneFog, false, "isometric flat fog ignores scene fog");

  const fpUnseen = resolveStaticFogMaterialPolicy("unseen", "first_person");
  assert.equal(
    fpUnseen.tint,
    FIRST_PERSON_UNSEEN_STRUCTURE_COLOR,
    "first-person unseen lifts to the deep haze color",
  );
  assert.equal(
    fpUnseen.sceneFog,
    true,
    "first-person unseen participates in scene fog so distance dissolves it",
  );
  assert.equal(fpUnseen.flatUnlit, true, "the haze stays an unlit silhouette");

  const fpExplored = resolveStaticFogMaterialPolicy("explored", "first_person");
  assert.equal(
    fpExplored.tint,
    MEMORY_FOG_COLOR,
    "remembered architecture keeps its indigo memory identity in first person",
  );
  assert.equal(fpExplored.sceneFog, true, "memory silhouettes also take scene fog up close");

  const fpVisible = resolveStaticFogMaterialPolicy("visible", "first_person");
  assert.equal(fpVisible.flatUnlit, false, "visible geometry is untouched by the variant");
  assert.equal(fpVisible.brightness, 1, "visible brightness is authored");
}

// ── Atmosphere presets ─────────────────────────────────────────────────────
// The authoritative sight radius is 8 macro tiles = 8 world units; the
// first-person fog band must cover that edge so the boundary dissolves
// instead of ending in a wall of black.
assert.ok(
  FIRST_PERSON_ATMOSPHERE.fogNear < 8 && FIRST_PERSON_ATMOSPHERE.fogFar > 8,
  "first-person fog must straddle the 8-unit sight radius",
);
assert.ok(
  FIRST_PERSON_ATMOSPHERE.fogNear < FIRST_PERSON_ATMOSPHERE.fogFar,
  "fog near must precede far",
);
assert.ok(
  ISOMETRIC_ATMOSPHERE.fogNear > 30,
  "isometric fog stays outside the playfield the top-down camera reads",
);

console.log(
  "First Person contract passed: authored view mode, exploration-only activation, 45° facing ring, crawler intent, Shift strafe, Q/E look pitch, one-tap-one-turn cadence, fine-grid step vectors, haze fog variant, and atmosphere presets.",
);
