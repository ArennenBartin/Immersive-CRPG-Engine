import * as THREE from "three";
import type {
  ObjectData,
  ObjectMeshData,
  ObjectMeshFace,
  ObjectPart,
} from "../schema/game";

export type Vec3 = [number, number, number];

export type MeshEdge = {
  id: string;
  vertices: [number, number];
  faces: number[];
};

export type MeshFaceOperationResult = {
  mesh: ObjectMeshData;
  selectedFaceIndex: number | null;
};

export type MeshTopologyOperationResult = {
  mesh: ObjectMeshData;
  selectedVertexIndex: number | null;
  selectedEdgeId: string | null;
  selectedFaceIndex: number | null;
};

export type MeshSelectionOperationResult = {
  mesh: ObjectMeshData;
  selectedVertexIndices: number[];
  selectedFaceIndices: number[];
};

export type MeshBoundsInfo = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
};

export type SculptTool =
  | "grab"
  | "smooth"
  | "inflate"
  | "pinch"
  | "flatten"
  | "noise";

export type SculptFalloff = "smooth" | "linear" | "constant";

const toVec3 = (value: unknown, fallback: Vec3): Vec3 => {
  const source = Array.isArray(value) ? value : [];
  return [
    Number(source[0] ?? fallback[0]),
    Number(source[1] ?? fallback[1]),
    Number(source[2] ?? fallback[2]),
  ];
};

const transformPoint = (
  local: Vec3,
  position: Vec3,
  rotation: Vec3,
): Vec3 => {
  const vector = new THREE.Vector3(...local);
  vector.applyEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"));
  vector.add(new THREE.Vector3(...position));
  return [vector.x, vector.y, vector.z];
};

const getFaceNormal = (vertices: Vec3[], indices: number[]): Vec3 => {
  if (indices.length < 3) return [0, 1, 0];

  const a = new THREE.Vector3(...vertices[indices[0]]);
  const b = new THREE.Vector3(...vertices[indices[1]]);
  const c = new THREE.Vector3(...vertices[indices[2]]);
  const normal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize();

  if (!Number.isFinite(normal.x)) return [0, 1, 0];
  return [normal.x, normal.y, normal.z];
};

export const recomputeMeshNormals = (mesh: ObjectMeshData): ObjectMeshData => ({
  ...mesh,
  faces: mesh.faces.map((face) => ({
    ...face,
    normal: getFaceNormal(mesh.vertices as Vec3[], face.vertices),
  })),
});

const pushFace = (
  mesh: ObjectMeshData,
  part: ObjectPart,
  vertices: number[],
  name: string,
) => {
  const face: ObjectMeshFace = {
    name,
    vertices,
    material: part.material,
    normal: getFaceNormal(mesh.vertices as Vec3[], vertices),
    group: part.name,
  };
  mesh.faces.push(face);
};

const pushVertex = (mesh: ObjectMeshData, point: Vec3) => {
  mesh.vertices.push(point);
  return mesh.vertices.length - 1;
};

const cloneFace = (face: ObjectMeshFace): ObjectMeshFace => ({
  ...face,
  vertices: [...face.vertices],
  normal: face.normal ? ([...face.normal] as Vec3) : undefined,
});

const cloneMesh = (mesh: ObjectMeshData): ObjectMeshData => ({
  ...mesh,
  vertices: mesh.vertices.map((vertex) => [...vertex] as Vec3),
  faces: mesh.faces.map(cloneFace),
  material_slots: [...(mesh.material_slots || [])],
  groups: [...(mesh.groups || [])],
});

const getUsedMeshGroups = (mesh: ObjectMeshData) =>
  Array.from(
    new Set(
      mesh.faces
        .map((face) => face.group?.trim())
        .filter((group): group is string => Boolean(group)),
    ),
  );

const withUsedMeshGroups = (mesh: ObjectMeshData): ObjectMeshData => ({
  ...mesh,
  groups: getUsedMeshGroups(mesh),
});

const normalizeFaceVertices = (vertices: number[]) => {
  const seen = new Set<number>();
  const normalized: number[] = [];

  vertices.forEach((vertexId) => {
    if (!Number.isInteger(vertexId) || seen.has(vertexId)) return;
    seen.add(vertexId);
    normalized.push(vertexId);
  });

  return normalized;
};

const normalizeMeshFaces = (faces: ObjectMeshFace[]) => {
  const seenFaces = new Set<string>();

  return faces
    .map((face) => ({
      ...face,
      vertices: normalizeFaceVertices(face.vertices),
    }))
    .filter((face) => {
      if (face.vertices.length < 3) return false;

      const key = [...face.vertices].sort((a, b) => a - b).join("_");
      if (seenFaces.has(key)) return false;
      seenFaces.add(key);
      return true;
    });
};

const compactMeshVerticesWithMap = (mesh: ObjectMeshData) => {
  const usedVertexIds = new Set<number>();
  mesh.faces.forEach((face) => {
    face.vertices.forEach((vertexId) => {
      if (mesh.vertices[vertexId]) usedVertexIds.add(vertexId);
    });
  });

  const vertexIdMap = new Map<number, number>();
  const vertices: Vec3[] = [];
  mesh.vertices.forEach((vertex, vertexId) => {
    if (!usedVertexIds.has(vertexId)) return;
    vertexIdMap.set(vertexId, vertices.length);
    vertices.push([...vertex] as Vec3);
  });

  const nextMesh: ObjectMeshData = {
    ...mesh,
    vertices,
    faces: normalizeMeshFaces(
      mesh.faces.map((face) => ({
        ...face,
        vertices: face.vertices
          .map((vertexId) => vertexIdMap.get(vertexId))
          .filter((vertexId): vertexId is number => vertexId !== undefined),
      })),
    ),
    material_slots: [...(mesh.material_slots || [])],
    groups: [...(mesh.groups || [])],
  };

  return { mesh: nextMesh, vertexIdMap };
};

const compactMeshVertices = (mesh: ObjectMeshData): ObjectMeshData =>
  compactMeshVerticesWithMap(mesh).mesh;

const getSafeFaceNormal = (
  mesh: ObjectMeshData,
  face: ObjectMeshFace,
): Vec3 => {
  const normal = toVec3(
    face.normal || getFaceNormal(mesh.vertices as Vec3[], face.vertices),
    [0, 1, 0],
  );
  const vector = new THREE.Vector3(...normal);

  if (vector.lengthSq() < 0.000001) return [0, 1, 0];

  vector.normalize();
  return [vector.x, vector.y, vector.z];
};

const getFaceName = (face: ObjectMeshFace, fallback: string) =>
  face.name?.trim() || fallback;

const getFaceCenter = (
  mesh: ObjectMeshData,
  face: ObjectMeshFace,
) => {
  const center = new THREE.Vector3();
  let count = 0;

  face.vertices.forEach((vertexId) => {
    const vertex = mesh.vertices[vertexId];
    if (!vertex) return;
    center.add(new THREE.Vector3(...(vertex as Vec3)));
    count += 1;
  });

  if (count === 0) return center;

  return center.multiplyScalar(1 / count);
};

const faceContainsEdge = (face: ObjectMeshFace, edgeVertices: [number, number]) =>
  face.vertices.some((vertexId, index) => {
    const nextId = face.vertices[(index + 1) % face.vertices.length];
    return (
      (vertexId === edgeVertices[0] && nextId === edgeVertices[1]) ||
      (vertexId === edgeVertices[1] && nextId === edgeVertices[0])
    );
  });

