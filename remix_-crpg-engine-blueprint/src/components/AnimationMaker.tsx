import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import {
  Bone,
  ChevronRight,
  CircleDot,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Hand,
  Link2,
  Pause,
  Play,
  Plus,
  RotateCw,
  Save,
  Scissors,
  Square,
  Trash2,
} from "lucide-react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEngineStore } from "../store/engineStore";
import type {
  AnimationActionBindingData,
  AuthoredAnimationClipData,
  AuthoredAnimationInterpolation,
  AuthoredAnimationTrackData,
  ModelAnimationProfileData,
  ObjectData,
  VisualAttachmentProfileData,
  VisualAttachmentSocketData,
} from "../schema/game";
import {
  loadModelFromAssetDataUrl,
  type LoadedModelAsset,
} from "../utils/gltfModelIO";
import { compileAuthoredAnimationClip } from "../utils/modelAnimation";
import { AssetVisualAttachmentRenderer } from "./ObjectRenderers";

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type TrackProperty = AuthoredAnimationTrackData["property"];
type TrackInterpolation = Extract<
  AuthoredAnimationInterpolation,
  "linear" | "step"
>;
type AuthoredTrackDraft = AuthoredAnimationTrackData;
type AuthoredClipDraft = AuthoredAnimationClipData;
type ActionBindingDraft = AnimationActionBindingData;
type AnimationProfileDraft = ModelAnimationProfileData;
type SocketDraft = VisualAttachmentSocketData;
type AttachmentDraft = VisualAttachmentProfileData;

interface BoneInfo {
  name: string;
  parentName?: string;
  depth: number;
}

interface BonePose {
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
}

interface LoadedPreviewInfo {
  animations: THREE.AnimationClip[];
  bones: BoneInfo[];
  loaded: boolean;
  error?: string;
}

const ACTIONS: ActionBindingDraft["action"][] = [
  "idle",
  "walk",
  "attack",
  "evade",
  "hurt",
  "death",
];

const PLAYER_GUITAR_OBJECT_ID = "obj_player_electric_guitar";
const DEFAULT_FPS = 30;

const clone = <T,>(value: T): T => structuredClone(value);

const safeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "animation";

const authoredClipsFor = (object: ObjectData | null): AuthoredClipDraft[] => {
  return clone(object?.asset?.authored_animation_clips || []);
};

const animationProfileFor = (object: ObjectData | null): AnimationProfileDraft => {
  const existing = object?.asset?.animation_profile;
  return existing
    ? clone(existing)
    : {
        id: `profile_${safeId(object?.display_name || "model")}`,
        display_name: `${object?.display_name || "Model"} animation profile`,
        default_clip_id: undefined,
        root_node_name: "mixamorigHips",
        action_bindings: [],
      };
};

const makeEmptyClip = (name: string, durationFrames = DEFAULT_FPS): AuthoredClipDraft => ({
  id: `anim_${safeId(name)}_${Date.now()}`,
  name: safeId(name),
  display_name: name,
  kind: "custom",
  value_mode: "absolute",
  fps: DEFAULT_FPS,
  duration_frames: durationFrames,
  revision: 1,
  loop: "repeat",
  tracks: [],
});

const propertyValueSize = (property: TrackProperty) =>
  property === "quaternion" ? 4 : 3;

const finiteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizedQuaternionValue = (value: readonly number[]): Quat => {
  const quaternion = new THREE.Quaternion(
    finiteNumber(value[0]),
    finiteNumber(value[1]),
    finiteNumber(value[2]),
    finiteNumber(value[3], 1),
  );
  if (quaternion.lengthSq() < 1e-8) quaternion.identity();
  quaternion.normalize();
  return quaternion.toArray() as Quat;
};

const normalizedVectorValue = (value: readonly number[]): Vec3 => [
  finiteNumber(value[0]),
  finiteNumber(value[1]),
  finiteNumber(value[2]),
];

const normalizedNodeName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const findRigBone = (
  root: THREE.Object3D,
  side: "left" | "right",
  segment: "shoulder" | "arm" | "forearm" | "hand",
) => {
  const suffix = `${side}${segment}`;
  let match: THREE.Bone | null = null;
  root.traverse((node) => {
    if (match || !(node as THREE.Bone).isBone) return;
    if (normalizedNodeName(node.name).endsWith(suffix)) {
      match = node as THREE.Bone;
    }
  });
  return match;
};

const normalizedQuaternionKeyframes = (
  keyframes: Array<{ frame: number; value: readonly number[] }>,
) => {
  let previous: Quat | null = null;
  return keyframes.map((keyframe) => {
    let value = normalizedQuaternionValue(keyframe.value);
    if (
      previous &&
      previous[0] * value[0] +
        previous[1] * value[1] +
        previous[2] * value[2] +
        previous[3] * value[3] <
        0
    ) {
      value = [-value[0], -value[1], -value[2], -value[3]];
    }
    previous = value;
    return { frame: keyframe.frame, value };
  });
};

const normalizeFrame = (frame: number, clip: AuthoredClipDraft) =>
  Math.max(0, Math.min(clip.duration_frames, Math.round(frame)));

const normalizedKeyframes = (
  keyframes: Array<{ frame: number; value: readonly number[] }>,
  clip: AuthoredClipDraft,
) => {
  const byFrame = new Map<number, { frame: number; value: number[] }>();
  keyframes.forEach((keyframe) => {
    byFrame.set(normalizeFrame(keyframe.frame, clip), {
      frame: normalizeFrame(keyframe.frame, clip),
      value: [...keyframe.value],
    });
  });
  return [...byFrame.values()].sort((left, right) => left.frame - right.frame);
};

// Preview and runtime intentionally use the same compiler so additive blend
// mode, quaternion slerp continuity, and gameplay root filtering cannot drift.
const toThreeClip = (clip: AuthoredClipDraft): THREE.AnimationClip =>
  compileAuthoredAnimationClip(clip);

const splitTrackName = (
  name: string,
): { target: string; property: TrackProperty } | null => {
  const match = name.match(/^(.*)\.(position|quaternion|scale)$/);
  if (!match) return null;
  return { target: match[1], property: match[2] as TrackProperty };
};

const importedClipToDraft = (
  source: THREE.AnimationClip,
  displayName = `${source.name || "Imported"} editable`,
): AuthoredClipDraft => {
  const fps = DEFAULT_FPS;
  return {
    id: `anim_${safeId(displayName)}_${Date.now()}`,
    name: safeId(displayName),
    display_name: displayName,
    kind: "custom",
    value_mode: "absolute",
    fps,
    duration_frames: Math.max(1, Math.ceil(source.duration * fps)),
    revision: 1,
    loop: "repeat",
    tracks: source.tracks.flatMap((track) => {
      const target = splitTrackName(track.name);
      if (!target) return [];
      const valueSize = propertyValueSize(target.property);
      const keyframes = Array.from(track.times).map((time, index) => ({
        frame: Math.round(time * fps),
        value: Array.from(track.values).slice(
          index * valueSize,
          index * valueSize + valueSize,
        ),
      }));
      const safeKeyframes =
        target.property === "quaternion"
          ? normalizedQuaternionKeyframes(keyframes)
          : keyframes.map((keyframe) => ({
              ...keyframe,
              value: normalizedVectorValue(keyframe.value),
            }));
      return [
        {
          id: `track_${safeId(target.target)}_${target.property}_${Date.now()}_${source.tracks.indexOf(track)}`,
          target_node: target.target,
          property: target.property,
          interpolation:
            track.getInterpolation() === THREE.InterpolateDiscrete
              ? "step"
              : "linear",
          keyframes: safeKeyframes,
        } as AuthoredTrackDraft,
      ];
    }),
  };
};

const upsertTrackKeyframe = (
  clip: AuthoredClipDraft,
  targetNode: string,
  property: TrackProperty,
  frame: number,
  value: number[],
  interpolation: TrackInterpolation,
): AuthoredClipDraft => {
  const next = clone(clip);
  const normalized = normalizeFrame(frame, next);
  const safeValue =
    property === "quaternion"
      ? normalizedQuaternionValue(value)
      : normalizedVectorValue(value);
  let track = next.tracks.find(
    (candidate) =>
      candidate.target_node === targetNode && candidate.property === property,
  );
  if (!track) {
    track = {
      id: `track_${safeId(targetNode)}_${property}_${Date.now()}`,
      target_node: targetNode,
      property,
      interpolation,
      keyframes: [],
    } as AuthoredTrackDraft;
    next.tracks.push(track);
  }
  track.interpolation = interpolation;
  track.keyframes = normalizedKeyframes(
    [
      ...track.keyframes.filter((keyframe) => keyframe.frame !== normalized),
      { frame: normalized, value: safeValue },
    ],
    next,
  ) as typeof track.keyframes;
  track.keyframes = (property === "quaternion"
    ? normalizedQuaternionKeyframes(track.keyframes)
    : track.keyframes) as typeof track.keyframes;
  next.revision += 1;
  return next;
};

