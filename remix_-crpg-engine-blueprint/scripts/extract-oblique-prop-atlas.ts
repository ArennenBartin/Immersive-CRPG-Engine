import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type PropSpec = {
  id: string;
  displayName: string;
};

type PropAtlasSpec = {
  sourcePath: string;
  outDir: string;
  manifestPath: string;
  contactSheetPath: string;
  props: PropSpec[];
};

const primaryProps: PropSpec[] = [
  { id: "wooden_supply_crate", displayName: "Wooden Supply Crate" },
  { id: "iron_banded_chest", displayName: "Iron Banded Chest" },
  { id: "wooden_barrel", displayName: "Wooden Barrel" },
  { id: "open_supply_crate", displayName: "Open Supply Crate" },
  { id: "alchemy_workstation", displayName: "Alchemy Workstation" },
  { id: "info_terminal", displayName: "Info Terminal" },
  { id: "training_beacon", displayName: "Training Beacon" },
  { id: "wooden_signpost", displayName: "Wooden Signpost" },
  { id: "stone_shrine_plinth", displayName: "Stone Shrine Plinth" },
  { id: "market_stall_table", displayName: "Market Stall Table" },
  { id: "handcart", displayName: "Handcart" },
  { id: "rope_pulley_stack", displayName: "Rope And Pulley Stack" },
  { id: "tree_stump_cluster", displayName: "Tree Stump Cluster" },
  { id: "dead_tree_trunk", displayName: "Dead Tree Trunk" },
  { id: "glass_crystal_column", displayName: "Glass Crystal Column" },
  { id: "dark_light_obelisk", displayName: "Dark-Light Obelisk" },
];

const objectPassProps: PropSpec[] = [
  { id: "simple_wooden_bed", displayName: "Simple Wooden Bed" },
  { id: "straw_bedroll", displayName: "Straw Bedroll" },
  { id: "wooden_chair", displayName: "Wooden Chair" },
  { id: "small_square_table", displayName: "Small Square Table" },
  { id: "tall_bookshelf", displayName: "Tall Bookshelf" },
  { id: "standing_oil_lamp", displayName: "Standing Oil Lamp" },
  { id: "stone_well", displayName: "Stone Well" },
  { id: "rubble_pile", displayName: "Rubble Pile" },
  { id: "wooden_ladder", displayName: "Wooden Ladder" },
  { id: "shop_counter", displayName: "Shop Counter" },
  { id: "mechanism_workbench", displayName: "Mechanism Workbench" },
  { id: "stone_altar", displayName: "Stone Altar" },
  { id: "wooden_cupboard", displayName: "Wooden Cupboard" },
  { id: "iron_stove", displayName: "Iron Stove" },
  { id: "broken_statue_fragment", displayName: "Broken Statue Fragment" },
  { id: "metal_floor_hatch", displayName: "Metal Floor Hatch" },
];

const exteriorProps: PropSpec[] = [
  { id: "wind_bent_young_tree", displayName: "Wind-Bent Young Tree" },
  { id: "fallen_log", displayName: "Fallen Log" },
  { id: "mossy_boulder_cluster", displayName: "Mossy Boulder Cluster" },
  { id: "thorn_bramble_clump", displayName: "Thorn Bramble Clump" },
  { id: "tall_reed_clump", displayName: "Tall Reed Clump" },
  { id: "stacked_firewood_pile", displayName: "Stacked Firewood Pile" },
  { id: "hay_bale_stack", displayName: "Hay Bale Stack" },
  { id: "rain_barrel", displayName: "Rain Barrel" },
  { id: "broken_field_fence", displayName: "Broken Field Fence" },
  { id: "loose_timber_plank_pile", displayName: "Loose Timber Plank Pile" },
  { id: "roof_tile_debris_pile", displayName: "Roof Tile Debris Pile" },
  { id: "chimney_pot_and_bricks", displayName: "Chimney Pot And Bricks" },
  { id: "boarded_window_frame", displayName: "Boarded Window Frame" },
  { id: "broken_door_boards", displayName: "Broken Door Boards" },
  { id: "grave_cairn_marker", displayName: "Grave Cairn Marker" },
  { id: "roadside_shrine_signpost", displayName: "Roadside Shrine Signpost" },
];

const defaultAtlases: PropAtlasSpec[] = [
  {
    sourcePath: path.resolve("public/overworld/generated/oblique/source/prop_atlas_raw.png"),
    outDir: path.resolve("public/overworld/generated/oblique/prop"),
    manifestPath: path.resolve("public/overworld/generated/oblique/prop_manifest.json"),
    contactSheetPath: path.resolve("public/overworld/generated/oblique/prop_contact_sheet.png"),
    props: primaryProps,
  },
  {
    sourcePath: path.resolve("public/overworld/generated/oblique/source/prop_objects_atlas_raw.png"),
    outDir: path.resolve("public/overworld/generated/oblique/prop_objects"),
    manifestPath: path.resolve("public/overworld/generated/oblique/prop_objects_manifest.json"),
    contactSheetPath: path.resolve("public/overworld/generated/oblique/prop_objects_contact_sheet.png"),
    props: objectPassProps,
  },
  {
    sourcePath: path.resolve("public/overworld/generated/oblique/source/prop_exterior_atlas_raw.png"),
    outDir: path.resolve("public/overworld/generated/oblique/prop_exterior"),
    manifestPath: path.resolve("public/overworld/generated/oblique/prop_exterior_manifest.json"),
    contactSheetPath: path.resolve("public/overworld/generated/oblique/prop_exterior_contact_sheet.png"),
    props: exteriorProps,
  },
];

