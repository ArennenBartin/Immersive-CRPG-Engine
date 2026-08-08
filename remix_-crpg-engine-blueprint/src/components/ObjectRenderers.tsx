import React, { memo, useEffect, useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type {
  ActorAnimationOverrideData,
  AnimationActionBindingData,
  AnimationSemanticAction,
  ObjectData,
  ObjectDecalData,
  ObjectMeshData,
  ObjectMeshFace,
  ObjectPart,
} from "../schema/game";
import { getMeshEdges, hasMeshModel, type MeshEdge } from "../utils/meshModel";
import {
  DECAL_KIND_PRESETS,
  getObjectMaterialNormalMap,
  getObjectMaterialNormalScale,
  getObjectMaterialRoughnessMap,
  getObjectMaterialTexture,
  resolveObjectMaterial,
} from "../utils/objectMaterials";
import {
  loadModelFromAssetDataUrl,
  type LoadedModelAsset,
} from "../utils/gltfModelIO";
import { resolveActorSpriteBrightness } from "../utils/lightRendering";
import {
  compileAuthoredAnimationClip,
  resolveAnimationActionBinding,
  resolveAnimationClipRuntimeName,
  resolveModelAnimationProfile,
} from "../utils/modelAnimation";

export type ModelSelectionMode = "object" | "part" | "vertex" | "edge" | "face";

const getShapeArgs = (part: ObjectPart) => {
  switch (part.shape) {
    case "box":
    case "slab":
    case "rib":
    case "stair":
      return part.size;
    case "column":
    case "cylinder":
      return [
        part.size[0] / 2,
        part.size[0] / 2,
        part.size[1],
        Math.max(3, part.segments || 12),
      ];
    case "cone":
      return [
        0,
        part.size[0] / 2,
        part.size[1],
        Math.max(3, part.segments || 12),
      ];
    case "sphere":
      return [part.size[0] / 2, 16, 16];
    case "plane":
      return [part.size[0], part.size[2] || part.size[1] || 1];
    case "ring":
      return [
        part.size[0] / 2,
        Math.max(0.01, part.size[1] / 2),
        Math.max(6, part.segments || 16),
        Math.max(12, (part.segments || 16) * 2),
      ];
    default:
      return part.size;
  }
};

const createOutlineGeometry = (part: ObjectPart) => {
  const args = getShapeArgs(part);

  switch (part.shape) {
    case "box":
    case "slab":
    case "rib":
    case "stair":
      return new THREE.BoxGeometry(...(args as [number, number, number]));
    case "column":
    case "cylinder":
    case "cone":
      return new THREE.CylinderGeometry(
        ...(args as [number, number, number, number]),
      );
    case "sphere":
      return new THREE.SphereGeometry(...(args as [number, number, number]));
    case "plane":
      return new THREE.PlaneGeometry(...(args as [number, number]));
    case "ring":
      return new THREE.TorusGeometry(
        ...(args as [number, number, number, number]),
      );
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
};

const getFaceNormalVector = (mesh: ObjectMeshData, face: ObjectMeshFace) => {
  if (face.normal) {
    return new THREE.Vector3(
      face.normal[0],
      face.normal[1],
      face.normal[2],
    ).normalize();
  }

  const [a = 0, b = 1, c = 2] = face.vertices;
  const vertexAData = mesh.vertices[a] || [0, 0, 0];
  const vertexBData = mesh.vertices[b] || [0, 0, 0];
  const vertexCData = mesh.vertices[c] || [0, 0, 0];
  const vertexA = new THREE.Vector3(
    vertexAData[0],
    vertexAData[1],
    vertexAData[2],
  );
  const vertexB = new THREE.Vector3(
    vertexBData[0],
    vertexBData[1],
    vertexBData[2],
  );
  const vertexC = new THREE.Vector3(
    vertexCData[0],
    vertexCData[1],
    vertexCData[2],
  );
  const normal = new THREE.Vector3()
    .subVectors(vertexB, vertexA)
    .cross(new THREE.Vector3().subVectors(vertexC, vertexA))
    .normalize();

  return normal.lengthSq() > 0 ? normal : new THREE.Vector3(0, 1, 0);
};

const projectTextureUv = (
  vertex: [number, number, number],
  normal: THREE.Vector3,
) => {
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  if (absY >= absX && absY >= absZ) return [vertex[0], vertex[2]];
  if (absX >= absZ) return [vertex[2], vertex[1]];
  return [vertex[0], vertex[1]];
};

const assetSceneCache = new Map<string, Promise<LoadedModelAsset>>();

const getAssetScene = (object: ObjectData) => {
  if (!object.asset) return null;

  const key = [
    object.id,
    object.asset.source_type,
    object.asset.filename,
    object.asset.data_url.length,
    object.asset.data_url.slice(0, 96),
    object.asset.data_url.slice(-96),
    object.asset.stats?.bytes || 0,
    JSON.stringify(object.tags || []),
    JSON.stringify(object.asset.animation_clips || []),
    JSON.stringify(object.asset.animation_sources || []),
    JSON.stringify(
      object.asset.authored_animation_clips?.map((clip) => [
        clip.id,
        clip.revision,
      ]) || [],
    ),
  ].join("_");
  const cached = assetSceneCache.get(key);
  if (cached) return cached;

  const promise = loadModelFromAssetDataUrl(object.asset);
  assetSceneCache.set(key, promise);
  return promise;
};

export type AssetRenderAppearance = "default" | "player_default" | "player_xray";

/**
 * Render-only action timing. The simulation owns every phase transition and
 * hit; asset playback only samples the matching visual pose.
 */
export interface AssetActionPresentation {
  action: string;
  phase: "windup" | "active" | "recovery";
  progress: number;
  phaseStartedAt?: number;
  phaseDurationMs?: number;
  sequence?: number | string;
}

export interface AssetAttachmentSocketRuntime {
  bone_name: string;
  position?: readonly [number, number, number];
  quaternion?: readonly [number, number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

export interface AssetVisualAttachmentRuntime {
  id: string;
  object_id?: string;
  attachment_object_id?: string;
  action?: string;
  stowed_socket: AssetAttachmentSocketRuntime;
  active_socket: AssetAttachmentSocketRuntime;
  transition?: {
    draw_start?: number;
    draw_end?: number;
    return_start?: number;
    return_end?: number;
  };
}

// Keep both player passes in the opaque render list. The x-ray pass draws
// after world geometry so GreaterDepth can identify occluded fragments, then
// the textured pass draws over every fragment that is actually visible.
const PLAYER_MODEL_XRAY_RENDER_ORDER = 89;
const PLAYER_MODEL_SURFACE_RENDER_ORDER = 90;

interface SyncedAssetActionPlayback {
  action: THREE.AnimationAction;
  clip: THREE.AnimationClip;
  binding: AnimationActionBindingData;
  upperBodyReferenceAction?: THREE.AnimationAction;
  authoredClip?: {
    fps: number;
    duration_frames: number;
  };
}

interface AssetBaseAnimationPlayback {
  lowerBodyAction?: THREE.AnimationAction;
  upperBodyAction?: THREE.AnimationAction;
}

interface AssetBaseAnimationLayers {
  sourceName: string;
  lowerBodyClip?: THREE.AnimationClip;
  upperBodyClip?: THREE.AnimationClip;
}

const animationTrackTarget = (track: THREE.KeyframeTrack) => {
  try {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    return {
      nodeName: parsed.nodeName || parsed.objectIndex,
      propertyName: parsed.propertyName,
    };
  } catch {
    return { nodeName: undefined, propertyName: undefined };
  }
};

export const stripHorizontalRootMotionFromAnimationClip = (
  source: THREE.AnimationClip,
  rootNodeName = "mixamorigHips",
) => {
  const tracks = source.tracks.map((sourceTrack) => {
    const track = sourceTrack.clone();
    const { nodeName, propertyName } = animationTrackTarget(sourceTrack);
    if (nodeName !== rootNodeName || propertyName !== "position") return track;
    const itemSize = track.getValueSize();
    if (itemSize < 3 || track.values.length < itemSize) return track;
    const values = track.values.slice();
    const additive = source.blendMode === THREE.AdditiveAnimationBlendMode;
    const anchorX = additive ? 0 : values[0];
    const anchorZ = additive ? 0 : values[2];
    for (let offset = 0; offset < values.length; offset += itemSize) {
      values[offset] = anchorX;
      values[offset + 2] = anchorZ;
    }
    track.values = values;
    return track;
  });
  return new THREE.AnimationClip(
    source.name,
    source.duration,
    tracks,
    source.blendMode,
  );
};

/**
 * Three's mixer cannot mask an AnimationAction directly. Split locomotion
 * into disjoint track sets instead, so an action can replace the torso/arms
 * without stopping the hips and legs. The original clip is never mutated.
 */
export const splitAssetBaseAnimationClip = (
  source: THREE.AnimationClip,
  actorScene: THREE.Object3D,
  upperBodyRootName?: string,
): AssetBaseAnimationLayers => {
  const upperBodyRoot = upperBodyRootName
    ? actorScene.getObjectByName(upperBodyRootName)
    : undefined;
  if (!upperBodyRoot) {
    return {
      sourceName: source.name,
      lowerBodyClip: source.clone(),
    };
  }

  const upperBodyNodes = new Set<string>();
  upperBodyRoot.traverse((node) => {
    if (node.name) upperBodyNodes.add(node.name);
  });
  const lowerTracks: THREE.KeyframeTrack[] = [];
  const upperTracks: THREE.KeyframeTrack[] = [];
  source.tracks.forEach((track) => {
    const { nodeName } = animationTrackTarget(track);
    (nodeName && upperBodyNodes.has(nodeName) ? upperTracks : lowerTracks).push(
      track.clone(),
    );
  });
  const createLayer = (
    suffix: string,
    tracks: THREE.KeyframeTrack[],
  ) =>
    tracks.length
      ? new THREE.AnimationClip(
          `${source.name}::${suffix}::${upperBodyRootName}`,
          source.duration,
          tracks,
          source.blendMode,
        )
      : undefined;
  return {
    sourceName: source.name,
    lowerBodyClip: createLayer("lower", lowerTracks),
    upperBodyClip: createLayer("upper", upperTracks),
  };
};

/**
 * Builds the per-actor action layer without mutating the cached source clip.
 * Three's mixers do not have a native bone-mask concept, so masking is
 * represented by omitting tracks outside the configured bone subtree.
 */
export const prepareAssetActionAnimationClip = (
  source: THREE.AnimationClip,
  actorScene: THREE.Object3D,
  binding: AnimationActionBindingData,
  rootNodeName = "mixamorigHips",
) => {
  const maskRoot = binding.bone_mask_root
    ? actorScene.getObjectByName(binding.bone_mask_root)
    : undefined;
  if (binding.bone_mask_root && !maskRoot) return null;

  const maskedNodes = maskRoot ? new Set<string>() : undefined;
  maskRoot?.traverse((node) => {
    if (node.name) maskedNodes?.add(node.name);
  });

  const tracks = source.tracks.flatMap((sourceTrack) => {
    const { nodeName } = animationTrackTarget(sourceTrack);
    // Action bindings are skeletal. A track that cannot bind to this cloned
    // actor would otherwise make the renderer suppress its procedural
    // fallback while Three silently ignores the pose.
    if (!nodeName || !actorScene.getObjectByName(nodeName)) return [];
    if (maskedNodes && !maskedNodes.has(nodeName)) return [];

    return [sourceTrack.clone()];
  });
  if (!tracks.length) return null;

  let clip = new THREE.AnimationClip(
    source.name,
    source.duration,
    tracks,
    source.blendMode,
  );
  clip = stripHorizontalRootMotionFromAnimationClip(clip, rootNodeName);
  if (binding.blend_mode === "additive") {
    if (clip.blendMode !== THREE.AdditiveAnimationBlendMode) {
      THREE.AnimationUtils.makeClipAdditive(clip);
    }
    clip.blendMode = THREE.AdditiveAnimationBlendMode;
  } else {
    clip.blendMode = THREE.NormalAnimationBlendMode;
  }
  return clip;
};

const resolveActionPlaybackTime = (
  playback: SyncedAssetActionPlayback,
  presentation: AssetActionPresentation,
) => {
  const progress = clampedPresentationProgress(presentation);
  const authored = playback.authoredClip;
  if (!authored) {
    const phaseStart =
      presentation.phase === "windup"
        ? 0
        : presentation.phase === "active"
          ? 170 / 650
          : 300 / 650;
    const phaseEnd =
      presentation.phase === "windup"
        ? 170 / 650
        : presentation.phase === "active"
          ? 300 / 650
          : 1;
    return playback.clip.duration * THREE.MathUtils.lerp(
      phaseStart,
      phaseEnd,
      progress,
    );
  }

  const firstFrame = playback.binding.frame_range?.start_frame ?? 0;
  const lastFrame = Math.min(
    playback.binding.frame_range?.end_frame ?? authored.duration_frames,
    authored.duration_frames,
  );
  const span = Math.max(1, lastFrame - firstFrame);
  const windupEnd = THREE.MathUtils.clamp(
    playback.binding.phase_markers?.windup_end_frame ??
      firstFrame + Math.round(span * (170 / 650)),
    firstFrame,
    lastFrame,
  );
  const activeEnd = THREE.MathUtils.clamp(
    playback.binding.phase_markers?.active_end_frame ??
      firstFrame + Math.round(span * (300 / 650)),
    windupEnd,
    lastFrame,
  );
  const [phaseStart, phaseEnd] =
    presentation.phase === "windup"
      ? [firstFrame, windupEnd]
      : presentation.phase === "active"
        ? [windupEnd, activeEnd]
        : [activeEnd, lastFrame];
  return THREE.MathUtils.lerp(phaseStart, phaseEnd, progress) / authored.fps;
};

function AssetAnimationDriver({
  mixer,
  basePlaybackRef,
  actionPlaybackRef,
  actionPresentationRef,
  synchronizeBasePlayback,
  holdBaseAnimationPoseRef,
}: {
  mixer: THREE.AnimationMixer;
  basePlaybackRef: React.MutableRefObject<AssetBaseAnimationPlayback | null>;
  actionPlaybackRef: React.MutableRefObject<SyncedAssetActionPlayback | null>;
  actionPresentationRef: React.MutableRefObject<
    AssetActionPresentation | undefined
  >;
  synchronizeBasePlayback: boolean;
  holdBaseAnimationPoseRef: React.MutableRefObject<boolean>;
}) {
  useFrame((_, delta) => {
    const basePlayback = basePlaybackRef.current;
    const holdBasePose = holdBaseAnimationPoseRef.current;
    const setBasePaused = (action?: THREE.AnimationAction) => {
      if (action) action.paused = holdBasePose;
    };
    setBasePaused(basePlayback?.lowerBodyAction);
    setBasePaused(basePlayback?.upperBodyAction);
    mixer.update(Math.min(delta, 0.1));
    let requiresEvaluation = false;
    const synchronizeAction = (baseAction?: THREE.AnimationAction) => {
      if (!baseAction || baseAction.loop === THREE.LoopOnce) return;
      const duration = Math.max(0.0001, baseAction.getClip().duration);
      const elapsed = (performance.now() / 1000) * baseAction.timeScale;
      if (baseAction.loop === THREE.LoopPingPong) {
        const cycle = Math.floor(elapsed / duration);
        const withinCycle = elapsed % duration;
        baseAction.time = cycle % 2 === 0
          ? withinCycle
          : duration - withinCycle;
      } else {
        baseAction.time = elapsed % duration;
      }
      requiresEvaluation = true;
    };
    if (synchronizeBasePlayback && !holdBasePose) {
      synchronizeAction(basePlayback?.lowerBodyAction);
      synchronizeAction(basePlayback?.upperBodyAction);
    }
    const playback = actionPlaybackRef.current;
    const presentation = actionPresentationRef.current;
    if (!playback || !presentation) {
      if (requiresEvaluation) mixer.update(0);
      return;
    }
    const actionTime = playback.binding.sync === "action_phase"
      ? THREE.MathUtils.clamp(
          resolveActionPlaybackTime(playback, presentation),
          0,
          playback.clip.duration,
        )
      : playback.action.time;
    if (playback.binding.sync === "action_phase") {
      playback.action.time = actionTime;
    }
    if (playback.upperBodyReferenceAction) {
      const referenceDuration = Math.max(
        0.0001,
        playback.upperBodyReferenceAction.getClip().duration,
      );
      playback.upperBodyReferenceAction.time = actionTime % referenceDuration;
    }
    // A paused action still contributes to the mixer, but applying the newly
    // sampled time requires a zero-delta evaluation in the current frame.
    mixer.update(0);
  });
  return null;
}

const cloneMaterialWithObjectOverrides = (
  sourceMaterial: THREE.Material,
  object: ObjectData,
  fallbackName: string,
) => {
  const materialName = sourceMaterial.name?.trim() || fallbackName;
  const cloned = sourceMaterial.clone();
  const hasSetting = (object.material_settings || []).some((setting) =>
    [setting.id, setting.name].some(
      (key) => key && key.toLowerCase() === materialName.toLowerCase(),
    ),
  );

  if (!hasSetting) {
    cloned.name = materialName;
    return cloned;
  }

  const resolved = resolveObjectMaterial(object, materialName);
  const anyMaterial = cloned as THREE.MeshStandardMaterial;
  const proceduralTexture = getObjectMaterialTexture(resolved);
  const normalMap = getObjectMaterialNormalMap(resolved);
  const roughnessMap = getObjectMaterialRoughnessMap(resolved);
  const normalScale = getObjectMaterialNormalScale(resolved);

  if (anyMaterial.color) anyMaterial.color.set(resolved.color);
  if (anyMaterial.emissive) anyMaterial.emissive.set(resolved.emissive);
  if ("emissiveIntensity" in anyMaterial) {
    anyMaterial.emissiveIntensity = resolved.emissiveIntensity;
  }
  if ("roughness" in anyMaterial) anyMaterial.roughness = resolved.roughness;
  if ("metalness" in anyMaterial) anyMaterial.metalness = resolved.metalness;
  if (proceduralTexture) anyMaterial.map = proceduralTexture;
  if (normalMap) {
    anyMaterial.normalMap = normalMap;
    anyMaterial.normalScale = new THREE.Vector2(normalScale, normalScale);
  }
  if (roughnessMap) anyMaterial.roughnessMap = roughnessMap;
  anyMaterial.opacity = resolved.opacity;
  anyMaterial.transparent = resolved.transparent;
  anyMaterial.side = THREE.DoubleSide;
  anyMaterial.name = materialName;
  anyMaterial.needsUpdate = true;
  return anyMaterial;
};

const makeAuthoritativePlayerMaterial = (
  sourceMaterial: THREE.Material,
  object: ObjectData,
  fallbackName: string,
) => {
  const source = cloneMaterialWithObjectOverrides(
    sourceMaterial,
    object,
    fallbackName,
  ) as THREE.MeshStandardMaterial;
  const baseColor = source.color?.clone() || new THREE.Color("#FFFFFF");
  // Steve used to be converted to MeshBasicMaterial, which made him immune to
  // every world light and left him looking pasted over the scene. Retain the
  // authored PBR channels so the same physical lights that shape nearby walls
  // and props also move naturally across his model.
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    map: source.map || null,
    alphaMap: source.alphaMap || null,
    aoMap: source.aoMap || null,
    lightMap: source.lightMap || null,
    normalMap: source.normalMap || null,
    normalScale: source.normalScale?.clone() || new THREE.Vector2(1, 1),
    roughnessMap: source.roughnessMap || null,
    metalnessMap: source.metalnessMap || null,
    roughness: Number.isFinite(source.roughness) ? source.roughness : 0.82,
    metalness: Number.isFinite(source.metalness) ? source.metalness : 0,
    emissive: source.emissive?.clone() || new THREE.Color("#000000"),
    emissiveMap: source.emissiveMap || null,
    emissiveIntensity: Math.max(0, source.emissiveIntensity || 0),
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthTest: source.depthTest,
    depthWrite: source.depthWrite,
    vertexColors: source.vertexColors,
    fog: false,
    toneMapped: true,
  });
  material.name = source.name || fallbackName;
  material.userData.crpgPlayerBaseColor = baseColor.getHex();
  source.dispose();
  return material;
};

const cloneAssetSceneForObject = (
  scene: THREE.Group,
  object: ObjectData,
  appearance: AssetRenderAppearance,
) => {
  // Object3D.clone() leaves cloned skinned meshes bound to the source bones.
  // SkeletonUtils produces an independent bone graph so every placed or
  // player-owned animated asset can run its own mixer safely.
  const cloned = cloneSkeleton(scene) as THREE.Group;

  cloned.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    if (appearance === "player_xray") {
      mesh.material = new THREE.MeshBasicMaterial({
        color: "#89E7FF",
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
        side: THREE.FrontSide,
        fog: false,
        toneMapped: false,
      });
      mesh.renderOrder = PLAYER_MODEL_XRAY_RENDER_ORDER;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => null;
      return;
    }

    if (appearance === "player_default") {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material, index) =>
            makeAuthoritativePlayerMaterial(
              material,
              object,
              `asset_material_${index + 1}`,
            ),
          )
        : makeAuthoritativePlayerMaterial(
            mesh.material,
            object,
            "asset_material_1",
          );
      mesh.renderOrder = PLAYER_MODEL_SURFACE_RENDER_ORDER;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return;
    }

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material, index) =>
        cloneMaterialWithObjectOverrides(material, object, `asset_material_${index + 1}`),
      );
    } else {
      mesh.material = cloneMaterialWithObjectOverrides(
        mesh.material,
        object,
        "asset_material_1",
      );
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return cloned;
};

