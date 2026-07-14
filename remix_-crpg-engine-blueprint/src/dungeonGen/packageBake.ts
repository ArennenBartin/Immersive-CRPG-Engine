import {
  GamePackageSchema,
  MapDataSchema,
  type GamePackage,
  type MapData,
} from "../schema/game";
import {
  finalizePackageMigration,
  type MigrationChange,
  type MigrationWarning,
  type PackageMigrationResult,
} from "../store/packageMigration";
import {
  hashMapOutput,
  remapGeneratedNamespace,
} from "../generation-facing";

export type DungeonBakeCollisionPolicy =
  | "cancel"
  | "create_new_ids"
  | "replace";

export interface DungeonBakeCollision {
  mapId: string;
  existingName: string;
  incomingName: string;
  existingGenerated: boolean;
  manuallyModified: boolean;
  existingHash?: string;
  incomingHash?: string;
}

export interface DungeonPackageBakePlan {
  sourcePackage: GamePackage;
  incomingMaps: MapData[];
  collisions: DungeonBakeCollision[];
  suggestedIdMap: Record<string, string>;
}

export interface ApplyDungeonPackageBakeOptions {
  policy: DungeonBakeCollisionPolicy;
  newIdMap?: Record<string, string>;
  confirmReplace?: boolean;
  acknowledgeManualEdits?: boolean;
  now?: Date;
}

export interface DungeonPackageBakeResult extends PackageMigrationResult {
  policy: DungeonBakeCollisionPolicy;
  bakedMapIds: string[];
  idMap: Record<string, string>;
  collisions: DungeonBakeCollision[];
}

const assertUniqueIncomingIds = (maps: readonly MapData[]) => {
  const seen = new Set<string>();
  for (const map of maps) {
    if (seen.has(map.id)) {
      throw new Error(`Dungeon bake contains duplicate map ID: ${map.id}`);
    }
    seen.add(map.id);
  }
};

const suggestUniqueId = (baseId: string, reserved: Set<string>) => {
  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;
  while (reserved.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }
  reserved.add(candidate);
  return candidate;
};

/**
 * Pure planning boundary for the Studio. It detects package identity
 * collisions without mutating either the package or the generation result.
 */
export const planDungeonPackageBake = (
  sourcePackage: GamePackage,
  incomingMaps: readonly MapData[],
): DungeonPackageBakePlan => {
  const parsedSource = GamePackageSchema.parse(sourcePackage);
  const parsedMaps = incomingMaps.map((map) => MapDataSchema.parse(map));
  assertUniqueIncomingIds(parsedMaps);

  const existingById = new Map(parsedSource.maps.map((map) => [map.id, map]));
  const collisions = parsedMaps.flatMap((incoming): DungeonBakeCollision[] => {
    const existing = existingById.get(incoming.id);
    if (!existing) return [];
    return [{
      mapId: incoming.id,
      existingName: existing.display_name || existing.id,
      incomingName: incoming.display_name || incoming.id,
      existingGenerated: Boolean(existing.generation),
      manuallyModified: existing.generation?.manuallyModified ?? false,
      existingHash: existing.generation?.outputHash,
      incomingHash: incoming.generation?.outputHash,
    }];
  });

  const reserved = new Set([
    ...parsedSource.maps.map((map) => map.id),
    ...parsedMaps.map((map) => map.id),
  ]);
  const suggestedIdMap = Object.fromEntries(
    collisions.map((collision) => [
      collision.mapId,
      suggestUniqueId(collision.mapId, reserved),
    ]),
  );

  return {
    sourcePackage: parsedSource,
    incomingMaps: parsedMaps,
    collisions,
    suggestedIdMap,
  };
};

const validateNewIdMap = (
  plan: DungeonPackageBakePlan,
  requested: Record<string, string>,
) => {
  const idMap: Record<string, string> = {};
  const sourceIds = new Set(plan.sourcePackage.maps.map((map) => map.id));
  const incomingIds = new Set(plan.incomingMaps.map((map) => map.id));
  const outputIds = new Set<string>();
  const collidingIds = new Set(plan.collisions.map((collision) => collision.mapId));

  for (const map of plan.incomingMaps) {
    const nextId = (requested[map.id] || map.id).trim();
    if (!nextId) throw new Error(`A destination ID is required for ${map.id}`);
    if (collidingIds.has(map.id) && nextId === map.id) {
      throw new Error(`Create-new mode must change colliding map ID ${map.id}`);
    }
    if (sourceIds.has(nextId)) {
      throw new Error(`Destination map ID already exists: ${nextId}`);
    }
    // Namespace remapping is intentionally sequential. Disallow a destination
    // that is another source map's ID so A -> B, B -> C cannot accidentally
    // remap A's freshly rewritten namespace a second time while processing B.
    if (nextId !== map.id && incomingIds.has(nextId)) {
      throw new Error(`Destination map ID aliases another incoming source ID: ${nextId}`);
    }
    if (outputIds.has(nextId)) {
      throw new Error(`Destination map ID is used more than once: ${nextId}`);
    }
    outputIds.add(nextId);
    idMap[map.id] = nextId;
  }
  return idMap;
};

/**
 * Remap a complete generated bundle. Namespace remapping is applied across
 * every floor before cross-floor exits are rewritten, so generated references
 * and transition targets remain coherent when only some floor IDs collide.
 */
