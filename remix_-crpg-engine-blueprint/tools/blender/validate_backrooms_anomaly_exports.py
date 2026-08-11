"""Round-trip validation for the production Phase 7 Backrooms anomaly kit."""

from __future__ import annotations

import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = PROJECT_ROOT / "public/models/environment/backrooms/anomalies"
MANIFEST_PATH = ASSET_DIR / "manifest.json"
REPORT_PATH = ASSET_DIR / "export-validation.json"
SOURCE_BLEND = PROJECT_ROOT / "assets/blender/backrooms-anomalies/backrooms-anomaly-kit.blend"
PREVIEW_PATH = ASSET_DIR / "backrooms-anomaly-kit-preview.png"
REVIEW_GLB_PATH = ASSET_DIR / "backrooms-anomaly-kit-review.glb"
COMPLEX_MODULES = {
    "backrooms_half_wall_bisected_desk",
    "backrooms_wall_clipped_filing_cabinet",
}
ORDINARY_FURNITURE = {
    "backrooms_office_desk",
    "backrooms_filing_cabinet",
}


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
    roots = [obj for obj in bpy.context.scene.objects if obj.type == "EMPTY" and obj.get("asset_id")]
    triangles = 0
    vertices = 0
    boundary_edges = 0
    corners: list[Vector] = []
    materials: set[str] = set()
    missing_uv: list[str] = []
    unapplied_scale: list[str] = []
    collision_meshes: list[str] = []
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
        if "COL" in obj.name.upper() or obj.get("collision"):
            collision_meshes.append(obj.name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
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
        "collision_meshes": collision_meshes,
        "root_extras": {
            key: roots[0].get(key)
            for key in (
                "asset_id",
                "anchor",
                "collision_policy",
                "opaque_backing",
                "penetration_ratio",
            )
            if roots and roots[0].get(key) is not None
        },
        "bytes": path.stat().st_size,
    }


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    checks: list[dict[str, object]] = []
    failures: list[str] = []
    contract = manifest.get("phase7_contract", {})
    expected_contract = {
        "glb_collision_meshes": "none",
        "runtime_collision_owner": "ObjectPlacementData.collision_mode",
        "embedded_collision_mode": "none",
    }
    for key, expected_value in expected_contract.items():
        if contract.get(key) != expected_value:
            failures.append(
                f"phase7_contract.{key}: expected {expected_value!r}, got {contract.get(key)!r}"
            )
    total_triangles = 0
    total_bytes = 0
    total_draw_calls = 0
    for expected in manifest["assets"]:
        path = ASSET_DIR / expected["filename"]
        if not path.exists():
            failures.append(f"{expected['id']}: missing {path.name}")
            continue
        magic = path.read_bytes()[:4]
        actual = inspect_glb(path)
        total_triangles += int(actual["triangles"])
        total_bytes += int(actual["bytes"])
        total_draw_calls += len(actual["materials"])
        checks.append({
            "id": expected["id"],
            "filename": expected["filename"],
            "glb_magic": magic.decode("ascii", errors="replace"),
            "expected": {
                key: expected[key]
                for key in (
                    "mesh_count",
                    "triangles",
                    "bounds_blender",
                    "materials",
                    "bytes",
                    "anchor",
                    "collision_policy",
                    "triangle_budget",
                )
            },
            "actual": actual,
        })
        if magic != b"glTF":
            failures.append(f"{expected['id']}: invalid GLB magic {magic!r}")
        for key in ("mesh_count", "triangles", "materials", "bytes"):
            if actual[key] != expected[key]:
                failures.append(f"{expected['id']}: {key} expected {expected[key]!r}, got {actual[key]!r}")
        if any(abs(float(a) - float(b)) > 0.002 for a, b in zip(actual["bounds_blender"], expected["bounds_blender"])):
            failures.append(f"{expected['id']}: bounds expected {expected['bounds_blender']}, got {actual['bounds_blender']}")
        if int(actual["triangles"]) > int(expected["triangle_budget"]):
            failures.append(f"{expected['id']}: triangle budget exceeded")
        if actual["boundary_edges"] != 0:
            failures.append(f"{expected['id']}: {actual['boundary_edges']} open/non-manifold edges")
        if actual["missing_uv"]:
            failures.append(f"{expected['id']}: meshes missing UVs {actual['missing_uv']}")
        if actual["unapplied_scale"]:
            failures.append(f"{expected['id']}: unapplied scale {actual['unapplied_scale']}")
        if actual["collision_meshes"]:
            failures.append(f"{expected['id']}: baked collision must stay out of decorative GLB {actual['collision_meshes']}")
        if abs(float(actual["min_blender"][2])) > 0.003:
            failures.append(f"{expected['id']}: lowest point is not grounded at Z=0")
        extras = actual["root_extras"]
        if extras.get("anchor") != expected["anchor"]:
            failures.append(f"{expected['id']}: anchor extra did not round-trip")
        if extras.get("collision_policy") != expected["collision_policy"]:
            failures.append(f"{expected['id']}: collision policy extra did not round-trip")
        supported_policy = (
            "runtime_placement_metadata"
            if expected["id"] in ORDINARY_FURNITURE
            else "collision_mode_none"
        )
        if expected["collision_policy"] != supported_policy:
            failures.append(
                f"{expected['id']}: unsupported collision policy "
                f"{expected['collision_policy']!r}; expected {supported_policy!r}"
            )
        if expected["id"] in COMPLEX_MODULES:
            if extras.get("opaque_backing") is not True:
                failures.append(f"{expected['id']}: clipped cluster lacks opaque backing")
            ratio = float(extras.get("penetration_ratio", 0))
            if not 0.35 <= ratio <= 0.55:
                failures.append(f"{expected['id']}: penetration ratio {ratio} is not visibly embedded")

    if len(checks) < 10:
        failures.append(f"expected 10 modular exports, inspected {len(checks)}")
    if not PREVIEW_PATH.exists() or PREVIEW_PATH.stat().st_size < 20_000:
        failures.append("fluorescent-lit kit preview is missing or empty")
    if not REVIEW_GLB_PATH.exists() or REVIEW_GLB_PATH.read_bytes()[:4] != b"glTF":
        failures.append("staged review GLB is missing or invalid")
    elif REVIEW_GLB_PATH.stat().st_size != int(manifest.get("staged_review", {}).get("bytes", -1)):
        failures.append("staged review GLB byte count does not match manifest")
    report = {
        "status": "PASS" if not failures else "FAIL",
        "asset_count": len(checks),
        "totals": {
            "triangles": total_triangles,
            "bytes": total_bytes,
            "material_draw_calls_if_all_unique": total_draw_calls,
        },
        "checks": checks,
        "failures": failures,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "asset_count": len(checks),
        "totals": report["totals"],
        "failures": failures,
    }, indent=2))
    if failures:
        raise RuntimeError("Backrooms Phase 7 GLB validation failed")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))


if __name__ == "__main__":
    main()
