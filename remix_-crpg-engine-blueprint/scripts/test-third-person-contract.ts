import assert from "node:assert/strict";
import { resolveAuthoredViewMode } from "../src/utils/firstPersonControls";
import {
  THIRD_PERSON_FACING_RING,
  THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND,
  THIRD_PERSON_MAX_PITCH_RADIANS,
  THIRD_PERSON_MAX_YAW_OFFSET_RADIANS,
  THIRD_PERSON_MIN_PITCH_RADIANS,
  THIRD_PERSON_PITCH_DRAG_SENSITIVITY,
  THIRD_PERSON_PLAYER_FADE_END_DISTANCE,
  THIRD_PERSON_PLAYER_FADE_START_DISTANCE,
  THIRD_PERSON_PLAYER_MIN_OPACITY,
  THIRD_PERSON_TURN_HOLD_START_MS,
  THIRD_PERSON_TURN_REPEAT_MS,
  THIRD_PERSON_YAW_DRAG_SENSITIVITY,
  applyThirdPersonKeyboardPitch,
  applyThirdPersonLookDelta,
  clampThirdPersonPitch,
  clampThirdPersonYawOffset,
  facingToThirdPersonYaw,
  isThirdPersonCameraActive,
  isThirdPersonFreeMovementActive,
  isThirdPersonStructuralCameraCell,
  quantizeYawToFacing,
  resolveHeldThirdPersonIntent,
  resolveLiveHeldThirdPersonIntent,
  resolveThirdPersonCameraBodyDistance,
  resolveThirdPersonCameraSubject,
  resolveThirdPersonPlayerMaterialFadeUpdate,
  resolveThirdPersonPlayerCameraOpacity,
  rotateThirdPersonFacing45,
  thirdPersonStepVector,
  wrapThirdPersonYaw,
} from "../src/utils/thirdPersonControls";
import {
  THIRD_PERSON_CAMERA_PROFILES,
  THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE,
  THIRD_PERSON_CORRIDOR_ENTER_MS,
  THIRD_PERSON_CORRIDOR_EXIT_CLEARANCE,
  THIRD_PERSON_CORRIDOR_EXIT_MS,
  THIRD_PERSON_CORRIDOR_PEEK_YAW_LIMIT,
  THIRD_PERSON_CORRIDOR_PROFILE,
  THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR,
  THIRD_PERSON_MAX_PEEK_PITCH,
  THIRD_PERSON_MAX_TETHER_YAW_RATE,
  THIRD_PERSON_MIN_PEEK_PITCH,
  THIRD_PERSON_OPEN_COMBAT_PROFILE,
  THIRD_PERSON_OPEN_EXPLORE_PROFILE,
  THIRD_PERSON_OPEN_PEEK_YAW_LIMIT,
  THIRD_PERSON_SHOULDER_FALLBACK_ADVANTAGE,
  THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS,
  THIRD_PERSON_SHOULDER_MIN_HOLD_MS,
  THIRD_PERSON_SHOULDER_RETURN_ADVANTAGE,
  THIRD_PERSON_SHOULDER_RETURN_SWITCH_MS,
  THIRD_PERSON_SUBJECT_MAX_LAG,
  THIRD_PERSON_WALL_BACKED_PEEK_YAW_LIMIT,
  THIRD_PERSON_WALL_BACKED_PROFILE,
  THIRD_PERSON_WALL_ENTER_CLEARANCE,
  THIRD_PERSON_WALL_ENTER_MS,
  THIRD_PERSON_WALL_EXIT_CLEARANCE,
  THIRD_PERSON_WALL_EXIT_MS,
  advanceThirdPersonSpatialState,
  advanceThirdPersonShoulderSelection,
  clampThirdPersonPeek,
  createThirdPersonCameraStepState,
  createThirdPersonShoulderSelectionState,
  createThirdPersonSpatialState,
  resolveThirdPersonCameraProfile,
  resolveThirdPersonTargetPose,
  stepThirdPersonCamera,
  wrapThirdPersonCameraYaw,
  type ThirdPersonCameraProfileName,
  type ThirdPersonCameraStepState,
  type ThirdPersonCameraVec3,
  type ThirdPersonSpatialMeasurements,
  type ThirdPersonSpatialMode,
} from "../src/utils/thirdPersonCamera";
import {
  IMMERSIVE_CEILING_HEIGHT,
  IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
  IMMERSIVE_DETAIL_FORWARD_BONUS,
  IMMERSIVE_EXTERIOR_FORWARD_LATERAL_SCALE,
  IMMERSIVE_STREAM_SECTOR_SIZE,
  IMMERSIVE_WALL_HEIGHT_SCALE,
  buildAuthoredArchitectureBoundaryFillers,
  isWithinImmersiveDirectionalWindow,
  isWithinDistantArchitectureBand,
  isImmersiveCeilingView,
  resolveImmersiveDirectionalWindowOuterRadius,
  resolveDerivedCeilingOpeningSignature,
  resolveImmersiveStreamSector,
  resolveImmersiveWallHeight,
  resolveRuntimeObjectPlacementYOffset,
  selectDistantArchitectureCells,
} from "../src/utils/immersiveArchitecture";
import {
  BACKROOMS_LEVEL_ZERO_DISTANT_ARCHITECTURE_COLORS,
  BACKROOMS_LEVEL_ZERO_DETAIL_WALL_EMISSION,
  BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION,
  resolveBackroomsLevelZeroDetailWallEmission,
  resolveBackroomsLevelZeroDetailSurfaceEmission,
  resolveDistantArchitectureMaterialPolicy,
} from "../src/utils/lightRendering";
import {
  resolveImmersiveVisibilityPresentationPolicy,
} from "../src/utils/fogOfWar";
import { renderedTerrainPlaneY } from "../src/utils/renderSpace";
import {
  advanceFreeActorToward,
  BACKROOMS_FREE_COLLISION_RADIUS_FINE,
  FREE_PLAYER_DURABLE_POSE_INTERVAL_MS,
  normalizeFreeFacing,
  quantizeFreePlayerPosition,
  resolveEntityFreeExplorationSettlement,
  resolveFacedInteractionProbe,
  resolveFreeActorStart,
  resolveFreeInteractionPose,
  resolveFreeInteractionStep,
  freePlayerPositionIntersectsBounds,
  resolveFreePlayerMovement,
  resolveFreePlayerStart,
  rotateFreeFacing,
  shouldCommitFreePlayerDurablePose,
} from "../src/utils/freePlayerMovement";
import {
  THIRD_PERSON_STREAM_DIRECTION_BUCKET_RADIANS,
  resolveThirdPersonCameraCollisionFraction,
  resolveThirdPersonCameraSweep,
} from "../src/components/FixedThirdPersonCameraRig";

const EPSILON = 0.000001;

const assertNear = (
  actual: number,
  expected: number,
  message: string,
  tolerance = EPSILON,
) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
};

const assertVecNear = (
  actual: readonly number[],
  expected: readonly number[],
  message: string,
  tolerance = EPSILON,
) => {
  assert.equal(actual.length, expected.length, `${message}: vector length`);
  actual.forEach((value, index) =>
    assertNear(
      value,
      expected[index],
      `${message} component ${index}`,
      tolerance,
    ),
  );
};

const vecDistance = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const assertFiniteVec = (
  value: readonly number[],
  message: string,
) => {
  assert.ok(value.every(Number.isFinite), message);
};

const clearMeasurements: ThirdPersonSpatialMeasurements = {
  boomClearance: Number.POSITIVE_INFINITY,
  rearClearance: Number.POSITIVE_INFINITY,
  corridorClearsSteve: true,
};

