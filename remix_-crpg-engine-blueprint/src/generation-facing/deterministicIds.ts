import { MapDataSchema, type MapData } from "../schema/game";
import { stableContentHash } from "./stableHash";

const ID_TOKEN_PATTERN = /[^A-Za-z0-9._-]+/g;

export const normalizeGeneratedIdToken = (value: string, label = "ID token"): string => {
  const normalized = value.trim().replace(ID_TOKEN_PATTERN, "_").replace(/^_+|_+$/g, "");
  if (!normalized) throw new TypeError(`${label} must contain at least one ID-safe character`);
  return normalized;
};

export const generatedIdNamespace = (mapId: string, prefix = "dg"): string =>
  `${normalizeGeneratedIdToken(prefix, "namespace prefix")}:${normalizeGeneratedIdToken(mapId, "map ID")}`;

export interface DeterministicIdAllocatorOptions {
  mapId: string;
  prefix?: string;
  reservedIds?: Iterable<string>;
}

export interface DeterministicIdAllocatorSnapshot {
  namespace: string;
  streamCounters: Record<string, number>;
  semanticIds: Record<string, string>;
}

/**
 * Allocates inspectable generated IDs without coupling independent passes.
 * Adding decoration IDs cannot renumber topology IDs because each stream owns
 * its own counter. Semantic IDs are idempotent for the same stream/key pair.
 */
export class DeterministicIdAllocator {
  readonly namespace: string;
  private readonly reserved: Set<string>;
  private readonly allocated = new Set<string>();
  private readonly counters = new Map<string, number>();
  private readonly semanticIds = new Map<string, string>();

  constructor(options: DeterministicIdAllocatorOptions) {
    this.namespace = generatedIdNamespace(options.mapId, options.prefix);
    this.reserved = new Set(options.reservedIds ?? []);
  }

  next(stream: string): string {
    const streamToken = normalizeGeneratedIdToken(stream, "stream name");
    const nextCounter = this.counters.get(streamToken) ?? 0;
    const id = `${this.namespace}:${streamToken}:${String(nextCounter).padStart(4, "0")}`;
    this.claim(id);
    this.counters.set(streamToken, nextCounter + 1);
    return id;
  }

  semantic(stream: string, semanticKey: string): string {
    const streamToken = normalizeGeneratedIdToken(stream, "stream name");
    const keyToken = normalizeGeneratedIdToken(semanticKey, "semantic key");
    const lookupKey = `${streamToken}:${keyToken}`;
    const existing = this.semanticIds.get(lookupKey);
    if (existing) return existing;

    const id = `${this.namespace}:${streamToken}:${keyToken}`;
    this.claim(id);
    this.semanticIds.set(lookupKey, id);
    return id;
  }

  reserve(id: string): void {
    if (this.allocated.has(id)) throw new Error(`Cannot reserve already allocated ID: ${id}`);
    this.reserved.add(id);
  }

  snapshot(): DeterministicIdAllocatorSnapshot {
    return {
      namespace: this.namespace,
      streamCounters: Object.fromEntries([...this.counters].sort(([a], [b]) => a.localeCompare(b))),
      semanticIds: Object.fromEntries([...this.semanticIds].sort(([a], [b]) => a.localeCompare(b))),
    };
  }

  private claim(id: string): void {
    if (this.reserved.has(id)) throw new Error(`Generated ID collides with a reserved ID: ${id}`);
    if (this.allocated.has(id)) throw new Error(`Generated ID was allocated more than once: ${id}`);
    this.allocated.add(id);
  }
}

const remapValue = (value: unknown, oldPrefix: string, newPrefix: string): unknown => {
  if (typeof value === "string") {
    return value.startsWith(`${oldPrefix}:`)
      ? `${newPrefix}${value.slice(oldPrefix.length)}`
      : value;
  }
  if (Array.isArray(value)) return value.map((entry) => remapValue(entry, oldPrefix, newPrefix));
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const remappedKey = key.startsWith(`${oldPrefix}:`)
      ? `${newPrefix}${key.slice(oldPrefix.length)}`
      : key;
    if (Object.prototype.hasOwnProperty.call(result, remappedKey)) {
      throw new Error(`Namespace remap would create duplicate key: ${remappedKey}`);
    }
    result[remappedKey] = remapValue(entry, oldPrefix, newPrefix);
  }
  return result;
};

export const remapGeneratedNamespace = <T>(
  value: T,
  oldMapId: string,
  newMapId: string,
  prefix = "dg",
): T =>
  remapValue(
    value,
    generatedIdNamespace(oldMapId, prefix),
    generatedIdNamespace(newMapId, prefix),
  ) as T;

/** A map output hash excludes provenance, timestamps, and edit-state flags. */
export const hashMapOutput = (map: MapData): string => {
  const { generation: _generation, ...ordinaryMap } = map;
  return stableContentHash(ordinaryMap);
};

export interface RemapGeneratedMapOptions {
  prefix?: string;
  markManuallyModified?: boolean;
}

/**
 * Duplicates a generated map into a new collision domain and rewrites local
 * namespaced references, including keys in record-shaped extension data.
 */
export const remapGeneratedMapNamespace = (
  map: MapData,
  newMapId: string,
  options: RemapGeneratedMapOptions = {},
): MapData => {
  const oldMapId = map.id;
  const remapped = remapGeneratedNamespace(map, oldMapId, newMapId, options.prefix);
  const withMapIdentity: MapData = {
    ...remapped,
    id: newMapId,
    exits: remapped.exits.map((exit) =>
      exit.target_map_id === oldMapId ? { ...exit, target_map_id: newMapId } : exit,
    ),
    generation: remapped.generation
      ? {
          ...remapped.generation,
          manuallyModified: options.markManuallyModified ?? true,
          outputHash: "pending",
        }
      : undefined,
  };

  if (withMapIdentity.generation) {
    withMapIdentity.generation.outputHash = hashMapOutput(withMapIdentity);
  }
  return MapDataSchema.parse(withMapIdentity);
};
