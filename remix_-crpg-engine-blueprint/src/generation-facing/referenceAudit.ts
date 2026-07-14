import {
  GamePackageSchema,
  type ConditionData,
  type EventActionData,
  type GamePackage,
  type MapData,
} from "../schema/game";
import { SFX } from "../data/builtinAudio";
import { CHEM_MATERIALS } from "../engine-core/chemistry";
import { normalizeGeneratedIdToken } from "./deterministicIds";

export type ReferenceAuditSeverity = "error" | "warning" | "info";

export interface ReferenceAuditIssue {
  severity: ReferenceAuditSeverity;
  code: string;
  path: string;
  message: string;
  reference?: string;
  mapId?: string;
  cell?: [number, number];
}

export interface ReferenceAuditReport {
  valid: boolean;
  issues: ReferenceAuditIssue[];
  counts: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface ReferenceAuditOptions {
  /** Built-in or externally supplied recipe IDs not stored in package settings. */
  knownGenerationRecipeIds?: Iterable<string>;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;

const stringField = (value: unknown, key: string): string | undefined => {
  const candidate = asRecord(value)?.[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
};

const idsFromLooseCollection = (values: unknown[]): Set<string> =>
  new Set(values.map((value) => stringField(value, "id")).filter((id): id is string => Boolean(id)));

const recipeIdsFromSettings = (settings: UnknownRecord): Set<string> => {
  const ids = new Set<string>();
  for (const key of ["generation_recipes", "dungeon_recipes"]) {
    const value = settings[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") ids.add(entry);
        else {
          const id = stringField(entry, "id");
          if (id) ids.add(id);
        }
      }
    } else {
      const record = asRecord(value);
      if (record) Object.keys(record).forEach((id) => ids.add(id));
    }
  }
  return ids;
};

const normalizeCell = (cell: readonly unknown[]): [number, number] =>
  [Number(cell[0]), Number(cell[1])];

const cellKey = (cell: readonly unknown[]) => `${cell[0]}:${cell[1]}`;

const mapContainsCoordinate = (map: MapData, cell: readonly unknown[]): boolean => {
  const coordinate = normalizeCell(cell);
  if (map.cells.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const authored of map.cells) {
    minX = Math.min(minX, authored.x);
    maxX = Math.max(maxX, authored.x);
    minZ = Math.min(minZ, authored.z);
    maxZ = Math.max(maxZ, authored.z);
  }
  return coordinate[0] >= minX && coordinate[0] <= maxX && coordinate[1] >= minZ && coordinate[1] <= maxZ;
};

export const auditGamePackageReferences = (
  input: unknown,
  options: ReferenceAuditOptions = {},
): ReferenceAuditReport => {
  const issues: ReferenceAuditIssue[] = [];
  const add = (issue: ReferenceAuditIssue) => issues.push(issue);
  const parsed = GamePackageSchema.safeParse(input);
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      add({
        severity: "error",
        code: "REF_PACKAGE_SCHEMA_INVALID",
        path: schemaIssue.path.length ? `$.${schemaIssue.path.join(".")}` : "$",
        message: schemaIssue.message,
      });
    }
    return finalizeReferenceAudit(issues);
  }

  const pkg = parsed.data;
  const settings = pkg.settings as UnknownRecord;
  const customChemistryMaterials = asRecord(settings.chem_materials) ?? {};
  const factionIds = idsFromLooseCollection(pkg.factions as unknown[]);
  const endingIds = idsFromLooseCollection(pkg.endings as unknown[]);
  const indexes = {
    maps: new Set(pkg.maps.map((entry) => entry.id)),
    objects: new Set(pkg.object_library.map((entry) => entry.id)),
    sprites: new Set(pkg.sprite_library.map((entry) => entry.id)),
    entities: new Set(pkg.entities.map((entry) => entry.id)),
    dialogue: new Set(pkg.dialogue.map((entry) => entry.id)),
    documents: new Set(pkg.documents.map((entry) => entry.id)),
    quests: new Set(pkg.quests.map((entry) => entry.id)),
    cutscenes: new Set(pkg.cutscenes.map((entry) => entry.id)),
    items: new Set(pkg.items.map((entry) => entry.id)),
    abilities: new Set(pkg.abilities.map((entry) => entry.id)),
    encounters: new Set(pkg.encounters.map((entry) => entry.id)),
    shops: new Set(pkg.shops.map((entry) => entry.id)),
    factions: factionIds,
    endings: endingIds,
    barks: new Set(pkg.barks.map((entry) => entry.id)),
    blueprints: new Set(pkg.object_blueprints.map((entry) => entry.id)),
    materials: new Set(pkg.simulation_materials.map((entry) => entry.id)),
    processes: new Set(pkg.simulation_processes.map((entry) => entry.id)),
    workstations: new Set(pkg.simulation_workstations.map((entry) => entry.id)),
    dungeonRecipes: new Set(pkg.dungeon_recipes.map((entry) => entry.id)),
    dungeonThemes: new Set(pkg.dungeon_themes.map((entry) => entry.id)),
    dungeonArchetypes: new Set(pkg.dungeon_room_archetypes.map((entry) => entry.id)),
    dungeonTemplates: new Set(pkg.dungeon_room_templates.map((entry) => entry.id)),
    dungeonEncounterProfiles: new Set(pkg.dungeon_encounter_profiles.map((entry) => entry.id)),
    dungeonHazardProfiles: new Set(pkg.dungeon_hazard_profiles.map((entry) => entry.id)),
    dungeonRewardProfiles: new Set(pkg.dungeon_reward_profiles.map((entry) => entry.id)),
    dungeonNarrativeProfiles: new Set(pkg.dungeon_narrative_profiles.map((entry) => entry.id)),
    chemistryMaterials: new Set([
      ...Object.keys(CHEM_MATERIALS),
      ...Object.keys(customChemistryMaterials),
      ...pkg.simulation_materials.map((entry) => entry.id),
    ]),
    exits: new Set(pkg.maps.flatMap((map) => map.exits.map((exit) => exit.id).filter((id): id is string => Boolean(id)))),
    switches: new Set(Object.keys(pkg.switches)),
    sounds: new Set([
      ...Object.keys(SFX),
      ...Object.keys(asRecord(settings.sound_effects) ?? {}),
    ]),
    music: new Set(Object.keys(asRecord(settings.music_tracks) ?? {})),
  };

