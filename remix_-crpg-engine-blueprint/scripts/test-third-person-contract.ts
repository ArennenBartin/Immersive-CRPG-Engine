import assert from "node:assert/strict";
import {
  resolveAuthoredViewMode,
} from "../src/utils/firstPersonControls";
import {
  THIRD_PERSON_CHASE_DISTANCE,
  THIRD_PERSON_CHASE_HEIGHT,
  THIRD_PERSON_FACING_RING,
  THIRD_PERSON_FOCUS_HEIGHT,
  THIRD_PERSON_FOV,
  THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND,
  THIRD_PERSON_LOOK_AHEAD,
  THIRD_PERSON_MAX_PITCH_RADIANS,
  THIRD_PERSON_MIN_PITCH_RADIANS,
  THIRD_PERSON_PITCH_DRAG_SENSITIVITY,
  THIRD_PERSON_TURN_HOLD_START_MS,
  THIRD_PERSON_TURN_REPEAT_MS,
  THIRD_PERSON_YAW_DRAG_SENSITIVITY,
  applyThirdPersonKeyboardPitch,
  applyThirdPersonLookDelta,
  clampThirdPersonPitch,
  facingToThirdPersonYaw,
  isThirdPersonCameraActive,
  isThirdPersonStructuralCameraCell,
  quantizeYawToFacing,
  resolveHeldThirdPersonIntent,
  resolveThirdPersonCameraSubject,
  rotateThirdPersonFacing45,
  thirdPersonStepVector,
  wrapThirdPersonYaw,
} from "../src/utils/thirdPersonControls";
import {
  getInitialThirdPersonCameraPosition,
  resolveThirdPersonCameraCollisionFraction,
  type ThirdPersonCameraBlocker,
} from "../src/components/PlayScene3D";

// ── Authored mode and permanent camera ownership ──────────────────────────
assert.equal(
  resolveAuthoredViewMode({ view_mode: "third_person" }),
  "third_person",
  "an authored third_person view must be honored",
);
assert.equal(resolveAuthoredViewMode({ view_mode: "banana" }), "isometric");
assert.equal(isThirdPersonCameraActive("third_person", "explore"), true);
assert.equal(isThirdPersonCameraActive("third_person", "tactical"), true);
assert.equal(isThirdPersonCameraActive("third_person", "story"), true);
assert.equal(isThirdPersonCameraActive("first_person", "explore"), false);
assert.equal(isThirdPersonCameraActive("isometric", "tactical"), false);

// ── Strict eight-way tank intent ───────────────────────────────────────────
assert.equal(THIRD_PERSON_FACING_RING.length, 8);
{
  const intent = resolveHeldThirdPersonIntent(new Set(["w", "d"]), new Set());
  assert.deepEqual(
    intent,
    { forward: 1, turn: 1, pitch: 0, wait: false },
    "W+D means forward pressure plus one clockwise turn",
  );
  assert.equal(
    "strafe" in intent,
    false,
    "third-person tank intent must not expose a strafe channel",
  );
}
{
  const intent = resolveHeldThirdPersonIntent(
    new Set(["w", "a", "shift"]),
    new Set(),
  );
  assert.deepEqual(
    intent,
    { forward: 1, turn: -1, pitch: 0, wait: false },
    "Shift never converts an A/D turn into a strafe",
  );
}
{
  const intent = resolveHeldThirdPersonIntent(
    new Set(["arrowup", "arrowright"]),
    new Set(),
  );
  assert.deepEqual(
    intent,
    { forward: 1, turn: 1, pitch: 0, wait: false },
    "the left touch joystick's synthesized diagonal drives forward and turn",
  );
}
{
  const intent = resolveHeldThirdPersonIntent(
    new Set(["w", "s", "a", "d", "q", "e"]),
    new Set(),
  );
  assert.deepEqual(
    intent,
    { forward: 0, turn: 0, pitch: 0, wait: false },
    "opposing tank and pitch holds cancel",
  );
}
{
  const intent = resolveHeldThirdPersonIntent(
    new Set(["w", "z"]),
    new Set(["w"]),
  );
  assert.equal(intent.forward, 0, "consumed movement taps remain inert");
  assert.equal(intent.wait, true, "Z remains a wait alias");
  assert.equal(
    resolveHeldThirdPersonIntent(new Set(["."]), new Set()).wait,
    true,
    "period remains a wait alias",
  );
}
assert.equal(
  resolveHeldThirdPersonIntent(new Set(["q"]), new Set()).pitch,
  1,
  "Q raises camera pitch",
);
assert.equal(
  resolveHeldThirdPersonIntent(new Set(["e"]), new Set()).pitch,
  -1,
  "E lowers camera pitch",
);

