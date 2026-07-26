import assert from "node:assert/strict";
import {
  FIRST_PERSON_ATMOSPHERE,
  FIRST_PERSON_FACING_RING,
  ISOMETRIC_ATMOSPHERE,
  firstPersonStepVector,
  isFirstPersonExploreActive,
  normalizeFirstPersonFacing,
  resolveAuthoredViewMode,
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
    { forward: intent.forward, turn: intent.turn, strafe: intent.strafe, wait: intent.wait },
    { forward: 1, turn: 1, strafe: 0, wait: false },
    "W+D holds forward pressure and a clockwise turn",
  );
}
{
  const intent = resolveHeldFirstPersonIntent(
    new Set(["arrowup", "arrowleft", "q"]),
    new Set(),
  );
  assert.deepEqual(
    { forward: intent.forward, turn: intent.turn, strafe: intent.strafe },
    { forward: 1, turn: -1, strafe: -1 },
    "synthesized joystick arrows plus Q resolve to forward, left turn, left strafe",
  );
}
{
  const intent = resolveHeldFirstPersonIntent(new Set(["w", "s", "q", "e"]), new Set());
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
  "First Person contract passed: authored view mode, exploration-only activation, 45° facing ring, crawler intent, fine-grid step vectors, haze fog variant, and atmosphere presets.",
);
