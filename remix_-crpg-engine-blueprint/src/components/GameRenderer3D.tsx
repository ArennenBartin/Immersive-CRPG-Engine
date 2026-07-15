import React, {
  useMemo,
  useEffect,
  useState,
  useRef,
  memo,
  useLayoutEffect,
  startTransition,
} from "react";
import {
  CellData,
  MapData,
  ObjectData,
  ObjectPlacementData,
} from "../schema/game";
import type {
  ActorPhysicalStateRecord,
  MapDelta,
} from "../schema/save";
import type {
  EntityBehaviorIntentRecord,
  ImmersiveCombatIntentRecord,
  ImmersiveCombatOverwatchZone,
  ImmersivePerceptionAlertRecord,
  ImmersiveResolvedLightSource,
  ImmersiveViewerVisibilitySnapshot,
} from "../engine-core";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import { useEngineStore } from "../store/engineStore";
import { useFrame, useThree } from "@react-three/fiber";
import {
  createRuntimeMeshGeometryGroups,
  ObjectModelRenderer,
  ObjectRuntimeModelRenderer,
} from "./ObjectRenderers";
import { getObjectVerticalExtents } from "../utils/meshModel";
import { entityPlacementStateKey } from "../utils/entityState";
import {
  useFxStore,
  DamagePopup,
  Bark,
  POPUP_LIFETIME_MS,
  HIT_FLASH_MS,
} from "../store/fxStore";
import { THREAT_RADIUS } from "../utils/combat";
import {
  getObjectMaterialNormalMap,
  getObjectMaterialNormalScale,
  getObjectMaterialRoughnessMap,
  getObjectMaterialTexture,
  resolveObjectMaterial,
} from "../utils/objectMaterials";
import { isDoorPlacementOpen } from "../utils/doorPlacement";
import { doorPlacementKey } from "../utils/doorPlacement";
import {
  applyPlacementDeltas,
  getMacroPlacementFootprint,
} from "../utils/objectFootprint";
import {
  fineCellsCoveredByWorldMacroCell,
  logicalCellToWorld,
  logicalCellToMacro,
  logicalCellWorldSize,
  dedupeFineTerrainCellsFor3D,
  isWorldPointInCameraOcclusionCorridor,
  worldPointToLogicalCell,
  type RendererGridSpace,
} from "../utils/renderSpace";
import {
  classifyFogRenderState,
  classifyFogRenderStateForCells,
  computeFogVisibleCells,
  fogCellKey,
  resolveStructureFogCompositePolicy,
  type FogRenderState,
} from "../utils/fogOfWar";
import {
  resolveActorSpriteBrightness,
  resolveAuthoritativeLightRenderMetrics,
  resolveStructureEmissiveFillStrength,
  resolveStructureFootprintIllumination,
} from "../utils/lightRendering";
import {
  deleteScreenGlareSource,
  setScreenGlareSource,
} from "../utils/screenGlareSources";
import { WorldOverlays3D } from "./WorldOverlays3D";
import { isAnimatedSprite } from "../utils/tileRendering";

type DecodedGifAtlas = {
  sourceWidth: number;
  sourceHeight: number;
  atlasWidth: number;
  atlasHeight: number;
  frameWidth: number;
  frameHeight: number;
  cellWidth: number;
  cellHeight: number;
  padding: number;
  columns: number;
  rows: number;
  durations: number[];
  bitmap: ImageBitmap;
};

type GifDecoderResponse = Partial<DecodedGifAtlas> & {
  id: number;
  error?: string;
};

const WORLD_GIF_FRAME_HEIGHT = 128;
const WORLD_GIF_MIN_FRAME_MS = 80;
const ANIMATED_SPRITE_RELEASE_DELAY_MS = 15_000;

let gifDecodeWorker: Worker | null = null;
let nextGifDecodeId = 1;
const pendingGifDecodes = new Map<
  number,
  { resolve: (gif: DecodedGifAtlas) => void; reject: (error: Error) => void }
>();

const getGifDecodeWorker = () => {
  if (gifDecodeWorker) return gifDecodeWorker;
  const worker = new Worker(
    new URL("../workers/gifDecoder.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = (event: MessageEvent<GifDecoderResponse>) => {
    const pending = pendingGifDecodes.get(event.data.id);
    if (!pending) return;
    pendingGifDecodes.delete(event.data.id);
    if (event.data.error) {
      pending.reject(new Error(event.data.error));
      return;
    }
    const atlas = event.data;
    if (
      !atlas.sourceWidth ||
      !atlas.sourceHeight ||
      !atlas.atlasWidth ||
      !atlas.atlasHeight ||
      !atlas.frameWidth ||
      !atlas.frameHeight ||
      !atlas.cellWidth ||
      !atlas.cellHeight ||
      atlas.padding === undefined ||
      !atlas.columns ||
      !atlas.rows ||
      !atlas.durations?.length ||
      !atlas.bitmap
    ) {
      pending.reject(new Error("GIF decoder returned no drawable atlas"));
      return;
    }
    pending.resolve(atlas as DecodedGifAtlas);
  };
  worker.onerror = () => {
    pendingGifDecodes.forEach(({ reject }) =>
      reject(new Error("GIF decoder worker failed")),
    );
    pendingGifDecodes.clear();
    worker.terminate();
    gifDecodeWorker = null;
  };
  gifDecodeWorker = worker;
  return worker;
};

const decodeAnimatedGif = async (dataUrl: string): Promise<DecodedGifAtlas> => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`GIF fetch failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const id = nextGifDecodeId++;
  return new Promise<DecodedGifAtlas>((resolve, reject) => {
    pendingGifDecodes.set(id, { resolve, reject });
    getGifDecodeWorker().postMessage(
      {
        id,
        buffer,
        maxFrameHeight: WORLD_GIF_FRAME_HEIGHT,
        minFrameDuration: WORLD_GIF_MIN_FRAME_MS,
      },
      [buffer],
    );
  });
};

type AnimatedSpriteTextureSource = {
  atlasWidth: number;
  atlasHeight: number;
  frameWidth: number;
  frameHeight: number;
  cellWidth: number;
  cellHeight: number;
  padding: number;
  columns: number;
  durations: number[];
  frameIndex: number;
  nextFrameAt: number;
};

type SpriteTextureCacheEntry = {
  texture: THREE.Texture | null;
  spriteDef: any;
  ready?: boolean;
  cacheKey?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  animatedSource?: AnimatedSpriteTextureSource;
  activeUsers?: number;
  subscribers?: Set<() => void>;
  releaseTimer?: ReturnType<typeof setTimeout>;
  disposed?: boolean;
};

const spriteTextureCache = new Map<string, SpriteTextureCacheEntry>();

const showAnimatedSpriteAtlasFrame = (
  entry: SpriteTextureCacheEntry,
  frameIndex: number,
) => {
  const source = entry.animatedSource;
  if (!source || !entry.texture) return;
  const column = frameIndex % source.columns;
  const row = Math.floor(frameIndex / source.columns);
  const left = column * source.cellWidth + source.padding;
  const top = row * source.cellHeight + source.padding;
  entry.texture.repeat.set(
    source.frameWidth / source.atlasWidth,
    source.frameHeight / source.atlasHeight,
  );
  entry.texture.offset.set(
    left / source.atlasWidth,
    1 - (top + source.frameHeight) / source.atlasHeight,
  );
  source.frameIndex = frameIndex;
};

const notifySpriteTextureSubscribers = (entry: SpriteTextureCacheEntry) => {
  entry.subscribers?.forEach((notify) => notify());
};

const loadAnimatedSpriteAtlas = async (
  entry: SpriteTextureCacheEntry,
  dataUrl: string,
) => {
  try {
    const decoded = await decodeAnimatedGif(dataUrl);
    if (entry.disposed || !entry.texture) {
      decoded.bitmap.close();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = decoded.atlasWidth;
    canvas.height = decoded.atlasHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      decoded.bitmap.close();
      throw new Error("Unable to create animated sprite atlas canvas");
    }
    context.drawImage(decoded.bitmap, 0, 0);
    decoded.bitmap.close();

    entry.texture.image = canvas;
    entry.texture.needsUpdate = true;
    entry.sourceWidth = decoded.sourceWidth;
    entry.sourceHeight = decoded.sourceHeight;
    entry.animatedSource = {
      atlasWidth: decoded.atlasWidth,
      atlasHeight: decoded.atlasHeight,
      frameWidth: decoded.frameWidth,
      frameHeight: decoded.frameHeight,
      cellWidth: decoded.cellWidth,
      cellHeight: decoded.cellHeight,
      padding: decoded.padding,
      columns: decoded.columns,
      durations: decoded.durations,
      frameIndex: 0,
      nextFrameAt: Math.max(20, decoded.durations[0] || 100),
    };
    showAnimatedSpriteAtlasFrame(entry, 0);
    entry.ready = true;
    notifySpriteTextureSubscribers(entry);
  } catch (error) {
    if (entry.disposed) return;
    entry.texture = null;
    entry.ready = false;
    notifySpriteTextureSubscribers(entry);
    console.warn("Unable to decode animated world sprite", error);
  }
};

const ILLUSTRATED_CHARACTER_HEIGHT = 1.9;
const DEFAULT_CHARACTER_HEIGHT = 1;
const SPRITE_WORLD_HEIGHT_OVERRIDES: Record<string, number> = {
  spr_bound_remnant: 2.75,
};

const isIllustrationSpriteDef = (sprite: any) =>
  !!sprite?.data_url &&
  (!sprite.data_url.startsWith("data:") ||
    Math.max(sprite.width || 0, sprite.height || 0) > 128);

const getCharacterSpriteRenderSize = (
  sprite: any,
  sourceWidth?: number,
  sourceHeight?: number,
) => {
  const width = sourceWidth || sprite?.width || 0;
  const height = sourceHeight || sprite?.height || 0;
  if (!width || !height) {
    return { renderWidth: 1, renderHeight: DEFAULT_CHARACTER_HEIGHT };
  }

  const worldHeight =
    SPRITE_WORLD_HEIGHT_OVERRIDES[sprite.id] ??
    (isIllustrationSpriteDef(sprite)
      ? ILLUSTRATED_CHARACTER_HEIGHT
      : DEFAULT_CHARACTER_HEIGHT);

  return {
    renderWidth: Math.min(1.75, Math.max(0.35, width / height)) * worldHeight,
    renderHeight: worldHeight,
  };
};

const createSpriteTextureEntry = (
  cacheKey: string,
  spriteDef: any,
  texture: THREE.Texture | null,
): SpriteTextureCacheEntry => ({
  cacheKey,
  texture,
  spriteDef,
  ready: !!texture && !isAnimatedSprite(spriteDef),
  activeUsers: 0,
  subscribers: new Set(),
});

const getSpriteTextureEntry = (
  spriteId: string | undefined,
  gamePackage: any,
) => {
  if (!spriteId) return { texture: null, spriteDef: null };

  const sprite = gamePackage.sprite_library.find(
    (s: any) => s.id === spriteId,
  );
  if (!sprite) return { texture: null, spriteDef: null };

  const cacheKey = [
    sprite.id,
    sprite.data_url ? `url:${sprite.data_url.length}` : "pixels",
    isAnimatedSprite(sprite) ? "animated" : "static",
    sprite.width || 0,
    sprite.height || 0,
    sprite.pixels?.length || 0,
  ].join("|");
  const cached = spriteTextureCache.get(cacheKey);
  if (cached) return cached;

  if (sprite.data_url) {
    if (isAnimatedSprite(sprite)) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.anisotropy = 4;
      texture.colorSpace = THREE.SRGBColorSpace;
      const entry = createSpriteTextureEntry(cacheKey, sprite, texture);
      spriteTextureCache.set(cacheKey, entry);
      void loadAnimatedSpriteAtlas(entry, sprite.data_url);
      return entry;
    }

    const texture = new THREE.TextureLoader().load(sprite.data_url);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    // Anisotropic sampling keeps minified illustration sprites sharp instead
    // of letting trilinear mipmaps smear them (clamped to hardware max).
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    const entry = createSpriteTextureEntry(cacheKey, sprite, texture);
    spriteTextureCache.set(cacheKey, entry);
    return entry;
  }

  if (!sprite.pixels || sprite.pixels.length === 0) {
    const entry = createSpriteTextureEntry(cacheKey, sprite, null);
    spriteTextureCache.set(cacheKey, entry);
    return entry;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sprite.width || 128;
  canvas.height = sprite.height || 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const entry = createSpriteTextureEntry(cacheKey, sprite, null);
    spriteTextureCache.set(cacheKey, entry);
    return entry;
  }

  ctx.imageSmoothingEnabled = false;
  const pixels = sprite.pixels || [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const color = pixels[y * canvas.width + x];
      if (color && color !== "transparent") {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const entry = createSpriteTextureEntry(cacheKey, sprite, texture);
  spriteTextureCache.set(cacheKey, entry);
  return entry;
};

function useSpriteTexture(spriteId: string | undefined, gamePackage: any) {
  const [, setRevision] = useState(0);
  const entry = useMemo(
    () => getSpriteTextureEntry(spriteId, gamePackage),
    [spriteId, gamePackage.sprite_library],
  );
  useEffect(() => {
    if (!entry.cacheKey || !isAnimatedSprite(entry.spriteDef)) return;
    entry.activeUsers = (entry.activeUsers || 0) + 1;
    if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = undefined;
    }
    const notify = () => setRevision((revision) => (revision + 1) % 1_000_000);
    entry.subscribers?.add(notify);
    return () => {
      entry.subscribers?.delete(notify);
      entry.activeUsers = Math.max(0, (entry.activeUsers || 1) - 1);
      if (entry.activeUsers > 0 || entry.releaseTimer) return;
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = undefined;
        if ((entry.activeUsers || 0) > 0 || !entry.cacheKey) return;
        entry.disposed = true;
        entry.texture?.dispose();
        const image = entry.texture?.image;
        if (image instanceof HTMLCanvasElement) {
          image.width = 1;
          image.height = 1;
        }
        if (spriteTextureCache.get(entry.cacheKey) === entry) {
          spriteTextureCache.delete(entry.cacheKey);
        }
      }, ANIMATED_SPRITE_RELEASE_DELAY_MS);
    };
  }, [entry]);
  return entry;
}

function AnimatedSpriteTextureDriver() {
  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    spriteTextureCache.forEach((entry) => {
      const source = entry.animatedSource;
      if (
        (entry.activeUsers || 0) > 0 &&
        source?.durations.length &&
        now >= source.nextFrameAt
      ) {
        let nextFrame = source.frameIndex;
        let nextFrameAt = source.nextFrameAt;
        let advances = 0;
        do {
          nextFrame = (nextFrame + 1) % source.durations.length;
          nextFrameAt += Math.max(20, source.durations[nextFrame] || 100);
          advances += 1;
        } while (
          now >= nextFrameAt &&
          advances < source.durations.length
        );
        if (now >= nextFrameAt) {
          nextFrameAt = now + Math.max(20, source.durations[nextFrame] || 100);
        }
        showAnimatedSpriteAtlasFrame(entry, nextFrame);
        source.nextFrameAt = nextFrameAt;
      }
    });
  });
  return null;
}

interface ReferenceGameRendererProps {
  glide?: boolean;
  focusOverride?: [number, number] | null;
  map: MapData;
  playerPos?: [number, number];
  playerFacing?: [number, number];
  playerSpriteId?: string;
  // Ground items currently visible (authored minus taken, plus dropped).
  worldItems?: { id: string; cell: [number, number]; icon: string }[];
  // Extra object placements rendered with the map's own (e.g. containers).
  extraPlacements?: ObjectPlacementData[];
  onCellClick?: (x: number, z: number) => void;
  onCellHover?: (x: number, z: number) => void;
  onPointerOut?: () => void;
  targetPattern?: { x: number; z: number }[];
  // Cells inside the aimed skill's range — drawn as a faint field beneath
  // the brighter targetPattern highlight.
  rangeCells?: { x: number; z: number }[];
  hoveredCell?: [number, number] | null;
  editLayerY?: number;
  entityStates?: Record<string, any>;
  partyFollowers?: { entity_id: string; cell: [number, number] }[];
  partyMemberIds?: string[];
  mapDelta?: MapDelta;
  // Turn-queue combat: true while the queue runs; activeTurnKey is the actor
  // whose turn it is ("player", a party entity id, or an enemy state key).
  inCombat?: boolean;
  activeTurnKey?: string | null;
  showGrid?: boolean;
  enableOcclusion?: boolean;
  occlusionAzimuth?: number;
  renderCenter?: [number, number];
  renderRadius?: number;
  fxCellTransform?: (cell: readonly [number, number]) => [number, number];
  rawPointerCoordinates?: boolean;
  isCellVisible?: (cell: readonly [number, number]) => boolean;
  getCellFogState?: (cell: readonly [number, number]) => FogRenderState;
  getCellIllumination?: (cell: readonly [number, number]) => number;
  getStructureIllumination?: (cell: readonly [number, number]) => number;
  suppressPlacementLights?: boolean;
}

export interface GameRenderer3DProps {
  map: MapData;
  gridSpace?: RendererGridSpace;
  fineRatio?: number;
  playerPos?: [number, number];
  playerFacing?: [number, number];
  playerSpriteId?: string;
  worldItems?: { id: string; cell: [number, number]; icon: string }[];
  extraPlacements?: ObjectPlacementData[];
  onCellClick?: (x: number, z: number) => void;
  onCellHover?: (x: number, z: number) => void;
  onPointerOut?: () => void;
  targetPattern?: { x: number; z: number }[];
  rangeCells?: { x: number; z: number }[];
  hoveredCell?: [number, number] | null;
  editLayerY?: number;
  entityStates?: Record<string, any>;
  actorPhysicalStates?: Record<string, ActorPhysicalStateRecord>;
  partyFollowers?: { entity_id: string; cell: [number, number] }[];
  partyMemberIds?: string[];
  mapDelta?: MapDelta;
  inCombat?: boolean;
  activeTurnKey?: string | null;
  combatOverwatchZones?: ImmersiveCombatOverwatchZone[];
  combatIntents?: ImmersiveCombatIntentRecord[];
  perceptionAlerts?: ImmersivePerceptionAlertRecord[];
  showBehaviorIntents?: boolean;
  worldDeniedCells?: { x: number; z: number; kind?: string }[];
  showGrid?: boolean;
  enableOcclusion?: boolean;
  occlusionAzimuth?: number;
  renderCenter?: [number, number];
  renderRadius?: number;
  lintProblems?: { cell?: [number, number] | null; severity: string }[];
  brushSize?: number;
  fitSignal?: number;
  fogOfWar?: boolean;
  fogRadius?: number;
  initialExplored?: Record<string, string[]>;
  onExplore?: (mapId: string, cellKeys: string[]) => void;
  fogResolution?: "macro" | "fine";
  authoritativeVisibility?: ImmersiveViewerVisibilitySnapshot | null;
  showPerceptionDebug?: boolean;
  performanceMode?: boolean;
}

const TILE_SLIDE_SPEED = 8.5;
const TILE_SLIDE_SNAP_DISTANCE = 10;
const TILE_SLIDE_EPSILON = 0.000001;
const RENDER_CHUNK_SIZE = 12;
const RENDER_WINDOW_SHIFT_DISTANCE = 8;
const DEFAULT_RENDER_RADIUS = 28;

// ── Rainbow-dusk sky ────────────────────────────────────────────────────────
// A large inverted sphere with an unlit gradient shader: indigo zenith →
// magenta → orange/pink horizon, iridescent cloud streaks, and a pale sun.
// Follows the camera so it always wraps the scene; renders behind everything.
const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = `
  precision mediump float;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zenith  = vec3(0.09, 0.05, 0.18);
    vec3 high    = vec3(0.30, 0.13, 0.42);
    vec3 mid     = vec3(0.66, 0.22, 0.46);
    vec3 horizon = vec3(0.95, 0.58, 0.42);
    vec3 col = mix(horizon, mid,  smoothstep(0.0, 0.34, h));
    col = mix(col, high,   smoothstep(0.34, 0.68, h));
    col = mix(col, zenith, smoothstep(0.68, 1.0, h));
    // Iridescent cloud streaks banded across the mid sky.
    float az = atan(vDir.z, vDir.x);
    float band = sin(az * 6.0 + h * 11.0) * 0.5 + 0.5;
    band *= smoothstep(0.02, 0.5, h) * (1.0 - smoothstep(0.62, 1.0, h));
    vec3 irid = vec3(0.5 + 0.5 * sin(az * 3.0),
                     0.5 + 0.5 * sin(az * 3.0 + 2.094),
                     0.5 + 0.5 * sin(az * 3.0 + 4.188));
    col += irid * band * 0.14;
    // Pale sun: tight disc + soft halo.
    vec3 sunDir = normalize(vec3(-0.55, 0.34, -0.78));
    float s = max(dot(normalize(vDir), sunDir), 0.0);
    col += vec3(1.0, 0.92, 0.78) * pow(s, 80.0) * 1.0;
    col += vec3(1.0, 0.74, 0.52) * pow(s, 6.0) * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function SkyDome() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => {
    if (ref.current) ref.current.position.copy(state.camera.position);
  });
  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[500, 24, 16]} />
    </mesh>
  );
}

