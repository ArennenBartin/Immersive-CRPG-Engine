import assert from "node:assert/strict";
import {
  bakeFractureDungeonDraft,
  createFractureDungeonDraft,
  fractureDungeonSocketsFromMap,
  hashFractureDungeonTopology,
  relocateFractureDungeonSocket,
  validateFractureDungeonDraft,
  type FractureDungeonDraft,
} from "../src/engine-core/fractureDungeonGeneration";
import { hashMapOutput } from "../src/generation-facing/deterministicIds";
import { GamePackageSchema, MapDataSchema } from "../src/schema/game";
import { remapDungeonMapBundle } from "../src/dungeonGen/packageBake";
import { createInstitutionalDungeonFixture } from "./dungeon-generation-test-support";

const fixture = createInstitutionalDungeonFixture("institutional-ruin-001");
const sourceSnapshot = JSON.stringify(fixture.gamePackage);

console.log("fracture dungeon: same seed/profile/version reproduces one frozen topology draft");
const first = createFractureDungeonDraft({
  profile: fixture.recipe,
  gamePackage: fixture.gamePackage,
});
const repeated = createFractureDungeonDraft({
  profile: fixture.recipe,
  gamePackage: fixture.gamePackage,
});
assert.equal(first.success, true, JSON.stringify(first.diagnostics));
assert.equal(repeated.success, true, JSON.stringify(repeated.diagnostics));
assert.ok(first.draft && repeated.draft);
assert.equal(first.draft.id, repeated.draft.id);
assert.equal(first.draft.provenance.topologyHash, repeated.draft.provenance.topologyHash);
assert.equal(hashFractureDungeonTopology(first.draft), first.draft.provenance.topologyHash);
assert.deepEqual(first.draft, repeated.draft);
assert.equal(Object.isFrozen(first.draft), true);
assert.equal(Object.isFrozen(first.draft.graph.nodes), true);
assert.equal(JSON.stringify(fixture.gamePackage), sourceSnapshot, "draft generation must not mutate the project package");

console.log("fracture dungeon: draft contains the required topology and opportunity contract");
const draft = first.draft;
const validation = validateFractureDungeonDraft(draft);
assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
assert.equal(validation.reachableNodeIds.length, draft.graph.nodes.length);
assert.ok(draft.graph.edges.some((edge) => edge.tags.includes("loop")));
assert.ok(draft.graph.nodes.some((node) => !node.mandatory));
assert.ok(draft.graph.nodes.every((node) => node.id.startsWith(`${draft.id}:node:`)));
assert.equal(new Set([
  ...draft.graph.nodes.map((entry) => entry.id),
  ...draft.graph.edges.map((entry) => entry.id),
  ...draft.graph.gates.map((entry) => entry.id),
  ...draft.opportunities.map((entry) => entry.id),
]).size, draft.graph.nodes.length + draft.graph.edges.length + draft.graph.gates.length + draft.opportunities.length);
const categoryCount = (category: string) => draft.opportunities.filter((entry) => entry.category === category).length;
assert.equal(categoryCount("entrance"), 1);
assert.equal(categoryCount("culmination"), 1);
assert.ok(categoryCount("landmark") >= 3);
assert.ok(categoryCount("artifact_origin") >= 1);
assert.ok(categoryCount("extraction") >= 1);

console.log("fracture dungeon: changed seed changes the stable draft identity and topology hash");
const alternateFixture = createInstitutionalDungeonFixture("institutional-ruin-multifloor-042");
const alternate = createFractureDungeonDraft({
  profile: alternateFixture.recipe,
  gamePackage: alternateFixture.gamePackage,
});
assert.equal(alternate.success, true, JSON.stringify(alternate.diagnostics));
assert.ok(alternate.draft);
assert.notEqual(alternate.draft.id, draft.id);
assert.notEqual(alternate.draft.provenance.topologyHash, draft.provenance.topologyHash);

console.log("fracture dungeon: invalid and stale drafts produce explicit diagnostics");
const duplicateFixture = structuredClone(draft) as FractureDungeonDraft;
duplicateFixture.graph.nodes[1].id = duplicateFixture.graph.nodes[0].id;
const duplicateValidation = validateFractureDungeonDraft(duplicateFixture);
assert.equal(duplicateValidation.valid, false);
assert.ok(duplicateValidation.diagnostics.some((entry) =>
  entry.code === "FDG_GRAPH_SCHEMA_INVALID" || entry.code === "FDG_DUPLICATE_STABLE_ID"));
const staleFixture = structuredClone(draft) as FractureDungeonDraft;
staleFixture.opportunities = staleFixture.opportunities.filter((entry) => entry.category !== "artifact_origin");
const staleValidation = validateFractureDungeonDraft(staleFixture);
assert.equal(staleValidation.valid, false);
assert.ok(staleValidation.diagnostics.some((entry) => entry.code === "FDG_REQUIRED_SOCKET_CATEGORY_MISSING"));
assert.ok(staleValidation.diagnostics.some((entry) => entry.code === "FDG_TOPOLOGY_HASH_MISMATCH"));