// ── Authored mode and permanent camera ownership ──────────────────────────
assert.equal(
  resolveAuthoredViewMode({ view_mode: "third_person" }),
  "third_person",
);
assert.equal(resolveAuthoredViewMode({ view_mode: "banana" }), "isometric");
assert.equal(isThirdPersonCameraActive("third_person", "explore"), true);
assert.equal(isThirdPersonCameraActive("third_person", "tactical"), true);
assert.equal(isThirdPersonCameraActive("third_person", "story"), true);
assert.equal(isThirdPersonCameraActive("first_person", "explore"), false);
assert.equal(isThirdPersonCameraActive("isometric", "tactical"), false);
assert.equal(
  isThirdPersonFreeMovementActive("third_person", false, false),
  true,
  "all authored third-person exploration maps use continuous movement",
);
assert.equal(
  isThirdPersonFreeMovementActive("third_person", true, true),
  true,
  "realtime horror combat retains continuous movement",
);
assert.equal(
  isThirdPersonFreeMovementActive("third_person", true, false),
  false,
  "legacy pulse combat retains exact tactical cells",
);
assert.equal(
  isThirdPersonFreeMovementActive("isometric", false, false),
  false,
  "isometric maps retain their authored grid controls",
);

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
    "the touch joystick's synthesized diagonal drives forward and turn",
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
{
  // Reproduce the frozen-hold event order: W remains physically down while A
  // joins the chord and releases before repeat activation. The consumed set
  // still de-duplicates keyup, but the live RAF resolver must keep W active.
  const keyupDeduplication = new Set(["w", "a"]);
  const heldAfterTurnRelease = new Set(["w"]);
  assert.equal(
    resolveHeldThirdPersonIntent(
      heldAfterTurnRelease,
      keyupDeduplication,
    ).forward,
    0,
    "the second quick-chord keyup remains de-duplicated",
  );
  assert.equal(
    resolveLiveHeldThirdPersonIntent(heldAfterTurnRelease).forward,
    1,
    "a physically held W remains live after quick A/D release",
  );
  assert.equal(
    resolveLiveHeldThirdPersonIntent(new Set()).forward,
    0,
    "releasing W before the next frame cannot dispatch another step",
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

// ── Fine-grid motion and authoritative turning ─────────────────────────────
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
  "A/D turning advances authoritative facing by exactly 45 degrees",
);
for (const facing of THIRD_PERSON_FACING_RING) {
  const tuple: [number, number] = [facing[0], facing[1]];
  assert.deepEqual(
    quantizeYawToFacing(facingToThirdPersonYaw(tuple)),
    tuple,
    `yaw must round-trip authoritative facing ${tuple.join(":")}`,
  );
}
assert.deepEqual(quantizeYawToFacing(Math.PI), [0, -1]);
assert.deepEqual(quantizeYawToFacing(0), [0, 1]);
assert.deepEqual(quantizeYawToFacing(Math.PI / 2), [1, 0]);
assert.equal(wrapThirdPersonYaw(Number.NaN), Math.PI);

// ── Camera-only manual peek and pitch limits ───────────────────────────────
{
  const look = applyThirdPersonLookDelta(
    0,
    0,
    200,
    -40,
    THIRD_PERSON_YAW_DRAG_SENSITIVITY,
    THIRD_PERSON_PITCH_DRAG_SENSITIVITY,
  );
  assert.ok(
    look.yawOffset < 0,
    "dragging right peeks the view right without rotating Steve",
  );
  assert.ok(look.pitch > 0, "dragging upward raises the presentation view");
  assert.deepEqual(
    Object.keys(look).sort(),
    ["pitch", "yawOffset"],
    "manual look must not return authoritative facing or an absolute actor yaw",
  );
  assert.equal(
    "authoritativeFacing" in look,
    false,
    "pointer look cannot mutate saved facing",
  );
}
assert.equal(
  clampThirdPersonYawOffset(Number.NaN),
  0,
  "invalid peek yaw returns to the authoritative tether",
);
assert.equal(
  clampThirdPersonYawOffset(Number.POSITIVE_INFINITY),
  0,
  "non-finite peek yaw cannot leak into the camera",
);
assert.equal(
  clampThirdPersonYawOffset(Math.PI),
  THIRD_PERSON_MAX_YAW_OFFSET_RADIANS,
);
assert.equal(
  clampThirdPersonYawOffset(-Math.PI),
  -THIRD_PERSON_MAX_YAW_OFFSET_RADIANS,
);
assertNear(
  THIRD_PERSON_MAX_YAW_OFFSET_RADIANS,
  (32 * Math.PI) / 180,
  "open manual peek is capped at 32 degrees",
);
assert.equal(clampThirdPersonPitch(Number.NaN), 0);
assert.equal(
  clampThirdPersonPitch(-Math.PI),
  THIRD_PERSON_MIN_PITCH_RADIANS,
);
assert.equal(
  clampThirdPersonPitch(Math.PI),
  THIRD_PERSON_MAX_PITCH_RADIANS,
);
assertNear(
  THIRD_PERSON_MIN_PITCH_RADIANS,
  (-14 * Math.PI) / 180,
  "minimum pitch",
);
assertNear(
  THIRD_PERSON_MAX_PITCH_RADIANS,
  (20 * Math.PI) / 180,
  "maximum pitch",
);
assert.equal(
  applyThirdPersonKeyboardPitch(0, 1, 0.25),
  THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND * 0.25,
  "Q pressure integrates at the authored pitch rate",
);
assert.equal(
  applyThirdPersonKeyboardPitch(0, -1, 100),
  THIRD_PERSON_MIN_PITCH_RADIANS,
  "held pitch input clamps at the lower limit",
);
assert.ok(
  THIRD_PERSON_TURN_HOLD_START_MS > 300 &&
    THIRD_PERSON_TURN_HOLD_START_MS > THIRD_PERSON_TURN_REPEAT_MS,
  "an ordinary A/D tap commits one deliberate 45-degree turn",
);

// Camera collision runs several blocker sweeps every rendered movement frame.
// Pin the scalar hot path to the same hit fractions/normals as the original
// slab implementation, including start-inside behavior.
{
  const blocker = {
    minX: -0.5,
    maxX: 0.5,
    minY: 0,
    maxY: 2,
    minZ: -0.5,
    maxZ: 0.5,
  };
  const xHit = resolveThirdPersonCameraSweep({
    start: [-2, 1, 0],
    desiredEye: [2, 1, 0],
    blockers: [blocker],
    padding: 0,
  });
  assert.equal(xHit.hit, true, "camera sweep detects an X-axis wall hit");
  assertNear(xHit.fraction, 0.375, "X-axis wall hit fraction");
  assertVecNear(xHit.normal, [-1, 0, 0], "X-axis wall hit normal");

  const zHit = resolveThirdPersonCameraSweep({
    start: [0, 1, -2],
    desiredEye: [0, 1, 2],
    blockers: [blocker],
    padding: 0,
  });
  assertNear(zHit.fraction, 0.375, "Z-axis wall hit fraction");
  assertVecNear(zHit.normal, [0, 0, -1], "Z-axis wall hit normal");

  const yHit = resolveThirdPersonCameraSweep({
    start: [0, -2, 0],
    desiredEye: [0, 3, 0],
    blockers: [blocker],
    padding: 0,
  });
  assertNear(yHit.fraction, 0.4, "Y-axis wall hit fraction");
  assertVecNear(yHit.normal, [0, -1, 0], "Y-axis wall hit normal");

  assert.equal(
    resolveThirdPersonCameraCollisionFraction(
      [-2, 3, 0],
      [2, 3, 0],
      [blocker],
      0,
    ),
    1,
    "a sweep above the blocker remains unobstructed",
  );

  const outward = resolveThirdPersonCameraSweep({
    start: [0.49, 1, 0],
    desiredEye: [2, 1, 0],
    blockers: [blocker],
    padding: 0,
  });
  assert.equal(
    outward.hit,
    false,
    "a camera already inside a blocker can escape along its nearest face",
  );

  const inward = resolveThirdPersonCameraSweep({
    start: [0.49, 1, 0],
    desiredEye: [-2, 1, 0],
    blockers: [blocker],
    padding: 0,
  });
  assert.equal(inward.hit, true, "inward motion from inside remains blocked");
  assertNear(inward.fraction, 0, "inside collision starts at fraction zero");
  assertVecNear(inward.normal, [1, 0, 0], "nearest exit normal is stable");

  const nearestHit = resolveThirdPersonCameraSweep({
    start: [-3, 1, 0],
    desiredEye: [3, 1, 0],
    blockers: [
      blocker,
      { ...blocker, minX: 1.5, maxX: 2.5 },
    ],
    padding: 0,
  });
  assertNear(
    nearestHit.fraction,
    2.5 / 6,
    "multiple blockers select the earliest collision",
  );
}

// ── Material fade, structural cells, and immersive architecture ───────────
assert.equal(
  resolveThirdPersonPlayerCameraOpacity(
    THIRD_PERSON_PLAYER_FADE_START_DISTANCE,
  ),
  1,
  "Steve remains opaque outside the emergency fade volume",
);
assert.equal(
  resolveThirdPersonPlayerCameraOpacity(
    THIRD_PERSON_PLAYER_FADE_END_DISTANCE,
  ),
  THIRD_PERSON_PLAYER_MIN_OPACITY,
  "Steve only reaches minimum opacity after the lens enters his body",
);
assertNear(
  resolveThirdPersonPlayerCameraOpacity(
    (THIRD_PERSON_PLAYER_FADE_START_DISTANCE +
      THIRD_PERSON_PLAYER_FADE_END_DISTANCE) /
      2,
  ),
  (1 + THIRD_PERSON_PLAYER_MIN_OPACITY) / 2,
  "the emergency fade eases smoothly",
);
assert.equal(resolveThirdPersonPlayerCameraOpacity(Number.NaN), 1);
assert.equal(
  resolveThirdPersonPlayerMaterialFadeUpdate(1, 1, true),
  "skip",
  "a fully visible restored model avoids the per-frame material traversal",
);
assert.equal(
  resolveThirdPersonPlayerMaterialFadeUpdate(0.999, 1, true),
  "apply_fade",
  "an active fade keeps visiting the model so asynchronously mounted meshes are caught",
);
assert.equal(
  resolveThirdPersonPlayerMaterialFadeUpdate(1, 0.9, false),
  "apply_fade",
  "the return to full opacity keeps damping until it is visually settled",
);
assert.equal(
  resolveThirdPersonPlayerMaterialFadeUpdate(1, 0.9995, false),
  "restore_base",
  "a settled fade restores authored material state exactly once",
);
assert.equal(
  resolveThirdPersonCameraBodyDistance([0, 1.2, 2], [0, 0, 0], 1.8),
  2,
  "body distance measures from Steve's vertical capsule segment",
);
assert.ok(
  resolveThirdPersonCameraBodyDistance([0.1, 2.8, 0], [0, 0, 0], 1.8) >
    THIRD_PERSON_PLAYER_FADE_START_DISTANCE,
  "a camera above Steve's head remains outside the material-fade volume",
);
assert.equal(
  resolveThirdPersonPlayerCameraOpacity(
    resolveThirdPersonCameraBodyDistance([0, 1.2, 1.0], [0, 0, 0], 1.8),
  ),
  1,
  "a normal-length boom keeps Steve fully opaque",
);
assert.ok(
  resolveThirdPersonPlayerCameraOpacity(
    resolveThirdPersonCameraBodyDistance([0, 1.2, 0.35], [0, 0, 0], 1.8),
  ) < 1,
  "a wall-shortened boom fades Steve so the forward view stays readable",
);
assert.equal(isThirdPersonStructuralCameraCell(true, 0), true);
assert.equal(isThirdPersonStructuralCameraCell(false, 1.25), true);
assert.equal(
  isThirdPersonStructuralCameraCell(false, 0),
  false,
  "flat pits, liquids, void, and hazards never become invisible camera walls",
);
{
  const openingObjects = new Map<string, any>([
    [
      "test_stairs",
      {
        id: "test_stairs",
        tags: ["stairs", "structure"],
        collision: {
          profile: "block",
          fine_footprint: [
            [0, 0],
            [1, 0],
          ],
        },
      },
    ],
    ["test_crate", { id: "test_crate", tags: [], collision: { profile: "block" } }],
  ]);
  assert.equal(
    resolveDerivedCeilingOpeningSignature(
      [{ object_id: "test_crate", cell: [0, 0], facing: [0, 1] }],
      openingObjects,
    ),
    resolveDerivedCeilingOpeningSignature(
      [{ object_id: "test_crate", cell: [20, 20], facing: [1, 0] }],
      openingObjects,
    ),
    "unrelated recreated placement arrays keep the ceiling topology key stable",
  );
  const stairsAtOrigin = resolveDerivedCeilingOpeningSignature(
    [{ object_id: "test_stairs", cell: [3, 4], facing: [0, 1] }],
    openingObjects,
  );
  assert.equal(
    stairsAtOrigin,
    "3:4|4:4",
    "the ceiling topology key encodes the exact staircase footprint",
  );
  assert.notEqual(
    stairsAtOrigin,
    resolveDerivedCeilingOpeningSignature(
      [{ object_id: "test_stairs", cell: [4, 4], facing: [0, 1] }],
      openingObjects,
    ),
    "moving a staircase invalidates the ceiling topology key",
  );
}
assert.equal(IMMERSIVE_WALL_HEIGHT_SCALE, 1.5);
{
  const darkFloor = resolveBackroomsLevelZeroDetailSurfaceEmission(
    "floor",
    "#000000",
    0,
  );
  assert.deepEqual(
    darkFloor,
    BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.floor,
    "Level Zero detailed carpet has a warm material floor between fixtures",
  );
  const darkCeiling = resolveBackroomsLevelZeroDetailSurfaceEmission(
    "ceiling",
    "#000000",
    Number.NaN,
  );
  assert.deepEqual(
    darkCeiling,
    BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.ceiling,
    "Level Zero detailed ceiling cannot grade to a pure-black overhead void",
  );
  assert.deepEqual(
    resolveBackroomsLevelZeroDetailSurfaceEmission("floor", "#cc44ff", 0.8),
    { emissive: "#cc44ff", emissiveIntensity: 0.8 },
    "a stronger authored Level Zero surface glow remains authoritative",
  );
  assert.ok(
    BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.floor.emissiveIntensity <
      BACKROOMS_LEVEL_ZERO_DETAIL_WALL_EMISSION.wallpaper.emissiveIntensity &&
      BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.ceiling.emissiveIntensity <
        BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.floor.emissiveIntensity,
    "the readability floor stays below the wall fill and keeps the ceiling subdued",
  );
  assert.deepEqual(
    resolveBackroomsLevelZeroDetailWallEmission("wallpaper", "#000000", 0),
    BACKROOMS_LEVEL_ZERO_DETAIL_WALL_EMISSION.wallpaper,
    "detailed Level Zero wallpaper cannot render as a pure-black plane",
  );
  assert.deepEqual(
    resolveBackroomsLevelZeroDetailWallEmission("trim", "#000000", 0.1),
    BACKROOMS_LEVEL_ZERO_DETAIL_WALL_EMISSION.trim,
    "detailed Level Zero trim receives a subdued warm readability floor",
  );
  assert.deepEqual(
    resolveBackroomsLevelZeroDetailWallEmission("wallpaper", "#cc44ff", 1.2),
    { emissive: "#cc44ff", emissiveIntensity: 1.2 },
    "stronger authored wallpaper emission remains authoritative",
  );
  for (const surface of ["floor", "wall", "ceiling"] as const) {
    assert.deepEqual(
      resolveDistantArchitectureMaterialPolicy(surface, true),
      {
        color: BACKROOMS_LEVEL_ZERO_DISTANT_ARCHITECTURE_COLORS[surface],
        vertexColors: false,
        toneMapped: false,
      },
      `Level Zero ${surface} far proxies use a stable warm uniform material`,
    );
    assert.notEqual(
      BACKROOMS_LEVEL_ZERO_DISTANT_ARCHITECTURE_COLORS[surface],
      "#000000",
      `Level Zero ${surface} far proxies cannot resolve to a black material`,
    );
  }
  assert.equal(
    resolveDistantArchitectureMaterialPolicy("wall", false).vertexColors,
    true,
    "non-Level-Zero far architecture preserves authored instance colors",
  );
}
assertNear(resolveImmersiveWallHeight(1.9, true), 2.85, "immersive wall height");
assertNear(
  resolveRuntimeObjectPlacementYOffset({
    baseHeight: 0,
    surfaceOffset: 0,
    minY: 2.48,
    ceilingAnchored: true,
  }),
  0,
  "ceiling fixtures preserve their authored mounting height",
);
assertNear(
  resolveRuntimeObjectPlacementYOffset({
    baseHeight: 0,
    surfaceOffset: 0,
    minY: 2.48,
  }),
  -2.47,
  "ordinary elevated geometry retains floor-normalized placement",
);
assert.ok(
  !isWithinDistantArchitectureBand({
    cell: [5, 0],
    center: [0, 0],
    detailRadius: 10,
    architectureRadius: 22,
  }) &&
    isWithinDistantArchitectureBand({
      cell: [15, 0],
      center: [0, 0],
      detailRadius: 10,
      architectureRadius: 22,
    }) &&
    !isWithinDistantArchitectureBand({
      cell: [24, 0],
      center: [0, 0],
      detailRadius: 10,
      architectureRadius: 22,
    }),
  "immersive far architecture fills only the cheap field beyond full detail",
);
{
  // A large runtime map keeps only nearby fine sectors. The far-field pass
  // must select from the complete authored macro topology so camera-facing
  // architecture beyond the current sector survives without expanding it for
  // simulation.
  const authoredMacroCells = Array.from({ length: 81 }, (_, index) => ({
    x: index,
    z: 0,
  }));
  const runtimeSectorCells = authoredMacroCells.filter((cell) => cell.x <= 31);
  const selection = (
    cells: typeof authoredMacroCells,
    forward: [number, number],
    detailedCellKeys?: ReadonlySet<string>,
  ) =>
    selectDistantArchitectureCells({
      cells,
      center: [24, 0],
      detailRadius: 8,
      architectureRadius: 16,
      forward,
      detailForwardBonus: 12,
      architectureForwardBonus: 28,
      detailedCellKeys,
    });
  const authoredFarField = selection(authoredMacroCells, [1, 0]);
  const truncatedFarField = selection(runtimeSectorCells, [1, 0]);
  assert.ok(
    authoredFarField.some((cell) => cell.x > 31),
    "authored macro far field retains cells beyond the fine runtime sector",
  );
  assert.equal(
    truncatedFarField.some((cell) => cell.x > 31),
    false,
    "the local simulation window alone cannot cover that distant sightline",
  );
  assert.ok(
    authoredFarField.length > truncatedFarField.length,
    "complete authored topology materially extends the camera-facing shell",
  );
  const actuallyDetailedKeys = new Set(
    runtimeSectorCells.map((cell) => `${cell.x}:${cell.z}`),
  );
  const coverageAwareFarField = selection(
    authoredMacroCells,
    [1, 0],
    actuallyDetailedKeys,
  );
  assert.ok(
    coverageAwareFarField.some((cell) => cell.x === 32),
    "authored LOD fills a missing coordinate inside the requested detail wedge",
  );
  assert.equal(
    coverageAwareFarField.some((cell) => cell.x === 31),
    false,
    "authored LOD does not overdraw a coordinate with real detailed geometry",
  );

  for (const sectorEdge of [-1, 1]) {
    const yaw = sectorEdge * IMMERSIVE_STREAM_SECTOR_SIZE;
    const edgeField = selection(authoredMacroCells, [
      Math.cos(yaw),
      Math.sin(yaw),
    ]);
    assert.ok(
      edgeField.some((cell) => cell.x === 58),
      `authored far architecture covers stream-sector edge ${sectorEdge}`,
    );
  }

  const boundaryFillers = buildAuthoredArchitectureBoundaryFillers([
    { x: 0, z: 0, y: 0 },
    { x: 1, z: 0, y: 0 },
    { x: 2, z: 0, y: 0, active: false },
  ]);
  assert.equal(
    boundaryFillers.length,
    6,
    "two joined authored cells require six unique render-only boundary fillers",
  );
  assert.equal(
    boundaryFillers.some(
      (filler) => filler.position[0] === 0 && filler.position[1] === 0,
    ),
    false,
    "boundary fillers never replace a real playable cell",
  );
  assert.ok(
    boundaryFillers.some(
      (filler) => filler.position[0] === 2 && filler.position[1] === 0,
    ),
    "an inactive or absent neighbor receives a solid visual seal",
  );

}
assertNear(
  renderedTerrainPlaneY({ x: 0, y: 0, z: 0 } as any),
  0.001,
  "near and distant ground share the same base render plane",
);
assertNear(
  renderedTerrainPlaneY({ x: 0, y: 0.5, z: 0 } as any),
  0.501,
  "raised terrain preserves the shared render-plane offset",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [0, -21],
    center: [0, 0],
    forward: [0, -1],
    radius: 10,
    forwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
  }),
  true,
  "third-person detail extends well beyond the core in the camera direction",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [0, 21],
    center: [0, 0],
    forward: [0, -1],
    radius: 10,
    forwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
  }),
  false,
  "forward detail does not double rear streaming cost",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [22, -21],
    center: [0, 0],
    forward: [0, -1],
    radius: 10,
    forwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
  }),
  false,
  "the forward stream stays inside its widening camera corridor",
);
assert.ok(
  isWithinDistantArchitectureBand({
    cell: [0, -44],
    center: [0, 0],
    detailRadius: 10,
    architectureRadius: 22,
    forward: [0, -1],
    detailForwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
    architectureForwardBonus: IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
  }),
  "cheap architecture continues beyond the extended detailed corridor",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [16, 0],
    center: [-24, 0],
    forward: [1, 0],
    radius: 10,
    forwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
  }),
  true,
  "the minimum detail preset reaches the opposite wall despite maximum chunk lag",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [-8, -82],
    center: [0, 24],
    forward: [0, -1],
    radius: 9,
    forwardBonus: 110,
  }),
  true,
  "the weakest exterior detail field reaches the doubled street's far corner from spawn",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [5, -75],
    center: [0, 24],
    forward: [0, -1],
    radius: 11,
    forwardBonus: 110,
  }),
  true,
  "the full-detail placement field keeps the far roadside house drawn from spawn",
);
assert.equal(
  isWithinImmersiveDirectionalWindow({
    cell: [0, 130],
    center: [0, 24],
    forward: [0, -1],
    radius: 9,
    forwardBonus: 110,
  }),
  false,
  "the full-street exterior field still excludes the equally distant rear edge",
);
for (const sectorOffset of [-1, 0, 1]) {
  const yaw = Math.PI + sectorOffset * IMMERSIVE_STREAM_SECTOR_SIZE;
  const forward = [Math.sin(yaw), Math.cos(yaw)] as const;
  for (let z = 23; z >= -82; z -= 1) {
    assert.equal(
      isWithinImmersiveDirectionalWindow({
        cell: [0, z],
        center: [0, 24],
        forward,
        radius: 9,
        forwardBonus: 110,
        forwardLateralScale: IMMERSIVE_EXTERIOR_FORWARD_LATERAL_SCALE,
      }),
      true,
      `the exterior guard band keeps street row ${z} drawn at stream-sector offset ${sectorOffset}`,
    );
  }
}
const architectureOuterRadius =
  resolveImmersiveDirectionalWindowOuterRadius({
    radius: 22,
    forwardBonus: IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
  });