  const reference = (
    target: Set<string>,
    value: string | undefined,
    path: string,
    code: string,
    kind: string,
    severity: ReferenceAuditSeverity = "error",
    details: Pick<ReferenceAuditIssue, "mapId" | "cell"> = {},
  ) => {
    if (!value || target.has(value)) return;
    add({ severity, code, path, message: `Missing ${kind} reference: ${value}`, reference: value, ...details });
  };

  const declarationGroups: Array<[string, Array<{ id: string; path: string }>]> = [
    ["maps", pkg.maps.map((entry, index) => ({ id: entry.id, path: `$.maps[${index}].id` }))],
    ["object_library", pkg.object_library.map((entry, index) => ({ id: entry.id, path: `$.object_library[${index}].id` }))],
    ["sprite_library", pkg.sprite_library.map((entry, index) => ({ id: entry.id, path: `$.sprite_library[${index}].id` }))],
    ["entities", pkg.entities.map((entry, index) => ({ id: entry.id, path: `$.entities[${index}].id` }))],
    ["dialogue", pkg.dialogue.map((entry, index) => ({ id: entry.id, path: `$.dialogue[${index}].id` }))],
    ["documents", pkg.documents.map((entry, index) => ({ id: entry.id, path: `$.documents[${index}].id` }))],
    ["quests", pkg.quests.map((entry, index) => ({ id: entry.id, path: `$.quests[${index}].id` }))],
    ["cutscenes", pkg.cutscenes.map((entry, index) => ({ id: entry.id, path: `$.cutscenes[${index}].id` }))],
    ["items", pkg.items.map((entry, index) => ({ id: entry.id, path: `$.items[${index}].id` }))],
    ["abilities", pkg.abilities.map((entry, index) => ({ id: entry.id, path: `$.abilities[${index}].id` }))],
    ["encounters", pkg.encounters.map((entry, index) => ({ id: entry.id, path: `$.encounters[${index}].id` }))],
    ["shops", pkg.shops.map((entry, index) => ({ id: entry.id, path: `$.shops[${index}].id` }))],
    ["factions", (pkg.factions as unknown[]).flatMap((entry, index) => {
      const id = stringField(entry, "id");
      return id ? [{ id, path: `$.factions[${index}].id` }] : [];
    })],
    ["endings", (pkg.endings as unknown[]).flatMap((entry, index) => {
      const id = stringField(entry, "id");
      return id ? [{ id, path: `$.endings[${index}].id` }] : [];
    })],
    ["barks", pkg.barks.map((entry, index) => ({ id: entry.id, path: `$.barks[${index}].id` }))],
    ["object_blueprints", pkg.object_blueprints.map((entry, index) => ({ id: entry.id, path: `$.object_blueprints[${index}].id` }))],
    ["simulation_materials", pkg.simulation_materials.map((entry, index) => ({ id: entry.id, path: `$.simulation_materials[${index}].id` }))],
    ["simulation_processes", pkg.simulation_processes.map((entry, index) => ({ id: entry.id, path: `$.simulation_processes[${index}].id` }))],
    ["simulation_workstations", pkg.simulation_workstations.map((entry, index) => ({ id: entry.id, path: `$.simulation_workstations[${index}].id` }))],
    ["dungeon_recipes", pkg.dungeon_recipes.map((entry, index) => ({ id: entry.id, path: `$.dungeon_recipes[${index}].id` }))],
    ["dungeon_themes", pkg.dungeon_themes.map((entry, index) => ({ id: entry.id, path: `$.dungeon_themes[${index}].id` }))],
    ["dungeon_room_archetypes", pkg.dungeon_room_archetypes.map((entry, index) => ({ id: entry.id, path: `$.dungeon_room_archetypes[${index}].id` }))],
    ["dungeon_room_templates", pkg.dungeon_room_templates.map((entry, index) => ({ id: entry.id, path: `$.dungeon_room_templates[${index}].id` }))],
    ["dungeon_encounter_profiles", pkg.dungeon_encounter_profiles.map((entry, index) => ({ id: entry.id, path: `$.dungeon_encounter_profiles[${index}].id` }))],
    ["dungeon_hazard_profiles", pkg.dungeon_hazard_profiles.map((entry, index) => ({ id: entry.id, path: `$.dungeon_hazard_profiles[${index}].id` }))],
    ["dungeon_reward_profiles", pkg.dungeon_reward_profiles.map((entry, index) => ({ id: entry.id, path: `$.dungeon_reward_profiles[${index}].id` }))],
    ["dungeon_narrative_profiles", pkg.dungeon_narrative_profiles.map((entry, index) => ({ id: entry.id, path: `$.dungeon_narrative_profiles[${index}].id` }))],
  ];

  const globalOwners = new Map<string, Array<{ collection: string; path: string }>>();
  for (const [collection, declarations] of declarationGroups) {
    const seen = new Map<string, string>();
    for (const declaration of declarations) {
      const prior = seen.get(declaration.id);
      if (prior) {
        add({
          severity: "error",
          code: "REF_DUPLICATE_ID",
          path: declaration.path,
          message: `Duplicate ${collection} ID ${declaration.id}; first declared at ${prior}`,
          reference: declaration.id,
        });
      } else seen.set(declaration.id, declaration.path);
      const owners = globalOwners.get(declaration.id) ?? [];
      owners.push({ collection, path: declaration.path });
      globalOwners.set(declaration.id, owners);
    }
  }
  for (const [id, owners] of globalOwners) {
    const collections = new Set(owners.map((owner) => owner.collection));
    if (collections.size < 2) continue;
    add({
      severity: "warning",
      code: "REF_DUPLICATE_ID_ACROSS_COLLECTIONS",
      path: owners[1].path,
      message: `ID ${id} is shared across collections: ${[...collections].sort().join(", ")}`,
      reference: id,
    });
  }

