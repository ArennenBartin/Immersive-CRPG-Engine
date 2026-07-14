import { readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(
  process.argv[2] || "public/sprites/third_voice/people_horrors",
);
const maxFrameHeight = Math.max(1, Number(process.argv[3] || 192));
const files = (await readdir(root))
  .filter((name) => name.toLowerCase().endsWith(".gif"))
  .sort();

let beforeBytes = 0;
let afterBytes = 0;
let optimized = 0;

for (const [index, name] of files.entries()) {
  const source = path.join(root, name);
  const temporary = `${source}.optimized.gif`;
  const before = await stat(source);
  beforeBytes += before.size;

  const metadata = await sharp(source, {
    animated: true,
    limitInputPixels: false,
  }).metadata();
  const frameHeight = metadata.pageHeight || metadata.height || 1;
  const width = metadata.width || 1;

  if (frameHeight > maxFrameHeight) {
    const targetWidth = Math.max(
      1,
      Math.floor(width * (maxFrameHeight / frameHeight)),
    );
    try {
      await sharp(source, { animated: true, limitInputPixels: false })
        .resize({ width: targetWidth, kernel: "lanczos3" })
        .gif({
          colours: 256,
          dither: 1,
          effort: 3,
          loop: metadata.loop ?? 0,
          delay: metadata.delay,
        })
        .toFile(temporary);
      await rename(temporary, source);
      optimized += 1;
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  const after = await stat(source);
  afterBytes += after.size;
  if ((index + 1) % 20 === 0 || index === files.length - 1) {
    console.log(`Processed ${index + 1}/${files.length} GIFs`);
  }
}

const mib = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `Optimized ${optimized} GIFs: ${mib(beforeBytes)} MiB -> ${mib(afterBytes)} MiB`,
);