export const remapDungeonMapBundle = (
  maps: readonly MapData[],
  idMap: Readonly<Record<string, string>>,
): MapData[] => maps.map((sourceMap) => {
  let remapped: MapData = structuredClone(sourceMap);
  for (const [oldId, newId] of Object.entries(idMap)) {
    if (oldId !== newId) {
      remapped = remapGeneratedNamespace(remapped, oldId, newId);
    }
  }

  const ownId = idMap[sourceMap.id] || sourceMap.id;
  const candidate: MapData = {
    ...remapped,
    id: ownId,
    exits: remapped.exits.map((exit) => ({
      ...exit,
      target_map_id: idMap[exit.target_map_id] || exit.target_map_id,
    })),
  };
  if (candidate.generation) {
    candidate.generation = {
      ...candidate.generation,
      outputHash: "pending",
      manuallyModified: false,
    };
    candidate.generation.outputHash = hashMapOutput(candidate);
  }
  return MapDataSchema.parse(candidate);
});

const replaceMapsInPlace = (
  sourceMaps: readonly MapData[],
  incomingMaps: readonly MapData[],
) => {
  const incomingById = new Map(incomingMaps.map((map) => [map.id, map]));
  const existingIds = new Set(sourceMaps.map((map) => map.id));
  return [
    ...sourceMaps.map((map) => incomingById.get(map.id) || map),
    ...incomingMaps.filter((map) => !existingIds.has(map.id)),
  ];
};

const canceledResult = (
  plan: DungeonPackageBakePlan,
): DungeonPackageBakeResult => ({
  package: plan.sourcePackage,
  warnings: [{
    code: "dungeon_bake_canceled",
    path: "maps",
    message: "Dungeon bake was canceled; the package was not changed.",
  }],
  changes: [],
  destructiveChanges: [],
  applied: false,
  requiresConfirmation: false,
  policy: "cancel",
  bakedMapIds: [],
  idMap: {},
  collisions: plan.collisions,
});

/**
 * Produces a package migration result for one explicit Studio transaction.
 * This function has no store, React, QA-suite, persistence, or DOM side
 * effects. Confirmed replacement receives the standard pre-operation backup.
 */
export const applyDungeonPackageBake = (
  plan: DungeonPackageBakePlan,
  options: ApplyDungeonPackageBakeOptions,
): DungeonPackageBakeResult => {
  if (options.policy === "cancel") return canceledResult(plan);

  const warnings: MigrationWarning[] = [];
  const changes: MigrationChange[] = [];
  const destructiveChanges: MigrationChange[] = [];
  let idMap: Record<string, string>;
  let bakedMaps: MapData[];

  if (options.policy === "create_new_ids") {
    idMap = validateNewIdMap(plan, {
      ...plan.suggestedIdMap,
      ...(options.newIdMap || {}),
    });
    bakedMaps = remapDungeonMapBundle(plan.incomingMaps, idMap);
    changes.push({
      code: "dungeon_maps_added_with_new_ids",
      path: "maps",
      affectedIds: bakedMaps.map((map) => map.id),
      message: `Added ${bakedMaps.length} dungeon map${bakedMaps.length === 1 ? "" : "s"} with collision-free IDs.`,
    });
  } else {
    idMap = Object.fromEntries(plan.incomingMaps.map((map) => [map.id, map.id]));
    bakedMaps = plan.incomingMaps.map((map) => MapDataSchema.parse(map));
    if (plan.collisions.length) {
      destructiveChanges.push({
        code: "dungeon_maps_replaced",
        path: "maps",
        affectedIds: plan.collisions.map((collision) => collision.mapId),
        message: `Replace ${plan.collisions.length} existing map${plan.collisions.length === 1 ? "" : "s"} with regenerated dungeon floors.`,
      });
    }
    const manualCollisions = plan.collisions.filter((collision) => collision.manuallyModified);
    if (manualCollisions.length && !options.acknowledgeManualEdits) {
      warnings.push({
        code: "dungeon_manual_edit_acknowledgement_required",
        path: "maps",
        message: `Replacement includes ${manualCollisions.length} manually edited generated map${manualCollisions.length === 1 ? "" : "s"}; acknowledge those edits before baking.`,
      });
    }
    changes.push({
      code: plan.collisions.length ? "dungeon_maps_rebaked" : "dungeon_maps_added",
      path: "maps",
      affectedIds: bakedMaps.map((map) => map.id),
      message: `${plan.collisions.length ? "Baked/replaced" : "Added"} ${bakedMaps.length} dungeon map${bakedMaps.length === 1 ? "" : "s"}.`,
    });
  }

  // `plan.sourcePackage` and every incoming map were already normalized at
  // their construction boundaries. Validate the assembled output as a whole,
  // but keep the structurally shared candidate rather than the deep clone Zod
  // returns. Studio can retain several policy previews at once; retaining a
  // fresh copy of every unrelated map for each preview multiplies memory use.
  const candidate: GamePackage = {
    ...plan.sourcePackage,
    maps:
      options.policy === "create_new_ids"
        ? [...plan.sourcePackage.maps, ...bakedMaps]
        : replaceMapsInPlace(plan.sourcePackage.maps, bakedMaps),
  };
  const parsedCandidate = GamePackageSchema.safeParse(candidate);
  if (!parsedCandidate.success) throw parsedCandidate.error;
  const hasManualCollision = plan.collisions.some((collision) => collision.manuallyModified);
  const confirmed =
    options.policy !== "replace" ||
    plan.collisions.length === 0 ||
    (Boolean(options.confirmReplace) &&
      (!hasManualCollision || Boolean(options.acknowledgeManualEdits)));
  const migration = finalizePackageMigration(plan.sourcePackage, candidate, {
    confirmDestructive: confirmed,
    warnings,
    changes,
    destructiveChanges,
    now: options.now,
    backupReason: "before-dungeon-map-replacement",
  });

  return {
    ...migration,
    policy: options.policy,
    bakedMapIds: migration.applied ? bakedMaps.map((map) => map.id) : [],
    idMap,
    collisions: plan.collisions,
  };
};
