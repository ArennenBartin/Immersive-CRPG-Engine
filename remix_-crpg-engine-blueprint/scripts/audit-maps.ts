import {
  GamePackageSchema,
  type GamePackage,
  type MapData,
  type ObjectPlacementData,
} from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { expandGamePackageToFine } from "../src/engine-core/fineWorld";
import { fineCoordKey } from "../src/engine-core/gridCoordinates";
import { getPlacementFootprint } from "../src/utils/objectFootprint";
import { isBuildingDoorPlacement } from "../src/utils/doorPlacement";
import { auditGamePackageReferences } from "../src/generation-facing/referenceAudit";

type Severity = "error" | "warning";

type Issue = {
  severity: Severity;
  scope: string;
  code: string;
  message: string;
};

const issues: Issue[] = [];

const addIssue = (
  severity: Severity,
  scope: string,
  code: string,
  message: string,
) => {
  issues.push({ severity, scope, code, message });
};

const cellKey = fineCoordKey;

const hasCell = (map: MapData, x: number, z: number) =>
  map.cells.some((cell) => cell.x === x && cell.z === z);

const buildWalkableSet = (pkg: GamePackage, map: MapData) => {
  const objectById = new Map(pkg.object_library.map((object) => [object.id, object]));
  const walkable = new Set<string>();

  for (const cell of map.cells) {
    if (cell.walkable === false) continue;
    if (cell.object_id) {
      const object = objectById.get(cell.object_id);
      if (object && object.collision?.profile !== "none") continue;
    }
    walkable.add(cellKey(cell.x, cell.z));
  }

  for (const placement of map.custom_object_placements || []) {
    const object = objectById.get(placement.object_id);
    if (!object || object.collision?.profile === "none") continue;
    if (isBuildingDoorPlacement(placement)) continue;
    for (const [x, z] of getPlacementFootprint(placement, object)) {
      walkable.delete(cellKey(x, z));
    }
  }

  for (const container of map.container_placements || []) {
    walkable.delete(cellKey(container.cell[0], container.cell[1]));
  }

  return walkable;
};