const atlases: PropAtlasSpec[] = process.argv[2]
  ? [
      {
        sourcePath: path.resolve(process.argv[2]),
        outDir: path.resolve(process.argv[3] || "public/overworld/generated/oblique/prop"),
        manifestPath: path.resolve(process.argv[4] || "public/overworld/generated/oblique/prop_manifest.json"),
        contactSheetPath: path.resolve(process.argv[5] || "public/overworld/generated/oblique/prop_contact_sheet.png"),
        props: primaryProps,
      },
    ]
  : defaultAtlases;

const pixelOffset = (width: number, x: number, y: number) => (y * width + x) * 4;

const isBackground = (data: Buffer, width: number, x: number, y: number) => {
  const i = pixelOffset(width, x, y);
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a === 0) return false;
  const magentaKey = r > 220 && g < 80 && b > 220;
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
  const purpleHalo = r > 85 && b > 95 && g < 92 && Math.max(r, b) - g > 45;
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
        if (!isChromaFringe(data, offset)) continue;
        if (!hasTransparentNeighbor(data, width, height, x, y)) continue;
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
      if (!(r > 230 && b > 230 && g < 105)) continue;
      data[offset + 3] = 0;
      removed += 1;
    }
  }
  return removed;
};

const clearBackgroundishBorders = (data: Buffer, width: number, height: number) => {
  let removed = 0;
  const clearIfBackground = (x: number, y: number) => {
    const offset = pixelOffset(width, x, y);
    if (data[offset + 3] === 0) return;
    if (!isChromaFringe(data, offset) && !isBackground(data, width, x, y)) return;
    data[offset + 3] = 0;
    removed += 1;
  };
  for (let x = 0; x < width; x += 1) {
    clearIfBackground(x, 0);
    clearIfBackground(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    clearIfBackground(0, y);
    clearIfBackground(width - 1, y);
  }
  return removed;
};

const clearOuterBorder = (data: Buffer, width: number, height: number, pixels = 8) => {
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

const renderContactSheet = async (outputs: { path: string }[], contactSheetPath: string) => {
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

const extractAtlas = async (atlas: PropAtlasSpec) => {
  await fs.mkdir(atlas.outDir, { recursive: true });
  const metadata = await sharp(atlas.sourcePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read atlas dimensions: ${atlas.sourcePath}`);
  }
  const outputs: { id: string; path: string }[] = [];
  const manifest = [];

  for (let index = 0; index < atlas.props.length; index += 1) {
    const spec = atlas.props[index];
    const col = index % 4;
    const row = Math.floor(index / 4);
    const left = Math.round((metadata.width * col) / 4);
    const top = Math.round((metadata.height * row) / 4);
    const right = Math.round((metadata.width * (col + 1)) / 4);
    const bottom = Math.round((metadata.height * (row + 1)) / 4);
    const width = right - left;
    const height = bottom - top;
    const { data, info } = await sharp(atlas.sourcePath)
      .ensureAlpha()
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = Buffer.from(data);
    const removedBackgroundPixels = removeConnectedBackground(raw, info.width, info.height);
    const removedFringePixels =
      removeGlobalKeyMagenta(raw, info.width, info.height) +
      removeChromaFringe(raw, info.width, info.height) +
      clearBackgroundishBorders(raw, info.width, info.height) +
      clearOuterBorder(raw, info.width, info.height);
    const bounds = alphaBounds(raw, info.width, info.height);
    if (!bounds) throw new Error(`Prop ${spec.id} had no visible pixels after background cleanup`);
    const outPath = path.join(atlas.outDir, `${spec.id}.png`);
    await sharp(raw, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(outPath);
    outputs.push({ id: spec.id, path: outPath });
    manifest.push({
      id: spec.id,
      displayName: spec.displayName,
      spriteId: `oblique_prop_${spec.id}`,
      url: `/overworld/generated/oblique/${path.basename(atlas.outDir)}/${spec.id}.png`,
      sourceCell: { row, col },
      sourceBounds: { left, top, width, height },
      output: { width: info.width, height: info.height },
      visibleBounds: bounds,
      removedBackgroundPixels,
      removedFringePixels,
    });
  }

  await fs.writeFile(
    atlas.manifestPath,
    `${JSON.stringify(
      {
        schema: "crpg_oblique_prop_manifest_v1",
        source: `/overworld/generated/oblique/source/${path.basename(atlas.sourcePath)}`,
        projection: "square_grid_front_top_object_cutouts",
        alphaCleanup: "border-connected magenta/white background removed",
        tiles: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await renderContactSheet(outputs, atlas.contactSheetPath);

  console.log(`Extracted ${outputs.length} oblique prop sprites`);
  console.log(`Manifest: ${path.relative(process.cwd(), atlas.manifestPath)}`);
  console.log(`Contact sheet: ${path.relative(process.cwd(), atlas.contactSheetPath)}`);
  manifest.forEach((prop) => {
    console.log(
      `${prop.id.padEnd(24)} ${prop.output.width}x${prop.output.height} ` +
        `visible=${prop.visibleBounds.width}x${prop.visibleBounds.height} ` +
        `removed=${String(prop.removedBackgroundPixels).padStart(5)} ` +
        `fringe=${String(prop.removedFringePixels).padStart(4)}`,
    );
  });
};

const main = async () => {
  for (const atlas of atlases) {
    await extractAtlas(atlas);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
