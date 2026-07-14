// ── Deterministic seeded randomness ──────────────────────────────────────────
// Part of the headless engine-core. The base spec requires authoritative
// randomness to come from named, seeded streams (never ambient Math.random) so
// the same seed + command sequence reproduces the same result. This module is
// framework-agnostic: no React, no DOM, no zustand.

// mulberry32 — small, fast, deterministic PRNG.
export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  // Float in [0, 1).
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer in [0, maxExclusive).
  int(maxExclusive: number): number {
    return Math.floor(this.next() * Math.max(0, maxExclusive));
  }

  // Integer in [min, max] inclusive.
  intBetween(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + this.int(max - min + 1);
  }

  // Float in [min, max).
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // True with probability p.
  chance(p: number): boolean {
    return this.next() < p;
  }

  // Uniform pick from a non-empty array.
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  // Snapshot/restore so a stream can be serialized into a save and resumed.
  getState(): number {
    return this.state >>> 0;
  }
  setState(state: number): void {
    this.state = state >>> 0;
  }
}

// FNV-1a string/number hash → 32-bit seed. Used to derive a stable seed from
// content (map id, clock, counter) without relying on wall-clock time.
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A bundle of independently-seeded named streams (combat, loot, ai, ...), each
// derived deterministically from a single master seed.
export class RngStreams {
  private streams = new Map<string, RNG>();
  constructor(private masterSeed: number) {}

  stream(name: string): RNG {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = new RNG(hashSeed(this.masterSeed, name));
      this.streams.set(name, rng);
    }
    return rng;
  }

  reseed(masterSeed: number): void {
    this.masterSeed = masterSeed;
    this.streams.clear();
  }
}
