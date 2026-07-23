import React, { useState, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { useEngineStore } from "../store/engineStore";
import { usePlayStore } from "../store/playStore";
import { GameRenderer3D } from "./GameRenderer3D";
import {
  MapData,
  MapGenerationSocketData,
  CellData,
  ContainerPlacementData,
  EntityPlacementData,
  MapExitData,
  TriggerData,
  WorldItemPlacementData,
  WorldRegionData,
} from "../schema/game";
// The editor works on the AUTHORED macro map, so it uses the macro-space
// footprint helpers; runtime code uses the fine variants.
import {
  getMacroPlacementFootprint,
  placementHasCollision,
  placementBlocksCellMacro as placementBlocksCell,
  placementOccupiesCellMacro as placementOccupiesCell,
} from "../utils/objectFootprint";
import {
  Plus,
  Play,
  MousePointer,
  Mountain,
  ArrowDownToLine,
  Move,
  CheckCircle,
  GripHorizontal,
  MessageSquare,
  Box,
  Swords,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Trash2,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { ConditionEditor } from "./ConditionEditor";
import {
  createMap as createSandboxMap,
  getStampNames,
  runStamp,
} from "../utils/mapAuthoring";
import { basicTheme } from "../utils/basicTheme";
import { validateOrdinaryMap } from "../engine-core/mapReadinessValidator";
import { normalizeJamMapElevations } from "../utils/legacyJamCompatibility";
// Side-effect: registers stamps with the DSL registry.
import { STAMP_PRESETS } from "../utils/basicStamps";
import {
  generatedIdNamespace,
  remapGeneratedMapNamespace,
} from "../generation-facing/deterministicIds";

type InspectorSelection =
  | { kind: "entity"; index: number }
  | { kind: "trigger"; index: number }
  | { kind: "exit"; index: number }
  | { kind: "item"; index: number }
  | { kind: "container"; index: number }
  | { kind: "generation_socket"; index: number }
  | null;

type MapProblem = {
  severity: "error" | "warn" | "info";
  kind: string;
  cell?: [number, number];
  message: string;
};

const EMOTIONAL_PROFILE_AXES = [
  { key: "valence", label: "Val" },
  { key: "arousal", label: "Aro" },
  { key: "grief", label: "Grf" },
  { key: "reverence", label: "Rev" },
  { key: "attachment", label: "Att" },
] as const;

export function MapEditor() {
  const {
    gamePackage,
    addMap,
    deleteMap,
    updateMap,
    updateSettings,
    setMode,
    selectedMapId,
    setSelectedMapId,
  } = useEngineStore();
  const { resetRun, saveData } = usePlayStore();

  const [activeMapId, setActiveMapId] = useState<string | null>(
    selectedMapId || gamePackage.maps[0]?.id || null,
  );
  const [activeMap, setActiveMap] = useState<MapData | null>(null);
  const [pendingDeleteMapId, setPendingDeleteMapId] = useState<string | null>(null);
  const activeGroundCellByCoord = React.useMemo(() => {
    const cells = new Map<string, CellData>();
    activeMap?.cells.forEach((cell) => {
      const id = `${cell.x}:${cell.z}`;
      const current = cells.get(id);
      if (!current || (cell.y || 0) < (current.y || 0)) cells.set(id, cell);
    });
    return cells;
  }, [activeMap?.cells]);
  const activeCellIndexByCoord = React.useMemo(() =>
    new Map((activeMap?.cells || []).map((cell, index) => [`${cell.x}:${cell.y || 0}:${cell.z}`, index])),
  [activeMap?.cells]);

  useEffect(() => {
    const map = gamePackage.maps.find((m) => m.id === activeMapId) || null;
    if (!map) {
      setActiveMap(null);
      return;
    }
    const normalized = normalizeJamMapElevations(map);
    setActiveMap(normalized);
    if (normalized !== map) updateMap(map.id, normalized);
  }, [gamePackage.maps, activeMapId, updateMap]);

  // Other Studio tools can select a map while the editor stays mounted, so
  // global selection is the source of truth here.
  useEffect(() => {
    if (
      selectedMapId &&
      selectedMapId !== activeMapId &&
      gamePackage.maps.some((map) => map.id === selectedMapId)
    ) {
      setActiveMapId(selectedMapId);
    }
  }, [activeMapId, gamePackage.maps, selectedMapId]);

  type EditTool =
    | "walkable"
    | "blocked"
    | "height_up"
    | "height_down"
    | "spawn"
    | "object"
    | "tile"
    | "interact"
    | "enemy"
    | "trigger"
    | "stamp"
    | "region";
  const [currentTool, setCurrentTool] = useState<EditTool>("walkable");
  // Brush size for cell-modifying tools (walkable/blocked/raise/lower/tile).
  const [brushSize, setBrushSize] = useState<number>(1);
  // Lint overlay: paints validator warnings on the live map.
  const [lintEnabled, setLintEnabled] = useState<boolean>(false);
  // Stamp dropdown picks one of the registered presets.
  void getStampNames; // kept available for future raw-stamp tools
  const [placementPresetIdx, setPlacementPresetIdx] = useState<number>(0);

  // Lint problems for the active map — only computed when the overlay is on.
  const lintProblems = React.useMemo<MapProblem[]>(() => {
    if (!lintEnabled || !activeMap) return [];
    return validateOrdinaryMap(activeMap, { package: gamePackage }).issues.map((issue) => ({
      severity: issue.severity === "warning" ? "warn" : issue.severity,
      kind: issue.code,
      cell: issue.cells?.[0],
      message: issue.suggestedFix
        ? `${issue.message} Suggested fix: ${issue.suggestedFix}`
        : issue.message,
    }));
  }, [lintEnabled, activeMap, gamePackage]);
  // Regions present on the map: authored `map.regions` entries unioned with any
  // `region_id` painted onto cells, with a live cell count for each.
  const regionSummaries = React.useMemo(() => {
    if (!activeMap) return [] as { id: string; cellCount: number }[];
    const counts = new Map<string, number>();
    for (const cell of activeMap.cells) {
      if (cell.region_id) counts.set(cell.region_id, (counts.get(cell.region_id) || 0) + 1);
    }
    for (const region of activeMap.regions || []) {
      if (!counts.has(region.id)) counts.set(region.id, 0);
    }
    return Array.from(counts.entries())
      .map(([id, cellCount]) => ({ id, cellCount }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [activeMap]);
  const [placementObjectId, setPlacementObjectId] = useState<string | null>(
    gamePackage.object_library[0]?.id || null,
  );
  const [assignDialogueId, setAssignDialogueId] = useState<string | null>(
    gamePackage.dialogue[0]?.id || null,
  );
  const [placementEntityId, setPlacementEntityId] = useState<string | null>(
    gamePackage.entities[0]?.id || null,
  );
  const [triggerCutsceneId, setTriggerCutsceneId] = useState<string | null>(
    gamePackage.cutscenes[0]?.id || null,
  );
  const [triggerType, setTriggerType] = useState<
    "step" | "interact" | "on_load" | "switch_change"
  >("step");
  const [editLayerY, setEditLayerY] = useState(0);
  const [selection, setSelection] = useState<InspectorSelection>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // The region the "Grid" paint tool assigns to clicked cells ("" = erase).
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");
  const [topDown, setTopDown] = useState(false);
  const orbitRef = useRef<any>(null);
  const [editorRenderCenter, setEditorRenderCenter] =
    useState<[number, number]>([0, 0]);
  const [editorRenderRadius, setEditorRenderRadius] = useState(64);
  const [hoverCell, setHoverCell] = useState<{ x: number; z: number } | null>(null);

  useEffect(() => {
    if (!activeMap) return;
    const focus = activeMap.spawns[0]?.cell || [0, 0];
    setEditorRenderCenter([Number(focus[0] || 0), Number(focus[1] || 0)]);
    setEditorRenderRadius(
      Math.min(72, Math.max(32, Math.max(activeMap.width, activeMap.height))),
    );
  }, [activeMap?.id]);

  useEffect(() => {
    if (
      gamePackage.entities.length > 0 &&
      !gamePackage.entities.find((e) => e.id === placementEntityId)
    ) {
      setPlacementEntityId(gamePackage.entities[0].id);
    }
  }, [gamePackage.entities, placementEntityId]);

  useEffect(() => {
    if (currentTool === "object" || currentTool === "tile") {
      const filteredOptions = gamePackage.object_library.filter((o) => {
        if (currentTool === "tile") return o.tags?.includes("tile");
        return !o.tags?.includes("tile");
      });
      // if current placement object isn't in the filtered list, pick the first
      if (!filteredOptions.find((o) => o.id === placementObjectId)) {
        setPlacementObjectId(filteredOptions[0]?.id || null);
      }
    }
  }, [currentTool, gamePackage.object_library, placementObjectId]);

  useEffect(() => {
    if (
      gamePackage.dialogue.length > 0 &&
      !gamePackage.dialogue.find((d) => d.id === assignDialogueId)
    ) {
      setAssignDialogueId(gamePackage.dialogue[0].id);
    }
  }, [gamePackage.dialogue, assignDialogueId]);

  const handleCreateMap = () => {
    const id = `map_${Date.now()}`;
    const newMap: MapData = {
      id,
      display_name: "New Map",
      width: 10,
      height: 10,
      spawns: [],
      cells: [],
      props: [],
      custom_object_placements: [],
      entity_placements: [],
      item_placements: [],
      container_placements: [],
      triggers: [],
      exits: [],
    };

    // fill cells
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        newMap.cells.push({
          x,
          y: 0,
          z,
          active: true,
          walkable: true,
          blocks_los: false,
          height: 0,
          visual_height: 0,
          terrain: "default",
          surface_tag: "none",
        });
      }
    }
    // Default spawn
    newMap.spawns.push({ id: "start", cell: [0, 0], facing: [0, 1] });

    addMap(newMap);
    setActiveMapId(id);
    setSelectedMapId(id);
  };

  const handleDeleteMap = () => {
    if (!activeMap || pendingDeleteMapId !== activeMap.id) return;
    const deletedMapId = activeMap.id;
    if (!deleteMap(deletedMapId)) return;
    if (saveData?.current_map_id === deletedMapId) resetRun();
    setPendingDeleteMapId(null);
  };

  const handleResizeMap = (newWidth: number, newHeight: number) => {
    if (!activeMap) return;
    const cw = Math.max(1, newWidth);
    const ch = Math.max(1, newHeight);

    const newCells = [...activeMap.cells];
    const minX = -Math.floor(cw / 2);
    const maxX = Math.floor((cw - 1) / 2);
    const minZ = -Math.floor(ch / 2);
    const maxZ = Math.floor((ch - 1) / 2);
    const existingCells = new Set(newCells.map((cell) => `${cell.x}:${cell.y || 0}:${cell.z}`));

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const cellKey = `${x}:${editLayerY}:${z}`;
        if (!existingCells.has(cellKey)) {
          newCells.push({
            x,
            y: editLayerY,
            z,
            active: true,
            walkable: true,
            blocks_los: false,
            height: 0,
            visual_height: 0,
            terrain: "default",
            surface_tag: "none",
          });
          existingCells.add(cellKey);
        }
      }
    }

    updateMap(activeMap.id, { width: cw, height: ch, cells: newCells });
  };

  const handleDuplicateMap = () => {
    if (!activeMap) return;
    const existingIds = new Set(gamePackage.maps.map((map) => map.id));
    const baseId = `${activeMap.id}_copy`;
    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) id = `${baseId}_${suffix++}`;

    const duplicate = remapGeneratedMapNamespace(activeMap, id);
    addMap({
      ...duplicate,
      display_name: `${activeMap.display_name || activeMap.id} Copy`,
    });
    setActiveMapId(id);
    setSelectedMapId(id);
  };

  // Apply a single-cell tool effect to a cells array. Returns the same array
  // (mutated). Brush tools call this once per cell within the brush radius.
  const applyBrushAt = (newCells: CellData[], byCoord: Map<string, number>, x: number, z: number): CellData[] => {
    const coord = `${x}:${editLayerY}:${z}`;
    const idx = byCoord.get(coord) ?? -1;
    let cell: CellData;
    if (idx === -1) {
      cell = {
        x, y: editLayerY, z,
        active: true, walkable: true, blocks_los: false,
        height: 0, visual_height: 0,
        terrain: "default", surface_tag: "none",
      };
      newCells.push(cell);
      byCoord.set(coord, newCells.length - 1);
    } else {
      cell = { ...newCells[idx] };
      newCells[idx] = cell;
    }
    switch (currentTool) {
      case "walkable":
        cell.walkable = true; cell.blocks_los = false; cell.visual_height = 0; break;
      case "blocked":
        cell.walkable = false; cell.blocks_los = true; cell.visual_height = 3.6; break;
      case "height_up":
        cell.visual_height += 1; break;
      case "height_down":
        cell.visual_height = Math.max(0, cell.visual_height - 1); break;
      case "tile":
        if (placementObjectId) {
          cell.object_id = cell.object_id === placementObjectId ? undefined : placementObjectId;
        }
        break;
      case "region":
        // Paint (or, with an empty selection, erase) the cell's region_id. This
        // gives an authored Grid region its spatial extent.
        cell.region_id = selectedRegionId || undefined;
        break;
    }
    return newCells;
  };

  // Stamp tool: run the picked preset in a sandbox builder, merge into the
  // active map. Sandbox is initialised empty (skipInit) so only the cells
  // the stamp explicitly writes get merged.
  const handleStampDrop = (cx: number, cz: number) => {
    if (!activeMap) return;
    const preset = STAMP_PRESETS[placementPresetIdx];
    if (!preset) return;
    const halfW = Math.floor(activeMap.width / 2);
    const halfH = Math.floor(activeMap.height / 2);
    const m = createSandboxMap({
      width: activeMap.width, height: activeMap.height,
      minX: -halfW, minZ: -halfH,
      theme: basicTheme, skipInit: true,
    });
    try {
      runStamp(m, preset.stampName, preset.build(cx, cz));
    } catch (err) {
      console.error(`stamp "${preset.stampName}" failed:`, err);
      alert(`Stamp failed: ${(err as Error).message}`);
      return;
    }
    const result = m.build();
    const cells = [...activeMap.cells];
    const ck = (c: CellData) => `${c.x}|${c.y || 0}|${c.z}`;
    const byKey = new Map<string, number>();
    cells.forEach((c, i) => byKey.set(ck(c), i));
    for (const sc of result.cells) {
      const k = ck(sc);
      const ei = byKey.get(k);
      if (ei !== undefined) cells[ei] = sc;
      else { cells.push(sc); byKey.set(k, cells.length - 1); }
    }
    updateMap(activeMap.id, {
      cells,
      custom_object_placements: [...activeMap.custom_object_placements, ...result.custom_object_placements],
      item_placements: [...activeMap.item_placements, ...result.item_placements],
      container_placements: [...activeMap.container_placements, ...result.container_placements],
      entity_placements: [...activeMap.entity_placements, ...result.entity_placements],
      triggers: [...activeMap.triggers, ...result.triggers],
    });
  };

  const handleCellClick = (x: number, z: number) => {
    if (!activeMap) return;
    if (currentTool === "stamp") { handleStampDrop(x, z); return; }

    // Brush tools — apply the effect across the brush radius in one update.
    if (
      currentTool === "walkable" ||
      currentTool === "blocked" ||
      currentTool === "height_up" ||
      currentTool === "height_down" ||
      currentTool === "tile" ||
      currentTool === "region"
    ) {
      const r = Math.floor(brushSize / 2);
      let newCells = [...activeMap.cells];
      const byCoord = new Map(activeCellIndexByCoord);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          newCells = applyBrushAt(newCells, byCoord, x + dx, z + dz);
        }
      }
      updateMap(activeMap.id, { cells: newCells });
      return;
    }

    // One-shot tools (existing behaviour).
    const newCells = [...activeMap.cells];
    const idx = activeCellIndexByCoord.get(`${x}:${editLayerY}:${z}`) ?? -1;
    let cell: CellData;
    if (idx === -1) {
      cell = {
        x, y: editLayerY, z,
        active: true, walkable: true, blocks_los: false,
        height: 0, visual_height: 0,
        terrain: "default", surface_tag: "none",
      };
      newCells.push(cell);
    } else {
      cell = { ...newCells[idx] };
      newCells[idx] = cell;
    }
    let spawns = [...activeMap.spawns];
    switch (currentTool) {
      case "spawn":
        spawns = [{ id: "start", cell: [x, z], facing: [0, 1] }];
        break;
      case "object":
        if (placementObjectId) {
          const newPlacements = [...activeMap.custom_object_placements];
          const objectLibrary = gamePackage.object_library;
          const existingIdx = newPlacements.findIndex(
            (p) =>
              placementOccupiesCell(
                p,
                objectLibrary.find((o) => o.id === p.object_id),
                x,
                z,
              ),
          );
          if (existingIdx !== -1) {
            newPlacements.splice(existingIdx, 1); // toggle: remove if already exists
          } else {
            newPlacements.push({
              object_id: placementObjectId,
              cell: [x, z],
              facing: [0, 1],
            });
          }
          updateMap(activeMap.id, { custom_object_placements: newPlacements });
        }
        return; // We handled it, don't just update raw map cells
      case "enemy":
        if (placementEntityId) {
          const newEntities = [...(activeMap.entity_placements || [])];
          const existingIdx = newEntities.findIndex(
            (e) => e.cell[0] === x && e.cell[1] === z,
          );
          if (existingIdx !== -1) {
            newEntities.splice(existingIdx, 1);
            setSelection(null);
          } else {
            newEntities.push({ entity_id: placementEntityId, cell: [x, z] });
            setSelection({ kind: "entity", index: newEntities.length - 1 });
          }
          updateMap(activeMap.id, { entity_placements: newEntities });
        }
        return;
      case "trigger":
        if (triggerCutsceneId) {
          const newTriggers = [...(activeMap.triggers || [])];
          const existingIdx =
            triggerType === "on_load"
              ? -1
              : newTriggers.findIndex(
                  (t) =>
                    t.cell?.[0] === x &&
                    t.cell?.[1] === z &&
                    t.type === triggerType,
                );
          if (existingIdx !== -1) {
            newTriggers.splice(existingIdx, 1);
            setSelection(null);
          } else {
            newTriggers.push({
              id: `trig_${Date.now()}`,
              cell: triggerType === "on_load" ? undefined : [x, z],
              type: triggerType,
              cutscene_id: triggerCutsceneId,
              conditions: [],
              once: triggerType !== "on_load",
            });
            setSelection({ kind: "trigger", index: newTriggers.length - 1 });
          }
          updateMap(activeMap.id, { triggers: newTriggers });
        }
        return;
      case "interact":
        if (assignDialogueId) {
          const newPlacements = [...activeMap.custom_object_placements];
          const objectLibrary = gamePackage.object_library;
          const existingIdx = newPlacements.findIndex(
            (p) =>
              placementOccupiesCell(
                p,
                objectLibrary.find((o) => o.id === p.object_id),
                x,
                z,
              ),
          );
          if (existingIdx !== -1) {
            // Toggle dialogue assignment
            if (newPlacements[existingIdx].dialogue_id === assignDialogueId) {
              newPlacements[existingIdx] = {
                ...newPlacements[existingIdx],
                dialogue_id: undefined,
              };
            } else {
              newPlacements[existingIdx] = {
                ...newPlacements[existingIdx],
                dialogue_id: assignDialogueId,
              };
            }
            updateMap(activeMap.id, {
              custom_object_placements: newPlacements,
            });
          } else {
            // Inform user they must click an Object
            alert(
              "You can only assign dialogue to an object placed with the Object tool.",
            );
          }
        }
        return;
    }

    updateMap(activeMap.id, { cells: newCells, spawns });
  };

  const handleTestPlay = () => {
    if (!activeMap) return;
    if (
      saveData &&
      !window.confirm(
        `Start a clean test run on ${activeMap.display_name || activeMap.id}? The current runtime session will be discarded; authored map data will not change.`,
      )
    ) {
      return;
    }
    setSelectedMapId(activeMap.id);
    resetRun();
    setMode("play");
  };

  const handleValidateReachability = () => {
    if (!activeMap) return;
    if (activeMap.spawns.length === 0) {
      alert("Validation Failed: No spawn point set.");
      return;
    }

    const { cell } = activeMap.spawns[0];

    const visited = new Set<string>();
    const queue: [number, number][] = [[cell[0], cell[1]]];

    const isWalkable = (x: number, z: number) => {
      const c = activeGroundCellByCoord.get(`${x}:${z}`);
      if (!c || !c.walkable) return false;

      if (c.object_id) {
        const cellObjDef = gamePackage.object_library.find(
          (o) => o.id === c.object_id,
        );
        if (cellObjDef && cellObjDef.collision?.profile !== "none") {
          return false;
        }
      }

      return !activeMap.custom_object_placements.some((placement) =>
        placementBlocksCell(
          placement,
          gamePackage.object_library.find((o) => o.id === placement.object_id),
          x,
          z,
        ),
      );
    };

    while (queue.length > 0) {
      const [cx, cz] = queue.shift()!;
      const key = `${cx}_${cz}`;

      if (!visited.has(key)) {
        visited.add(key);

        const neighbors = [
          [cx + 1, cz],
          [cx - 1, cz],
          [cx, cz + 1],
          [cx, cz - 1],
        ];
        for (const [nx, nz] of neighbors) {
          if (isWalkable(nx, nz) && !visited.has(`${nx}_${nz}`)) {
            queue.push([nx, nz]);
          }
        }
      }
    }

    const walkableCells = activeMap.cells.filter((c) => c.walkable);
    const unreachableCells = walkableCells.filter(
      (c) => !visited.has(`${c.x}_${c.z}`),
    );

    if (unreachableCells.length > 0) {
      alert(
        `Validation Failed: ${unreachableCells.length} walkable cells are unreachable from spawn.`,
      );
    } else {
      alert("Validation Passed: All walkable cells are reachable!");
    }
  };

  if (!activeMap) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="bg-neutral-800 p-6 rounded-full inline-block mb-2">
          <Mountain className="w-8 h-8 text-neutral-400" />
        </div>
        <div>
          <h2 className="text-xl font-medium">No Map Selected</h2>
          <p className="text-neutral-400 text-sm mt-1">
            Create a new map to start building your world.
          </p>
        </div>
        <button
          onClick={handleCreateMap}
          className="bg-neutral-100 hover:bg-white text-neutral-900 font-medium px-6 py-2.5 rounded-lg flex items-center gap-2 mt-4 transition-transform active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Create First Map
        </button>
      </div>
    );
  }

  const tools: { id: EditTool; label: string; icon: React.ReactNode }[] = [
    {
      id: "walkable",
      label: "Walkable",
      icon: <MousePointer className="w-4 h-4" />,
    },
    { id: "blocked", label: "Wall", icon: <Box className="w-4 h-4" /> },
    { id: "height_up", label: "Raise", icon: <Mountain className="w-4 h-4" /> },
    {
      id: "height_down",
      label: "Lower",
      icon: <ArrowDownToLine className="w-4 h-4" />,
    },
    { id: "spawn", label: "Spawn", icon: <Move className="w-4 h-4" /> },
    { id: "tile", label: "Tile", icon: <GripHorizontal className="w-4 h-4" /> },
    { id: "object", label: "Object", icon: <Plus className="w-4 h-4" /> },
    {
      id: "interact",
      label: "Interact",
      icon: <MessageSquare className="w-4 h-4" />,
    },
    { id: "enemy", label: "Entity", icon: <Swords className="w-4 h-4" /> },
    { id: "trigger", label: "Trigger", icon: <Box className="w-4 h-4" /> },
    { id: "stamp", label: "Stamp", icon: <Sparkles className="w-4 h-4" /> },
    { id: "region", label: "Grid", icon: <Sparkles className="w-4 h-4" /> },
  ];

  const getRegionRecord = (id: string) =>
    activeMap?.regions?.find((region) => region.id === id);

  // Create/patch a `map.regions` entry, preserving unrelated fields.
  const upsertRegion = (id: string, updates: Partial<WorldRegionData>) => {
    if (!activeMap) return;
    const existing = activeMap.regions || [];
    const idx = existing.findIndex((region) => region.id === id);
    const base: WorldRegionData =
      idx >= 0
        ? existing[idx]
        : { id, neutral: false, passive_checks: [] };
    const nextRegion = { ...base, ...updates, id };
    const regions = idx >= 0
      ? existing.map((region, i) => (i === idx ? nextRegion : region))
      : [...existing, nextRegion];
    updateMap(activeMap.id, { regions });
  };

  const patchRegionGrid = (
    id: string,
    gridUpdates: Partial<NonNullable<WorldRegionData["alderamontico_grid"]>>,
  ) => {
    const current = getRegionRecord(id)?.alderamontico_grid;
    upsertRegion(id, {
      alderamontico_grid: {
        enabled: current?.enabled ?? true,
        magnitude: current?.magnitude ?? 2,
        ...current,
        ...gridUpdates,
      },
    });
  };

  const patchRegionEmotionalProfile = (
    id: string,
    axis: (typeof EMOTIONAL_PROFILE_AXES)[number]["key"],
    value: number | undefined,
  ) => {
    const current = getRegionRecord(id)?.emotional_profile;
    const nextOffsets = {
      ...(current?.baseline_axis_offsets || {}),
      [axis]: value,
    };
    if (value === undefined) delete nextOffsets[axis];
    upsertRegion(id, {
      emotional_profile: Object.keys(nextOffsets).length
        ? {
            ...(current || {}),
            baseline_axis_offsets: nextOffsets,
          }
        : undefined,
    });
  };

  const createRegion = () => {
    if (!activeMap) return;
    const existingIds = new Set(regionSummaries.map((summary) => summary.id));
    let n = (activeMap.regions?.length || 0) + 1;
    let id = `region_${n}`;
    while (existingIds.has(id)) {
      n += 1;
      id = `region_${n}`;
    }
    upsertRegion(id, {
      display_name: `Region ${n}`,
      neutral: true,
      alderamontico_grid: { enabled: true, magnitude: 2 },
    });
    setSelectedRegionId(id);
    setCurrentTool("region");
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 relative">
      {/* Editor Header */}
      <div className="h-14 shrink-0 bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-800 flex items-center justify-between gap-3 px-4 z-10">
        <div className="flex items-center gap-4">
          <select
            className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-1 max-w-[150px] outline-none"
            value={activeMapId || ""}
            onChange={(e) => {
              setActiveMapId(e.target.value);
              setSelectedMapId(e.target.value);
            }}
          >
            {gamePackage.maps.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
            ))}
          </select>
          {activeMap && (
            <div className="hidden xl:flex items-center gap-2 text-sm">
              <label className="text-neutral-400">W:</label>
              <input
                type="number"
                className="w-16 bg-neutral-800 border border-neutral-700 rounded px-1 min-h-[28px]"
                value={activeMap.width || 10}
                onChange={(e) =>
                  handleResizeMap(
                    parseInt(e.target.value) || 1,
                    activeMap.height || 10,
                  )
                }
              />
              <label className="text-neutral-400 ml-2">H:</label>
              <input
                type="number"
                className="w-16 bg-neutral-800 border border-neutral-700 rounded px-1 min-h-[28px]"
                value={activeMap.height || 10}
                onChange={(e) =>
                  handleResizeMap(
                    activeMap.width || 10,
                    parseInt(e.target.value) || 1,
                  )
                }
              />
              <label className="text-neutral-400 ml-2" title="Ambient track that starts when the player enters this map (registered in Game · Audio)">♪</label>
              <select
                className="max-w-[120px] bg-neutral-800 border border-neutral-700 rounded px-1 min-h-[28px] text-xs outline-none"
                value={((gamePackage.settings?.map_music || {}) as Record<string, string>)[activeMap.id] || ""}
                onChange={(e) => {
                  const mapMusic = { ...((gamePackage.settings?.map_music || {}) as Record<string, string>) };
                  if (e.target.value) mapMusic[activeMap.id] = e.target.value;
                  else delete mapMusic[activeMap.id];
                  updateSettings({ map_music: mapMusic });
                }}
              >
                <option value="">no map music</option>
                {Object.keys((gamePackage.settings?.music_tracks || {}) as Record<string, string>).map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
          )}
          <div className="hidden xl:flex items-center gap-2 text-sm ml-4 border-l border-neutral-700 pl-4">
            <label className="text-neutral-400">Y Layer:</label>
            <button
              onClick={() => setEditLayerY((y) => y - 1)}
              className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <span className="w-6 text-center">{editLayerY}</span>
            <button
              onClick={() => setEditLayerY((y) => y + 1)}
              className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleValidateReachability}
            title="Validate Reachability"
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreateMap}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="New Map"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleDuplicateMap}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
            title="Duplicate Map"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeMap && setPendingDeleteMapId(activeMap.id)}
            disabled={!activeMap || activeMap.id === gamePackage.metadata.start_map_id || gamePackage.maps.length <= 1}
            className="p-2 text-neutral-400 hover:bg-red-950 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 rounded-md transition-colors"
            title={activeMap?.id === gamePackage.metadata.start_map_id ? "The start map cannot be deleted" : "Delete Map"}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTopDown((value) => !value)}
            className={`p-2 rounded-md transition-colors flex items-center gap-1.5 px-3 text-sm font-medium ${
              topDown
                ? "bg-indigo-600/30 text-indigo-300"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
            title={topDown ? "Switch to isometric view" : "Switch to top-down view"}
          >
            <Mountain className="w-4 h-4" />
            <span className="hidden sm:inline">{topDown ? "Top-down" : "Iso"}</span>
          </button>
          <button
            onClick={() => orbitRef.current?.reset?.()}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors flex items-center gap-1.5 px-3 text-sm font-medium"
            title="Fit / reset camera"
          >
            <Move className="w-4 h-4" />
            <span className="hidden sm:inline">Fit</span>
          </button>
          {/* Lint overlay: paint validator warnings on the map. */}
          <button
            onClick={() => setLintEnabled((v) => !v)}
            className={`p-2 rounded-md transition-colors flex items-center gap-1.5 px-3 text-sm font-medium ${lintEnabled ? "bg-amber-600/30 text-amber-300" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"}`}
            title={lintEnabled ? "Hide map lint warnings" : "Show map lint warnings"}
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Lint{lintEnabled && lintProblems.length ? ` (${lintProblems.length})` : ""}</span>
          </button>
          {/* Inspector toggle */}
          <button
            onClick={() => setInspectorOpen((v) => !v)}
            className={`p-2 rounded-md transition-colors flex items-center gap-1.5 px-3 text-sm font-medium ${inspectorOpen ? "bg-neutral-700 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"}`}
            title="Toggle Inspector"
          >
            <GripHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Inspector</span>
          </button>
          <button
            onClick={handleTestPlay}
            className="flex items-center gap-2 bg-green-600/20 text-green-400 hover:bg-green-600/30 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">Play map</span>
          </button>
        </div>

        {activeMap && pendingDeleteMapId === activeMap.id && (
          <div className="flex w-full items-center gap-3 border-t border-red-500/30 bg-red-950/40 px-4 py-2 text-sm text-red-100">
            <span className="mr-auto">Delete <strong>{activeMap.display_name}</strong>? Incoming exits to this map will also be removed.</span>
            <button
              onClick={() => setPendingDeleteMapId(null)}
              className="rounded-md px-3 py-1.5 text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteMap}
              className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-500"
            >
              Confirm Delete Map
            </button>
          </div>
        )}
      </div>

      {/* 3D Canvas + docked inspector */}
      <div className="flex-1 flex min-h-0">
        <div className="relative flex-1 min-h-0">
        <Canvas
          shadows="basic"
          dpr={[1, 1.5]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          {topDown ? (
            <OrthographicCamera
              makeDefault
              position={[editorRenderCenter[0], 100, editorRenderCenter[1] + 0.001]}
              zoom={Math.max(
                2,
                Math.min(40, 620 / Math.max(activeMap.width || 10, activeMap.height || 10)),
              )}
              near={0.1}
              far={1000}
            />
          ) : (
            <PerspectiveCamera
              makeDefault
              position={[
                editorRenderCenter[0] + 18,
                24,
                editorRenderCenter[1] + 18,
              ]}
              fov={45}
            />
          )}
          <color attach="background" args={["#111111"]} />
          <ambientLight intensity={0.24} />
          <directionalLight position={[10, 20, 10]} intensity={0.68} castShadow />
          <GameRenderer3D
            map={activeMap}
            gridSpace="macro"
            playerPos={
              activeMap.spawns[0]?.cell as [number, number] | undefined
            }
            playerFacing={
              activeMap.spawns[0]?.facing as [number, number] | undefined
            }
            onCellClick={handleCellClick}
            onCellHover={(x, z) => setHoverCell({ x, z })}
            onPointerOut={() => setHoverCell(null)}
            hoveredCell={hoverCell ? [hoverCell.x, hoverCell.z] : null}
            showGrid
            editLayerY={editLayerY}
            renderCenter={editorRenderCenter}
            renderRadius={editorRenderRadius}
          />
          <group>
            {(activeMap.generation_sockets ?? []).map((socket, index) => {
              const selected = selection?.kind === "generation_socket" && selection.index === index;
              const color = socket.kind === "entrance"
                ? "#22c55e"
                : socket.kind === "culmination"
                  ? "#ef4444"
                  : socket.kind === "artifact_origin"
                    ? "#f59e0b"
                    : socket.kind === "extraction"
                      ? "#06b6d4"
                      : "#e879f9";
              return (
                <group key={socket.id} position={[socket.cell[0], 2.72, socket.cell[1]]}>
                  <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelection({ kind: "generation_socket", index });
                      setInspectorOpen(true);
                    }}
                  >
                    <torusGeometry args={[selected ? 0.44 : 0.34, selected ? 0.11 : 0.075, 8, 20]} />
                    <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.96} />
                  </mesh>
                  <mesh position={[0, 0.28, 0]} raycast={() => null}>
                    <sphereGeometry args={[selected ? 0.16 : 0.11, 10, 8]} />
                    <meshBasicMaterial color={color} depthTest={false} />
                  </mesh>
                </group>
              );
            })}
          </group>
          {lintEnabled && (
            <group>
              {lintProblems.map((problem, index) => {
                if (!problem.cell) return null;
                const color =
                  problem.severity === "error"
                    ? "#ff3030"
                    : problem.severity === "warn"
                      ? "#ffcc00"
                      : "#3080ff";
                return (
                  <mesh
                    key={`lint_${index}`}
                    position={[problem.cell[0], 2.6, problem.cell[1]]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    raycast={() => null}
                  >
                    <planeGeometry args={[0.92, 0.92]} />
                    <meshBasicMaterial
                      color={color}
                      transparent
                      opacity={0.62}
                      depthTest={false}
                    />
                  </mesh>
                );
              })}
            </group>
          )}
          {hoverCell &&
            brushSize > 1 &&
            (currentTool === "walkable" ||
              currentTool === "blocked" ||
              currentTool === "height_up" ||
              currentTool === "height_down" ||
              currentTool === "tile" ||
              currentTool === "region") && (
              <mesh
                position={[hoverCell.x, 2.55, hoverCell.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={() => null}
              >
                <planeGeometry args={[brushSize, brushSize]} />
                <meshBasicMaterial
                  color="#88C0D0"
                  transparent
                  opacity={0.18}
                  depthTest={false}
                />
              </mesh>
            )}
          <OrbitControls
            key={topDown ? "top" : "iso"}
            ref={orbitRef}
            target={[editorRenderCenter[0], 0, editorRenderCenter[1]]}
            enableRotate={!topDown}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={2}
            maxDistance={Math.max(80, Math.max(activeMap.width, activeMap.height) * 2)}
            onChange={() => {
              const controls = orbitRef.current;
              if (!controls?.target || !controls?.object) return;
              const nextCenter: [number, number] = [
                Math.round(controls.target.x),
                Math.round(controls.target.z),
              ];
              setEditorRenderCenter((current) =>
                current[0] === nextCenter[0] && current[1] === nextCenter[1]
                  ? current
                  : nextCenter,
              );
              const distance = controls.object.position.distanceTo(controls.target);
              const nextRadius = Math.max(32, Math.min(280, Math.ceil(distance * 1.4)));
              setEditorRenderRadius((current) =>
                current === nextRadius ? current : nextRadius,
              );
            }}
          />
        </Canvas>
        {/* Coordinate / cell read-out HUD */}
        <div className="pointer-events-none absolute left-3 bottom-3 z-10 rounded-md bg-neutral-950/80 backdrop-blur border border-neutral-800 px-3 py-2 text-[11px] font-mono text-neutral-300 leading-relaxed">
          {(() => {
            if (!hoverCell) return <span className="text-neutral-500">Hover the map…</span>;
            const c = activeMap.cells
              .filter((cell) => cell.x === hoverCell.x && cell.z === hoverCell.z)
              .sort((a, b) => (b.y || 0) - (a.y || 0))[0];
            return (
              <>
                <div className="text-neutral-100">x {hoverCell.x} · z {hoverCell.z}</div>
                {c ? (
                  <div className="text-neutral-400">
                    y {c.y || 0} · vh {c.visual_height || 0} · {c.walkable === false ? "blocked" : "walkable"}
                    <br />
                    {c.object_id || "(empty)"}
                  </div>
                ) : (
                  <div className="text-neutral-500">(no cell)</div>
                )}
                <div className="text-indigo-300/80">{currentTool} · layer {editLayerY}{brushSize > 1 ? ` · brush ${brushSize}×${brushSize}` : ""}</div>
                {lintEnabled && hoverCell && (() => {
                  const here = lintProblems.find((p) => p.cell && p.cell[0] === hoverCell.x && p.cell[1] === hoverCell.z);
                  return here ? <div className="text-amber-300">⚠ {here.kind}: {here.message}</div> : null;
                })()}
              </>
            );
          })()}
        </div>

        {/* Grid region authoring — configure the Alderamontico Grid operator and
            its lens on the region you paint with the Grid tool. */}
        {currentTool === "region" && (() => {
          const selectedRegion = selectedRegionId ? getRegionRecord(selectedRegionId) : undefined;
          const grid = selectedRegion?.alderamontico_grid;
          const lensEntityIds = Array.from(
            new Set((activeMap.entity_placements || []).map((placement) => placement.entity_id)),
          );
          return (
            <div className="absolute right-3 top-3 z-10 w-64 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-emerald-700/70 bg-neutral-950/95 backdrop-blur px-3 py-3 text-neutral-200 shadow-xl">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" /> Grid Regions
                </span>
                <button
                  onClick={createRegion}
                  className="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                >
                  + New
                </button>
              </div>

              <label className="mt-3 block text-[11px] font-medium text-neutral-400">Painting</label>
              <select
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
                value={selectedRegionId}
                onChange={(e) => setSelectedRegionId(e.target.value)}
              >
                <option value="">— Erase region —</option>
                {regionSummaries.map((summary) => {
                  const record = getRegionRecord(summary.id);
                  const label = record?.display_name || summary.id;
                  return (
                    <option key={summary.id} value={summary.id}>
                      {label} ({summary.cellCount})
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                Click/drag the map to paint the selected region onto cells (or erase). The Grid
                amplifies each occupant's dominant philosophy axis here.
              </p>

              {selectedRegion ? (
                <div className="mt-3 space-y-3 border-t border-neutral-800 pt-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400">Display name</label>
                    <input
                      className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
                      value={selectedRegion.display_name || ""}
                      placeholder={selectedRegion.id}
                      onChange={(e) => upsertRegion(selectedRegion.id, { display_name: e.target.value || undefined })}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={grid?.enabled ?? false}
                      onChange={(e) => patchRegionGrid(selectedRegion.id, { enabled: e.target.checked })}
                      className="rounded border-neutral-700 bg-neutral-900"
                    />
                    Grid amplification enabled
                  </label>

                  {grid?.enabled && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400">
                          Magnitude / step
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
                          value={grid.magnitude ?? 2}
                          onChange={(e) =>
                            patchRegionGrid(selectedRegion.id, {
                              magnitude: Number.isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400">Lens entity</label>
                        <select
                          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
                          value={grid.lens_entity_id || ""}
                          onChange={(e) => patchRegionGrid(selectedRegion.id, { lens_entity_id: e.target.value || undefined })}
                        >
                          <option value="">— No lens —</option>
                          {lensEntityIds.map((entityId) => {
                            const def = gamePackage.entities.find((entity) => entity.id === entityId);
                            return (
                              <option key={entityId} value={entityId}>
                                {def?.display_name || entityId}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {grid.lens_entity_id && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-medium text-neutral-400">Lens radius</label>
                            <input
                              type="number"
                              min={0}
                              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
                              value={grid.lens_radius ?? 0}
                              onChange={(e) =>
                                patchRegionGrid(selectedRegion.id, {
                                  lens_radius: Math.max(0, parseInt(e.target.value, 10) || 0),
                                })
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-neutral-400">Lens ×</label>
                            <input
                              type="number"
                              step={0.5}
                              min={1}
                              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
                              value={grid.lens_multiplier ?? 1}
                              onChange={(e) =>
                                patchRegionGrid(selectedRegion.id, {
                                  lens_multiplier: Math.max(1, parseFloat(e.target.value) || 1),
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-neutral-800 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-medium text-neutral-400">Emotional profile offsets</label>
                      <span className="text-[10px] text-neutral-500">baseline</span>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {EMOTIONAL_PROFILE_AXES.map((axis) => {
                        const value =
                          selectedRegion.emotional_profile?.baseline_axis_offsets?.[axis.key];
                        return (
                          <label key={axis.key} className="block">
                            <span className="block text-center text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
                              {axis.label}
                            </span>
                            <input
                              type="number"
                              step={1}
                              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-1 py-1.5 text-center text-xs text-white outline-none focus:border-emerald-500"
                              value={value ?? ""}
                              placeholder="0"
                              onChange={(e) => {
                                const parsed = parseFloat(e.target.value);
                                patchRegionEmotionalProfile(
                                  selectedRegion.id,
                                  axis.key,
                                  e.target.value === "" || Number.isNaN(parsed) ? undefined : parsed,
                                );
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[10px] leading-snug text-neutral-500">
                      Offsets bias an actor's first emotional baseline inside this region; the Grid
                      still amplifies only authored Grid-active regions.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 border-t border-neutral-800 pt-3 text-[11px] text-neutral-500">
                  Select or create a region to configure its Grid amplification and lens.
                </p>
              )}
            </div>
          );
        })()}
        </div>
        <MapPlacementInspector
          map={activeMap}
          gamePackage={gamePackage}
          selection={selection}
          setSelection={setSelection}
          updateMap={(updates) => updateMap(activeMap.id, updates)}
          isOpen={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
        />
      </div>

      {/* Mobile-Friendly Bottom Tool Palette */}
      <div className="shrink-0 bg-neutral-900 border-t border-neutral-800 p-2 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-4 flex justify-between items-center z-10 overflow-x-auto custom-scrollbar">
        <div className="flex gap-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setCurrentTool(tool.id)}
              className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTool === tool.id
                  ? "bg-neutral-100 text-neutral-900 shadow-sm"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              }`}
            >
              {tool.icon}
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
        {(currentTool === "object" || currentTool === "tile") &&
          (() => {
            const filteredOptions = gamePackage.object_library.filter((o) => {
              if (currentTool === "tile") return o.tags?.includes("tile");
              return !o.tags?.includes("tile");
            });
            return (
              <select
                className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white ml-4 flex-shrink-0"
                value={placementObjectId || ""}
                onChange={(e) => setPlacementObjectId(e.target.value)}
              >
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.display_name || o.id}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    No available items
                  </option>
                )}
              </select>
            );
          })()}
        {currentTool === "interact" && (
          <div className="flex items-center gap-3 ml-4">
            <select
              className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white flex-shrink-0"
              value={assignDialogueId || ""}
              onChange={(e) => setAssignDialogueId(e.target.value)}
            >
              {gamePackage.dialogue.length > 0 ? (
                gamePackage.dialogue.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.display_name || d.id}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No dialogues available
                </option>
              )}
            </select>
            <span className="text-xs text-neutral-400 hidden sm:inline">
              Click a placed object to assign dialogue.
            </span>
          </div>
        )}
        {currentTool === "enemy" && (
          <div className="flex items-center gap-3 ml-4">
            <select
              className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white flex-shrink-0"
              value={placementEntityId || ""}
              onChange={(e) => setPlacementEntityId(e.target.value)}
            >
              {gamePackage.entities.length > 0 ? (
                gamePackage.entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.display_name || e.id}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No entities available
                </option>
              )}
            </select>
            <span className="text-xs text-neutral-400 hidden sm:inline">
              Click a floor tile to place enemy.
            </span>
          </div>
        )}
        {currentTool === "trigger" && (
          <div className="flex items-center gap-3 ml-4">
            <select
              className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white flex-shrink-0"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as any)}
            >
              <option value="step">Step On</option>
              <option value="interact">Interact</option>
              <option value="on_load">On Load</option>
            </select>
            <select
              className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white flex-shrink-0"
              value={triggerCutsceneId || ""}
              onChange={(e) => setTriggerCutsceneId(e.target.value)}
            >
              {gamePackage.cutscenes.length > 0 ? (
                gamePackage.cutscenes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.id}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No cutscenes available
                </option>
              )}
            </select>
            <span className="text-xs text-neutral-400 hidden sm:inline">
              Click a cell to toggle trigger. On-load creates a map-level trigger.
            </span>
          </div>
        )}
        {currentTool === "stamp" && (
          <div className="flex items-center gap-3 ml-4">
            <select
              className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white flex-shrink-0"
              value={placementPresetIdx}
              onChange={(e) => setPlacementPresetIdx(Number(e.target.value))}
            >
              {STAMP_PRESETS.map((p, i) => (
                <option key={p.presetName} value={i}>
                  {p.presetName}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-400 hidden sm:inline">
              Click to drop. Use Top-down view for accurate placement.
            </span>
          </div>
        )}
        {currentTool === "region" && (
          <div className="flex items-center gap-3 ml-4">
            <span className="text-xs text-neutral-400 hidden sm:inline">
              Paint the region selected in the Grid panel onto cells. Configure its amplification there.
            </span>
          </div>
        )}
        {/* Brush size — visible only for cell-modifying tools. */}
        {(currentTool === "walkable" ||
          currentTool === "blocked" ||
          currentTool === "height_up" ||
          currentTool === "height_down" ||
          currentTool === "tile" ||
          currentTool === "region") && (
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <label className="text-xs text-neutral-400">Brush</label>
            <select
              className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-2 outline-none text-white"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            >
              <option value={1}>1×1</option>
              <option value={3}>3×3</option>
              <option value={5}>5×5</option>
              <option value={7}>7×7</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function MapPlacementInspector({
  map,
  gamePackage,
  selection,
  setSelection,
  updateMap,
  isOpen,
  onClose,
}: {
  map: MapData;
  gamePackage: any;
  selection: InspectorSelection;
  setSelection: (selection: InspectorSelection) => void;
  updateMap: (updates: Partial<MapData>) => void;
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const defaultCell = (map.spawns[0]?.cell || [0, 0]) as [number, number];
  const targetMap = gamePackage.maps.find((candidate: MapData) => candidate.id !== map.id) || gamePackage.maps[0] || map;

  const replaceInArray = <T,>(key: keyof MapData, index: number, next: T) => {
    const current = ([...(((map as any)[key] || []) as T[])] as T[]);
    current[index] = next;
    updateMap({ [key]: current } as Partial<MapData>);
  };

  const removeFromArray = (key: keyof MapData, index: number) => {
    const current = [...(((map as any)[key] || []) as any[])];
    current.splice(index, 1);
    updateMap({ [key]: current } as Partial<MapData>);
    setSelection(null);
  };

  const addEntity = () => {
    const entity_id = gamePackage.entities[0]?.id;
    if (!entity_id) return;
    const entity_placements = [
      ...(map.entity_placements || []),
      { entity_id, cell: defaultCell } as EntityPlacementData,
    ];
    updateMap({ entity_placements });
    setSelection({ kind: "entity", index: entity_placements.length - 1 });
  };

  const addTrigger = () => {
    const cutscene_id = gamePackage.cutscenes[0]?.id;
    if (!cutscene_id) return;
    const triggers = [
      ...(map.triggers || []),
      {
        id: `trig_${Date.now()}`,
        cell: defaultCell,
        type: "step",
        cutscene_id,
        conditions: [],
        once: true,
      } as TriggerData,
    ];
    updateMap({ triggers });
    setSelection({ kind: "trigger", index: triggers.length - 1 });
  };

  const addExit = () => {
    const exits = [
      ...(map.exits || []),
      {
        id: `exit_${Date.now()}`,
        cell: defaultCell,
        target_map_id: targetMap.id,
        target_spawn_id: targetMap.spawns?.[0]?.id,
        facing: [0, 1],
      } as MapExitData,
    ];
    updateMap({ exits });
    setSelection({ kind: "exit", index: exits.length - 1 });
  };

  const addItem = () => {
    const item_id = gamePackage.items?.[0]?.id;
    if (!item_id) return;
    const item_placements = [
      ...(map.item_placements || []),
      { id: `witem_${Date.now()}`, item_id, cell: defaultCell, count: 1 } as WorldItemPlacementData,
    ];
    updateMap({ item_placements });
    setSelection({ kind: "item", index: item_placements.length - 1 });
  };

  const addContainer = () => {
    const object_id =
      gamePackage.object_library.find((object: any) => !object.tags?.includes("tile"))?.id ||
      gamePackage.object_library[0]?.id;
    if (!object_id) return;
    const container_placements = [
      ...(map.container_placements || []),
      {
        id: `cont_${Date.now()}`,
        object_id,
        cell: defaultCell,
        facing: [0, 1],
        display_name: "Container",
        locked: false,
        consume_key: false,
        items: [],
      } as ContainerPlacementData,
    ];
    updateMap({ container_placements });
    setSelection({ kind: "container", index: container_placements.length - 1 });
  };

  const addGenerationSocket = () => {
    const existing = new Set((map.generation_sockets || []).map((entry) => entry.id));
    let suffix = (map.generation_sockets?.length || 0) + 1;
    const prefix = map.generation
      ? `${generatedIdNamespace(map.id)}:generation_socket:author_`
      : `generation_socket_author_`;
    let id = `${prefix}${suffix}`;
    while (existing.has(id)) {
      suffix += 1;
      id = `${prefix}${suffix}`;
    }
    const generation_sockets = [
      ...(map.generation_sockets || []),
      {
        id,
        kind: "landmark",
        cell: defaultCell,
        label: "Authoring opportunity",
        required: false,
        tags: [],
      } as MapGenerationSocketData,
    ];
    updateMap({ generation_sockets });
    setSelection({ kind: "generation_socket", index: generation_sockets.length - 1 });
  };

  const selectedData = selection ? ((map as any)[selection.kind === "entity"
    ? "entity_placements"
    : selection.kind === "trigger"
      ? "triggers"
      : selection.kind === "exit"
        ? "exits"
        : selection.kind === "item"
          ? "item_placements"
          : selection.kind === "container"
            ? "container_placements"
            : "generation_sockets"] || [])[selection.index] : null;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="sm:hidden absolute inset-0 bg-black/50 z-20"
          onClick={onClose}
        />
      )}
      <aside className={`
        fixed bottom-0 left-0 right-0 max-h-[65vh] border-t border-neutral-800 bg-neutral-950 overflow-y-auto shadow-2xl z-30 transition-transform duration-300
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        sm:static sm:max-h-none sm:h-full sm:w-80 sm:shrink-0 sm:border-t-0 sm:border-l sm:border-neutral-800 sm:bg-neutral-950/95 sm:backdrop-blur sm:shadow-none sm:translate-y-0 sm:z-0
        ${isOpen ? 'sm:block' : 'sm:hidden'}
      `}>
      <div className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950 p-3">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full bg-neutral-600" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Map Inspector</h3>
            <p className="text-[11px] text-neutral-500">{map.display_name || map.id}</p>
          </div>
          {/* Close button — mobile only */}
          <button
            className="sm:hidden p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniButton onClick={addEntity} disabled={gamePackage.entities.length === 0}>Entity</MiniButton>
          <MiniButton onClick={addTrigger} disabled={gamePackage.cutscenes.length === 0}>Trigger</MiniButton>
          <MiniButton onClick={addExit} disabled={gamePackage.maps.length === 0}>Exit</MiniButton>
          <MiniButton onClick={addItem} disabled={!gamePackage.items?.length}>Item</MiniButton>
          <MiniButton onClick={addContainer} disabled={!gamePackage.object_library?.length}>Container</MiniButton>
          <MiniButton onClick={addGenerationSocket}>Gen Socket</MiniButton>
        </div>
      </div>

      <div className="p-3 space-y-4">
        <InspectorList
          title="Entities"
          count={map.entity_placements?.length || 0}
          selected={selection}
          kind="entity"
          getLabel={(index) => {
            const placement = map.entity_placements[index];
            const entity = gamePackage.entities.find((candidate: any) => candidate.id === placement.entity_id);
            return `${entity?.display_name || placement.entity_id} @ ${placement.cell.join(",")}`;
          }}
          setSelection={setSelection}
        />
        <InspectorList
          title="Triggers"
          count={map.triggers?.length || 0}
          selected={selection}
          kind="trigger"
          getLabel={(index) => {
            const trigger = map.triggers[index];
            return `${trigger.type} -> ${trigger.cutscene_id}`;
          }}
          setSelection={setSelection}
        />
        <InspectorList
          title="Exits"
          count={map.exits?.length || 0}
          selected={selection}
          kind="exit"
          getLabel={(index) => {
            const exit = map.exits[index];
            return `${exit.cell.join(",")} -> ${exit.target_map_id}`;
          }}
          setSelection={setSelection}
        />
        <InspectorList
          title="World Items"
          count={map.item_placements?.length || 0}
          selected={selection}
          kind="item"
          getLabel={(index) => {
            const item = map.item_placements[index];
            return `${item.item_id} x${item.count}`;
          }}
          setSelection={setSelection}
        />
        <InspectorList
          title="Containers"
          count={map.container_placements?.length || 0}
          selected={selection}
          kind="container"
          getLabel={(index) => {
            const container = map.container_placements[index];
            return container.display_name || container.id;
          }}
          setSelection={setSelection}
        />
        <InspectorList
          title="Generation Sockets"
          count={map.generation_sockets?.length || 0}
          selected={selection}
          kind="generation_socket"
          getLabel={(index) => {
            const socket = map.generation_sockets![index];
            return `${socket.kind} @ ${socket.cell.join(",")}`;
          }}
          setSelection={setSelection}
        />

        <div className="border-t border-neutral-800 pt-4">
          {!selection || !selectedData ? (
            <p className="rounded border border-dashed border-neutral-800 p-3 text-xs text-neutral-500">
              Select a placement above or add a new one.
            </p>
          ) : selection.kind === "entity" ? (
            <EntityPlacementEditor
              map={map}
              gamePackage={gamePackage}
              placement={selectedData as EntityPlacementData}
              onChange={(next) => replaceInArray("entity_placements", selection.index, next)}
              onDelete={() => removeFromArray("entity_placements", selection.index)}
            />
          ) : selection.kind === "trigger" ? (
            <TriggerEditor
              gamePackage={gamePackage}
              trigger={selectedData as TriggerData}
              onChange={(next) => replaceInArray("triggers", selection.index, next)}
              onDelete={() => removeFromArray("triggers", selection.index)}
            />
          ) : selection.kind === "exit" ? (
            <ExitEditor
              gamePackage={gamePackage}
              exit={selectedData as MapExitData}
              onChange={(next) => replaceInArray("exits", selection.index, next)}
              onDelete={() => removeFromArray("exits", selection.index)}
            />
          ) : selection.kind === "item" ? (
            <WorldItemEditor
              gamePackage={gamePackage}
              item={selectedData as WorldItemPlacementData}
              onChange={(next) => replaceInArray("item_placements", selection.index, next)}
              onDelete={() => removeFromArray("item_placements", selection.index)}
            />
          ) : selection.kind === "generation_socket" ? (
            <GenerationSocketEditor
              socket={selectedData as MapGenerationSocketData}
              onChange={(next) => replaceInArray("generation_sockets", selection.index, next)}
              onDelete={() => removeFromArray("generation_sockets", selection.index)}
            />
          ) : (
            <ContainerEditor
              gamePackage={gamePackage}
              container={selectedData as ContainerPlacementData}
              onChange={(next) => replaceInArray("container_placements", selection.index, next)}
              onDelete={() => removeFromArray("container_placements", selection.index)}
            />
          )}
        </div>
      </div>
      </aside>
    </>
  );
}

function InspectorList({
  title,
  count,
  kind,
  selected,
  getLabel,
  setSelection,
}: {
  title: string;
  count: number;
  kind: NonNullable<InspectorSelection>["kind"];
  selected: InspectorSelection;
  getLabel: (index: number) => string;
  setSelection: (selection: InspectorSelection) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</h4>
        <span className="text-[10px] text-neutral-600">{count}</span>
      </div>
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          onClick={() => setSelection({ kind, index } as InspectorSelection)}
          className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
            selected?.kind === kind && selected.index === index
              ? "bg-neutral-800 text-white"
              : "bg-neutral-900/70 text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-200"
          }`}
        >
          <span className="font-mono text-neutral-600 mr-2">{index + 1}</span>
          {getLabel(index)}
        </button>
      ))}
      {count === 0 && <p className="text-xs text-neutral-700">None.</p>}
    </div>
  );
}

function GenerationSocketEditor({
  socket,
  onChange,
  onDelete,
}: {
  socket: MapGenerationSocketData;
  onChange: (socket: MapGenerationSocketData) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <InspectorHeader title="Generation Socket" onDelete={onDelete} />
      <InspectorText label="Stable ID" value={socket.id} onChange={(id) => onChange({ ...socket, id })} />
      <InspectorSelect
        label="Opportunity"
        value={socket.kind}
        onChange={(kind) => onChange({ ...socket, kind: kind as MapGenerationSocketData["kind"] })}
      >
        <option value="entrance">Entrance</option>
        <option value="culmination">Culmination</option>
        <option value="landmark">Landmark</option>
        <option value="artifact_origin">Artifact origin</option>
        <option value="extraction">Extraction</option>
        <option value="encounter">Encounter</option>
        <option value="light_control">Light control</option>
        <option value="darkness">Darkness</option>
      </InspectorSelect>
      <CellInputs cell={asCell(socket.cell)} onChange={(cell) => onChange({ ...socket, cell })} />
      <InspectorText
        label="Label"
        value={socket.label || ""}
        onChange={(label) => onChange({ ...socket, label: label.trim() || undefined })}
      />
      <InspectorText
        label="Graph node"
        value={socket.node_id || ""}
        onChange={(node_id) => onChange({ ...socket, node_id: node_id.trim() || undefined })}
      />
      <InspectorText
        label="Tags (comma separated)"
        value={(socket.tags || []).join(", ")}
        onChange={(value) => onChange({
          ...socket,
          tags: [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))],
        })}
      />
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input
          type="checkbox"
          checked={socket.required}
          onChange={(event) => onChange({ ...socket, required: event.target.checked })}
        />
        Required opportunity
      </label>
      {socket.source_opportunity_id && (
        <p className="rounded border border-neutral-800 bg-neutral-900/70 p-2 font-mono text-[10px] text-neutral-500">
          Draft source: {socket.source_opportunity_id}
        </p>
      )}
    </div>
  );
}

const asCell = (cell: unknown, fallback: [number, number] = [0, 0]): [number, number] => {
  const value = Array.isArray(cell) ? cell : fallback;
  return [
    Number(value[0] ?? fallback[0]),
    Number(value[1] ?? fallback[1]),
  ];
};

function EntityPlacementEditor({
  map,
  gamePackage,
  placement,
  onChange,
  onDelete,
}: {
  map: MapData;
  gamePackage: any;
  placement: EntityPlacementData;
  onChange: (placement: EntityPlacementData) => void;
  onDelete: () => void;
}) {
  const updateSchedule = (index: number, updates: any) => {
    const schedule = [...(placement.schedule || [])];
    schedule[index] = { ...schedule[index], ...updates };
    schedule.sort((a, b) => a.hour - b.hour);
    onChange({ ...placement, schedule });
  };

  return (
    <div className="space-y-3">
      <InspectorHeader title="Entity Placement" onDelete={onDelete} />
      <InspectorSelect label="Entity" value={placement.entity_id} onChange={(entity_id) => onChange({ ...placement, entity_id })}>
        {gamePackage.entities.map((entity: any) => (
          <option key={entity.id} value={entity.id}>{entity.display_name || entity.id}</option>
        ))}
      </InspectorSelect>
      <CellInputs cell={asCell(placement.cell)} onChange={(cell) => onChange({ ...placement, cell })} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold text-neutral-300">NPC Schedule</h5>
          <button
            onClick={() => {
              const schedule = [...(placement.schedule || []), { hour: 8, cell: asCell(placement.cell) }];
              schedule.sort((a, b) => a.hour - b.hour);
              onChange({ ...placement, schedule });
            }}
            className="text-xs text-emerald-300 hover:text-emerald-200"
          >
            + Add
          </button>
        </div>
        {(placement.schedule || []).map((entry, index) => {
          const reachable = isReachable(map, asCell(placement.cell), asCell(entry.cell), gamePackage);
          return (
            <div key={index} className="rounded border border-neutral-800 bg-neutral-900/70 p-2 space-y-2">
              <div className="flex gap-2 items-end">
                <InspectorNumber label="Hour" value={entry.hour} min={0} max={23} onChange={(hour) => updateSchedule(index, { hour })} />
                <CellInputs cell={asCell(entry.cell)} onChange={(cell) => updateSchedule(index, { cell })} compact />
                <button
                  onClick={() => onChange({ ...placement, schedule: (placement.schedule || []).filter((_, i) => i !== index) })}
                  className="mb-1 rounded p-1 text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {!reachable && (
                <div className="flex items-center gap-2 text-[11px] text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Target is not reachable from this placement.
                </div>
              )}
            </div>
          );
        })}
        {(placement.schedule || []).length === 0 && (
          <p className="text-xs text-neutral-600">No schedule. Friendly NPCs stay near their placement unless moved by cutscene.</p>
        )}
      </div>

    </div>
  );
}

function TriggerEditor({
  gamePackage,
  trigger,
  onChange,
  onDelete,
}: {
  gamePackage: any;
  trigger: TriggerData;
  onChange: (trigger: TriggerData) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <InspectorHeader title="Trigger" onDelete={onDelete} />
      <InspectorText label="ID" value={trigger.id} onChange={(id) => onChange({ ...trigger, id })} />
      <InspectorSelect label="Type" value={trigger.type} onChange={(type) => onChange({ ...trigger, type: type as TriggerData["type"], cell: type === "on_load" || type === "switch_change" ? undefined : trigger.cell || [0, 0] })}>
        <option value="step">Step</option>
        <option value="interact">Interact</option>
        <option value="on_load">On Load</option>
        <option value="switch_change">Switch Change</option>
      </InspectorSelect>
      {trigger.type !== "on_load" && trigger.type !== "switch_change" && (
        <CellInputs cell={(trigger.cell || [0, 0]) as [number, number]} onChange={(cell) => onChange({ ...trigger, cell })} />
      )}
      <InspectorSelect label="Cutscene" value={trigger.cutscene_id} onChange={(cutscene_id) => onChange({ ...trigger, cutscene_id })}>
        {gamePackage.cutscenes.map((cutscene: any) => (
          <option key={cutscene.id} value={cutscene.id}>{cutscene.display_name || cutscene.id}</option>
        ))}
      </InspectorSelect>
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" checked={trigger.once} onChange={(event) => onChange({ ...trigger, once: event.target.checked })} />
        Run once
      </label>
      <ConditionEditor compact label="Trigger Condition" value={trigger.condition} onChange={(condition) => onChange({ ...trigger, condition })} />
    </div>
  );
}

function ExitEditor({
  gamePackage,
  exit,
  onChange,
  onDelete,
}: {
  gamePackage: any;
  exit: MapExitData;
  onChange: (exit: MapExitData) => void;
  onDelete: () => void;
}) {
  const targetMap = gamePackage.maps.find((map: MapData) => map.id === exit.target_map_id);
  return (
    <div className="space-y-3">
      <InspectorHeader title="Map Exit" onDelete={onDelete} />
      <InspectorText label="ID" value={exit.id || ""} onChange={(id) => onChange({ ...exit, id: id || undefined })} />
      <CellInputs cell={asCell(exit.cell)} onChange={(cell) => onChange({ ...exit, cell })} />
      <InspectorSelect label="Target Map" value={exit.target_map_id} onChange={(target_map_id) => onChange({ ...exit, target_map_id, target_spawn_id: gamePackage.maps.find((map: MapData) => map.id === target_map_id)?.spawns?.[0]?.id })}>
        {gamePackage.maps.map((map: MapData) => (
          <option key={map.id} value={map.id}>{map.display_name || map.id}</option>
        ))}
      </InspectorSelect>
      <InspectorSelect label="Target Spawn" value={exit.target_spawn_id || ""} onChange={(target_spawn_id) => onChange({ ...exit, target_spawn_id: target_spawn_id || undefined })}>
        <option value="">First spawn</option>
        {targetMap?.spawns.map((spawn) => (
          <option key={spawn.id} value={spawn.id}>{spawn.id}</option>
        ))}
      </InspectorSelect>
      <FacingInputs facing={(exit.facing || [0, 1]) as [number, number]} onChange={(facing) => onChange({ ...exit, facing })} />
      <ConditionEditor compact label="Exit Condition" value={exit.condition} onChange={(condition) => onChange({ ...exit, condition })} />
    </div>
  );
}

function WorldItemEditor({
  gamePackage,
  item,
  onChange,
  onDelete,
}: {
  gamePackage: any;
  item: WorldItemPlacementData;
  onChange: (item: WorldItemPlacementData) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <InspectorHeader title="World Item" onDelete={onDelete} />
      <InspectorText label="ID" value={item.id} onChange={(id) => onChange({ ...item, id })} />
      <InspectorSelect label="Item" value={item.item_id} onChange={(item_id) => onChange({ ...item, item_id })}>
        {gamePackage.items?.map((candidate: any) => (
          <option key={candidate.id} value={candidate.id}>{candidate.display_name || candidate.id}</option>
        ))}
      </InspectorSelect>
      <CellInputs cell={asCell(item.cell)} onChange={(cell) => onChange({ ...item, cell })} />
      <InspectorNumber label="Count" value={item.count || 1} min={1} onChange={(count) => onChange({ ...item, count })} />
    </div>
  );
}

function ContainerEditor({
  gamePackage,
  container,
  onChange,
  onDelete,
}: {
  gamePackage: any;
  container: ContainerPlacementData;
  onChange: (container: ContainerPlacementData) => void;
  onDelete: () => void;
}) {
  const updateItem = (index: number, updates: any) => {
    const items = [...(container.items || [])];
    items[index] = { ...items[index], ...updates };
    onChange({ ...container, items });
  };

  return (
    <div className="space-y-3">
      <InspectorHeader title="Container" onDelete={onDelete} />
      <InspectorText label="ID" value={container.id} onChange={(id) => onChange({ ...container, id })} />
      <InspectorText label="Display Name" value={container.display_name || ""} onChange={(display_name) => onChange({ ...container, display_name: display_name || undefined })} />
      <InspectorSelect label="Object" value={container.object_id} onChange={(object_id) => onChange({ ...container, object_id })}>
        {gamePackage.object_library.map((object: any) => (
          <option key={object.id} value={object.id}>{object.display_name || object.id}</option>
        ))}
      </InspectorSelect>
      <CellInputs cell={asCell(container.cell)} onChange={(cell) => onChange({ ...container, cell })} />
      <FacingInputs facing={(container.facing || [0, 1]) as [number, number]} onChange={(facing) => onChange({ ...container, facing })} />
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" checked={container.locked || false} onChange={(event) => onChange({ ...container, locked: event.target.checked })} />
        Locked
      </label>
      <InspectorSelect label="Key Item" value={container.key_item_id || ""} onChange={(key_item_id) => onChange({ ...container, key_item_id: key_item_id || undefined })}>
        <option value="">No key</option>
        {gamePackage.items?.map((item: any) => (
          <option key={item.id} value={item.id}>{item.display_name || item.id}</option>
        ))}
      </InspectorSelect>
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" checked={container.consume_key || false} onChange={(event) => onChange({ ...container, consume_key: event.target.checked })} />
        Consume key on unlock
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold text-neutral-300">Contents</h5>
          <button
            onClick={() => onChange({ ...container, items: [...(container.items || []), { item_id: gamePackage.items?.[0]?.id || "", count: 1 }] })}
            className="text-xs text-emerald-300 hover:text-emerald-200"
          >
            + Add
          </button>
        </div>
        {(container.items || []).map((entry, index) => (
          <div key={index} className="flex gap-2 items-end">
            <InspectorSelect label="Item" value={entry.item_id} onChange={(item_id) => updateItem(index, { item_id })}>
              {gamePackage.items?.map((item: any) => (
                <option key={item.id} value={item.id}>{item.display_name || item.id}</option>
              ))}
            </InspectorSelect>
            <InspectorNumber label="Count" value={entry.count || 1} min={1} onChange={(count) => updateItem(index, { count })} />
            <button
              onClick={() => onChange({ ...container, items: (container.items || []).filter((_, i) => i !== index) })}
              className="mb-1 rounded p-1 text-rose-400 hover:bg-rose-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
function isReachable(map: MapData, from: [number, number], to: [number, number], gamePackage: any) {
  const key = (x: number, z: number) => `${x}_${z}`;
  const walkable = new Set<string>();
  map.cells.forEach((cell) => {
    if (!cell.walkable) return;
    if (cell.object_id) {
      const object = gamePackage.object_library.find((candidate: any) => candidate.id === cell.object_id);
      if (object?.collision?.profile !== "none") return;
    }
    walkable.add(key(cell.x, cell.z));
  });
  map.custom_object_placements.forEach((placement) => {
    const object = gamePackage.object_library.find((candidate: any) => candidate.id === placement.object_id);
    if (!placementHasCollision(placement, object)) return;
    const cells = getMacroPlacementFootprint(placement, object);
    cells.forEach(([x, z]: [number, number]) => walkable.delete(key(x, z)));
  });
  map.container_placements?.forEach((container) => walkable.delete(key(container.cell[0], container.cell[1])));

  const start = key(from[0], from[1]);
  const goal = key(to[0], to[1]);
  if (!walkable.has(start) || !walkable.has(goal)) return false;
  const visited = new Set<string>([start]);
  const queue: [number, number][] = [from];
  while (queue.length) {
    const [x, z] = queue.shift()!;
    if (x === to[0] && z === to[1]) return true;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as [number, number][]) {
      const nextKey = key(nx, nz);
      if (!walkable.has(nextKey) || visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push([nx, nz]);
    }
  }
  return false;
}

function InspectorHeader({ title, onDelete }: { title: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="text-sm font-semibold text-neutral-100">{title}</h4>
      <button onClick={onDelete} className="rounded p-1 text-rose-400 hover:bg-rose-500/10">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function MiniButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function InspectorText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white" />
    </label>
  );
}

function InspectorNumber({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white"
      />
    </label>
  );
}

function InspectorSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 flex-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-neutral-800 bg-black px-2 py-1.5 text-xs text-white">
        {children}
      </select>
    </label>
  );
}

function CellInputs({ cell, onChange, compact = false }: { cell: [number, number]; onChange: (cell: [number, number]) => void; compact?: boolean }) {
  return (
    <div className={`grid ${compact ? "grid-cols-2 flex-1" : "grid-cols-2"} gap-2`}>
      <InspectorNumber label="X" value={cell[0]} onChange={(x) => onChange([x, cell[1]])} />
      <InspectorNumber label="Z" value={cell[1]} onChange={(z) => onChange([cell[0], z])} />
    </div>
  );
}

function FacingInputs({ facing, onChange }: { facing: [number, number]; onChange: (facing: [number, number]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <InspectorNumber label="Facing X" value={facing[0]} onChange={(x) => onChange([x, facing[1]])} />
      <InspectorNumber label="Facing Z" value={facing[1]} onChange={(z) => onChange([facing[0], z])} />
    </div>
  );
}
