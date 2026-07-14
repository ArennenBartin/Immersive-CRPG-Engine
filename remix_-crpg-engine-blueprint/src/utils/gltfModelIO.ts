import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  ObjectAssetData,
  ObjectData,
  ObjectDecalData,
  ObjectMaterialData,
  ObjectMeshData,
} from "../schema/game";
import {
  createMeshFromParts,
  getMeshBounds,
  getMeshBoundsInfo,
  recomputeMeshNormals,
  snapMeshToTileOrigin,
  type Vec3,
} from "./meshModel";
import {
  DECAL_KIND_PRESETS,
  getObjectMaterialTexture,
  getObjectMaterialRefs,
  resolveObjectMaterial,
} from "./objectMaterials";

const makeSafeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";

export type GltfImportMode = "asset" | "mesh";

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

const dataUrlToSource = async (asset: Pick<ObjectAssetData, "data_url" | "source_type">) => {
  const response = await fetch(asset.data_url);
  return asset.source_type === "gltf"
    ? response.text()
    : response.arrayBuffer();
};

export const loadGltfFromAssetDataUrl = async (asset: ObjectAssetData) => {
  const loader = new GLTFLoader();
  const source = await dataUrlToSource(asset);

  return new Promise<Awaited<ReturnType<GLTFLoader["parseAsync"]>>>(
    (resolve, reject) => {
      loader.parse(source, "", resolve, reject);
    },
  );
};

const exportSceneAsGltf = (
  scene: THREE.Object3D,
  binary: boolean,
): Promise<ArrayBuffer | string> =>
  new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();

    exporter.parse(
      scene,
      (result) =>
        resolve(binary ? (result as ArrayBuffer) : JSON.stringify(result, null, 2)),
      (error) => reject(error),
      { binary, onlyVisible: false, trs: false },
    );
  });

const toHexColor = (color: THREE.Color | undefined, fallback = "#A3BE8C") =>
  color ? `#${color.getHexString()}` : fallback;