const makePerformanceFoliageMaterial = (source: THREE.Material) => {
  const meshSource = source as THREE.MeshStandardMaterial;
  const material = new THREE.MeshLambertMaterial({
    color: meshSource.color?.clone() || new THREE.Color("#ffffff"),
    map: meshSource.map || null,
    alphaMap: meshSource.alphaMap || null,
    aoMap: meshSource.aoMap || null,
    lightMap: meshSource.lightMap || null,
    emissive: meshSource.emissive?.clone() || new THREE.Color("#000000"),
    emissiveMap: meshSource.emissiveMap || null,
    emissiveIntensity: Math.max(0, meshSource.emissiveIntensity || 0),
    transparent: meshSource.transparent,
    opacity: meshSource.opacity,
    alphaTest: meshSource.alphaTest,
    side: meshSource.side,
    depthTest: meshSource.depthTest,
    depthWrite: meshSource.depthWrite,
    vertexColors: meshSource.vertexColors,
    fog: true,
  });
  material.name = meshSource.name;
  material.toneMapped = meshSource.toneMapped;
  material.dithering = meshSource.dithering;
  material.premultipliedAlpha = meshSource.premultipliedAlpha;
  material.alphaHash = meshSource.alphaHash;
  source.dispose();
  return material;
};

export interface StaticAssetModelInstance {
  key: string;
  position: readonly [number, number, number];
  rotationY: number;
  scaleY?: number;
  scaleXZ?: number;
}

