import {
  entityPlacementStateKey,
  entityStateKey,
} from "../src/utils/entityState";

let failures = 0;

const check = (label: string, condition: boolean) => {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}`);
};

const first = { id: "dg:test-map:entity:first", entity_id: "ent_wolf" };
const second = { id: "dg:test-map:entity:second", entity_id: "ent_wolf" };

const firstBeforeReorder = entityPlacementStateKey("test-map", first, 0);
const secondBeforeReorder = entityPlacementStateKey("test-map", second, 1);
const secondAfterReorder = entityPlacementStateKey("test-map", second, 0);
const firstAfterReorder = entityPlacementStateKey("test-map", first, 1);

check(
  "stable placement key survives entity_placements reordering",
  firstBeforeReorder === firstAfterReorder && secondBeforeReorder === secondAfterReorder,
);
check(
  "two placements of one entity definition remain distinct",
  firstBeforeReorder !== secondBeforeReorder,
);

const legacyPlacement = { entity_id: "ent_wolf" };
check(
  "legacy placement preserves the exact index-based key format",
  entityPlacementStateKey("legacy-map", legacyPlacement, 3) ===
    "ent_legacy-map_ent_wolf_3",
);
check(
  "legacy helper delegates to the public entityStateKey contract",
  entityPlacementStateKey("legacy-map", legacyPlacement, 3) ===
    entityStateKey("legacy-map", "ent_wolf", 3),
);

if (failures > 0) {
  console.error(`\n${failures} entity-state identity test(s) failed.`);
  process.exit(1);
}

console.log("\nEntity placement identity tests passed.");