  reference(indexes.maps, pkg.metadata.start_map_id, "$.metadata.start_map_id", "REF_START_MAP_MISSING", "map");
  const startMap = pkg.maps.find((map) => map.id === pkg.metadata.start_map_id);
  if (startMap && !startMap.spawns.some((spawn) => spawn.id === pkg.metadata.start_spawn_id)) {
    add({
      severity: "error",
      code: "REF_START_SPAWN_MISSING",
      path: "$.metadata.start_spawn_id",
      message: `Start spawn ${pkg.metadata.start_spawn_id} is absent from map ${startMap.id}`,
      reference: pkg.metadata.start_spawn_id,
      mapId: startMap.id,
    });
  }
  reference(indexes.sprites, stringField(settings, "player_sprite_id"), "$.settings.player_sprite_id", "REF_SPRITE_MISSING", "sprite");

  const auditCondition = (condition: ConditionData | undefined, path: string) => {
    if (!condition) return;
    reference(indexes.switches, condition.switch, `${path}.switch`, "REF_SWITCH_UNDECLARED", "switch", "warning");
    reference(indexes.quests, condition.quest, `${path}.quest`, "REF_QUEST_MISSING", "quest");
    reference(indexes.items, condition.has_item, `${path}.has_item`, "REF_ITEM_MISSING", "item");
    reference(indexes.entities, condition.party_contains, `${path}.party_contains`, "REF_ENTITY_MISSING", "entity");
    reference(indexes.factions, condition.faction, `${path}.faction`, "REF_FACTION_MISSING", "faction");
    auditCondition(condition.not, `${path}.not`);
    condition.all?.forEach((entry, index) => auditCondition(entry, `${path}.all[${index}]`));
    condition.any?.forEach((entry, index) => auditCondition(entry, `${path}.any[${index}]`));
  };

  const auditAction = (action: EventActionData, path: string) => {
    reference(indexes.entities, action.entity_id, `${path}.entity_id`, "REF_ENTITY_MISSING", "entity");
    reference(indexes.dialogue, action.dialogue_id, `${path}.dialogue_id`, "REF_DIALOGUE_MISSING", "dialogue");
    reference(indexes.switches, action.switch_id, `${path}.switch_id`, "REF_SWITCH_UNDECLARED", "switch", "warning");
    reference(indexes.maps, action.map_id, `${path}.map_id`, "REF_MAP_MISSING", "map");
    reference(indexes.items, action.item_id, `${path}.item_id`, "REF_ITEM_MISSING", "item");
    reference(indexes.sprites, action.sprite_id, `${path}.sprite_id`, "REF_SPRITE_MISSING", "sprite");
    reference(indexes.documents, action.document_id, `${path}.document_id`, "REF_DOCUMENT_MISSING", "document");
    reference(indexes.shops, action.shop_id, `${path}.shop_id`, "REF_SHOP_MISSING", "shop");
    reference(indexes.music, action.music_id, `${path}.music_id`, "REF_MUSIC_MISSING", "music track");
    reference(indexes.sounds, action.sound_id, `${path}.sound_id`, "REF_SOUND_MISSING", "sound effect");
    reference(indexes.factions, action.faction_id, `${path}.faction_id`, "REF_FACTION_MISSING", "faction");
    reference(indexes.abilities, action.skill_id, `${path}.skill_id`, "REF_SKILL_MISSING", "skill");
    reference(indexes.endings, action.ending_id, `${path}.ending_id`, "REF_ENDING_MISSING", "ending");
    auditCondition(action.condition, `${path}.condition`);
    if (action.type === "start_combat" || action.type === "custom") {
      add({
        severity: "error",
        code: "REF_UNSUPPORTED_ACTION",
        path: `${path}.type`,
        message: `Cutscene action ${action.type} is scaffolded but unsupported in the active authoring contract`,
      });
    }
  };

  const recipeIds = new Set(indexes.dungeonRecipes);
  for (const id of recipeIdsFromSettings(settings)) recipeIds.add(id);
  for (const id of options.knownGenerationRecipeIds ?? []) recipeIds.add(id);
  const mapTokens = new Map(pkg.maps.map((map) => [normalizeGeneratedIdToken(map.id), map]));
  const checkGeneratedOwner = (id: string | undefined, path: string, localMap?: MapData) => {
    if (!id?.startsWith("dg:")) return;
    const ownerToken = id.split(":", 3)[1];
    const owner = mapTokens.get(ownerToken);
    if (!owner) {
      add({ severity: "error", code: "REF_ORPHANED_GENERATED_RECORD", path, message: `Generated ID belongs to missing map namespace ${ownerToken}`, reference: id });
    } else if (!owner.generation) {
      add({ severity: "error", code: "REF_GENERATED_NAMESPACE_UNOWNED", path, message: `Generated ID namespace ${ownerToken} belongs to a map without generation metadata`, reference: id, mapId: owner.id });
    } else if (localMap && owner.id !== localMap.id) {
      add({ severity: "error", code: "REF_GENERATED_NAMESPACE_WRONG_MAP", path, message: `Map-local generated ID belongs to ${owner.id}`, reference: id, mapId: localMap.id });
    }
  };

  // Package-level generated records may live outside a map (for example an
  // encounter or item emitted for one generated floor), but their namespace
  // must still belong to a present generated map.
  for (const [, declarations] of declarationGroups) {
    declarations.forEach((declaration) => checkGeneratedOwner(declaration.id, declaration.path));
  }

  const mapMusic = asRecord(settings.map_music);
  if (mapMusic) {
    for (const [mapId, musicId] of Object.entries(mapMusic)) {
      reference(indexes.maps, mapId, `$.settings.map_music.${mapId}`, "REF_MAP_MISSING", "map");
      reference(indexes.music, typeof musicId === "string" ? musicId : undefined, `$.settings.map_music.${mapId}`, "REF_MUSIC_MISSING", "music track");
    }
  }
  reference(indexes.music, stringField(settings, "title_music_id"), "$.settings.title_music_id", "REF_MUSIC_MISSING", "music track");

