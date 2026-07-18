// ── QA suite shared builders ─────────────────────────────────────────────────
// Common factories for the Engine QA Suite (docs/QA_SUITE_REBUILD_PLAN_V1.md).
// Everything here authors MACRO-tile content — the fineWorld expansion turns it
// into the fine-cell world at load. Never author fine coordinates.

import type { CellData, GamePackage } from "../../schema/game";
import { PEOPLE_HORROR_SPRITES, peopleHorrorSpriteId } from "../animatedSprites";

export type MapData = GamePackage["maps"][number];
export type EntityData = GamePackage["entities"][number];
export type DialogueData = GamePackage["dialogue"][number];
export type DialogueKeywordData = GamePackage["keywords"][number];
export type DialogueDynamicTopicData = GamePackage["dynamic_topics"][number];
export type CutsceneData = GamePackage["cutscenes"][number];
export type ItemData = GamePackage["items"][number];
export type SkillData = GamePackage["abilities"][number];
export type ShopData = GamePackage["shops"][number];
export type QuestData = GamePackage["quests"][number];
export type DocumentData = GamePackage["documents"][number];
export type BarkData = GamePackage["barks"][number];
export type SimulationProcessData = GamePackage["simulation_processes"][number];
export type SimulationWorkstationData = GamePackage["simulation_workstations"][number];
export type TriggerData = MapData["triggers"][number];
export type ObjectPlacementData = MapData["custom_object_placements"][number];

export const key = (x: number, z: number) => `${x}:${z}`;

export const cell = (
  x: number,
  z: number,
  overrides: Partial<CellData> = {},
): CellData => ({
  x,
  y: 0,
  z,
  active: true,
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  terrain: "default",
  surface_tag: "none",
  object_id: "obj_floor_plate",
  ...overrides,
});

export type CellOverrides = Record<string, Partial<CellData>>;

// Stamp a rectangle of overrides (inclusive bounds) into an override record —
// merged onto any earlier stamp so later stamps win per-field.
export const stampRect = (
  overrides: CellOverrides,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  props: Partial<CellData>,
): CellOverrides => {
  for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z += 1) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
      overrides[key(x, z)] = { ...(overrides[key(x, z)] || {}), ...props };
    }
  }
  return overrides;
};

export const stampCells = (
  overrides: CellOverrides,
  cells: [number, number][],
  props: Partial<CellData>,
): CellOverrides => {
  for (const [x, z] of cells) {
    overrides[key(x, z)] = { ...(overrides[key(x, z)] || {}), ...props };
  }
  return overrides;
};

// A solid interior wall tile.
export const WALL: Partial<CellData> = {
  walkable: false,
  blocks_los: true,
  height: 1,
  visual_height: 1.5,
  object_id: "obj_wall_block",
};

// A walled rectangular room (edges become walls) with per-cell overrides.
export const roomCells = (
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  overrides: CellOverrides = {},
): CellData[] => {
  const cells: CellData[] = [];
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const edge = x === minX || x === maxX || z === minZ || z === maxZ;
      const authored = overrides[key(x, z)] || {};
      cells.push(
        cell(x, z, {
          ...(edge ? WALL : {}),
          ...authored,
        }),
      );
    }
  }
  return cells;
};

export const exit = (
  cellPos: [number, number],
  target_map_id: string,
  target_spawn_id = "spawn_return",
): MapData["exits"][number] => ({
  id: `exit_${target_map_id}_${cellPos[0]}_${cellPos[1]}`,
  cell: cellPos,
  target_map_id,
  target_spawn_id,
});

export const QA_START_MAP_ID = "qa_suite_hub";
export const QA_START_SPAWN_ID = "spawn_suite_start";

export const hubReturnExit = (cellPos: [number, number]): MapData["exits"][number] =>
  exit(cellPos, QA_START_MAP_ID, QA_START_SPAWN_ID);

// An exit cell must be walkable floor even in a wall ring.
export const DOORWAY: Partial<CellData> = {
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  object_id: "obj_floor_plate",
};

export const sign = (
  object_id: string,
  cellPos: [number, number],
  dialogue_id: string,
): ObjectPlacementData => ({
  object_id,
  cell: cellPos,
  facing: [0, 1],
  dialogue_id,
});

