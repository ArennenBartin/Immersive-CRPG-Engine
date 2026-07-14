import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { auditStudioRuntimeSupport } from "../src/engine-core/studioRuntimeSupport";
import { createEmptyGamePackage } from "../src/schema/game";
import { createReadinessDungeonPackage } from "./fixtures/readinessDungeonFixture";

const packages = [
  ["empty-package", createEmptyGamePackage()],
  ["qa-suite", createQaSuitePackage()],
  ["readiness-dungeon", createReadinessDungeonPackage()],
] as const;

let errorCount = 0;
for (const [label, gamePackage] of packages) {
  const issues = auditStudioRuntimeSupport(gamePackage);
  for (const issue of issues) {
    const line = `[${issue.code}] ${label}.${issue.path}: ${issue.message}`;
    if (issue.severity === "error") {
      errorCount += 1;
      console.error(line);
    } else {
      console.warn(line);
    }
  }
}

if (errorCount) {
  console.error(`Studio/runtime support audit failed with ${errorCount} error(s).`);
  process.exitCode = 1;
} else {
  console.log("Studio/runtime support audit passed: all active package features have an honest support state.");
}
