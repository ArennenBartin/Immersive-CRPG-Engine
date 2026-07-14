import {
  MapDataSchema,
  type CellData,
  type ContainerPlacementData,
  type EntityPlacementData,
  type MapData,
  type MapExitData,
  type MapGenerationMetadata,
  type ObjectPlacementData,
  type TriggerData,
  type WorldItemPlacementData,
  type WorldRegionData,
} from "../schema/game";
import { hashSeed } from "../engine-core/rng";
import {
  DeterministicIdAllocator,
  generatedIdNamespace,
  hashMapOutput,
} from "./deterministicIds";
import { stableJsonStringify } from "./stableHash";

export interface MapBounds {
  width: number;
  height: number;
}

export type IdentifiedObjectPlacement = ObjectPlacementData & { id: string };
export type IdentifiedEntityPlacement = EntityPlacementData & { id: string };
export type IdentifiedMapExit = MapExitData & { id: string };

export interface MapBuildPlacements {
  objects?: IdentifiedObjectPlacement[];
  entities?: IdentifiedEntityPlacement[];
  items?: WorldItemPlacementData[];
  containers?: ContainerPlacementData[];
}

export type MapBuildGenerationMetadata = Omit<MapGenerationMetadata, "outputHash"> & {
  /** When supplied, the builder verifies it against the baked ordinary map. */
  outputHash?: string;
};

export interface MapBuildInput {
  id: string;
  name: string;
  bounds: MapBounds;
  cells: CellData[];
  spawns: MapData["spawns"];
  placements?: MapBuildPlacements;
  exits?: IdentifiedMapExit[];
  triggers?: TriggerData[];
  regions?: WorldRegionData[];
  props?: unknown[];
  metadata?: MapBuildGenerationMetadata;
}

export interface MapBuildIssue {
  code: string;
  path: string;
  message: string;
}

export class MapBuildError extends Error {
  readonly issues: MapBuildIssue[];

