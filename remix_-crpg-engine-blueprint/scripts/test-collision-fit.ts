// Collision-fit contract. Run: npm run test:collision-fit
//
// Every solid object's blocked volume is built around its placement cell, and
// so is the model the player sees. When the two disagree the result is a wall
// where there is nothing to see, or a model you can walk through — the failure
// that made the Lonely Street house unplayable (a 2-tile cabinet footprint that
// could not centre sat 0.50 m east of the cabinets; a 2-deep coffee-table
// footprint sat 0.17 m south of the tabletop).
//
// The rule this enforces: a footprint's rasterized box must be CENTRED on the
// model box, within half a fine cell. Any footprint with an even extent on an
// axis violates it by construction, because the placement cell is the centre.
//
// Size is a resolution trade-off rather than a defect — a fine cell is 1/3 m and
// a prop is whatever size it is — so oversize colliders are reported as warnings.

import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { FINE_PER_MACRO } from "../src/engine-core/gridCoordinates";
import type { ObjectData } from "../src/schema/game";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FINE_CELL_M = 1 / FINE_PER_MACRO;
const MAX_CENTER_ERROR_M = FINE_CELL_M / 2;
// A collider may round up to the next whole cell on each side.
const MAX_OVERSIZE_M = FINE_CELL_M * 2;

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
type Vec3 = [number, number, number];
type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type GlbJson = {
  scene?: number;
  scenes: Array<{ nodes?: number[] }>;
  nodes: Array<{
    mesh?: number;
    children?: number[];
    matrix?: Mat4;
    translation?: Vec3;
    rotation?: [number, number, number, number];
    scale?: Vec3;
  }>;
  meshes: Array<{
    primitives: Array<{
      mode?: number;
      indices?: number;
      attributes: { POSITION: number };
    }>;
  }>;
  accessors: Array<{ count: number; min?: Vec3; max?: Vec3 }>;
  materials?: unknown[];
  textures?: unknown[];
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string; bufferView?: number }>;
};

const IDENTITY: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

const multiplyMat4 = (left: Mat4, right: Mat4): Mat4 => {
  const result = Array<number>(16).fill(0) as Mat4;
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[column * 4 + row] +=
          left[inner * 4 + row] * right[column * 4 + inner];
      }
    }
  }
  return result;
};

const nodeMatrix = (node: GlbJson["nodes"][number]): Mat4 => {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [scaleX, scaleY, scaleZ] = node.scale || [1, 1, 1];
  const [translateX, translateY, translateZ] = node.translation || [0, 0, 0];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * scaleX,
    2 * (xy + wz) * scaleX,
    2 * (xz - wy) * scaleX,
    0,
    2 * (xy - wz) * scaleY,
    (1 - 2 * (xx + zz)) * scaleY,
    2 * (yz + wx) * scaleY,
    0,
    2 * (xz + wy) * scaleZ,
    2 * (yz - wx) * scaleZ,
    (1 - 2 * (xx + yy)) * scaleZ,
    0,
    translateX,
    translateY,
    translateZ,
    1,
  ];
};

const transformPoint = (matrix: Mat4, point: Vec3): Vec3 => [
  matrix[0] * point[0] +
    matrix[4] * point[1] +
    matrix[8] * point[2] +
    matrix[12],
  matrix[1] * point[0] +
    matrix[5] * point[1] +
    matrix[9] * point[2] +
    matrix[13],
  matrix[2] * point[0] +
    matrix[6] * point[1] +
    matrix[10] * point[2] +
    matrix[14],
];

const readGlb = (path: string) => {
  const bytes = readFileSync(path);
  const magic = bytes.toString("ascii", 0, 4);
  const version = bytes.readUInt32LE(4);
  const declaredBytes = bytes.readUInt32LE(8);
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.toString("ascii", 16, 20);
  const json = JSON.parse(
    bytes
      .toString("utf8", 20, 20 + jsonLength)
      .replace(/\u0000+$/u, ""),
  ) as GlbJson;
  return { bytes, magic, version, declaredBytes, jsonType, json };
};

