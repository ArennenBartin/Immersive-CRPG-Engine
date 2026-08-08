"""Render neutral front/side QA views of Riley seated on the authored sofa."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args() -> tuple[Path, Path, Path]:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(values) != 3:
        raise SystemExit("Expected: <riley.glb> <sofa.glb> <output-dir>")
    return tuple(Path(value).expanduser().resolve() for value in values)  # type: ignore[return-value]


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name: str, color: tuple[float, float, float, float], roughness=0.8):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def main() -> None:
    riley_path, sofa_path, output_dir = args()
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    bpy.ops.import_scene.gltf(filepath=str(sofa_path))
    sofa_objects = list(bpy.context.selected_objects)
    for obj in sofa_objects:
        obj.name = f"SOFA_{obj.name}"

    before_riley = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(riley_path))
    riley_objects = [
        obj for obj in bpy.context.scene.objects if obj not in before_riley
    ]
    for obj in riley_objects:
        if obj.name == "Icosphere" or obj.name.startswith("Icosphere"):
            obj.hide_render = True

    # Runtime transforms the imported scene root once. Applying the same
    # placement to every parented mesh/bone object compounds translations and
    # gives misleading QA renders, so reproduce the runtime hierarchy here.
    riley_set = set(riley_objects)
    riley_roots = [obj for obj in riley_objects if obj.parent not in riley_set]
    preview_root = bpy.data.objects.new("RILEY_PREVIEW_ROOT", None)
    bpy.context.scene.collection.objects.link(preview_root)
    for obj in riley_roots:
        world = obj.matrix_world.copy()
        obj.parent = preview_root
        obj.matrix_world = world
    preview_root.scale = (2.2, 2.2, 2.2)
    # Match the engine placement relative to the sofa: the left cushion is
    # centered at X=-0.57 / Blender Y=-0.11. Riley's root at Blender Y=-0.10
    # keeps her hips centered over it while her lower legs clear the front.
    # Runtime contributes 0.05 from the authored floor plus the explicit 0.39
    # presentation lift, placing her pelvis into the cushion's soft top.
    preview_root.location = (-0.57, -0.10, 0.44)

    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = 720
    bpy.context.scene.render.resolution_y = 720
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.world.color = (0.025, 0.025, 0.035)

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.015))
    floor = bpy.context.object
    floor.data.materials.append(material("QA_Floor", (0.07, 0.075, 0.09, 1)))

    bpy.ops.object.light_add(type="AREA", location=(-1.6, -2.6, 3.3))
    key = bpy.context.object
    key.data.energy = 850
    key.data.shape = "DISK"
    key.data.size = 3.2
    key.data.color = (1.0, 0.78, 0.61)
    look_at(key, Vector((-0.4, -0.1, 0.65)))

    bpy.ops.object.light_add(type="AREA", location=(2.2, -0.5, 2.1))
    fill = bpy.context.object
    fill.data.energy = 500
    fill.data.size = 2.5
    fill.data.color = (0.58, 0.72, 1.0)
    look_at(fill, Vector((-0.4, -0.1, 0.6)))

    bpy.ops.object.light_add(type="AREA", location=(-1.1, 2.3, 2.7))
    rim = bpy.context.object
    rim.data.energy = 700
    rim.data.size = 2.0
    rim.data.color = (1.0, 0.5, 0.28)
    look_at(rim, Vector((-0.4, 0.0, 0.65)))

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.lens = 55
    bpy.context.scene.camera = camera

    views = {
        "front": (Vector((-0.55, -4.0, 1.45)), Vector((-0.55, 0.0, 0.62))),
        "front_three_quarter": (
            Vector((2.9, -3.6, 1.55)),
            Vector((-0.35, -0.05, 0.62)),
        ),
        "side": (Vector((-3.7, -0.25, 1.35)), Vector((-0.55, -0.02, 0.58))),
    }

    bpy.context.scene.frame_set(1)
    for name, (location, target) in views.items():
        camera.location = location
        look_at(camera, target)
        bpy.context.scene.render.filepath = str(output_dir / f"riley_sofa_{name}.png")
        bpy.ops.render.render(write_still=True)

    bpy.context.scene.frame_set(46)
    camera.location = views["front_three_quarter"][0]
    look_at(camera, views["front_three_quarter"][1])
    bpy.context.scene.render.filepath = str(output_dir / "riley_sofa_idle_mid.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
