import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const inputPath = process.argv[2];
const outputPath = resolve(
  process.argv[3] || "public/textures/environment/exterior-cosmic-sky.webp",
);

if (!inputPath) {
  throw new Error(
    "Usage: node scripts/optimize-lonely-street-sky.mjs <source-image> [output.webp]",
  );
}

const source = sharp(resolve(inputPath)).rotate();
const metadata = await source.metadata();
if (!metadata.width || !metadata.height) {
  throw new Error("Sky source must have readable image dimensions");
}

// Equirectangular sky textures need a 2:1 aspect ratio. Prefer a centered
// crop so the supplied artwork keeps its native horizontal detail and no
// pixels are invented by upscaling.
const targetHeight = Math.floor(metadata.width / 2);
let pipeline = source;
if (metadata.height >= targetHeight) {
  pipeline = pipeline.extract({
    left: 0,
    top: Math.floor((metadata.height - targetHeight) / 2),
    width: metadata.width,
    height: targetHeight,
  });
} else {
  pipeline = pipeline.resize(metadata.width, targetHeight, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
const result = await pipeline
  .webp({
    quality: 86,
    effort: 6,
    smartSubsample: true,
  })
  .toFile(outputPath);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      source: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      },
      optimized: {
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.size,
      },
    },
    null,
    2,
  ),
);