const getFaceNormalVector = (
  mesh: ObjectMeshData,
  face: ObjectMeshData["faces"][number],
) => {
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

const makeMaterial = (object: ObjectData, materialRef: string) => {
  const material = resolveObjectMaterial(object, materialRef);
  const texture = getObjectMaterialTexture(material);
  const threeMaterial = new THREE.MeshStandardMaterial({
    map: texture || undefined,
    color: material.color,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    metalness: material.metalness,
    roughness: material.roughness,
    opacity: material.opacity,
    transparent: material.transparent,
    side: THREE.DoubleSide,
  });
  threeMaterial.name = material.name;
  return threeMaterial;
};

const createGeometryForFaces = (
  mesh: ObjectMeshData,
  faces: ObjectMeshData["faces"],
) => {
  const positions: number[] = [];
  const uvs: number[] = [];

  faces.forEach((face) => {
    if (face.vertices.length < 3) return;
    const normal = getFaceNormalVector(mesh, face);

    for (let i = 1; i < face.vertices.length - 1; i++) {
      [face.vertices[0], face.vertices[i], face.vertices[i + 1]].forEach(
        (vertexId) => {
          const vertex = (mesh.vertices[vertexId] || [0, 0, 0]) as [
            number,
            number,
            number,
          ];
          positions.push(vertex[0], vertex[1], vertex[2]);
          const [u, v] = projectTextureUv(vertex, normal);
          uvs.push(u, v);
        },
      );
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
};

const createDecalExportMesh = (decal: ObjectDecalData) => {
  const preset = DECAL_KIND_PRESETS[decal.kind];
  const material = new THREE.MeshStandardMaterial({
    color: decal.color || preset.color,
    emissive: decal.emissive || preset.emissive ? decal.color || preset.color : "#000000",
    emissiveIntensity: decal.emissive || preset.emissive ? 0.9 : 0,
    transparent: true,
    opacity: Math.max(0.02, Math.min(1, decal.opacity ?? preset.opacity)),
    side: THREE.DoubleSide,
    roughness: 0.62,
  });
  material.name = `decal_${decal.kind}`;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(
      Math.max(0.01, decal.size?.[0] || 0.5),
      Math.max(0.01, decal.size?.[1] || 0.5),
    ),
    material,
  );
  mesh.name = decal.name || decal.id;
  mesh.position.set(...(decal.position as Vec3));
  mesh.rotation.set(...(decal.rotation as Vec3));
  mesh.userData = {
    crpg_decal: {
      kind: decal.kind,
      opacity: decal.opacity,
      target_face: decal.target_face,
    },
  };
  return mesh;
};

export const createThreeObjectFromObjectData = (object: ObjectData) => {
  const group = new THREE.Group();
  group.name = object.display_name || object.id;
  group.userData = {
    crpg_object_id: object.id,
    crpg_bounds: object.bounds,
    crpg_collision: object.collision,
  };

  const mesh = object.mesh || createMeshFromParts(object);
  const materialRefs = getObjectMaterialRefs({
    ...object,
    mesh,
  }).filter((materialRef) =>
    mesh.faces.some((face) => (face.material || "#A3BE8C") === materialRef),
  );
  const refs = materialRefs.length ? materialRefs : ["#A3BE8C"];

  refs.forEach((materialRef) => {
    const faces = mesh.faces.filter(
      (face) => (face.material || "#A3BE8C") === materialRef,
    );
    if (faces.length === 0) return;

    const geometry = createGeometryForFaces(mesh, faces);
    const threeMesh = new THREE.Mesh(geometry, makeMaterial(object, materialRef));
    threeMesh.name = `${group.name}_${makeSafeId(materialRef)}`;
    group.add(threeMesh);
  });

  (object.decals || []).forEach((decal) => {
    group.add(createDecalExportMesh(decal));
  });

  return group;
};

export const exportObjectAsGltf = (
  object: ObjectData,
  binary: boolean,
): Promise<ArrayBuffer | string> => {
  if (object.model_kind === "asset" && object.asset) {
    return (async () => {
      if (binary && object.asset?.source_type === "glb") {
        return dataUrlToSource(object.asset) as Promise<ArrayBuffer>;
      }
      if (!binary && object.asset?.source_type === "gltf") {
        return dataUrlToSource(object.asset) as Promise<string>;
      }

      const gltf = await loadGltfFromAssetDataUrl(object.asset);
      const root = new THREE.Group();
      root.name = object.display_name || object.id;
      const scene = gltf.scene.clone(true);
      const offset = object.asset.offset as Vec3;
      const rotation = object.asset.rotation as Vec3;
      const scale = object.asset.scale as Vec3;
      scene.position.set(offset[0], offset[1], offset[2]);
      scene.rotation.set(rotation[0], rotation[1], rotation[2]);
      scene.scale.set(scale[0], scale[1], scale[2]);
      root.add(scene);
      return exportSceneAsGltf(root, binary);
    })();
  }

  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const scene = createThreeObjectFromObjectData(object);

    exporter.parse(
      scene,
      (result) => {
        scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material?.dispose?.();
          }
        });
        resolve(binary ? (result as ArrayBuffer) : JSON.stringify(result, null, 2));
      },
      (error) => reject(error),
      { binary, onlyVisible: false, trs: false },
    );
  });
};

const getMaterialData = (
  material: THREE.Material | undefined,
  fallbackIndex: number,
): ObjectMaterialData => {
  const anyMaterial = material as THREE.MeshStandardMaterial | undefined;
  const safeName = material?.name?.trim() || `material_${fallbackIndex + 1}`;
  const id = `mat_${makeSafeId(safeName)}_${fallbackIndex}`;
  const opacity = Number(material?.opacity ?? 1);

  return {
    id,
    name: safeName,
    color: toHexColor(anyMaterial?.color),
    emissive: toHexColor(anyMaterial?.emissive, "#000000"),
    emissive_intensity: Number(anyMaterial?.emissiveIntensity || 0),
    opacity,
    transparent: Boolean(material?.transparent) || opacity < 1,
    roughness: Number(anyMaterial?.roughness ?? 0.7),
    metalness: Number(anyMaterial?.metalness ?? 0.02),
    texture_kind: "none",
    texture_scale: 1,
    texture_strength: 0.45,
  };
};

const getMaterialTextures = (material: THREE.Material | undefined) => {
  const standard = material as THREE.MeshStandardMaterial | undefined;
  return [
    standard?.map,
    standard?.normalMap,
    standard?.roughnessMap,
    standard?.metalnessMap,
    standard?.emissiveMap,
    standard?.alphaMap,
    standard?.aoMap,
  ].filter(Boolean) as THREE.Texture[];
};

