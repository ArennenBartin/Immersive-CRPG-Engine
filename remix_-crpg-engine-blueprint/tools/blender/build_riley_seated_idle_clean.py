"""Build Riley's contact-locked seated idle from her original weighted FBX.

The mesh and armature must be normalized together. Applying only the armature's
FBX import transform invalidates the skin inverse-bind matrices and produces the
stretched sleeves / exploding limbs seen in earlier exports.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


CLIP_NAME = "AN_Riley_SeatedIdle"
FPS = 30
START_FRAME = 1
END_FRAME = 91
TARGET_HEIGHT = 0.74


def arguments() -> tuple[Path, Path, Path]:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(values) != 3:
        raise SystemExit("Expected: <bind.fbx> <output.glb> <source.blend>")
    return tuple(Path(value).expanduser().resolve() for value in values)  # type: ignore[return-value]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def require_bone(armature: bpy.types.Object, name: str):
    bone = armature.pose.bones.get(name)
    if bone is None:
        raise RuntimeError(f"Missing Riley bone: {name}")
    return bone


def apply_object_rotation_scale(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def normalize_bind_objects(
    armature: bpy.types.Object, body: bpy.types.Object
) -> None:
    if armature.animation_data:
        armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.custom_shape = None

    # Detach the body while preserving its world transform, then bake the FBX
    # rotation/scale into *both* skin participants. This keeps the imported
    # vertex weights and inverse-bind matrices in one coordinate system.
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
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()


def optimize_skin_weights(body: bpy.types.Object) -> None:
    """Match the browser renderer's four-influence skinning budget."""

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(
        group_select_mode="BONE_DEFORM", limit=4
    )
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="BONE_DEFORM", lock_active=False
    )


def bake_two_bone_ik(
    armature: bpy.types.Object,
    end_bone_name: str,
    target_position: Vector,
    pole_position: Vector,
    pole_angle_degrees: float,
) -> None:
    end_bone = require_bone(armature, end_bone_name)
    chain = [end_bone]
    parent = end_bone.parent
    while parent and len(chain) < 2:
        chain.append(parent)
        parent = parent.parent

    target = bpy.data.objects.new(f"TMP_{end_bone_name}_Target", None)
    target.location = target_position
    bpy.context.scene.collection.objects.link(target)
    pole = bpy.data.objects.new(f"TMP_{end_bone_name}_Pole", None)
    pole.location = pole_position
    bpy.context.scene.collection.objects.link(pole)

    constraint = end_bone.constraints.new(type="IK")
    constraint.target = target
    constraint.pole_target = pole
    constraint.chain_count = 2
    constraint.iterations = 128
    constraint.use_stretch = False
    constraint.pole_angle = math.radians(pole_angle_degrees)
    bpy.context.view_layer.update()

    solved = {bone.name: bone.matrix.copy() for bone in chain}
    end_bone.constraints.remove(constraint)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole, do_unlink=True)

    for bone in reversed(chain):
        bone.matrix = solved[bone.name]
        bpy.context.view_layer.update()


def author_seated_pose(armature: bpy.types.Object) -> None:
    bpy.context.scene.frame_set(START_FRAME)
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_quaternion = Quaternion()
        bone.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()
    hips = require_bone(armature, "mixamorig:Hips")
    hips.location = Vector((0.0, 0.0, -0.105))
    hips.rotation_quaternion = Quaternion(
        (1.0, 0.0, 0.0), math.radians(-4.0)
    )

    for name, degrees in (
        ("mixamorig:Spine", 2.0),
        ("mixamorig:Spine1", 4.0),
        ("mixamorig:Spine2", -2.0),
    ):
        require_bone(armature, name).rotation_quaternion = Quaternion(
            (1.0, 0.0, 0.0), math.radians(degrees)
        )
    bpy.context.view_layer.update()

    # Bring both ankles forward and down. These non-stretching IK solves are
    # baked immediately to ordinary FK so runtime playback has no IK state.
    for side, x, pole_angle in (
        ("Left", 0.050, -90.0),
        ("Right", -0.050, 90.0),
    ):
        bake_two_bone_ik(
            armature,
            f"mixamorig:{side}Leg",
            Vector((x, -0.155, 0.075)),
            Vector((x, -0.46, 0.29)),
            pole_angle,
        )
        foot = require_bone(armature, f"mixamorig:{side}Foot")
        foot.rotation_quaternion = (
            foot.rotation_quaternion
            @ Quaternion((1.0, 0.0, 0.0), math.radians(-3.0))
        ).normalized()

    # Rest each hand naturally on the upper part of its matching thigh. The
    # former mid-thigh targets almost straightened Riley's elbows, which read
    # as two rigid arms hanging beside her body in the game camera.
    # from Riley's own posed proportions, avoiding copied transforms and
    # preventing the arms from stretching through the sofa.
    for side, sign, pole_angle in (
        ("Left", 1.0, -90.0),
        ("Right", -1.0, 90.0),
    ):
        upper = require_bone(armature, f"mixamorig:{side}Arm")
        thigh = require_bone(armature, f"mixamorig:{side}UpLeg")
        hand_target = armature.matrix_world @ thigh.head.lerp(thigh.tail, 0.24)
        hand_target += Vector((0.016 * sign, -0.028, 0.038))
        elbow_pole = armature.matrix_world @ upper.head
        elbow_pole += Vector((0.22 * sign, 0.02, -0.04))
        bake_two_bone_ik(
            armature,
            f"mixamorig:{side}ForeArm",
            hand_target,
            elbow_pole,
            pole_angle,
        )
        hand = require_bone(armature, f"mixamorig:{side}Hand")
        hand.rotation_quaternion = (
            hand.rotation_quaternion
            @ Quaternion(
                (0.0, 1.0, 0.0),
                math.radians(-7.0 if side == "Left" else 7.0),
            )
        ).normalized()
    bpy.context.view_layer.update()


