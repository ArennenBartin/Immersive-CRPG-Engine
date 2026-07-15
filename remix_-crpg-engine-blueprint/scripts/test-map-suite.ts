// Headless acceptance test for the Engine QA Suite
// (docs/QA_SUITE_REBUILD_PLAN_V1.md, Phase 6). Run: npm run test:suite
//
// Part 1 — reference integrity: every id the suite content points at resolves
// (maps, spawns, dialogue, cutscenes, quests, items, skills, shops, factions,
// documents, triggers, workstations), and the fine expansion succeeds.
//
// Part 2 — chemistry acceptance on the AUTHORED rooms, by literally executing
// each lever cutscene's chem_spill actions against the expanded package:
//   flood — water oozes over successive move-ticks, pools in the basin,
//           leaves the raised walkway dry, and the active set drains;
//   race  — the water frontier outruns the honey frontier;
//   fire  — burn crosses the oil trail but never the moat-guarded vault;
//   gas   — miasma reaches distant cells, then dissipates to nothing.

import {
  type EventActionData,
  type GamePackage,
  type MapData,
} from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  createDefaultEnginePackage,
  refreshBundledEnginePackage,
} from "../src/store/engineStore";
import type { PlaySave } from "../src/schema/save";
import {
  TEST_SUITE_MAP_IDS,
  TEST_SUITE_PLAYER_SPRITE_ID,
  TEST_SUITE_START_MAP_ID,
  TEST_SUITE_START_SPAWN_ID,
} from "../src/data/testingMapSuite";
import {
  FINE_PER_MACRO,
  advanceChemistryForSave,
  applyChemistrySpillToSave,
  expandGamePackageToFine,
  fineCenterOfMacro,
  readChemistryGridForSave,
} from "../src/engine-core";
import { cellChemKey, type ChemCell } from "../src/engine-core/chemistry";

let passed = 0;
let failed = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const authored = createQaSuitePackage();
const fine = expandGamePackageToFine(authored);