const reachableFrom = (walkable: Set<string>, start: [number, number]) => {
  const startKey = cellKey(start[0], start[1]);
  if (!walkable.has(startKey)) return new Set<string>();
  const reached = new Set([startKey]);
  const queue: [number, number][] = [start];
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (queue.length > 0) {
    const [x, z] = queue.shift()!;
    for (const [dx, dz] of dirs) {
      const next: [number, number] = [x + dx, z + dz];
      const key = cellKey(next[0], next[1]);
      if (!walkable.has(key) || reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
};

const validatePlacementRefs = (
  pkg: GamePackage,
  map: MapData,
  placement: ObjectPlacementData,
  index: number,
) => {
  const objectIds = new Set(pkg.object_library.map((object) => object.id));
  const dialogueIds = new Set(pkg.dialogue.map((dialogue) => dialogue.id));
  const scope = `${map.id}.custom_object_placements[${index}]`;
  if (!objectIds.has(placement.object_id)) {
    addIssue("error", scope, "unknown_object", `Unknown object_id ${placement.object_id}`);
  }
  if (placement.dialogue_id && !dialogueIds.has(placement.dialogue_id)) {
    addIssue("error", scope, "unknown_dialogue", `Unknown dialogue_id ${placement.dialogue_id}`);
  }
  if (!hasCell(map, placement.cell[0], placement.cell[1])) {
    addIssue("warning", scope, "off_grid_placement", "Placement anchor has no authored cell");
  }
};

const auditPackage = (pkg: GamePackage) => {
  const parsed = GamePackageSchema.safeParse(pkg);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addIssue("error", "package", "schema", `${issue.path.join(".")}: ${issue.message}`);
    }
    return;
  }

  // Keep the map audit useful as the one-command QA gate for authored test
  // packages: keyword conversation diagnostics are produced by the same pure
  // validator Studio uses, then folded into this audit's existing output.
  for (const issue of auditGamePackageReferences(parsed.data).issues) {
    if (!issue.code.startsWith("DIALOGUE_")) continue;
    if (issue.severity === "info") continue;
    addIssue(issue.severity, issue.path, issue.code, issue.message);
  }

  const mapById = new Map(pkg.maps.map((map) => [map.id, map]));
  const objectIds = new Set(pkg.object_library.map((object) => object.id));
  const spriteIds = new Set(pkg.sprite_library.map((sprite) => sprite.id));
  const entityIds = new Set(pkg.entities.map((entity) => entity.id));
  const itemIds = new Set(pkg.items.map((item) => item.id));
  const abilityIds = new Set(pkg.abilities.map((ability) => ability.id));
  const dialogueIds = new Set(pkg.dialogue.map((dialogue) => dialogue.id));
  const documentIds = new Set(pkg.documents.map((document) => document.id));
  const questIds = new Set(pkg.quests.map((quest) => quest.id));
  const cutsceneIds = new Set(pkg.cutscenes.map((cutscene) => cutscene.id));
  const shopIds = new Set(pkg.shops.map((shop) => shop.id));

  const startMap = mapById.get(pkg.metadata.start_map_id);
  if (!startMap) {
    addIssue("error", "metadata", "missing_start_map", "Start map does not exist");
  } else if (!startMap.spawns.some((spawn) => spawn.id === pkg.metadata.start_spawn_id)) {
    addIssue("error", startMap.id, "missing_start_spawn", "Start spawn does not exist on start map");
  }

  if (pkg.settings?.player_sprite_id && !spriteIds.has(pkg.settings.player_sprite_id)) {
    addIssue("error", "settings.player_sprite_id", "unknown_sprite", String(pkg.settings.player_sprite_id));
  }
  for (const skillId of (pkg.settings?.initial_known_skills as string[] | undefined) || []) {
    if (!abilityIds.has(skillId)) {
      addIssue("error", "settings.initial_known_skills", "unknown_skill", skillId);
    }
  }
  for (const entityId of (pkg.settings?.starting_party_members as string[] | undefined) || []) {
    if (!entityIds.has(entityId)) {
      addIssue("error", "settings.starting_party_members", "unknown_entity", entityId);
    }
  }

  for (const object of pkg.object_library) {
    for (const part of object.parts || []) {
      if (!part.material) {
        addIssue("warning", object.id, "part_without_material", "Object part has no material");
      }
    }
  }

  for (const item of pkg.items) {
    if (item.sprite_id && !spriteIds.has(item.sprite_id)) {
      addIssue("error", item.id, "unknown_item_sprite", `Unknown sprite_id ${item.sprite_id}`);
    }
  }

  for (const entity of pkg.entities) {
    if (entity.sprite_id && !spriteIds.has(entity.sprite_id)) {
      addIssue("error", entity.id, "unknown_entity_sprite", `Unknown sprite_id ${entity.sprite_id}`);
    }
    if (entity.dialogue_id && !dialogueIds.has(entity.dialogue_id)) {
      addIssue("error", entity.id, "unknown_entity_dialogue", `Unknown dialogue_id ${entity.dialogue_id}`);
    }
    if (entity.party_dialogue_id && !dialogueIds.has(entity.party_dialogue_id)) {
      addIssue("error", entity.id, "unknown_party_dialogue", `Unknown party_dialogue_id ${entity.party_dialogue_id}`);
    }
    for (const skillId of entity.skills || []) {
      if (!abilityIds.has(skillId)) {
        addIssue("error", entity.id, "unknown_entity_skill", `Unknown skill ${skillId}`);
      }
    }
    if (!entity.is_npc && (entity.max_hp || 0) > 0 && (entity.xp_reward || 0) <= 0) {
      addIssue("warning", entity.id, "hostile_without_xp", "Hostile entity grants no XP");
    }
  }

  for (const dialogue of pkg.dialogue) {
    for (const node of dialogue.nodes || []) {
      for (const option of node.options || []) {
        if (option.next_node_id && !dialogue.nodes.some((candidate) => candidate.id === option.next_node_id)) {
          addIssue("error", dialogue.id, "unknown_next_node", `${node.id} -> ${option.next_node_id}`);
        }
        if (option.trigger_cutscene && !cutsceneIds.has(option.trigger_cutscene)) {
          addIssue("error", dialogue.id, "unknown_option_cutscene", option.trigger_cutscene);
        }
        if (option.trigger_quest && !questIds.has(option.trigger_quest)) {
          addIssue("error", dialogue.id, "unknown_option_quest", option.trigger_quest);
        }
      }
    }
  }

  for (const quest of pkg.quests) {
    for (const objective of quest.objectives || []) {
      const knownTarget =
        entityIds.has(objective.target_id) ||
        itemIds.has(objective.target_id) ||
        documentIds.has(objective.target_id) ||
        dialogueIds.has(objective.target_id) ||
        questIds.has(objective.target_id) ||
        Boolean(pkg.switches?.[objective.target_id]);
      if (!knownTarget && objective.type !== "custom") {
        addIssue("warning", quest.id, "unknown_objective_target", `${objective.id}: ${objective.target_id}`);
      }
    }
  }

  for (const cutscene of pkg.cutscenes) {
    for (const action of cutscene.actions || []) {
      if (action.dialogue_id && !dialogueIds.has(action.dialogue_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_dialogue", action.dialogue_id);
      }
      if (action.map_id && !mapById.has(action.map_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_map", action.map_id);
      }
      if (action.entity_id && !entityIds.has(action.entity_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_entity", action.entity_id);
      }
      if (action.item_id && !itemIds.has(action.item_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_item", action.item_id);
      }
      if (action.document_id && !documentIds.has(action.document_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_document", action.document_id);
      }
      if (action.shop_id && !shopIds.has(action.shop_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_shop", action.shop_id);
      }
      if (action.skill_id && !abilityIds.has(action.skill_id)) {
        addIssue("error", cutscene.id, "unknown_cutscene_skill", action.skill_id);
      }
    }
  }

  for (const shop of pkg.shops) {
    for (const entry of shop.items || []) {
      if (!itemIds.has(entry.item_id)) {
        addIssue("error", shop.id, "unknown_shop_item", entry.item_id);
      }
    }
  }

  for (const bark of pkg.barks || []) {
    for (const speaker of bark.speakers || []) {
      const speakerId = String(speaker);
      if (!entityIds.has(speakerId)) {
        addIssue("error", bark.id, "unknown_bark_speaker", speakerId);
      }
    }
    for (const line of bark.lines || []) {
      if (!entityIds.has(line.speaker)) {
        addIssue("error", bark.id, "unknown_bark_line_speaker", line.speaker);
      }
    }
  }

  for (const map of pkg.maps) {
    const scope = map.id;
    if (map.cells.length === 0) {
      addIssue("error", scope, "empty_map", "Map has no cells");
      continue;
    }

    const seenCells = new Set<string>();
    for (const cell of map.cells) {
      const key = `${cell.x},${cell.y || 0},${cell.z}`;
      if (seenCells.has(key)) addIssue("error", scope, "duplicate_cell", key);
      seenCells.add(key);
      if (cell.object_id && !objectIds.has(cell.object_id)) {
        addIssue("error", scope, "unknown_cell_object", `${key}: ${cell.object_id}`);
      }
    }

    for (const [index, placement] of (map.custom_object_placements || []).entries()) {
      validatePlacementRefs(pkg, map, placement, index);
    }
    for (const [index, item] of (map.item_placements || []).entries()) {
      if (!itemIds.has(item.item_id)) {
        addIssue("error", `${scope}.item_placements[${index}]`, "unknown_item", item.item_id);
      }
      if (!hasCell(map, item.cell[0], item.cell[1])) {
        addIssue("warning", `${scope}.item_placements[${index}]`, "off_grid_item", item.id);
      }
    }
    for (const [index, container] of (map.container_placements || []).entries()) {
      const containerScope = `${scope}.container_placements[${index}]`;
      if (!objectIds.has(container.object_id)) addIssue("error", containerScope, "unknown_container_object", container.object_id);
      if (container.key_item_id && !itemIds.has(container.key_item_id)) addIssue("error", containerScope, "unknown_container_key", container.key_item_id);
      for (const entry of container.items || []) {
        if (!itemIds.has(entry.item_id)) addIssue("error", containerScope, "unknown_container_item", entry.item_id);
      }
    }
    for (const [index, placement] of (map.entity_placements || []).entries()) {
      if (!entityIds.has(placement.entity_id)) {
        addIssue("error", `${scope}.entity_placements[${index}]`, "unknown_entity", placement.entity_id);
      }
      if (!hasCell(map, placement.cell[0], placement.cell[1])) {
        addIssue("warning", `${scope}.entity_placements[${index}]`, "off_grid_entity", placement.entity_id);
      }
    }
    for (const [index, trigger] of (map.triggers || []).entries()) {
      if (!cutsceneIds.has(trigger.cutscene_id)) {
        addIssue("error", `${scope}.triggers[${index}]`, "unknown_trigger_cutscene", trigger.cutscene_id);
      }
      if (trigger.cell && !hasCell(map, trigger.cell[0], trigger.cell[1])) {
        addIssue("warning", `${scope}.triggers[${index}]`, "off_grid_trigger", trigger.id);
      }
    }
    for (const [index, exit] of (map.exits || []).entries()) {
      const targetMap = mapById.get(exit.target_map_id);
      if (!targetMap) {
        addIssue("error", `${scope}.exits[${index}]`, "unknown_exit_map", exit.target_map_id);
      } else if (
        exit.target_spawn_id &&
        !targetMap.spawns.some((spawn) => spawn.id === exit.target_spawn_id)
      ) {
        addIssue("error", `${scope}.exits[${index}]`, "unknown_exit_spawn", exit.target_spawn_id);
      }
    }

    const walkable = buildWalkableSet(pkg, map);
    for (const [index, exit] of (map.exits || []).entries()) {
      const exitScope = `${scope}.exits[${index}]`;
      const exitKey = cellKey(exit.cell[0], exit.cell[1]);
      if (!walkable.has(exitKey)) {
        addIssue("error", exitScope, "blocked_exit", `Exit cell ${exit.cell.join(",")} is not walkable`);
      }
      const targetMap = mapById.get(exit.target_map_id);
      if (targetMap) {
        const targetSpawn =
          targetMap.spawns.find((spawn) => spawn.id === exit.target_spawn_id) ||
          (!exit.target_spawn_id ? targetMap.spawns[0] : undefined);
        if (targetSpawn) {
          const targetWalkable = buildWalkableSet(pkg, targetMap);
          if (!targetWalkable.has(cellKey(targetSpawn.cell[0], targetSpawn.cell[1]))) {
            addIssue(
              "error",
              exitScope,
              "blocked_target_spawn",
              `${exit.target_map_id}#${targetSpawn.id} is not walkable`,
            );
          }
        }
      }
    }
    for (const spawn of map.spawns || []) {
      const reached = reachableFrom(walkable, spawn.cell as [number, number]);
      if (reached.size === 0) {
        addIssue("error", scope, "blocked_spawn", `${spawn.id} cannot reach any walkable cells`);
        continue;
      }
      for (const exit of map.exits || []) {
        if (!reached.has(cellKey(exit.cell[0], exit.cell[1]))) {
          addIssue(
            "error",
            scope,
            "unreachable_exit",
            `${spawn.id} cannot reach ${exit.id || `${exit.target_map_id}@${exit.cell.join(",")}`}`,
          );
        }
      }
    }
    const startSpawn =
      map.id === pkg.metadata.start_map_id
        ? map.spawns.find((spawn) => spawn.id === pkg.metadata.start_spawn_id)
        : undefined;
    if (startSpawn) {
      const reached = reachableFrom(walkable, startSpawn.cell as [number, number]);
      for (const item of map.item_placements || []) {
        if (!reached.has(cellKey(item.cell[0], item.cell[1]))) {
          addIssue("warning", scope, "unreachable_item", `${item.id} is not reachable from start`);
        }
      }
      for (const container of map.container_placements || []) {
        const adjacent = [
          [container.cell[0] + 1, container.cell[1]],
          [container.cell[0] - 1, container.cell[1]],
          [container.cell[0], container.cell[1] + 1],
          [container.cell[0], container.cell[1] - 1],
        ].some(([x, z]) => reached.has(cellKey(x, z)));
        if (!adjacent) {
          addIssue("warning", scope, "unreachable_container", container.id);
        }
      }
    }
  }
};

auditPackage(expandGamePackageToFine(createQaSuitePackage()));

for (const issue of issues) {
  console.log(`[${issue.severity}] ${issue.scope} ${issue.code}: ${issue.message}`);
}

const errorCount = issues.filter((issue) => issue.severity === "error").length;
const warningCount = issues.filter((issue) => issue.severity === "warning").length;
console.log(`Map audit complete: ${errorCount} error(s), ${warningCount} warning(s).`);

if (errorCount > 0) process.exit(1);
