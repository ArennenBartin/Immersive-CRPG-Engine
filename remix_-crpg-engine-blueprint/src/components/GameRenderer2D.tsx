/**
 * @deprecated Historical flat renderer retained only as a source reference.
 * Active Studio and Play paths use GameRenderer3D. Production modules must not
 * import this file; `npm run audit:legacy-imports` enforces that boundary.
 */
// ── GameRenderer2D ───────────────────────────────────────────────────────────
// Flat top-down (early-Ultima-style) 2D renderer. Drop-in replacement for the
// 3D <GameRenderer>: it consumes the same grid data + props and draws to a plain
// <canvas> instead of a react-three-fiber scene. All gameplay logic stays in
// PlayMode/MapEditor; this only paints the world and forwards pointer → cell.

import React, { useEffect, useMemo, useRef } from "react";
import {
  CellData,
  MapData,
  ObjectPlacementData,
  SpriteData,
} from "../schema/game";
import type {
  ActorPhysicalStateRecord,
  MapDelta,
  SimulationConditionRecord,
  SimulationEnvironmentFieldRecord,
  SimulationSurfaceLayerRecord,
} from "../schema/save";
import type {
  EntityBehaviorIntentRecord,
  ImmersiveCombatIntentRecord,
  ImmersiveCombatOverwatchZone,
  ImmersivePerceptionAlertRecord,
} from "../engine-core";
import { useEngineStore } from "../store/engineStore";
import {
  useFxStore,
  POPUP_LIFETIME_MS,
  HIT_FLASH_MS,
} from "../store/fxStore";
import { entityPlacementStateKey } from "../utils/entityState";
import { THREAT_RADIUS } from "../utils/combat";
import { isDoorPlacementOpen } from "../utils/doorPlacement";
import { applyPlacementDeltas } from "../utils/objectFootprint";
import { createFogLineOfSightBlockers, fogCellKey, hasFogLineOfSight } from "../utils/fogOfWar";
import { fineCoordKey } from "../engine-core/gridCoordinates";
import { isObliqueTerrainSpriteId } from "../data/obliqueTerrainAssets";
import { isObliqueStructureSpriteId } from "../data/obliqueStructureAssets";
import { isObliqueBarrierSpriteId } from "../data/obliqueBarrierAssets";
import { isObliquePropSpriteId } from "../data/obliquePropAssets";
import {
  playerStateRef,
  getSpriteCanvas,
  getSpriteRenderable,
  drawSpriteRenderable,
  spriteRenderableSize,
  isAnimatedSprite,
  type SpriteRenderable,
  getEmojiCanvas,
  surfaceTint,
  colorForCell,
  colorForObject,
  buildSpriteIndex,
  buildObjectIndex,
  objectTileSprite,
  resolveDirectionalSpriteId,
} from "../utils/tileRendering";

export interface GameRenderer2DProps {
  map: MapData;
  playerPos?: [number, number];
  playerFacing?: [number, number];
  playerSpriteId?: string;
  worldItems?: { id: string; cell: [number, number]; icon: string }[];
  extraPlacements?: ObjectPlacementData[];
  onCellClick?: (x: number, z: number) => void;
  onCellHover?: (x: number, z: number) => void;
  onPointerOut?: () => void;
  targetPattern?: { x: number; z: number }[];
  rangeCells?: { x: number; z: number }[];
  hoveredCell?: [number, number] | null;
  editLayerY?: number;
  entityStates?: Record<string, any>;
  actorPhysicalStates?: Record<string, ActorPhysicalStateRecord>;
  partyFollowers?: { entity_id: string; cell: [number, number] }[];
  partyMemberIds?: string[];
  mapDelta?: MapDelta;
  inCombat?: boolean;
  activeTurnKey?: string | null;
  combatOverwatchZones?: ImmersiveCombatOverwatchZone[];
  combatIntents?: ImmersiveCombatIntentRecord[];
  perceptionAlerts?: ImmersivePerceptionAlertRecord[];
  showBehaviorIntents?: boolean;
  worldDeniedCells?: { x: number; z: number; kind?: string }[];
  showGrid?: boolean;
  renderCenter?: [number, number];
  renderRadius?: number;
  // Editor-only overlays.
  lintProblems?: { cell?: [number, number] | null; severity: string }[];
  brushSize?: number;
  // Incrementing this re-fits the editor view to the whole map.
  fitSignal?: number;
  // Tactical fog of war: hide unseen cells, dim previously-explored ones.
  fogOfWar?: boolean;
  fogRadius?: number;
  // Save-backed fog: seed explored cells from the save (so fog survives
  // reloads) and report newly-seen cells back so they can be persisted.
  initialExplored?: Record<string, string[]>;
  onExplore?: (mapId: string, cellKeys: string[]) => void;
  // Phase E fork switch: macro keeps fog memory at authored-tile scale while
  // sampling fine blockers; fine stores and paints exact fine-cell visibility.
  fogResolution?: "macro" | "fine";
  // Grid-subdivision ratio of the supplied map: 1 for authored macro maps
  // (editor), FINE_PER_MACRO for the expanded fine play world. When > 1 the
  // base art draws per MACRO block (ratio² fine cells), actors render at
  // macro size, and fog/LOS runs on the macro grid sampling fine blockers
  // (Fork B of the rebuild spec §7) — swap-able by changing this number.
  fineRatio?: number;
  renderDpr?: number;
}

const CAMERA_FOCUS_SPEED = 7;
const CAMERA_FOLLOW_SPEED = 10;
const ACTOR_GRID_SETTLE_SECONDS = 0.055;
const GRID_TELEPORT_DISTANCE_MACROS = 4;
const PLAY_VISIBLE_TILES = 13; // tiles across the shorter screen dimension in play
const TARGET_COLOR = "#D08770";
const RANGE_COLOR = "#88C0D0";

const DYNAMIC_SURFACE_STYLE: Record<string, { fill: string; stroke: string; label?: string }> = {
  water: { fill: "rgba(56, 189, 248, 0.34)", stroke: "rgba(186, 230, 253, 0.78)" },
  doused: { fill: "rgba(125, 211, 252, 0.26)", stroke: "rgba(224, 242, 254, 0.62)" },
  foam: { fill: "rgba(226, 252, 255, 0.42)", stroke: "rgba(255, 255, 255, 0.86)" },
  ice: { fill: "rgba(191, 219, 254, 0.42)", stroke: "rgba(240, 249, 255, 0.9)" },
  frozen: { fill: "rgba(191, 219, 254, 0.34)", stroke: "rgba(240, 249, 255, 0.72)" },
  scorched: { fill: "rgba(28, 25, 23, 0.5)", stroke: "rgba(68, 64, 60, 0.7)" },
  oil: { fill: "rgba(38, 38, 38, 0.42)", stroke: "rgba(120, 113, 108, 0.7)" },
  honey: { fill: "rgba(180, 83, 9, 0.34)", stroke: "rgba(253, 186, 116, 0.7)" },
  corrosion: { fill: "rgba(132, 204, 22, 0.32)", stroke: "rgba(217, 249, 157, 0.7)" },
  climbable_support: { fill: "rgba(245, 158, 11, 0.24)", stroke: "rgba(253, 230, 138, 0.72)" },
};

const CONDITION_STYLE: Record<string, { fill: string; stroke: string }> = {
  burned: { fill: "rgba(127, 29, 29, 0.22)", stroke: "rgba(251, 146, 60, 0.72)" },
  wet: { fill: "rgba(14, 165, 233, 0.16)", stroke: "rgba(125, 211, 252, 0.65)" },
  frozen: { fill: "rgba(147, 197, 253, 0.18)", stroke: "rgba(224, 242, 254, 0.72)" },
  contaminated: { fill: "rgba(74, 222, 128, 0.16)", stroke: "rgba(190, 242, 100, 0.7)" },
  reinforced: { fill: "rgba(250, 204, 21, 0.12)", stroke: "rgba(253, 224, 71, 0.62)" },
  damaged: { fill: "rgba(168, 85, 247, 0.12)", stroke: "rgba(216, 180, 254, 0.62)" },
};

const PHYSICAL_BADGE_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  "On Fire": { fill: "rgba(127, 29, 29, 0.92)", stroke: "rgba(251, 146, 60, 0.9)", text: "#ffedd5" },
  Hot: { fill: "rgba(154, 52, 18, 0.9)", stroke: "rgba(253, 186, 116, 0.85)", text: "#fff7ed" },
  Freezing: { fill: "rgba(12, 74, 110, 0.92)", stroke: "rgba(186, 230, 253, 0.88)", text: "#e0f2fe" },
  Chilled: { fill: "rgba(30, 64, 175, 0.86)", stroke: "rgba(191, 219, 254, 0.78)", text: "#eff6ff" },
  Soaked: { fill: "rgba(7, 89, 133, 0.9)", stroke: "rgba(125, 211, 252, 0.82)", text: "#e0f2fe" },
  Damp: { fill: "rgba(8, 145, 178, 0.82)", stroke: "rgba(165, 243, 252, 0.76)", text: "#ecfeff" },
  Charged: { fill: "rgba(113, 63, 18, 0.92)", stroke: "rgba(253, 224, 71, 0.9)", text: "#fef9c3" },
  Foamed: { fill: "rgba(51, 65, 85, 0.86)", stroke: "rgba(226, 232, 240, 0.88)", text: "#f8fafc" },
  Toxic: { fill: "rgba(20, 83, 45, 0.92)", stroke: "rgba(134, 239, 172, 0.82)", text: "#dcfce7" },
};