const mergeMeshVertexPair = (
  mesh: ObjectMeshData,
  sourceVertexId: number,
  targetVertexId: number,
  targetPosition: Vec3,
): MeshTopologyOperationResult => {
  if (
    sourceVertexId === targetVertexId ||
    !mesh.vertices[sourceVertexId] ||
    !mesh.vertices[targetVertexId]
  ) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: mesh.vertices[targetVertexId] ? targetVertexId : null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const nextMesh = cloneMesh(mesh);
  nextMesh.vertices[targetVertexId] = targetPosition;
  nextMesh.faces = normalizeMeshFaces(
    nextMesh.faces.map((face) => ({
      ...face,
      vertices: face.vertices.map((vertexId) =>
        vertexId === sourceVertexId ? targetVertexId : vertexId,
      ),
    })),
  );

  const compacted = compactMeshVerticesWithMap(nextMesh);
  const selectedVertexIndex = compacted.vertexIdMap.get(targetVertexId) ?? null;

  return {
    mesh: recomputeMeshNormals(compacted.mesh),
    selectedVertexIndex,
    selectedEdgeId: null,
    selectedFaceIndex: null,
  };
};

const addBoxLikePart = (mesh: ObjectMeshData, part: ObjectPart) => {
  const position = toVec3(part.position, [0, 0, 0]);
  const rotation = toVec3(part.rotation, [0, 0, 0]);
  const size = toVec3(part.size, [1, 1, 1]);
  const [w, h, d] = size;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const start = mesh.vertices.length;
  const corners: Vec3[] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, -hh, hd],
    [-hw, -hh, hd],
    [-hw, hh, -hd],
    [hw, hh, -hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  corners.forEach((corner) =>
    mesh.vertices.push(transformPoint(corner, position, rotation)),
  );

  pushFace(mesh, part, [start, start + 1, start + 2, start + 3], `${part.name}_bottom`);
  pushFace(mesh, part, [start + 4, start + 7, start + 6, start + 5], `${part.name}_top`);
  pushFace(mesh, part, [start, start + 4, start + 5, start + 1], `${part.name}_back`);
  pushFace(mesh, part, [start + 1, start + 5, start + 6, start + 2], `${part.name}_right`);
  pushFace(mesh, part, [start + 2, start + 6, start + 7, start + 3], `${part.name}_front`);
  pushFace(mesh, part, [start + 3, start + 7, start + 4, start], `${part.name}_left`);
};

const addPlanePart = (mesh: ObjectMeshData, part: ObjectPart) => {
  const position = toVec3(part.position, [0, 0, 0]);
  const rotation = toVec3(part.rotation, [0, 0, 0]);
  const size = toVec3(part.size, [1, 0, 1]);
  const hw = size[0] / 2;
  const hd = (size[2] || size[1] || 1) / 2;
  const start = mesh.vertices.length;
  const corners: Vec3[] = [
    [-hw, 0, -hd],
    [hw, 0, -hd],
    [hw, 0, hd],
    [-hw, 0, hd],
  ];

  corners.forEach((corner) =>
    mesh.vertices.push(transformPoint(corner, position, rotation)),
  );
  pushFace(mesh, part, [start, start + 1, start + 2, start + 3], `${part.name}_surface`);
};

const addCylinderPart = (
  mesh: ObjectMeshData,
  part: ObjectPart,
  topRadius: number,
  bottomRadius: number,
) => {
  const position = toVec3(part.position, [0, 0, 0]);
  const rotation = toVec3(part.rotation, [0, 0, 0]);
  const size = toVec3(part.size, [1, 1, 1]);
  const height = size[1] || 1;
  const segments = Math.max(3, Math.min(24, Math.floor(part.segments || 10)));
  const top: number[] = [];
  const bottom: number[] = [];
  const topCenter =
    topRadius <= 0.001
      ? pushVertex(mesh, transformPoint([0, height / 2, 0], position, rotation))
      : null;
  const bottomCenter = pushVertex(
    mesh,
    transformPoint([0, -height / 2, 0], position, rotation),
  );

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    bottom.push(
      pushVertex(
        mesh,
        transformPoint([x * bottomRadius, -height / 2, z * bottomRadius], position, rotation),
      ),
    );
    if (topCenter === null) {
      top.push(
        pushVertex(
          mesh,
          transformPoint([x * topRadius, height / 2, z * topRadius], position, rotation),
        ),
      );
    }
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    if (topCenter === null) {
      pushFace(mesh, part, [bottom[i], bottom[next], top[next], top[i]], `${part.name}_side_${i}`);
    } else {
      pushFace(mesh, part, [bottom[i], bottom[next], topCenter], `${part.name}_side_${i}`);
    }
  }

  pushFace(mesh, part, [...bottom].reverse(), `${part.name}_bottom`);
  if (topCenter === null) {
    pushFace(mesh, part, top, `${part.name}_top`);
  }
};

const addSpherePart = (mesh: ObjectMeshData, part: ObjectPart) => {
  const position = toVec3(part.position, [0, 0, 0]);
  const rotation = toVec3(part.rotation, [0, 0, 0]);
  const size = toVec3(part.size, [1, 1, 1]);
  const rx = size[0] / 2;
  const ry = (size[1] || size[0]) / 2;
  const rz = (size[2] || size[0]) / 2;
  const widthSegments = Math.max(8, Math.min(24, Math.floor(part.segments || 12)));
  const heightSegments = Math.max(4, Math.floor(widthSegments / 2));
  const top = pushVertex(mesh, transformPoint([0, ry, 0], position, rotation));
  const bottom = pushVertex(mesh, transformPoint([0, -ry, 0], position, rotation));
  const rings: number[][] = [];

  for (let ring = 1; ring < heightSegments; ring += 1) {
    const phi = (ring / heightSegments) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const row: number[] = [];

    for (let segment = 0; segment < widthSegments; segment += 1) {
      const theta = (segment / widthSegments) * Math.PI * 2;
      row.push(
        pushVertex(
          mesh,
          transformPoint(
            [
              Math.cos(theta) * sinPhi * rx,
              cosPhi * ry,
              Math.sin(theta) * sinPhi * rz,
            ],
            position,
            rotation,
          ),
        ),
      );
    }

    rings.push(row);
  }

  const firstRing = rings[0];
  const lastRing = rings[rings.length - 1];

  if (!firstRing || !lastRing) return;

  for (let segment = 0; segment < widthSegments; segment += 1) {
    const next = (segment + 1) % widthSegments;
    pushFace(mesh, part, [top, firstRing[next], firstRing[segment]], `${part.name}_top_${segment}`);
  }

  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const current = rings[ring];
    const nextRing = rings[ring + 1];

    for (let segment = 0; segment < widthSegments; segment += 1) {
      const next = (segment + 1) % widthSegments;
      pushFace(
        mesh,
        part,
        [current[segment], current[next], nextRing[next], nextRing[segment]],
        `${part.name}_side_${ring}_${segment}`,
      );
    }
  }

  for (let segment = 0; segment < widthSegments; segment += 1) {
    const next = (segment + 1) % widthSegments;
    pushFace(mesh, part, [lastRing[segment], lastRing[next], bottom], `${part.name}_bottom_${segment}`);
  }
};

