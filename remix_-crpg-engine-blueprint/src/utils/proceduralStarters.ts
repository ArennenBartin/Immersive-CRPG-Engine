import type { ObjectData, ObjectPart } from "../schema/game";
import { createDefaultMaterialSetting } from "./objectMaterials";

export type ProceduralStarterKind =
  | "wall"
  | "floor"
  | "door"
  | "crate"
  | "terminal"
  | "beacon"
  | "chest"
  | "pillar";

export const PROCEDURAL_STARTERS: {
  kind: ProceduralStarterKind;
  label: string;
}[] = [
  { kind: "wall", label: "Wall" },
  { kind: "floor", label: "Floor" },
  { kind: "door", label: "Door" },
  { kind: "crate", label: "Crate" },
  { kind: "terminal", label: "Terminal" },
  { kind: "beacon", label: "Beacon" },
  { kind: "chest", label: "Chest" },
  { kind: "pillar", label: "Pillar" },
];

const MATERIALS = {
  panel: "#4B5563",
  panelDark: "#111827",
  concrete: "#9CA3AF",
  steel: "#D1D5DB",
  glass: "#70E8FF",
  brass: "#D9A648",
  red: "#BF616A",
  green: "#7AA36F",
  wood: "#6B4A2F",
};

const part = (
  shape: ObjectPart["shape"],
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: string,
  rotation: [number, number, number] = [0, 0, 0],
  segments?: number,
): ObjectPart => ({
  shape,
  name,
  position,
  rotation,
  size,
  material,
  ...(segments ? { segments } : {}),
});

const box = (
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: string,
  rotation?: [number, number, number],
) => part("box", name, position, size, material, rotation);

const cylinder = (
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: string,
  segments = 12,
  rotation?: [number, number, number],
) => part("cylinder", name, position, size, material, rotation, segments);

const sphere = (
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: string,
) => part("sphere", name, position, size, material);

const makeId = (kind: ProceduralStarterKind) => `obj_${kind}_${Date.now()}`;

const makeObject = ({
  id,
  displayName,
  kind,
  parts,
  bounds,
  collisionProfile = "single",
}: {
  id?: string;
  displayName: string;
  kind: ProceduralStarterKind;
  parts: ObjectPart[];
  bounds: [number, number, number];
  collisionProfile?: ObjectData["collision"]["profile"];
}): ObjectData => {
  const materials = Array.from(
    new Set(parts.map((candidate) => candidate.material).filter(Boolean)),
  ) as string[];
  return {
    id: id || makeId(kind),
    display_name: displayName,
    category: "props",
    tags: ["procedural", kind],
    origin: "center_floor",
    bounds,
    materials,
    material_settings: materials.map((material) =>
      createDefaultMaterialSetting(material),
    ),
    model_kind: "parts",
    parts,
    decals: [],
    reference_images: [],
    collision: {
      profile: collisionProfile,
      footprint: [[0, 0]],
    },
  };
};

export const createProceduralStarter = (
  kind: ProceduralStarterKind,
): ObjectData => {
  switch (kind) {
    case "floor":
      return makeObject({
        displayName: "Floor Plate Starter",
        kind,
        bounds: [1, 0.1, 1],
        collisionProfile: "none",
        parts: [box("plate", [0, 0.05, 0], [1, 0.1, 1], MATERIALS.concrete)],
      });
    case "wall":
      return makeObject({
        displayName: "Wall Block Starter",
        kind,
        bounds: [1, 1.6, 1],
        parts: [
          box("wall", [0, 0.8, 0], [1, 1.6, 1], MATERIALS.panel),
          box("top_cap", [0, 1.64, 0], [1.06, 0.08, 1.06], MATERIALS.steel),
        ],
      });
    case "door":
      return makeObject({
        displayName: "Door Starter",
        kind,
        bounds: [1, 1.8, 0.18],
        parts: [
          box("left_frame", [-0.45, 0.9, 0], [0.1, 1.8, 0.18], MATERIALS.steel),
          box("right_frame", [0.45, 0.9, 0], [0.1, 1.8, 0.18], MATERIALS.steel),
          box("header", [0, 1.74, 0], [1, 0.12, 0.18], MATERIALS.steel),
          box("panel", [0, 0.9, 0.02], [0.72, 1.35, 0.08], MATERIALS.panelDark),
          box("status_light", [0.28, 1.1, 0.08], [0.12, 0.12, 0.03], MATERIALS.green),
        ],
      });
    case "crate":
      return makeObject({
        displayName: "Crate Starter",
        kind,
        bounds: [0.9, 0.72, 0.9],
        parts: [
          box("body", [0, 0.36, 0], [0.9, 0.72, 0.9], MATERIALS.wood),
          box("band_x", [0, 0.62, 0.47], [0.92, 0.08, 0.04], MATERIALS.steel),
          box("band_y", [0.47, 0.36, 0], [0.04, 0.62, 0.92], MATERIALS.steel),
        ],
      });
    case "terminal":
      return makeObject({
        displayName: "Terminal Starter",
        kind,
        bounds: [0.9, 1.05, 0.55],
        parts: [
          box("base", [0, 0.16, 0], [0.72, 0.32, 0.5], MATERIALS.panelDark),
          box("stem", [0, 0.58, -0.04], [0.24, 0.64, 0.18], MATERIALS.panel),
          box("screen", [0, 0.98, 0.1], [0.84, 0.46, 0.08], MATERIALS.glass),
          box("button_row", [0, 0.68, 0.18], [0.62, 0.08, 0.06], MATERIALS.brass),
        ],
      });
    case "beacon":
      return makeObject({
        displayName: "Beacon Starter",
        kind,
        bounds: [0.7, 1.45, 0.7],
        parts: [
          cylinder("base", [0, 0.12, 0], [0.52, 0.24, 0.52], MATERIALS.panelDark),
          cylinder("post", [0, 0.7, 0], [0.14, 1.1, 0.14], MATERIALS.steel, 10),
          sphere("core", [0, 1.32, 0], [0.42, 0.42, 0.42], MATERIALS.glass),
        ],
      });
    case "chest":
      return makeObject({
        displayName: "Chest Starter",
        kind,
        bounds: [1, 0.65, 0.72],
        parts: [
          box("base", [0, 0.28, 0], [1, 0.5, 0.72], MATERIALS.wood),
          box("lid", [0, 0.58, 0], [1.04, 0.16, 0.76], MATERIALS.panel),
          box("lock", [0, 0.42, 0.39], [0.18, 0.2, 0.06], MATERIALS.brass),
        ],
      });
    case "pillar":
      return makeObject({
        displayName: "Pillar Starter",
        kind,
        bounds: [0.72, 1.8, 0.72],
        parts: [
          cylinder("base", [0, 0.12, 0], [0.72, 0.24, 0.72], MATERIALS.concrete, 12),
          cylinder("shaft", [0, 0.92, 0], [0.42, 1.46, 0.42], MATERIALS.steel, 14),
          cylinder("cap", [0, 1.7, 0], [0.72, 0.2, 0.72], MATERIALS.concrete, 12),
        ],
      });
    default: {
      const neverKind: never = kind;
      throw new Error(`Unknown procedural starter: ${neverKind}`);
    }
  }
};

export const createReplacementObjectLibrary = (): ObjectData[] =>
  PROCEDURAL_STARTERS.map((starter) => ({
    ...createProceduralStarter(starter.kind),
    id: `obj_${starter.kind}_starter`,
  }));