const getGltfMetadata = (
  gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>>,
  bytes: number,
) => {
  const bounds = new THREE.Box3();
  const materialSettings = new Map<string, ObjectMaterialData>();
  const materialNames: string[] = [];
  const textureIds = new Set<string>();
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;

  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((child) => {
    const source = child as THREE.Mesh;
    if (!source.isMesh || !source.geometry) return;

    meshes += 1;
    const position = source.geometry.getAttribute("position");
    vertices += position?.count || 0;
    triangles += source.geometry.index
      ? Math.floor(source.geometry.index.count / 3)
      : Math.floor((position?.count || 0) / 3);

    source.geometry.computeBoundingBox();
    const meshBounds = source.geometry.boundingBox?.clone();
    if (meshBounds) {
      meshBounds.applyMatrix4(source.matrixWorld);
      bounds.union(meshBounds);
    }

    const sourceMaterials = Array.isArray(source.material)
      ? source.material
      : [source.material];
    sourceMaterials.forEach((material) => {
      const materialName =
        material?.name?.trim() || `asset_material_${materialSettings.size + 1}`;
      if (material && !material.name?.trim()) material.name = materialName;
      const materialData = getMaterialData(material, materialSettings.size);
      materialData.id = materialName;
      materialData.name = materialName;
      materialSettings.set(materialName, materialData);
      getMaterialTextures(material).forEach((texture) =>
        textureIds.add(texture.uuid),
      );
    });
  });

  if (bounds.isEmpty()) {
    bounds.set(
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 1, 0.5),
    );
  }

  materialNames.push(...materialSettings.keys());
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const sourceMin: Vec3 = [bounds.min.x, bounds.min.y, bounds.min.z];
  const sourceCenter: Vec3 = [center.x, center.y, center.z];
  const sourceBounds: Vec3 = [
    Math.max(0.01, size.x),
    Math.max(0.01, size.y),
    Math.max(0.01, size.z),
  ];

  return {
    sourceMin,
    sourceCenter,
    sourceBounds,
    materialSettings: Array.from(materialSettings.values()),
    materialNames,
    stats: {
      meshes,
      vertices,
      triangles,
      materials: materialNames.length,
      textures: textureIds.size,
      bytes,
    },
  };
};

const getGroupMaterialIndex = (
  groups: THREE.BufferGeometry["groups"],
  start: number,
) => {
  const group = groups.find(
    (candidate) =>
      start >= candidate.start && start < candidate.start + candidate.count,
  );
  return group?.materialIndex || 0;
};

const addGeometryToMesh = (
  engineMesh: ObjectMeshData,
  materialSlots: Set<string>,
  materialSettings: Map<string, ObjectMaterialData>,
  materialCache: Map<string, ObjectMaterialData>,
  source: THREE.Mesh,
) => {
  const geometry = source.geometry;
  const position = geometry.getAttribute("position");
  if (!position) return;

  const sourceMaterials = Array.isArray(source.material)
    ? source.material
    : [source.material];
  const groups = geometry.groups.length
    ? geometry.groups
    : [
        {
          start: 0,
          count: geometry.index ? geometry.index.count : position.count,
          materialIndex: 0,
        },
      ];
  const matrix = source.matrixWorld.clone();
  const vertexKeyMap = new Map<string, number>();

  const getVertexId = (positionIndex: number) => {
    const point = new THREE.Vector3(
      position.getX(positionIndex),
      position.getY(positionIndex),
      position.getZ(positionIndex),
    ).applyMatrix4(matrix);
    const key = `${point.x.toFixed(5)}_${point.y.toFixed(5)}_${point.z.toFixed(5)}`;
    const existing = vertexKeyMap.get(key);
    if (existing !== undefined) return existing;

    engineMesh.vertices.push([point.x, point.y, point.z]);
    const nextId = engineMesh.vertices.length - 1;
    vertexKeyMap.set(key, nextId);
    return nextId;
  };

  groups.forEach((group) => {
    const sourceMaterial = sourceMaterials[group.materialIndex || 0] || sourceMaterials[0];
    const materialCacheKey =
      sourceMaterial?.uuid || `${source.uuid}_${group.materialIndex || 0}`;
    let materialData = materialCache.get(materialCacheKey);

    if (!materialData) {
      materialData = getMaterialData(sourceMaterial, materialCache.size);
      materialCache.set(materialCacheKey, materialData);
    }

    materialSettings.set(materialData.id, materialData);
    materialSlots.add(materialData.id);

    for (let i = group.start; i < group.start + group.count - 2; i += 3) {
      const ids = [0, 1, 2].map((offset) => {
        const cursor = i + offset;
        const positionIndex = geometry.index
          ? geometry.index.getX(cursor)
          : cursor;
        return getVertexId(positionIndex);
      });

      engineMesh.faces.push({
        name: `${source.name || "gltf_mesh"}_tri_${engineMesh.faces.length}`,
        vertices: ids,
        material: materialData.id,
        group: source.name || "gltf_mesh",
      });
    }
  });
};

