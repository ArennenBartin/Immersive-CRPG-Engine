import assert from "node:assert/strict";
import {
  DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  HORROR_FIXED_STEP_MS,
  advanceHorrorAction,
  advanceHorrorFixedSteps,
  advanceHorrorPlayerCombat,
  advanceHorrorStamina,
  advanceParasiteHorror,
  commitHorrorAction,
  commitHorrorPlayerAttack,
  commitHorrorPlayerEvade,
  createHorrorCellBlocker,
  createHorrorContactLatch,
  createHorrorFixedStepClock,
  createHorrorPlayerCombatState,
  createHorrorStaminaState,
  createHorrorStickyTargetState,
  createParasiteHorrorState,
  hasHorrorStructuralLine,
  horrorAttackDirectionToward,
  resolveHorrorCombatMode,
  resolveHorrorPrimaryCommand,
  resolveHorrorContact,
  resolveHorrorEvadeDirection,
  resolveHorrorEvadePath,
  resolveHorrorSweptMelee,
  resolveStickyHorrorTarget,
  spendHorrorStamina,
  traceHorrorFineLine,
  type HorrorFixedStepClock,
  type HorrorPlayerCombatState,
  type ParasiteHorrorEvent,
  type ParasiteHorrorState,
} from "../src/engine-core";

const EPSILON = 0.000001;
const openCell = () => false;

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

// ── Authored mode routing: map > package > legacy pulse ───────────────────
assert.equal(resolveHorrorCombatMode(), "pulse");
assert.equal(resolveHorrorCombatMode(undefined, { combat_mode: "horror_realtime" }), "horror_realtime");
assert.equal(
  resolveHorrorCombatMode({ combat_mode: "pulse" }, { combat_mode: "horror_realtime" }),
  "pulse",
);
assert.equal(
  resolveHorrorCombatMode({ combat_mode: "unknown" }, { combat_mode: "horror_realtime" }),
  "horror_realtime",
);
assert.equal(resolveHorrorCombatMode({ combat_mode: 7 }, { combat_mode: null }), "pulse");

// ── Realtime primary input keeps authored interactions reachable ─────────
{
  const command = (
    key: string,
    contextualActAvailable: boolean,
    targeting = false,
    inputBlocked = false,
  ) =>
    resolveHorrorPrimaryCommand({
      key,
      contextualActAvailable,
      targeting,
      inputBlocked,
    });

  assert.equal(command(" ", true), "act");
  assert.equal(command("enter", true), "act");
  assert.equal(command("1", true), "attack");
  assert.equal(command(" ", false), "attack");
  assert.equal(command("enter", false), "none");
  assert.equal(command(" ", true, true), "confirm_target");
  assert.equal(command("enter", true, true), "confirm_target");
  assert.equal(command("1", true, true), "none");
  assert.equal(command(" ", true, false, true), "none");
}

// ── Explicit windup → active → recovery commitment ───────────────────────
{
  let action = commitHorrorAction(DEFAULT_HORROR_PLAYER_ATTACK_PROFILE, [1, 0]);
  assert.equal(action.phase, "windup");
  assert.deepEqual(action.direction, [1, 0]);

  let advanced = advanceHorrorAction(
    action,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE.windupMs,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  );
  action = advanced.state;
  assert.equal(action.phase, "active");
  assert.deepEqual(advanced.transitions.map((transition) => transition.to), ["active"]);

  advanced = advanceHorrorAction(
    action,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE.activeMs,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  );
  action = advanced.state;
  assert.equal(action.phase, "recovery");

  advanced = advanceHorrorAction(
    action,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE.recoveryMs,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  );
  assert.equal(advanced.state.phase, "idle");

  const entireCommitment = advanceHorrorAction(
    commitHorrorAction(DEFAULT_HORROR_PLAYER_ATTACK_PROFILE, [1, 0]),
    930,
    DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  );
  assert.equal(entireCommitment.state.phase, "idle");
  assert.deepEqual(
    entireCommitment.transitions.map(({ from, to }) => `${from}->${to}`),
    ["windup->active", "active->recovery", "recovery->idle"],
  );
}