export const prop = (
  object_id: string,
  cellPos: [number, number],
  facing: [number, number] = [0, 1],
): ObjectPlacementData => ({ object_id, cell: cellPos, facing });

// A button/valve/lever: a visible object plus an interact trigger on its tile.
// Pressing Act while facing (or standing on) the tile fires the cutscene.
export const lever = (
  id: string,
  object_id: string,
  cellPos: [number, number],
  cutscene_id: string,
  options: Partial<TriggerData> = {},
): { placement: ObjectPlacementData; trigger: TriggerData } => ({
  placement: prop(object_id, cellPos),
  trigger: {
    id,
    cell: cellPos,
    type: "interact",
    conditions: [],
    cutscene_id,
    once: false,
    ...options,
  },
});

export const stepPlate = (
  id: string,
  cellPos: [number, number],
  cutscene_id: string,
  options: Partial<TriggerData> = {},
): TriggerData => ({
  id,
  cell: cellPos,
  type: "step",
  conditions: [],
  cutscene_id,
  once: false,
  ...options,
});

export const entityPlacement = (
  entity_id: string,
  cellPos: [number, number],
  facing: [number, number] = [0, 1],
  extras: Partial<MapData["entity_placements"][number]> = {},
): MapData["entity_placements"][number] => ({
  entity_id,
  cell: cellPos,
  facing,
  ...extras,
});

// ── Entities ─────────────────────────────────────────────────────────────────
const animatedEntitySpritePools = {
  npc: [
    peopleHorrorSpriteId(2, 1),
    peopleHorrorSpriteId(3, 1),
    peopleHorrorSpriteId(4, 1),
    peopleHorrorSpriteId(5, 1),
    peopleHorrorSpriteId(6, 1),
    peopleHorrorSpriteId(7, 1),
    peopleHorrorSpriteId(8, 1),
    peopleHorrorSpriteId(9, 1),
    peopleHorrorSpriteId(10, 1),
    peopleHorrorSpriteId(23, 2),
    peopleHorrorSpriteId(45, 3),
    peopleHorrorSpriteId(67, 4),
    peopleHorrorSpriteId(89, 5),
  ],
  hostile: [
    peopleHorrorSpriteId(111, 6),
    peopleHorrorSpriteId(112, 6),
    peopleHorrorSpriteId(113, 6),
    peopleHorrorSpriteId(114, 6),
    peopleHorrorSpriteId(149, 8),
    peopleHorrorSpriteId(150, 8),
    peopleHorrorSpriteId(164, 9),
    peopleHorrorSpriteId(176, 9),
  ],
};

const hashId = (id: string) =>
  [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);

export const animatedSpriteForEntity = (entity: EntityData) => {
  const pool = entity.is_npc ? animatedEntitySpritePools.npc : animatedEntitySpritePools.hostile;
  return pool[hashId(entity.id) % pool.length];
};

export const npc = (
  id: string,
  display_name: string,
  dialogue_id?: string,
  extras: Partial<EntityData> = {},
): EntityData => ({
  id,
  display_name,
  sprite_id: peopleHorrorSpriteId(2, 1),
  dialogue_id,
  is_npc: true,
  max_hp: 18,
  max_mp: 8,
  attack: 3,
  defense: 1,
  speed: 9,
  skills: [],
  ...extras,
});

export const hostile = (
  id: string,
  display_name: string,
  stats: { hp: number; attack: number; defense: number; speed: number; xp: number },
  extras: Partial<EntityData> = {},
): EntityData => ({
  id,
  display_name,
  sprite_id: peopleHorrorSpriteId(111, 6),
  is_npc: false,
  max_hp: stats.hp,
  max_mp: 0,
  attack: stats.attack,
  defense: stats.defense,
  speed: stats.speed,
  xp_reward: stats.xp,
  skills: [],
  ...extras,
});

// ── Dialogue ─────────────────────────────────────────────────────────────────
type DialogueNode = DialogueData["nodes"][number];
type DialogueOption = DialogueNode["options"][number];
type DialogueResponse = NonNullable<DialogueData["responses"]>[number];

export const dlg = (
  id: string,
  display_name: string,
  nodes: DialogueNode[],
): DialogueData => ({ id, display_name, nodes });