const removeBoneKeyframe = (
  clip: AuthoredClipDraft,
  targetNode: string,
  frame: number,
): AuthoredClipDraft => {
  const next = clone(clip);
  const normalized = normalizeFrame(frame, next);
  next.tracks = next.tracks
    .map((track) =>
      track.target_node === targetNode
        ? {
            ...track,
            keyframes: track.keyframes.filter(
              (keyframe) => keyframe.frame !== normalized,
            ),
          }
        : track,
    )
    .filter((track) => track.keyframes.length > 0) as AuthoredTrackDraft[];
  next.revision += 1;
  return next;
};

const moveBoneKeyframe = (
  clip: AuthoredClipDraft,
  targetNode: string,
  sourceFrame: number,
  destinationFrame: number,
): AuthoredClipDraft => {
  const next = clone(clip);
  const source = normalizeFrame(sourceFrame, next);
  const destination = normalizeFrame(destinationFrame, next);
  if (source === destination) return next;
  next.tracks.forEach((track) => {
    if (track.target_node !== targetNode) return;
    const keyframe = track.keyframes.find((candidate) => candidate.frame === source);
    if (!keyframe) return;
    track.keyframes = [
      ...track.keyframes.filter(
        (candidate) =>
          candidate.frame !== source && candidate.frame !== destination,
      ),
      { ...keyframe, frame: destination },
    ].sort((left, right) => left.frame - right.frame) as typeof track.keyframes;
  });
  next.revision += 1;
  return next;
};

const keyframeValueAtOrBefore = (
  clip: AuthoredClipDraft,
  targetNode: string,
  property: TrackProperty,
  frame: number,
) => {
  const track = clip.tracks.find(
    (candidate) =>
      candidate.target_node === targetNode && candidate.property === property,
  );
  return track?.keyframes
    .filter((keyframe) => keyframe.frame <= frame)
    .sort((left, right) => right.frame - left.frame)[0]?.value;
};

const defaultSocket = (boneName = ""): SocketDraft => ({
  bone_name: boneName,
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: [1, 1, 1],
});

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

interface AnimationPreviewHandle {
  readBonePose: (boneName: string) => BonePose | null;
  writeBonePose: (boneName: string, pose: BonePose) => void;
  bakeHandIk: (side: "left" | "right", target: Vec3) => Record<string, BonePose>;
}