export const createMeshFromParts = (object: ObjectData): ObjectMeshData => {
  const mesh: ObjectMeshData = {
    vertices: [],
    faces: [],
    material_slots: [],
    groups: [],
  };
  const materials = new Set<string>();
  const groups = new Set<string>();

  object.parts.forEach((part) => {
    if (part.material) materials.add(part.material);
    groups.add(part.name);

    switch (part.shape) {
      case "cylinder":
      case "column":
        addCylinderPart(mesh, part, part.size[0] / 2, part.size[0] / 2);
        break;
      case "cone":
        addCylinderPart(mesh, part, 0, part.size[0] / 2);
        break;
      case "sphere":
        addSpherePart(mesh, part);
        break;
      case "plane":
        addPlanePart(mesh, part);
        break;
      case "box":
      case "slab":
      case "rib":
      case "stair":
      case "ring":
      case "arch":
      default:
        addBoxLikePart(mesh, part);
        break;
    }
  });

  mesh.material_slots = Array.from(
    new Set([...(object.materials || []), ...Array.from(materials)]),
  );
  mesh.groups = Array.from(groups);
  return mesh;
};

export const hasMeshModel = (object: ObjectData) =>
  object.model_kind === "mesh" &&
  !!object.mesh &&
  object.mesh.vertices.length > 0 &&
  object.mesh.faces.length > 0;

export const getMeshEdges = (mesh: ObjectMeshData): MeshEdge[] => {
  const edges = new Map<string, MeshEdge>();

  mesh.faces.forEach((face, faceIndex) => {
    face.vertices.forEach((vertexId, index) => {
      const nextId = face.vertices[(index + 1) % face.vertices.length];
      if (
        vertexId === nextId ||
        !mesh.vertices[vertexId] ||
        !mesh.vertices[nextId]
      ) {
        return;
      }

      const sorted: [number, number] =
        vertexId < nextId ? [vertexId, nextId] : [nextId, vertexId];
      const id = `${sorted[0]}_${sorted[1]}`;
      const existing = edges.get(id);

      if (existing) {
        existing.faces.push(faceIndex);
      } else {
        edges.set(id, { id, vertices: sorted, faces: [faceIndex] });
      }
    });
  });

  return Array.from(edges.values());
};

export const getAllMeshVertexIds = (mesh: ObjectMeshData) =>
  mesh.vertices.map((_, index) => index);

export const getFaceVertexIds = (
  mesh: ObjectMeshData,
  faceIds: number[],
) => {
  const ids = new Set<number>();

  faceIds.forEach((faceId) => {
    const face = mesh.faces[faceId];
    if (!face) return;
    face.vertices.forEach((vertexId) => {
      if (mesh.vertices[vertexId]) ids.add(vertexId);
    });
  });

  return Array.from(ids);
};

export const getEdgeVertexIds = (
  mesh: ObjectMeshData,
  edgeIds: string[],
) => {
  const ids = new Set<number>();
  const edgeMap = new Map(getMeshEdges(mesh).map((edge) => [edge.id, edge]));

  edgeIds.forEach((edgeId) => {
    const edge = edgeMap.get(edgeId);
    if (!edge) return;
    edge.vertices.forEach((vertexId) => {
      if (mesh.vertices[vertexId]) ids.add(vertexId);
    });
  });

  return Array.from(ids);
};

export const getMeshSelectionCenter = (
  mesh: ObjectMeshData,
  vertexIds: number[],
): Vec3 | null => {
  const vertices = vertexIds
    .map((vertexId) => mesh.vertices[vertexId])
    .filter(Boolean);

  if (vertices.length === 0) return null;

  const total = vertices.reduce(
    (sum, vertex) => [
      sum[0] + Number(vertex[0] || 0),
      sum[1] + Number(vertex[1] || 0),
      sum[2] + Number(vertex[2] || 0),
    ],
    [0, 0, 0] as Vec3,
  );

  return [
    total[0] / vertices.length,
    total[1] / vertices.length,
    total[2] / vertices.length,
  ];
};

export const translateMeshVertices = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  delta: Vec3,
): ObjectMeshData => {
  const selected = new Set(vertexIds);
  const nextMesh: ObjectMeshData = {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) =>
      selected.has(index)
        ? [
            Number(vertex[0] || 0) + delta[0],
            Number(vertex[1] || 0) + delta[1],
            Number(vertex[2] || 0) + delta[2],
          ]
        : vertex,
    ),
    faces: mesh.faces.map((face) => ({ ...face })),
    material_slots: [...(mesh.material_slots || [])],
    groups: [...(mesh.groups || [])],
  };

  return recomputeMeshNormals(nextMesh);
};

export const rotateMeshVertices = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  center: Vec3,
  axis: Vec3,
  angleRadians: number,
): ObjectMeshData => {
  const selected = new Set(vertexIds);
  const pivot = new THREE.Vector3(...center);
  const rotationAxis = new THREE.Vector3(...axis).normalize();
  const nextMesh: ObjectMeshData = {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) => {
      if (!selected.has(index)) return vertex;

      const point = new THREE.Vector3(...(vertex as Vec3));
      point.sub(pivot).applyAxisAngle(rotationAxis, angleRadians).add(pivot);
      return [point.x, point.y, point.z];
    }),
    faces: mesh.faces.map((face) => ({ ...face })),
    material_slots: [...(mesh.material_slots || [])],
    groups: [...(mesh.groups || [])],
  };

  return recomputeMeshNormals(nextMesh);
};

export const scaleMeshVertices = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  center: Vec3,
  scale: Vec3,
): ObjectMeshData => {
  const selected = new Set(vertexIds);
  const nextMesh: ObjectMeshData = {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) => {
      if (!selected.has(index)) return vertex;

      return [
        center[0] + (Number(vertex[0] || 0) - center[0]) * scale[0],
        center[1] + (Number(vertex[1] || 0) - center[1]) * scale[1],
        center[2] + (Number(vertex[2] || 0) - center[2]) * scale[2],
      ];
    }),
    faces: mesh.faces.map((face) => ({ ...face })),
    material_slots: [...(mesh.material_slots || [])],
    groups: [...(mesh.groups || [])],
  };

  return recomputeMeshNormals(nextMesh);
};

export const snapMeshVertices = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  gridSize: number,
): ObjectMeshData => {
  const selected = new Set(vertexIds);
  const safeGridSize = Math.max(0.001, gridSize);
  const nextMesh: ObjectMeshData = {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) =>
      selected.has(index)
        ? [
            Math.round(Number(vertex[0] || 0) / safeGridSize) * safeGridSize,
            Math.round(Number(vertex[1] || 0) / safeGridSize) * safeGridSize,
            Math.round(Number(vertex[2] || 0) / safeGridSize) * safeGridSize,
          ]
        : vertex,
    ),
    faces: mesh.faces.map((face) => ({ ...face })),
    material_slots: [...(mesh.material_slots || [])],
    groups: [...(mesh.groups || [])],
  };

  return recomputeMeshNormals(nextMesh);
};