  pkg.maps.forEach((map, mapIndex) => {
    const path = `$.maps[${mapIndex}]`;
    const authoredCells = new Set(map.cells.map((cell) => cellKey([cell.x, cell.z])));
    const localIds: Array<{ id?: string; path: string }> = [];
    const cellReference = (rawCell: readonly unknown[], cellPath: string) => {
      const cell = normalizeCell(rawCell);
      if (!mapContainsCoordinate(map, cell)) {
        add({ severity: "error", code: "REF_PLACEMENT_OUT_OF_BOUNDS", path: cellPath, message: `Coordinate [${cell.join(", ")}] is outside map bounds`, mapId: map.id, cell });
      } else if (!authoredCells.has(cellKey(cell))) {
        add({ severity: "warning", code: "REF_PLACEMENT_CELL_UNAUTHORED", path: cellPath, message: `Coordinate [${cell.join(", ")}] has no authored cell`, mapId: map.id, cell });
      }
    };
    const local = (id: string | undefined, idPath: string) => {
      localIds.push({ id, path: idPath });
      checkGeneratedOwner(id, idPath, map);
      if (map.generation && !id) {
        add({ severity: "error", code: "REF_GENERATED_ID_MISSING", path: idPath, message: "Generated map records require stable IDs", mapId: map.id });
      }
    };

    map.spawns.forEach((spawn, index) => {
      local(spawn.id, `${path}.spawns[${index}].id`);
      cellReference(spawn.cell, `${path}.spawns[${index}].cell`);
    });
    map.cells.forEach((cell, index) => {
      reference(indexes.objects, cell.object_id, `${path}.cells[${index}].object_id`, "REF_OBJECT_MISSING", "object", "error", { mapId: map.id, cell: [cell.x, cell.z] });
      reference(
        indexes.chemistryMaterials,
        cell.initial_chemistry?.material_id,
        `${path}.cells[${index}].initial_chemistry.material_id`,
        "REF_CHEMISTRY_MATERIAL_MISSING",
        "chemistry material",
        "error",
        { mapId: map.id, cell: [cell.x, cell.z] },
      );
      reference(
        indexes.chemistryMaterials,
        cell.initial_chemistry?.liquid_id,
        `${path}.cells[${index}].initial_chemistry.liquid_id`,
        "REF_CHEMISTRY_LIQUID_MISSING",
        "chemistry liquid",
        "error",
        { mapId: map.id, cell: [cell.x, cell.z] },
      );
      if (cell.region_id && !map.regions?.some((region) => region.id === cell.region_id)) {
        add({ severity: "error", code: "REF_REGION_MISSING", path: `${path}.cells[${index}].region_id`, message: `Missing map-local region ${cell.region_id}`, reference: cell.region_id, mapId: map.id, cell: [cell.x, cell.z] });
      }
    });
    map.custom_object_placements.forEach((placement, index) => {
      const owner = `${path}.custom_object_placements[${index}]`;
      local(placement.id, `${owner}.id`);
      cellReference(placement.cell, `${owner}.cell`);
      reference(indexes.objects, placement.object_id, `${owner}.object_id`, "REF_OBJECT_MISSING", "object", "error", { mapId: map.id, cell: normalizeCell(placement.cell) });
      reference(indexes.dialogue, placement.dialogue_id, `${owner}.dialogue_id`, "REF_DIALOGUE_MISSING", "dialogue");
      reference(indexes.blueprints, placement.blueprint_id, `${owner}.blueprint_id`, "REF_BLUEPRINT_MISSING", "blueprint");
      reference(indexes.items, placement.key_item_id, `${owner}.key_item_id`, "REF_KEY_ITEM_MISSING", "key item");
      if (placement.locked && !placement.key_item_id) {
        add({ severity: "error", code: "REF_LOCK_KEY_UNSPECIFIED", path: `${owner}.key_item_id`, message: "Locked object placement has no key item", mapId: map.id, cell: normalizeCell(placement.cell) });
      }
    });
    map.entity_placements.forEach((placement, index) => {
      const owner = `${path}.entity_placements[${index}]`;
      local(placement.id, `${owner}.id`);
      cellReference(placement.cell, `${owner}.cell`);
      reference(indexes.entities, placement.entity_id, `${owner}.entity_id`, "REF_ENTITY_MISSING", "entity", "error", { mapId: map.id, cell: normalizeCell(placement.cell) });
      placement.schedule?.forEach((entry, scheduleIndex) => cellReference(entry.cell, `${owner}.schedule[${scheduleIndex}].cell`));
    });
    map.item_placements.forEach((placement, index) => {
      const owner = `${path}.item_placements[${index}]`;
      local(placement.id, `${owner}.id`);
      cellReference(placement.cell, `${owner}.cell`);
      reference(indexes.items, placement.item_id, `${owner}.item_id`, "REF_ITEM_MISSING", "item");
    });
    map.container_placements.forEach((placement, index) => {
      const owner = `${path}.container_placements[${index}]`;
      local(placement.id, `${owner}.id`);
      cellReference(placement.cell, `${owner}.cell`);
      reference(indexes.objects, placement.object_id, `${owner}.object_id`, "REF_OBJECT_MISSING", "object");
      reference(indexes.blueprints, placement.blueprint_id, `${owner}.blueprint_id`, "REF_BLUEPRINT_MISSING", "blueprint");
      reference(indexes.items, placement.key_item_id, `${owner}.key_item_id`, "REF_KEY_ITEM_MISSING", "key item");
      if (placement.locked && !placement.key_item_id) {
        add({ severity: "error", code: "REF_LOCK_KEY_UNSPECIFIED", path: `${owner}.key_item_id`, message: "Locked container has no key item", mapId: map.id });
      }
      placement.items.forEach((entry, itemIndex) => reference(indexes.items, entry.item_id, `${owner}.items[${itemIndex}].item_id`, "REF_ITEM_MISSING", "item"));
    });
    map.triggers.forEach((trigger, index) => {
      const owner = `${path}.triggers[${index}]`;
      local(trigger.id, `${owner}.id`);
      if (trigger.cell) cellReference(trigger.cell, `${owner}.cell`);
      reference(indexes.cutscenes, trigger.cutscene_id, `${owner}.cutscene_id`, "REF_CUTSCENE_MISSING", "cutscene");
      trigger.conditions.forEach((condition, conditionIndex) => reference(indexes.switches, condition.switch_id, `${owner}.conditions[${conditionIndex}].switch_id`, "REF_SWITCH_UNDECLARED", "switch", "warning"));
      auditCondition(trigger.condition, `${owner}.condition`);
    });
    map.exits.forEach((exit, index) => {
      const owner = `${path}.exits[${index}]`;
      local(exit.id, `${owner}.id`);
      cellReference(exit.cell, `${owner}.cell`);
      reference(indexes.maps, exit.target_map_id, `${owner}.target_map_id`, "REF_EXIT_MAP_MISSING", "target map");
      reference(indexes.exits, exit.paired_exit_id, `${owner}.paired_exit_id`, "REF_PAIRED_EXIT_MISSING", "paired exit");
      const targetMap = pkg.maps.find((candidate) => candidate.id === exit.target_map_id);
      if (exit.target_spawn_id && targetMap && !targetMap.spawns.some((spawn) => spawn.id === exit.target_spawn_id)) {
        add({ severity: "error", code: "REF_EXIT_SPAWN_MISSING", path: `${owner}.target_spawn_id`, message: `Target spawn ${exit.target_spawn_id} is absent from ${targetMap.id}`, reference: exit.target_spawn_id, mapId: map.id, cell: normalizeCell(exit.cell) });
      }
      auditCondition(exit.condition, `${owner}.condition`);
    });
    map.regions?.forEach((region, index) => {
      const owner = `${path}.regions[${index}]`;
      local(region.id, `${owner}.id`);
      reference(indexes.factions, region.faction_id, `${owner}.faction_id`, "REF_FACTION_MISSING", "faction");
      reference(indexes.switches, region.irreversible_denial_flag, `${owner}.irreversible_denial_flag`, "REF_SWITCH_UNDECLARED", "switch", "warning");
      reference(indexes.entities, region.alderamontico_grid?.lens_entity_id, `${owner}.alderamontico_grid.lens_entity_id`, "REF_ENTITY_MISSING", "entity");
      region.passive_checks.forEach((check, checkIndex) => {
        reference(indexes.factions, check.faction_id, `${owner}.passive_checks[${checkIndex}].faction_id`, "REF_FACTION_MISSING", "faction");
        reference(indexes.switches, check.flag_id, `${owner}.passive_checks[${checkIndex}].flag_id`, "REF_SWITCH_UNDECLARED", "switch", "warning");
      });
    });

    const localSeen = new Map<string, string>();
    for (const declaration of localIds) {
      if (!declaration.id) continue;
      const prior = localSeen.get(declaration.id);
      if (prior) add({ severity: "error", code: "REF_DUPLICATE_MAP_LOCAL_ID", path: declaration.path, message: `Map-local ID ${declaration.id} is already used at ${prior}`, reference: declaration.id, mapId: map.id });
      else localSeen.set(declaration.id, declaration.path);
    }

    if (map.generation) {
      if (/continent|composed_continent|procedural.region/i.test(map.generation.generatorId)) {
        add({ severity: "error", code: "REF_ARCHIVED_SYSTEM", path: `${path}.generation.generatorId`, message: `Generation metadata references removed system ${map.generation.generatorId}`, mapId: map.id });
      }
      if (recipeIds.size === 0) {
        add({ severity: "warning", code: "REF_GENERATION_RECIPE_UNVERIFIABLE", path: `${path}.generation.recipeId`, message: `No package or external recipe registry was supplied for ${map.generation.recipeId}`, reference: map.generation.recipeId, mapId: map.id });
      } else {
        reference(recipeIds, map.generation.recipeId, `${path}.generation.recipeId`, "REF_GENERATION_RECIPE_MISSING", "generation recipe", "error", { mapId: map.id });
      }
      const recipe = pkg.dungeon_recipes.find((entry) => entry.id === map.generation?.recipeId);
      if (recipe && recipe.version !== map.generation.recipeVersion) {
        add({
          severity: "warning",
          code: "REF_GENERATION_RECIPE_VERSION_MISMATCH",
          path: `${path}.generation.recipeVersion`,
          message: `Map records recipe version ${map.generation.recipeVersion}, but package recipe ${recipe.id} is version ${recipe.version}.`,
          reference: recipe.id,
          mapId: map.id,
        });
      }
    }
  });

