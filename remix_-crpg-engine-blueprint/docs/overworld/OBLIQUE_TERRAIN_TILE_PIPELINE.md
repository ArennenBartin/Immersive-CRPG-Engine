# Oblique Terrain Tile Pipeline

Status: Active terrain, square-faced structure, barrier/aperture, and prop skin for the overworld/building tile layer.

The original Phase 0-1 overworld pixel library remains installed as the fallback manifest and entity source library. The active floor skin is generated bitmap art: oblique projection tiles with top and front faces visible, sketchy painted/Da Vinci-notebook texture, no labels, and no baked backgrounds. Structure and barrier tiles follow the corrected square-face rule: axis-aligned top face plus axis-aligned front face only, no perspective taper, no isometric side faces. Prop sprites are transparent cutouts using the same square-grid front/top cabinet projection where possible.

## Runtime Contract

- One oblique terrain PNG still represents one logical grid cell.
- The simulation grid remains square `x/z`; collision, fog, LOS, pathfinding, chemistry, and exits do not become oblique.
- Terrain sprite ids use the `oblique_tile_*` prefix; structure sprite ids use the `oblique_structure_*` prefix; barrier/aperture sprite ids use the `oblique_barrier_*` prefix; prop ids use the `oblique_prop_*` prefix; generated player ids use the `generated_player_*` prefix.
- The renderer may smooth-scale only generated oblique terrain/structure sprites. Pixel sprites and entity/object sprites remain crisp.
- Oblique terrain draws slightly taller than one grid cell and rows are painted north-to-south, allowing the next row's top face to hide interior front lips while exposed lower edges keep the front face.
- Structure wall/door tiles are full-cell square-faced textures, not standalone props, icons, or isometric blocks.
- Barrier/aperture tiles are buildable fences, gates, windows, screens, grates, brambles, rubble, and Glass growth. They are not floors, roofs, or map symbols.
- Prop sprites are interactable object cutouts, not floors, roofs, walls, or map symbols. Chroma-key magenta backgrounds are removed into alpha. The prop set is split into systemic/story, interior/furniture, and exterior/nature/building-clutter atlases.
- Player sprites are 4-facing idle/step character cutouts. They are extracted from a raw generated atlas, chroma-keyed to alpha, and padded to square canvases so the one-cell renderer preserves the Intercessor silhouette without stretching.
- Generated white gutters are removed by connected-border alpha cleanup, not by hand editing.
- Each cropped terrain PNG is edge-conditioned so its outer left/right and top/bottom pixels match for looping.

## Source And Outputs

- Source atlas: `/public/overworld/generated/oblique/source/terrain_atlas_raw.png`
- Extracted terrain tiles: `/public/overworld/generated/oblique/terrain/*.png`
- Manifest: `/public/overworld/generated/oblique/terrain_manifest.json`
- Contact sheet: `/public/overworld/generated/oblique/terrain_contact_sheet.png`
- Structure source atlas: `/public/overworld/generated/oblique/source/structure_atlas_raw.png`
- Extracted structure tiles: `/public/overworld/generated/oblique/structure/*.png`
- Structure manifest: `/public/overworld/generated/oblique/structure_manifest.json`
- Structure contact sheet: `/public/overworld/generated/oblique/structure_contact_sheet.png`
- Barrier source atlas: `/public/overworld/generated/oblique/source/barrier_atlas_raw.png`
- Extracted barrier tiles: `/public/overworld/generated/oblique/barrier/*.png`
- Barrier manifest: `/public/overworld/generated/oblique/barrier_manifest.json`
- Barrier contact sheet: `/public/overworld/generated/oblique/barrier_contact_sheet.png`
- Prop source atlas: `/public/overworld/generated/oblique/source/prop_atlas_raw.png`
- Extracted prop sprites: `/public/overworld/generated/oblique/prop/*.png`
- Prop manifest: `/public/overworld/generated/oblique/prop_manifest.json`
- Prop contact sheet: `/public/overworld/generated/oblique/prop_contact_sheet.png`
- Object-pass prop source atlas: `/public/overworld/generated/oblique/source/prop_objects_atlas_raw.png`
- Extracted object-pass prop sprites: `/public/overworld/generated/oblique/prop_objects/*.png`
- Object-pass prop manifest: `/public/overworld/generated/oblique/prop_objects_manifest.json`
- Object-pass prop contact sheet: `/public/overworld/generated/oblique/prop_objects_contact_sheet.png`
- Exterior prop source atlas: `/public/overworld/generated/oblique/source/prop_exterior_atlas_raw.png`
- Extracted exterior prop sprites: `/public/overworld/generated/oblique/prop_exterior/*.png`
- Exterior prop manifest: `/public/overworld/generated/oblique/prop_exterior_manifest.json`
- Exterior prop contact sheet: `/public/overworld/generated/oblique/prop_exterior_contact_sheet.png`
- Player design reference: `/public/sprites/player-pilgrim.png`
- Player source atlas: `/public/overworld/generated/oblique/source/player_intercessor_atlas_raw.png`
- Extracted player sprites: `/public/overworld/generated/player/intercessor/*.png`
- Player manifest: `/public/overworld/generated/player/intercessor_manifest.json`
- Player contact sheet: `/public/overworld/generated/player/intercessor_contact_sheet.png`