export const snapMeshSelectionToNearestVertex = (
  mesh: ObjectMeshData,
  vertexIds: number[],
): ObjectMeshData => {
  const selected = new Set(vertexIds);
  if (selected.size === 0 || selected.size >= mesh.vertices.length) {
    return recomputeMeshNormals(cloneMesh(mesh));
  }

  let nearestDelta: Vec3 | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  vertexIds.forEach((sourceId) => {
    const source = mesh.vertices[sourceId];
    if (!source) return;

    mesh.vertices.forEach((target, targetId) => {
      if (selected.has(targetId)) return;

      const dx = Number(target[0] || 0) - Number(source[0] || 0);
      const dy = Number(target[1] || 0) - Number(source[1] || 0);
      const dz = Number(target[2] || 0) - Number(source[2] || 0);
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (distanceSq > 0.0000001 && distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestDelta = [dx, dy, dz];
      }
    });
  });

  return nearestDelta
    ? translateMeshVertices(mesh, vertexIds, nearestDelta)
    : recomputeMeshNormals(cloneMesh(mesh));
};

export const snapMeshToTileOrigin = (mesh: ObjectMeshData): ObjectMeshData => {
  if (mesh.vertices.length === 0) return recomputeMeshNormals(cloneMesh(mesh));

  const xs = mesh.vertices.map((vertex) => Number(vertex[0] || 0));
  const ys = mesh.vertices.map((vertex) => Number(vertex[1] || 0));
  const zs = mesh.vertices.map((vertex) => Number(vertex[2] || 0));
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const minY = Math.min(...ys);

  return translateMeshVertices(mesh, getAllMeshVertexIds(mesh), [
    -centerX,
    -minY,
    -centerZ,
  ]);
};

export const extrudeMeshFace = (
  mesh: ObjectMeshData,
  faceIndex: number,
  distance: number,
): MeshFaceOperationResult => {
  const sourceFace = mesh.faces[faceIndex];
  if (!sourceFace) {
    return { mesh: recomputeMeshNormals(cloneMesh(mesh)), selectedFaceIndex: null };
  }

  const sourceVertexIds = sourceFace.vertices.filter((vertexId) => mesh.vertices[vertexId]);
  if (sourceVertexIds.length < 3) {
    return { mesh: recomputeMeshNormals(cloneMesh(mesh)), selectedFaceIndex: null };
  }

  const nextMesh: ObjectMeshData = {
    ...cloneMesh(mesh),
    faces: mesh.faces.filter((_, index) => index !== faceIndex).map(cloneFace),
  };
  const normal = new THREE.Vector3(...getSafeFaceNormal(mesh, sourceFace));
  const safeDistance = Number.isFinite(distance) ? distance : 0.125;
  const baseName = getFaceName(sourceFace, `face_${faceIndex}`);
  const newVertexIds = sourceVertexIds.map((vertexId) => {
    const source = new THREE.Vector3(...(mesh.vertices[vertexId] as Vec3));
    source.add(normal.clone().multiplyScalar(safeDistance));
    nextMesh.vertices.push([source.x, source.y, source.z]);
    return nextMesh.vertices.length - 1;
  });

  sourceVertexIds.forEach((vertexId, index) => {
    const nextIndex = (index + 1) % sourceVertexIds.length;
    nextMesh.faces.push({
      name: `${baseName}_extrude_side_${index}`,
      vertices: [
        vertexId,
        sourceVertexIds[nextIndex],
        newVertexIds[nextIndex],
        newVertexIds[index],
      ],
      material: sourceFace.material,
      group: sourceFace.group,
    });
  });

  nextMesh.faces.push({
    name: `${baseName}_extrude_cap`,
    vertices: newVertexIds,
    material: sourceFace.material,
    group: sourceFace.group,
  });

  return {
    mesh: recomputeMeshNormals(nextMesh),
    selectedFaceIndex: nextMesh.faces.length - 1,
  };
};

export const insetMeshFace = (
  mesh: ObjectMeshData,
  faceIndex: number,
  insetRatio: number,
): MeshFaceOperationResult => {
  const sourceFace = mesh.faces[faceIndex];
  if (!sourceFace) {
    return { mesh: recomputeMeshNormals(cloneMesh(mesh)), selectedFaceIndex: null };
  }

  const sourceVertexIds = sourceFace.vertices.filter((vertexId) => mesh.vertices[vertexId]);
  if (sourceVertexIds.length < 3) {
    return { mesh: recomputeMeshNormals(cloneMesh(mesh)), selectedFaceIndex: null };
  }

  const center = getMeshSelectionCenter(mesh, sourceVertexIds);
  if (!center) {
    return { mesh: recomputeMeshNormals(cloneMesh(mesh)), selectedFaceIndex: null };
  }

  const safeInsetRatio = Math.max(0.01, Math.min(0.9, insetRatio));
  const nextMesh: ObjectMeshData = {
    ...cloneMesh(mesh),
    faces: mesh.faces.filter((_, index) => index !== faceIndex).map(cloneFace),
  };
  const baseName = getFaceName(sourceFace, `face_${faceIndex}`);
  const newVertexIds = sourceVertexIds.map((vertexId) => {
    const source = mesh.vertices[vertexId] as Vec3;
    const point: Vec3 = [
      center[0] + (Number(source[0] || 0) - center[0]) * (1 - safeInsetRatio),
      center[1] + (Number(source[1] || 0) - center[1]) * (1 - safeInsetRatio),
      center[2] + (Number(source[2] || 0) - center[2]) * (1 - safeInsetRatio),
    ];
    nextMesh.vertices.push(point);
    return nextMesh.vertices.length - 1;
  });

  sourceVertexIds.forEach((vertexId, index) => {
    const nextIndex = (index + 1) % sourceVertexIds.length;
    nextMesh.faces.push({
      name: `${baseName}_inset_ring_${index}`,
      vertices: [
        vertexId,
        sourceVertexIds[nextIndex],
        newVertexIds[nextIndex],
        newVertexIds[index],
      ],
      material: sourceFace.material,
      group: sourceFace.group,
    });
  });

  nextMesh.faces.push({
    name: `${baseName}_inset_face`,
    vertices: newVertexIds,
    material: sourceFace.material,
    group: sourceFace.group,
  });

  return {
    mesh: recomputeMeshNormals(nextMesh),
    selectedFaceIndex: nextMesh.faces.length - 1,
  };
};

export const deleteMeshFace = (
  mesh: ObjectMeshData,
  faceIndex: number,
): MeshFaceOperationResult => {
  if (!mesh.faces[faceIndex]) {
    return { mesh: recomputeMeshNormals(cloneMesh(mesh)), selectedFaceIndex: null };
  }

  const nextMesh = compactMeshVertices({
    ...cloneMesh(mesh),
    faces: mesh.faces.filter((_, index) => index !== faceIndex).map(cloneFace),
  });
  const selectedFaceIndex =
    nextMesh.faces.length === 0 ? null : Math.min(faceIndex, nextMesh.faces.length - 1);

  return {
    mesh: recomputeMeshNormals(nextMesh),
    selectedFaceIndex,
  };
};

export const deleteMeshVertex = (
  mesh: ObjectMeshData,
  vertexIndex: number,
): MeshTopologyOperationResult => {
  if (!mesh.vertices[vertexIndex]) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const compacted = compactMeshVerticesWithMap({
    ...cloneMesh(mesh),
    faces: mesh.faces
      .filter((face) => !face.vertices.includes(vertexIndex))
      .map(cloneFace),
  });
  const selectedVertexIndex =
    compacted.mesh.vertices.length === 0
      ? null
      : Math.min(vertexIndex, compacted.mesh.vertices.length - 1);

  return {
    mesh: recomputeMeshNormals(compacted.mesh),
    selectedVertexIndex,
    selectedEdgeId: null,
    selectedFaceIndex: null,
  };
};