  const builtInRoomBuilders = new Set(["rectangular_room_v1"]);
  pkg.dungeon_recipes.forEach((recipe, recipeIndex) => {
    const path = `$.dungeon_recipes[${recipeIndex}]`;
    reference(indexes.dungeonThemes, recipe.themeId, `${path}.themeId`, "REF_DUNGEON_THEME_MISSING", "dungeon theme");
    recipe.architecture.roomArchetypePool.forEach((entry, index) =>
      reference(indexes.dungeonArchetypes, entry.id, `${path}.architecture.roomArchetypePool[${index}].id`, "REF_DUNGEON_ARCHETYPE_MISSING", "room archetype"));
    recipe.architecture.roomTemplatePool.forEach((entry, index) =>
      reference(indexes.dungeonTemplates, entry.id, `${path}.architecture.roomTemplatePool[${index}].id`, "REF_DUNGEON_TEMPLATE_MISSING", "room template"));
    recipe.architecture.proceduralRoomBuilderPool.forEach((entry, index) =>
      reference(builtInRoomBuilders, entry.id, `${path}.architecture.proceduralRoomBuilderPool[${index}].id`, "REF_DUNGEON_ROOM_BUILDER_MISSING", "procedural room builder"));
    recipe.constraints.requiredRoomArchetypes.forEach((id, index) =>
      reference(indexes.dungeonArchetypes, id, `${path}.constraints.requiredRoomArchetypes[${index}]`, "REF_DUNGEON_ARCHETYPE_MISSING", "required room archetype"));
    recipe.constraints.forbiddenAdjacencies.forEach((rule, index) => {
      reference(indexes.dungeonArchetypes, rule.fromArchetypeId, `${path}.constraints.forbiddenAdjacencies[${index}].fromArchetypeId`, "REF_DUNGEON_ARCHETYPE_MISSING", "room archetype");
      reference(indexes.dungeonArchetypes, rule.toArchetypeId, `${path}.constraints.forbiddenAdjacencies[${index}].toArchetypeId`, "REF_DUNGEON_ARCHETYPE_MISSING", "room archetype");
    });
    recipe.constraints.permittedChemistryMaterials.forEach((id, index) =>
      reference(indexes.chemistryMaterials, id, `${path}.constraints.permittedChemistryMaterials[${index}]`, "REF_CHEMISTRY_MATERIAL_MISSING", "chemistry material"));
    reference(indexes.dungeonEncounterProfiles, recipe.population.encounterProfileId, `${path}.population.encounterProfileId`, "REF_DUNGEON_ENCOUNTER_PROFILE_MISSING", "dungeon encounter profile");
    reference(indexes.dungeonHazardProfiles, recipe.population.hazardProfileId, `${path}.population.hazardProfileId`, "REF_DUNGEON_HAZARD_PROFILE_MISSING", "dungeon hazard profile");
    reference(indexes.dungeonRewardProfiles, recipe.population.rewardProfileId, `${path}.population.rewardProfileId`, "REF_DUNGEON_REWARD_PROFILE_MISSING", "dungeon reward profile");
    reference(indexes.dungeonNarrativeProfiles, recipe.population.narrativeProfileId, `${path}.population.narrativeProfileId`, "REF_DUNGEON_NARRATIVE_PROFILE_MISSING", "dungeon narrative profile");
  });

