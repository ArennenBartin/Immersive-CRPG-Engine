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
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
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
const CORPUS_SEEDS = [
  "level0-proof-001",
  "level0-proof-002",
  "level0-proof-003",
  "level0-proof-004",
  "level0-proof-005",
  "level0-proof-006",
  "level0-proof-007",
  "level0-proof-008",
];

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
]) {
  assert.ok(
    pkg.object_library.some((object) => object.id === objectId),
    `the proof preset must install ${objectId}`,
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

  // Only Level 0 materials. A stray institutional plate or stone wall would
  // mean the theme is not fully driving the bake.
  const cellObjectIds = new Set(
    map.cells.map((cell) => cell.object_id).filter(Boolean) as string[],
  );
  assert.deepEqual(
    [...cellObjectIds].sort(),
    [
      BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
    ].sort(),
    `seed ${seed} baked a non-Level-0 cell object`,
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
    (map.ambient_light ?? 0) >= 0.5,
    `seed ${seed} baked a dark map (ambient ${map.ambient_light}); Level 0 must be lit`,
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