// ── Stamina spends immediately and regenerates only beyond the delay ─────
{
  let stamina = createHorrorStaminaState();
  const spend = spendHorrorStamina(stamina, 20);
  assert.equal(spend.spent, true);
  stamina = spend.state;
  assert.equal(stamina.current, 80);
  stamina = advanceHorrorStamina(stamina, 650);
  assert.equal(stamina.current, 80, "the delay boundary itself grants no regeneration");
  stamina = advanceHorrorStamina(stamina, 400);
  assertNear(stamina.current, 90, "25 stamina/second regenerates after the delay");
  assert.equal(spendHorrorStamina(stamina, 91).spent, false);

  const committed = commitHorrorPlayerAttack(
    createHorrorPlayerCombatState([1, 0]),
    [1, 0],
  );
  assert.equal(committed.committed, true);
  assert.equal(committed.state.stamina.current, 80, "a whiff commits cost before hit sampling");
  assert.equal(committed.state.attack.phase, "windup");
}

// ── Hostile contact is blocked, latched, and never promoted to attack ─────
{
  let latch = createHorrorContactLatch();
  let recoilCount = 0;
  let attackCount = 0;
  for (let elapsed = 0; elapsed < 5000; elapsed += 80) {
    const contact = resolveHorrorContact(latch, {
      forwardHeld: true,
      direction: [1, 0],
      blockedByHostileId: "parasite",
    });
    latch = contact.latch;
    recoilCount += Number(contact.emitCosmeticRecoil);
    attackCount += Number(contact.attackRequested);
    assert.equal(contact.movementBlocked, true);
  }
  assert.equal(recoilCount, 1);
  assert.equal(attackCount, 0);

  let changed = resolveHorrorContact(latch, {
    forwardHeld: true,
    direction: [1, 1],
    blockedByHostileId: "parasite",
  });
  assert.equal(changed.emitCosmeticRecoil, true, "direction change resets contact response");
  changed = resolveHorrorContact(changed.latch, {
    forwardHeld: false,
    direction: [1, 1],
  });
  assert.deepEqual(changed.latch, {}, "forward release clears the latch");
  const separated = resolveHorrorContact(
    { hostileId: "parasite", direction: [1, 0] },
    { forwardHeld: true, direction: [1, 0] },
  );
  assert.deepEqual(separated.latch, {}, "restored separation clears the latch");
}