  pkg.dungeon_themes.forEach((theme, themeIndex) => {
    const path = `$.dungeon_themes[${themeIndex}]`;
    const architectureRefs = [
      ["floorObjectId", theme.architecture.floorObjectId],
      ["wallObjectId", theme.architecture.wallObjectId],
      ["doorObjectId", theme.architecture.doorObjectId],
      ["containerObjectId", theme.architecture.containerObjectId],
      ["pushableObjectId", theme.architecture.pushableObjectId],
      ["stairObjectId", theme.architecture.stairObjectId],
      ["terminalObjectId", theme.architecture.terminalObjectId],
    ] as const;
    architectureRefs.forEach(([field, id]) =>
      reference(indexes.objects, id, `${path}.architecture.${field}`, "REF_OBJECT_MISSING", "object"));
    theme.population.encounterProfileIds.forEach((id, index) =>
      reference(indexes.dungeonEncounterProfiles, id, `${path}.population.encounterProfileIds[${index}]`, "REF_DUNGEON_ENCOUNTER_PROFILE_MISSING", "dungeon encounter profile"));
    theme.population.hazardProfileIds.forEach((id, index) =>
      reference(indexes.dungeonHazardProfiles, id, `${path}.population.hazardProfileIds[${index}]`, "REF_DUNGEON_HAZARD_PROFILE_MISSING", "dungeon hazard profile"));
    theme.population.rewardProfileIds.forEach((id, index) =>
      reference(indexes.dungeonRewardProfiles, id, `${path}.population.rewardProfileIds[${index}]`, "REF_DUNGEON_REWARD_PROFILE_MISSING", "dungeon reward profile"));
    theme.population.narrativeProfileIds.forEach((id, index) =>
      reference(indexes.dungeonNarrativeProfiles, id, `${path}.population.narrativeProfileIds[${index}]`, "REF_DUNGEON_NARRATIVE_PROFILE_MISSING", "dungeon narrative profile"));
    theme.keyItemPool.forEach((entry, index) =>
      reference(indexes.items, entry.id, `${path}.keyItemPool[${index}].id`, "REF_ITEM_MISSING", "key item"));
    theme.rewardItemPool.forEach((entry, index) =>
      reference(indexes.items, entry.id, `${path}.rewardItemPool[${index}].id`, "REF_ITEM_MISSING", "reward item"));
    theme.chemistryMaterialIds.forEach((id, index) =>
      reference(indexes.chemistryMaterials, id, `${path}.chemistryMaterialIds[${index}]`, "REF_CHEMISTRY_MATERIAL_MISSING", "chemistry material"));
  });

  pkg.dungeon_room_archetypes.forEach((archetype, archetypeIndex) => {
    const path = `$.dungeon_room_archetypes[${archetypeIndex}]`;
    archetype.forbiddenNeighborArchetypes.forEach((id, index) =>
      reference(indexes.dungeonArchetypes, id, `${path}.forbiddenNeighborArchetypes[${index}]`, "REF_DUNGEON_ARCHETYPE_MISSING", "room archetype"));
  });

  pkg.dungeon_room_templates.forEach((template, templateIndex) => {
    const path = `$.dungeon_room_templates[${templateIndex}]`;
    template.archetypeIds.forEach((id, index) =>
      reference(indexes.dungeonArchetypes, id, `${path}.archetypeIds[${index}]`, "REF_DUNGEON_ARCHETYPE_MISSING", "room archetype"));
    template.requiredObjectRefs.forEach((id, index) =>
      reference(indexes.objects, id, `${path}.requiredObjectRefs[${index}]`, "REF_OBJECT_MISSING", "object"));
    template.requiredMaterialRefs.forEach((id, index) =>
      reference(indexes.chemistryMaterials, id, `${path}.requiredMaterialRefs[${index}]`, "REF_CHEMISTRY_MATERIAL_MISSING", "chemistry material"));
    template.cells.forEach((cell, index) =>
      reference(indexes.objects, cell.objectId, `${path}.cells[${index}].objectId`, "REF_OBJECT_MISSING", "object"));
  });

  pkg.dungeon_encounter_profiles.forEach((profile, profileIndex) => {
    const path = `$.dungeon_encounter_profiles[${profileIndex}]`;
    profile.factionIds.forEach((id, index) =>
      reference(indexes.factions, id, `${path}.factionIds[${index}]`, "REF_FACTION_MISSING", "faction"));
    profile.situations.forEach((situation, situationIndex) => {
      const owner = `${path}.situations[${situationIndex}]`;
      reference(indexes.encounters, situation.encounterId, `${owner}.encounterId`, "REF_ENCOUNTER_MISSING", "encounter");
      situation.actorSlots.forEach((slot, slotIndex) =>
        reference(indexes.entities, slot.entityId, `${owner}.actorSlots[${slotIndex}].entityId`, "REF_ENTITY_MISSING", "entity"));
    });
  });