const makeRectFootprint = (width: number, depth: number) => {
  const safeWidth = Math.max(1, Math.min(12, Math.ceil(width)));
  const safeDepth = Math.max(1, Math.min(12, Math.ceil(depth)));
  const minX = -Math.floor(safeWidth / 2);
  const minZ = -Math.floor(safeDepth / 2);
  const footprint: [number, number][] = [];

  for (let x = minX; x < minX + safeWidth; x++) {
    for (let z = minZ; z < minZ + safeDepth; z++) {
      footprint.push([x, z]);
    }
  }

  return footprint;
};

export const importObjectFromGltfFile = async (
  file: File,
  mode: GltfImportMode = "mesh",
): Promise<ObjectData> => {
  const loader = new GLTFLoader();
  const isGltfJson = file.name.toLowerCase().endsWith(".gltf");
  const source = isGltfJson ? await file.text() : await file.arrayBuffer();
  const sourceType = isGltfJson ? "gltf" : "glb";
  const gltf = await new Promise<Awaited<ReturnType<GLTFLoader["parseAsync"]>>>(
    (resolve, reject) => {
      loader.parse(source, "", resolve, reject);
    },
  );
  const baseName = file.name.replace(/\.(glb|gltf)$/i, "") || "Imported GLB";

  if (mode === "asset") {
    const metadata = getGltfMetadata(
      gltf,
      isGltfJson ? new Blob([source as string]).size : (source as ArrayBuffer).byteLength,
    );
    const dataUrl = await readFileAsDataUrl(file);
    const footprint = makeRectFootprint(
      metadata.sourceBounds[0],
      metadata.sourceBounds[2],
    );

    return {
      id: `obj_${makeSafeId(baseName)}_${Date.now()}`,
      display_name: baseName,
      category: "props",
      tags: ["imported", sourceType, "asset", "hero_model"],
      origin: "center_floor",
      bounds: metadata.sourceBounds,
      materials: metadata.materialNames,
      material_settings: metadata.materialSettings,
      model_kind: "asset",
      parts: [],
      decals: [],
      reference_images: [],
      asset: {
        data_url: dataUrl,
        filename: file.name,
        source_type: sourceType,
        offset: [
          -metadata.sourceCenter[0],
          -metadata.sourceMin[1],
          -metadata.sourceCenter[2],
        ],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        source_min: metadata.sourceMin,
        source_center: metadata.sourceCenter,
        source_bounds: metadata.sourceBounds,
        material_names: metadata.materialNames,
        stats: metadata.stats,
      },
      collision: {
        profile: footprint.length > 1 ? "custom_footprint" : "single",
        footprint,
      },
    };
  }

  const engineMesh: ObjectMeshData = {
    vertices: [],
    faces: [],
    material_slots: [],
    groups: [],
  };
  const materialSlots = new Set<string>();
  const materialSettings = new Map<string, ObjectMaterialData>();
  const materialCache = new Map<string, ObjectMaterialData>();
  const groups = new Set<string>();

  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((child) => {
    const source = child as THREE.Mesh;
    if (!source.isMesh || !source.geometry) return;

    groups.add(source.name || "gltf_mesh");
    addGeometryToMesh(
      engineMesh,
      materialSlots,
      materialSettings,
      materialCache,
      source,
    );
  });

  const normalizedMesh = snapMeshToTileOrigin(
    recomputeMeshNormals({
      ...engineMesh,
      material_slots: Array.from(materialSlots),
      groups: Array.from(groups),
    }),
  );
  const boundsInfo = getMeshBoundsInfo(normalizedMesh);
  const footprint = makeRectFootprint(boundsInfo.size[0], boundsInfo.size[2]);

  return {
    id: `obj_${makeSafeId(baseName)}_${Date.now()}`,
    display_name: baseName,
    category: "props",
    tags: ["imported", sourceType, "editable_mesh"],
    origin: "center_floor",
    bounds: getMeshBounds(normalizedMesh),
    materials: Array.from(materialSlots),
    material_settings: Array.from(materialSettings.values()),
    model_kind: "mesh",
    parts: [],
    mesh: normalizedMesh,
    decals: [],
    reference_images: [],
    collision: {
      profile: footprint.length > 1 ? "custom_footprint" : "single",
      footprint,
    },
  };
};