assert.ok(
  architectureOuterRadius >=
    Math.hypot(
      22 + IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
      22 * 0.62 + IMMERSIVE_ARCHITECTURE_FORWARD_BONUS * 0.22,
    ),
  "the void shield encloses the complete directional architecture wedge",
);
assert.equal(resolveImmersiveStreamSector(Math.PI), 8);
assert.equal(
  resolveImmersiveStreamSector(-Math.PI + 0.001, 8),
  8,
  "stream direction remains canonical and stable across the ±π seam",
);
assert.equal(
  resolveImmersiveStreamSector(
    IMMERSIVE_STREAM_SECTOR_SIZE / 2 +
      (2 * Math.PI) / 180,
    0,
  ),
  0,
  "stream direction retains its sector inside the hysteresis band",
);
assert.equal(
  resolveImmersiveStreamSector(
    IMMERSIVE_STREAM_SECTOR_SIZE / 2 +
      (4 * Math.PI) / 180,
    0,
  ),
  1,
  "stream direction advances after leaving the hysteresis band",
);
assert.equal(resolveImmersiveWallHeight(1.9, false), 1.9);
assert.equal(IMMERSIVE_CEILING_HEIGHT, 2.85);
assert.equal(isImmersiveCeilingView("first_person"), true);
assert.equal(isImmersiveCeilingView("third_person"), true);
assert.equal(isImmersiveCeilingView("isometric"), false);