// ── Part 1: reference integrity ──────────────────────────────────────────────
console.log("suite: reference integrity");
{
  const defaultPackage = createDefaultEnginePackage();
  const defaultSpriteById = new Map(
    defaultPackage.sprite_library.map((sprite) => [sprite.id, sprite]),
  );
  const placedEntityIds = new Set(
    defaultPackage.maps.flatMap((map) =>
      (map.entity_placements || []).map((placement) => placement.entity_id),
    ),
  );
  const placedEntities = defaultPackage.entities.filter((entity) =>
    placedEntityIds.has(entity.id),
  );

  ok(
    "fresh Studio workspace is the canonical eleven-map QA suite",
    defaultPackage.maps.length === TEST_SUITE_MAP_IDS.length &&
      defaultPackage.maps.every((map) => TEST_SUITE_MAP_IDS.includes(map.id)),
  );
  ok(
    "fresh Studio workspace uses the animated GIF player",
    defaultPackage.settings.player_sprite_id === TEST_SUITE_PLAYER_SPRITE_ID &&
      defaultSpriteById.get(TEST_SUITE_PLAYER_SPRITE_ID)?.animated === true &&
      defaultSpriteById.get(TEST_SUITE_PLAYER_SPRITE_ID)?.data_url?.endsWith(".gif") === true,
  );
  ok(
    "every placed QA entity resolves to an animated GIF",
    placedEntities.length > 0 &&
      placedEntities.every((entity) => {
        const sprite = entity.sprite_id
          ? defaultSpriteById.get(entity.sprite_id)
          : undefined;
        return sprite?.animated === true && sprite.data_url?.endsWith(".gif") === true;
      }),
  );

  const editedQaPackage = {
    ...defaultPackage,
    metadata: { ...defaultPackage.metadata, version: "stale-qa-version" },
    maps: defaultPackage.maps.map((map, index) =>
      index === 0 ? { ...map, display_name: "Hand-edited QA sentinel" } : map,
    ),
  };
  const hydratedQaPackage = refreshBundledEnginePackage(editedQaPackage);
  ok(
    "QA-shaped persisted workspaces are never refreshed during hydration",
    hydratedQaPackage === editedQaPackage &&
      hydratedQaPackage.metadata.version === "stale-qa-version" &&
      hydratedQaPackage.maps[0]?.display_name === "Hand-edited QA sentinel",
  );

  const customPackage = {
    ...defaultPackage,
    metadata: { ...defaultPackage.metadata, version: "custom-version" },
    maps: defaultPackage.maps.slice(0, 1),
  };
  ok(
    "custom workspaces are preserved during hydration",
    refreshBundledEnginePackage(customPackage) === customPackage,
  );

  const mapById = new Map(authored.maps.map((map) => [map.id, map]));
  const dialogueIds = new Set(authored.dialogue.map((d) => d.id));
  const cutsceneIds = new Set(authored.cutscenes.map((c) => c.id));
  const itemIds = new Set(authored.items.map((i) => i.id));
  const skillIds = new Set(authored.abilities.map((s) => s.id));
  const shopIds = new Set(authored.shops.map((s) => s.id));
  const documentIds = new Set(authored.documents.map((d) => d.id));
  const entityIds = new Set(authored.entities.map((e) => e.id));
  const factionIds = new Set((authored.factions as Array<{ id: string }>).map((f) => f.id));
  const endingIds = new Set((authored.endings as Array<{ id: string }>).map((e) => e.id));

  const problems: string[] = [];
  const qaMaps = authored.maps.filter((map) => map.id.startsWith("qa_"));
  const expectedMapIds = new Set(TEST_SUITE_MAP_IDS);

  ok("suite start map exists", mapById.has(authored.metadata.start_map_id));
  ok(
    "suite contains exactly the hub plus ten labs",
    authored.maps.length === 11 &&
      qaMaps.length === 11 &&
      authored.maps.every((map) => expectedMapIds.has(map.id)),
    `maps: ${authored.maps.map((m) => m.id).join(", ")}`,
  );

  const perceptionMap = mapById.get("qa_perception_lab");
  const portableLamp = authored.items.find((item) => item.id === "qa_portable_lamp");
  const darkArtifact = authored.items.find((item) => item.id === "qa_dark_artifact");
  const perceptionEntities = [
    "qa_sight_watcher",
    "qa_sound_hunter",
    "qa_light_glass_watcher",
  ].map((id) => authored.entities.find((entity) => entity.id === id));

  ok(
    "perception lab authors true zero ambient light",
    perceptionMap?.ambient_light === 0,
    `ambient=${perceptionMap?.ambient_light}`,
  );
  ok(
    "portable QA lamp is a persistent radius-14 throwable light that exposes its carrier",
    portableLamp?.light_source?.mobility === "throwable" &&
      portableLamp.light_source.persistent === true &&
      portableLamp.light_source.exposes_carrier === true &&
      portableLamp.light_source.intensity > 0 &&
      portableLamp.light_source.radius === 14 &&
      portableLamp.light_source.stimulus_tags.includes("glass") &&
      perceptionMap?.item_placements.some(
        (placement) => placement.item_id === portableLamp.id,
      ) === true,
  );

  const [sightWatcher, soundHunter, glassWatcher] = perceptionEntities;
  const sensoryProfileIds = perceptionEntities
    .map((entity) => entity?.sensory_profile?.id)
    .filter((id): id is string => Boolean(id));
  ok(
    "perception lab has three distinct, channel-authored sensory profiles",
    perceptionEntities.every((entity) => Boolean(entity?.sensory_profile?.channels.length)) &&
      new Set(sensoryProfileIds).size === 3 &&
      sightWatcher?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("visible_player") &&
          channel.requires_los &&
          channel.requires_view_cone &&
          channel.requires_illumination,
      ) === true &&
      soundHunter?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("sound") &&
          !channel.requires_los &&
          !channel.requires_illumination,
      ) === true &&
      glassWatcher?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("light") &&
          channel.stimulus_tags?.includes("glass"),
      ) === true,
  );
  ok(
    "perception lab includes interior LOS occlusion and tagged smoke",
    perceptionMap?.cells.some(
      (cell) => cell.blocks_los && Math.abs(cell.x) < 10 && Math.abs(cell.z) < 10,
    ) === true &&
      perceptionMap.cells.some(
        (cell) => cell.hazard === "smoke" && cell.tag === "smoke_obscurance",
      ),
  );
  ok(
    "dark artifact is placed as a non-emissive control",
    Boolean(darkArtifact) &&
      !darkArtifact?.light_source &&
      perceptionMap?.item_placements.some(
        (placement) => placement.item_id === darkArtifact?.id,
      ) === true,
  );
  ok(
    "perception lab has fixed/noise props and a return to the canonical hub spawn",
    perceptionMap?.custom_object_placements.some(
      (placement) =>
        placement.id === "qa_fixed_environment_lamp" &&
        placement.object_id === "obj_oil_lamp",
    ) === true &&
      perceptionMap.custom_object_placements.some(
        (placement) => placement.id === "qa_noise_crate" && placement.object_id === "obj_crate",
      ) &&
      perceptionMap.exits.some(
        (mapExit) =>
          mapExit.target_map_id === TEST_SUITE_START_MAP_ID &&
          mapExit.target_spawn_id === TEST_SUITE_START_SPAWN_ID,
      ),
  );

  const checkActions = (owner: string, actions: EventActionData[]) => {
    for (const action of actions) {
      if (action.dialogue_id && !dialogueIds.has(action.dialogue_id))
        problems.push(`${owner}: missing dialogue ${action.dialogue_id}`);
      if (action.map_id && !mapById.has(action.map_id))
        problems.push(`${owner}: missing map ${action.map_id}`);
      if (action.item_id && !itemIds.has(action.item_id))
        problems.push(`${owner}: missing item ${action.item_id}`);
      if (action.skill_id && !skillIds.has(action.skill_id))
        problems.push(`${owner}: missing skill ${action.skill_id}`);
      if (action.shop_id && !shopIds.has(action.shop_id))
        problems.push(`${owner}: missing shop ${action.shop_id}`);
      if (action.document_id && !documentIds.has(action.document_id))
        problems.push(`${owner}: missing document ${action.document_id}`);
      if (action.entity_id && !entityIds.has(action.entity_id))
        problems.push(`${owner}: missing entity ${action.entity_id}`);
      if (action.faction_id && !factionIds.has(action.faction_id))
        problems.push(`${owner}: missing faction ${action.faction_id}`);
      if (action.ending_id && !endingIds.has(action.ending_id))
        problems.push(`${owner}: missing ending ${action.ending_id}`);
      if (action.type === "chem_spill" && !action.cell)
        problems.push(`${owner}: chem_spill without a cell`);
    }
  };
  authored.cutscenes
    .filter((cutscene) => cutscene.id.startsWith("qa_"))
    .forEach((cutscene) => checkActions(`cutscene ${cutscene.id}`, cutscene.actions));

  for (const map of qaMaps) {
    const spawnIds = new Set(map.spawns.map((spawn) => spawn.id));
    void spawnIds;
    for (const mapExit of map.exits || []) {
      const target = mapById.get(mapExit.target_map_id);
      if (!target) {
        problems.push(`map ${map.id}: exit to missing map ${mapExit.target_map_id}`);
        continue;
      }
      if (
        mapExit.target_spawn_id &&
        !target.spawns.some((spawn) => spawn.id === mapExit.target_spawn_id)
      )
        problems.push(
          `map ${map.id}: exit to ${mapExit.target_map_id} missing spawn ${mapExit.target_spawn_id}`,
        );
    }
    for (const trigger of map.triggers || []) {
      if (!cutsceneIds.has(trigger.cutscene_id))
        problems.push(`map ${map.id}: trigger ${trigger.id} missing cutscene ${trigger.cutscene_id}`);
    }
    for (const placement of map.entity_placements || []) {
      if (!entityIds.has(placement.entity_id))
        problems.push(`map ${map.id}: placement of missing entity ${placement.entity_id}`);
    }
    for (const placement of map.item_placements || []) {
      if (!itemIds.has(placement.item_id))
        problems.push(`map ${map.id}: placement of missing item ${placement.item_id}`);
    }
    for (const placement of map.custom_object_placements || []) {
      if (placement.dialogue_id && !dialogueIds.has(placement.dialogue_id))
        problems.push(`map ${map.id}: object with missing dialogue ${placement.dialogue_id}`);
    }
    for (const container of map.container_placements || []) {
      for (const stack of container.items || []) {
        if (!itemIds.has(stack.item_id))
          problems.push(`map ${map.id}: container with missing item ${stack.item_id}`);
      }
      if (container.key_item_id && !itemIds.has(container.key_item_id))
        problems.push(`map ${map.id}: container with missing key ${container.key_item_id}`);
    }
  }
  for (const entity of authored.entities.filter((e) => e.id.startsWith("qa_"))) {
    if (entity.dialogue_id && !dialogueIds.has(entity.dialogue_id))
      problems.push(`entity ${entity.id}: missing dialogue ${entity.dialogue_id}`);
    for (const skillId of entity.skills || []) {
      if (!skillIds.has(skillId)) problems.push(`entity ${entity.id}: missing skill ${skillId}`);
    }
  }
  for (const station of authored.simulation_workstations.filter((w) => w.id.startsWith("qa_"))) {
    if (!mapById.has(station.map_id))
      problems.push(`workstation ${station.id}: missing map ${station.map_id}`);
    for (const processId of station.process_ids) {
      if (!authored.simulation_processes.some((proc) => proc.id === processId))
        problems.push(`workstation ${station.id}: missing process ${processId}`);
    }
  }
  const dialogueCutsceneRefs = authored.dialogue
    .filter((d) => d.id.startsWith("qa_"))
    .flatMap((d) => d.nodes.flatMap((n) => n.options.map((o) => o.trigger_cutscene).filter(Boolean)));
  for (const ref of dialogueCutsceneRefs) {
    if (ref && !cutsceneIds.has(ref)) problems.push(`dialogue option: missing cutscene ${ref}`);
  }

  ok("all suite references resolve", problems.length === 0, problems.slice(0, 8).join(" | "));
  ok(
    "fine expansion multiplies map dimensions",
    fine.maps.every((map) => {
      const source = mapById.get(map.id);
      return !source || map.width === source.width * FINE_PER_MACRO;
    }),
  );
}

