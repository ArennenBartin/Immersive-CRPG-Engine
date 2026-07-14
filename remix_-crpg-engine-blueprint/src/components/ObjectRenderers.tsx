import React, { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import type {
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
import { loadGltfFromAssetDataUrl } from "../utils/gltfModelIO";

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

const assetSceneCache = new Map<string, Promise<THREE.Group>>();

const getAssetScene = (object: ObjectData) => {
  if (!object.asset) return null;

  const key = `${object.id}_${object.asset.filename}_${object.asset.data_url.length}`;
  const cached = assetSceneCache.get(key);
  if (cached) return cached;

  const promise = loadGltfFromAssetDataUrl(object.asset).then((gltf) => gltf.scene);
  assetSceneCache.set(key, promise);
  return promise;
};

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

const cloneAssetSceneForObject = (scene: THREE.Group, object: ObjectData) => {
  const cloned = scene.clone(true);

  cloned.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

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
  onObjectClick,
}: {
  object: ObjectData;
  objectSelected?: boolean;
  selectable?: boolean;
  showBounds?: boolean;
  onObjectClick?: (event: any) => void;
}) {
  const [sourceScene, setSourceScene] = React.useState<THREE.Group | null>(null);
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
    setSourceScene(null);

    const promise = getAssetScene(object);
    if (!promise) {
      setLoadError(true);
      return;
    }

    promise
      .then((scene) => {
        if (!cancelled) setSourceScene(scene);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [object.id, asset?.data_url, asset?.filename]);

  useEffect(
    () => () => {
      boundsGeometry.dispose();
    },
    [boundsGeometry],
  );

  const renderedScene = useMemo(
    () => (sourceScene ? cloneAssetSceneForObject(sourceScene, object) : null),
    [sourceScene, object],
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
          <primitive
            object={renderedScene}
            position={assetOffset as [number, number, number]}
            rotation={assetRotation as [number, number, number]}
          />
        </group>
      ) : (
        <mesh position={[0, Math.max(0.05, bounds[1] || 1) / 2, 0]}>
          <primitive object={boundsGeometry} attach="geometry" />
          <meshStandardMaterial
            color={loadError ? "#BF616A" : "#4C566A"}
            wireframe
            transparent
            opacity={0.45}
          />
        </mesh>
      )}
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
