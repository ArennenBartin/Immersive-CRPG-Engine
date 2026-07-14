import { performance } from "node:perf_hooks";
import { FINE_PER_MACRO } from "../src/engine-core/gridCoordinates";
import { fogCellKey, hasFogLineOfSight } from "../src/utils/fogOfWar";

const MACRO_WIDTH = 120;
const MACRO_HEIGHT = 120;
const FINE_WIDTH = MACRO_WIDTH * FINE_PER_MACRO;
const FINE_HEIGHT = MACRO_HEIGHT * FINE_PER_MACRO;
const MACRO_RADIUS = 5;
const FINE_RADIUS = MACRO_RADIUS * FINE_PER_MACRO;
const RUNS = 300;
const THRESHOLD_MS = 8;

const blockers = new Set<string>();

// Synthetic large-map blocker field: sparse walls and diagonals, with the center
// kept clear. This profiles the renderer's visibility math, not content quality.
for (let z = 0; z < FINE_HEIGHT; z += 1) {
  for (let x = 0; x < FINE_WIDTH; x += 1) {
    const nearCenter = Math.abs(x - FINE_WIDTH / 2) < FINE_RADIUS + 4 && Math.abs(z - FINE_HEIGHT / 2) < FINE_RADIUS + 4;
    if (nearCenter) continue;
    if ((x % 37 === 0 && z % 5 !== 0) || (z % 41 === 0 && x % 7 !== 0) || ((x + z) % 113 === 0)) {
      blockers.add(fogCellKey(x, z));
    }
  }
}

type ProfileResult = {
  label: string;
  avgMs: number;
  p95Ms: number;
  visible: number;
};

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
};

const profile = (label: string, fn: () => number): ProfileResult => {
  const samples: number[] = [];
  let visible = 0;
  for (let i = 0; i < RUNS + 20; i += 1) {
    const start = performance.now();
    visible = fn();
    const elapsed = performance.now() - start;
    if (i >= 20) samples.push(elapsed);
  }
  return {
    label,
    avgMs: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
    p95Ms: percentile(samples, 0.95),
    visible,
  };
};

const fineUpdate = () => {
  const px = Math.floor(FINE_WIDTH / 2);
  const pz = Math.floor(FINE_HEIGHT / 2);
  const visible = new Set<string>();
  const blocks = (x: number, z: number) => blockers.has(fogCellKey(x, z));
  for (let z = pz - FINE_RADIUS; z <= pz + FINE_RADIUS; z += 1) {
    for (let x = px - FINE_RADIUS; x <= px + FINE_RADIUS; x += 1) {
      const dist = Math.max(Math.abs(x - px), Math.abs(z - pz));
      if (dist > FINE_RADIUS) continue;
      if (dist <= FINE_PER_MACRO || hasFogLineOfSight([px, pz], [x, z], blocks)) {
        visible.add(fogCellKey(x, z));
      }
    }
  }
  return visible.size;
};

const macroUpdate = () => {
  const pmx = Math.floor(MACRO_WIDTH / 2);
  const pmz = Math.floor(MACRO_HEIGHT / 2);
  const visible = new Set<string>();
  const macroBlockerCache = new Map<string, boolean>();
  const macroBlocks = (mx: number, mz: number) => {
    const cacheKey = `${mx}:${mz}`;
    const cached = macroBlockerCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let blocked = false;
    outer: for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
      for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
        if (blockers.has(fogCellKey(mx * FINE_PER_MACRO + dx, mz * FINE_PER_MACRO + dz))) {
          blocked = true;
          break outer;
        }
      }
    }
    macroBlockerCache.set(cacheKey, blocked);
    return blocked;
  };
  for (let mz = pmz - MACRO_RADIUS; mz <= pmz + MACRO_RADIUS; mz += 1) {
    for (let mx = pmx - MACRO_RADIUS; mx <= pmx + MACRO_RADIUS; mx += 1) {
      const dist = Math.max(Math.abs(mx - pmx), Math.abs(mz - pmz));
      if (dist > MACRO_RADIUS) continue;
      if (dist <= 1 || hasFogLineOfSight([pmx, pmz], [mx, mz], macroBlocks)) {
        visible.add(`${mx}:${mz}`);
      }
    }
  }
  return visible.size;
};

const fine = profile("fine", fineUpdate);
const macro = profile("macro", macroUpdate);
const decision = fine.p95Ms <= THRESHOLD_MS ? "fine is within the threshold; macro remains the save-size default" : "macro";

console.log("fog-los profile");
console.log(`map: ${MACRO_WIDTH}x${MACRO_HEIGHT} macro, ${FINE_WIDTH}x${FINE_HEIGHT} fine, ratio ${FINE_PER_MACRO}`);
console.log(`radius: ${MACRO_RADIUS} macro / ${FINE_RADIUS} fine, runs: ${RUNS}, threshold: ${THRESHOLD_MS}ms p95`);
for (const result of [fine, macro]) {
  console.log(
    `${result.label.padEnd(5)} avg=${result.avgMs.toFixed(3)}ms p95=${result.p95Ms.toFixed(3)}ms visible=${result.visible}`,
  );
}
console.log(`decision: ${decision}`);