// ── Part 2: chemistry acceptance on the authored rooms ───────────────────────
const makeSave = (mapId: string, playerMacro: [number, number]): PlaySave => {
  const playerFine = fineCenterOfMacro(playerMacro);
  return {
    schema: "crpg_engine_save_v1",
    package_version: fine.metadata.version,
    fine_ratio: FINE_PER_MACRO,
    current_map_id: mapId,
    player: { cell: [playerFine[0], playerFine[1]], facing: [0, -1] },
    playerStats: { hp: 20, max_hp: 20, mp: 5, max_mp: 5, attack: 3, defense: 1, speed: 10, energy: 1000 },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as PlaySave;
};

// Execute a lever cutscene's chem_spill actions (cells arrive fine-expanded
// in the expanded package, exactly as the runtime would apply them).
const runSpills = (save: PlaySave, mapId: string, cutsceneId: string): PlaySave => {
  const cutscene = fine.cutscenes.find((entry) => entry.id === cutsceneId);
  if (!cutscene) throw new Error(`missing cutscene ${cutsceneId}`);
  let next = save;
  for (const action of cutscene.actions) {
    if (action.type !== "chem_spill" || !action.cell) continue;
    const spilled = applyChemistrySpillToSave(fine, next, {
      cell: [action.cell[0], action.cell[1]],
      liquid: action.liquid_id,
      amount: action.amount,
      mapId,
    });
    if (!spilled.ok) throw new Error(`spill failed: ${spilled.reason}`);
    next = spilled.save;
  }
  return next;
};

const gridFor = (save: PlaySave, mapId: string) => readChemistryGridForSave(fine, save, mapId);

const cellAtMacro = (
  cells: Map<string, ChemCell>,
  macro: [number, number],
): ChemCell | undefined => {
  const center = fineCenterOfMacro(macro);
  return cells.get(cellChemKey(center[0], center[1]));
};

const wetCellCount = (cells: Map<string, ChemCell>) => {
  let count = 0;
  for (const cell of cells.values()) if (cell.axes.liquid_volume > 0) count += 1;
  return count;
};

console.log("suite: flood chamber (button → oozing basin flood)");
{
  const mapId = "qa_flood_lab";
  let save = makeSave(mapId, [0, 6]);
  save = runSpills(save, mapId, "qa_cut_flood_release");

  const after0 = gridFor(save, mapId);
  const initialWet = wetCellCount(after0.cells);
  ok("the release wets the spillway", initialWet > 0, `wet=${initialWet}`);

  // Walk: each move-tick advances the ooze a few fine cells.
  let midWet = 0;
  for (let tick = 0; tick < 24; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
    if (tick === 1) midWet = wetCellCount(gridFor(save, mapId).cells);
  }
  const settled = gridFor(save, mapId);
  const finalWet = wetCellCount(settled.cells);
  ok(
    "the flood front advances over successive moves (ooze)",
    midWet > initialWet && finalWet > midWet,
    `wet ${initialWet} → ${midWet} → ${finalWet}`,
  );

  const basinCenter = cellAtMacro(settled.cells, [0, -1]);
  const basinEdge = cellAtMacro(settled.cells, [-2, 0]);
  ok(
    "water pools in the sunken basin",
    (basinCenter?.axes.liquid_volume ?? 0) > 0 && (basinEdge?.axes.liquid_volume ?? 0) > 0,
    `center=${basinCenter?.axes.liquid_volume}, edge=${basinEdge?.axes.liquid_volume}`,
  );

  const walkwayWest = cellAtMacro(settled.cells, [-6, 0]);
  const walkwaySouth = cellAtMacro(settled.cells, [0, 6]);
  ok(
    "the raised walkway stays dry",
    (walkwayWest?.axes.liquid_volume ?? 0) === 0 && (walkwaySouth?.axes.liquid_volume ?? 0) === 0,
    `west=${walkwayWest?.axes.liquid_volume}, south=${walkwaySouth?.axes.liquid_volume}`,
  );

  // Keep ticking: a settled pool goes dormant and costs nothing.
  for (let tick = 0; tick < 60; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 30 + tick).save;
  }
  const dormantActive = save.chemistry_active?.[mapId]?.length ?? 0;
  ok("the settled flood goes dormant (active set drains)", dormantActive === 0, `active=${dormantActive}`);
}

