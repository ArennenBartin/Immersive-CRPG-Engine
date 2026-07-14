import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  OVERWORLD_ART_ERRORS,
  OVERWORLD_ASSET_MANIFEST,
  OVERWORLD_CONTACT_SHEET_SCALE,
  OVERWORLD_PALETTE,
  OVERWORLD_PALETTE_HEX,
  OVERWORLD_SPRITES,
  OVERWORLD_STYLE_REFERENCE_SPRITE_IDS,
  OVERWORLD_TILE_SIZE,
  OVERWORLD_VOID_HEX,
  getOverworldAssetSummary,
} from "../src/data/overworldAssets";
import type { SpriteData } from "../src/schema/game";

type Issue = {
  severity: "error" | "warning";
  scope: string;
  code: string;
  message: string;
};

const issues: Issue[] = [];
const addIssue = (severity: Issue["severity"], scope: string, code: string, message: string) => {
  issues.push({ severity, scope, code, message });
};

const outDir = path.join(process.cwd(), "public", "overworld");
const artDocPath = path.join(process.cwd(), "docs", "overworld", "PHASE_0_1_ART_BIBLE_AND_ASSET_MANIFEST.md");

const normalizeColor = (color: string) => color.trim().toUpperCase();

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
};

const paintSprite = (
  target: Buffer,
  sheetWidth: number,
  sprite: SpriteData,
  x0: number,
  y0: number,
  scale: number,
) => {
  for (let y = 0; y < OVERWORLD_TILE_SIZE; y += 1) {
    for (let x = 0; x < OVERWORLD_TILE_SIZE; x += 1) {
      const color = sprite.pixels[y * OVERWORLD_TILE_SIZE + x];
      if (!color || color === "transparent") continue;
      const [r, g, b] = hexToRgb(color);
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const px = x0 + x * scale + sx;
          const py = y0 + y * scale + sy;
          const index = (py * sheetWidth + px) * 4;
          target[index] = r;
          target[index + 1] = g;
          target[index + 2] = b;
          target[index + 3] = 255;
        }
      }
    }
  }
};

const renderSheet = async (
  sprites: SpriteData[],
  outPath: string,
  columns: number,
  scale = OVERWORLD_CONTACT_SHEET_SCALE,
) => {
  const tile = OVERWORLD_TILE_SIZE * scale;
  const pad = 4;
  const rows = Math.ceil(sprites.length / columns);
  const width = columns * (tile + pad) + pad;
  const height = rows * (tile + pad) + pad;
  const buffer = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 0;
    buffer[i + 1] = 0;
    buffer[i + 2] = 0;
    buffer[i + 3] = 255;
  }
  for (let i = 0; i < sprites.length; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = pad + col * (tile + pad);
    const y = pad + row * (tile + pad);
    paintSprite(buffer, width, sprites[i], x, y, scale);
  }
  await sharp(buffer, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
};

const spriteById = new Map(OVERWORLD_SPRITES.map((sprite) => [sprite.id, sprite]));
const paletteColors = new Set(OVERWORLD_PALETTE.map((entry) => normalizeColor(entry.hex)));

const auditPalette = () => {
  if (OVERWORLD_TILE_SIZE !== 16) {
    addIssue("error", "phase0", "wrong_tile_size", `Expected 16, got ${OVERWORLD_TILE_SIZE}`);
  }
  if (OVERWORLD_PALETTE.length < 24 || OVERWORLD_PALETTE.length > 32) {
    addIssue("error", "phase0", "palette_size", `Palette has ${OVERWORLD_PALETTE.length} colors, expected 24-32`);
  }
  if (OVERWORLD_PALETTE_HEX.void !== OVERWORLD_VOID_HEX) {
    addIssue("error", "phase0", "void_color", "Palette void must be #000000");
  }
};

