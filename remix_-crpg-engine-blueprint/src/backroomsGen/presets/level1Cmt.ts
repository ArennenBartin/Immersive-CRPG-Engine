import {
  BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} from "../../schema/presets";
import {
  BackroomsLevelProfileSchema,
  BackroomsRecipeSchema,
  BackroomsTransitionRuleSchema,
  TransitionPresentationProfileSchema,
} from "../schema";
import type {
  BackroomsLevelProfileDef,
  BackroomsRecipeDef,
  BackroomsTransitionRuleDef,
  TransitionPresentationProfile,
} from "../types";
import {
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE_ID,
  LEVEL0_CMT_PHASE6_EVENT_PROFILE_ID,
  LEVEL0_CMT_PHASE6_MOTIF_ID,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE_ID,
} from "./level0Cmt";

export const LEVEL1_CMT_BACKROOMS_RECIPE_ID = "backrooms.level1.cmt.v1";
export const LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE_ID = "backrooms.level1.cmt";
export const LEVEL0_TO_LEVEL1_TRANSITION_ID =
  "transition.backrooms.level0_to_level1";
export const LEVEL1_TO_LEVEL0_TRANSITION_ID =
  "transition.backrooms.level1_to_level0";
export const LEVEL0_TO_LEVEL1_PRESENTATION_ID =
  "presentation.backrooms.threshold_descent";
export const LEVEL1_TO_LEVEL0_PRESENTATION_ID =
  "presentation.backrooms.threshold_return";

export const LEVEL0_TO_LEVEL1_PRESENTATION: TransitionPresentationProfile =
  TransitionPresentationProfileSchema.parse({
    id: LEVEL0_TO_LEVEL1_PRESENTATION_ID,
    name: "Threshold Descent",
    description:
      "A restrained warm blackout and single low pulse around a Level change.",
    actions: [
      {
        type: "screen_tint",
        color: "#120f08",
        peakOpacity: 0.82,
        attackMs: 110,
        holdMs: 90,
        releaseMs: 620,
      },
      {
        type: "screen_pulse",
        color: "#75633a",
        peakOpacity: 0.18,
        durationMs: 360,
        repetitions: 1,
      },
      {
        type: "play_sound",
        soundId: "door_transition",
        volume: 0.28,
        playbackRate: 0.72,
      },
    ],
  });

export const LEVEL1_TO_LEVEL0_PRESENTATION: TransitionPresentationProfile =
  TransitionPresentationProfileSchema.parse({
    id: LEVEL1_TO_LEVEL0_PRESENTATION_ID,
    name: "Threshold Return",
    actions: [
      {
        type: "screen_tint",
        color: "#c6b15e",
        peakOpacity: 0.34,
        attackMs: 80,
        holdMs: 40,
        releaseMs: 480,
      },
      {
        type: "play_sound",
        soundId: "door_transition",
        volume: 0.22,
        playbackRate: 1.08,
      },
    ],
  });

export const LEVEL0_TO_LEVEL1_TRANSITION: BackroomsTransitionRuleDef =
  BackroomsTransitionRuleSchema.parse({
    id: LEVEL0_TO_LEVEL1_TRANSITION_ID,
    name: "Level 0 Service Threshold",
    fromLevelProfileId: LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE_ID,
    toLevelProfileId: LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE_ID,
    kind: "threshold",
    presentationProfileId: LEVEL0_TO_LEVEL1_PRESENTATION_ID,
    oneWay: false,
    minGraphDistance: 16,
    requiredRoomTags: ["transition"],
  });

export const LEVEL1_TO_LEVEL0_TRANSITION: BackroomsTransitionRuleDef =
  BackroomsTransitionRuleSchema.parse({
    id: LEVEL1_TO_LEVEL0_TRANSITION_ID,
    name: "Level 1 Return Threshold",
    fromLevelProfileId: LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE_ID,
    toLevelProfileId: LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE_ID,
    kind: "threshold",
    presentationProfileId: LEVEL1_TO_LEVEL0_PRESENTATION_ID,
    oneWay: false,
    minGraphDistance: 10,
    requiredRoomTags: ["transition"],
  });

/**
 * Phase 10 proves level identity and cross-level routing first. Level 1 keeps
 * the validated, performant structural kit while using its own semantic and
 * presentation profile; a later art pass can replace those object lists
 * without changing transition/runtime code.
 */
export const LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE: BackroomsLevelProfileDef =
  BackroomsLevelProfileSchema.parse({
    id: LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE_ID,
    name: "CMT Backrooms — Level 1",
    description:
      "A lower, dimmer service level with its own routing and entry treatment.",
    roomTags: ["backrooms", "level_one", "service", "quiet"],
    wallObjectIds: [BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID],
    floorObjectIds: [BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID],
    ceilingObjectIds: [
      BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
      BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
    ],
    lightObjectIds: [BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID],
    ordinaryDressingObjectIds: [
      "obj_chair",
      BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
      BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
    ],
    presentationProfileId: LEVEL0_TO_LEVEL1_PRESENTATION_ID,
    transitionRuleIds: [LEVEL1_TO_LEVEL0_TRANSITION_ID],
    motifIds: [LEVEL0_CMT_PHASE6_MOTIF_ID],
    eventProfileIds: [LEVEL0_CMT_PHASE6_EVENT_PROFILE_ID],
    anomalyProfileId: LEVEL0_CMT_PHASE7_ANOMALY_PROFILE_ID,
  });

export const createLevel1CmtBackroomsRecipe = (
  seed = "level1-cmt-semantic-001",
): BackroomsRecipeDef => BackroomsRecipeSchema.parse({
  id: LEVEL1_CMT_BACKROOMS_RECIPE_ID,
  name: "CMT Backrooms — Level 1",
  description:
    "A compact service-level proof for reusable cross-level transitions.",
  version: "1.0.0",
  generatorId: "backrooms",
  generatorVersion: "backrooms_v1",
  seed,
  stageSalts: {},
  levelProfileId: LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE_ID,
  scale: {
    roomCount: { min: 24, max: 32 },
    mapWidth: 144,
    mapDepth: 144,
    targetTraversalMinutes: { min: 3, max: 5 },
  },
  navigation: {
    incidentalDeadEndRatio: { min: 0.03, max: 0.1 },
    loopDensity: { min: 0.2, max: 0.28 },
    landmarkSpacingRooms: { min: 6, max: 10 },
    anchorSpacingRooms: { min: 6, max: 11 },
  },
  pacing: {
    maxQuietRoomsBeforeNoveltyBoost: 7,
    setPieceCount: { min: 1, max: 1 },
    hostileEncounterRatio: { min: 0, max: 0.02 },
  },
  constraints: {
    maxGenerationAttempts: 8,
    maxEmbeddingBacktracks: 2_000,
  },
});