console.log("suite: viscosity race (water outruns honey)");
{
  const mapId = "qa_visc_lab";
  let save = makeSave(mapId, [0, 7]);
  save = runSpills(save, mapId, "qa_cut_race_release");

  for (let tick = 0; tick < 6; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
  }
  const grid = gridFor(save, mapId);
  // Frontier: the furthest z (fine) each liquid has reached down its channel.
  let waterFront = -Infinity;
  let honeyFront = -Infinity;
  for (const cell of grid.cells.values()) {
    if (cell.axes.liquid_volume <= 0) continue;
    if (cell.liquidId === "water") waterFront = Math.max(waterFront, cell.z);
    if (cell.liquidId === "honey") honeyFront = Math.max(honeyFront, cell.z);
  }
  ok("both liquids left the gate", waterFront > -Infinity && honeyFront > -Infinity);
  ok(
    "the water frontier is well ahead of the honey crawl",
    waterFront >= honeyFront + FINE_PER_MACRO,
    `water z=${waterFront}, honey z=${honeyFront}`,
  );
}

console.log("suite: burn gallery (oil trail spreads, moat holds)");
{
  const mapId = "qa_fire_lab";
  let save = makeSave(mapId, [0, 7]);
  save = runSpills(save, mapId, "qa_cut_fire_ignite");

  let trailCaught = false;
  for (let tick = 0; tick < 30; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
    if (tick === 10) {
      const grid = gridFor(save, mapId);
      // The far end of the oil trail (macro [4,-4]) should have scorched or be hot.
      const trailEnd = cellAtMacro(grid.cells, [4, -4]);
      trailCaught = (trailEnd?.axes.scorch ?? 0) > 0 || (trailEnd?.axes.temperature ?? 0) > 60;
    }
  }
  const grid = gridFor(save, mapId);
  ok("fire runs the oil trail to the crate stockpile", trailCaught);

  let scorchedCells = 0;
  for (const cell of grid.cells.values()) if (cell.axes.scorch > 0) scorchedCells += 1;
  ok("the burn leaves a scorch footprint", scorchedCells >= 8, `scorched=${scorchedCells}`);

  const vault = cellAtMacro(grid.cells, [6, 4]);
  const vaultApproach = cellAtMacro(grid.cells, [6, 2]);
  ok(
    "the moat-guarded vault never burns",
    (vault?.axes.scorch ?? 0) === 0 && (vaultApproach?.axes.scorch ?? 0) === 0,
    `vault scorch=${vault?.axes.scorch}, approach=${vaultApproach?.axes.scorch}`,
  );
}

