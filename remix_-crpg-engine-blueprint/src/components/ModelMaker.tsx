import React, { useState, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEngineStore } from "../store/engineStore";
import {
  ObjectData,
  ObjectDecalData,
  ObjectMaterialData,
  ObjectPart,
  ObjectReferenceImageData,
  ObjectSchema,
} from "../schema/game";
import {
  Plus,
  Hammer,
  Eraser,
  Trash2,
  PaintBucket,
  LayoutGrid,
  Sparkles,
  Download,
  Upload,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Crosshair,
  Box as BoxIcon,
  MousePointer2,
  CircleDot,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Scissors,
  Square,
  Network,
  GitBranch,
  Magnet,
  Move3d,
  RotateCw,
  Scale3d,
} from "lucide-react";
import * as THREE from "three";
import { CHEM_MATERIALS } from "../engine-core/chemistry";
import { AIGenerationModal } from "./AIGenerationModal";
import {
  ALDERAMONTICO_MATERIALS,
  FootprintOverlay,
  ScaleReference,
} from "./ObjectPreviewHelpers";
import {
  AssetModelRenderer,
  MeshModelRenderer,
  ObjectDecalRenderer,
  type ModelSelectionMode,
} from "./ObjectRenderers";
import {
  exportObjectAsGltf,
  importObjectFromGltfFile,
  type GltfImportMode,
} from "../utils/gltfModelIO";
import {
  DECAL_KIND_PRESETS,
  MATERIAL_TEXTURE_OPTIONS,
  createDefaultMaterialSetting,
  getMaterialBudgetWarnings,
  getObjectMaterialTexture,
  getObjectMaterialRefs,
  isHexColor,
  resolveObjectMaterial,
} from "../utils/objectMaterials";
import {
  PROCEDURAL_STARTERS,
  createProceduralStarter,
  type ProceduralStarterKind,
} from "../utils/proceduralStarters";
import {
  KITBASH_GENERATORS,
  MODELING_GENERATORS,
  createGeneratedModel,
  createKitbashModel,
  type KitbashGeneratorKind,
  type ModelingGeneratorKind,
} from "../utils/modelGenerators";
import {
  bevelMeshEdge,
  createMeshFromParts,
  deleteMeshEdge,
  deleteMeshFace,
  deleteMeshVertex,
  duplicateMirrorMeshSelection,
  duplicateMeshSelection,
  extrudeMeshFace,
  getAllMeshVertexIds,
  getEdgeVertexIds,
  getFaceVertexIds,
  getMeshAverageNormal,
  getMeshBounds,
  getMeshBoundsInfo,
  getMeshEdges,
  getMeshSelectionCenter,
  getMeshStats,
  getMeshVertexNormal,
  hasMeshModel,
  insetMeshFace,
  mergeMeshEdge,
  mergeMeshVertexToNearest,
  mirrorMeshVertices,
  pushPullMeshVerticesAlongNormal,
  recomputeMeshNormals,
  rotateMeshVertices,
  sculptMeshSelection,
  setMeshFacesGroup,
  simplifyMeshSelection,
  snapMeshSelectionToNearestVertex,
  snapMeshToTileOrigin,
  scaleMeshVertices,
  snapMeshVertices,
  splitMeshEdge,
  translateMeshVertices,
  ungroupMeshFaces,
  type MeshBoundsInfo,
  type SculptFalloff,
  type SculptTool,
  type Vec3,
} from "../utils/meshModel";

const VOXEL_SIZE = 0.125;
const MODEL_HISTORY_LIMIT = 50;
const REFERENCE_VIEWS = ["front", "side", "top"] as const;

type TransformMode = "move" | "rotate" | "scale";
type ReferenceView = (typeof REFERENCE_VIEWS)[number];
type ModelerViewMode = "perspective" | ReferenceView;
type DecalKind = ObjectDecalData["kind"];

const REFERENCE_VIEW_LABELS: Record<ReferenceView, string> = {
  front: "Front",
  side: "Side",
  top: "Top",
};

const cloneObjectData = (object: ObjectData): ObjectData =>
  JSON.parse(JSON.stringify(object)) as ObjectData;

const makeSafeFilename = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "model";

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("File did not produce a data URL."));
    reader.onerror = () => reject(reader.error || new Error("File read failed."));
    reader.readAsDataURL(file);
  });

