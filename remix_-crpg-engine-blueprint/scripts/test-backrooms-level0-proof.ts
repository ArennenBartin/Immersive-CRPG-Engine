// Backrooms generator — Phase 1: the disposable Level 0 proof preset.
// Run: npm run test:backrooms-level0-proof
//
// This preset runs through the ORDINARY dungeon generator. These tests assert
// the properties that make its output Backrooms-shaped rather than
// dungeon-shaped, plus determinism over a small fixed-seed corpus, plus the
// guarantee that the legacy institutional preset is unaffected.
//
// When the semantic generator lands in Phase 4, this file is deleted with the
// preset it covers.

import assert from "node:assert/strict";

import {
  GamePackageSchema,
  MapDataSchema,
  createEmptyGamePackage,
  type GamePackage,
  type MapData,
} from "../src/schema/game";
import { generateDungeon, type DungeonGenerationResult } from "../src/dungeonGen";
import { expandMapToFine } from "../src/engine-core/fineWorld";
import { FINE_PER_MACRO } from "../src/engine-core/gridCoordinates";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_DAMASK_PARTITION_WALL_OBJECT_IDS,
  BACKROOMS_LEVEL_ZERO_DAMASK_THIN_WALL_OBJECT_IDS,
  BACKROOMS_LEVEL_ZERO_PARTITION_WALL_OBJECT_IDS,
  BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_OBJECT_IDS,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_THICKNESS,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_TEXTURES,
  isBackroomsLevelZeroDamaskThinWallObjectId,
  isBackroomsLevelZeroThinWallObjectId,
  readBackroomsLevelZeroPartitionWall,
  readBackroomsLevelZeroThinWallFaceMask,
} from "../src/schema/presets";
import {
  LEVEL0_PROOF_ARCHETYPE_IDS,
  LEVEL0_PROOF_RECIPE_ID,
  LEVEL0_PROOF_THEME_ID,
  createLevel0ProofRecipe,
  installLevel0ProofGeneratorContent,
} from "../src/dungeonGen/presets/level0Proof";
import {
  INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID,
  createInstitutionalRuinSingleMapRecipe,
  installInstitutionalRuinGeneratorContent,
} from "../src/dungeonGen/presets/institutionalRuin";

const GENERATED_AT = "2026-08-08T12:00:00.000Z";

// Commit tier from the plan's verification gate. Development and stress tiers
// run wider corpora; this is what every commit pays for.
const CORPUS_SEEDS = Array.from(
  { length: 32 },
  (_, index) => `level0-proof-${String(index + 1).padStart(3, "0")}`,
);

const level0Package = (): GamePackage =>
  GamePackageSchema.parse(installLevel0ProofGeneratorContent(createEmptyGamePackage()));

const generate = (seed: string, pkg: GamePackage): DungeonGenerationResult =>
  generateDungeon({
    recipe: createLevel0ProofRecipe(seed),
    gamePackage: pkg,
    generatedAt: GENERATED_AT,
    debug: true,
  });

const fatalDiagnostics = (result: DungeonGenerationResult) =>
  (result.diagnostics || []).filter((entry) => entry.severity === "fatal");

// ── 1. The preset installs cleanly and is self-contained ───────────────────

console.log("level0 proof: preset installs with its own IDs");

const pkg = level0Package();

assert.ok(
  pkg.dungeon_recipes.some((recipe) => recipe.id === LEVEL0_PROOF_RECIPE_ID),
  "the proof recipe must install",
);
assert.ok(
  pkg.dungeon_themes.some((theme) => theme.id === LEVEL0_PROOF_THEME_ID),
  "the proof theme must install",
);
for (const objectId of [
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  ...BACKROOMS_LEVEL_ZERO_THIN_WALL_OBJECT_IDS,
  ...BACKROOMS_LEVEL_ZERO_DAMASK_THIN_WALL_OBJECT_IDS,
  ...BACKROOMS_LEVEL_ZERO_PARTITION_WALL_OBJECT_IDS,
  ...BACKROOMS_LEVEL_ZERO_DAMASK_PARTITION_WALL_OBJECT_IDS,
]) {
  assert.ok(
    pkg.object_library.some((object) => object.id === objectId),
    `the proof preset must install ${objectId}`,
  );
}

