import { readFile } from "node:fs/promises";
import { createEmptyGamePackage } from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { createReadinessDungeonPackage } from "./fixtures/readinessDungeonFixture";
import {
  auditGamePackageReferences,
  formatReferenceAuditReport,
} from "../src/generation-facing/referenceAudit";

const file = process.argv[2];
if (file) {
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : undefined;
  // Accept either the inner v1 package or the exported v2 wrapper.
  const input = record?.schema === "crpg_engine_game_package_v2" ? record.content : raw;
  const report = auditGamePackageReferences(input);
  console.log(formatReferenceAuditReport(report));
  if (!report.valid) process.exitCode = 1;
} else {
  const packages: Array<[string, unknown]> = [
    ["default", createEmptyGamePackage()],
    ["qa-suite", createQaSuitePackage()],
    ["readiness-dungeon", createReadinessDungeonPackage()],
  ];
  for (const [label, input] of packages) {
    const report = auditGamePackageReferences(input);
    console.log(`\n[${label}]`);
    console.log(formatReferenceAuditReport(report));
    if (!report.valid) process.exitCode = 1;
  }
}
