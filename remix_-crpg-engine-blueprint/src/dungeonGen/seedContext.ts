import { RNG, hashSeed } from "../engine-core/rng";
import type { DungeonStageId } from "./types";

/** The independently rerollable streams locked by the dungeon-v1 contract. */
export const DUNGEON_RNG_STREAMS = [
  "topology",
  "archetypes",
  "gates",
  "floor_partition",
  "room_shapes",
  "embedding",
  "corridors",
  "infrastructure",
  "encounters",
  "hazards",
  "rewards",
  "dressing",
  "secrets",
] as const satisfies readonly DungeonStageId[];

export interface DungeonSeedContextOptions {
  generatorVersion: string;
  recipeId: string;
  seed: string;
  stageSalts?: Partial<Record<DungeonStageId, string>>;
  attemptIndex?: number;
  debug?: boolean;
}

export interface DungeonWeightedChoice<T> {
  id: string;
  weight: number;
  value: T;
}

export interface DungeonRandomChoiceTrace {
  stage: DungeonStageId;
  purpose: string;
  sourceIds: string[];
  chosenId: string;
  draw: number;
  totalWeight: number;
}

export interface DungeonRngStreamSnapshot {
  stage: DungeonStageId;
  salt: string;
  attemptIndex: number;
  derivationKey: string;
  initialSeed: number;
  state: number;
  draws: number;
}

const compareIds = (left: { id: string }, right: { id: string }) =>
  left.id.localeCompare(right.id);

/**
 * One stage-local stream. It deliberately exposes no way to request another
 * stage, which makes accidental cross-stage consumption difficult in pure
 * generation passes.
 */
export class DungeonRandom {
  private readonly rng: RNG;
  private draws = 0;

  constructor(
    readonly stage: DungeonStageId,
    readonly salt: string,
    readonly attemptIndex: number,
    readonly derivationKey: string,
    readonly initialSeed: number,
    private readonly traces?: DungeonRandomChoiceTrace[],
  ) {
    this.rng = new RNG(initialSeed);
  }

  next(): number {
    this.draws += 1;
    return this.rng.next();
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("Dungeon RNG integer bound must be a positive integer");
    }
    return Math.floor(this.next() * maxExclusive);
  }

  intBetween(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError("Dungeon RNG integer range must use integers");
    }
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + this.int(high - low + 1);
  }

  chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError("Dungeon RNG probability must be between zero and one");
    }
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("Cannot choose from an empty collection");
    return values[this.int(values.length)];
  }

  /** Canonical weighted choice: caller ordering can never affect the result. */
  weighted<T>(values: readonly DungeonWeightedChoice<T>[], purpose: string): T {
    const ordered = [...values].sort(compareIds);
    if (ordered.length === 0) throw new RangeError(`Weighted choice ${purpose} has no candidates`);
    const duplicate = ordered.find((entry, index) => index > 0 && ordered[index - 1].id === entry.id);
    if (duplicate) throw new Error(`Weighted choice ${purpose} contains duplicate ID ${duplicate.id}`);
    if (ordered.some((entry) => !Number.isFinite(entry.weight) || entry.weight < 0)) {
      throw new RangeError(`Weighted choice ${purpose} contains an invalid weight`);
    }
    const totalWeight = ordered.reduce((sum, entry) => sum + entry.weight, 0);
    if (!(totalWeight > 0)) throw new RangeError(`Weighted choice ${purpose} has no positive weight`);
    const draw = this.next() * totalWeight;
    let cursor = draw;
    let chosen = ordered[ordered.length - 1];
    for (const candidate of ordered) {
      cursor -= candidate.weight;
      if (cursor < 0) {
        chosen = candidate;
        break;
      }
    }
    this.traces?.push({
      stage: this.stage,
      purpose,
      sourceIds: ordered.map((entry) => entry.id),
      chosenId: chosen.id,
      draw,
      totalWeight,
    });
    return chosen.value;
  }

  /** Fisher-Yates over a canonical source order. */
  shuffleById<T extends { id: string }>(values: readonly T[]): T[] {
    const result = [...values].sort(compareIds);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = this.int(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  snapshot(): DungeonRngStreamSnapshot {
    return {
      stage: this.stage,
      salt: this.salt,
      attemptIndex: this.attemptIndex,
      derivationKey: this.derivationKey,
      initialSeed: this.initialSeed,
      state: this.rng.getState(),
      draws: this.draws,
    };
  }
}

/**
 * Immutable derivation context. `stream` always returns a fresh stream, so a
 * preview or audit cannot inherit consumption state from an earlier run.
 */
export class DungeonSeedContext {
  readonly choiceTraces: DungeonRandomChoiceTrace[];
  private readonly snapshots = new Map<DungeonStageId, DungeonRngStreamSnapshot>();

  constructor(readonly options: DungeonSeedContextOptions) {
    if (!options.generatorVersion.trim() || !options.recipeId.trim() || !options.seed.trim()) {
      throw new TypeError("Generator version, recipe ID, and seed are required");
    }
    if (!Number.isInteger(options.attemptIndex ?? 0) || (options.attemptIndex ?? 0) < 0) {
      throw new RangeError("Generation attempt index must be a non-negative integer");
    }
    this.choiceTraces = [];
  }

  stream(stage: DungeonStageId): DungeonRandom {
    const salt = this.options.stageSalts?.[stage] ?? "";
    const attemptIndex = this.options.attemptIndex ?? 0;
    const derivationKey = [
      this.options.generatorVersion,
      this.options.recipeId,
      this.options.seed,
      stage,
      salt,
      String(attemptIndex),
    ].join("|");
    const stream = new DungeonRandom(
      stage,
      salt,
      attemptIndex,
      derivationKey,
      hashSeed(derivationKey),
      this.options.debug ? this.choiceTraces : undefined,
    );
    const originalSnapshot = stream.snapshot.bind(stream);
    stream.snapshot = () => {
      const snapshot = originalSnapshot();
      this.snapshots.set(stage, snapshot);
      return snapshot;
    };
    return stream;
  }

  snapshot(streams: readonly DungeonRandom[] = []): Record<string, DungeonRngStreamSnapshot> {
    for (const stream of streams) this.snapshots.set(stream.stage, stream.snapshot());
    return Object.fromEntries(
      [...this.snapshots.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([stage, snapshot]) => [stage, snapshot]),
    );
  }
}

export const createDungeonSeedContext = (options: DungeonSeedContextOptions) =>
  new DungeonSeedContext(options);