for (const objectId of [
  ...BACKROOMS_LEVEL_ZERO_PARTITION_WALL_OBJECT_IDS,
  ...BACKROOMS_LEVEL_ZERO_DAMASK_PARTITION_WALL_OBJECT_IDS,
]) {
  const wall = pkg.object_library.find((object) => object.id === objectId);
  const contract = readBackroomsLevelZeroPartitionWall(objectId);
  assert.ok(wall && contract, `${objectId} must resolve as a partition wall`);
  assert.ok(wall.tags.includes("partition_wall"));
  assert.ok(
    !wall.tags.includes("wall"),
    "oriented partition walls must not receive legacy auto-rotation",
  );
  assert.equal(wall.collision.profile, "single");
  const body = wall.parts.find((part) => part.name === "partition_wallpaper_body");
  assert.ok(body, `${objectId} must expose a wallpaper body`);
  assert.ok(
    Math.abs(
      Math.min(body.size[0], body.size[2]) / FINE_PER_MACRO -
        contract.thickness,
    ) < 1e-9,
    `${objectId} must retain its authored world-space thickness`,
  );
  assert.ok(
    contract.orientation === "horizontal"
      ? body.size[0] > body.size[2]
      : body.size[2] > body.size[0],
    `${objectId} must be long on its declared axis`,
  );
  if (contract.finish === "damask") {
    assert.ok(wall.tags.includes("damask_finish"));
    const damaskMaterial = wall.material_settings.find(
      (setting) =>
        setting.texture_image_url ===
        BACKROOMS_LEVEL_ZERO_TEXTURES.damaskWallpaper,
    );
    assert.ok(
      damaskMaterial,
      `${objectId} must use the supplied damask texture`,
    );
    assert.equal(damaskMaterial.color, "#ffffff");
    assert.equal(damaskMaterial.texture_scale, 0.25);
  }
}

// Every possible N/E/S/W exposure mask has a stable object definition. A
// blocked cell can therefore choose its visible faces without inventing a
// renderer-only map subtype or losing package round-trip references.
for (const [faceMask, objectId] of
  BACKROOMS_LEVEL_ZERO_THIN_WALL_OBJECT_IDS.entries()) {
  const wall = pkg.object_library.find((object) => object.id === objectId);
  assert.ok(wall, `thin-wall mask ${faceMask.toString(16)} must resolve`);
  assert.ok(wall.tags.includes("thin_wall"));
  assert.ok(
    !wall.tags.includes("wall"),
    "directional thin walls must not receive the legacy auto-rotation pass",
  );
  const exposedFaceCount = [
    BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.north,
    BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.east,
    BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.south,
    BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.west,
  ].filter((bit) => (faceMask & bit) !== 0).length;
  assert.equal(
    wall.parts.length,
    exposedFaceCount * 3,
    "each exposed face has wallpaper, base trim, and top trim",
  );
  for (const body of wall.parts.filter((part) =>
    part.name.endsWith("wallpaper_body"),
  )) {
    assert.ok(
      Math.abs(Math.min(body.size[0], body.size[2]) -
        BACKROOMS_LEVEL_ZERO_THIN_WALL_THICKNESS) < 1e-9,
      `wall body ${body.name} must be genuinely thin`,
    );
  }
}

for (const [faceMask, objectId] of
  BACKROOMS_LEVEL_ZERO_DAMASK_THIN_WALL_OBJECT_IDS.entries()) {
  const wall = pkg.object_library.find((object) => object.id === objectId);
  assert.ok(wall, `damask wall mask ${faceMask.toString(16)} must resolve`);
  assert.ok(wall.tags.includes("thin_wall"));
  assert.ok(wall.tags.includes("damask_finish"));
  assert.equal(
    readBackroomsLevelZeroThinWallFaceMask(objectId),
    faceMask,
  );
  assert.ok(
    wall.material_settings.some(
      (setting) =>
        setting.texture_image_url ===
        BACKROOMS_LEVEL_ZERO_TEXTURES.damaskWallpaper,
    ),
    `${objectId} must use the supplied damask texture`,
  );
}

