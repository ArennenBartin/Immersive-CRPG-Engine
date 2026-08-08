"""Build the modular Lonely Street basement kit and engine-ready GLBs.

The kit deliberately mirrors the house-interior production pipeline: every
architectural/prop cluster has its own root, export, origin, material set, and
manifest record.  The staged scene is only for art review; gameplay assembles
the individual assets through engine-native placements, collision, and lights.
"""

from __future__ import annotations

import importlib.util
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path("/Users/brennenarotin/Desktop/Backrooms Crpg Engine/remix_-crpg-engine-blueprint")
HOUSE_HELPERS_PATH = PROJECT_ROOT / "tools/blender/build_lonely_street_house_interior.py"
OUTPUT_DIR = PROJECT_ROOT / "public/models/environment/lonely-street-basement"
SOURCE_DIR = PROJECT_ROOT / "assets/blender/lonely-street-basement"
REFERENCE_IMAGE = Path(
    "/var/folders/n1/1jljpf893dl40g04323t9d340000gn/T/"
    "codex-clipboard-d73ab759-2a7d-4cc7-a448-412d363a9147.png"
)
BLEND_PATH = SOURCE_DIR / "lonely-street-basement-kit.blend"
PREVIEW_PATH = OUTPUT_DIR / "lonely-street-basement-preview.png"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

ROOM_WIDTH = 10.0
ROOM_DEPTH = 8.0
ROOM_HEIGHT = 2.60
STAIR_LANDING_HEIGHT = 2.52
SEED = 4131979

random.seed(SEED)