export const deleteMeshEdge = (
  mesh: ObjectMeshData,
  edgeId: string,
): MeshTopologyOperationResult => {
  const edge = getMeshEdges(mesh).find((candidate) => candidate.id === edgeId);
  if (!edge) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const compacted = compactMeshVerticesWithMap({
    ...cloneMesh(mesh),
    faces: mesh.faces
      .filter((face) => !faceContainsEdge(face, edge.vertices))
      .map(cloneFace),
  });
  const nextEdgeId = getMeshEdges(compacted.mesh)[0]?.id || null;

  return {
    mesh: recomputeMeshNormals(compacted.mesh),
    selectedVertexIndex: null,
    selectedEdgeId: nextEdgeId,
    selectedFaceIndex: null,
  };
};

export const mergeMeshVertexToNearest = (
  mesh: ObjectMeshData,
  vertexIndex: number,
): MeshTopologyOperationResult => {
  const source = mesh.vertices[vertexIndex];
  if (!source || mesh.vertices.length < 2) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: source ? vertexIndex : null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  let nearestVertexId: number | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  mesh.vertices.forEach((target, targetId) => {
    if (targetId === vertexIndex) return;

    const dx = Number(target[0] || 0) - Number(source[0] || 0);
    const dy = Number(target[1] || 0) - Number(source[1] || 0);
    const dz = Number(target[2] || 0) - Number(source[2] || 0);
    const distanceSq = dx * dx + dy * dy + dz * dz;

    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestVertexId = targetId;
    }
  });

  if (nearestVertexId === null) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: vertexIndex,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  return mergeMeshVertexPair(
    mesh,
    vertexIndex,
    nearestVertexId,
    [...mesh.vertices[nearestVertexId]] as Vec3,
  );
};

export const mergeMeshEdge = (
  mesh: ObjectMeshData,
  edgeId: string,
): MeshTopologyOperationResult => {
  const edge = getMeshEdges(mesh).find((candidate) => candidate.id === edgeId);
  if (!edge) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const start = mesh.vertices[edge.vertices[0]] as Vec3 | undefined;
  const end = mesh.vertices[edge.vertices[1]] as Vec3 | undefined;
  if (!start || !end) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const midpoint: Vec3 = [
    (Number(start[0] || 0) + Number(end[0] || 0)) / 2,
    (Number(start[1] || 0) + Number(end[1] || 0)) / 2,
    (Number(start[2] || 0) + Number(end[2] || 0)) / 2,
  ];

  return mergeMeshVertexPair(mesh, edge.vertices[1], edge.vertices[0], midpoint);
};

export const splitMeshEdge = (
  mesh: ObjectMeshData,
  edgeId: string,
): MeshTopologyOperationResult => {
  const edge = getMeshEdges(mesh).find((candidate) => candidate.id === edgeId);
  if (!edge) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const start = mesh.vertices[edge.vertices[0]] as Vec3 | undefined;
  const end = mesh.vertices[edge.vertices[1]] as Vec3 | undefined;
  if (!start || !end || edge.faces.length === 0) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: edge.id,
      selectedFaceIndex: null,
    };
  }

  const nextMesh = cloneMesh(mesh);
  const midpoint: Vec3 = [
    (Number(start[0] || 0) + Number(end[0] || 0)) / 2,
    (Number(start[1] || 0) + Number(end[1] || 0)) / 2,
    (Number(start[2] || 0) + Number(end[2] || 0)) / 2,
  ];
  nextMesh.vertices.push(midpoint);
  const midpointId = nextMesh.vertices.length - 1;

  const nextFaces = nextMesh.faces.map((face, faceIndex) => {
    if (!faceContainsEdge(face, edge.vertices)) return cloneFace(face);

    const vertices: number[] = [];
    face.vertices.forEach((vertexId, index) => {
      const nextId = face.vertices[(index + 1) % face.vertices.length];
      vertices.push(vertexId);

      if (
        (vertexId === edge.vertices[0] && nextId === edge.vertices[1]) ||
        (vertexId === edge.vertices[1] && nextId === edge.vertices[0])
      ) {
        vertices.push(midpointId);
      }
    });

    return {
      ...cloneFace(face),
      name: `${getFaceName(face, `face_${faceIndex}`)}_split`,
      vertices,
    };
  });

  return {
    mesh: recomputeMeshNormals({
      ...nextMesh,
      faces: normalizeMeshFaces(nextFaces),
    }),
    selectedVertexIndex: midpointId,
    selectedEdgeId: null,
    selectedFaceIndex: null,
  };
};

export const getMeshAverageNormal = (
  mesh: ObjectMeshData,
  faceIds: number[],
): Vec3 | null => {
  const normal = new THREE.Vector3();
  let count = 0;

  faceIds.forEach((faceId) => {
    const face = mesh.faces[faceId];
    if (!face) return;

    normal.add(new THREE.Vector3(...getSafeFaceNormal(mesh, face)));
    count += 1;
  });

  if (count === 0 || normal.lengthSq() < 0.000001) return null;

  normal.normalize();
  return [normal.x, normal.y, normal.z];
};

export const getMeshVertexNormal = (
  mesh: ObjectMeshData,
  vertexId: number,
): Vec3 | null => {
  const faceIds = mesh.faces
    .map((face, faceIndex) => (face.vertices.includes(vertexId) ? faceIndex : -1))
    .filter((faceIndex) => faceIndex >= 0);

  return getMeshAverageNormal(mesh, faceIds);
};

const getMeshVertexNeighborMap = (mesh: ObjectMeshData) => {
  const neighbors = new Map<number, Set<number>>();

  mesh.vertices.forEach((_, vertexId) => {
    neighbors.set(vertexId, new Set<number>());
  });

  mesh.faces.forEach((face) => {
    face.vertices.forEach((vertexId, index) => {
      const previousId =
        face.vertices[(index - 1 + face.vertices.length) % face.vertices.length];
      const nextId = face.vertices[(index + 1) % face.vertices.length];

      if (!mesh.vertices[vertexId]) return;
      if (mesh.vertices[previousId]) neighbors.get(vertexId)?.add(previousId);
      if (mesh.vertices[nextId]) neighbors.get(vertexId)?.add(nextId);
    });
  });

  return neighbors;
};

const getSelectionNormalVector = (mesh: ObjectMeshData, vertexIds: number[]) => {
  const normal = new THREE.Vector3();

  vertexIds.forEach((vertexId) => {
    const vertexNormal = getMeshVertexNormal(mesh, vertexId);
    if (vertexNormal) normal.add(new THREE.Vector3(...vertexNormal));
  });

  if (normal.lengthSq() < 0.000001) {
    normal.set(0, 1, 0);
  }

  return normal.normalize();
};

const getVertexNormalVector = (
  mesh: ObjectMeshData,
  vertexId: number,
  fallback: THREE.Vector3,
) => {
  const vertexNormal = getMeshVertexNormal(mesh, vertexId);
  const normal = vertexNormal
    ? new THREE.Vector3(...vertexNormal)
    : fallback.clone();

  if (normal.lengthSq() < 0.000001) {
    return fallback.clone();
  }

  return normal.normalize();
};