// Third-person Backrooms play renders physical world truth instead of using
// tactical perception as a visibility mask. Other views retain their existing
// fog and current-perception presentation.
assert.deepEqual(
  resolveImmersiveVisibilityPresentationPolicy("third_person", true),
  {
    fogMaskEnabled: false,
    gatePhysicalContent: false,
    cullLightsToVisibleCells: false,
  },
);
assert.deepEqual(
  resolveImmersiveVisibilityPresentationPolicy("first_person", true),
  {
    fogMaskEnabled: true,
    gatePhysicalContent: true,
    cullLightsToVisibleCells: true,
  },
);
assert.deepEqual(
  resolveImmersiveVisibilityPresentationPolicy("isometric", false),
  {
    fogMaskEnabled: false,
    gatePhysicalContent: true,
    cullLightsToVisibleCells: true,
  },
);

// ── Controlled camera subject transfer ─────────────────────────────────────
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
  );
  assert.strictEqual(resolveThirdPersonCameraSubject(player, null), player);
  assert.strictEqual(resolveThirdPersonCameraSubject(player, undefined), player);
}

// ── Fixed survival-horror profile table ────────────────────────────────────
assert.deepEqual(THIRD_PERSON_OPEN_EXPLORE_PROFILE, {
  back: 3.65,
  right: 0.65,
  eyeHeight: 1.64,
  lookAhead: 1.3,
  lookHeight: 1.3,
  fov: 58,
});
assert.deepEqual(THIRD_PERSON_CORRIDOR_PROFILE, {
  back: 2.3,
  right: 0.75,
  eyeHeight: 1.6,
  lookAhead: 1.15,
  lookHeight: 1.28,
  fov: 62,
});
assert.deepEqual(THIRD_PERSON_WALL_BACKED_PROFILE, {
  back: 0.15,
  right: 0.95,
  eyeHeight: 1.6,
  lookAhead: 1.25,
  lookHeight: 1.3,
  fov: 68,
});
assert.deepEqual(THIRD_PERSON_OPEN_COMBAT_PROFILE, {
  back: 4.4,
  right: 0.45,
  eyeHeight: 2.35,
  lookAhead: 1.4,
  lookHeight: 0.65,
  fov: 58,
});
for (const profileName of ["explore", "combat"] as const) {
  for (const spatialMode of ["open", "corridor", "wall_backed"] as const) {
    assert.strictEqual(
      resolveThirdPersonCameraProfile(profileName, spatialMode),
      THIRD_PERSON_CAMERA_PROFILES[profileName][spatialMode],
      `${profileName}/${spatialMode} resolves from the fixed profile table`,
    );
  }
}
assert.equal(
  resolveThirdPersonCameraProfile("combat", "corridor").back,
  THIRD_PERSON_CORRIDOR_PROFILE.back,
  "constrained combat uses the safe corridor boom",
);
assert.equal(
  resolveThirdPersonCameraProfile("combat", "wall_backed"),
  THIRD_PERSON_WALL_BACKED_PROFILE,
  "wall-backed combat never becomes an elevated overhead composition",
);

