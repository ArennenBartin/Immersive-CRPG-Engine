import { DungeonRoomTemplateSchema } from "../schema";
import type {
  DungeonDiagnostic,
  DungeonRoomTemplateDef,
} from "../types";
import { dungeonDiagnostic } from "../diagnostics";
import type { MacroCell } from "../embedding/gridSearch";

export type DungeonRotation = 0 | 90 | 180 | 270;
type TemplateCell = DungeonRoomTemplateDef["cells"][number];
type PopulationSocket = DungeonRoomTemplateDef["populationSockets"][number];
type PlacedRoom = import("../types").EmbeddedDungeon["rooms"][number];

export interface DungeonTemplateReferenceContext {
  objectIds?: ReadonlySet<string>;
  materialIds?: ReadonlySet<string>;
}

export interface InstantiatedDungeonTemplate {
  room: PlacedRoom;
  cells: Array<Omit<TemplateCell, "cell"> & { cell: MacroCell }>;
  populationSockets: Array<Omit<PopulationSocket, "cell" | "facing"> & {
    cell: MacroCell;
    facing?: MacroCell;
  }>;
  reservedPaths: Array<{ id: string; cells: MacroCell[] }>;
}

export const rotatedTemplateBounds = (
  bounds: { width: number; depth: number },
  rotation: DungeonRotation,
) => rotation === 90 || rotation === 270
  ? { width: bounds.depth, depth: bounds.width }
  : { ...bounds };

/** Rotate a local 0-based coordinate without floating-point pivots. */
export const rotateTemplateCell = (
  cell: readonly [number, number],
  bounds: { width: number; depth: number },
  rotation: DungeonRotation,
): MacroCell => {
  const [x, z] = cell;
  switch (rotation) {
    case 0: return [x, z];
    case 90: return [bounds.depth - 1 - z, x];
    case 180: return [bounds.width - 1 - x, bounds.depth - 1 - z];
    case 270: return [z, bounds.width - 1 - x];
  }
};

export const rotateTemplateFacing = (
  facing: readonly [number, number],
  rotation: DungeonRotation,
): MacroCell => {
  const [x, z] = facing;
  switch (rotation) {
    case 0: return [x, z];
    case 90: return [-z, x];
    case 180: return [-x, -z];
    case 270: return [z, -x];
  }
};

const globalCell = (origin: MacroCell, local: MacroCell): MacroCell =>
  [origin[0] + local[0], origin[1] + local[1]];

const cardinallyConnected = (cells: readonly MacroCell[]) => {
  if (!cells.length) return false;
  const keys = new Set(cells.map(([x, z]) => `${x}:${z}`));
  const reached = new Set<string>();
  const queue = [cells[0]];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, z] = queue[cursor];
    const key = `${x}:${z}`;
    if (reached.has(key)) continue;
    reached.add(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as MacroCell[]) {
      const next: MacroCell = [x + dx, z + dz];
      if (keys.has(`${next[0]}:${next[1]}`)) queue.push(next);
    }
  }
  return reached.size === keys.size;
};

export const auditDungeonRoomTemplate = (
  input: unknown,
  references: DungeonTemplateReferenceContext = {},
): DungeonDiagnostic[] => {
  const parsed = DungeonRoomTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => dungeonDiagnostic(
      "fatal", "room_shapes", "DNG_TEMPLATE_SCHEMA_INVALID",
      `${issue.path.join(".") || "template"}: ${issue.message}`,
    ));
  }
  const template = parsed.data;
  const diagnostics: DungeonDiagnostic[] = [];
  const walkable = new Set(template.cells.filter((cell) => cell.walkable).map((cell) => `${cell.cell[0]}:${cell.cell[1]}`));
  for (const socket of template.connectionSockets) {
    if (!walkable.has(`${socket.cell[0]}:${socket.cell[1]}`)) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "room_shapes", "DNG_TEMPLATE_SOCKET_BLOCKED",
        `Connection socket ${socket.id} is not on a walkable template cell.`,
        { relatedIds: [template.id, socket.id], cell: [...socket.cell] },
      ));
    }
  }
  for (const path of template.reservedPaths) {
    if (!cardinallyConnected(path.cells)) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "room_shapes", "DNG_TEMPLATE_RESERVED_PATH_DISCONNECTED",
        `Reserved path ${path.id} is not cardinally connected.`,
        { relatedIds: [template.id, path.id] },
      ));
    }
    const blocked = path.cells.filter((cell) => !walkable.has(`${cell[0]}:${cell[1]}`));
    if (blocked.length) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "room_shapes", "DNG_TEMPLATE_RESERVED_PATH_BLOCKED",
        `Reserved path ${path.id} crosses blocked template cells.`,
        { relatedIds: [template.id, path.id], cell: [...blocked[0]] },
      ));
    }
  }
  const objectRefs = new Set([
    ...template.requiredObjectRefs,
    ...template.cells.map((cell) => cell.objectId).filter((id): id is string => Boolean(id)),
  ]);
  for (const id of [...objectRefs].sort()) {
    if (references.objectIds && !references.objectIds.has(id)) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "room_shapes", "DNG_TEMPLATE_OBJECT_MISSING",
        `Template ${template.id} references missing object ${id}.`,
        { relatedIds: [template.id, id] },
      ));
    }
  }
  for (const id of [...template.requiredMaterialRefs].sort()) {
    if (references.materialIds && !references.materialIds.has(id)) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "room_shapes", "DNG_TEMPLATE_MATERIAL_MISSING",
        `Template ${template.id} references missing material ${id}.`,
        { relatedIds: [template.id, id] },
      ));
    }
  }
  return diagnostics;
};

export const instantiateDungeonRoomTemplate = (
  templateInput: DungeonRoomTemplateDef,
  options: {
    nodeId: string;
    mapId: string;
    origin: MacroCell;
    rotation: DungeonRotation;
  },
): InstantiatedDungeonTemplate => {
  const template = DungeonRoomTemplateSchema.parse(templateInput);
  if (!template.rotationModes.includes(options.rotation)) {
    throw new Error(`Template ${template.id} does not allow rotation ${options.rotation}`);
  }
  const transformed = (cell: readonly [number, number]) =>
    globalCell(options.origin, rotateTemplateCell(cell, template.bounds, options.rotation));
  const bounds = rotatedTemplateBounds(template.bounds, options.rotation);
  const sockets = template.connectionSockets.map((socket) => ({
    id: `${options.nodeId}:${socket.id}`,
    cell: transformed(socket.cell),
    facing: rotateTemplateFacing(socket.facing, options.rotation),
    width: socket.width,
    elevation: socket.elevation,
    tags: [...socket.tags].sort(),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const reservedPaths = template.reservedPaths.map((path) => ({
    id: path.id,
    cells: path.cells.map(transformed),
  }));
  const reservedCells = [...new Map(
    reservedPaths.flatMap((path) => path.cells).map((cell) => [`${cell[0]}:${cell[1]}`, cell]),
  ).values()];
  return {
    room: {
      nodeId: options.nodeId,
      mapId: options.mapId,
      templateId: template.id,
      origin: [...options.origin],
      rotation: options.rotation,
      bounds: { x: options.origin[0], z: options.origin[1], width: bounds.width, depth: bounds.depth },
      sockets,
      reservedCells,
    },
    cells: template.cells.map((cell) => ({ ...cell, cell: transformed(cell.cell) })),
    populationSockets: template.populationSockets.map((socket) => ({
      ...socket,
      cell: transformed(socket.cell),
      facing: socket.facing ? rotateTemplateFacing(socket.facing, options.rotation) : undefined,
    })),
    reservedPaths,
  };
};