// Single-node explainer dialogue: a speaker, a line, optional extra options.
export const say = (
  id: string,
  speaker: string,
  text: string,
  options: DialogueOption[] = [{ text: "Understood." }],
): DialogueData => dlg(id, speaker, [{ id: "start", speaker, text, options }]);

// Native keyword-conversation builders. Keeping the schema defaults here makes
// hand-authored QA conversations concise while still producing fully parsed
// package records (the legacy `dlg` / `say` helpers remain migration fixtures).
export const keywordResponse = (
  input: Pick<DialogueResponse, "id" | "text"> & Partial<Omit<DialogueResponse, "id" | "text">>,
): DialogueResponse => ({
  id: input.id,
  text: input.text,
  role: "normal",
  priority: 0,
  mentions: [],
  unlock_topic_ids: [],
  unlock_dynamic_topic_ids: [],
  context_topic_ids: [],
  context_dynamic_topic_ids: [],
  set_switches: [],
  effects_repeatable: false,
  end_conversation: false,
  ...input,
});

export const keywordDlg = (
  id: string,
  display_name: string,
  speaker: string,
  responses: DialogueResponse[],
  options: Pick<
    DialogueData,
    "initial_topic_ids" | "initial_dynamic_topic_ids" | "action_topic_ids"
  > = {
    initial_topic_ids: [],
    initial_dynamic_topic_ids: [],
    action_topic_ids: ["action:goodbye"],
  },
): DialogueData => ({
  id,
  display_name,
  format: "keyword_v1",
  speaker,
  nodes: [],
  responses,
  initial_topic_ids: options.initial_topic_ids || [],
  initial_dynamic_topic_ids: options.initial_dynamic_topic_ids || [],
  action_topic_ids: options.action_topic_ids || ["action:goodbye"],
});

// ── Package assembly helpers ─────────────────────────────────────────────────
export const mergeById = <T extends { id: string }>(base: T[], additions: T[]) => {
  const byId = new Map<string, T>();
  base.forEach((item) => byId.set(item.id, item));
  additions.forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
};

export const mergeSprites = (base: GamePackage["sprite_library"]) =>
  mergeById(base, PEOPLE_HORROR_SPRITES);

// A wing bundles everything a set of maps contributes to the package.
export interface QaWing {
  maps: MapData[];
  entities?: EntityData[];
  keywords?: DialogueKeywordData[];
  dynamicTopics?: DialogueDynamicTopicData[];
  dialogue?: DialogueData[];
  cutscenes?: CutsceneData[];
  documents?: DocumentData[];
  quests?: QuestData[];
  items?: ItemData[];
  skills?: SkillData[];
  shops?: ShopData[];
  barks?: BarkData[];
  switches?: Record<string, boolean>;
  factions?: Array<{ id: string } & Record<string, unknown>>;
  endings?: Array<{ id: string } & Record<string, unknown>>;
  processes?: SimulationProcessData[];
  workstations?: SimulationWorkstationData[];
}

export const mergeWings = (wings: QaWing[]): Required<QaWing> => ({
  maps: wings.flatMap((wing) => wing.maps),
  entities: wings.flatMap((wing) => wing.entities || []),
  keywords: wings.flatMap((wing) => wing.keywords || []),
  dynamicTopics: wings.flatMap((wing) => wing.dynamicTopics || []),
  dialogue: wings.flatMap((wing) => wing.dialogue || []),
  cutscenes: wings.flatMap((wing) => wing.cutscenes || []),
  documents: wings.flatMap((wing) => wing.documents || []),
  quests: wings.flatMap((wing) => wing.quests || []),
  items: wings.flatMap((wing) => wing.items || []),
  skills: wings.flatMap((wing) => wing.skills || []),
  shops: wings.flatMap((wing) => wing.shops || []),
  barks: wings.flatMap((wing) => wing.barks || []),
  switches: Object.assign({}, ...wings.map((wing) => wing.switches || {})),
  factions: wings.flatMap((wing) => wing.factions || []),
  endings: wings.flatMap((wing) => wing.endings || []),
  processes: wings.flatMap((wing) => wing.processes || []),
  workstations: wings.flatMap((wing) => wing.workstations || []),
});
