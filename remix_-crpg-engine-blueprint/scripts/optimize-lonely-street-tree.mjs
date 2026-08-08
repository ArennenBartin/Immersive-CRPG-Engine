import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";
import sharp from "sharp";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const TEXTURE_SIZE = 512;
const TARGET_TRIANGLES = 1008;
// This asset is used as repeated background foliage. The explicit triangle
// budget is the fidelity guard; a permissive simplification ceiling lets
// meshoptimizer reach it instead of silently retaining most of the source.
const TARGET_ERROR = 1;
const FLOAT_COMPONENT_TYPE = 5126;
const UNSIGNED_SHORT_COMPONENT_TYPE = 5123;
const UNSIGNED_INT_COMPONENT_TYPE = 5125;
const TRIANGLES_MODE = 4;
const ARRAY_BUFFER_TARGET = 34962;
const ELEMENT_ARRAY_BUFFER_TARGET = 34963;
const UNUSED_EXTENSIONS = new Set([
  "KHR_materials_volume",
  "FB_ngon_encoding",
]);

const inputPath = process.argv[2];
const outputPath = resolve(
  process.argv[3] || "public/models/environment/autumn-tree.glb",
);

if (!inputPath) {
  throw new Error(
    "Usage: node scripts/optimize-lonely-street-tree.mjs <source.glb> [output.glb]",
  );
}

const padToFourBytes = (buffer, fill = 0) => {
  const padding = (4 - (buffer.byteLength % 4)) % 4;
  return padding
    ? Buffer.concat([buffer, Buffer.alloc(padding, fill)])
    : buffer;
};

const parseGlb = (buffer) => {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Source is not a GLB file");
  }
  if (buffer.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("Only glTF 2.0 GLB files are supported");
  }

  let offset = 12;
  let json;
  let binary;
  while (offset < buffer.byteLength) {
    const byteLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + byteLength);
    offset += 8 + byteLength;
    if (type === JSON_CHUNK_TYPE) {
      json = JSON.parse(chunk.toString("utf8").replace(/[\0\s]+$/u, ""));
    } else if (type === BIN_CHUNK_TYPE) {
      binary = chunk;
    }
  }

  if (!json || !binary) throw new Error("GLB must contain JSON and BIN chunks");
  return { json, binary };
};

const readAccessor = (json, binary, accessorIndex) => {
  const accessor = json.accessors?.[accessorIndex];
  const view = json.bufferViews?.[accessor?.bufferView];
  if (!accessor || !view) throw new Error(`Missing accessor ${accessorIndex}`);
  if (view.byteStride) {
    throw new Error(`Accessor ${accessorIndex} must not be interleaved`);
  }

  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return {
    accessor,
    view,
    bytes: binary.subarray(byteOffset, byteOffset + view.byteLength),
  };
};

const readIndices = ({ accessor, bytes }) => {
  if (accessor.type !== "SCALAR") {
    throw new Error("Tree index accessor must use scalar values");
  }
  if (accessor.componentType === UNSIGNED_SHORT_COMPONENT_TYPE) {
    return new Uint32Array(
      new Uint16Array(
        bytes.buffer,
        bytes.byteOffset,
        accessor.count,
      ),
    );
  }
  if (accessor.componentType === UNSIGNED_INT_COMPONENT_TYPE) {
    return new Uint32Array(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + accessor.count * Uint32Array.BYTES_PER_ELEMENT,
      ),
    );
  }
  throw new Error("Tree indices must use unsigned 16-bit or 32-bit values");
};

const readPositions = ({ accessor, bytes }) => {
  if (
    accessor.type !== "VEC3" ||
    accessor.componentType !== FLOAT_COMPONENT_TYPE
  ) {
    throw new Error("Tree positions must use float VEC3 values");
  }
  return new Float32Array(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + accessor.count * 3 * Float32Array.BYTES_PER_ELEMENT,
    ),
  );
};

const stripUnusedExtensions = (json) => {
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (!Array.isArray(json[key])) continue;
    json[key] = json[key].filter((extension) => !UNUSED_EXTENSIONS.has(extension));
    if (json[key].length === 0) delete json[key];
  }
};

const source = readFileSync(resolve(inputPath));
const { json, binary } = parseGlb(source);
if (json.buffers?.length !== 1 || json.buffers[0].uri) {
  throw new Error("Expected one embedded GLB buffer");
}
if (json.images?.length !== 1 || json.images[0].mimeType !== "image/jpeg") {
  throw new Error("Expected one embedded JPEG texture");
}

const primitive = json.meshes?.[0]?.primitives?.[0];
if (
  json.meshes?.length !== 1 ||
  json.meshes[0].primitives?.length !== 1 ||
  primitive?.mode !== TRIANGLES_MODE ||
  typeof primitive.indices !== "number" ||
  typeof primitive.attributes?.POSITION !== "number" ||
  typeof primitive.attributes?.TEXCOORD_0 !== "number"
) {
  throw new Error("Expected one indexed, textured triangle mesh");
}
if (json.materials?.[primitive.material]?.doubleSided !== true) {
  throw new Error("Tree material must remain double-sided");
}

const indexData = readAccessor(json, binary, primitive.indices);
const positionData = readAccessor(
  json,
  binary,
  primitive.attributes.POSITION,
);
const textureCoordinateData = readAccessor(
  json,
  binary,
  primitive.attributes.TEXCOORD_0,
);
if (indexData.view.target !== ELEMENT_ARRAY_BUFFER_TARGET) {
  throw new Error("Tree indices must use an element-array buffer view");
}
if (
  positionData.view.target !== ARRAY_BUFFER_TARGET ||
  textureCoordinateData.view.target !== ARRAY_BUFFER_TARGET
) {
  throw new Error("Tree attributes must use array-buffer views");
}