// ── Fine-grid motion and turning ───────────────────────────────────────────
assert.deepEqual(thirdPersonStepVector([0, -1], 1), [0, -1]);
assert.deepEqual(thirdPersonStepVector([0, -1], -1), [0, 1]);
assert.deepEqual(thirdPersonStepVector([1, -1], 1), [1, -1]);
assert.deepEqual(thirdPersonStepVector([-1, 1], -1), [1, -1]);
assert.deepEqual(
  thirdPersonStepVector([1, 0], 5),
  [1, 0],
  "forward pressure clamps to one fine-grid cell",
);
assert.deepEqual(
  rotateThirdPersonFacing45([0, -1], 1),
  [1, -1],
  "a right turn advances exactly 45 degrees",
);

// ── Continuous yaw and authoritative quantization ─────────────────────────
for (const facing of THIRD_PERSON_FACING_RING) {
  const tuple: [number, number] = [facing[0], facing[1]];
  assert.deepEqual(
    quantizeYawToFacing(facingToThirdPersonYaw(tuple)),
    tuple,
    `yaw must round-trip the authoritative facing ${tuple.join(":")}`,
  );
}
assert.deepEqual(quantizeYawToFacing(Math.PI), [0, -1]);
assert.deepEqual(quantizeYawToFacing(0), [0, 1]);
assert.deepEqual(quantizeYawToFacing(Math.PI / 2), [1, 0]);
assert.equal(wrapThirdPersonYaw(Number.NaN), Math.PI);

{
  const startYaw = facingToThirdPersonYaw([0, -1]);
  const look = applyThirdPersonLookDelta(
    startYaw,
    0,
    200,
    -40,
    THIRD_PERSON_YAW_DRAG_SENSITIVITY,
    THIRD_PERSON_PITCH_DRAG_SENSITIVITY,
  );
  assert.ok(
    look.yaw < startYaw,
    "dragging right decreases engine yaw and turns the view right",
  );
  assert.ok(look.pitch > 0, "dragging upward raises the view");
  assert.notDeepEqual(
    look.authoritativeFacing,
    [0, -1],
    "enough continuous yaw updates the quantized authoritative facing",
  );
}

// ── Pitch limits and keyboard adjustment ──────────────────────────────────
assert.equal(clampThirdPersonPitch(Number.NaN), 0);
assert.equal(
  clampThirdPersonPitch(-Math.PI),
  THIRD_PERSON_MIN_PITCH_RADIANS,
);
assert.equal(
  clampThirdPersonPitch(Math.PI),
  THIRD_PERSON_MAX_PITCH_RADIANS,
);
assert.ok(
  THIRD_PERSON_MIN_PITCH_RADIANS > -Math.PI / 2 &&
    THIRD_PERSON_MAX_PITCH_RADIANS < Math.PI / 2,
  "pitch limits prevent inversion and an accidental overhead camera",
);
assert.equal(
  applyThirdPersonKeyboardPitch(0, 1, 0.5),
  THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND * 0.5,
  "Q pressure integrates at the authored pitch rate",
);
assert.equal(
  applyThirdPersonKeyboardPitch(0, -1, 100),
  THIRD_PERSON_MIN_PITCH_RADIANS,
  "held pitch input clamps at the lower limit",
);

// ── Camera profile and deliberate turn cadence ─────────────────────────────
assert.equal(THIRD_PERSON_CHASE_DISTANCE, 4);
assert.equal(THIRD_PERSON_CHASE_HEIGHT, 2.2);
assert.equal(THIRD_PERSON_FOCUS_HEIGHT, 0.9);
assert.equal(THIRD_PERSON_LOOK_AHEAD, 0.65);
assert.ok(
  THIRD_PERSON_FOV >= 55 && THIRD_PERSON_FOV <= 60,
  "the chase view keeps the planned modern 55-60 degree FOV",
);
assert.ok(
  THIRD_PERSON_TURN_HOLD_START_MS > 300,
  "an ordinary key tap cannot repeat a 45-degree turn",
);
assert.ok(
  THIRD_PERSON_TURN_HOLD_START_MS > THIRD_PERSON_TURN_REPEAT_MS,
);
assert.equal(
  isThirdPersonStructuralCameraCell(true, 0),
  true,
  "a LOS-blocking wall remains a camera blocker even without authored height",
);
assert.equal(
  isThirdPersonStructuralCameraCell(false, 1.25),
  true,
  "a tall cliff remains a camera blocker without LOS metadata",
);
assert.equal(
  isThirdPersonStructuralCameraCell(false, 0),
  false,
  "flat pits, liquids, void, and hazards never become invisible camera walls",
);

