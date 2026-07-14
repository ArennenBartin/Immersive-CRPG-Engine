import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type FrameSpec = {
  direction: "south" | "north" | "east" | "west";
  frame: "idle" | "step";
};

const sourcePath = path.resolve(
  process.argv[2] || "public/overworld/generated/oblique/source/player_intercessor_atlas_raw.png",
);
const outDir = path.resolve("public/overworld/generated/player/intercessor");
const manifestPath = path.resolve("public/overworld/generated/player/intercessor_manifest.json");
const contactSheetPath = path.resolve("public/overworld/generated/player/intercessor_contact_sheet.png");

const frames: FrameSpec[] = [
  { direction: "south", frame: "idle" },
  { direction: "north", frame: "idle" },
  { direction: "west", frame: "idle" },
  { direction: "east", frame: "idle" },
  { direction: "south", frame: "step" },
  { direction: "north", frame: "step" },
  { direction: "west", frame: "step" },
  { direction: "east", frame: "step" },
];

const pixelOffset = (width: number, x: number, y: number) => (y * width + x) * 4;

const isBackground = (data: Buffer, width: number, x: number, y: number) => {
  const i = pixelOffset(width, x, y);
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a === 0) return false;
  const magentaKey = r > 215 && g < 90 && b > 215;
  const whiteGutter = r > 242 && g > 242 && b > 242;
  return magentaKey || whiteGutter;
};

const removeConnectedBackground = (data: Buffer, width: number, height: number) => {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p] || !isBackground(data, width, x, y)) return;
    visited[p] = 1;
    queue.push(p);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let removed = 0;
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % width;
    const y = Math.floor(p / width);
    data[pixelOffset(width, x, y) + 3] = 0;
    removed += 1;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }
  return removed;
};

const isChromaFringe = (data: Buffer, offset: number) => {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const a = data[offset + 3];
  if (a === 0) return false;
  const hotMagenta = r > 205 && b > 205 && g < 115;
  const mixedMagentaHalo = r > 120 && b > 120 && g < Math.min(r, b) * 0.72 && Math.abs(r - b) < 95;
  const purpleHalo = r > 90 && b > 100 && g < 95 && Math.max(r, b) - g > 48;
  return hotMagenta || mixedMagentaHalo || purpleHalo;
};

const hasTransparentNeighbor = (data: Buffer, width: number, height: number, x: number, y: number) => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
      if (data[pixelOffset(width, nx, ny) + 3] === 0) return true;
    }
  }
  return false;
};

const removeChromaFringe = (data: Buffer, width: number, height: number) => {
  let removed = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const toClear: number[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = pixelOffset(width, x, y);
        if (!isChromaFringe(data, offset) || !hasTransparentNeighbor(data, width, height, x, y)) continue;
        toClear.push(offset);
      }
    }
    toClear.forEach((offset) => {
      data[offset + 3] = 0;
      removed += 1;
    });
  }
  return removed;
};

const removeGlobalKeyMagenta = (data: Buffer, width: number, height: number) => {
  let removed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelOffset(width, x, y);
      if (data[offset + 3] === 0) continue;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (!(r > 215 && b > 215 && g < 95)) continue;
      data[offset + 3] = 0;
      removed += 1;
    }
  }
  return removed;
};

const clearOuterBorder = (data: Buffer, width: number, height: number, pixels = 5) => {
  let removed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= pixels && y >= pixels && x < width - pixels && y < height - pixels) continue;
      const offset = pixelOffset(width, x, y);
      if (data[offset + 3] === 0) continue;
      data[offset + 3] = 0;
      removed += 1;
    }
  }
  return removed;
};

const alphaBounds = (data: Buffer, width: number, height: number) => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[pixelOffset(width, x, y) + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

const renderContactSheet = async (outputs: { path: string }[]) => {
  const cell = 180;
  const pad = 12;
  const columns = 4;
  const rows = 2;
  const sheetWidth = pad + columns * (cell + pad);
  const sheetHeight = pad + rows * (cell + pad);
  const composites = await Promise.all(
    outputs.map(async (entry, index) => {
      const input = await sharp(entry.path)
        .resize(cell, cell, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      return {
        input,
        left: pad + (index % columns) * (cell + pad),
        top: pad + Math.floor(index / columns) * (cell + pad),
      };
    }),
  );
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 12, g: 14, b: 20, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(contactSheetPath);
};

const main = async () => {
  await fs.mkdir(outDir, { recursive: true });
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read atlas dimensions: ${sourcePath}`);

  const outputs: { id: string; path: string }[] = [];
  const manifest = [];

  for (let index = 0; index < frames.length; index += 1) {
    const spec = frames[index];
    const col = index % 4;
    const row = Math.floor(index / 4);
    const left = Math.round((metadata.width * col) / 4);
    const top = Math.round((metadata.height * row) / 2);
    const right = Math.round((metadata.width * (col + 1)) / 4);
    const bottom = Math.round((metadata.height * (row + 1)) / 2);
    const width = right - left;
    const height = bottom - top;
    const { data, info } = await sharp(sourcePath)
      .ensureAlpha()
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = Buffer.from(data);
    const removedBackgroundPixels = removeConnectedBackground(raw, info.width, info.height);
    const removedFringePixels =
      removeGlobalKeyMagenta(raw, info.width, info.height) +
      removeChromaFringe(raw, info.width, info.height) +
      clearOuterBorder(raw, info.width, info.height);
    const bounds = alphaBounds(raw, info.width, info.height);
    if (!bounds) throw new Error(`Frame ${spec.direction}_${spec.frame} had no visible pixels after cleanup`);

    const square = Math.max(info.width, info.height);
    const extendLeft = Math.floor((square - info.width) / 2);
    const extendRight = square - info.width - extendLeft;
    const frameId = `${spec.direction}_${spec.frame}`;
    const outPath = path.join(outDir, `${frameId}.png`);
    await sharp(raw, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extend({
        left: extendLeft,
        right: extendRight,
        top: 0,
        bottom: 0,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outPath);

    outputs.push({ id: frameId, path: outPath });
    manifest.push({
      id: frameId,
      displayName: `Intercessor ${spec.direction} ${spec.frame}`,
      spriteId: `generated_player_intercessor_${frameId}`,
      url: `/overworld/generated/player/intercessor/${frameId}.png`,
      sourceCell: { row, col },
      sourceBounds: { left, top, width, height },
      output: { width: square, height: square },
      visibleBounds: {
        left: bounds.left + extendLeft,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
      removedBackgroundPixels,
      removedFringePixels,
    });
  }

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schema: "crpg_generated_intercessor_manifest_v1",
        source: `/overworld/generated/oblique/source/${path.basename(sourcePath)}`,
        frameLayout: "4 columns south/north/west/east, 2 rows idle/step",
        sourceReference: "/sprites/player-pilgrim.png",
        alphaCleanup: "border-connected magenta/white background removed; square canvas padded for renderer",
        frames: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await renderContactSheet(outputs);

  console.log(`Extracted ${outputs.length} Intercessor player frames`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`Contact sheet: ${path.relative(process.cwd(), contactSheetPath)}`);
  manifest.forEach((frame) => {
    console.log(
      `${frame.id.padEnd(12)} ${frame.output.width}x${frame.output.height} ` +
        `visible=${frame.visibleBounds.width}x${frame.visibleBounds.height} ` +
        `removed=${String(frame.removedBackgroundPixels).padStart(5)} ` +
        `fringe=${String(frame.removedFringePixels).padStart(4)}`,
    );
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
