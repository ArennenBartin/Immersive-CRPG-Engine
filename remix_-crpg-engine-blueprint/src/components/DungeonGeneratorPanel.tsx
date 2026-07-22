import React, { useMemo, useRef, useState } from "react";
import {
  Box,
  CheckCircle2,
  History,
  Layers3,
  Lock,
  Map as MapIcon,
  Network,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
  Users,
  X,
} from "lucide-react";
import {
  evaluateDungeonQuality,
  generateDungeon,
  type DungeonGenerationResult,
  type DungeonRecipeDef,
  type DungeonStageId,
} from "../dungeonGen";
import { DungeonRecipeSchema } from "../dungeonGen/schema";
import {
  createInstitutionalRuinSingleMapRecipe,
  INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID,
  installInstitutionalRuinGeneratorContent,
} from "../dungeonGen/presets/institutionalRuin";
import {
  applyDungeonPackageBake,
  planDungeonPackageBake,
  type ApplyDungeonPackageBakeOptions,
  type DungeonPackageBakePlan,
} from "../dungeonGen/packageBake";
import {
  bakeFractureDungeonDraft,
  createFractureDungeonDraft,
  type FractureDungeonBakeResult,
  type FractureDungeonDraft,
} from "../engine-core/fractureDungeonGeneration";
import { validateOrdinaryMap } from "../engine-core/mapReadinessValidator";
import type { GamePackage } from "../schema/game";
import { useEngineStore } from "../store/engineStore";
import { DungeonAuditPanel } from "./dungeon/DungeonAuditPanel";
import { DungeonBakeDialog } from "./dungeon/DungeonBakeDialog";
import { DungeonFloorPlan } from "./dungeon/DungeonFloorPlan";
import { DungeonGraphView } from "./dungeon/DungeonGraphView";
import { DungeonPopulationView } from "./dungeon/DungeonPopulationView";
import { DungeonPreview3D } from "./dungeon/DungeonPreview3D";
import { DungeonRecipeEditor } from "./dungeon/DungeonRecipeEditor";
import type {
  DungeonGeneratorWorkerRequest,
  DungeonGeneratorWorkerRequestPayload,
  DungeonGeneratorWorkerResponse,
  DungeonGeneratorWorkerResult,
} from "./dungeon/dungeonGeneratorWorkerProtocol";

export type DungeonStudioTab =
  | "recipe"
  | "graph"
  | "floor_plan"
  | "preview_3d"
  | "population"
  | "audit"
  | "bake";

const TABS: Array<{
  id: DungeonStudioTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "recipe", label: "Recipe", icon: SlidersHorizontal },
  { id: "graph", label: "Graph", icon: Network },
  { id: "floor_plan", label: "Floor Plan", icon: MapIcon },
  { id: "preview_3d", label: "3D Preview", icon: Box },
  { id: "population", label: "Population", icon: Users },
  { id: "audit", label: "Audit", icon: ShieldCheck },
  { id: "bake", label: "Bake", icon: PackageCheck },
];

const STAGE_GROUPS: Array<{
  id: "topology" | "geometry" | "population";
  label: string;
  stages: DungeonStageId[];
}> = [
  {
    id: "topology",
    label: "Topology",
    stages: ["topology", "archetypes", "gates", "floor_partition", "secrets"],
  },
  {
    id: "geometry",
    label: "Geometry",
    stages: ["room_shapes", "embedding", "corridors"],
  },
  {
    id: "population",
    label: "Population",
    stages: ["infrastructure", "encounters", "hazards", "rewards", "dressing"],
  },
];

interface GenerationProgressState {
  stage: string;
  attempt: number;
  completedStages: number;
  totalStages: number;
  message: string;
}

interface SeedHistoryEntry {
  id: string;
  createdAt: string;
  recipe: DungeonRecipeDef;
  result: DungeonGenerationResult;
}

const cloneRecipe = (recipe: DungeonRecipeDef): DungeonRecipeDef => structuredClone(recipe);

const packageWithSavedRecipe = (
  pkg: GamePackage,
  recipe: DungeonRecipeDef,
  sourceRecipeId: string | null,
): GamePackage => {
  const recipes = [...pkg.dungeon_recipes];
  const sourceIndex = sourceRecipeId
    ? recipes.findIndex((candidate) => candidate.id === sourceRecipeId)
    : -1;
  const collisionIndex = recipes.findIndex((candidate) => candidate.id === recipe.id);
  if (collisionIndex >= 0 && collisionIndex !== sourceIndex) {
    throw new Error(`A dungeon recipe named ${recipe.id} already exists.`);
  }
  if (sourceIndex >= 0) recipes[sourceIndex] = recipe;
  else recipes.push(recipe);
  return { ...pkg, dungeon_recipes: recipes };
};

