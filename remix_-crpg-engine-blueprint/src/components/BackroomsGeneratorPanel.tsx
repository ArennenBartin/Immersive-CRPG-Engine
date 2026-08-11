import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  FileSearch,
  GitBranch,
  Map as MapIcon,
  PackageCheck,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  BACKROOMS_STAGE_IDS,
  BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  BackroomsRecipeSchema,
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  applyBackroomsPackageBake,
  buildBackroomsStudioReport,
  createLevel0CmtBackroomsRecipe,
  planBackroomsPackageBake,
  type BackroomsAnomalyProfileDef,
  type BackroomsMapGenerationResult,
  type BackroomsPackageBakePlan,
  type BackroomsRecipeDef,
  type BackroomsStudioReport,
} from "../backroomsGen";
import { validateOrdinaryMap } from "../engine-core/mapReadinessValidator";
import { useEngineStore } from "../store/engineStore";
import type {
  BackroomsGeneratorWorkerRequest,
  BackroomsGeneratorWorkerResponse,
} from "./backrooms/backroomsGeneratorWorkerProtocol";

type StudioTab = "recipe" | "graph" | "layout" | "anomalies" | "audit" | "bake";

const TABS: Array<{
  id: StudioTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "recipe", label: "Recipe", icon: SlidersHorizontal },
  { id: "graph", label: "Graph", icon: GitBranch },
  { id: "layout", label: "Layout", icon: MapIcon },
  { id: "anomalies", label: "Anomalies", icon: Boxes },
  { id: "audit", label: "Audit & Profile", icon: BarChart3 },
  { id: "bake", label: "Bake", icon: PackageCheck },
];

const cloneRecipe = (recipe: BackroomsRecipeDef): BackroomsRecipeDef =>
  structuredClone(recipe);

const cardinalColor = (kind: string) => {
  if (kind === "start") return "#38bdf8";
  if (kind === "anchor" || kind === "set_piece") return "#c084fc";
  if (kind === "culmination") return "#f59e0b";
  if (kind === "transition") return "#fb7185";
  if (kind === "landmark") return "#34d399";
  return "#737373";
};

const anomalyColor = (kind: BackroomsStudioReport["rooms"][number]["anomalyClass"]) => {
  if (kind === "hero") return "#fb7185";
  if (kind === "recursive") return "#c084fc";
  if (kind === "low_intensity") return "#f59e0b";
  return "#525252";
};