// ── Sticky facing-cone target: angle, distance, ID, wall, hysteresis ──────
{
  let resolution = resolveStickyHorrorTarget(
    createHorrorStickyTargetState(),
    {
      origin: [0, 0],
      facing: [1, 0],
      elapsedMs: 16,
      isBlocked: openCell,
      candidates: [
        { id: "angled-near", cell: [2, 1] },
        { id: "straight-far", cell: [3, 0] },
      ],
    },
  );
  assert.equal(resolution.target?.id, "straight-far", "angle outranks distance");

  resolution = resolveStickyHorrorTarget(
    createHorrorStickyTargetState(),
    {
      origin: [0, 0],
      facing: [1, 0],
      elapsedMs: 16,
      isBlocked: openCell,
      candidates: [
        { id: "z-target", cell: [3, 0] },
        { id: "a-target", cell: [3, 0] },
      ],
    },
  );
  assert.equal(resolution.target?.id, "a-target", "entity ID is the stable final tie-breaker");

  const retained = resolveStickyHorrorTarget(
    { targetId: "locked", obstructedForMs: 0 },
    {
      origin: [0, 0],
      facing: [1, 0],
      elapsedMs: 16,
      isBlocked: openCell,
      candidates: [
        { id: "locked", cell: [2, 2] },
        { id: "challenger", cell: [3, 0] },
      ],
    },
  );
  assert.equal(retained.target?.id, "locked", "retention cone prevents boundary flicker");

  const centralWall = createHorrorCellBlocker([[1, 0]]);
  const throughWall = resolveStickyHorrorTarget(
    createHorrorStickyTargetState(),
    {
      origin: [0, 0],
      facing: [1, 0],
      elapsedMs: 16,
      isBlocked: centralWall,
      candidates: [{ id: "hidden", cell: [3, 0] }],
    },
  );
  assert.equal(throughWall.target, undefined, "new targets are never selected through walls");

  const briefOcclusion = resolveStickyHorrorTarget(
    { targetId: "locked", obstructedForMs: 0 },
    {
      origin: [0, 0],
      facing: [1, 0],
      elapsedMs: 100,
      isBlocked: centralWall,
      candidates: [{ id: "locked", cell: [3, 0] }],
    },
  );
  assert.equal(briefOcclusion.target?.id, "locked");
  const expiredOcclusion = resolveStickyHorrorTarget(briefOcclusion.state, {
    origin: [0, 0],
    facing: [1, 0],
    elapsedMs: 30,
    isBlocked: centralWall,
    candidates: [{ id: "locked", cell: [3, 0] }],
  });
  assert.equal(expiredOcclusion.target, undefined);
}

// ── Supercover walls clip physical swept melee, not statistical rolls ─────
{
  const diagonalTrace = traceHorrorFineLine([0, 0], [2, 2]);
  assert.ok(diagonalTrace.some((cell) => cell[0] === 1 && cell[1] === 0));
  assert.ok(diagonalTrace.some((cell) => cell[0] === 0 && cell[1] === 1));
  assert.equal(
    hasHorrorStructuralLine([0, 0], [2, 2], createHorrorCellBlocker([[1, 0]])),
    false,
    "a ray cannot leak through an exact structural corner",
  );

  const targets = [
    { id: "front-a", cell: [2, 0] as const, footprintCells: [[2, 0] as const] },
    { id: "front-b", cell: [3, 1] as const, footprintCells: [[3, 1] as const] },
    { id: "behind", cell: [-2, 0] as const, footprintCells: [[-2, 0] as const] },
  ];
  const clearSweep = resolveHorrorSweptMelee({
    origin: [0, 0],
    startDirection: [1, -1],
    endDirection: [1, 1],
    reachFine: 4,
    targets,
    isBlocked: openCell,
  });
  assert.deepEqual(clearSweep.newlyHitTargetIds, ["front-a", "front-b"]);
  assert.ok(clearSweep.sweptCells.some((cell) => sameCoordinate(cell, [2, 0])));

  const repeatSweep = resolveHorrorSweptMelee({
    origin: [0, 0],
    startDirection: [1, -1],
    endDirection: [1, 1],
    reachFine: 4,
    targets,
    alreadyHitTargetIds: ["front-a"],
    isBlocked: openCell,
  });
  assert.deepEqual(repeatSweep.newlyHitTargetIds, ["front-b"]);

  const wall = createHorrorCellBlocker(
    Array.from({ length: 9 }, (_, index) => [1, index - 4] as const),
  );
  const clippedSweep = resolveHorrorSweptMelee({
    origin: [0, 0],
    startDirection: [1, -1],
    endDirection: [1, 1],
    reachFine: 4,
    targets,
    isBlocked: wall,
  });
  assert.deepEqual(clippedSweep.newlyHitTargetIds, []);
  assert.equal(
    clippedSweep.sweptCells.some((cell) => cell[0] > 1),
    false,
    "the wall truncates the rendered and damaging sweep cells",
  );
}

function sameCoordinate(a: readonly number[], b: readonly number[]) {
  return a[0] === b[0] && a[1] === b[1];
}