const getSculptFalloffWeight = (
  distance: number,
  radius: number,
  falloff: SculptFalloff,
) => {
  if (falloff === "constant") return 1;

  const t = Math.max(0, Math.min(1, 1 - distance / radius));
  if (falloff === "linear") return t;

  return t * t * (3 - 2 * t);
};

const getSculptBrushTargets = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  radius: number,
  falloff: SculptFalloff,
  symmetryX: boolean,
) => {
  const selected = new Set(vertexIds);
  const center = getMeshSelectionCenter(mesh, vertexIds);
  if (!center) return new Map<number, { center: THREE.Vector3; weight: number }>();

  const safeRadius = Math.max(0.001, Math.abs(radius));
  const centers = [new THREE.Vector3(...center)];
  if (symmetryX && Math.abs(center[0]) > 0.000001) {
    centers.push(new THREE.Vector3(-center[0], center[1], center[2]));
  }

  const targets = new Map<number, { center: THREE.Vector3; weight: number }>();

  mesh.vertices.forEach((vertex, vertexId) => {
    const point = new THREE.Vector3(...(vertex as Vec3));
    let bestWeight = selected.has(vertexId) ? 1 : 0;
    let bestCenter = centers[0];

    centers.forEach((brushCenter) => {
      const distance = point.distanceTo(brushCenter);
      if (distance > safeRadius) return;

      const weight = getSculptFalloffWeight(distance, safeRadius, falloff);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestCenter = brushCenter;
      }
    });

    if (bestWeight > 0) {
      targets.set(vertexId, {
        center: bestCenter.clone(),
        weight: bestWeight,
      });
    }
  });

  return targets;
};

const deterministicSignedNoise = (vertexId: number, seed: number) => {
  const value = Math.sin((vertexId + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
};

const weldMeshVerticesByPosition = (
  mesh: ObjectMeshData,
  gridSize: number,
): ObjectMeshData => {
  const safeGridSize = Math.max(0.0001, gridSize);
  const vertexMap = new Map<number, number>();
  const positionMap = new Map<string, number>();
  const vertices: Vec3[] = [];

  mesh.vertices.forEach((vertex, vertexId) => {
    const point: Vec3 = [
      Math.round(Number(vertex[0] || 0) / safeGridSize) * safeGridSize,
      Math.round(Number(vertex[1] || 0) / safeGridSize) * safeGridSize,
      Math.round(Number(vertex[2] || 0) / safeGridSize) * safeGridSize,
    ];
    const key = point.map((value) => value.toFixed(5)).join("_");
    const existingId = positionMap.get(key);

    if (existingId !== undefined) {
      vertexMap.set(vertexId, existingId);
      return;
    }

    positionMap.set(key, vertices.length);
    vertexMap.set(vertexId, vertices.length);
    vertices.push(point);
  });

  return withUsedMeshGroups({
    ...mesh,
    vertices,
    faces: normalizeMeshFaces(
      mesh.faces.map((face) => ({
        ...cloneFace(face),
        vertices: face.vertices
          .map((vertexId) => vertexMap.get(vertexId))
          .filter((vertexId): vertexId is number => vertexId !== undefined),
      })),
    ),
  });
};

export const pushPullMeshVerticesAlongNormal = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  normal: Vec3,
  distance: number,
): ObjectMeshData => {
  const direction = new THREE.Vector3(...normal);
  if (direction.lengthSq() < 0.000001) return recomputeMeshNormals(cloneMesh(mesh));

  direction.normalize().multiplyScalar(distance);
  return translateMeshVertices(mesh, vertexIds, [
    direction.x,
    direction.y,
    direction.z,
  ]);
};

export const setMeshFacesGroup = (
  mesh: ObjectMeshData,
  faceIds: number[],
  groupName: string,
): ObjectMeshData => {
  const selectedFaces = new Set(
    faceIds.filter((faceId) => Number.isInteger(faceId) && !!mesh.faces[faceId]),
  );
  const safeGroupName = groupName.trim() || `group_${(mesh.groups || []).length + 1}`;
  if (selectedFaces.size === 0) {
    return recomputeMeshNormals(withUsedMeshGroups(cloneMesh(mesh)));
  }

  const nextMesh = cloneMesh(mesh);
  nextMesh.faces = nextMesh.faces.map((face, faceIndex) =>
    selectedFaces.has(faceIndex)
      ? {
          ...cloneFace(face),
          group: safeGroupName,
        }
      : cloneFace(face),
  );

  return recomputeMeshNormals(withUsedMeshGroups(nextMesh));
};

export const ungroupMeshFaces = (
  mesh: ObjectMeshData,
  faceIds: number[],
): ObjectMeshData => {
  const selectedFaces = new Set(
    faceIds.filter((faceId) => Number.isInteger(faceId) && !!mesh.faces[faceId]),
  );
  if (selectedFaces.size === 0) {
    return recomputeMeshNormals(withUsedMeshGroups(cloneMesh(mesh)));
  }

  const nextMesh = cloneMesh(mesh);
  nextMesh.faces = nextMesh.faces.map((face, faceIndex) => {
    const nextFace = cloneFace(face);
    if (selectedFaces.has(faceIndex)) {
      delete nextFace.group;
    }
    return nextFace;
  });

  return recomputeMeshNormals(withUsedMeshGroups(nextMesh));
};

export const sculptMeshSelection = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  tool: SculptTool,
  strength: number,
  radius: number,
  falloff: SculptFalloff,
  symmetryX = false,
): ObjectMeshData => {
  const validVertexIds = Array.from(
    new Set(vertexIds.filter((vertexId) => !!mesh.vertices[vertexId])),
  );
  if (validVertexIds.length === 0) {
    return recomputeMeshNormals(cloneMesh(mesh));
  }

  const brushTargets = getSculptBrushTargets(
    mesh,
    validVertexIds,
    radius,
    falloff,
    symmetryX,
  );
  if (brushTargets.size === 0) {
    return recomputeMeshNormals(cloneMesh(mesh));
  }

  const selectedNormal = getSelectionNormalVector(mesh, validVertexIds);
  const sourceVertices = mesh.vertices.map(
    (vertex) => new THREE.Vector3(...(vertex as Vec3)),
  );
  const nextMesh = cloneMesh(mesh);
  const neighbors = getMeshVertexNeighborMap(mesh);
  const safeStrength = Number.isFinite(strength) ? strength : 0;

  brushTargets.forEach((target, vertexId) => {
    const sourcePoint = sourceVertices[vertexId];
    if (!sourcePoint) return;

    const point = sourcePoint.clone();
    const weight = Math.max(0, Math.min(1, target.weight));
    const vertexNormal = getVertexNormalVector(mesh, vertexId, selectedNormal);

    if (tool === "grab") {
      point.add(selectedNormal.clone().multiplyScalar(safeStrength * weight));
    } else if (tool === "inflate") {
      point.add(vertexNormal.multiplyScalar(safeStrength * weight));
    } else if (tool === "pinch") {
      point.add(
        target.center
          .clone()
          .sub(point)
          .multiplyScalar(Math.max(-1, Math.min(1, safeStrength * weight))),
      );
    } else if (tool === "flatten") {
      const planeDelta = point.clone().sub(target.center);
      const distance = planeDelta.dot(selectedNormal);
      point.add(
        selectedNormal
          .clone()
          .multiplyScalar(-distance * Math.max(0, Math.min(1, Math.abs(safeStrength) * weight))),
      );
    } else if (tool === "smooth") {
      const neighborIds = Array.from(neighbors.get(vertexId) || []);
      if (neighborIds.length > 0) {
        const average = new THREE.Vector3();
        neighborIds.forEach((neighborId) => {
          const neighbor = sourceVertices[neighborId];
          if (neighbor) average.add(neighbor);
        });
        average.multiplyScalar(1 / neighborIds.length);
        point.lerp(average, Math.max(0, Math.min(1, Math.abs(safeStrength) * weight)));
      }
    } else {
      const noise = deterministicSignedNoise(vertexId, safeStrength + radius);
      point.add(vertexNormal.multiplyScalar(noise * safeStrength * weight));
    }

    nextMesh.vertices[vertexId] = [point.x, point.y, point.z];
  });

  return recomputeMeshNormals(nextMesh);
};

