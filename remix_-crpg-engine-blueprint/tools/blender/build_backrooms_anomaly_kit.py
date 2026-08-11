"""Build the production Level 0 anomaly kit for generator Phase 7.

The kit deliberately stays small and modular. Runtime placement supplies the
wrong orientation, recurrence, sinking, and wall penetration while the two
complex intersections ship with their own opaque wall volume so clipping
cannot reveal backfaces or z-fight.
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PHASE2_SCRIPT = PROJECT_ROOT / "tools/blender/build_backrooms_phase2_anomaly_kit.py"
SOURCE_DIR = PROJECT_ROOT / "assets/blender/backrooms-anomalies"
OUTPUT_DIR = PROJECT_ROOT / "public/models/environment/backrooms/anomalies"
BLEND_PATH = SOURCE_DIR / "backrooms-anomaly-kit.blend"
PREVIEW_PATH = OUTPUT_DIR / "backrooms-anomaly-kit-preview.png"
REVIEW_GLB_PATH = OUTPUT_DIR / "backrooms-anomaly-kit-review.glb"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"


def load_phase2_builder():
    spec = importlib.util.spec_from_file_location("backrooms_phase2_builder", PHASE2_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {PHASE2_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


p2 = load_phase2_builder()

# Phase 7 deliberately reuses the Phase 2 geometry helpers, but it must not
# inherit that older script's workstation-specific output globals. Rebase all
# paths before `p2.prepare_scene()` creates textures or configures a render.
p2.PROJECT_ROOT = PROJECT_ROOT
p2.SOURCE_DIR = SOURCE_DIR
p2.TEXTURE_DIR = SOURCE_DIR / "textures"
p2.OUTPUT_DIR = OUTPUT_DIR
p2.BLEND_PATH = SOURCE_DIR / "backrooms-phase2-anomaly-kit.blend"
p2.PREVIEW_PATH = OUTPUT_DIR / "backrooms-phase2-anomaly-kit-preview.png"
p2.MANIFEST_PATH = MANIFEST_PATH


ASSET_SPECS = {
    "backrooms_office_desk": {
        "display_name": "Worn Office Desk",
        "filename": "office-desk.glb",
        "anchor": "floor",
        "collision_policy": "runtime_placement_metadata",
        "triangle_budget": 3000,
    },
    "backrooms_filing_cabinet": {
        "display_name": "Worn Filing Cabinet",
        "filename": "filing-cabinet.glb",
        "anchor": "floor",
        "collision_policy": "runtime_placement_metadata",
        "triangle_budget": 2000,
    },
    "backrooms_wrong_clock": {
        "display_name": "Many-Handed Wrong Clock",
        "filename": "wrong-clock.glb",
        "anchor": "wall",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 2500,
    },
    "backrooms_vertical_fluorescent": {
        "display_name": "Vertical Wall Fluorescent",
        "filename": "vertical-fluorescent.glb",
        "anchor": "wall",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 1800,
    },
    "backrooms_backwards_desk": {
        "display_name": "Backwards Office Desk",
        "filename": "backwards-desk.glb",
        "anchor": "floor",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 3000,
    },
    "backrooms_impossible_filing_cabinet": {
        "display_name": "Impossible Filing Cabinet",
        "filename": "impossible-filing-cabinet.glb",
        "anchor": "floor",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 3500,
    },
    "backrooms_wrong_exit_sign": {
        "display_name": "Wrong Exit Sign",
        "filename": "wrong-exit-sign.glb",
        "anchor": "wall",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 1800,
    },
    "backrooms_recursive_chair": {
        "display_name": "Recursive Office Chair",
        "filename": "recursive-chair.glb",
        "anchor": "floor",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 3500,
    },
    "backrooms_half_wall_bisected_desk": {
        "display_name": "Half-Wall Bisected Desk",
        "filename": "half-wall-bisected-desk.glb",
        "anchor": "partition",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 6500,
        "material_budget": 4,
    },
    "backrooms_wall_clipped_filing_cabinet": {
        "display_name": "Wall-Clipped Filing Cabinet",
        "filename": "wall-clipped-filing-cabinet.glb",
        "anchor": "wall",
        "collision_policy": "collision_mode_none",
        "triangle_budget": 6000,
        "material_budget": 4,
    },
}


def remove_collection(name: str) -> None:
    collection = bpy.data.collections.get(name)
    if collection is None:
        return
    for obj in list(collection.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)


def make_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(collection)
    return collection


def set_principled_emission(material: bpy.types.Material, color: tuple[float, float, float, float], strength: float) -> None:
    shader = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    if shader is None:
        return
    for key in ("Emission Color", "Emission"):
        if shader.inputs.get(key):
            shader.inputs[key].default_value = color
            break
    if shader.inputs.get("Emission Strength"):
        shader.inputs["Emission Strength"].default_value = strength


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    *,
    vertices: int = 24,
    face_forward: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    p2.move_to_collection(obj, collection)
    if face_forward:
        obj.rotation_euler.x = math.pi / 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.parent = parent
    obj.location = location
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj["collision_policy"] = "runtime_placement_metadata"
    return obj


def create_root(
    asset_id: str,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    spec = ASSET_SPECS[asset_id]
    root = p2.create_asset_root(
        f"ROOT_{asset_id.removeprefix('backrooms_').title().replace('_', '')}",
        asset_id,
        spec["filename"],
        collection,
    )
    root["display_name"] = spec["display_name"]
    root["category"] = "backrooms_phase7_anomaly"
    root["anchor"] = spec["anchor"]
    root["collision_policy"] = spec["collision_policy"]
    root["triangle_budget"] = spec["triangle_budget"]
    return root


def clone_root_geometry(
    source: bpy.types.Object,
    target: bpy.types.Object,
    collection: bpy.types.Collection,
    prefix: str,
) -> None:
    for child in p2.descendants(source):
        if child.type != "MESH":
            continue
        clone = child.copy()
        clone.data = child.data.copy()
        clone.name = f"SM_{prefix}_{child.name.removeprefix('SM_')}"
        collection.objects.link(clone)
        clone.parent = target
        clone.location = child.location
        clone.rotation_euler = child.rotation_euler
        clone.scale = child.scale
        clone["collision_policy"] = "runtime_placement_metadata"


def build_wrong_clock(materials: dict[str, bpy.types.Material], collection: bpy.types.Collection) -> bpy.types.Object:
    root = create_root("backrooms_wrong_clock", collection)
    dark = materials["dark"]
    pale = materials["pale"]
    add_cylinder("SM_WrongClock_Case", (0, 0, 0.27), 0.27, 0.07, dark, root, collection, vertices=32, face_forward=True)
    add_cylinder("SM_WrongClock_Face", (0, -0.041, 0.27), 0.235, 0.016, pale, root, collection, vertices=32, face_forward=True)
    for index, degrees in enumerate((0, 47, 105, 176, 244), start=1):
        angle = math.radians(degrees)
        hand = p2.add_box(
            f"SM_WrongClock_Hand_{index:02d}",
            (math.sin(angle) * 0.075, -0.055, 0.27 + math.cos(angle) * 0.075),
            (0.018, 0.015, 0.17),
            dark,
            root,
            collection,
            bevel=0.003,
            bevel_segments=1,
        )
        hand.rotation_euler.y = angle
    add_cylinder("SM_WrongClock_Hub", (0, -0.067, 0.27), 0.025, 0.025, dark, root, collection, vertices=16, face_forward=True)
    return root


def build_vertical_fluorescent(materials: dict[str, bpy.types.Material], collection: bpy.types.Collection) -> bpy.types.Object:
    root = create_root("backrooms_vertical_fluorescent", collection)
    dark = materials["dark"]
    glow = materials["glow"]
    p2.add_box("SM_VerticalFluorescent_Housing", (0, 0.035, 0.62), (0.22, 0.07, 1.24), dark, root, collection, bevel=0.015)
    p2.add_box("SM_VerticalFluorescent_Diffuser", (0, -0.016, 0.62), (0.12, 0.045, 1.08), glow, root, collection, bevel=0.025)
    p2.add_box("SM_VerticalFluorescent_CapTop", (0, -0.005, 1.19), (0.19, 0.055, 0.08), dark, root, collection, bevel=0.009)
    p2.add_box("SM_VerticalFluorescent_CapBottom", (0, -0.005, 0.05), (0.19, 0.055, 0.08), dark, root, collection, bevel=0.009)
    return root


def build_backwards_desk(source: bpy.types.Object, collection: bpy.types.Collection) -> bpy.types.Object:
    root = create_root("backrooms_backwards_desk", collection)
    clone_root_geometry(source, root, collection, "BackwardsDesk")
    root["authored_wrongness"] = "drawers_face_opaque_wall"
    return root


def build_impossible_cabinet(
    source: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    root = create_root("backrooms_impossible_filing_cabinet", collection)
    clone_root_geometry(source, root, collection, "ImpossibleCabinet")
    paint = materials["cabinet_paint"]
    dark = materials["cabinet_hardware"]
    # A second bank of drawers on the sealed rear makes both sides claim to be
    # the cabinet's front. The solid body prevents any hidden shell flashing.
    for index, z in enumerate((0.18, 0.50, 0.82, 1.14), start=1):
        p2.add_box(f"SM_ImpossibleCabinet_RearDrawer_{index}", (0, 0.329, z), (0.405, 0.034, 0.268), paint, root, collection, bevel=0.009, bevel_segments=1)
        p2.add_box(f"SM_ImpossibleCabinet_RearHandle_{index}", (0, 0.354, z + 0.03), (0.17, 0.024, 0.026), dark, root, collection, bevel=0.005, bevel_segments=1)
    return root


def add_letter_boxes(
    root: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> None:
    # Block lettering exports predictably to GLB and stays readable under the
    # engine's intentionally dirty low-light presentation.
    bars = [
        (-0.31, 0.00, 0.18, 0.035), (-0.31, 0.09, 0.18, 0.035), (-0.31, -0.09, 0.18, 0.035), (-0.385, 0.00, 0.035, 0.21),
        (-0.10, 0.00, 0.035, 0.22), (0.00, 0.00, 0.035, 0.22), (-0.05, 0.00, 0.15, 0.035),
        (0.14, 0.00, 0.035, 0.22),
        (0.34, 0.09, 0.18, 0.035), (0.34, 0.00, 0.035, 0.22),
    ]
    for index, (x, z, width, height) in enumerate(bars):
        p2.add_box(f"SM_WrongExit_LetterBar_{index:02d}", (x, -0.046, 0.30 + z), (width, 0.018, height), material, root, collection, bevel=0.002, bevel_segments=1)
    # Arrow deliberately points into the sign's mounting wall.
    p2.add_box("SM_WrongExit_ArrowStem", (0, -0.047, 0.12), (0.34, 0.018, 0.035), material, root, collection, bevel=0.002, bevel_segments=1)
    for side in (-1, 1):
        arrow = p2.add_box("SM_WrongExit_ArrowHead_%s" % ("L" if side < 0 else "R"), (-0.18, -0.047, 0.12 + side * 0.045), (0.13, 0.018, 0.03), material, root, collection, bevel=0.002, bevel_segments=1)
        arrow.rotation_euler.y = math.radians(35 * side)


def build_wrong_exit_sign(materials: dict[str, bpy.types.Material], collection: bpy.types.Collection) -> bpy.types.Object:
    root = create_root("backrooms_wrong_exit_sign", collection)
    green = materials["exit_green"]
    pale = materials["pale"]
    p2.add_box("SM_WrongExit_Body", (0, 0, 0.30), (0.92, 0.08, 0.46), green, root, collection, bevel=0.018)
    add_letter_boxes(root, collection, pale)
    return root


def build_recursive_chair(materials: dict[str, bpy.types.Material], collection: bpy.types.Collection) -> bpy.types.Object:
    root = create_root("backrooms_recursive_chair", collection)
    fabric = materials["fabric"]
    dark = materials["dark"]
    p2.add_box("SM_RecursiveChair_Seat", (0, 0, 0.46), (0.50, 0.48, 0.10), fabric, root, collection, bevel=0.045)
    p2.add_box("SM_RecursiveChair_Back", (0, 0.20, 0.81), (0.48, 0.10, 0.62), fabric, root, collection, bevel=0.045)
    add_cylinder("SM_RecursiveChair_Stem", (0, 0, 0.26), 0.045, 0.36, dark, root, collection, vertices=16)
    for index in range(5):
        angle = math.tau * index / 5
        leg = p2.add_box(
            f"SM_RecursiveChair_Leg_{index:02d}",
            (math.cos(angle) * 0.16, math.sin(angle) * 0.16, 0.09),
            (0.34, 0.055, 0.045),
            dark,
            root,
            collection,
            bevel=0.012,
        )
        leg.rotation_euler.z = angle
        add_cylinder(
            f"SM_RecursiveChair_Caster_{index:02d}",
            (math.cos(angle) * 0.32, math.sin(angle) * 0.32, 0.045),
            0.04,
            0.045,
            dark,
            root,
            collection,
            vertices=12,
            face_forward=True,
        )
    return root


def build_bisected_desk(
    desk: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    root = create_root("backrooms_half_wall_bisected_desk", collection)
    clone_root_geometry(desk, root, collection, "BisectedDesk")
    wall = materials["wall"]
    dark = materials["dark"]
    p2.add_box("SM_BisectedDesk_HalfWall", (0.04, 0, 0.56), (0.14, 1.24, 1.12), wall, root, collection, bevel=0.006)
    p2.add_box("SM_BisectedDesk_WallCap", (0.04, 0, 1.13), (0.18, 1.28, 0.055), dark, root, collection, bevel=0.006)
    root["opaque_backing"] = True
    root["penetration_ratio"] = 0.50
    return root


def build_clipped_cabinet(
    cabinet: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    root = create_root("backrooms_wall_clipped_filing_cabinet", collection)
    clone_root_geometry(cabinet, root, collection, "WallClippedCabinet")
    for child in p2.descendants(root):
        if child.type == "MESH":
            child.location.y += 0.21
    wall = materials["wall"]
    dark = materials["dark"]
    p2.add_box("SM_ClippedCabinet_OpaqueWall", (0, 0.36, 1.16), (1.45, 0.20, 2.32), wall, root, collection, bevel=0.0)
    p2.add_box("SM_ClippedCabinet_BaseTrim", (0, 0.245, 0.11), (1.47, 0.045, 0.22), dark, root, collection, bevel=0.003)
    root["opaque_backing"] = True
    root["penetration_ratio"] = 0.46
    return root


def stage_clone(
    root: bpy.types.Object,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    location: tuple[float, float, float],
    *,
    rotation_z: float = 0.0,
    scale: float = 1.0,
) -> bpy.types.Object:
    group = p2.add_empty(f"QA_{root['asset_id']}", collection, parent)
    group.location = location
    group.rotation_euler.z = rotation_z
    group.scale = (scale, scale, scale)
    for source in p2.descendants(root):
        if source.type != "MESH":
            continue
        clone = source.copy()
        clone.data = source.data
        clone.name = f"QA_{root['asset_id']}_{source.name}"
        collection.objects.link(clone)
        clone.parent = group
        clone.location = source.location
        clone.rotation_euler = source.rotation_euler
        clone.scale = source.scale
        clone.hide_render = False
    return group


def ground_root(root: bpy.types.Object) -> None:
    meshes = [obj for obj in p2.descendants(root) if obj.type == "MESH"]
    minimum_z = min(
        (obj.matrix_world @ Vector(corner)).z
        for obj in meshes
        for corner in obj.bound_box
    )
    if abs(minimum_z) <= 0.0001:
        return
    for obj in meshes:
        if obj.parent == root:
            obj.location.z -= minimum_z


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_review_stage(
    roots: list[bpy.types.Object],
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    presentation: bpy.types.Collection,
) -> None:
    stage = p2.add_empty("QA_ROOT_Phase7AnomalyKit", collection)
    floor_mat = p2.make_stage_material("MAT_QA_Phase7Carpet", (0.23, 0.18, 0.06, 1), 0.96)
    wall_mat = p2.make_stage_material("MAT_QA_Phase7Wallpaper", (0.48, 0.43, 0.17, 1), 0.88)
    trim_mat = p2.make_stage_material("MAT_QA_Phase7Trim", (0.08, 0.065, 0.025, 1), 0.82)
    p2.add_box("SM_QA_Phase7Floor", (0, 0.6, -0.05), (13.5, 7.0, 0.10), floor_mat, stage, collection, bevel=0)
    p2.add_box("SM_QA_Phase7BackWall", (0, 3.9, 1.35), (13.5, 0.16, 2.70), wall_mat, stage, collection, bevel=0)
    p2.add_box("SM_QA_Phase7BaseTrim", (0, 3.79, 0.11), (13.5, 0.05, 0.22), trim_mat, stage, collection, bevel=0.003)

    by_id = {root["asset_id"]: root for root in roots}
    stage_clone(by_id["backrooms_wrong_clock"], stage, collection, (-4.8, 3.68, 1.35))
    stage_clone(by_id["backrooms_vertical_fluorescent"], stage, collection, (-3.5, 3.68, 0.72))
    stage_clone(by_id["backrooms_backwards_desk"], stage, collection, (-4.2, 1.25, 0), rotation_z=math.pi)
    stage_clone(by_id["backrooms_impossible_filing_cabinet"], stage, collection, (-2.1, 2.5, 0), rotation_z=-0.22)
    stage_clone(by_id["backrooms_wrong_exit_sign"], stage, collection, (-1.1, 3.68, 1.32))

    chair = by_id["backrooms_recursive_chair"]
    for index in range(5):
        group = stage_clone(
            chair,
            stage,
            collection,
            (-0.1 + index * 0.72, 1.0 + index * 0.13, -0.02 * index),
            rotation_z=math.radians(index * 6),
            scale=0.86 ** index,
        )
        group["collision_mode"] = "none"
    stage_clone(by_id["backrooms_half_wall_bisected_desk"], stage, collection, (3.6, 1.3, 0), rotation_z=0.12)
    stage_clone(by_id["backrooms_wall_clipped_filing_cabinet"], stage, collection, (5.25, 3.35, 0))

    camera_data = bpy.data.cameras.new("CAM_Phase7Review")
    camera = bpy.data.objects.new("CAM_Phase7Review", camera_data)
    presentation.objects.link(camera)
    camera.location = (9.4, -10.6, 5.4)
    camera_data.lens = 48
    point_at(camera, (0.3, 1.8, 0.75))
    bpy.context.scene.camera = camera

    for name, location, energy, size, color in (
        ("LGT_Phase7_Key", (-2.8, -0.2, 3.4), 720.0, 4.0, (1.0, 0.80, 0.42)),
        ("LGT_Phase7_Fill", (4.0, -0.4, 2.7), 520.0, 3.0, (0.74, 0.87, 1.0)),
        ("LGT_Phase7_Rim", (0.0, 3.3, 2.2), 410.0, 2.5, (1.0, 0.53, 0.18)),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "RECTANGLE"
        light_data.size = size
        light_data.color = color
        light = bpy.data.objects.new(name, light_data)
        presentation.objects.link(light)
        light.location = location
        point_at(light, (0.0, 1.6, 0.65))


def prepare_scene() -> list[bpy.types.Object]:
    desk, cabinet = p2.prepare_scene()
    remove_collection("20_QA_Stage")
    remove_collection("30_Presentation")
    p2.COLLECTIONS["00_BackroomsPhase2"].name = "COL_BackroomsAnomalyKit"
    p2.COLLECTIONS["10_ExportAssets"].name = "COL_Export"
    p2.COLLECTIONS["11_OfficeDesk"].name = "COL_Asset_OfficeDesk"
    p2.COLLECTIONS["12_FilingCabinet"].name = "COL_Asset_FilingCabinet"

    export_collection = p2.COLLECTIONS["10_ExportAssets"]
    qa_collection = make_collection("COL_QA_Stage", p2.COLLECTIONS["00_BackroomsPhase2"])
    presentation = make_collection("COL_Presentation", p2.COLLECTIONS["00_BackroomsPhase2"])
    reference = make_collection("COL_Reference", p2.COLLECTIONS["00_BackroomsPhase2"])

    # A hidden 1.8 m reference capsule makes scale explicit in the editable
    # source without leaking into exports or the beauty preview.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=(0, 0, 0.9), scale=(0.25, 0.25, 0.9))
    human = bpy.context.object
    human.name = "SM_ReferenceHuman_1p8m"
    p2.move_to_collection(human, reference)
    human.hide_render = True

    materials = {
        "cabinet_paint": bpy.data.materials["MAT_CabinetYellowedPaint"],
        "cabinet_hardware": bpy.data.materials["MAT_CabinetDarkHardware"],
        "dark": p2.make_pbr_material("MAT_AnomalyDarkMetal", (0.055, 0.052, 0.041), seed=7101, metallic=0.62, roughness_value=0.66, grain_axis="y", texture_size=256),
        "pale": p2.make_pbr_material("MAT_AnomalyPalePlastic", (0.69, 0.66, 0.48), seed=7102, metallic=0.0, roughness_value=0.72, grain_axis="x", texture_size=256),
        "exit_green": p2.make_pbr_material("MAT_AnomalyExitGreen", (0.035, 0.22, 0.095), seed=7103, metallic=0.0, roughness_value=0.58, grain_axis="x", texture_size=256),
        "fabric": p2.make_pbr_material("MAT_AnomalyChairFabric", (0.20, 0.145, 0.055), seed=7104, metallic=0.0, roughness_value=0.91, grain_axis="y", texture_size=256),
        "wall": p2.make_pbr_material("MAT_AnomalyAgedWallpaper", (0.48, 0.43, 0.17), seed=7105, metallic=0.0, roughness_value=0.90, grain_axis="y", texture_size=256),
        "glow": p2.make_pbr_material("MAT_AnomalyFluorescentGlow", (0.84, 0.78, 0.47), seed=7106, metallic=0.0, roughness_value=0.34, grain_axis="y", texture_size=128),
    }
    set_principled_emission(materials["glow"], (0.88, 0.80, 0.48, 1), 2.8)

    roots = [desk, cabinet]
    for asset_id, builder in (
        ("backrooms_wrong_clock", lambda col: build_wrong_clock(materials, col)),
        ("backrooms_vertical_fluorescent", lambda col: build_vertical_fluorescent(materials, col)),
        ("backrooms_backwards_desk", lambda col: build_backwards_desk(desk, col)),
        ("backrooms_impossible_filing_cabinet", lambda col: build_impossible_cabinet(cabinet, materials, col)),
        ("backrooms_wrong_exit_sign", lambda col: build_wrong_exit_sign(materials, col)),
        ("backrooms_recursive_chair", lambda col: build_recursive_chair(materials, col)),
        ("backrooms_half_wall_bisected_desk", lambda col: build_bisected_desk(desk, materials, col)),
        ("backrooms_wall_clipped_filing_cabinet", lambda col: build_clipped_cabinet(cabinet, materials, col)),
    ):
        asset_collection = make_collection(f"COL_Asset_{asset_id.removeprefix('backrooms_').title().replace('_', '')}", export_collection)
        roots.append(builder(asset_collection))

    for root in roots[2:]:
        p2.merge_asset_by_material(root)
    for root in roots:
        ground_root(root)
    for root in roots:
        spec = ASSET_SPECS[root["asset_id"]]
        root["display_name"] = spec["display_name"]
        root["anchor"] = spec["anchor"]
        root["collision_policy"] = spec["collision_policy"]
        root["triangle_budget"] = spec["triangle_budget"]

    build_review_stage(roots, materials, qa_collection, presentation)
    scene = bpy.context.scene
    scene["kit_id"] = "backrooms_phase7_anomaly_kit"
    scene["units"] = "meters"
    scene["engine_forward_axis"] = "+Z"
    scene["phase7_asset_count"] = len(roots)
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    world = bpy.data.worlds.new("World_BackroomsPhase7") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.019, 0.006, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.24
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 810
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.view_settings.look = "AgX - Medium High Contrast"
    return roots


def export_asset(root: bpy.types.Object) -> dict[str, object]:
    p2.select_root(root)
    path = OUTPUT_DIR / str(root["export_file"])
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    stats = p2.mesh_stats(root)
    spec = ASSET_SPECS[root["asset_id"]]
    return {
        "id": root["asset_id"],
        "display_name": spec["display_name"],
        "filename": path.name,
        "url": f"/models/environment/backrooms/anomalies/{path.name}",
        "origin": "center_floor",
        "anchor": spec["anchor"],
        "front_axis_blender": "-Y",
        "front_axis_engine": "+Z",
        "collision_policy": spec["collision_policy"],
        "triangle_budget": spec["triangle_budget"],
        **stats,
        "bytes": path.stat().st_size,
    }


def validate_source_assets(assets: list[dict[str, object]], roots: list[bpy.types.Object]) -> dict[str, object]:
    failures: list[str] = []
    total_triangles = 0
    for asset, root in zip(assets, roots):
        total_triangles += int(asset["triangles"])
        if int(asset["triangles"]) > int(asset["triangle_budget"]):
            failures.append(f"{asset['id']}: {asset['triangles']} triangles exceeds {asset['triangle_budget']}")
        material_budget = int(ASSET_SPECS[asset["id"]].get("material_budget", 2))
        if len(asset["materials"]) > material_budget:
            failures.append(
                f"{asset['id']}: expected <={material_budget} materials, found {len(asset['materials'])}"
            )
        if abs(float(asset["min_blender"][2])) > 0.003:
            failures.append(f"{asset['id']}: center-floor origin miss {asset['min_blender'][2]}")
        for obj in p2.descendants(root):
            if obj.type != "MESH":
                continue
            if not obj.name.startswith("SM_"):
                failures.append(f"{asset['id']}: invalid mesh name {obj.name}")
            if any(abs(value - 1.0) > 0.001 for value in obj.scale):
                failures.append(f"{asset['id']}: unapplied scale on {obj.name}")
    return {
        "status": "PASS" if not failures else "FAIL",
        "asset_count": len(assets),
        "total_triangles": total_triangles,
        "materials_per_asset": 2,
        "failures": failures,
    }


def export_and_render(roots: list[bpy.types.Object]) -> dict[str, object]:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    assets = [export_asset(root) for root in roots]
    validation = validate_source_assets(assets, roots)
    if validation["status"] != "PASS":
        raise RuntimeError(json.dumps(validation, indent=2))
    review_root = bpy.data.objects["QA_ROOT_Phase7AnomalyKit"]
    p2.select_root(review_root)
    bpy.ops.export_scene.gltf(
        filepath=str(REVIEW_GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    manifest = {
        "kit_id": "backrooms_phase7_anomaly_kit",
        "version": 2,
        "units": "meters",
        "coordinate_contract": {
            "origin": "center_floor",
            "blender_up": "+Z",
            "blender_front": "-Y",
            "engine_up": "+Y",
            "engine_front": "+Z",
        },
        "assets": assets,
        "staged_review": {
            "filename": REVIEW_GLB_PATH.name,
            "url": f"/models/environment/backrooms/anomalies/{REVIEW_GLB_PATH.name}",
            "bytes": REVIEW_GLB_PATH.stat().st_size,
            "preview": PREVIEW_PATH.name,
        },
        "phase7_contract": {
            "minimum_validated_kit": 8,
            "complex_clipped_modules": [
                "backrooms_half_wall_bisected_desk",
                "backrooms_wall_clipped_filing_cabinet",
            ],
            "glb_collision_meshes": "none",
            "runtime_collision_owner": "ObjectPlacementData.collision_mode",
            "embedded_collision_mode": "none",
            "opaque_backing_required": True,
            "runtime_transforms": ["scale", "rotation_offset", "plan_offset", "height_offset"],
        },
        "validation": validation,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for root in roots:
        root.hide_render = True
        for obj in p2.descendants(root):
            obj.hide_render = True
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    backup = BLEND_PATH.with_suffix(".blend1")
    if backup.exists():
        backup.unlink()
    return {
        "status": "complete",
        "blend": str(BLEND_PATH),
        "preview": str(PREVIEW_PATH),
        "review_glb": str(REVIEW_GLB_PATH),
        "manifest": str(MANIFEST_PATH),
        "validation": validation,
        "assets": assets,
    }


if __name__ == "__main__":
    built_roots = prepare_scene()
    print(json.dumps(export_and_render(built_roots), indent=2))
