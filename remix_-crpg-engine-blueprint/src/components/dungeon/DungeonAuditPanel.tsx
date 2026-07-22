import React, { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { MapValidationReport } from "../../engine-core/mapReadinessValidator";
import type {
  DungeonDiagnostic,
  DungeonGenerationMetrics,
  DungeonStageId,
} from "../../dungeonGen/types";
import type { DungeonQualityReport } from "../../dungeonGen/quality";

type SeverityFilter = "all" | DungeonDiagnostic["severity"];

export interface DungeonAuditPanelProps {
  diagnostics: DungeonDiagnostic[];
  metrics?: DungeonGenerationMetrics;
  qualityReport?: DungeonQualityReport;
  mapReports?: MapValidationReport[];
  canonicalResultHash?: string;
  contentLibraryHash?: string;
  onSelectDiagnostic?: (diagnostic: DungeonDiagnostic) => void;
}

export function DungeonAuditPanel({
  diagnostics,
  metrics,
  qualityReport,
  mapReports = [],
  canonicalResultHash,
  contentLibraryHash,
  onSelectDiagnostic,
}: DungeonAuditPanelProps) {
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [stage, setStage] = useState<"all" | DungeonStageId>("all");
  const stages = useMemo(
    () => Array.from(new Set(diagnostics.map((diagnostic) => diagnostic.stage))).sort(),
    [diagnostics],
  );
  const visible = diagnostics.filter((diagnostic) =>
    (severity === "all" || diagnostic.severity === severity) &&
    (stage === "all" || diagnostic.stage === stage));
  const fatalCount = diagnostics.filter((entry) => entry.severity === "fatal").length;
  const errorCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const warningCount = diagnostics.filter((entry) => entry.severity === "warning").length;
  const mapErrorCount = mapReports.reduce(
    (sum, report) => sum + report.issues.filter((issue) => issue.severity === "error").length,
    0,
  );
  const qualityErrorCount = qualityReport?.checks.filter((entry) => !entry.passed).length ?? 0;
  const ready = mapReports.length > 0 && fatalCount === 0 && errorCount === 0 && mapErrorCount === 0 &&
    qualityErrorCount === 0 && mapReports.every((report) => report.valid);

  return (
    <div className="space-y-4">
      <section className={`rounded-xl border p-4 ${ready ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}>
        <div className="flex items-start gap-3">
          {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-red-300" />}
          <div>
            <h3 className={`font-semibold ${ready ? "text-emerald-100" : "text-red-100"}`}>
              {ready ? "Ready to bake" : "Bake blocked by audit failures"}
            </h3>
            <p className="mt-1 text-sm text-neutral-300">
              {fatalCount} fatal · {errorCount + mapErrorCount + qualityErrorCount} errors · {warningCount} warnings · {mapReports.length} ordinary map reports
            </p>
          </div>
        </div>
      </section>

      {metrics && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Attempts" value={metrics.attemptCount} />
          <Metric label="Floors" value={metrics.mapCount} />
          <Metric label="Rooms" value={metrics.roomCount} />
          <Metric label="Macro cells" value={metrics.macroCellCount} />
          <Metric label="Fine estimate" value={metrics.estimatedFineCellCount} />
          <Metric label="Backtracks" value={metrics.embeddingBacktracks} />
          <Metric label="Actors" value={metrics.actorCount} />
          <Metric label="Objects" value={metrics.objectCount} />
          <Metric label="Chem cells" value={metrics.initialActiveChemistryCells} />
          <Metric label="Save bytes" value={metrics.estimatedSaveBytes} />
          <Metric label="Total ms" value={Math.round(metrics.totalDurationMs)} />
          <Metric label="Rejections" value={Object.values(metrics.rejectionCodes).reduce((sum, value) => sum + value, 0)} />
        </section>
      )}

      {qualityReport && (
        <section className={`rounded-xl border p-4 ${qualityReport.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/40 bg-red-500/10"}`}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="mr-auto">
              <h3 className="text-sm font-semibold text-neutral-100">Dungeon quality report</h3>
              <p className="mt-1 text-xs text-neutral-500">
                {qualityReport.thresholdsEnforced
                  ? "Single-map quality thresholds are enforced and block Bake when they fail."
                  : "Measurements are informational for this legacy recipe."}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${qualityReport.ready ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
              {qualityReport.ready ? "quality pass" : "quality blocked"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Maps" value={qualityReport.metrics.mapCount} />
            <Metric label="Rooms" value={qualityReport.metrics.roomCount} />
            <Metric label="Edges" value={qualityReport.metrics.edgeCount} />
            <Metric label="Doors" value={qualityReport.metrics.doorCount} />
            <Metric label="Exits" value={qualityReport.metrics.exitCount} />
            <Metric label="Lanterns" value={qualityReport.metrics.lanternCount} />
            <Metric label="Critical route" value={qualityReport.metrics.entranceToCulminationPathLength ?? "—"} />
            <Metric label="Max corridor" value={qualityReport.metrics.maximumCorridorLength} />
            <Metric label="Max turns" value={qualityReport.metrics.maximumCorridorTurns} />
            <Metric label="Loop length" value={qualityReport.metrics.loopLength} />
            <Metric label="Silhouettes" value={qualityReport.metrics.silhouetteVariety} />
            <Metric label="Landmark gap" value={qualityReport.metrics.minimumLandmarkSeparation ?? "—"} />
            <Metric label="Fine estimate" value={qualityReport.metrics.estimatedFineCellCount} />
            <Metric label="Actors" value={qualityReport.metrics.actorCount} />
            <Metric label="Chem cells" value={qualityReport.metrics.initialActiveChemistryCellCount} />
            <Metric label="Transitions" value={qualityReport.metrics.transitionCount} />
            <Metric label="Non-open edges" value={qualityReport.metrics.nonOpenEdgeCount} />
            <Metric label="Gates" value={qualityReport.metrics.gateCount} />
            <Metric label="Secrets" value={qualityReport.metrics.secretCount} />
            <Metric label="Lantern distance" value={qualityReport.metrics.lanternDistanceFromSpawn ?? "—"} />
          </div>
          {qualityReport.checks.length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {qualityReport.checks.map((entry) => (
                <div key={entry.code} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${entry.passed ? "border-emerald-500/20 bg-neutral-950 text-neutral-300" : "border-red-500/40 bg-red-500/10 text-red-100"}`}>
                  {entry.passed
                    ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
                  <span><strong>{entry.label}</strong> · {entry.actual} <span className="text-neutral-500">({entry.expected})</span></span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 p-3">
            <h3 className="mr-auto text-sm font-semibold text-neutral-100">Generation diagnostics</h3>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as SeverityFilter)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200"
            >
              <option value="all">All severities</option>
              <option value="fatal">Fatal</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value as "all" | DungeonStageId)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200"
            >
              <option value="all">All stages</option>
              {stages.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </header>
          <div className="max-h-[620px] divide-y divide-neutral-800 overflow-y-auto">
            {visible.map((diagnostic, index) => (
              <button
                key={`${diagnostic.stage}:${diagnostic.code}:${index}`}
                onClick={() => onSelectDiagnostic?.(diagnostic)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-800/60"
              >
                <SeverityIcon severity={diagnostic.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-neutral-200">{diagnostic.code}</span>
                    <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">{diagnostic.stage}</span>
                    {diagnostic.mapId && <span className="font-mono text-[10px] text-sky-400">{diagnostic.mapId}</span>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{diagnostic.message}</p>
                  {diagnostic.suggestedFix && <p className="mt-1 text-xs text-neutral-500">Fix: {diagnostic.suggestedFix}</p>}
                  {(diagnostic.nodeId || diagnostic.roomId || diagnostic.cell) && (
                    <p className="mt-1 font-mono text-[10px] text-neutral-600">
                      {[diagnostic.nodeId, diagnostic.roomId, diagnostic.cell?.join(",")].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </button>
            ))}
            {!visible.length && <p className="p-6 text-center text-sm text-neutral-500">No diagnostics match these filters.</p>}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-sm font-semibold text-neutral-100">Ordinary map validation</h3>
            <div className="mt-3 space-y-2">
              {mapReports.map((report, index) => (
                <div key={index} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    {report.valid ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}
                    <span className="font-semibold text-neutral-200">Map {index + 1}</span>
                    <span className="ml-auto text-neutral-500">{report.issues.length} issues</span>
                  </div>
                  <p className="mt-2 text-neutral-500">
                    {report.reachableRegions.reachableCells}/{report.reachableRegions.traversableCells} traversable cells reachable
                  </p>
                </div>
              ))}
              {!mapReports.length && <p className="text-xs text-neutral-500">No baked map candidates are available.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-sm font-semibold text-neutral-100">Reproducibility</h3>
            <HashRow label="Result" value={canonicalResultHash} />
            <HashRow label="Content" value={contentLibraryHash} />
          </div>

          {!!metrics && Object.keys(metrics.stageDurationMs).length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="text-sm font-semibold text-neutral-100">Stage timings</h3>
              <div className="mt-3 space-y-1.5 text-xs">
                {Object.entries(metrics.stageDurationMs)
                  .sort((left, right) => right[1] - left[1])
                  .map(([name, value]) => (
                    <div key={name} className="flex items-center justify-between gap-3">
                      <span className="text-neutral-500">{name}</span>
                      <span className="font-mono text-neutral-300">{value.toFixed(1)} ms</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: DungeonDiagnostic["severity"] }) {
  if (severity === "fatal" || severity === "error") return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />;
  if (severity === "warning") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />;
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-neutral-100">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function HashRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 break-all rounded bg-neutral-950 p-2 font-mono text-[10px] text-neutral-300">{value || "not available"}</div>
    </div>
  );
}