export const simplifyMeshSelection = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  gridSize: number,
): ObjectMeshData => {
  const validVertexIds = Array.from(
    new Set(vertexIds.filter((vertexId) => !!mesh.vertices[vertexId])),
  );
  if (validVertexIds.length === 0) {
    return recomputeMeshNormals(cloneMesh(mesh));
  }

  return recomputeMeshNormals(
    weldMeshVerticesByPosition(
      snapMeshVertices(mesh, validVertexIds, Math.max(0.001, gridSize)),
      Math.max(0.001, gridSize),
    ),
  );
};

export const duplicateMeshSelection = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  faceIds: number[] = [],
  offset: Vec3 = [0.125, 0, 0.125],
): MeshSelectionOperationResult => {
  const selectedVertices = new Set(
    vertexIds.filter((vertexId) => !!mesh.vertices[vertexId]),
  );
  const selectedFaces = new Set(
    faceIds.filter((faceId) => !!mesh.faces[faceId]),
  );

  selectedFaces.forEach((faceId) => {
    mesh.faces[faceId]?.vertices.forEach((vertexId) => {
      if (mesh.vertices[vertexId]) selectedVertices.add(vertexId);
    });
  });

  if (selectedVertices.size === 0) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndices: [],
      selectedFaceIndices: [],
    };
  }

  const nextMesh = cloneMesh(mesh);
  const vertexMap = new Map<number, number>();
  Array.from(selectedVertices)
    .sort((a, b) => a - b)
    .forEach((vertexId) => {
      const vertex = mesh.vertices[vertexId] as Vec3 | undefined;
      if (!vertex) return;

      nextMesh.vertices.push([
        Number(vertex[0] || 0) + offset[0],
        Number(vertex[1] || 0) + offset[1],
        Number(vertex[2] || 0) + offset[2],
      ]);
      vertexMap.set(vertexId, nextMesh.vertices.length - 1);
    });

  const selectedFaceIndices: number[] = [];
  Array.from(selectedFaces)
    .sort((a, b) => a - b)
    .forEach((faceId) => {
      const face = mesh.faces[faceId];
      if (!face) return;

      const copiedVertices = face.vertices
        .map((vertexId) => vertexMap.get(vertexId))
        .filter((vertexId): vertexId is number => vertexId !== undefined);
      if (copiedVertices.length < 3) return;

      nextMesh.faces.push({
        ...cloneFace(face),
        name: `${getFaceName(face, `face_${faceId}`)}_copy`,
        vertices: copiedVertices,
      });
      selectedFaceIndices.push(nextMesh.faces.length - 1);
    });

  return {
    mesh: recomputeMeshNormals(nextMesh),
    selectedVertexIndices: Array.from(vertexMap.values()),
    selectedFaceIndices,
  };
};

export const duplicateMirrorMeshSelection = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  faceIds: number[] = [],
  axis: "x" | "z" = "x",
  pivot = 0,
): MeshSelectionOperationResult => {
  const selectedVertices = new Set(
    vertexIds.filter((vertexId) => !!mesh.vertices[vertexId]),
  );
  const selectedFaces = new Set(
    faceIds.filter((faceId) => !!mesh.faces[faceId]),
  );

  selectedFaces.forEach((faceId) => {
    mesh.faces[faceId]?.vertices.forEach((vertexId) => {
      if (mesh.vertices[vertexId]) selectedVertices.add(vertexId);
    });
  });

  if (selectedVertices.size === 0) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndices: [],
      selectedFaceIndices: [],
    };
  }

  const axisIndex = axis === "x" ? 0 : 2;
  const nextMesh = cloneMesh(mesh);
  const vertexMap = new Map<number, number>();

  Array.from(selectedVertices)
    .sort((a, b) => a - b)
    .forEach((vertexId) => {
      const source = mesh.vertices[vertexId] as Vec3 | undefined;
      if (!source) return;

      const mirrored = [...source] as Vec3;
      mirrored[axisIndex] = pivot - (Number(mirrored[axisIndex] || 0) - pivot);
      nextMesh.vertices.push(mirrored);
      vertexMap.set(vertexId, nextMesh.vertices.length - 1);
    });

  const selectedFaceIndices: number[] = [];
  Array.from(selectedFaces)
    .sort((a, b) => a - b)
    .forEach((faceId) => {
      const face = mesh.faces[faceId];
      if (!face) return;

      const copiedVertices = [...face.vertices]
        .reverse()
        .map((vertexId) => vertexMap.get(vertexId))
        .filter((vertexId): vertexId is number => vertexId !== undefined);
      if (copiedVertices.length < 3) return;

      nextMesh.faces.push({
        ...cloneFace(face),
        name: `${getFaceName(face, `face_${faceId}`)}_mirror_${axis}`,
        vertices: copiedVertices,
      });
      selectedFaceIndices.push(nextMesh.faces.length - 1);
    });

  return {
    mesh: recomputeMeshNormals(nextMesh),
    selectedVertexIndices: Array.from(vertexMap.values()),
    selectedFaceIndices,
  };
};

export const mirrorMeshVertices = (
  mesh: ObjectMeshData,
  vertexIds: number[],
  axis: "x" | "z",
  pivot = 0,
): ObjectMeshData => {
  const selected = new Set(vertexIds);
  if (selected.size === 0) return recomputeMeshNormals(cloneMesh(mesh));

  const axisIndex = axis === "x" ? 0 : 2;
  const nextMesh: ObjectMeshData = {
    ...cloneMesh(mesh),
    vertices: mesh.vertices.map((vertex, vertexId) => {
      if (!selected.has(vertexId)) return [...vertex] as Vec3;

      const mirrored = [...vertex] as Vec3;
      mirrored[axisIndex] = pivot - (Number(mirrored[axisIndex] || 0) - pivot);
      return mirrored;
    }),
    faces: mesh.faces.map((face) => {
      const mirroredWholeFace = face.vertices.every((vertexId) =>
        selected.has(vertexId),
      );

      return {
        ...cloneFace(face),
        vertices: mirroredWholeFace ? [...face.vertices].reverse() : [...face.vertices],
      };
    }),
  };

  return recomputeMeshNormals(nextMesh);
};