// ── Latched shoulder selection ─────────────────────────────────────────────
assert.equal(THIRD_PERSON_SHOULDER_FALLBACK_ADVANTAGE, 0.25);
assert.equal(THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS, 250);
assert.equal(THIRD_PERSON_SHOULDER_MIN_HOLD_MS, 900);
assert.equal(THIRD_PERSON_SHOULDER_RETURN_ADVANTAGE, 0.45);
assert.equal(THIRD_PERSON_SHOULDER_RETURN_SWITCH_MS, 700);
{
  const rightObstructed = {
    rightClearance: 0.4,
    leftClearance: 1.2,
    rightValid: false,
    leftValid: true,
    spatialMode: "corridor" as const,
  };
  let state = advanceThirdPersonShoulderSelection(
    createThirdPersonShoulderSelectionState(),
    rightObstructed,
    THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS - 1,
  );
  assert.equal(
    state.shoulder,
    1,
    "one obstructed frame cannot flip the default right shoulder",
  );
  assert.equal(state.challenger, -1);
  state = advanceThirdPersonShoulderSelection(
    state,
    rightObstructed,
    1,
  );
  assert.equal(
    state.shoulder,
    -1,
    "250ms of sustained right obstruction selects the valid left fallback",
  );
  assert.equal(state.holdRemainingMs, THIRD_PERSON_SHOULDER_MIN_HOLD_MS);

  const rightBarelyBetter = {
    rightClearance: 1.44,
    leftClearance: 1,
    rightValid: true,
    leftValid: true,
    spatialMode: "corridor" as const,
  };
  state = advanceThirdPersonShoulderSelection(
    state,
    rightBarelyBetter,
    THIRD_PERSON_SHOULDER_MIN_HOLD_MS,
  );
  assert.equal(state.shoulder, -1);
  assert.equal(
    state.challenger,
    null,
    "less than 0.45 cells of right advantage cannot challenge the fallback",
  );

  const rightClearlyBetter = {
    ...rightBarelyBetter,
    rightClearance:
      rightBarelyBetter.leftClearance +
      THIRD_PERSON_SHOULDER_RETURN_ADVANTAGE,
  };
  state = advanceThirdPersonShoulderSelection(
    state,
    rightClearlyBetter,
    THIRD_PERSON_SHOULDER_RETURN_SWITCH_MS - 1,
  );
  assert.equal(
    state.shoulder,
    -1,
    "returning right requires the full 700ms preference window",
  );
  state = advanceThirdPersonShoulderSelection(
    state,
    rightClearlyBetter,
    1,
  );
  assert.equal(
    state.shoulder,
    1,
    "a sustained 0.45-cell advantage restores the default right shoulder",
  );
}

// A newly selected side is held for 900ms before preference-only challenges.
{
  const leftPreferred = {
    rightClearance: 0.5,
    leftClearance: 1,
    rightValid: true,
    leftValid: true,
    spatialMode: "open" as const,
  };
  let state = advanceThirdPersonShoulderSelection(
    createThirdPersonShoulderSelectionState(),
    leftPreferred,
    THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS,
  );
  assert.equal(state.shoulder, -1);

  const rightPreferred = {
    rightClearance: 2,
    leftClearance: 0.5,
    rightValid: true,
    leftValid: true,
    spatialMode: "open" as const,
  };
  state = advanceThirdPersonShoulderSelection(
    state,
    rightPreferred,
    THIRD_PERSON_SHOULDER_MIN_HOLD_MS - 1,
  );
  assert.equal(state.shoulder, -1);
  assert.equal(state.challenger, null);
  state = advanceThirdPersonShoulderSelection(state, rightPreferred, 1);
  assert.equal(state.shoulder, -1);
  assert.equal(
    state.challenger,
    1,
    "the return timer starts only after the minimum hold fully elapses",
  );
}

// ── Exact default-right poses and symmetric left fallback ──────────────────
{
  const subject: ThirdPersonCameraVec3 = [7.25, 1.4, -3.5];
  const profileCases: readonly [
    ThirdPersonCameraProfileName,
    ThirdPersonSpatialMode,
  ][] = [
    ["explore", "open"],
    ["explore", "corridor"],
    ["explore", "wall_backed"],
    ["combat", "open"],
    ["combat", "corridor"],
    ["combat", "wall_backed"],
  ];

  for (const [profileName, spatialMode] of profileCases) {
    const cameraProfile = resolveThirdPersonCameraProfile(
      profileName,
      spatialMode,
    );
    for (const facing of THIRD_PERSON_FACING_RING) {
      const yaw = facingToThirdPersonYaw(facing);
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const rightPose = resolveThirdPersonTargetPose({
        subject,
        facingYaw: yaw,
        cameraProfile,
        spatialMode,
        floorY: subject[1],
      });
      const leftPose = resolveThirdPersonTargetPose({
        subject,
        facingYaw: yaw,
        cameraProfile,
        spatialMode,
        floorY: subject[1],
        shoulder: -1,
      });
      const eyeDx = rightPose.eye[0] - subject[0];
      const eyeDz = rightPose.eye[2] - subject[2];
      const lookDx = rightPose.look[0] - subject[0];
      const lookDz = rightPose.look[2] - subject[2];
      const centeredEye: ThirdPersonCameraVec3 = [
        subject[0] - forwardX * cameraProfile.back,
        subject[1] +
          Math.min(
            cameraProfile.eyeHeight,
            THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR,
          ),
        subject[2] - forwardZ * cameraProfile.back,
      ];

      assertNear(
        -(eyeDx * forwardX + eyeDz * forwardZ),
        cameraProfile.back,
        `${profileName}/${spatialMode} back distance at ${facing.join(":")}`,
      );
      assertNear(
        eyeDx * rightX + eyeDz * rightZ,
        cameraProfile.right,
        `${profileName}/${spatialMode} right shoulder at ${facing.join(":")}`,
      );
      assert.ok(
        eyeDx * rightX + eyeDz * rightZ >= -EPSILON,
        "the default/right pose remains on Steve's right-side plane",
      );
      assertNear(
        (leftPose.eye[0] - subject[0]) * rightX +
          (leftPose.eye[2] - subject[2]) * rightZ,
        -cameraProfile.right,
        `${profileName}/${spatialMode} left fallback at ${facing.join(":")}`,
      );
      assertVecNear(
        [
          (rightPose.eye[0] + leftPose.eye[0]) / 2,
          (rightPose.eye[1] + leftPose.eye[1]) / 2,
          (rightPose.eye[2] + leftPose.eye[2]) / 2,
        ],
        centeredEye,
        `${profileName}/${spatialMode} shoulder symmetry at ${facing.join(":")}`,
      );
      assertNear(
        rightPose.eye[1] - subject[1],
        Math.min(
          cameraProfile.eyeHeight,
          THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR,
        ),
        `${profileName}/${spatialMode} eye height`,
      );
      assertNear(
        lookDx * forwardX + lookDz * forwardZ,
        cameraProfile.lookAhead,
        `${profileName}/${spatialMode} look ahead`,
      );
      assertNear(
        lookDx * rightX + lookDz * rightZ,
        0,
        `${profileName}/${spatialMode} neutral look remains centered`,
      );
      assertNear(
        rightPose.look[1] - subject[1],
        cameraProfile.lookHeight,
        `${profileName}/${spatialMode} look height`,
      );
      assertVecNear(
        leftPose.look,
        rightPose.look,
        "shoulder fallback preserves the forward sightline",
      );
      assert.equal(rightPose.shoulder, 1);
      assert.equal(leftPose.shoulder, -1);
      assertNear(rightPose.rightOffset, cameraProfile.right, "right offset");
      assertNear(leftPose.rightOffset, -cameraProfile.right, "left offset");
      assert.equal(rightPose.fov, cameraProfile.fov);
    }
  }
}

