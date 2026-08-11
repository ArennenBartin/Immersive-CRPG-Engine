import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sampleRate = 22_050;

const writeMonoWav = (relativePath, seconds, sampleAt) => {
  const sampleCount = Math.floor(seconds * sampleRate);
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + sampleCount * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.max(-1, Math.min(1, sampleAt(index / sampleRate, index, sampleCount)));
    bytes.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
  }
  const output = resolve(root, relativePath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
};

let noiseState = 0x1a2b3c4d;
const noise = () => {
  noiseState = (Math.imul(noiseState, 1_664_525) + 1_013_904_223) >>> 0;
  return (noiseState / 0xffff_ffff) * 2 - 1;
};

writeMonoWav("public/sfx/backrooms-fluorescent-hum.wav", 12, (time) => {
  const breathing = 0.78 + Math.sin(time * Math.PI * 2 * 0.17) * 0.07;
  const mains = Math.sin(time * Math.PI * 2 * 60) * 0.035;
  const ballast = Math.sin(time * Math.PI * 2 * 120 + 0.35) * 0.018;
  const highBuzz = Math.sin(time * Math.PI * 2 * 240 + Math.sin(time * 0.8) * 0.2) * 0.008;
  return (mains + ballast + highBuzz + noise() * 0.0018) * breathing;
});

noiseState = 0x5e6f7788;
writeMonoWav("public/sfx/backrooms-electrical-pop.wav", 0.9, (time, index, count) => {
  const envelope = Math.exp(-time * 7.5) * Math.sin(Math.min(1, time * 70) * Math.PI * 0.5);
  const click = index < sampleRate * 0.018 ? noise() * 0.42 : 0;
  const buzz = Math.sin(time * Math.PI * 2 * 92) * 0.15 + Math.sin(time * Math.PI * 2 * 184) * 0.07;
  const tail = 1 - Math.min(1, index / Math.max(1, count - 1));
  return click + buzz * envelope * tail + noise() * 0.025 * envelope;
});

console.log("Generated deterministic Backrooms ambience WAV assets.");
