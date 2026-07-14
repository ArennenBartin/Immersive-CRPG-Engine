import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type TileSpec = {
  id: string;
  displayName: string;
};

const sourcePath = path.resolve(
  process.argv[2] || "public/overworld/generated/oblique/source/terrain_atlas_raw.png",
);
const outDir = path.resolve("public/overworld/generated/oblique/terrain");
const manifestPath = path.resolve("public/overworld/generated/oblique/terrain_manifest.json");
const contactSheetPath = path.resolve("public/overworld/generated/oblique/terrain_contact_sheet.png");

const columns = [
  [0, 310],
  [312, 623],
  [627, 936],
  [941, 1250],
] as const;
const rows = [
  [2, 312],
  [314, 625],
  [627, 937],
  [939, 1251],
] as const;

const tileOrder: TileSpec[] = [
  { id: "grass", displayName: "Grass" },
  { id: "dirt_path", displayName: "Dirt Path" },
  { id: "packed_road", displayName: "Packed Road" },
  { id: "mud", displayName: "Mud" },
  { id: "sand", displayName: "Sand" },
  { id: "bare_stone", displayName: "Bare Stone" },
  { id: "moss", displayName: "Moss" },
  { id: "grave_road", displayName: "Grave Road" },
  { id: "cairn_stone", displayName: "Cairn Stone" },
  { id: "fen_reed", displayName: "Fen Reed" },
  { id: "standing_water", displayName: "Standing Water" },
  { id: "tilled_field", displayName: "Tilled Field" },
  { id: "dark_garden", displayName: "Dark Garden" },
  { id: "dense_brush", displayName: "Dense Brush" },
  { id: "fractured_ground", displayName: "Fractured Ground" },
  { id: "glass_vein", displayName: "Glass Vein" },
];

const whiteThreshold = 238;
const edgeBlendPixels = 5;

const pixelOffset = (width: number, x: number, y: number) => (y * width + x) * 4;

const isBorderWhite = (data: Buffer, width: number, x: number, y: number) => {
  const i = pixelOffset(width, x, y);
  return (
    data[i + 3] > 0 &&
    data[i] >= whiteThreshold &&
    data[i + 1] >= whiteThreshold &&
    data[i + 2] >= whiteThreshold
  );
};

const removeBorderConnectedWhite = (data: Buffer, width: number, height: number) => {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p] || !isBorderWhite(data, width, x, y)) return;
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
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
};

const cropRaw = (
  data: Buffer,
  sourceWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
) => {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = pixelOffset(sourceWidth, left, top + y);
    const targetStart = y * width * 4;
    data.copy(out, targetStart, sourceStart, sourceStart + width * 4);
  }
  return out;
};

const mixPair = (data: Buffer, a: number, b: number, weight: number) => {
  for (let c = 0; c < 4; c += 1) {
    const av = data[a + c];
    const bv = data[b + c];
    const midpoint = Math.round((av + bv) / 2);
    data[a + c] = Math.round(av * (1 - weight) + midpoint * weight);
    data[b + c] = Math.round(bv * (1 - weight) + midpoint * weight);
  }
};

const averageFour = (data: Buffer, offsets: number[]) => {
  for (let c = 0; c < 4; c += 1) {
    const value = Math.round(offsets.reduce((sum, offset) => sum + data[offset + c], 0) / offsets.length);
    offsets.forEach((offset) => {
      data[offset + c] = value;
    });
  }
};

const conditionLoopEdges = (data: Buffer, width: number, height: number) => {
  const blend = Math.min(edgeBlendPixels, Math.floor(Math.min(width, height) / 12));
  if (blend <= 0) return;

  for (let d = 0; d < blend; d += 1) {
    const weight = 1 - d / blend;
    for (let y = 0; y < height; y += 1) {
      mixPair(data, pixelOffset(width, d, y), pixelOffset(width, width - 1 - d, y), weight);
    }
    for (let x = 0; x < width; x += 1) {
      mixPair(data, pixelOffset(width, x, d), pixelOffset(width, x, height - 1 - d), weight);
    }
  }

  for (let dx = 0; dx < blend; dx += 1) {
    for (let dy = 0; dy < blend; dy += 1) {
      averageFour(data, [
        pixelOffset(width, dx, dy),
        pixelOffset(width, width - 1 - dx, dy),
        pixelOffset(width, dx, height - 1 - dy),
        pixelOffset(width, width - 1 - dx, height - 1 - dy),
      ]);
    }
  }
};