// The default/right pose may collapse toward center without crossing left.
{
  const subject: ThirdPersonCameraVec3 = [0, 0, 0];
  const rightScales = [-5, 0, 0.4, 1, 5];
  const expectedOffsets = [0, 0, 0.26, 0.65, 0.65];
  rightScales.forEach((rightOffsetScale, index) => {
    const pose = resolveThirdPersonTargetPose({
      subject,
      facingYaw: 0,
      cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
      spatialMode: "open",
      rightOffsetScale,
    });
    assertNear(
      pose.rightOffset,
      expectedOffsets[index],
      `collision shoulder scale ${rightOffsetScale}`,
    );
    assert.ok(
      pose.eye[0] >= -EPSILON,
      "collision correction cannot choose a left shoulder",
    );
  });
}

// Shoulder changes expose a continuous signed blend for a glide, not a cut.
{
  const subject: ThirdPersonCameraVec3 = [0, 0, 0];
  const centered = resolveThirdPersonTargetPose({
    subject,
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    spatialMode: "open",
    shoulder: -1,
    shoulderBlend: 0,
  });
  const halfwayLeft = resolveThirdPersonTargetPose({
    subject,
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    spatialMode: "open",
    shoulder: -1,
    shoulderBlend: -0.5,
  });
  const left = resolveThirdPersonTargetPose({
    subject,
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    spatialMode: "open",
    shoulder: -1,
  });
  assertNear(centered.rightOffset, 0, "shoulder glide midpoint");
  assertNear(
    halfwayLeft.rightOffset,
    -THIRD_PERSON_OPEN_EXPLORE_PROFILE.right / 2,
    "shoulder glide halfway point",
  );
  assertNear(
    left.rightOffset,
    -THIRD_PERSON_OPEN_EXPLORE_PROFILE.right,
    "left shoulder glide endpoint",
  );
  assert.ok(centered.eye[0] > halfwayLeft.eye[0]);
  assert.ok(halfwayLeft.eye[0] > left.eye[0]);
}

// Manual peeking changes only the sightline, not the physical camera eye.
{
  const input = {
    subject: [2, 0.25, -4] as ThirdPersonCameraVec3,
    facingYaw: Math.PI / 4,
    cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    spatialMode: "open" as const,
    floorY: 0.25,
  };
  const neutral = resolveThirdPersonTargetPose(input);
  const peeked = resolveThirdPersonTargetPose({
    ...input,
    yawOffset: Math.PI,
    pitchOffset: Math.PI,
  });
  assertVecNear(
    peeked.eye,
    neutral.eye,
    "manual peek must leave the physical eye fixed",
  );
  assert.notDeepEqual(peeked.look, neutral.look);
  assert.equal(peeked.tetherYaw, neutral.tetherYaw);
  assertNear(peeked.yawOffset, THIRD_PERSON_OPEN_PEEK_YAW_LIMIT, "open peek yaw");
  assertNear(peeked.pitchOffset, THIRD_PERSON_MAX_PEEK_PITCH, "peek pitch");

  assertNear(
    clampThirdPersonPeek("corridor", Math.PI, 0).yawOffset,
    THIRD_PERSON_CORRIDOR_PEEK_YAW_LIMIT,
    "corridor peek narrows to 22 degrees",
  );
  assertNear(
    clampThirdPersonPeek("wall_backed", -Math.PI, 0).yawOffset,
    -THIRD_PERSON_WALL_BACKED_PEEK_YAW_LIMIT,
    "wall-backed peek narrows to 10 degrees",
  );
  assertNear(
    clampThirdPersonPeek("open", 0, -Math.PI).pitchOffset,
    THIRD_PERSON_MIN_PEEK_PITCH,
    "downward peek is capped",
  );
}

// Combat remains behind the active actor and below the immersive ceiling.
{
  const floorY = 5;
  const combat = resolveThirdPersonTargetPose({
    subject: [0, floorY, 0],
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_OPEN_COMBAT_PROFILE,
    spatialMode: "open",
    floorY,
  });
  assertVecNear(combat.eye, [0.45, floorY + 2.35, -4.4], "open combat eye");
  assertVecNear(combat.look, [0, floorY + 0.65, 1.4], "open combat look");
  assert.ok(
    combat.eye[1] <= floorY + THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR,
    "combat camera remains below the ceiling-safe eye cap",
  );
  const extremeHeight = resolveThirdPersonTargetPose({
    subject: [0, floorY, 0],
    facingYaw: 0,
    cameraProfile: {
      ...THIRD_PERSON_OPEN_COMBAT_PROFILE,
      eyeHeight: 99,
    },
    spatialMode: "open",
    floorY,
  });
  assert.equal(
    extremeHeight.eye[1],
    floorY + THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR,
    "even malformed combat profiles clamp below the 2.85-cell ceiling",
  );
  assert.ok(
    THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR < IMMERSIVE_CEILING_HEIGHT,
  );
}

// ── Latched open/corridor/wall-backed hysteresis ───────────────────────────
assert.equal(THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE, 2.65);
assert.equal(THIRD_PERSON_CORRIDOR_EXIT_CLEARANCE, 3.25);
assert.equal(THIRD_PERSON_CORRIDOR_ENTER_MS, 180);
assert.equal(THIRD_PERSON_CORRIDOR_EXIT_MS, 600);
assert.equal(THIRD_PERSON_WALL_ENTER_CLEARANCE, 0.75);
assert.equal(THIRD_PERSON_WALL_EXIT_CLEARANCE, 1.25);
assert.equal(THIRD_PERSON_WALL_ENTER_MS, 120);
assert.equal(THIRD_PERSON_WALL_EXIT_MS, 500);

{
  const constrained: ThirdPersonSpatialMeasurements = {
    boomClearance: THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE - 0.01,
    rearClearance: 2,
    corridorClearsSteve: true,
  };
  let state = advanceThirdPersonSpatialState(
    createThirdPersonSpatialState(),
    constrained,
    THIRD_PERSON_CORRIDOR_ENTER_MS - 1,
  );
  assert.equal(state.mode, "open");
  state = advanceThirdPersonSpatialState(state, constrained, 1);
  assert.equal(
    state.mode,
    "corridor",
    "corridor composition latches only after 180ms",
  );

  const openAgain: ThirdPersonSpatialMeasurements = {
    ...clearMeasurements,
    boomClearance: THIRD_PERSON_CORRIDOR_EXIT_CLEARANCE + 0.01,
  };
  state = advanceThirdPersonSpatialState(
    state,
    openAgain,
    THIRD_PERSON_CORRIDOR_EXIT_MS - 1,
  );
  assert.equal(state.mode, "corridor");
  state = advanceThirdPersonSpatialState(state, openAgain, 1);
  assert.equal(
    state.mode,
    "open",
    "open composition returns only after 600ms of sustained clearance",
  );
}

{
  const rearWall: ThirdPersonSpatialMeasurements = {
    boomClearance: 2.8,
    rearClearance: THIRD_PERSON_WALL_ENTER_CLEARANCE - 0.01,
    corridorClearsSteve: true,
  };
  let state = advanceThirdPersonSpatialState(
    createThirdPersonSpatialState("corridor"),
    rearWall,
    THIRD_PERSON_WALL_ENTER_MS - 1,
  );
  assert.equal(state.mode, "corridor");
  state = advanceThirdPersonSpatialState(state, rearWall, 1);
  assert.equal(
    state.mode,
    "wall_backed",
    "wall-backed composition latches after 120ms",
  );

  const rearClear: ThirdPersonSpatialMeasurements = {
    boomClearance: 2.8,
    rearClearance: THIRD_PERSON_WALL_EXIT_CLEARANCE + 0.01,
    corridorClearsSteve: true,
  };
  state = advanceThirdPersonSpatialState(
    state,
    rearClear,
    THIRD_PERSON_WALL_EXIT_MS - 1,
  );
  assert.equal(state.mode, "wall_backed");
  state = advanceThirdPersonSpatialState(state, rearClear, 1);
  assert.equal(
    state.mode,
    "corridor",
    "rear-wall exit returns to a safe corridor profile after 500ms",
  );
}

{
  const corridorIntersectsSteve: ThirdPersonSpatialMeasurements = {
    boomClearance: 4,
    rearClearance: 4,
    corridorClearsSteve: false,
  };
  let state = advanceThirdPersonSpatialState(
    createThirdPersonSpatialState(),
    corridorIntersectsSteve,
    THIRD_PERSON_WALL_ENTER_MS - 1,
  );
  assert.equal(state.mode, "open");
  state = advanceThirdPersonSpatialState(state, corridorIntersectsSteve, 1);
  assert.equal(
    state.mode,
    "wall_backed",
    "an unsafe corridor pose enters the protected wall-backed composition",
  );
}

// Threshold noise must reset timers instead of making the composition flicker.
{
  let state = createThirdPersonSpatialState();
  for (let index = 0; index < 200; index += 1) {
    state = advanceThirdPersonSpatialState(
      state,
      {
        boomClearance:
          THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE +
          (index % 2 === 0 ? -0.01 : 0.01),
        rearClearance:
          THIRD_PERSON_WALL_ENTER_CLEARANCE +
          (index % 2 === 0 ? -0.01 : 0.01),
        corridorClearsSteve: true,
      },
      16,
    );
  }
  assert.equal(
    state.mode,
    "open",
    "alternating clearance noise cannot accumulate an entry timer",
  );
}