const ALERT_BADGE_STYLE: Record<string, { fill: string; stroke: string; text: string; label: string }> = {
  suspicious: { fill: "rgba(113, 63, 18, 0.92)", stroke: "rgba(251, 191, 36, 0.9)", text: "#fef3c7", label: "?" },
  searching: { fill: "rgba(127, 29, 29, 0.92)", stroke: "rgba(251, 146, 60, 0.9)", text: "#ffedd5", label: "!" },
  combat: { fill: "rgba(136, 19, 55, 0.94)", stroke: "rgba(251, 113, 133, 0.92)", text: "#ffe4e6", label: "!!" },
};

const INTENT_TIER_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  incapacitated: { fill: "rgba(38, 38, 38, 0.94)", stroke: "rgba(163, 163, 163, 0.88)", text: "#f5f5f5" },
  survival: { fill: "rgba(127, 29, 29, 0.94)", stroke: "rgba(251, 146, 60, 0.92)", text: "#ffedd5" },
  emotional: { fill: "rgba(88, 28, 135, 0.94)", stroke: "rgba(216, 180, 254, 0.9)", text: "#faf5ff" },
  reactive: { fill: "rgba(120, 53, 15, 0.94)", stroke: "rgba(253, 224, 71, 0.9)", text: "#fefce8" },
  scheduled: { fill: "rgba(8, 47, 73, 0.94)", stroke: "rgba(125, 211, 252, 0.9)", text: "#f0f9ff" },
  idle: { fill: "rgba(23, 37, 84, 0.92)", stroke: "rgba(165, 180, 252, 0.82)", text: "#eef2ff" },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const isVisibleWorldSurfaceLayer = (layer: SimulationSurfaceLayerRecord) =>
  layer.source !== "trace";

const primaryPhysicalLabel = (state: ActorPhysicalStateRecord | undefined): string | undefined => {
  if (!state) return undefined;
  if (state.labels.length > 0) return state.labels[0];
  if (state.heat >= 0.65) return "On Fire";
  if (state.chill >= 0.65) return "Freezing";
  if (state.wetness >= 0.55) return "Soaked";
  if (state.charge >= 0.55) return "Charged";
  if (state.coating >= 0.5) return "Foamed";
  if (state.toxicity >= 0.5) return "Toxic";
  return undefined;
};

const drawPhysicalStateBadge = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cz: number,
  tile: number,
  state: ActorPhysicalStateRecord | undefined,
) => {
  const label = primaryPhysicalLabel(state);
  if (!label) return;
  const style = PHYSICAL_BADGE_STYLE[label] || {
    fill: "rgba(15, 23, 42, 0.9)",
    stroke: "rgba(226, 232, 240, 0.7)",
    text: "#f8fafc",
  };
  const fontSize = Math.max(9, Math.min(12, tile * 0.24));
  ctx.save();
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = Math.max(tile * 0.9, Math.min(tile * 2.25, ctx.measureText(label).width + tile * 0.32));
  const height = fontSize + Math.max(5, tile * 0.12);
  const x = cx - width / 2;
  const y = cz - tile * 1.06;
  ctx.fillStyle = style.fill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(1, tile * 0.025);
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = style.text;
  ctx.fillText(label, cx, y + height / 2 + 0.5);
  ctx.restore();
};

const drawAlertBadge = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cz: number,
  tile: number,
  alert: ImmersivePerceptionAlertRecord | undefined,
) => {
  if (!alert || alert.alertness === "oblivious") return;
  const style = ALERT_BADGE_STYLE[alert.alertness];
  if (!style) return;
  const radius = Math.max(6, tile * 0.18);
  const x = cx + tile * 0.3;
  const y = cz - tile * 0.86;
  ctx.save();
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(1, tile * 0.035);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `bold ${Math.max(8, Math.floor(tile * 0.22))}px ui-sans-serif, system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.text;
  ctx.fillText(style.label, x, y + 0.5);
  ctx.restore();
};

const drawBehaviorIntentBadge = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cz: number,
  tile: number,
  intent: EntityBehaviorIntentRecord | undefined,
) => {
  if (!intent) return;
  const style = INTENT_TIER_STYLE[intent.tier] || INTENT_TIER_STYLE.idle;
  const fontSize = Math.max(8, Math.min(11, tile * 0.2));
  const maxWidth = tile * 2.1;
  let label = `T${intent.tier_number} ${intent.action.replace(/_/g, " ")}`;
  ctx.save();
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, monospace`;
  while (label.length > 8 && ctx.measureText(label).width > maxWidth - tile * 0.28) {
    label = `${label.slice(0, -4)}...`;
  }
  const width = Math.min(maxWidth, Math.max(tile * 1.5, ctx.measureText(label).width + tile * 0.28));
  const height = fontSize + Math.max(5, tile * 0.1);
  const x = cx - width / 2;
  const y = cz - tile * 1.45;
  ctx.fillStyle = style.fill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(1, tile * 0.025);
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = style.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, y + height / 2 + 0.5);
  ctx.restore();
};

const alertLineColor = (alertness: ImmersivePerceptionAlertRecord["alertness"]) =>
  alertness === "combat"
    ? "rgba(248, 113, 113, 0.88)"
    : alertness === "searching"
      ? "rgba(56, 189, 248, 0.78)"
      : "rgba(125, 211, 252, 0.62)";

const combatIntentLineColor = (actionType: ImmersiveCombatIntentRecord["action_type"]) =>
  actionType === "melee_attack" || actionType === "ranged_attack"
    ? "rgba(248, 113, 113, 0.9)"
    : actionType === "advance"
      ? "rgba(251, 191, 36, 0.82)"
      : "rgba(96, 165, 250, 0.68)";

const drawCellHatch = (
  ctx: CanvasRenderingContext2D,
  px: number,
  pz: number,
  tile: number,
  color: string,
  gap = 8,
) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, pz, tile, tile);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, tile * 0.035);
  for (let offset = -tile; offset < tile * 2; offset += Math.max(4, gap)) {
    ctx.beginPath();
    ctx.moveTo(px + offset, pz + tile);
    ctx.lineTo(px + offset + tile, pz);
    ctx.stroke();
  }
  ctx.restore();
};