  pkg.dungeon_hazard_profiles.forEach((profile, profileIndex) => {
    const path = `$.dungeon_hazard_profiles[${profileIndex}]`;
    profile.patterns.forEach((pattern, patternIndex) => {
      const owner = `${path}.patterns[${patternIndex}]`;
      reference(indexes.chemistryMaterials, pattern.initialChemistry.materialId, `${owner}.initialChemistry.materialId`, "REF_CHEMISTRY_MATERIAL_MISSING", "chemistry material");
      reference(indexes.chemistryMaterials, pattern.initialChemistry.liquidId, `${owner}.initialChemistry.liquidId`, "REF_CHEMISTRY_LIQUID_MISSING", "chemistry liquid");
      pattern.sourceObjectIds.forEach((id, index) =>
        reference(indexes.objects, id, `${owner}.sourceObjectIds[${index}]`, "REF_OBJECT_MISSING", "object"));
      pattern.responseObjectIds.forEach((id, index) =>
        reference(indexes.objects, id, `${owner}.responseObjectIds[${index}]`, "REF_OBJECT_MISSING", "object"));
    });
  });

  pkg.dungeon_reward_profiles.forEach((profile, profileIndex) => {
    const path = `$.dungeon_reward_profiles[${profileIndex}]`;
    profile.keyItemPool.forEach((entry, index) =>
      reference(indexes.items, entry.id, `${path}.keyItemPool[${index}].id`, "REF_ITEM_MISSING", "key item"));
    profile.containerObjectIds.forEach((entry, index) =>
      reference(indexes.objects, entry.id, `${path}.containerObjectIds[${index}].id`, "REF_OBJECT_MISSING", "container object"));
    profile.tiers.forEach((tier, tierIndex) => tier.itemPool.forEach((entry, itemIndex) =>
      reference(indexes.items, entry.id, `${path}.tiers[${tierIndex}].itemPool[${itemIndex}].id`, "REF_ITEM_MISSING", "reward item")));
  });

  pkg.dungeon_narrative_profiles.forEach((profile, profileIndex) => {
    const path = `$.dungeon_narrative_profiles[${profileIndex}]`;
    profile.traces.forEach((trace, traceIndex) => {
      const owner = `${path}.traces[${traceIndex}]`;
      reference(indexes.documents, trace.documentId, `${owner}.documentId`, "REF_DOCUMENT_MISSING", "document");
      reference(indexes.objects, trace.objectId, `${owner}.objectId`, "REF_OBJECT_MISSING", "object");
      reference(indexes.entities, trace.entityId, `${owner}.entityId`, "REF_ENTITY_MISSING", "entity");
      reference(indexes.dialogue, trace.dialogueId, `${owner}.dialogueId`, "REF_DIALOGUE_MISSING", "dialogue");
      reference(indexes.cutscenes, trace.cutsceneId, `${owner}.cutsceneId`, "REF_CUTSCENE_MISSING", "cutscene");
    });
  });

