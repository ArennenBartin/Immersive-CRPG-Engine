# Phase 0-1 Art Bible and Asset Manifest

Status: Phase 0 and Phase 1 source library are installed and audit-backed. The active terrain floor skin is now the generated oblique terrain atlas described in `OBLIQUE_TERRAIN_TILE_PIPELINE.md`; this document remains the fallback pixel-library manifest and object/entity standard.

## Phase 0 Standard

- Source tile size: 16x16 px.
- Renderer rule: integer scale only; no smoothing.
- Style for this fallback/source library: flat top-down pixel sprites, silhouette first, limited palette, no gradients or alpha-blended shading.
- Void rule: pure #000000 is reserved for void/fog/out-of-sight. The audit allows it only on the dedicated void tile and generated contact-sheet background.
- Grid/Glass rule: glow colors are reserved for Grid, Glass, fracture, and dark-light assets.

Reference sheet: /overworld/phase0_style_reference.png

## Palette

Palette file: /overworld/overworld_palette.json

The locked palette contains 32 colors including reserved void black.

## Phase 1 Manifest

Manifest file: /overworld/overworld_asset_manifest.json
Contact sheet: /overworld/phase1_contact_sheet.png

| Category | Count |
|---|---:|
| Terrain tiles | 43 |
| Interactive/object sprites | 38 |
| Actor/entity definitions | 38 |
| Player facing frames | 8 |
| Player state overlays | 3 |
| Total sprite records | 396 |

## Exit Criteria

- Palette file exists.
- Tile size is fixed at 16x16.
- Style reference sheet exists with one terrain tile, one story object, one NPC, and one enemy.
- Every Phase 1 tile, object, entity, and player overlay has a 16x16 sprite record.
- Every non-transparent sprite pixel is in the locked palette.
- Pure black is not used inside ordinary sprites.
- Entity sprite sets include north/south/east/west idle and step frames.
- The generated contact sheet shows the complete library on black.

Run `npm run audit:overworld-assets` before any Phase 3 geography work.

Run `npm run art:extract-oblique-tiles` after replacing the generated terrain atlas.
Run `npm run art:extract-oblique-structures` after replacing the generated square-faced wall/door atlas.
Run `npm run art:extract-oblique-barriers` after replacing the generated barrier/aperture atlas.
Run `npm run art:extract-oblique-props` after replacing any generated prop atlas.
Run `npm run art:extract-player` after replacing the generated Intercessor player atlas.