export interface StaticAssetModelInstanceChunk {
  key: string;
  origin: readonly [number, number, number];
  instances: readonly StaticAssetModelInstance[];
}

export const STATIC_ASSET_INSTANCE_CHUNK_SIZE = 10;
export const PERFORMANCE_FOLIAGE_INSTANCE_CHUNK_SIZE = 32;

/**
 * Keeps repeated asset draws spatially bounded so Three can reject chunks
 * outside the camera frustum. Instances retain their authored world-space
 * transforms; each chunk receives a stable local origin for depth sorting and
 * smaller floating-point coordinates.
 */
export const chunkStaticAssetModelInstances = (
  instances: readonly StaticAssetModelInstance[],
  chunkSize = STATIC_ASSET_INSTANCE_CHUNK_SIZE,
): StaticAssetModelInstanceChunk[] => {
  const size =
    Number.isFinite(chunkSize) && chunkSize > 0
      ? chunkSize
      : STATIC_ASSET_INSTANCE_CHUNK_SIZE;
  const chunks = new Map<
    string,
    {
      key: string;
      chunkX: number;
      chunkZ: number;
      origin: [number, number, number];
      instances: StaticAssetModelInstance[];
    }
  >();

  instances.forEach((instance) => {
    const chunkX = Math.floor(instance.position[0] / size);
    const chunkZ = Math.floor(instance.position[2] / size);
    const key = `${chunkX}:${chunkZ}`;
    const chunk =
      chunks.get(key) ||
      (() => {
        const next = {
          key,
          chunkX,
          chunkZ,
          origin: [
            (chunkX + 0.5) * size,
            0,
            (chunkZ + 0.5) * size,
          ] as [number, number, number],
          instances: [],
        };
        chunks.set(key, next);
        return next;
      })();
    chunk.instances.push(instance);
  });

  return Array.from(chunks.values())
    .sort((a, b) => a.chunkZ - b.chunkZ || a.chunkX - b.chunkX)
    .map(({ key, origin, instances: chunkInstances }) => ({
      key,
      origin,
      instances: chunkInstances,
    }));
};

type StaticAssetMeshSource = {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  localMatrix: THREE.Matrix4;
};

function StaticAssetInstancedMesh({
  source,
  assetMatrix,
  chunkOrigin,
  instances,
  castShadow,
  receiveShadow,
}: {
  source: StaticAssetMeshSource;
  assetMatrix: THREE.Matrix4;
  chunkOrigin: readonly [number, number, number];
  instances: readonly StaticAssetModelInstance[];
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const meshRef = React.useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const placement = new THREE.Matrix4();
    const placementQuaternion = new THREE.Quaternion();
    const placementPosition = new THREE.Vector3();
    const placementScale = new THREE.Vector3();
    const finalMatrix = new THREE.Matrix4();

    instances.forEach((instance, index) => {
      placementPosition.set(
        instance.position[0] - chunkOrigin[0],
        instance.position[1] - chunkOrigin[1],
        instance.position[2] - chunkOrigin[2],
      );
      placementQuaternion.setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        instance.rotationY,
      );
      placementScale.set(
        instance.scaleXZ ?? 1,
        instance.scaleY ?? 1,
        instance.scaleXZ ?? 1,
      );
      placement.compose(
        placementPosition,
        placementQuaternion,
        placementScale,
      );
      finalMatrix
        .copy(placement)
        .multiply(assetMatrix)
        .multiply(source.localMatrix);
      mesh.setMatrixAt(index, finalMatrix);
    });

    mesh.count = instances.length;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [
    assetMatrix,
    chunkOrigin[0],
    chunkOrigin[1],
    chunkOrigin[2],
    instances,
    source.localMatrix,
  ]);

  return (
    <instancedMesh
      ref={meshRef}
      position={[chunkOrigin[0], chunkOrigin[1], chunkOrigin[2]]}
      args={[
        source.geometry,
        source.material as THREE.Material,
        instances.length,
      ]}
      dispose={null}
      frustumCulled
      raycast={() => null}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

/**
 * Draws repeated static GLB/GLTF/FBX props with one InstancedMesh per source
 * mesh. The source asset and texture stay cache-shared, while placements keep
 * their authored transforms and independent collision remains map-owned.
 */
export function StaticAssetModelInstances({
  object,
  instances,
}: {
  object: ObjectData;
  instances: readonly StaticAssetModelInstance[];
}) {
  const [sourceAsset, setSourceAsset] = React.useState<LoadedModelAsset | null>(
    null,
  );
  const performanceFoliage =
    object.tags?.includes("performance_foliage") === true;

  useEffect(() => {
    let cancelled = false;
    setSourceAsset(null);
    const promise = getAssetScene(object);
    if (!promise) return;
    promise
      .then((loaded) => {
        if (!cancelled) setSourceAsset(loaded);
      })
      .catch(() => {
        if (!cancelled) setSourceAsset(null);
      });
    return () => {
      cancelled = true;
    };
  }, [object]);

  const sources = useMemo<StaticAssetMeshSource[]>(() => {
    if (!sourceAsset) return [];
    sourceAsset.scene.updateMatrixWorld(true);
    const next: StaticAssetMeshSource[] = [];
    sourceAsset.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (
        !mesh.isMesh ||
        (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
        !mesh.material
      ) {
        return;
      }
      const clonedMaterial = Array.isArray(mesh.material)
        ? mesh.material.map((entry, index) =>
            cloneMaterialWithObjectOverrides(
              entry,
              object,
              `asset_instance_material_${index + 1}`,
            ),
          )
        : cloneMaterialWithObjectOverrides(
            mesh.material,
            object,
            "asset_instance_material_1",
          );
      const material = performanceFoliage
        ? Array.isArray(clonedMaterial)
          ? clonedMaterial.map(makePerformanceFoliageMaterial)
          : makePerformanceFoliageMaterial(clonedMaterial)
        : clonedMaterial;
      next.push({
        key: `${mesh.uuid}:${next.length}`,
        geometry: mesh.geometry,
        material,
        localMatrix: mesh.matrixWorld.clone(),
      });
    });
    return next;
  }, [object, performanceFoliage, sourceAsset]);

  useEffect(
    () => () => {
      sources.forEach((source) => {
        const materials = Array.isArray(source.material)
          ? source.material
          : [source.material];
        materials.forEach((material) => material.dispose());
      });
    },
    [sources],
  );

  const assetMatrix = useMemo(() => {
    const asset = object.asset;
    const scale = asset?.scale || [1, 1, 1];
    const offset = asset?.offset || [0, 0, 0];
    const rotation = asset?.rotation || [0, 0, 0];
    const outerScale = new THREE.Matrix4().makeScale(
      Number(scale[0] || 1),
      Number(scale[1] || 1),
      Number(scale[2] || 1),
    );
    const innerTransform = new THREE.Matrix4().compose(
      new THREE.Vector3(
        Number(offset[0] || 0),
        Number(offset[1] || 0),
        Number(offset[2] || 0),
      ),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          Number(rotation[0] || 0),
          Number(rotation[1] || 0),
          Number(rotation[2] || 0),
        ),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    return outerScale.multiply(innerTransform);
  }, [object.asset]);
  const chunks = useMemo(
    () =>
      chunkStaticAssetModelInstances(
        instances,
        performanceFoliage
          ? PERFORMANCE_FOLIAGE_INSTANCE_CHUNK_SIZE
          : STATIC_ASSET_INSTANCE_CHUNK_SIZE,
      ),
    [instances, performanceFoliage],
  );

  if (sources.length === 0 || chunks.length === 0) return null;
  return (
    <>
      {sources.flatMap((source) =>
        chunks.map((chunk) => (
          <StaticAssetInstancedMesh
            key={`${source.key}:${chunk.key}`}
            source={source}
            assetMatrix={assetMatrix}
            chunkOrigin={chunk.origin}
            instances={chunk.instances}
            castShadow={!performanceFoliage}
            receiveShadow={!performanceFoliage}
          />
        )),
      )}
    </>
  );
}