  pkg.object_library.forEach((object, index) => {
    const path = `$.object_library[${index}]`;
    reference(indexes.blueprints, object.blueprint_id, `${path}.blueprint_id`, "REF_BLUEPRINT_MISSING", "blueprint");
    reference(indexes.sprites, object.tile_sprite_id, `${path}.tile_sprite_id`, "REF_SPRITE_MISSING", "sprite");
  });
  pkg.entities.forEach((entity, index) => {
    const path = `$.entities[${index}]`;
    reference(indexes.sprites, entity.sprite_id, `${path}.sprite_id`, "REF_SPRITE_MISSING", "sprite");
    reference(indexes.dialogue, entity.dialogue_id, `${path}.dialogue_id`, "REF_DIALOGUE_MISSING", "dialogue");
    reference(indexes.dialogue, entity.party_dialogue_id, `${path}.party_dialogue_id`, "REF_DIALOGUE_MISSING", "dialogue");
    entity.skills?.forEach((id, skillIndex) => reference(indexes.abilities, id, `${path}.skills[${skillIndex}]`, "REF_SKILL_MISSING", "skill"));
    reference(indexes.dialogue, entity.combat_attend_dialogue_id, `${path}.combat_attend_dialogue_id`, "REF_DIALOGUE_MISSING", "dialogue");
    reference(indexes.entities, entity.combat_attend_pacify_entity_id, `${path}.combat_attend_pacify_entity_id`, "REF_ENTITY_MISSING", "entity");
    reference(indexes.cutscenes, entity.on_defeat_cutscene_id, `${path}.on_defeat_cutscene_id`, "REF_CUTSCENE_MISSING", "cutscene");
  });
  pkg.items.forEach((item, index) => {
    reference(indexes.sprites, item.sprite_id, `$.items[${index}].sprite_id`, "REF_SPRITE_MISSING", "sprite");
    reference(indexes.blueprints, item.blueprint_id, `$.items[${index}].blueprint_id`, "REF_BLUEPRINT_MISSING", "blueprint");
  });
  pkg.abilities.forEach((ability, index) => {
    ability.payloads.forEach((payload, payloadIndex) => reference(indexes.entities, payload.entity_id, `$.abilities[${index}].payloads[${payloadIndex}].entity_id`, "REF_ENTITY_MISSING", "summoned entity"));
  });
  pkg.dialogue.forEach((dialogue, index) => {
    const path = `$.dialogue[${index}]`;
    const nodeIds = new Set<string>();
    dialogue.nodes.forEach((node, nodeIndex) => {
      if (nodeIds.has(node.id)) add({ severity: "error", code: "REF_DUPLICATE_DIALOGUE_NODE_ID", path: `${path}.nodes[${nodeIndex}].id`, message: `Duplicate dialogue node ID ${node.id}`, reference: node.id });
      nodeIds.add(node.id);
    });
    dialogue.nodes.forEach((node, nodeIndex) => node.options.forEach((option, optionIndex) => {
      const owner = `${path}.nodes[${nodeIndex}].options[${optionIndex}]`;
      if (option.next_node_id && !nodeIds.has(option.next_node_id)) add({ severity: "error", code: "REF_DIALOGUE_NODE_MISSING", path: `${owner}.next_node_id`, message: `Missing dialogue node ${option.next_node_id}`, reference: option.next_node_id });
      reference(indexes.quests, option.required_quest, `${owner}.required_quest`, "REF_QUEST_MISSING", "quest");
      reference(indexes.switches, option.required_switch, `${owner}.required_switch`, "REF_SWITCH_UNDECLARED", "switch", "warning");
      reference(indexes.quests, option.trigger_quest, `${owner}.trigger_quest`, "REF_QUEST_MISSING", "quest");
      reference(indexes.switches, option.set_switch, `${owner}.set_switch`, "REF_SWITCH_UNDECLARED", "switch", "warning");
      option.set_switches?.forEach((entry, switchIndex) => reference(indexes.switches, entry.switch_id, `${owner}.set_switches[${switchIndex}].switch_id`, "REF_SWITCH_UNDECLARED", "switch", "warning"));
      reference(indexes.cutscenes, option.trigger_cutscene, `${owner}.trigger_cutscene`, "REF_CUTSCENE_MISSING", "cutscene");
      auditCondition(option.condition, `${owner}.condition`);
    }));
  });
  pkg.quests.forEach((quest, questIndex) => quest.objectives.forEach((objective, objectiveIndex) => {
    const path = `$.quests[${questIndex}].objectives[${objectiveIndex}].target_id`;
    if (objective.type === "talk" || objective.type === "kill") reference(indexes.entities, objective.target_id, path, "REF_ENTITY_MISSING", "entity");
    else if (objective.type === "collect") reference(indexes.items, objective.target_id, path, "REF_ITEM_MISSING", "item");
    else if (objective.type === "explore") reference(indexes.maps, objective.target_id, path, "REF_MAP_MISSING", "map", "warning");
  }));
  pkg.cutscenes.forEach((cutscene, cutsceneIndex) => cutscene.actions.forEach((action, actionIndex) => auditAction(action, `$.cutscenes[${cutsceneIndex}].actions[${actionIndex}]`)));
  pkg.shops.forEach((shop, shopIndex) => shop.items.forEach((entry, itemIndex) => {
    reference(indexes.items, entry.item_id, `$.shops[${shopIndex}].items[${itemIndex}].item_id`, "REF_ITEM_MISSING", "item");
    auditCondition(entry.condition, `$.shops[${shopIndex}].items[${itemIndex}].condition`);
    entry.price_modifiers.forEach((modifier, modifierIndex) => auditCondition(modifier.condition, `$.shops[${shopIndex}].items[${itemIndex}].price_modifiers[${modifierIndex}].condition`));
  }));
  pkg.encounters.forEach((encounter, encounterIndex) => {
    reference(indexes.factions, encounter.factionId, `$.encounters[${encounterIndex}].factionId`, "REF_FACTION_MISSING", "faction");
    [...encounter.slots, ...(encounter.reinforcementSlots ?? [])].forEach((slot, slotIndex) => reference(indexes.entities, slot.entityId, `$.encounters[${encounterIndex}].slots[${slotIndex}].entityId`, "REF_ENTITY_MISSING", "entity"));
  });
  pkg.barks.forEach((bark, barkIndex) => {
    bark.speakers.forEach((speaker, speakerIndex) => reference(indexes.entities, typeof speaker === "string" ? speaker : undefined, `$.barks[${barkIndex}].speakers[${speakerIndex}]`, "REF_ENTITY_MISSING", "entity"));
    bark.lines.forEach((line, lineIndex) => reference(indexes.entities, line.speaker, `$.barks[${barkIndex}].lines[${lineIndex}].speaker`, "REF_ENTITY_MISSING", "entity"));
    auditCondition(bark.condition, `$.barks[${barkIndex}].condition`);
  });
  pkg.object_blueprints.forEach((blueprint, index) => {
    reference(indexes.blueprints, blueprint.extends, `$.object_blueprints[${index}].extends`, "REF_BLUEPRINT_MISSING", "parent blueprint");
  });
  pkg.simulation_processes.forEach((process, processIndex) => {
    reference(indexes.workstations, process.workstation_id, `$.simulation_processes[${processIndex}].workstation_id`, "REF_WORKSTATION_MISSING", "workstation");
    for (const [field, stacks] of [["input_items", process.input_items], ["output_items", process.output_items], ["waste_items", process.waste_items]] as const) {
      stacks.forEach((stack, stackIndex) => reference(indexes.items, stack.item_id, `$.simulation_processes[${processIndex}].${field}[${stackIndex}].item_id`, "REF_ITEM_MISSING", "item"));
    }
    reference(indexes.shops, process.economy?.shop_id, `$.simulation_processes[${processIndex}].economy.shop_id`, "REF_SHOP_MISSING", "shop");
    reference(indexes.items, process.economy?.stock_item_id, `$.simulation_processes[${processIndex}].economy.stock_item_id`, "REF_ITEM_MISSING", "item");
  });
  pkg.simulation_workstations.forEach((workstation, workstationIndex) => {
    reference(indexes.maps, workstation.map_id, `$.simulation_workstations[${workstationIndex}].map_id`, "REF_MAP_MISSING", "map");
    workstation.process_ids.forEach((id, processIndex) => reference(indexes.processes, id, `$.simulation_workstations[${workstationIndex}].process_ids[${processIndex}]`, "REF_PROCESS_MISSING", "process"));
  });

  for (const key of Object.keys(settings)) {
    if (/continent|composed_continent|procedural_region/i.test(key)) {
      add({ severity: "error", code: "REF_ARCHIVED_SYSTEM", path: `$.settings.${key}`, message: `Package settings retain archived continent-system key ${key}` });
    }
  }

  return finalizeReferenceAudit(issues);
};

const finalizeReferenceAudit = (issues: ReferenceAuditIssue[]): ReferenceAuditReport => {
  const rank: Record<ReferenceAuditSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((left, right) =>
    rank[left.severity] - rank[right.severity] ||
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    (left.reference ?? "").localeCompare(right.reference ?? ""),
  );
  const counts = {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
  return { valid: counts.errors === 0, issues, counts };
};

export const formatReferenceAuditReport = (report: ReferenceAuditReport): string => {
  const lines = report.issues.map((issue) =>
    `${issue.severity.toUpperCase()} ${issue.code} ${issue.path}: ${issue.message}`,
  );
  lines.push(`reference audit: ${report.counts.errors} errors, ${report.counts.warnings} warnings, ${report.counts.info} info`);
  return lines.join("\n");
};