const uniqueRecipeId = (base: string, recipes: readonly DungeonRecipeDef[]) => {
  const ids = new Set(recipes.map((recipe) => recipe.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
};

const buildPreviewPackage = (
  pkg: GamePackage,
  result?: DungeonGenerationResult,
): GamePackage => {
  if (!result?.maps.length) return pkg;
  const incomingIds = new Set(result.maps.map((map) => map.id));
  return {
    ...pkg,
    maps: [
      ...pkg.maps.filter((map) => !incomingIds.has(map.id)),
      ...result.maps,
    ],
  };
};

const bumpStageSalt = (current: string | undefined) => {
  if (!current) return "reroll-1";
  const match = current.match(/^(.*?)(?:\|reroll-(\d+))?$/);
  const base = match?.[1] || current;
  const count = Number(match?.[2] || (current.startsWith("reroll-") ? current.slice(7) : 0)) || 0;
  return base && !base.startsWith("reroll-")
    ? `${base}|reroll-${count + 1}`
    : `reroll-${count + 1}`;
};

const fractureBakeAsGenerationResult = (
  draft: FractureDungeonDraft,
  bake: FractureDungeonBakeResult,
  totalDurationMs: number,
): DungeonGenerationResult => {
  const macroCellCount = bake.maps.reduce((sum, map) => sum + map.cells.length, 0);
  const actorCount = bake.maps.reduce((sum, map) => sum + map.entity_placements.length, 0);
  const objectCount = bake.maps.reduce((sum, map) =>
    sum + map.custom_object_placements.length + map.container_placements.length, 0);
  const initialActiveChemistryCells = bake.maps.reduce((sum, map) =>
    sum + map.cells.filter((cell) => Boolean(cell.initial_chemistry)).length, 0);
  return {
    success: bake.success,
    recipeId: draft.profile.id,
    recipeVersion: draft.profile.version,
    seed: draft.profile.seed,
    generatorVersion: draft.profile.generatorVersion,
    contentLibraryHash: draft.provenance.contentLibraryHash,
    canonicalResultHash: bake.outputHash,
    graph: bake.graph || draft.graph,
    embedded: bake.embedded,
    bakedMapIds: bake.maps.map((map) => map.id),
    maps: bake.maps,
    validationReports: bake.validationReports,
    diagnostics: bake.diagnostics,
    attemptCount: draft.provenance.attemptIndex + 1,
    metrics: {
      attemptCount: draft.provenance.attemptIndex + 1,
      stageDurationMs: { geometry: Math.max(0, totalDurationMs) },
      totalDurationMs: Math.max(0, totalDurationMs),
      embeddingBacktracks: 0,
      rejectionCodes: {},
      mapCount: bake.maps.length,
      macroCellCount,
      estimatedFineCellCount: macroCellCount * 9,
      roomCount: (bake.graph || draft.graph).nodes.length,
      actorCount,
      objectCount,
      initialActiveChemistryCells,
      estimatedSaveBytes: new TextEncoder().encode(JSON.stringify(bake.maps)).byteLength,
    },
  };
};

export function DungeonGeneratorPanel() {
  const {
    gamePackage,
    setGamePackage,
    commitDungeonBake,
  } = useEngineStore();
  const initialSavedRecipe = gamePackage.dungeon_recipes.find((recipe) =>
    recipe.id === INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID) || gamePackage.dungeon_recipes[0];
  const initialRecipe = initialSavedRecipe || createInstitutionalRuinSingleMapRecipe();
  const [tab, setTab] = useState<DungeonStudioTab>("recipe");
  const [sourceRecipeId, setSourceRecipeId] = useState<string | null>(initialSavedRecipe?.id || null);
  const [recipeDraft, setRecipeDraft] = useState<DungeonRecipeDef>(() => cloneRecipe(initialRecipe));
  const [result, setResult] = useState<DungeonGenerationResult | undefined>();
  const [fractureDraft, setFractureDraft] = useState<FractureDungeonDraft | undefined>();
  const [fractureBake, setFractureBake] = useState<FractureDungeonBakeResult | undefined>();
  const [fractureDiagnostics, setFractureDiagnostics] = useState<DungeonGenerationResult["diagnostics"]>([]);
  const [history, setHistory] = useState<SeedHistoryEntry[]>([]);
  const [compareHistoryId, setCompareHistoryId] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [floorIndex, setFloorIndex] = useState(0);
  const [lockedStages, setLockedStages] = useState<Set<DungeonStageId>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgressState | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [bakeError, setBakeError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const historySequenceRef = useRef(0);
  const workerSequenceRef = useRef(0);
  const generationWorkerRef = useRef<Worker | null>(null);
  const generationWorkerRejectRef = useRef<((reason?: unknown) => void) | null>(null);

  React.useEffect(() => () => {
    generationWorkerRef.current?.terminate();
    generationWorkerRef.current = null;
    generationWorkerRejectRef.current = null;
  }, []);

  const savedSourceRecipe = sourceRecipeId
    ? gamePackage.dungeon_recipes.find((recipe) => recipe.id === sourceRecipeId)
    : undefined;
  const dirty = JSON.stringify(recipeDraft) !== JSON.stringify(savedSourceRecipe || null);
  const recipeParse = DungeonRecipeSchema.safeParse(recipeDraft);
  const recipeIssues = recipeParse.success
    ? (gamePackage.dungeon_recipes.some((recipe) => recipe.id === recipeDraft.id && recipe.id !== sourceRecipeId)
      ? [`id: A recipe with ID ${recipeDraft.id} already exists.`]
      : [])
    : recipeParse.error.issues.map((issue) => `${issue.path.join(".") || "recipe"}: ${issue.message}`);
  const contentInstalled =
    gamePackage.dungeon_themes.length > 0 &&
    gamePackage.dungeon_room_archetypes.length > 0 &&
    gamePackage.dungeon_recipes.some((recipe) => recipe.id === INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID);

  const previewPackage = useMemo(
    () => buildPreviewPackage(gamePackage, result),
    [gamePackage, result],
  );
  const mapReports = useMemo(
    () => result?.maps.map((map) => validateOrdinaryMap(map, {
      package: previewPackage,
      returnRouteRequired: recipeDraft.topology.requireReturnPath,
    })) || [],
    [previewPackage, recipeDraft.topology.requireReturnPath, result],
  );
  const auditReady = Boolean(
    result?.success &&
    result.maps.length > 0 &&
    !result.diagnostics.some((diagnostic) => diagnostic.severity === "fatal" || diagnostic.severity === "error") &&
    mapReports.every((report) => report.valid),
  );
  const qualityReport = useMemo(
    () => result ? evaluateDungeonQuality({ recipe: recipeDraft, gamePackage: previewPackage, result }) : undefined,
    [previewPackage, recipeDraft, result],
  );
  const generationReady = auditReady && (qualityReport?.ready ?? true);
  const bakePlanState = useMemo<{ plan?: DungeonPackageBakePlan; error?: string }>(() => {
    if (!result?.maps.length) return {};
    try {
      return { plan: planDungeonPackageBake(gamePackage, result.maps) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not prepare a dungeon bake plan." };
    }
  }, [gamePackage, result]);
  const comparedEntry = history.find((entry) => entry.id === compareHistoryId);

  const clearLocalGeneration = () => {
    setFractureDraft(undefined);
    setFractureBake(undefined);
    setFractureDiagnostics([]);
    setResult(undefined);
    setSelectedNodeId(null);
    setSelectedRoomId(null);
    setFloorIndex(0);
  };

  const discardLocalGeneration = () => {
    clearLocalGeneration();
    setGenerationError(null);
    setBakeError(null);
    setProgress(null);
    setTab("recipe");
  };

  const handleRecipeChange = (recipe: DungeonRecipeDef) => {
    setRecipeDraft(recipe);
    if (fractureDraft || result) clearLocalGeneration();
  };

  const selectSavedRecipe = (id: string) => {
    const recipe = gamePackage.dungeon_recipes.find((candidate) => candidate.id === id);
    if (!recipe) return;
    if (dirty && !window.confirm("Discard unsaved recipe edits and open another recipe?")) return;
    setSourceRecipeId(recipe.id);
    setRecipeDraft(cloneRecipe(recipe));
    clearLocalGeneration();
    setGenerationError(null);
    setTab("recipe");
  };

  const saveRecipe = (recipe = recipeDraft) => {
    const parsed = DungeonRecipeSchema.safeParse(recipe);
    if (!parsed.success) {
      setTab("recipe");
      throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" | "));
    }
    const nextPackage = packageWithSavedRecipe(gamePackage, parsed.data, sourceRecipeId);
    if (JSON.stringify(nextPackage.dungeon_recipes) !== JSON.stringify(gamePackage.dungeon_recipes)) {
      setGamePackage(nextPackage);
    }
    setSourceRecipeId(parsed.data.id);
    setRecipeDraft(cloneRecipe(parsed.data));
    return { recipe: parsed.data, package: nextPackage };
  };

  const newRecipe = () => {
    const base = createInstitutionalRuinSingleMapRecipe("new-dungeon-001");
    const id = uniqueRecipeId("dungeon_recipe", gamePackage.dungeon_recipes);
    setSourceRecipeId(null);
    setRecipeDraft({ ...base, id, name: "New Dungeon Recipe" });
    clearLocalGeneration();
    setTab("recipe");
  };

  const duplicateRecipe = () => {
    const id = uniqueRecipeId(`${recipeDraft.id}_copy`, gamePackage.dungeon_recipes);
    setSourceRecipeId(null);
    setRecipeDraft({ ...cloneRecipe(recipeDraft), id, name: `${recipeDraft.name} Copy` });
    clearLocalGeneration();
    setTab("recipe");
  };

  const deleteRecipe = () => {
    if (!sourceRecipeId) {
      newRecipe();
      return;
    }
    if (!window.confirm(`Delete recipe ${sourceRecipeId}? Baked maps will not be deleted.`)) return;
    const remaining = gamePackage.dungeon_recipes.filter((recipe) => recipe.id !== sourceRecipeId);
    setGamePackage({ ...gamePackage, dungeon_recipes: remaining });
    const preferred = remaining.find((recipe) => recipe.id === INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID);
    const next = preferred || remaining[0] || createInstitutionalRuinSingleMapRecipe("new-dungeon-001");
    setSourceRecipeId((preferred || remaining[0])?.id || null);
    setRecipeDraft(cloneRecipe(next));
    clearLocalGeneration();
    setTab("recipe");
  };

  const installStarterContent = () => {
    const installed = installInstitutionalRuinGeneratorContent(gamePackage);
    if (JSON.stringify(installed) !== JSON.stringify(gamePackage)) setGamePackage(installed);
    const recipe = installed.dungeon_recipes.find((candidate) => candidate.id === INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID)
      || installed.dungeon_recipes.find((candidate) => candidate.id === "institutional_ruin_v1")
      || installed.dungeon_recipes[0]
      || createInstitutionalRuinSingleMapRecipe();
    setSourceRecipeId(recipe.id);
    setRecipeDraft(cloneRecipe(recipe));
    clearLocalGeneration();
    setGenerationError(null);
  };

  const generateFractureDraft = async (requestedRecipe = recipeDraft) => {
    if (generating) return;
    setGenerationError(null);
    setBakeError(null);
    const parsed = DungeonRecipeSchema.safeParse(requestedRecipe);
    if (!parsed.success) {
      setGenerationError(parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "recipe"}: ${issue.message}`).join(" | "));
      setTab("recipe");
      return;
    }
    let localPackage: GamePackage;
    try {
      // This snapshot deliberately stays local: drafting must not save a recipe
      // or mutate authored maps in the package store.
      localPackage = packageWithSavedRecipe(gamePackage, parsed.data, sourceRecipeId);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Could not prepare a local draft snapshot.");
      setTab("recipe");
      return;
    }
    cancelRef.current = false;
    setGenerating(true);
    setProgress({ stage: "topology", attempt: 1, completedStages: 0, totalStages: 1, message: "Creating a non-destructive topology draft…" });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const response = await executeWorkerStage({
        type: "generate",
        stage: "draft",
        recipe: parsed.data,
        gamePackage: localPackage,
        debug: true,
      }, (requestId) => ({
        type: "result",
        stage: "draft",
        requestId,
        result: createFractureDungeonDraft({
          profile: parsed.data,
          gamePackage: localPackage,
          debug: true,
          shouldCancel: () => cancelRef.current,
        }),
      }));
      if (response.stage !== "draft") throw new Error("Dungeon worker returned the wrong stage for a draft request.");
      const created = response.result;
      setFractureDiagnostics(created.diagnostics);
      setFractureBake(undefined);
      setResult(undefined);
      if (!created.success || !created.draft) {
        setFractureDraft(undefined);
        const blockingMessage = created.diagnostics.find((entry) =>
          entry.severity === "fatal" || entry.severity === "error")?.message;
        setGenerationError(blockingMessage || "The topology draft could not be created.");
        setTab("audit");
        return;
      }
      setFractureDraft(created.draft);
      setSelectedNodeId(created.draft.graph.entranceNodeId);
      setSelectedRoomId(created.draft.graph.entranceNodeId);
      setFloorIndex(0);
      setTab("graph");
    } catch (error) {
      setFractureDraft(undefined);
      setFractureBake(undefined);
      setResult(undefined);
      setGenerationError(error instanceof Error ? error.message : "Topology draft generation failed.");
      setTab("audit");
    } finally {
      setGenerating(false);
      setProgress(null);
      cancelRef.current = false;
    }
  };

  const generateFractureGeometry = async () => {
    if (generating || !fractureDraft) return;
    setGenerationError(null);
    setBakeError(null);
    let localPackage: GamePackage;
    try {
      localPackage = packageWithSavedRecipe(gamePackage, fractureDraft.profile, sourceRecipeId);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Could not prepare a local geometry snapshot.");
      return;
    }
    cancelRef.current = false;
    setGenerating(true);
    setProgress({ stage: "geometry", attempt: fractureDraft.provenance.attemptIndex + 1, completedStages: 0, totalStages: 1, message: "Baking this exact topology into ordinary preview maps…" });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const startedAt = performance.now();
    try {
      const generatedAt = new Date().toISOString();
      const response = await executeWorkerStage({
        type: "generate",
        stage: "geometry",
        draft: fractureDraft,
        gamePackage: localPackage,
        generatedAt,
        debug: true,
      }, (requestId) => {
        const fallbackStartedAt = performance.now();
        const fallbackBake = bakeFractureDungeonDraft({
          draft: fractureDraft,
          gamePackage: localPackage,
          generatedAt,
          shouldCancel: () => cancelRef.current,
        });
        return {
          type: "result",
          stage: "geometry",
          requestId,
          result: fallbackBake,
          durationMs: Math.max(0, performance.now() - fallbackStartedAt),
        };
      });
      if (response.stage !== "geometry") throw new Error("Dungeon worker returned the wrong stage for a geometry request.");
      const baked = response.result;
      const generated = fractureBakeAsGenerationResult(
        fractureDraft,
        baked,
        response.durationMs || performance.now() - startedAt,
      );
      setFractureBake(baked);
      setFractureDiagnostics(baked.diagnostics);
      setResult(generated);
      setSelectedNodeId(generated.graph?.entranceNodeId || null);
      setSelectedRoomId(generated.graph?.entranceNodeId || null);
      setFloorIndex(generated.embedded?.maps[0]?.floorIndex || 0);
      if (!baked.success) {
        const blockingMessage = baked.diagnostics.find((entry) =>
          entry.severity === "fatal" || entry.severity === "error")?.message;
        setGenerationError(blockingMessage || "Geometry generation did not pass its audit.");
        setTab("audit");
      } else {
        setTab("floor_plan");
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Geometry generation failed.");
      setTab("audit");
    } finally {
      setGenerating(false);
      setProgress(null);
      cancelRef.current = false;
    }
  };

  const executeWorkerStage = (
    payload: DungeonGeneratorWorkerRequestPayload,
    fallback: (requestId: string) => DungeonGeneratorWorkerResult,
  ): Promise<DungeonGeneratorWorkerResult> => {
    const updateProgress = (next: GenerationProgressState) => setProgress({
      stage: next.stage,
      attempt: next.attempt,
      completedStages: next.completedStages,
      totalStages: next.totalStages,
      message: next.message,
    });

    workerSequenceRef.current += 1;
    const requestId = `dungeon-run-${workerSequenceRef.current}`;
    if (typeof Worker !== "undefined") {
      try {
        const worker = new Worker(
          new URL("./dungeon/dungeonGenerator.worker.ts", import.meta.url),
          { type: "module", name: "crpg-dungeon-generator" },
        );
        generationWorkerRef.current = worker;
        return new Promise<DungeonGeneratorWorkerResult>((resolve, reject) => {
          generationWorkerRejectRef.current = reject;
          const cleanup = () => {
            worker.terminate();
            if (generationWorkerRef.current === worker) generationWorkerRef.current = null;
            generationWorkerRejectRef.current = null;
          };
          worker.onmessage = (event: MessageEvent<DungeonGeneratorWorkerResponse>) => {
            if (event.data.requestId !== requestId) return;
            if (event.data.type === "progress") {
              updateProgress(event.data.progress);
              return;
            }
            if (event.data.type === "result") {
              cleanup();
              resolve(event.data);
              return;
            }
            if (event.data.type === "error") {
              const message = event.data.error || "Dungeon generation worker failed.";
              cleanup();
              reject(new Error(message));
            }
          };
          worker.onerror = (event) => {
            const message = event.message || "Dungeon generation worker crashed.";
            cleanup();
            reject(new Error(message));
          };
          worker.postMessage({ ...payload, requestId } as DungeonGeneratorWorkerRequest);
        });
      } catch {
        // Browser or test environments that cannot construct a module worker
        // retain the same deterministic core path as a compatibility fallback.
      }
    }
    return Promise.resolve(fallback(requestId));
  };

  const executeGeneration = async (
    recipe: DungeonRecipeDef,
    pkg: GamePackage,
  ): Promise<DungeonGenerationResult> => {
    const generatedAt = new Date().toISOString();
    const response = await executeWorkerStage({
      type: "generate",
      stage: "full",
      recipe,
      gamePackage: pkg,
      generatedAt,
      debug: true,
    }, (requestId) => ({
      type: "result",
      stage: "full",
      requestId,
      result: generateDungeon({
        recipe,
        gamePackage: pkg,
        generatedAt,
        debug: true,
        shouldCancel: () => cancelRef.current,
        onProgress: (next) => setProgress({
          stage: next.stage,
          attempt: next.attempt,
          completedStages: next.completedStages,
          totalStages: next.totalStages,
          message: next.message,
        }),
      }),
    }));
    if (response.stage !== "full") throw new Error("Dungeon worker returned the wrong stage for a full generation request.");
    return response.result;
  };

  const cancelGeneration = () => {
    cancelRef.current = true;
    setProgress((current) => current ? { ...current, message: "Cancellation requested…" } : current);
    const worker = generationWorkerRef.current;
    const reject = generationWorkerRejectRef.current;
    if (worker) {
      worker.terminate();
      generationWorkerRef.current = null;
      generationWorkerRejectRef.current = null;
      reject?.(new Error("Dungeon generation canceled."));
    }
  };

  const runGeneration = async (requestedRecipe = recipeDraft) => {
    if (generating) return;
    setGenerationError(null);
    setBakeError(null);
    setFractureDraft(undefined);
    setFractureBake(undefined);
    setFractureDiagnostics([]);
    let prepared: { recipe: DungeonRecipeDef; package: GamePackage };
    try {
      prepared = saveRecipe(requestedRecipe);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Recipe validation failed.");
      return;
    }
    cancelRef.current = false;
    setGenerating(true);
    setProgress({ stage: "recipe", attempt: 1, completedStages: 0, totalStages: 1, message: "Preparing deterministic generation…" });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const generated = await executeGeneration(prepared.recipe, prepared.package);
      setResult(generated);
      setSelectedNodeId(generated.graph?.entranceNodeId || null);
      setSelectedRoomId(generated.graph?.entranceNodeId || null);
      setFloorIndex(generated.embedded?.maps[0]?.floorIndex || 0);
      historySequenceRef.current += 1;
      const entry: SeedHistoryEntry = {
        id: `${generated.canonicalResultHash || "failed"}:${historySequenceRef.current}`,
        createdAt: new Date().toISOString(),
        recipe: cloneRecipe(prepared.recipe),
        result: generated,
      };
      setHistory((current) => [entry, ...current].slice(0, 12));
      setCompareHistoryId((current) => current || history[0]?.id || "");
      setTab(generated.graph ? "graph" : "audit");
    } catch (error) {
      setGenerationError(
        cancelRef.current
          ? "Generation canceled. No maps were baked."
          : error instanceof Error
            ? error.message
            : "Dungeon generation failed.",
      );
      setTab("audit");
    } finally {
      setGenerating(false);
      setProgress(null);
      cancelRef.current = false;
    }
  };

  const rerollStages = (stages: readonly DungeonStageId[]) => {
    const stageSalts = { ...recipeDraft.stageSalts };
    let changed = false;
    for (const stage of stages) {
      if (lockedStages.has(stage)) continue;
      stageSalts[stage] = bumpStageSalt(stageSalts[stage]);
      changed = true;
    }
    if (!changed) return;
    const next = { ...recipeDraft, stageSalts };
    setRecipeDraft(next);
    void generateFractureDraft(next);
  };

  const toggleStageGroup = (stages: readonly DungeonStageId[]) => {
    setLockedStages((current) => {
      const next = new Set(current);
      const allLocked = stages.every((stage) => next.has(stage));
      for (const stage of stages) {
        if (allLocked) next.delete(stage);
        else next.add(stage);
      }
      return next;
    });
  };

  const handleBake = async (options: ApplyDungeonPackageBakeOptions) => {
    if (!bakePlanState.plan) return;
    setBakeError(null);
    try {
      const bakeResult = applyDungeonPackageBake(bakePlanState.plan, options);
      if (!bakeResult.applied) {
        throw new Error(
          [...bakeResult.warnings, ...bakeResult.destructiveChanges]
            .map((entry) => entry.message)
            .join(" | ") || "Dungeon bake was not applied.",
        );
      }
      if (bakeResult.backup) downloadBackup(bakeResult.backup.filename, bakeResult.backup.json);
      if (!commitDungeonBake(bakeResult)) throw new Error("The dungeon package transaction was not committed.");
    } catch (error) {
      setBakeError(error instanceof Error ? error.message : "Dungeon bake failed.");
    }
  };

  const selectDiagnostic = (diagnostic: DungeonGenerationResult["diagnostics"][number]) => {
    if (diagnostic.nodeId) {
      setSelectedNodeId(diagnostic.nodeId);
      setSelectedRoomId(diagnostic.nodeId);
    }
    if (diagnostic.mapId && result?.embedded) {
      const floor = result.embedded.maps.find((candidate) => candidate.mapId === diagnostic.mapId);
      if (floor) setFloorIndex(floor.floorIndex);
    }
    setTab(diagnostic.mapId || diagnostic.cell || diagnostic.roomId ? "floor_plan" : "graph");
  };

  return (
    <div className="min-h-full bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/95 px-4 py-4 backdrop-blur lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-2 flex items-center gap-3">
            <Layers3 className="h-6 w-6 text-sky-300" />
            <div>
              <h2 className="text-lg font-semibold">Dungeon Generator</h2>
              <p className="text-xs text-neutral-500">Deterministic bake-time authoring · ordinary 3D maps</p>
            </div>
          </div>
          <select
            value={sourceRecipeId || "__draft__"}
            onChange={(event) => event.target.value !== "__draft__" && selectSavedRecipe(event.target.value)}
            className="min-w-56 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-sky-500"
          >
            {!sourceRecipeId && <option value="__draft__">Unsaved · {recipeDraft.name}</option>}
            {gamePackage.dungeon_recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name} · {recipe.seed}</option>)}
          </select>
          {!contentInstalled && (
            <button onClick={installStarterContent} className="rounded-md border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-200 hover:bg-purple-500/20">
              Install / update single-map starter
            </button>
          )}
          <button
            onClick={() => setHistoryOpen((value) => !value)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${historyOpen ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900"}`}
          >
            <History className="h-4 w-4" /> History ({history.length})
          </button>
          {generating ? (
            <button
              onClick={cancelGeneration}
              className="ml-auto flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          ) : (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {(fractureDraft || result) && (
                <button
                  onClick={discardLocalGeneration}
                  className="flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200"
                  title="Discard local draft and geometry. Authored maps are not changed."
                >
                  <X className="h-4 w-4" /> Discard
                </button>
              )}
              <button
                onClick={() => void runGeneration()}
                disabled={recipeIssues.length > 0}
                className="flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-400 hover:border-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Compatibility: save the recipe and run the original full pipeline"
              >
                Full pipeline
              </button>
              <button
                onClick={() => void generateFractureDraft()}
                disabled={recipeIssues.length > 0}
                className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Network className="h-4 w-4" /> Generate Draft
              </button>
              <button
                onClick={() => void generateFractureGeometry()}
                disabled={!fractureDraft}
                className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-current" /> Generate Geometry
              </button>
            </div>
          )}
        </div>

        {progress && (
          <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-sky-100">
              <span>{progress.message}</span>
              <span className="font-mono">attempt {progress.attempt} · {progress.stage}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.max(2, progress.totalStages ? progress.completedStages / progress.totalStages * 100 : 2)}%` }} />
            </div>
          </div>
        )}

        {fractureDraft && (
          <FractureDraftStatus draft={fractureDraft} bake={fractureBake} diagnostics={fractureDiagnostics} />
        )}
      </header>

      <div className="border-b border-neutral-800 bg-neutral-900/60 px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Stage locks</span>
          {STAGE_GROUPS.map((group) => {
            const locked = group.stages.every((stage) => lockedStages.has(stage));
            const rerollable = group.stages.some((stage) => !lockedStages.has(stage));
            return (
              <div key={group.id} className="flex overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
                <button
                  onClick={() => toggleStageGroup(group.stages)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${locked ? "bg-amber-500/15 text-amber-300" : "text-neutral-400 hover:text-neutral-100"}`}
                  title={locked ? `Unlock ${group.label}` : `Lock ${group.label}`}
                >
                  {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {group.label}
                </button>
                <button
                  onClick={() => rerollStages(group.stages)}
                  disabled={!rerollable || generating}
                  className="border-l border-neutral-800 px-2 text-neutral-500 hover:bg-neutral-800 hover:text-sky-300 disabled:opacity-30"
                  title={`Reroll ${group.label}`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <button
            onClick={() => rerollStages(STAGE_GROUPS.flatMap((group) => group.stages))}
            disabled={generating || STAGE_GROUPS.every((group) => group.stages.every((stage) => lockedStages.has(stage)))}
            className="ml-1 flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-sky-300 disabled:opacity-30"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reroll unlocked
          </button>
          <span className="ml-auto font-mono text-[10px] text-neutral-600">
            {Object.keys(recipeDraft.stageSalts).length} salted stages
          </span>
        </div>
      </div>

      {historyOpen && (
        <SeedHistoryPanel
          history={history}
          currentResult={result}
          comparedEntry={comparedEntry}
          compareHistoryId={compareHistoryId}
          onCompare={setCompareHistoryId}
          onRestore={(entry) => {
            setRecipeDraft(cloneRecipe(entry.recipe));
            setSourceRecipeId(gamePackage.dungeon_recipes.some((recipe) => recipe.id === entry.recipe.id) ? entry.recipe.id : null);
            setFractureDraft(undefined);
            setFractureBake(undefined);
            setFractureDiagnostics([]);
            setResult(entry.result);
            setSelectedNodeId(entry.result.graph?.entranceNodeId || null);
            setSelectedRoomId(entry.result.graph?.entranceNodeId || null);
            setFloorIndex(entry.result.embedded?.maps[0]?.floorIndex || 0);
            setHistoryOpen(false);
          }}
        />
      )}

      {(generationError || bakePlanState.error) && (
        <div className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 lg:mx-6">
          {generationError || bakePlanState.error}
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-4 pt-4 lg:px-6">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2 text-sm transition-colors ${tab === entry.id ? "border-b-2 border-sky-400 bg-sky-500/10 text-sky-200" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"}`}
          >
            <entry.icon className="h-4 w-4" /> {entry.label}
            {entry.id === "audit" && (result || fractureDraft) && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] ${generationReady ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                {generationReady ? "pass" : result ? "blocked" : "draft"}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="p-4 lg:p-6">
        {tab === "recipe" && (
          <DungeonRecipeEditor
            recipe={recipeDraft}
            gamePackage={gamePackage}
            dirty={dirty}
            issues={recipeIssues}
            onChange={handleRecipeChange}
            onSave={() => {
              try {
                saveRecipe();
              } catch (error) {
                setGenerationError(error instanceof Error ? error.message : "Could not save the recipe.");
              }
            }}
            onNew={newRecipe}
            onDuplicate={duplicateRecipe}
            onDelete={deleteRecipe}
          />
        )}
        {tab === "graph" && (
          <div className="space-y-4">
            {fractureDraft && <FractureOpportunityPanel draft={fractureDraft} selectedNodeId={selectedNodeId} onSelectNode={(nodeId) => {
              setSelectedNodeId(nodeId);
              setSelectedRoomId(nodeId);
            }} />}
            <DungeonGraphView
              graph={result?.graph || fractureDraft?.graph}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nodeId) => {
                setSelectedNodeId(nodeId);
                setSelectedRoomId(nodeId);
              }}
            />
          </div>
        )}
        {tab === "floor_plan" && (
          <DungeonFloorPlan
            embedded={result?.embedded}
            graph={result?.graph || fractureDraft?.graph}
            maps={result?.maps}
            diagnostics={result?.diagnostics || fractureDiagnostics}
            floorIndex={floorIndex}
            selectedRoomId={selectedRoomId}
            onFloorChange={setFloorIndex}
            onSelectRoom={(nodeId) => {
              setSelectedRoomId(nodeId);
              setSelectedNodeId(nodeId);
            }}
          />
        )}
        {tab === "preview_3d" && (
          <DungeonPreview3D
            maps={result?.maps || []}
            embedded={result?.embedded}
            graph={result?.graph || fractureDraft?.graph}
            diagnostics={result?.diagnostics || fractureDiagnostics}
            floorIndex={floorIndex}
            onFloorChange={setFloorIndex}
          />
        )}
        {tab === "population" && (
          <DungeonPopulationView maps={result?.maps || []} graph={result?.graph || fractureDraft?.graph} embedded={result?.embedded} />
        )}
        {tab === "audit" && (
          <DungeonAuditPanel
            diagnostics={result?.diagnostics || fractureDiagnostics}
            metrics={result?.metrics}
            qualityReport={qualityReport}
            mapReports={mapReports}
            canonicalResultHash={result?.canonicalResultHash || fractureDraft?.provenance.topologyHash}
            contentLibraryHash={result?.contentLibraryHash || fractureDraft?.provenance.contentLibraryHash}
            onSelectDiagnostic={selectDiagnostic}
          />
        )}
        {tab === "bake" && (
          <DungeonBakeDialog
            plan={bakePlanState.plan}
            auditReady={generationReady}
            error={bakeError}
            onBake={handleBake}
          />
        )}
      </main>
    </div>
  );
}

function FractureDraftStatus({
  draft,
  bake,
  diagnostics,
}: {
  draft: FractureDungeonDraft;
  bake?: FractureDungeonBakeResult;
  diagnostics: DungeonGenerationResult["diagnostics"];
}) {
  const blockingCount = diagnostics.filter((entry) =>
    entry.severity === "fatal" || entry.severity === "error").length;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-semibold text-violet-100">
        {bake?.success ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Network className="h-4 w-4 text-violet-300" />}
        {bake?.success ? "Geometry preview ready" : "Topology draft ready"}
      </div>
      <span className="rounded bg-neutral-950/70 px-2 py-1 font-mono text-violet-200" title={draft.provenance.topologyHash}>
        topology {draft.provenance.topologyHash.slice(0, 16)}
      </span>
      {bake?.outputHash && (
        <span className="rounded bg-neutral-950/70 px-2 py-1 font-mono text-emerald-200" title={bake.outputHash}>
          geometry {bake.outputHash.slice(0, 16)}
        </span>
      )}
      <span className="text-neutral-400">seed <span className="font-mono text-neutral-200">{draft.provenance.seed}</span></span>
      <span className="text-neutral-400">
        profile <span className="font-mono text-neutral-200">{draft.provenance.profileId}@{draft.provenance.profileVersion}</span>
      </span>
      <span className="text-neutral-400">generator <span className="font-mono text-neutral-200">{draft.provenance.generatorVersion}</span></span>
      <span className="text-neutral-400">attempt {draft.provenance.attemptIndex + 1}</span>
      <span className="text-neutral-400">{draft.opportunities.length} opportunities</span>
      {bake && <span className="text-neutral-400">{bake.sockets.length} placed sockets · {bake.maps.length} preview maps</span>}
      <span className={blockingCount ? "text-red-300" : "text-emerald-300"}>
        {blockingCount ? `${blockingCount} blocking diagnostics` : "validated"}
      </span>
      <span className="ml-auto font-medium text-sky-200">Local only · authored maps untouched</span>
    </div>
  );
}

function FractureOpportunityPanel({
  draft,
  selectedNodeId,
  onSelectNode,
}: {
  draft: FractureDungeonDraft;
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const counts = Object.entries(draft.opportunities.reduce<Record<string, number>>((result, opportunity) => {
    result[opportunity.category] = (result[opportunity.category] ?? 0) + 1;
    return result;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
  return (
    <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold text-violet-100">Fracture topology opportunities</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Stable intent markers belong to this disposable draft. Geometry places them as ordinary, editable map sockets.
          </p>
        </div>
        {counts.map(([category, count]) => (
          <span key={category} className="rounded-full border border-violet-500/20 bg-neutral-950 px-2.5 py-1 text-[10px] text-violet-200">
            {category.replaceAll("_", " ")} · {count}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {draft.opportunities.map((opportunity) => (
          <button
            key={opportunity.id}
            onClick={() => onSelectNode(opportunity.nodeId)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${selectedNodeId === opportunity.nodeId ? "border-sky-400 bg-sky-500/10 text-sky-100" : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-violet-500/50"}`}
            title={`${opportunity.id}\n${opportunity.tags.join(", ")}`}
          >
            <span className="block font-semibold capitalize">{opportunity.category.replaceAll("_", " ")}</span>
            <span className="mt-0.5 block max-w-44 truncate font-mono text-[9px] text-neutral-600">{opportunity.nodeId}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SeedHistoryPanel({
  history,
  currentResult,
  comparedEntry,
  compareHistoryId,
  onCompare,
  onRestore,
}: {
  history: SeedHistoryEntry[];
  currentResult?: DungeonGenerationResult;
  comparedEntry?: SeedHistoryEntry;
  compareHistoryId: string;
  onCompare: (id: string) => void;
  onRestore: (entry: SeedHistoryEntry) => void;
}) {
  return (
    <section className="border-b border-neutral-800 bg-neutral-900 px-4 py-4 lg:px-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-500">
              <tr><th className="pb-2">Seed</th><th className="pb-2">Result</th><th className="pb-2">Rooms</th><th className="pb-2">Floors</th><th className="pb-2">Attempts</th><th className="pb-2">Generated</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 font-mono text-sky-300">{entry.recipe.seed}</td>
                  <td className="py-2 font-mono text-neutral-500">{entry.result.canonicalResultHash?.slice(0, 12) || "failed"}</td>
                  <td className="py-2 text-neutral-300">{entry.result.metrics.roomCount}</td>
                  <td className="py-2 text-neutral-300">{entry.result.metrics.mapCount}</td>
                  <td className="py-2 text-neutral-300">{entry.result.metrics.attemptCount}</td>
                  <td className="py-2 text-neutral-500">{new Date(entry.createdAt).toLocaleTimeString()}</td>
                  <td className="py-2 text-right"><button onClick={() => onRestore(entry)} className="rounded px-2 py-1 text-sky-300 hover:bg-sky-500/10">Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && <p className="py-6 text-center text-sm text-neutral-500">Generated seed results will appear here for this Studio session.</p>}
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h3 className="text-sm font-semibold text-neutral-100">Compare with current result</h3>
          <select value={compareHistoryId} onChange={(event) => onCompare(event.target.value)} className="mt-3 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200">
            <option value="">Choose history result</option>
            {history.map((entry) => <option key={entry.id} value={entry.id}>{entry.recipe.seed} · {entry.result.canonicalResultHash?.slice(0, 8) || "failed"}</option>)}
          </select>
          {currentResult && comparedEntry ? (
            <div className="mt-4 space-y-2 text-xs">
              <CompareRow label="Canonical hash" current={currentResult.canonicalResultHash?.slice(0, 12) || "none"} previous={comparedEntry.result.canonicalResultHash?.slice(0, 12) || "none"} />
              <CompareRow label="Rooms" current={currentResult.metrics.roomCount} previous={comparedEntry.result.metrics.roomCount} />
              <CompareRow label="Floors" current={currentResult.metrics.mapCount} previous={comparedEntry.result.metrics.mapCount} />
              <CompareRow label="Actors" current={currentResult.metrics.actorCount} previous={comparedEntry.result.metrics.actorCount} />
              <CompareRow label="Backtracks" current={currentResult.metrics.embeddingBacktracks} previous={comparedEntry.result.metrics.embeddingBacktracks} />
            </div>
          ) : (
            <p className="mt-4 text-xs text-neutral-500">Choose a prior result to compare hashes and generation metrics.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function CompareRow({ label, current, previous }: { label: string; current: string | number; previous: string | number }) {
  const same = current === previous;
  return (
    <div className="grid grid-cols-[90px_1fr_1fr] gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-mono ${same ? "text-neutral-300" : "text-sky-300"}`}>{String(current)}</span>
      <span className="font-mono text-neutral-600">{String(previous)}</span>
    </div>
  );
}

function downloadBackup(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
