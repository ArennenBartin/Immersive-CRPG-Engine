"""Print a compact rig and animation summary for an FBX source file."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


def main() -> None:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(values) != 1:
        raise SystemExit("Expected: <source.fbx>")
    source = Path(values[0]).expanduser().resolve()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=str(source))

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    actions = []
    for action in bpy.data.actions:
        curves = list(getattr(action, "fcurves", []))
        if not curves:
            for layer in getattr(action, "layers", []):
                for strip in getattr(layer, "strips", []):
                    for channelbag in getattr(strip, "channelbags", []):
                        curves.extend(channelbag.fcurves)
        paths = sorted({curve.data_path for curve in curves})
        keyed_bones = sorted(
            {
                path.split('pose.bones["', 1)[1].split('"]', 1)[0]
                for path in paths
                if path.startswith('pose.bones["')
            }
        )
        actions.append(
            {
                "name": action.name,
                "frame_range": [float(value) for value in action.frame_range],
                "fcurves": len(curves),
                "keyed_bones": keyed_bones,
            }
        )

    pose_samples = []
    if armatures and actions:
        armature = armatures[0]
        if armature.animation_data is None:
            armature.animation_data_create()
        armature.animation_data.action = bpy.data.actions[actions[0]["name"]]
        sample_frames = sorted(
            {
                int(actions[0]["frame_range"][0]),
                int(sum(actions[0]["frame_range"]) / 2),
                int(actions[0]["frame_range"][1]),
            }
        )
        for frame in sample_frames:
            bpy.context.scene.frame_set(frame)
            hips = armature.pose.bones.get("mixamorig:Hips")
            world_bounds = None
            if meshes:
                evaluated = meshes[0].evaluated_get(bpy.context.evaluated_depsgraph_get())
                evaluated_mesh = evaluated.to_mesh()
                points = [evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
                world_bounds = {
                    "min": [min(point[index] for point in points) for index in range(3)],
                    "max": [max(point[index] for point in points) for index in range(3)],
                }
                evaluated.to_mesh_clear()
            pose_samples.append(
                {
                    "frame": frame,
                    "hips_location": list(hips.location) if hips else None,
                    "hips_rotation": list(hips.rotation_quaternion) if hips else None,
                    "hips_world": list((armature.matrix_world @ hips.head))
                    if hips
                    else None,
                    "mesh_world_bounds": world_bounds,
                }
            )

    summary = {
        "source": str(source),
        "fps": bpy.context.scene.render.fps,
        "frame_range": [
            bpy.context.scene.frame_start,
            bpy.context.scene.frame_end,
        ],
        "armatures": [
            {
                "name": obj.name,
                "scale": list(obj.scale),
                "rotation": list(obj.rotation_euler),
                "bone_count": len(obj.data.bones),
                "bones": [bone.name for bone in obj.data.bones],
            }
            for obj in armatures
        ],
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
            }
            for obj in meshes
        ],
        "actions": actions,
        "pose_samples": pose_samples,
    }
    print("FBX_ANIMATION_SUMMARY", json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