// The proof brings no encounters, hazards, rewards, or narrative beats.
assert.equal(pkg.dungeon_encounter_profiles.length, 0);
assert.equal(pkg.dungeon_hazard_profiles.length, 0);
assert.equal(pkg.dungeon_reward_profiles.length, 0);
assert.equal(pkg.dungeon_narrative_profiles.length, 0);

// ── 2. Generation succeeds and stays Backrooms-shaped across the corpus ────

console.log(`level0 proof: ${CORPUS_SEEDS.length}-seed corpus is quiet and doorless`);

const hashesBySeed = new Map<string, string>();

for (const seed of CORPUS_SEEDS) {
  const result = generate(seed, pkg);
  const fatal = fatalDiagnostics(result);
  assert.equal(
    fatal.length,
    0,
    `seed ${seed} generated fatal diagnostics: ${fatal.map((d) => d.code).join(", ")}`,
  );
  assert.equal(result.maps.length, 1, `seed ${seed} must produce exactly one map`);

  const map: MapData = MapDataSchema.parse(result.maps[0]);
  hashesBySeed.set(seed, result.canonicalResultHash);

  // No mandatory actors. This is the single most important property of the
  // proof: Level 0 must be walkable with nothing in it.
  assert.equal(map.entity_placements.length, 0, `seed ${seed} placed an actor`);

  // No dungeon loot or supply cadence.
  assert.equal(map.item_placements.length, 0, `seed ${seed} placed an item`);
  assert.equal(map.container_placements.length, 0, `seed ${seed} placed a container`);

  // No keys, gates, secrets, or vertical transitions.
  assert.equal(result.graph.gates.length, 0, `seed ${seed} produced a gate`);
  assert.equal(map.exits.length, 0, `seed ${seed} produced a map exit`);
  assert.equal(map.triggers.length, 0, `seed ${seed} produced a trigger`);

  // Only Level 0 materials. Generated solids use exposed-face thin-wall
  // variants rather than the authored full-cell block.
  const cellObjectIds = new Set(
    map.cells.map((cell) => cell.object_id).filter(Boolean) as string[],
  );
  assert.ok(
    cellObjectIds.has(BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID),
    `seed ${seed} must retain its Level 0 carpet`,
  );
  assert.ok(
    !cellObjectIds.has(BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID),
    `seed ${seed} retained the full-cell wall block`,
  );
  assert.ok(
    [...cellObjectIds].every(
      (objectId) =>
        objectId === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID ||
        isBackroomsLevelZeroThinWallObjectId(objectId),
    ),
    `seed ${seed} baked a non-Level-0 cell object`,
  );

  const cellByCoord = new Map(
    map.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]),
  );
  const expectedFaceMask = (cell: MapData["cells"][number]) =>
    [
      { dx: 0, dz: -1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.north },
      { dx: 1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.east },
      { dx: 0, dz: 1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.south },
      { dx: -1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.west },
    ].reduce(
      (mask, face) =>
        cellByCoord.get(`${cell.x + face.dx}:${cell.z + face.dz}`)?.walkable
          ? mask | face.bit
          : mask,
      0,
    );
  const thinWallCells = map.cells.filter(
    (cell) =>
      !cell.walkable && isBackroomsLevelZeroThinWallObjectId(cell.object_id),
  );
  assert.ok(thinWallCells.length > 0, `seed ${seed} must bake thin walls`);
  const damaskThinWallCells = thinWallCells.filter((cell) =>
    isBackroomsLevelZeroDamaskThinWallObjectId(cell.object_id),
  );
  assert.ok(
    damaskThinWallCells.length > 0,
    `seed ${seed} must select some room walls for damask wallpaper`,
  );
  assert.ok(
    damaskThinWallCells.length < thinWallCells.length,
    `seed ${seed} must retain aged wallpaper alongside the damask`,
  );
  for (const wallCell of thinWallCells) {
    assert.equal(wallCell.blocks_los, true, "thin presentation keeps solid LOS");
    assert.equal(
      readBackroomsLevelZeroThinWallFaceMask(wallCell.object_id),
      expectedFaceMask(wallCell),
      `wall ${wallCell.x}:${wallCell.z} must expose exactly its walkable faces`,
    );
  }

  // These are true interior protrusions, not another skin around the same
  // macro blocks. Each run occupies only the center fine-cell strip of an
  // otherwise walkable floor tile, remains attached at one end, and leaves a
  // navigable free end where its authored thickness can be seen.
  const partitionOverrides = map.fine_cell_overrides || [];
  assert.ok(
    partitionOverrides.length > 0,
    `seed ${seed} must bake genuine fine-grid partition walls`,
  );
  const partitionStyles = new Set<string>();
  const partitionFinishes = new Set<string>();
  const runs = new Map<string, typeof partitionOverrides>();
  for (const override of partitionOverrides) {
    const contract = readBackroomsLevelZeroPartitionWall(
      override.overrides.object_id,
    );
    assert.ok(contract, `seed ${seed} emitted a non-partition fine override`);
    partitionStyles.add(contract.style);
    partitionFinishes.add(contract.finish);
    assert.equal(override.overrides.walkable, false);
    assert.equal(override.overrides.blocks_los, true);
    assert.equal(override.overrides.height, 1);
    assert.equal(override.overrides.visual_height, 1.5);
    const tag = override.overrides.tag;
    assert.ok(tag?.startsWith("backrooms_partition_"));
    const run = runs.get(tag) || [];
    run.push(override);
    runs.set(tag, run);
  }
  assert.deepEqual(
    [...partitionStyles].sort(),
    [...BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES].sort(),
    `seed ${seed} must visibly mix slim, standard, and heavy partitions`,
  );
  assert.ok(runs.size >= 3, `seed ${seed} needs at least three protruding runs`);
  assert.deepEqual(
    [...partitionFinishes].sort(),
    ["aged", "damask"],
    `seed ${seed} must mix aged and damask partition runs`,
  );

  for (const [runTag, run] of runs) {
    const contract = readBackroomsLevelZeroPartitionWall(
      run[0].overrides.object_id,
    )!;
    assert.ok(
      run.every(
        (override) =>
          override.overrides.object_id === run[0].overrides.object_id,
      ),
      `${runTag} changed thickness or orientation mid-run`,
    );
    const macroCells = [...new Map(
      run.map((override) => [
        `${override.macro_cell[0]}:${override.macro_cell[1]}`,
        override.macro_cell,
      ]),
    ).values()];
    assert.ok(
      macroCells.length >= 2 && macroCells.length <= 4,
      `${runTag} must protrude two to four macro cells`,
    );
    assert.equal(
      run.length,
      macroCells.length * FINE_PER_MACRO,
      `${runTag} must occupy exactly one fine-cell strip`,
    );
    const sorted = [...macroCells].sort((left, right) =>
      contract.orientation === "horizontal"
        ? left[0] - right[0]
        : left[1] - right[1],
    );
    const fixedAxis = contract.orientation === "horizontal" ? 1 : 0;
    const runAxis = contract.orientation === "horizontal" ? 0 : 1;
    assert.ok(
      sorted.every(
        (cell, index) =>
          cell[fixedAxis] === sorted[0][fixedAxis] &&
          (index === 0 || cell[runAxis] === sorted[index - 1][runAxis] + 1),
      ),
      `${runTag} must be a contiguous straight protrusion`,
    );
    for (const macroCell of sorted) {
      const offsets = run
        .filter(
          (override) =>
            override.macro_cell[0] === macroCell[0] &&
            override.macro_cell[1] === macroCell[1],
        )
        .map((override) => override.fine_offset)
        .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      const expected = Array.from(
        { length: FINE_PER_MACRO },
        (_, along): [number, number] =>
          contract.orientation === "horizontal"
            ? [along, 1]
            : [1, along],
      );
      assert.deepEqual(offsets, expected, `${runTag} has a blocky footprint`);
    }
    const before: [number, number] = [sorted[0][0], sorted[0][1]];
    const last = sorted[sorted.length - 1];
    const after: [number, number] = [last[0], last[1]];
    before[runAxis] -= 1;
    after[runAxis] += 1;
    const endStates = [before, after].map(
      (cell) => cellByCoord.get(`${cell[0]}:${cell[1]}`)?.walkable,
    );
    assert.equal(
      endStates.filter((walkable) => walkable === false).length,
      1,
      `${runTag} must connect to one structural wall end`,
    );
    assert.equal(
      endStates.filter((walkable) => walkable === true).length,
      1,
      `${runTag} must expose one visible free end`,
    );
  }

  const fineMap = expandMapToFine(map);
  const fineCellByCoord = new Map(
    fineMap.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]),
  );
  for (const override of partitionOverrides) {
    const fineX =
      override.macro_cell[0] * FINE_PER_MACRO + override.fine_offset[0];
    const fineZ =
      override.macro_cell[1] * FINE_PER_MACRO + override.fine_offset[1];
    const fineCell = fineCellByCoord.get(`${fineX}:${fineZ}`);
    assert.equal(fineCell?.walkable, false);
    assert.equal(fineCell?.blocks_los, true);
    assert.equal(fineCell?.object_id, override.overrides.object_id);
  }

  const validActorCenters = new Set<string>();
  const walkableFineCells = new Set(
    fineMap.cells
      .filter((cell) => cell.walkable)
      .map((cell) => `${cell.x}:${cell.z}`),
  );
  for (const cell of fineMap.cells) {
    if (!cell.walkable) continue;
    const footprintClear = [-1, 0, 1].every((dx) =>
      [-1, 0, 1].every((dz) =>
        walkableFineCells.has(`${cell.x + dx}:${cell.z + dz}`),
      ),
    );
    if (footprintClear) validActorCenters.add(`${cell.x}:${cell.z}`);
  }
  const fineSpawn = fineMap.spawns[0].cell;
  const fineSpawnKey = `${fineSpawn[0]}:${fineSpawn[1]}`;
  assert.ok(validActorCenters.has(fineSpawnKey), `seed ${seed} blocked its spawn`);
  const reachedActorCenters = new Set([fineSpawnKey]);
  const queue = [[fineSpawn[0], fineSpawn[1]] as [number, number]];
  for (let index = 0; index < queue.length; index += 1) {
    const [x, z] = queue[index];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next: [number, number] = [x + dx, z + dz];
      const nextKey = `${next[0]}:${next[1]}`;
      if (!validActorCenters.has(nextKey) || reachedActorCenters.has(nextKey)) {
        continue;
      }
      reachedActorCenters.add(nextKey);
      queue.push(next);
    }
  }
  assert.equal(
    reachedActorCenters.size,
    validActorCenters.size,
    `seed ${seed} partitions disconnected actor-sized navigation (${reachedActorCenters.size}/${validActorCenters.size})`,
  );

  // The only props are fluorescent fixtures — no doors, chests, or crates.
  const placementObjectIds = new Set(
    map.custom_object_placements.map((placement) => placement.object_id),
  );
  assert.deepEqual(
    [...placementObjectIds],
    [BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID],
    `seed ${seed} placed a non-fluorescent prop`,
  );
  assert.ok(
    map.custom_object_placements.length > 0,
    `seed ${seed} must light its rooms`,
  );

  // Enough walkable space to wander. A Backrooms level that bakes down to a
  // few corridors has failed the point of the proof.
  const walkable = map.cells.filter((cell) => cell.walkable).length;
  assert.ok(
    walkable >= 900,
    `seed ${seed} produced only ${walkable} walkable cells`,
  );

  // The spawn must land on real walkable floor.
  assert.equal(map.spawns.length, 1, `seed ${seed} must expose one spawn`);
  const [spawnX, spawnZ] = map.spawns[0].cell;
  const spawnCell = map.cells.find(
    (cell) => cell.x === spawnX && cell.z === spawnZ,
  );
  assert.ok(spawnCell?.walkable, `seed ${seed} spawn is not on walkable floor`);

  // Loop-heavy rather than tree-shaped: at least one independent cycle.
  const cycles = result.graph.edges.length - result.graph.nodes.length + 1;
  assert.ok(
    cycles >= 1,
    `seed ${seed} produced a tree (${cycles} independent cycles); Level 0 needs loops`,
  );

  // Level 0 is uniformly lit by its own fluorescents. Without this the map
  // renders as a dark ruin that happens to have yellow wallpaper.
  assert.ok(
    (map.ambient_light ?? 0) >= 0.68,
    `seed ${seed} baked a dark map (ambient ${map.ambient_light}); Level 0 must be lit`,
  );
  assert.ok(
    (map.presentation_ambient_light ?? 0) >= 0.82,
    `seed ${seed} needs the brighter presentation fill`,
  );

  // Provenance is ordinary generated-map metadata.
  assert.equal(map.generation?.recipeId, LEVEL0_PROOF_RECIPE_ID);
  assert.equal(map.generation?.generatorId, "dungeon");
  assert.equal(map.generation?.manuallyModified, false);
}