Regenerate the cropped tiles with:

```bash
npm run art:extract-oblique-tiles
npm run art:extract-oblique-structures
npm run art:extract-oblique-barriers
npm run art:extract-oblique-props
npm run art:extract-player
```

The oblique tile extractors record source bounds, trimmed bounds, removed gutter pixels, and loop-edge deltas for every tile. The player extractor records source bounds, trimmed bounds, output canvas size, and removed background/fringe pixels for every directional frame.

## Current Object Bindings

| Object id | Oblique tile |
|---|---|
| `obj_world_water` | `oblique_tile_standing_water` |
| `obj_world_coast` | `oblique_tile_sand` |
| `obj_world_plains` | `oblique_tile_grass` |
| `obj_world_hills` | `oblique_tile_moss` |
| `obj_world_forest` | `oblique_tile_dense_brush` |
| `obj_world_marsh` | `oblique_tile_fen_reed` |
| `obj_world_road` | `oblique_tile_dirt_path` |
| `obj_world_scar` | `oblique_tile_fractured_ground` |
| `obj_wall_block` | `oblique_structure_rough_fieldstone_wall` |
| `obj_wall_stone` | `oblique_structure_dressed_ashlar_wall` |
| `obj_wall_brick` | `oblique_structure_red_brick_wall` |
| `obj_p_door` | `oblique_structure_simple_wooden_door` |
| `obj_bush` | `oblique_barrier_thorn_hedge` |
| `obj_crate` | `oblique_prop_wooden_supply_crate` |
| `obj_chest` | `oblique_prop_iron_banded_chest` |
| `obj_terminal` | `oblique_prop_info_terminal` |
| `obj_training_beacon` | `oblique_prop_training_beacon` |
| `obj_dead_tree` | `oblique_prop_dead_tree_trunk` |
| `obj_bed` | `oblique_prop_simple_wooden_bed` |
| `obj_bedroll` | `oblique_prop_straw_bedroll` |
| `obj_chair` | `oblique_prop_wooden_chair` |
| `obj_small_table` | `oblique_prop_small_square_table` |
| `obj_bookshelf` | `oblique_prop_tall_bookshelf` |
| `obj_oil_lamp` | `oblique_prop_standing_oil_lamp` |
| `obj_well` | `oblique_prop_stone_well` |
| `obj_rubble_pile` | `oblique_prop_rubble_pile` |
| `obj_ladder` | `oblique_prop_wooden_ladder` |
| `obj_shop_counter` | `oblique_prop_shop_counter` |
| `obj_mechanism_workbench` | `oblique_prop_mechanism_workbench` |
| `obj_stone_altar` | `oblique_prop_stone_altar` |
| `obj_cupboard` | `oblique_prop_wooden_cupboard` |
| `obj_iron_stove` | `oblique_prop_iron_stove` |
| `obj_broken_statue` | `oblique_prop_broken_statue_fragment` |
| `obj_floor_hatch` | `oblique_prop_metal_floor_hatch` |
| `obj_tree` | `oblique_prop_wind_bent_young_tree` |
| `obj_wind_bent_tree` | `oblique_prop_wind_bent_young_tree` |
| `obj_fallen_log` | `oblique_prop_fallen_log` |
| `obj_mossy_boulders` | `oblique_prop_mossy_boulder_cluster` |
| `obj_thorn_bramble` | `oblique_prop_thorn_bramble_clump` |
| `obj_reed_clump` | `oblique_prop_tall_reed_clump` |
| `obj_firewood_pile` | `oblique_prop_stacked_firewood_pile` |
| `obj_hay_bales` | `oblique_prop_hay_bale_stack` |
| `obj_rain_barrel` | `oblique_prop_rain_barrel` |
| `obj_broken_field_fence` | `oblique_prop_broken_field_fence` |
| `obj_plank_pile` | `oblique_prop_loose_timber_plank_pile` |
| `obj_roof_tile_debris` | `oblique_prop_roof_tile_debris_pile` |
| `obj_chimney_bricks` | `oblique_prop_chimney_pot_and_bricks` |
| `obj_boarded_window_frame` | `oblique_prop_boarded_window_frame` |
| `obj_broken_door_boards` | `oblique_prop_broken_door_boards` |
| `obj_grave_cairn_marker` | `oblique_prop_grave_cairn_marker` |
| `obj_roadside_shrine` | `oblique_prop_roadside_shrine_signpost` |

These bindings are engine-owned. Existing packages that still point the overworld floor objects at the older `ovr_tile_*` sprites are migrated to the oblique sprites during package backfill.
