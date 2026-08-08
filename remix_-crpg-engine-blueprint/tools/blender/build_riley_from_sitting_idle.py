"""Build the bundled Riley GLB from the authored Mixamo Sitting Idle FBX."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix


CLIP_NAME = "AN_Riley_SeatedIdle"
FPS = 30
TARGET_HEIGHT = 0.74


def arguments() -> tuple[Path, Path, Path]:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(values) != 3:
        raise SystemExit("Expected: <sitting-idle.fbx> <output.glb> <source.blend>")
    return tuple(Path(value).expanduser().resolve() for value in values)  # type: ignore[return-value]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def apply_object_rotation_scale(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def normalize_bind_objects(
    armature: bpy.types.Object, body: bpy.types.Object
) -> float:
    """Normalize mesh and rig together without discarding the imported action."""

    for bone in armature.pose.bones:
        bone.custom_shape = None

    body_world = body.matrix_world.copy()
    body.parent = None
    body.matrix_world = body_world
    apply_object_rotation_scale(armature)
    apply_object_rotation_scale(body)

    raw_height = max(vertex.co.z for vertex in body.data.vertices) - min(
        vertex.co.z for vertex in body.data.vertices
    )
    if raw_height <= 0:
        raise RuntimeError("Riley mesh has no measurable height")
    factor = TARGET_HEIGHT / raw_height
    armature.data.transform(Matrix.Scale(factor, 4))
    body.data.transform(Matrix.Scale(factor, 4))

    armature.matrix_world = Matrix.Identity(4)
    body.matrix_world = Matrix.Identity(4)
    body.parent = armature
    body.matrix_parent_inverse = Matrix.Identity(4)
    body.matrix_basis = Matrix.Identity(4)
    armature.data.pose_position = "POSE"
    armature.name = "Riley_Rig"
    body.name = "Riley_Body"
    bpy.context.view_layer.update()
    return factor


def action_curves(action: bpy.types.Action):
    legacy = list(getattr(action, "fcurves", []))
    if legacy:
        for curve in legacy:
            yield action, curve
        return
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for channelbag in getattr(strip, "channelbags", []):
                for curve in list(channelbag.fcurves):
                    yield channelbag, curve


def sanitize_action(action: bpy.types.Action) -> tuple[int, int, int]:
    """Remove scale keys and lock the seated root while preserving body motion."""

    start = int(round(action.frame_range[0]))
    end = int(round(action.frame_range[1]))
    hips_location_path = 'pose.bones["mixamorig:Hips"].location'
    removed_scale_curves = 0
    retained_curves = 0
    for owner, curve in list(action_curves(action)):
        if curve.data_path.endswith(".scale"):
            owner.fcurves.remove(curve)
            removed_scale_curves += 1
            continue
        if curve.data_path == hips_location_path:
            root_value = curve.evaluate(start)
            for point in curve.keyframe_points:
                point.co.y = root_value
                point.handle_left.y = root_value
                point.handle_right.y = root_value
        # The supplied clip is densely keyed at 30 FPS. Preserve linear
        # interpolation so the export follows those authored samples exactly
        # without cubic overshoot or the twitch it can introduce at joints.
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
        retained_curves += 1

    action.name = CLIP_NAME
    action.use_frame_range = True
    action.frame_start = start
    action.frame_end = end
    return start, end, retained_curves


def optimize_skin_weights(body: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(
        group_select_mode="BONE_DEFORM", limit=4
    )
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="BONE_DEFORM", lock_active=False
    )


def validate(
    armature: bpy.types.Object,
    body: bpy.types.Object,
    action: bpy.types.Action,
    start: int,
    end: int,
    retained_curves: int,
) -> None:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if meshes != [body]:
        raise RuntimeError(f"Unexpected Riley meshes: {[obj.name for obj in meshes]}")
    if len(armature.data.bones) != 49:
        raise RuntimeError(f"Expected 49 bones, found {len(armature.data.bones)}")
    if sum(1 for vertex in body.data.vertices if not vertex.groups):
        raise RuntimeError("Riley contains unweighted vertices")
    triangles = sum(len(poly.vertices) - 2 for poly in body.data.polygons)
    if triangles > 10_000:
        raise RuntimeError(f"Riley exceeds triangle budget: {triangles}")
    scale_curves = [
        curve.data_path
        for _, curve in action_curves(action)
        if curve.data_path.endswith(".scale")
    ]
    if scale_curves:
        raise RuntimeError("Riley animation still contains bone scale keys")
    print(
        "RILEY_SITTING_IDLE_VALIDATION",
        json.dumps(
            {
                "meshes": 1,
                "bones": 49,
                "vertices": len(body.data.vertices),
                "triangles": triangles,
                "materials": len(body.data.materials),
                "clip": CLIP_NAME,
                "frames": end - start + 1,
                "fps": FPS,
                "retained_fcurves": retained_curves,
                "root_motion": "locked to authored seated anchor",
            },
            sort_keys=True,
        ),
    )


def main() -> None:
    source_path, output_path, blend_path = arguments()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    clear_scene()
    bpy.ops.import_scene.fbx(filepath=str(source_path))

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1 or len(meshes) != 1:
        raise RuntimeError(
            f"Expected one armature and mesh, found {len(armatures)} / {len(meshes)}"
        )
    armature = armatures[0]
    body = meshes[0]
    if armature.animation_data is None or armature.animation_data.action is None:
        raise RuntimeError("Sitting Idle FBX has no active action")
    action = armature.animation_data.action

    normalize_bind_objects(armature, body)
    optimize_skin_weights(body)
    start, end, retained_curves = sanitize_action(action)
    armature.animation_data.action = action

    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = start
    bpy.context.scene.frame_end = end
    bpy.context.scene.frame_set(start)
    validate(armature, body, action, start, end, retained_curves)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=False,
        export_frame_range=True,
        export_frame_step=1,
        export_skins=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_yup=True,
        export_apply=False,
    )
    print("RILEY_SITTING_IDLE_EXPORT", output_path, output_path.stat().st_size)


if __name__ == "__main__":
    main()