// ── 3. Determinism ─────────────────────────────────────────────────────────

console.log("level0 proof: identical seeds reproduce identical results");

for (const seed of CORPUS_SEEDS.slice(0, 3)) {
  const again = generate(seed, level0Package());
  assert.equal(
    again.canonicalResultHash,
    hashesBySeed.get(seed),
    `seed ${seed} is not deterministic across fresh packages`,
  );
}

// Different seeds must actually diverge, otherwise the corpus proves nothing.
assert.equal(
  new Set(hashesBySeed.values()).size,
  CORPUS_SEEDS.length,
  "each corpus seed must produce a distinct result",
);

// ── 4. The legacy preset is untouched ──────────────────────────────────────

console.log("level0 proof: the institutional preset still generates unchanged");

const institutionalPackage = GamePackageSchema.parse(
  installInstitutionalRuinGeneratorContent(createEmptyGamePackage()),
);
const institutionalResult = generateDungeon({
  recipe: createInstitutionalRuinSingleMapRecipe("institutional-regression-001"),
  gamePackage: institutionalPackage,
  generatedAt: GENERATED_AT,
  debug: true,
});
assert.equal(fatalDiagnostics(institutionalResult).length, 0);
assert.equal(institutionalResult.maps.length, 1);
assert.equal(
  institutionalResult.maps[0].generation?.recipeId,
  INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID,
);

