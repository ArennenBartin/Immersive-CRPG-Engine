import type { DungeonDiagnostic, DungeonStageId } from "./types";

export type DungeonDiagnosticDetails = Partial<
  Pick<DungeonDiagnostic, "nodeId" | "roomId" | "mapId" | "cell" | "relatedIds">
>;

export const dungeonDiagnostic = (
  severity: DungeonDiagnostic["severity"],
  stage: DungeonStageId,
  code: string,
  message: string,
  details: DungeonDiagnosticDetails = {},
): DungeonDiagnostic => ({ severity, stage, code, message, ...details });

const SEVERITY_ORDER: Record<DungeonDiagnostic["severity"], number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
};

export const sortDungeonDiagnostics = (
  diagnostics: readonly DungeonDiagnostic[],
): DungeonDiagnostic[] =>
  [...diagnostics].sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    left.stage.localeCompare(right.stage) ||
    left.code.localeCompare(right.code) ||
    (left.mapId ?? "").localeCompare(right.mapId ?? "") ||
    (left.nodeId ?? "").localeCompare(right.nodeId ?? "") ||
    JSON.stringify(left.cell ?? []).localeCompare(JSON.stringify(right.cell ?? [])) ||
    left.message.localeCompare(right.message));

export const hasFatalDungeonDiagnostics = (diagnostics: readonly DungeonDiagnostic[]) =>
  diagnostics.some((diagnostic) => diagnostic.severity === "fatal");

export interface DungeonStageOutput<T> {
  value?: T;
  diagnostics: DungeonDiagnostic[];
  metrics: Record<string, number>;
}

export const successfulStage = <T>(
  value: T,
  diagnostics: DungeonDiagnostic[] = [],
  metrics: Record<string, number> = {},
): DungeonStageOutput<T> => ({ value, diagnostics: sortDungeonDiagnostics(diagnostics), metrics });

export const failedStage = <T = never>(
  diagnostics: DungeonDiagnostic[],
  metrics: Record<string, number> = {},
): DungeonStageOutput<T> => ({ diagnostics: sortDungeonDiagnostics(diagnostics), metrics });

