import type { GamePackage, MapData } from "../schema/game";
import { hashMapOutput } from "../generation-facing/deterministicIds";
import { stableContentHash, stableJsonStringify } from "../generation-facing/stableHash";
import type { DungeonGraph, EmbeddedDungeon } from "./types";

const byId = <T extends { id: string }>(left: T, right: T) => left.id.localeCompare(right.id);

const sortStrings = (values: readonly string[] | undefined) =>
  values ? [...values].sort((left, right) => left.localeCompare(right)) : undefined;

/** Canonical graph ordering used by seed tests, previews, and bundle hashing. */
export const canonicalDungeonGraph = (graph: DungeonGraph): DungeonGraph => ({
  ...structuredClone(graph),
  nodes: [...graph.nodes]
    .map((node) => ({ ...structuredClone(node), tags: sortStrings(node.tags) ?? [] }))
    .sort(byId),
  edges: [...graph.edges]
    .map((edge) => ({ ...structuredClone(edge), tags: sortStrings(edge.tags) ?? [] }))
    .sort(byId),
  gates: [...graph.gates].sort(byId).map((gate) => structuredClone(gate)),
  optionalObjectiveNodeIds: sortStrings(graph.optionalObjectiveNodeIds) ?? [],
});

const cellCompare = (left: readonly [number, number], right: readonly [number, number]) =>
  left[1] - right[1] || left[0] - right[0];

/** Canonical embedded ordering; callers still own semantic geometry validity. */
export const canonicalEmbeddedDungeon = (embedded: EmbeddedDungeon): EmbeddedDungeon => {
  const copy = structuredClone(embedded);
  copy.maps.sort((left, right) => left.floorIndex - right.floorIndex || left.mapId.localeCompare(right.mapId));
  copy.rooms.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  copy.corridors.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  copy.transitions.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  for (const room of copy.rooms) {
    room.reservedCells.sort(cellCompare);
    room.sockets.sort((left, right) =>
      cellCompare(left.cell, right.cell) || left.id.localeCompare(right.id));
  }
  for (const corridor of copy.corridors) corridor.cells.sort(cellCompare);
  return copy;
};

const collectionById = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? [...value].sort((left, right) => {
        const leftId = left && typeof left === "object" ? String((left as { id?: unknown }).id ?? "") : "";
        const rightId = right && typeof right === "object" ? String((right as { id?: unknown }).id ?? "") : "";
        return leftId.localeCompare(rightId) || stableJsonStringify(left).localeCompare(stableJsonStringify(right));
      })
    : [];

/**
 * Hash only libraries a dungeon population/bake pass can read. Ordinary maps,
 * mutable package metadata, and saves are intentionally excluded.
 */
export const hashDungeonContentLibrary = (gamePackage: GamePackage): string => {
  const extension = gamePackage as GamePackage & Record<string, unknown>;
  return stableContentHash({
    objects: collectionById(gamePackage.object_library),
    blueprints: collectionById(gamePackage.object_blueprints),
    entities: collectionById(gamePackage.entities),
    items: collectionById(gamePackage.items),
    encounters: collectionById(gamePackage.encounters),
    abilities: collectionById(gamePackage.abilities),
    dialogue: collectionById(gamePackage.dialogue),
    documents: collectionById(gamePackage.documents),
    cutscenes: collectionById(gamePackage.cutscenes),
    materials: collectionById(gamePackage.simulation_materials),
    dungeonThemes: collectionById(extension.dungeon_themes),
    dungeonArchetypes: collectionById(extension.dungeon_room_archetypes),
    dungeonTemplates: collectionById(extension.dungeon_room_templates),
    dungeonEncounterProfiles: collectionById(extension.dungeon_encounter_profiles),
    dungeonHazardProfiles: collectionById(extension.dungeon_hazard_profiles),
    dungeonRewardProfiles: collectionById(extension.dungeon_reward_profiles),
    dungeonNarrativeProfiles: collectionById(extension.dungeon_narrative_profiles),
  });
};

export interface CanonicalDungeonBundleInput {
  recipeId: string;
  generatorVersion: string;
  seed: string;
  stageSalts: Record<string, string>;
  contentLibraryHash: string;
  graph: DungeonGraph;
  embedded: EmbeddedDungeon;
  maps: readonly MapData[];
}

/** Timestamp- and diagnostics-free reproducibility identity for a baked bundle. */
export const hashCanonicalDungeonBundle = (input: CanonicalDungeonBundleInput): string =>
  stableContentHash({
    recipeId: input.recipeId,
    generatorVersion: input.generatorVersion,
    seed: input.seed,
    stageSalts: Object.fromEntries(Object.entries(input.stageSalts).sort(([a], [b]) => a.localeCompare(b))),
    contentLibraryHash: input.contentLibraryHash,
    graph: canonicalDungeonGraph(input.graph),
    embedded: canonicalEmbeddedDungeon(input.embedded),
    maps: [...input.maps]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((map) => ({ id: map.id, outputHash: hashMapOutput(map) })),
  });
