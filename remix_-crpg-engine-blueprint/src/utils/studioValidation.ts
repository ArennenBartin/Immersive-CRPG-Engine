import type { GamePackage } from "../schema/game";
import {
  validateOrdinaryMap,
  type ValidationSeverity,
} from "../engine-core/mapReadinessValidator";
import {
  auditGamePackageReferences,
  type ReferenceAuditSeverity,
} from "../generation-facing/referenceAudit";

export type StudioDiagnosticSeverity = ValidationSeverity | ReferenceAuditSeverity;
export type StudioDiagnosticSource = "package" | "map";

export interface StudioDiagnostic {
  severity: StudioDiagnosticSeverity;
  code: string;
  path: string;
  message: string;
  source: StudioDiagnosticSource;
  blocking: boolean;
  mapId?: string;
  cells?: [number, number][];
  suggestedFix?: string;
}

export interface StudioValidationReport {
  valid: boolean;
  issues: StudioDiagnostic[];
  counts: {
    errors: number;
    warnings: number;
    info: number;
  };
  validatedMapCount: number;
}

const severityRank: Record<StudioDiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * Browser-safe project validation used by Studio. Package references and every
 * ordinary map are checked through the same pure validators used by CLI audits.
 */
export const validateStudioProject = (gamePackage: GamePackage): StudioValidationReport => {
  const packageReport = auditGamePackageReferences(gamePackage);
  const issues: StudioDiagnostic[] = packageReport.issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    path: issue.path,
    message: issue.message,
    source: "package",
    blocking: issue.severity === "error",
    mapId: issue.mapId,
    cells: issue.cell ? [issue.cell] : undefined,
  }));

  gamePackage.maps.forEach((map, mapIndex) => {
    const report = validateOrdinaryMap(map, { package: gamePackage });
    report.issues.forEach((issue) => {
      issues.push({
        severity: issue.severity,
        code: issue.code,
        path: `$.maps[${mapIndex}]`,
        message: issue.message,
        source: "map",
        blocking: issue.severity === "error",
        mapId: issue.mapId,
        cells: issue.cells,
        suggestedFix: issue.suggestedFix,
      });
    });
  });

  issues.sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity] ||
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    (left.mapId || "").localeCompare(right.mapId || ""),
  );

  const counts = {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };

  return {
    valid: counts.errors === 0,
    issues,
    counts,
    validatedMapCount: gamePackage.maps.length,
  };
};