// Holding Steve against a wall for ten seconds produces one stable entry.
{
  const rearWall: ThirdPersonSpatialMeasurements = {
    boomClearance: 0.3,
    rearClearance: 0.2,
    corridorClearsSteve: false,
  };
  let state = createThirdPersonSpatialState();
  let wallEntries = 0;
  let wallExits = 0;
  for (let elapsed = 0; elapsed < 10_000; elapsed += 20) {
    const previousMode = state.mode;
    state = advanceThirdPersonSpatialState(state, rearWall, 20);
    if (previousMode !== "wall_backed" && state.mode === "wall_backed") {
      wallEntries += 1;
    }
    if (previousMode === "wall_backed" && state.mode !== "wall_backed") {
      wallExits += 1;
    }
  }
  assert.equal(wallEntries, 1);
  assert.equal(wallExits, 0);
  assert.equal(state.mode, "wall_backed");

  const released: ThirdPersonSpatialMeasurements = {
    boomClearance: 4,
    rearClearance: 2,
    corridorClearsSteve: true,
  };
  state = advanceThirdPersonSpatialState(
    state,
    released,
    THIRD_PERSON_WALL_EXIT_MS - 1,
  );
  assert.equal(state.mode, "wall_backed");
  state = advanceThirdPersonSpatialState(state, released, 1);
  assert.notEqual(
    state.mode,
    "wall_backed",
    "leaving the wall produces one delayed wall-state exit",
  );
}

// While wall-backed, noisy relative clearance cannot relatch the shoulder or
// perturb the spatial state as long as the selected side remains valid.
{
  let spatialState = createThirdPersonSpatialState("wall_backed");
  let shoulderState = createThirdPersonShoulderSelectionState(-1);
  for (let index = 0; index < 400; index += 1) {
    spatialState = advanceThirdPersonSpatialState(
      spatialState,
      {
        boomClearance:
          index % 2 === 0
            ? THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE - 0.01
            : THIRD_PERSON_CORRIDOR_EXIT_CLEARANCE + 0.01,
        rearClearance:
          index % 2 === 0
            ? THIRD_PERSON_WALL_ENTER_CLEARANCE - 0.01
            : THIRD_PERSON_WALL_ENTER_CLEARANCE + 0.01,
        corridorClearsSteve: true,
      },
      25,
    );
    shoulderState = advanceThirdPersonShoulderSelection(
      shoulderState,
      {
        rightClearance: index % 2 === 0 ? 2 : 0.5,
        leftClearance: index % 2 === 0 ? 0.5 : 2,
        rightValid: true,
        leftValid: true,
        spatialMode: spatialState.mode,
      },
      25,
    );
    assert.equal(spatialState.mode, "wall_backed");
    assert.equal(shoulderState.shoulder, -1);
    assert.equal(shoulderState.challenger, null);
  }
}

// ── Nine-fine-tile corridor and repeated-corner continuity ─────────────────
{
  // Nine fine cells are three world cells. With the rig's 0.16 camera radius
  // and 0.10 structural padding, valid camera centers remain within ±1.24.
  const paddedCorridorHalfWidth = 1.5 - 0.16 - 0.1;
  const straightPose = resolveThirdPersonTargetPose({
    subject: [0, 0, 0],
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_CORRIDOR_PROFILE,
    spatialMode: "corridor",
  });
  assert.ok(
    Math.abs(straightPose.eye[0]) <= paddedCorridorHalfWidth,
    "the fixed-right corridor pose fits a nine-fine-tile hallway",
  );
  assert.ok(
    Math.hypot(straightPose.eye[0], straightPose.eye[2]) > 0.78,
    "the corridor pose remains outside Steve's exclusion capsule",
  );

  let cameraState = createThirdPersonCameraStepState({
    subject: [0, 0, 0],
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_CORRIDOR_PROFILE,
    spatialMode: "corridor",
  });
  const turnTargets = [
    Math.PI / 2,
    Math.PI,
    -Math.PI / 2,
    0,
    Math.PI / 2,
    Math.PI,
    -Math.PI / 2,
    0,
  ];
  const deltaSeconds = 1 / 60;
  for (const targetYaw of turnTargets) {
    for (let frame = 0; frame < 45; frame += 1) {
      const previous = cameraState;
      cameraState = stepThirdPersonCamera(
        cameraState,
        {
          subject: [0, 0, 0],
          facingYaw: targetYaw,
          cameraProfile: THIRD_PERSON_CORRIDOR_PROFILE,
          spatialMode: "corridor",
        },
        deltaSeconds,
      );
      const yawStep = Math.abs(
        wrapThirdPersonCameraYaw(
          cameraState.tetherYaw - previous.tetherYaw,
        ),
      );
      assert.ok(
        yawStep <= THIRD_PERSON_MAX_TETHER_YAW_RATE * deltaSeconds + EPSILON,
        "a corridor turn may rotate at no more than 180 degrees per second",
      );
      const rightX = Math.cos(cameraState.tetherYaw);
      const rightZ = -Math.sin(cameraState.tetherYaw);
      const eyeDx = cameraState.eye[0] - cameraState.subject[0];
      const eyeDz = cameraState.eye[2] - cameraState.subject[2];
      assert.ok(
        eyeDx * rightX + eyeDz * rightZ >= -EPSILON,
        "the unswitched default shoulder remains right through repeated turns",
      );
      assertFiniteVec(cameraState.eye, "corner eye remains finite");
      assertFiniteVec(cameraState.look, "corner look remains finite");
      assert.ok(
        vecDistance(previous.eye, cameraState.eye) <
          THIRD_PERSON_CORRIDOR_PROFILE.back,
        "corner motion glides instead of cutting to the opposite heading",
      );
    }
  }
}

// ── One-integrator follow, profile smoothing, and snap boundaries ──────────
{
  let state = createThirdPersonCameraStepState({
    subject: [0, 0, 0],
    facingYaw: 0,
    cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    spatialMode: "open",
  });
  const movedSubject: ThirdPersonCameraVec3 = [1 / 3, 0, 0];
  state = stepThirdPersonCamera(
    state,
    {
      subject: movedSubject,
      facingYaw: 0,
      cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
      spatialMode: "open",
    },
    1 / 60,
  );
  assert.ok(
    vecDistance(state.subject, movedSubject) <=
      THIRD_PERSON_SUBJECT_MAX_LAG + EPSILON,
    "the camera subject never drags beyond the emergency catch-up clamp",
  );

  const beforeProfileChange = state;
  state = stepThirdPersonCamera(
    state,
    {
      subject: movedSubject,
      facingYaw: 0,
      cameraProfile: THIRD_PERSON_CORRIDOR_PROFILE,
      spatialMode: "corridor",
    },
    1 / 60,
  );
  assert.ok(
    state.fov > beforeProfileChange.fov &&
      state.fov < THIRD_PERSON_CORRIDOR_PROFILE.fov,
    "a spatial-state change smooths FOV instead of snapping",
  );
  assert.ok(
    state.cameraProfile.back < beforeProfileChange.cameraProfile.back &&
      state.cameraProfile.back > THIRD_PERSON_CORRIDOR_PROFILE.back,
    "a spatial-state change smooths boom length instead of snapping",
  );

  const snapped = stepThirdPersonCamera(
    state,
    {
      subject: [20, 0, 0],
      facingYaw: Math.PI,
      cameraProfile: THIRD_PERSON_OPEN_COMBAT_PROFILE,
      spatialMode: "open",
      snap: true,
    },
    1 / 60,
  );
  const expectedSnap = resolveThirdPersonTargetPose({
    subject: [20, 0, 0],
    facingYaw: Math.PI,
    cameraProfile: THIRD_PERSON_OPEN_COMBAT_PROFILE,
    spatialMode: "open",
  });
  assertVecNear(
    snapped.eye,
    expectedSnap.eye,
    "explicit map/owner/teleport snaps remain exact",
  );
  assert.equal(snapped.fov, THIRD_PERSON_OPEN_COMBAT_PROFILE.fov);
}

