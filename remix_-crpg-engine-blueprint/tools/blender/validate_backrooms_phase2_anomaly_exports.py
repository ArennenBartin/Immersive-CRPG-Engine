"""Round-trip QA for the shipped Phase 2 Backrooms anomaly GLBs."""

from __future__ import annotations

import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


PROJECT_ROOT = Path("/Users/brennenarotin/Desktop/Backrooms Crpg Engine/remix_-crpg-engine-blueprint")
ASSET_DIR = PROJECT_ROOT / "public/models/environment/backrooms/anomalies"
MANIFEST_PATH = ASSET_DIR / "manifest.json"
REPORT_PATH = ASSET_DIR / "export-validation.json"
SOURCE_BLEND = PROJECT_ROOT / "assets/blender/backrooms-anomalies/backrooms-phase2-anomaly-kit.blend"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def inspect_glb(path: Path) -> dict[str, object]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    boundary_edges = 0
    corners: list[Vector] = []
    materials: set[str] = set()
    missing_uv: list[str] = []
    unapplied_scale: list[str] = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        materials.update(material.name for material in obj.data.materials if material)
        if not obj.data.uv_layers:
            missing_uv.append(obj.name)
        if any(abs(value - 1.0) > 0.001 for value in obj.scale):
            unapplied_scale.append(obj.name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        # glTF splits vertices at UV and hard-normal seams. Re-weld coincident
        # positions before judging manifold closure or every exported triangle
        # edge would appear open even though the rendered shell is sealed.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
        boundary_edges += sum(1 for edge in bm.edges if not edge.is_manifold)
        bm.free()
    mins = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maxs = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    bounds = maxs - mins
    return {
        "mesh_count": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "bounds_blender": [round(value, 4) for value in bounds],
        "min_blender": [round(value, 4) for value in mins],
        "max_blender": [round(value, 4) for value in maxs],
        "materials": sorted(materials),
        "boundary_edges": boundary_edges,
        "missing_uv": missing_uv,
        "unapplied_scale": unapplied_scale,
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
        checks.append({
            "id": expected["id"],
            "filename": expected["filename"],
            "glb_magic": magic.decode("ascii", errors="replace"),
            "expected": {
                key: expected[key]
                for key in ("mesh_count", "vertices", "triangles", "bounds_blender", "materials", "bytes")
            },
            "actual": actual,
        })
        if magic != b"glTF":
            failures.append(f"{expected['id']}: invalid GLB magic {magic!r}")
        # Vertex counts legitimately expand at glTF UV/normal seams. Meshes,
        # triangles, materials, bytes, and bounds are the stable round-trip
        # contract for these static assets.
        for key in ("mesh_count", "triangles", "materials", "bytes"):
            if actual[key] != expected[key]:
                failures.append(f"{expected['id']}: {key} expected {expected[key]!r}, got {actual[key]!r}")
        if any(abs(float(a) - float(b)) > 0.002 for a, b in zip(actual["bounds_blender"], expected["bounds_blender"])):
            failures.append(f"{expected['id']}: bounds expected {expected['bounds_blender']}, got {actual['bounds_blender']}")
        if actual["boundary_edges"] != 0:
            failures.append(f"{expected['id']}: {actual['boundary_edges']} open/non-manifold edges could leak through clipping")
        if actual["missing_uv"]:
            failures.append(f"{expected['id']}: meshes missing UVs {actual['missing_uv']}")
        if actual["unapplied_scale"]:
            failures.append(f"{expected['id']}: unapplied scale {actual['unapplied_scale']}")
        if abs(float(actual["min_blender"][2])) > 0.003:
            failures.append(f"{expected['id']}: lowest point is not grounded at Z=0")

    report = {
        "status": "PASS" if not failures else "FAIL",
        "asset_count": len(checks),
        "checks": checks,
        "failures": failures,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "asset_count": len(checks),
        "failures": failures,
    }, indent=2))
    if failures:
        raise RuntimeError("Backrooms Phase 2 GLB validation failed")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))


if __name__ == "__main__":
    main()
