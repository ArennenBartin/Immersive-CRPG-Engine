"""Re-import every basement GLB and verify its shipped geometry/metadata."""

from __future__ import annotations

import json
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path("/Users/brennenarotin/Desktop/Backrooms Crpg Engine/remix_-crpg-engine-blueprint")
ASSET_DIR = PROJECT_ROOT / "public/models/environment/lonely-street-basement"
MANIFEST_PATH = ASSET_DIR / "manifest.json"
REPORT_PATH = ASSET_DIR / "export-validation.json"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)


def inspect_glb(path: Path) -> dict[str, object]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    triangles = 0
    corners: list[Vector] = []
    materials: set[str] = set()
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        materials.update(material.name for material in obj.data.materials if material)
    mins = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maxs = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    return {
        "mesh_count": len(meshes),
        "triangles": triangles,
        "bounds": [round(value, 4) for value in (maxs - mins)],
        "min": [round(value, 4) for value in mins],
        "max": [round(value, 4) for value in maxs],
        "materials": sorted(materials),
        "bytes": path.stat().st_size,
    }


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    checks: list[dict[str, object]] = []
    failures: list[str] = []
    for expected in manifest["assets"]:
        path = ASSET_DIR / expected["filename"]
        magic = path.read_bytes()[:4]
        actual = inspect_glb(path)
        check = {
            "id": expected["id"],
            "filename": expected["filename"],
            "glb_magic": magic.decode("ascii", errors="replace"),
            "expected": {
                key: expected[key]
                for key in ("mesh_count", "triangles", "bounds", "materials", "bytes")
            },
            "actual": actual,
        }
        checks.append(check)
        for key in ("mesh_count", "triangles", "materials", "bytes"):
            if actual[key] != expected[key]:
                failures.append(f"{expected['id']}: {key} expected {expected[key]!r}, got {actual[key]!r}")
        if magic != b"glTF":
            failures.append(f"{expected['id']}: invalid GLB magic {magic!r}")
        if any(abs(float(a) - float(b)) > 0.002 for a, b in zip(actual["bounds"], expected["bounds"])):
            failures.append(f"{expected['id']}: bounds mismatch expected {expected['bounds']}, got {actual['bounds']}")
    report = {
        "status": "PASS" if not failures else "FAIL",
        "asset_count": len(checks),
        "checks": checks,
        "failures": failures,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "asset_count": len(checks), "failures": failures}, indent=2))
    if failures:
        raise RuntimeError("Basement GLB validation failed")


if __name__ == "__main__":
    main()