def load_house_helpers():
    spec = importlib.util.spec_from_file_location("house_interior_helpers", HOUSE_HELPERS_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load helper pipeline: {HOUSE_HELPERS_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


h = load_house_helpers()
h.clear_scene()


def ensure_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    destination = parent or bpy.context.scene.collection
    if collection.name not in {child.name for child in destination.children}:
        destination.children.link(collection)
    return collection


ROOT = ensure_collection("COL_LonelyStreetBasement")
REFERENCE = ensure_collection("COL_Reference", ROOT)
BLOCKOUT = ensure_collection("COL_Blockout", ROOT)
STRUCTURE = ensure_collection("COL_Modular_Geo", ROOT)
STAIRS = ensure_collection("COL_Stairs", ROOT)
APPLIANCES = ensure_collection("COL_Appliances", ROOT)
FURNITURE = ensure_collection("COL_Furniture", ROOT)
MUSIC = ensure_collection("COL_Music", ROOT)
CLUTTER = ensure_collection("COL_SetDressing", ROOT)
LIGHT_FIXTURES = ensure_collection("COL_LightFixtures", ROOT)
COLLISION = ensure_collection("COL_Collision", ROOT)
LIGHTS = ensure_collection("COL_Lights", ROOT)
CAMERAS = ensure_collection("COL_Cameras", ROOT)
EXPORT = ensure_collection("COL_Export", ROOT)

# Repoint the proven house-kit helpers at this scene's production hierarchy.
h.STRUCTURE = STRUCTURE
h.DOORS_WINDOWS = STAIRS
h.FURNITURE = FURNITURE
h.KITCHEN = APPLIANCES
h.CLUTTER = CLUTTER
h.LIGHT_FIXTURES = LIGHT_FIXTURES
h.COLLISION = COLLISION
h.LIGHTS = LIGHTS
h.CAMERAS = CAMERAS
h.REFERENCE = REFERENCE
h.ASSET_ROOTS = []


def make_root(
    name: str,
    asset_id: str,
    filename: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    category: str,
) -> bpy.types.Object:
    root = h.create_root(name, asset_id, filename, location, collection)
    root["category"] = category
    root["kit"] = "lonely_street_basement"
    root["engine_origin"] = "center_floor"
    return root


def add_box(*args, **kwargs):
    return h.add_box(*args, **kwargs)


def add_cylinder(*args, **kwargs):
    return h.add_cylinder(*args, **kwargs)


def add_sphere(*args, **kwargs):
    return h.add_sphere(*args, **kwargs)


def add_cone(*args, **kwargs):
    return h.add_cone(*args, **kwargs)


def add_torus(*args, **kwargs):
    return h.add_torus(*args, **kwargs)


def add_collision_box(
    name: str,
    loc: tuple[float, float, float],
    dims: tuple[float, float, float],
    parent: bpy.types.Object,
) -> bpy.types.Object:
    return add_box(name, loc, dims, None, parent, COLLISION, bevel=0.0, collision=True)


def make_textures() -> dict[str, bpy.types.Image]:
    def concrete(x: int, y: int, size: int):
        grain = h.hash_noise(x, y, 11)
        broad = h.hash_noise(x // 14, y // 14, 17)
        crack = 0.16 if ((x * 3 + y * 5 + (y // 23) * 13) % 131) < 2 else 0.0
        base = 0.29 + (grain - 0.5) * 0.08 + (broad - 0.5) * 0.11 - crack
        return base * 0.97, base * 0.94, base * 0.88, 1.0

    def timber(x: int, y: int, size: int):
        seam = 0.13 if x % 40 < 2 else 0.0
        grain = math.sin(y * 0.23 + math.sin(x * 0.047) * 3.0) * 0.032
        knots = 0.08 if h.hash_noise(x // 9, y // 9, 23) > 0.93 else 0.0
        base = 0.17 + grain + (h.hash_noise(x, y, 29) - 0.5) * 0.04 - seam - knots
        return base * 1.06, base * 0.72, base * 0.49, 1.0

    def enamel(x: int, y: int, size: int):
        grit = (h.hash_noise(x, y, 31) - 0.5) * 0.05
        stain = 0.19 if h.hash_noise(x // 8, y // 8, 37) > 0.88 else 0.0
        base = 0.56 + grit - stain
        return base * 1.01, base * 0.97, base * 0.87, 1.0

    def burgundy(x: int, y: int, size: int):
        n = (h.hash_noise(x, y, 41) - 0.5) * 0.06
        scratch = 0.12 if (x * 7 + y * 11) % 151 < 2 else 0.0
        return 0.18 + n - scratch, 0.045 + n * 0.25, 0.052 + n * 0.3, 1.0

    def cardboard(x: int, y: int, size: int):
        n = (h.hash_noise(x, y, 47) - 0.5) * 0.06
        stripe = -0.08 if x % 53 in (0, 1, 2) else 0.0
        return 0.34 + n + stripe, 0.24 + n + stripe, 0.13 + n * 0.7 + stripe, 1.0

    def poster(x: int, y: int, size: int):
        edge = x < 6 or y < 6 or x >= size - 6 or y >= size - 6
        grime = (h.hash_noise(x, y, 53) - 0.5) * 0.05
        base = 0.42 if not edge else 0.20
        return base + grime, base * 0.83 + grime, base * 0.54 + grime, 1.0

    return {
        "concrete": h.make_image("T_Basement_Concrete_BC", 192, concrete),
        "timber": h.make_image("T_Basement_Timber_BC", 192, timber),
        "enamel": h.make_image("T_Basement_Enamel_BC", 128, enamel),
        "burgundy": h.make_image("T_Basement_DrumShell_BC", 128, burgundy),
        "cardboard": h.make_image("T_Basement_Cardboard_BC", 128, cardboard),
        "poster": h.make_image("T_Basement_Poster_BC", 128, poster),
    }


def make_materials(textures: dict[str, bpy.types.Image]) -> dict[str, bpy.types.Material]:
    m = h.make_material
    return {
        "concrete": m("MAT_Concrete_Weathered", (0.29, 0.27, 0.24, 1), 0.93, texture=textures["concrete"]),
        "timber": m("MAT_Wood_DarkStained", (0.16, 0.10, 0.065, 1), 0.82, texture=textures["timber"]),
        "timber_dark": m("MAT_Wood_Charred", (0.07, 0.045, 0.032, 1), 0.88, texture=textures["timber"]),
        "enamel": m("MAT_Metal_DirtyEnamel", (0.53, 0.50, 0.42, 1), 0.74, texture=textures["enamel"]),
        "burgundy": m("MAT_Metal_DrumBurgundy", (0.20, 0.035, 0.045, 1), 0.47, metallic=0.15, texture=textures["burgundy"]),
        "chrome": m("MAT_Metal_DullChrome", (0.30, 0.28, 0.25, 1), 0.36, metallic=0.88),
        "black": m("MAT_Rubber_SootBlack", (0.012, 0.010, 0.009, 1), 0.78),
        "drum_head": m("MAT_Fabric_DirtyDrumHead", (0.42, 0.39, 0.33, 1), 0.84),
        "cardboard": m("MAT_Paper_Cardboard", (0.34, 0.23, 0.12, 1), 0.96, texture=textures["cardboard"]),
        "paper": m("MAT_Paper_Aged", (0.44, 0.35, 0.21, 1), 0.96, texture=textures["poster"]),
        "poster_black": m("MAT_Ink_PosterBlack", (0.008, 0.006, 0.005, 1), 0.91),
        "detergent_red": m("MAT_Plastic_DetergentRed", (0.30, 0.035, 0.025, 1), 0.55),
        "detergent_blue": m("MAT_Plastic_DetergentBlue", (0.045, 0.09, 0.15, 1), 0.52),
        "detergent_cream": m("MAT_Plastic_DetergentCream", (0.52, 0.47, 0.34, 1), 0.61),
        "label": m("MAT_Paper_Label", (0.55, 0.44, 0.26, 1), 0.88),
        "glass": m("MAT_Glass_BottleBrown", (0.075, 0.025, 0.008, 1), 0.24),
        "warm": m(
            "MAT_Emissive_BulbWarm",
            (1.0, 0.62, 0.24, 1),
            0.22,
            emission=(1.0, 0.38, 0.08, 1),
            emission_strength=7.5,
        ),
        "rug": m("MAT_Fabric_RugBurgundy", (0.16, 0.055, 0.045, 1), 0.98),
        "copper": m("MAT_Metal_OxidizedCopper", (0.22, 0.095, 0.045, 1), 0.54, metallic=0.72),
    }


def add_curve_mesh(
    name: str,
    points: list[tuple[float, float, float]],
    bevel_depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = 2
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, curve_data)
    collection.objects.link(obj)
    obj.parent = parent
    h.assign_material(obj, material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    h.set_asset_flags(obj)
    return obj


def add_text_mesh(
    name: str,
    text: str,
    loc: tuple[float, float, float],
    size: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    extrude: float = 0.004,
) -> bpy.types.Object:
    data = bpy.data.curves.new(f"{name}_Text", type="FONT")
    data.body = text
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.size = size
    data.extrude = extrude
    data.bevel_depth = 0.001
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = (math.pi / 2, 0, 0)
    h.assign_material(obj, material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    h.set_asset_flags(obj)
    return obj


def build_shell(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementShell", "lonely_basement_shell", "basement-shell.glb", (0, 0, 0), STRUCTURE, "structure")
    add_box("SM_Env_BasementFloor", (0, 0, -0.07), (ROOM_WIDTH, ROOM_DEPTH, 0.14), mat["concrete"], root, STRUCTURE, bevel=0.0)
    # Front wall is cut away for the review camera but remains in the export.
    front = add_box("SM_Env_FrontWall", (0, -ROOM_DEPTH / 2, ROOM_HEIGHT / 2), (ROOM_WIDTH, 0.16, ROOM_HEIGHT), mat["timber_dark"], root, STRUCTURE, bevel=0.0)
    front["preview_cutaway"] = True
    add_box("SM_Env_LeftWall", (-ROOM_WIDTH / 2, 0, ROOM_HEIGHT / 2), (0.16, ROOM_DEPTH, ROOM_HEIGHT), mat["concrete"], root, STRUCTURE, bevel=0.0)
    add_box("SM_Env_RightWall", (ROOM_WIDTH / 2, 0, ROOM_HEIGHT / 2), (0.16, ROOM_DEPTH, ROOM_HEIGHT), mat["timber_dark"], root, STRUCTURE, bevel=0.0)
    # Back wall rises around the stair door while the ordinary basement ceiling stays low.
    add_box("SM_Env_BackWall", (0, ROOM_DEPTH / 2, 2.30), (ROOM_WIDTH, 0.16, 4.60), mat["timber_dark"], root, STRUCTURE, bevel=0.0)
    add_box("SM_Env_CeilingMain", (-1.35, 0, ROOM_HEIGHT + 0.04), (7.30, ROOM_DEPTH, 0.09), mat["timber_dark"], root, STRUCTURE, bevel=0.0)
    # Dense studs and joists provide the layered unfinished-basement silhouette.
    for index, x in enumerate((-4.62, -3.75, -2.88, -2.01, -1.14, -0.27, 0.60, 1.47, 2.34, 4.70)):
        add_box(f"SM_Env_WallStud_{index:02d}", (x, 3.83, 1.30), (0.11, 0.18, 2.60), mat["timber"], root, STRUCTURE, bevel=0.008)
    for index, y in enumerate((-3.45, -2.55, -1.65, -0.75, 0.15, 1.05, 1.95, 2.85, 3.55)):
        add_box(f"SM_Env_LeftWallStud_{index:02d}", (-4.82, y, 1.30), (0.18, 0.11, 2.60), mat["timber"], root, STRUCTURE, bevel=0.008)
    for index, y in enumerate((-3.55, -2.65, -1.75, -0.85, 0.05, 0.95, 1.85, 2.75, 3.55)):
        add_box(f"SM_Env_CeilingJoist_{index:02d}", (-1.35, y, 2.48), (7.30, 0.12, 0.20), mat["timber"], root, STRUCTURE, bevel=0.008)
    # Wall base trim and a few structural posts break the long planar surfaces.
    add_box("SM_Env_LeftBase", (-4.87, 0, 0.10), (0.12, 7.75, 0.20), mat["timber"], root, STRUCTURE, bevel=0.01)
    add_box("SM_Env_BackBase", (0, 3.84, 0.10), (9.70, 0.12, 0.20), mat["timber"], root, STRUCTURE, bevel=0.01)
    add_box("SM_Env_StairPost", (2.35, 1.35, 1.35), (0.24, 0.24, 2.70), mat["timber"], root, STRUCTURE, bevel=0.012)
    # Source collision is retained for review; runtime uses the authored macro ring.
    add_collision_box("SM_BasementShell_COL_Left", (-5.0, 0, 1.3), (0.18, 8.0, 2.6), root)
    add_collision_box("SM_BasementShell_COL_Right", (5.0, 0, 1.3), (0.18, 8.0, 2.6), root)
    add_collision_box("SM_BasementShell_COL_Back", (0, 4.0, 1.3), (10.0, 0.18, 2.6), root)
    add_collision_box("SM_BasementShell_COL_Front", (0, -4.0, 1.3), (10.0, 0.18, 2.6), root)
    return root


def build_staircase(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementStaircase", "lonely_basement_staircase", "basement-staircase.glb", (3.55, 0.15, 0), STAIRS, "structure")
    count = 14
    rise = STAIR_LANDING_HEIGHT / count
    run = 5.20 / count
    for index in range(count):
        height = rise * (index + 1)
        y = -2.60 + run * (index + 0.5)
        add_box(f"SM_Env_StairTread_{index:02d}", (0, y, height / 2), (1.55, run + 0.015, height), mat["timber"], root, STAIRS, bevel=0.012)
    add_box("SM_Env_StairLanding", (0, 2.86, STAIR_LANDING_HEIGHT - 0.08), (1.75, 0.92, 0.16), mat["timber"], root, STAIRS, bevel=0.012)
    slope_angle = math.atan2(STAIR_LANDING_HEIGHT, 5.20)
    slope_length = math.hypot(5.20, STAIR_LANDING_HEIGHT)
    for x in (-0.86, 0.86):
        add_box("SM_Env_StairStringer", (x, -0.02, 1.36), (0.14, slope_length, 0.22), mat["timber_dark"], root, STAIRS, rotation=(slope_angle, 0, 0), bevel=0.01)
        for index in range(5):
            y = -2.35 + index * 1.25
            z = (y + 2.60) / 5.20 * STAIR_LANDING_HEIGHT
            add_box(f"SM_Env_RailPost_{x:+.2f}_{index}", (x, y, z + 0.55), (0.08, 0.08, 1.10), mat["timber"], root, STAIRS, bevel=0.008)
        add_box(f"SM_Env_Handrail_{x:+.2f}", (x, -0.02, 2.36), (0.11, slope_length, 0.11), mat["timber"], root, STAIRS, rotation=(slope_angle, 0, 0), bevel=0.025)
    # Coarse proxy blocks the decorative stairs except at the foot exit cell.
    add_collision_box("SM_BasementStaircase_COL", (0, 0.30, 1.25), (1.80, 4.80, 2.50), root)
    return root


def build_stair_door(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementStairDoor", "lonely_basement_stair_door", "basement-stair-door.glb", (3.55, 3.78, STAIR_LANDING_HEIGHT), STAIRS, "door")
    add_box("SM_Env_StairDoorSlab", (0, 0, 1.02), (1.02, 0.10, 2.04), mat["enamel"], root, STAIRS, bevel=0.022)
    for x in (-0.28, 0.28):
        for z in (0.56, 1.48):
            add_box(f"SM_Env_DoorPanel_{x:+.2f}_{z:.2f}", (x, -0.062, z), (0.38, 0.018, 0.60), mat["paper"], root, STAIRS, bevel=0.009)
    for x in (-0.61, 0.61):
        add_box(f"SM_Env_DoorFrameV_{x:+.2f}", (x, 0.02, 1.08), (0.14, 0.16, 2.18), mat["timber"], root, STAIRS, bevel=0.01)
    add_box("SM_Env_DoorFrameTop", (0, 0.02, 2.12), (1.36, 0.16, 0.14), mat["timber"], root, STAIRS, bevel=0.01)
    add_sphere("SM_Env_DoorKnob", (0.35, -0.10, 1.02), (0.065, 0.065, 0.065), mat["chrome"], root, STAIRS)
    return root


def build_drum_kit(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementDrumKit", "lonely_basement_drum_kit", "basement-drum-kit.glb", (-3.05, -1.25, 0), MUSIC, "prop")
    # Bass drum and head face the review/player approach.
    add_cylinder("SM_Prop_BassDrumShell", (0, 0, 0.66), 0.66, 0.58, mat["burgundy"], root, MUSIC, rotation=(math.pi / 2, 0, 0), vertices=32)
    add_cylinder("SM_Prop_BassDrumHead", (0, -0.305, 0.66), 0.61, 0.025, mat["drum_head"], root, MUSIC, rotation=(math.pi / 2, 0, 0), vertices=32)
    add_torus("SM_Prop_BassDrumRim", (0, -0.325, 0.66), 0.62, 0.025, mat["chrome"], root, MUSIC, rotation=(math.pi / 2, 0, 0))
    # Floor tom, snare, and paired rack toms.
    add_cylinder("SM_Prop_FloorTom", (-0.76, 0.16, 0.62), 0.34, 0.56, mat["burgundy"], root, MUSIC, vertices=24)
    add_cylinder("SM_Prop_FloorTomHead", (-0.76, 0.16, 0.91), 0.32, 0.025, mat["drum_head"], root, MUSIC, vertices=24)
    add_cylinder("SM_Prop_Snare", (0.78, -0.12, 0.82), 0.31, 0.22, mat["chrome"], root, MUSIC, vertices=24)
    add_cylinder("SM_Prop_SnareHead", (0.78, -0.12, 0.945), 0.29, 0.025, mat["drum_head"], root, MUSIC, vertices=24)
    for index, x in enumerate((-0.35, 0.35)):
        add_cylinder(f"SM_Prop_RackTom_{index}", (x, 0.02, 1.19), 0.275, 0.34, mat["burgundy"], root, MUSIC, rotation=(math.pi / 2, 0, 0), vertices=24)
        add_cylinder(f"SM_Prop_RackTomHead_{index}", (x, -0.165, 1.19), 0.255, 0.022, mat["drum_head"], root, MUSIC, rotation=(math.pi / 2, 0, 0), vertices=24)
    # Shared chrome stands and cymbal plates.
    for index, (x, y, height, radius) in enumerate(((-1.03, -0.08, 1.58, 0.38), (1.12, 0.10, 1.48, 0.34), (0.88, 0.55, 1.25, 0.28))):
        add_cylinder(f"SM_Prop_CymbalStand_{index}", (x, y, height * 0.5), 0.022, height, mat["chrome"], root, MUSIC, vertices=12)
        add_cylinder(f"SM_Prop_Cymbal_{index}", (x, y, height), radius, 0.022, mat["copper"], root, MUSIC, rotation=(0.04 * (index - 1), 0.08, 0), vertices=32)
        for leg in range(3):
            angle = leg * math.tau / 3
            add_box(
                f"SM_Prop_CymbalLeg_{index}_{leg}",
                (x + math.cos(angle) * 0.18, y + math.sin(angle) * 0.18, 0.07),
                (0.025, 0.36, 0.025),
                mat["chrome"],
                root,
                MUSIC,
                rotation=(0, 0, -angle),
                bevel=0.004,
            )
    add_collision_box("SM_BasementDrumKit_COL", (0, 0.0, 0.75), (2.65, 1.55, 1.50), root)
    return root


def build_drum_stool(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementDrumStool", "lonely_basement_drum_stool", "basement-drum-stool.glb", (-1.35, -1.70, 0), MUSIC, "furniture")
    add_cylinder("SM_Prop_DrumStoolSeat", (0, 0, 0.58), 0.27, 0.12, mat["black"], root, MUSIC, vertices=24)
    add_cylinder("SM_Prop_DrumStoolPost", (0, 0, 0.31), 0.035, 0.50, mat["chrome"], root, MUSIC, vertices=12)
    for index in range(3):
        angle = index * math.tau / 3
        add_box(f"SM_Prop_DrumStoolLeg_{index}", (math.cos(angle) * 0.18, math.sin(angle) * 0.18, 0.10), (0.035, 0.42, 0.035), mat["chrome"], root, MUSIC, rotation=(0, 0, -angle), bevel=0.004)
    add_collision_box("SM_BasementDrumStool_COL", (0, 0, 0.33), (0.56, 0.56, 0.66), root)
    return root


def build_appliance(
    mat: dict[str, bpy.types.Material],
    kind: str,
    location: tuple[float, float, float],
) -> bpy.types.Object:
    is_washer = kind == "Washer"
    root = make_root(f"ROOT_Basement{kind}", f"lonely_basement_{kind.lower()}", f"basement-{kind.lower()}.glb", location, APPLIANCES, "furniture")
    add_box(f"SM_Prop_{kind}Body", (0, 0, 0.48), (0.90, 0.72, 0.96), mat["enamel"], root, APPLIANCES, bevel=0.035)
    add_box(f"SM_Prop_{kind}Control", (0, -0.38, 0.80), (0.84, 0.08, 0.22), mat["enamel"], root, APPLIANCES, bevel=0.018)
    for index, x in enumerate((-0.27, -0.08, 0.22)):
        add_cylinder(f"SM_Prop_{kind}Knob_{index}", (x, -0.435, 0.82), 0.045, 0.04, mat["black"], root, APPLIANCES, rotation=(math.pi / 2, 0, 0), vertices=12)
    if is_washer:
        add_box("SM_Prop_WasherLid", (0, -0.02, 0.975), (0.72, 0.54, 0.035), mat["chrome"], root, APPLIANCES, bevel=0.018)
    else:
        add_box("SM_Prop_DryerDoor", (0, -0.382, 0.43), (0.68, 0.035, 0.54), mat["enamel"], root, APPLIANCES, bevel=0.026)
        add_cylinder("SM_Prop_DryerWindow", (0, -0.415, 0.43), 0.23, 0.025, mat["black"], root, APPLIANCES, rotation=(math.pi / 2, 0, 0), vertices=28)
    add_collision_box(f"SM_Basement{kind}_COL", (0, 0, 0.49), (0.94, 0.76, 0.98), root)
    return root


def build_fridge(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementFridge", "lonely_basement_fridge", "basement-fridge.glb", (1.15, 3.35, 0), APPLIANCES, "furniture")
    add_box("SM_Prop_FridgeBody", (0, 0, 0.99), (1.02, 0.74, 1.98), mat["enamel"], root, APPLIANCES, bevel=0.035)
    add_box("SM_Prop_FridgeUpperDoor", (0, -0.39, 1.52), (0.96, 0.045, 0.78), mat["enamel"], root, APPLIANCES, bevel=0.018)
    add_box("SM_Prop_FridgeLowerDoor", (0, -0.39, 0.64), (0.96, 0.045, 0.91), mat["enamel"], root, APPLIANCES, bevel=0.018)
    for z in (0.73, 1.38):
        add_box(f"SM_Prop_FridgeHandle_{z:.2f}", (0.36, -0.445, z), (0.06, 0.06, 0.42), mat["chrome"], root, APPLIANCES, bevel=0.012)
    for index, (x, z) in enumerate(((-0.24, 1.58), (0.12, 1.18), (-0.18, 0.72), (0.21, 0.50))):
        add_box(f"SM_Prop_FridgeNote_{index}", (x, -0.422, z), (0.24, 0.012, 0.22), mat["paper"], root, APPLIANCES, rotation=(0, 0, 0.06 * (index - 1)), bevel=0.002)
    add_collision_box("SM_BasementFridge_COL", (0, 0, 1.0), (1.06, 0.78, 2.0), root)
    return root


def build_storage_shelf(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementStorageShelf", "lonely_basement_storage_shelf", "basement-storage-shelf.glb", (-4.02, 3.35, 0), FURNITURE, "furniture")
    for x in (-0.53, 0.53):
        for y in (-0.19, 0.19):
            add_box(f"SM_Prop_ShelfPost_{x:+.2f}_{y:+.2f}", (x, y, 0.94), (0.055, 0.055, 1.88), mat["chrome"], root, FURNITURE, bevel=0.006)
    for level, z in enumerate((0.16, 0.60, 1.04, 1.48, 1.86)):
        add_box(f"SM_Prop_ShelfBoard_{level}", (0, 0, z), (1.18, 0.52, 0.065), mat["timber"], root, FURNITURE, bevel=0.008)
    # Deliberately uneven shelf contents communicate long-term use.
    for index, (x, y, z, dims) in enumerate(((-0.30, -0.03, 0.38, (0.34, 0.31, 0.34)), (0.25, 0.02, 0.39, (0.42, 0.28, 0.31)), (-0.25, 0.01, 0.82, (0.45, 0.32, 0.34)), (0.28, 0.0, 1.27, (0.38, 0.30, 0.34)))):
        add_box(f"SM_Prop_ShelfBox_{index}", (x, y, z), dims, mat["cardboard"], root, FURNITURE, rotation=(0, 0, 0.05 * (index - 1)), bevel=0.008)
    for index, x in enumerate((-0.32, 0.0, 0.31)):
        add_cylinder(f"SM_Prop_ShelfCan_{index}", (x, -0.05, 1.68), 0.09, 0.24, mat["detergent_red" if index == 1 else "label"], root, FURNITURE, vertices=16)
    add_collision_box("SM_BasementStorageShelf_COL", (0, 0, 0.95), (1.22, 0.58, 1.90), root)
    return root


def build_laundry_basket(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementLaundryBasket", "lonely_basement_laundry_basket", "basement-laundry-basket.glb", (-1.18, 3.18, 0.98), CLUTTER, "prop")
    add_box("SM_Prop_LaundryBasketBase", (0, 0, 0.20), (0.62, 0.42, 0.40), mat["cardboard"], root, CLUTTER, bevel=0.055)
    for index, x in enumerate((-0.22, 0, 0.22)):
        add_box(f"SM_Prop_BasketSlatX_{index}", (x, -0.225, 0.22), (0.07, 0.025, 0.28), mat["black"], root, CLUTTER, bevel=0.008)
    for index, y in enumerate((-0.15, 0.0, 0.15)):
        add_box(f"SM_Prop_BasketSlatY_{index}", (-0.325, y, 0.22), (0.025, 0.07, 0.28), mat["black"], root, CLUTTER, bevel=0.008)
    for index, (x, y, scale) in enumerate(((-0.15, 0, (0.24, 0.20, 0.14)), (0.12, 0.02, (0.25, 0.18, 0.15)), (0, -0.04, (0.20, 0.17, 0.17)))):
        add_sphere(f"SM_Prop_LaundryPile_{index}", (x, y, 0.48 + index * 0.035), scale, mat["rug"], root, CLUTTER, segments=12, rings=6)
    return root


def build_detergents(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementDetergents", "lonely_basement_detergents", "basement-detergents.glb", (-0.95, 3.05, 1.02), CLUTTER, "decor")
    specs = ((-0.30, 0.18, 0.25, "detergent_cream"), (0.0, 0.21, 0.30, "detergent_blue"), (0.31, 0.17, 0.27, "detergent_red"))
    for index, (x, radius, height, material_key) in enumerate(specs):
        add_cylinder(f"SM_Prop_DetergentBottle_{index}", (x, 0, height * 0.5), radius, height, mat[material_key], root, CLUTTER, vertices=16)
        add_cylinder(f"SM_Prop_DetergentCap_{index}", (x, 0, height + 0.045), radius * 0.42, 0.09, mat["black"], root, CLUTTER, vertices=12)
        add_box(f"SM_Prop_DetergentLabel_{index}", (x, -radius - 0.008, height * 0.52), (radius * 1.1, 0.012, height * 0.36), mat["label"], root, CLUTTER, bevel=0.002)
    return root


def build_box_stack(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementBoxStack", "lonely_basement_box_stack", "basement-box-stack.glb", (1.20, 3.28, 2.00), CLUTTER, "decor")
    for index, (loc, dims, angle) in enumerate((((-0.20, 0, 0.20), (0.62, 0.50, 0.40), -0.04), ((0.24, 0.03, 0.52), (0.52, 0.43, 0.35), 0.07), ((-0.05, 0.01, 0.77), (0.43, 0.34, 0.24), -0.09))):
        add_box(f"SM_Prop_CardboardBox_{index}", loc, dims, mat["cardboard"], root, CLUTTER, rotation=(0, 0, angle), bevel=0.012)
        add_box(f"SM_Prop_BoxTape_{index}", (loc[0], loc[1] - dims[1] * 0.51, loc[2]), (dims[0] * 0.13, 0.008, dims[2] * 0.86), mat["paper"], root, CLUTTER, rotation=(0, 0, angle), bevel=0.001)
    return root


def build_paint_cans(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementPaintCans", "lonely_basement_paint_cans", "basement-paint-cans.glb", (4.05, -1.95, 0), CLUTTER, "decor")
    for index, (x, y, radius, height) in enumerate(((-0.27, 0.02, 0.16, 0.28), (0.05, -0.04, 0.14, 0.25), (0.32, 0.03, 0.19, 0.34))):
        add_cylinder(f"SM_Prop_PaintCan_{index}", (x, y, height * 0.5), radius, height, mat["enamel"], root, CLUTTER, vertices=18)
        add_torus(f"SM_Prop_PaintCanRim_{index}", (x, y, height), radius * 0.88, 0.012, mat["chrome"], root, CLUTTER)
        add_box(f"SM_Prop_PaintLabel_{index}", (x, y - radius - 0.006, height * 0.52), (radius * 1.25, 0.01, height * 0.38), mat["label"], root, CLUTTER, bevel=0.002)
    return root


def build_pipe_cluster(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementPipes", "lonely_basement_pipes", "basement-pipes.glb", (-4.82, 1.25, 0), CLUTTER, "structure")
    add_curve_mesh("SM_Env_PipeVertical", [(0, 0, 0.10), (0, 0, 2.35)], 0.055, mat["copper"], root, CLUTTER)
    add_curve_mesh("SM_Env_PipeRun", [(0, 0, 1.95), (0.12, 0, 2.20), (1.25, 0, 2.20)], 0.045, mat["copper"], root, CLUTTER)
    for z in (0.45, 1.15, 1.90):
        add_torus(f"SM_Env_PipeClamp_{z:.2f}", (0, 0, z), 0.068, 0.012, mat["chrome"], root, CLUTTER, rotation=(math.pi / 2, 0, 0))
    return root


def build_bad_luck_poster(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementBadLuckPoster", "lonely_basement_bad_luck_poster", "basement-bad-luck-poster.glb", (-4.88, 0.65, 0.95), CLUTTER, "decor")
    add_box("SM_Decal_PosterPaper", (0, 0, 0), (0.025, 0.92, 1.20), mat["paper"], root, CLUTTER, rotation=(0, 0.02, 0.03), bevel=0.006)
    # Text and a simple black-cat graphic are geometry so they survive GLB export.
    add_text_mesh("SM_Decal_BadLuckText", "BAD LUCK", (-0.017, -0.01, 0.38), 0.16, mat["poster_black"], root, CLUTTER)
    cat = add_sphere("SM_Decal_BlackCatBody", (-0.026, -0.01, -0.16), (0.035, 0.18, 0.30), mat["poster_black"], root, CLUTTER, segments=12, rings=6)
    cat.rotation_euler = (0, math.pi / 2, 0)
    add_sphere("SM_Decal_BlackCatHead", (-0.03, -0.01, 0.12), (0.04, 0.13, 0.13), mat["poster_black"], root, CLUTTER, segments=12, rings=6)
    for y in (-0.075, 0.075):
        ear = add_cone(f"SM_Decal_CatEar_{y:+.2f}", (-0.032, y, 0.26), 0.075, 0.0, 0.16, mat["poster_black"], root, CLUTTER, vertices=8)
        ear.rotation_euler = (0, math.pi / 2, 0)
    add_curve_mesh("SM_Decal_CatTail", [(-0.03, 0.10, -0.18), (-0.03, 0.28, -0.04), (-0.03, 0.31, 0.15)], 0.025, mat["poster_black"], root, CLUTTER)
    return root


def build_floor_debris(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementFloorDebris", "lonely_basement_floor_debris", "basement-floor-debris.glb", (0, 0, 0), CLUTTER, "decor")
    for index, (x, y, angle) in enumerate(((-1.9, -2.8, -0.4), (1.1, -1.9, 0.7), (2.0, 1.2, -0.2), (-0.4, 1.1, 0.15))):
        add_box(f"SM_Prop_DebrisPaper_{index}", (x, y, 0.025), (0.35, 0.26, 0.012), mat["paper"], root, CLUTTER, rotation=(0.02, 0.04, angle), bevel=0.002)
    for index, (x, y, angle) in enumerate(((-1.75, -3.18, 0.4), (2.75, -2.65, -0.8), (0.65, 0.55, 0.2))):
        can = add_cylinder(f"SM_Prop_DebrisCan_{index}", (x, y, 0.09), 0.075, 0.23, mat["detergent_red"], root, CLUTTER, rotation=(math.pi / 2, angle, 0), vertices=16)
        can.rotation_euler = (math.pi / 2, angle, 0)
    add_curve_mesh("SM_Prop_ExtensionCord", [(-0.9, -2.1, 0.025), (-0.1, -2.55, 0.025), (0.8, -2.30, 0.025), (1.7, -2.75, 0.025), (2.45, -2.15, 0.025)], 0.018, mat["black"], root, CLUTTER)
    return root


def build_bare_bulb(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementBareBulb", "lonely_basement_bare_bulb", "basement-bare-bulb.glb", (-1.30, 0.45, ROOM_HEIGHT), LIGHT_FIXTURES, "lighting")
    add_cylinder("SM_Light_BulbCord", (0, 0, -0.16), 0.018, 0.32, mat["black"], root, LIGHT_FIXTURES, vertices=10)
    add_cylinder("SM_Light_BulbSocket", (0, 0, -0.34), 0.065, 0.13, mat["chrome"], root, LIGHT_FIXTURES, vertices=16)
    add_sphere("SM_Light_BulbGlass", (0, 0, -0.49), (0.09, 0.09, 0.13), mat["warm"], root, LIGHT_FIXTURES, segments=18, rings=10)
    return root


def build_stair_sconce(mat: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = make_root("ROOT_BasementStairSconce", "lonely_basement_stair_sconce", "basement-stair-sconce.glb", (3.55, 3.65, 4.28), LIGHT_FIXTURES, "lighting")
    add_box("SM_Light_SconceBackplate", (0, 0, 0), (0.30, 0.07, 0.26), mat["chrome"], root, LIGHT_FIXTURES, bevel=0.025)
    add_sphere("SM_Light_SconceBulb", (0, -0.12, 0), (0.10, 0.10, 0.13), mat["warm"], root, LIGHT_FIXTURES, segments=18, rings=10)
    return root


def merge_asset_meshes_by_material() -> None:
    """Batch static meshes without inheriting an arbitrary rotated active mesh.

    Blender's join operator keeps the active object's transform.  Joining the
    stair stringers or fallen cans while those rotations were still live made
    the exported staircase and floor debris rotate around that active basis,
    producing several metres of bogus vertical extent.  Bake every child into
    its root-local basis first, then join only transform-neutral meshes.
    """
    for root in h.ASSET_ROOTS:
        groups: dict[tuple[str, ...], list[bpy.types.Object]] = {}
        for obj in root.children_recursive:
            if (
                obj.type != "MESH"
                or obj.get("is_collision", False)
                or obj.get("preview_cutaway", False)
            ):
                continue
            material_key = tuple(
                material.name for material in obj.data.materials if material
            )
            groups.setdefault(material_key, []).append(obj)
        for material_key, objects in groups.items():
            if len(objects) < 2:
                continue
            h.select_objects(objects)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.transform_apply(
                location=True,
                rotation=True,
                scale=True,
            )
            bpy.ops.object.join()
            active = bpy.context.view_layer.objects.active
            material_label = (
                material_key[0].removeprefix("MAT_")
                if material_key
                else "Unassigned"
            )
            active.name = f"SM_{root['asset_id']}_{material_label}"
            h.set_asset_flags(active)


def setup_reference_and_camera() -> None:
    if REFERENCE_IMAGE.exists():
        try:
            bpy.ops.object.empty_add(type="IMAGE", location=(6.25, 0, 2.2))
            ref = bpy.context.object
            ref.name = "REF_LonelyStreetBasement"
            h.move_to_collection(ref, REFERENCE)
            ref.data = bpy.data.images.load(str(REFERENCE_IMAGE), check_existing=True)
            ref.empty_display_size = 3.0
            ref.rotation_euler = (math.pi / 2, 0, math.pi / 2)
            ref.hide_render = True
        except Exception as exc:
            print(f"Reference setup skipped: {exc}")
    camera_data = bpy.data.cameras.new("CAM_BasementReference_Data")
    camera = bpy.data.objects.new("CAM_BasementReference", camera_data)
    CAMERAS.objects.link(camera)
    camera.location = (0.75, -10.40, 1.78)
    camera_data.lens = 31.0
    camera_data.sensor_width = 36.0
    camera_data.clip_start = 0.05
    camera_data.clip_end = 100.0
    h.look_at(camera, (-0.20, 0.72, 1.12))
    bpy.context.scene.camera = camera


def setup_lighting() -> None:
    key = h.add_scene_light("LGT_BasementBareBulb", "POINT", (-1.30, 0.45, 2.12), 420.0, (1.0, 0.52, 0.22), 0.38)
    key.data.use_shadow = True
    landing = h.add_scene_light("LGT_BasementStairLanding", "AREA", (3.55, 3.45, 4.05), 650.0, (1.0, 0.62, 0.32), 0.35, 1.6)
    h.look_at(landing, (3.45, 0.70, 1.25))
    landing.data.use_shadow = True
    fill = h.add_scene_light("LGT_BasementCameraFill", "AREA", (0.0, -3.5, 2.05), 285.0, (0.38, 0.23, 0.16), 0.85, 4.2)
    h.look_at(fill, (-1.0, 0.4, 0.9))
    fill.data.use_shadow = True
    drum_rim = h.add_scene_light("LGT_BasementDrumRim", "AREA", (-4.35, 0.55, 1.80), 115.0, (0.20, 0.27, 0.36), 0.45, 1.3)
    h.look_at(drum_rim, (-3.0, -1.25, 0.75))
    drum_rim.data.use_shadow = True
    appliance_fill = h.add_scene_light("LGT_BasementApplianceFill", "AREA", (-0.40, 2.55, 2.10), 145.0, (0.62, 0.36, 0.19), 0.50, 2.0)
    h.look_at(appliance_fill, (-0.40, 3.15, 0.85))
    appliance_fill.data.use_shadow = True


def configure_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1152
    scene.render.resolution_y = 864
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.003, 0.0025, 0.002)
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass


def object_stats(root: bpy.types.Object) -> dict[str, object]:
    return h.object_stats(root)


def export_root(root: bpy.types.Object) -> dict[str, object]:
    scene_location = [round(value, 4) for value in root.location]
    original_matrix = root.matrix_world.copy()
    root.matrix_world = bpy.context.scene.cursor.matrix.copy()
    bpy.context.view_layer.update()
    stats = object_stats(root)
    selection = h.descendants(root)
    h.select_objects(selection)
    filepath = OUTPUT_DIR / root["export_file"]
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    root.matrix_world = original_matrix
    bpy.context.view_layer.update()
    return {
        "id": root["asset_id"],
        "filename": root["export_file"],
        "url": f"/models/environment/lonely-street-basement/{root['export_file']}",
        "category": root["category"],
        "scene_location_blender": scene_location,
        "scene_cell_engine": [round(scene_location[0]), round(-scene_location[1])],
        **stats,
        "bytes": filepath.stat().st_size,
    }


def export_staged_scene() -> dict[str, object]:
    selection: list[bpy.types.Object] = []
    for root in h.ASSET_ROOTS:
        selection.extend(h.descendants(root))
    selection.extend(list(LIGHTS.objects))
    h.select_objects(list(dict.fromkeys(selection)))
    filepath = OUTPUT_DIR / "lonely-street-basement-staged.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=True,
        export_materials="EXPORT",
    )
    total_triangles = sum(object_stats(root)["triangles"] for root in h.ASSET_ROOTS)
    return {
        "id": "lonely_basement_staged",
        "filename": filepath.name,
        "url": f"/models/environment/lonely-street-basement/{filepath.name}",
        "triangles": total_triangles,
        "bytes": filepath.stat().st_size,
        "room_dimensions_m": [ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT],
    }


def run_validation(asset_manifest: list[dict[str, object]]) -> dict[str, object]:
    names = [obj.name for obj in bpy.context.scene.objects]
    default_names = [name for name in names if name.startswith(("Cube", "Cylinder", "Sphere", "BezierCurve", "Text"))]
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.get("is_collision", False)]
    unapplied_scale = [obj.name for obj in mesh_objects if any(abs(value - 1.0) > 0.001 for value in obj.scale)]
    invalid_names = [obj.name for obj in mesh_objects if not obj.name.startswith("SM_")]
    material_names = sorted({mat.name for obj in mesh_objects for mat in obj.data.materials if mat})
    invalid_materials = [name for name in material_names if not name.startswith("MAT_")]
    total_triangles = sum(int(asset["triangles"]) for asset in asset_manifest)
    result = {
        "status": "PASS" if not (default_names or unapplied_scale or invalid_names or invalid_materials) and total_triangles <= 75000 else "FAIL",
        "object_count": len(bpy.context.scene.objects),
        "mesh_count": len(mesh_objects),
        "asset_count": len(asset_manifest),
        "total_triangles": total_triangles,
        "triangle_budget": 75000,
        "material_count": len(material_names),
        "default_names": default_names,
        "unapplied_scale": unapplied_scale,
        "invalid_mesh_names": invalid_names,
        "invalid_material_names": invalid_materials,
    }
    if result["status"] != "PASS":
        raise RuntimeError(f"Basement asset validation failed: {json.dumps(result, indent=2)}")
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    textures = make_textures()
    materials = make_materials(textures)

    build_shell(materials)
    build_staircase(materials)
    build_stair_door(materials)
    build_drum_kit(materials)
    build_drum_stool(materials)
    build_appliance(materials, "Washer", (-1.55, 3.32, 0))
    build_appliance(materials, "Dryer", (-0.58, 3.32, 0))
    build_fridge(materials)
    build_storage_shelf(materials)
    build_laundry_basket(materials)
    build_detergents(materials)
    build_box_stack(materials)
    build_paint_cans(materials)
    build_pipe_cluster(materials)
    build_bad_luck_poster(materials)
    build_floor_debris(materials)
    build_bare_bulb(materials)
    build_stair_sconce(materials)

    merge_asset_meshes_by_material()
    setup_reference_and_camera()
    setup_lighting()
    configure_render()

    bpy.context.scene["asset_collection"] = "Lonely Street Basement"
    bpy.context.scene["units"] = "meters"
    bpy.context.scene["grid_snap_m"] = 0.5
    bpy.context.scene["reference_image"] = str(REFERENCE_IMAGE)
    bpy.context.scene["build_seed"] = SEED
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    asset_manifest = [export_root(root) for root in h.ASSET_ROOTS]
    staged = export_staged_scene()
    validation = run_validation(asset_manifest)
    manifest = {
        "kit_id": "lonely_street_basement",
        "version": 1,
        "units": "meters",
        "grid_snap_m": 0.5,
        "reference": str(REFERENCE_IMAGE),
        "assets": asset_manifest,
        "staged_scene": staged,
        "validation": validation,
        "collision_policy": "Simple source proxies are retained in COL_Collision; engine runtime uses fitted placement metadata.",
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    cutaway = [obj for obj in bpy.context.scene.objects if obj.get("preview_cutaway", False)]
    for obj in cutaway:
        obj.hide_render = True
    bpy.ops.render.render(write_still=True)
    for obj in cutaway:
        obj.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(json.dumps({
        "status": "complete",
        "blend": str(BLEND_PATH),
        "preview": str(PREVIEW_PATH),
        "manifest": str(MANIFEST_PATH),
        "validation": validation,
    }, indent=2))


if __name__ == "__main__":
    main()