function AssetPreviewScene({
  object,
  authoredClip,
  sourceClipName,
  frame,
  playing,
  loop,
  selectedBoneName,
  showSkeleton,
  transformMode,
  onFrameChange,
  onLoaded,
  onBonePoseChange,
  onBonePoseCommit,
  previewRef,
  attachment,
  attachmentObject,
}: {
  object: ObjectData;
  authoredClip: AuthoredClipDraft | null;
  sourceClipName: string | null;
  frame: number;
  playing: boolean;
  loop: boolean;
  selectedBoneName: string | null;
  showSkeleton: boolean;
  transformMode: "translate" | "rotate" | "scale";
  onFrameChange: (frame: number) => void;
  onLoaded: (info: LoadedPreviewInfo) => void;
  onBonePoseChange: (pose: BonePose) => void;
  onBonePoseCommit: (pose: BonePose) => void;
  previewRef: React.MutableRefObject<AnimationPreviewHandle | null>;
  attachment?: AttachmentDraft | null;
  attachmentObject?: ObjectData;
}) {
  const [loadedAsset, setLoadedAsset] = useState<LoadedModelAsset | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const baseActionRef = useRef<THREE.AnimationAction | null>(null);
  const skeletonHelper = useMemo(
    () => (scene ? new THREE.SkeletonHelper(scene) : null),
    [scene],
  );
  const frameRef = useRef(frame);
  const lastReportedFrameRef = useRef(-1);
  const onFrameChangeRef = useRef(onFrameChange);
  const selectedBone = useMemo(
    () =>
      selectedBoneName && scene
        ? (scene.getObjectByName(selectedBoneName) as THREE.Bone | undefined) || null
        : null,
    [scene, selectedBoneName],
  );

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    onFrameChangeRef.current = onFrameChange;
  }, [onFrameChange]);

  useEffect(() => {
    let cancelled = false;
    setLoadedAsset(null);
    setScene(null);
    if (!object.asset) return;
    loadModelFromAssetDataUrl(object.asset)
      .then((loaded) => {
        if (cancelled) return;
        const cloned = cloneSkeleton(loaded.scene) as THREE.Group;
        cloned.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        sceneRef.current = cloned;
        setLoadedAsset(loaded);
        setScene(cloned);
        const bones: BoneInfo[] = [];
        const visit = (node: THREE.Object3D, boneDepth: number) => {
          const nextDepth = (node as THREE.Bone).isBone ? boneDepth + 1 : boneDepth;
          if ((node as THREE.Bone).isBone) {
            bones.push({
              name: node.name,
              parentName: (node.parent as THREE.Bone | null)?.isBone
                ? node.parent?.name
                : undefined,
              depth: Math.max(0, nextDepth - 1),
            });
          }
          node.children.forEach((child) => visit(child, nextDepth));
        };
        visit(cloned, -1);
        onLoaded({ animations: loaded.animations, bones, loaded: true });
      })
      .catch((error) => {
        if (!cancelled) {
          onLoaded({
            animations: [],
            bones: [],
            loaded: true,
            error: error instanceof Error ? error.message : "Could not load model",
          });
        }
      });
    return () => {
      cancelled = true;
      sceneRef.current = null;
    };
  }, [object.id, object.asset?.data_url, object.asset?.filename, onLoaded]);

  const activeClip = useMemo(() => {
    if (authoredClip) return toThreeClip(authoredClip);
    if (!sourceClipName) return null;
    return (
      loadedAsset?.animations.find((clip) => clip.name === sourceClipName) ||
      null
    );
  }, [authoredClip, loadedAsset, sourceClipName]);

  const baseClip = useMemo(() => {
    if (!authoredClip || authoredClip.value_mode !== "additive") return null;
    const asset = object.asset;
    const preferredIds = [
      asset?.animation_profile?.default_clip_id,
      asset?.animation_profile?.action_bindings.find(
        (binding) => binding.action === "idle",
      )?.clip_id,
      asset?.animation?.clip_name,
    ].filter((value): value is string => Boolean(value));
    for (const id of preferredIds) {
      const authoredBase = asset?.authored_animation_clips?.find(
        (candidate) =>
          candidate.id === id &&
          candidate.id !== authoredClip.id &&
          candidate.value_mode !== "additive",
      );
      if (authoredBase) return toThreeClip(authoredBase);
      const importedBase = loadedAsset?.animations.find(
        (candidate) => candidate.name === id,
      );
      if (importedBase) return importedBase;
    }
    return loadedAsset?.animations[0] || null;
  }, [authoredClip, loadedAsset, object.asset]);

  useEffect(() => {
    const activeScene = sceneRef.current;
    if (!activeScene) return;
    const mixer = new THREE.AnimationMixer(activeScene);
    mixerRef.current = mixer;
    if (baseClip) {
      const baseAction = mixer.clipAction(baseClip);
      baseAction.enabled = true;
      baseAction.clampWhenFinished = false;
      baseAction.setLoop(THREE.LoopRepeat, Infinity);
      baseAction.setEffectiveWeight(1);
      baseAction.reset().play();
      baseActionRef.current = baseAction;
    }
    if (activeClip) {
      const action = mixer.clipAction(activeClip);
      action.enabled = true;
      action.clampWhenFinished = !loop;
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.reset().play();
      actionRef.current = action;
      mixer.setTime(frameRef.current / (authoredClip?.fps || DEFAULT_FPS));
    }
    return () => {
      actionRef.current = null;
      baseActionRef.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(activeScene);
      if (mixerRef.current === mixer) mixerRef.current = null;
    };
  }, [activeClip, authoredClip?.fps, baseClip, loop, scene]);

  useEffect(() => {
    if (playing || !mixerRef.current) return;
    mixerRef.current.setTime(frame / (authoredClip?.fps || DEFAULT_FPS));
    if (selectedBone) {
      onBonePoseChange({
        position: selectedBone.position.toArray() as Vec3,
        quaternion: normalizedQuaternionValue(selectedBone.quaternion.toArray()),
        scale: selectedBone.scale.toArray() as Vec3,
      });
    }
  }, [authoredClip?.fps, frame, onBonePoseChange, playing, selectedBone]);

  useEffect(() => {
    return () => {
      skeletonHelper?.geometry.dispose();
      if (Array.isArray(skeletonHelper?.material)) {
        skeletonHelper.material.forEach((material) => material.dispose());
      } else {
        skeletonHelper?.material.dispose();
      }
    };
  }, [skeletonHelper]);

  const readPose = useCallback((boneName: string): BonePose | null => {
    const bone = sceneRef.current?.getObjectByName(boneName) as
      | THREE.Bone
      | undefined;
    if (!bone?.isBone) return null;
    return {
      position: bone.position.toArray() as Vec3,
      quaternion: normalizedQuaternionValue(bone.quaternion.toArray()),
      scale: bone.scale.toArray() as Vec3,
    };
  }, []);

  const writePose = useCallback((boneName: string, pose: BonePose) => {
    const bone = sceneRef.current?.getObjectByName(boneName) as
      | THREE.Bone
      | undefined;
    if (!bone?.isBone) return;
    bone.position.fromArray(pose.position);
    bone.quaternion.fromArray(normalizedQuaternionValue(pose.quaternion));
    bone.scale.fromArray(pose.scale);
    bone.updateMatrixWorld(true);
  }, []);

  const bakeHandIk = useCallback(
    (side: "left" | "right", target: Vec3): Record<string, BonePose> => {
      const root = sceneRef.current;
      if (!root) return {};
      const chain = (["shoulder", "arm", "forearm", "hand"] as const)
        .map((segment) => findRigBone(root, side, segment))
        .filter((bone): bone is THREE.Bone => Boolean(bone));
      if (chain.length < 3) return {};
      const hand = chain[chain.length - 1];
      const worldTarget = new THREE.Vector3(...target);
      root.localToWorld(worldTarget);
      const jointPosition = new THREE.Vector3();
      const handPosition = new THREE.Vector3();
      const toHand = new THREE.Vector3();
      const toTarget = new THREE.Vector3();
      const worldDelta = new THREE.Quaternion();
      const parentWorld = new THREE.Quaternion();
      const localDelta = new THREE.Quaternion();

      for (let iteration = 0; iteration < 8; iteration += 1) {
        for (let index = chain.length - 2; index >= 0; index -= 1) {
          const joint = chain[index];
          root.updateMatrixWorld(true);
          joint.getWorldPosition(jointPosition);
          hand.getWorldPosition(handPosition);
          toHand.subVectors(handPosition, jointPosition).normalize();
          toTarget.subVectors(worldTarget, jointPosition).normalize();
          if (toHand.lengthSq() < 0.0001 || toTarget.lengthSq() < 0.0001) continue;
          worldDelta.setFromUnitVectors(toHand, toTarget);
          joint.parent?.getWorldQuaternion(parentWorld);
          localDelta
            .copy(parentWorld)
            .invert()
            .multiply(worldDelta)
            .multiply(parentWorld);
          joint.quaternion.premultiply(localDelta).normalize();
        }
      }
      root.updateMatrixWorld(true);
      return Object.fromEntries(
        chain.map((bone) => [bone.name, readPose(bone.name)!]),
      );
    },
    [readPose],
  );

  useImperativeHandle(
    previewRef,
    () => ({ readBonePose: readPose, writeBonePose: writePose, bakeHandIk }),
    [bakeHandIk, readPose, writePose],
  );

  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer || !playing || !activeClip) return;
    mixer.update(Math.min(delta, 0.08));
    const fps = authoredClip?.fps || DEFAULT_FPS;
    const durationFrames = authoredClip?.duration_frames || Math.max(1, Math.ceil(activeClip.duration * fps));
    const actionTime = actionRef.current?.time || 0;
    let nextFrame = Math.round(actionTime * fps);
    if (!loop && nextFrame >= durationFrames) nextFrame = durationFrames;
    if (nextFrame !== lastReportedFrameRef.current) {
      lastReportedFrameRef.current = nextFrame;
      frameRef.current = nextFrame;
      onFrameChangeRef.current(nextFrame);
      if (selectedBone) {
        onBonePoseChange({
          position: selectedBone.position.toArray() as Vec3,
          quaternion: normalizedQuaternionValue(
            selectedBone.quaternion.toArray(),
          ),
          scale: selectedBone.scale.toArray() as Vec3,
        });
      }
    }
  });

  useEffect(() => {
    if (!selectedBone) return;
    const publish = () => {
      const pose = readPose(selectedBone.name);
      if (pose) onBonePoseChange(pose);
    };
    publish();
  }, [onBonePoseChange, readPose, selectedBone]);

  if (!scene) return null;
  const asset = object.asset!;
  return (
    <>
      <group scale={asset.scale as Vec3}>
        <primitive
          object={scene}
          position={asset.offset as Vec3}
          rotation={asset.rotation as Vec3}
        />
        {attachment && attachmentObject && (
          <AssetVisualAttachmentRenderer
            actorScene={scene}
            attachment={attachment}
            attachmentObject={attachmentObject}
            appearance="default"
            previewProgress={THREE.MathUtils.clamp(
              frame /
                Math.max(
                  1,
                  authoredClip?.duration_frames ||
                    Math.ceil((activeClip?.duration || 1) * DEFAULT_FPS),
                ),
              0,
              1,
            )}
          />
        )}
      </group>
      {showSkeleton && skeletonHelper && (
        <primitive object={skeletonHelper} />
      )}
      {selectedBone && (
        <TransformControls
          object={selectedBone}
          mode={transformMode}
          size={0.72}
          onObjectChange={() => {
            const pose = readPose(selectedBone.name);
            if (pose) onBonePoseChange(pose);
          }}
          onMouseUp={() => {
            const pose = readPose(selectedBone.name);
            if (!pose) return;
            onBonePoseChange(pose);
            onBonePoseCommit(pose);
          }}
        />
      )}
      <OrbitControls makeDefault target={[0, Math.max(0.7, object.bounds[1] * 0.5), 0]} />
    </>
  );
}

const AnimationPreview = forwardRef<
  AnimationPreviewHandle,
  Omit<React.ComponentProps<typeof AssetPreviewScene>, "previewRef">
>((props, ref) => {
  const bridgeRef = useRef<AnimationPreviewHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      readBonePose: (boneName) =>
        bridgeRef.current?.readBonePose(boneName) || null,
      writeBonePose: (boneName, pose) =>
        bridgeRef.current?.writeBonePose(boneName, pose),
      bakeHandIk: (side, target) =>
        bridgeRef.current?.bakeHandIk(side, target) || {},
    }),
    [],
  );
  return <AssetPreviewScene {...props} previewRef={bridgeRef} />;
});
AnimationPreview.displayName = "AnimationPreview";

function SmallNumber({
  value,
  onChange,
  step = 0.01,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(numberValue(event.target.value, value))}
        className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-cyan-600"
      />
    </label>
  );
}

