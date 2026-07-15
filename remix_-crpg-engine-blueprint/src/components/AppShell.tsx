import React, { useEffect, useRef, useState } from "react";
import { useEngineStore, EditorMode } from "../store/engineStore";
import { usePlayStore } from "../store/playStore";
import { Home, Play, Map, Box, MessageSquare, BookOpen, Swords, FileJson, Upload, Menu, X, Image as ImageIcon, Undo2, Redo2, Sparkles, Briefcase, FileText, Activity, Settings2, Layers3, ArrowLeft, RotateCcw, ShieldCheck, AlertTriangle } from "lucide-react";
import { PlayMode } from "./PlayMode";
import { GameEditor } from "./GameEditor";
import { MapEditor } from "./MapEditor";
import { ModelMaker } from "./ModelMaker";
import { SpriteCreator } from "./SpriteCreator";
import { DialogueEditor } from "./DialogueEditor";
import { QuestEditor } from "./QuestEditor";
import { EntityEditor } from "./EntityEditor";
import { CutsceneEditor } from "./CutsceneEditor";
import { ItemEditor } from "./ItemEditor";
import { DocumentEditor } from "./DocumentEditor";
import { ShopEditor } from "./ShopEditor";
import { SkillEditor } from "./SkillEditor";
import { SimulationEditor } from "./SimulationEditor";
import { Store } from "lucide-react";
import { DungeonGeneratorPanel } from "./DungeonGeneratorPanel";
import {
  validateStudioProject,
  type StudioValidationReport,
} from "../utils/studioValidation";