const auditSprites = () => {
  const seen = new Set<string>();
  for (const sprite of OVERWORLD_SPRITES) {
    if (seen.has(sprite.id)) addIssue("error", sprite.id, "duplicate_sprite", "Duplicate sprite id");
    seen.add(sprite.id);
    if (sprite.width !== 16 || sprite.height !== 16) {
      addIssue("error", sprite.id, "sprite_size", `Sprite is ${sprite.width}x${sprite.height}, expected 16x16`);
    }
    if (sprite.pixels.length !== 256) {
      addIssue("error", sprite.id, "pixel_count", `Sprite has ${sprite.pixels.length} pixels, expected 256`);
    }
    for (const color of sprite.pixels) {
      if (!color || color === "transparent") continue;
      const normalized = normalizeColor(color);
      if (!paletteColors.has(normalized)) {
        addIssue("error", sprite.id, "off_palette_color", `${color} is not in the overworld palette`);
      }
      if (normalized === normalizeColor(OVERWORLD_VOID_HEX) && sprite.id !== "ovr_tile_void") {
        addIssue("error", sprite.id, "illegal_void_black", "Pure #000000 is reserved for the void tile/contact-sheet background only");
      }
    }
  }
};

const auditManifestRefs = () => {
  const manifest = OVERWORLD_ASSET_MANIFEST;
  for (const tile of manifest.tiles) {
    if (!spriteById.has(tile.spriteId)) addIssue("error", tile.id, "missing_tile_sprite", tile.spriteId);
  }
  for (const object of manifest.objects) {
    if (!spriteById.has(object.spriteId)) addIssue("error", object.id, "missing_object_sprite", object.spriteId);
  }
  for (const entity of manifest.entities) {
    for (const direction of ["north", "south", "east", "west"] as const) {
      for (const frame of ["idle", "step"] as const) {
        const id = entity.sprites[direction]?.[frame];
        if (!id || !spriteById.has(id)) {
          addIssue("error", entity.id, "missing_entity_sprite", `${direction}/${frame}: ${id || "missing"}`);
        }
      }
    }
    if (!entity.archetype || !entity.schedule) {
      addIssue("error", entity.id, "entity_metadata", "Entity needs archetype and schedule");
    }
  }
  for (const id of Object.values(manifest.player.overlays)) {
    if (!spriteById.has(id)) addIssue("error", "player", "missing_overlay_sprite", id);
  }
  for (const id of OVERWORLD_STYLE_REFERENCE_SPRITE_IDS) {
    if (!spriteById.has(id)) addIssue("error", "phase0", "missing_style_reference_sprite", id);
  }

  const transitionCount = manifest.tiles.filter((tile) => tile.group === "transitions").length;
  if (transitionCount < 6) {
    addIssue("error", "phase1.tiles", "missing_transitions", `Expected at least 6 transition tiles, got ${transitionCount}`);
  }
  const wildProfiles = manifest.tiles.filter((tile) => tile.group === "wilds");
  if (wildProfiles.length < 8) {
    addIssue("error", "phase1.tiles", "missing_wild_tiles", `Expected at least 8 wild terrain tiles, got ${wildProfiles.length}`);
  }
  if (manifest.objects.length < 38) {
    addIssue("error", "phase1.objects", "missing_objects", `Expected at least 38 object assets, got ${manifest.objects.length}`);
  }
  if (manifest.entities.length < 38) {
    addIssue("error", "phase1.entities", "missing_entities", `Expected at least 38 entity assets, got ${manifest.entities.length}`);
  }
};