console.log("suite: miasma vault (gas fills, poisons, dissipates)");
{
  const mapId = "qa_gas_lab";
  let save = makeSave(mapId, [0, 7]);
  save = runSpills(save, mapId, "qa_cut_gas_release");

  // The vent engulfs the canary's tile at Toxic density (vapor ≥ 25 drives
  // the toxicity body axis), and the cloud must then DIFFUSE well beyond the
  // ~45 burst cells before dissipation wins.
  let engulfedCanary = false;
  let peakVapor = 0;
  let peakExtent = 0;
  for (let tick = 0; tick < 50; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
    const grid = gridFor(save, mapId);
    let total = 0;
    let extent = 0;
    for (const cell of grid.cells.values()) {
      total += cell.axes.vapor;
      if (cell.axes.vapor > 0) extent += 1;
    }
    peakVapor = Math.max(peakVapor, total);
    peakExtent = Math.max(peakExtent, extent);
    const canaryCell = cellAtMacro(grid.cells, [-5, -4]);
    if ((canaryCell?.axes.vapor ?? 0) >= 25) engulfedCanary = true;
    if (total === 0 && tick > 4) break;
  }
  ok("the vent engulfs the canary at Toxic density", engulfedCanary);
  ok(
    "the cloud diffuses far beyond the burst cells",
    peakExtent >= 120,
    `peak extent=${peakExtent} cells`,
  );

  const grid = gridFor(save, mapId);
  let residual = 0;
  for (const cell of grid.cells.values()) residual += cell.axes.vapor;
  ok(
    "the cloud dissipates back to clean air",
    residual === 0 && peakVapor > 0,
    `peak=${peakVapor.toFixed(0)}, residual=${residual.toFixed(1)}`,
  );
}

console.log(
  failed === 0
    ? `\nsuite: all ${passed} checks passed`
    : `\nsuite: ${failed} of ${passed + failed} checks FAILED`,
);
if (failed > 0) process.exit(1);