// Equivalent elapsed time must produce nearly identical presentation at
// 20/30/60Hz, while every intermediate profile change remains monotonic.
{
  const simulate = (hz: 20 | 30 | 60): ThirdPersonCameraStepState => {
    let state = createThirdPersonCameraStepState({
      subject: [0, 0, 0],
      facingYaw: 0,
      cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
      spatialMode: "open",
    });
    let previousFov = state.fov;
    for (let frame = 0; frame < hz; frame += 1) {
      state = stepThirdPersonCamera(
        state,
        {
          subject: [1 / 3, 0, 0],
          facingYaw: Math.PI / 2,
          cameraProfile: THIRD_PERSON_CORRIDOR_PROFILE,
          spatialMode: "corridor",
        },
        1 / hz,
      );
      assert.ok(state.fov >= previousFov - EPSILON);
      assert.ok(state.fov <= THIRD_PERSON_CORRIDOR_PROFILE.fov + EPSILON);
      assert.ok(
        vecDistance(state.subject, [1 / 3, 0, 0]) <=
          THIRD_PERSON_SUBJECT_MAX_LAG + EPSILON,
      );
      previousFov = state.fov;
    }
    return state;
  };
  const at20 = simulate(20);
  const at30 = simulate(30);
  const at60 = simulate(60);
  assertVecNear(at20.eye, at30.eye, "20/30Hz final eye", 0.02);
  assertVecNear(at30.eye, at60.eye, "30/60Hz final eye", 0.02);
  assertVecNear(at20.look, at60.look, "20/60Hz final look", 0.02);
  assertNear(at20.fov, at60.fov, "20/60Hz final FOV", 0.001);
  assertNear(
    at20.tetherYaw,
    at60.tetherYaw,
    "20/60Hz final tether yaw",
    0.02,
  );
}

// ── Backrooms continuous player locomotion ────────────────────────────────
{
  assertNear(
    FREE_PLAYER_DURABLE_POSE_INTERVAL_MS,
    1000 / 5,
    "continuous pose safety checkpoints are sampled at 5 Hz",
  );
  assert.equal(
    shouldCommitFreePlayerDurablePose({
      dirty: true,
      nowMs: FREE_PLAYER_DURABLE_POSE_INTERVAL_MS - 0.01,
      lastCommitAtMs: 0,
    }),
    false,
    "an in-between RAF pose does not churn the durable save",
  );
  assert.equal(
    shouldCommitFreePlayerDurablePose({
      dirty: true,
      nowMs: 1,
      lastCommitAtMs: 0,
      force: true,
    }),
    true,
    "input release flushes a dirty live pose immediately",
  );
  let sampledCommits = 0;
  let lastCommitAtMs = 0;
  for (let frame = 1; frame <= 60; frame += 1) {
    const nowMs = (frame * 1000) / 60;
    if (
      shouldCommitFreePlayerDurablePose({
        dirty: true,
        nowMs,
        lastCommitAtMs,
      })
    ) {
      sampledCommits += 1;
      lastCommitAtMs = nowMs;
    }
  }
  assert.ok(
    sampledCommits >= 4 && sampledCommits <= 5,
    `one second of dirty RAF poses stays bounded to five safety checkpoints (received ${sampledCommits})`,
  );
  assert.deepEqual(
    resolveEntityFreeExplorationSettlement({
      energy: 1000 - Math.round(1000 / 3),
      speed: 10,
    }),
    { energy: 1007, elapsedTicks: 34 },
    "an entity-free fine step settles to the same energy and clock tick as the full scheduler",
  );
  assert.deepEqual(
    resolveEntityFreeExplorationSettlement({ energy: 1000, speed: 10 }),
    { energy: 1000, elapsedTicks: 0 },
    "an already-ready player does not advance the entity-free clock",
  );
  assertNear(
    THIRD_PERSON_STREAM_DIRECTION_BUCKET_RADIANS,
    (12 * Math.PI) / 180,
    "stream direction publishes in twelve-degree buckets",
  );
}
{
  const arbitraryFacing = rotateFreeFacing([0, -1], 1, 1 / 3);
  assertNear(
    Math.hypot(arbitraryFacing[0], arbitraryFacing[1]),
    1,
    "continuous turning preserves a normalized heading",
  );
  assert.ok(
    Math.abs(arbitraryFacing[0]) > 0.1 &&
      Math.abs(arbitraryFacing[1]) > 0.1 &&
      Math.abs(arbitraryFacing[0]) !== Math.abs(arbitraryFacing[1]),
    "Backrooms facing is not quantized to the eight-direction ring",
  );
  assertNear(
    facingToThirdPersonYaw(arbitraryFacing),
    Math.atan2(arbitraryFacing[0], arbitraryFacing[1]),
    "the physical third-person camera follows the exact continuous heading",
  );
  assertVecNear(
    normalizeFreeFacing([0.2, -0.7]),
    [0.2747211279, -0.9615239476],
    "arbitrary saved headings normalize without quantization",
    1e-8,
  );
}
{
  const open = resolveFreePlayerMovement({
    position: [0, 0],
    delta: [0.37, -0.21],
    isBlockedCell: () => false,
  });
  assertVecNear(open, [0.37, -0.21], "free motion retains sub-cell position");
  assert.deepEqual(
    quantizeFreePlayerPosition(open),
    [0, 0],
    "gameplay anchor does not move until the fine-cell boundary is crossed",
  );
}
{
  const wall = resolveFreePlayerMovement({
    position: [0, 0],
    delta: [5, 0],
    isBlockedCell: (x) => x === 2,
  });
  assert.ok(
    wall[0] <= 1.5 - BACKROOMS_FREE_COLLISION_RADIUS_FINE + 0.001,
    "swept free movement cannot tunnel through a wall",
  );

  const slide = resolveFreePlayerMovement({
    position: [0, 0],
    delta: [2, 2],
    isBlockedCell: (x) => x === 2,
  });
  assert.ok(slide[0] < 0.5, "collision retains the safe wall distance");
  assert.ok(slide[1] > 1, "collision slides along the free tangent");

  const fittedFurniture = {
    minX: 1,
    maxX: 2,
    minZ: -0.5,
    maxZ: 0.5,
  };
  assert.equal(
    freePlayerPositionIntersectsBounds([0.7, 0], 0.4, fittedFurniture),
    true,
    "continuous furniture collision respects the player's radius",
  );
  assert.equal(
    freePlayerPositionIntersectsBounds([0, 0], 0.4, fittedFurniture),
    false,
    "continuous furniture collision does not create a whole-cell halo",
  );
  const fittedStop = resolveFreePlayerMovement({
    position: [0, 0],
    delta: [3, 0],
    isBlockedCell: () => false,
    radius: 0.4,
    intersectsBlockedPosition: (position, radius) =>
      freePlayerPositionIntersectsBounds(position, radius, fittedFurniture),
  });
  assert.ok(
    fittedStop[0] < fittedFurniture.minX - 0.39,
    "swept free movement cannot tunnel through a fitted furniture bound",
  );
}
{
  assertVecNear(
    resolveFreePlayerStart([9, 4], [-20, 30]),
    [9, 4],
    "a teleport discards a stale continuous coordinate",
  );
  assertVecNear(
    resolveFreePlayerStart([9, 4], [9.3, 3.8]),
    [9.3, 3.8],
    "a nearby saved sub-cell coordinate resumes exactly",
  );
}
{
  const diagonalFacing = normalizeFreeFacing([0.64, -0.77]);
  const pose = resolveFreeInteractionPose({
    cell: [12, -9],
    position: [12.42, -8.76],
    facing: diagonalFacing,
    useContinuousPosition: true,
  });
  assertVecNear(
    pose.origin,
    [12.42, -8.76],
    "context prompts use Steve's continuous presentation position",
  );
  assert.deepEqual(
    pose.probe,
    resolveFacedInteractionProbe(pose.origin, diagonalFacing),
    "prompt and action share one faced interaction probe",
  );
  assert.ok(
    pose.probe.every(Number.isInteger),
    "continuous headings resolve to an integer-backed interaction target",
  );
  assert.deepEqual(
    pose.step,
    [1, -1],
    "continuous headings resolve to an integer eight-way manipulation step",
  );
  assert.deepEqual(
    resolveFreeInteractionStep([0.2, -0.98]),
    [0, -1],
    "near-cardinal headings do not send fractional movement commands",
  );
  assert.deepEqual(
    resolveFacedInteractionProbe([6, 4], [1, 1]),
    [8, 6],
    "legacy diagonal interaction reach remains at the square footprint edge",
  );
}
{
  const advanced = advanceFreeActorToward({
    position: [2.15, -1.4],
    target: [3, -1],
    maximumDistance: 0.25,
    isBlockedCell: () => false,
  });
  assertNear(
    Math.hypot(advanced[0] - 2.15, advanced[1] + 1.4),
    0.25,
    "independent actors advance continuously toward their navigation anchor",
  );
  assert.ok(
    Math.abs(advanced[0] - Math.round(advanced[0])) > 0.01,
    "an independently moving actor is not pinned to a grid center",
  );
  assertVecNear(
    resolveFreeActorStart([3, -1], advanced),
    advanced,
    "entity continuous positions survive while their anchor leads them",
  );
}

console.log("Fixed-shoulder third-person camera contract tests passed.");