const writeArtifacts = async () => {
  await fs.mkdir(outDir, { recursive: true });
  const referenceSprites = OVERWORLD_STYLE_REFERENCE_SPRITE_IDS.map((id) => spriteById.get(id)).filter(Boolean) as SpriteData[];
  await renderSheet(referenceSprites, path.join(outDir, "phase0_style_reference.png"), 4, 8);
  await renderSheet(OVERWORLD_SPRITES, path.join(outDir, "phase1_contact_sheet.png"), 16, 4);
  await fs.writeFile(
    path.join(outDir, "overworld_palette.json"),
    `${JSON.stringify(OVERWORLD_PALETTE, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(outDir, "overworld_asset_manifest.json"),
    `${JSON.stringify(OVERWORLD_ASSET_MANIFEST, null, 2)}\n`,
    "utf8",
  );
};

const writeArtBible = async () => {
  const summary = getOverworldAssetSummary();
  const doc = `# Phase 0-1 Art Bible and Asset Manifest

Status: Phase 0 and Phase 1 source library are installed and audit-backed. The active terrain floor skin is now the generated oblique terrain atlas described in \`OBLIQUE_TERRAIN_TILE_PIPELINE.md\`; this document remains the fallback pixel-library manifest and object/entity standard.

## Phase 0 Standard

- Source tile size: 16x16 px.
- Renderer rule: integer scale only; no smoothing.
- Style for this fallback/source library: flat top-down pixel sprites, silhouette first, limited palette, no gradients or alpha-blended shading.
- Void rule: pure #000000 is reserved for void/fog/out-of-sight. The audit allows it only on the dedicated void tile and generated contact-sheet background.
- Grid/Glass rule: glow colors are reserved for Grid, Glass, fracture, and dark-light assets.

Reference sheet: /overworld/phase0_style_reference.png

## Palette

Palette file: /overworld/overworld_palette.json

The locked palette contains ${summary.paletteColors} colors including reserved void black.

## Phase 1 Manifest

Manifest file: /overworld/overworld_asset_manifest.json
Contact sheet: /overworld/phase1_contact_sheet.png

| Category | Count |
|---|---:|
| Terrain tiles | ${summary.tiles} |
| Interactive/object sprites | ${summary.objects} |
| Actor/entity definitions | ${summary.entities} |
| Player facing frames | ${summary.playerSpriteFrames} |
| Player state overlays | ${summary.overlaySprites} |
| Total sprite records | ${summary.sprites} |

## Exit Criteria

- Palette file exists.
- Tile size is fixed at 16x16.
- Style reference sheet exists with one terrain tile, one story object, one NPC, and one enemy.
- Every Phase 1 tile, object, entity, and player overlay has a 16x16 sprite record.
- Every non-transparent sprite pixel is in the locked palette.
- Pure black is not used inside ordinary sprites.
- Entity sprite sets include north/south/east/west idle and step frames.
- The generated contact sheet shows the complete library on black.

Run \`npm run audit:overworld-assets\` before any Phase 3 geography work.

Run \`npm run art:extract-oblique-tiles\` after replacing the generated terrain atlas.
Run \`npm run art:extract-oblique-structures\` after replacing the generated square-faced wall/door atlas.
Run \`npm run art:extract-oblique-barriers\` after replacing the generated barrier/aperture atlas.
Run \`npm run art:extract-oblique-props\` after replacing any generated prop atlas.
Run \`npm run art:extract-player\` after replacing the generated Intercessor player atlas.
`;
  await fs.mkdir(path.dirname(artDocPath), { recursive: true });
  await fs.writeFile(artDocPath, doc, "utf8");
};

for (const message of OVERWORLD_ART_ERRORS) {
  addIssue("error", "hand_art", "art_authoring", message);
}
auditPalette();
auditSprites();
auditManifestRefs();

const errors = issues.filter((issue) => issue.severity === "error");
if (errors.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.severity.toUpperCase()} ${issue.scope} ${issue.code}: ${issue.message}`);
  }
  process.exit(1);
}

await writeArtifacts();
await writeArtBible();

const summary = getOverworldAssetSummary();
console.log("overworld-assets: audit passed");
console.log(
  `overworld-assets: ${summary.paletteColors} palette colors, ${summary.tiles} tiles, ${summary.objects} objects, ${summary.entities} entities, ${summary.sprites} sprites`,
);
console.log("overworld-assets: wrote public/overworld/phase0_style_reference.png");
console.log("overworld-assets: wrote public/overworld/phase1_contact_sheet.png");
console.log("overworld-assets: wrote docs/overworld/PHASE_0_1_ART_BIBLE_AND_ASSET_MANIFEST.md");