const inspectGlb = (json: GlbJson) => {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  let triangles = 0;

  const visit = (nodeIndex: number, parentMatrix: Mat4) => {
    const node = json.nodes[nodeIndex];
    const worldMatrix = multiplyMat4(parentMatrix, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const positionAccessor = json.accessors[primitive.attributes.POSITION];
        vertices += positionAccessor.count;
        const indexCount =
          primitive.indices === undefined
            ? positionAccessor.count
            : json.accessors[primitive.indices].count;
        if ((primitive.mode ?? 4) === 4) triangles += indexCount / 3;
        if (!positionAccessor.min || !positionAccessor.max) continue;
        for (const x of [positionAccessor.min[0], positionAccessor.max[0]]) {
          for (const y of [positionAccessor.min[1], positionAccessor.max[1]]) {
            for (const z of [positionAccessor.min[2], positionAccessor.max[2]]) {
              const transformed = transformPoint(worldMatrix, [x, y, z]);
              for (let axis = 0; axis < 3; axis += 1) {
                min[axis] = Math.min(min[axis], transformed[axis]);
                max[axis] = Math.max(max[axis], transformed[axis]);
              }
            }
          }
        }
      }
    }
    for (const child of node.children || []) visit(child, worldMatrix);
  };

  const scene = json.scenes[json.scene ?? 0];
  for (const rootNode of scene.nodes || []) visit(rootNode, IDENTITY);
  return {
    min,
    max,
    bounds: max.map((value, axis) => value - min[axis]) as Vec3,
    vertices,
    triangles,
    meshes: json.meshes.length,
    materials: json.materials?.length || 0,
    textures: json.textures?.length || 0,
    selfContained:
      (json.buffers || []).every((buffer) => !buffer.uri) &&
      (json.images || []).every(
        (image) => !image.uri && image.bufferView !== undefined,
      ),
  };
};

const vecNear = (left: readonly unknown[], right: readonly unknown[], tolerance = 0.002) =>
  left.length === right.length &&
  left.every(
    (value, index) =>
      Math.abs(Number(value) - Number(right[index])) <= tolerance,
  );

const colliderBox = (object: ObjectData): Box | null => {
  const collision = object.collision;
  if (!collision || collision.profile === "none") return null;

  const fine = collision.fine_footprint;
  const cells = fine?.length
    ? fine
    : collision.footprint?.length
      ? collision.footprint
      : [[0, 0] as const];
  const scale = fine?.length ? FINE_CELL_M : 1;
  const half = scale / 2;
  const xs = cells.map((cell) => Number(cell[0]) * scale);
  const zs = cells.map((cell) => Number(cell[1]) * scale);
  return {
    minX: Math.min(...xs) - half,
    maxX: Math.max(...xs) + half,
    minZ: Math.min(...zs) - half,
    maxZ: Math.max(...zs) + half,
  };
};

// Objects whose collider is deliberately not a fitted copy of their model.
const OVERSIZE_BY_DESIGN = (object: ObjectData): string | null => {
  if (object.category === "door" || object.tags?.includes("door")) {
    return "a closed door seals its whole doorway tile, not just its slab";
  }
  if (object.tags?.includes("room_shell")) {
    return "the shell's collider is a boundary ring, not a solid body";
  }
  return null;
};

let failures = 0;
let warnings = 0;
let exempt = 0;
let checked = 0;
let glbFailures = 0;
let glbChecked = 0;
const qaPackage = createQaSuitePackage();

for (const object of qaPackage.object_library) {
  const box = colliderBox(object);
  const width = Number(object.bounds?.[0] || 0);
  const depth = Number(object.bounds?.[2] || 0);
  if (!box || !width || !depth) continue;
  checked += 1;

  const offsetX = (box.minX + box.maxX) / 2;
  const offsetZ = (box.minZ + box.maxZ) / 2;
  const label = `${object.display_name} (${object.id})`;

  if (
    Math.abs(offsetX) > MAX_CENTER_ERROR_M + 1e-9 ||
    Math.abs(offsetZ) > MAX_CENTER_ERROR_M + 1e-9
  ) {
    failures += 1;
    console.log(
      `  ✗ ${label}\n` +
        `      collider centre is (${offsetX.toFixed(3)}, ${offsetZ.toFixed(3)}) m from the model centre\n` +
        `      an even footprint extent cannot centre on the placement cell — use an odd one`,
    );
    continue;
  }

  const exemption = OVERSIZE_BY_DESIGN(object);
  if (exemption) {
    exempt += 1;
    console.log(`  ~ ${label}\n      ${exemption}`);
    continue;
  }

  const oversizeX = box.maxX - box.minX - width;
  const oversizeZ = box.maxZ - box.minZ - depth;
  if (oversizeX > MAX_OVERSIZE_M || oversizeZ > MAX_OVERSIZE_M) {
    warnings += 1;
    console.log(
      `  ! ${label}\n` +
        `      collider is ${oversizeX.toFixed(2)} x ${oversizeZ.toFixed(2)} m larger than the ` +
        `${width.toFixed(2)} x ${depth.toFixed(2)} m model (invisible bulk)`,
    );
    continue;
  }

  console.log(`  ✓ ${label}`);
}

