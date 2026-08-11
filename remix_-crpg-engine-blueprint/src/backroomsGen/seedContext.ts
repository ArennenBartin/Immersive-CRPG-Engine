import { RNG, hashSeed } from "../engine-core/rng";
import type { BackroomsStageId } from "./types";

export interface BackroomsSeedContextOptions {
  generatorVersion: "backrooms_v1";
  recipeId: string;
  seed: string;
  stageSalts?: Partial<Record<BackroomsStageId, string>>;
  attemptIndex?: number;
  debug?: boolean;
}

export interface BackroomsWeightedChoice<T> {
  id: string;
  weight: number;
  value: T;
}

export interface BackroomsRandomChoiceTrace {
  stage: BackroomsStageId;
  purpose: string;
  sourceIds: string[];
  chosenId: string;
  draw: number;
  totalWeight: number;
}

export interface BackroomsRngStreamSnapshot {
  stage: BackroomsStageId;
  salt: string;
  attemptIndex: number;
  derivationKey: string;
  initialSeed: number;
  state: number;
  draws: number;
}

const compareIds = (left: { id: string }, right: { id: string }) =>
  left.id.localeCompare(right.id);

export class BackroomsRandom {
  private readonly rng: RNG;
  private draws = 0;

  constructor(
    readonly stage: BackroomsStageId,
    readonly salt: string,
    readonly attemptIndex: number,
    readonly derivationKey: string,
    readonly initialSeed: number,
    private readonly traces?: BackroomsRandomChoiceTrace[],
  ) {
    this.rng = new RNG(initialSeed);
  }

  next(): number {
    this.draws += 1;
    return this.rng.next();
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("Backrooms RNG integer bound must be a positive integer");
    }
    return Math.floor(this.next() * maxExclusive);
  }

  intBetween(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError("Backrooms RNG integer range must use integers");
    }
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + this.int(high - low + 1);
  }

  chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError("Backrooms RNG probability must be between zero and one");
    }
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("Cannot choose from an empty collection");
    return values[this.int(values.length)];
  }

  weighted<T>(values: readonly BackroomsWeightedChoice<T>[], purpose: string): T {
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

  shuffleById<T extends { id: string }>(values: readonly T[]): T[] {
    const result = [...values].sort(compareIds);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = this.int(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  snapshot(): BackroomsRngStreamSnapshot {
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
 * Each request returns a fresh stage-local stream. Previewing or retrying one
 * stage therefore cannot consume randomness belonging to another stage.
 */
export class BackroomsSeedContext {
  readonly choiceTraces: BackroomsRandomChoiceTrace[];
  private readonly snapshots = new Map<BackroomsStageId, BackroomsRngStreamSnapshot>();

  constructor(readonly options: BackroomsSeedContextOptions) {
    if (!options.recipeId.trim() || !options.seed.trim()) {
      throw new TypeError("Backrooms recipe ID and seed are required");
    }
    if (!Number.isInteger(options.attemptIndex ?? 0) || (options.attemptIndex ?? 0) < 0) {
      throw new RangeError("Generation attempt index must be a non-negative integer");
    }
    this.choiceTraces = [];
  }

  stream(stage: BackroomsStageId): BackroomsRandom {
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
    const stream = new BackroomsRandom(
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

  snapshot(streams: readonly BackroomsRandom[] = []): Record<string, BackroomsRngStreamSnapshot> {
    for (const stream of streams) this.snapshots.set(stream.stage, stream.snapshot());
    return Object.fromEntries(
      [...this.snapshots.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([stage, snapshot]) => [stage, snapshot]),
    );
  }
}

export const createBackroomsSeedContext = (options: BackroomsSeedContextOptions) =>
  new BackroomsSeedContext(options);