def build_idle(armature: bpy.types.Object) -> bpy.types.Action:
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = None
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    action = bpy.data.actions.new(CLIP_NAME)
    armature.animation_data.action = action

    keyed_bones = (
        "mixamorig:Hips",
        "mixamorig:Spine",
        "mixamorig:Spine1",
        "mixamorig:Spine2",
        "mixamorig:Neck",
        "mixamorig:Head",
        "mixamorig:LeftUpLeg",
        "mixamorig:LeftLeg",
        "mixamorig:LeftFoot",
        "mixamorig:RightUpLeg",
        "mixamorig:RightLeg",
        "mixamorig:RightFoot",
        "mixamorig:LeftArm",
        "mixamorig:LeftForeArm",
        "mixamorig:LeftHand",
        "mixamorig:RightArm",
        "mixamorig:RightForeArm",
        "mixamorig:RightHand",
    )
    base_locations = {
        name: require_bone(armature, name).location.copy() for name in keyed_bones
    }
    base_rotations = {
        name: require_bone(armature, name).rotation_quaternion.copy()
        for name in keyed_bones
    }

    def key_pose(frame: int, deltas: dict[str, Quaternion] | None = None) -> None:
        deltas = deltas or {}
        bpy.context.scene.frame_set(frame)
        for name in keyed_bones:
            bone = require_bone(armature, name)
            bone.rotation_mode = "QUATERNION"
            bone.location = base_locations[name]
            bone.rotation_quaternion = (
                base_rotations[name] @ deltas.get(name, Quaternion())
            ).normalized()
            bone.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=bone.name
            )
        require_bone(armature, "mixamorig:Hips").keyframe_insert(
            data_path="location", frame=frame, group="mixamorig:Hips"
        )

    key_pose(START_FRAME)
    key_pose(
        31,
        {
            "mixamorig:Spine1": Quaternion(
                (1.0, 0.0, 0.0), math.radians(-0.35)
            ),
            "mixamorig:Spine2": Quaternion(
                (1.0, 0.0, 0.0), math.radians(0.65)
            ),
            "mixamorig:Head": Quaternion(
                (0.0, 1.0, 0.0), math.radians(-2.2)
            ),
            "mixamorig:LeftArm": Quaternion(
                (1.0, 0.0, 0.0), math.radians(0.45)
            ),
            "mixamorig:RightArm": Quaternion(
                (1.0, 0.0, 0.0), math.radians(0.45)
            ),
            "mixamorig:LeftForeArm": Quaternion(
                (0.0, 1.0, 0.0), math.radians(-0.35)
            ),
            "mixamorig:RightForeArm": Quaternion(
                (0.0, 1.0, 0.0), math.radians(0.35)
            ),
        },
    )
    key_pose(
        61,
        {
            "mixamorig:Spine1": Quaternion(
                (1.0, 0.0, 0.0), math.radians(0.25)
            ),
            "mixamorig:Spine2": Quaternion(
                (1.0, 0.0, 0.0), math.radians(-0.3)
            ),
            "mixamorig:Neck": Quaternion(
                (0.0, 1.0, 0.0), math.radians(0.65)
            ),
            "mixamorig:Head": Quaternion(
                (0.0, 1.0, 0.0), math.radians(2.8)
            ),
            "mixamorig:LeftArm": Quaternion(
                (1.0, 0.0, 0.0), math.radians(-0.35)
            ),
            "mixamorig:RightArm": Quaternion(
                (1.0, 0.0, 0.0), math.radians(-0.35)
            ),
            "mixamorig:LeftForeArm": Quaternion(
                (0.0, 1.0, 0.0), math.radians(0.25)
            ),
            "mixamorig:RightForeArm": Quaternion(
                (0.0, 1.0, 0.0), math.radians(-0.25)
            ),
        },
    )
    key_pose(END_FRAME)
    action.use_frame_range = True
    action.frame_start = START_FRAME
    action.frame_end = END_FRAME
    return action


def validate(armature: bpy.types.Object, body: bpy.types.Object) -> None:
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
    print(
        "RILEY_VALIDATION",
        {
            "meshes": 1,
            "bones": 49,
            "vertices": len(body.data.vertices),
            "triangles": triangles,
            "materials": len(body.data.materials),
            "clip": CLIP_NAME,
            "frames": END_FRAME - START_FRAME + 1,
            "fps": FPS,
        },
    )


def main() -> None:
    fbx_path, output_path, blend_path = arguments()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    clear_scene()
    bpy.ops.import_scene.fbx(filepath=str(fbx_path))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    body = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    normalize_bind_objects(armature, body)
    optimize_skin_weights(body)
    author_seated_pose(armature)

    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = START_FRAME
    bpy.context.scene.frame_end = END_FRAME
    build_idle(armature)
    bpy.context.scene.frame_set(START_FRAME)
    validate(armature, body)
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
        # Sampling the complete rig regenerates every Mixamo limb track and
        # can invalidate the stable seated bind pose. Export only the five
        # deliberate contact-safe root/torso/head tracks above.
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
    print("RILEY_EXPORT", output_path, output_path.stat().st_size)


if __name__ == "__main__":
    main()
