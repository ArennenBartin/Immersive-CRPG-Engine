import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ShieldAlert, XCircle } from "lucide-react";
import type {
  ApplyDungeonPackageBakeOptions,
  DungeonBakeCollisionPolicy,
  DungeonPackageBakePlan,
} from "../../dungeonGen/packageBake";

export interface DungeonBakeDialogProps {
  plan?: DungeonPackageBakePlan;
  auditReady: boolean;
  busy?: boolean;
  error?: string | null;
  onBake: (options: ApplyDungeonPackageBakeOptions) => void | Promise<void>;
}

export function DungeonBakeDialog({
  plan,
  auditReady,
  busy = false,
  error,
  onBake,
}: DungeonBakeDialogProps) {
  const hasCollisions = Boolean(plan?.collisions.length);
  const [policy, setPolicy] = useState<DungeonBakeCollisionPolicy>(hasCollisions ? "cancel" : "replace");
  const [idMap, setIdMap] = useState<Record<string, string>>(plan?.suggestedIdMap || {});
  const [replaceCheck, setReplaceCheck] = useState(false);
  const [replacePhrase, setReplacePhrase] = useState("");
  const [manualAcknowledged, setManualAcknowledged] = useState(false);

  useEffect(() => {
    const collisions = Boolean(plan?.collisions.length);
    setPolicy(collisions ? "cancel" : "replace");
    setIdMap(plan?.suggestedIdMap || {});
    setReplaceCheck(false);
    setReplacePhrase("");
    setManualAcknowledged(false);
  }, [plan]);

  const manualCollisions = plan?.collisions.filter((collision) => collision.manuallyModified) || [];
  const confirmationPhrase = `REPLACE ${plan?.collisions.length || 0} MAPS`;
  const destinationIdsValid = useMemo(() => {
    if (!plan || policy !== "create_new_ids") return true;
    const values = plan.incomingMaps.map((map) => (idMap[map.id] || map.id).trim());
    const existingIds = new Set(plan.sourcePackage.maps.map((map) => map.id));
    return values.every(Boolean) && new Set(values).size === values.length &&
      values.every((value) => !existingIds.has(value)) &&
      plan.collisions.every((collision) => (idMap[collision.mapId] || "").trim() !== collision.mapId);
  }, [idMap, plan, policy]);
  const replaceConfirmed =
    policy !== "replace" ||
    !hasCollisions ||
    (replaceCheck && replacePhrase === confirmationPhrase &&
      (!manualCollisions.length || manualAcknowledged));
  const canSubmit = Boolean(plan?.incomingMaps.length) && auditReady && !busy &&
    policy !== "cancel" && destinationIdsValid && replaceConfirmed;

  if (!plan) {
    return (
      <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950 text-sm text-neutral-500">
        Generate an audited dungeon before baking.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className={`rounded-xl border p-4 ${auditReady ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}>
        <div className="flex items-start gap-3">
          {auditReady ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /> : <XCircle className="mt-0.5 h-5 w-5 text-red-300" />}
          <div>
            <h3 className="font-semibold text-neutral-100">{auditReady ? "Fatal audits passed" : "Bake is blocked"}</h3>
            <p className="mt-1 text-sm text-neutral-400">
              {auditReady
                ? `${plan.incomingMaps.length} ordinary map${plan.incomingMaps.length === 1 ? "" : "s"} are ready for one undoable package transaction.`
                : "Resolve generation and ordinary-map validation errors before choosing a destination."}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        <header className="border-b border-neutral-800 p-4">
          <h3 className="font-semibold text-neutral-100">Destination map IDs</h3>
          <p className="mt-1 text-sm text-neutral-500">
            {hasCollisions
              ? `${plan.collisions.length} incoming map ID${plan.collisions.length === 1 ? " collides" : "s collide"} with this package. No action is selected by default.`
              : "All generated map IDs are currently available."}
          </p>
        </header>

        {hasCollisions ? (
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <PolicyCard
              selected={policy === "cancel"}
              title="Cancel"
              description="Leave every package map unchanged."
              onClick={() => setPolicy("cancel")}
            />
            <PolicyCard
              selected={policy === "create_new_ids"}
              title="Create new IDs"
              description="Keep existing maps and add a remapped copy of this bundle."
              recommended
              onClick={() => setPolicy("create_new_ids")}
            />
            <PolicyCard
              selected={policy === "replace"}
              title="Replace maps"
              description="Overwrite only the listed destination IDs after explicit confirmation."
              destructive
              onClick={() => setPolicy("replace")}
            />
          </div>
        ) : (
          <div className="p-4 text-sm text-neutral-400">
            The maps will be appended with their generated IDs. Existing maps and QA content are untouched.
          </div>
        )}

        <div className="divide-y divide-neutral-800 border-t border-neutral-800">
          {plan.incomingMaps.map((map) => {
            const collision = plan.collisions.find((entry) => entry.mapId === map.id);
            return (
              <div key={map.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <div className="text-sm font-medium text-neutral-100">{map.display_name}</div>
                  <div className="mt-1 font-mono text-[11px] text-neutral-500">{map.id}</div>
                </div>
                {policy === "create_new_ids" ? (
                  <label>
                    <span className="block text-[10px] uppercase tracking-wider text-neutral-500">New ID</span>
                    <input
                      value={idMap[map.id] || map.id}
                      onChange={(event) => setIdMap((current) => ({ ...current, [map.id]: event.target.value }))}
                      className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-sky-500"
                    />
                  </label>
                ) : (
                  <div className="font-mono text-[10px] text-neutral-500">
                    incoming {map.generation?.outputHash || "unhashed"}
                  </div>
                )}
                <div className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${collision ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                  {collision ? "collision" : "available"}
                </div>
                {collision && policy === "replace" && (
                  <div className="lg:col-span-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
                    Existing: {collision.existingName} · {collision.existingGenerated ? "generated" : "authored"}
                    {collision.manuallyModified ? " · manually edited" : ""}
                    {collision.existingHash && <span className="ml-2 font-mono text-neutral-600">{collision.existingHash}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {policy === "replace" && hasCollisions && (
        <section className="rounded-xl border border-red-500/40 bg-red-950/20 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-red-100">Confirm destructive rebake</h3>
              <p className="mt-1 text-sm text-red-100/70">
                A JSON package backup will be created before replacement. Existing saves may contain deltas keyed to these map IDs.
              </p>
              <label className="mt-4 flex items-start gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={replaceCheck}
                  onChange={(event) => setReplaceCheck(event.target.checked)}
                  className="mt-0.5"
                />
                I reviewed every collision above and intend to replace those exact maps.
              </label>
              {manualCollisions.length > 0 && (
                <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <input
                    type="checkbox"
                    checked={manualAcknowledged}
                    onChange={(event) => setManualAcknowledged(event.target.checked)}
                    className="mt-0.5"
                  />
                  I understand that {manualCollisions.length} manually edited generated map{manualCollisions.length === 1 ? "" : "s"} will be overwritten.
                </label>
              )}
              <label className="mt-4 block">
                <span className="text-xs text-neutral-400">Type <strong className="font-mono text-red-200">{confirmationPhrase}</strong></span>
                <input
                  value={replacePhrase}
                  onChange={(event) => setReplacePhrase(event.target.value)}
                  className="mt-2 w-full rounded-md border border-red-500/40 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-red-400"
                />
              </label>
            </div>
          </div>
        </section>
      )}

      {policy === "create_new_ids" && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100/80">
          <div className="flex items-start gap-3">
            <Copy className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Generated placement namespaces and all cross-floor exits will be remapped together. Existing package maps remain byte-for-byte untouched.</p>
          </div>
        </section>
      )}

      {policy === "cancel" && hasCollisions && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
          Cancel is selected. Baking cannot change the package until you explicitly choose a collision policy.
        </section>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="mr-auto text-xs text-neutral-500">One global Undo reverts the entire bake.</span>
        <button
          onClick={() => onBake({
            policy,
            newIdMap: policy === "create_new_ids" ? idMap : undefined,
            confirmReplace: policy === "replace" ? replaceConfirmed : undefined,
            acknowledgeManualEdits: policy === "replace" ? manualAcknowledged : undefined,
            now: new Date(),
          })}
          disabled={!canSubmit}
          className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${policy === "replace" && hasCollisions ? "bg-red-600 text-white hover:bg-red-500" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}
        >
          {busy ? "Baking…" : policy === "replace" && hasCollisions ? "Back up and replace" : "Bake and open Map Editor"}
        </button>
      </div>
    </div>
  );
}

function PolicyCard({
  selected,
  title,
  description,
  recommended = false,
  destructive = false,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  recommended?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border p-4 text-left transition-colors ${selected ? destructive ? "border-red-500 bg-red-500/10" : "border-sky-500 bg-sky-500/10" : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"}`}
    >
      {recommended && <span className="absolute right-3 top-3 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300">Recommended</span>}
      <div className="text-sm font-semibold text-neutral-100">{title}</div>
      <p className="mt-2 pr-4 text-xs leading-relaxed text-neutral-500">{description}</p>
    </button>
  );
}
