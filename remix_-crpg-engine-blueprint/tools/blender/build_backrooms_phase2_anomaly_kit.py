"""Build the Phase 2 Backrooms anomaly furniture kit in Blender.

The source scene contains two center-floor, meter-scale modular props plus a
staged QA composition that mirrors the engine proof map:

* one worn office desk instanced six times at 0.84x scale falloff and 1.5 degree
  yaw increments;
* one closed filing cabinet visibly embedded into an opaque wall.

The exported GLBs deliberately contain no collision meshes. Runtime placement
metadata owns collision so only the first desk can block and the clipped
cabinet can never create an invisible obstacle.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


PROJECT_ROOT = Path("/Users/brennenarotin/Desktop/Backrooms Crpg Engine/remix_-crpg-engine-blueprint")
SOURCE_DIR = PROJECT_ROOT / "assets/blender/backrooms-anomalies"
TEXTURE_DIR = SOURCE_DIR / "textures"
OUTPUT_DIR = PROJECT_ROOT / "public/models/environment/backrooms/anomalies"
BLEND_PATH = SOURCE_DIR / "backrooms-phase2-anomaly-kit.blend"
PREVIEW_PATH = OUTPUT_DIR / "backrooms-phase2-anomaly-kit-preview.png"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

DESK_ID = "backrooms_office_desk"
CABINET_ID = "backrooms_filing_cabinet"
DESK_FILE = "office-desk.glb"
CABINET_FILE = "filing-cabinet.glb"

ASSET_ROOTS: list[bpy.types.Object] = []
COLLECTIONS: dict[str, bpy.types.Collection] = {}


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def make_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(collection)
    COLLECTIONS[name] = collection
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def build_texture(
    name: str,
    base_rgb: tuple[float, float, float],
    *,
    seed: int,
    size: int = 256,
    grain_axis: str = "x",
    contrast: float = 0.16,
    scratches: int = 42,
    roughness: bool = False,
) -> bpy.types.Image:
    """Create a deterministic, game-small color or roughness texture."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size]
    axis = xx if grain_axis == "x" else yy
    broad = np.sin(axis * (2.0 * math.pi / 37.0)) * 0.35
    fine = np.sin(axis * (2.0 * math.pi / 7.0) + yy * 0.047) * 0.18
    noise = rng.normal(0.0, 0.24, (size, size))
    field = broad + fine + noise
    field = np.clip(field, -1.0, 1.0)

    if roughness:
        value = np.clip(0.78 + field * 0.11, 0.42, 0.98)
        rgba = np.stack((value, value, value, np.ones_like(value)), axis=-1)
    else:
        base = np.array(base_rgb, dtype=np.float32)
        rgb = np.clip(base[None, None, :] * (1.0 + field[:, :, None] * contrast), 0.0, 1.0)
        rgba = np.concatenate((rgb, np.ones((size, size, 1), dtype=np.float32)), axis=-1)

    # Sparse nicks and scratches keep repeated furniture from reading as a
    # pristine CAD primitive while remaining cheap enough for six instances.
    for _ in range(scratches):
        x0 = int(rng.integers(0, size))
        y0 = int(rng.integers(0, size))
        length = int(rng.integers(4, max(5, size // 5)))
        thickness = int(rng.integers(1, 3))
        if grain_axis == "x":
            x1, y1 = min(size, x0 + length), min(size, y0 + thickness)
        else:
            x1, y1 = min(size, x0 + thickness), min(size, y0 + length)
        if roughness:
            rgba[y0:y1, x0:x1, :3] = rng.uniform(0.9, 0.98)
        else:
            rgba[y0:y1, x0:x1, :3] *= rng.uniform(0.48, 0.78)

    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"{name}.png")
    image.save()
    image.pack()
    return image


def make_pbr_material(
    name: str,
    base_rgb: tuple[float, float, float],
    *,
    seed: int,
    metallic: float,
    roughness_value: float,
    grain_axis: str = "x",
    texture_size: int = 256,
) -> bpy.types.Material:
    base = build_texture(
        f"T_{name}_BaseColor",
        base_rgb,
        seed=seed,
        size=texture_size,
        grain_axis=grain_axis,
    )
    rough = build_texture(
        f"T_{name}_Roughness",
        (roughness_value,) * 3,
        seed=seed + 101,
        size=texture_size,
        grain_axis=grain_axis,
        roughness=True,
    )
    rough.colorspace_settings.name = "Non-Color"

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*base_rgb, 1.0)
    material.metallic = metallic
    material.roughness = roughness_value
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness_value
    color_node = nodes.new("ShaderNodeTexImage")
    color_node.image = base
    color_node.interpolation = "Linear"
    rough_node = nodes.new("ShaderNodeTexImage")
    rough_node.image = rough
    rough_node.interpolation = "Linear"
    links.new(color_node.outputs["Color"], shader.inputs["Base Color"])
    links.new(rough_node.outputs["Color"], shader.inputs["Roughness"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def add_empty(name: str, collection: bpy.types.Collection, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "CUBE"
    obj.empty_display_size = 0.16
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.008,
    bevel_segments: int = 2,
    rotation_z: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.parent = parent
    obj.location = location
    obj.rotation_euler.z = rotation_z
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = bevel_segments
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(material)
    obj["static_asset_instance"] = True
    obj["collision_policy"] = "runtime_placement_metadata"
    return obj


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result: list[bpy.types.Object] = []
    stack = list(root.children)
    while stack:
        child = stack.pop()
        result.append(child)
        stack.extend(child.children)
    return result


def create_asset_root(
    name: str,
    asset_id: str,
    filename: str,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    root = add_empty(name, collection)
    root["asset_id"] = asset_id
    root["export_file"] = filename
    root["category"] = "backrooms_phase2_anomaly"
    root["origin"] = "center_floor"
    root["front_axis_blender"] = "-Y"
    root["front_axis_engine"] = "+Z"
    root["collision_policy"] = "runtime_placement_metadata"
    ASSET_ROOTS.append(root)
    return root


def build_office_desk(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    collection = COLLECTIONS["11_OfficeDesk"]
    root = create_asset_root("ROOT_OfficeDesk", DESK_ID, DESK_FILE, collection)
    wood = materials["desk_wood"]
    metal = materials["desk_metal"]

    add_box("SM_Desk_Top", (0, 0, 0.7325), (0.96, 0.58, 0.055), wood, root, collection, bevel=0.018)
    add_box("SM_Desk_BackApron", (0, 0.245, 0.66), (0.86, 0.035, 0.105), metal, root, collection, bevel=0.006)
    add_box("SM_Desk_ModestyPanel", (-0.08, 0.248, 0.46), (0.70, 0.025, 0.36), metal, root, collection, bevel=0.004)

    for side, x in (("L", -0.425), ("R", 0.425)):
        for depth, y in (("Front", -0.225), ("Back", 0.225)):
            add_box(f"SM_Desk_Leg_{side}_{depth}", (x, y, 0.35), (0.045, 0.045, 0.70), metal, root, collection, bevel=0.005)
        add_box(f"SM_Desk_Foot_{side}", (x, -0.01, 0.027), (0.075, 0.50, 0.054), metal, root, collection, bevel=0.008)

    # A compact two-drawer pedestal makes the front direction legible even at
    # the smallest recursive copy.
    add_box("SM_Desk_DrawerCarcass", (0.30, 0.075, 0.48), (0.245, 0.34, 0.42), metal, root, collection, bevel=0.010)
    for index, z in enumerate((0.585, 0.395), start=1):
        add_box(f"SM_Desk_DrawerFace_{index}", (0.30, -0.105, z), (0.215, 0.025, 0.145), wood, root, collection, bevel=0.008)
        add_box(f"SM_Desk_DrawerPull_{index}", (0.30, -0.126, z), (0.085, 0.018, 0.018), metal, root, collection, bevel=0.005)
    return root


def build_filing_cabinet(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    collection = COLLECTIONS["12_FilingCabinet"]
    root = create_asset_root("ROOT_FilingCabinet", CABINET_ID, CABINET_FILE, collection)
    paint = materials["cabinet_paint"]
    hardware = materials["cabinet_hardware"]

    # The solid body is intentional: when the cabinet penetrates the wall no
    # open rear shell can flash through at grazing angles.
    add_box("SM_Cabinet_ClosedBody", (0, 0, 0.66), (0.46, 0.62, 1.32), paint, root, collection, bevel=0.018)
    add_box("SM_Cabinet_PlasticFoot_L", (-0.17, -0.22, 0.018), (0.07, 0.09, 0.036), hardware, root, collection, bevel=0.007, bevel_segments=1)
    add_box("SM_Cabinet_PlasticFoot_R", (0.17, -0.22, 0.018), (0.07, 0.09, 0.036), hardware, root, collection, bevel=0.007, bevel_segments=1)

    for index, z in enumerate((0.18, 0.50, 0.82, 1.14), start=1):
        add_box(f"SM_Cabinet_DrawerFace_{index}", (0, -0.323, z), (0.405, 0.034, 0.268), paint, root, collection, bevel=0.009, bevel_segments=1)
        add_box(f"SM_Cabinet_HandleTop_{index}", (0, -0.350, z + 0.035), (0.17, 0.026, 0.024), hardware, root, collection, bevel=0.006, bevel_segments=1)
        add_box(f"SM_Cabinet_HandleL_{index}", (-0.073, -0.346, z + 0.005), (0.022, 0.022, 0.07), hardware, root, collection, bevel=0.004, bevel_segments=1)
        add_box(f"SM_Cabinet_HandleR_{index}", (0.073, -0.346, z + 0.005), (0.022, 0.022, 0.07), hardware, root, collection, bevel=0.004, bevel_segments=1)
        add_box(f"SM_Cabinet_LabelSlot_{index}", (0, -0.348, z - 0.075), (0.14, 0.020, 0.055), hardware, root, collection, bevel=0.004, bevel_segments=1)
        add_box(f"SM_Cabinet_LabelInset_{index}", (0, -0.360, z - 0.075), (0.105, 0.008, 0.027), paint, root, collection, bevel=0.002, bevel_segments=1)
    return root


def merge_asset_by_material(root: bpy.types.Object) -> None:
    meshes = [obj for obj in descendants(root) if obj.type == "MESH"]
    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in meshes:
        material = obj.data.materials[0] if obj.data.materials else None
        groups.setdefault(material.name if material else "NoMaterial", []).append(obj)
    for material_name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"SM_{root['asset_id']}_{material_name.removeprefix('MAT_')}"
        active.parent = root
        active["static_asset_instance"] = True
        active["collision_policy"] = "runtime_placement_metadata"


def clone_asset(root: bpy.types.Object, parent: bpy.types.Object, collection: bpy.types.Collection, prefix: str) -> None:
    for source in descendants(root):
        if source.type != "MESH":
            continue
        clone = source.copy()
        clone.data = source.data
        clone.name = f"QA_{prefix}_{source.name}"
        collection.objects.link(clone)
        clone.parent = parent
        clone.location = source.location
        clone.rotation_euler = source.rotation_euler
        clone.scale = source.scale
        clone.hide_render = False


def make_stage_material(name: str, color: tuple[float, float, float, float], roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return material


def build_qa_stage(desk: bpy.types.Object, cabinet: bpy.types.Object) -> None:
    collection = COLLECTIONS["20_QA_Stage"]
    wall_mat = make_stage_material("MAT_QA_LevelZeroWallpaper", (0.50, 0.44, 0.19, 1), 0.88)
    floor_mat = make_stage_material("MAT_QA_DampCarpet", (0.26, 0.20, 0.07, 1), 0.96)
    trim_mat = make_stage_material("MAT_QA_DarkTrim", (0.10, 0.085, 0.045, 1), 0.82)
    stage_root = add_empty("QA_ROOT_Phase2Acceptance", collection)
    add_box("QA_Floor", (0, 0.3, -0.055), (8.7, 5.0, 0.10), floor_mat, stage_root, collection, bevel=0.0)
    add_box("QA_BackWall", (0, 2.45, 1.35), (8.7, 0.16, 2.7), wall_mat, stage_root, collection, bevel=0.0)
    add_box("QA_WallBaseboard", (0, 2.345, 0.11), (8.7, 0.05, 0.22), trim_mat, stage_root, collection, bevel=0.004)

    for index in range(6):
        group = add_empty(f"QA_DeskChain_{index:02d}", collection, stage_root)
        group.location = (-3.1 + index * 1.08, 0.35, 0)
        factor = 0.84 ** index
        group.scale = (factor, factor, factor)
        group.rotation_euler.z = math.radians(1.5 * index)
        group["phase2_scale"] = factor
        group["phase2_yaw_degrees"] = 1.5 * index
        group["collision_mode"] = "default" if index == 0 else "none"
        clone_asset(desk, group, collection, f"Desk{index:02d}")

    # Front face is -Y. The wall front begins at Y=2.37; setting the cabinet
    # center at 2.32 puts roughly 40% of its depth behind the surface, making
    # the continuation into the wall unmistakable in the QA render.
    cabinet_group = add_empty("QA_ClippedCabinet_40PercentCell", collection, stage_root)
    cabinet_group.location = (3.08, 2.32, 0)
    cabinet_group["plan_offset_macro_cells"] = 0.4
    cabinet_group["collision_mode"] = "none"
    clone_asset(cabinet, cabinet_group, collection, "ClippedCabinet")

    # A return wall makes the intersection read as solid volume from the
    # review camera instead of a single wafer-thin plane.
    add_box("QA_ClipWallReturn", (4.22, 1.45, 1.35), (0.18, 2.1, 2.7), wall_mat, stage_root, collection, bevel=0.0)


def point_camera(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_camera_and_lighting() -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World_BackroomsPhase2") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.026, 0.010, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28

    camera_data = bpy.data.cameras.new("CAM_Phase2Review")
    camera = bpy.data.objects.new("CAM_Phase2Review", camera_data)
    COLLECTIONS["30_Presentation"].objects.link(camera)
    camera.location = (7.1, -8.8, 4.35)
    camera_data.lens = 46
    point_camera(camera, (0.1, 0.75, 0.68))
    scene.camera = camera

    for name, location, energy, size, color in (
        ("KEY_Fluorescent", (-1.0, -0.2, 3.1), 480.0, 3.2, (1.0, 0.80, 0.43)),
        ("FILL_Fluorescent", (3.2, -0.5, 2.2), 330.0, 2.0, (0.75, 0.89, 1.0)),
        ("RIM_WallLeak", (-3.6, 2.0, 1.6), 250.0, 1.6, (1.0, 0.56, 0.20)),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "RECTANGLE"
        light_data.size = size
        light_data.color = color
        light = bpy.data.objects.new(name, light_data)
        COLLECTIONS["30_Presentation"].objects.link(light)
        light.location = location
        point_camera(light, (0.0, 0.7, 0.5))

    # Blender 4.x renamed Eevee's identifier; the MCP workstation may expose
    # either spelling depending on the installed point release.
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(PREVIEW_PATH)
    scene.view_settings.look = "AgX - Medium High Contrast"


def mesh_stats(root: bpy.types.Object) -> dict[str, object]:
    meshes = [obj for obj in descendants(root) if obj.type == "MESH"]
    corners: list[Vector] = []
    triangles = 0
    vertices = 0
    materials: set[str] = set()
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        materials.update(material.name for material in obj.data.materials if material)
    mins = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maxs = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    bounds = maxs - mins
    return {
        "mesh_count": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "bounds_blender": [round(v, 4) for v in bounds],
        "min_blender": [round(v, 4) for v in mins],
        "max_blender": [round(v, 4) for v in maxs],
        "bounds_engine": [round(bounds.x, 4), round(bounds.z, 4), round(bounds.y, 4)],
        "source_min_engine": [round(mins.x, 4), round(mins.z, 4), round(-maxs.y, 4)],
        "source_max_engine": [round(maxs.x, 4), round(maxs.z, 4), round(-mins.y, 4)],
        "materials": sorted(materials),
    }


def select_root(root: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *descendants(root)]:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root


def export_asset(root: bpy.types.Object) -> dict[str, object]:
    select_root(root)
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
    stats = mesh_stats(root)
    return {
        "id": root["asset_id"],
        "display_name": "Worn Office Desk" if root["asset_id"] == DESK_ID else "Worn Filing Cabinet",
        "filename": path.name,
        "url": f"/models/environment/backrooms/anomalies/{path.name}",
        "origin": "center_floor",
        "front_axis_blender": "-Y",
        "front_axis_engine": "+Z",
        "collision_policy": "runtime_placement_metadata",
        **stats,
        "bytes": path.stat().st_size,
    }


def validate_source_assets(assets: list[dict[str, object]]) -> dict[str, object]:
    budgets = {DESK_ID: 3000, CABINET_ID: 2000}
    failures: list[str] = []
    for asset, root in zip(assets, ASSET_ROOTS):
        if asset["triangles"] > budgets[asset["id"]]:
            failures.append(f"{asset['id']}: {asset['triangles']} triangles exceeds {budgets[asset['id']]}")
        if len(asset["materials"]) > 2:
            failures.append(f"{asset['id']}: expected <=2 materials, found {len(asset['materials'])}")
        for obj in descendants(root):
            if obj.type == "MESH" and not obj.name.startswith("SM_"):
                failures.append(f"{asset['id']}: invalid mesh name {obj.name}")
            if obj.type == "MESH" and any(abs(value - 1.0) > 0.001 for value in obj.scale):
                failures.append(f"{asset['id']}: unapplied scale on {obj.name}")
        if abs(float(asset["min_blender"][2])) > 0.003:
            failures.append(f"{asset['id']}: center-floor origin miss {asset['min_blender'][2]}")
    return {
        "status": "PASS" if not failures else "FAIL",
        "budgets": {"desk_triangles": 3000, "cabinet_triangles": 2000, "materials_per_asset": 2},
        "failures": failures,
    }


def prepare_scene() -> tuple[bpy.types.Object, bpy.types.Object]:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()

    make_collection("00_BackroomsPhase2")
    assets = make_collection("10_ExportAssets", COLLECTIONS["00_BackroomsPhase2"])
    make_collection("11_OfficeDesk", assets)
    make_collection("12_FilingCabinet", assets)
    make_collection("20_QA_Stage", COLLECTIONS["00_BackroomsPhase2"])
    make_collection("30_Presentation", COLLECTIONS["00_BackroomsPhase2"])

    materials = {
        "desk_wood": make_pbr_material("MAT_WornDeskLaminate", (0.39, 0.29, 0.12), seed=2101, metallic=0.0, roughness_value=0.82, grain_axis="x"),
        "desk_metal": make_pbr_material("MAT_DeskOxidizedMetal", (0.105, 0.095, 0.070), seed=2102, metallic=0.55, roughness_value=0.69, grain_axis="y"),
        # The exposed surface is paint, not bare steel: keep it dielectric so
        # low-ambient Backrooms lighting still returns readable diffuse color.
        "cabinet_paint": make_pbr_material("MAT_CabinetYellowedPaint", (0.42, 0.40, 0.28), seed=2201, metallic=0.0, roughness_value=0.78, grain_axis="y"),
        "cabinet_hardware": make_pbr_material("MAT_CabinetDarkHardware", (0.075, 0.070, 0.058), seed=2202, metallic=0.72, roughness_value=0.58, grain_axis="x", texture_size=128),
    }
    desk = build_office_desk(materials)
    cabinet = build_filing_cabinet(materials)
    merge_asset_by_material(desk)
    merge_asset_by_material(cabinet)
    build_qa_stage(desk, cabinet)
    setup_camera_and_lighting()

    bpy.context.scene["kit_id"] = "backrooms_phase2_anomaly_kit"
    bpy.context.scene["units"] = "meters"
    bpy.context.scene["engine_forward_axis"] = "+Z"
    bpy.context.scene["phase2_recursive_count"] = 6
    bpy.context.scene["phase2_recursive_scale_falloff"] = 0.84
    bpy.context.scene["phase2_recursive_yaw_step_degrees"] = 1.5
    bpy.context.scene["phase2_wall_clip_macro_ratio"] = 0.4
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    return desk, cabinet


def export_and_render() -> dict[str, object]:
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    assets = [export_asset(root) for root in ASSET_ROOTS]
    validation = validate_source_assets(assets)
    if validation["status"] != "PASS":
        raise RuntimeError(json.dumps(validation, indent=2))

    manifest = {
        "kit_id": "backrooms_phase2_anomaly_kit",
        "version": 1,
        "units": "meters",
        "coordinate_contract": {
            "origin": "center_floor",
            "blender_up": "+Z",
            "blender_front": "-Y",
            "engine_up": "+Y",
            "engine_front": "+Z",
        },
        "assets": assets,
        "phase2_acceptance_scene": {
            "recursive_desks": 6,
            "scale_falloff": 0.84,
            "yaw_step_degrees": 1.5,
            "first_desk_collision": "single",
            "later_desk_collision": "none",
            "cabinet_plan_offset_macro_cells": 0.4,
            "cabinet_collision": "none",
        },
        "validation": validation,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Export roots remain editable in the source but do not double-render over
    # their QA instances in the presentation image.
    for root in ASSET_ROOTS:
        root.hide_render = True
        for obj in descendants(root):
            obj.hide_render = True
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    # Blender writes a transient `.blend1` on repeated automated builds. It is
    # not part of the authored kit; the canonical source is the `.blend` above.
    blend_backup = BLEND_PATH.with_suffix(".blend1")
    if blend_backup.exists():
        blend_backup.unlink()
    return {
        "status": "complete",
        "blend": str(BLEND_PATH),
        "preview": str(PREVIEW_PATH),
        "manifest": str(MANIFEST_PATH),
        "validation": validation,
        "assets": assets,
    }


if __name__ == "__main__":
    prepare_scene()
    print(json.dumps(export_and_render(), indent=2))