// ── Actor-sized melee reaches outward from the body, not its center ───────
{
  assert.deepEqual(
    horrorAttackDirectionToward([0, 0], [5, 1]),
    [1, 0],
    "shallow off-axis aim stays cardinal instead of becoming a diagonal miss",
  );
  assert.deepEqual(horrorAttackDirectionToward([0, 0], [5, 3]), [1, 1]);

  const pointBlankDiagonal = resolveHorrorSweptMelee({
    origin: [0, 0],
    startDirection: [1, 1],
    endDirection: [1, 1],
    originFootprintRadiusFine: 1,
    reachFine: 2,
    halfWidthDegrees: 35,
    targets: [{ id: "steve", cell: [3, 3] }],
    isBlocked: openCell,
  });
  assert.deepEqual(
    pointBlankDiagonal.newlyHitTargetIds,
    ["steve"],
    "legal diagonal footprint contact is inside authored melee reach",
  );

  const sameContactBehindWall = resolveHorrorSweptMelee({
    origin: [0, 0],
    startDirection: [1, 1],
    endDirection: [1, 1],
    originFootprintRadiusFine: 1,
    reachFine: 2,
    halfWidthDegrees: 35,
    targets: [{ id: "steve", cell: [3, 3] }],
    isBlocked: createHorrorCellBlocker([[1, 0], [0, 1]]),
  });
  assert.deepEqual(
    sameContactBehindWall.newlyHitTargetIds,
    [],
    "body-relative reach still cannot pass through a structural corner",
  );
}

// ── Evade is a committed, collision-safe two-cell traversal ──────────────
{
  assert.deepEqual(resolveHorrorEvadeDirection(undefined, [1, 0]), [-1, 0]);
  assert.deepEqual(resolveHorrorEvadeDirection([0, 1], [1, 0]), [0, 1]);

  const wall = createHorrorCellBlocker([[8, 5]]);
  const path = resolveHorrorEvadePath({
    actorId: "steve",
    origin: [5, 5],
    direction: [1, 0],
    isBlocked: wall,
  });
  assert.equal(path.stepsTravelled, 1);
  assert.deepEqual(path.end, [6, 5]);
  assert.equal(path.blocked, true);
  assert.equal(path.blockReason, "structure");

  let player = commitHorrorPlayerAttack(
    createHorrorPlayerCombatState([1, 0]),
    [1, 0],
  ).state;
  let evade = commitHorrorPlayerEvade(player, {
    actorId: "steve",
    origin: [5, 5],
    facing: [1, 0],
    heldDirection: [1, 0],
    isBlocked: wall,
  });
  assert.equal(evade.committed, false);
  assert.equal(evade.deniedBy, "offensive_commitment");

  player = advanceHorrorPlayerCombat(player, 280).state;
  assert.equal(player.attack.phase, "recovery");
  player = advanceHorrorPlayerCombat(player, 325).state;
  const offensiveRemaining = player.attack.phaseRemainingMs;
  evade = commitHorrorPlayerEvade(player, {
    actorId: "steve",
    origin: [5, 5],
    facing: [1, 0],
    heldDirection: [1, 0],
    isBlocked: wall,
  });
  assert.equal(evade.committed, true);
  assert.equal(evade.stepsTravelled, 1);
  assert.equal(evade.state.stamina.current, 50);
  assert.equal(
    evade.state.attack.phaseRemainingMs,
    offensiveRemaining,
    "evade never erases offensive recovery",
  );
  assert.equal(evade.state.evadeRecoveryRemainingMs, 850);
  assert.equal(evade.state.contactGraceRemainingMs, 120);
  const afterGrace = advanceHorrorPlayerCombat(evade.state, 120).state;
  assert.equal(afterGrace.contactGraceRemainingMs, 0);
}