export function AppShell() {
  const { storageHydrated, mode, setMode, undo, redo, undoStack, redoStack } = useEngineStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Group nav items by primary and secondary for mobile
  const mainNavItems: { id: EditorMode; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home className="w-6 h-6 sm:w-5 sm:h-5" /> },
    { id: "map_editor", label: "Map", icon: <Map className="w-6 h-6 sm:w-5 sm:h-5" /> },
    { id: "play", label: "Play", icon: <Play className="w-6 h-6 sm:w-5 sm:h-5" /> },
  ];

  const secondaryNavItems: { id: EditorMode; label: string; icon: React.ReactNode }[] = [
    { id: "game_editor", label: "Game", icon: <Settings2 className="w-5 h-5" /> },
    { id: "dungeon_generator", label: "Dungeons", icon: <Layers3 className="w-5 h-5" /> },
    { id: "model_maker", label: "Models", icon: <Box className="w-5 h-5" /> },
    { id: "sprite_creator", label: "Sprites", icon: <ImageIcon className="w-5 h-5" /> },
    { id: "dialogue_editor", label: "Dialogue", icon: <MessageSquare className="w-5 h-5" /> },
    { id: "quest_editor", label: "Quests", icon: <BookOpen className="w-5 h-5" /> },
    { id: "entity_editor", label: "Entities", icon: <Swords className="w-5 h-5" /> },
    { id: "cutscene_editor", label: "Events", icon: <FileJson className="w-5 h-5" /> },
    { id: "item_editor", label: "Items", icon: <Briefcase className="w-5 h-5" /> },
    { id: "document_editor", label: "Documents", icon: <FileText className="w-5 h-5" /> },
    { id: "shop_editor", label: "Shops", icon: <Store className="w-5 h-5" /> },
    { id: "skill_editor", label: "Skills", icon: <Sparkles className="w-5 h-5" /> },
    { id: "simulation_editor", label: "Simulation", icon: <Activity className="w-5 h-5" /> },
  ];

  const allNavItems = [...mainNavItems, ...secondaryNavItems];

  if (!storageHydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
        <div className="max-w-md rounded-xl border border-neutral-800 bg-neutral-900/70 px-6 py-5 text-center shadow-xl">
          <h1 className="text-lg font-semibold">Loading Studio workspace…</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Restoring authored project data before editing is enabled.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row h-screen bg-neutral-900 text-neutral-100 font-sans overflow-hidden overscroll-none">
      {/* Desktop Sidebar Navigation */}
      <nav className="hidden sm:flex w-64 bg-neutral-950 border-r border-neutral-800 flex-col z-20">
        <div className="p-4 border-b border-neutral-800">
          <h1 className="text-xl font-bold tracking-tight">CRPG Engine</h1>
          <p className="text-xs text-neutral-500 mt-1">Base Toolkit</p>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {allNavItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setMode(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    mode === item.id
                      ? "bg-neutral-800 text-white font-medium"
                      : "text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile Header — hidden in play mode to maximise vertical space */}
      <header className={`sm:hidden h-14 shrink-0 border-b border-neutral-800 flex items-center px-4 justify-between bg-neutral-950 z-20${mode === 'play' ? ' hidden' : ''}`}>
        <div className="flex items-center gap-3 z-30">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-neutral-400 hover:text-white p-1">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <h1 className="text-lg font-bold tracking-tight">CRPG Engine</h1>
        </div>
        {mode !== "play" && <div className="flex items-center gap-2 z-30">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 className="w-5 h-5" />
          </button>
        </div>}
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="sm:hidden absolute inset-0 top-14 bg-neutral-900/95 backdrop-blur-sm z-30 overflow-y-auto">
          <ul className="p-4 space-y-2">
            {allNavItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setMode(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl text-base transition-colors ${
                    mode === item.id
                      ? "bg-neutral-800 text-white font-medium"
                      : "text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 relative z-10 w-full mb-16 sm:mb-0 bg-neutral-900">
        <header className="hidden sm:flex h-14 shrink-0 border-b border-neutral-800 items-center px-6 justify-between bg-neutral-900/80 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-sm font-medium text-neutral-400 capitalize">
            {allNavItems.find((n) => n.id === mode)?.label}
          </h2>
          {mode !== "play" && <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Global)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Global)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>}
        </header>
        
        <div className={`flex-1 min-h-0 w-full ${mode === 'play' ? 'overflow-hidden flex flex-col' : 'overflow-auto'}`}>
          {mode === "play" && <PlaySessionBar />}
          {mode === "home" && <HomePanel />}
          {mode === "play" && <div className="flex-1 min-h-0"><PlayMode /></div>}
          {mode === "map_editor" && <MapEditor />}
          {mode === "game_editor" && <GameEditor />}
          {mode === "dungeon_generator" && <DungeonGeneratorPanel />}
          {mode === "model_maker" && <ModelMaker />}
          {mode === "sprite_creator" && <SpriteCreator />}
          {mode === "dialogue_editor" && <DialogueEditor />}
          {mode === "quest_editor" && <QuestEditor />}
          {mode === "entity_editor" && <EntityEditor />}
          {mode === "cutscene_editor" && <CutsceneEditor />}
          {mode === "item_editor" && <ItemEditor />}
          {mode === "document_editor" && <DocumentEditor />}
          {mode === "shop_editor" && <ShopEditor />}
          {mode === "skill_editor" && <SkillEditor />}
          {mode === "simulation_editor" && <SimulationEditor />}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-neutral-950 border-t border-neutral-800 flex justify-around items-center px-2 z-20 pb-[env(safe-area-inset-bottom)]">
        {mainNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setMode(item.id);
              setMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
              mode === item.id ? "text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function PlaySessionBar() {
  const setMode = useEngineStore((state) => state.setMode);
  const saveData = usePlayStore((state) => state.saveData);
  const resetRun = usePlayStore((state) => state.resetRun);

  const discardRunAndReturn = () => {
    if (
      saveData &&
      !window.confirm(
        "Discard the current runtime session and return to Studio? Authored project data will not be changed.",
      )
    ) {
      return;
    }
    resetRun();
    setMode("map_editor");
  };

  return (
    <div className="shrink-0 border-b border-sky-900/60 bg-sky-950/45 px-3 py-2 text-xs text-sky-100 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          Play uses separate runtime state. Returning to Studio keeps this run; authored maps are never updated from play automatically.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("map_editor")}
            className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 font-medium text-sky-100 hover:bg-sky-500/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Studio — keep run
          </button>
          <button
            onClick={discardRunAndReturn}
            disabled={!saveData}
            className="flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 font-medium text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Discard run
          </button>
        </div>
      </div>
    </div>
  );
}

function HomePanel() {
  const {
    gamePackage,
    exportPackage,
    importPackage,
    installQaSuite: installQaSuiteIntoStore,
    setGamePackage,
    updateSettings,
    setMode,
    setSelectedMapId,
  } = useEngineStore();
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [musicTracksText, setMusicTracksText] = useState(
    JSON.stringify(gamePackage.settings?.music_tracks || {}, null, 2),
  );
  const [musicTracksError, setMusicTracksError] = useState<string | null>(null);
  const [packageJsonText, setPackageJsonText] = useState("");
  const [packageIoMessage, setPackageIoMessage] = useState<{
    tone: "success" | "error";
    text: string;
    detail?: string;
  } | null>(null);
  const [isImportingPackage, setIsImportingPackage] = useState(false);
  const [isValidatingProject, setIsValidatingProject] = useState(false);
  const [validationReport, setValidationReport] = useState<StudioValidationReport | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setMusicTracksText(JSON.stringify(gamePackage.settings?.music_tracks || {}, null, 2));
  }, [gamePackage.settings?.music_tracks]);

  useEffect(() => {
    setValidationReport(null);
    setValidationError(null);
  }, [gamePackage]);

  const runProjectValidation = () => {
    setIsValidatingProject(true);
    setValidationError(null);
    window.setTimeout(() => {
      try {
        setValidationReport(validateStudioProject(gamePackage));
      } catch (error) {
        setValidationReport(null);
        setValidationError(error instanceof Error ? error.message : "Project validation failed.");
      } finally {
        setIsValidatingProject(false);
      }
    }, 0);
  };

  const updateMetadata = (updates: Partial<typeof gamePackage.metadata>) => {
    setGamePackage({
      ...gamePackage,
      metadata: { ...gamePackage.metadata, ...updates },
    });
  };

  const updatePlayerStat = (key: string, value: number) => {
    updateSettings({
      player_stats: {
        ...(gamePackage.settings?.player_stats || {}),
        [key]: value,
      },
    });
  };

  const applyMusicTracks = () => {
    try {
      const parsed = JSON.parse(musicTracksText || "{}");
      updateSettings({ music_tracks: parsed });
      setMusicTracksError(null);
    } catch (err) {
      setMusicTracksError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const applyPackageImport = (json: string) => {
    if (
      usePlayStore.getState().saveData &&
      !window.confirm(
        "Import this project and discard the current runtime session? Authored data in the imported package will become the active Studio project.",
      )
    ) {
      return;
    }
    const result = importPackage(json);
    if (result.ok) {
      setPackageJsonText("");
      setPackageIoMessage({
        tone: "success",
        text: result.message,
        detail: [...result.migration.changes, ...result.migration.warnings]
          .map((entry) => entry.message)
          .join(" | ") || undefined,
      });
      return;
    }
    if (result.ok === false) {
      setPackageIoMessage({
        tone: "error",
        text: result.message,
        detail: result.issues.slice(0, 3).join(" | "),
      });
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingPackage(true);
    try {
      applyPackageImport(await file.text());
    } catch (err) {
      setPackageIoMessage({
        tone: "error",
        text: "Import failed: file could not be read.",
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsImportingPackage(false);
    }
  };

  const handleImportPaste = () => {
    applyPackageImport(packageJsonText);
  };

  const handleExport = () => {
    try {
      const json = exportPackage();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = gamePackage.metadata.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "game";
      a.href = url;
      a.download = `${safeTitle}-package.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setPackageIoMessage({
        tone: "success",
        text: `Exported ${gamePackage.metadata.title} (${Math.round(blob.size / 1024)} KB).`,
      });
    } catch (err) {
      setPackageIoMessage({
        tone: "error",
        text: "Export failed.",
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const downloadBackup = (filename: string, json: string) => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleQaSuiteInstall = (mode: "merge" | "replace") => {
    const confirmed =
      mode !== "replace" ||
      window.confirm(
        "Replace this entire project with the QA suite and discard the current runtime session? A JSON backup will be downloaded first.",
      );
    if (!confirmed) return;
    const result = installQaSuiteIntoStore({
      mode,
      confirmDestructive: mode === "replace",
    });
    if (!result.applied) {
      setPackageIoMessage({
        tone: "error",
        text: "QA suite installation was not applied.",
        detail: result.warnings.map((warning) => warning.message).join(" | "),
      });
      return;
    }
    if (result.backup) downloadBackup(result.backup.filename, result.backup.json);
    setPackageIoMessage({
      tone: "success",
      text:
        mode === "replace"
          ? "Replaced the project with the QA suite after downloading a backup."
          : "Merged missing QA content without replacing existing IDs.",
      detail: [...result.changes, ...result.warnings]
        .map((entry) => entry.message)
        .join(" | "),
    });
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Project Dashboard</h2>
        <p className="text-sm sm:text-base text-neutral-400 mt-2">Manage your game package and editor settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-neutral-800/50 rounded-xl border border-neutral-700/50 p-5 sm:p-6 space-y-4">
          <h3 className="text-lg font-medium">Current Game</h3>
          <div className="space-y-2 text-sm text-neutral-300">
            <div className="flex justify-between border-b border-neutral-700 pb-2">
              <span className="text-neutral-500">Title</span>
              <span className="font-medium text-white">{gamePackage.metadata.title}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-700 pb-2">
              <span className="text-neutral-500">Version</span>
              <span className="font-medium text-white">{gamePackage.metadata.version}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-700 pb-2">
              <span className="text-neutral-500">Total Maps</span>
              <span className="font-medium text-white">{gamePackage.maps.length}</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-800/50 rounded-xl border border-neutral-700/50 p-5 sm:p-6 space-y-4">
          <h3 className="text-lg font-medium">Data Management</h3>
          <p className="text-sm text-neutral-400 mb-4">Import or export your game package as JSON.</p>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white font-medium py-3 sm:py-2 px-4 rounded-lg transition-colors active:scale-[0.98]"
            >
              <FileJson className="w-5 h-5 sm:w-4 sm:h-4" />
              Export Package
            </button>
            <button
              onClick={() => importFileRef.current?.click()}
              disabled={isImportingPackage}
              className="flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-medium py-3 sm:py-2 px-4 rounded-lg transition-colors active:scale-[0.98]"
            >
              <Upload className="w-5 h-5 sm:w-4 sm:h-4" />
              {isImportingPackage ? "Importing..." : "Import JSON File"}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
            <label className="space-y-1.5">
              <span className="text-sm text-neutral-500 font-medium">Package JSON</span>
              <textarea
                value={packageJsonText}
                onChange={(e) => setPackageJsonText(e.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full resize-y bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-xs text-neutral-200 outline-none focus:border-neutral-500 transition-colors font-mono"
              />
            </label>
            <button
              onClick={handleImportPaste}
              disabled={!packageJsonText.trim()}
              className="flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-neutral-900 text-neutral-300 font-medium py-3 sm:py-2 px-4 rounded-lg transition-colors active:scale-[0.98]"
            >
              <Upload className="w-5 h-5 sm:w-4 sm:h-4" />
              Import Pasted JSON
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-neutral-700 pt-3">
              <button
                onClick={() => handleQaSuiteInstall("merge")}
                className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20"
              >
                Merge QA Suite
              </button>
              <button
                onClick={() => handleQaSuiteInstall("replace")}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
              >
                Replace with QA…
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              QA content is optional. Merge preserves existing IDs; Replace requires confirmation and downloads a backup first.
            </p>
            {packageIoMessage && (
              <div
                aria-live="polite"
                className={`rounded-md border px-3 py-2 text-sm ${
                  packageIoMessage.tone === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-red-500/40 bg-red-500/10 text-red-200"
                }`}
              >
                <div>{packageIoMessage.text}</div>
                {packageIoMessage.detail && (
                  <div className="mt-1 text-xs opacity-80">{packageIoMessage.detail}</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-2 rounded-xl border border-neutral-700/50 bg-neutral-800/50 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-medium">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                Project Validation
              </h3>
              <p className="mt-1 text-sm text-neutral-400">
                Check package references and every ordinary map using the same validators as the command-line audits.
              </p>
            </div>
            <button
              onClick={runProjectValidation}
              disabled={isValidatingProject}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-60"
            >
              {isValidatingProject ? "Validating…" : "Validate Project"}
            </button>
          </div>

          {validationError && (
            <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {validationError}
            </div>
          )}

          {validationReport && (
            <div className="mt-4 space-y-3" aria-live="polite">
              <div
                className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  validationReport.valid
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                    : "border-red-500/40 bg-red-500/10 text-red-100"
                }`}
              >
                <strong>{validationReport.valid ? "Ready for Play" : "Blocking issues found"}</strong>
                <span>{validationReport.validatedMapCount} maps checked</span>
                <span>{validationReport.counts.errors} errors</span>
                <span>{validationReport.counts.warnings} warnings</span>
                <span>{validationReport.counts.info} info</span>
              </div>

              {validationReport.issues.length > 0 ? (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {validationReport.issues.slice(0, 100).map((issue, index) => (
                    <div
                      key={`${issue.code}:${issue.path}:${issue.mapId || "package"}:${index}`}
                      className="rounded-md border border-neutral-700 bg-neutral-950/55 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            issue.severity === "error"
                              ? "bg-red-500/20 text-red-200"
                              : issue.severity === "warning"
                                ? "bg-amber-500/20 text-amber-200"
                                : "bg-sky-500/20 text-sky-200"
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <code className="text-xs text-neutral-300">{issue.code}</code>
                        {issue.blocking && (
                          <span className="flex items-center gap-1 text-xs text-red-300">
                            <AlertTriangle className="h-3 w-3" /> Blocking
                          </span>
                        )}
                        {issue.mapId && (
                          <button
                            onClick={() => {
                              setSelectedMapId(issue.mapId || null);
                              setMode("map_editor");
                            }}
                            className="ml-auto rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                          >
                            Open {issue.mapId}
                          </button>
                        )}
                      </div>
                      <p className="mt-2 text-neutral-200">{issue.message}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">{issue.path}</p>
                      {issue.cells?.length ? (
                        <p className="mt-1 text-xs text-neutral-500">
                          Cell {issue.cells[0][0]}, {issue.cells[0][1]}
                        </p>
                      ) : null}
                      {issue.suggestedFix && (
                        <p className="mt-1 text-xs text-neutral-400">Suggested fix: {issue.suggestedFix}</p>
                      )}
                    </div>
                  ))}
                  {validationReport.issues.length > 100 && (
                    <p className="text-xs text-neutral-500">
                      Showing the first 100 of {validationReport.issues.length} diagnostics.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-400">No project or map diagnostics were reported.</p>
              )}
            </div>
          )}
        </div>
        <div className="bg-neutral-800/50 rounded-xl border border-neutral-700/50 p-5 sm:p-6 space-y-4">
          <h3 className="text-lg font-medium">Global Settings</h3>
          <p className="text-sm text-neutral-400 mb-4">Configure player appearance, starts, clock, and music.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-sm text-neutral-500 font-medium">Title</span>
                <input
                  value={gamePackage.metadata.title}
                  onChange={(e) => updateMetadata({ title: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-neutral-500 font-medium">Version</span>
                <input
                  value={gamePackage.metadata.version}
                  onChange={(e) => updateMetadata({ version: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-neutral-500 font-medium">Start Map</span>
                <select
                  value={gamePackage.metadata.start_map_id}
                  onChange={(e) => {
                    const map = gamePackage.maps.find((m) => m.id === e.target.value);
                    updateMetadata({
                      start_map_id: e.target.value,
                      start_spawn_id: map?.spawns?.[0]?.id || gamePackage.metadata.start_spawn_id,
                    });
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                >
                  {gamePackage.maps.map((map) => (
                    <option key={map.id} value={map.id}>{map.display_name || map.id}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-neutral-500 font-medium">Start Spawn</span>
                <select
                  value={gamePackage.metadata.start_spawn_id}
                  onChange={(e) => updateMetadata({ start_spawn_id: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                >
                  {(gamePackage.maps.find((map) => map.id === gamePackage.metadata.start_map_id)?.spawns || []).map((spawn) => (
                    <option key={spawn.id} value={spawn.id}>{spawn.id}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-neutral-500 font-medium">Player Sprite</label>
              <select
                className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                value={gamePackage.settings?.player_sprite_id || ""}
                onChange={(e) => updateSettings({ player_sprite_id: e.target.value || undefined })}
              >
                <option value="">Default Indicator</option>
                {gamePackage.sprite_library.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name || s.id}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["hp", "max_hp", "mp", "max_mp", "attack", "defense", "speed", "energy"].map((key) => (
                <label key={key} className="space-y-1.5">
                  <span className="text-sm text-neutral-500 font-medium">{key}</span>
                  <input
                    type="number"
                    value={gamePackage.settings?.player_stats?.[key] ?? ""}
                    placeholder="default"
                    onChange={(e) => updatePlayerStat(key, e.target.value === "" ? undefined as any : Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-sm text-neutral-500 font-medium">Clock Start Hour</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={gamePackage.settings?.clock_start_hour ?? ""}
                  onChange={(e) => updateSettings({ clock_start_hour: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-neutral-500 font-medium">Minutes Per Turn</span>
                <input
                  type="number"
                  min={0}
                  value={gamePackage.settings?.minutes_per_turn ?? ""}
                  onChange={(e) => updateSettings({ minutes_per_turn: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-neutral-500 font-medium">Music Tracks JSON</label>
              <textarea
                value={musicTracksText}
                onChange={(e) => setMusicTracksText(e.target.value)}
                rows={5}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-md py-2 px-3 text-xs font-mono text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
              />
              {musicTracksError && <p className="text-xs text-rose-400">{musicTracksError}</p>}
              <button
                onClick={applyMusicTracks}
                className="bg-neutral-700 hover:bg-neutral-600 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors"
              >
                Apply Music Tracks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
