import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const TEXTURE_SIZE = 1024;

const inputPath = process.argv[2];
const outputPath = resolve(
  process.argv[3] || "public/models/player/electric-guitar.glb",
);

if (!inputPath) {
  throw new Error(
    "Usage: node scripts/optimize-player-guitar.mjs <source.glb> [output.glb]",
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
  if (buffer.readUInt32LE(8) !== buffer.byteLength) {
    throw new Error("GLB header length does not match the source file");
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

const hasExtensionPayload = (value, extensionName) => {
  if (!value || typeof value !== "object") return false;
  if (
    value.extensions &&
    typeof value.extensions === "object" &&
    Object.prototype.hasOwnProperty.call(value.extensions, extensionName)
  ) {
    return true;
  }
  return Object.values(value).some((child) =>
    hasExtensionPayload(child, extensionName),
  );
};

const source = readFileSync(resolve(inputPath));
const { json, binary } = parseGlb(source);

if (json.buffers?.length !== 1 || json.buffers[0].uri) {
  throw new Error("Expected one embedded GLB buffer");
}
if (json.images?.length !== 1 || json.images[0].mimeType !== "image/jpeg") {
  throw new Error("Expected one embedded JPEG base-color image");
}

const imageBufferViewIndex = json.images[0].bufferView;
const sourceImageView = json.bufferViews[imageBufferViewIndex];
const sourceImage = binary.subarray(
  sourceImageView.byteOffset || 0,
  (sourceImageView.byteOffset || 0) + sourceImageView.byteLength,
);
const optimizedImage = await sharp(sourceImage)
  .resize(TEXTURE_SIZE, TEXTURE_SIZE, {
    fit: "inside",
    withoutEnlargement: true,
    kernel: sharp.kernel.lanczos3,
  })
  .jpeg({
    quality: 85,
    chromaSubsampling: "4:2:0",
    progressive: true,
    mozjpeg: true,
  })
  .toBuffer();

const rebuiltViews = [];
const rebuiltBinaryParts = [];
let rebuiltByteOffset = 0;
json.bufferViews.forEach((view, index) => {
  if (view.buffer !== 0) throw new Error("Expected every buffer view in buffer 0");
  const sourceBytes = binary.subarray(
    view.byteOffset || 0,
    (view.byteOffset || 0) + view.byteLength,
  );
  const bytes = index === imageBufferViewIndex ? optimizedImage : sourceBytes;
  const paddedBytes = padToFourBytes(bytes);
  rebuiltViews.push({
    ...view,
    byteOffset: rebuiltByteOffset,
    byteLength: bytes.byteLength,
  });
  rebuiltBinaryParts.push(paddedBytes);
  rebuiltByteOffset += paddedBytes.byteLength;
});

const rebuiltBinary = Buffer.concat(rebuiltBinaryParts);
json.bufferViews = rebuiltViews;
json.buffers[0].byteLength = rebuiltBinary.byteLength;

const componentReaders = {
  5120: { bytes: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  5121: { bytes: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  5122: { bytes: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  5123: { bytes: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  5125: { bytes: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  5126: { bytes: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
};
const componentCounts = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

// Tripo's source carries incorrect UV minima. Recompute every authored
// accessor bound so validators and future optimization passes see exact data.
json.accessors.forEach((accessor) => {
  if (accessor.bufferView === undefined || accessor.sparse) return;
  if (!accessor.min && !accessor.max) return;
  const view = json.bufferViews[accessor.bufferView];
  const component = componentReaders[accessor.componentType];
  const componentCount = componentCounts[accessor.type];
  if (!component || !componentCount) return;
  const packedByteLength = component.bytes * componentCount;
  const byteStride = view.byteStride || packedByteLength;
  const firstByte = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const min = Array(componentCount).fill(Number.POSITIVE_INFINITY);
  const max = Array(componentCount).fill(Number.NEGATIVE_INFINITY);
  for (let elementIndex = 0; elementIndex < accessor.count; elementIndex += 1) {
    for (
      let componentIndex = 0;
      componentIndex < componentCount;
      componentIndex += 1
    ) {
      const value = component.read(
        rebuiltBinary,
        firstByte + elementIndex * byteStride + componentIndex * component.bytes,
      );
      min[componentIndex] = Math.min(min[componentIndex], value);
      max[componentIndex] = Math.max(max[componentIndex], value);
    }
  }
  if (accessor.min) accessor.min = min;
  if (accessor.max) accessor.max = max;
});

json.asset.generator = "Tripo; CRPG Engine optimized 1K texture";
json.scenes[json.scene || 0].name = "Player Electric Guitar";
json.nodes[0].name = "player_electric_guitar";
json.meshes[0].name = "player_electric_guitar_mesh";
json.materials[0].name = "player_electric_guitar_material";
json.images[0].name = "electric-guitar-basecolor.jpg";

if (Array.isArray(json.extensionsUsed)) {
  json.extensionsUsed = json.extensionsUsed.filter((extensionName) =>
    hasExtensionPayload(json, extensionName),
  );
  if (json.extensionsUsed.length === 0) delete json.extensionsUsed;
}

const jsonChunk = padToFourBytes(Buffer.from(JSON.stringify(json)), 0x20);
const totalByteLength =
  12 + 8 + jsonChunk.byteLength + 8 + rebuiltBinary.byteLength;
const header = Buffer.alloc(12);
header.writeUInt32LE(GLB_MAGIC, 0);
header.writeUInt32LE(GLB_VERSION, 4);
header.writeUInt32LE(totalByteLength, 8);
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

const imageMetadata = await sharp(optimizedImage).metadata();
console.log(
  JSON.stringify(
    {
      output: outputPath,
      sourceBytes: source.byteLength,
      outputBytes: totalByteLength,
      texture: {
        width: imageMetadata.width,
        height: imageMetadata.height,
        sourceBytes: sourceImage.byteLength,
        outputBytes: optimizedImage.byteLength,
      },
    },
    null,
    2,
  ),
);
