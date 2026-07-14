// Canonical JSON and a small deterministic content hash for generation
// diagnostics. This is deliberately synchronous and platform-independent; it
// is an integrity/replay fingerprint, not a cryptographic signature.

const canonicalize = (value: unknown, seen: Set<object>): unknown => {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Cannot canonicalize a non-finite number");
    }
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
      throw new TypeError(`Cannot canonicalize ${typeof value}`);
    }
    return value;
  }

  if (seen.has(value)) throw new TypeError("Cannot canonicalize a cyclic value");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => (entry === undefined ? null : canonicalize(entry, seen)));
    }

    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] === undefined) continue;
      result[key] = canonicalize(record[key], seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
};

export const stableJsonStringify = (value: unknown): string =>
  JSON.stringify(canonicalize(value, new Set()));

export const stableContentHash = (value: unknown): string => {
  const input = stableJsonStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  // Hash UTF-16 code units explicitly so the result is identical in browsers
  // and Node without depending on TextEncoder availability.
  for (let index = 0; index < input.length; index += 1) {
    const codeUnit = input.charCodeAt(index);
    hash ^= BigInt(codeUnit & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt(codeUnit >>> 8);
    hash = (hash * prime) & mask;
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
};
