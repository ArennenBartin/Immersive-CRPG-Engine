import type { GamePackage } from "../schema/game";

export type SupportState =
  | "runtime_editor"
  | "runtime_import_only"
  | "scaffold_disabled"
  | "legacy_ignored";

export interface StudioRuntimeSupportIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export const SUPPORTED_CUTSCENE_ACTION_TYPES = new Set([
  "wait",
  "show_dialogue",
  "move_player",
  "move_entity",
  "set_switch",
  "unlock_topic",
  "teleport_player",
  "give_item",
  "remove_item",
  "set_player_sprite",
  "read_document",
  "heal_player",
  "restore_party",
  "open_shop",
  "give_currency",
  "remove_currency",
  "add_party_member",
  "remove_party_member",
  "label",
  "branch",
  "play_music",
  "play_sound",
  "emit_sound",
  "screen_fade",
  "camera_pan",
  "adjust_faction_rep",
  "open_save_menu",
  "advance_clock",
  "modify_player_stats",
  "learn_skill",
  "set_entity_hidden",
  "chem_spill",
  "game_end",
]);

export const STUDIO_RUNTIME_SUPPORT = {
  skillPayloads: {
    damage: "runtime_editor",
    heal: "runtime_editor",
    status: "runtime_editor",
    summon: "scaffold_disabled",
    target_tags: "runtime_import_only",
  },
  triggerTypes: {
    step: "runtime_editor",
    interact: "runtime_editor",
    on_load: "runtime_editor",
    switch_change: "runtime_editor",
  },
  cutsceneActions: {
    start_combat: "scaffold_disabled",
    custom: "scaffold_disabled",
  },
  itemEffects: {
    damage: "scaffold_disabled",
  },
  encounterEditor: "scaffold_disabled",
} as const satisfies Record<string, unknown>;

export const auditStudioRuntimeSupport = (
  gamePackage: GamePackage,
): StudioRuntimeSupportIssue[] => {
  const issues: StudioRuntimeSupportIssue[] = [];
  gamePackage.cutscenes.forEach((cutscene, cutsceneIndex) => {
    cutscene.actions.forEach((action, actionIndex) => {
      if (SUPPORTED_CUTSCENE_ACTION_TYPES.has(action.type)) return;
      issues.push({
        severity: "error",
        code: "UNSUPPORTED_CUTSCENE_ACTION",
        path: `cutscenes[${cutsceneIndex}].actions[${actionIndex}].type`,
        message: `Cutscene ${cutscene.id} uses unsupported action “${action.type}”.`,
      });
    });
  });
  gamePackage.abilities.forEach((skill, skillIndex) => {
    skill.payloads.forEach((payload, payloadIndex) => {
      const path = `abilities[${skillIndex}].payloads[${payloadIndex}]`;
      if (payload.type === "summon") {
        issues.push({
          severity: "error",
          code: "UNSUPPORTED_SUMMON_PAYLOAD",
          path: `${path}.type`,
          message: `Skill ${skill.id} contains a summon payload, which has no runtime implementation.`,
        });
      }
      if (payload.target_tags?.length) {
        issues.push({
          severity: "error",
          code: "UNSUPPORTED_SKILL_TARGET_TAGS",
          path: `${path}.target_tags`,
          message: `Skill ${skill.id} declares target tags that target resolution does not apply.`,
        });
      }
      if (payload.type === "status" && !payload.status_effect) {
        issues.push({
          severity: "error",
          code: "STATUS_PAYLOAD_MISSING_ID",
          path: `${path}.status_effect`,
          message: `Skill ${skill.id} has a status payload without a status_effect id.`,
        });
      }
    });
  });
  gamePackage.items.forEach((item, itemIndex) => {
    if (item.effects?.damage === undefined) return;
    issues.push({
      severity: "error",
      code: "UNSUPPORTED_ITEM_DAMAGE",
      path: `items[${itemIndex}].effects.damage`,
      message: `Item ${item.id} declares damage, which item use does not execute.`,
    });
  });
  return issues;
};

export const assertStudioRuntimeSupport = (gamePackage: GamePackage): void => {
  const errors = auditStudioRuntimeSupport(gamePackage).filter(
    (issue) => issue.severity === "error",
  );
  if (!errors.length) return;
  throw new Error(
    `Package uses unsupported Studio/runtime contracts: ${errors
      .slice(0, 5)
      .map((issue) => `[${issue.code}] ${issue.path}`)
      .join("; ")}`,
  );
};