await MeshoptSimplifier.ready;
const sourceIndices = readIndices(indexData);
const positions = readPositions(positionData);
const [simplifiedIndices, simplificationError] = MeshoptSimplifier.simplify(
  sourceIndices,
  positions,
  3,
  TARGET_TRIANGLES * 3,
  TARGET_ERROR,
  ["Permissive"],
);
const minimumAcceptedTriangles = Math.floor(TARGET_TRIANGLES * 0.95);
if (
  simplifiedIndices.length > TARGET_TRIANGLES * 3 ||
  simplifiedIndices.length < minimumAcceptedTriangles * 3
) {
  throw new Error(
    `Simplifier produced ${simplifiedIndices.length / 3} triangles; expected ${minimumAcceptedTriangles}-${TARGET_TRIANGLES}`,
  );
}
const maximumIndex = simplifiedIndices.reduce(
  (maximum, index) => Math.max(maximum, index),
  0,
);
const minimumIndex = simplifiedIndices.reduce(
  (minimum, index) => Math.min(minimum, index),
  Number.POSITIVE_INFINITY,
);
if (maximumIndex > 0xffff) {
  throw new Error("Simplified tree exceeds the unsigned 16-bit index range");
}
const optimizedIndices = Buffer.from(
  new Uint16Array(simplifiedIndices).buffer,
);

const imageBufferViewIndex = json.images[0].bufferView;
const imageView = json.bufferViews[imageBufferViewIndex];
const image = binary.subarray(
  imageView.byteOffset || 0,
  (imageView.byteOffset || 0) + imageView.byteLength,
);
const optimizedImage = await sharp(image)
  .resize(TEXTURE_SIZE, TEXTURE_SIZE, {
    fit: "inside",
    withoutEnlargement: true,
    kernel: sharp.kernel.lanczos3,
  })
  .jpeg({
    quality: 84,
    chromaSubsampling: "4:2:0",
    progressive: true,
    mozjpeg: true,
  })
  .toBuffer();

const rebuiltViews = [];
const rebuiltParts = [];
let rebuiltOffset = 0;
json.bufferViews.forEach((view, index) => {
  const sourceBytes = binary.subarray(
    view.byteOffset || 0,
    (view.byteOffset || 0) + view.byteLength,
  );
  const bytes =
    index === imageBufferViewIndex
      ? optimizedImage
      : index === indexData.accessor.bufferView
        ? optimizedIndices
        : sourceBytes;
  const padded = padToFourBytes(bytes);
  rebuiltViews.push({
    ...view,
    byteOffset: rebuiltOffset,
    byteLength: bytes.byteLength,
  });
  rebuiltParts.push(padded);
  rebuiltOffset += padded.byteLength;
});

const rebuiltBinary = Buffer.concat(rebuiltParts);
json.bufferViews = rebuiltViews;
json.buffers[0].byteLength = rebuiltBinary.byteLength;
indexData.accessor.componentType = UNSIGNED_SHORT_COMPONENT_TYPE;
indexData.accessor.count = simplifiedIndices.length;
indexData.accessor.min = [minimumIndex];
indexData.accessor.max = [maximumIndex];
indexData.accessor.byteOffset = 0;
stripUnusedExtensions(json);
json.asset.generator =
  "Tripo; CRPG Engine background-tree optimization (~1K triangles, 512px texture)";
json.scenes[json.scene || 0].name = "Lonely Street Autumn Tree";
json.nodes[0].name = "lonely_street_autumn_tree";
json.meshes[0].name = "lonely_street_autumn_tree_mesh";
json.materials[0].name = "lonely_street_autumn_tree_material";
json.images[0].name = "lonely-street-autumn-tree-basecolor.jpg";

const jsonChunk = padToFourBytes(Buffer.from(JSON.stringify(json)), 0x20);
const totalLength =
  12 + 8 + jsonChunk.byteLength + 8 + rebuiltBinary.byteLength;
const header = Buffer.alloc(12);
header.writeUInt32LE(GLB_MAGIC, 0);
header.writeUInt32LE(GLB_VERSION, 4);
header.writeUInt32LE(totalLength, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
jsonHeader.writeUInt32LE(JSON_CHUNK_TYPE, 4);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(rebuiltBinary.byteLength, 0);
binaryHeader.writeUInt32LE(BIN_CHUNK_TYPE, 4);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  Buffer.concat([
    header,
    jsonHeader,
    jsonChunk,
    binaryHeader,
    rebuiltBinary,
  ]),
);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      sourceBytes: source.byteLength,
      outputBytes: totalLength,
      sourceTextureBytes: image.byteLength,
      outputTextureBytes: optimizedImage.byteLength,
      vertices: positionData.accessor.count,
      sourceTriangles: sourceIndices.length / 3,
      outputTriangles: simplifiedIndices.length / 3,
      simplificationError,
      indexComponentType: UNSIGNED_SHORT_COMPONENT_TYPE,
      sourceIndexBytes: indexData.view.byteLength,
      outputIndexBytes: optimizedIndices.byteLength,
      doubleSided: json.materials[primitive.material].doubleSided,
      uvBytes: textureCoordinateData.view.byteLength,
      extensionsUsed: json.extensionsUsed || [],
      texture: await sharp(optimizedImage).metadata(),
    },
    null,
    2,
  ),
);