// ── Locked camera subject transfer ─────────────────────────────────────────
{
  const player = {
    key: "player",
    cell: [12, 8] as [number, number],
    facing: [0, -1] as [number, number],
  };
  const companion = {
    key: "companion_mara",
    cell: [13, 8] as [number, number],
    facing: [1, -1] as [number, number],
  };

  assert.strictEqual(
    resolveThirdPersonCameraSubject(player, companion),
    companion,
    "a commanded companion owns the chase camera during its controllable turn",
  );
  assert.strictEqual(
    resolveThirdPersonCameraSubject(player, null),
    player,
    "enemy/no-control turns return camera ownership to the protagonist",
  );
  assert.strictEqual(
    resolveThirdPersonCameraSubject(player, undefined),
    player,
    "missing controlled-actor state must keep the camera on the protagonist",
  );
}

// ── Chase pose and structural camera collision ─────────────────────────────
{
  const subject: [number, number] = [7.25, -3.5];
  const subjectWorldY = 1.4;
  for (const facing of THIRD_PERSON_FACING_RING) {
    const tuple: [number, number] = [facing[0], facing[1]];
    const yaw = facingToThirdPersonYaw(tuple);
    const expectedForwardX = Math.sin(yaw);
    const expectedForwardZ = Math.cos(yaw);
    const camera = getInitialThirdPersonCameraPosition(
      subject,
      tuple,
      subjectWorldY,
      0,
    );
    const horizontalDx = camera[0] - subject[0];
    const horizontalDz = camera[2] - subject[1];
    assert.ok(
      Math.abs(
        Math.hypot(horizontalDx, horizontalDz) -
          THIRD_PERSON_CHASE_DISTANCE,
      ) < 0.000001,
      `the ${tuple.join(":")} chase pose must preserve its boom distance`,
    );
    assert.ok(
      Math.abs(
        horizontalDx + expectedForwardX * THIRD_PERSON_CHASE_DISTANCE,
      ) < 0.000001 &&
        Math.abs(
          horizontalDz + expectedForwardZ * THIRD_PERSON_CHASE_DISTANCE,
        ) < 0.000001,
      `the camera must begin directly behind ${tuple.join(":")}`,
    );
    assert.ok(
      Math.abs(
        camera[1] - (subjectWorldY + THIRD_PERSON_CHASE_HEIGHT),
      ) < 0.000001,
      "zero-pitch chase height must be independent of facing",
    );
  }
}

{
  const start: [number, number, number] = [0, 1, 0];
  const end: [number, number, number] = [0, 1.5, 10];
  const clearBlocker: ThirdPersonCameraBlocker = {
    minX: 3,
    maxX: 4,
    minZ: 2,
    maxZ: 3,
  };
  assert.equal(
    resolveThirdPersonCameraCollisionFraction(
      start,
      end,
      [clearBlocker],
      0,
    ),
    1,
    "an off-axis structure must not shorten the chase boom",
  );

  const blocked: ThirdPersonCameraBlocker = {
    minX: -0.5,
    maxX: 0.5,
    minY: 0,
    maxY: 4,
    minZ: 4,
    maxZ: 5,
  };
  assert.ok(
    Math.abs(
      resolveThirdPersonCameraCollisionFraction(
        start,
        end,
        [blocked],
        0,
      ) - 0.4,
    ) < 0.000001,
    "a full-height wall must report the segment entry point",
  );

  const near: ThirdPersonCameraBlocker = {
    minX: -0.5,
    maxX: 0.5,
    minZ: 2,
    maxZ: 2.5,
  };
  const far: ThirdPersonCameraBlocker = {
    minX: -0.5,
    maxX: 0.5,
    minZ: 7,
    maxZ: 8,
  };
  assert.ok(
    Math.abs(
      resolveThirdPersonCameraCollisionFraction(
        start,
        end,
        [far, near],
        0,
      ) - 0.2,
    ) < 0.000001,
    "collision resolution must select the nearest blocker regardless of order",
  );
}

console.log("Third-person tank-control contract tests passed.");
