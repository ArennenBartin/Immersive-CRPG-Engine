# Backrooms Level 0 Anomaly Kit

Production source and exports for generator Phase 7.

## Source and review

- `backrooms-anomaly-kit.blend` — editable meter-scale Blender source.
- `public/models/environment/backrooms/anomalies/backrooms-anomaly-kit-review.glb` — staged review scene.
- `public/models/environment/backrooms/anomalies/backrooms-anomaly-kit-preview.png` — fluorescent-lit review render.
- `public/models/environment/backrooms/anomalies/manifest.json` — measured bounds, axes, pivots, collision policy, material and triangle budgets.
- `public/models/environment/backrooms/anomalies/export-validation.json` — round-trip GLB validation.

## Coordinate contract

- Blender up: `+Z`
- Blender front: `-Y`
- Engine up: `+Y`
- Engine front: `+Z`
- Units: meters
- Asset origin: center/floor contact; wall, ceiling, and partition anchors are declared per manifest entry.

## Runtime contract

The GLBs contain no collision proxies. Generator placement metadata owns collision. In the manifest, `runtime_placement_metadata` means an ordinary furniture placement may inherit its ObjectData footprint, while `collision_mode_none` records the dedicated anomaly assets' non-blocking runtime contract. Decorative and embedded placements use the engine-supported `collision_mode: "none"`; recursive chains may allow only their first ordinary furniture copy to inherit collision. Complex clipped modules include their local opaque backing geometry so the visible intersection cannot expose open backs or z-fight with a runtime wall.

Rebuild and validate through Blender:

1. `tools/blender/build_backrooms_anomaly_kit.py`
2. `tools/blender/validate_backrooms_anomaly_exports.py`