const clampedPresentationProgress = (
  presentation: AssetActionPresentation | undefined,
) => {
  if (!presentation) return 0;
  const startedAt = Number(presentation.phaseStartedAt);
  const durationMs = Number(presentation.phaseDurationMs);
  const sampled =
    Number.isFinite(startedAt) && Number.isFinite(durationMs) && durationMs > 0
      ? (performance.now() - startedAt) / durationMs
      : Number(presentation.progress);
  return THREE.MathUtils.clamp(Number.isFinite(sampled) ? sampled : 0, 0, 1);
};

const smoothUnitInterval = (value: number) => {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

export const resolveAssetAttachmentBlend = (
  presentation: AssetActionPresentation | undefined,
  attachment: AssetVisualAttachmentRuntime,
) => {
  const progress = resolveAssetAttachmentActionProgress(
    presentation,
    attachment,
  );
  return resolveAssetAttachmentBlendAtProgress(progress, attachment);
};

export const resolveAssetAttachmentActionProgress = (
  presentation: AssetActionPresentation | undefined,
  attachment: AssetVisualAttachmentRuntime,
) => {
  if (!presentation || presentation.action !== (attachment.action || "attack")) {
    return 0;
  }
  const phaseProgress = clampedPresentationProgress(presentation);
  // Attachment transitions are authored over the complete action. These
  // fractions mirror the authoritative Steve attack envelope (170/130/350ms)
  // and keep socket changes aligned with the same phase snapshots that drive
  // damage. Other actions still receive a stable monotonic timeline.
  const progress =
    presentation.phase === "windup"
      ? phaseProgress * (170 / 650)
      : presentation.phase === "active"
        ? 170 / 650 + phaseProgress * (130 / 650)
        : 300 / 650 + phaseProgress * (350 / 650);
  return progress;
};

export const resolveAssetAttachmentBlendAtProgress = (
  progress: number,
  attachment: AssetVisualAttachmentRuntime,
) => {
  const transition = attachment.transition || {};
  const drawStart = THREE.MathUtils.clamp(
    transition.draw_start ?? 0,
    0,
    1,
  );
  const drawEnd = Math.max(drawStart + 0.001, transition.draw_end ?? 0.42);
  const returnStart = Math.max(drawEnd, transition.return_start ?? 0.7);
  const returnEnd = Math.max(
    returnStart + 0.001,
    transition.return_end ?? 1,
  );
  if (progress <= drawEnd) {
    return smoothUnitInterval((progress - drawStart) / (drawEnd - drawStart));
  }
  if (progress < returnStart) return 1;
  return 1 - smoothUnitInterval(
    (progress - returnStart) / (returnEnd - returnStart),
  );
};

const PLAYER_GUITAR_ATTACHMENT_ID = "attach_player_electric_guitar";

// The corrected authored draw reaches the neck at frame 2 and lands its strike
// at frame 9, the end of the authoritative 170ms windup. Its return reaches the
// same stowed grip at frame 18. Convert those clip frames through the
// authoritative 170/130/350ms action envelope instead of assuming the 20-frame
// clip advances uniformly in wall-clock time.
export const PLAYER_GUITAR_DRAW_LATCH_PROGRESS =
  (170 / 650) * (2 / 9);
export const PLAYER_GUITAR_STOW_LATCH_PROGRESS =
  300 / 650 + (350 / 650) * ((18 - 13) / (20 - 13));
export const PLAYER_GUITAR_DRAW_LATCH_CLIP_PROGRESS = 2 / 20;
export const PLAYER_GUITAR_STOW_LATCH_CLIP_PROGRESS = 18 / 20;
export const ASSET_ADDITIVE_REFERENCE_FADE_SECONDS = 0.015;

export const resolveAssetAttachmentActiveBoneName = (
  attachment: AssetVisualAttachmentRuntime,
) => attachment.active_socket.bone_name;

/**
 * The built-in guitar changes parents only while both socket poses coincide.
 * There is intentionally no interpolated back-to-hand pose: that straight
 * path crosses Steve's torso. Generic attachments retain their authored blend.
 */
export const resolvePlayerGuitarAttachmentLatchAtProgress = (
  progress: number,
) => {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  return clamped >= PLAYER_GUITAR_DRAW_LATCH_PROGRESS &&
    clamped < PLAYER_GUITAR_STOW_LATCH_PROGRESS
    ? 1
    : 0;
};

export const resolvePlayerGuitarAttachmentLatchAtClipProgress = (
  progress: number,
) => {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  return clamped >= PLAYER_GUITAR_DRAW_LATCH_CLIP_PROGRESS &&
    clamped < PLAYER_GUITAR_STOW_LATCH_CLIP_PROGRESS
    ? 1
    : 0;
};

/**
 * Kept as a generic extension point for attachment routes. The guitar no
 * longer needs an offset: it latches at coincident left-hand/back poses, so an
 * arc would visibly displace it from the hand-authored grip.
 */
export const resolveAssetAttachmentPathOffset = (
  _blend: number,
  _attachmentId: string,
): readonly [number, number, number] => {
  return [0, 0, 0];
};

const setSocketMatrix = (
  matrix: THREE.Matrix4,
  socket: AssetAttachmentSocketRuntime,
) => {
  const position = socket.position || [0, 0, 0];
  const scale = socket.scale || [1, 1, 1];
  const quaternion = socket.quaternion
    ? new THREE.Quaternion(...socket.quaternion).normalize()
    : new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(socket.rotation || [0, 0, 0])),
      );
  matrix.compose(
    new THREE.Vector3(...position),
    quaternion,
    new THREE.Vector3(...scale),
  );
};

export function AssetVisualAttachmentRenderer({
  actorScene,
  attachment,
  attachmentObject,
  appearance,
  presentation,
  previewProgress,
}: {
  actorScene: THREE.Group;
  attachment: AssetVisualAttachmentRuntime;
  attachmentObject: ObjectData;
  appearance: AssetRenderAppearance;
  presentation?: AssetActionPresentation;
  previewProgress?: number;
}) {
  const mountRef = React.useRef<THREE.Group>(null);
  const blendRef = React.useRef(0);
  const [sourceAsset, setSourceAsset] =
    React.useState<LoadedModelAsset | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSourceAsset(null);
    const promise = getAssetScene(attachmentObject);
    if (!promise) return;
    promise
      .then((loaded) => {
        if (!cancelled) setSourceAsset(loaded);
      })
      .catch(() => {
        if (!cancelled) setSourceAsset(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentObject]);

  const renderedAttachment = useMemo(
    () =>
      sourceAsset
        ? cloneAssetSceneForObject(
            sourceAsset.scene,
            attachmentObject,
            appearance,
          )
        : null,
    [appearance, attachmentObject, sourceAsset],
  );

  useEffect(
    () => () => {
      if (!renderedAttachment) return;
      renderedAttachment.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
    },
    [renderedAttachment],
  );

  const stowedSocketMatrix = useMemo(() => new THREE.Matrix4(), []);
  const activeSocketMatrix = useMemo(() => new THREE.Matrix4(), []);
  const stowedWorldMatrix = useMemo(() => new THREE.Matrix4(), []);
  const activeWorldMatrix = useMemo(() => new THREE.Matrix4(), []);
  const inverseParentMatrix = useMemo(() => new THREE.Matrix4(), []);
  const stowedPosition = useMemo(() => new THREE.Vector3(), []);
  const activePosition = useMemo(() => new THREE.Vector3(), []);
  const stowedQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const activeQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const stowedScale = useMemo(() => new THREE.Vector3(), []);
  const activeScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const mount = mountRef.current;
    if (!mount) return;
    const stowedBone = actorScene.getObjectByName(
      attachment.stowed_socket.bone_name,
    );
    const activeBone = actorScene.getObjectByName(
      resolveAssetAttachmentActiveBoneName(attachment),
    );
    if (!stowedBone || !mount.parent) {
      mount.visible = false;
      return;
    }
    mount.visible = Boolean(renderedAttachment);
    if (!renderedAttachment) return;

    const isPlayerGuitar =
      attachment.id === PLAYER_GUITAR_ATTACHMENT_ID &&
      attachment.stowed_socket.bone_name === "mixamorigSpine2" &&
      attachment.active_socket.bone_name === "mixamorigLeftHand";
    const actionProgress = previewProgress === undefined
      ? resolveAssetAttachmentActionProgress(presentation, attachment)
      : THREE.MathUtils.clamp(previewProgress, 0, 1);
    const targetBlend = !activeBone
      ? 0
      : isPlayerGuitar
        ? previewProgress === undefined
          ? resolvePlayerGuitarAttachmentLatchAtProgress(actionProgress)
          : resolvePlayerGuitarAttachmentLatchAtClipProgress(actionProgress)
        : resolveAssetAttachmentBlendAtProgress(actionProgress, attachment);
    // Keep authoritative phase changes responsive while softening render-state
    // cadence and same-frame bone changes.
    blendRef.current = isPlayerGuitar
      ? targetBlend
      : THREE.MathUtils.damp(
          blendRef.current,
          targetBlend,
          targetBlend > blendRef.current ? 22 : 15,
          Math.min(delta, 0.1),
        );

    actorScene.updateWorldMatrix(true, true);
    mount.parent.updateWorldMatrix(true, false);
    setSocketMatrix(stowedSocketMatrix, attachment.stowed_socket);
    setSocketMatrix(activeSocketMatrix, attachment.active_socket);
    inverseParentMatrix.copy(mount.parent.matrixWorld).invert();
    stowedWorldMatrix
      .copy(inverseParentMatrix)
      .multiply(stowedBone.matrixWorld)
      .multiply(stowedSocketMatrix)
      .decompose(stowedPosition, stowedQuaternion, stowedScale);
    if (activeBone) {
      activeWorldMatrix
        .copy(inverseParentMatrix)
        .multiply(activeBone.matrixWorld)
        .multiply(activeSocketMatrix)
        .decompose(activePosition, activeQuaternion, activeScale);
    } else {
      activePosition.copy(stowedPosition);
      activeQuaternion.copy(stowedQuaternion);
      activeScale.copy(stowedScale);
    }

    const blend = blendRef.current;
    mount.position.lerpVectors(stowedPosition, activePosition, blend);
    const pathOffset = resolveAssetAttachmentPathOffset(blend, attachment.id);
    mount.position.x += pathOffset[0];
    mount.position.y += pathOffset[1];
    mount.position.z += pathOffset[2];
    mount.quaternion.copy(stowedQuaternion).slerp(activeQuaternion, blend);
    mount.scale.lerpVectors(stowedScale, activeScale, blend);
  });

  const asset = attachmentObject.asset;
  if (!asset || !renderedAttachment) return null;
  return (
    <group ref={mountRef} matrixAutoUpdate>
      <group scale={asset.scale as [number, number, number]}>
        <primitive
          object={renderedAttachment}
          position={asset.offset as [number, number, number]}
          rotation={asset.rotation as [number, number, number]}
        />
      </group>
    </group>
  );
}