  constructor(issues: MapBuildIssue[]) {
    super(`Map build failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
    this.name = "MapBuildError";
    this.issues = issues;
  }
}

const coordinateCompare = (
  left: readonly unknown[],
  right: readonly unknown[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = Number(left[index] ?? 0) - Number(right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
};

const idCompare = (left: { id?: string }, right: { id?: string }): number =>
  (left.id ?? "").localeCompare(right.id ?? "");

const stableValueCompare = (left: unknown, right: unknown): number =>
  stableJsonStringify(left).localeCompare(stableJsonStringify(right));

const canonicalizeMap = (map: MapData): MapData => ({
  ...map,
  cells: [...map.cells].sort(
    (left, right) =>
      coordinateCompare([left.y, left.z, left.x], [right.y, right.z, right.x]) ||
      stableValueCompare(left, right),
  ),
  spawns: [...map.spawns].sort(idCompare),
  props: [...map.props].sort(stableValueCompare),
  custom_object_placements: [...map.custom_object_placements].sort(idCompare),
  entity_placements: [...map.entity_placements]
    .map((placement) => ({
      ...placement,
      schedule: placement.schedule
        ? [...placement.schedule].sort(
            (left, right) => left.hour - right.hour || coordinateCompare(left.cell, right.cell),
          )
        : undefined,
    }))
    .sort(idCompare),
  item_placements: [...map.item_placements].sort(idCompare),
  container_placements: [...map.container_placements]
    .map((placement) => ({
      ...placement,
      items: [...placement.items].sort(
        (left, right) => left.item_id.localeCompare(right.item_id) || left.count - right.count,
      ),
    }))
    .sort(idCompare),
  regions: map.regions ? [...map.regions].sort(idCompare) : undefined,
  triggers: [...map.triggers].sort(idCompare),
  exits: [...map.exits].sort(idCompare),
});

const validateBuilderIds = (map: MapData, generated: boolean): MapBuildIssue[] => {
  const issues: MapBuildIssue[] = [];
  const seen = new Map<string, string>();
  const expectedNamespace = generated ? `${generatedIdNamespace(map.id)}:` : undefined;

  const accept = (id: string | undefined, path: string, required: boolean) => {
    if (!id) {
      if (required) issues.push({ code: "MAP_ID_REQUIRED", path, message: "Generator-facing records require a stable ID" });
      return;
    }
    const firstPath = seen.get(id);
    if (firstPath) {
      issues.push({
        code: "MAP_ID_DUPLICATE",
        path,
        message: `ID ${id} is already used at ${firstPath}`,
      });
    } else {
      seen.set(id, path);
    }
    if (expectedNamespace && !id.startsWith(expectedNamespace)) {
      issues.push({
        code: "MAP_GENERATED_ID_NAMESPACE",
        path,
        message: `Generated record ID must begin with ${expectedNamespace}`,
      });
    }
  };

  map.spawns.forEach((entry, index) => accept(entry.id, `spawns[${index}].id`, true));
  map.custom_object_placements.forEach((entry, index) =>
    accept(entry.id, `custom_object_placements[${index}].id`, true),
  );
  map.entity_placements.forEach((entry, index) =>
    accept(entry.id, `entity_placements[${index}].id`, true),
  );
  map.item_placements.forEach((entry, index) =>
    accept(entry.id, `item_placements[${index}].id`, true),
  );
  map.container_placements.forEach((entry, index) =>
    accept(entry.id, `container_placements[${index}].id`, true),
  );
  map.triggers.forEach((entry, index) => accept(entry.id, `triggers[${index}].id`, true));
  map.exits.forEach((entry, index) => accept(entry.id, `exits[${index}].id`, true));
  map.regions?.forEach((entry, index) => accept(entry.id, `regions[${index}].id`, true));
  return issues;
};

/**
 * Pure generator boundary. It never mutates a store and always returns the
 * same canonical ordinary MapData for the same input.
 */
export const buildMap = (input: MapBuildInput): MapData => {
  const generation = input.metadata
    ? { ...input.metadata, outputHash: input.metadata.outputHash ?? "pending" }
    : undefined;
  const candidate = {
    id: input.id,
    display_name: input.name,
    width: input.bounds.width,
    height: input.bounds.height,
    spawns: input.spawns,
    cells: input.cells,
    props: input.props ?? [],
    custom_object_placements: input.placements?.objects ?? [],
    entity_placements: input.placements?.entities ?? [],
    item_placements: input.placements?.items ?? [],
    container_placements: input.placements?.containers ?? [],
    regions: input.regions,
    triggers: input.triggers ?? [],
    exits: input.exits ?? [],
    generation,
  };

  const parsed = MapDataSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new MapBuildError(
      parsed.error.issues.map((issue) => ({
        code: "MAP_SCHEMA_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  if (!Number.isInteger(parsed.data.width) || parsed.data.width <= 0 ||
      !Number.isInteger(parsed.data.height) || parsed.data.height <= 0) {
    throw new MapBuildError([{
      code: "MAP_BOUNDS_INVALID",
      path: "bounds",
      message: "Map width and height must be positive integers",
    }]);
  }

  const idIssues = validateBuilderIds(parsed.data, Boolean(input.metadata));
  if (idIssues.length > 0) throw new MapBuildError(idIssues);

  const canonical = canonicalizeMap(parsed.data);
  if (canonical.generation) {
    const computedHash = hashMapOutput(canonical);
    if (input.metadata?.outputHash && input.metadata.outputHash !== computedHash) {
      throw new MapBuildError([{
        code: "MAP_OUTPUT_HASH_MISMATCH",
        path: "metadata.outputHash",
        message: `Expected ${input.metadata.outputHash}, computed ${computedHash}`,
      }]);
    }
    canonical.generation.outputHash = computedHash;
  }
  return MapDataSchema.parse(canonical);
};

export interface RegenerationDecision {
  allowed: boolean;
  reason?: "not_generated" | "manually_modified";
}

export const canAutomaticallyRegenerateMap = (map: MapData): RegenerationDecision => {
  if (!map.generation) return { allowed: false, reason: "not_generated" };
  if (map.generation.manuallyModified) return { allowed: false, reason: "manually_modified" };
  return { allowed: true };
};

export const markMapManuallyModified = (map: MapData): MapData =>
  map.generation && !map.generation.manuallyModified
    ? { ...map, generation: { ...map.generation, manuallyModified: true } }
    : map;

export interface PlaceholderMapInput {
  mapId: string;
  seed: string;
  name?: string;
  generatedAt?: string;
}

/** Deterministic ordinary-map smoke fixture for the pre-generator gate. */
export const buildDeterministicPlaceholderMap = (input: PlaceholderMapInput): MapData => {
  const allocator = new DeterministicIdAllocator({ mapId: input.mapId });
  const obstacleX = (hashSeed(input.seed, "placeholder-obstacle") % 3) - 1;
  const cells: CellData[] = [];
  for (let z = -3; z <= 3; z += 1) {
    for (let x = -3; x <= 3; x += 1) {
      const boundary = Math.abs(x) === 3 || Math.abs(z) === 3;
      const obstacle = x === obstacleX && z === 0;
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable: !boundary && !obstacle,
        blocks_los: boundary || obstacle,
        height: boundary || obstacle ? 1 : 0,
        visual_height: boundary || obstacle ? 1 : 0,
        terrain: boundary ? "placeholder_wall" : "placeholder_floor",
        surface_tag: "none",
      });
    }
  }

  return buildMap({
    id: input.mapId,
    name: input.name ?? "Deterministic Placeholder Dungeon",
    bounds: { width: 7, height: 7 },
    cells,
    spawns: [{ id: allocator.semantic("spawn", "start"), cell: [0, 2], facing: [0, -1] }],
    placements: {},
    exits: [],
    triggers: [],
    metadata: {
      generatorId: "dungeon-readiness-placeholder",
      generatorVersion: "1.0.0",
      recipeId: "placeholder-room-v1",
      recipeVersion: "1.0.0",
      seed: input.seed,
      generatedAt: input.generatedAt ?? "1970-01-01T00:00:00.000Z",
      manuallyModified: false,
    },
  });
};