function SmoothPositionGroup({
  position,
  snapDistance = TILE_SLIDE_SNAP_DISTANCE,
  onPositionUpdate,
  children,
}: {
  position: [number, number, number];
  snapDistance?: number;
  onPositionUpdate?: (position: THREE.Vector3) => void;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const currentRef = useRef(new THREE.Vector3(...position));
  const targetRef = useRef(new THREE.Vector3(...position));
  const nextTargetRef = useRef(new THREE.Vector3(...position));
  const stepRef = useRef(new THREE.Vector3());
  const hasPositionRef = useRef(false);
  const onPositionUpdateRef = useRef(onPositionUpdate);

  useEffect(() => {
    onPositionUpdateRef.current = onPositionUpdate;
  }, [onPositionUpdate]);

  useLayoutEffect(() => {
    const nextTarget = nextTargetRef.current.set(
      position[0],
      position[1],
      position[2],
    );
    if (!groupRef.current) return;

    if (
      hasPositionRef.current &&
      targetRef.current.distanceToSquared(nextTarget) < TILE_SLIDE_EPSILON
    ) {
      return;
    }

    if (
      !hasPositionRef.current ||
      currentRef.current.distanceTo(nextTarget) > snapDistance
    ) {
      currentRef.current.copy(nextTarget);
      targetRef.current.copy(nextTarget);
      groupRef.current.position.copy(nextTarget);
      hasPositionRef.current = true;
      onPositionUpdateRef.current?.(currentRef.current);
      return;
    }

    targetRef.current.copy(nextTarget);
  }, [
    position[0],
    position[1],
    position[2],
    snapDistance,
  ]);

  useFrame((_, frameDelta) => {
    if (!groupRef.current) return;

    const current = currentRef.current;
    const target = targetRef.current;
    const distance = current.distanceTo(target);

    if (distance > snapDistance) {
      current.copy(target);
    } else if (distance * distance >= TILE_SLIDE_EPSILON) {
      const maxStep = TILE_SLIDE_SPEED * Math.min(frameDelta, 0.05);

      if (distance <= maxStep) {
        current.copy(target);
      } else {
        current.add(
          stepRef.current
            .subVectors(target, current)
            .multiplyScalar(maxStep / distance),
        );
      }
    } else {
      return;
    }

    groupRef.current.position.copy(current);
    onPositionUpdateRef.current?.(current);
  });

  return <group ref={groupRef}>{children}</group>;
}

function HitFlashOverlay({
  born,
  width,
  height,
}: {
  born: number;
  width: number;
  height: number;
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    const age = performance.now() - born;
    mat.opacity = age < HIT_FLASH_MS ? 0.65 * (1 - age / HIT_FLASH_MS) : 0;
  });

  return (
    <Billboard position={[0, height * 0.5, 0]}>
      <mesh raycast={() => null} renderOrder={ACTOR_EFFECT_RENDER_ORDER}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={matRef}
          color="#ff4040"
          transparent
          opacity={0.65}
          depthTest
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}

const actorRenderPositions = new Map<string, THREE.Vector3>();

const ACTOR_SPRITE_RENDER_ORDER = 200;
const ACTOR_EFFECT_RENDER_ORDER = 210;
const ACTOR_UI_RENDER_ORDER = 220;
const ACTOR_RING_RENDER_ORDER = 180;
const PLAYER_RING_RENDER_ORDER = 190;
// Fog and its debug boundary top out at order 90. A camera-faded wall remains
// a readable silhouette above those screen-space overlays, while actor bands
// begin at 180 so the wall can never tint an actor standing in front of it.
const VISIBLE_STRUCTURE_RENDER_ORDER = 100;

const actorSpriteTint = (illumination: number | undefined) => {
  const brightness = resolveActorSpriteBrightness(illumination ?? 1);
  const channel = Math.round(brightness * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${channel}${channel}${channel}`;
};

const actorFallbackTint = (
  baseColor: string,
  illumination: number | undefined,
) =>
  `#${new THREE.Color(baseColor)
    .multiplyScalar(resolveActorSpriteBrightness(illumination ?? 1))
    .getHexString()}`;

const EntityNode = memo(function EntityNode({
  placement,
  entityDef,
  yOffset,
  gamePackage,
  hp,
  maxHp,
  fxKey,
  engaged,
  isActive,
  showHpWhenFull,
  actorId,
  illumination,
}: {
  placement: any;
  entityDef: any;
  yOffset: number;
  gamePackage: any;
  hp?: number;
  maxHp?: number;
  // Key into the fx store's hit flashes (entity state key).
  fxKey?: string;
  // Hostile within threat range of the player — keeps its HP bar visible
  // even at full health so a fight reads at a glance.
  engaged?: boolean;
  // This entity owns the current combat turn (bright cyan ring).
  isActive?: boolean;
  // Force the HP bar even at full health (party members during combat).
  showHpWhenFull?: boolean;
  actorId?: string;
  illumination?: number;
}) {
  const { texture, spriteDef, sourceWidth, sourceHeight, ready } =
    useSpriteTexture(entityDef.sprite_id, gamePackage);
  const hitFlashAt = useFxStore((state) =>
    fxKey ? state.hitFlashes[fxKey] : undefined,
  );
  const [visibleFlashAt, setVisibleFlashAt] = useState<number | null>(null);

  useEffect(() => {
    if (!hitFlashAt) return;
    setVisibleFlashAt(hitFlashAt);
    const timeout = window.setTimeout(() => {
      setVisibleFlashAt(null);
    }, HIT_FLASH_MS + 40);
    return () => window.clearTimeout(timeout);
  }, [hitFlashAt]);

  const showHp =
    hp !== undefined &&
    maxHp !== undefined &&
    (showHpWhenFull || (!entityDef.is_npc && (hp < maxHp || engaged)));
  const hpPercent = showHp ? Math.max(0, hp! / maxHp!) : 1;

  const { renderWidth, renderHeight } =
    getCharacterSpriteRenderSize(spriteDef, sourceWidth, sourceHeight);

  useEffect(
    () => () => {
      if (fxKey) actorRenderPositions.delete(fxKey);
      if (actorId) actorRenderPositions.delete(actorId);
    },
    [actorId, fxKey],
  );

  return (
    <SmoothPositionGroup
      position={[placement.cell[0], yOffset, placement.cell[1]]}
      onPositionUpdate={(position) => {
        if (fxKey) actorRenderPositions.set(fxKey, position.clone());
        if (actorId) actorRenderPositions.set(actorId, position.clone());
      }}
    >
      {engaged && !isActive && (
        <mesh
          position={[0, 0.015, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={ACTOR_RING_RENDER_ORDER}
        >
          <ringGeometry args={[0.34, 0.44, 20]} />
          <meshBasicMaterial
            color="#BF616A"
            transparent
            opacity={0.55}
            depthTest
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {/* Active-turn ring: whoever is acting right now wears the bright ring */}
      {isActive && (
        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={ACTOR_RING_RENDER_ORDER}
        >
          <ringGeometry args={[0.38, 0.52, 24]} />
          <meshBasicMaterial
            color="#7DF9FF"
            transparent
            opacity={0.9}
            depthTest
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {texture && ready ? (
        <Billboard position={[0, renderHeight * 0.5, 0]}>
          <mesh renderOrder={ACTOR_SPRITE_RENDER_ORDER}>
            <planeGeometry args={[renderWidth, renderHeight]} />
            <meshBasicMaterial
              map={texture}
              color={actorSpriteTint(illumination)}
              transparent
              alphaTest={0.1}
              depthTest
              depthWrite={false}
              fog={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      ) : (
        <>
          <mesh position={[0, 0.4, 0]} renderOrder={ACTOR_SPRITE_RENDER_ORDER}>
            <boxGeometry args={[0.6, 0.8, 0.6]} />
            <meshBasicMaterial
              color={actorFallbackTint(
                entityDef.is_npc ? "#A3BE8C" : "#BF616A",
                illumination,
              )}
              transparent
              opacity={1}
              depthTest
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 1.2, 0]} renderOrder={ACTOR_SPRITE_RENDER_ORDER}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial
              color={actorFallbackTint(
                entityDef.is_npc ? "#A3BE8C" : "#BF616A",
                illumination,
              )}
              transparent
              opacity={1}
              depthTest
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      )}

      {/* Hit flash — brief red wash over the sprite when this entity takes
          damage. Opacity is animated per-frame from the fx store timestamp. */}
      {fxKey && visibleFlashAt && (
        <HitFlashOverlay
          born={visibleFlashAt}
          width={renderWidth * 1.05}
          height={renderHeight * 1.05}
        />
      )}

      {/* Health Bar */}
      {showHp && (
        <Billboard position={[0, renderHeight + 0.18, 0]}>
          <mesh position={[0, 0, -0.01]} renderOrder={ACTOR_UI_RENDER_ORDER}>
            <planeGeometry args={[0.66, 0.1]} />
            <meshBasicMaterial
              color="#10101a"
              transparent
              opacity={0.85}
              depthTest
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[-0.3 * (1 - hpPercent), 0, 0]}
            renderOrder={ACTOR_UI_RENDER_ORDER + 1}
          >
            <planeGeometry args={[Math.max(0.001, 0.6 * hpPercent), 0.07]} />
            <meshBasicMaterial
              color={
                hpPercent > 0.5
                  ? "#4ade80"
                  : hpPercent > 0.25
                    ? "#facc15"
                    : "#ef4444"
              }
              transparent
              opacity={1}
              depthTest
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      )}
    </SmoothPositionGroup>
  );
});

// ── Floating combat text ────────────────────────────────────────────────────
// Damage/heal numbers rendered as canvas-texture billboards that drift up and
// fade out. Textures are cached per text+color pair (combat reuses a handful
// of values constantly).

const popupTextureCache = new Map<
  string,
  { texture: THREE.CanvasTexture; aspect: number }
>();
const getPopupTexture = (text: string, color: string) => {
  const cacheKey = `${color}|${text}`;
  const cached = popupTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 56px 'Arial Black', sans-serif";
  const width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.width = Math.max(48, width);
  canvas.height = 80;
  ctx.font = "bold 56px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const entry = { texture, aspect: canvas.width / canvas.height };
  popupTextureCache.set(cacheKey, entry);
  return entry;
};

function DamagePopupNode({
  popup,
  baseY,
}: {
  popup: DamagePopup;
  baseY: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const { texture, aspect } = getPopupTexture(popup.text, popup.color);
  const startY = baseY + popup.y;

  useFrame(() => {
    const t = Math.min(1, (performance.now() - popup.born) / POPUP_LIFETIME_MS);
    if (groupRef.current) {
      // Ease-out rise: fast pop, slow drift.
      groupRef.current.position.y = startY + (1 - (1 - t) * (1 - t)) * 0.85;
    }
    if (matRef.current) {
      matRef.current.opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    }
  });

  const height = 0.46;
  return (
    <group ref={groupRef} position={[popup.cell[0], startY, popup.cell[1]]}>
      <Billboard>
        <mesh raycast={() => null} renderOrder={999}>
          <planeGeometry args={[height * aspect, height]} />
          <meshBasicMaterial
            ref={matRef}
            map={texture}
            transparent
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

function DamagePopupLayer({
  highestCellByCoord,
  objectById,
  transformCell,
  isCellVisible,
}: {
  highestCellByCoord: Map<string, CellData>;
  objectById: Map<string, ObjectData>;
  transformCell?: (cell: readonly [number, number]) => [number, number];
  isCellVisible?: (cell: readonly [number, number]) => boolean;
}) {
  const popups = useFxStore((state) => state.popups);
  const prunePopups = useFxStore((state) => state.prunePopups);
  const lastPruneRef = useRef(0);

  useFrame(() => {
    if (popups.length === 0) return;
    const now = performance.now();
    if (now - lastPruneRef.current > 250) {
      lastPruneRef.current = now;
      prunePopups();
    }
  });

  return (
    <>
      {popups.map((popup) => {
        const visualCell = transformCell?.(popup.cell) || popup.cell;
        if (isCellVisible && !isCellVisible(visualCell)) return null;
        const cell =
          highestCellByCoord.get(
            getCellCoordKey(Math.round(visualCell[0]), Math.round(visualCell[1])),
          ) || null;
        return (
          <DamagePopupNode
            key={`popup_${popup.id}`}
            popup={{ ...popup, cell: visualCell }}
            baseY={getStandingSurfaceY(cell, objectById)}
          />
        );
      })}
    </>
  );
}

// ── Ambient bark speech bubbles ──────────────────────────────────────────────
// Overheard NPC-to-NPC lines, word-wrapped onto a soft dark plate so they read
// as speech rather than damage numbers. Cached per string since the same line
// recurs across a playthrough.
const barkTextureCache = new Map<
  string,
  { texture: THREE.CanvasTexture; aspect: number; lineCount: number }
>();

const getBarkTexture = (text: string) => {
  const cached = barkTextureCache.get(text);
  if (cached) return cached;

  const fontPx = 46;
  const padX = 34;
  const padY = 26;
  const lineH = fontPx * 1.3;
  const maxLineWidth = 620;

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `500 ${fontPx}px Georgia, 'Times New Roman', serif`;

  // Greedy word wrap.
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (measure.measureText(trial).width > maxLineWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);

  const textWidth = Math.max(
    ...lines.map((line) => measure.measureText(line).width),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(textWidth + padX * 2);
  canvas.height = Math.ceil(lines.length * lineH + padY * 2);
  const ctx = canvas.getContext("2d")!;

  // Soft rounded plate.
  const r = 18;
  const w = canvas.width;
  const h = canvas.height;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(14, 12, 18, 0.82)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(196, 184, 162, 0.35)";
  ctx.stroke();

  ctx.font = `500 ${fontPx}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(233, 226, 212, 0.98)";
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, padY + lineH * (i + 0.5));
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const entry = { texture, aspect: w / h, lineCount: lines.length };
  barkTextureCache.set(text, entry);
  return entry;
};

// World height per wrapped line of speech — kept well above combat numbers so
// an overheard sentence is comfortably legible at the default camera distance.
const BARK_WORLD_LINE_HEIGHT = 0.62;
// Clearance from the standing surface to the bottom edge of the speech plate,
// so it floats clear of the speaker's head and HP-bar band regardless of how
// many lines the plate has.
const BARK_BOTTOM_CLEARANCE = 1.85;