const compactNumber = (value: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function BackroomsGeneratorPanel() {
  const { gamePackage, setGamePackage, commitDungeonBake } = useEngineStore();
  const savedLevel0Recipe = gamePackage.backrooms_recipes.find(
    (recipe) => recipe.levelProfileId === LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE.id,
  );
  const [recipe, setRecipe] = useState<BackroomsRecipeDef>(() =>
    cloneRecipe(savedLevel0Recipe || createLevel0CmtBackroomsRecipe()),
  );
  const availableProfiles = gamePackage.backrooms_anomaly_profiles.length
    ? gamePackage.backrooms_anomaly_profiles
    : [LEVEL0_CMT_PHASE8_ANOMALY_PROFILE];
  const [profileId, setProfileId] = useState(
    availableProfiles.find((profile) => profile.id === LEVEL0_CMT_PHASE8_ANOMALY_PROFILE.id)?.id ||
      availableProfiles[0]!.id,
  );
  const selectedProfile = availableProfiles.find((profile) => profile.id === profileId) ||
    LEVEL0_CMT_PHASE8_ANOMALY_PROFILE;
  const [tab, setTab] = useState<StudioTab>("recipe");
  const [result, setResult] = useState<BackroomsMapGenerationResult>();
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string>();
  const [selectedRoomId, setSelectedRoomId] = useState<string>();
  const [overlayAnchors, setOverlayAnchors] = useState(true);
  const [overlayMotifs, setOverlayMotifs] = useState(true);
  const [overlayAnomalies, setOverlayAnomalies] = useState(true);
  const [bakePolicy, setBakePolicy] = useState<"create_new_ids" | "replace">("create_new_ids");
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false);
  const [bakeError, setBakeError] = useState<string>();
  const workerRef = useRef<Worker | null>(null);
  const requestSequenceRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const recipeParse = BackroomsRecipeSchema.safeParse(recipe);
  const recipeIssues = recipeParse.success
    ? []
    : recipeParse.error.issues.map((issue) =>
        `${issue.path.join(".") || "recipe"}: ${issue.message}`);

  const report = useMemo(() => {
    if (!result?.map || !result.graph || !result.embedded) return undefined;
    return buildBackroomsStudioReport({
      recipe,
      map: result.map,
      graph: result.graph,
      embedded: result.embedded,
      quality: result.quality,
      pacing: result.pacing,
      anomalies: result.anomalies,
      anomalyProfile: selectedProfile,
      diagnostics: result.diagnostics,
      packageData: gamePackage,
    });
  }, [gamePackage, recipe, result, selectedProfile]);

  const readiness = useMemo(() => {
    if (!result?.map) return undefined;
    return validateOrdinaryMap(result.map, {
      package: {
        ...gamePackage,
        maps: [...gamePackage.maps.filter((map) => map.id !== result.map!.id), result.map],
      },
      returnRouteRequired: false,
      budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
    });
  }, [gamePackage, result]);

  const bakePlan = useMemo<BackroomsPackageBakePlan | undefined>(() => {
    if (!result?.map) return undefined;
    try {
      return planBackroomsPackageBake(gamePackage, [result.map]);
    } catch {
      return undefined;
    }
  }, [gamePackage, result]);

  const runGeneration = () => {
    if (!recipeParse.success) {
      setGenerationError(recipeIssues.join(" | "));
      setTab("recipe");
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("./backrooms/backroomsGenerator.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    const requestId = `backrooms-studio-${++requestSequenceRef.current}`;
    setGenerating(true);
    setGenerationError(undefined);
    setBakeError(undefined);
    worker.onmessage = (event: MessageEvent<BackroomsGeneratorWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      setGenerating(false);
      worker.terminate();
      if ("error" in response) {
        setGenerationError(response.error);
        return;
      }
      setResult(response.result);
      setSelectedRoomId(response.result.graph?.startNodeId);
      setTab(response.result.success ? "layout" : "audit");
    };
    worker.onerror = (event) => {
      setGenerating(false);
      worker.terminate();
      setGenerationError(event.message || "The Level 0 generator stopped unexpectedly.");
    };
    worker.postMessage({
      requestId,
      recipe: recipeParse.data,
      requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS],
      anomalyProfile: selectedProfile,
    } satisfies BackroomsGeneratorWorkerRequest);
  };

  const cancelGeneration = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setGenerating(false);
    setGenerationError("Generation canceled. No authored maps were changed.");
  };

  const resetRecipe = () => {
    setRecipe(createLevel0CmtBackroomsRecipe());
    setResult(undefined);
    setSelectedRoomId(undefined);
    setGenerationError(undefined);
  };

  const saveRecipeCopy = () => {
    const base = `${recipe.id}.studio`;
    const ids = new Set(gamePackage.backrooms_recipes.map((entry) => entry.id));
    let id = base;
    let suffix = 2;
    while (ids.has(id)) id = `${base}.${suffix++}`;
    const saved = BackroomsRecipeSchema.parse({
      ...recipe,
      id,
      name: `${recipe.name} Studio Copy`,
    });
    setGamePackage({
      ...gamePackage,
      backrooms_recipes: [...gamePackage.backrooms_recipes, saved],
    });
    setRecipe(saved);
  };

  const applyBake = () => {
    if (!bakePlan || !result?.map || !report?.ready || readiness?.valid !== true) return;
    try {
      const applied = applyBackroomsPackageBake(bakePlan, {
        policy: bakePlan.collisions.length ? bakePolicy : "replace",
        confirmReplace: bakePolicy === "replace" && replaceAcknowledged,
        acknowledgeManualEdits: bakePolicy === "replace" && replaceAcknowledged,
      });
      if (!commitDungeonBake(applied)) {
        throw new Error(applied.warnings[0]?.message || "The Level 0 bake was not applied.");
      }
    } catch (error) {
      setBakeError(error instanceof Error ? error.message : "The Level 0 bake failed.");
    }
  };

  return (
    <div className="min-h-full bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/95 px-4 py-4 backdrop-blur lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-3 flex items-center gap-3">
            <Boxes className="h-6 w-6 text-amber-300" />
            <div>
              <h2 className="text-lg font-semibold">Backrooms Level 0 Studio</h2>
              <p className="text-xs text-neutral-500">Deterministic finite demo map · editor-only generation</p>
            </div>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">
            <span className="text-neutral-500">Profile</span>{" "}
            <span className="font-medium text-amber-200">{LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE.name}</span>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300">
            seed {recipe.seed}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {generating ? (
              <button onClick={cancelGeneration} className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500">
                <X className="h-4 w-4" /> Cancel
              </button>
            ) : (
              <button onClick={runGeneration} disabled={recipeIssues.length > 0} className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40">
                <Play className="h-4 w-4 fill-current" /> Generate Level 0
              </button>
            )}
          </div>
        </div>
        {generating && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            Generating topology, embedding, pacing, anomalies, and an ordinary editable map in the background…
          </div>
        )}
      </header>

      {(generationError || bakeError) && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 lg:mx-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {generationError || bakeError}
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-4 pt-4 lg:px-6">
        {TABS.map((entry) => (
          <button key={entry.id} onClick={() => setTab(entry.id)} className={`flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2 text-sm ${tab === entry.id ? "border-b-2 border-amber-400 bg-amber-400/10 text-amber-100" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"}`}>
            <entry.icon className="h-4 w-4" /> {entry.label}
            {entry.id === "audit" && report && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] ${report.ready && readiness?.valid ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                {report.ready && readiness?.valid ? "pass" : "review"}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="p-4 lg:p-6">
        {tab === "recipe" && (
          <RecipePanel
            recipe={recipe}
            profile={selectedProfile}
            profiles={availableProfiles}
            issues={recipeIssues}
            onChange={setRecipe}
            onProfileChange={setProfileId}
            onReset={resetRecipe}
            onSaveCopy={saveRecipeCopy}
          />
        )}
        {tab === "graph" && (
          <GraphPanel report={report} graph={result?.graph} selectedRoomId={selectedRoomId} onSelect={setSelectedRoomId} />
        )}
        {tab === "layout" && (
          <LayoutPanel
            report={report}
            embedded={result?.embedded}
            selectedRoomId={selectedRoomId}
            overlayAnchors={overlayAnchors}
            overlayMotifs={overlayMotifs}
            overlayAnomalies={overlayAnomalies}
            onOverlayAnchors={setOverlayAnchors}
            onOverlayMotifs={setOverlayMotifs}
            onOverlayAnomalies={setOverlayAnomalies}
            onSelect={setSelectedRoomId}
          />
        )}
        {tab === "anomalies" && <AnomalyPanel report={report} />}
        {tab === "audit" && <AuditPanel report={report} readiness={readiness} />}
        {tab === "bake" && (
          <BakePanel
            plan={bakePlan}
            report={report}
            readinessValid={readiness?.valid === true}
            policy={bakePolicy}
            acknowledged={replaceAcknowledged}
            onPolicy={setBakePolicy}
            onAcknowledged={setReplaceAcknowledged}
            onBake={applyBake}
          />
        )}
      </main>
    </div>
  );
}

function RecipePanel({
  recipe,
  profile,
  profiles,
  issues,
  onChange,
  onProfileChange,
  onReset,
  onSaveCopy,
}: {
  recipe: BackroomsRecipeDef;
  profile: BackroomsAnomalyProfileDef;
  profiles: BackroomsAnomalyProfileDef[];
  issues: string[];
  onChange: (recipe: BackroomsRecipeDef) => void;
  onProfileChange: (id: string) => void;
  onReset: () => void;
  onSaveCopy: () => void;
}) {
  const updateScale = (field: "min" | "max", value: number) => onChange({
    ...recipe,
    scale: { ...recipe.scale, roomCount: { ...recipe.scale.roomCount, [field]: value } },
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Level 0 recipe</h3>
            <p className="mt-1 text-xs text-neutral-500">Changes remain a local draft until an explicit guarded bake.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onReset} className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
            <button onClick={onSaveCopy} disabled={issues.length > 0} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 disabled:opacity-40">Save as copy</button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-neutral-400">Seed<input value={recipe.seed} onChange={(event) => onChange({ ...recipe, seed: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100" /></label>
          <label className="text-xs text-neutral-400">Anomaly profile<select value={profile.id} onChange={(event) => onProfileChange(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">{profiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label className="text-xs text-neutral-400">Minimum rooms<input type="number" min={3} value={recipe.scale.roomCount.min} onChange={(event) => updateScale("min", Number(event.target.value))} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" /></label>
          <label className="text-xs text-neutral-400">Maximum rooms<input type="number" min={3} value={recipe.scale.roomCount.max} onChange={(event) => updateScale("max", Number(event.target.value))} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" /></label>
          <label className="text-xs text-neutral-400">Map width<input type="number" min={32} value={recipe.scale.mapWidth} onChange={(event) => onChange({ ...recipe, scale: { ...recipe.scale, mapWidth: Number(event.target.value) } })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" /></label>
          <label className="text-xs text-neutral-400">Map depth<input type="number" min={32} value={recipe.scale.mapDepth} onChange={(event) => onChange({ ...recipe, scale: { ...recipe.scale, mapDepth: Number(event.target.value) } })} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" /></label>
        </div>
        {issues.length > 0 && <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{issues.join(" · ")}</div>}
      </section>
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h3 className="font-semibold">Stage seeds and salts</h3>
        <p className="mt-1 text-xs text-neutral-500">Each stage owns an independent deterministic stream.</p>
        <div className="mt-4 space-y-2">
          {BACKROOMS_STAGE_IDS.map((stage) => (
            <label key={stage} className="grid grid-cols-[8rem_1fr] items-center gap-3 text-xs">
              <span className="font-mono text-neutral-400">{stage}</span>
              <input value={recipe.stageSalts[stage] || ""} placeholder="default" onChange={(event) => onChange({ ...recipe, stageSalts: { ...recipe.stageSalts, [stage]: event.target.value } })} className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 font-mono text-neutral-200" />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 px-6 py-16 text-center text-sm text-neutral-500">{message}</div>;
}

function GraphPanel({ report, graph, selectedRoomId, onSelect }: {
  report?: BackroomsStudioReport;
  graph?: BackroomsMapGenerationResult["graph"];
  selectedRoomId?: string;
  onSelect: (id: string) => void;
}) {
  if (!report || !graph) return <EmptyState message="Generate Level 0 to inspect its semantic room graph." />;
  const positions = new Map(graph.nodes.map((node, index) => [node.id, {
    x: 52 + (index % 10) * 92,
    y: 52 + Math.floor(index / 10) * 82,
  }]));
  const height = 110 + Math.ceil(graph.nodes.length / 10) * 82;
  const room = report.rooms.find((entry) => entry.id === selectedRoomId);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="overflow-auto rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
        <svg viewBox={`0 0 960 ${height}`} className="min-h-[32rem] min-w-[58rem] w-full" aria-label="Level 0 semantic graph">
          {graph.edges.map((edge) => {
            const from = positions.get(edge.fromNodeId)!;
            const to = positions.get(edge.toNodeId)!;
            return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={edge.immutable ? "#a3a3a3" : "#404040"} strokeWidth={edge.immutable ? 2 : 1} strokeDasharray={edge.kind === "loop" ? "5 5" : undefined} />;
          })}
          {graph.nodes.map((node) => {
            const position = positions.get(node.id)!;
            return <g key={node.id} onClick={() => onSelect(node.id)} className="cursor-pointer">
              <circle cx={position.x} cy={position.y} r={selectedRoomId === node.id ? 15 : 11} fill={cardinalColor(node.kind)} stroke={selectedRoomId === node.id ? "#fff" : "#171717"} strokeWidth={2} />
              <text x={position.x} y={position.y + 27} textAnchor="middle" fill="#d4d4d4" fontSize="9">{node.ordinal}</text>
            </g>;
          })}
        </svg>
      </section>
      <RoomInspector room={room} />
    </div>
  );
}

function LayoutPanel({ report, embedded, selectedRoomId, overlayAnchors, overlayMotifs, overlayAnomalies, onOverlayAnchors, onOverlayMotifs, onOverlayAnomalies, onSelect }: {
  report?: BackroomsStudioReport;
  embedded?: BackroomsMapGenerationResult["embedded"];
  selectedRoomId?: string;
  overlayAnchors: boolean;
  overlayMotifs: boolean;
  overlayAnomalies: boolean;
  onOverlayAnchors: (value: boolean) => void;
  onOverlayMotifs: (value: boolean) => void;
  onOverlayAnomalies: (value: boolean) => void;
  onSelect: (id: string) => void;
}) {
  if (!report || !embedded) return <EmptyState message="Generate Level 0 to inspect its embedded floor plan." />;
  const roomById = new Map(report.rooms.map((room) => [room.id, room]));
  const selected = report.rooms.find((room) => room.id === selectedRoomId);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-xs">
        <span className="font-semibold uppercase tracking-wider text-neutral-500">Overlays</span>
        <Toggle label="Anchors" checked={overlayAnchors} onChange={onOverlayAnchors} />
        <Toggle label="Motifs" checked={overlayMotifs} onChange={onOverlayMotifs} />
        <Toggle label="Anomalies" checked={overlayAnomalies} onChange={onOverlayAnomalies} />
        <span className="ml-auto font-mono text-neutral-500">{embedded.width} × {embedded.depth} · {embedded.backtracks} backtracks</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border border-neutral-800 bg-[#11100d] p-3">
          <svg viewBox={`0 0 ${embedded.width} ${embedded.depth}`} className="max-h-[68vh] min-h-[34rem] w-full" aria-label="Level 0 embedded floor plan">
            {embedded.corridors.flatMap((corridor) => corridor.cells.map(([x, z], index) => <rect key={`${corridor.id}-${index}`} x={x - 0.45} y={z - 0.45} width={0.9} height={0.9} fill="#3f3a24" />))}
            {embedded.rooms.map((placed) => {
              const room = roomById.get(placed.nodeId);
              const anchor = room?.kind === "anchor" || room?.kind === "set_piece";
              const motif = Boolean(room?.recurrenceStage);
              const anomaly = room?.anomalyClass !== "ordinary";
              const fill =
                overlayAnomalies && anomaly ? anomalyColor(room!.anomalyClass) :
                overlayMotifs && motif ? "#0ea5e9" :
                overlayAnchors && anchor ? "#8b5cf6" : "#5b5431";
              return <rect key={placed.nodeId} x={placed.bounds.x} y={placed.bounds.z} width={placed.bounds.width} height={placed.bounds.depth} fill={fill} stroke={selectedRoomId === placed.nodeId ? "#fff" : "#171717"} strokeWidth={selectedRoomId === placed.nodeId ? 1.2 : 0.35} onClick={() => onSelect(placed.nodeId)} className="cursor-pointer" />;
            })}
          </svg>
        </section>
        <RoomInspector room={selected} />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-neutral-300"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-amber-400" /> {label}</label>;
}

function RoomInspector({ room }: { room?: BackroomsStudioReport["rooms"][number] }) {
  if (!room) return <aside className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-sm text-neutral-500">Select a room to inspect its stable metadata.</aside>;
  return <aside className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-sm">
    <h3 className="font-mono text-sm font-semibold text-amber-200">{room.id}</h3>
    <div className="mt-4 space-y-3 text-xs">
      <InspectorRow label="Kind" value={room.kind} />
      <InspectorRow label="Template" value={room.templateId || "procedural"} />
      <InspectorRow label="Anomaly" value={`${room.anomalyClass}${room.anomalyId ? ` · ${room.anomalyId}` : ""}`} />
      <InspectorRow label="Wrongness" value={room.wrongness === undefined ? "ordinary" : `${Math.round(room.wrongness * 100)}% · ${room.progressionTier}`} />
      <InspectorRow label="Distance" value={room.graphDistanceFromStart === undefined ? "—" : String(room.graphDistanceFromStart)} />
      <InspectorRow label="Motif" value={room.recurrenceStage || "none"} />
      <InspectorRow label="Event" value={room.scheduledEvent || "none"} />
      <div><div className="text-neutral-500">Tags</div><div className="mt-1 flex flex-wrap gap-1">{room.tags.map((tag) => <span key={tag} className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{tag}</span>)}</div></div>
    </div>
  </aside>;
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[5rem_1fr] gap-2"><span className="text-neutral-500">{label}</span><span className="break-words text-neutral-200">{value}</span></div>;
}

function AnomalyPanel({ report }: { report?: BackroomsStudioReport }) {
  if (!report) return <EmptyState message="Generate Level 0 to inspect anomaly transforms and rejection reasons." />;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Ordinary rooms" value={`${Math.round(report.ordinaryRoomRatio * 100)}%`} good={report.ordinaryRoomRatio >= 0.75} />
      <Metric label="Placed / rejected" value={`${report.anomalies.filter((entry) => entry.result.startsWith("placed")).length} / ${report.anomalies.filter((entry) => !entry.result.startsWith("placed")).length}`} />
      <Metric label="Clearance" value={report.anomalies.every((entry) => entry.clearance === "pass") ? "Pass" : "Review"} good={report.anomalies.every((entry) => entry.clearance === "pass")} />
    </div>
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="min-w-full divide-y divide-neutral-800 text-left text-xs">
        <thead className="bg-neutral-900 text-neutral-500"><tr>{["Room / anomaly", "Asset & provenance", "Anchor / embed", "Transform chain", "Collision / result"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-neutral-900 bg-neutral-950/50">{report.anomalies.map((entry) => <tr key={entry.id} className="align-top"><td className="px-3 py-3"><div className="font-mono text-amber-200">{entry.roomId || "unassigned"}</div><div className="mt-1 text-neutral-500">{entry.anomalyId || entry.id}</div></td><td className="px-3 py-3 text-neutral-300"><div>{entry.assetId || "not placed"}</div><div className="mt-1 text-neutral-600">{entry.assetSource || entry.assetLicense}</div></td><td className="px-3 py-3 text-neutral-300"><div>{entry.anchor}</div><div className="mt-1 text-neutral-500">{entry.embeddedDepth}</div></td><td className="max-w-sm px-3 py-3 font-mono text-neutral-400">{entry.transform}</td><td className="px-3 py-3"><div className={entry.clearance === "pass" ? "text-emerald-300" : "text-amber-300"}>{entry.collisionPolicy} · {entry.clearance}</div><div className="mt-1 text-neutral-500">{entry.result}</div></td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function AuditPanel({ report, readiness }: { report?: BackroomsStudioReport; readiness?: ReturnType<typeof validateOrdinaryMap> }) {
  if (!report) return <EmptyState message="Generate Level 0 to run quality, provenance, and performance audits." />;
  const performance = report.performance;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Active cells (worst)" value={compactNumber(performance.maximumActiveCells)} good={performance.maximumActiveCells <= 6_000} />
      <Metric label="Triangles (whole map estimate)" value={compactNumber(performance.estimatedTriangles)} good={performance.estimatedTriangles <= 550_000} />
      <Metric label="Draw calls (worst estimate)" value={String(performance.estimatedDrawCalls)} good={performance.estimatedDrawCalls <= 70} />
      <Metric label="Eager fine cells avoided" value={compactNumber(performance.eagerFineCellsAvoided)} good />
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Quality gate</h3>
        <div className="mt-4 space-y-2">{report.qualityChecks.map((entry) => <div key={entry.code} className="grid grid-cols-[1fr_auto] gap-3 rounded-md bg-neutral-950/70 px-3 py-2 text-xs"><div><div className="text-neutral-200">{entry.label}</div><div className="text-neutral-600">{entry.actual} · expected {entry.expected}</div></div><span className={entry.passed ? "text-emerald-300" : entry.blocking ? "text-red-300" : "text-amber-300"}>{entry.passed ? "pass" : "fail"}</span></div>)}</div>
        <div className="mt-3 text-xs text-neutral-500">Ordinary-map validator: <span className={readiness?.valid ? "text-emerald-300" : "text-red-300"}>{readiness?.valid ? "pass" : "review"}</span></div>
      </section>
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><FileSearch className="h-4 w-4 text-sky-300" /> Seed provenance</h3>
        <div className="mt-4 space-y-2">{report.stageSeeds.map((entry) => <div key={entry.stage} className="grid grid-cols-[7rem_1fr] gap-3 text-xs"><span className="font-mono text-neutral-500">{entry.stage}</span><span className="font-mono text-neutral-300">{entry.seed} <span className="text-neutral-700">{entry.salt || "default salt"}</span></span></div>)}</div>
      </section>
    </div>
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h3 className="font-semibold">Source and license inventory</h3>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{report.provenance.map((entry) => <div key={entry.objectId} className="rounded-md bg-neutral-950/70 px-3 py-2 text-xs"><div className="text-neutral-200">{entry.name}</div><div className="mt-1 font-mono text-neutral-500">{entry.source} · {entry.format}</div><div className="mt-1 text-amber-700">{entry.license}</div></div>)}</div>
    </section>
    {report.diagnostics.length > 0 && <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5"><h3 className="font-semibold">Generator diagnostics</h3><div className="mt-4 space-y-2">{report.diagnostics.map((entry, index) => <div key={`${entry.code}-${index}`} className="rounded-md bg-neutral-950/70 px-3 py-2 text-xs"><span className={entry.severity === "error" || entry.severity === "fatal" ? "text-red-300" : entry.severity === "warning" ? "text-amber-300" : "text-sky-300"}>{entry.severity}</span><span className="ml-2 font-mono text-neutral-500">{entry.stage} · {entry.code}</span><div className="mt-1 text-neutral-300">{entry.message}</div></div>)}</div></section>}
  </div>;
}

function BakePanel({ plan, report, readinessValid, policy, acknowledged, onPolicy, onAcknowledged, onBake }: {
  plan?: BackroomsPackageBakePlan;
  report?: BackroomsStudioReport;
  readinessValid: boolean;
  policy: "create_new_ids" | "replace";
  acknowledged: boolean;
  onPolicy: (policy: "create_new_ids" | "replace") => void;
  onAcknowledged: (value: boolean) => void;
  onBake: () => void;
}) {
  if (!plan || !report) return <EmptyState message="Generate and audit Level 0 before preparing a package bake." />;
  const collision = plan.collisions[0];
  const canBake = report.ready && readinessValid && (policy !== "replace" || !collision || acknowledged);
  return <div className="mx-auto max-w-3xl space-y-5">
    <section className={`rounded-xl border p-5 ${report.ready && readinessValid ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
      <div className="flex items-center gap-3">{report.ready && readinessValid ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <AlertTriangle className="h-6 w-6 text-red-300" />}<div><h3 className="font-semibold">{report.ready && readinessValid ? "Level 0 is ready to bake" : "Bake blocked by the audit"}</h3><p className="mt-1 text-xs text-neutral-400">The result remains an ordinary editable map. Runtime saves are not modified.</p></div></div>
    </section>
    {collision && <section className="rounded-xl border border-amber-500/30 bg-neutral-900/60 p-5"><h3 className="font-semibold text-amber-200">Map ID collision</h3><p className="mt-2 text-sm text-neutral-400">{collision.mapId} already exists{collision.manuallyModified ? " and contains manual edits" : " as a generated map"}.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => onPolicy("create_new_ids")} className={`rounded-md border px-3 py-3 text-left text-sm ${policy === "create_new_ids" ? "border-emerald-400 bg-emerald-500/10 text-emerald-200" : "border-neutral-700 text-neutral-400"}`}><strong>Create a new map ID</strong><div className="mt-1 text-xs opacity-70">Safest; keeps the current map unchanged.</div></button><button onClick={() => onPolicy("replace")} className={`rounded-md border px-3 py-3 text-left text-sm ${policy === "replace" ? "border-red-400 bg-red-500/10 text-red-200" : "border-neutral-700 text-neutral-400"}`}><strong>Replace existing map</strong><div className="mt-1 text-xs opacity-70">Destructive; requires explicit acknowledgement.</div></button></div>{policy === "replace" && <label className="mt-4 flex items-start gap-2 text-xs text-red-200"><input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledged(event.target.checked)} className="mt-0.5 accent-red-500" /> I understand this replaces the existing generated map and any manual edits on it.</label>}</section>}
    <button onClick={onBake} disabled={!canBake} className="w-full rounded-md bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">Bake Level 0 into the project</button>
  </div>;
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"><div className="text-xs text-neutral-500">{label}</div><div className={`mt-2 text-xl font-semibold ${good === undefined ? "text-neutral-100" : good ? "text-emerald-300" : "text-red-300"}`}>{value}</div></div>;
}
