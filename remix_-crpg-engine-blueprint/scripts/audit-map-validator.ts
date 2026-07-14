import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { GamePackageSchema, type GamePackage } from "../src/schema/game";
import { GamePackageV2Schema } from "../src/schema/v2";
import { createReadinessDungeonPackage } from "./fixtures/readinessDungeonFixture";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const positional = args.filter((arg) => arg !== "--json");

const usage = () => {
  console.error("Usage: npx tsx scripts/audit-map-validator.ts <package.json> [map-id] [--json]");
  console.error("       npx tsx scripts/audit-map-validator.ts --fixture [map-id] [--json]");
};

const loadPackage = async (): Promise<GamePackage> => {
  if (positional[0] === "--fixture") return createReadinessDungeonPackage();
  if (!positional[0]) {
    usage();
    process.exitCode = 2;
    throw new Error("A package path or --fixture is required.");
  }
  const path = resolve(positional[0]);
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const v2 = GamePackageV2Schema.safeParse(raw);
  if (v2.success) return v2.data.content;
  const v1 = GamePackageSchema.safeParse(raw);
  if (v1.success) return v1.data;
  const details = v1.error.issues
    .slice(0, 20)
    .map((issue) => `${issue.path.join(".") || "package"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Package schema validation failed:\n${details}`);
};

try {
  const gamePackage = await loadPackage();
  const requestedMapId = positional[0] === "--fixture" ? positional[1] : positional[1];
  const maps = requestedMapId
    ? gamePackage.maps.filter((map) => map.id === requestedMapId)
    : gamePackage.maps;
  if (requestedMapId && maps.length === 0) throw new Error(`Map ${requestedMapId} does not exist in the package.`);

  const reports = maps.map((map) => ({
    mapId: map.id,
    report: validateOrdinaryMap(map, { package: gamePackage }),
  }));
  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const { mapId, report } of reports) {
      const errorCount = report.issues.filter((issue) => issue.severity === "error").length;
      const warningCount = report.issues.filter((issue) => issue.severity === "warning").length;
      console.log(
        `${report.valid ? "PASS" : "FAIL"} ${mapId}: ${errorCount} error(s), ${warningCount} warning(s), ` +
          `${report.metrics.reachableCells ?? 0}/${report.metrics.traversableCells ?? 0} reachable cells`,
      );
      for (const issue of report.issues) {
        const cells = issue.cells?.length ? ` cells=${JSON.stringify(issue.cells)}` : "";
        const placements = issue.placementIds?.length ? ` placements=${issue.placementIds.join(",")}` : "";
        console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}${cells}${placements}`);
      }
    }
  }
  if (reports.some(({ report }) => !report.valid)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (!process.exitCode) process.exitCode = 1;
}

