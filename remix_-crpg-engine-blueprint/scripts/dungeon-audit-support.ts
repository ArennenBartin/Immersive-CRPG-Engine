import { writeFile } from "node:fs/promises";

export type DungeonAuditStage = "topology" | "embedding" | "full";

export interface DungeonSeedAuditOptions {
  count: number;
  recipeId: string;
  stage: DungeonAuditStage;
  json?: string | true;
  csv?: string | true;
}

export interface DungeonSeedAuditRow {
  index: number;
  seed: string;
  accepted: boolean;
  deterministic: boolean;
  durationMs: number;
  attemptCount: number;
  roomCount: number;
  mapCount: number;
  branchCount: number;
  loopCount: number;
  secretCount: number;
  gateCount: number;
  canonicalHash: string;
  retryCodes: string[];
  blockingCodes: string[];
  failureMessages: string[];
}

const requiredValue = (argv: readonly string[], index: number, option: string) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
};

const optionalOutput = (argv: readonly string[], index: number): string | true => {
  const candidate = argv[index + 1];
  return candidate && !candidate.startsWith("--") ? candidate : true;
};

export const parseDungeonSeedAuditArgs = (
  argv: readonly string[],
  defaultRecipeId: string,
): DungeonSeedAuditOptions => {
  const options: DungeonSeedAuditOptions = {
    count: 100,
    recipeId: defaultRecipeId,
    stage: "full",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--count") {
      const value = Number(requiredValue(argv, index, argument));
      if (!Number.isInteger(value) || value <= 0) throw new Error("--count must be a positive integer");
      options.count = value;
      index += 1;
    } else if (argument === "--recipe") {
      options.recipeId = requiredValue(argv, index, argument);
      index += 1;
    } else if (argument === "--stage") {
      const value = requiredValue(argv, index, argument);
      const normalized = value === "graph" ? "topology" : value === "spatial" ? "embedding" : value;
      if (normalized !== "topology" && normalized !== "embedding" && normalized !== "full") {
        throw new Error("--stage must be topology, embedding, or full");
      }
      options.stage = normalized;
      index += 1;
    } else if (argument === "--json") {
      options.json = optionalOutput(argv, index);
      if (typeof options.json === "string") index += 1;
    } else if (argument === "--csv") {
      options.csv = optionalOutput(argv, index);
      if (typeof options.csv === "string") index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log("Usage: npm run audit:dungeon-seeds -- --count N --recipe ID --stage topology|embedding|full [--json [file]] [--csv [file]]");
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
};

const csvCell = (value: unknown) => {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const dungeonAuditRowsToCsv = (rows: readonly DungeonSeedAuditRow[]) => {
  const keys: Array<keyof DungeonSeedAuditRow> = [
    "index",
    "seed",
    "accepted",
    "deterministic",
    "durationMs",
    "attemptCount",
    "roomCount",
    "mapCount",
    "branchCount",
    "loopCount",
    "secretCount",
    "gateCount",
    "canonicalHash",
    "retryCodes",
    "blockingCodes",
    "failureMessages",
  ];
  return [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
  ].join("\n") + "\n";
};

export const emitDungeonAuditOutput = async (
  output: string,
  destination: string | true | undefined,
) => {
  if (!destination) return;
  if (destination === true) console.log(output.trimEnd());
  else await writeFile(destination, output, "utf8");
};

export const blockingDungeonDiagnostics = <T extends { severity: string }>(
  diagnostics: readonly T[],
) => diagnostics.filter((entry) => entry.severity === "fatal" || entry.severity === "error");

export const percentile = (values: readonly number[], quantile: number) => {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * quantile) - 1));
  return ordered[index];
};
