import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

interface LegacyImportIssue {
  code: string;
  path: string;
  message: string;
}

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src");
const legacyFiles = new Set([
  "src/components/GameRenderer2D.tsx",
  "src/components/TileMaker.tsx",
  "src/components/CommandWheel.tsx",
]);
const bannedSpecifiers = [
  "GameRenderer2D",
  "TileMaker",
  "CommandWheel",
  "proceduralRegion",
  "procedural-region",
  "proceduralContinent",
  "procedural-continent",
  "/archive/",
];

const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return [path];
  });

const issues: LegacyImportIssue[] = [];
for (const file of filesUnder(sourceRoot)) {
  if (![".ts", ".tsx"].includes(extname(file))) continue;
  const path = relative(root, file).replaceAll("\\", "/");
  if (legacyFiles.has(path)) continue;
  const source = readFileSync(file, "utf8");
  const importSpecifiers = [
    ...source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
  for (const specifier of importSpecifiers) {
    const banned = bannedSpecifiers.find((token) => specifier.includes(token));
    if (!banned) continue;
    issues.push({
      code: "LEGACY_IMPORT_ACTIVE",
      path,
      message: `Production module imports legacy/removed path “${specifier}” (${banned}).`,
    });
  }
}

for (const removedPath of ["src/proceduralRegion", "src/procedural-continent"]) {
  if (existsSync(join(root, removedPath))) {
    issues.push({
      code: "CONTINENT_MODULE_PRESENT",
      path: removedPath,
      message: "The removed procedural-continent module exists in the active source tree.",
    });
  }
}

const packageJson = readFileSync(join(root, "package.json"), "utf8");
for (const obsoleteScript of ["test:region", "audit:region"]) {
  if (packageJson.includes(`"${obsoleteScript}"`)) {
    issues.push({
      code: "CONTINENT_SCRIPT_ACTIVE",
      path: "package.json",
      message: `Obsolete continent command ${obsoleteScript} remains active.`,
    });
  }
}

if (issues.length) {
  for (const issue of issues) {
    console.error(`[${issue.code}] ${issue.path}: ${issue.message}`);
  }
  console.error(`Legacy import audit failed with ${issues.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log("Legacy import audit passed: no production imports reach 2D UI or removed continent modules.");
}