export const bevelMeshEdge = (
  mesh: ObjectMeshData,
  edgeId: string,
  amount: number,
): MeshTopologyOperationResult => {
  const edge = getMeshEdges(mesh).find((candidate) => candidate.id === edgeId);
  if (!edge) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: null,
      selectedFaceIndex: null,
    };
  }

  const start = mesh.vertices[edge.vertices[0]] as Vec3 | undefined;
  const end = mesh.vertices[edge.vertices[1]] as Vec3 | undefined;
  if (!start || !end || edge.faces.length === 0) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: edge.id,
      selectedFaceIndex: null,
    };
  }

  const safeAmount = Math.max(0.001, Math.min(1, Math.abs(amount)));
  const edgeStart = new THREE.Vector3(...start);
  const edgeEnd = new THREE.Vector3(...end);
  const edgeMidpoint = edgeStart.clone().add(edgeEnd).multiplyScalar(0.5);
  const edgeDirection = edgeEnd.clone().sub(edgeStart);
  if (edgeDirection.lengthSq() < 0.000001) {
    return {
      mesh: recomputeMeshNormals(cloneMesh(mesh)),
      selectedVertexIndex: null,
      selectedEdgeId: edge.id,
      selectedFaceIndex: null,
    };
  }
  edgeDirection.normalize();

  const nextMesh = cloneMesh(mesh);
  const bevelVertexPairs: { faceId: number; startId: number; endId: number }[] = [];
  const adjacentFaceIds = edge.faces.slice(0, 2);
  const adjacentFaceIdSet = new Set(adjacentFaceIds);
  const nextFaces: ObjectMeshFace[] = [];

  nextMesh.faces.forEach((face, faceIndex) => {
    if (!adjacentFaceIdSet.has(faceIndex)) {
      nextFaces.push(cloneFace(face));
      return;
    }

    const faceCenter = getFaceCenter(mesh, face);
    const faceNormal = new THREE.Vector3(...getSafeFaceNormal(mesh, face));
    const faceDirection = faceCenter.sub(edgeMidpoint);
    faceDirection.sub(edgeDirection.clone().multiplyScalar(faceDirection.dot(edgeDirection)));

    if (faceDirection.lengthSq() < 0.000001) {
      faceDirection.copy(faceNormal.cross(edgeDirection));
    }

    if (faceDirection.lengthSq() < 0.000001) {
      faceDirection.set(0, 1, 0);
    }

    faceDirection.normalize().multiplyScalar(safeAmount);
    const newStart = edgeStart.clone().add(faceDirection);
    const newEnd = edgeEnd.clone().add(faceDirection);
    nextMesh.vertices.push([newStart.x, newStart.y, newStart.z]);
    const newStartId = nextMesh.vertices.length - 1;
    nextMesh.vertices.push([newEnd.x, newEnd.y, newEnd.z]);
    const newEndId = nextMesh.vertices.length - 1;

    bevelVertexPairs.push({
      faceId: faceIndex,
      startId: newStartId,
      endId: newEndId,
    });

    nextFaces.push({
      ...cloneFace(face),
      name: `${getFaceName(face, `face_${faceIndex}`)}_beveled`,
      vertices: face.vertices.map((vertexId) => {
        if (vertexId === edge.vertices[0]) return newStartId;
        if (vertexId === edge.vertices[1]) return newEndId;
        return vertexId;
      }),
    });
  });

  if (bevelVertexPairs.length === 1) {
    const pair = bevelVertexPairs[0];
    const sourceFace = mesh.faces[pair.faceId];
    if (!sourceFace) {
      return {
        mesh: recomputeMeshNormals(cloneMesh(mesh)),
        selectedVertexIndex: null,
        selectedEdgeId: edge.id,
        selectedFaceIndex: null,
      };
    }

    nextFaces.push({
      name: `${getFaceName(sourceFace, `edge_${edge.id}`)}_bevel`,
      vertices: [edge.vertices[0], edge.vertices[1], pair.endId, pair.startId],
      material: sourceFace.material,
      group: sourceFace.group,
    });
  } else if (bevelVertexPairs.length >= 2) {
    const first = bevelVertexPairs[0];
    const second = bevelVertexPairs[1];
    const sourceFace = mesh.faces[first.faceId];
    if (!sourceFace) {
      return {
        mesh: recomputeMeshNormals(cloneMesh(mesh)),
        selectedVertexIndex: null,
        selectedEdgeId: edge.id,
        selectedFaceIndex: null,
      };
    }

    nextFaces.push({
      name: `${getFaceName(sourceFace, `edge_${edge.id}`)}_bevel`,
      vertices: [first.startId, first.endId, second.endId, second.startId],
      material: sourceFace.material,
      group: sourceFace.group,
    });
  }

  const compacted = compactMeshVertices({
    ...nextMesh,
    faces: normalizeMeshFaces(nextFaces),
  });
  const selectedFaceIndex =
    compacted.faces.length === 0 ? null : compacted.faces.length - 1;

  return {
    mesh: recomputeMeshNormals(compacted),
    selectedVertexIndex: null,
    selectedEdgeId: null,
    selectedFaceIndex,
  };
};

export const getMeshBounds = (mesh: ObjectMeshData): Vec3 => {
  return getMeshBoundsInfo(mesh).size;
};

export const getMeshBoundsInfo = (mesh: ObjectMeshData): MeshBoundsInfo => {
  if (mesh.vertices.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      size: [0, 0, 0],
    };
  }

  const xs = mesh.vertices.map((vertex) => Number(vertex[0] || 0));
  const ys = mesh.vertices.map((vertex) => Number(vertex[1] || 0));
  const zs = mesh.vertices.map((vertex) => Number(vertex[2] || 0));
  const min: Vec3 = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
  const max: Vec3 = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
  const size: Vec3 = [
    Math.max(0.01, max[0] - min[0]),
    Math.max(0.01, max[1] - min[1]),
    Math.max(0.01, max[2] - min[2]),
  ];
  const center: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  return { min, max, center, size };
};

export const getObjectVerticalExtents = (object: ObjectData) => {
  if (object.model_kind === "asset" && object.asset) {
    return {
      minY: 0,
      maxY: Math.max(0.01, object.bounds?.[1] || object.asset.source_bounds?.[1] || 1),
    };
  }

  if (hasMeshModel(object) && object.mesh) {
    const ys = object.mesh.vertices.map((vertex) => Number(vertex[1] || 0));
    return {
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  if (object.parts.length === 0) {
    return { minY: 0, maxY: object.bounds?.[1] || 0 };
  }

  return object.parts.reduce(
    (extents, part) => {
      const y = Number(part.position?.[1] || 0);
      const halfHeight = Number(part.size?.[1] || 0) / 2;
      return {
        minY: Math.min(extents.minY, y - halfHeight),
        maxY: Math.max(extents.maxY, y + halfHeight),
      };
    },
    { minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );
};

export const getMeshStats = (object: ObjectData) => ({
  vertices: object.asset?.stats?.vertices || object.mesh?.vertices.length || 0,
  faces: object.asset?.stats?.triangles || object.mesh?.faces.length || 0,
  materials:
    object.asset?.stats?.materials ||
    object.mesh?.material_slots.length ||
    object.materials.length ||
    0,
  groups: object.asset?.stats?.meshes || object.mesh?.groups.length || 0,
});