// ── Parasite pursuit, tracking cutoff, lunge, miss, and recovery ──────────
{
  let parasite = createParasiteHorrorState("parasite", [0, 0], [1, 0]);
  let advanced = advanceParasiteHorror(parasite, 179, {
    player: { id: "steve", cell: [10, 0] },
    targetTrackable: true,
    isBlocked: openCell,
  });
  assert.deepEqual(advanced.state.cell, [0, 0]);
  advanced = advanceParasiteHorror(advanced.state, 1, {
    player: { id: "steve", cell: [10, 0] },
    targetTrackable: true,
    isBlocked: openCell,
  });
  assert.deepEqual(advanced.state.cell, [2, 0]);
  assert.equal(
    advanced.events.filter((event) => event.kind === "pursuit_step").length,
    2,
  );

  parasite = createParasiteHorrorState("parasite", [0, 0], [1, 0]);
  advanced = advanceParasiteHorror(parasite, 10, {
    player: { id: "steve", cell: [5, 0] },
    targetTrackable: true,
    isBlocked: openCell,
  });
  parasite = advanced.state;
  assert.equal(parasite.action.phase, "windup");
  assert.deepEqual(parasite.facing, [1, 0]);

  advanced = advanceParasiteHorror(parasite, 280, {
    player: { id: "steve", cell: [0, 5] },
    targetTrackable: true,
    isBlocked: openCell,
  });
  parasite = advanced.state;
  assert.equal(parasite.directionLocked, false);
  assert.deepEqual(parasite.facing, [0, 1], "the first 60% tracks Steve");

  advanced = advanceParasiteHorror(parasite, 10, {
    player: { id: "steve", cell: [0, 5] },
    targetTrackable: true,
    isBlocked: openCell,
  });
  parasite = advanced.state;
  assert.equal(parasite.directionLocked, true);
  assert.deepEqual(parasite.lockedDirection, [0, 1]);

  advanced = advanceParasiteHorror(parasite, 200, {
    player: { id: "steve", cell: [-5, 0] },
    targetTrackable: false,
    isBlocked: openCell,
  });
  parasite = advanced.state;
  assert.equal(parasite.action.phase, "active", "post-lock route loss cannot cancel");
  assert.deepEqual(parasite.lockedDirection, [0, 1]);

  advanced = advanceParasiteHorror(parasite, 120, {
    player: { id: "steve", cell: [-5, 0] },
    targetTrackable: false,
    isBlocked: openCell,
  });
  parasite = advanced.state;
  assert.deepEqual(parasite.cell, [0, 2], "the committed lunge follows locked direction");
  assert.equal(parasite.action.phase, "recovery");
  assert.ok(advanced.events.some((event) => event.kind === "attack_missed"));
  assert.ok(advanced.events.some((event) => event.kind === "recovery_started"));

  advanced = advanceParasiteHorror(parasite, 850, {
    player: { id: "steve", cell: [-5, 0] },
    targetTrackable: false,
    isBlocked: openCell,
  });
  assert.equal(advanced.state.action.phase, "idle");
  assert.ok(advanced.events.some((event) => event.kind === "recovery_finished"));

  const cancelStarted = advanceParasiteHorror(
    createParasiteHorrorState("parasite", [0, 0], [1, 0]),
    100,
    {
      player: { id: "steve", cell: [5, 0] },
      targetTrackable: true,
      isBlocked: openCell,
    },
  );
  const cancelled = advanceParasiteHorror(cancelStarted.state, 10, {
    player: { id: "steve", cell: [5, 0] },
    targetTrackable: false,
    isBlocked: openCell,
  });
  assert.equal(cancelled.state.action.phase, "idle");
  assert.ok(cancelled.events.some((event) => event.kind === "windup_cancelled"));
}

