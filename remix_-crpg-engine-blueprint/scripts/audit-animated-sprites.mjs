import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(
  process.argv[2] || "public/sprites/third_voice/people_horrors",
);
const maxFrameHeight = Math.max(1, Number(process.argv[3] || 192));
const files = (await readdir(root))
  .filter((name) => name.toLowerCase().endsWith(".gif"))
  .sort();

let totalBytes = 0;
const failures = [];
for (const name of files) {
  const source = path.join(root, name);
  const [metadata, file] = await Promise.all([
    sharp(source, { animated: true, limitInputPixels: false }).metadata(),
    stat(source),
  ]);
  const frameHeight = metadata.pageHeight || metadata.height || 0;
  totalBytes += file.size;
  if ((metadata.pages || 1) < 2) failures.push(`${name}: animation has fewer than 2 frames`);
  if (frameHeight > maxFrameHeight) {
    failures.push(`${name}: frame height ${frameHeight}px exceeds ${maxFrameHeight}px`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Animated sprite audit complete: ${files.length} GIFs, ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MiB, frame height <= ${maxFrameHeight}px.`,
  );
}