const drawDynamicSurfaceLayer = (
  ctx: CanvasRenderingContext2D,
  layer: SimulationSurfaceLayerRecord,
  px: number,
  pz: number,
  tile: number,
  now: number,
) => {
  const style = DYNAMIC_SURFACE_STYLE[layer.kind] || {
    fill: "rgba(203, 213, 225, 0.22)",
    stroke: "rgba(226, 232, 240, 0.55)",
  };
  const amount = clamp01(layer.amount ?? 0.5);
  const wobble = 0.5 + 0.5 * Math.sin(now / 360 + px * 0.07 + pz * 0.05);
  ctx.save();
  ctx.globalAlpha = 0.72 + amount * 0.22;
  ctx.fillStyle = style.fill;
  ctx.fillRect(px, pz, tile + 1, tile + 1);

  if (layer.kind === "foam") {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1, tile * 0.035);
    const bubbles = [
      [0.28, 0.36, 0.14],
      [0.58, 0.42, 0.18],
      [0.42, 0.66, 0.12],
      [0.72, 0.7, 0.11],
    ];
    bubbles.forEach(([bx, by, br], index) => {
      ctx.globalAlpha = 0.45 + amount * 0.35 + (index % 2) * wobble * 0.08;
      ctx.beginPath();
      ctx.arc(px + bx * tile, pz + by * tile, Math.max(2, br * tile), 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (layer.kind === "water" || layer.kind === "doused") {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1, tile * 0.025);
    for (let i = 0; i < 3; i += 1) {
      const y = pz + tile * (0.3 + i * 0.22 + wobble * 0.02);
      ctx.beginPath();
      ctx.moveTo(px + tile * 0.18, y);
      ctx.quadraticCurveTo(px + tile * 0.5, y - tile * 0.08, px + tile * 0.82, y);
      ctx.stroke();
    }
  } else if (layer.kind === "ice" || layer.kind === "frozen") {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.beginPath();
    ctx.moveTo(px + tile * 0.18, pz + tile * 0.76);
    ctx.lineTo(px + tile * 0.5, pz + tile * 0.25);
    ctx.lineTo(px + tile * 0.8, pz + tile * 0.68);
    ctx.moveTo(px + tile * 0.37, pz + tile * 0.46);
    ctx.lineTo(px + tile * 0.22, pz + tile * 0.38);
    ctx.moveTo(px + tile * 0.55, pz + tile * 0.36);
    ctx.lineTo(px + tile * 0.72, pz + tile * 0.28);
    ctx.stroke();
  } else if (layer.kind === "corrosion" || layer.kind === "climbable_support") {
    drawCellHatch(ctx, px, pz, tile, style.stroke, layer.kind === "corrosion" ? 7 : 10);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
};

const drawEnvironmentField = (
  ctx: CanvasRenderingContext2D,
  field: SimulationEnvironmentFieldRecord,
  px: number,
  pz: number,
  tile: number,
  now: number,
) => {
  const intensity = clamp01(field.intensity ?? 0.5);
  const pulse = 0.5 + 0.5 * Math.sin(now / 130 + px * 0.09 + pz * 0.07);
  const cx = px + tile / 2;
  const cy = pz + tile / 2;
  ctx.save();

  if (field.kind === "fire") {
    const glow = ctx.createRadialGradient(cx, cy, tile * 0.1, cx, cy, tile * 0.68);
    glow.addColorStop(0, `rgba(255, 237, 213, ${0.35 + intensity * 0.24})`);
    glow.addColorStop(0.45, `rgba(249, 115, 22, ${0.28 + intensity * 0.32})`);
    glow.addColorStop(1, "rgba(127, 29, 29, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(px - tile * 0.2, pz - tile * 0.2, tile * 1.4, tile * 1.4);
    ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + intensity * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(cx - tile * 0.24, pz + tile * 0.78);
    ctx.quadraticCurveTo(cx - tile * 0.16, pz + tile * (0.36 + pulse * 0.12), cx, pz + tile * 0.14);
    ctx.quadraticCurveTo(cx + tile * 0.2, pz + tile * (0.42 - pulse * 0.08), cx + tile * 0.26, pz + tile * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(254, 240, 138, ${0.52 + pulse * 0.22})`;
    ctx.beginPath();
    ctx.moveTo(cx - tile * 0.1, pz + tile * 0.72);
    ctx.quadraticCurveTo(cx, pz + tile * (0.42 - pulse * 0.08), cx + tile * 0.1, pz + tile * 0.72);
    ctx.closePath();
    ctx.fill();
  } else if (field.kind === "electricity" || field.kind === "conductive_electricity") {
    ctx.strokeStyle = `rgba(250, 250, 120, ${0.5 + intensity * 0.42})`;
    ctx.lineWidth = Math.max(1.5, tile * 0.06);
    ctx.shadowColor = "rgba(250, 250, 120, 0.75)";
    ctx.shadowBlur = tile * 0.2;
    ctx.beginPath();
    ctx.moveTo(px + tile * 0.18, pz + tile * (0.28 + pulse * 0.08));
    ctx.lineTo(px + tile * 0.48, pz + tile * 0.46);
    ctx.lineTo(px + tile * 0.34, pz + tile * 0.5);
    ctx.lineTo(px + tile * 0.76, pz + tile * (0.72 - pulse * 0.08));
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else if (field.kind === "smoke" || field.kind === "steam" || field.kind === "poison_gas" || field.kind === "acid_fumes") {
    const poison = field.kind === "poison_gas" || field.kind === "acid_fumes";
    const steam = field.kind === "steam";
    const color = poison ? "132, 204, 22" : steam ? "226, 232, 240" : "148, 163, 184";
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = (0.16 + intensity * 0.16) * (1 - i * 0.12);
      ctx.fillStyle = `rgba(${color}, 1)`;
      ctx.beginPath();
      ctx.arc(
        px + tile * (0.3 + i * 0.2 + Math.sin(now / 500 + i) * 0.04),
        pz + tile * (0.38 + i * 0.14 - pulse * 0.04),
        tile * (0.22 + i * 0.04),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (field.kind === "cold") {
    ctx.strokeStyle = `rgba(186, 230, 253, ${0.38 + intensity * 0.3})`;
    ctx.lineWidth = Math.max(1, tile * 0.035);
    for (let i = 0; i < 3; i += 1) {
      const ax = cx + Math.cos((Math.PI * 2 * i) / 3) * tile * 0.24;
      const ay = cy + Math.sin((Math.PI * 2 * i) / 3) * tile * 0.24;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }
  } else if (field.kind === "light") {
    const color = field.color || "#facc15";
    ctx.globalAlpha = 0.16 + intensity * 0.18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.62, 0, Math.PI * 2);
    ctx.fill();
  } else if (field.kind === "sound" && field.tag?.startsWith("global_verb_")) {
    ctx.strokeStyle = `rgba(226, 232, 240, ${0.08 + pulse * 0.1})`;
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.beginPath();
    ctx.arc(cx, cy, tile * (0.16 + pulse * 0.08), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
};

const drawConditionScar = (
  ctx: CanvasRenderingContext2D,
  condition: SimulationConditionRecord,
  px: number,
  pz: number,
  tile: number,
) => {
  const style = CONDITION_STYLE[condition.state];
  if (!style) return;
  ctx.save();
  ctx.fillStyle = style.fill;
  ctx.fillRect(px, pz, tile + 1, tile + 1);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(1, tile * 0.035);
  ctx.strokeRect(px + tile * 0.1, pz + tile * 0.1, tile * 0.8, tile * 0.8);
  if (condition.state === "burned" || condition.state === "damaged") {
    drawCellHatch(ctx, px, pz, tile, style.stroke, 9);
  }
  ctx.restore();
};

function approach(current: number, target: number, dt: number, speed: number) {
  const t = 1 - Math.exp(-speed * dt);
  return current + (target - current) * t;
}

type GridMotionState = {
  x: number;
  z: number;
  startX: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  elapsed: number;
  duration: number;
  init: boolean;
  fx?: number;
  fz?: number;
};

const createGridMotionState = (x: number, z: number): GridMotionState => ({
  x,
  z,
  startX: x,
  startZ: z,
  targetX: x,
  targetZ: z,
  elapsed: 0,
  duration: 0,
  init: true,
});

const snapGridMotionState = (state: GridMotionState, x: number, z: number) => {
  state.x = x;
  state.z = z;
  state.startX = x;
  state.startZ = z;
  state.targetX = x;
  state.targetZ = z;
  state.elapsed = 0;
  state.duration = 0;
  state.init = true;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const advanceActorGridMotion = (
  state: GridMotionState,
  targetX: number,
  targetZ: number,
  dt: number,
  ratio: number,
): boolean => {
  if (!state.init) {
    snapGridMotionState(state, targetX, targetZ);
    return false;
  }

  const targetChanged = state.targetX !== targetX || state.targetZ !== targetZ;
  if (targetChanged) {
    const dx = targetX - state.x;
    const dz = targetZ - state.z;
    const fineDistance = Math.max(Math.abs(dx), Math.abs(dz));

    if (fineDistance > ratio * GRID_TELEPORT_DISTANCE_MACROS) {
      snapGridMotionState(state, targetX, targetZ);
      return false;
    }

    if (fineDistance > 0.001) {
      state.fx = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0;
      state.fz = Math.abs(dz) > Math.abs(dx) ? Math.sign(dz) : 0;
    }
    state.startX = state.x;
    state.startZ = state.z;
    state.targetX = Math.round(targetX);
    state.targetZ = Math.round(targetZ);
    state.elapsed = 0;
    state.duration = ACTOR_GRID_SETTLE_SECONDS;
  }

  if (state.duration <= 0) {
    state.x = state.targetX;
    state.z = state.targetZ;
    return false;
  }

  state.elapsed = Math.min(state.duration, state.elapsed + dt);
  const t = Math.min(1, state.elapsed / state.duration);
  const eased = easeOutCubic(t);
  state.x = state.startX + (state.targetX - state.startX) * eased;
  state.z = state.startZ + (state.targetZ - state.startZ) * eased;

  if (t >= 1) {
    state.x = state.targetX;
    state.z = state.targetZ;
    return false;
  }
  return true;
};

export function GameRenderer2D(props: GameRenderer2DProps) {
  const gamePackage = useEngineStore((s) => s.gamePackage);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animatedOverlayRef = useRef<HTMLDivElement | null>(null);
  const animatedSpriteElementsRef = useRef<Map<string, {
    img: HTMLImageElement;
    src: string;
    transform: string;
    width: string;
    height: string;
    zIndex: string;
    filter: string;
  }>>(new Map());
  const barkElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // Latest props/data, read by the rAF loop without restarting it.
  const propsRef = useRef(props);
  propsRef.current = props;

  const spriteIndex = useMemo(() => buildSpriteIndex(gamePackage), [gamePackage]);
  const objectIndex = useMemo(() => buildObjectIndex(gamePackage), [gamePackage]);

  // Top-most cell per (x,z) for floor/wall rendering.
  const topCellByCoord = useMemo(() => {
    const lookup = new Map<string, CellData>();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const cell of props.map.cells) {
      if (!cell.active) continue;
      const key = fineCoordKey(cell.x, cell.z);
      const prev = lookup.get(key);
      if (!prev || (cell.y || 0) >= (prev.y || 0)) lookup.set(key, cell);
      minX = Math.min(minX, cell.x); maxX = Math.max(maxX, cell.x);
      minZ = Math.min(minZ, cell.z); maxZ = Math.max(maxZ, cell.z);
    }
    return { lookup, minX, maxX, minZ, maxZ };
  }, [props.map]);

  // These structures depend on authored/save data, not animation time. Keep
  // them out of the 60fps draw loop so walking does not rebuild maps and
  // placement deltas on every rendered frame.
  const rendererDerived = useMemo(() => {
    const conditionsByCell = new Map<string, SimulationConditionRecord[]>();
    Object.values(props.mapDelta?.simulation_conditions || {}).forEach((condition) => {
      if (!condition.cell) return;
      const key = `${condition.cell[0]}:${condition.cell[1]}`;
      const list = conditionsByCell.get(key) || [];
      list.push(condition);
      conditionsByCell.set(key, list);
    });
    const authoredPlacements = applyPlacementDeltas(
      props.map.custom_object_placements,
      props.mapDelta,
    );
    const placements = props.extraPlacements?.length
      ? [...authoredPlacements, ...props.extraPlacements]
      : authoredPlacements;
    return {
      conditionsByCell,
      placements,
      deniedCellKeys: new Set<string>(
        (props.worldDeniedCells || []).map((cell) => fineCoordKey(cell.x, cell.z)),
      ),
      doorLosBlockers: createFogLineOfSightBlockers(placements, objectIndex, props.mapDelta),
    };
  }, [
    objectIndex,
    props.extraPlacements,
    props.map.custom_object_placements,
    props.mapDelta,
    props.worldDeniedCells,
  ]);

  const dataRef = useRef({ gamePackage, spriteIndex, objectIndex, topCellByCoord, rendererDerived });
  dataRef.current = { gamePackage, spriteIndex, objectIndex, topCellByCoord, rendererDerived };

  // Animation + camera state, persisted across frames. Entities remember their
  // last movement direction (fx/fz) so directional sprite sets keep facing the
  // way they last walked once they stop.
  const animRef = useRef<{
    player: GridMotionState;
    entities: Map<string, GridMotionState>;
    cam: { x: number; z: number; init: boolean };
  }>({ player: { ...createGridMotionState(0, 0), init: false }, entities: new Map(), cam: { x: 0, z: 0, init: false } });

  // Editor pan/zoom view (only used when editLayerY is defined).
  const editorViewRef = useRef<{ cx: number; cz: number; tile: number; init: boolean }>(
    { cx: 0, cz: 0, tile: 24, init: false },
  );
  // Live camera snapshot for pointer → cell mapping.
  const cameraRef = useRef({ cx: 0, cz: 0, tile: 24, w: 1, h: 1 });
  const paintingRef = useRef(false);
  const lastPaintRef = useRef<string | null>(null);
  // Fog of war: per-map set of cells the player has ever seen ("explored").
  const fogExploredRef = useRef<Map<string, Set<string>>>(new Map());
  const fogVisibilityRef = useRef<{
    key: string;
    map: MapData;
    blockers: Set<string>;
    visible: Set<string>;
  } | null>(null);
  const panRef = useRef<{ active: boolean; sx: number; sy: number; cx: number; cz: number }>(
    { active: false, sx: 0, sy: 0, cx: 0, cz: 0 },
  );

  const isEditor = props.editLayerY !== undefined;

  // "Fit" button: re-fit the editor view to the whole map on next frame.
  useEffect(() => {
    editorViewRef.current.init = false;
  }, [props.fitSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();

    const draw = (dt: number) => {
      const p = propsRef.current;
      const {
        gamePackage: pkg,
        spriteIndex: sprites,
        objectIndex: objects,
        topCellByCoord: top,
        rendererDerived: derived,
      } =
        dataRef.current;
      const anim = animRef.current;
      const fx = useFxStore.getState();
      const now = performance.now();

      const dpr = Math.max(1, Math.min(p.renderDpr ?? 2, window.devicePixelRatio || 1));
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const activeAnimatedSpriteKeys = new Set<string>();
        const activeBarkIds = new Set<number>();
        const snapOverlayPx = (value: number) => Math.round(value);

      const showAnimatedSpriteOverlay = (
        key: string,
        sprite: SpriteData | undefined,
        rect: { x: number; y: number; width: number; height: number },
        zIndex: number,
        flashAmount = 0,
      ) => {
        const overlay = animatedOverlayRef.current;
        const src = (sprite as (SpriteData & { data_url?: string }) | undefined)?.data_url;
        if (!overlay || !sprite || !src || !isAnimatedSprite(sprite)) return false;
        activeAnimatedSpriteKeys.add(key);
        let entry = animatedSpriteElementsRef.current.get(key);
        if (!entry) {
          const img = document.createElement("img");
          img.decoding = "async";
          img.draggable = false;
          img.alt = "";
          img.style.position = "absolute";
          img.style.pointerEvents = "none";
          img.style.objectFit = "contain";
          img.style.imageRendering = "pixelated";
          img.style.transformOrigin = "top left";
          img.style.backfaceVisibility = "hidden";
          img.style.willChange = "transform,filter";
          overlay.appendChild(img);
          entry = {
            img,
            src: "",
            transform: "",
            width: "",
            height: "",
            zIndex: "",
            filter: "",
          };
          animatedSpriteElementsRef.current.set(key, entry);
        }
        if (entry.src !== src) {
          entry.src = src;
          entry.img.src = src;
        }
        if (entry.img.style.display !== "block") entry.img.style.display = "block";
        const transform = `translate3d(${snapOverlayPx(rect.x)}px, ${snapOverlayPx(rect.y)}px, 0)`;
        const width = `${Math.max(1, snapOverlayPx(rect.width))}px`;
        const height = `${Math.max(1, snapOverlayPx(rect.height))}px`;
        const nextZIndex = String(zIndex);
        const filter =
          flashAmount > 0
            ? `brightness(${(1 + flashAmount * 0.8).toFixed(3)}) saturate(${(1 + flashAmount * 2).toFixed(3)})`
            : "";
        if (entry.transform !== transform) {
          entry.transform = transform;
          entry.img.style.transform = transform;
        }
        if (entry.width !== width) {
          entry.width = width;
          entry.img.style.width = width;
        }
        if (entry.height !== height) {
          entry.height = height;
          entry.img.style.height = height;
        }
        if (entry.zIndex !== nextZIndex) {
          entry.zIndex = nextZIndex;
          entry.img.style.zIndex = nextZIndex;
        }
        if (entry.filter !== filter) {
          entry.filter = filter;
          entry.img.style.filter = filter;
        }
        return true;
      };

      const hideInactiveAnimatedSprites = () => {
        animatedSpriteElementsRef.current.forEach((entry, key) => {
          if (activeAnimatedSpriteKeys.has(key)) return;
          // Removing the node releases the animated-image decoder. Keeping
          // every GIF ever visited at display:none allowed crowded maps to
          // accumulate hundreds of megabytes of decoded frames.
          entry.img.remove();
          animatedSpriteElementsRef.current.delete(key);
        });
      };

      // ── Camera ──
      let camX: number, camZ: number, tile: number;
      const editor = p.editLayerY !== undefined;
      // World cells per macro art tile (1 in the editor, FINE_PER_MACRO in
      // play). `tile` is px per WORLD CELL; `macroTile` px per art tile.
      const ratio = editor ? 1 : Math.max(1, Math.floor(p.fineRatio ?? 1));
      if (editor) {
        const ev = editorViewRef.current;
        if (!ev.init) {
          const mapW = top.maxX - top.minX + 1 || p.map.width || 16;
          const mapH = top.maxZ - top.minZ + 1 || p.map.height || 16;
          ev.tile = Math.max(6, Math.min(48, Math.floor((Math.min(cssW, cssH) * 0.92) / Math.max(mapW, mapH))));
          ev.cx = (top.minX + top.maxX) / 2;
          ev.cz = (top.minZ + top.maxZ) / 2;
          ev.init = true;
        }
        camX = ev.cx; camZ = ev.cz; tile = ev.tile;
      } else {
        tile = Math.max(
          Math.max(4, Math.round(18 / ratio)),
          Math.floor(Math.min(cssW, cssH) / (PLAY_VISIBLE_TILES * ratio)),
        );
        if (p.playerPos) {
          advanceActorGridMotion(anim.player, p.playerPos[0], p.playerPos[1], dt, ratio);
          playerStateRef.px = anim.player.x;
          playerStateRef.py = 0;
          playerStateRef.pz = anim.player.z;
          playerStateRef.ready = true;
        }
        const focus = p.renderCenter || p.playerPos || [0, 0];
        const followX = p.playerPos && anim.player.init ? anim.player.x : focus[0];
        const followZ = p.playerPos && anim.player.init ? anim.player.z : focus[1];
        const targetX = p.renderCenter ? focus[0] : followX;
        const targetZ = p.renderCenter ? focus[1] : followZ;
        if (!anim.cam.init) { anim.cam.x = targetX; anim.cam.z = targetZ; anim.cam.init = true; }
        if (p.renderCenter) {
          anim.cam.x = approach(anim.cam.x, targetX, dt, CAMERA_FOCUS_SPEED);
          anim.cam.z = approach(anim.cam.z, targetZ, dt, CAMERA_FOCUS_SPEED);
        } else if (
          Math.max(Math.abs(targetX - anim.cam.x), Math.abs(targetZ - anim.cam.z)) >
          ratio * GRID_TELEPORT_DISTANCE_MACROS
        ) {
          anim.cam.x = targetX;
          anim.cam.z = targetZ;
        } else {
          anim.cam.x = approach(anim.cam.x, targetX, dt, CAMERA_FOLLOW_SPEED);
          anim.cam.z = approach(anim.cam.z, targetZ, dt, CAMERA_FOLLOW_SPEED);
        }
        camX = anim.cam.x; camZ = anim.cam.z;
      }

      const originX = cssW / 2;
      const originY = cssH / 2;
      cameraRef.current = { cx: camX, cz: camZ, tile, w: cssW, h: cssH };
      const sx = (x: number) => originX + (x - camX) * tile;
      const sy = (z: number) => originY + (z - camZ) * tile;

      // ── Background ──
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, cssW, cssH);

      // Visible cell range (with padding).
      const minX = Math.floor(camX - cssW / 2 / tile) - 1;
      const maxX = Math.ceil(camX + cssW / 2 / tile) + 1;
      const minZ = Math.floor(camZ - cssH / 2 / tile) - 1;
      const maxZ = Math.ceil(camZ + cssH / 2 / tile) + 1;
      const inView = (x: number, z: number, pad = 2) =>
        x >= minX - pad && x <= maxX + pad && z >= minZ - pad && z <= maxZ + pad;
      const alertByActor = new Map<string, ImmersivePerceptionAlertRecord>();
      (p.perceptionAlerts || []).forEach((alert) => {
        alertByActor.set(alert.actor_id, alert);
        alertByActor.set(alert.entity_id, alert);
      });
      const actorScreenPositions = new Map<string, {
        cx: number;
        cz: number;
        headY?: number;
        cell: [number, number];
      }>();

      const conditionsByCell = derived.conditionsByCell;

      // ── 1. Floor / wall base tiles ──
      // Art is authored per MACRO tile: at fine ratios the base pass draws one
      // art tile spanning the whole ratio² fine block (the expanded fine map
      // copies authored fields uniformly, so the block's origin cell speaks
      // for the tile).
      const macroTile = tile * ratio;
      const mMinX = Math.floor(minX / ratio);
      const mMaxX = Math.floor(maxX / ratio);
      const mMinZ = Math.floor(minZ / ratio);
      const mMaxZ = Math.floor(maxZ / ratio);
      for (let mz = mMinZ; mz <= mMaxZ; mz++) {
        for (let mx = mMinX; mx <= mMaxX; mx++) {
          const cell = top.lookup.get(`${mx * ratio}:${mz * ratio}`);
          if (!cell) continue;
          const px = sx(mx * ratio - 0.5);
          const pz = sy(mz * ratio - 0.5);
          const obj = cell.object_id ? objects.get(cell.object_id) : undefined;
          const tileSprite = objectTileSprite(obj, sprites);
          const tileCanvas = tileSprite ? getSpriteCanvas(tileSprite) : null;
          if (tileCanvas) {
            if (isObliqueTerrainSpriteId(tileSprite?.id) || isObliqueStructureSpriteId(tileSprite?.id)) {
              const previousSmoothing = ctx.imageSmoothingEnabled;
              const drawHeight = macroTile * 1.32 + 1;
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(tileCanvas, px, pz, macroTile + 1, drawHeight);
              ctx.imageSmoothingEnabled = previousSmoothing;
            } else if (isObliqueBarrierSpriteId(tileSprite?.id) || isObliquePropSpriteId(tileSprite?.id)) {
              const previousSmoothing = ctx.imageSmoothingEnabled;
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(tileCanvas, px, pz, macroTile + 1, macroTile + 1);
              ctx.imageSmoothingEnabled = previousSmoothing;
            } else {
              ctx.drawImage(tileCanvas, px, pz, macroTile + 1, macroTile + 1);
            }
          } else {
            ctx.fillStyle = colorForCell(obj, cell.object_id, cell.visual_height);
            ctx.fillRect(px, pz, macroTile + 1, macroTile + 1);
          }
          const tint = surfaceTint(cell.surface_tag);
          if (tint) {
            ctx.fillStyle = tint;
            ctx.fillRect(px, pz, macroTile + 1, macroTile + 1);
          }
        }
      }
      // Runtime overlays (condition scars, chemistry surfaces, environment
      // fields) are FINE-cell records — draw them per world cell so fluids
      // pool into tile corners and creep edge by edge. This fine-shaped flow
      // is the visible payoff of the subdivision rebuild (§6.6).
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x}:${z}`;
          const px = sx(x - 0.5);
          const pz = sy(z - 0.5);
          conditionsByCell.get(key)?.forEach((condition) => {
            drawConditionScar(ctx, condition, px, pz, tile);
          });
          (p.mapDelta?.surface_layers?.[key] || []).filter(isVisibleWorldSurfaceLayer).forEach((layer) => {
            drawDynamicSurfaceLayer(ctx, layer, px, pz, tile, now);
          });
          (p.mapDelta?.environment_fields?.[key] || []).forEach((field) => {
            drawEnvironmentField(ctx, field, px, pz, tile, now);
          });
        }
      }

      // ── 2. Combat range / target highlights (under objects) ──
      const fillCell = (x: number, z: number, color: string, alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(sx(x - 0.5), sy(z - 0.5), tile, tile);
        ctx.globalAlpha = 1;
      };
      p.rangeCells?.forEach((c) => inView(c.x, c.z) && fillCell(c.x, c.z, RANGE_COLOR, 0.16));
      p.targetPattern?.forEach((c) => inView(c.x, c.z) && fillCell(c.x, c.z, TARGET_COLOR, 0.55));
      p.combatOverwatchZones?.forEach((zone) => {
        zone.cells.forEach((cell) => inView(cell[0], cell[1]) && fillCell(cell[0], cell[1], "#f59e0b", 0.08));
        if (inView(zone.origin_cell[0], zone.origin_cell[1])) {
          ctx.strokeStyle = "rgba(245, 158, 11, 0.72)";
          ctx.lineWidth = Math.max(1.5, tile * 0.04);
          ctx.beginPath();
          ctx.arc(sx(zone.origin_cell[0]), sy(zone.origin_cell[1]), macroTile * 0.48, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      p.combatIntents?.forEach((intent) => {
        if (intent.action_type === "overwatch") return;
        intent.target_cells.forEach((cell) => inView(cell[0], cell[1]) && fillCell(cell[0], cell[1], "#ef4444", 0.12));
      });
      const deniedCellKeys = derived.deniedCellKeys;
      const drawDeniedCell = (x: number, z: number) => {
        if (!inView(x, z)) return;
        const left = sx(x - 0.5);
        const topY = sy(z - 0.5);
        ctx.save();
        ctx.fillStyle = "rgba(52, 9, 18, 0.34)";
        ctx.fillRect(left, topY, tile, tile);
        ctx.strokeStyle = "rgba(251, 113, 133, 0.5)";
        ctx.lineWidth = Math.max(1, tile * 0.035);
        ctx.beginPath();
        const step = Math.max(6, tile * 0.25);
        for (let offset = -tile; offset <= tile * 2; offset += step) {
          ctx.moveTo(left + offset, topY + tile);
          ctx.lineTo(left + offset + tile, topY);
        }
        ctx.stroke();
        ctx.strokeStyle = "rgba(251, 113, 133, 0.9)";
        ctx.lineWidth = Math.max(1.5, tile * 0.055);
        ctx.beginPath();
        if (!deniedCellKeys.has(fineCoordKey(x, z - 1))) {
          ctx.moveTo(left + 1, topY + 1);
          ctx.lineTo(left + tile - 1, topY + 1);
        }
        if (!deniedCellKeys.has(fineCoordKey(x, z + 1))) {
          ctx.moveTo(left + 1, topY + tile - 1);
          ctx.lineTo(left + tile - 1, topY + tile - 1);
        }
        if (!deniedCellKeys.has(fineCoordKey(x - 1, z))) {
          ctx.moveTo(left + 1, topY + 1);
          ctx.lineTo(left + 1, topY + tile - 1);
        }
        if (!deniedCellKeys.has(fineCoordKey(x + 1, z))) {
          ctx.moveTo(left + tile - 1, topY + 1);
          ctx.lineTo(left + tile - 1, topY + tile - 1);
        }
        ctx.stroke();
        ctx.restore();
      };
      p.worldDeniedCells?.forEach((cell) => drawDeniedCell(cell.x, cell.z));
      // ── 3. Grid lines (editor) ──
      if (p.showGrid ?? editor) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = minX; x <= maxX + 1; x++) {
          const lx = Math.round(sx(x - 0.5)) + 0.5;
          ctx.moveTo(lx, 0); ctx.lineTo(lx, cssH);
        }
        for (let z = minZ; z <= maxZ + 1; z++) {
          const lz = Math.round(sy(z - 0.5)) + 0.5;
          ctx.moveTo(0, lz); ctx.lineTo(cssW, lz);
        }
        ctx.stroke();
      }

      // ── 4. Object placements (props, doors, containers) ──
      // Apply kernel push/remove deltas so pushed objects draw at their cell.
      const placements = derived.placements;
      for (const placement of placements) {
        const [x, z] = placement.cell;
        if (!inView(x, z, 3 * ratio)) continue;
        const obj = objects.get(placement.object_id);
        if (!obj) continue;
        const open = isDoorPlacementOpen(p.mapDelta, placement);
        const tileSprite = objectTileSprite(obj, sprites);
        const tileCanvas = tileSprite ? getSpriteCanvas(tileSprite) : null;
        const cx = sx(x);
        const cz = sy(z);
        ctx.save();
        ctx.translate(cx, cz);
        if (open) {
          ctx.rotate(Math.PI / 2);
          ctx.globalAlpha = 0.45;
        }
        if (tileCanvas) {
          if (
            isObliqueStructureSpriteId(tileSprite?.id) ||
            isObliqueBarrierSpriteId(tileSprite?.id) ||
            isObliquePropSpriteId(tileSprite?.id)
          ) {
            const previousSmoothing = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(tileCanvas, -macroTile / 2, -macroTile / 2, macroTile, macroTile);
            ctx.imageSmoothingEnabled = previousSmoothing;
          } else {
            ctx.drawImage(tileCanvas, -macroTile / 2, -macroTile / 2, macroTile, macroTile);
          }
        } else {
          ctx.fillStyle = colorForObject(obj);
          ctx.fillRect(-macroTile * 0.4, -macroTile * 0.4, macroTile * 0.8, macroTile * 0.8);
        }
        ctx.restore();
        // Interactable marker (matches the 3D yellow indicator).
        if (placement.dialogue_id) {
          ctx.fillStyle = "#EBCB8B";
          ctx.beginPath();
          ctx.arc(cx, sy(z - 0.45 * ratio), Math.max(2, macroTile * 0.1), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── 5. Ground items ──
      for (const item of p.worldItems || []) {
        const [x, z] = item.cell;
        if (!inView(x, z, 2 * ratio)) continue;
        const itemDef = pkg.items.find((it) => it.id === (item as any).item_id);
        const sprite = itemDef?.sprite_id ? sprites.get(itemDef.sprite_id) : undefined;
        const canvasImg = sprite ? getSpriteCanvas(sprite) : getEmojiCanvas(item.icon || "📦");
        const s = macroTile * 0.62;
        if (canvasImg) ctx.drawImage(canvasImg, sx(x) - s / 2, sy(z) - s / 2, s, s);
      }

      // ── Helpers for characters ──
      // Actors are macro-sized (a 1-macro-tile body = ratio² fine cells), so
      // every character visual scales by macroTile.
      const drawHpBar = (cx: number, cz: number, hp: number, maxHp: number) => {
        const w = macroTile * 0.7;
        const h = Math.max(2, macroTile * 0.08);
        const x0 = cx - w / 2;
        const y0 = cz - macroTile * 0.62;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
        ctx.fillStyle = "#3b1d1d";
        ctx.fillRect(x0, y0, w, h);
        const frac = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
        ctx.fillStyle = frac > 0.5 ? "#7bd88f" : frac > 0.25 ? "#e9c46a" : "#e76f51";
        ctx.fillRect(x0, y0, w * frac, h);
      };
      const drawRing = (cx: number, cz: number, color: string, alpha: number, r: number) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, macroTile * 0.06);
        ctx.beginPath();
        ctx.ellipse(cx, cz + macroTile * 0.32, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      const actorSpriteRect = (
        cx: number,
        cz: number,
        sprite: SpriteData | undefined,
        renderable: SpriteRenderable | null,
        maxWidth: number,
      ) => {
        const size = spriteRenderableSize(renderable, sprite);
        const aspect = Math.max(0.2, Math.min(2.5, size.width / Math.max(1, size.height)));
        const maxHeight = macroTile * 1.42;
        let width = maxWidth;
        let height = width / aspect;
        if (height > maxHeight) {
          height = maxHeight;
          width = height * aspect;
        }
        const bottom = cz + macroTile * 0.38;
        return { x: cx - width / 2, y: bottom - height, width, height };
      };
      const actorOverlayZIndex = (cellZ: number, band = 0) =>
        1000 + Math.round(cellZ) * 20 + band;
      const drawCharacter = (
        cellX: number, cellZ: number, spriteId: string | undefined,
        fallbackColor: string, animKey: string,
      ) => {
        const a = anim.entities.get(animKey) || createGridMotionState(cellX, cellZ);
        const moving = advanceActorGridMotion(a, cellX, cellZ, dt, ratio);
        anim.entities.set(animKey, a);
        const cx = sx(a.x);
        const cz = sy(a.z);
        const resolvedId = resolveDirectionalSpriteId(
          sprites, spriteId, [a.fx ?? 0, a.fz ?? 1], moving, now,
        );
        const sprite = resolvedId ? sprites.get(resolvedId) : undefined;
        const animated = isAnimatedSprite(sprite);
        const img = sprite && !animated ? getSpriteRenderable(sprite) : null;
        const s = macroTile * 0.92;
        const rect = actorSpriteRect(cx, cz, sprite, img, s);
        const flash = fx.hitFlashes[animKey];
        const flashAmount = flash && now - flash < HIT_FLASH_MS ? 1 - (now - flash) / HIT_FLASH_MS : 0;
        const overlaid = animated
          ? showAnimatedSpriteOverlay(animKey, sprite, rect, actorOverlayZIndex(cellZ), flashAmount)
          : false;
        if (!overlaid && !drawSpriteRenderable(ctx, img, rect.x, rect.y, rect.width, rect.height)) {
          ctx.fillStyle = fallbackColor;
          ctx.beginPath();
          ctx.moveTo(cx, cz - s / 2);
          ctx.lineTo(cx + s / 2, cz);
          ctx.lineTo(cx, cz + s / 2);
          ctx.lineTo(cx - s / 2, cz);
          ctx.closePath();
          ctx.fill();
        }
        // Hit flash tint.
        if (!overlaid && flashAmount > 0) {
          ctx.globalAlpha = 0.5 * flashAmount;
          ctx.fillStyle = "#ff5555";
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.globalAlpha = 1;
        }
        return { cx, cz, headY: rect.y };
      };

      // ── 6. Entities ──
      p.map.entity_placements?.forEach((placement, i) => {
        if (p.partyMemberIds?.includes(placement.entity_id)) return;
        const key = entityPlacementStateKey(p.map.id, placement, i);
        const st = p.entityStates?.[key] || p.entityStates?.[placement.entity_id];
        if (st?.dead || st?.hidden) return;
        const cellCoord = st?.cell || placement.cell;
        if (!inView(cellCoord[0], cellCoord[1], 4 * ratio)) return;
        const def = pkg.entities.find((e) => e.id === placement.entity_id);
        if (!def) return;
        const { cx, cz, headY } = drawCharacter(
          cellCoord[0], cellCoord[1], def.sprite_id,
          def.is_npc ? "#A3BE8C" : "#BF616A", key,
        );
        actorScreenPositions.set(key, { cx, cz, headY, cell: [cellCoord[0], cellCoord[1]] });
        actorScreenPositions.set(placement.entity_id, { cx, cz, headY, cell: [cellCoord[0], cellCoord[1]] });
        const hp = st?.hp ?? def.max_hp;
        const engaged = !def.is_npc && !!p.playerPos &&
          Math.abs(cellCoord[0] - p.playerPos[0]) + Math.abs(cellCoord[1] - p.playerPos[1]) <= THREAT_RADIUS;
        if (hp < def.max_hp || engaged || p.inCombat) drawHpBar(cx, cz, hp, def.max_hp);
        if (p.activeTurnKey === key) drawRing(cx, cz, "#ffd166", 0.9, macroTile * 0.42);
        drawPhysicalStateBadge(ctx, cx, cz, macroTile, p.actorPhysicalStates?.[key] || p.actorPhysicalStates?.[placement.entity_id]);
        drawAlertBadge(ctx, cx, cz, macroTile, alertByActor.get(key) || alertByActor.get(placement.entity_id));
        if (p.showBehaviorIntents) {
          drawBehaviorIntentBadge(
            ctx,
            cx,
            cz,
            macroTile,
            st?.behavior_intent as EntityBehaviorIntentRecord | undefined,
          );
        }
      });

      // ── 7. Party followers ──
      p.partyFollowers?.forEach((follower, i) => {
        const def = pkg.entities.find((e) => e.id === follower.entity_id);
        if (!def) return;
        const st = p.entityStates?.[follower.entity_id];
        if (st?.dead) return;
        if (!inView(follower.cell[0], follower.cell[1], 4 * ratio)) return;
        const { cx, cz, headY } = drawCharacter(
          follower.cell[0], follower.cell[1], def.sprite_id, "#A3BE8C", `party_${follower.entity_id}`,
        );
        actorScreenPositions.set(follower.entity_id, { cx, cz, headY, cell: [follower.cell[0], follower.cell[1]] });
        const hp = st?.hp ?? def.max_hp;
        if (hp < def.max_hp || p.inCombat) drawHpBar(cx, cz, hp, def.max_hp);
        if (p.activeTurnKey === follower.entity_id) drawRing(cx, cz, "#ffd166", 0.9, macroTile * 0.42);
        drawPhysicalStateBadge(ctx, cx, cz, macroTile, p.actorPhysicalStates?.[follower.entity_id]);
      });

      // ── 8. Player ──
      if (p.playerPos) {
        const cx = sx(anim.player.x);
        const cz = sy(anim.player.z);
        const configuredSpriteId = p.playerSpriteId || pkg.settings?.player_sprite_id;
        const playerMoving =
          Math.abs(anim.player.x - p.playerPos[0]) + Math.abs(anim.player.z - p.playerPos[1]) > 0.03 * ratio;
        const spriteId = resolveDirectionalSpriteId(
          sprites, configuredSpriteId, p.playerFacing, playerMoving, now,
        );
        const sprite = spriteId ? sprites.get(spriteId) : undefined;
        const animated = isAnimatedSprite(sprite);
        const img = sprite && !animated ? getSpriteRenderable(sprite) : null;
        const s = macroTile * 0.95;
        drawRing(cx, cz, "#88C0D0", p.activeTurnKey === "player" ? 0.9 : 0.5, macroTile * 0.4);
        const rect = actorSpriteRect(cx, cz, sprite, img, s);
        actorScreenPositions.set("player", {
          cx,
          cz,
          headY: rect.y,
          cell: [p.playerPos[0], p.playerPos[1]],
        });
        const overlaid = animated
          ? showAnimatedSpriteOverlay("player", sprite, rect, actorOverlayZIndex(p.playerPos[1], 8))
          : false;
        if (!overlaid && !drawSpriteRenderable(ctx, img, rect.x, rect.y, rect.width, rect.height)) {
          ctx.fillStyle = "#88C0D0";
          ctx.beginPath();
          const f = p.playerFacing || [0, -1];
          const ang = Math.atan2(f[0], -f[1]);
          ctx.translate(cx, cz); ctx.rotate(ang);
          ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2);
          ctx.closePath(); ctx.fill();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        drawPhysicalStateBadge(ctx, cx, cz, macroTile, p.actorPhysicalStates?.player);
      }

      // ── 8a. Stealth/perception sight tethers ──
      // Alert records are simulation-space; source them from the animated actor
      // sprite position so the visible line follows moving entities.
      (p.perceptionAlerts || []).forEach((alert) => {
        if (alert.alertness === "oblivious") return;
        const start =
          actorScreenPositions.get(alert.actor_id) ||
          actorScreenPositions.get(alert.entity_id) ||
          { cx: sx(alert.cell[0]), cz: sy(alert.cell[1]), cell: alert.cell };
        const playerTarget =
          p.playerPos && p.playerPos[0] === alert.target_cell[0] && p.playerPos[1] === alert.target_cell[1]
            ? actorScreenPositions.get("player")
            : undefined;
        if (!inView(start.cell[0], start.cell[1], 4 * ratio) && !inView(alert.target_cell[0], alert.target_cell[1], 4 * ratio)) return;
        const end = playerTarget || { cx: sx(alert.target_cell[0]), cz: sy(alert.target_cell[1]), cell: alert.target_cell };
        ctx.save();
        ctx.strokeStyle = alertLineColor(alert.alertness);
        ctx.lineWidth = Math.max(1.5, macroTile * 0.045);
        ctx.setLineDash(alert.alertness === "combat" ? [] : [Math.max(4, macroTile * 0.18), Math.max(3, macroTile * 0.12)]);
        ctx.beginPath();
        ctx.moveTo(start.cx, start.cz - macroTile * 0.24);
        ctx.lineTo(end.cx, end.cz - macroTile * 0.24);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = alertLineColor(alert.alertness);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(end.cx, end.cz - macroTile * 0.24, Math.max(2.5, macroTile * 0.075), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      // ── 8b. Combat intent tethers ──
      // Cover edges still feed combat math, but actor intent is the only combat
      // line drawn on the playfield so it stays attached to moving entities.
      (p.combatIntents || []).forEach((intent) => {
        if (intent.action_type === "overwatch") return;
        const start = actorScreenPositions.get(intent.actor_id);
        const targetActor = intent.target_actor_id ? actorScreenPositions.get(intent.target_actor_id) : undefined;
        const targetCell = intent.target_cells[0];
        if (!start || (!targetActor && !targetCell)) return;
        const end = targetActor || { cx: sx(targetCell[0]), cz: sy(targetCell[1]), cell: targetCell };
        if (!inView(start.cell[0], start.cell[1], 4 * ratio) && !inView(end.cell[0], end.cell[1], 4 * ratio)) return;
        const color = combatIntentLineColor(intent.action_type);
        const startY = start.cz - macroTile * 0.16;
        const endY = end.cz - macroTile * 0.16;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, macroTile * 0.055);
        ctx.lineCap = "round";
        ctx.setLineDash(intent.action_type === "advance" ? [Math.max(5, macroTile * 0.22), Math.max(3, macroTile * 0.12)] : []);
        ctx.beginPath();
        ctx.moveTo(start.cx, startY);
        ctx.lineTo(end.cx, endY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(end.cx, endY, Math.max(3, macroTile * 0.09), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      // ── 8c. Fog of war (play only) ──
      // Phase E fork: macro fog (default) keeps explored-state at authored-tile
      // scale and samples fine blockers; fine fog stores/paints exact fine
      // visibility. Both live behind this branch so profiling can switch the
      // resolution without another renderer rewrite.
      if (p.fogOfWar && !editor && p.playerPos) {
        const fogResolution = p.fogResolution ?? "macro";
        const doorLosBlockers = derived.doorLosBlockers;
        if (fogResolution === "fine") {
          const radius = Math.round((p.fogRadius ?? 5) * ratio);
          const px = Math.round(p.playerPos[0]);
          const pz = Math.round(p.playerPos[1]);
          const fineBlocksLos = (x: number, z: number): boolean => {
            const key = fogCellKey(x, z);
            return Boolean(top.lookup.get(key)?.blocks_los || doorLosBlockers.has(key));
          };
          const visibilityKey = `fine:${p.map.id}:${px}:${pz}:${radius}:${ratio}`;
          const cachedVisibility = fogVisibilityRef.current;
          let visible: Set<string>;
          if (
            cachedVisibility?.key === visibilityKey &&
            cachedVisibility.map === p.map &&
            cachedVisibility.blockers === doorLosBlockers
          ) {
            visible = cachedVisibility.visible;
          } else {
            visible = new Set<string>();
            for (let z = pz - radius; z <= pz + radius; z++) {
              for (let x = px - radius; x <= px + radius; x++) {
                const dist = Math.max(Math.abs(x - px), Math.abs(z - pz));
                if (dist > radius) continue;
                if (dist <= ratio || hasFogLineOfSight([px, pz], [x, z], fineBlocksLos)) {
                  visible.add(fogCellKey(x, z));
                }
              }
            }
            fogVisibilityRef.current = {
              key: visibilityKey,
              map: p.map,
              blockers: doorLosBlockers,
              visible,
            };
          }
          let explored = fogExploredRef.current.get(p.map.id);
          if (!explored) {
            explored = new Set<string>(p.initialExplored?.[p.map.id] || []);
            fogExploredRef.current.set(p.map.id, explored);
          }
          const newlyExplored: string[] = [];
          visible.forEach((k) => {
            if (!explored!.has(k)) {
              explored!.add(k);
              newlyExplored.push(k);
            }
          });
          if (newlyExplored.length > 0) p.onExplore?.(p.map.id, newlyExplored);
          for (let z = minZ; z <= maxZ; z++) {
            for (let x = minX; x <= maxX; x++) {
              const key = fogCellKey(x, z);
              if (visible.has(key)) continue;
              ctx.fillStyle = explored.has(key) ? "rgba(6,9,18,0.62)" : "#06090f";
              ctx.fillRect(sx(x - 0.5), sy(z - 0.5), tile + 1, tile + 1);
            }
          }
        } else {
        const radius = p.fogRadius ?? 5; // macro tiles
        const pmx = Math.floor(Math.round(p.playerPos[0]) / ratio);
        const pmz = Math.floor(Math.round(p.playerPos[1]) / ratio);
        const visibilityKey = `macro:${p.map.id}:${pmx}:${pmz}:${radius}:${ratio}`;
        const cachedVisibility = fogVisibilityRef.current;
        let visible: Set<string>;
        if (
          cachedVisibility?.key === visibilityKey &&
          cachedVisibility.map === p.map &&
          cachedVisibility.blockers === doorLosBlockers
        ) {
          visible = cachedVisibility.visible;
        } else {
          // A macro tile blocks LOS when any fine cell of its block does.
          const macroBlockerCache = new Map<string, boolean>();
          const macroBlocksLos = (mx: number, mz: number): boolean => {
            const cacheKey = `${mx}:${mz}`;
            const cached = macroBlockerCache.get(cacheKey);
            if (cached !== undefined) return cached;
            let blocked = false;
            outer: for (let dz = 0; dz < ratio; dz++) {
              for (let dx = 0; dx < ratio; dx++) {
                const key = fogCellKey(mx * ratio + dx, mz * ratio + dz);
                if (top.lookup.get(key)?.blocks_los || doorLosBlockers.has(key)) {
                  blocked = true;
                  break outer;
                }
              }
            }
            macroBlockerCache.set(cacheKey, blocked);
            return blocked;
          };
          // Bresenham line-of-sight over macro tiles: a tile is visible if no
          // blocking tile lies strictly between it and the player's tile.
          visible = new Set<string>();
          const hasLOS = (tx: number, tz: number) =>
            hasFogLineOfSight([pmx, pmz], [tx, tz], macroBlocksLos);
          for (let mz = pmz - radius; mz <= pmz + radius; mz++) {
            for (let mx = pmx - radius; mx <= pmx + radius; mx++) {
              const dist = Math.max(Math.abs(mx - pmx), Math.abs(mz - pmz));
              if (dist > radius) continue;
              if (dist <= 1 || hasLOS(mx, mz)) visible.add(`${mx}:${mz}`);
            }
          }
          fogVisibilityRef.current = {
            key: visibilityKey,
            map: p.map,
            blockers: doorLosBlockers,
            visible,
          };
        }
        let explored = fogExploredRef.current.get(p.map.id);
        if (!explored) {
          // Seed from the save so fog persists across reloads/map changes.
          explored = new Set<string>(p.initialExplored?.[p.map.id] || []);
          fogExploredRef.current.set(p.map.id, explored);
        }
        // Merge newly-visible tiles; report the genuinely-new ones up so the
        // runtime save can persist them (no-op when nothing new is revealed).
        const newlyExplored: string[] = [];
        visible.forEach((k) => {
          if (!explored!.has(k)) {
            explored!.add(k);
            newlyExplored.push(k);
          }
        });
        if (newlyExplored.length > 0) p.onExplore?.(p.map.id, newlyExplored);
        // Paint the veil per macro tile: opaque over never-seen, translucent
        // over explored-but-not-currently-visible.
        for (let mz = mMinZ; mz <= mMaxZ; mz++) {
          for (let mx = mMinX; mx <= mMaxX; mx++) {
            const key = `${mx}:${mz}`;
            if (visible.has(key)) continue;
            ctx.fillStyle = explored.has(key) ? "rgba(6,9,18,0.62)" : "#06090f";
            ctx.fillRect(sx(mx * ratio - 0.5), sy(mz * ratio - 0.5), macroTile + 1, macroTile + 1);
          }
        }
        }
      }

      // ── 9. Hovered cell outline ──
      if (p.hoveredCell && inView(p.hoveredCell[0], p.hoveredCell[1])) {
        ctx.strokeStyle = "#ECEFF4";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx(p.hoveredCell[0] - 0.5) + 1, sy(p.hoveredCell[1] - 0.5) + 1, tile - 2, tile - 2);
      }

      // ── 10. Editor markers (triggers, spawns, lint, brush) ──
      if (editor) {
        p.map.triggers?.forEach((trg) => {
          if (!trg.cell || !inView(trg.cell[0], trg.cell[1])) return;
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = trg.type === "step" ? "#EBCB8B" : "#B48EAD";
          const s = tile * 0.55;
          ctx.fillRect(sx(trg.cell[0]) - s / 2, sy(trg.cell[1]) - s / 2, s, s);
          ctx.globalAlpha = 1;
        });
        p.map.spawns?.forEach((spawn) => {
          if (!inView(spawn.cell[0], spawn.cell[1])) return;
          ctx.strokeStyle = "#A3BE8C";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx(spawn.cell[0]), sy(spawn.cell[1]), tile * 0.32, 0, Math.PI * 2);
          ctx.stroke();
        });
        p.lintProblems?.forEach((problem) => {
          if (!problem.cell || !inView(problem.cell[0], problem.cell[1])) return;
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = problem.severity === "error" ? "#ff3030" : problem.severity === "warn" ? "#ffcc00" : "#3080ff";
          ctx.fillRect(sx(problem.cell[0] - 0.5), sy(problem.cell[1] - 0.5), tile, tile);
          ctx.globalAlpha = 1;
        });
        if (p.hoveredCell && (p.brushSize ?? 1) > 1) {
          const bs = p.brushSize as number;
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#88C0D0";
          ctx.fillRect(
            sx(p.hoveredCell[0] - bs / 2), sy(p.hoveredCell[1] - bs / 2), tile * bs, tile * bs,
          );
          ctx.globalAlpha = 1;
        }
      }

      // ── 11. FX: barks, damage popups, hurt vignette ──
      ctx.textAlign = "center";
      const barkStackByActor = new Map<string, number>();
      for (const bark of fx.barks) {
        if (now < bark.showAt || now > bark.showAt + bark.lifetime) continue;
        const actorAnchor = bark.actorId ? actorScreenPositions.get(bark.actorId) : undefined;
        // Entity-owned speech must have a living, visible speaker. Falling
        // back to its last cell after the actor died produced a disembodied
        // bark at the death position.
        if (bark.actorId && !actorAnchor) continue;
        const anchor =
          actorAnchor ||
          { cx: sx(bark.cell[0]), cz: sy(bark.cell[1]), cell: bark.cell };
        if (!inView(anchor.cell[0], anchor.cell[1], 4 * ratio)) continue;
        const age = now - bark.showAt;
        const alpha = Math.min(1, age / 200) * Math.min(1, (bark.lifetime - age) / 400);
        const overlay = animatedOverlayRef.current;
        if (!overlay) continue;
        activeBarkIds.add(bark.id);
        let bubble = barkElementsRef.current.get(bark.id);
        if (!bubble) {
          bubble = document.createElement("div");
          bubble.dataset.barkId = String(bark.id);
          bubble.style.position = "absolute";
          bubble.style.pointerEvents = "none";
          bubble.style.boxSizing = "border-box";
          bubble.style.padding = "4px 8px";
          bubble.style.border = "1px solid rgba(226,232,240,0.72)";
          bubble.style.borderRadius = "3px";
          bubble.style.background = "rgba(15,18,30,0.94)";
          bubble.style.color = "#f8fafc";
          bubble.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
          bubble.style.fontWeight = "700";
          bubble.style.lineHeight = "1.2";
          bubble.style.textAlign = "center";
          bubble.style.whiteSpace = "normal";
          bubble.style.overflowWrap = "break-word";
          bubble.style.boxShadow = "0 3px 12px rgba(0,0,0,0.72)";
          bubble.style.transformOrigin = "center bottom";
          bubble.style.willChange = "transform,opacity";
          overlay.appendChild(bubble);
          barkElementsRef.current.set(bark.id, bubble);
        }
        if (bubble.textContent !== bark.text) bubble.textContent = bark.text;
        const stackKey = bark.actorId || `${bark.cell[0]}:${bark.cell[1]}`;
        const stackIndex = barkStackByActor.get(stackKey) || 0;
        barkStackByActor.set(stackKey, stackIndex + 1);
        const x = Math.max(72, Math.min(cssW - 72, anchor.cx));
        const headY = actorAnchor?.headY ?? anchor.cz - macroTile * 0.72;
        const y = Math.max(36, headY - 6 - stackIndex * macroTile * 0.58);
        bubble.style.display = "block";
        bubble.style.opacity = alpha.toFixed(3);
        bubble.style.fontSize = `${Math.max(10, Math.min(14, Math.floor(macroTile * 0.3)))}px`;
        bubble.style.maxWidth = `${Math.max(128, Math.min(280, macroTile * 4.2))}px`;
        bubble.style.zIndex = "2147483000";
        bubble.style.transform = `translate3d(${snapOverlayPx(x)}px, ${snapOverlayPx(y)}px, 0) translate(-50%, -100%)`;
      }
      barkElementsRef.current.forEach((bubble, id) => {
        if (activeBarkIds.has(id)) return;
        bubble.remove();
        barkElementsRef.current.delete(id);
      });
      for (const popup of fx.popups) {
        const age = now - popup.born;
        if (age > POPUP_LIFETIME_MS) continue;
        if (!inView(popup.cell[0], popup.cell[1], 4 * ratio)) continue;
        const t = age / POPUP_LIFETIME_MS;
        const cx = sx(popup.cell[0]);
        const cz = sy(popup.cell[1]) - macroTile * 0.5 - t * macroTile * 1.1 - (popup.y - 1.1) * macroTile * 0.3;
        ctx.globalAlpha = 1 - t;
        ctx.font = `bold ${Math.max(12, Math.floor(macroTile * 0.42))}px ui-sans-serif, system-ui`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(popup.text, cx, cz);
        ctx.fillStyle = popup.color;
        ctx.fillText(popup.text, cx, cz);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = "left";

      const hurtAge = now - fx.playerHurtAt;
      if (hurtAge < 600) {
        ctx.globalAlpha = 0.35 * (1 - hurtAge / 600);
        ctx.fillStyle = "#b3001b";
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.globalAlpha = 1;
      }
      if (p.inCombat) {
        ctx.strokeStyle = "rgba(200,60,60,0.5)";
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, cssW - 4, cssH - 4);
      }
      hideInactiveAnimatedSprites();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try { draw(dt); } catch { /* keep the loop alive on transient errors */ }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      animatedSpriteElementsRef.current.forEach((entry) => entry.img.remove());
      animatedSpriteElementsRef.current.clear();
      barkElementsRef.current.forEach((bubble) => bubble.remove());
      barkElementsRef.current.clear();
    };
  }, []);

  // ── Pointer → cell ──
  const cellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    const wx = cam.cx + (lx - cam.w / 2) / cam.tile;
    const wz = cam.cz + (ly - cam.h / 2) / cam.tile;
    return [Math.round(wx), Math.round(wz)];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    // Pan with middle/right button in the editor.
    if (isEditor && (e.button === 1 || e.button === 2)) {
      const ev = editorViewRef.current;
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: ev.cx, cz: ev.cz };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const [x, z] = cellFromEvent(e);
    if (isEditor) {
      paintingRef.current = true;
      lastPaintRef.current = `${x}:${z}`;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    p.onCellClick?.(x, z);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    if (panRef.current.active) {
      const ev = editorViewRef.current;
      ev.cx = panRef.current.cx - (e.clientX - panRef.current.sx) / ev.tile;
      ev.cz = panRef.current.cz - (e.clientY - panRef.current.sy) / ev.tile;
      return;
    }
    const [x, z] = cellFromEvent(e);
    p.onCellHover?.(x, z);
    if (isEditor && paintingRef.current) {
      const key = `${x}:${z}`;
      if (key !== lastPaintRef.current) {
        lastPaintRef.current = key;
        p.onCellClick?.(x, z);
      }
    }
  };

  const endInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    paintingRef.current = false;
    panRef.current.active = false;
    lastPaintRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!isEditor) return;
    const ev = editorViewRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    ev.tile = Math.max(4, Math.min(80, ev.tile * factor));
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ touchAction: "none", display: "block", zIndex: 0 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onPointerLeave={(e) => { endInteraction(e); propsRef.current.onPointerOut?.(); }}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={animatedOverlayRef}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 1 }}
      />
    </div>
  );
}

export default GameRenderer2D;
