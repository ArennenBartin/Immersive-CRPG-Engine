"""Build and export the Lonely Street survival-horror house interior kit.

Run inside Blender 4.3+ / 5.x. The script is intentionally deterministic so the
source .blend, individual GLBs, staged-room GLB, manifest, and preview can be
regenerated together.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path("/Users/brennenarotin/Desktop/Backrooms Crpg Engine/remix_-crpg-engine-blueprint")
OUTPUT_DIR = PROJECT_ROOT / "public/models/environment/lonely-street-house-interior"
SOURCE_DIR = PROJECT_ROOT / "assets/blender/lonely-street-house-interior"
REFERENCE_IMAGE = Path(
    "/var/folders/n1/1jljpf893dl40g04323t9d340000gn/T/"
    "codex-clipboard-aac0ec2a-a442-44be-a93d-b48882c14f24.png"
)
BLEND_PATH = SOURCE_DIR / "lonely-street-house-interior-kit.blend"
PREVIEW_PATH = OUTPUT_DIR / "lonely-street-house-interior-preview.png"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

ROOM_WIDTH = 8.0
ROOM_DEPTH = 4.8
ROOM_HEIGHT = 2.85
SEED = 8131994

random.seed(SEED)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def ensure_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    destination = parent or bpy.context.scene.collection
    if collection.name not in {child.name for child in destination.children}:
        destination.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def make_image(name: str, size: int, pixel_fn) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            r, g, b, a = pixel_fn(x, y, size)
            pixels.extend((max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a))
    image.pixels.foreach_set(pixels)
    image.pack()
    image["generated_for"] = "lonely_street_house_interior"
    return image


def hash_noise(x: int, y: int, salt: int = 0) -> float:
    value = (x * 374761393 + y * 668265263 + salt * 69069) & 0xFFFFFFFF
    value = (value ^ (value >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((value ^ (value >> 16)) & 0xFFFF) / 65535.0


def create_textures() -> dict[str, bpy.types.Image]:
    def plaster(x: int, y: int, size: int):
        n = hash_noise(x // 2, y // 2, 3)
        broad = hash_noise(x // 18, y // 18, 7)
        drip = 0.05 if (x + 9 * (y // 19)) % 83 < 3 else 0.0
        base = 0.31 + (n - 0.5) * 0.07 + (broad - 0.5) * 0.10 - drip
        return base * 0.99, base * 0.91, base * 0.75, 1.0

    def wood(x: int, y: int, size: int):
        plank = (x // 32) % 2
        seam = 0.10 if x % 32 < 2 else 0.0
        grain = math.sin(y * 0.20 + math.sin(x * 0.07) * 2.0) * 0.025
        n = (hash_noise(x, y, 13) - 0.5) * 0.035
        base = 0.18 + plank * 0.025 + grain + n - seam
        return base * 1.05, base * 0.68, base * 0.43, 1.0

    def plaid(x: int, y: int, size: int):
        base = (0.25, 0.23, 0.18)
        vx = x % 32
        vy = y % 32
        red = 0.11 if 3 <= vx <= 7 or 3 <= vy <= 7 else 0.0
        tan = 0.10 if 16 <= vx <= 20 or 16 <= vy <= 20 else 0.0
        dark = -0.08 if vx in (0, 1, 30, 31) or vy in (0, 1, 30, 31) else 0.0
        n = (hash_noise(x, y, 21) - 0.5) * 0.035
        return base[0] + red + tan * 0.45 + dark + n, base[1] + tan * 0.7 + dark + n, base[2] + tan * 0.35 + dark + n, 1.0

    def enamel(x: int, y: int, size: int):
        n = hash_noise(x, y, 31)
        spot = hash_noise(x // 7, y // 7, 41)
        grime = 0.20 if spot > 0.86 else 0.0
        base = 0.47 + (n - 0.5) * 0.04 - grime
        return base * 1.03, base, base * 0.87, 1.0

    def rug(x: int, y: int, size: int):
        border = x < 12 or y < 12 or x >= size - 12 or y >= size - 12
        inner = ((x // 16) + (y // 16)) % 2
        n = (hash_noise(x, y, 51) - 0.5) * 0.035
        if border:
            return 0.13 + n, 0.07 + n, 0.045 + n, 1.0
        return 0.26 + inner * 0.035 + n, 0.16 + inner * 0.02 + n, 0.085 + n, 1.0

    def paper(x: int, y: int, size: int):
        n = (hash_noise(x, y, 61) - 0.5) * 0.04
        line = -0.12 if y % 19 in (0, 1) else 0.0
        return 0.36 + n + line, 0.30 + n + line, 0.20 + n + line, 1.0

    return {
        "plaster": make_image("TX_GrimyPlaster", 128, plaster),
        "wood": make_image("TX_DarkWood", 128, wood),
        "plaid": make_image("TX_WornPlaid", 128, plaid),
        "enamel": make_image("TX_DirtyEnamel", 128, enamel),
        "rug": make_image("TX_Rug", 128, rug),
        "paper": make_image("TX_Paper", 128, paper),
    }


def make_material(
    name: str,
    base_color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    texture: bpy.types.Image | None = None,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*base_color[:3], alpha)
    material.roughness = roughness
    material.metallic = metallic
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = base_color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Alpha"].default_value = alpha
    if emission is not None:
        principled.inputs["Emission Color"].default_value = emission
        principled.inputs["Emission Strength"].default_value = emission_strength
    if texture is not None:
        image_node = nodes.new("ShaderNodeTexImage")
        image_node.image = texture
        image_node.interpolation = "Linear"
        links.new(image_node.outputs["Color"], principled.inputs["Base Color"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material.blend_method = "HASHED" if alpha < 1.0 and hasattr(material, "blend_method") else getattr(material, "blend_method", "OPAQUE")
    return material


def setup_materials(textures: dict[str, bpy.types.Image]) -> dict[str, bpy.types.Material]:
    return {
        "plaster": make_material("MAT_GrimyPlaster", (0.31, 0.28, 0.22, 1), 0.92, texture=textures["plaster"]),
        "wood": make_material("MAT_DarkWood", (0.17, 0.10, 0.055, 1), 0.82, texture=textures["wood"]),
        "floor": make_material("MAT_WornFloorboards", (0.14, 0.075, 0.035, 1), 0.84, texture=textures["wood"]),
        "plaid": make_material("MAT_WornPlaid", (0.27, 0.24, 0.18, 1), 0.96, texture=textures["plaid"]),
        "curtain": make_material("MAT_DirtyCurtainPlaid", (0.22, 0.18, 0.13, 1), 0.97, texture=textures["plaid"]),
        "pillow": make_material("MAT_FadedBurgundyFabric", (0.26, 0.095, 0.065, 1), 0.94),
        "blanket": make_material("MAT_DarkBlanket", (0.055, 0.06, 0.055, 1), 0.98),
        "enamel": make_material("MAT_DirtyEnamel", (0.46, 0.44, 0.36, 1), 0.78, texture=textures["enamel"]),
        "metal": make_material("MAT_OxidizedMetal", (0.10, 0.085, 0.07, 1), 0.66, metallic=0.58),
        "black": make_material("MAT_SootBlack", (0.012, 0.009, 0.007, 1), 0.74),
        "glass": make_material("MAT_SmokyGlass", (0.025, 0.035, 0.045, 1), 0.2, metallic=0.02),
        "rug": make_material("MAT_WornRug", (0.23, 0.13, 0.07, 1), 1.0, texture=textures["rug"]),
        "paper": make_material("MAT_AgedPaper", (0.35, 0.28, 0.18, 1), 0.95, texture=textures["paper"]),
        "poster_red": make_material("MAT_FictionalPosterRed", (0.22, 0.045, 0.025, 1), 0.92),
        "poster_green": make_material("MAT_FictionalPosterGreen", (0.06, 0.13, 0.075, 1), 0.92),
        "bottle": make_material("MAT_BrownGlass", (0.095, 0.035, 0.012, 1), 0.26),
        "ceramic": make_material("MAT_StainedCeramic", (0.43, 0.38, 0.28, 1), 0.82),
        "warm_emissive": make_material(
            "MAT_WarmBulb",
            (1.0, 0.56, 0.18, 1),
            0.22,
            emission=(1.0, 0.33, 0.055, 1),
            emission_strength=6.0,
        ),
        "shade": make_material("MAT_LampShade", (0.42, 0.29, 0.16, 1), 0.88),
    }


def assign_material(obj: bpy.types.Object, material: bpy.types.Material | None) -> None:
    if material is not None and hasattr(obj.data, "materials"):
        obj.data.materials.append(material)


def set_asset_flags(obj: bpy.types.Object, collision: bool = False) -> None:
    obj["is_collision"] = collision
    obj["static_asset_instance"] = not collision
    if collision:
        obj.display_type = "WIRE"
        obj.hide_render = True


def add_box(
    name: str,
    loc: tuple[float, float, float],
    dims: tuple[float, float, float],
    material: bpy.types.Material | None,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.015,
    collision: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rotation
    obj.dimensions = dims
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0.0:
        modifier = obj.modifiers.new(name="Bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    assign_material(obj, material)
    set_asset_flags(obj, collision)
    return obj


def add_cylinder(
    name: str,
    loc: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material | None,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 16,
    collision: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rotation
    assign_material(obj, material)
    set_asset_flags(obj, collision)
    return obj


def add_sphere(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    segments: int = 16,
    rings: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.parent = parent
    obj.location = loc
    obj.scale = scale
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    set_asset_flags(obj)
    return obj


def add_cone(
    name: str,
    loc: tuple[float, float, float],
    radius1: float,
    radius2: float,
    depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    vertices: int = 20,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.parent = parent
    obj.location = loc
    assign_material(obj, material)
    set_asset_flags(obj)
    return obj


def add_torus(
    name: str,
    loc: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=16,
        minor_segments=6,
        location=(0, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rotation
    assign_material(obj, material)
    set_asset_flags(obj)
    return obj


def add_curtain(
    name: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    columns = 12
    rows = 10
    vertices = []
    faces = []
    for row in range(rows + 1):
        z = -height * 0.5 + height * row / rows
        for column in range(columns + 1):
            y = -width * 0.5 + width * column / columns
            x = math.sin(column * math.pi * 0.78) * 0.035 + math.sin(row * 0.8 + column) * 0.008
            vertices.append((center[0] + x, center[1] + y, center[2] + z))
    for row in range(rows):
        for column in range(columns):
            a = row * (columns + 1) + column
            b = a + 1
            c = a + columns + 2
            d = a + columns + 1
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            row = vertex_index // (columns + 1)
            column = vertex_index % (columns + 1)
            uv_layer.data[loop_index].uv = (column / columns, row / rows)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    assign_material(obj, material)
    solidify = obj.modifiers.new(name="ClothThickness", type="SOLIDIFY")
    solidify.thickness = 0.008
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    set_asset_flags(obj)
    return obj


def create_root(
    name: str,
    asset_id: str,
    filename: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.25
    root.location = location
    root["asset_id"] = asset_id
    root["export_file"] = filename
    root["category"] = "lonely_street_house_interior"
    root["static_asset_instance"] = True
    collection.objects.link(root)
    ASSET_ROOTS.append(root)
    return root


def add_collision_box(
    name: str,
    loc: tuple[float, float, float],
    dims: tuple[float, float, float],
    parent: bpy.types.Object,
) -> bpy.types.Object:
    return add_box(name, loc, dims, None, parent, COLLISION, bevel=0.0, collision=True)


def build_shell(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_HouseInteriorShell", "lonely_house_interior_shell", "house-interior-shell.glb", (0, 0, 0), STRUCTURE)
    add_box("SM_Floor", (0, 0, -0.065), (ROOM_WIDTH, ROOM_DEPTH, 0.11), materials["floor"], root, STRUCTURE, bevel=0.0)
    add_box("SM_Ceiling", (0, 0, ROOM_HEIGHT + 0.055), (ROOM_WIDTH, ROOM_DEPTH, 0.08), materials["plaster"], root, STRUCTURE, bevel=0.0)
    add_box("SM_BackWall_Left", (-2.15, ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (2.9, 0.13, ROOM_HEIGHT), materials["plaster"], root, STRUCTURE, bevel=0.0)
    add_box("SM_BackWall_Middle", (0.35, ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (2.1, 0.13, ROOM_HEIGHT), materials["plaster"], root, STRUCTURE, bevel=0.0)
    add_box("SM_BackWall_Right", (3.15, ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (0.9, 0.13, ROOM_HEIGHT), materials["plaster"], root, STRUCTURE, bevel=0.0)
    # The entry wall has a real opening behind the operable front door.
    # Hinge lives at authored map Z=1 after Blender-to-glTF axis conversion.
    # The slab extends toward the front wall from that pivot.
    door_center_y = -1.475
    door_opening_width = 1.25
    door_opening_bottom = door_center_y - door_opening_width * 0.5
    door_opening_top = door_center_y + door_opening_width * 0.5
    left_lower_length = door_opening_bottom + ROOM_DEPTH * 0.5
    left_upper_length = ROOM_DEPTH * 0.5 - door_opening_top
    add_box(
        "SM_LeftWall_EntryLower",
        (-ROOM_WIDTH * 0.5, -ROOM_DEPTH * 0.5 + left_lower_length * 0.5, ROOM_HEIGHT * 0.5),
        (0.13, left_lower_length, ROOM_HEIGHT),
        materials["plaster"], root, STRUCTURE, bevel=0.0,
    )
    add_box(
        "SM_LeftWall_EntryUpper",
        (-ROOM_WIDTH * 0.5, door_opening_top + left_upper_length * 0.5, ROOM_HEIGHT * 0.5),
        (0.13, left_upper_length, ROOM_HEIGHT),
        materials["plaster"], root, STRUCTURE, bevel=0.0,
    )
    add_box(
        "SM_LeftWall_EntryHeader",
        (-ROOM_WIDTH * 0.5, door_center_y, 2.20 + (ROOM_HEIGHT - 2.20) * 0.5),
        (0.13, door_opening_width, ROOM_HEIGHT - 2.20),
        materials["plaster"], root, STRUCTURE, bevel=0.0,
    )
    add_box("SM_RightWall", (ROOM_WIDTH * 0.5, 0, ROOM_HEIGHT * 0.5), (0.13, ROOM_DEPTH, ROOM_HEIGHT), materials["plaster"], root, STRUCTURE, bevel=0.0)
    front_wall = add_box("SM_FrontWall", (0, -ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (ROOM_WIDTH, 0.13, ROOM_HEIGHT), materials["plaster"], root, STRUCTURE, bevel=0.0)
    front_wall["preview_cutaway"] = True
    for x in (-ROOM_WIDTH * 0.5 + 0.08, ROOM_WIDTH * 0.5 - 0.08):
        add_box(f"SM_Baseboard_X_{x:+.2f}", (x, 0, 0.095), (0.055, ROOM_DEPTH, 0.19), materials["wood"], root, STRUCTURE, bevel=0.008)
    add_box("SM_Baseboard_Back", (0, ROOM_DEPTH * 0.5 - 0.08, 0.095), (ROOM_WIDTH, 0.055, 0.19), materials["wood"], root, STRUCTURE, bevel=0.008)
    # A real black recess and trim for the hall beyond the kitchenette.
    add_box("SM_HallRecess", (2.05, ROOM_DEPTH * 0.5 - 0.075, 1.02), (1.05, 0.035, 2.04), materials["black"], root, STRUCTURE, bevel=0.0)
    add_box("SM_HallTrim_L", (1.49, ROOM_DEPTH * 0.5 - 0.12, 1.03), (0.11, 0.12, 2.06), materials["wood"], root, STRUCTURE)
    add_box("SM_HallTrim_R", (2.61, ROOM_DEPTH * 0.5 - 0.12, 1.03), (0.11, 0.12, 2.06), materials["wood"], root, STRUCTURE)
    add_box("SM_HallTrim_T", (2.05, ROOM_DEPTH * 0.5 - 0.12, 2.02), (1.22, 0.12, 0.11), materials["wood"], root, STRUCTURE)
    add_collision_box(
        "SM_HouseInteriorShell_COL_LeftLower",
        (-ROOM_WIDTH * 0.5, -ROOM_DEPTH * 0.5 + left_lower_length * 0.5, ROOM_HEIGHT * 0.5),
        (0.15, left_lower_length, ROOM_HEIGHT), root,
    )
    add_collision_box(
        "SM_HouseInteriorShell_COL_LeftUpper",
        (-ROOM_WIDTH * 0.5, door_opening_top + left_upper_length * 0.5, ROOM_HEIGHT * 0.5),
        (0.15, left_upper_length, ROOM_HEIGHT), root,
    )
    add_collision_box(
        "SM_HouseInteriorShell_COL_LeftHeader",
        (-ROOM_WIDTH * 0.5, door_center_y, 2.20 + (ROOM_HEIGHT - 2.20) * 0.5),
        (0.15, door_opening_width, ROOM_HEIGHT - 2.20), root,
    )
    add_collision_box("SM_HouseInteriorShell_COL_Right", (ROOM_WIDTH * 0.5, 0, ROOM_HEIGHT * 0.5), (0.15, ROOM_DEPTH, ROOM_HEIGHT), root)
    add_collision_box("SM_HouseInteriorShell_COL_Front", (0, -ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (ROOM_WIDTH, 0.15, ROOM_HEIGHT), root)
    add_collision_box("SM_HouseInteriorShell_COL_BackLeft", (-1.95, ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (3.25, 0.15, ROOM_HEIGHT), root)
    add_collision_box("SM_HouseInteriorShell_COL_BackRight", (3.15, ROOM_DEPTH * 0.5, ROOM_HEIGHT * 0.5), (0.9, 0.15, ROOM_HEIGHT), root)
    return root


def build_door(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    hinge_y = -1.0
    center_from_hinge = -0.475
    frame_root = create_root("ROOT_WornInteriorDoorFrame", "lonely_house_worn_door_frame", "worn-door-frame.glb", (-ROOM_WIDTH * 0.5, hinge_y, 0), DOORS_WINDOWS)
    add_box("SM_DoorFrame_L", (-0.03, center_from_hinge - 0.56, 1.08), (0.15, 0.13, 2.18), materials["wood"], frame_root, DOORS_WINDOWS)
    add_box("SM_DoorFrame_R", (-0.03, center_from_hinge + 0.56, 1.08), (0.15, 0.13, 2.18), materials["wood"], frame_root, DOORS_WINDOWS)
    add_box("SM_DoorFrame_T", (-0.03, center_from_hinge, 2.12), (0.15, 1.25, 0.13), materials["wood"], frame_root, DOORS_WINDOWS)
    root = create_root("ROOT_WornInteriorDoor", "lonely_house_worn_door", "worn-door.glb", (-ROOM_WIDTH * 0.5, hinge_y, 0), DOORS_WINDOWS)
    add_box("SM_DoorSlab", (0, center_from_hinge, 1.02), (0.09, 0.95, 2.04), materials["wood"], root, DOORS_WINDOWS, bevel=0.018)
    for y in (-0.25, 0.25):
        for z in (0.55, 1.45):
            panel_y = center_from_hinge + y
            add_box(f"SM_DoorPanel_{y:+.2f}_{z:.2f}", (-0.053, panel_y, z), (0.018, 0.35, 0.58), materials["black"], root, DOORS_WINDOWS, bevel=0.012)
            add_box(f"SM_DoorPanelInset_{y:+.2f}_{z:.2f}", (-0.064, panel_y, z), (0.012, 0.27, 0.48), materials["wood"], root, DOORS_WINDOWS, bevel=0.008)
    add_sphere("SM_DoorKnob", (-0.095, center_from_hinge - 0.30, 1.02), (0.07, 0.07, 0.07), materials["metal"], root, DOORS_WINDOWS)
    add_collision_box("SM_WornInteriorDoor_COL", (0, center_from_hinge, 1.02), (0.12, 1.0, 2.05), root)
    return root


def build_window(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_CurtainedWindow", "lonely_house_curtained_window", "curtained-window.glb", (-ROOM_WIDTH * 0.5, 0.75, 0), DOORS_WINDOWS)
    add_box("SM_WindowDarkGlass", (0, 0, 1.38), (0.055, 1.45, 1.18), materials["glass"], root, DOORS_WINDOWS, bevel=0.005)
    for y in (-0.78, 0.78):
        add_box(f"SM_WindowFrame_V_{y:+.2f}", (-0.045, y, 1.38), (0.11, 0.12, 1.38), materials["wood"], root, DOORS_WINDOWS)
    for z in (0.76, 2.0):
        add_box(f"SM_WindowFrame_H_{z:.2f}", (-0.045, 0, z), (0.11, 1.68, 0.12), materials["wood"], root, DOORS_WINDOWS)
    add_box("SM_WindowMullion", (-0.07, 0, 1.38), (0.08, 0.06, 1.18), materials["wood"], root, DOORS_WINDOWS)
    add_box("SM_WindowCrossbar", (-0.07, 0, 1.38), (0.08, 1.45, 0.06), materials["wood"], root, DOORS_WINDOWS)
    add_cylinder("SM_CurtainRod", (-0.16, 0, 2.10), 0.025, 1.95, materials["metal"], root, DOORS_WINDOWS, rotation=(math.pi / 2, 0, 0), vertices=12)
    add_curtain("SM_Curtain_Left", (-0.17, -0.72, 1.46), 0.48, 1.42, root, DOORS_WINDOWS, materials["curtain"])
    add_curtain("SM_Curtain_Right", (-0.17, 0.72, 1.46), 0.48, 1.42, root, DOORS_WINDOWS, materials["curtain"])
    return root


def build_sofa(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_SaggingPlaidSofa", "lonely_house_plaid_sofa", "plaid-sofa.glb", (-1.65, -0.05, 0), FURNITURE)
    add_box("SM_SofaBase", (0, 0.02, 0.28), (2.35, 0.88, 0.38), materials["plaid"], root, FURNITURE, bevel=0.09)
    add_box("SM_SofaBack", (0, 0.36, 0.82), (2.22, 0.28, 0.96), materials["plaid"], root, FURNITURE, rotation=(0.08, 0, 0), bevel=0.11)
    for side in (-1, 1):
        add_box(f"SM_SofaArm_{side:+d}", (side * 1.15, -0.02, 0.55), (0.26, 0.96, 0.62), materials["plaid"], root, FURNITURE, bevel=0.11)
        add_cylinder(f"SM_SofaFoot_F_{side:+d}", (side * 0.91, -0.34, 0.09), 0.06, 0.18, materials["wood"], root, FURNITURE, vertices=12)
        add_cylinder(f"SM_SofaFoot_B_{side:+d}", (side * 0.91, 0.32, 0.09), 0.06, 0.18, materials["wood"], root, FURNITURE, vertices=12)
    for i, x in enumerate((-0.57, 0.57)):
        add_box(f"SM_SofaSeatCushion_{i}", (x, -0.11, 0.54 - i * 0.015), (1.02, 0.67, 0.20), materials["plaid"], root, FURNITURE, rotation=(0.02, 0, (-1 if i else 1) * 0.018), bevel=0.08)
        add_box(f"SM_SofaBackCushion_{i}", (x, 0.19, 0.91 - i * 0.02), (0.98, 0.22, 0.62), materials["plaid"], root, FURNITURE, rotation=(0.14, 0, (-1 if i else 1) * 0.026), bevel=0.08)
    add_box("SM_SofaPillow", (0.52, -0.21, 0.80), (0.54, 0.19, 0.46), materials["pillow"], root, FURNITURE, rotation=(0.17, -0.08, -0.14), bevel=0.08)
    add_box("SM_SofaBlanketSeat", (0.10, -0.29, 0.675), (0.86, 0.33, 0.035), materials["blanket"], root, FURNITURE, rotation=(0.04, 0.02, 0.09), bevel=0.018)
    add_box("SM_SofaBlanketDrape", (0.08, -0.48, 0.50), (0.74, 0.035, 0.48), materials["blanket"], root, FURNITURE, rotation=(0.02, 0.06, 0.07), bevel=0.018)
    add_collision_box("SM_SaggingPlaidSofa_COL", (0, 0.05, 0.45), (2.55, 1.0, 0.9), root)
    return root


def build_rug(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_WornAreaRug", "lonely_house_area_rug", "worn-area-rug.glb", (0.25, -0.30, 0), FURNITURE)
    add_box("SM_AreaRug", (0, 0, 0.018), (3.15, 2.15, 0.036), materials["rug"], root, FURNITURE, bevel=0.025)
    return root


def build_coffee_table(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_ScarredCoffeeTable", "lonely_house_coffee_table", "scarred-coffee-table.glb", (0.45, -0.55, 0), FURNITURE)
    add_box("SM_CoffeeTableTop", (0, 0, 0.51), (1.55, 0.72, 0.10), materials["wood"], root, FURNITURE, bevel=0.025)
    add_box("SM_CoffeeTableShelf", (0, 0, 0.19), (1.31, 0.55, 0.055), materials["wood"], root, FURNITURE, bevel=0.012)
    for x in (-0.65, 0.65):
        for y in (-0.27, 0.27):
            add_box(f"SM_CoffeeTableLeg_{x:+.2f}_{y:+.2f}", (x, y, 0.27), (0.10, 0.10, 0.50), materials["wood"], root, FURNITURE, bevel=0.015)
    add_collision_box("SM_ScarredCoffeeTable_COL", (0, 0, 0.31), (1.6, 0.78, 0.62), root)
    return root


def build_side_table(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_SideTable", "lonely_house_side_table", "side-table.glb", (-3.02, -0.63, 0), FURNITURE)
    add_box("SM_SideTableTop", (0, 0, 0.53), (0.72, 0.60, 0.09), materials["wood"], root, FURNITURE, bevel=0.025)
    add_box("SM_SideTableShelf", (0, 0, 0.18), (0.56, 0.46, 0.05), materials["wood"], root, FURNITURE, bevel=0.012)
    for x in (-0.28, 0.28):
        for y in (-0.22, 0.22):
            add_box(f"SM_SideTableLeg_{x:+.2f}_{y:+.2f}", (x, y, 0.27), (0.075, 0.075, 0.50), materials["wood"], root, FURNITURE, bevel=0.012)
    add_collision_box("SM_SideTable_COL", (0, 0, 0.3), (0.76, 0.64, 0.6), root)
    return root


def build_fridge(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_DirtyFridge", "lonely_house_dirty_fridge", "dirty-fridge.glb", (-2.15, 2.03, 0), KITCHEN)
    add_box("SM_FridgeBody", (0, 0, 0.95), (0.96, 0.64, 1.90), materials["enamel"], root, KITCHEN, bevel=0.035)
    add_box("SM_FridgeUpperDoor", (0, -0.332, 1.48), (0.91, 0.035, 0.75), materials["enamel"], root, KITCHEN, bevel=0.018)
    add_box("SM_FridgeLowerDoor", (0, -0.335, 0.63), (0.91, 0.035, 0.89), materials["enamel"], root, KITCHEN, bevel=0.018)
    add_box("SM_FridgeHandleUpper", (0.34, -0.385, 1.30), (0.055, 0.055, 0.38), materials["metal"], root, KITCHEN, bevel=0.015)
    add_box("SM_FridgeHandleLower", (0.34, -0.385, 0.84), (0.055, 0.055, 0.38), materials["metal"], root, KITCHEN, bevel=0.015)
    for idx, (x, z, mat) in enumerate(((-0.20, 1.55, materials["poster_red"]), (0.08, 0.57, materials["paper"]), (-0.25, 1.05, materials["poster_green"]))):
        add_box(f"SM_FridgeMagnet_{idx}", (x, -0.36, z), (0.15, 0.012, 0.17), mat, root, KITCHEN, bevel=0.003)
    add_collision_box("SM_DirtyFridge_COL", (0, 0, 0.96), (1.0, 0.68, 1.92), root)
    return root


def build_stove(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_WornStove", "lonely_house_worn_stove", "worn-stove.glb", (-0.90, 2.04, 0), KITCHEN)
    add_box("SM_StoveBody", (0, 0, 0.46), (0.86, 0.66, 0.92), materials["enamel"], root, KITCHEN, bevel=0.025)
    add_box("SM_StoveTop", (0, -0.01, 0.93), (0.88, 0.68, 0.055), materials["metal"], root, KITCHEN, bevel=0.012)
    add_box("SM_OvenDoor", (0, -0.348, 0.43), (0.72, 0.038, 0.50), materials["black"], root, KITCHEN, bevel=0.018)
    add_box("SM_OvenHandle", (0, -0.405, 0.72), (0.60, 0.06, 0.055), materials["metal"], root, KITCHEN, bevel=0.015)
    for x in (-0.23, 0.23):
        for y in (-0.18, 0.18):
            add_cylinder(f"SM_Burner_{x:+.2f}_{y:+.2f}", (x, y, 0.975), 0.14, 0.025, materials["black"], root, KITCHEN, vertices=16)
    for i, x in enumerate((-0.30, -0.10, 0.10, 0.30)):
        add_cylinder(f"SM_StoveKnob_{i}", (x, -0.37, 0.83), 0.045, 0.055, materials["black"], root, KITCHEN, rotation=(math.pi / 2, 0, 0), vertices=12)
    add_box("SM_OvenTowel", (0.16, -0.42, 0.50), (0.28, 0.025, 0.42), materials["curtain"], root, KITCHEN, bevel=0.015)
    add_collision_box("SM_WornStove_COL", (0, 0, 0.48), (0.9, 0.7, 0.96), root)
    return root


def build_cabinets(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_DarkKitchenCabinets", "lonely_house_kitchen_cabinets", "dark-kitchen-cabinets.glb", (0.40, 2.05, 0), KITCHEN)
    add_box("SM_BaseCabinetCarcass", (0, 0, 0.46), (1.55, 0.64, 0.92), materials["wood"], root, KITCHEN, bevel=0.018)
    add_box("SM_BaseCounter", (0, -0.01, 0.94), (1.66, 0.69, 0.075), materials["black"], root, KITCHEN, bevel=0.018)
    for i, x in enumerate((-0.48, 0.0, 0.48)):
        add_box(f"SM_BaseCabinetDoor_{i}", (x, -0.335, 0.42), (0.43, 0.035, 0.66), materials["wood"], root, KITCHEN, bevel=0.012)
        add_sphere(f"SM_BaseCabinetKnob_{i}", (x + 0.13, -0.37, 0.61), (0.025, 0.025, 0.025), materials["metal"], root, KITCHEN, segments=12, rings=6)
    add_box("SM_WallCabinetCarcass", (0.15, 0.10, 1.75), (1.28, 0.46, 0.72), materials["wood"], root, KITCHEN, bevel=0.018)
    for i, x in enumerate((-0.15, 0.45)):
        add_box(f"SM_WallCabinetDoor_{i}", (x, -0.145, 1.75), (0.54, 0.035, 0.62), materials["wood"], root, KITCHEN, bevel=0.012)
        add_sphere(f"SM_WallCabinetKnob_{i}", (x + (-0.18 if i else 0.18), -0.18, 1.74), (0.024, 0.024, 0.024), materials["metal"], root, KITCHEN, segments=12, rings=6)
    # Open shelf breaks the silhouette and holds a reusable clutter cluster.
    add_box("SM_OpenShelfBack", (-0.62, 0.15, 1.72), (0.35, 0.25, 0.78), materials["wood"], root, KITCHEN, bevel=0.01)
    for z in (1.42, 1.68, 1.94):
        add_box(f"SM_OpenShelf_{z:.2f}", (-0.62, -0.02, z), (0.44, 0.36, 0.045), materials["wood"], root, KITCHEN, bevel=0.008)
    add_collision_box("SM_DarkKitchenCabinets_COL", (0, 0, 0.49), (1.7, 0.72, 0.98), root)
    return root


def build_bookcase(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_PackedBookcase", "lonely_house_bookcase", "packed-bookcase.glb", (3.34, 0.55, 0), FURNITURE)
    add_box("SM_BookcaseBack", (0, 0, 1.04), (0.10, 1.50, 2.08), materials["wood"], root, FURNITURE, bevel=0.01)
    for y in (-0.72, 0.72):
        add_box(f"SM_BookcaseSide_{y:+.2f}", (-0.18, y, 1.04), (0.38, 0.10, 2.08), materials["wood"], root, FURNITURE, bevel=0.012)
    for z in (0.08, 0.54, 1.0, 1.46, 2.0):
        add_box(f"SM_BookcaseShelf_{z:.2f}", (-0.18, 0, z), (0.38, 1.52, 0.08), materials["wood"], root, FURNITURE, bevel=0.01)
    colors = (materials["paper"], materials["poster_red"], materials["poster_green"], materials["black"])
    index = 0
    for shelf_z in (0.31, 0.77, 1.23, 1.69):
        cursor = -0.60
        for _ in range(7):
            width = random.uniform(0.07, 0.14)
            height = random.uniform(0.24, 0.38)
            add_box(f"SM_Book_{index:02d}", (-0.39, cursor, shelf_z), (0.16, width, height), colors[index % len(colors)], root, FURNITURE, rotation=(0, random.uniform(-0.03, 0.03), random.uniform(-0.08, 0.08)), bevel=0.006)
            cursor += width + 0.025
            index += 1
    add_collision_box("SM_PackedBookcase_COL", (-0.18, 0, 1.04), (0.44, 1.58, 2.08), root)
    return root


def build_dresser(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_NarrowDresser", "lonely_house_narrow_dresser", "narrow-dresser.glb", (2.82, 1.62, 0), FURNITURE)
    add_box("SM_DresserBody", (0, 0, 0.55), (0.78, 0.48, 1.10), materials["wood"], root, FURNITURE, bevel=0.02)
    for i, z in enumerate((0.22, 0.52, 0.82)):
        add_box(f"SM_DresserDrawer_{i}", (0, -0.252, z), (0.66, 0.035, 0.23), materials["wood"], root, FURNITURE, bevel=0.01)
        add_sphere(f"SM_DresserKnob_{i}", (0, -0.29, z), (0.025, 0.025, 0.025), materials["metal"], root, FURNITURE, segments=12, rings=6)
    add_collision_box("SM_NarrowDresser_COL", (0, 0, 0.55), (0.82, 0.52, 1.1), root)
    return root


def add_bottle(name: str, loc: tuple[float, float, float], root: bpy.types.Object, materials, collection) -> None:
    add_cylinder(f"{name}_Body", loc, 0.055, 0.22, materials["bottle"], root, collection, vertices=12)
    add_cylinder(f"{name}_Neck", (loc[0], loc[1], loc[2] + 0.145), 0.024, 0.09, materials["bottle"], root, collection, vertices=10)
    add_cylinder(f"{name}_Cap", (loc[0], loc[1], loc[2] + 0.195), 0.026, 0.018, materials["metal"], root, collection, vertices=10)


def build_clutter(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_HouseClutterClusters", "lonely_house_clutter_clusters", "house-clutter-clusters.glb", (0, 0, 0), CLUTTER)
    add_bottle("SM_CoffeeBottle_A", (0.15, -0.63, 0.69), root, materials, CLUTTER)
    add_bottle("SM_CoffeeBottle_B", (0.65, -0.48, 0.69), root, materials, CLUTTER)
    add_torus("SM_Ashtray", (0.43, -0.76, 0.59), 0.10, 0.025, materials["ceramic"], root, CLUTTER)
    add_box("SM_Magazine_A", (0.70, -0.72, 0.585), (0.36, 0.26, 0.025), materials["paper"], root, CLUTTER, rotation=(0.02, 0.0, -0.17), bevel=0.004)
    add_box("SM_Magazine_B", (0.55, -0.70, 0.565), (0.34, 0.24, 0.025), materials["poster_red"], root, CLUTTER, rotation=(0.02, 0.0, 0.11), bevel=0.004)
    # Shelf cans and cups are combined into this cluster to keep authored placements cheap.
    for i, (x, z) in enumerate(((-0.28, 1.54), (-0.52, 1.80), (-0.79, 1.80), (-0.54, 2.05))):
        add_cylinder(f"SM_ShelfCan_{i}", (x, 1.90, z), 0.055, 0.14, materials["enamel"], root, CLUTTER, vertices=12)
    add_bottle("SM_CounterBottle", (0.82, 1.76, 1.14), root, materials, CLUTTER)
    add_box("SM_FictionalPoster_Left", (-3.50, 1.55, 1.35), (0.018, 0.56, 0.82), materials["poster_red"], root, CLUTTER, bevel=0.003)
    add_box("SM_FictionalPoster_Back", (2.86, 2.31, 1.45), (0.55, 0.018, 0.76), materials["poster_green"], root, CLUTTER, bevel=0.003)
    add_box("SM_CoatRackBoard", (-3.49, -0.12, 1.53), (0.04, 0.62, 0.13), materials["wood"], root, CLUTTER, bevel=0.008)
    for i, y in enumerate((-0.20, 0.0, 0.20)):
        add_torus(f"SM_CoatHook_{i}", (-3.44, y, 1.49), 0.045, 0.012, materials["metal"], root, CLUTTER, rotation=(0, math.pi / 2, 0))
    add_box("SM_HangingCoat", (-3.40, -0.08, 1.10), (0.12, 0.46, 0.88), materials["curtain"], root, CLUTTER, rotation=(0.0, 0.12, -0.04), bevel=0.06)
    for i, y in enumerate((-0.18, 0.16)):
        add_box(f"SM_Boot_{i}", (-3.15, y, 0.16), (0.22, 0.38, 0.30), materials["black"], root, CLUTTER, rotation=(0, 0, (-1 if i else 1) * 0.12), bevel=0.06)
    return root


def build_table_lamp(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_TableLamp", "lonely_house_table_lamp", "table-lamp.glb", (-3.02, -0.63, 0.56), LIGHT_FIXTURES)
    add_cylinder("SM_TableLampBase", (0, 0, 0.06), 0.14, 0.08, materials["metal"], root, LIGHT_FIXTURES, vertices=20)
    add_cylinder("SM_TableLampStem", (0, 0, 0.31), 0.025, 0.48, materials["metal"], root, LIGHT_FIXTURES, vertices=12)
    add_sphere("SM_TableLampBulb", (0, 0, 0.54), (0.07, 0.07, 0.10), materials["warm_emissive"], root, LIGHT_FIXTURES)
    add_cone("SM_TableLampShade", (0, 0, 0.58), 0.27, 0.16, 0.34, materials["shade"], root, LIGHT_FIXTURES)
    return root


def build_ceiling_fixture(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_BareCeilingBulb", "lonely_house_bare_bulb", "bare-ceiling-bulb.glb", (0.0, 0.35, ROOM_HEIGHT - 0.02), LIGHT_FIXTURES)
    add_cylinder("SM_CeilingBulbCanopy", (0, 0, -0.035), 0.16, 0.07, materials["metal"], root, LIGHT_FIXTURES, vertices=20)
    add_cylinder("SM_CeilingBulbSocket", (0, 0, -0.13), 0.06, 0.15, materials["black"], root, LIGHT_FIXTURES, vertices=16)
    add_sphere("SM_CeilingBulbGlass", (0, 0, -0.25), (0.09, 0.09, 0.13), materials["warm_emissive"], root, LIGHT_FIXTURES)
    return root


def build_under_cabinet_light(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = create_root("ROOT_UnderCabinetLight", "lonely_house_under_cabinet_light", "under-cabinet-light.glb", (-0.88, 1.77, 1.40), LIGHT_FIXTURES)
    add_box("SM_UnderCabinetHousing", (0, 0, 0), (0.56, 0.13, 0.07), materials["black"], root, LIGHT_FIXTURES, bevel=0.012)
    add_box("SM_UnderCabinetDiffuser", (0, -0.07, -0.005), (0.48, 0.035, 0.045), materials["warm_emissive"], root, LIGHT_FIXTURES, bevel=0.01)
    return root


def merge_asset_meshes_by_material() -> None:
    """Reduce static draw calls while retaining one editable mesh per material."""
    for root in ASSET_ROOTS:
        groups: dict[tuple[str, ...], list[bpy.types.Object]] = {}
        for obj in root.children_recursive:
            if (
                obj.type != "MESH"
                or obj.get("is_collision", False)
                or obj.get("preview_cutaway", False)
            ):
                continue
            material_key = tuple(material.name for material in obj.data.materials if material)
            groups.setdefault(material_key, []).append(obj)
        for material_key, objects in groups.items():
            if len(objects) < 2:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.hide_set(False)
                obj.select_set(True)
            active = objects[0]
            bpy.context.view_layer.objects.active = active
            bpy.ops.object.join()
            material_label = material_key[0].removeprefix("MAT_") if material_key else "Unassigned"
            active.name = f"SM_{root['asset_id']}_{material_label}"
            set_asset_flags(active)


def add_scene_light(
    name: str,
    light_type: str,
    location: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    radius: float,
    size: float = 1.0,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name=f"{name}_Data", type=light_type)
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    if hasattr(data, "shape") and light_type == "AREA":
        data.shape = "DISK"
        data.size = size
    obj = bpy.data.objects.new(name, data)
    LIGHTS.objects.link(obj)
    obj.location = location
    return obj


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_reference_and_camera() -> bpy.types.Object:
    if REFERENCE_IMAGE.exists():
        try:
            bpy.ops.object.empty_add(type="IMAGE", location=(5.8, 0.0, 1.7))
            reference = bpy.context.object
            reference.name = "REF_HouseInteriorMood"
            move_to_collection(reference, REFERENCE)
            reference.data = bpy.data.images.load(str(REFERENCE_IMAGE), check_existing=True)
            reference.empty_display_size = 2.6
            reference.rotation_euler = (math.pi / 2, 0, math.pi / 2)
            reference.hide_render = True
        except Exception as exc:
            print(f"Reference image setup skipped: {exc}")
    camera_data = bpy.data.cameras.new("CAM_HouseInteriorReference_Data")
    camera = bpy.data.objects.new("CAM_HouseInteriorReference", camera_data)
    CAMERAS.objects.link(camera)
    camera.location = (4.45, -5.45, 1.62)
    camera_data.lens = 31.0
    camera_data.sensor_width = 36.0
    camera_data.clip_start = 0.05
    camera_data.clip_end = 80.0
    look_at(camera, (-0.05, 0.52, 1.02))
    bpy.context.scene.camera = camera
    return camera


def setup_lighting() -> None:
    key = add_scene_light("LGT_CeilingBulb", "POINT", (0.0, 0.35, ROOM_HEIGHT - 0.27), 460.0, (1.0, 0.48, 0.17), 0.42)
    key.data.use_shadow = True
    lamp = add_scene_light("LGT_TableLamp", "POINT", (-3.02, -0.63, 1.08), 165.0, (1.0, 0.38, 0.12), 0.32)
    lamp.data.use_shadow = True
    task = add_scene_light("LGT_KitchenTask", "AREA", (-0.90, 1.66, 1.35), 155.0, (1.0, 0.42, 0.15), 0.26, 0.65)
    task.rotation_euler = (math.radians(68), 0, 0)
    task.data.use_shadow = True
    fill = add_scene_light("LGT_SubtleWindowFill", "AREA", (-3.22, 0.72, 1.48), 62.0, (0.20, 0.28, 0.38), 0.45, 1.20)
    fill.rotation_euler = (0, math.radians(90), 0)
    fill.data.use_shadow = True
    camera_fill = add_scene_light("LGT_CameraBounce", "AREA", (1.2, -2.0, 1.85), 230.0, (0.58, 0.25, 0.10), 0.75, 3.8)
    look_at(camera_fill, (-0.2, 0.4, 0.9))
    camera_fill.data.use_shadow = True


def configure_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.film_transparent = False
    scene.world.color = (0.004, 0.0025, 0.0015)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    try:
        scene.view_settings.view_transform = "AgX"
    except Exception:
        pass


def descendants(root: bpy.types.Object, include_collision: bool = False) -> list[bpy.types.Object]:
    result = [root]
    for child in root.children_recursive:
        if not include_collision and child.get("is_collision", False):
            continue
        result.append(child)
    return result


def select_objects(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def object_stats(root: bpy.types.Object) -> dict[str, object]:
    meshes = [obj for obj in descendants(root) if obj.type == "MESH"]
    triangles = 0
    materials: set[str] = set()
    corners: list[Vector] = []
    bpy.context.view_layer.update()
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        materials.update(mat.name for mat in obj.data.materials if mat)
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if corners:
        mins = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
        maxs = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
        bounds = [round(value, 4) for value in (maxs - mins)]
    else:
        bounds = [0.0, 0.0, 0.0]
    return {"triangles": triangles, "mesh_count": len(meshes), "materials": sorted(materials), "bounds": bounds}


def export_root(root: bpy.types.Object) -> dict[str, object]:
    original_matrix = root.matrix_world.copy()
    root.matrix_world = bpy.context.scene.cursor.matrix.copy()
    bpy.context.view_layer.update()
    stats = object_stats(root)
    selection = descendants(root)
    select_objects(selection)
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
        "url": f"/models/environment/lonely-street-house-interior/{root['export_file']}",
        **stats,
    }


def export_staged_room() -> dict[str, object]:
    selection: list[bpy.types.Object] = []
    for root in ASSET_ROOTS:
        selection.extend(descendants(root))
    selection.extend(list(LIGHTS.objects))
    # De-duplicate while preserving scene order.
    selection = list(dict.fromkeys(selection))
    select_objects(selection)
    filepath = OUTPUT_DIR / "lonely-street-house-interior-staged.glb"
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
    total_triangles = sum(item["triangles"] for item in (object_stats(root) for root in ASSET_ROOTS))
    return {
        "id": "lonely_house_interior_staged",
        "filename": filepath.name,
        "url": f"/models/environment/lonely-street-house-interior/{filepath.name}",
        "triangles": total_triangles,
        "room_dimensions_m": [ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT],
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()
    textures = create_textures()
    materials = setup_materials(textures)

    build_shell(materials)
    build_door(materials)
    build_window(materials)
    build_sofa(materials)
    build_rug(materials)
    build_coffee_table(materials)
    build_side_table(materials)
    build_fridge(materials)
    build_stove(materials)
    build_cabinets(materials)
    build_bookcase(materials)
    build_dresser(materials)
    build_clutter(materials)
    build_table_lamp(materials)
    build_ceiling_fixture(materials)
    build_under_cabinet_light(materials)
    merge_asset_meshes_by_material()
    setup_reference_and_camera()
    setup_lighting()
    configure_render()

    bpy.context.scene["asset_collection"] = "Lonely Street House Interior"
    bpy.context.scene["units"] = "meters"
    bpy.context.scene["reference_image"] = str(REFERENCE_IMAGE)
    bpy.context.scene["build_seed"] = SEED
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    asset_manifest = [export_root(root) for root in ASSET_ROOTS]
    staged = export_staged_room()
    manifest = {
        "kit_id": "lonely_street_house_interior",
        "version": 1,
        "units": "meters",
        "grid_snap_m": 0.5,
        "reference": str(REFERENCE_IMAGE),
        "assets": asset_manifest,
        "staged_room": staged,
        "collision_policy": "Simple proxies remain in the source blend; runtime collision is authored in engine metadata.",
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Render a removable-wall cutaway after exporting; the playable GLB remains fully enclosed.
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    cutaway_objects = [obj for obj in bpy.context.scene.objects if obj.get("preview_cutaway", False)]
    for obj in cutaway_objects:
        obj.hide_render = True
    bpy.ops.render.render(write_still=True)
    for obj in cutaway_objects:
        obj.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(json.dumps({
        "status": "complete",
        "asset_count": len(asset_manifest),
        "staged_triangles": staged["triangles"],
        "blend": str(BLEND_PATH),
        "preview": str(PREVIEW_PATH),
        "manifest": str(MANIFEST_PATH),
    }, indent=2))


ROOT = ensure_collection("COL_HouseInteriorKit")
REFERENCE = ensure_collection("COL_Reference", ROOT)
STRUCTURE = ensure_collection("COL_Modular_Geo", ROOT)
DOORS_WINDOWS = ensure_collection("COL_Doors_Windows", ROOT)
FURNITURE = ensure_collection("COL_Furniture", ROOT)
KITCHEN = ensure_collection("COL_Kitchen", ROOT)
CLUTTER = ensure_collection("COL_Clutter", ROOT)
LIGHT_FIXTURES = ensure_collection("COL_LightFixtures", ROOT)
COLLISION = ensure_collection("COL_Collision", ROOT)
LIGHTS = ensure_collection("COL_Lights", ROOT)
CAMERAS = ensure_collection("COL_Cameras", ROOT)
ASSET_ROOTS: list[bpy.types.Object] = []


if __name__ == "__main__":
    main()