const basementGlbObjects = qaPackage.object_library.filter(
  (object) =>
    object.tags.includes("lonely_street_basement") &&
    object.asset?.source_type === "glb",
);
const basementGlbUrls = new Set(
  basementGlbObjects.map((object) => object.asset?.data_url),
);
if (basementGlbObjects.length !== 18 || basementGlbUrls.size !== 18) {
  glbFailures += 1;
  console.log(
    `  ✗ modular basement asset registry\n` +
      `      expected 18 unique GLBs, got ${basementGlbObjects.length} objects and ${basementGlbUrls.size} URLs`,
  );
}

for (const object of basementGlbObjects) {
  glbChecked += 1;
  const asset = object.asset!;
  const assetPath = resolve(
    process.cwd(),
    "public",
    asset.data_url.replace(/^\/+/, ""),
  );
  const parsed = readGlb(assetPath);
  const measured = inspectGlb(parsed.json);
  const expectedCenter = measured.min.map(
    (value, axis) => (value + measured.max[axis]) * 0.5,
  ) as Vec3;
  const expectedOffset: Vec3 = [
    -expectedCenter[0],
    -measured.min[1],
    -expectedCenter[2],
  ];
  const issues: string[] = [];
  if (parsed.magic !== "glTF") issues.push(`magic=${parsed.magic}`);
  if (parsed.version !== 2) issues.push(`version=${parsed.version}`);
  if (parsed.declaredBytes !== parsed.bytes.length) {
    issues.push(
      `declared bytes=${parsed.declaredBytes}, actual=${parsed.bytes.length}`,
    );
  }
  if (parsed.jsonType !== "JSON") issues.push(`first chunk=${parsed.jsonType}`);
  if (!measured.selfContained) issues.push("contains external buffer/image URI");
  if (asset.data_url.endsWith("-staged.glb")) {
    issues.push("runtime points at staged aggregate instead of modular asset");
  }
  if (asset.stats.meshes !== measured.meshes) {
    issues.push(`meshes=${measured.meshes}, metadata=${asset.stats.meshes}`);
  }
  if (asset.stats.vertices !== measured.vertices) {
    issues.push(`vertices=${measured.vertices}, metadata=${asset.stats.vertices}`);
  }
  if (asset.stats.triangles !== measured.triangles) {
    issues.push(`triangles=${measured.triangles}, metadata=${asset.stats.triangles}`);
  }
  if (asset.stats.materials !== measured.materials) {
    issues.push(
      `materials=${measured.materials}, metadata=${asset.stats.materials}`,
    );
  }
  if (asset.stats.textures !== measured.textures) {
    issues.push(`textures=${measured.textures}, metadata=${asset.stats.textures}`);
  }
  if (asset.stats.bytes !== parsed.bytes.length) {
    issues.push(`bytes=${parsed.bytes.length}, metadata=${asset.stats.bytes}`);
  }
  if (!vecNear(asset.source_min, measured.min)) {
    issues.push(
      `source_min=${asset.source_min.join(",")}, binary=${measured.min.join(",")}`,
    );
  }
  if (!vecNear(asset.source_center, expectedCenter)) {
    issues.push(
      `source_center=${asset.source_center.join(",")}, binary=${expectedCenter.join(",")}`,
    );
  }
  if (!vecNear(asset.source_bounds, measured.bounds)) {
    issues.push(
      `source_bounds=${asset.source_bounds.join(",")}, binary=${measured.bounds.join(",")}`,
    );
  }
  if (!vecNear(object.bounds, measured.bounds)) {
    issues.push(
      `object bounds=${object.bounds.join(",")}, binary=${measured.bounds.join(",")}`,
    );
  }
  if (!vecNear(asset.offset, expectedOffset)) {
    issues.push(
      `center-floor offset=${asset.offset.join(",")}, expected=${expectedOffset.join(",")}`,
    );
  }

  if (issues.length > 0) {
    glbFailures += 1;
    console.log(
      `  ✗ ${object.display_name} (${asset.filename})\n` +
        issues.map((issue) => `      ${issue}`).join("\n"),
    );
  } else {
    console.log(`  ✓ ${object.display_name} binary/metadata contract`);
  }
}

console.log(
  `\ncollision fit: ${checked - failures - warnings - exempt}/${checked} fitted, ` +
    `${exempt} exempt by design, ${warnings} oversize, ${failures} off-centre`,
);
console.log(
  `basement GLB contract: ${glbChecked - glbFailures}/${glbChecked} binaries matched engine metadata`,
);
if (failures > 0 || glbFailures > 0) {
  console.error(
    `\ncollision/asset contract: ${failures + glbFailures} object(s) FAILED`,
  );
  process.exit(1);
}
