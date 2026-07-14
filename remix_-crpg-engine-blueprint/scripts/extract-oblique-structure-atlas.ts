import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type TileSpec = {
  id: string;
  displayName: string;
};

const sourcePath = path.resolve(
  process.argv[2] || "public/overworld/generated/oblique/source/structure_atlas_raw.png",
);
const outDir = path.resolve("public/overworld/generated/oblique/structure");
const manifestPath = path.resolve("public/overworld/generated/oblique/structure_manifest.json");
const contactSheetPath = path.resolve("public/overworld/generated/oblique/structure_contact_sheet.png");

const whiteThreshold = 238;
const edgeBlendPixels = 5;

const tileOrder: TileSpec[] = [
  { id: "rough_fieldstone_wall", displayName: "Rough Fieldstone Wall" },
  { id: "dressed_ashlar_wall", displayName: "Dressed Ashlar Wall" },
  { id: "red_brick_wall", displayName: "Red Brick Wall" },
  { id: "timber_plaster_wall", displayName: "Timber And Plaster Wall" },
  { id: "dark_manor_stone_wall", displayName: "Dark Manor Stone Wall" },
  { id: "mossy_ruin_wall", displayName: "Mossy Ruin Wall" },
  { id: "reed_wattle_wall", displayName: "Reed And Wattle Wall" },
  { id: "church_limestone_wall", displayName: "Church Limestone Wall" },
  { id: "charred_wall", displayName: "Charred Wall" },
  { id: "cellar_block_wall", displayName: "Cellar Block Wall" },
  { id: "glass_veined_wall", displayName: "Glass Veined Wall" },
  { id: "wooden_plank_wall", displayName: "Wooden Plank Wall" },
  { id: "simple_wooden_door", displayName: "Simple Wooden Door" },
  { id: "iron_banded_door", displayName: "Iron Banded Door" },
  { id: "arched_church_door", displayName: "Arched Church Door" },
  { id: "dark_manor_gate", displayName: "Dark Manor Gate" },
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
    throw new Error(`Expected 4x4 structure atlas, found ${columns.length} columns and ${rows.length} rows`);
  }
  return { columns, rows };
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
    const left = pixelOffset(width, 0, y);
    const right = pixelOffset(width, width - 1, y);
    for (let c = 0; c < 4; c += 1) {
      horizontal += Math.abs(data[left + c] - data[right + c]);
      hCount += 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    const top = pixelOffset(width, x, 0);
    const bottom = pixelOffset(width, x, height - 1);
    for (let c = 0; c < 4; c += 1) {
      vertical += Math.abs(data[top + c] - data[bottom + c]);
      vCount += 1;
    }
  }
  return {
    leftRightAvg: Number((horizontal / Math.max(1, hCount)).toFixed(3)),
    topBottomAvg: Number((vertical / Math.max(1, vCount)).toFixed(3)),
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
      spriteId: `oblique_structure_${spec.id}`,
      url: `/overworld/generated/oblique/structure/${spec.id}.png`,
      sourceCell: { row, col },
      sourceBounds: { left, top, width, height },
      output: { width: info.width, height: info.height },
      loopEdgeDelta: deltas,
    });
  }

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schema: "crpg_oblique_structure_manifest_v1",
        source: `/overworld/generated/oblique/source/${path.basename(sourcePath)}`,
        projection: "square_front_top_faces_no_perspective",
        edgeBlendPixels,
        tiles: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await renderContactSheet(outputs);

  console.log(`Extracted ${outputs.length} square-faced structure tiles`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`Contact sheet: ${path.relative(process.cwd(), contactSheetPath)}`);
  manifest.forEach((tile) => {
    console.log(
      `${tile.id.padEnd(25)} ${tile.output.width}x${tile.output.height} ` +
        `edgeΔ lr=${tile.loopEdgeDelta.leftRightAvg} tb=${tile.loopEdgeDelta.topBottomAvg}`,
    );
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