const downloadFile = (content: BlobPart, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const getMaterialSettingKey = (material: ObjectMaterialData) =>
  [material.id, material.name, material.color].filter(Boolean).map(String);

const upsertMaterialSettings = (
  settings: ObjectMaterialData[] | undefined,
  materialRef: string,
  updates: Partial<ObjectMaterialData>,
) => {
  const ref = materialRef.trim() || "#A3BE8C";
  const existingIndex = (settings || []).findIndex((material) =>
    getMaterialSettingKey(material).some(
      (key) => key.toLowerCase() === ref.toLowerCase(),
    ),
  );
  const base =
    existingIndex >= 0
      ? { ...(settings || [])[existingIndex] }
      : createDefaultMaterialSetting(ref);
  const nextSetting = {
    ...base,
    ...updates,
    id: base.id || ref,
    color:
      updates.color ||
      base.color ||
      (isHexColor(ref) ? ref : createDefaultMaterialSetting(ref).color),
  };

  if (existingIndex >= 0) {
    return (settings || []).map((material, index) =>
      index === existingIndex ? nextSetting : material,
    );
  }

  return [...(settings || []), nextSetting];
};

const getModelerCameraConfig = (
  mode: ModelerViewMode,
  liveBounds: MeshBoundsInfo | null,
  storedBounds: Vec3,
) => {
  const size = liveBounds?.size || storedBounds;
  const center = liveBounds?.center || ([0, Math.max(0.5, storedBounds[1] / 2), 0] as Vec3);
  const span = Math.max(1, size[0], size[1], size[2]);
  const distance = Math.max(5, span * 4);
  const target: Vec3 = [center[0], center[1], center[2]];

  if (mode === "front") {
    return {
      orthographic: true,
      target,
      camera: {
        position: [center[0], center[1], center[2] + distance] as Vec3,
        zoom: Math.max(55, Math.min(210, 170 / span)),
        near: -100,
        far: 100,
      },
    };
  }

  if (mode === "side") {
    return {
      orthographic: true,
      target,
      camera: {
        position: [center[0] + distance, center[1], center[2]] as Vec3,
        zoom: Math.max(55, Math.min(210, 170 / span)),
        near: -100,
        far: 100,
      },
    };
  }

  if (mode === "top") {
    return {
      orthographic: true,
      target,
      camera: {
        position: [center[0], center[1] + distance, center[2] + 0.001] as Vec3,
        zoom: Math.max(55, Math.min(210, 170 / span)),
        near: -100,
        far: 100,
      },
    };
  }

  return {
    orthographic: false,
    target: [0, 0.5, 0] as Vec3,
    camera: {
      position: [0, 4, 6] as Vec3,
      fov: 45,
    },
  };
};

export function ModelMaker() {
  const {
    gamePackage,
    addObject,
    updateObject,
    replaceObject,
    selectedObjectId,
    setSelectedObjectId,
  } = useEngineStore();

  const [activeObjId, setActiveObjId] = useState<string | null>(selectedObjectId || gamePackage.object_library[0]?.id || null);
  const [activeObj, setActiveObj] = useState<ObjectData | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const modelImportInputRef = useRef<HTMLInputElement | null>(null);
  const gltfImportInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRefs = useRef<Record<ReferenceView, HTMLInputElement | null>>({
    front: null,
    side: null,
    top: null,
  });

  useEffect(() => {
    setActiveObj(gamePackage.object_library.find(o => o.id === activeObjId) || null);
  }, [gamePackage.object_library, activeObjId]);

  useEffect(() => {
    if (activeObjId && activeObjId !== selectedObjectId) {
      setSelectedObjectId(activeObjId);
    }
  }, [activeObjId, selectedObjectId, setSelectedObjectId]);

  const [currentTool, setCurrentTool] = useState<"add" | "remove" | "paint">("add");
  const [currentColor, setCurrentColor] = useState<string>("#A3BE8C");
  useEffect(() => {
    if (!activeObj) return;
    const refs = getObjectMaterialRefs(activeObj);
    if (refs.length > 0 && !refs.includes(currentColor)) {
      setCurrentColor(refs[0]);
    }
  }, [activeObj?.id]);

  const [selectionMode, setSelectionMode] = useState<ModelSelectionMode>("part");
  const [objectSelected, setObjectSelected] = useState(false);
  const [selectedVertexId, setSelectedVertexId] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<number | null>(null);
  const [selectedVertexIds, setSelectedVertexIds] = useState<number[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [selectedFaceIds, setSelectedFaceIds] = useState<number[]>([]);
  const [transformMode, setTransformMode] = useState<TransformMode>("move");
  const [transformStep, setTransformStep] = useState(VOXEL_SIZE);
  const [rotationStepDeg, setRotationStepDeg] = useState(15);
  const [scaleStep, setScaleStep] = useState(0.1);
  const [insetRatio, setInsetRatio] = useState(0.2);
  const [bevelAmount, setBevelAmount] = useState(0.06);
  const [groupName, setGroupName] = useState("group_1");
  const [sculptTool, setSculptTool] = useState<SculptTool>("grab");
  const [sculptRadius, setSculptRadius] = useState(0.35);
  const [sculptStrength, setSculptStrength] = useState(0.08);
  const [sculptFalloff, setSculptFalloff] = useState<SculptFalloff>("smooth");
  const [sculptSymmetryX, setSculptSymmetryX] = useState(false);
  const [modelUndoStack, setModelUndoStack] = useState<ObjectData[]>([]);
  const [modelRedoStack, setModelRedoStack] = useState<ObjectData[]>([]);
  const [modelImportError, setModelImportError] = useState<string | null>(null);
  const [gltfImportMode, setGltfImportMode] = useState<GltfImportMode>("asset");
  const [modelerViewMode, setModelerViewMode] = useState<ModelerViewMode>("perspective");
  const [traceSilhouette, setTraceSilhouette] = useState(false);
  const [decalKind, setDecalKind] = useState<DecalKind>("crack");
  const [selectedDecalId, setSelectedDecalId] = useState<string | null>(null);

  const colors = [
    "#BF616A", "#D08770", "#EBCB8B", "#A3BE8C", "#B48EAD",
    "#8FBCBB", "#88C0D0", "#81A1C1", "#5E81AC",
    "#2E3440", "#3B4252", "#434C5E", "#4C566A",
    "#D8DEE9", "#E5E9F0", "#ECEFF4"
  ];

  useEffect(() => {
    setObjectSelected(false);
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
    setSelectedFaceId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeIds([]);
    setSelectedFaceIds([]);
    setSelectionMode("part");
    setModelUndoStack([]);
    setModelRedoStack([]);
    setModelImportError(null);
    setSelectedDecalId(null);
  }, [activeObjId]);

  const handleCreateObject = () => {
    const id = `obj_${Date.now()}`;
    const newObj: ObjectData = {
      id,
      display_name: "New Object",
      category: "props",
      tags: [],
      origin: "center_floor",
      bounds: [1, 1, 1],
      materials: ["#A3BE8C"],
      material_settings: [createDefaultMaterialSetting("#A3BE8C")],
      model_kind: "parts",
      reference_images: [],
      decals: [],
      parts: [
        {
          shape: "box",
          name: "voxel_0_0_0",
          position: [VOXEL_SIZE / 2, VOXEL_SIZE / 2, VOXEL_SIZE / 2],
          rotation: [0, 0, 0],
          size: [VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE],
          material: "#A3BE8C",
        },
      ],
      collision: {
        profile: "single",
        footprint: [[0, 0]],
      },
    };
    addObject(newObj);
    setActiveObjId(id);
  };

  const handleCreateTile = () => {
    const id = `tile_${Date.now()}`;
    const parts: ObjectPart[] = [];
    const color = currentColor || "#434C5E";
    // 8x8 grid centered
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
         const posX = (x - 3.5) * VOXEL_SIZE;
         const posZ = (z - 3.5) * VOXEL_SIZE;
         parts.push({
            shape: "box",
            name: `voxel_${x}_0_${z}`,
            position: [posX, VOXEL_SIZE/2, posZ],
            rotation: [0, 0, 0],
            size: [VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE],
            material: color
         });
      }
    }
    
    const newTile: ObjectData = {
      id,
      display_name: "New Floor Tile",
      category: "props",
      tags: ["tile"],
      origin: "center_floor",
      bounds: [1, 1, 1],
      materials: [color],
      material_settings: [createDefaultMaterialSetting(color)],
      model_kind: "parts",
      reference_images: [],
      decals: [],
      parts,
      collision: {
        profile: "single",
        footprint: [[0, 0]], // tiles typically don't have collision unless defined
      },
    };
    addObject(newTile);
    setActiveObjId(id);
  };

  const handleCreateProceduralStarter = (kind: ProceduralStarterKind) => {
    const starter = createProceduralStarter(kind);

    addObject(starter);
    setActiveObjId(starter.id);
    setCurrentColor(starter.materials[0] || "#A3BE8C");
    setCurrentTool("paint");
    setModelImportError(null);
  };

  const handleCreateGeneratedModel = (kind: ModelingGeneratorKind) => {
    const model = createGeneratedModel(kind);

    addObject(model);
    setActiveObjId(model.id);
    setCurrentColor(model.materials[0] || "#A3BE8C");
    setCurrentTool("paint");
    setSelectionMode("object");
    setObjectSelected(true);
    setModelImportError(null);
  };

  const handleCreateKitbashModel = (kind: KitbashGeneratorKind) => {
    const model = createKitbashModel(kind);

    addObject(model);
    setActiveObjId(model.id);
    setCurrentColor(model.materials[0] || "#A3BE8C");
    setCurrentTool("paint");
    setSelectionMode("object");
    setObjectSelected(true);
    setModelImportError(null);
  };

  const getFootprintSize = (obj: ObjectData) => {
    const footprint = obj.collision?.footprint?.length
      ? obj.collision.footprint
      : ([[0, 0]] as [number, number][]);
    const xs = footprint.map(([x]) => x);
    const zs = footprint.map(([, z]) => z);

    return {
      width: Math.max(...xs) - Math.min(...xs) + 1,
      depth: Math.max(...zs) - Math.min(...zs) + 1,
    };
  };

  const pushModelHistory = () => {
    if (!activeObj) return;

    setModelUndoStack((stack) =>
      [...stack, cloneObjectData(activeObj)].slice(-MODEL_HISTORY_LIMIT),
    );
    setModelRedoStack([]);
  };

  const commitActiveObjectUpdate = (updates: Partial<ObjectData>) => {
    if (!activeObj) return;

    pushModelHistory();
    updateObject(activeObj.id, updates);
  };

  const commitActiveObjectReplace = (object: ObjectData) => {
    if (!activeObj) return;

    pushModelHistory();
    replaceObject(object);
  };

  const resetSelectionAfterRestore = (object: ObjectData) => {
    const restoredHasMesh = hasMeshModel(object);

    setSelectionMode(restoredHasMesh ? "object" : "part");
    setObjectSelected(restoredHasMesh);
    setSelectedVertexId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setSelectedFaceId(null);
    setSelectedFaceIds([]);
  };

  const undoModelOperation = () => {
    if (!activeObj || modelUndoStack.length === 0) return;

    const previous = modelUndoStack[modelUndoStack.length - 1];
    setModelUndoStack((stack) => stack.slice(0, -1));
    setModelRedoStack((stack) =>
      [cloneObjectData(activeObj), ...stack].slice(0, MODEL_HISTORY_LIMIT),
    );
    replaceObject(previous);
    setActiveObjId(previous.id);
    resetSelectionAfterRestore(previous);
  };

  const redoModelOperation = () => {
    if (!activeObj || modelRedoStack.length === 0) return;

    const next = modelRedoStack[0];
    setModelRedoStack((stack) => stack.slice(1));
    setModelUndoStack((stack) =>
      [...stack, cloneObjectData(activeObj)].slice(-MODEL_HISTORY_LIMIT),
    );
    replaceObject(next);
    setActiveObjId(next.id);
    resetSelectionAfterRestore(next);
  };

  const exportActiveModelJson = () => {
    if (!activeObj) return;

    try {
      const model = ObjectSchema.parse(activeObj);
      downloadFile(
        JSON.stringify(model, null, 2),
        `${makeSafeFilename(activeObj.display_name || activeObj.id)}.model.json`,
        "application/json",
      );
      setModelImportError(null);
    } catch (error) {
      console.error("Failed to export model", error);
      setModelImportError("Export failed");
    }
  };

  const exportActiveModelGltf = async (binary: boolean) => {
    if (!activeObj) return;

    try {
      const result = await exportObjectAsGltf(activeObj, binary);
      downloadFile(
        result,
        `${makeSafeFilename(activeObj.display_name || activeObj.id)}.${binary ? "glb" : "gltf"}`,
        binary ? "model/gltf-binary" : "model/gltf+json",
      );
      setModelImportError(null);
    } catch (error) {
      console.error("Failed to export GLB/GLTF", error);
      setModelImportError("GLB/GLTF export failed");
    }
  };

  const importModelJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const importedModel = ObjectSchema.parse(parsed);
      const existingObject = gamePackage.object_library.find(
        (object) => object.id === importedModel.id,
      );

      if (existingObject) {
        if (activeObj?.id === importedModel.id) {
          commitActiveObjectReplace(importedModel);
        } else {
          replaceObject(importedModel);
        }
      } else {
        addObject(importedModel);
      }

      setActiveObjId(importedModel.id);
      setModelImportError(null);
    } catch (error) {
      console.error("Failed to import model JSON", error);
      setModelImportError("Invalid model JSON");
    }
  };

  const importGltfFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const importedModel = await importObjectFromGltfFile(file, gltfImportMode);
      addObject(importedModel);
      setActiveObjId(importedModel.id);
      setSelectionMode("object");
      setObjectSelected(true);
      setSelectedVertexId(null);
      setSelectedVertexIds([]);
      setSelectedEdgeId(null);
      setSelectedEdgeIds([]);
      setSelectedFaceId(null);
      setSelectedFaceIds([]);
      setSelectedDecalId(null);
      setModelImportError(null);
    } catch (error) {
      console.error("Failed to import GLB/GLTF", error);
      setModelImportError("GLB/GLTF import failed");
    }
  };

  const upsertReferenceImage = (
    view: ReferenceView,
    reference: ObjectReferenceImageData,
  ) => {
    if (!activeObj) return;

    const references = activeObj.reference_images || [];
    const hasReference = references.some((candidate) => candidate.view === view);
    const nextReferences = hasReference
      ? references.map((candidate) =>
          candidate.view === view ? reference : candidate,
        )
      : [...references, reference];

    commitActiveObjectUpdate({ reference_images: nextReferences });
  };

  const updateReferenceImage = (
    view: ReferenceView,
    updates: Partial<ObjectReferenceImageData>,
  ) => {
    if (!activeObj) return;

    const references = activeObj.reference_images || [];
    const nextReferences = references.map((reference) =>
      reference.view === view ? { ...reference, ...updates } : reference,
    );

    commitActiveObjectUpdate({ reference_images: nextReferences });
  };

  const removeReferenceImage = (view: ReferenceView) => {
    if (!activeObj) return;

    commitActiveObjectUpdate({
      reference_images: (activeObj.reference_images || []).filter(
        (reference) => reference.view !== view,
      ),
    });
  };

  const importReferenceImageFile = async (
    view: ReferenceView,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !activeObj) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const existing = (activeObj.reference_images || []).find(
        (reference) => reference.view === view,
      );
      upsertReferenceImage(view, {
        id: existing?.id || `ref_${view}_${Date.now()}`,
        view,
        name: file.name,
        data_url: dataUrl,
        opacity: existing?.opacity ?? 0.45,
        locked: existing?.locked ?? true,
        visible: existing?.visible ?? true,
        scale: existing?.scale ?? 1,
        offset: existing?.offset || [0, 0, 0],
      });
      setModelerViewMode(view);
      setModelImportError(null);
    } catch (error) {
      console.error("Failed to load reference image", error);
      setModelImportError("Reference image failed");
    }
  };

  const updateRectFootprint = (width: number, depth: number) => {
    if (!activeObj) return;

    const safeWidth = Math.max(1, Math.min(9, Math.floor(width) || 1));
    const safeDepth = Math.max(1, Math.min(9, Math.floor(depth) || 1));
    const minX = -Math.floor(safeWidth / 2);
    const minZ = -Math.floor(safeDepth / 2);
    const footprint: [number, number][] = [];

    for (let x = minX; x < minX + safeWidth; x++) {
      for (let z = minZ; z < minZ + safeDepth; z++) {
        footprint.push([x, z]);
      }
    }

    commitActiveObjectUpdate({
      bounds: [safeWidth, activeObj.bounds?.[1] || 1, safeDepth],
      collision: {
        ...(activeObj.collision || {}),
        profile:
          activeObj.collision?.profile === "none"
            ? "none"
            : safeWidth === 1 && safeDepth === 1
              ? "single"
              : "custom_footprint",
        footprint,
      },
    });
  };

  const convertActiveObjectToMesh = () => {
    if (!activeObj) return;

    const mesh = createMeshFromParts(activeObj);
    commitActiveObjectUpdate({
      model_kind: "mesh",
      mesh,
      materials: mesh.material_slots,
      material_settings: Array.from(
        new Set(mesh.material_slots.length ? mesh.material_slots : activeObj.materials),
      ).reduce<ObjectMaterialData[]>(
        (settings, materialRef) =>
          upsertMaterialSettings(settings, materialRef, {}),
        activeObj.material_settings || [],
      ),
    });
    setSelectionMode("face");
    setObjectSelected(false);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setSelectedFaceId(mesh.faces.length > 0 ? 0 : null);
    setSelectedFaceIds(mesh.faces.length > 0 ? [0] : []);
    setSelectedVertexId(null);
    setSelectedVertexIds([]);
  };

  const updateMeshFacesMaterial = (faceIndices: number[], material: string) => {
    if (!activeObj?.mesh) return;

    const selectedFaces = new Set(faceIndices);
    if (selectedFaces.size === 0) return;
    const materialRef = material.trim() || "#A3BE8C";

    commitActiveObjectUpdate({
      materials: Array.from(new Set([...(activeObj.materials || []), materialRef])),
      material_settings: upsertMaterialSettings(
        activeObj.material_settings,
        materialRef,
        {},
      ),
      mesh: {
        ...activeObj.mesh,
        material_slots: Array.from(
          new Set([...(activeObj.mesh.material_slots || []), materialRef]),
        ),
        faces: activeObj.mesh.faces.map((face, index) =>
          selectedFaces.has(index) ? { ...face, material: materialRef } : face,
        ),
      },
    });
  };

  const updateCurrentMaterialSetting = (
    updates: Partial<ObjectMaterialData>,
  ) => {
    if (!activeObj) return;

    const materialRef = currentColor.trim() || "#A3BE8C";
    commitActiveObjectUpdate({
      materials: Array.from(new Set([...(activeObj.materials || []), materialRef])),
      material_settings: upsertMaterialSettings(
        activeObj.material_settings,
        materialRef,
        updates,
      ),
    });
  };

  const updateActiveAsset = (
    updates: Partial<NonNullable<ObjectData["asset"]>>,
    updateCollision = false,
  ) => {
    if (!activeObj?.asset) return;

    const nextAsset = { ...activeObj.asset, ...updates };
    const sourceBounds = normalizeVec3(nextAsset.source_bounds);
    const scale = normalizeVec3(nextAsset.scale).map((value) =>
      Math.max(0.001, Math.abs(value || 1)),
    ) as Vec3;
    const bounds: Vec3 = [
      Math.max(0.01, sourceBounds[0] * scale[0]),
      Math.max(0.01, sourceBounds[1] * scale[1]),
      Math.max(0.01, sourceBounds[2] * scale[2]),
    ];

    commitActiveObjectUpdate({
      asset: nextAsset,
      bounds,
      ...(updateCollision
        ? {
            collision: {
              profile: "custom_footprint",
              footprint: makeFootprintFromBounds(bounds),
            },
          }
        : {}),
    });
  };

  const fitAssetToTile = () => {
    if (!activeObj?.asset) return;
    const sourceBounds = normalizeVec3(activeObj.asset.source_bounds);
    const scale = 1 / Math.max(0.01, sourceBounds[0], sourceBounds[2]);
    updateActiveAsset({ scale: [scale, scale, scale] }, true);
  };

  const centerAssetOrigin = () => {
    if (!activeObj?.asset) return;
    const sourceCenter = normalizeVec3(activeObj.asset.source_center);
    const sourceMin = normalizeVec3(activeObj.asset.source_min);

    updateActiveAsset({
      offset: [-sourceCenter[0], -sourceMin[1], -sourceCenter[2]],
    });
  };

  const generateCollisionFootprint = () => {
    if (!activeObj) return;
    const bounds = normalizeVec3(activeObj.bounds);
    commitActiveObjectUpdate({
      collision: {
        profile: "custom_footprint",
        footprint: makeFootprintFromBounds(bounds),
      },
    });
  };

  const handleVertexSelect = (vertexIndex: number, e: any) => {
    e.stopPropagation();
    const nextVertexIds = isAdditiveSelectionEvent(e)
      ? toggleSelectionValue(selectedVertexIds, vertexIndex)
      : [vertexIndex];

    setObjectSelected(false);
    setSelectedVertexIds(nextVertexIds);
    setSelectedVertexId(nextVertexIds.at(-1) ?? null);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setSelectedFaceId(null);
    setSelectedFaceIds([]);
  };

  const handleEdgeSelect = (edgeId: string, e: any) => {
    e.stopPropagation();
    const nextEdgeIds = isAdditiveSelectionEvent(e)
      ? toggleSelectionValue(selectedEdgeIds, edgeId)
      : [edgeId];

    setObjectSelected(false);
    setSelectedVertexId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeIds(nextEdgeIds);
    setSelectedEdgeId(nextEdgeIds.at(-1) ?? null);
    setSelectedFaceId(null);
    setSelectedFaceIds([]);
  };

  const handleFaceSelect = (faceIndex: number, e: any) => {
    e.stopPropagation();
    const nextFaceIds = isAdditiveSelectionEvent(e)
      ? toggleSelectionValue(selectedFaceIds, faceIndex)
      : [faceIndex];

    setObjectSelected(false);
    setSelectedFaceIds(nextFaceIds);
    setSelectedFaceId(nextFaceIds.at(-1) ?? null);
    setSelectedVertexId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);

    if (currentTool === "paint") {
      updateMeshFacesMaterial(nextFaceIds.length > 0 ? nextFaceIds : [faceIndex], currentColor);
    }
  };

  const handleObjectSelect = (e?: any) => {
    e?.stopPropagation?.();
    setObjectSelected(true);
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
    setSelectedFaceId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeIds([]);
    setSelectedFaceIds([]);
  };

  const changeSelectionMode = (nextMode: ModelSelectionMode) => {
    setSelectionMode(nextMode);
    setObjectSelected(nextMode === "object");
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
    setSelectedFaceId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeIds([]);
    setSelectedFaceIds([]);
  };

  const getSelectedFaceDecalPlacement = (): Pick<
    ObjectDecalData,
    "position" | "rotation" | "target_face"
  > => {
    if (activeObj?.mesh && selectedFaceId !== null) {
      const face = activeObj.mesh.faces[selectedFaceId];
      const vertices = face?.vertices
        .map((vertexId) => activeObj.mesh?.vertices[vertexId])
        .filter(Boolean) as Vec3[];

      if (face && vertices.length >= 3) {
        const center = vertices.reduce(
          (sum, vertex) =>
            [
              sum[0] + Number(vertex[0] || 0),
              sum[1] + Number(vertex[1] || 0),
              sum[2] + Number(vertex[2] || 0),
            ] as Vec3,
          [0, 0, 0] as Vec3,
        );
        center[0] /= vertices.length;
        center[1] /= vertices.length;
        center[2] /= vertices.length;

        const normalSource = (face.normal || selectedNormal || [0, 1, 0]) as Vec3;
        const normal = new THREE.Vector3(
          normalSource[0],
          normalSource[1],
          normalSource[2],
        );
        if (normal.lengthSq() < 0.000001) normal.set(0, 1, 0);
        normal.normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal,
        );
        const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");

        return {
          position: [
            center[0] + normal.x * 0.018,
            center[1] + normal.y * 0.018,
            center[2] + normal.z * 0.018,
          ],
          rotation: [euler.x, euler.y, euler.z],
          target_face: selectedFaceId,
        };
      }
    }

    const y = liveMeshBounds?.max[1] ?? activeObj?.bounds?.[1] ?? 0.02;
    return {
      position: [0, Math.max(0.02, y + 0.018), 0],
      rotation: [-Math.PI / 2, 0, 0],
      target_face: undefined,
    };
  };

  const addDecalToSelection = () => {
    if (!activeObj) return;

    const preset = DECAL_KIND_PRESETS[decalKind];
    const placement = getSelectedFaceDecalPlacement();
    const aspect =
      decalKind === "crack" || decalKind === "marble_vein" ? [0.72, 0.18] : [0.48, 0.48];
    const decal: ObjectDecalData = {
      id: `decal_${decalKind}_${Date.now()}`,
      name: preset.label,
      kind: decalKind,
      color: preset.color,
      opacity: preset.opacity,
      emissive: preset.emissive,
      size: aspect as [number, number],
      ...placement,
    };

    commitActiveObjectUpdate({
      decals: [...(activeObj.decals || []), decal],
    });
    setSelectedDecalId(decal.id);
  };

  const updateSelectedDecal = (updates: Partial<ObjectDecalData>) => {
    if (!activeObj || !selectedDecalId) return;

    commitActiveObjectUpdate({
      decals: (activeObj.decals || []).map((decal) =>
        decal.id === selectedDecalId ? { ...decal, ...updates } : decal,
      ),
    });
  };

  const deleteSelectedDecal = () => {
    if (!activeObj || !selectedDecalId) return;

    commitActiveObjectUpdate({
      decals: (activeObj.decals || []).filter(
        (decal) => decal.id !== selectedDecalId,
      ),
    });
    setSelectedDecalId(null);
  };

  const activeMeshEdges = useMemo(
    () => (activeObj?.mesh ? getMeshEdges(activeObj.mesh) : []),
    [activeObj?.mesh],
  );

  const selectedTransformVertexIds = useMemo(() => {
    if (!activeObj?.mesh) return [];

    if (selectionMode === "object" && objectSelected) {
      return getAllMeshVertexIds(activeObj.mesh);
    }

    if (selectionMode === "vertex" && selectedVertexIds.length > 0) {
      return selectedVertexIds;
    }

    if (selectionMode === "edge" && selectedEdgeIds.length > 0) {
      return getEdgeVertexIds(activeObj.mesh, selectedEdgeIds);
    }

    if (selectionMode === "face" && selectedFaceIds.length > 0) {
      return getFaceVertexIds(activeObj.mesh, selectedFaceIds);
    }

    return [];
  }, [
    activeObj?.mesh,
    objectSelected,
    selectedEdgeIds,
    selectedFaceIds,
    selectedVertexIds,
    selectionMode,
  ]);

  const selectedOperationFaceIds = useMemo(() => {
    if (!activeObj?.mesh) return [];

    if (selectionMode === "object" && objectSelected) {
      return activeObj.mesh.faces.map((_, faceIndex) => faceIndex);
    }

    if (selectionMode === "face") {
      return selectedFaceIds;
    }

    return [];
  }, [activeObj?.mesh, objectSelected, selectedFaceIds, selectionMode]);

  const selectedGroupFaceIds = useMemo(() => {
    if (!activeObj?.mesh) return [];
    if (selectedOperationFaceIds.length > 0) return selectedOperationFaceIds;

    const selectedVertices = new Set(selectedTransformVertexIds);
    if (selectedVertices.size === 0) return [];

    return activeObj.mesh.faces
      .map((face, faceIndex) =>
        face.vertices.some((vertexId) => selectedVertices.has(vertexId))
          ? faceIndex
          : -1,
      )
      .filter((faceIndex) => faceIndex >= 0);
  }, [activeObj?.mesh, selectedOperationFaceIds, selectedTransformVertexIds]);

  const transformCenter = useMemo(
    () =>
      activeObj?.mesh
        ? getMeshSelectionCenter(activeObj.mesh, selectedTransformVertexIds)
        : null,
    [activeObj?.mesh, selectedTransformVertexIds],
  );

  const selectedNormal = useMemo(() => {
    if (!activeObj?.mesh) return null;

    if (selectionMode === "face" && selectedFaceIds.length > 0) {
      return getMeshAverageNormal(activeObj.mesh, selectedFaceIds);
    }

    if (selectionMode === "edge" && selectedEdgeIds.length > 0) {
      const faceIds = activeMeshEdges
        .filter((edge) => selectedEdgeIds.includes(edge.id))
        .flatMap((edge) => edge.faces);
      return getMeshAverageNormal(activeObj.mesh, Array.from(new Set(faceIds)));
    }

    if (selectionMode === "vertex" && selectedVertexIds.length > 0) {
      if (selectedVertexIds.length === 1) {
        return getMeshVertexNormal(activeObj.mesh, selectedVertexIds[0]);
      }

      const faceIds = activeObj.mesh.faces
        .map((face, faceIndex) =>
          face.vertices.some((vertexId) => selectedVertexIds.includes(vertexId))
            ? faceIndex
            : -1,
        )
        .filter((faceIndex) => faceIndex >= 0);
      return getMeshAverageNormal(activeObj.mesh, faceIds);
    }

    return null;
  }, [
    activeMeshEdges,
    activeObj?.mesh,
    selectedEdgeIds,
    selectedFaceIds,
    selectedVertexIds,
    selectionMode,
  ]);

  const referenceByView = useMemo(() => {
    const references = activeObj?.reference_images || [];
    return REFERENCE_VIEWS.reduce(
      (acc, view) => {
        acc[view] = references.find((reference) => reference.view === view) || null;
        return acc;
      },
      {} as Record<ReferenceView, ObjectReferenceImageData | null>,
    );
  }, [activeObj?.reference_images]);

  const updateActiveMesh = (mesh: NonNullable<ObjectData["mesh"]>) => {
    if (!activeObj) return;

    commitActiveObjectUpdate({
      mesh,
      bounds: getMeshBounds(mesh),
    });
  };

  const moveSelection = (delta: [number, number, number]) => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    const mesh = translateMeshVertices(
      activeObj.mesh,
      selectedTransformVertexIds,
      delta,
    );

    updateActiveMesh(mesh);
  };

  const rotateSelection = (axis: Vec3, direction: 1 | -1 = 1) => {
    if (
      !activeObj?.mesh ||
      !transformCenter ||
      selectedTransformVertexIds.length === 0
    ) {
      return;
    }

    const radians = THREE.MathUtils.degToRad(rotationStepDeg * direction);
    const mesh = rotateMeshVertices(
      activeObj.mesh,
      selectedTransformVertexIds,
      transformCenter,
      axis,
      radians,
    );

    updateActiveMesh(mesh);
  };

  const scaleSelection = (axis: Vec3, direction: 1 | -1 = 1) => {
    if (
      !activeObj?.mesh ||
      !transformCenter ||
      selectedTransformVertexIds.length === 0
    ) {
      return;
    }

    const amount = direction > 0 ? 1 + scaleStep : Math.max(0.05, 1 - scaleStep);
    const factor: Vec3 = [
      axis[0] === 0 ? 1 : amount,
      axis[1] === 0 ? 1 : amount,
      axis[2] === 0 ? 1 : amount,
    ];
    const mesh = scaleMeshVertices(
      activeObj.mesh,
      selectedTransformVertexIds,
      transformCenter,
      factor,
    );

    updateActiveMesh(mesh);
  };

  const scaleSelectionUniform = (direction: 1 | -1 = 1) => {
    if (
      !activeObj?.mesh ||
      !transformCenter ||
      selectedTransformVertexIds.length === 0
    ) {
      return;
    }

    const amount = direction > 0 ? 1 + scaleStep : Math.max(0.05, 1 - scaleStep);
    const mesh = scaleMeshVertices(
      activeObj.mesh,
      selectedTransformVertexIds,
      transformCenter,
      [amount, amount, amount],
    );

    updateActiveMesh(mesh);
  };

  const snapSelectionToGrid = () => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    updateActiveMesh(
      snapMeshVertices(activeObj.mesh, selectedTransformVertexIds, transformStep),
    );
  };

  const snapSelectionToVertex = () => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    updateActiveMesh(
      snapMeshSelectionToNearestVertex(activeObj.mesh, selectedTransformVertexIds),
    );
  };

  const snapObjectToTileOrigin = () => {
    if (!activeObj?.mesh) return;

    updateActiveMesh(snapMeshToTileOrigin(activeObj.mesh));
  };

  const syncBoundsAndOrigin = () => {
    if (!activeObj) return;

    if (activeObj.mesh) {
      const mesh = snapMeshToTileOrigin(activeObj.mesh);
      commitActiveObjectUpdate({
        mesh,
        bounds: getMeshBounds(mesh),
        origin: "center_floor",
      });
      return;
    }

    commitActiveObjectUpdate({ origin: "center_floor" });
  };

  const applySelectionOperationResult = (
    result: ReturnType<typeof duplicateMeshSelection>,
  ) => {
    updateActiveMesh(result.mesh);
    setObjectSelected(false);
    setSelectedEdgeIds([]);
    setSelectedEdgeId(null);

    if (result.selectedFaceIndices.length > 0) {
      setSelectionMode("face");
      setSelectedFaceIds(result.selectedFaceIndices);
      setSelectedFaceId(result.selectedFaceIndices.at(-1) ?? null);
      setSelectedVertexIds([]);
      setSelectedVertexId(null);
      return;
    }

    setSelectionMode("vertex");
    setSelectedVertexIds(result.selectedVertexIndices);
    setSelectedVertexId(result.selectedVertexIndices.at(-1) ?? null);
    setSelectedFaceIds([]);
    setSelectedFaceId(null);
  };

  const duplicateSelection = () => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    applySelectionOperationResult(
      duplicateMeshSelection(
        activeObj.mesh,
        selectedTransformVertexIds,
        selectedOperationFaceIds,
        [transformStep, 0, transformStep],
      ),
    );
  };

  const mirrorSelection = (axis: "x" | "z") => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    updateActiveMesh(
      mirrorMeshVertices(activeObj.mesh, selectedTransformVertexIds, axis, 0),
    );
  };

  const mirrorCopySelection = (axis: "x" | "z") => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    applySelectionOperationResult(
      duplicateMirrorMeshSelection(
        activeObj.mesh,
        selectedTransformVertexIds,
        selectedOperationFaceIds,
        axis,
        0,
      ),
    );
  };

  const pushPullSelectionAlongNormal = (direction: 1 | -1 = 1) => {
    if (
      !activeObj?.mesh ||
      !selectedNormal ||
      selectedTransformVertexIds.length === 0
    ) {
      return;
    }

    updateActiveMesh(
      pushPullMeshVerticesAlongNormal(
        activeObj.mesh,
        selectedTransformVertexIds,
        selectedNormal,
        transformStep * direction,
      ),
    );
  };

  const recalculateActiveMeshNormals = () => {
    if (!activeObj?.mesh) return;

    updateActiveMesh(recomputeMeshNormals(activeObj.mesh));
  };

  const groupSelection = () => {
    if (!activeObj?.mesh || selectedGroupFaceIds.length === 0) return;

    updateActiveMesh(
      setMeshFacesGroup(activeObj.mesh, selectedGroupFaceIds, groupName),
    );
  };

  const ungroupSelection = () => {
    if (!activeObj?.mesh || selectedGroupFaceIds.length === 0) return;

    updateActiveMesh(ungroupMeshFaces(activeObj.mesh, selectedGroupFaceIds));
  };

  const applySculptTool = (tool: SculptTool) => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    setSculptTool(tool);
    updateActiveMesh(
      sculptMeshSelection(
        activeObj.mesh,
        selectedTransformVertexIds,
        tool,
        sculptStrength,
        sculptRadius,
        sculptFalloff,
        sculptSymmetryX,
      ),
    );
  };

  const simplifySelection = () => {
    if (!activeObj?.mesh || selectedTransformVertexIds.length === 0) return;

    const mesh = simplifyMeshSelection(
      activeObj.mesh,
      selectedTransformVertexIds,
      transformStep,
    );

    updateActiveMesh(mesh);
    setSelectionMode("object");
    setObjectSelected(true);
    setSelectedVertexId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setSelectedFaceId(null);
    setSelectedFaceIds([]);
  };

  const applyFaceOperationResult = (
    result: ReturnType<typeof extrudeMeshFace>,
  ) => {
    updateActiveMesh(result.mesh);
    setSelectionMode("face");
    setObjectSelected(false);
    setSelectedVertexId(null);
    setSelectedVertexIds([]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setSelectedFaceId(result.selectedFaceIndex);
    setSelectedFaceIds(result.selectedFaceIndex === null ? [] : [result.selectedFaceIndex]);
  };

  const extrudeSelectedFace = (direction: 1 | -1 = 1) => {
    if (!activeObj?.mesh || selectedFaceId === null) return;

    applyFaceOperationResult(
      extrudeMeshFace(activeObj.mesh, selectedFaceId, transformStep * direction),
    );
  };

  const insetSelectedFace = () => {
    if (!activeObj?.mesh || selectedFaceId === null) return;

    applyFaceOperationResult(
      insetMeshFace(activeObj.mesh, selectedFaceId, insetRatio),
    );
  };

  const deleteSelectedFace = () => {
    if (!activeObj?.mesh || selectedFaceId === null) return;

    applyFaceOperationResult(deleteMeshFace(activeObj.mesh, selectedFaceId));
  };

  const applyTopologyOperationResult = (
    result: ReturnType<typeof mergeMeshEdge>,
  ) => {
    updateActiveMesh(result.mesh);
    setObjectSelected(false);
    setSelectedVertexId(result.selectedVertexIndex);
    setSelectedVertexIds(result.selectedVertexIndex === null ? [] : [result.selectedVertexIndex]);
    setSelectedEdgeId(result.selectedEdgeId);
    setSelectedEdgeIds(result.selectedEdgeId === null ? [] : [result.selectedEdgeId]);
    setSelectedFaceId(result.selectedFaceIndex);
    setSelectedFaceIds(result.selectedFaceIndex === null ? [] : [result.selectedFaceIndex]);

    if (result.selectedVertexIndex !== null) {
      setSelectionMode("vertex");
    } else if (result.selectedEdgeId !== null) {
      setSelectionMode("edge");
    } else if (result.selectedFaceIndex !== null) {
      setSelectionMode("face");
    }
  };

  const mergeSelectedVertexToNearest = () => {
    if (!activeObj?.mesh || selectedVertexId === null) return;

    applyTopologyOperationResult(
      mergeMeshVertexToNearest(activeObj.mesh, selectedVertexId),
    );
  };

  const deleteSelectedVertex = () => {
    if (!activeObj?.mesh || selectedVertexId === null) return;

    applyTopologyOperationResult(deleteMeshVertex(activeObj.mesh, selectedVertexId));
  };

  const mergeSelectedEdge = () => {
    if (!activeObj?.mesh || selectedEdgeId === null) return;

    applyTopologyOperationResult(mergeMeshEdge(activeObj.mesh, selectedEdgeId));
  };

  const deleteSelectedEdge = () => {
    if (!activeObj?.mesh || selectedEdgeId === null) return;

    applyTopologyOperationResult(deleteMeshEdge(activeObj.mesh, selectedEdgeId));
  };

  const splitSelectedEdge = () => {
    if (!activeObj?.mesh || selectedEdgeId === null) return;

    applyTopologyOperationResult(splitMeshEdge(activeObj.mesh, selectedEdgeId));
  };

  const bevelSelectedEdge = () => {
    if (!activeObj?.mesh || selectedEdgeId === null) return;

    applyTopologyOperationResult(
      bevelMeshEdge(activeObj.mesh, selectedEdgeId, bevelAmount),
    );
  };

  const handlePointerDown = (e: any, isFloor = false, existingIndex = -1) => {
    e.stopPropagation();
    if (!activeObj) return;
    if (e.pointerType === "mouse" && e.button !== 0) return; // Left click only for mouse

    const parts = [...activeObj.parts];
    
    if (currentTool === "remove" && !isFloor && existingIndex !== -1) {
      parts.splice(existingIndex, 1);
      commitActiveObjectUpdate({ parts });
      return;
    }

    if (currentTool === "paint" && !isFloor && existingIndex !== -1) {
      parts[existingIndex] = { ...parts[existingIndex], material: currentColor };
      commitActiveObjectUpdate({ parts });
      return;
    }

    if (currentTool === "add" && e.face) {
      // Calculate new voxel position
      const n = e.face.normal.clone();
      // Snap normal cleanly to avoid floating point issues
      n.x = Math.round(n.x);
      n.y = Math.round(n.y);
      n.z = Math.round(n.z);
      
      let pos = new THREE.Vector3();
      
      if (isFloor) {
        // Find point on floor grid
        pos.copy(e.point);
        pos.y = VOXEL_SIZE / 2;
      } else {
        // Find center of clicked voxel and add normal
        pos.fromArray(parts[existingIndex].position as any);
        pos.add(n.clone().multiplyScalar(VOXEL_SIZE));
      }

      // Snap to grid (half-offset to center even grids like 8x8 perfectly around 0,0)
      const snappedPos = [
        Math.round((pos.x - VOXEL_SIZE/2) / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE/2,
        Math.round((pos.y - VOXEL_SIZE/2) / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE/2,
        Math.round((pos.z - VOXEL_SIZE/2) / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE/2
      ] as [number, number, number];

      // Prevent adding below floor
      if (snappedPos[1] < VOXEL_SIZE/2) return;

      // Prevent duplicate voxels
      if (parts.some(p => p.position[0] === snappedPos[0] && p.position[1] === snappedPos[1] && p.position[2] === snappedPos[2])) {
        return;
      }

      parts.push({
        shape: "box",
        name: `voxel_${Date.now()}`,
        position: snappedPos,
        rotation: [0, 0, 0],
        size: [VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE],
        material: currentColor
      });

      commitActiveObjectUpdate({ parts });
    }
  };

  if (!activeObj) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="bg-neutral-800 p-6 rounded-full inline-block mb-2">
          <Hammer className="w-8 h-8 text-neutral-400" />
        </div>
        <div>
          <h2 className="text-xl font-medium">No Object Selected</h2>
          <p className="text-neutral-400 text-sm mt-1">Create a new object to start modeling.</p>
        </div>
        <div className="flex gap-2 justify-center w-full max-w-sm mt-4">
          <button 
            onClick={handleCreateObject}
            className="flex-1 bg-neutral-100 hover:bg-white text-neutral-900 font-medium py-2.5 rounded-lg flex justify-center items-center gap-2 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Object
          </button>
          <button 
            onClick={handleCreateTile}
            className="flex-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-medium py-2.5 rounded-lg flex justify-center items-center gap-2 transition-transform active:scale-95"
          >
            <LayoutGrid className="w-4 h-4" />
            New 8x8 Tile
          </button>
        </div>
      </div>
    );
  }

  const activeFootprintSize = getFootprintSize(activeObj);
  const activeIsAsset = activeObj.model_kind === "asset" && !!activeObj.asset;
  const activeHasMesh = hasMeshModel(activeObj);
  const meshStats = getMeshStats(activeObj);
  const assetStats = activeObj.asset?.stats || null;
  const objectQaWarnings = [
    activeObj.collision?.profile === "none" ? "Collision is disabled." : "",
    activeObj.materials.length > 12 ? "High material count may cost draw calls." : "",
    assetStats && assetStats.bytes > 4_000_000
      ? "Embedded asset is over 4 MB."
      : "",
    assetStats && assetStats.triangles > 50000
      ? "Hero asset is above 50k triangles."
      : "",
  ].filter(Boolean);
  const storedBounds = normalizeVec3(activeObj.bounds);
  const liveMeshBounds = activeObj.mesh
    ? getMeshBoundsInfo(activeObj.mesh)
    : null;
  const originOffset: Vec3 = liveMeshBounds
    ? [liveMeshBounds.center[0], liveMeshBounds.min[1], liveMeshBounds.center[2]]
    : [0, 0, 0];
  const selectedEdge = selectedEdgeId
    ? activeMeshEdges.find((edge) => edge.id === selectedEdgeId) || null
    : null;
  const selectedVertex =
    selectedVertexId !== null ? activeObj.mesh?.vertices[selectedVertexId] : null;
  const selectedFace =
    selectedFaceId !== null ? activeObj.mesh?.faces[selectedFaceId] : null;
  const hasTransformSelection = selectedTransformVertexIds.length > 0;
  const hasNormalSelection = !!selectedNormal && hasTransformSelection;
  const canSnapToVertex =
    !!activeObj.mesh &&
    selectedTransformVertexIds.length > 0 &&
    selectedTransformVertexIds.length < activeObj.mesh.vertices.length;
  const canMergeSelectedVertex =
    !!activeObj.mesh &&
    selectedVertexId !== null &&
    selectedVertexIds.length === 1 &&
    activeObj.mesh.vertices.length > 1;
  const canEditSelectedEdge =
    !!activeObj.mesh && selectedEdgeId !== null && selectedEdgeIds.length === 1;
  const hasGroupSelection = selectedGroupFaceIds.length > 0;
  const selectionKindLabel =
    selectionMode === "vertex"
      ? selectedVertexIds.length === 1
        ? `Vertex ${selectedVertexId}`
        : `${selectedVertexIds.length} vertices`
      : selectionMode === "edge"
        ? selectedEdgeIds.length === 1
          ? `Edge ${selectedEdgeId}`
          : `${selectedEdgeIds.length} edges`
        : selectionMode === "face"
          ? selectedFaceIds.length === 1
            ? `Face ${selectedFaceId}`
            : `${selectedFaceIds.length} faces`
          : "None";
  const selectedLabel =
    selectionMode === "object" && objectSelected
      ? "Object"
      : selectedTransformVertexIds.length > 0
        ? selectionKindLabel
        : "None";
  const currentReferenceView =
    modelerViewMode === "perspective" ? null : modelerViewMode;
  const currentReference = currentReferenceView
    ? referenceByView[currentReferenceView]
    : null;
  const scaleReferenceX = Math.max(
    activeFootprintSize.width / 2 + 1.25,
    (activeObj.bounds?.[0] || 1) / 2 + 1.15,
  );
  const visibleReferenceImages = (activeObj.reference_images || []).filter(
    (reference) =>
      reference.visible &&
      (modelerViewMode === "perspective" || reference.view === modelerViewMode),
  );
  const modelerCamera = getModelerCameraConfig(
    modelerViewMode,
    liveMeshBounds,
    storedBounds,
  );
  const currentMaterial = resolveObjectMaterial(activeObj, currentColor);
  const materialRefs = getObjectMaterialRefs(activeObj);
  const materialBudgetWarnings = getMaterialBudgetWarnings(activeObj);
  const customChemistryMaterials = Object.keys(
    ((gamePackage.settings as Record<string, unknown>)?.chem_materials as
      | Record<string, unknown>
      | undefined) || {},
  );
  const chemistryMaterialIds = Array.from(
    new Set([...customChemistryMaterials, ...Object.keys(CHEM_MATERIALS)]),
  ).sort();
  const selectedDecal =
    (activeObj.decals || []).find((decal) => decal.id === selectedDecalId) ||
    null;

  return (
    <div className="flex flex-col h-full bg-neutral-950 relative overflow-hidden">
      {/* Editor Header */}
      <div className="min-h-14 bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 z-10 shrink-0">
        <select
          className="min-w-0 flex-1 sm:flex-none bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-1 max-w-full sm:max-w-[220px] outline-none text-white"
          value={activeObjId || ""}
          onChange={(e) => setActiveObjId(e.target.value)}
        >
          {gamePackage.object_library.map(o => (
            <option key={o.id} value={o.id}>{o.display_name || o.id}</option>
          ))}
        </select>
        <div className="flex max-w-full items-center gap-1.5 sm:gap-2 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          <button
            aria-label="Undo Model Operation"
            disabled={modelUndoStack.length === 0}
            onClick={undoModelOperation}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            title="Undo model operation"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            aria-label="Redo Model Operation"
            disabled={modelRedoStack.length === 0}
            onClick={redoModelOperation}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            title="Redo model operation"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <input
            ref={modelImportInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={importModelJsonFile}
          />
          <input
            ref={gltfImportInputRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={importGltfFile}
          />
          <button
            aria-label="Import Model JSON"
            onClick={() => modelImportInputRef.current?.click()}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Import model JSON"
          >
            <Upload className="w-4 h-4" />
          </button>
          <select
            aria-label="GLB Import Mode"
            value={gltfImportMode}
            onChange={(event) => setGltfImportMode(event.target.value as GltfImportMode)}
            className="bg-neutral-800 border border-neutral-700 text-xs rounded-md px-2 py-2 text-neutral-200 outline-none"
            title="GLB import mode"
          >
            <option value="asset">Preserve</option>
            <option value="mesh">Editable</option>
          </select>
          <button
            aria-label="Import GLB Or GLTF"
            onClick={() => gltfImportInputRef.current?.click()}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Import GLB/GLTF"
          >
            <Network className="w-4 h-4" />
          </button>
          <button
            aria-label="Export Model JSON"
            onClick={exportActiveModelJson}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Export model JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            aria-label="Export GLB"
            onClick={() => exportActiveModelGltf(true)}
            className="px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Export GLB"
          >
            GLB
          </button>
          <button
            aria-label="Export GLTF"
            onClick={() => exportActiveModelGltf(false)}
            className="px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Export GLTF"
          >
            GLTF
          </button>
          <button onClick={() => setShowAIModal(true)} className="p-2 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors flex items-center gap-1.5 px-3">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Generate</span>
          </button>
          <button 
            onClick={handleCreateObject}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Create Object"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button 
            onClick={handleCreateTile}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Create 8x8 Tile"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* 3D Preview Canvas */}
        <div className="flex-1 relative bg-neutral-950 min-h-[280px] shrink-0 basis-[52%] md:min-h-0 md:basis-auto">
          <Canvas
            key={modelerViewMode}
            orthographic={modelerCamera.orthographic}
            camera={modelerCamera.camera}
          >
            <color attach="background" args={["#111111"]} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
            <pointLight position={[-5, 5, -5]} intensity={0.4} color="#88C0D0" />
            <FootprintOverlay object={activeObj} />
            <ScaleReference x={scaleReferenceX} />
            {visibleReferenceImages.map((reference) => (
              <ReferenceImagePlane
                key={reference.id}
                reference={reference}
                liveBounds={liveMeshBounds}
                storedBounds={storedBounds}
              />
            ))}
            {liveMeshBounds && (
              <BoundsOriginPreview
                object={activeObj}
                liveBounds={liveMeshBounds}
              />
            )}
            
            {activeIsAsset ? (
              <AssetModelRenderer
                object={activeObj}
                objectSelected={objectSelected}
                selectable={selectionMode === "object"}
                showBounds
                onObjectClick={handleObjectSelect}
              />
            ) : activeHasMesh && activeObj.mesh ? (
              <MeshModelRenderer
                object={activeObj}
                mesh={activeObj.mesh}
                selectionMode={selectionMode}
                objectSelected={objectSelected}
                selectedVertexIds={selectedVertexIds}
                selectedEdgeIds={selectedEdgeIds}
                selectedFaceIds={selectedFaceIds}
                onObjectClick={handleObjectSelect}
                onVertexClick={handleVertexSelect}
                onEdgeClick={handleEdgeSelect}
                onFaceClick={handleFaceSelect}
              />
            ) : (
              <group>
                {activeObj.parts.map((p, i) => (
                  <VoxelRenderer
                    key={i}
                    part={p as any}
                    object={activeObj}
                    index={i}
                    onClick={handlePointerDown}
                  />
                ))}
              </group>
            )}
            {(activeObj.decals || []).map((decal) => (
              <ObjectDecalRenderer key={decal.id} decal={decal} />
            ))}
            {traceSilhouette &&
              modelerViewMode !== "perspective" &&
              activeHasMesh &&
              activeObj.mesh &&
              liveMeshBounds && (
                <SilhouetteTraceOverlay
                  mesh={activeObj.mesh}
                  view={modelerViewMode}
                  liveBounds={liveMeshBounds}
                />
              )}
            {activeHasMesh && transformCenter && hasTransformSelection && (
              <TransformGizmo
                mode={transformMode}
                center={transformCenter}
                onMove={(direction) =>
                  moveSelection([
                    direction[0] * transformStep,
                    direction[1] * transformStep,
                    direction[2] * transformStep,
                  ])
                }
                onRotate={rotateSelection}
                onScale={scaleSelection}
                onScaleUniform={scaleSelectionUniform}
              />
            )}

            {/* Invisible floor for placing base voxels */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, 0]}
              onClick={(e) => {
                if (!activeHasMesh) handlePointerDown(e, true);
              }}
            >
              <planeGeometry args={[20, 20]} />
              <meshBasicMaterial color="#000000" transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Grid Floor */}
            <gridHelper args={[20, 20, "#434C5E", "#2E3440"]} />
            <OrbitControls 
              target={modelerCamera.target} 
              minDistance={2} 
              maxDistance={20} 
              enableRotate={modelerViewMode === "perspective"}
              makeDefault
            />
          </Canvas>
        </div>

        {/* Sidebar/Bottom for Tools */}
        <div className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-neutral-800 bg-neutral-900 flex flex-col h-[44dvh] min-h-[260px] md:h-full md:min-h-0 z-10 custom-scrollbar overflow-y-auto overscroll-contain">
          <div className="p-3 sm:p-4 space-y-5 sm:space-y-6 flex-1">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Display Name</label>
                <input 
	                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
	                  value={activeObj.display_name}
	                  onChange={(e) => commitActiveObjectUpdate({ display_name: e.target.value })}
	                />
              </div>

              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="has_collision"
                  className="w-4 h-4 bg-neutral-950 border-neutral-800 rounded checked:bg-neutral-100"
                  checked={activeObj.collision?.profile !== "none"}
                  onChange={(e) => {
                    const profile = e.target.checked
                      ? (activeObj.collision?.footprint?.length || 0) > 1
                        ? "custom_footprint"
                        : "single"
                      : "none";
                    commitActiveObjectUpdate({
                      collision: {
                        profile,
                        footprint: activeObj.collision?.footprint || [[0, 0]],
                      },
                    });
                  }}
                />
                <label htmlFor="has_collision" className="text-sm font-medium text-neutral-300">
                  Has Collision (Blocks Player)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Footprint W</label>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                    value={activeFootprintSize.width}
                    onChange={(e) =>
                      updateRectFootprint(
                        Number(e.target.value),
                        activeFootprintSize.depth,
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Footprint D</label>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                    value={activeFootprintSize.depth}
                    onChange={(e) =>
                      updateRectFootprint(
                        activeFootprintSize.width,
                        Number(e.target.value),
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-1 border-t border-neutral-800 pt-4">
                <label className="text-xs text-neutral-500 font-medium uppercase tracking-wider">
                  Chemistry Material
                </label>
                <select
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                  value={activeObj.chem_material_id || ""}
                  onChange={(event) =>
                    commitActiveObjectUpdate({
                      chem_material_id: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">Auto (infer from object)</option>
                  {chemistryMaterialIds.map((materialId) => (
                    <option key={materialId} value={materialId}>
                      {materialId}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Tools</h3>
              <div className="flex gap-2 text-sm font-medium">
                <button 
                  onClick={() => setCurrentTool("add")} 
                  className={`p-2 rounded-lg flex-1 flex flex-col items-center gap-1 transition-colors ${currentTool === "add" ? "bg-neutral-100 text-neutral-900 shadow-sm" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
                <button 
                  onClick={() => setCurrentTool("remove")} 
                  className={`p-2 rounded-lg flex-1 flex flex-col items-center gap-1 transition-colors ${currentTool === "remove" ? "bg-neutral-100 text-neutral-900 shadow-sm" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}
                >
                  <Eraser className="w-4 h-4" />
                  Remove
                </button>
                <button 
                  onClick={() => setCurrentTool("paint")} 
                  className={`p-2 rounded-lg flex-1 flex flex-col items-center gap-1 transition-colors ${currentTool === "paint" ? "bg-neutral-100 text-neutral-900 shadow-sm" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}
                >
                  <PaintBucket className="w-4 h-4" />
                  Paint
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Procedural Starters</h3>
              <div className="grid grid-cols-2 gap-2">
                {PROCEDURAL_STARTERS.map((starter) => (
                  <button
                    key={starter.kind}
                    aria-label={`Create ${starter.label} Starter`}
                    onClick={() => handleCreateProceduralStarter(starter.kind)}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-2 text-left text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="truncate">{starter.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Modeling Generators</h3>
              <div className="grid grid-cols-2 gap-2">
                {MODELING_GENERATORS.map((generator) => (
                  <button
                    key={generator.kind}
                    aria-label={`Create ${generator.label}`}
                    onClick={() => handleCreateGeneratedModel(generator.kind)}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-2 text-left text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <BoxIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="truncate">{generator.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Kitbash Library</h3>
              <div className="grid grid-cols-2 gap-2">
                {KITBASH_GENERATORS.map((generator) => (
                  <button
                    key={generator.kind}
                    aria-label={`Create ${generator.label} Kitbash`}
                    onClick={() => handleCreateKitbashModel(generator.kind)}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-2 text-left text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <Hammer className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="truncate">{generator.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-neutral-300">Mesh</h3>
                <button
                  disabled={activeIsAsset}
                  onClick={convertActiveObjectToMesh}
                  className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors flex items-center gap-1 text-xs disabled:opacity-35 disabled:hover:bg-neutral-800 disabled:hover:text-neutral-300"
                  title={activeIsAsset ? "Use GLB import mode Editable to convert assets" : "Convert parts to editable mesh"}
                >
                  <Network className="w-3.5 h-3.5" />
                  {activeIsAsset ? "Asset" : activeHasMesh ? "Rebuild" : "Make Mesh"}
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1 rounded-md bg-neutral-950 border border-neutral-800 p-1">
                {[
                  { id: "object", label: "Object", icon: BoxIcon },
                  { id: "part", label: "Part", icon: MousePointer2 },
                  { id: "vertex", label: "Vertex", icon: CircleDot },
                  { id: "edge", label: "Edge", icon: GitBranch },
                  { id: "face", label: "Face", icon: Square },
                ].map((option) => {
                  const Icon = option.icon;
                  const disabled =
                    ["vertex", "edge", "face"].includes(option.id) && !activeHasMesh;
                  return (
                    <button
                      key={option.id}
                      disabled={disabled}
                      aria-label={`Select ${option.label}`}
                      onClick={() =>
                        changeSelectionMode(option.id as ModelSelectionMode)
                      }
                      className={`min-h-9 px-1 sm:px-2 py-1.5 rounded text-xs flex items-center justify-center gap-1 sm:gap-1.5 transition-colors ${
                        selectionMode === option.id
                          ? "bg-neutral-100 text-neutral-950"
                          : "text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <MeshMetric
                  label="Kind"
                  value={activeIsAsset ? "asset" : activeHasMesh ? "mesh" : "parts"}
                />
                <MeshMetric label="Verts" value={meshStats.vertices} />
                <MeshMetric label="Faces" value={meshStats.faces} />
                <MeshMetric label="Groups" value={meshStats.groups} />
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  <MeshMetric
                    label="Stored Bounds"
                    value={formatVec(storedBounds, " x ")}
                  />
                  <MeshMetric
                    label="Live Bounds"
                    value={
                      liveMeshBounds
                        ? formatVec(liveMeshBounds.size, " x ")
                        : formatVec(storedBounds, " x ")
                    }
                  />
                  <MeshMetric
                    label="Origin Offset"
                    value={formatVec(originOffset, ", ")}
                  />
                </div>
                <button
                  aria-label="Sync Bounds And Origin"
                  disabled={!activeHasMesh}
                  onClick={syncBoundsAndOrigin}
                  className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-2"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Sync Bounds/Origin
                </button>
              </div>

              {activeIsAsset && activeObj.asset && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-neutral-300">Asset QA</h4>
                    <span className="rounded bg-neutral-900 px-2 py-0.5 text-neutral-400">
                      {activeObj.asset.source_type.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MeshMetric label="Triangles" value={activeObj.asset.stats.triangles} />
                    <MeshMetric label="Textures" value={activeObj.asset.stats.textures} />
                    <MeshMetric label="Materials" value={activeObj.asset.stats.materials} />
                    <MeshMetric
                      label="Size KB"
                      value={Math.round(activeObj.asset.stats.bytes / 1024)}
                    />
                  </div>
                  <TransformNumberInput
                    label="Uniform Scale"
                    value={normalizeVec3(activeObj.asset.scale)[0] || 1}
                    min={0.01}
                    max={8}
                    step={0.01}
                    onChange={(value) =>
                      updateActiveAsset({ scale: [value, value, value] }, true)
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {(["X", "Y", "Z"] as const).map((axis, index) => (
                      <TransformNumberInput
                        key={axis}
                        label={`Off ${axis}`}
                        value={normalizeVec3(activeObj.asset?.offset)[index]}
                        min={-10}
                        max={10}
                        step={0.01}
                        onChange={(value) => {
                          const offset = normalizeVec3(activeObj.asset?.offset);
                          offset[index] = value;
                          updateActiveAsset({ offset });
                        }}
                      />
                    ))}
                  </div>
                  <TransformNumberInput
                    label="Yaw"
                    value={normalizeVec3(activeObj.asset.rotation)[1]}
                    min={-Math.PI}
                    max={Math.PI}
                    step={0.01}
                    onChange={(value) => {
                      const rotation = normalizeVec3(activeObj.asset?.rotation);
                      rotation[1] = value;
                      updateActiveAsset({ rotation });
                    }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      aria-label="Fit Asset To Tile"
                      onClick={fitAssetToTile}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 transition-colors"
                    >
                      Fit Tile
                    </button>
                    <button
                      aria-label="Center Asset Origin"
                      onClick={centerAssetOrigin}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 transition-colors"
                    >
                      Center
                    </button>
                    <button
                      aria-label="Generate Collision Footprint"
                      onClick={generateCollisionFootprint}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 transition-colors"
                    >
                      Collision
                    </button>
                  </div>
                  {objectQaWarnings.length > 0 && (
                    <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
                      {objectQaWarnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeHasMesh && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-500">Selected</span>
                    <span className="font-medium text-neutral-200">
                      {selectedLabel}
                    </span>
                  </div>
                  {selectionMode === "object" && objectSelected && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-500">Vertices</span>
                      <span className="font-mono text-neutral-300">
                        {selectedTransformVertexIds.length}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-500">Group Faces</span>
                      <span className="font-mono text-neutral-300">
                        {selectedGroupFaceIds.length}
                      </span>
                    </div>
                    <input
                      aria-label="Group Name"
                      value={groupName}
                      onChange={(event) => setGroupName(event.target.value)}
                      className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-200 outline-none focus:border-neutral-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        aria-label="Group Selection"
                        disabled={!hasGroupSelection}
                        onClick={groupSelection}
                        className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Network className="w-3.5 h-3.5" />
                        Group
                      </button>
                      <button
                        aria-label="Ungroup Selection"
                        disabled={!hasGroupSelection}
                        onClick={ungroupSelection}
                        className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        Ungroup
                      </button>
                    </div>
                  </div>
                  {selectedVertex && (
                    <div className="space-y-2">
                      <div className="font-mono text-neutral-400">
                        [
                        {selectedVertex
                          .map((value) => Number(value).toFixed(2))
                          .join(", ")}
                        ]
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          aria-label="Merge Vertex To Nearest"
                          disabled={!canMergeSelectedVertex}
                          onClick={mergeSelectedVertexToNearest}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <CircleDot className="w-3.5 h-3.5" />
                          Merge
                        </button>
                        <button
                          aria-label="Delete Vertex"
                          onClick={deleteSelectedVertex}
                          className="rounded-md bg-red-500/10 border border-red-500/30 px-2 py-1.5 text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedEdge && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-neutral-500">Vertices</span>
                        <span className="font-mono text-neutral-300">
                          {selectedEdge.vertices.join(", ")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-neutral-500">Faces</span>
                        <span className="font-mono text-neutral-300">
                          {selectedEdge.faces.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          aria-label="Merge Edge"
                          disabled={!canEditSelectedEdge}
                          onClick={mergeSelectedEdge}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          Merge
                        </button>
                        <button
                          aria-label="Delete Edge"
                          disabled={!canEditSelectedEdge}
                          onClick={deleteSelectedEdge}
                          className="rounded-md bg-red-500/10 border border-red-500/30 px-2 py-1.5 text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          aria-label="Bevel Edge"
                          disabled={!canEditSelectedEdge}
                          onClick={bevelSelectedEdge}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Network className="w-3.5 h-3.5" />
                          Bevel
                        </button>
                        <button
                          aria-label="Split Edge"
                          disabled={!canEditSelectedEdge}
                          onClick={splitSelectedEdge}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          Split
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <TransformNumberInput
                          label="Bevel"
                          value={bevelAmount}
                          min={0.005}
                          max={0.5}
                          step={0.005}
                          onChange={setBevelAmount}
                        />
                      </div>
                    </div>
                  )}
                  {selectedFace && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-neutral-500">Material</span>
                        <span className="font-mono text-neutral-300">
                          {selectedFace.material || "default"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-neutral-500">Group</span>
                        <span className="font-mono text-neutral-300">
                          {selectedFace.group || "none"}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          selectedFaceIds.length > 0 &&
                          updateMeshFacesMaterial(selectedFaceIds, currentColor)
                        }
                        className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-1.5 transition-colors"
                      >
                        Apply Material
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          aria-label="Extrude Face"
                          onClick={() => extrudeSelectedFace(1)}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Extrude+
                        </button>
                        <button
                          aria-label="Inset Face"
                          onClick={insetSelectedFace}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Inset
                        </button>
                        <button
                          aria-label="Extrude Face Inward"
                          onClick={() => extrudeSelectedFace(-1)}
                          className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 rotate-45" />
                          Extrude-
                        </button>
                        <button
                          aria-label="Delete Face"
                          onClick={deleteSelectedFace}
                          className="rounded-md bg-red-500/10 border border-red-500/30 px-2 py-1.5 text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                      <TransformNumberInput
                        label="Inset"
                        value={insetRatio}
                        min={0.01}
                        max={0.9}
                        step={0.01}
                        onChange={setInsetRatio}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeHasMesh && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-3">
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-neutral-900 border border-neutral-800 p-1">
                    {[
                      { id: "move", label: "Move", icon: Move3d },
                      { id: "rotate", label: "Rotate", icon: RotateCw },
                      { id: "scale", label: "Scale", icon: Scale3d },
                    ].map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.id}
                          aria-label={`${option.label} mode`}
                          onClick={() => setTransformMode(option.id as TransformMode)}
                          className={`min-h-9 px-1 sm:px-2 py-1.5 rounded text-xs flex items-center justify-center gap-1 sm:gap-1.5 transition-colors ${
                            transformMode === option.id
                              ? "bg-neutral-100 text-neutral-950"
                              : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <TransformNumberInput
                      label="Grid"
                      value={transformStep}
                      min={0.01}
                      max={2}
                      step={0.01}
                      onChange={setTransformStep}
                    />
                    <TransformNumberInput
                      label="Angle"
                      value={rotationStepDeg}
                      min={1}
                      max={180}
                      step={1}
                      onChange={setRotationStepDeg}
                    />
                    <TransformNumberInput
                      label="Scale"
                      value={scaleStep}
                      min={0.01}
                      max={0.9}
                      step={0.01}
                      onChange={setScaleStep}
                    />
                  </div>

                  <button
                    disabled={!hasTransformSelection}
                    onClick={snapSelectionToGrid}
                    className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-2"
                  >
                    <Magnet className="w-3.5 h-3.5" />
                    Snap Selected
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      aria-label="Snap To Vertex"
                      disabled={!canSnapToVertex}
                      onClick={snapSelectionToVertex}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CircleDot className="w-3.5 h-3.5" />
                      Vertex
                    </button>
                    <button
                      aria-label="Snap To Tile Origin"
                      disabled={!activeHasMesh}
                      onClick={snapObjectToTileOrigin}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Origin
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      aria-label="Duplicate Selection"
                      disabled={!hasTransformSelection}
                      onClick={duplicateSelection}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Dup
                    </button>
                    <button
                      aria-label="Mirror Selection X"
                      disabled={!hasTransformSelection}
                      onClick={() => mirrorSelection("x")}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FlipHorizontal2 className="w-3.5 h-3.5" />
                      X
                    </button>
                    <button
                      aria-label="Mirror Selection Z"
                      disabled={!hasTransformSelection}
                      onClick={() => mirrorSelection("z")}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FlipVertical2 className="w-3.5 h-3.5" />
                      Z
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      aria-label="Mirror Copy Selection X"
                      disabled={!hasTransformSelection}
                      onClick={() => mirrorCopySelection("x")}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy X
                    </button>
                    <button
                      aria-label="Mirror Copy Selection Z"
                      disabled={!hasTransformSelection}
                      onClick={() => mirrorCopySelection("z")}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Z
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      aria-label="Push Pull Normal In"
                      disabled={!hasNormalSelection}
                      onClick={() => pushPullSelectionAlongNormal(-1)}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Move3d className="w-3.5 h-3.5" />
                      N-
                    </button>
                    <button
                      aria-label="Recalculate Normals"
                      disabled={!activeHasMesh}
                      onClick={recalculateActiveMeshNormals}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Network className="w-3.5 h-3.5" />
                      Fix
                    </button>
                    <button
                      aria-label="Push Pull Normal Out"
                      disabled={!hasNormalSelection}
                      onClick={() => pushPullSelectionAlongNormal(1)}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Move3d className="w-3.5 h-3.5" />
                      N+
                    </button>
                  </div>

                  {transformMode === "move" && (
                    <div className="grid grid-cols-3 gap-2">
                      <TransformButton
                        label="X-"
                        color="#BF616A"
                        disabled={!hasTransformSelection}
                        onClick={() => moveSelection([-transformStep, 0, 0])}
                      />
                      <TransformButton
                        label="Y-"
                        color="#A3BE8C"
                        disabled={!hasTransformSelection}
                        onClick={() => moveSelection([0, -transformStep, 0])}
                      />
                      <TransformButton
                        label="Z-"
                        color="#88C0D0"
                        disabled={!hasTransformSelection}
                        onClick={() => moveSelection([0, 0, -transformStep])}
                      />
                      <TransformButton
                        label="X+"
                        color="#BF616A"
                        disabled={!hasTransformSelection}
                        onClick={() => moveSelection([transformStep, 0, 0])}
                      />
                      <TransformButton
                        label="Y+"
                        color="#A3BE8C"
                        disabled={!hasTransformSelection}
                        onClick={() => moveSelection([0, transformStep, 0])}
                      />
                      <TransformButton
                        label="Z+"
                        color="#88C0D0"
                        disabled={!hasTransformSelection}
                        onClick={() => moveSelection([0, 0, transformStep])}
                      />
                    </div>
                  )}

                  {transformMode === "rotate" && (
                    <div className="grid grid-cols-3 gap-2">
                      <TransformButton
                        label="X-"
                        color="#BF616A"
                        disabled={!hasTransformSelection}
                        onClick={() => rotateSelection([1, 0, 0], -1)}
                      />
                      <TransformButton
                        label="Y-"
                        color="#A3BE8C"
                        disabled={!hasTransformSelection}
                        onClick={() => rotateSelection([0, 1, 0], -1)}
                      />
                      <TransformButton
                        label="Z-"
                        color="#88C0D0"
                        disabled={!hasTransformSelection}
                        onClick={() => rotateSelection([0, 0, 1], -1)}
                      />
                      <TransformButton
                        label="X+"
                        color="#BF616A"
                        disabled={!hasTransformSelection}
                        onClick={() => rotateSelection([1, 0, 0], 1)}
                      />
                      <TransformButton
                        label="Y+"
                        color="#A3BE8C"
                        disabled={!hasTransformSelection}
                        onClick={() => rotateSelection([0, 1, 0], 1)}
                      />
                      <TransformButton
                        label="Z+"
                        color="#88C0D0"
                        disabled={!hasTransformSelection}
                        onClick={() => rotateSelection([0, 0, 1], 1)}
                      />
                    </div>
                  )}

                  {transformMode === "scale" && (
                    <div className="grid grid-cols-3 gap-2">
                      <TransformButton
                        label="X-"
                        color="#BF616A"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelection([1, 0, 0], -1)}
                      />
                      <TransformButton
                        label="Y-"
                        color="#A3BE8C"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelection([0, 1, 0], -1)}
                      />
                      <TransformButton
                        label="Z-"
                        color="#88C0D0"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelection([0, 0, 1], -1)}
                      />
                      <TransformButton
                        label="X+"
                        color="#BF616A"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelection([1, 0, 0], 1)}
                      />
                      <TransformButton
                        label="Y+"
                        color="#A3BE8C"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelection([0, 1, 0], 1)}
                      />
                      <TransformButton
                        label="Z+"
                        color="#88C0D0"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelection([0, 0, 1], 1)}
                      />
                      <TransformButton
                        label="All-"
                        color="#F3B341"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelectionUniform(-1)}
                      />
                      <div />
                      <TransformButton
                        label="All+"
                        color="#F3B341"
                        disabled={!hasTransformSelection}
                        onClick={() => scaleSelectionUniform(1)}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeHasMesh && (
                <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-neutral-300">Sculpt</h3>
                    <button
                      aria-label="Simplify Selection"
                      disabled={!hasTransformSelection}
                      onClick={simplifySelection}
                      className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900 transition-colors flex items-center gap-1.5"
                    >
                      <Network className="w-3.5 h-3.5" />
                      Remesh
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: "grab", label: "Grab", icon: Move3d },
                      { id: "smooth", label: "Smooth", icon: Network },
                      { id: "inflate", label: "Inflate", icon: Plus },
                      { id: "pinch", label: "Pinch", icon: Magnet },
                      { id: "flatten", label: "Flatten", icon: Square },
                      { id: "noise", label: "Noise", icon: Sparkles },
                    ] as { id: SculptTool; label: string; icon: typeof Move3d }[]).map(
                      (option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.id}
                            aria-label={`${option.label} Sculpt`}
                            disabled={!hasTransformSelection}
                            onClick={() => applySculptTool(option.id)}
                            className={`min-h-9 rounded-md border px-2 py-1.5 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-35 disabled:hover:bg-neutral-900 ${
                              sculptTool === option.id
                                ? "bg-neutral-100 border-neutral-100 text-neutral-950"
                                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {option.label}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <TransformNumberInput
                      label="Radius"
                      value={sculptRadius}
                      min={0.01}
                      max={4}
                      step={0.01}
                      onChange={setSculptRadius}
                    />
                    <TransformNumberInput
                      label="Strength"
                      value={sculptStrength}
                      min={0.001}
                      max={0.5}
                      step={0.001}
                      onChange={setSculptStrength}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-md bg-neutral-900 border border-neutral-800 p-1">
                    {([
                      { id: "smooth", label: "Soft" },
                      { id: "linear", label: "Linear" },
                      { id: "constant", label: "Hard" },
                    ] as { id: SculptFalloff; label: string }[]).map((option) => (
                      <button
                        key={option.id}
                        aria-label={`Sculpt Falloff ${option.label}`}
                        onClick={() => setSculptFalloff(option.id)}
                        className={`px-2 py-1.5 rounded text-xs transition-colors ${
                          sculptFalloff === option.id
                            ? "bg-neutral-100 text-neutral-950"
                            : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
                    <span>X Symmetry</span>
                    <input
                      type="checkbox"
                      checked={sculptSymmetryX}
                      onChange={(event) => setSculptSymmetryX(event.target.checked)}
                      className="w-4 h-4 bg-neutral-950 border-neutral-800 rounded checked:bg-neutral-100"
                    />
                  </label>
                </div>
              )}

              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-neutral-300">Materials & Decals</h3>
                  <span
                    className={`rounded px-2 py-0.5 ${
                      materialBudgetWarnings.length
                        ? "bg-amber-500/10 text-amber-300"
                        : "bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {materialBudgetWarnings.length ? "Budget" : "Clean"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MeshMetric label="Refs" value={materialRefs.length} />
                  <MeshMetric
                    label="Glow"
                    value={
                      (activeObj.material_settings || []).filter(
                        (material) => Number(material.emissive_intensity || 0) > 0,
                      ).length
                    }
                  />
                  <MeshMetric label="Decals" value={activeObj.decals?.length || 0} />
                </div>

                {materialBudgetWarnings.length > 0 && (
                  <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
                    {materialBudgetWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                    <label className="space-y-1 min-w-0">
                      <span className="text-neutral-500">Material</span>
                      <select
                        aria-label="Current Material"
                        value={currentColor}
                        onChange={(event) => setCurrentColor(event.target.value)}
                        className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-neutral-200 outline-none"
                      >
                        {materialRefs.map((materialRef) => (
                          <option key={materialRef} value={materialRef}>
                            {resolveObjectMaterial(activeObj, materialRef).name}
                          </option>
                        ))}
                        {!materialRefs.includes(currentColor) && (
                          <option value={currentColor}>{currentMaterial.name}</option>
                        )}
                      </select>
                    </label>
                    <input
                      aria-label="Material Color"
                      type="color"
                      value={currentMaterial.color}
                      onChange={(event) =>
                        updateCurrentMaterialSetting({ color: event.target.value })
                      }
                      className="h-9 w-10 rounded border border-neutral-800 bg-neutral-950 p-1"
                    />
                  </div>

                  <label className="space-y-1 block">
                    <span className="text-neutral-500">Texture</span>
                    <select
                      aria-label="Material Texture"
                      value={currentMaterial.textureKind}
                      onChange={(event) =>
                        updateCurrentMaterialSetting({
                          texture_kind: event.target
                            .value as ObjectMaterialData["texture_kind"],
                        })
                      }
                      className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-neutral-200 outline-none"
                    >
                      {MATERIAL_TEXTURE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5">
                      <span>Emissive</span>
                      <input
                        aria-label="Material Emissive"
                        type="checkbox"
                        checked={currentMaterial.emissiveIntensity > 0}
                        onChange={(event) =>
                          updateCurrentMaterialSetting(
                            event.target.checked
                              ? {
                                  emissive: currentMaterial.color,
                                  emissive_intensity: Math.max(
                                    0.65,
                                    currentMaterial.emissiveIntensity,
                                  ),
                                }
                              : { emissive: "#000000", emissive_intensity: 0 },
                          )
                        }
                        className="w-4 h-4 bg-neutral-950 border-neutral-800 rounded checked:bg-neutral-100"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5">
                      <span>Transparent</span>
                      <input
                        aria-label="Material Transparent"
                        type="checkbox"
                        checked={currentMaterial.transparent}
                        onChange={(event) =>
                          updateCurrentMaterialSetting(
                            event.target.checked
                              ? {
                                  transparent: true,
                                  opacity: Math.min(currentMaterial.opacity, 0.65),
                                }
                              : { transparent: false, opacity: 1 },
                          )
                        }
                        className="w-4 h-4 bg-neutral-950 border-neutral-800 rounded checked:bg-neutral-100"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <TransformNumberInput
                      label="Opacity"
                      value={currentMaterial.opacity}
                      min={0.05}
                      max={1}
                      step={0.05}
                      onChange={(value) =>
                        updateCurrentMaterialSetting({
                          opacity: value,
                          transparent: value < 1,
                        })
                      }
                    />
                    <TransformNumberInput
                      label="Glow"
                      value={currentMaterial.emissiveIntensity}
                      min={0}
                      max={3}
                      step={0.05}
                      onChange={(value) =>
                        updateCurrentMaterialSetting({
                          emissive:
                            value > 0 ? currentMaterial.color : "#000000",
                          emissive_intensity: value,
                        })
                      }
                    />
                    <TransformNumberInput
                      label="Rough"
                      value={currentMaterial.roughness}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) =>
                        updateCurrentMaterialSetting({ roughness: value })
                      }
                    />
                    <TransformNumberInput
                      label="Metal"
                      value={currentMaterial.metalness}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) =>
                        updateCurrentMaterialSetting({ metalness: value })
                      }
                    />
                    <TransformNumberInput
                      label="Tex Scale"
                      value={currentMaterial.textureScale}
                      min={0.25}
                      max={6}
                      step={0.25}
                      onChange={(value) =>
                        updateCurrentMaterialSetting({ texture_scale: value })
                      }
                    />
                    <TransformNumberInput
                      label="Tex Strength"
                      value={currentMaterial.textureStrength}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) =>
                        updateCurrentMaterialSetting({ texture_strength: value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-2">
                  <div className="grid grid-cols-3 gap-1">
                    {(Object.entries(DECAL_KIND_PRESETS) as [
                      DecalKind,
                      (typeof DECAL_KIND_PRESETS)[DecalKind],
                    ][]).map(([kind, preset]) => (
                      <button
                        key={kind}
                        aria-label={`Use ${preset.label} Decal`}
                        onClick={() => setDecalKind(kind)}
                        className={`rounded border px-2 py-1.5 transition-colors ${
                          decalKind === kind
                            ? "bg-neutral-100 border-neutral-100 text-neutral-950"
                            : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <button
                    aria-label="Add Decal"
                    onClick={addDecalToSelection}
                    className="w-full rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-1.5 transition-colors flex items-center justify-center gap-2"
                  >
                    <PaintBucket className="w-3.5 h-3.5" />
                    Add Decal
                  </button>
                  <button
                    aria-label="Stamp Relief Detail"
                    onClick={addDecalToSelection}
                    className="w-full rounded-md bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 py-1.5 transition-colors flex items-center justify-center gap-2"
                    title="Stamp the selected blood, crack, vein, inscription, or glow detail onto the current face/object"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Stamp Relief
                  </button>

                  {(activeObj.decals || []).length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {(activeObj.decals || []).map((decal) => (
                        <button
                          key={decal.id}
                          aria-label={`Select Decal ${decal.name || decal.id}`}
                          onClick={() => setSelectedDecalId(decal.id)}
                          className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
                            selectedDecalId === decal.id
                              ? "border-white bg-neutral-800 text-white"
                              : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600"
                          }`}
                        >
                          <span
                            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: decal.color }}
                          />
                          {DECAL_KIND_PRESETS[decal.kind].label}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedDecal && (
                    <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-950 p-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                        <label className="space-y-1 min-w-0">
                          <span className="text-neutral-500">Selected</span>
                          <input
                            aria-label="Decal Name"
                            value={selectedDecal.name || ""}
                            onChange={(event) =>
                              updateSelectedDecal({ name: event.target.value })
                            }
                            className="w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-neutral-200 outline-none"
                          />
                        </label>
                        <input
                          aria-label="Decal Color"
                          type="color"
                          value={selectedDecal.color}
                          onChange={(event) =>
                            updateSelectedDecal({ color: event.target.value })
                          }
                          className="h-8 w-10 rounded border border-neutral-800 bg-neutral-950 p-1"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <TransformNumberInput
                          label="Opacity"
                          value={selectedDecal.opacity}
                          min={0.05}
                          max={1}
                          step={0.05}
                          onChange={(value) =>
                            updateSelectedDecal({ opacity: value })
                          }
                        />
                        <TransformNumberInput
                          label="W"
                          value={selectedDecal.size[0]}
                          min={0.03}
                          max={4}
                          step={0.01}
                          onChange={(value) =>
                            updateSelectedDecal({
                              size: [value, selectedDecal.size[1]],
                            })
                          }
                        />
                        <TransformNumberInput
                          label="H"
                          value={selectedDecal.size[1]}
                          min={0.03}
                          max={4}
                          step={0.01}
                          onChange={(value) =>
                            updateSelectedDecal({
                              size: [selectedDecal.size[0], value],
                            })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(["X", "Y", "Z"] as const).map((axis, index) => (
                          <TransformNumberInput
                            key={axis}
                            label={axis}
                            value={normalizeVec3(selectedDecal.position)[index]}
                            min={-8}
                            max={8}
                            step={0.01}
                            onChange={(value) => {
                              const position = normalizeVec3(selectedDecal.position);
                              position[index] = value;
                              updateSelectedDecal({ position });
                            }}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
                          <span>Glow</span>
                          <input
                            aria-label="Decal Emissive"
                            type="checkbox"
                            checked={selectedDecal.emissive}
                            onChange={(event) =>
                              updateSelectedDecal({
                                emissive: event.target.checked,
                              })
                            }
                            className="w-4 h-4 bg-neutral-950 border-neutral-800 rounded checked:bg-neutral-100"
                          />
                        </label>
                        <button
                          aria-label="Delete Decal"
                          onClick={deleteSelectedDecal}
                          className="rounded-md bg-red-500/10 border border-red-500/30 px-2 py-1.5 text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-neutral-300">References</h3>
                  <button
                    aria-label="Toggle Silhouette Trace"
                    disabled={modelerViewMode === "perspective"}
                    onClick={() => setTraceSilhouette((value) => !value)}
                    className={`rounded-md border px-2 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-35 disabled:hover:bg-neutral-900 ${
                      traceSilhouette && modelerViewMode !== "perspective"
                        ? "bg-neutral-100 border-neutral-100 text-neutral-950"
                        : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Trace
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1 rounded-md bg-neutral-900 border border-neutral-800 p-1">
                  {([
                    { id: "perspective", label: "Persp" },
                    { id: "front", label: "Front" },
                    { id: "side", label: "Side" },
                    { id: "top", label: "Top" },
                  ] as { id: ModelerViewMode; label: string }[]).map((option) => (
                    <button
                      key={option.id}
                      aria-label={`${option.label} View`}
                      onClick={() => setModelerViewMode(option.id)}
                      className={`px-2 py-1.5 rounded text-xs transition-colors ${
                        modelerViewMode === option.id
                          ? "bg-neutral-100 text-neutral-950"
                          : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {REFERENCE_VIEWS.map((view) => (
                    <div key={view}>
                      <input
                        ref={(node) => {
                          referenceInputRefs.current[view] = node;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => importReferenceImageFile(view, event)}
                      />
                      <button
                        aria-label={`Load ${REFERENCE_VIEW_LABELS[view]} Reference`}
                        onClick={() => referenceInputRefs.current[view]?.click()}
                        className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        {REFERENCE_VIEW_LABELS[view]}
                      </button>
                    </div>
                  ))}
                </div>

                {currentReferenceView && (
                  <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-900 p-2">
                    {currentReference ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-neutral-200 truncate">
                            {currentReference.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              aria-label="Toggle Reference Visibility"
                              onClick={() =>
                                updateReferenceImage(currentReferenceView, {
                                  visible: !currentReference.visible,
                                })
                              }
                              className="rounded bg-neutral-950 border border-neutral-800 p-1.5 text-neutral-300 hover:bg-neutral-800"
                            >
                              {currentReference.visible ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              aria-label={
                                currentReference.locked
                                  ? "Unlock Reference"
                                  : "Lock Reference"
                              }
                              onClick={() =>
                                updateReferenceImage(currentReferenceView, {
                                  locked: !currentReference.locked,
                                })
                              }
                              className="rounded bg-neutral-950 border border-neutral-800 p-1.5 text-neutral-300 hover:bg-neutral-800"
                            >
                              {currentReference.locked ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <label className="space-y-1 block">
                          <span className="text-neutral-500">Opacity</span>
                          <input
                            aria-label="Reference Opacity"
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.05}
                            value={currentReference.opacity}
                            disabled={currentReference.locked}
                            onChange={(event) =>
                              updateReferenceImage(currentReferenceView, {
                                opacity: Number(event.target.value),
                              })
                            }
                            className="w-full accent-neutral-100"
                          />
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {[0.25, 0.5, 0.8].map((opacity) => (
                            <button
                              key={opacity}
                              aria-label={`Set Reference Opacity ${Math.round(opacity * 100)} Percent`}
                              disabled={currentReference.locked}
                              onClick={() =>
                                updateReferenceImage(currentReferenceView, {
                                  opacity,
                                })
                              }
                              className="rounded-md bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-950 transition-colors"
                            >
                              {Math.round(opacity * 100)}%
                            </button>
                          ))}
                          <button
                            aria-label="Scale Reference To Model Height"
                            disabled={currentReference.locked}
                            onClick={() =>
                              updateReferenceImage(currentReferenceView, {
                                scale: Math.max(0.1, storedBounds[1] || 1),
                              })
                            }
                            className="rounded-md bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-950 transition-colors"
                            title="Scale the reference plane to the current model height"
                          >
                            Fit H
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <TransformNumberInput
                            label="Scale"
                            value={currentReference.scale}
                            min={0.1}
                            max={6}
                            step={0.05}
                            disabled={currentReference.locked}
                            onChange={(value) =>
                              updateReferenceImage(currentReferenceView, {
                                scale: value,
                              })
                            }
                          />
                          <button
                            aria-label="Remove Reference"
                            disabled={currentReference.locked}
                            onClick={() => removeReferenceImage(currentReferenceView)}
                            className="self-end rounded-md bg-red-500/10 border border-red-500/30 px-2 py-1.5 text-red-300 hover:bg-red-500/20 disabled:opacity-35 disabled:hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {(["X", "Y", "Z"] as const).map((axis, index) => (
                            <TransformNumberInput
                              key={axis}
                              label={axis}
                              value={normalizeVec3(currentReference.offset)[index]}
                              min={-5}
                              max={5}
                              step={0.01}
                              disabled={currentReference.locked}
                              onChange={(value) => {
	                                const offset = normalizeVec3(currentReference.offset);
                                offset[index] = value;
                                updateReferenceImage(currentReferenceView, { offset });
                              }}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <button
                        aria-label={`Load ${REFERENCE_VIEW_LABELS[currentReferenceView]} Reference`}
                        onClick={() =>
                          referenceInputRefs.current[currentReferenceView]?.click()
                        }
                        className="w-full rounded-md bg-neutral-950 border border-neutral-800 px-2 py-2 text-neutral-300 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Load {REFERENCE_VIEW_LABELS[currentReferenceView]}
                      </button>
                    )}
                  </div>
                )}

                {modelImportError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-300">
                    {modelImportError}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Alderamontico Materials</h3>
              <div className="grid grid-cols-2 gap-2">
                {ALDERAMONTICO_MATERIALS.map((material) => (
                  <button
                    key={material.name}
                    onClick={() => {
                      setCurrentColor(material.color);
                      if (currentTool !== "paint" && currentTool !== "add") {
                        setCurrentTool("paint");
                      }
                    }}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                      currentColor === material.color
                        ? "border-white bg-neutral-800 text-white"
                        : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-neutral-700 shrink-0"
                      style={{ backgroundColor: material.color }}
                    />
                    <span className="truncate">{material.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Palette</h3>
              <div className="grid grid-cols-8 sm:grid-cols-4 gap-2">
                {colors.map(color => (
                  <button
                    key={color}
                    onClick={() => {
                      setCurrentColor(color);
                      if (currentTool !== "paint" && currentTool !== "add") setCurrentTool("paint");
                    }}
                    className={`w-full aspect-square rounded-full border-2 transition-transform active:scale-90 ${currentColor === color ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button 
	                onClick={() => commitActiveObjectUpdate({ parts: [] })}
                className="mt-4 w-full flex justify-center items-center gap-2 py-2 text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg text-sm font-medium transition-colors"
                title="Clear all voxels"
              >
                <Trash2 className="w-4 h-4" />
                Clear Volume
              </button>
            </div>
          </div>
        </div>
      </div>
      {showAIModal && (
        <AIGenerationModal
          title="Generate 3D Object/Tile"
          placeholder="e.g. Generate a wooden barrel or a stone floor tile..."
          schema={{
            type: "OBJECT",
            properties: {
               id: { type: "STRING" },
               display_name: { type: "STRING" },
               category: { type: "STRING" },
               bounds: { type: "ARRAY", items: { type: "NUMBER" } },
               parts: {
                  type: "ARRAY",
                  items: {
                     type: "OBJECT",
                     properties: {
                        shape: { type: "STRING", description: "Must be 'box'" },
                        name: { type: "STRING" },
                        position: { type: "ARRAY", items: { type: "NUMBER" } },
                        size: { type: "ARRAY", items: { type: "NUMBER" } },
                        material: { type: "STRING", description: "Hex color code e.g. #ff0000" }
                     }
                  }
               }
            },
            required: ["id", "display_name", "category", "bounds", "parts"]
          }}
          onGenerate={(data) => {
            const newObj = { ...data };
            if (!newObj.tags) newObj.tags = [];
            if (!newObj.materials) newObj.materials = [];
            if (!newObj.material_settings) {
              newObj.material_settings = newObj.materials.map((material: string) =>
                createDefaultMaterialSetting(material),
              );
            }
            if (!newObj.decals) newObj.decals = [];
            if (!newObj.reference_images) newObj.reference_images = [];
            if (!newObj.collision) newObj.collision = { profile: "single" };
            if (!newObj.origin) newObj.origin = "center_floor";
            if (!newObj.model_kind) newObj.model_kind = "parts";
            newObj.parts = newObj.parts.map((p: any) => ({ ...p, rotation: [0, 0, 0] }));
            addObject(newObj);
            setActiveObjId(newObj.id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}

function TransformNumberInput({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-neutral-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(event) =>
          onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))
        }
        className="w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-right font-mono text-neutral-200 outline-none disabled:opacity-40"
      />
    </label>
  );
}

function TransformButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-neutral-900 border px-2 py-1.5 font-mono font-medium transition-colors hover:bg-neutral-800 disabled:opacity-35 disabled:hover:bg-neutral-900"
      style={{ borderColor: disabled ? "#262626" : color, color }}
    >
      {label}
    </button>
  );
}

function TransformGizmo({
  mode,
  center,
  onMove,
  onRotate,
  onScale,
  onScaleUniform,
}: {
  mode: TransformMode;
  center: [number, number, number];
  onMove: (delta: [number, number, number]) => void;
  onRotate: (axis: Vec3, direction: 1 | -1) => void;
  onScale: (axis: Vec3, direction: 1 | -1) => void;
  onScaleUniform: (direction: 1 | -1) => void;
}) {
  const axes: {
    key: string;
    direction: [number, number, number];
    color: string;
    opacity: number;
  }[] = [
    { key: "x_pos", direction: [1, 0, 0], color: "#BF616A", opacity: 0.95 },
    { key: "x_neg", direction: [-1, 0, 0], color: "#BF616A", opacity: 0.55 },
    { key: "y_pos", direction: [0, 1, 0], color: "#A3BE8C", opacity: 0.95 },
    { key: "y_neg", direction: [0, -1, 0], color: "#A3BE8C", opacity: 0.55 },
    { key: "z_pos", direction: [0, 0, 1], color: "#88C0D0", opacity: 0.95 },
    { key: "z_neg", direction: [0, 0, -1], color: "#88C0D0", opacity: 0.55 },
  ];

  if (mode === "rotate") {
    return (
      <group position={center}>
        <mesh raycast={() => null}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#F3B341" depthTest={false} />
        </mesh>
        <RotationRing
          axis={[1, 0, 0]}
          color="#BF616A"
          onClick={() => onRotate([1, 0, 0], 1)}
        />
        <RotationRing
          axis={[0, 1, 0]}
          color="#A3BE8C"
          onClick={() => onRotate([0, 1, 0], 1)}
        />
        <RotationRing
          axis={[0, 0, 1]}
          color="#88C0D0"
          onClick={() => onRotate([0, 0, 1], 1)}
        />
      </group>
    );
  }

  if (mode === "scale") {
    return (
      <group position={center}>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onScaleUniform(1);
          }}
        >
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshBasicMaterial color="#F3B341" depthTest={false} />
        </mesh>
        {axes.map((axis) => (
          <ScaleHandle
            key={axis.key}
            direction={axis.direction}
            color={axis.color}
            opacity={axis.opacity}
            onClick={() =>
              onScale(axis.direction, axis.key.endsWith("neg") ? -1 : 1)
            }
          />
        ))}
      </group>
    );
  }

  return (
    <group position={center}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshBasicMaterial color="#F3B341" depthTest={false} />
      </mesh>
      {axes.map((axis) => (
        <AxisHandle
          key={axis.key}
          direction={axis.direction}
          color={axis.color}
          opacity={axis.opacity}
          onClick={() =>
            onMove([
              axis.direction[0],
              axis.direction[1],
              axis.direction[2],
            ])
          }
        />
      ))}
    </group>
  );
}

function RotationRing({
  axis,
  color,
  onClick,
}: {
  axis: Vec3;
  color: string;
  onClick: () => void;
}) {
  const transform = useMemo(() => {
    const normal = new THREE.Vector3(...axis).normalize();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
  }, [axis]);

  return (
    <mesh
      quaternion={transform}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <torusGeometry args={[0.62, 0.018, 8, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.68} depthTest={false} />
    </mesh>
  );
}

function ScaleHandle({
  direction,
  color,
  opacity,
  onClick,
}: {
  direction: [number, number, number];
  color: string;
  opacity: number;
  onClick: () => void;
}) {
  const position = useMemo(
    () => new THREE.Vector3(...direction).normalize().multiplyScalar(0.64),
    [direction],
  );

  return (
    <mesh
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <boxGeometry args={[0.12, 0.12, 0.12]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
      />
    </mesh>
  );
}

function AxisHandle({
  direction,
  color,
  opacity,
  onClick,
}: {
  direction: [number, number, number];
  color: string;
  opacity: number;
  onClick: () => void;
}) {
  const transform = useMemo(() => {
    const dir = new THREE.Vector3(...direction).normalize();
    return {
      stemPosition: dir.clone().multiplyScalar(0.36),
      conePosition: dir.clone().multiplyScalar(0.76),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir,
      ),
    };
  }, [direction]);

  const handleClick = (event: any) => {
    event.stopPropagation();
    onClick();
  };

  return (
    <group>
      <mesh
        position={transform.stemPosition}
        quaternion={transform.quaternion}
        onClick={handleClick}
      >
        <cylinderGeometry args={[0.025, 0.025, 0.62, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
        />
      </mesh>
      <mesh
        position={transform.conePosition}
        quaternion={transform.quaternion}
        onClick={handleClick}
      >
        <coneGeometry args={[0.08, 0.18, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

const formatVec = (values: readonly number[], separator: string) =>
  values.map((value) => Number(value || 0).toFixed(2)).join(separator);

const isAdditiveSelectionEvent = (event: any) =>
  Boolean(
    event?.shiftKey ||
      event?.ctrlKey ||
      event?.metaKey ||
      event?.nativeEvent?.shiftKey ||
      event?.nativeEvent?.ctrlKey ||
      event?.nativeEvent?.metaKey,
  );

const toggleSelectionValue = <T,>(values: T[], value: T) =>
  values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];

const normalizeVec3 = (values: unknown): Vec3 => {
  const source = Array.isArray(values) ? values : [];
  return [
    Number(source[0] ?? 0),
    Number(source[1] ?? 0),
    Number(source[2] ?? 0),
  ];
};

const makeFootprintFromBounds = (boundsInput: unknown): [number, number][] => {
  const bounds = normalizeVec3(boundsInput);
  const width = Math.max(1, Math.min(12, Math.ceil(Math.abs(bounds[0] || 1))));
  const depth = Math.max(1, Math.min(12, Math.ceil(Math.abs(bounds[2] || 1))));
  const minX = -Math.floor(width / 2);
  const minZ = -Math.floor(depth / 2);
  const cells: [number, number][] = [];

  for (let x = minX; x < minX + width; x += 1) {
    for (let z = minZ; z < minZ + depth; z += 1) cells.push([x, z]);
  }

  return cells;
};

function BoundsOriginPreview({
  object,
  liveBounds,
}: {
  object: ObjectData;
  liveBounds: MeshBoundsInfo;
}) {
  const storedSize = normalizeVec3(object.bounds).map((value) =>
    Math.max(0.01, Number(value || 0.01)),
  ) as [number, number, number];
  const storedCenter: [number, number, number] = [0, storedSize[1] / 2, 0];
  const originRingY = Math.max(0.018, liveBounds.min[1] + 0.018);

  return (
    <group>
      <lineSegments position={storedCenter} raycast={() => null}>
        <edgesGeometry args={[new THREE.BoxGeometry(...storedSize)]} />
        <lineBasicMaterial
          color="#F3B341"
          transparent
          opacity={0.46}
          depthTest={false}
        />
      </lineSegments>
      <lineSegments position={liveBounds.center} raycast={() => null}>
        <edgesGeometry args={[new THREE.BoxGeometry(...liveBounds.size)]} />
        <lineBasicMaterial
          color="#70E8FF"
          transparent
          opacity={0.58}
          depthTest={false}
        />
      </lineSegments>
      <group position={[0, originRingY, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[0.13, 0.155, 28]} />
          <meshBasicMaterial
            color="#F3B341"
            transparent
            opacity={0.82}
            depthTest={false}
          />
        </mesh>
        <mesh position={[0.12, 0.004, 0]} raycast={() => null}>
          <boxGeometry args={[0.24, 0.012, 0.012]} />
          <meshBasicMaterial color="#BF616A" depthTest={false} />
        </mesh>
        <mesh position={[0, 0.004, 0.12]} raycast={() => null}>
          <boxGeometry args={[0.012, 0.012, 0.24]} />
          <meshBasicMaterial color="#88C0D0" depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

function ReferenceImagePlane({
  reference,
  liveBounds,
  storedBounds,
}: {
  reference: ObjectReferenceImageData;
  liveBounds: MeshBoundsInfo | null;
  storedBounds: Vec3;
}) {
  const texture = useMemo(() => {
    const loadedTexture = new THREE.TextureLoader().load(reference.data_url);
    loadedTexture.colorSpace = THREE.SRGBColorSpace;
    return loadedTexture;
  }, [reference.data_url]);

  useEffect(() => () => texture.dispose(), [texture]);

  const transform = useMemo(() => {
    const size = liveBounds?.size || storedBounds;
    const center = liveBounds?.center || ([0, Math.max(0.5, storedBounds[1] / 2), 0] as Vec3);
    const min = liveBounds?.min || ([
      -storedBounds[0] / 2,
      0,
      -storedBounds[2] / 2,
    ] as Vec3);
    const scale = Math.max(0.05, reference.scale || 1);
    const offset = reference.offset || ([0, 0, 0] as Vec3);

    if (reference.view === "side") {
      return {
        position: [
          min[0] - 0.035 + offset[0],
          center[1] + offset[1],
          center[2] + offset[2],
        ] as Vec3,
        rotation: [0, Math.PI / 2, 0] as Vec3,
        scale: [
          Math.max(0.1, size[2]) * scale,
          Math.max(0.1, size[1]) * scale,
          1,
        ] as Vec3,
      };
    }

    if (reference.view === "top") {
      return {
        position: [
          center[0] + offset[0],
          min[1] - 0.035 + offset[1],
          center[2] + offset[2],
        ] as Vec3,
        rotation: [-Math.PI / 2, 0, 0] as Vec3,
        scale: [
          Math.max(0.1, size[0]) * scale,
          Math.max(0.1, size[2]) * scale,
          1,
        ] as Vec3,
      };
    }

    return {
      position: [
        center[0] + offset[0],
        center[1] + offset[1],
        min[2] - 0.035 + offset[2],
      ] as Vec3,
      rotation: [0, 0, 0] as Vec3,
      scale: [
        Math.max(0.1, size[0]) * scale,
        Math.max(0.1, size[1]) * scale,
        1,
      ] as Vec3,
    };
  }, [liveBounds, reference.offset, reference.scale, reference.view, storedBounds]);

  if (!reference.visible) return null;

  return (
    <mesh
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
      raycast={() => null}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={Math.max(0.05, Math.min(1, reference.opacity))}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SilhouetteTraceOverlay({
  mesh,
  view,
  liveBounds,
}: {
  mesh: NonNullable<ObjectData["mesh"]>;
  view: ReferenceView;
  liveBounds: MeshBoundsInfo;
}) {
  const edgeGeometry = useMemo(() => {
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
  }, [mesh]);

  const guideGeometry = useMemo(() => {
    const { min, max, center } = liveBounds;
    const positions: number[] = [];
    const pushLine = (a: Vec3, b: Vec3) => {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    };

    if (view === "side") {
      const x = max[0] + 0.05;
      pushLine([x, min[1], min[2]], [x, max[1], min[2]]);
      pushLine([x, max[1], min[2]], [x, max[1], max[2]]);
      pushLine([x, max[1], max[2]], [x, min[1], max[2]]);
      pushLine([x, min[1], max[2]], [x, min[1], min[2]]);
      pushLine([x, center[1], min[2]], [x, center[1], max[2]]);
      pushLine([x, min[1], center[2]], [x, max[1], center[2]]);
    } else if (view === "top") {
      const y = max[1] + 0.05;
      pushLine([min[0], y, min[2]], [max[0], y, min[2]]);
      pushLine([max[0], y, min[2]], [max[0], y, max[2]]);
      pushLine([max[0], y, max[2]], [min[0], y, max[2]]);
      pushLine([min[0], y, max[2]], [min[0], y, min[2]]);
      pushLine([center[0], y, min[2]], [center[0], y, max[2]]);
      pushLine([min[0], y, center[2]], [max[0], y, center[2]]);
    } else {
      const z = max[2] + 0.05;
      pushLine([min[0], min[1], z], [max[0], min[1], z]);
      pushLine([max[0], min[1], z], [max[0], max[1], z]);
      pushLine([max[0], max[1], z], [min[0], max[1], z]);
      pushLine([min[0], max[1], z], [min[0], min[1], z]);
      pushLine([center[0], min[1], z], [center[0], max[1], z]);
      pushLine([min[0], center[1], z], [max[0], center[1], z]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return geometry;
  }, [liveBounds, view]);

  useEffect(
    () => () => {
      edgeGeometry.dispose();
      guideGeometry.dispose();
    },
    [edgeGeometry, guideGeometry],
  );

  return (
    <group raycast={() => null}>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial
          color="#F3B341"
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </lineSegments>
      <lineSegments geometry={guideGeometry}>
        <lineBasicMaterial
          color="#70E8FF"
          transparent
          opacity={0.82}
          depthTest={false}
        />
      </lineSegments>
    </group>
  );
}

function MeshMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 min-w-0">
      <div className="text-neutral-500 truncate">{label}</div>
      <div className="font-medium text-neutral-200 truncate">{value}</div>
    </div>
  );
}

function VoxelRenderer({
  part,
  object,
  index,
  onClick,
}: {
  part: ObjectPart;
  object: ObjectData;
  index: number;
  onClick: (e: any, isFloor: boolean, i: number) => void;
}) {
  const material = resolveObjectMaterial(object, part.material);
  const texture = getObjectMaterialTexture(material);
  
  return (
    <mesh 
      position={part.position as [number, number, number]} 
      onClick={(e) => onClick(e, false, index)}
    >
      <boxGeometry args={part.size as [number, number, number]} />
      <meshStandardMaterial
        map={texture || undefined}
        color={material.color}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissive}
        emissiveIntensity={material.emissiveIntensity}
        opacity={material.opacity}
        transparent={material.transparent}
      />
      <lineSegments raycast={() => null}>
        <edgesGeometry args={[new THREE.BoxGeometry(...(part.size as [number, number, number]))]} />
        <lineBasicMaterial color="#E5E9F0" opacity={0.15} transparent />
      </lineSegments>
    </mesh>
  );
}