console.log("fracture dungeon: explicit bake is deterministic, ordinary, socket-aware, and non-mutating");
const generatedAt = "2026-07-19T12:00:00.000Z";
const baked = bakeFractureDungeonDraft({
  draft,
  gamePackage: fixture.gamePackage,
  generatedAt,
});
const bakedAgain = bakeFractureDungeonDraft({
  draft,
  gamePackage: fixture.gamePackage,
  generatedAt,
});
assert.equal(baked.success, true, JSON.stringify(baked.diagnostics));
assert.equal(bakedAgain.success, true, JSON.stringify(bakedAgain.diagnostics));
assert.ok(baked.outputHash);
assert.equal(baked.outputHash, bakedAgain.outputHash);
assert.deepEqual(baked.maps, bakedAgain.maps);
assert.deepEqual(baked.sockets, bakedAgain.sockets);
assert.ok(baked.maps.length > 0);
assert.equal(baked.validationReports.length, baked.maps.length);
assert.ok(baked.validationReports.every((report) => report.valid));
assert.equal(JSON.stringify(fixture.gamePackage), sourceSnapshot, "bake must not commit into or mutate the source package");
const socketIds = new Set(baked.sockets.map((socket) => socket.id));
const opportunityIds = new Set(baked.sockets.map((socket) => socket.sourceOpportunityId));
assert.equal(socketIds.size, draft.opportunities.length);
assert.deepEqual(opportunityIds, new Set(draft.opportunities.map((entry) => entry.id)));
assert.equal(baked.sockets.filter((socket) => socket.category === "landmark").length >= 3, true);
for (const map of baked.maps) {
  assert.equal(MapDataSchema.safeParse(map).success, true);
  assert.equal(map.generation?.sourceSnapshotHash, draft.provenance.topologyHash);
  assert.equal(map.generation?.canonicalResultHash, baked.outputHash);
  assert.equal(map.generation?.outputHash, hashMapOutput(map));
  const props = fractureDungeonSocketsFromMap(map);
  assert.equal(map.generation_sockets?.length, props.length);
  assert.equal(map.props.some((entry) =>
    Boolean(entry && typeof entry === "object" && (entry as { kind?: unknown }).kind === "fracture_generation_socket")), false);
  for (const prop of props) {
    assert.equal(socketIds.has(prop.id), true);
    assert.equal(opportunityIds.has(prop.source_opportunity_id), true);
    assert.equal(prop.id.startsWith(`dg:${map.id}:generation_socket:`), true);
    const cell = map.cells.find((entry) => entry.x === prop.cell[0] && entry.z === prop.cell[1]);
    assert.equal(cell?.walkable, true);
  }
}

const generatedMapIds = new Set(baked.maps.map((map) => map.id));
const packageRoundTrip = GamePackageSchema.parse(JSON.parse(JSON.stringify({
  ...fixture.gamePackage,
  maps: [
    ...fixture.gamePackage.maps.filter((map) => !generatedMapIds.has(map.id)),
    ...baked.maps,
  ],
})));
for (const map of packageRoundTrip.maps.filter((entry) => generatedMapIds.has(entry.id))) {
  const original = baked.maps.find((entry) => entry.id === map.id)!;
  assert.deepEqual(map.generation_sockets, original.generation_sockets);
  assert.equal(map.generation?.outputHash, hashMapOutput(map));
}

console.log("fracture dungeon: baked sockets support pure manual relocation and bundle ID remap");
const editableMap = baked.maps.find((map) => fractureDungeonSocketsFromMap(map).length > 0)!;
const editableSocket = fractureDungeonSocketsFromMap(editableMap)[0];
const occupiedSocketCells = new Set(fractureDungeonSocketsFromMap(editableMap).map((entry) => entry.cell.join(":")));
const relocationCell = editableMap.cells.find((cell) =>
  cell.walkable && !occupiedSocketCells.has(`${cell.x}:${cell.z}`))!;
const editableSnapshot = JSON.stringify(editableMap);
const relocated = relocateFractureDungeonSocket(
  editableMap,
  editableSocket.id,
  [relocationCell.x, relocationCell.z],
);
assert.equal(relocated.success, true, JSON.stringify(relocated.diagnostics));
assert.equal(JSON.stringify(editableMap), editableSnapshot, "socket relocation must not mutate the source map");
assert.deepEqual(relocated.socket?.cell, [relocationCell.x, relocationCell.z]);
assert.equal(relocated.map.generation?.manuallyModified, true);
assert.equal(relocated.map.generation?.outputHash, hashMapOutput(relocated.map));
const blockedCell = editableMap.cells.find((cell) => !cell.walkable)!;
assert.equal(relocateFractureDungeonSocket(
  editableMap,
  editableSocket.id,
  [blockedCell.x, blockedCell.z],
).success, false);

const remapIds = Object.fromEntries(baked.maps.map((map, index) => [map.id, `fracture_copy_floor_${index}`]));
const remapped = remapDungeonMapBundle(baked.maps, remapIds);
for (const map of remapped) {
  const expectedPrefix = `dg:${map.id}:generation_socket:`;
  assert.ok(fractureDungeonSocketsFromMap(map).every((socket) => socket.id.startsWith(expectedPrefix)));
}

console.log("fracture dungeon generation contract: PASS");
