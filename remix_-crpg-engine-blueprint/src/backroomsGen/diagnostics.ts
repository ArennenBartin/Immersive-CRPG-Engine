import type { BackroomsDiagnostic, BackroomsStageId } from "./types";

const SEVERITY_ORDER: Record<BackroomsDiagnostic["severity"], number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
};

export const backroomsDiagnostic = (
  severity: BackroomsDiagnostic["severity"],
  stage: BackroomsStageId,
  code: string,
  message: string,
  relatedIds?: readonly string[],
): BackroomsDiagnostic => ({
  severity,
  stage,
  code,
  message,
  ...(relatedIds?.length ? { relatedIds: [...relatedIds].sort() } : {}),
});

export const sortBackroomsDiagnostics = (
  diagnostics: readonly BackroomsDiagnostic[],
): BackroomsDiagnostic[] => [...diagnostics].sort((left, right) =>
  SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
  left.stage.localeCompare(right.stage) ||
  left.code.localeCompare(right.code) ||
  left.message.localeCompare(right.message));