// A structural cell outside the aim ray still shortens the physical footprint
// lunge when the Parasite reaches it.
{
  const lungeWall = createHorrorCellBlocker([[3, 1]]);
  let parasite = advanceParasiteHorror(
    createParasiteHorrorState("parasite", [0, 0], [1, 0]),
    500,
    {
      player: { id: "steve", cell: [5, 0] },
      targetTrackable: true,
      isBlocked: lungeWall,
    },
  ).state;
  assert.equal(parasite.action.phase, "active");
  const active = advanceParasiteHorror(parasite, 120, {
    player: { id: "steve", cell: [5, 0] },
    targetTrackable: true,
    isBlocked: lungeWall,
  });
  parasite = active.state;
  assert.deepEqual(parasite.cell, [1, 0]);
  assert.equal(
    active.events.filter((event) => event.kind === "lunge_step").length,
    1,
  );
  assert.ok(active.events.some((event) => event.kind === "lunge_blocked"));
  assert.equal(parasite.action.phase, "recovery");
}

// ── One fixed-step accumulator is invariant at 20, 30, and 60Hz ──────────
interface InvariantSimulation {
  player: HorrorPlayerCombatState;
  parasite: ParasiteHorrorState;
}

interface InvariantResult {
  state: InvariantSimulation;
  clock: HorrorFixedStepClock;
  eventKinds: readonly ParasiteHorrorEvent["kind"][];
}

const simulateOneSecond = (hz: 20 | 30 | 60): InvariantResult => {
  let clock = createHorrorFixedStepClock(HORROR_FIXED_STEP_MS);
  let state: InvariantSimulation = {
    player: commitHorrorPlayerAttack(
      createHorrorPlayerCombatState([1, 0]),
      [1, 0],
    ).state,
    parasite: createParasiteHorrorState("parasite", [0, 0], [1, 0]),
  };
  const eventKinds: ParasiteHorrorEvent["kind"][] = [];
  for (let frame = 0; frame < hz; frame += 1) {
    const advanced = advanceHorrorFixedSteps(
      clock,
      state,
      1000 / hz,
      (current, stepMs) => {
        const player = advanceHorrorPlayerCombat(current.player, stepMs).state;
        const parasite = advanceParasiteHorror(current.parasite, stepMs, {
          player: { id: "steve", cell: [5, 0] },
          targetTrackable: true,
          isBlocked: openCell,
        });
        return {
          state: { player, parasite: parasite.state },
          events: parasite.events,
        };
      },
    );
    clock = advanced.clock;
    state = advanced.state;
    eventKinds.push(...advanced.events.map((event) => event.kind));
  }
  return { state, clock, eventKinds };
};

{
  const at20 = simulateOneSecond(20);
  const at30 = simulateOneSecond(30);
  const at60 = simulateOneSecond(60);
  assert.equal(at20.clock.tick, 100);
  assert.equal(at30.clock.tick, 100);
  assert.equal(at60.clock.tick, 100);
  assertNear(at20.clock.accumulatorMs, 0, "20Hz accumulator drains");
  assertNear(at30.clock.accumulatorMs, 0, "30Hz accumulator drains");
  assertNear(at60.clock.accumulatorMs, 0, "60Hz accumulator drains");

  for (const result of [at30, at60]) {
    assert.equal(result.state.player.attack.phase, at20.state.player.attack.phase);
    assertNear(
      result.state.player.attack.phaseRemainingMs,
      at20.state.player.attack.phaseRemainingMs,
      "player recovery timing is frame-rate independent",
    );
    assertNear(
      result.state.player.stamina.current,
      at20.state.player.stamina.current,
      "stamina regeneration is frame-rate independent",
    );
    assert.deepEqual(result.state.parasite.cell, at20.state.parasite.cell);
    assert.equal(result.state.parasite.action.phase, at20.state.parasite.action.phase);
    assertNear(
      result.state.parasite.action.phaseRemainingMs,
      at20.state.parasite.action.phaseRemainingMs,
      "Parasite recovery timing is frame-rate independent",
    );
    assert.deepEqual(result.eventKinds, at20.eventKinds);
  }
}

console.log("Horror realtime combat Phase-1 contract tests passed.");