function Vec3Input({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-neutral-400">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <SmallNumber
            key={axis}
            label={axis}
            value={value[index]}
            step={step}
            onChange={(nextValue) => {
              const next = [...value] as Vec3;
              next[index] = nextValue;
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function QuatInput({
  value,
  onChange,
}: {
  value: Quat;
  onChange: (value: Quat) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-neutral-400">Quaternion</span>
      <div className="grid grid-cols-4 gap-1">
        {(["X", "Y", "Z", "W"] as const).map((axis, index) => (
          <SmallNumber
            key={axis}
            label={axis}
            value={value[index]}
            step={0.01}
            min={-1}
            max={1}
            onChange={(nextValue) => {
              const next = [...value] as Quat;
              next[index] = nextValue;
              const normalized = new THREE.Quaternion(...next).normalize();
              onChange(normalized.toArray() as Quat);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-neutral-500">
      {children}
    </h3>
  );
}

const baseButton =
  "inline-flex items-center justify-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

export function AnimationMaker() {
  const {
    gamePackage,
    updateObject,
    selectedObjectId,
    setSelectedObjectId,
    selectedAnimationClipId,
    setSelectedAnimationClipId,
    updateSettings,
  } = useEngineStore();
  const modelObjects = useMemo(
    () =>
      gamePackage.object_library.filter(
        (object) => object.model_kind === "asset" && Boolean(object.asset),
      ),
    [gamePackage.object_library],
  );
  const activeObject = useMemo(
    () =>
      modelObjects.find((object) => object.id === selectedObjectId) ||
      modelObjects[0] ||
      null,
    [modelObjects, selectedObjectId],
  );
  const [loadedInfo, setLoadedInfo] = useState<LoadedPreviewInfo>({
    animations: [],
    bones: [],
    loaded: false,
  });
  const [draftClip, setDraftClip] = useState<AuthoredClipDraft | null>(null);
  const [profileDraft, setProfileDraft] = useState<AnimationProfileDraft | null>(
    null,
  );
  const [selectedSourceClip, setSelectedSourceClip] = useState<string | null>(
    null,
  );
  const [selectedBoneName, setSelectedBoneName] = useState<string | null>(null);
  const [boneSearch, setBoneSearch] = useState("");
  const [bonePose, setBonePose] = useState<BonePose>({
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  const [frame, setFrame] = useState(0);
  const [selectedKeyframeFrame, setSelectedKeyframeFrame] = useState<
    number | null
  >(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [transformMode, setTransformMode] = useState<
    "translate" | "rotate" | "scale"
  >("rotate");
  const [interpolation, setInterpolation] =
    useState<TrackInterpolation>("linear");
  const [selectedAction, setSelectedAction] =
    useState<ActionBindingDraft["action"]>("attack");
  const [attachmentDraft, setAttachmentDraft] =
    useState<AttachmentDraft | null>(null);
  const [ikTargets, setIkTargets] = useState<Record<"left" | "right", Vec3>>({
    left: [-0.25, 1.1, 0.28],
    right: [0.25, 1.05, 0.25],
  });
  const [dirty, setDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [attachmentDirty, setAttachmentDirty] = useState(false);
  const previewRef = useRef<AnimationPreviewHandle>(null);
  const hasUnsavedModelDraft = dirty || profileDirty || attachmentDirty;

  useEffect(() => {
    if (activeObject && activeObject.id !== selectedObjectId) {
      setSelectedObjectId(activeObject.id);
    }
  }, [activeObject, selectedObjectId, setSelectedObjectId]);

  const authoredClips = useMemo(
    () => authoredClipsFor(activeObject),
    [activeObject],
  );

  useEffect(() => {
    setLoadedInfo({ animations: [], bones: [], loaded: false });
    setSelectedBoneName(null);
    setFrame(0);
    setSelectedKeyframeFrame(null);
    setPlaying(false);
    setProfileDraft(animationProfileFor(activeObject));
    setAttachmentDraft(
      gamePackage.settings.player_visual_attachments?.[0]
        ? clone(gamePackage.settings.player_visual_attachments[0])
        : null,
    );
    setDirty(false);
    setProfileDirty(false);
    setAttachmentDirty(false);
    if (!activeObject) {
      setDraftClip(null);
      setSelectedSourceClip(null);
      return;
    }
    const existing = authoredClipsFor(activeObject);
    const selected = existing.find((clip) => clip.id === selectedAnimationClipId);
    if (selected) {
      setDraftClip(selected);
      setSelectedSourceClip(null);
      setLoop(selected.loop !== "once");
      return;
    }
    const sourceName = activeObject.asset?.animation_clips?.[0]?.name || null;
    setDraftClip(null);
    setSelectedSourceClip(sourceName);
    setLoop(true);
    if (selectedAnimationClipId) setSelectedAnimationClipId(null);
  }, [activeObject?.id]);

  useEffect(() => {
    if (dirty || !activeObject) return;
    if (!selectedAnimationClipId) return;
    const stored = activeObject.asset?.authored_animation_clips?.find(
      (clip) => clip.id === selectedAnimationClipId,
    );
    if (stored) {
      setDraftClip(clone(stored));
      setLoop(stored.loop !== "once");
    } else {
      setDraftClip(null);
      setSelectedAnimationClipId(null);
      setSelectedSourceClip(activeObject.asset?.animation_clips?.[0]?.name || null);
      setFrame(0);
      setSelectedKeyframeFrame(null);
      setPlaying(false);
    }
  }, [
    activeObject?.asset?.authored_animation_clips,
    activeObject?.asset?.animation_clips,
    activeObject?.id,
    dirty,
    selectedAnimationClipId,
    setSelectedAnimationClipId,
  ]);

  useEffect(() => {
    if (profileDirty) return;
    setProfileDraft(animationProfileFor(activeObject));
  }, [activeObject?.asset?.animation_profile, activeObject?.id, profileDirty]);

  useEffect(() => {
    if (attachmentDirty) return;
    setAttachmentDraft(
      gamePackage.settings.player_visual_attachments?.[0]
        ? clone(gamePackage.settings.player_visual_attachments[0])
        : null,
    );
  }, [attachmentDirty, gamePackage.settings.player_visual_attachments]);

  useEffect(() => {
    if (!selectedBoneName && loadedInfo.bones[0]?.name) {
      setSelectedBoneName(loadedInfo.bones[0].name);
    }
  }, [loadedInfo.bones, selectedBoneName]);

  const durationFrames = draftClip
    ? draftClip.duration_frames
    : Math.max(
        1,
        Math.ceil(
          (loadedInfo.animations.find((clip) => clip.name === selectedSourceClip)
            ?.duration || 1) * DEFAULT_FPS,
        ),
      );
  const effectiveFps = draftClip?.fps || DEFAULT_FPS;

  const persistClip = useCallback(
    (nextClip: AuthoredClipDraft) => {
      if (!activeObject?.asset) return;
      const existing = activeObject.asset.authored_animation_clips || [];
      const nextClips = existing.some((clip) => clip.id === nextClip.id)
        ? existing.map((clip) => (clip.id === nextClip.id ? clone(nextClip) : clip))
        : [...existing, clone(nextClip)];
      updateObject(activeObject.id, {
        asset: {
          ...activeObject.asset,
          authored_animation_clips: nextClips,
        },
      });
      setDraftClip(clone(nextClip));
      setSelectedSourceClip(null);
      setSelectedAnimationClipId(nextClip.id);
      setDirty(false);
    },
    [activeObject, setSelectedAnimationClipId, updateObject],
  );

  const persistProfile = useCallback(
    (nextProfile: AnimationProfileDraft) => {
      if (!activeObject?.asset) return;
      updateObject(activeObject.id, {
        asset: {
          ...activeObject.asset,
          animation_profile: clone(nextProfile),
        },
      });
      setProfileDraft(clone(nextProfile));
    },
    [activeObject, updateObject],
  );

  const chooseAuthoredClip = (clip: AuthoredClipDraft) => {
    if (dirty && !window.confirm("Discard unsaved animation edits?")) return;
    setDraftClip(clone(clip));
    setSelectedSourceClip(null);
    setSelectedAnimationClipId(clip.id);
    setLoop(clip.loop !== "once");
    setFrame(0);
    setSelectedKeyframeFrame(null);
    setPlaying(false);
    setDirty(false);
  };

  const chooseSourceClip = (name: string) => {
    if (dirty && !window.confirm("Discard unsaved animation edits?")) return;
    setDraftClip(null);
    setSelectedSourceClip(name);
    setSelectedAnimationClipId(null);
    setFrame(0);
    setSelectedKeyframeFrame(null);
    setPlaying(false);
    setDirty(false);
  };

  const createClip = () => {
    const number = authoredClips.length + 1;
    const clip = makeEmptyClip(`New animation ${number}`);
    persistClip(clip);
  };

  const duplicateCurrentClip = () => {
    if (draftClip) {
      const duplicate = clone(draftClip);
      duplicate.id = `anim_${safeId(draftClip.display_name)}_copy_${Date.now()}`;
      duplicate.name = `${safeId(draftClip.name)}_copy`;
      duplicate.display_name = `${draftClip.display_name} copy`;
      duplicate.revision = 1;
      persistClip(duplicate);
      return;
    }
    const source = loadedInfo.animations.find(
      (clip) => clip.name === selectedSourceClip,
    );
    if (source) persistClip(importedClipToDraft(source));
  };

  const deleteCurrentClip = () => {
    if (!activeObject?.asset || !draftClip) return;
    if (!window.confirm(`Delete ${draftClip.display_name}?`)) return;
    updateObject(activeObject.id, {
      asset: {
        ...activeObject.asset,
        authored_animation_clips: (activeObject.asset.authored_animation_clips || []).filter(
          (clip) => clip.id !== draftClip.id,
        ),
      },
    });
    setDraftClip(null);
    setSelectedAnimationClipId(null);
    setSelectedSourceClip(activeObject.asset.animation_clips?.[0]?.name || null);
    setFrame(0);
    setSelectedKeyframeFrame(null);
    setDirty(false);
  };

  const commitBonePose = (pose: BonePose = bonePose) => {
    if (!draftClip || !selectedBoneName) return;
    let next = upsertTrackKeyframe(
      draftClip,
      selectedBoneName,
      "position",
      frame,
      pose.position,
      interpolation,
    );
    next = upsertTrackKeyframe(
      next,
      selectedBoneName,
      "quaternion",
      frame,
      pose.quaternion,
      interpolation,
    );
    next = upsertTrackKeyframe(
      next,
      selectedBoneName,
      "scale",
      frame,
      pose.scale,
      interpolation,
    );
    persistClip(next);
    setSelectedKeyframeFrame(frame);
  };

  const deleteBonePose = () => {
    if (!draftClip || !selectedBoneName) return;
    persistClip(removeBoneKeyframe(draftClip, selectedBoneName, frame));
    if (selectedKeyframeFrame === frame) setSelectedKeyframeFrame(null);
  };

  const moveSelectedBonePose = () => {
    if (
      !draftClip ||
      !selectedBoneName ||
      selectedKeyframeFrame === null ||
      selectedKeyframeFrame === frame
    ) {
      return;
    }
    persistClip(
      moveBoneKeyframe(
        draftClip,
        selectedBoneName,
        selectedKeyframeFrame,
        frame,
      ),
    );
    setSelectedKeyframeFrame(frame);
  };

  const duplicatePreviousBonePose = () => {
    if (!draftClip || !selectedBoneName) return;
    const position = keyframeValueAtOrBefore(
      draftClip,
      selectedBoneName,
      "position",
      Math.max(0, frame - 1),
    );
    const quaternion = keyframeValueAtOrBefore(
      draftClip,
      selectedBoneName,
      "quaternion",
      Math.max(0, frame - 1),
    );
    const scale = keyframeValueAtOrBefore(
      draftClip,
      selectedBoneName,
      "scale",
      Math.max(0, frame - 1),
    );
    if (!position && !quaternion && !scale) return;
    let next = draftClip;
    if (position) {
      next = upsertTrackKeyframe(
        next,
        selectedBoneName,
        "position",
        frame,
        position,
        interpolation,
      );
    }
    if (quaternion) {
      next = upsertTrackKeyframe(
        next,
        selectedBoneName,
        "quaternion",
        frame,
        quaternion,
        interpolation,
      );
    }
    if (scale) {
      next = upsertTrackKeyframe(
        next,
        selectedBoneName,
        "scale",
        frame,
        scale,
        interpolation,
      );
    }
    persistClip(next);
    setSelectedKeyframeFrame(frame);
  };

  const applyBonePose = (pose: BonePose) => {
    setBonePose(pose);
    if (selectedBoneName) previewRef.current?.writeBonePose(selectedBoneName, pose);
  };

  const bakeIk = (side: "left" | "right") => {
    if (!draftClip) return;
    const solved = previewRef.current?.bakeHandIk(side, ikTargets[side]);
    if (!solved || !Object.keys(solved).length) return;
    let next = draftClip;
    Object.entries(solved).forEach(([boneName, pose]) => {
      next = upsertTrackKeyframe(
        next,
        boneName,
        "position",
        frame,
        pose.position,
        interpolation,
      );
      next = upsertTrackKeyframe(
        next,
        boneName,
        "quaternion",
        frame,
        pose.quaternion,
        interpolation,
      );
      next = upsertTrackKeyframe(
        next,
        boneName,
        "scale",
        frame,
        pose.scale,
        interpolation,
      );
    });
    persistClip(next);
  };

  const currentBinding = profileDraft?.action_bindings.find(
    (binding) => binding.action === selectedAction,
  );
  const updateCurrentBinding = (updates: Partial<ActionBindingDraft>) => {
    if (!profileDraft) return;
    if (updates.clip_id === "") {
      setProfileDraft({
        ...profileDraft,
        action_bindings: profileDraft.action_bindings.filter(
          (binding) => binding.action !== selectedAction,
        ),
      });
      setProfileDirty(true);
      return;
    }
    const fallbackClipId =
      updates.clip_id || currentBinding?.clip_id || draftClip?.id || authoredClips[0]?.id;
    if (!fallbackClipId) return;
    const fallbackClip = authoredClips.find(
      (candidate) => candidate.id === fallbackClipId,
    );
    const fallback: ActionBindingDraft = {
      action: selectedAction,
      clip_id: fallbackClipId,
      crossfade_ms: 120,
      playback_rate: 1,
      sync: "free",
      layer: "base",
      blend_mode:
        fallbackClip?.value_mode === "additive" ? "additive" : "override",
    };
    const nextBinding = { ...fallback, ...currentBinding, ...updates };
    const next = clone(profileDraft);
    next.action_bindings = next.action_bindings.some(
      (binding) => binding.action === selectedAction,
    )
      ? next.action_bindings.map((binding) =>
          binding.action === selectedAction ? nextBinding : binding,
        )
      : [...next.action_bindings, nextBinding];
    setProfileDraft(next);
    setProfileDirty(true);
  };

  const saveProfile = () => {
    if (!profileDraft) return;
    const normalizedProfile: AnimationProfileDraft = {
      ...clone(profileDraft),
      display_name: profileDraft.display_name?.trim() || undefined,
      root_node_name: profileDraft.root_node_name.trim() || "mixamorigHips",
      action_bindings: profileDraft.action_bindings.map((binding) => {
        const phase = binding.phase_markers;
        if (!phase) return binding;
        const windup =
          phase.windup_end_frame === undefined
            ? undefined
            : Math.max(0, Math.round(phase.windup_end_frame));
        const impact =
          phase.impact_frame === undefined
            ? undefined
            : Math.max(windup || 0, Math.round(phase.impact_frame));
        const activeEnd =
          phase.active_end_frame === undefined
            ? undefined
            : Math.max(impact || windup || 0, Math.round(phase.active_end_frame));
        return {
          ...binding,
          phase_markers: {
            windup_end_frame: windup,
            impact_frame: impact,
            active_end_frame: activeEnd,
          },
        };
      }),
    };
    persistProfile(normalizedProfile);
    setProfileDirty(false);
  };

  const editProfile = (updates: Partial<AnimationProfileDraft>) => {
    if (!profileDraft) return;
    setProfileDraft({ ...profileDraft, ...updates });
    setProfileDirty(true);
  };

  const editAttachment = (next: AttachmentDraft | null) => {
    setAttachmentDraft(next);
    setAttachmentDirty(true);
  };

  const createAttachment = () => {
    const spine = loadedInfo.bones.find((bone) => bone.name.includes("Spine2"))?.name || "";
    const hand = loadedInfo.bones.find((bone) => bone.name.includes("RightHand"))?.name || "";
    editAttachment({
      id: `attachment_${Date.now()}`,
      object_id:
        gamePackage.object_library.find((object) => object.id === PLAYER_GUITAR_OBJECT_ID)?.id ||
        gamePackage.object_library.find((object) => object.id !== activeObject?.id)?.id ||
        "",
      display_name: "Weapon attachment",
      action: "attack",
      stowed_socket: defaultSocket(spine),
      active_socket: defaultSocket(hand),
      transition: {
        draw_start: 0,
        draw_end: 0.28,
        return_start: 0.72,
        return_end: 1,
      },
      render_xray: false,
    });
  };

  const savePlayerAttachment = () => {
    if (!attachmentDraft) return;
    const drawStart = THREE.MathUtils.clamp(
      attachmentDraft.transition.draw_start,
      0,
      1,
    );
    const drawEnd = THREE.MathUtils.clamp(
      Math.max(drawStart, attachmentDraft.transition.draw_end),
      0,
      1,
    );
    const returnStart = THREE.MathUtils.clamp(
      Math.max(drawEnd, attachmentDraft.transition.return_start),
      0,
      1,
    );
    const returnEnd = THREE.MathUtils.clamp(
      Math.max(returnStart, attachmentDraft.transition.return_end),
      0,
      1,
    );
    const normalizedAttachment: AttachmentDraft = {
      ...clone(attachmentDraft),
      display_name: attachmentDraft.display_name?.trim() || undefined,
      stowed_socket: {
        ...attachmentDraft.stowed_socket,
        quaternion: normalizedQuaternionValue(
          attachmentDraft.stowed_socket.quaternion,
        ),
      },
      active_socket: {
        ...attachmentDraft.active_socket,
        quaternion: normalizedQuaternionValue(
          attachmentDraft.active_socket.quaternion,
        ),
      },
      transition: {
        draw_start: drawStart,
        draw_end: drawEnd,
        return_start: returnStart,
        return_end: returnEnd,
      },
    };
    const existing = gamePackage.settings.player_visual_attachments || [];
    const next = existing.some((attachment) => attachment.id === normalizedAttachment.id)
      ? existing.map((attachment) =>
          attachment.id === normalizedAttachment.id
            ? normalizedAttachment
            : attachment,
        )
      : [...existing, normalizedAttachment];
    updateSettings({ player_visual_attachments: next });
    setAttachmentDraft(clone(normalizedAttachment));
    setAttachmentDirty(false);
  };

  const filteredBones = loadedInfo.bones.filter((bone) =>
    bone.name.toLowerCase().includes(boneSearch.trim().toLowerCase()),
  );
  const selectedBoneKeyframes = draftClip
    ? [
        ...new Set(
          draftClip.tracks
            .filter((track) => track.target_node === selectedBoneName)
            .flatMap((track) => track.keyframes.map((keyframe) => keyframe.frame)),
        ),
      ].sort((left, right) => left - right)
    : [];
  const attachmentObject = attachmentDraft
    ? gamePackage.object_library.find(
        (object) => object.id === attachmentDraft.object_id,
      )
    : undefined;

  if (!activeObject) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-500">
        <div>
          <Bone className="mx-auto mb-3 h-9 w-9 text-neutral-700" />
          <p className="font-medium text-neutral-300">No 3D models available</p>
          <p className="mt-1 text-sm">Import a GLB, GLTF, or FBX model from Models first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[720px] bg-neutral-950 text-neutral-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
        <div className="border-b border-neutral-800 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <PanelTitle>Models & clips</PanelTitle>
            <button className={baseButton} onClick={createClip} title="New editable clip">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <select
            value={activeObject.id}
            onChange={(event) => {
              if (
                hasUnsavedModelDraft &&
                !window.confirm("Discard unsaved animation editor changes?")
              ) {
                return;
              }
              setSelectedObjectId(event.target.value);
            }}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-2 text-xs text-neutral-200 outline-none focus:border-cyan-700"
          >
            {modelObjects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.display_name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
            <span className={`rounded px-1.5 py-0.5 ${loadedInfo.bones.length ? "bg-cyan-950 text-cyan-300" : "bg-neutral-900"}`}>
              {!loadedInfo.loaded
                ? "loading rig"
                : loadedInfo.bones.length
                  ? `${loadedInfo.bones.length} bones`
                  : "static model"}
            </span>
            <span>{loadedInfo.animations.length + authoredClips.length} clips</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {(activeObject.asset?.animation_clips || []).length > 0 && (
            <div className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                Imported source
              </div>
              {(activeObject.asset?.animation_clips || []).map((clip) => (
                <button
                  key={clip.name}
                  onClick={() => chooseSourceClip(clip.name)}
                  className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${!draftClip && selectedSourceClip === clip.name ? "bg-amber-500/10 text-amber-200" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"}`}
                >
                  <CircleDot className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{clip.name}</span>
                  <span className="text-[10px] text-neutral-600">{clip.duration.toFixed(2)}s</span>
                </button>
              ))}
            </div>
          )}
          <div>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
              Editable clips
            </div>
            {authoredClips.map((clip) => (
              <button
                key={clip.id}
                onClick={() => chooseAuthoredClip(clip)}
                className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${draftClip?.id === clip.id ? "bg-cyan-500/10 text-cyan-200" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"}`}
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{clip.display_name}</span>
                <span className="text-[10px] text-neutral-600">{clip.duration_frames}f</span>
              </button>
            ))}
            {!authoredClips.length && (
              <p className="px-2 py-4 text-xs text-neutral-600">
                Create a clip or duplicate an imported source to edit it.
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-neutral-800 p-3">
          <button className={baseButton} onClick={duplicateCurrentClip} disabled={!draftClip && !selectedSourceClip}>
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button className={baseButton} onClick={deleteCurrentClip} disabled={!draftClip}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900/70 px-3">
          <div className="flex items-center gap-2">
            <button className={baseButton} onClick={() => setPlaying((value) => !value)} disabled={!draftClip && !selectedSourceClip}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              className={`${baseButton} ${loop ? "border-cyan-700 text-cyan-200" : ""}`}
              onClick={() => {
                const nextLoop = !loop;
                setLoop(nextLoop);
                if (draftClip) {
                  setDraftClip({
                    ...draftClip,
                    loop: nextLoop ? "repeat" : "once",
                  });
                  setDirty(true);
                }
              }}
            >
              <RotateCw className="h-3.5 w-3.5" /> Loop
            </button>
            <button className={`${baseButton} ${showSkeleton ? "border-cyan-700 text-cyan-200" : ""}`} onClick={() => setShowSkeleton((value) => !value)}>
              {showSkeleton ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Skeleton
            </button>
          </div>
          <div className="flex items-center gap-2">
            {draftClip && (
              <button className={baseButton} onClick={() => persistClip(draftClip)} disabled={!dirty}>
                <Save className="h-3.5 w-3.5" /> Save clip
              </button>
            )}
            <span className="font-mono text-xs text-neutral-500">
              {frame}/{durationFrames} · {effectiveFps} fps
            </span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-[#0a0d12]">
          <Canvas
            shadows
            camera={{ position: [2.7, 1.9, 3.4], fov: 42, near: 0.01, far: 100 }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={["#090c11"]} />
            <ambientLight intensity={0.9} />
            <directionalLight position={[3, 5, 3]} intensity={2.1} castShadow />
            <directionalLight position={[-3, 2, -2]} intensity={0.7} color="#7dd3fc" />
            <gridHelper args={[10, 20, "#334155", "#172033"]} />
            <AnimationPreview
              ref={previewRef}
              object={activeObject}
              authoredClip={draftClip}
              sourceClipName={selectedSourceClip}
              frame={frame}
              playing={playing}
              loop={loop}
              selectedBoneName={selectedBoneName}
              showSkeleton={showSkeleton}
              transformMode={transformMode}
              onFrameChange={(nextFrame) => {
                setFrame(nextFrame);
                if (!loop && nextFrame >= durationFrames) setPlaying(false);
              }}
              onLoaded={setLoadedInfo}
              onBonePoseChange={setBonePose}
              onBonePoseCommit={commitBonePose}
              attachment={attachmentDraft}
              attachmentObject={attachmentObject}
            />
          </Canvas>
          {loadedInfo.loaded && loadedInfo.error && (
            <div className="absolute inset-x-4 top-16 rounded border border-red-700/60 bg-red-950/90 p-3 text-xs text-red-100 shadow-xl">
              Preview failed to load: {loadedInfo.error}
            </div>
          )}
          {loadedInfo.loaded && !loadedInfo.error && !loadedInfo.bones.length && (
            <div className="absolute inset-x-4 top-16 rounded border border-amber-700/50 bg-amber-950/90 p-3 text-xs text-amber-100 shadow-xl">
              <strong className="block">This model has no editable skeleton.</strong>
              You can inspect it as a static prop, but bone animation and hand IK require a rigged character model. Static props can still be assigned in Attachment sockets.
            </div>
          )}
          <div className="absolute left-3 top-3 flex gap-1 rounded border border-neutral-800 bg-neutral-950/90 p-1 backdrop-blur">
            {([
              ["translate", "Move", Gauge],
              ["rotate", "Rotate", RotateCw],
              ["scale", "Scale", Square],
            ] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                title={label}
                onClick={() => setTransformMode(mode)}
                className={`rounded p-1.5 ${transformMode === mode ? "bg-cyan-500/20 text-cyan-200" : "text-neutral-500 hover:bg-neutral-800 hover:text-white"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="mb-2 flex items-center gap-2">
            <button className={baseButton} onClick={() => commitBonePose()} disabled={!draftClip || !selectedBoneName}>
              <Plus className="h-3.5 w-3.5" /> Add/update key
            </button>
            <button className={baseButton} onClick={duplicatePreviousBonePose} disabled={!draftClip || !selectedBoneName}>
              <Copy className="h-3.5 w-3.5" /> Duplicate previous
            </button>
            <button
              className={baseButton}
              onClick={moveSelectedBonePose}
              disabled={
                !draftClip ||
                !selectedBoneName ||
                selectedKeyframeFrame === null ||
                selectedKeyframeFrame === frame
              }
              title={
                selectedKeyframeFrame === null
                  ? "Select a key marker first"
                  : `Move frame ${selectedKeyframeFrame} to ${frame}`
              }
            >
              <ChevronRight className="h-3.5 w-3.5" /> Move selected
            </button>
            <button className={baseButton} onClick={deleteBonePose} disabled={!draftClip || !selectedBoneName}>
              <Trash2 className="h-3.5 w-3.5" /> Delete key
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
              Interpolation
              <select
                value={interpolation}
                onChange={(event) => setInterpolation(event.target.value as TrackInterpolation)}
                className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300"
              >
                <option value="linear">Linear</option>
                <option value="step">Step</option>
              </select>
            </label>
          </div>
          <div className="relative h-12 rounded border border-neutral-800 bg-neutral-900 px-2 pt-5">
            <input
              aria-label="Animation timeline"
              type="range"
              min={0}
              max={durationFrames}
              value={Math.min(frame, durationFrames)}
              onChange={(event) => {
                setPlaying(false);
                setFrame(parseInt(event.target.value, 10));
              }}
              className="absolute inset-x-2 top-5 w-[calc(100%_-_1rem)] accent-cyan-400"
            />
            {selectedBoneKeyframes.map((keyframe, index) => (
                <button
                  key={`${keyframe}_${index}`}
                  title={`Frame ${keyframe}`}
                  onClick={() => {
                    setPlaying(false);
                    setFrame(keyframe);
                    setSelectedKeyframeFrame(keyframe);
                  }}
                  className={`absolute top-1 h-3 w-1.5 -translate-x-1/2 rounded-sm ${selectedKeyframeFrame === keyframe ? "bg-cyan-300 ring-1 ring-white" : "bg-amber-400"}`}
                  style={{ left: `${Math.max(0, Math.min(100, (keyframe / durationFrames) * 100))}%` }}
                />
              ))}
            <span className="absolute left-2 top-1 text-[9px] text-neutral-600">0</span>
            <span className="absolute right-2 top-1 text-[9px] text-neutral-600">{durationFrames}</span>
          </div>
        </div>
      </main>

      <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-3">
        <div className="space-y-5">
          <section className="space-y-2">
            <PanelTitle>Clip</PanelTitle>
            {draftClip ? (
              <>
                <input
                  value={draftClip.display_name}
                  onChange={(event) => {
                    setDraftClip({ ...draftClip, display_name: event.target.value });
                    setDirty(true);
                  }}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                />
                <div className="grid grid-cols-2 gap-2">
                  <SmallNumber
                    label="Duration frames"
                    value={draftClip.duration_frames}
                    min={1}
                    step={1}
                    onChange={(value) => {
                      setDraftClip({ ...draftClip, duration_frames: Math.max(1, Math.round(value)) });
                      setDirty(true);
                    }}
                  />
                  <SmallNumber
                    label="FPS"
                    value={draftClip.fps}
                    min={1}
                    max={120}
                    step={1}
                    onChange={(value) => {
                      setDraftClip({ ...draftClip, fps: Math.max(1, Math.round(value)) });
                      setDirty(true);
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="rounded border border-amber-700/30 bg-amber-950/15 p-2 text-xs text-amber-200/70">
                Imported clips preview as read-only. Duplicate this clip to edit its tracks.
              </p>
            )}
          </section>

          <section className="space-y-2 border-t border-neutral-800 pt-4">
            <PanelTitle>Bone hierarchy</PanelTitle>
            <input
              value={boneSearch}
              onChange={(event) => setBoneSearch(event.target.value)}
              placeholder="Filter bones…"
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
            />
            <div className="max-h-44 overflow-y-auto rounded border border-neutral-800 bg-neutral-900/50 p-1">
              {filteredBones.map((bone) => (
                <button
                  key={bone.name}
                  onClick={() => {
                    setSelectedBoneName(bone.name);
                    const pose = previewRef.current?.readBonePose(bone.name);
                    if (pose) setBonePose(pose);
                  }}
                  className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] ${selectedBoneName === bone.name ? "bg-cyan-500/15 text-cyan-200" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"}`}
                  style={{ paddingLeft: `${8 + Math.min(6, bone.depth) * 8}px` }}
                  title={bone.name}
                >
                  {bone.name}
                </button>
              ))}
              {!filteredBones.length && (
                <p className="p-3 text-center text-xs text-neutral-600">No rig bones found.</p>
              )}
            </div>
          </section>

          {selectedBoneName && (
            <section className="space-y-3 border-t border-neutral-800 pt-4">
              <PanelTitle>FK pose · {selectedBoneName}</PanelTitle>
              <Vec3Input
                label="Position"
                value={bonePose.position}
                onChange={(position) => applyBonePose({ ...bonePose, position })}
              />
              <QuatInput
                value={bonePose.quaternion}
                onChange={(quaternion) => applyBonePose({ ...bonePose, quaternion })}
              />
              <Vec3Input
                label="Scale"
                value={bonePose.scale}
                onChange={(scale) => applyBonePose({ ...bonePose, scale })}
              />
            </section>
          )}

          <section className="space-y-3 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between gap-2">
              <PanelTitle>Hand IK bake</PanelTitle>
              <Hand className="h-4 w-4 text-neutral-600" />
            </div>
            {(["left", "right"] as const).map((side) => (
              <div key={side} className="space-y-2 rounded border border-neutral-800 bg-neutral-900/60 p-2">
                <Vec3Input
                  label={`${side[0].toUpperCase()}${side.slice(1)} target`}
                  value={ikTargets[side]}
                  onChange={(value) => setIkTargets({ ...ikTargets, [side]: value })}
                />
                <button className={`${baseButton} w-full`} onClick={() => bakeIk(side)} disabled={!draftClip}>
                  Bake {side} arm to FK keys
                </button>
              </div>
            ))}
          </section>

          {profileDraft && (
            <section className="space-y-3 border-t border-neutral-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <PanelTitle>Animation profile</PanelTitle>
                {profileDirty && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-400">
                    Unsaved
                  </span>
                )}
              </div>
              <input
                aria-label="Animation profile name"
                value={profileDraft.display_name || ""}
                onChange={(event) =>
                  editProfile({ display_name: event.target.value })
                }
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
              />
              <label className="block space-y-1 text-[10px] uppercase tracking-wide text-neutral-600">
                Rig root
                <select
                  value={profileDraft.root_node_name}
                  onChange={(event) =>
                    editProfile({ root_node_name: event.target.value })
                  }
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs normal-case tracking-normal text-neutral-300"
                >
                  {loadedInfo.bones.map((bone) => (
                    <option key={bone.name} value={bone.name}>{bone.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-[10px] uppercase tracking-wide text-neutral-600">
                Default clip
                <select
                  value={profileDraft.default_clip_id || ""}
                  onChange={(event) =>
                    editProfile({
                      default_clip_id: event.target.value || undefined,
                    })
                  }
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs normal-case tracking-normal text-neutral-300"
                >
                  <option value="">Model playback default</option>
                  {(activeObject.asset?.animation_clips || []).map((clip) => (
                    <option key={`source_${clip.name}`} value={clip.name}>
                      {clip.name} (source)
                    </option>
                  ))}
                  {authoredClips.map((clip) => (
                    <option key={clip.id} value={clip.id}>{clip.display_name}</option>
                  ))}
                </select>
              </label>
            </section>
          )}

          <section className="space-y-3 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between gap-2">
              <PanelTitle>Action binding</PanelTitle>
              <Scissors className="h-4 w-4 text-neutral-600" />
            </div>
            <select
              value={selectedAction}
              onChange={(event) => setSelectedAction(event.target.value as ActionBindingDraft["action"])}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
            >
              {ACTIONS.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
            <select
              value={currentBinding?.clip_id || ""}
              onChange={(event) => updateCurrentBinding({ clip_id: event.target.value })}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
            >
              <option value="">-- No clip --</option>
              {(activeObject.asset?.animation_clips || []).map((clip) => (
                <option key={`source_binding_${clip.name}`} value={clip.name}>
                  {clip.name} (source)
                </option>
              ))}
              {authoredClips.map((clip) => (
                <option key={clip.id} value={clip.id}>{clip.display_name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <SmallNumber
                label="Crossfade ms"
                value={currentBinding?.crossfade_ms ?? 120}
                min={0}
                step={10}
                onChange={(value) =>
                  updateCurrentBinding({ crossfade_ms: Math.max(0, value) })
                }
              />
              <SmallNumber
                label="Playback rate"
                value={currentBinding?.playback_rate ?? 1}
                min={0.01}
                step={0.05}
                onChange={(value) =>
                  updateCurrentBinding({ playback_rate: Math.max(0.01, value) })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-1">
              <select
                aria-label="Animation sync"
                value={currentBinding?.sync || "free"}
                onChange={(event) =>
                  updateCurrentBinding({
                    sync: event.target.value as ActionBindingDraft["sync"],
                  })
                }
                className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[10px] text-neutral-300"
              >
                <option value="free">Free</option>
                <option value="action_phase">Action phase</option>
              </select>
              <select
                aria-label="Animation layer"
                value={currentBinding?.layer || "base"}
                onChange={(event) =>
                  updateCurrentBinding({
                    layer: event.target.value as ActionBindingDraft["layer"],
                  })
                }
                className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[10px] text-neutral-300"
              >
                <option value="base">Base</option>
                <option value="upper_body">Upper body</option>
                <option value="full_body">Full body</option>
              </select>
              <select
                aria-label="Animation blend"
                value={currentBinding?.blend_mode || "override"}
                onChange={(event) =>
                  updateCurrentBinding({
                    blend_mode: event.target.value as ActionBindingDraft["blend_mode"],
                  })
                }
                className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[10px] text-neutral-300"
              >
                <option value="override">Override</option>
                <option value="additive">Additive</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {([
                ["windup_end_frame", "Windup"],
                ["impact_frame", "Impact"],
                ["active_end_frame", "Active end"],
              ] as const).map(([key, label]) => (
                <SmallNumber
                  key={key}
                  label={label}
                  value={currentBinding?.phase_markers?.[key] ?? 0}
                  min={0}
                  max={durationFrames}
                  step={1}
                  onChange={(value) =>
                    updateCurrentBinding({
                      phase_markers: {
                        ...(currentBinding?.phase_markers || {}),
                        [key]: Math.max(0, Math.round(value)),
                      },
                    })
                  }
                />
              ))}
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                <span>Bone mask root</span>
                <button
                  className="text-cyan-400 disabled:text-neutral-700"
                  disabled={!selectedBoneName}
                  onClick={() => {
                    if (!selectedBoneName) return;
                    updateCurrentBinding({
                      bone_mask_root:
                        currentBinding?.bone_mask_root === selectedBoneName
                          ? undefined
                          : selectedBoneName,
                    });
                  }}
                >
                  Toggle selected
                </button>
              </div>
              <p className="max-h-16 overflow-y-auto text-[10px] text-neutral-600">
                {currentBinding?.bone_mask_root || "Full skeleton"}
              </p>
            </div>
            <button
              className={`${baseButton} w-full`}
              onClick={saveProfile}
              disabled={!profileDirty}
            >
              <Save className="h-3.5 w-3.5" /> Save profile & bindings
            </button>
          </section>

          <section className="space-y-3 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between gap-2">
              <PanelTitle>Attachment sockets</PanelTitle>
              {attachmentDirty ? (
                <span className="text-[10px] uppercase tracking-wide text-amber-400">
                  Unsaved
                </span>
              ) : (
                <Link2 className="h-4 w-4 text-neutral-600" />
              )}
            </div>
            {!attachmentDraft ? (
              <button className={`${baseButton} w-full`} onClick={createAttachment}>
                <Plus className="h-3.5 w-3.5" /> New player attachment
              </button>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    aria-label="Attachment name"
                    value={attachmentDraft.display_name || ""}
                    onChange={(event) =>
                      editAttachment({
                        ...attachmentDraft,
                        display_name: event.target.value,
                      })
                    }
                    className="min-w-0 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
                  />
                  <select
                    aria-label="Attachment action"
                    value={attachmentDraft.action}
                    onChange={(event) =>
                      editAttachment({
                        ...attachmentDraft,
                        action: event.target.value as AttachmentDraft["action"],
                      })
                    }
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
                  >
                    {ACTIONS.map((action) => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>
                <select
                  value={attachmentDraft.object_id}
                  onChange={(event) => editAttachment({ ...attachmentDraft, object_id: event.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
                >
                  <option value="">-- Select prop model --</option>
                  {gamePackage.object_library
                    .filter((object) => object.id !== activeObject.id && object.model_kind === "asset")
                    .map((object) => (
                      <option key={object.id} value={object.id}>{object.display_name}</option>
                    ))}
                </select>
                {(["stowed_socket", "active_socket"] as const).map((socketKey) => {
                  const socket = attachmentDraft[socketKey];
                  const label = socketKey === "stowed_socket" ? "Stowed / back" : "Active / hand";
                  return (
                    <div key={socketKey} className="space-y-2 rounded border border-neutral-800 bg-neutral-900/60 p-2">
                      <span className="text-[11px] font-medium text-neutral-300">{label}</span>
                      <select
                        value={socket.bone_name}
                        onChange={(event) =>
                          editAttachment({
                            ...attachmentDraft,
                            [socketKey]: { ...socket, bone_name: event.target.value },
                          })
                        }
                        className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300"
                      >
                        <option value="">-- Bone --</option>
                        {loadedInfo.bones.map((bone) => (
                          <option key={bone.name} value={bone.name}>{bone.name}</option>
                        ))}
                      </select>
                      <Vec3Input
                        label="Offset"
                        value={socket.position}
                        onChange={(position) =>
                          editAttachment({
                            ...attachmentDraft,
                            [socketKey]: { ...socket, position },
                          })
                        }
                      />
                      <QuatInput
                        value={socket.quaternion}
                        onChange={(quaternion) =>
                          editAttachment({
                            ...attachmentDraft,
                            [socketKey]: { ...socket, quaternion },
                          })
                        }
                      />
                      <Vec3Input
                        label="Scale"
                        value={socket.scale}
                        onChange={(scale) =>
                          editAttachment({
                            ...attachmentDraft,
                            [socketKey]: { ...socket, scale },
                          })
                        }
                      />
                    </div>
                  );
                })}
                <div className="grid grid-cols-4 gap-1">
                  {([
                    ["draw_start", "Draw start"],
                    ["draw_end", "Draw end"],
                    ["return_start", "Return start"],
                    ["return_end", "Return end"],
                  ] as const).map(([key, label]) => (
                    <SmallNumber
                      key={key}
                      label={label}
                      value={attachmentDraft.transition[key]}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) =>
                        editAttachment({
                          ...attachmentDraft,
                          transition: {
                            ...attachmentDraft.transition,
                            [key]: Math.max(0, Math.min(1, value)),
                          },
                        })
                      }
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <input
                    type="checkbox"
                    checked={attachmentDraft.render_xray}
                    onChange={(event) =>
                      editAttachment({
                        ...attachmentDraft,
                        render_xray: event.target.checked,
                      })
                    }
                    className="accent-cyan-400"
                  />
                  Keep attachment visible through Steve
                </label>
                <button
                  className={`${baseButton} w-full`}
                  onClick={savePlayerAttachment}
                  disabled={
                    !attachmentDirty ||
                    !attachmentDraft.object_id ||
                    !attachmentDraft.stowed_socket.bone_name ||
                    !attachmentDraft.active_socket.bone_name
                  }
                >
                  <Save className="h-3.5 w-3.5" /> Save player attachment
                </button>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