// The theme lighting fields added for Level 0 are optional. A theme that omits
// them must still bake a map with no lighting keys at all, byte-identical to
// what it produced before those fields existed.
assert.ok(
  !("ambient_light" in institutionalResult.maps[0]),
  "a theme without ambientLight must not add an ambient_light key",
);
assert.ok(
  !("presentation_ambient_light" in institutionalResult.maps[0]),
  "a theme without presentationAmbientLight must not add that key",
);

// Installing both presets into one package must not collide.
const bothPackage = GamePackageSchema.parse(
  installLevel0ProofGeneratorContent(
    installInstitutionalRuinGeneratorContent(createEmptyGamePackage()),
  ),
);
const recipeIds = bothPackage.dungeon_recipes.map((recipe) => recipe.id);
assert.equal(
  new Set(recipeIds).size,
  recipeIds.length,
  "installing both presets must not duplicate recipe IDs",
);
assert.ok(recipeIds.includes(LEVEL0_PROOF_RECIPE_ID));
assert.ok(recipeIds.includes(INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID));

// The proof's archetypes are namespaced so they cannot shadow legacy ones.
for (const archetypeId of Object.values(LEVEL0_PROOF_ARCHETYPE_IDS)) {
  assert.ok(
    archetypeId.startsWith("l0_arch_"),
    `${archetypeId} must stay inside the disposable l0_arch_ namespace`,
  );
}

console.log("Backrooms Level 0 proof preset tests passed.");
