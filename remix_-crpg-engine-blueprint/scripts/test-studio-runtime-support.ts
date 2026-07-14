import assert from "node:assert/strict";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  findEligibleSwitchChangeTriggers,
  type ConditionContext,
} from "../src/engine-core/story";
import {
  STUDIO_RUNTIME_SUPPORT,
  auditStudioRuntimeSupport,
} from "../src/engine-core/studioRuntimeSupport";
import type { TriggerData } from "../src/schema/game";

const context = (flags: Record<string, boolean>): ConditionContext => ({
  flags,
  quests: {},
  inventory: [],
  party: [],
  clockMinutes: 8 * 60,
  factionRep: {},
});

const triggers: TriggerData[] = [
  {
    id: "gate-opened",
    type: "switch_change",
    conditions: [],
    condition: { switch: "gate_open" },
    cutscene_id: "cutscene_gate",
    once: true,
  },
  {
    id: "observe-any",
    type: "switch_change",
    conditions: [],
    cutscene_id: "cutscene_any",
    once: false,
  },
];

assert.deepEqual(
  findEligibleSwitchChangeTriggers(
    triggers,
    context({ gate_open: false }),
    context({ gate_open: true }),
  ).map((trigger) => trigger.id),
  ["gate-opened", "observe-any"],
  "switch triggers must fire on a newly eligible condition and ungated observers",
);
assert.deepEqual(
  findEligibleSwitchChangeTriggers(
    triggers,
    context({ gate_open: true }),
    context({ gate_open: true, trig_run_other: true }),
  ),
  [],
  "engine trigger bookkeeping must not recursively count as a story switch change",
);
assert.deepEqual(
  findEligibleSwitchChangeTriggers(
    triggers,
    context({ gate_open: false }),
    context({ gate_open: true, "trig_run_gate-opened": true }),
  ).map((trigger) => trigger.id),
  ["observe-any"],
  "once switch triggers that already ran must be skipped",
);

const qa = createQaSuitePackage();
assert.equal(auditStudioRuntimeSupport(qa).length, 0, "the QA package must use supported contracts");
const invalid = structuredClone(qa);
invalid.cutscenes[0].actions.push({ type: "start_combat" });
invalid.abilities[0].payloads.push({ type: "summon", entity_id: invalid.entities[0]?.id });
invalid.items[0].effects = { ...(invalid.items[0].effects || {}), damage: 3 };
assert.deepEqual(
  auditStudioRuntimeSupport(invalid).map((issue) => issue.code).sort(),
  [
    "UNSUPPORTED_CUTSCENE_ACTION",
    "UNSUPPORTED_ITEM_DAMAGE",
    "UNSUPPORTED_SUMMON_PAYLOAD",
  ],
  "unsupported schema scaffolds must produce stable readiness issue codes",
);

assert.equal(STUDIO_RUNTIME_SUPPORT.skillPayloads.status, "runtime_editor");
assert.equal(STUDIO_RUNTIME_SUPPORT.skillPayloads.summon, "scaffold_disabled");
assert.equal(STUDIO_RUNTIME_SUPPORT.triggerTypes.switch_change, "runtime_editor");

console.log("Studio/runtime support tests passed: switch edges execute and unsupported scaffolds are rejected.");