export const ShapeRenderer = memo(function ShapeRenderer({
  part,
  object,
  onClick,
  showOutline = true,
}: {
  part: ObjectPart;
  object?: ObjectData;
  onClick?: (event: any) => void;
  showOutline?: boolean;
}) {
  const args = getShapeArgs(part);
  const outlineGeometry = useMemo(() => createOutlineGeometry(part), [part]);
  const material = resolveObjectMaterial(object, part.material);
  const texture = getObjectMaterialTexture(material);
  const normalMap = getObjectMaterialNormalMap(material);
  const roughnessMap = getObjectMaterialRoughnessMap(material);
  const normalScale = getObjectMaterialNormalScale(material);

  useEffect(
    () => () => {
      outlineGeometry.dispose();
    },
    [outlineGeometry],
  );

  return (
    <mesh
      position={part.position as [number, number, number]}
      rotation={part.rotation as [number, number, number]}
      onClick={onClick}
      castShadow
      receiveShadow
    >
      {["box", "slab", "rib", "stair"].includes(part.shape) && (
        <boxGeometry args={args as any} />
      )}
      {["cylinder", "column"].includes(part.shape) && (
        <cylinderGeometry args={args as any} />
      )}
      {part.shape === "cone" && <cylinderGeometry args={args as any} />}
      {part.shape === "sphere" && <sphereGeometry args={args as any} />}
      {part.shape === "plane" && <planeGeometry args={args as any} />}
      {part.shape === "ring" && <torusGeometry args={args as any} />}
      <meshStandardMaterial
        map={texture || undefined}
        normalMap={normalMap || undefined}
        normalScale={[normalScale, normalScale]}
        roughnessMap={roughnessMap || undefined}
        color={material.color}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissive}
        emissiveIntensity={material.emissiveIntensity}
        opacity={material.opacity}
        transparent={material.transparent}
        side={THREE.DoubleSide}
      />
      {showOutline && (
        <lineSegments raycast={() => null}>
          <edgesGeometry args={[outlineGeometry]} />
          <lineBasicMaterial color="#E5E9F0" opacity={0.3} transparent />
        </lineSegments>
      )}
    </mesh>
  );
});

