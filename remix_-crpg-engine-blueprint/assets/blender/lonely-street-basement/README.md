# Lonely Street Basement Kit

This kit recreates Riley's basement as a modular, engine-ready environment rather than a single baked room. The reference composition is a low-ceiling timber basement with a concrete floor, drums at left, laundry/storage at the rear, and a full stair run at right. Warm practical bulbs provide the authored lighting; the map deliberately disables generic room lights.

## Deliverables

- `lonely-street-basement-kit.blend` — editable source scene with named asset roots and organized collections.
- `public/models/environment/lonely-street-basement/*.glb` — 18 individually placeable runtime assets.
- `public/models/environment/lonely-street-basement/lonely-street-basement-staged.glb` — review-only staged scene; the engine does not load this aggregate.
- `public/models/environment/lonely-street-basement/manifest.json` — placement, bounds, materials, triangle counts, and byte sizes.
- `public/models/environment/lonely-street-basement/export-validation.json` — clean re-import QA report.
- `public/models/environment/lonely-street-basement/lonely-street-basement-preview.png` — Blender look-development preview.

The runtime kit contains a shell, staircase, stair door, drum kit and stool, washer, dryer, refrigerator, shelf, basket, detergents, boxes, paint cans, pipes, poster, debris, bare bulb, and stair sconce. The concrete walk surface remains an engine-native tile so movement, footsteps, and map editing stay grid-correct.

## Coordinate contract

- Blender source uses meters and Z-up.
- glTF/Three uses Y-up; Blender +Y becomes engine -Z.
- Each exported asset preserves its authored local origin. Engine metadata measures the shipped GLB, converts its bounds, and applies a center-floor offset.
- Map placement uses macro cells plus one-third-meter `fine_offset` corrections.
- Solid props use fitted odd-cell collision footprints. The room shell uses a boundary ring, and decorative clutter/lights are non-blocking.

## Rebuild and validate

Run from the repository root:

```sh
"/Users/brennenarotin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender" --background --python tools/blender/build_lonely_street_basement.py
"/Users/brennenarotin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender" --background --python tools/blender/validate_lonely_street_basement_exports.py
npm run test:collision-fit
npm run test:suite
npm run typecheck
```

The binary contract test reads every shipped GLB directly and checks the glTF 2 header, embedded resources, file size, geometry/material/texture statistics, transformed bounds, and engine center-floor offset. The suite also verifies connected walkable cells, authored practical lights, reciprocal stair routes, exact transition spawns, and non-destructive save hydration.

## Runtime integration

The map ID is `qa_lonely_street_house_basement`. The house stair cell routes to the clear floor beside the staircase; the basement landing routes back beside the house stairs. Existing authored maps and same-ID objects are preserved during workspace hydration, and an incompatible custom house/basement never receives a dangling bundled route.