const edgeDelta = (data: Buffer, width: number, height: number) => {
  let horizontal = 0;
  let vertical = 0;
  let hCount = 0;
  let vCount = 0;
  for (let y = 0; y < height; y += 1) {
    const l = pixelOffset(width, 0, y);
    const r = pixelOffset(width, width - 1, y);
    for (let c = 0; c < 4; c += 1) {
      horizontal += Math.abs(data[l + c] - data[r + c]);
      hCount += 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    const t = pixelOffset(width, x, 0);
    const b = pixelOffset(width, x, height - 1);
    for (let c = 0; c < 4; c += 1) {
      vertical += Math.abs(data[t + c] - data[b + c]);
      vCount += 1;
    }
  }
  return {
    leftRightAvg: Number((horizontal / Math.max(1, hCount)).toFixed(3)),
    topBottomAvg: Number((vertical / Math.max(1, vCount)).toFixed(3)),
  };
};

const renderContactSheet = async (outputs: { id: string; path: string }[]) => {
  const cell = 180;
  const pad = 12;
  const sheetWidth = pad + columns.length * (cell + pad);
  const sheetHeight = pad + rows.length * (cell + pad);
  const composites = await Promise.all(
    outputs.map(async (entry, index) => {
      const input = await sharp(entry.path)
        .resize(cell, cell, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      const col = index % columns.length;
      const row = Math.floor(index / columns.length);
      return {
        input,
        left: pad + col * (cell + pad),
        top: pad + row * (cell + pad),
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
  const sourceMeta = await sharp(sourcePath).metadata();
  if (!sourceMeta.width || !sourceMeta.height) {
    throw new Error(`Could not read atlas dimensions: ${sourcePath}`);
  }

  const manifest = [];
  const outputs: { id: string; path: string }[] = [];

  for (let index = 0; index < tileOrder.length; index += 1) {
    const spec = tileOrder[index];
    const col = index % columns.length;
    const row = Math.floor(index / columns.length);
    const [left, right] = columns[col];
    const [top, bottom] = rows[row];
    const width = right - left + 1;
    const height = bottom - top + 1;
    const { data, info } = await sharp(sourcePath)
      .ensureAlpha()
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = Buffer.from(data);
    const removedWhitePixels = removeBorderConnectedWhite(raw, info.width, info.height);
    const bounds = alphaBounds(raw, info.width, info.height);
    if (!bounds) throw new Error(`Tile ${spec.id} had no non-transparent pixels after crop cleanup`);
    const cropped = cropRaw(raw, info.width, bounds.left, bounds.top, bounds.width, bounds.height);
    conditionLoopEdges(cropped, bounds.width, bounds.height);
    const deltas = edgeDelta(cropped, bounds.width, bounds.height);
    const outPath = path.join(outDir, `${spec.id}.png`);
    await sharp(cropped, {
      raw: { width: bounds.width, height: bounds.height, channels: 4 },
    })
      .png()
      .toFile(outPath);

    outputs.push({ id: spec.id, path: outPath });
    manifest.push({
      id: spec.id,
      displayName: spec.displayName,
      spriteId: `oblique_tile_${spec.id}`,
      url: `/overworld/generated/oblique/terrain/${spec.id}.png`,
      sourceCell: { row, col },
      sourceBounds: { left, top, width, height },
      trimmedBounds: bounds,
      output: { width: bounds.width, height: bounds.height },
      removedWhitePixels,
      loopEdgeDelta: deltas,
    });
  }

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        schema: "crpg_oblique_terrain_manifest_v1",
        source: `/overworld/generated/oblique/source/${path.basename(sourcePath)}`,
        edgeBlendPixels,
        tiles: manifest,
      },
      null,
      2,
    ),
  );
  await renderContactSheet(outputs);

  console.log(`Extracted ${outputs.length} oblique terrain tiles`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`Contact sheet: ${path.relative(process.cwd(), contactSheetPath)}`);
  manifest.forEach((tile) => {
    console.log(
      `${tile.id.padEnd(18)} ${tile.output.width}x${tile.output.height} ` +
        `removed=${String(tile.removedWhitePixels).padStart(5)} ` +
        `edgeΔ lr=${tile.loopEdgeDelta.leftRightAvg} tb=${tile.loopEdgeDelta.topBottomAvg}`,
    );
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
