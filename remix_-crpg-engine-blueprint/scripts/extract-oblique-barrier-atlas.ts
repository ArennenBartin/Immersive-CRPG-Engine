import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type TileSpec = {
  id: string;
  displayName: string;
};

const sourcePath = path.resolve(
  process.argv[2] || "public/overworld/generated/oblique/source/barrier_atlas_raw.png",
);
const outDir = path.resolve("public/overworld/generated/oblique/barrier");
const manifestPath = path.resolve("public/overworld/generated/oblique/barrier_manifest.json");
const contactSheetPath = path.resolve("public/overworld/generated/oblique/barrier_contact_sheet.png");

const whiteThreshold = 238;
const edgeBlendPixels = 4;

const tileOrder: TileSpec[] = [
  { id: "rough_wood_fence", displayName: "Rough Wood Fence" },
  { id: "palisade_stakes", displayName: "Palisade Stakes" },
  { id: "iron_bar_gate", displayName: "Iron Bar Gate" },
  { id: "heavy_wood_gate", displayName: "Heavy Wood Gate" },
  { id: "barred_stone_window", displayName: "Barred Stone Window" },
  { id: "shuttered_timber_window", displayName: "Shuttered Timber Window" },
  { id: "church_stained_window", displayName: "Church Stained-Glass Window" },
  { id: "cellar_grate", displayName: "Cellar Grate" },
  { id: "thorn_hedge", displayName: "Thorn Hedge Barrier" },
  { id: "dense_bramble_wall", displayName: "Dense Bramble Wall" },
  { id: "reed_screen", displayName: "Reed Screen" },
  { id: "wattle_fence", displayName: "Wattle Fence" },
  { id: "rubble_barricade", displayName: "Collapsed Rubble Barricade" },
  { id: "timber_barricade", displayName: "Broken Timber Barricade" },
  { id: "glass_growth_barrier", displayName: "Glass Growth Barrier" },
  { id: "black_light_lattice", displayName: "Black-Light Lattice Barrier" },
];

const pixelOffset = (width: number, x: number, y: number) => (y * width + x) * 4;

const isWhite = (data: Buffer, width: number, x: number, y: number) => {
  const i = pixelOffset(width, x, y);
  return (
    data[i + 3] > 0 &&
    data[i] >= whiteThreshold &&
    data[i + 1] >= whiteThreshold &&
    data[i + 2] >= whiteThreshold
  );
};

const findSegments = (counts: number[], threshold: number) => {
  const segments: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] > threshold && start < 0) start = i;
    if ((counts[i] <= threshold || i === counts.length - 1) && start >= 0) {
      const end = counts[i] <= threshold ? i - 1 : i;
      if (end - start > 30) segments.push([start, end]);
      start = -1;
    }
  }
  return segments;
};

const detectAtlasSegments = async () => {
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const columnCounts: number[] = [];
  const rowCounts: number[] = [];
  for (let x = 0; x < info.width; x += 1) {
    let count = 0;
    for (let y = 0; y < info.height; y += 1) if (!isWhite(data, info.width, x, y)) count += 1;
    columnCounts.push(count);
  }
  for (let y = 0; y < info.height; y += 1) {
    let count = 0;
    for (let x = 0; x < info.width; x += 1) if (!isWhite(data, info.width, x, y)) count += 1;
    rowCounts.push(count);
  }
  const columns = findSegments(columnCounts, 20);
  const rows = findSegments(rowCounts, 20);
  if (columns.length !== 4 || rows.length !== 4) {
    throw new Error(`Expected 4x4 barrier atlas, found ${columns.length} columns and ${rows.length} rows`);
  }
  return { columns, rows };
};

const removeConnectedWhite = (data: Buffer, width: number, height: number) => {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p] || !isWhite(data, width, x, y)) return;
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

const mixPair = (data: Buffer, a: number, b: number, weight: number) => {
  for (let c = 0; c < 4; c += 1) {
    if (data[a + 3] < 12 || data[b + 3] < 12) continue;
    const av = data[a + c];
    const bv = data[b + c];
    const midpoint = Math.round((av + bv) / 2);
    data[a + c] = Math.round(av * (1 - weight) + midpoint * weight);
    data[b + c] = Math.round(bv * (1 - weight) + midpoint * weight);
  }
};

const conditionLoopEdges = (data: Buffer, width: number, height: number) => {
  const blend = Math.min(edgeBlendPixels, Math.floor(Math.min(width, height) / 12));
  for (let d = 0; d < blend; d += 1) {
    const weight = 1 - d / blend;
    for (let y = 0; y < height; y += 1) {
      mixPair(data, pixelOffset(width, d, y), pixelOffset(width, width - 1 - d, y), weight);
    }
  }
};

const edgeDelta = (data: Buffer, width: number, height: number) => {
  let horizontal = 0;
  let hCount = 0;
  for (let y = 0; y < height; y += 1) {
    const left = pixelOffset(width, 0, y);
    const right = pixelOffset(width, width - 1, y);
    if (data[left + 3] < 12 || data[right + 3] < 12) continue;
    for (let c = 0; c < 4; c += 1) {
      horizontal += Math.abs(data[left + c] - data[right + c]);
      hCount += 1;
    }
  }
  return {
    leftRightAvg: Number((horizontal / Math.max(1, hCount)).toFixed(3)),
  };
};

const renderContactSheet = async (outputs: { path: string }[]) => {
  const cell = 180;
  const pad = 12;
  const columns = 4;
  const sheetWidth = pad + columns * (cell + pad);
  const sheetHeight = pad + columns * (cell + pad);
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
  const { columns, rows } = await detectAtlasSegments();
  const outputs: { id: string; path: string }[] = [];
  const manifest = [];

  for (let index = 0; index < tileOrder.length; index += 1) {
    const spec = tileOrder[index];
    const col = index % 4;
    const row = Math.floor(index / 4);
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
    const removedWhitePixels = removeConnectedWhite(raw, info.width, info.height);
    conditionLoopEdges(raw, info.width, info.height);
    const deltas = edgeDelta(raw, info.width, info.height);
    const outPath = path.join(outDir, `${spec.id}.png`);
    await sharp(raw, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(outPath);
    outputs.push({ id: spec.id, path: outPath });
    manifest.push({
      id: spec.id,
      displayName: spec.displayName,
      spriteId: `oblique_barrier_${spec.id}`,
      url: `/overworld/generated/oblique/barrier/${spec.id}.png`,
      sourceCell: { row, col },
      sourceBounds: { left, top, width, height },
      output: { width: info.width, height: info.height },
      removedWhitePixels,
      loopEdgeDelta: deltas,
    });
  }

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schema: "crpg_oblique_barrier_manifest_v1",
        source: `/overworld/generated/oblique/source/${path.basename(sourcePath)}`,
        projection: "square_front_top_faces_no_map_symbols",
        edgeBlendPixels,
        alphaCleanup: "border-connected white background removed",
        tiles: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await renderContactSheet(outputs);

  console.log(`Extracted ${outputs.length} square-faced barrier tiles`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`Contact sheet: ${path.relative(process.cwd(), contactSheetPath)}`);
  manifest.forEach((tile) => {
    console.log(
      `${tile.id.padEnd(24)} ${tile.output.width}x${tile.output.height} ` +
        `removed=${String(tile.removedWhitePixels).padStart(5)} edgeΔ lr=${tile.loopEdgeDelta.leftRightAvg}`,
    );
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