function BarkNode({
  bark,
  baseY,
  visualCell,
}: {
  bark: Bark;
  baseY: number;
  visualCell: [number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const { texture, aspect, lineCount } = getBarkTexture(bark.text);
  const height = BARK_WORLD_LINE_HEIGHT * Math.max(1, lineCount) + 0.22;
  // Anchor by the plate's bottom edge so taller (multi-line) plates grow
  // upward rather than sinking into the sprite.
  const baseCenterY = baseY + BARK_BOTTOM_CLEARANCE + height / 2;
  const fadeMs = 280;

  useFrame(() => {
    const now = performance.now();
    const age = now - bark.showAt;
    const group = groupRef.current;
    const mat = matRef.current;
    if (!group || !mat) return;
    if (age < 0 || age > bark.lifetime) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const actorPosition = bark.actorId
      ? actorRenderPositions.get(bark.actorId)
      : undefined;
    group.position.x = actorPosition?.x ?? visualCell[0];
    group.position.z = actorPosition?.z ?? visualCell[1];
    // Fade in, hold, fade out.
    let opacity = 1;
    if (age < fadeMs) opacity = age / fadeMs;
    else if (age > bark.lifetime - fadeMs)
      opacity = Math.max(0, (bark.lifetime - age) / fadeMs);
    mat.opacity = opacity;
    // Gentle settle: rises a touch as it appears.
    group.position.y =
      (actorPosition?.y ?? baseY) +
      BARK_BOTTOM_CLEARANCE +
      height / 2 +
      Math.min(0.12, age / 1600);
  });

  return (
    <group
      ref={groupRef}
      position={[visualCell[0], baseCenterY, visualCell[1]]}
      visible={false}
    >
      <Billboard>
        <mesh raycast={() => null} renderOrder={1000}>
          <planeGeometry args={[height * aspect, height]} />
          <meshBasicMaterial
            ref={matRef}
            map={texture}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

function BarkLayer({
  highestCellByCoord,
  objectById,
  transformCell,
  isCellVisible,
}: {
  highestCellByCoord: Map<string, CellData>;
  objectById: Map<string, ObjectData>;
  transformCell?: (cell: readonly [number, number]) => [number, number];
  isCellVisible?: (cell: readonly [number, number]) => boolean;
}) {
  const barks = useFxStore((state) => state.barks);
  const pruneBarks = useFxStore((state) => state.pruneBarks);
  const lastPruneRef = useRef(0);

  useFrame(() => {
    if (barks.length === 0) return;
    const now = performance.now();
    if (now - lastPruneRef.current > 400) {
      lastPruneRef.current = now;
      pruneBarks();
    }
  });

  return (
    <>
      {barks.map((bark) => {
        const visualCell = transformCell?.(bark.cell) || bark.cell;
        if (isCellVisible && !isCellVisible(visualCell)) return null;
        const cell =
          highestCellByCoord.get(
            getCellCoordKey(Math.round(visualCell[0]), Math.round(visualCell[1])),
          ) || null;
        return (
          <BarkNode
            key={`bark_${bark.id}`}
            bark={bark}
            baseY={getStandingSurfaceY(cell, objectById)}
            visualCell={visualCell}
          />
        );
      })}
    </>
  );
}

const _playerVec = new THREE.Vector3();
const _vec3 = new THREE.Vector3();

export const playerStateRef = { px: 0, py: 0, pz: 0, ready: false };

const readoutTextureCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

const getReadoutTexture = (text: string, color: string) => {
  const cacheKey = `${text}|${color}`;
  const cached = readoutTextureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = "700 34px sans-serif";
  const width = Math.max(120, Math.ceil(context.measureText(text).width + 44));
  canvas.width = width;
  canvas.height = 58;
  context.fillStyle = "rgba(7, 10, 18, 0.9)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.font = "700 34px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f8fafc";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const result = { texture, aspect: canvas.width / canvas.height };
  readoutTextureCache.set(cacheKey, result);
  return result;
};

const physicalReadout = (state: ActorPhysicalStateRecord | undefined) => {
  if (!state) return null;
  if (state.labels.length > 0) return state.labels[0];
  if (state.heat >= 0.65) return "On Fire";
  if (state.chill >= 0.65) return "Freezing";
  if (state.wetness >= 0.55) return "Soaked";
  if (state.charge >= 0.55) return "Charged";
  if (state.coating >= 0.5) return "Foamed";
  if (state.toxicity >= 0.5) return "Toxic";
  return null;
};

function ActorReadoutBadge({
  actorIds,
  fallback,
  text,
  color,
  height = 2.15,
}: {
  actorIds: string[];
  fallback: [number, number];
  text: string;
  color: string;
  height?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { texture, aspect } = useMemo(
    () => getReadoutTexture(text, color),
    [text, color],
  );
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const actorPosition = actorIds
      .map((actorId) => actorRenderPositions.get(actorId))
      .find(Boolean);
    const playerPosition = actorIds.includes("player") && playerStateRef.ready
      ? playerStateRef
      : null;
    group.position.set(
      actorPosition?.x ?? playerPosition?.px ?? fallback[0],
      (actorPosition?.y ?? playerPosition?.py ?? 0) + height,
      actorPosition?.z ?? playerPosition?.pz ?? fallback[1],
    );
  });
  const badgeHeight = 0.28;
  return (
    <group ref={groupRef} position={[fallback[0], height, fallback[1]]}>
      <Billboard>
        <mesh raycast={() => null} renderOrder={950}>
          <planeGeometry args={[badgeHeight * aspect, badgeHeight]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

const resolveLiveActorPosition = (
  actorIds: string[],
  fallback: [number, number],
) => {
  const actorPosition = actorIds
    .map((actorId) => actorRenderPositions.get(actorId))
    .find(Boolean);
  if (actorPosition) return actorPosition;
  if (actorIds.includes("player") && playerStateRef.ready) {
    return new THREE.Vector3(playerStateRef.px, playerStateRef.py, playerStateRef.pz);
  }
  return new THREE.Vector3(fallback[0], 0, fallback[1]);
};

function ActorTether({
  sourceActorIds,
  sourceFallback,
  targetActorIds = [],
  targetFallback,
  color,
  dashed = false,
}: {
  sourceActorIds: string[];
  sourceFallback: [number, number];
  targetActorIds?: string[];
  targetFallback: [number, number];
  color: string;
  dashed?: boolean;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  useFrame(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const source = resolveLiveActorPosition(sourceActorIds, sourceFallback);
    const target = resolveLiveActorPosition(targetActorIds, targetFallback);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    position.setXYZ(0, source.x, source.y + 0.82, source.z);
    position.setXYZ(1, target.x, target.y + 0.45, target.z);
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  });
  return (
    <lineSegments raycast={() => null} renderOrder={700}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(6), 3]}
        />
      </bufferGeometry>
      {dashed ? (
        <lineDashedMaterial color={color} dashSize={0.22} gapSize={0.14} depthTest={false} />
      ) : (
        <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
      )}
    </lineSegments>
  );
}

function ActorReadoutLayer({
  map,
  entityStates,
  actorPhysicalStates,
  perceptionAlerts,
  combatIntents,
  showBehaviorIntents,
  transformCell,
  isCellVisible,
}: {
  map: MapData;
  entityStates?: Record<string, any>;
  actorPhysicalStates?: Record<string, ActorPhysicalStateRecord>;
  perceptionAlerts?: ImmersivePerceptionAlertRecord[];
  combatIntents?: ImmersiveCombatIntentRecord[];
  showBehaviorIntents?: boolean;
  transformCell: (cell: readonly unknown[]) => [number, number];
  isCellVisible?: (cell: readonly [number, number]) => boolean;
}) {
  const alerts = new Map<string, ImmersivePerceptionAlertRecord>();
  (perceptionAlerts || []).forEach((alert) => {
    alerts.set(alert.actor_id, alert);
    alerts.set(alert.entity_id, alert);
  });
  const badges: React.ReactNode[] = [];
  map.entity_placements.forEach((placement, index) => {
    const key = entityPlacementStateKey(map.id, placement, index);
    const state = entityStates?.[key] || entityStates?.[placement.entity_id];
    if (state?.dead || state?.hidden) return;
    const fallback = (state?.cell || placement.cell) as [number, number];
    if (isCellVisible && !isCellVisible(fallback)) return;
    const physical = physicalReadout(
      actorPhysicalStates?.[key] || actorPhysicalStates?.[placement.entity_id],
    );
    const alert = alerts.get(key) || alerts.get(placement.entity_id);
    const behavior = state?.behavior_intent as EntityBehaviorIntentRecord | undefined;
    if (physical) {
      badges.push(
        <ActorReadoutBadge
          key={`${key}:physical`}
          actorIds={[key, placement.entity_id]}
          fallback={fallback}
          text={physical}
          color="#fb923c"
        />,
      );
    }
    if (alert && alert.alertness !== "oblivious") {
      badges.push(
        <ActorReadoutBadge
          key={`${key}:alert`}
          actorIds={[key, placement.entity_id]}
          fallback={fallback}
          text={alert.alertness === "combat" ? "!!" : alert.alertness === "searching" ? "!" : "?"}
          color={alert.alertness === "combat" ? "#fb7185" : "#fbbf24"}
          height={physical ? 2.5 : 2.15}
        />,
      );
    }
    if (showBehaviorIntents && behavior) {
      badges.push(
        <ActorReadoutBadge
          key={`${key}:behavior`}
          actorIds={[key, placement.entity_id]}
          fallback={fallback}
          text={`${behavior.tier}: ${behavior.label}`}
          color="#c084fc"
          height={physical || alert ? 2.82 : 2.15}
        />,
      );
    }
  });
  const playerPhysical = physicalReadout(actorPhysicalStates?.player);
  if (playerPhysical) {
    badges.push(
      <ActorReadoutBadge
        key="player:physical"
        actorIds={["player"]}
        fallback={[playerStateRef.px, playerStateRef.pz]}
        text={playerPhysical}
        color="#fb923c"
      />,
    );
  }
  const tethers: React.ReactNode[] = [];
  (perceptionAlerts || []).forEach((alert, index) => {
    if (alert.alertness === "oblivious") return;
    const source = transformCell(alert.cell);
    if (isCellVisible && !isCellVisible(source)) return;
    const target = transformCell(alert.target_cell);
    tethers.push(
      <ActorTether
        key={`perception:${alert.actor_id}:${index}`}
        sourceActorIds={[alert.actor_id, alert.entity_id]}
        sourceFallback={source}
        targetActorIds={alert.tracks_live_target ? ["player"] : []}
        targetFallback={target}
        color={alert.alertness === "combat" ? "#fb7185" : "#fbbf24"}
        dashed={alert.alertness !== "combat"}
      />,
    );
  });
  (combatIntents || []).forEach((intent, index) => {
    if (intent.action_type === "overwatch") return;
    const targetCell = intent.target_cells[0];
    if (!targetCell) return;
    const sourceState = entityStates?.[intent.actor_id];
    if (
      isCellVisible &&
      sourceState?.cell &&
      !isCellVisible(sourceState.cell as [number, number])
    ) return;
    tethers.push(
      <ActorTether
        key={`combat-intent:${intent.actor_id}:${index}`}
        sourceActorIds={[intent.actor_id]}
        sourceFallback={[0, 0]}
        targetActorIds={intent.target_actor_id ? [intent.target_actor_id] : []}
        targetFallback={transformCell(targetCell)}
        color="#ef4444"
        dashed={intent.action_type === "advance"}
      />,
    );
  });
  return <>{badges}{tethers}</>;
}

// World items render as floating icon billboards. Textures are cached per
// icon string since most maps reuse a handful of item icons.
const emojiTextureCache = new Map<string, THREE.CanvasTexture>();
const getEmojiTexture = (icon: string) => {
  const cached = emojiTextureCache.get(icon);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "44px serif";
    ctx.fillText(icon, 32, 36);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  emojiTextureCache.set(icon, texture);
  return texture;
};

function WorldItemNode({
  cell,
  icon,
  sprite_id,
  gamePackage,
  yBase,
}: {
  cell: [number, number];
  icon: string;
  sprite_id?: string;
  gamePackage: any;
  yBase: number;
}) {
  const emojiTexture = useMemo(() => sprite_id ? null : getEmojiTexture(icon || "📦"), [icon, sprite_id]);
  const {
    texture: spriteTexture,
    spriteDef,
    sourceWidth,
    sourceHeight,
  } = useSpriteTexture(sprite_id, gamePackage);
  const texture = sprite_id ? spriteTexture : emojiTexture;

  const spriteWidth = sourceWidth || spriteDef?.width || 0;
  const spriteHeight = sourceHeight || spriteDef?.height || 0;
  const renderHeight = spriteDef ? 0.8 : 0.55;
  const renderWidth = spriteDef && spriteHeight
    ? Math.min(1.75, Math.max(0.35, spriteWidth / spriteHeight)) * renderHeight
    : 0.55;

  const groupRef = useRef<THREE.Group>(null);
  const phase = useMemo(
    () => Math.abs(cell[0] * 13.37 + cell[1] * 7.77) % Math.PI,
    [cell],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y =
      yBase + 0.34 + Math.sin(clock.elapsedTime * 2 + phase) * 0.05;
  });

  return (
    <group ref={groupRef} position={[cell[0], yBase + 0.34, cell[1]]}>
      <Billboard>
        <mesh raycast={() => null}>
          <planeGeometry args={[renderWidth, renderHeight]} />
          <meshBasicMaterial
            map={texture}
            transparent
            alphaTest={0.05}
            depthWrite={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

function useWebGLContextRecovery() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("WebGL context lost; attempting browser restore.");
    };
    const handleContextRestored = () => {
      gl.resetState();
      console.info("WebGL context restored.");
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [gl]);
}

const SmartCellRenderer = memo(function SmartCellRenderer({
  cell,
  materials,
  tileObjDef,
  isTargeted,
  isHovered,
  onCellClick,
  onCellHover,
}: any) {
  const isWalkable = cell.walkable;
  const h = cell.visual_height * 0.5;
  const cy = cell.y || 0;
  const topY = cy + (h > 0 ? h : 0.5);
  const canObscure = topY > 0.6; // Will it ever be above player + 0.5?

  const groupRef = useRef<THREE.Group>(null);

  const walkMat = useMemo(
    () => (canObscure ? materials.walkable.clone() : materials.walkable),
    [materials.walkable, canObscure],
  );
  const blockMat = useMemo(
    () => (canObscure ? materials.blocked.clone() : materials.blocked),
    [materials.blocked, canObscure],
  );

  useFrame(({ camera }) => {
    if (!groupRef.current || !canObscure) return;

    _playerVec.set(playerStateRef.px, playerStateRef.py, playerStateRef.pz);

    let targetOpacity = 1.0;

    // Check if cell is above player and might block view
    if (topY > playerStateRef.py + 0.5) {
      const px = _playerVec.x;
      const pz = _playerVec.z;
      const cx = camera.position.x;
      const cz = camera.position.z;

      const pcX = cx - px;
      const pcZ = cz - pz;
      const pcLenSq = pcX * pcX + pcZ * pcZ;

      let distSq = 0;

      if (pcLenSq < 0.001) {
        // Camera is right above player
        const dx = cell.x - px;
        const dz = cell.z - pz;
        distSq = dx * dx + dz * dz;
      } else {
        // Line segment distance
        const vX = cell.x - px;
        const vZ = cell.z - pz;
        let t = (vX * pcX + vZ * pcZ) / pcLenSq;
        t = Math.max(0, Math.min(1, t)); // Clamp to segment

        const closestX = px + t * pcX;
        const closestZ = pz + t * pcZ;
        const dx = cell.x - closestX;
        const dz = cell.z - closestZ;
        distSq = dx * dx + dz * dz;
      }

      // Also add a small bubble around player to clear roof properly
      const pDx = cell.x - px;
      const pDz = cell.z - pz;
      const playerDistSq = pDx * pDx + pDz * pDz;

      // If cell is close to the View Ray OR close to the player
      if (distSq < 20 || playerDistSq < 20) {
        targetOpacity = 0.1;
      }
    }

    const newTransparent = targetOpacity < 1.0;
    if (walkMat.transparent !== newTransparent) {
      walkMat.transparent = newTransparent;
      walkMat.needsUpdate = true;
    }
    if (blockMat.transparent !== newTransparent) {
      blockMat.transparent = newTransparent;
      blockMat.needsUpdate = true;
    }

    const lerpFactor = 0.1;
    walkMat.opacity += (targetOpacity - walkMat.opacity) * lerpFactor;
    blockMat.opacity += (targetOpacity - blockMat.opacity) * lerpFactor;

    // Quick traverse to set opacity for custom shapes
    if (groupRef.current) {
      groupRef.current.traverse((child: any) => {
        if (
          child.isMesh &&
          child.material !== materials.targetHighlight &&
          child.material !== materials.gridLine &&
          child.material !== walkMat &&
          child.material !== blockMat
        ) {
          if (child.material.transparent !== newTransparent) {
            child.material.transparent = newTransparent;
            child.material.needsUpdate = true;
          }
          child.material.opacity = walkMat.opacity;
        }
      });
    }
  });

  return (
    <group
      ref={groupRef}
      position={[cell.x, cell.y || 0, cell.z]}
      onClick={(e) => {
        if (onCellClick) {
          e.stopPropagation();
          onCellClick(cell.x, cell.z);
        }
      }}
      onPointerOver={(e) => {
        if (onCellHover) {
          e.stopPropagation();
          onCellHover(cell.x, cell.z);
        }
      }}
    >
      {tileObjDef ? (
        <group position={[0, 0, 0]}>
          <ObjectModelRenderer object={tileObjDef} />
        </group>
      ) : h > 0 ? (
        <mesh
          material={isWalkable ? walkMat : blockMat}
          position={[0, h / 2, 0]}
        >
          <boxGeometry args={[1, h, 1]} />
        </mesh>
      ) : (
        <mesh
          material={isWalkable ? walkMat : blockMat}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      )}

      {(isTargeted || isHovered) && (
        <mesh position={[0, h + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <primitive object={materials.targetHighlight} attach="material" />
        </mesh>
      )}

      {/* Outline/grid style stroke */}
      <lineSegments position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(1, 1)]} />
        <primitive object={materials.gridLine} attach="material" />
      </lineSegments>
    </group>
  );
});

const getHighestCell = (map: MapData, x: number, z: number) => {
  const matches = map.cells.filter((c) => c.x === x && c.z === z && c.walkable);
  if (matches.length === 0) return null;
  return matches.reduce((prev, curr) =>
    (curr.y || 0) + curr.visual_height * 0.5 >
    (prev.y || 0) + prev.visual_height * 0.5
      ? curr
      : prev,
  );
};

const getCellCoordKey = (x: number, z: number) => `${x}:${z}`;

const getStandingCellAtWorldPoint = (
  cellsByCoord: Map<string, CellData>,
  x: number,
  z: number,
) =>
  cellsByCoord.get(getCellCoordKey(x, z)) ||
  cellsByCoord.get(getCellCoordKey(Math.round(x), Math.round(z))) ||
  null;

const getCellTopY = (cell: CellData) =>
  (cell.y || 0) + (cell.visual_height || 0) * 0.5;

const getTileSurfaceOffset = (
  tileDef: ObjectData | undefined,
  extents?: ReturnType<typeof getObjectVerticalExtents>,
) => {
  if (!tileDef) return 0.05;
  // Floor tile models may include raised painted/etched detail. That visual
  // relief should not lift characters and props above the actual floor plane.
  if (tileDef.tags?.includes("floor")) return 0;
  return (extents || getObjectVerticalExtents(tileDef)).maxY;
};

// Y of the standing surface at a cell. Raised cells (visual_height > 0)
// render as boxes, so their top is the surface even when a flat floor object
// is also present; flat cells take the floor object's mesh height instead.
const getStandingSurfaceY = (
  cell: CellData | null,
  objectById: Map<string, ObjectData>,
  minOffset = 0.05,
) => {
  let baseHeight = cell ? cell.y || 0 : 0;
  let surfaceOffset = minOffset;
  if (cell && (cell.visual_height || 0) > 0) {
    baseHeight += (cell.visual_height || 0) * 0.5;
  } else if (cell?.object_id) {
    const tileDef = objectById.get(cell.object_id);
    if (tileDef) {
      surfaceOffset = Math.max(minOffset, getTileSurfaceOffset(tileDef));
    }
  }
  return baseHeight + surfaceOffset;
};

const getOcclusionTopY = (cell: CellData) => {
  const height = (cell.visual_height || 0) * 0.5;
  return (cell.y || 0) + (height > 0 ? height : 0.5);
};

const OCCLUSION_MIN_TOP_Y = 0.6;
const OCCLUSION_RAY_LENGTH = 7;
const OCCLUSION_RAY_HALF_WIDTH = 1.45;
const OCCLUSION_FADE_OPACITY = 0.38;
// Cells whose base elevation is at least this are overhead geometry (roofs,
// high bridges). They occlude regardless of visual_height or object tags —
// roof cells are flat "floor" tiles raised to y=2, which the height/object
// tests alone would never catch.
const OCCLUSION_OVERHEAD_MIN_Y = 1.5;
// Roofs hide in a wider bubble than walls so a building's interior reads as
// a room, not a small fading patch around the player.
const OCCLUSION_OVERHEAD_PLAYER_RADIUS_SQ = 42;

const isOccludingCellObject = (object: ObjectData | null | undefined) =>
  Boolean(
    object &&
      !object.tags?.includes("floor") &&
      !object.tags?.includes("water") &&
      object.collision.profile !== "none",
  );

const isOverheadCell = (cell: CellData) =>
  (cell.y || 0) >= OCCLUSION_OVERHEAD_MIN_Y;

const shouldRenderCellWithOcclusion = (
  cell: CellData,
  object: ObjectData | null | undefined,
) =>
  cell.active !== false &&
  ((cell.visual_height || 0) * 0.5 > OCCLUSION_MIN_TOP_Y ||
    isOverheadCell(cell) ||
    isOccludingCellObject(object));

const isWallObject = (object: ObjectData | null | undefined) =>
  Boolean(object?.tags?.includes("wall"));

const isRoofObject = (object: ObjectData | null | undefined) =>
  Boolean(object?.tags?.includes("roof"));

const isFastTileObject = (object: ObjectData | null | undefined) =>
  !object ||
  (!isRoofObject(object) &&
    (object.tags?.includes("floor") ||
      object.tags?.includes("water") ||
      object.collision.profile === "none"));

const vectorToRotationY = (x: number, z: number) => Math.atan2(x, z);

const buildWallRotationByCell = (
  map: MapData,
  objectById: Map<string, ObjectData>,
) => {
  const wallCells = new Map<string, CellData>();
  const rotations = new Map<string, number>();
  const visited = new Set<string>();

  map.cells.forEach((cell) => {
    const object = cell.object_id ? objectById.get(cell.object_id) : null;
    if (isWallObject(object)) {
      wallCells.set(getCellCoordKey(cell.x, cell.z), cell);
    }
  });

  wallCells.forEach((startCell, startKey) => {
    if (visited.has(startKey)) return;

    const component: CellData[] = [];
    const queue = [startCell];
    visited.add(startKey);

    for (let index = 0; index < queue.length; index++) {
      const cell = queue[index];
      component.push(cell);

      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([dx, dz]) => {
        const key = getCellCoordKey(cell.x + dx, cell.z + dz);
        const neighbor = wallCells.get(key);
        if (!neighbor || visited.has(key)) return;
        visited.add(key);
        queue.push(neighbor);
      });
    }

    const centerX =
      component.reduce((total, cell) => total + cell.x, 0) / component.length;
    const centerZ =
      component.reduce((total, cell) => total + cell.z, 0) / component.length;

    component.forEach((cell) => {
      const dx = cell.x - centerX;
      const dz = cell.z - centerZ;
      let outX = 0;
      let outZ = 1;

      if (Math.abs(dx) >= Math.abs(dz) && Math.abs(dx) > 0.01) {
        outX = Math.sign(dx);
        outZ = 0;
      } else if (Math.abs(dz) > 0.01) {
        outX = 0;
        outZ = Math.sign(dz);
      }

      rotations.set(getCellCoordKey(cell.x, cell.z), vectorToRotationY(outX, outZ));
    });
  });

  return rotations;
};

type RuntimeMaterialProps = {
  id: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  textureKind: ReturnType<typeof resolveObjectMaterial>["textureKind"];
  textureScale: number;
  textureStrength: number;
  textureImageUrl?: string;
};

const getCellMaterialProps = (
  object: ObjectData | null | undefined,
  walkable: boolean,
): RuntimeMaterialProps => {
  if (object) {
    const material = resolveObjectMaterial(object);
    return {
      id: material.id,
      name: material.name,
      color: material.color,
      roughness: material.roughness,
      metalness: material.metalness,
      emissive: material.emissive,
      emissiveIntensity: material.emissiveIntensity,
      opacity: material.opacity,
      transparent: material.transparent,
      textureKind: material.textureKind,
      textureScale: material.textureScale,
      textureStrength: material.textureStrength,
      textureImageUrl: material.textureImageUrl,
    };
  }

  return {
    id: walkable ? "default_walkable" : "default_blocked",
    name: walkable ? "Walkable Floor" : "Blocked Tile",
    color: walkable ? "#2E3440" : "#3B4252",
    roughness: walkable ? 0.8 : 0.9,
    metalness: 0.02,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    transparent: false,
    textureKind: "none",
    textureScale: 1,
    textureStrength: 0,
    textureImageUrl: undefined,
  };
};

type CellVisualGroup = {
  key: string;
  cells: CellData[];
  kind: "plane" | "box";
  height: number;
  material: RuntimeMaterialProps;
  postFog: boolean;
  illumination: number;
};

function InstancedCellGroup({
  group,
  hiddenCellKeys,
}: {
  group: CellVisualGroup;
  hiddenCellKeys?: Set<string>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const texture = getObjectMaterialTexture(group.material);
  const normalMap = getObjectMaterialNormalMap(group.material);
  const roughnessMap = getObjectMaterialRoughnessMap(group.material);
  const normalScale = getObjectMaterialNormalScale(group.material);
  const materialEmission = resolveStructureEmission(
    group.material.color,
    group.material.emissive,
    group.material.emissiveIntensity,
    group.illumination,
  );

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    const dummy = new THREE.Object3D();
    group.cells.forEach((cell, index) => {
      const y = cell.y || 0;
      const hidden = hiddenCellKeys?.has(getCellCoordKey(cell.x, cell.z));
      if (group.kind === "plane") {
        dummy.position.set(cell.x, y + 0.001, cell.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(hidden ? 0.0001 : 1, hidden ? 0.0001 : 1, hidden ? 0.0001 : 1);
      } else {
        dummy.position.set(cell.x, y + group.height / 2, cell.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(hidden ? 0.0001 : 1, hidden ? 0.0001 : 1, hidden ? 0.0001 : 1);
      }
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });

    meshRef.current.count = group.cells.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [group, hiddenCellKeys]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined as any, undefined as any, group.cells.length]}
      frustumCulled={false}
      raycast={() => null}
      receiveShadow
      castShadow={group.kind === "box"}
      renderOrder={group.postFog ? VISIBLE_STRUCTURE_RENDER_ORDER : 0}
    >
      {group.kind === "plane" ? (
        <planeGeometry args={[1, 1]} />
      ) : (
        <boxGeometry args={[1, group.height, 1]} />
      )}
      <meshStandardMaterial
        map={texture || undefined}
        normalMap={normalMap || undefined}
        normalScale={[normalScale, normalScale]}
        roughnessMap={roughnessMap || undefined}
        color={group.material.color}
        roughness={group.material.roughness}
        metalness={group.material.metalness}
        emissive={materialEmission.color}
        emissiveIntensity={materialEmission.intensity}
        opacity={group.material.opacity}
        transparent={group.material.transparent || group.postFog}
        depthWrite={!group.material.transparent}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function getOccludedCellKeys(
  cells: CellData[],
  objectById: Map<string, ObjectData>,
  playerPos: [number, number] | undefined,
  cameraAzimuth: number,
) {
  const occludedKeys = new Set<string>();
  if (!playerPos) return occludedKeys;

  const [px, pz] = playerPos;

  const playerY = playerStateRef.ready ? playerStateRef.py : 0;
  // The wide roof-reveal bubble only applies while the player is actually
  // beneath overhead geometry (indoors). Outside, roofs fade via the camera
  // ray like walls do, so buildings don't peel open as the player walks past.
  const playerUnderOverhead = cells.some(
    (cell) =>
      isOverheadCell(cell) &&
      cell.x === px &&
      cell.z === pz &&
      (cell.y || 0) > playerY + 1.0,
  );

  cells.forEach((cell) => {
    const object = cell.object_id ? objectById.get(cell.object_id) : null;
    if (!shouldRenderCellWithOcclusion(cell, object)) return;

    const overhead = isOverheadCell(cell);
    // Overhead geometry only occludes while it is actually above the player;
    // if the player ever stands at roof height it must stay solid.
    if (overhead && (cell.y || 0) <= playerY + 1.0) return;

    // Geometry whose highest point is at or below the player never blocks the camera
    if (getOcclusionTopY(cell) <= playerY + 0.1) return;

    const dx = cell.x - px;
    const dz = cell.z - pz;
    const playerDistSq = dx * dx + dz * dz;
    const heightBias = THREE.MathUtils.clamp(
      (getOcclusionTopY(cell) - OCCLUSION_MIN_TOP_Y) * 0.08,
      0,
      0.65,
    );

    const insideIndoorRoofReveal =
      overhead &&
      playerUnderOverhead &&
      playerDistSq <= OCCLUSION_OVERHEAD_PLAYER_RADIUS_SQ;
    const betweenCameraAndPlayer = isWorldPointInCameraOcclusionCorridor(
      [cell.x, cell.z],
      playerPos,
      cameraAzimuth,
      OCCLUSION_RAY_LENGTH,
      OCCLUSION_RAY_HALF_WIDTH + heightBias,
    );

    // Walls and props fade only when they sit between the camera and player.
    // The radius reveal is reserved for roofs while the player is indoors.
    if (insideIndoorRoofReveal || betweenCameraAndPlayer) {
      occludedKeys.add(getCellCoordKey(cell.x, cell.z));
    }
  });

  return occludedKeys;
}

const resolveStructureEmission = (
  baseColor: THREE.ColorRepresentation,
  baseEmissive: THREE.ColorRepresentation,
  baseEmissiveIntensity: number,
  illumination: number,
) => {
  const fill = resolveStructureEmissiveFillStrength(illumination);
  const authoredIntensity = Math.max(0, baseEmissiveIntensity || 0);
  if (fill <= 0) {
    return {
      color: new THREE.Color(baseEmissive),
      intensity: authoredIntensity,
    };
  }

  // Preserve authored glow while adding a small albedo-colored readability
  // term backed by the authoritative light field. This is not a substitute
  // point light; it keeps upward-facing wall caps legible when their normals
  // cannot receive the cosmetic point light below them.
  const intensity = authoredIntensity + fill;
  const color = new THREE.Color(baseEmissive)
    .multiplyScalar(authoredIntensity)
    .add(new THREE.Color(baseColor).multiplyScalar(fill))
    .multiplyScalar(1 / intensity);
  return { color, intensity };
};

function applyGroupStructurePolicy(
  group: THREE.Group,
  opacity: number,
  postFog: boolean,
  illumination: number,
) {
  group.traverse((child: any) => {
    if (!child.isMesh || !child.material) return;

    const baseRenderOrderKey = "crpgBaseRenderOrder";
    if (child.userData[baseRenderOrderKey] === undefined) {
      child.userData[baseRenderOrderKey] = child.renderOrder || 0;
    }
    child.renderOrder =
      postFog || opacity < 0.999
        ? VISIBLE_STRUCTURE_RENDER_ORDER
        : child.userData[baseRenderOrderKey];

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.forEach((material: THREE.Material & { opacity?: number }) => {
      const baseOpacityKey = "crpgBaseOpacity";
      const baseTransparentKey = "crpgBaseTransparent";
      const baseDepthWriteKey = "crpgBaseDepthWrite";
      const baseColorKey = "crpgBaseColor";
      const baseEmissiveKey = "crpgBaseEmissive";
      const baseEmissiveIntensityKey = "crpgBaseEmissiveIntensity";
      if (material.userData[baseOpacityKey] === undefined) {
        material.userData[baseOpacityKey] =
          typeof material.opacity === "number" ? material.opacity : 1;
        material.userData[baseTransparentKey] = material.transparent;
        material.userData[baseDepthWriteKey] = material.depthWrite;
      }

      const litMaterial = material as THREE.MeshStandardMaterial;
      if (litMaterial.color && litMaterial.emissive) {
        if (material.userData[baseColorKey] === undefined) {
          material.userData[baseColorKey] = litMaterial.color.clone();
          material.userData[baseEmissiveKey] = litMaterial.emissive.clone();
          material.userData[baseEmissiveIntensityKey] =
            litMaterial.emissiveIntensity || 0;
        }
        const emission = resolveStructureEmission(
          material.userData[baseColorKey] as THREE.Color,
          material.userData[baseEmissiveKey] as THREE.Color,
          material.userData[baseEmissiveIntensityKey] as number,
          illumination,
        );
        litMaterial.emissive.copy(emission.color);
        litMaterial.emissiveIntensity = emission.intensity;
      }

      const baseOpacity = material.userData[baseOpacityKey] as number;
      const baseTransparent = material.userData[baseTransparentKey] as boolean;
      const baseDepthWrite = material.userData[baseDepthWriteKey] as boolean;
      const targetOpacity = baseOpacity * opacity;
      // Three renders all opaque objects before all transparent objects,
      // regardless of numeric renderOrder. Visible walls therefore enter the
      // transparent list even at opacity 1 so they can safely composite after
      // the fog masks. Solid walls retain depth writes; camera-faded walls do
      // not, so they cannot blacken actors that render later.
      const targetTransparent =
        baseTransparent || postFog || opacity < 0.999;
      const targetDepthWrite = baseDepthWrite && opacity >= 0.999;
      const updateProgram =
        material.transparent !== targetTransparent ||
        material.depthWrite !== targetDepthWrite;

      if (Math.abs((material.opacity ?? 1) - targetOpacity) > 0.001) {
        material.opacity = targetOpacity;
      }
      material.transparent = targetTransparent;
      material.depthWrite = targetDepthWrite;
      material.needsUpdate = updateProgram;
    });
  });
}

function OccludingCellRenderer({
  cell,
  object,
  rotationY,
  opacity,
  postFog,
  illumination,
}: {
  cell: CellData;
  object: ObjectData | null | undefined;
  rotationY: number;
  opacity: number;
  postFog: boolean;
  illumination: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const height = Math.max(0, (cell.visual_height || 0) * 0.5);
  const kind = height > 0 ? "box" : "plane";
  const material = getCellMaterialProps(object, cell.walkable);
  const texture = getObjectMaterialTexture(material);
  const normalMap = getObjectMaterialNormalMap(material);
  const roughnessMap = getObjectMaterialRoughnessMap(material);
  const normalScale = getObjectMaterialNormalScale(material);
  const fastTile = isFastTileObject(object);
  const materialOpacity = material.opacity * opacity;
  const materialTransparent = material.transparent || opacity < 0.999;
  const materialEmission = resolveStructureEmission(
    material.color,
    material.emissive,
    material.emissiveIntensity,
    illumination,
  );

  useLayoutEffect(() => {
    if (!groupRef.current || fastTile) return;
    applyGroupStructurePolicy(
      groupRef.current,
      opacity,
      postFog,
      illumination,
    );
  }, [fastTile, opacity, postFog, illumination]);

  return (
    <group
      ref={groupRef}
      position={[cell.x, cell.y || 0, cell.z]}
      rotation={[0, rotationY, 0]}
      renderOrder={
        postFog || opacity < 0.999 ? VISIBLE_STRUCTURE_RENDER_ORDER : 0
      }
    >
      {!fastTile && object ? (
        <ObjectRuntimeModelRenderer object={object} />
      ) : kind === "box" ? (
        <mesh
          position={[0, Math.max(0.05, height) / 2, 0]}
          raycast={() => null}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, Math.max(0.05, height), 1]} />
          <meshStandardMaterial
            map={texture || undefined}
            normalMap={normalMap || undefined}
            normalScale={[normalScale, normalScale]}
            roughnessMap={roughnessMap || undefined}
            color={material.color}
            roughness={material.roughness}
            metalness={material.metalness}
            emissive={materialEmission.color}
            emissiveIntensity={materialEmission.intensity}
            opacity={materialOpacity}
            transparent={materialTransparent || postFog}
            depthWrite={!materialTransparent}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : (
        <mesh
          position={[0, 0.001, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
          receiveShadow
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial
            map={texture || undefined}
            normalMap={normalMap || undefined}
            normalScale={[normalScale, normalScale]}
            roughnessMap={roughnessMap || undefined}
            color={material.color}
            roughness={material.roughness}
            metalness={material.metalness}
            emissive={materialEmission.color}
            emissiveIntensity={materialEmission.intensity}
            opacity={materialOpacity}
            transparent={materialTransparent || postFog}
            depthWrite={!materialTransparent}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

type RuntimeObjectInstance = {
  key: string;
  position: [number, number, number];
  rotationY: number;
};

type RuntimeInstanceGroup = {
  object: ObjectData;
  instances: RuntimeObjectInstance[];
};

const groupRuntimeInstances = <
  T extends {
    cell: CellData;
    object: ObjectData;
    rotationY: number;
  },
>(
  items: T[],
  getPosition: (item: T) => [number, number, number],
  forceSingles = false,
) => {
  const singles: T[] = [];
  const grouped = new Map<string, RuntimeInstanceGroup>();

  items.forEach((item, index) => {
    if (forceSingles || !item.object.mesh) {
      singles.push(item);
      return;
    }

    const existing =
      grouped.get(item.object.id) ||
      (() => {
        const next = { object: item.object, instances: [] };
        grouped.set(item.object.id, next);
        return next;
      })();

    existing.instances.push({
      key: `cell_${item.object.id}_${item.cell.x}_${item.cell.y || 0}_${item.cell.z}_${index}`,
      position: getPosition(item),
      rotationY: item.rotationY,
    });
  });

  return {
    singles,
    groups: Array.from(grouped.values()),
  };
};

function CellVisualLayers({
  cells,
  objectById,
  wallRotationByCell,
  playerPos,
  enableOcclusion,
  occlusionAzimuth,
  getCellFogState,
  getStructureIllumination,
}: {
  cells: CellData[];
  objectById: Map<string, ObjectData>;
  wallRotationByCell: Map<string, number>;
  playerPos?: [number, number];
  enableOcclusion: boolean;
  occlusionAzimuth: number;
  getCellFogState?: (cell: readonly [number, number]) => FogRenderState;
  getStructureIllumination?: (cell: readonly [number, number]) => number;
}) {
  const sampledPlayerPos = useMemo<[number, number] | undefined>(() => {
    if (!enableOcclusion || !playerPos) return undefined;
    return [playerPos[0], playerPos[1]];
  }, [enableOcclusion, playerPos?.[0], playerPos?.[1]]);

  const occludedCellKeys = useMemo(
    () =>
      enableOcclusion
        ? getOccludedCellKeys(
            cells,
            objectById,
            sampledPlayerPos,
            occlusionAzimuth,
          )
        : new Set<string>(),
    [
      enableOcclusion,
      cells,
      objectById,
      occlusionAzimuth,
      sampledPlayerPos?.[0],
      sampledPlayerPos?.[1],
    ],
  );

  const cameraFadedCellKeys = useMemo(() => {
    if (occludedCellKeys.size === 0) return occludedCellKeys;
    const faded = new Set<string>();
    cells.forEach((cell) => {
      const key = getCellCoordKey(cell.x, cell.z);
      if (!occludedCellKeys.has(key)) return;
      // An explored-memory wall must remain below the secrecy mask. Raising a
      // camera-faded copy above fog would reveal geometry the viewer cannot
      // currently see.
      if (!getCellFogState) {
        faded.add(key);
        return;
      }
      const policy = resolveStructureFogCompositePolicy(
        getCellFogState([cell.x, cell.z]),
        true,
      );
      if (policy.cameraFaded) {
        faded.add(key);
      }
    });
    return faded;
  }, [cells, occludedCellKeys, getCellFogState]);

  const {
    groups,
    occludableGroups,
    modelCells,
    occludableModelCells,
    occludableFastCells,
  } = useMemo(() => {
    const groupedCells = new Map<CellVisualGroup["key"], CellVisualGroup>();
    const groupedOccludableCells = new Map<
      CellVisualGroup["key"],
      CellVisualGroup
    >();
    const renderedModelCells: Array<{
      cell: CellData;
      object: ObjectData;
      rotationY: number;
    }> = [];
    const renderedOccludableModelCells: Array<{
      cell: CellData;
      object: ObjectData;
      rotationY: number;
    }> = [];
    const renderedOccludableFastCells: Array<{
      cell: CellData;
      object: ObjectData | null | undefined;
      rotationY: number;
    }> = [];

    const addGroupedCell = (
      target: Map<CellVisualGroup["key"], CellVisualGroup>,
      cell: CellData,
      object: ObjectData | null | undefined,
      prefix: string,
      structure = false,
    ) => {
      const height = Math.max(0, (cell.visual_height || 0) * 0.5);
      const kind = height > 0 ? "box" : "plane";
      const materialKey = object?.id || (cell.walkable ? "walkable" : "blocked");
      const postFog = Boolean(
        structure &&
          getCellFogState &&
          resolveStructureFogCompositePolicy(
            getCellFogState([cell.x, cell.z]),
            false,
          ).postFog,
      );
      const rawIllumination = structure
        ? getStructureIllumination?.([cell.x, cell.z]) || 0
        : 0;
      // Keep fast tiles instanced while allowing a small number of visibly
      // distinct authoritative-light bands.
      const illumination = Math.round(
        Math.max(0, Math.min(1, rawIllumination)) * 12,
      ) / 12;
      const key = `${prefix}_${kind}_${height.toFixed(3)}_${materialKey}_${postFog ? "postfog" : "world"}_light${illumination.toFixed(3)}`;
      const existing = target.get(key);

      if (existing) {
        existing.cells.push(cell);
        return;
      }

      target.set(key, {
        key,
        cells: [cell],
        kind,
        height: Math.max(0.05, height),
        material: getCellMaterialProps(object, cell.walkable),
        postFog,
        illumination,
      });
    };

    cells.forEach((cell) => {
      const object = cell.object_id ? objectById.get(cell.object_id) : null;
      const fastTile = isFastTileObject(object);
      const rotationY =
        isWallObject(object)
          ? wallRotationByCell.get(getCellCoordKey(cell.x, cell.z)) || 0
          : 0;
      // Structure routing is independent from camera fading. Performance mode
      // may disable occlusion, but visible walls still need protected fog
      // compositing and authoritative surface lighting.
      const canOcclude = shouldRenderCellWithOcclusion(cell, object);

      if (canOcclude && fastTile) {
        renderedOccludableFastCells.push({ cell, object, rotationY });
        addGroupedCell(
          groupedOccludableCells,
          cell,
          object,
          "occludable",
          true,
        );
        return;
      }

      if (canOcclude && !fastTile && object) {
        renderedOccludableModelCells.push({ cell, object, rotationY });
        return;
      }

      if (!fastTile && object) {
        renderedModelCells.push({ cell, object, rotationY });
        return;
      }

      addGroupedCell(groupedCells, cell, object, "static");
    });

    return {
      groups: Array.from(groupedCells.values()),
      occludableGroups: Array.from(groupedOccludableCells.values()),
      modelCells: renderedModelCells,
      occludableModelCells: renderedOccludableModelCells,
      occludableFastCells: renderedOccludableFastCells,
    };
  }, [
    cells,
    objectById,
    wallRotationByCell,
    getCellFogState,
    getStructureIllumination,
  ]);

  const staticModelInstances = useMemo(
    () =>
      groupRuntimeInstances(modelCells, ({ cell }) => [
        cell.x,
        cell.y || 0,
        cell.z,
      ]),
    [modelCells],
  );

  const occludableModelInstances = useMemo(() => {
    const visible: typeof occludableModelCells = [];
    const faded: typeof occludableModelCells = [];

    occludableModelCells.forEach((item) => {
      if (cameraFadedCellKeys.has(getCellCoordKey(item.cell.x, item.cell.z))) {
        faded.push(item);
      } else {
        visible.push(item);
      }
    });

    return {
      visible: groupRuntimeInstances(visible, ({ cell }) => [
        cell.x,
        cell.y || 0,
        cell.z,
      ], Boolean(getCellFogState || getStructureIllumination)),
      faded,
    };
  }, [
    occludableModelCells,
    cameraFadedCellKeys,
    getCellFogState,
    getStructureIllumination,
  ]);

  return (
    <>
      {groups.map((group) => (
        <InstancedCellGroup key={group.key} group={group} />
      ))}
      {occludableGroups.map((group) => (
        <InstancedCellGroup
          key={group.key}
          group={group}
          hiddenCellKeys={cameraFadedCellKeys}
        />
      ))}
      {staticModelInstances.groups.map((group) => (
        <RuntimeObjectInstances
          key={`cell_instances_${group.object.id}`}
          object={group.object}
          instances={group.instances}
        />
      ))}
      {staticModelInstances.singles.map(({ cell, object, rotationY }, index) => (
        <group
          key={`model_cell_${cell.x}_${cell.y || 0}_${cell.z}_${index}`}
          position={[cell.x, cell.y || 0, cell.z]}
          rotation={[0, rotationY, 0]}
        >
          <ObjectRuntimeModelRenderer object={object} />
        </group>
      ))}
      {occludableModelInstances.visible.groups.map((group) => (
        <RuntimeObjectInstances
          key={`occ_cell_instances_${group.object.id}`}
          object={group.object}
          instances={group.instances}
        />
      ))}
      {occludableModelInstances.visible.singles.map(
        ({ cell, object, rotationY }, index) => (
          <OccludingCellRenderer
            key={`occ_model_visible_cell_${cell.x}_${cell.y || 0}_${cell.z}_${index}`}
            cell={cell}
            object={object}
            rotationY={rotationY}
            opacity={1}
            postFog={Boolean(
              getCellFogState &&
                resolveStructureFogCompositePolicy(
                  getCellFogState([cell.x, cell.z]),
                  false,
                ).postFog,
            )}
            illumination={
              getStructureIllumination?.([cell.x, cell.z]) || 0
            }
          />
        ),
      )}
      {occludableModelInstances.faded.map(({ cell, object, rotationY }, index) => (
        <OccludingCellRenderer
          key={`occ_model_faded_cell_${cell.x}_${cell.y || 0}_${cell.z}_${index}`}
          cell={cell}
          object={object}
          rotationY={rotationY}
          opacity={OCCLUSION_FADE_OPACITY}
          postFog
          illumination={
            getStructureIllumination?.([cell.x, cell.z]) || 0
          }
        />
      ))}
      {occludableFastCells.map(({ cell, object, rotationY }, index) =>
        cameraFadedCellKeys.has(getCellCoordKey(cell.x, cell.z)) ? (
        <OccludingCellRenderer
          key={`occ_fast_cell_${cell.x}_${cell.y || 0}_${cell.z}_${index}`}
          cell={cell}
          object={object}
          rotationY={rotationY}
          opacity={OCCLUSION_FADE_OPACITY}
          postFog
          illumination={
            getStructureIllumination?.([cell.x, cell.z]) || 0
          }
        />
        ) : null,
      )}
    </>
  );
}

function CellGridLines({
  cells,
  material,
}: {
  cells: CellData[];
  material: THREE.LineBasicMaterial;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];

    cells.forEach((cell) => {
      const y = (cell.y || 0) + 0.004;
      const x0 = cell.x - 0.5;
      const x1 = cell.x + 0.5;
      const z0 = cell.z - 0.5;
      const z1 = cell.z + 0.5;

      positions.push(
        x0,
        y,
        z0,
        x1,
        y,
        z0,
        x1,
        y,
        z0,
        x1,
        y,
        z1,
        x1,
        y,
        z1,
        x0,
        y,
        z1,
        x0,
        y,
        z1,
        x0,
        y,
        z0,
      );
    });

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return nextGeometry;
  }, [cells]);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <primitive object={material} attach="material" />
    </lineSegments>
  );
}

function CellHighlights({
  targetPattern,
  rangeCells,
  hoveredCell,
  highestCellByCoord,
  material,
  rangeMaterial,
}: {
  targetPattern?: { x: number; z: number }[];
  rangeCells?: { x: number; z: number }[];
  hoveredCell?: [number, number] | null;
  highestCellByCoord: Map<string, CellData>;
  material: THREE.MeshBasicMaterial;
  rangeMaterial?: THREE.MeshBasicMaterial;
}) {
  const highlightedCells = useMemo(() => {
    const byCoord = new Map<string, CellData>();

    (targetPattern || []).forEach((cell) => {
      const match = highestCellByCoord.get(getCellCoordKey(cell.x, cell.z));
      if (match) byCoord.set(getCellCoordKey(cell.x, cell.z), match);
    });

    if (hoveredCell) {
      const match = highestCellByCoord.get(
        getCellCoordKey(hoveredCell[0], hoveredCell[1]),
      );
      if (match) byCoord.set(getCellCoordKey(hoveredCell[0], hoveredCell[1]), match);
    }

    return Array.from(byCoord.values());
  }, [targetPattern, hoveredCell, highestCellByCoord]);

  // Faint range field, excluding cells already in the bright pattern.
  const rangeFieldCells = useMemo(() => {
    if (!rangeCells?.length) return [] as CellData[];
    const patternKeys = new Set(
      highlightedCells.map((cell) => getCellCoordKey(cell.x, cell.z)),
    );
    const byCoord = new Map<string, CellData>();
    rangeCells.forEach((cell) => {
      const key = getCellCoordKey(cell.x, cell.z);
      if (patternKeys.has(key)) return;
      const match = highestCellByCoord.get(key);
      if (match) byCoord.set(key, match);
    });
    return Array.from(byCoord.values());
  }, [rangeCells, highlightedCells, highestCellByCoord]);

  return (
    <>
      {rangeMaterial &&
        rangeFieldCells.map((cell) => (
          <mesh
            key={`range_${cell.x}_${cell.y || 0}_${cell.z}`}
            position={[cell.x, getCellTopY(cell) + 0.012, cell.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[0.92, 0.92]} />
            <primitive object={rangeMaterial} attach="material" />
          </mesh>
        ))}
      {highlightedCells.map((cell) => (
        <mesh
          key={`highlight_${cell.x}_${cell.y || 0}_${cell.z}`}
          position={[cell.x, getCellTopY(cell) + 0.015, cell.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[1, 1]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </>
  );
}

function InstancedRuntimeGeometryGroup({
  object,
  geometryGroup,
  instances,
}: {
  object: ObjectData;
  geometryGroup: ReturnType<typeof createRuntimeMeshGeometryGroups>[number];
  instances: RuntimeObjectInstance[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = resolveObjectMaterial(object, geometryGroup.materialRef);
  const texture = getObjectMaterialTexture(material);
  const normalMap = getObjectMaterialNormalMap(material);
  const roughnessMap = getObjectMaterialRoughnessMap(material);
  const normalScale = getObjectMaterialNormalScale(material);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    const dummy = new THREE.Object3D();
    instances.forEach((instance, index) => {
      dummy.position.set(
        instance.position[0],
        instance.position[1],
        instance.position[2],
      );
      dummy.rotation.set(0, instance.rotationY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });

    meshRef.current.count = instances.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [instances]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined as any, undefined as any, instances.length]}
      frustumCulled={false}
      raycast={() => null}
      castShadow
      receiveShadow
    >
      <primitive object={geometryGroup.geometry} attach="geometry" />
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
    </instancedMesh>
  );
}

function RuntimeObjectInstances({
  object,
  instances,
}: {
  object: ObjectData;
  instances: RuntimeObjectInstance[];
}) {
  const geometryGroups = useMemo(
    () =>
      object.mesh ? createRuntimeMeshGeometryGroups(object.mesh) : [],
    [object],
  );

  useEffect(
    () => () => {
      geometryGroups.forEach((group) => group.geometry.dispose());
    },
    [geometryGroups],
  );

  if (!object.mesh || instances.length === 0) return null;

  return (
    <>
      {geometryGroups.map((geometryGroup) => (
        <InstancedRuntimeGeometryGroup
          key={geometryGroup.key}
          object={object}
          geometryGroup={geometryGroup}
          instances={instances}
        />
      ))}
    </>
  );
}

function getPlacementRenderInfo(
  placement: ObjectPlacementData,
  index: number,
  objectById: Map<string, ObjectData>,
  highestCellByCoord: Map<string, CellData>,
  extentsByObjectId: Map<
    string,
    ReturnType<typeof getObjectVerticalExtents>
  >,
  mapDelta?: MapDelta,
) {
  const object = objectById.get(placement.object_id);
  if (!object) return null;

  const cell = getStandingCellAtWorldPoint(
    highestCellByCoord,
    placement.cell[0],
    placement.cell[1],
  );
  let baseHeight = cell ? cell.y || 0 : 0;
  let surfaceOffset = 0;

  if (cell && (cell.visual_height || 0) > 0) {
    baseHeight += (cell.visual_height || 0) * 0.5;
  } else if (cell?.object_id) {
    const tileDef = objectById.get(cell.object_id);
    if (tileDef) {
      const tileExtents =
        extentsByObjectId.get(tileDef.id) || getObjectVerticalExtents(tileDef);
      extentsByObjectId.set(tileDef.id, tileExtents);
      surfaceOffset = getTileSurfaceOffset(tileDef, tileExtents);
    }
  }

  const objectExtents =
    extentsByObjectId.get(object.id) || getObjectVerticalExtents(object);
  extentsByObjectId.set(object.id, objectExtents);

  const facing = placement.facing || [0, 1];
  const rotY = Math.atan2(facing[0], facing[1]);
  const openRotation = isDoorPlacementOpen(mapDelta, placement) ? Math.PI / 2 : 0;
  const minY = objectExtents.minY;
  const yOffset = baseHeight + surfaceOffset - minY + 0.01;

  return {
    key: `cobj_${placement.object_id}_${index}`,
    object,
    placement,
    position: [placement.cell[0], yOffset, placement.cell[1]] as [
      number,
      number,
      number,
    ],
    rotationY: rotY + openRotation,
    maxY: objectExtents.maxY,
  };
}

type PlacementLightConfig = {
  color: string;
  intensity: number;
  distance: number;
  height: number;
};

type PlacementLight = PlacementLightConfig & {
  key: string;
  position: [number, number, number];
  castsShadow: boolean;
};

const MAX_PLACEMENT_LIGHTS = 28;
const MAX_SHADOW_CASTING_PLACEMENT_LIGHTS = 4;
let lightPoolTextureCache: THREE.CanvasTexture | null = null;
let lightGlareTextureCache: THREE.CanvasTexture | null = null;
let lightStreakTextureCache: THREE.CanvasTexture | null = null;

const getLightPoolTexture = () => {
  if (lightPoolTextureCache) return lightPoolTextureCache;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 124);
    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.16, "rgba(255,250,232,0.74)");
    gradient.addColorStop(0.46, "rgba(255,220,170,0.42)");
    gradient.addColorStop(0.78, "rgba(255,238,210,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < 9; index += 1) {
      const radius = 28 + index * 11;
      ctx.strokeStyle = `rgba(255,255,255,${0.055 - index * 0.004})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(128, 128, radius * 1.55, radius * 0.64, -0.18, 0, Math.PI * 2);
      ctx.stroke();
    }

    const streak = ctx.createLinearGradient(0, 128, 256, 128);
    streak.addColorStop(0, "rgba(255,255,255,0)");
    streak.addColorStop(0.44, "rgba(255,255,255,0.16)");
    streak.addColorStop(0.5, "rgba(255,255,255,0.26)");
    streak.addColorStop(0.56, "rgba(255,255,255,0.16)");
    streak.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = streak;
    ctx.fillRect(0, 118, canvas.width, 20);
  }

  lightPoolTextureCache = new THREE.CanvasTexture(canvas);
  lightPoolTextureCache.colorSpace = THREE.SRGBColorSpace;
  lightPoolTextureCache.magFilter = THREE.LinearFilter;
  lightPoolTextureCache.minFilter = THREE.LinearMipmapLinearFilter;
  lightPoolTextureCache.generateMipmaps = true;
  return lightPoolTextureCache;
};

const getLightGlareTexture = () => {
  if (lightGlareTextureCache) return lightGlareTextureCache;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const radial = ctx.createRadialGradient(64, 64, 0, 64, 64, 52);
    radial.addColorStop(0, "rgba(255,255,255,1)");
    radial.addColorStop(0.07, "rgba(255,255,255,0.98)");
    radial.addColorStop(0.18, "rgba(255,255,255,0.32)");
    radial.addColorStop(0.42, "rgba(255,255,255,0.08)");
    radial.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  lightGlareTextureCache = new THREE.CanvasTexture(canvas);
  lightGlareTextureCache.colorSpace = THREE.SRGBColorSpace;
  lightGlareTextureCache.magFilter = THREE.LinearFilter;
  lightGlareTextureCache.minFilter = THREE.LinearMipmapLinearFilter;
  lightGlareTextureCache.generateMipmaps = true;
  return lightGlareTextureCache;
};

const getLightStreakTexture = () => {
  if (lightStreakTextureCache) return lightStreakTextureCache;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.globalCompositeOperation = "lighter";
    for (let y = -12; y <= 12; y++) {
      const falloff = Math.exp(-(y * y) / 42);
      const alpha = 0.34 * falloff;
      const gradient = ctx.createLinearGradient(0, 32 + y, 256, 32 + y);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.28, `rgba(255,255,255,${alpha * 0.18})`);
      gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.72, `rgba(255,255,255,${alpha * 0.18})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 32 + y, canvas.width, 1);
    }

    const core = ctx.createRadialGradient(128, 32, 0, 128, 32, 28);
    core.addColorStop(0, "rgba(255,255,255,0.42)");
    core.addColorStop(0.45, "rgba(255,255,255,0.12)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  lightStreakTextureCache = new THREE.CanvasTexture(canvas);
  lightStreakTextureCache.colorSpace = THREE.SRGBColorSpace;
  lightStreakTextureCache.magFilter = THREE.LinearFilter;
  lightStreakTextureCache.minFilter = THREE.LinearMipmapLinearFilter;
  lightStreakTextureCache.generateMipmaps = true;
  return lightStreakTextureCache;
};

const getPlacementLightConfig = (
  object: ObjectData,
): PlacementLightConfig | null => {
  const tags = new Set(object.tags || []);
  const profile = object.light_source;
  const legacyLight =
    tags.has("light_source") ||
    tags.has("light") ||
    /lamp|lantern|torch|brazier|candle/.test(`${object.id} ${object.display_name}`.toLowerCase());
  if (!profile && !legacyLight) return null;

  let color = profile?.color || "#FFB05D";
  if (tags.has("light_cyan")) color = "#69E6FF";
  else if (tags.has("light_violet")) color = "#9A6CFF";

  const config: PlacementLightConfig = {
    color,
    intensity: profile ? Math.max(0, profile.intensity) * 4 : 2.15,
    distance: profile ? Math.max(0.5, profile.radius) : 6,
    height: 1.2,
  };

  // Explicit profiles own their literal radius. Legacy size tags only fill in
  // data for older objects that have no authored light contract.
  if (!profile && tags.has("light_small")) {
    config.intensity = 1.85;
    config.distance = 6;
    config.height = 0.9;
  }
  if (!profile && tags.has("light_medium")) {
    config.intensity = 3;
    config.distance = 10;
    config.height = 1.65;
  }
  if (!profile && tags.has("light_large")) {
    config.intensity = 4.6;
    config.distance = 14;
    config.height = 1.55;
  }

  return config;
};

function LightGlareCore({ light }: { light: PlacementLight }) {
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const streakMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => getLightGlareTexture(), []);
  const streakTexture = useMemo(() => getLightStreakTexture(), []);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const sourceColor = useMemo(() => new THREE.Color(light.color), [light.color]);
  const seed = useMemo(
    () =>
      light.key.split("").reduce((value, char) => value + char.charCodeAt(0), 0),
    [light.key],
  );
  const size = Math.min(0.24, Math.max(0.11, light.distance * 0.014));
  const baseOpacity = light.castsShadow ? 1 : 0.86;
  const streakWidth = Math.min(3.8, size * 14);
  const streakHeight = size * 0.38;
  const streakOpacity = light.castsShadow ? 0.54 : 0.36;

  useEffect(
    () => () => {
      deleteScreenGlareSource(light.key);
    },
    [light.key],
  );

  useFrame(({ camera, clock }) => {
    const coreMaterial = coreMaterialRef.current;
    const streakMaterial = streakMaterialRef.current;
    const t = clock.elapsedTime;
    const flicker =
      0.86 +
      Math.sin(t * 7.1 + seed) * 0.08 +
      Math.sin(t * 13.7 + seed * 0.37) * 0.04;
    const flickerAmount = THREE.MathUtils.clamp(flicker, 0.68, 1.02);
    if (coreMaterial) coreMaterial.opacity = baseOpacity * flickerAmount;
    if (streakMaterial) streakMaterial.opacity = streakOpacity * flickerAmount;

    worldPosition.set(light.position[0], light.position[1], light.position[2]);
    projectedPosition.copy(worldPosition).project(camera);
    const x = projectedPosition.x * 0.5 + 0.5;
    const y = projectedPosition.y * 0.5 + 0.5;
    const onScreen =
      projectedPosition.z >= -1 &&
      projectedPosition.z <= 1 &&
      x > -0.24 &&
      x < 1.24 &&
      y > -0.18 &&
      y < 1.18;
    const cameraDistance = camera.position.distanceTo(worldPosition);
    const distanceFade = THREE.MathUtils.clamp(
      1 - (cameraDistance - light.distance * 0.35) / Math.max(1, light.distance * 2.8),
      0,
      1,
    );
    const sourceStrength =
      (light.intensity * 0.34 + (light.castsShadow ? 0.2 : 0.08)) *
      flickerAmount *
      distanceFade *
      (onScreen ? 1 : 0);

    setScreenGlareSource({
      key: light.key,
      x,
      y,
      color: [sourceColor.r, sourceColor.g, sourceColor.b],
      strength: THREE.MathUtils.clamp(sourceStrength, 0, 1.75),
      radius: 0.008 + Math.min(0.026, light.distance * 0.00135),
    });
  });

  return (
    <Billboard
      position={[light.position[0], light.position[1] + 0.05, light.position[2]]}
      raycast={() => null}
    >
      <mesh scale={[streakWidth, streakHeight, 1]} renderOrder={30} raycast={() => null}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={streakMaterialRef}
          map={streakTexture}
          color={light.color}
          transparent
          opacity={streakOpacity}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={[size, size, 1]} renderOrder={31} raycast={() => null}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={coreMaterialRef}
          map={texture}
          color={light.color}
          transparent
          opacity={baseOpacity}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}

function PlayerCarriedLight() {
  const pointLightRef = useRef<THREE.PointLight>(null);
  const poolMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const poolTexture = useMemo(() => getLightPoolTexture(), []);

  useEffect(() => {
    deleteScreenGlareSource("player_carried_light");
    return () => deleteScreenGlareSource("player_carried_light");
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker =
      0.9 +
      Math.sin(t * 5.7) * 0.055 +
      Math.sin(t * 11.3 + 1.7) * 0.03;
    const light = pointLightRef.current;
    if (light) {
      light.intensity = 2.45 * flicker;
    }
    if (poolMaterialRef.current) {
      poolMaterialRef.current.opacity = 0.13 * flicker;
    }
  });

  return (
    <>
      <pointLight
        ref={pointLightRef}
        position={[0, 1.45, 0.16]}
        color="#FFD28A"
        intensity={2.45}
        distance={10.5}
        decay={2}
      />
      <mesh
        position={[0, 0.024, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <circleGeometry args={[5.2, 48]} />
        <meshBasicMaterial
          ref={poolMaterialRef}
          map={poolTexture}
          color="#FFD28A"
          transparent
          opacity={0.13}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

function CustomObjectPlacementLayer({
  placements,
  objectById,
  highestCellByCoord,
  mapDelta,
  renderLights = true,
}: {
  placements: ObjectPlacementData[];
  objectById: Map<string, ObjectData>;
  highestCellByCoord: Map<string, CellData>;
  mapDelta?: MapDelta;
  renderLights?: boolean;
}) {
  const { singles, instanceGroups, lights } = useMemo(() => {
    const objectCounts = placements.reduce((counts, placement) => {
      counts.set(placement.object_id, (counts.get(placement.object_id) || 0) + 1);
      return counts;
    }, new Map<string, number>());
    const extentsByObjectId = new Map<
      string,
      ReturnType<typeof getObjectVerticalExtents>
    >();
    const nextSingles: ReturnType<typeof getPlacementRenderInfo>[] = [];
    const nextLights: PlacementLight[] = [];
    let shadowCastingLightCount = 0;
    const groupedInstances = new Map<
      string,
      { object: ObjectData; instances: RuntimeObjectInstance[] }
    >();

    placements.forEach((placement, index) => {
      const info = getPlacementRenderInfo(
        placement,
        index,
        objectById,
        highestCellByCoord,
        extentsByObjectId,
        mapDelta,
      );
      if (!info) return;

      const lightConfig = getPlacementLightConfig(info.object);
      if (lightConfig && nextLights.length < MAX_PLACEMENT_LIGHTS) {
        const castsShadow =
          lightConfig.distance >= 9 &&
          shadowCastingLightCount < MAX_SHADOW_CASTING_PLACEMENT_LIGHTS;
        if (castsShadow) shadowCastingLightCount += 1;
        nextLights.push({
          key: `${info.key}_light`,
          position: [
            info.position[0],
            info.position[1] + lightConfig.height,
            info.position[2],
          ],
          castsShadow,
          ...lightConfig,
        });
      }

      const repeated = (objectCounts.get(placement.object_id) || 0) > 2;
      const canInstance =
        repeated &&
        Boolean(info.object.mesh) &&
        !placement.dialogue_id &&
        !info.object.tags?.includes("interactable");

      if (!canInstance) {
        nextSingles.push(info);
        return;
      }

      const existing =
        groupedInstances.get(info.object.id) ||
        (() => {
          const next = { object: info.object, instances: [] };
          groupedInstances.set(info.object.id, next);
          return next;
        })();
      existing.instances.push({
        key: info.key,
        position: info.position,
        rotationY: info.rotationY,
      });
    });

    return {
      singles: nextSingles.filter(Boolean) as NonNullable<
        ReturnType<typeof getPlacementRenderInfo>
      >[],
      instanceGroups: Array.from(groupedInstances.values()),
      lights: nextLights,
    };
  }, [placements, objectById, highestCellByCoord, mapDelta]);

  return (
    <>
      {renderLights && lights.map((light) => (
        <React.Fragment key={light.key}>
          <pointLight
            position={light.position}
            color={light.color}
            intensity={light.intensity}
            distance={light.distance}
            decay={1}
            castShadow={light.castsShadow}
            shadow-bias={-0.001}
            shadow-mapSize-width={128}
            shadow-mapSize-height={128}
          />
          <LightGlareCore light={light} />
          <mesh
            position={[
              light.position[0],
              Math.max(0.018, light.position[1] - light.height + 0.018),
              light.position[2],
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <circleGeometry args={[light.distance, 48]} />
            <meshBasicMaterial
              map={getLightPoolTexture()}
              color={light.color}
              transparent
              opacity={light.castsShadow ? 0.4 : 0.32}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </React.Fragment>
      ))}
      {instanceGroups.map((group) => (
        <RuntimeObjectInstances
          key={`instances_${group.object.id}`}
          object={group.object}
          instances={group.instances}
        />
      ))}
      {singles.map((info) => (
        <group
          key={info.key}
          position={info.position}
          rotation={[0, info.rotationY, 0]}
        >
          <ObjectRuntimeModelRenderer
            object={info.object}
            includeDecals={Boolean(info.placement.dialogue_id)}
          />

          {info.placement.dialogue_id && (
            <mesh position={[0, info.maxY + 0.3, 0]}>
              <sphereGeometry args={[0.15, 8, 8]} />
              <meshBasicMaterial color="#EBCB8B" />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

const ReferenceGameRenderer = memo(function ReferenceGameRenderer({
  map,
  playerPos,
  playerFacing = [0, -1],
  playerSpriteId,
  worldItems,
  extraPlacements,
  onCellClick,
  onCellHover,
  onPointerOut,
  targetPattern,
  rangeCells,
  hoveredCell,
  editLayerY,
  entityStates,
  partyFollowers = [],
  partyMemberIds = [],
  mapDelta,
  inCombat = false,
  activeTurnKey = null,
  showGrid,
  enableOcclusion = false,
  occlusionAzimuth = Math.PI / 4,
  renderCenter,
  renderRadius = DEFAULT_RENDER_RADIUS,
  fxCellTransform,
  rawPointerCoordinates = false,
  isCellVisible,
  getCellFogState,
  getCellIllumination,
  getStructureIllumination,
  suppressPlacementLights = false,
}: ReferenceGameRendererProps) {
  const { gamePackage } = useEngineStore();
  useWebGLContextRecovery();

  const snappedRenderCenter = useMemo<[number, number] | null>(() => {
    if (!renderCenter) return null;
    return [
      Math.round(renderCenter[0] / RENDER_CHUNK_SIZE) * RENDER_CHUNK_SIZE,
      Math.round(renderCenter[1] / RENDER_CHUNK_SIZE) * RENDER_CHUNK_SIZE,
    ];
  }, [renderCenter?.[0], renderCenter?.[1]]);
  const [chunkedRenderCenter, setChunkedRenderCenter] =
    useState<[number, number] | null>(snappedRenderCenter);

  useEffect(() => {
    if (!renderCenter || !snappedRenderCenter) {
      setChunkedRenderCenter(null);
      return;
    }

    setChunkedRenderCenter((previous) => {
      if (!previous) return snappedRenderCenter;

      const dx = renderCenter[0] - previous[0];
      const dz = renderCenter[1] - previous[1];
      const shouldShift =
        dx * dx + dz * dz >=
        RENDER_WINDOW_SHIFT_DISTANCE * RENDER_WINDOW_SHIFT_DISTANCE;

      if (!shouldShift) return previous;
      if (
        previous[0] === snappedRenderCenter[0] &&
        previous[1] === snappedRenderCenter[1]
      ) {
        return previous;
      }
      return snappedRenderCenter;
    });
  }, [
    renderCenter?.[0],
    renderCenter?.[1],
    snappedRenderCenter?.[0],
    snappedRenderCenter?.[1],
  ]);

  const isInRenderWindow = (
    x: number,
    z: number,
    padding = 0,
  ) => {
    if (!chunkedRenderCenter) return true;
    const radius = renderRadius + padding;
    const dx = x - chunkedRenderCenter[0];
    const dz = z - chunkedRenderCenter[1];
    return dx * dx + dz * dz <= radius * radius;
  };

  const renderCells = useMemo(
    () =>
      map.cells.filter(
        (cell) =>
          (!chunkedRenderCenter || isInRenderWindow(cell.x, cell.z, 2)) &&
          (!getCellFogState ||
            getCellFogState([cell.x, cell.z]) !== "unseen"),
      ),
    [
      map.cells,
      chunkedRenderCenter?.[0],
      chunkedRenderCenter?.[1],
      renderRadius,
      getCellFogState,
    ],
  );

  const objectById = useMemo(
    () =>
      new Map(
        gamePackage.object_library.map((object) => [
          object.id,
          object as ObjectData,
        ]),
      ),
    [gamePackage.object_library],
  );

  const wallRotationByCell = useMemo(
    () => buildWallRotationByCell(map, objectById),
    [map, objectById],
  );

  const highestCellByCoord = useMemo(() => {
    const lookup = new Map<string, CellData>();

    map.cells.forEach((cell) => {
      if (!cell.walkable) return;

      const key = getCellCoordKey(cell.x, cell.z);
      const previous = lookup.get(key);
      if (!previous || getCellTopY(cell) > getCellTopY(previous)) {
        lookup.set(key, cell);
      }
    });

    return lookup;
  }, [map.cells]);

  // Ground surface for object placements: unlike entities, placed objects
  // often sit on cells their own collision marked unwalkable (columns on a
  // temple platform), so this lookup keeps blocked cells and only excludes
  // overhead geometry (roofs) and wall cells.
  const placementSurfaceByCoord = useMemo(() => {
    const lookup = new Map<string, CellData>();

    map.cells.forEach((cell) => {
      if ((cell.y || 0) >= 1.5) return; // overhead (roofs)
      if ((cell.visual_height || 0) * 0.5 > 1.01) return; // walls
      const key = getCellCoordKey(cell.x, cell.z);
      const previous = lookup.get(key);
      if (!previous || getCellTopY(cell) > getCellTopY(previous)) {
        lookup.set(key, cell);
      }
    });

    return lookup;
  }, [map.cells]);

  const allRenderPlacements = useMemo(
    () =>
      extraPlacements?.length
        ? [...(map.custom_object_placements || []), ...extraPlacements]
        : map.custom_object_placements || [],
    [map.custom_object_placements, extraPlacements],
  );
  const renderPlacements = useMemo(
    () =>
      allRenderPlacements.filter((placement) => {
        if (
          chunkedRenderCenter &&
          !isInRenderWindow(placement.cell[0], placement.cell[1], 4)
        ) {
          return false;
        }
        if (!getCellFogState) return true;
        const object = objectById.get(placement.object_id);
        return getMacroPlacementFootprint(placement, object).some(
          (cell) => getCellFogState(cell) !== "unseen",
        );
      }),
    [
      allRenderPlacements,
      objectById,
      chunkedRenderCenter?.[0],
      chunkedRenderCenter?.[1],
      renderRadius,
      getCellFogState,
    ],
  );
  const renderWorldItems = useMemo(
    () =>
      chunkedRenderCenter
        ? (worldItems || []).filter((item) =>
            isInRenderWindow(item.cell[0], item.cell[1], 4),
          )
        : worldItems || [],
    [
      worldItems,
      chunkedRenderCenter?.[0],
      chunkedRenderCenter?.[1],
      renderRadius,
    ],
  );

  const staticElements = useMemo(() => {
    return (
      <group>
        <CustomObjectPlacementLayer
          placements={renderPlacements}
          objectById={objectById}
          highestCellByCoord={placementSurfaceByCoord}
          mapDelta={mapDelta}
          renderLights={!suppressPlacementLights}
        />

        {editLayerY !== undefined && map.triggers?.map((trigger, i) => {
          if (!trigger.cell) return null;
          if (
            getCellFogState &&
            getCellFogState([
              Number(trigger.cell[0] || 0),
              Number(trigger.cell[1] || 0),
            ]) === "unseen"
          ) {
            return null;
          }
          const cell =
            highestCellByCoord.get(
              getCellCoordKey(trigger.cell[0], trigger.cell[1]),
            ) || null;
          const yOffset = getStandingSurfaceY(cell, objectById);

          return (
            <mesh
              key={`trigger_${i}`}
              position={[trigger.cell[0], yOffset, trigger.cell[1]]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.6, 0.6]} />
              <meshStandardMaterial
                color={trigger.type === "step" ? "#EBCB8B" : "#B48EAD"}
                opacity={0.5}
                transparent
              />
            </mesh>
          );
        })}
      </group>
    );
  }, [editLayerY, renderPlacements, map.triggers, objectById, highestCellByCoord, placementSurfaceByCoord, mapDelta, suppressPlacementLights, getCellFogState]);

  const {
    texture: playerSpriteTex,
    spriteDef: playerSpriteDef,
    sourceWidth: playerSpriteWidth,
    sourceHeight: playerSpriteHeight,
    ready: playerSpriteReady,
  } = useSpriteTexture(
    playerSpriteId || gamePackage.settings?.player_sprite_id,
    gamePackage,
  );

  // Memoize materials so we don't recreate them every frame
  const materials = useMemo(
    () => ({
      walkable: new THREE.MeshStandardMaterial({
        color: "#1a1830",
        emissive: "#080315",
        emissiveIntensity: 0.18,
        roughness: 0.8,
      }),
      blocked: new THREE.MeshStandardMaterial({
        color: "#241832",
        emissive: "#0b0317",
        emissiveIntensity: 0.16,
        roughness: 0.9,
      }),
      gridLine: new THREE.LineBasicMaterial({
        color: "#24243a",
        opacity: 0.25,
        transparent: true,
      }),
      targetHighlight: new THREE.MeshBasicMaterial({
        color: "#D08770",
        opacity: 0.6,
        transparent: true,
      }),
      rangeHighlight: new THREE.MeshBasicMaterial({
        color: "#88C0D0",
        opacity: 0.16,
        transparent: true,
        depthWrite: false,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  return (
    <group onPointerOut={onPointerOut}>
      <AnimatedSpriteTextureDriver />
      {/* Rainbow-dusk sky backdrop, wrapping the whole scene. */}
      <SkyDome />
      {/* Invisible interaction plane for editor and targeting */}
      {(editLayerY !== undefined || onCellClick || onCellHover) && (
        <mesh
          position={[0, editLayerY ?? 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            if (onCellClick) {
              e.stopPropagation();
              const x = rawPointerCoordinates ? e.point.x : Math.round(e.point.x);
              const z = rawPointerCoordinates ? e.point.z : Math.round(e.point.z);
              onCellClick(x, z);
            }
          }}
          onPointerMove={(e) => {
            if (onCellHover) {
              e.stopPropagation();
              const x = rawPointerCoordinates ? e.point.x : Math.round(e.point.x);
              const z = rawPointerCoordinates ? e.point.z : Math.round(e.point.z);
              onCellHover(x, z);
            }
          }}
        >
          <planeGeometry args={[map.width, map.height]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Render Cells */}
      <CellVisualLayers
        cells={renderCells}
        objectById={objectById}
        wallRotationByCell={wallRotationByCell}
        playerPos={playerPos}
        enableOcclusion={enableOcclusion}
        occlusionAzimuth={occlusionAzimuth}
        getCellFogState={getCellFogState}
        getStructureIllumination={getStructureIllumination}
      />
      {(showGrid ?? editLayerY !== undefined) && (
        <CellGridLines cells={renderCells} material={materials.gridLine} />
      )}
      <CellHighlights
        targetPattern={targetPattern}
        rangeCells={rangeCells}
        hoveredCell={hoveredCell}
        highestCellByCoord={highestCellByCoord}
        material={materials.targetHighlight}
        rangeMaterial={materials.rangeHighlight}
      />

      {staticElements}

      {/* Floating combat text (damage numbers, heals, deaths) */}
      <DamagePopupLayer
        highestCellByCoord={highestCellByCoord}
        objectById={objectById}
        transformCell={fxCellTransform}
        isCellVisible={isCellVisible}
      />

      {/* Overheard NPC-to-NPC ambient speech */}
      <BarkLayer
        highestCellByCoord={highestCellByCoord}
        objectById={objectById}
        transformCell={fxCellTransform}
        isCellVisible={isCellVisible}
      />

      {/* Render World Items */}
      {renderWorldItems.map((item) => {
        if (isCellVisible && !isCellVisible(item.cell)) return null;
        const cell = getStandingCellAtWorldPoint(
          highestCellByCoord,
          item.cell[0],
          item.cell[1],
        );
        const yBase = getStandingSurfaceY(cell, objectById, 0);
        return (
          <WorldItemNode
            key={`world_item_${item.id}`}
            cell={item.cell}
            icon={item.icon || "📦"}
            sprite_id={gamePackage.items.find((i) => i.id === (item as any).item_id)?.sprite_id}
            gamePackage={gamePackage}
            yBase={yBase}
          />
        );
      })}

      {/* Render Entities */}
      {map.entity_placements?.map((placement, i) => {
        if (partyMemberIds.includes(placement.entity_id)) return null;

        // Skip dead enemies in play mode and get their current cell
        const key = entityPlacementStateKey(map.id, placement, i);
        const entityState = entityStates?.[key];

        if (entityState?.dead || entityState?.hidden) return null;

        const currentCellCoord = entityState?.cell || placement.cell;
        if (isCellVisible && !isCellVisible(currentCellCoord)) return null;
        if (
          chunkedRenderCenter &&
          !isInRenderWindow(currentCellCoord[0], currentCellCoord[1], 6)
        ) {
          return null;
        }

        const entityDef = gamePackage.entities.find(
          (e) => e.id === placement.entity_id,
        );
        if (!entityDef) return null;

        const cell = getStandingCellAtWorldPoint(
          highestCellByCoord,
          currentCellCoord[0],
          currentCellCoord[1],
        );
        const yOffset = getStandingSurfaceY(cell, objectById);

        const engaged =
          !entityDef.is_npc &&
          !!playerPos &&
          Math.abs(currentCellCoord[0] - playerPos[0]) +
            Math.abs(currentCellCoord[1] - playerPos[1]) <=
            THREAT_RADIUS;

        return (
          <EntityNode
            key={`entity_${placement.entity_id}_${i}`}
            placement={{ ...placement, cell: currentCellCoord }}
            entityDef={entityDef}
            yOffset={yOffset}
            gamePackage={gamePackage}
            hp={entityState?.hp ?? entityDef.max_hp}
            maxHp={entityDef.max_hp}
            fxKey={key}
            actorId={placement.entity_id}
            engaged={engaged}
            isActive={activeTurnKey === key}
            illumination={getCellIllumination?.(currentCellCoord)}
          />
        );
      })}

      {/* Render Party Followers */}
      {partyFollowers.map((follower, i) => {
        if (isCellVisible && !isCellVisible(follower.cell)) return null;
        const entityDef = gamePackage.entities.find(
          (e) => e.id === follower.entity_id,
        );
        if (!entityDef) return null;

        // Downed party members lie out of sight until the fight ends.
        const followerState = entityStates?.[follower.entity_id];
        if (followerState?.dead) return null;

        const cell = getStandingCellAtWorldPoint(
          highestCellByCoord,
          follower.cell[0],
          follower.cell[1],
        );
        return (
          <EntityNode
            key={`party_${follower.entity_id}_${i}`}
            placement={{ entity_id: follower.entity_id, cell: follower.cell }}
            entityDef={entityDef}
            yOffset={getStandingSurfaceY(cell, objectById)}
            gamePackage={gamePackage}
            hp={followerState?.hp ?? entityDef.max_hp}
            maxHp={entityDef.max_hp}
            fxKey={follower.entity_id}
            actorId={follower.entity_id}
            isActive={activeTurnKey === follower.entity_id}
            showHpWhenFull={inCombat}
            illumination={getCellIllumination?.(follower.cell)}
          />
        );
      })}

      {/* Render Player Marker */}
      {playerPos &&
        (() => {
          const playerCell = getStandingCellAtWorldPoint(
            highestCellByCoord,
            playerPos[0],
            playerPos[1],
          );
          const pY = getStandingSurfaceY(playerCell, objectById);
          const playerIllumination = getCellIllumination?.(playerPos) ?? 1;

          const { renderWidth, renderHeight } =
            getCharacterSpriteRenderSize(
              playerSpriteDef,
              playerSpriteWidth,
              playerSpriteHeight,
            );

          return (
            <SmoothPositionGroup
              position={[playerPos[0], pY, playerPos[1]]}
              onPositionUpdate={(position) => {
                playerStateRef.px = position.x;
                playerStateRef.py = position.y;
                playerStateRef.pz = position.z;
                playerStateRef.ready = true;
              }}
            >
              {playerSpriteTex && playerSpriteReady ? (
                <Billboard
                  follow={true}
                  lockX={false}
                  lockY={false}
                  lockZ={false}
                >
                  <mesh
                    position={[0, renderHeight * 0.5, 0]}
                    renderOrder={ACTOR_SPRITE_RENDER_ORDER}
                  >
                    <planeGeometry args={[renderWidth, renderHeight]} />
                    <meshBasicMaterial
                      map={playerSpriteTex}
                      color={actorSpriteTint(playerIllumination)}
                      transparent={true}
                      alphaTest={0.1}
                      depthTest
                      depthWrite={false}
                      fog={false}
                      side={THREE.DoubleSide}
                      toneMapped={false}
                    />
                  </mesh>
                </Billboard>
              ) : (
                <mesh
                  position={[0, 0.4, 0]}
                  renderOrder={ACTOR_SPRITE_RENDER_ORDER}
                  rotation={[
                    0,
                    Math.atan2(playerFacing[0], playerFacing[1]),
                    0,
                  ]}
                >
                  <cylinderGeometry args={[0, 0.3, 0.8, 4]} />
                  <meshBasicMaterial
                    color={actorFallbackTint("#5E81AC", playerIllumination)}
                    transparent
                    opacity={1}
                    depthTest
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
              )}
              {activeTurnKey === "player" ? (
                <mesh
                  position={[0, 0.02, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={PLAYER_RING_RENDER_ORDER}
                >
                  <ringGeometry args={[0.38, 0.52, 24]} />
                  <meshBasicMaterial
                    color="#7DF9FF"
                    transparent
                    opacity={0.95}
                    depthTest
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              ) : (
                <mesh
                  position={[0, 0.01, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={PLAYER_RING_RENDER_ORDER}
                >
                  <ringGeometry args={[0.3, 0.4, 16]} />
                  <meshBasicMaterial
                    color="#88C0D0"
                    transparent
                    opacity={inCombat ? 0.72 : 0.82}
                    depthTest
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              )}
            </SmoothPositionGroup>
          );
        })()}
    </group>
  );
});

const convertPlacementToWorld = (
  placement: ObjectPlacementData,
  gridSpace: RendererGridSpace,
  fineRatio: number,
): ObjectPlacementData => ({
  ...placement,
  cell: logicalCellToWorld(placement.cell, gridSpace, fineRatio),
});

const convertRuntimeMapToWorld = (
  map: MapData,
  mapDelta: MapDelta | undefined,
  gridSpace: RendererGridSpace,
  fineRatio: number,
): { map: MapData; mapDelta: MapDelta | undefined } => {
  if (gridSpace === "macro") return { map, mapDelta };

  const cells = dedupeFineTerrainCellsFor3D(map.cells, fineRatio);
  const convertCell = (cell: readonly unknown[]) =>
    logicalCellToWorld(cell, gridSpace, fineRatio);
  const authoredPlacements = map.custom_object_placements || [];
  const effectivePlacements = applyPlacementDeltas(authoredPlacements, mapDelta);
  const openedDoorKeys = new Set(mapDelta?.opened_doors || []);
  const visualOpenedDoorKeys = authoredPlacements
    .filter((placement) => openedDoorKeys.has(doorPlacementKey(placement)))
    .map((placement) =>
      doorPlacementKey(convertPlacementToWorld(placement, gridSpace, fineRatio)),
    );

  return {
    map: {
      ...map,
      width: Math.ceil(map.width / fineRatio),
      height: Math.ceil(map.height / fineRatio),
      cells,
      spawns: map.spawns.map((spawn) => ({
        ...spawn,
        cell: convertCell(spawn.cell),
      })),
      custom_object_placements: effectivePlacements.map((placement) =>
        convertPlacementToWorld(placement, gridSpace, fineRatio),
      ),
      entity_placements: (map.entity_placements || []).map((placement) => ({
        ...placement,
        cell: convertCell(placement.cell),
        schedule: placement.schedule?.map((entry) => ({
          ...entry,
          cell: convertCell(entry.cell),
        })),
      })),
      item_placements: (map.item_placements || []).map((placement) => ({
        ...placement,
        cell: convertCell(placement.cell),
      })),
      container_placements: (map.container_placements || []).map((placement) => ({
        ...placement,
        cell: convertCell(placement.cell),
      })),
      triggers: (map.triggers || []).map((trigger) =>
        trigger.cell ? { ...trigger, cell: convertCell(trigger.cell) } : trigger,
      ),
      exits: (map.exits || []).map((exit) => ({
        ...exit,
        cell: convertCell(exit.cell),
      })),
    },
    mapDelta: mapDelta
      ? {
          ...mapDelta,
          opened_doors: visualOpenedDoorKeys,
        }
      : undefined,
  };
};

const MAX_AUTHORITATIVE_POINT_LIGHTS = 16;
const MAX_PERFORMANCE_AUTHORITATIVE_POINT_LIGHTS = 4;

function AuthoritativePointLight({
  source,
  gridSpace,
  fineRatio,
}: {
  source: ImmersiveResolvedLightSource;
  gridSpace: RendererGridSpace;
  fineRatio: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const fallback = useMemo(
    () => logicalCellToWorld(source.cell, gridSpace, fineRatio),
    [source.cell[0], source.cell[1], gridSpace, fineRatio],
  );
  const lightMetrics = resolveAuthoritativeLightRenderMetrics(
    source.radius,
    logicalCellWorldSize(gridSpace, fineRatio),
  );
  const height = source.carrier_actor_id ? 1.25 : 0.95;
  const intensity = Math.max(0.05, source.intensity * 4);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !source.carrier_actor_id) return;
    if (source.carrier_actor_id === "player" && playerStateRef.ready) {
      group.position.set(playerStateRef.px, playerStateRef.py, playerStateRef.pz);
      return;
    }
    const actorPosition = actorRenderPositions.get(source.carrier_actor_id);
    if (actorPosition) group.position.copy(actorPosition);
  });

  return (
    <group ref={groupRef} position={[fallback[0], 0, fallback[1]]}>
      <pointLight
        position={[0, height, 0]}
        color={source.color || "#facc15"}
        intensity={intensity}
        distance={lightMetrics.pointDistance}
        decay={lightMetrics.decay}
        castShadow={false}
      />
      <mesh
        position={[0, 0.028, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <circleGeometry args={[lightMetrics.poolRadius, 48]} />
        <meshBasicMaterial
          map={getLightPoolTexture()}
          color={source.color || "#facc15"}
          transparent
          opacity={0.54}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function AuthoritativeLightLayer({
  visibility,
  gridSpace,
  fineRatio,
  renderCenter,
  renderRadius,
  maxLights = MAX_AUTHORITATIVE_POINT_LIGHTS,
}: {
  visibility: ImmersiveViewerVisibilitySnapshot;
  gridSpace: RendererGridSpace;
  fineRatio: number;
  renderCenter?: [number, number];
  renderRadius?: number;
  maxLights?: number;
}) {
  const sources = useMemo(() => {
    const visibleCellKeys = new Set(
      visibility.currently_visible.map((cell) =>
        fogCellKey(cell[0], cell[1]),
      ),
    );
    const renderableSourceIds = new Set<string>();
    visibility.illumination.cells.forEach((cell) => {
      if (!visibleCellKeys.has(fogCellKey(cell.cell[0], cell.cell[1]))) return;
      cell.source_ids.forEach((sourceId) => renderableSourceIds.add(sourceId));
    });
    visibility.illumination.sources.forEach((source) => {
      if (visibleCellKeys.has(fogCellKey(source.cell[0], source.cell[1]))) {
        renderableSourceIds.add(source.id);
      }
    });
    const priority = (source: ImmersiveResolvedLightSource) => {
      if (source.carrier_actor_id) return 0;
      if (source.source_kind === "dropped_item") return 1;
      if (source.source_kind === "environment_field" || source.source_kind === "fire_field") return 2;
      return 3;
    };
    return visibility.illumination.sources
      .filter((source) => {
        if (!renderableSourceIds.has(source.id)) return false;
        if (!renderCenter || renderRadius === undefined) return true;
        const dx = source.cell[0] - renderCenter[0];
        const dz = source.cell[1] - renderCenter[1];
        const radius = renderRadius + source.radius;
        return dx * dx + dz * dz <= radius * radius;
      })
      .sort((left, right) => {
        const priorityDelta = priority(left) - priority(right);
        if (priorityDelta !== 0) return priorityDelta;
        if (!renderCenter) return left.id.localeCompare(right.id);
        const leftDistance = Math.hypot(left.cell[0] - renderCenter[0], left.cell[1] - renderCenter[1]);
        const rightDistance = Math.hypot(right.cell[0] - renderCenter[0], right.cell[1] - renderCenter[1]);
        return leftDistance - rightDistance || left.id.localeCompare(right.id);
      })
      .slice(0, maxLights);
  }, [visibility, renderCenter?.[0], renderCenter?.[1], renderRadius, maxLights]);

  return (
    <group>
      {sources.map((source) => (
        <AuthoritativePointLight
          key={source.id}
          source={source}
          gridSpace={gridSpace}
          fineRatio={fineRatio}
        />
      ))}
    </group>
  );
}

export const GameRenderer3D = memo(function GameRenderer3D({
  map,
  gridSpace = "macro",
  fineRatio = 3,
  playerPos,
  playerFacing,
  playerSpriteId,
  worldItems,
  extraPlacements,
  onCellClick,
  onCellHover,
  onPointerOut,
  targetPattern,
  rangeCells,
  hoveredCell,
  editLayerY,
  entityStates,
  actorPhysicalStates,
  partyFollowers,
  partyMemberIds,
  mapDelta,
  inCombat,
  activeTurnKey,
  combatOverwatchZones,
  combatIntents,
  perceptionAlerts,
  showBehaviorIntents,
  worldDeniedCells,
  showGrid,
  enableOcclusion,
  occlusionAzimuth,
  renderCenter,
  renderRadius,
  fogOfWar,
  fogRadius,
  initialExplored,
  onExplore,
  fogResolution,
  authoritativeVisibility,
  showPerceptionDebug,
  performanceMode = false,
}: GameRenderer3DProps) {
  const objectLibrary = useEngineStore((state) => state.gamePackage.object_library);
  // Footsteps and trace layers replace the save's MapDelta on every fine step,
  // but they do not alter terrain, doors, or object placements. Keep a narrow
  // delta for the static world so those expensive render structures only
  // rebuild when a visually placed object actually changes.
  const visualPlacementDelta = useMemo<MapDelta | undefined>(() => {
    if (!mapDelta) return undefined;
    return {
      opened_doors: mapDelta.opened_doors,
      moved_objects: mapDelta.moved_objects,
      removed_objects: mapDelta.removed_objects,
      carried_objects: mapDelta.carried_objects,
    };
  }, [
    mapDelta?.opened_doors,
    mapDelta?.moved_objects,
    mapDelta?.removed_objects,
    mapDelta?.carried_objects,
  ]);
  const fogVisibility = useMemo(() => {
    if (authoritativeVisibility || !fogOfWar || !playerPos) return null;
    return computeFogVisibleCells({
      map,
      playerPos,
      objectById: new Map(objectLibrary.map((object) => [object.id, object])),
      delta: visualPlacementDelta,
      gridSpace,
      fineRatio,
      radius: fogRadius ?? 5,
      resolution: fogResolution ?? "macro",
    });
  }, [
    fogOfWar,
    playerPos?.[0],
    playerPos?.[1],
    map,
    visualPlacementDelta,
    objectLibrary,
    gridSpace,
    fineRatio,
    fogRadius,
    fogResolution,
    authoritativeVisibility,
  ]);
  const visualWorld = useMemo(
    () => convertRuntimeMapToWorld(map, visualPlacementDelta, gridSpace, fineRatio),
    [map, visualPlacementDelta, gridSpace, fineRatio],
  );
  const transformCell = useMemo(
    () => (cell: readonly unknown[]) =>
      logicalCellToWorld(cell, gridSpace, fineRatio),
    [gridSpace, fineRatio],
  );
  const transformPoint = (cell: readonly [number, number] | undefined) =>
    cell ? transformCell(cell) : undefined;
  const visualEntityStates = useMemo(() => {
    if (gridSpace === "macro" || !entityStates) return entityStates;
    return Object.fromEntries(
      Object.entries(entityStates).map(([key, state]) => [
        key,
        state?.cell ? { ...state, cell: transformCell(state.cell) } : state,
      ]),
    );
  }, [entityStates, gridSpace, transformCell]);
  const visualWorldItems = useMemo(
    () =>
      (worldItems || []).map((item) => ({
        ...item,
        cell: transformCell(item.cell),
      })),
    [worldItems, transformCell],
  );
  const visualExtraPlacements = useMemo(
    () =>
      (extraPlacements || []).map((placement) =>
        convertPlacementToWorld(placement, gridSpace, fineRatio),
      ),
    [extraPlacements, gridSpace, fineRatio],
  );
  const visualPartyFollowers = useMemo(
    () =>
      (partyFollowers || []).map((follower) => ({
        ...follower,
        cell: transformCell(follower.cell),
      })),
    [partyFollowers, transformCell],
  );
  const logicalPointer = (handler: ((x: number, z: number) => void) | undefined) =>
    handler
      ? (x: number, z: number) => {
          const logical = worldPointToLogicalCell(x, z, gridSpace, fineRatio);
          handler(logical[0], logical[1]);
        }
      : undefined;
  const visualRadius =
    renderRadius === undefined
      ? undefined
      : renderRadius * logicalCellWorldSize(gridSpace, fineRatio);
  const authoritativeFogSets = useMemo(() => {
    if (!authoritativeVisibility) return null;
    return {
      terrainVisible: new Set(
        authoritativeVisibility.terrain_visible.map((cell) =>
          fogCellKey(cell[0], cell[1]),
        ),
      ),
      actorVisible: new Set(
        authoritativeVisibility.currently_visible.map((cell) =>
          fogCellKey(cell[0], cell[1]),
        ),
      ),
      discovered: new Set(
        authoritativeVisibility.discovered.map((cell) =>
          fogCellKey(cell[0], cell[1]),
        ),
      ),
    };
  }, [authoritativeVisibility]);
  const getVisualCellFogState = useMemo(() => {
    if (!authoritativeFogSets) return undefined;
    return (cell: readonly [number, number]) => {
      const logical = worldPointToLogicalCell(
        cell[0],
        cell[1],
        gridSpace,
        fineRatio,
      );
      if (gridSpace === "macro") {
        return classifyFogRenderState(
          fogCellKey(logical[0], logical[1]),
          Boolean(fogOfWar),
          authoritativeFogSets.terrainVisible,
          authoritativeFogSets.discovered,
        );
      }

      // Runtime terrain and authored props render as macro-sized meshes even
      // though authoritative visibility is fine-grid. Preserve the mesh when
      // any covered fine cell is visible, otherwise retain it as explored
      // memory only when at least one covered fine cell was discovered.
      const coveredFineCells = fineCellsCoveredByWorldMacroCell(
        cell[0],
        cell[1],
        fineRatio,
      );
      return classifyFogRenderStateForCells(
        coveredFineCells,
        Boolean(fogOfWar),
        authoritativeFogSets.terrainVisible,
        authoritativeFogSets.discovered,
      );
    };
  }, [authoritativeFogSets, fogOfWar, gridSpace, fineRatio]);
  const isVisualCellVisible = useMemo(() => {
    if (authoritativeFogSets) {
      return (cell: readonly [number, number]) => {
        const logical = worldPointToLogicalCell(cell[0], cell[1], gridSpace, fineRatio);
        return authoritativeFogSets.actorVisible.has(
          fogCellKey(logical[0], logical[1]),
        );
      };
    }
    if (!fogVisibility) return undefined;
    return (cell: readonly [number, number]) => {
      const logical = worldPointToLogicalCell(cell[0], cell[1], gridSpace, fineRatio);
      if ((fogResolution ?? "macro") === "fine") {
        return fogVisibility.has(fogCellKey(logical[0], logical[1]));
      }
      const macro = logicalCellToMacro(logical, gridSpace);
      return fogVisibility.has(fogCellKey(macro[0], macro[1]));
    };
  }, [authoritativeFogSets, fogVisibility, fogResolution, gridSpace, fineRatio]);
  const getVisualCellIllumination = useMemo(() => {
    if (!authoritativeVisibility) return undefined;
    const illuminationByCell = new Map(
      authoritativeVisibility.illumination.cells.map((entry) => [
        fogCellKey(entry.cell[0], entry.cell[1]),
        entry.value,
      ]),
    );
    const ambient = authoritativeVisibility.illumination.ambient_light;
    return (cell: readonly [number, number]) => {
      const logical = worldPointToLogicalCell(
        cell[0],
        cell[1],
        gridSpace,
        fineRatio,
      );
      return illuminationByCell.get(fogCellKey(logical[0], logical[1])) ?? ambient;
    };
  }, [authoritativeVisibility, gridSpace, fineRatio]);
  const getVisualStructureIllumination = useMemo(() => {
    if (!authoritativeVisibility) return undefined;
    const illuminationByCell = new Map(
      authoritativeVisibility.illumination.cells.map((entry) => [
        fogCellKey(entry.cell[0], entry.cell[1]),
        entry.value,
      ]),
    );
    const ambient = authoritativeVisibility.illumination.ambient_light;

    return (cell: readonly [number, number]) => {
      const footprint =
        gridSpace === "fine"
          ? fineCellsCoveredByWorldMacroCell(cell[0], cell[1], fineRatio)
          : ([
              worldPointToLogicalCell(
                cell[0],
                cell[1],
                gridSpace,
                fineRatio,
              ),
            ] as [number, number][]);
      return resolveStructureFootprintIllumination(
        footprint,
        (fineCell) =>
          illuminationByCell.get(fogCellKey(fineCell[0], fineCell[1])),
        ambient,
      );
    };
  }, [authoritativeVisibility, gridSpace, fineRatio]);

  return (
    <group>
      <ReferenceGameRenderer
        map={visualWorld.map}
        playerPos={transformPoint(playerPos)}
        playerFacing={playerFacing}
        playerSpriteId={playerSpriteId}
        worldItems={visualWorldItems}
        extraPlacements={visualExtraPlacements}
        onCellClick={logicalPointer(onCellClick)}
        onCellHover={logicalPointer(onCellHover)}
        onPointerOut={onPointerOut}
        targetPattern={gridSpace === "macro" ? targetPattern : undefined}
        rangeCells={gridSpace === "macro" ? rangeCells : undefined}
        hoveredCell={gridSpace === "macro" ? hoveredCell : null}
        editLayerY={editLayerY}
        entityStates={visualEntityStates}
        partyFollowers={visualPartyFollowers}
        partyMemberIds={partyMemberIds}
        mapDelta={visualWorld.mapDelta}
        inCombat={inCombat}
        activeTurnKey={activeTurnKey}
        showGrid={showGrid}
        enableOcclusion={enableOcclusion}
        occlusionAzimuth={occlusionAzimuth}
        renderCenter={transformPoint(renderCenter)}
        renderRadius={visualRadius}
        fxCellTransform={transformCell}
        rawPointerCoordinates={gridSpace === "fine"}
        isCellVisible={isVisualCellVisible}
        getCellFogState={getVisualCellFogState}
        getCellIllumination={getVisualCellIllumination}
        getStructureIllumination={getVisualStructureIllumination}
        suppressPlacementLights={Boolean(authoritativeVisibility)}
      />
      {authoritativeVisibility && (
        <AuthoritativeLightLayer
          visibility={authoritativeVisibility}
          gridSpace={gridSpace}
          fineRatio={fineRatio}
          renderCenter={renderCenter}
          renderRadius={renderRadius}
          maxLights={
            performanceMode
              ? MAX_PERFORMANCE_AUTHORITATIVE_POINT_LIGHTS
              : MAX_AUTHORITATIVE_POINT_LIGHTS
          }
        />
      )}
      <WorldOverlays3D
        map={map}
        mapDelta={mapDelta}
        gridSpace={gridSpace}
        fineRatio={fineRatio}
        playerPos={playerPos}
        targetPattern={targetPattern}
        rangeCells={rangeCells}
        hoveredCell={hoveredCell}
        combatOverwatchZones={combatOverwatchZones}
        combatIntents={combatIntents}
        worldDeniedCells={worldDeniedCells}
        renderCenter={renderCenter}
        renderRadius={renderRadius}
        fogOfWar={fogOfWar}
        fogRadius={fogRadius}
        fogResolution={fogResolution}
        initialExplored={initialExplored}
        onExplore={onExplore}
        authoritativeVisibility={authoritativeVisibility}
        showPerceptionDebug={showPerceptionDebug}
        performanceMode={performanceMode}
      />
      <ActorReadoutLayer
        map={visualWorld.map}
        entityStates={visualEntityStates}
        actorPhysicalStates={actorPhysicalStates}
        perceptionAlerts={perceptionAlerts}
        combatIntents={combatIntents}
        showBehaviorIntents={showBehaviorIntents}
        transformCell={transformCell}
        isCellVisible={isVisualCellVisible}
      />
    </group>
  );
});

// Fast Refresh replaces this module repeatedly during engine development.
// Explicitly release workers, pending decodes, timers, canvases, and GPU
// textures owned by the outgoing module so a long editing session does not
// accumulate GIF decoders and orphaned atlases until the browser tab stalls.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    spriteTextureCache.forEach((entry) => {
      entry.disposed = true;
      if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
      entry.releaseTimer = undefined;
      entry.subscribers?.clear();
      const image = entry.texture?.image;
      entry.texture?.dispose();
      if (image instanceof HTMLCanvasElement) {
        image.width = 1;
        image.height = 1;
      }
    });
    spriteTextureCache.clear();

    gifDecodeWorker?.terminate();
    gifDecodeWorker = null;
    pendingGifDecodes.forEach(({ reject }) =>
      reject(new Error("Animated sprite decode cancelled by Fast Refresh")),
    );
    pendingGifDecodes.clear();

    popupTextureCache.forEach(({ texture }) => texture.dispose());
    popupTextureCache.clear();
    barkTextureCache.forEach(({ texture }) => texture.dispose());
    barkTextureCache.clear();
    readoutTextureCache.forEach(({ texture }) => texture.dispose());
    readoutTextureCache.clear();
    emojiTextureCache.forEach((texture) => texture.dispose());
    emojiTextureCache.clear();
    actorRenderPositions.clear();

    lightPoolTextureCache?.dispose();
    lightPoolTextureCache = null;
    lightGlareTextureCache?.dispose();
    lightGlareTextureCache = null;
    lightStreakTextureCache?.dispose();
    lightStreakTextureCache = null;
  });
}