const createFaceGeometry = (
  mesh: ObjectMeshData,
  face: ObjectMeshFace,
) => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertexIds = face.vertices;
  const normal = getFaceNormalVector(mesh, face);

  for (let i = 1; i < vertexIds.length - 1; i++) {
    [vertexIds[0], vertexIds[i], vertexIds[i + 1]].forEach((vertexId) => {
      const vertex = (mesh.vertices[vertexId] || [0, 0, 0]) as [
        number,
        number,
        number,
      ];
      positions.push(vertex[0], vertex[1], vertex[2]);
      const [u, v] = projectTextureUv(vertex, normal);
      uvs.push(u, v);
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
};

const createEdgeGeometry = (mesh: ObjectMeshData) => {
  const positions: number[] = [];

  mesh.faces.forEach((face) => {
    face.vertices.forEach((vertexId, index) => {
      const nextId = face.vertices[(index + 1) % face.vertices.length];
      const start = mesh.vertices[vertexId] || [0, 0, 0];
      const end = mesh.vertices[nextId] || [0, 0, 0];
      positions.push(start[0], start[1], start[2], end[0], end[1], end[2]);
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
};

const isFiniteVertex = (vertex: unknown): vertex is [number, number, number] =>
  Array.isArray(vertex) &&
  vertex.length >= 3 &&
  vertex.every((value) => Number.isFinite(Number(value)));

export type RuntimeMeshGeometryGroup = {
  key: string;
  materialRef?: string;
  geometry: THREE.BufferGeometry;
};

export const createRuntimeMeshGeometryGroups = (
  mesh: ObjectMeshData,
): RuntimeMeshGeometryGroup[] => {
  const groupedPositions = new Map<
    string,
    { materialRef?: string; positions: number[]; uvs: number[] }
  >();

  mesh.faces.forEach((face, faceIndex) => {
    if (face.vertices.length < 3) return;

    const materialRef = face.material || mesh.material_slots?.[0];
    const key = materialRef || `material_${faceIndex}`;
    const group =
      groupedPositions.get(key) ||
      (() => {
        const next = {
          materialRef,
          positions: [] as number[],
          uvs: [] as number[],
        };
        groupedPositions.set(key, next);
        return next;
      })();
    const normal = getFaceNormalVector(mesh, face);

    for (let i = 1; i < face.vertices.length - 1; i++) {
      const triangle = [face.vertices[0], face.vertices[i], face.vertices[i + 1]]
        .map((vertexId) => mesh.vertices[vertexId])
        .filter(isFiniteVertex);

      if (triangle.length !== 3) continue;

      triangle.forEach((vertex) => {
        group.positions.push(
          Number(vertex[0]),
          Number(vertex[1]),
          Number(vertex[2]),
        );
        const [u, v] = projectTextureUv(vertex, normal);
        group.uvs.push(u, v);
      });
    }
  });

  return Array.from(groupedPositions.entries())
    .map(([key, group]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(group.positions, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(group.uvs, 2));
      geometry.computeVertexNormals();
      return {
        key,
        materialRef: group.materialRef,
        geometry,
      };
    })
    .filter((group) => group.geometry.attributes.position.count > 0);
};

const getMeshBoundsBox = (mesh: ObjectMeshData) => {
  if (mesh.vertices.length === 0) {
    return {
      center: [0, 0.5, 0] as [number, number, number],
      size: [1, 1, 1] as [number, number, number],
    };
  }

  const xs = mesh.vertices.map((vertex) => Number(vertex[0] || 0));
  const ys = mesh.vertices.map((vertex) => Number(vertex[1] || 0));
  const zs = mesh.vertices.map((vertex) => Number(vertex[2] || 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    center: [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ] as [number, number, number],
    size: [
      Math.max(0.04, maxX - minX),
      Math.max(0.04, maxY - minY),
      Math.max(0.04, maxZ - minZ),
    ] as [number, number, number],
  };
};

function MeshFaceRenderer({
  object,
  mesh,
  face,
  faceIndex,
  isSelected,
  selectable,
  onFaceClick,
}: {
  object?: ObjectData;
  mesh: ObjectMeshData;
  face: ObjectMeshFace;
  faceIndex: number;
  isSelected: boolean;
  selectable: boolean;
  onFaceClick?: (faceIndex: number, event: any) => void;
}) {
  const geometry = useMemo(() => createFaceGeometry(mesh, face), [mesh, face]);
  const material = resolveObjectMaterial(object, face.material);
  const texture = getObjectMaterialTexture(material);
  const normalMap = getObjectMaterialNormalMap(material);
  const roughnessMap = getObjectMaterialRoughnessMap(material);
  const normalScale = getObjectMaterialNormalScale(material);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={(event) => {
        if (!selectable || !onFaceClick) return;
        event.stopPropagation();
        onFaceClick(faceIndex, event);
      }}
    >
      <meshStandardMaterial
        map={isSelected ? undefined : texture || undefined}
        normalMap={isSelected ? undefined : normalMap || undefined}
        normalScale={[normalScale, normalScale]}
        roughnessMap={isSelected ? undefined : roughnessMap || undefined}
        color={isSelected ? "#F3B341" : material.color}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={isSelected ? "#6B3A00" : material.emissive}
        emissiveIntensity={
          isSelected ? 0.35 : material.emissiveIntensity
        }
        opacity={isSelected ? 1 : material.opacity}
        transparent={!isSelected && material.transparent}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function MeshEdgeRenderer({
  mesh,
  edge,
  isSelected,
  selectable,
  onEdgeClick,
}: {
  mesh: ObjectMeshData;
  edge: MeshEdge;
  isSelected: boolean;
  selectable: boolean;
  onEdgeClick?: (edgeId: string, event: any) => void;
}) {
  const transform = useMemo(() => {
    const startVertex = (mesh.vertices[edge.vertices[0]] || [
      0,
      0,
      0,
    ]) as [number, number, number];
    const endVertex = (mesh.vertices[edge.vertices[1]] || [
      0,
      0,
      0,
    ]) as [number, number, number];
    const start = new THREE.Vector3(...startVertex);
    const end = new THREE.Vector3(...endVertex);
    const center = start.clone().add(end).multiplyScalar(0.5);
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );

    return { center, length, quaternion };
  }, [edge, mesh.vertices]);
  const visibleRadius = isSelected ? 0.052 : selectable ? 0.04 : 0.028;
  const hitRadius = Math.max(0.1, visibleRadius * 2.3);
  const handleClick = (event: any) => {
    if (!selectable || !onEdgeClick) return;
    event.stopPropagation();
    onEdgeClick(edge.id, event);
  };

  return (
    <group>
      {selectable && (
        <mesh
          position={transform.center}
          quaternion={transform.quaternion}
          onClick={handleClick}
        >
          <cylinderGeometry args={[hitRadius, hitRadius, transform.length, 10]} />
          <meshBasicMaterial
            color="#70E8FF"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      )}
      <mesh
        position={transform.center}
        quaternion={transform.quaternion}
        onClick={handleClick}
      >
        <cylinderGeometry
          args={[visibleRadius, visibleRadius, transform.length, 10]}
        />
        <meshBasicMaterial
          color={isSelected ? "#F3B341" : "#70E8FF"}
          transparent
          opacity={isSelected ? 0.96 : selectable ? 0.58 : 0.22}
          depthTest={false}
        />
      </mesh>
      {selectable && (
        <mesh position={transform.center} onClick={handleClick}>
          <sphereGeometry args={[isSelected ? 0.082 : 0.064, 12, 12]} />
          <meshBasicMaterial
            color={isSelected ? "#F3B341" : "#70E8FF"}
            transparent
            opacity={isSelected ? 0.98 : 0.78}
            depthTest={false}
          />
        </mesh>
      )}
    </group>
  );
}

export function MeshModelRenderer({
  object,
  mesh,
  selectionMode = "part",
  objectSelected = false,
  selectedVertexIds = [],
  selectedEdgeIds = [],
  selectedFaceIds = [],
  onObjectClick,
  onVertexClick,
  onEdgeClick,
  onFaceClick,
}: {
  object?: ObjectData;
  mesh: ObjectMeshData;
  selectionMode?: ModelSelectionMode;
  objectSelected?: boolean;
  selectedVertexIds?: number[];
  selectedEdgeIds?: string[];
  selectedFaceIds?: number[];
  onObjectClick?: (event: any) => void;
  onVertexClick?: (vertexIndex: number, event: any) => void;
  onEdgeClick?: (edgeId: string, event: any) => void;
  onFaceClick?: (faceIndex: number, event: any) => void;
}) {
  const edgeGeometry = useMemo(() => createEdgeGeometry(mesh), [mesh]);
  const edges = useMemo(() => getMeshEdges(mesh), [mesh]);
  const boundsBox = useMemo(() => getMeshBoundsBox(mesh), [mesh]);
  const objectBoundsGeometry = useMemo(
    () => new THREE.BoxGeometry(...boundsBox.size),
    [boundsBox.size],
  );
  const showVertices =
    selectionMode === "vertex" ||
    selectionMode === "edge" ||
    selectionMode === "face";
  const selectableFaces = selectionMode === "face";
  const selectableEdges = selectionMode === "edge";
  const selectableObject = selectionMode === "object";

  useEffect(
    () => () => {
      edgeGeometry.dispose();
      objectBoundsGeometry.dispose();
    },
    [edgeGeometry, objectBoundsGeometry],
  );

  return (
    <group>
      {selectableObject && (
        <mesh
          position={boundsBox.center}
          onClick={(event) => {
            event.stopPropagation();
            onObjectClick?.(event);
          }}
        >
          <boxGeometry args={boundsBox.size} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {mesh.faces.map((face, faceIndex) => (
        <MeshFaceRenderer
          key={`${face.name || "face"}_${faceIndex}`}
          object={object}
          mesh={mesh}
          face={face}
          faceIndex={faceIndex}
          isSelected={selectedFaceIds.includes(faceIndex)}
          selectable={selectableFaces}
          onFaceClick={onFaceClick}
        />
      ))}
      <lineSegments geometry={edgeGeometry} raycast={() => null}>
        <lineBasicMaterial color="#E5E9F0" opacity={0.4} transparent />
      </lineSegments>
      {(selectableEdges || selectedEdgeIds.length > 0) &&
        edges.map((edge) => (
          <MeshEdgeRenderer
            key={edge.id}
            mesh={mesh}
            edge={edge}
            isSelected={selectedEdgeIds.includes(edge.id)}
            selectable={selectableEdges}
            onEdgeClick={onEdgeClick}
          />
        ))}
      {(objectSelected || selectableObject) && (
        <lineSegments position={boundsBox.center} raycast={() => null}>
          <edgesGeometry args={[objectBoundsGeometry]} />
          <lineBasicMaterial
            color={objectSelected ? "#F3B341" : "#70E8FF"}
            transparent
            opacity={objectSelected ? 0.95 : 0.38}
          />
        </lineSegments>
      )}
      {showVertices &&
        mesh.vertices.map((vertex, vertexIndex) => {
          const selected = selectedVertexIds.includes(vertexIndex);
          return (
            <group
              key={`vertex_${vertexIndex}`}
              position={vertex as [number, number, number]}
            >
              {selectionMode === "vertex" && (
                <mesh
                  onClick={(event) => {
                    if (!onVertexClick) return;
                    event.stopPropagation();
                    onVertexClick(vertexIndex, event);
                  }}
                >
                  <sphereGeometry args={[0.12, 12, 12]} />
                  <meshBasicMaterial
                    color="#70E8FF"
                    transparent
                    opacity={0}
                    depthWrite={false}
                    depthTest={false}
                  />
                </mesh>
              )}
              <mesh
                onClick={(event) => {
                if (selectionMode !== "vertex" || !onVertexClick) return;
                event.stopPropagation();
                onVertexClick(vertexIndex, event);
                }}
              >
                <sphereGeometry args={[selected ? 0.09 : 0.064, 12, 12]} />
                <meshBasicMaterial
                  color={selected ? "#F3B341" : "#70E8FF"}
                  transparent
                  opacity={selected ? 0.98 : 0.82}
                  depthTest={false}
                />
              </mesh>
            </group>
          );
        })}
    </group>
  );
}

function RuntimeMeshGroupRenderer({
  object,
  group,
}: {
  object: ObjectData;
  group: RuntimeMeshGeometryGroup;
}) {
  const material = resolveObjectMaterial(object, group.materialRef);
  const texture = getObjectMaterialTexture(material);
  const normalMap = getObjectMaterialNormalMap(material);
  const roughnessMap = getObjectMaterialRoughnessMap(material);
  const normalScale = getObjectMaterialNormalScale(material);

  return (
    <mesh geometry={group.geometry} raycast={() => null} castShadow receiveShadow>
      <meshStandardMaterial
        map={texture || undefined}
        normalMap={normalMap || undefined}
        normalScale={[normalScale, normalScale]}
        roughnessMap={roughnessMap || undefined}
        color={material.color}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissive}
        emissiveIntensity={material.emissiveIntensity}
        opacity={material.opacity}
        transparent={material.transparent}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function AssetModelRenderer({
  object,
  objectSelected = false,
  selectable = false,
  showBounds = false,
  showPlaceholder = true,
  appearance = "default",
  illumination = 1,
  animationClipName,
  holdBaseAnimationPose = false,
  actionPresentation,
  animationOverride,
  visualAttachments = [],
  objectLibrary = [],
  synchronizeAnimationClock = false,
  onReadyChange,
  onActionAnimationReadyChange,
  onObjectClick,
}: {
  object: ObjectData;
  objectSelected?: boolean;
  selectable?: boolean;
  showBounds?: boolean;
  showPlaceholder?: boolean;
  appearance?: AssetRenderAppearance;
  illumination?: number;
  animationClipName?: string;
  holdBaseAnimationPose?: boolean;
  actionPresentation?: AssetActionPresentation;
  animationOverride?: ActorAnimationOverrideData;
  visualAttachments?: readonly AssetVisualAttachmentRuntime[];
  objectLibrary?: readonly ObjectData[];
  synchronizeAnimationClock?: boolean;
  onReadyChange?: (ready: boolean) => void;
  onActionAnimationReadyChange?: (ready: boolean) => void;
  onObjectClick?: (event: any) => void;
}) {
  const [sourceAsset, setSourceAsset] =
    React.useState<LoadedModelAsset | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const asset = object.asset;
  const bounds = object.bounds || [1, 1, 1];
  const assetScale = asset?.scale || [1, 1, 1];
  const assetOffset = asset?.offset || [0, 0, 0];
  const assetRotation = asset?.rotation || [0, 0, 0];
  const boundsGeometry = useMemo(
    () =>
      new THREE.BoxGeometry(
        Math.max(0.05, bounds[0] || 1),
        Math.max(0.05, bounds[1] || 1),
        Math.max(0.05, bounds[2] || 1),
      ),
    [bounds],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setSourceAsset(null);
    onReadyChange?.(false);

    const promise = getAssetScene(object);
    if (!promise) {
      setLoadError(true);
      return;
    }

    promise
      .then((loaded) => {
        if (!cancelled) setSourceAsset(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    object.id,
    asset?.data_url,
    asset?.filename,
    asset?.source_type,
    asset?.stats?.bytes,
    object.tags,
    asset?.animation_clips,
    asset?.animation_sources,
    asset?.authored_animation_clips,
    onReadyChange,
  ]);

  useEffect(
    () => () => {
      boundsGeometry.dispose();
    },
    [boundsGeometry],
  );

  const renderedScene = useMemo(
    () =>
      sourceAsset
        ? cloneAssetSceneForObject(sourceAsset.scene, object, appearance)
        : null,
    [sourceAsset, object, appearance],
  );
  const mixer = useMemo(
    () => (renderedScene ? new THREE.AnimationMixer(renderedScene) : null),
    [renderedScene],
  );
  const authoredAnimations = useMemo(
    () =>
      (asset?.authored_animation_clips || []).flatMap((clip) => {
        try {
          return [
            compileAuthoredAnimationClip(clip, {
              rootNodeName:
                asset?.animation_profile?.root_node_name || "mixamorigHips",
            }),
          ];
        } catch (error) {
          console.warn(
            `Unable to compile authored animation ${clip.id} for ${object.id}.`,
            error,
          );
          return [];
        }
      }),
    [
      asset?.animation_profile?.root_node_name,
      asset?.authored_animation_clips,
      object.id,
    ],
  );
  const availableAnimations = useMemo(
    () => [...(sourceAsset?.animations || []), ...authoredAnimations],
    [authoredAnimations, sourceAsset?.animations],
  );
  const rootMotionSafeBaseAnimations = useMemo(
    () =>
      availableAnimations.map((clip) =>
        stripHorizontalRootMotionFromAnimationClip(
          clip,
          asset?.animation_profile?.root_node_name || "mixamorigHips",
        ),
      ),
    [
      asset?.animation_profile?.root_node_name,
      availableAnimations,
    ],
  );
  const baseAnimationPlaybackRef =
    React.useRef<AssetBaseAnimationPlayback | null>(null);
  const holdBaseAnimationPoseRef = React.useRef(holdBaseAnimationPose);
  holdBaseAnimationPoseRef.current = holdBaseAnimationPose;
  const syncedActionPlaybackRef = React.useRef<SyncedAssetActionPlayback | null>(
    null,
  );
  const actionPresentationRef = React.useRef(actionPresentation);
  actionPresentationRef.current = actionPresentation;
  const preparedActionClipCacheRef = React.useRef(
    new Map<string, THREE.AnimationClip | null>(),
  );

  useEffect(() => {
    preparedActionClipCacheRef.current.clear();
  }, [availableAnimations, renderedScene]);

  const preparedActionPlayback = useMemo(() => {
    if (!asset || !renderedScene || !actionPresentation) return null;
    const semanticAction =
      actionPresentation.action as AnimationSemanticAction;
    const binding = resolveAnimationActionBinding(
      semanticAction,
      asset.animation_profile,
      animationOverride,
    );
    if (!binding) return null;
    const runtimeName = resolveAnimationClipRuntimeName(
      object.id,
      asset,
      binding.clip_id,
    );
    const sourceClip = availableAnimations.find(
      (candidate) => candidate.name === runtimeName,
    );
    if (!sourceClip) return null;

    const rootNodeName =
      asset.animation_profile?.root_node_name || "mixamorigHips";
    const cacheKey = [
      sourceClip.uuid,
      rootNodeName,
      binding.layer,
      binding.bone_mask_root || "",
      binding.blend_mode,
    ].join("|");
    let clip = preparedActionClipCacheRef.current.get(cacheKey);
    if (clip === undefined) {
      clip = prepareAssetActionAnimationClip(
        sourceClip,
        renderedScene,
        binding,
        rootNodeName,
      );
      preparedActionClipCacheRef.current.set(cacheKey, clip);
    }
    if (!clip) return null;

    return {
      binding,
      clip,
      authoredClip: asset.authored_animation_clips?.find(
        (candidate) => candidate.id === binding.clip_id,
      ),
    };
  }, [
    actionPresentation?.action,
    animationOverride,
    asset,
    availableAnimations,
    object.id,
    renderedScene,
  ]);

  useEffect(() => {
    onReadyChange?.(Boolean(renderedScene));
  }, [renderedScene, onReadyChange]);

  useEffect(() => {
    onActionAnimationReadyChange?.(
      Boolean(actionPresentation?.action && preparedActionPlayback),
    );
  }, [
    actionPresentation?.action,
    onActionAnimationReadyChange,
    preparedActionPlayback,
  ]);

  useEffect(
    () => () => onActionAnimationReadyChange?.(false),
    [onActionAnimationReadyChange],
  );

  useEffect(() => {
    if (!mixer || !rootMotionSafeBaseAnimations.length) return;
    // Creating an AnimationAction binds every FBX track to the cloned skeleton.
    // Doing that for the first time in response to W made the player's first
    // step pay the full idle-to-walk setup cost (twice when the x-ray pass was
    // mounted). Pre-bind during the browser's next idle slice instead.
    const warmAnimationBindings = () => {
      rootMotionSafeBaseAnimations.forEach((clip) => {
        mixer.clipAction(clip);
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warmAnimationBindings, {
        timeout: 160,
      });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(warmAnimationBindings, 0);
    return () => window.clearTimeout(timeoutId);
  }, [mixer, rootMotionSafeBaseAnimations]);

  useEffect(() => {
    if (!renderedScene || appearance !== "player_default") return;
    const brightness = resolveActorSpriteBrightness(illumination);
    renderedScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((material) => {
        const litMaterial = material as THREE.MeshStandardMaterial;
        const baseColor = litMaterial.userData.crpgPlayerBaseColor;
        if (!litMaterial.color || typeof baseColor !== "number") return;
        litMaterial.color.setHex(baseColor).multiplyScalar(brightness);
      });
    });
  }, [appearance, illumination, renderedScene]);

  useEffect(() => {
    if (!mixer || !rootMotionSafeBaseAnimations.length) return;
    const playback = asset?.animation;
    if (playback?.autoplay === false) {
      baseAnimationPlaybackRef.current?.lowerBodyAction?.fadeOut(0.12);
      baseAnimationPlaybackRef.current?.upperBodyAction?.fadeOut(0.12);
      baseAnimationPlaybackRef.current = null;
      return;
    }

    const locomotionClip =
      rootMotionSafeBaseAnimations.find(
        (candidate) =>
          candidate.name === (animationClipName || playback?.clip_name),
      ) || rootMotionSafeBaseAnimations[0];
    const activeBinding = actionPresentation
      ? preparedActionPlayback?.binding
      : undefined;
    const maskRootName =
      activeBinding?.layer === "upper_body"
        ? activeBinding.bone_mask_root
        : undefined;
    const locomotionLayers = splitAssetBaseAnimationClip(
      locomotionClip,
      renderedScene!,
      maskRootName,
    );

    // Additive authored poses are baked against the default/idle torso. Keep
    // the selected walk below the mask while the action uses that stable upper
    // body reference. This preserves leg locomotion and two-hand contact.
    let upperBodyReferenceClip = locomotionLayers.upperBodyClip;
    if (maskRootName && activeBinding?.blend_mode === "additive") {
      const configuredReferenceId =
        animationOverride?.default_clip_id ||
        asset?.animation_profile?.default_clip_id;
      const configuredReferenceName = configuredReferenceId
        ? resolveAnimationClipRuntimeName(
            object.id,
            asset!,
            configuredReferenceId,
          )
        : undefined;
      const referenceSource =
        rootMotionSafeBaseAnimations.find(
          (candidate) =>
            candidate.name ===
            (configuredReferenceName || playback?.clip_name),
        ) || rootMotionSafeBaseAnimations[0];
      upperBodyReferenceClip = splitAssetBaseAnimationClip(
        referenceSource,
        renderedScene!,
        maskRootName,
      ).upperBodyClip;
    } else if (maskRootName && activeBinding?.blend_mode === "override") {
      upperBodyReferenceClip = undefined;
    }

    const configureBaseAction = (
      clip?: THREE.AnimationClip,
      fadeSeconds = 0.08,
    ) => {
      if (!clip) return undefined;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.timeScale = Math.max(0.01, playback?.time_scale || 1);
      action.clampWhenFinished = playback?.loop === "once";
      if (playback?.loop === "once") {
        action.setLoop(THREE.LoopOnce, 1);
      } else if (playback?.loop === "ping_pong") {
        action.setLoop(THREE.LoopPingPong, Infinity);
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      action.stopFading().reset();
      if (fadeSeconds > 0) action.fadeIn(fadeSeconds);
      else action.setEffectiveWeight(1);
      action.play();
      action.paused = holdBaseAnimationPoseRef.current;
      return action;
    };

    const previous = baseAnimationPlaybackRef.current;
    const lowerBodyAction = configureBaseAction(
      locomotionLayers.lowerBodyClip,
    );
    const upperBodyFadeSeconds =
      maskRootName && activeBinding?.blend_mode === "additive"
        ? ASSET_ADDITIVE_REFERENCE_FADE_SECONDS
        : 0.08;
    const upperBodyAction = configureBaseAction(
      upperBodyReferenceClip,
      upperBodyFadeSeconds,
    );
    if (
      previous?.lowerBodyAction &&
      previous.lowerBodyAction !== lowerBodyAction
    ) {
      previous.lowerBodyAction.fadeOut(0.08);
    }
    if (
      previous?.upperBodyAction &&
      previous.upperBodyAction !== upperBodyAction
    ) {
      previous.upperBodyAction.fadeOut(upperBodyFadeSeconds);
    }
    baseAnimationPlaybackRef.current = {
      lowerBodyAction,
      upperBodyAction,
    };
  }, [
    mixer,
    renderedScene,
    rootMotionSafeBaseAnimations,
    animationClipName,
    asset?.animation?.autoplay,
    asset?.animation?.clip_name,
    asset?.animation?.loop,
    asset?.animation?.time_scale,
    asset?.animation_profile?.default_clip_id,
    animationOverride?.default_clip_id,
    actionPresentation?.action,
    preparedActionPlayback,
    object.id,
  ]);

  useEffect(() => {
    if (!mixer || !actionPresentation || !preparedActionPlayback) {
      syncedActionPlaybackRef.current?.action.fadeOut(0.1);
      syncedActionPlaybackRef.current = null;
      return;
    }
    const { authoredClip, binding, clip } = preparedActionPlayback;
    const action = mixer.clipAction(clip);
    const fadeSeconds = Math.max(0, binding.crossfade_ms) / 1000;
    const previous = syncedActionPlaybackRef.current?.action;
    action.enabled = true;
    action.paused = binding.sync === "action_phase";
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.setEffectiveTimeScale(Math.max(0.01, binding.playback_rate));
    action.setEffectiveWeight(1);
    action.stopFading().reset().play();
    if (fadeSeconds > 0) action.fadeIn(fadeSeconds);
    if (previous && previous !== action) {
      previous.fadeOut(fadeSeconds || 0.001);
    }
    syncedActionPlaybackRef.current = {
      action,
      clip,
      binding,
      upperBodyReferenceAction:
        binding.blend_mode === "additive"
          ? baseAnimationPlaybackRef.current?.upperBodyAction
          : undefined,
      authoredClip,
    };
  }, [
    actionPresentation?.action,
    actionPresentation?.sequence,
    mixer,
    preparedActionPlayback,
  ]);

  useEffect(
    () => () => {
      baseAnimationPlaybackRef.current = null;
      syncedActionPlaybackRef.current = null;
      mixer?.stopAllAction();
      if (mixer && renderedScene) mixer.uncacheRoot(renderedScene);
      if (!renderedScene) return;
      renderedScene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
    },
    [mixer, renderedScene],
  );

  return (
    <group
      onClick={(event) => {
        if (!selectable || !onObjectClick) return;
        event.stopPropagation();
        onObjectClick(event);
      }}
    >
      {renderedScene ? (
        <group scale={assetScale as [number, number, number]}>
          {mixer && (
            <AssetAnimationDriver
              mixer={mixer}
              basePlaybackRef={baseAnimationPlaybackRef}
              actionPlaybackRef={syncedActionPlaybackRef}
              actionPresentationRef={actionPresentationRef}
              synchronizeBasePlayback={synchronizeAnimationClock}
              holdBaseAnimationPoseRef={holdBaseAnimationPoseRef}
            />
          )}
          <primitive
            object={renderedScene}
            position={assetOffset as [number, number, number]}
            rotation={assetRotation as [number, number, number]}
          />
          {visualAttachments.map((attachment) => {
            const objectId =
              attachment.object_id || attachment.attachment_object_id;
            const attachmentObject = objectLibrary.find(
              (candidate) => candidate.id === objectId,
            );
            return attachmentObject ? (
              <AssetVisualAttachmentRenderer
                key={attachment.id}
                actorScene={renderedScene}
                attachment={attachment}
                attachmentObject={attachmentObject}
                appearance={appearance}
                presentation={actionPresentation}
              />
            ) : null;
          })}
        </group>
      ) : showPlaceholder ? (
        <mesh position={[0, Math.max(0.05, bounds[1] || 1) / 2, 0]}>
          <primitive object={boundsGeometry} attach="geometry" />
          <meshStandardMaterial
            color={loadError ? "#BF616A" : "#4C566A"}
            wireframe
            transparent
            opacity={0.45}
          />
        </mesh>
      ) : null}
      {(showBounds || objectSelected || selectable) && (
        <lineSegments
          position={[0, Math.max(0.05, bounds[1] || 1) / 2, 0]}
          raycast={() => null}
        >
          <edgesGeometry args={[boundsGeometry]} />
          <lineBasicMaterial
            color={objectSelected ? "#F3B341" : "#70E8FF"}
            transparent
            opacity={objectSelected ? 0.95 : 0.38}
          />
        </lineSegments>
      )}
    </group>
  );
}

export function ObjectRuntimeModelRenderer({
  object,
  includeDecals = false,
}: {
  object: ObjectData;
  includeDecals?: boolean;
}) {
  const runtimeGeometryGroups = useMemo(
    () =>
      hasMeshModel(object) && object.mesh
        ? createRuntimeMeshGeometryGroups(object.mesh)
        : [],
    [object],
  );

  useEffect(
    () => () => {
      runtimeGeometryGroups.forEach((group) => group.geometry.dispose());
    },
    [runtimeGeometryGroups],
  );

  if (object.model_kind === "asset" && object.asset) {
    return (
      <group>
        <AssetModelRenderer object={object} />
        {includeDecals &&
          (object.decals || []).map((decal) => (
            <ObjectDecalRenderer key={decal.id} decal={decal} />
          ))}
      </group>
    );
  }

  if (hasMeshModel(object) && object.mesh) {
    return (
      <group>
        {runtimeGeometryGroups.map((group) => (
          <RuntimeMeshGroupRenderer
            key={group.key}
            object={object}
            group={group}
          />
        ))}
        {includeDecals &&
          (object.decals || []).map((decal) => (
            <ObjectDecalRenderer key={decal.id} decal={decal} />
          ))}
      </group>
    );
  }

  return (
    <group>
      {object.parts.map((part, index) => (
        <ShapeRenderer
          key={`${part.name}_${index}`}
          part={part}
          object={object}
          showOutline={false}
        />
      ))}
      {includeDecals &&
        (object.decals || []).map((decal) => (
          <ObjectDecalRenderer key={decal.id} decal={decal} />
        ))}
    </group>
  );
}

const createDecalTexture = (decal: ObjectDecalData) => {
  const preset = DECAL_KIND_PRESETS[decal.kind];
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = decal.color || preset.color;
  ctx.fillStyle = decal.color || preset.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (decal.kind === "blood") {
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(58, 66, 34, 25, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.65;
    [
      [82, 48, 11],
      [36, 82, 9],
      [70, 93, 7],
      [45, 46, 6],
    ].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (decal.kind === "crack") {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(18, 65);
    ctx.lineTo(42, 58);
    ctx.lineTo(56, 70);
    ctx.lineTo(79, 53);
    ctx.lineTo(110, 59);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(55, 70);
    ctx.lineTo(48, 95);
    ctx.lineTo(35, 110);
    ctx.moveTo(77, 54);
    ctx.lineTo(89, 31);
    ctx.stroke();
  } else if (decal.kind === "marble_vein") {
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(8, 86);
    ctx.bezierCurveTo(34, 68, 40, 38, 74, 50);
    ctx.bezierCurveTo(95, 57, 104, 29, 126, 20);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(26, 97);
    ctx.bezierCurveTo(56, 78, 69, 74, 116, 83);
    ctx.stroke();
  } else if (decal.kind === "inscription") {
    ctx.lineWidth = 5;
    [
      [28, 38, 28, 88],
      [28, 38, 48, 60],
      [48, 60, 28, 88],
      [68, 38, 86, 88],
      [86, 88, 102, 38],
      [73, 66, 96, 66],
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  } else if (decal.kind === "grid_glow") {
    ctx.lineWidth = 4;
    ctx.shadowColor = decal.color || preset.color;
    ctx.shadowBlur = 18;
    for (let x = 24; x <= 104; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, 110);
      ctx.stroke();
    }
    for (let y = 24; y <= 104; y += 20) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(110, y);
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = 6;
    ctx.strokeRect(22, 22, 84, 84);
    ctx.beginPath();
    ctx.moveTo(32, 72);
    ctx.lineTo(94, 46);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export function ObjectDecalRenderer({ decal }: { decal: ObjectDecalData }) {
  const preset = DECAL_KIND_PRESETS[decal.kind];
  const texture = useMemo(() => createDecalTexture(decal), [decal]);

  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );

  if (!texture) return null;

  return (
    <mesh
      position={decal.position as [number, number, number]}
      rotation={decal.rotation as [number, number, number]}
      raycast={() => null}
    >
      <planeGeometry
        args={[
          Math.max(0.01, decal.size?.[0] || 0.5),
          Math.max(0.01, decal.size?.[1] || 0.5),
        ]}
      />
      <meshStandardMaterial
        map={texture}
        transparent
        opacity={Math.max(0.02, Math.min(1, decal.opacity ?? preset.opacity))}
        emissive={decal.emissive || preset.emissive ? decal.color || preset.color : "#000000"}
        emissiveIntensity={decal.emissive || preset.emissive ? 0.9 : 0}
        roughness={0.62}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function ObjectModelRenderer({
  object,
  selectionMode = "part",
  objectSelected,
  selectedVertexIds,
  selectedEdgeIds,
  selectedFaceIds,
  onObjectClick,
  onVertexClick,
  onEdgeClick,
  onFaceClick,
}: {
  object: ObjectData;
  selectionMode?: ModelSelectionMode;
  objectSelected?: boolean;
  selectedVertexIds?: number[];
  selectedEdgeIds?: string[];
  selectedFaceIds?: number[];
  onObjectClick?: (event: any) => void;
  onVertexClick?: (vertexIndex: number, event: any) => void;
  onEdgeClick?: (edgeId: string, event: any) => void;
  onFaceClick?: (faceIndex: number, event: any) => void;
}) {
  if (object.model_kind === "asset" && object.asset) {
    return (
      <group>
        <AssetModelRenderer
          object={object}
          objectSelected={objectSelected}
          selectable={selectionMode === "object"}
          showBounds
          onObjectClick={onObjectClick}
        />
        {(object.decals || []).map((decal) => (
          <ObjectDecalRenderer key={decal.id} decal={decal} />
        ))}
      </group>
    );
  }

  if (hasMeshModel(object) && object.mesh) {
    return (
      <group>
        <MeshModelRenderer
          object={object}
          mesh={object.mesh}
          selectionMode={selectionMode}
          objectSelected={objectSelected}
          selectedVertexIds={selectedVertexIds}
          selectedEdgeIds={selectedEdgeIds}
          selectedFaceIds={selectedFaceIds}
          onObjectClick={onObjectClick}
          onVertexClick={onVertexClick}
          onEdgeClick={onEdgeClick}
          onFaceClick={onFaceClick}
        />
        {(object.decals || []).map((decal) => (
          <ObjectDecalRenderer key={decal.id} decal={decal} />
        ))}
      </group>
    );
  }

  return (
    <group>
      {object.parts.map((part, index) => (
        <ShapeRenderer key={`${part.name}_${index}`} part={part} object={object} />
      ))}
      {(object.decals || []).map((decal) => (
        <ObjectDecalRenderer key={decal.id} decal={decal} />
      ))}
    </group>
  );
}
