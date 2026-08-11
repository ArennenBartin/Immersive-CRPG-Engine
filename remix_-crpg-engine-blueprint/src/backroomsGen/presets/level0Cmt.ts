import { CutsceneSchema, type CutsceneData } from "../../schema/game";
import {
  BACKROOMS_BACKWARDS_DESK_OBJECT_ID,
  BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID,
  BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID,
  BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID,
  BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID,
  BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID,
  BACKROOMS_WRONG_CLOCK_OBJECT_ID,
  BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID,
} from "../../data/backroomsAnomalyAssets";
import {
  BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} from "../../schema/presets";
import {
  BackroomsAmbienceProfileSchema,
  BackroomsAnomalyProfileSchema,
  BackroomsAnchorRequestSchema,
  BackroomsEventProfileSchema,
  BackroomsLevelProfileSchema,
  BackroomsMotifSchema,
  BackroomsRecipeSchema,
  BackroomsWrongnessProgressionSchema,
} from "../schema";
import type {
  BackroomsAmbienceProfile,
  BackroomsAnomalyProfileDef,
  BackroomsAnchorRequest,
  BackroomsEventProfileDef,
  BackroomsLevelProfileDef,
  BackroomsMotifDef,
  BackroomsRecipeDef,
  BackroomsWrongnessProgressionDef,
} from "../types";

export const LEVEL0_CMT_BACKROOMS_RECIPE_ID = "backrooms.level0.cmt.v1";
export const LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE_ID = "backrooms.level0.cmt";
export const LEVEL0_CMT_PHASE6_MOTIF_ID = "motif.office_corner_03";
export const LEVEL0_CMT_PHASE6_EVENT_PROFILE_ID = "events.level0.cmt.noncombat";
export const LEVEL0_CMT_PHASE6_AMBIENCE_PROFILE_ID = "ambience.level0.cmt";
export const LEVEL0_CMT_PHASE7_ANOMALY_PROFILE_ID = "anomalies.level0.cmt";
export const LEVEL0_CMT_PHASE6_AUDIO = {
  humMusicId: "backrooms_level0_fluorescent_hum",
  humUrl: "/sfx/backrooms-fluorescent-hum.wav",
  electricalPopId: "backrooms_electrical_pop",
  electricalPopUrl: "/sfx/backrooms-electrical-pop.wav",
  distantImpactId: "backrooms_distant_impact",
  distantImpactUrl: "/sfx/bump.wav",
} as const;

export const LEVEL0_CMT_PHASE6_CUTSCENE_IDS = {
  electricalPop: "cutscene.backrooms.level0.electrical_pop",
  distantImpact: "cutscene.backrooms.level0.distant_impact",
  recognitionPause: "cutscene.backrooms.level0.recognition_pause",
} as const;

export const LEVEL0_CMT_PHASE6_MOTIF: BackroomsMotifDef =
  BackroomsMotifSchema.parse({
    id: LEVEL0_CMT_PHASE6_MOTIF_ID,
    name: "Office Corner 03",
    tags: ["backrooms", "level_zero", "recognizable_recurrence"],
    minSpacingRooms: 7,
    maxOccurrences: 4,
    stages: [
      {
        id: "chair_dead_fixture_stain",
        description: "A chair, a dead fluorescent fixture, and one dark carpet stain.",
        roomTags: ["backrooms_open_office", "recurrence_stage_1"],
        objectIds: [
          "obj_chair",
          BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
          BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
        ],
      },
      {
        id: "chair_faces_entrance",
        description: "The same corner returns, but the chair now faces the entrance.",
        roomTags: ["backrooms_open_office", "recurrence_stage_2"],
        objectIds: [
          "obj_chair",
          BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
          BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
        ],
      },
      {
        id: "chair_absent_fixture_working",
        description: "The chair is absent; the fluorescent fixture works; the stain remains.",
        roomTags: ["backrooms_open_office", "recurrence_stage_3"],
        objectIds: [
          BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
          BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
        ],
      },
      {
        id: "story_anchor_return",
        description: "The recurring office corner becomes a protected authored story island.",
        roomTags: ["backrooms_open_office", "backrooms_story_reserved", "recurrence_stage_4"],
        objectIds: [
          BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
          BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
        ],
        eventProfileId: LEVEL0_CMT_PHASE6_EVENT_PROFILE_ID,
      },
    ],
  });

export const LEVEL0_CMT_PHASE6_EVENT_PROFILE: BackroomsEventProfileDef =
  BackroomsEventProfileSchema.parse({
    id: LEVEL0_CMT_PHASE6_EVENT_PROFILE_ID,
    name: "Level 0 Non-Combat Pacing",
    maxEventsPerMap: 5,
    minSpacingRooms: 6,
    events: [
      {
        id: "event.electrical_pop",
        kind: "environmental",
        weight: 4,
        roomTags: ["quiet", "connective"],
        cutsceneId: LEVEL0_CMT_PHASE6_CUTSCENE_IDS.electricalPop,
        oneShot: true,
      },
      {
        id: "event.distant_impact",
        kind: "environmental",
        weight: 2,
        roomTags: ["quiet", "long_sightline"],
        cutsceneId: LEVEL0_CMT_PHASE6_CUTSCENE_IDS.distantImpact,
        oneShot: true,
      },
      {
        id: "event.recognition_pause",
        kind: "narrative",
        weight: 1,
        roomTags: ["recurrence", "recognition"],
        cutsceneId: LEVEL0_CMT_PHASE6_CUTSCENE_IDS.recognitionPause,
        oneShot: true,
      },
    ],
  });

export const LEVEL0_CMT_PHASE6_AMBIENCE: BackroomsAmbienceProfile =
  BackroomsAmbienceProfileSchema.parse({
    id: LEVEL0_CMT_PHASE6_AMBIENCE_PROFILE_ID,
    name: "Level 0 Fluorescent Ambience",
    layers: [
      {
        id: "layer.fluorescent_hum",
        role: "base_hum",
        musicId: LEVEL0_CMT_PHASE6_AUDIO.humMusicId,
        musicUrl: LEVEL0_CMT_PHASE6_AUDIO.humUrl,
        volume: 0.16,
        loop: true,
        minSpacingRooms: 0,
        maxOccurrences: 1,
      },
      {
        id: "layer.electrical_texture",
        role: "electrical_texture",
        soundId: LEVEL0_CMT_PHASE6_AUDIO.electricalPopId,
        soundUrl: LEVEL0_CMT_PHASE6_AUDIO.electricalPopUrl,
        volume: 0.18,
        loop: false,
        minSpacingRooms: 6,
        maxOccurrences: 4,
      },
      {
        id: "layer.rare_impact",
        role: "rare_anomaly",
        soundId: LEVEL0_CMT_PHASE6_AUDIO.distantImpactId,
        soundUrl: LEVEL0_CMT_PHASE6_AUDIO.distantImpactUrl,
        volume: 0.12,
        loop: false,
        minSpacingRooms: 10,
        maxOccurrences: 2,
      },
    ],
  });

export const LEVEL0_CMT_PHASE6_CUTSCENES: readonly CutsceneData[] =
  CutsceneSchema.array().parse([
    {
      id: LEVEL0_CMT_PHASE6_CUTSCENE_IDS.electricalPop,
      display_name: "Level 0 — Electrical Pop",
      is_blocking: false,
      actions: [
        { type: "play_sound", sound_id: LEVEL0_CMT_PHASE6_AUDIO.electricalPopId, volume: 0.18 },
        { type: "emit_sound", sound_loudness: 3, sound_tag: "fluorescent_pop", sound_category: "environmental", sound_duration_ticks: 2 },
      ],
    },
    {
      id: LEVEL0_CMT_PHASE6_CUTSCENE_IDS.distantImpact,
      display_name: "Level 0 — Distant Impact",
      is_blocking: false,
      actions: [
        { type: "play_sound", sound_id: LEVEL0_CMT_PHASE6_AUDIO.distantImpactId, volume: 0.12 },
        { type: "emit_sound", sound_loudness: 7, sound_tag: "distant_impact", sound_category: "environmental", sound_duration_ticks: 3 },
      ],
    },
    {
      id: LEVEL0_CMT_PHASE6_CUTSCENE_IDS.recognitionPause,
      display_name: "Level 0 — Recognition Pause",
      is_blocking: false,
      actions: [
        { type: "play_sound", sound_id: LEVEL0_CMT_PHASE6_AUDIO.electricalPopId, volume: 0.1 },
        { type: "emit_sound", sound_loudness: 2, sound_tag: "recognition", sound_category: "narrative", sound_duration_ticks: 1 },
      ],
    },
  ]);

export const LEVEL0_CMT_PHASE7_ANOMALY_PROFILE: BackroomsAnomalyProfileDef =
  BackroomsAnomalyProfileSchema.parse({
    id: LEVEL0_CMT_PHASE7_ANOMALY_PROFILE_ID,
    name: "Level 0 Sparse Wrongness",
    density: {
      ordinary: { min: 0.75, max: 0.85 },
      lowIntensity: { min: 0.1, max: 0.18 },
      recursive: { min: 0.03, max: 0.06 },
      hero: { min: 0.01, max: 0.02 },
    },
    neverAdjacentHero: true,
    maxAnomaliesPerMap: 16,
    anomalies: [
      {
        id: "anomaly.filing_cabinet.wall_clip",
        class: "low_intensity",
        kind: "partial_embed",
        weight: 3,
        assetIds: [BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "wall",
        minSpacingRooms: 1,
        partialEmbed: {
          anchor: "wall",
          mode: "wall_clip",
          penetrationRatio: { min: 0.38, max: 0.52 },
          rotationJitterDegrees: 2,
          collisionPolicy: "none",
          requireOpaqueBacking: true,
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.clock.many_handed",
        class: "low_intensity",
        kind: "wrong_decoration",
        weight: 1,
        assetIds: [BACKROOMS_WRONG_CLOCK_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "wall",
        minSpacingRooms: 1,
        wrongDecoration: {
          yawDegrees: { min: -2, max: 2 },
          pitchDegrees: { min: -1, max: 1 },
          wallInsetMeters: { min: 0.02, max: 0.05 },
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.light.vertical_wall_mount",
        class: "low_intensity",
        kind: "wrong_decoration",
        weight: 1,
        assetIds: [BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "wall",
        minSpacingRooms: 1,
        wrongDecoration: {
          yawDegrees: { min: -1.5, max: 1.5 },
          pitchDegrees: { min: 0, max: 0 },
          wallInsetMeters: { min: 0.02, max: 0.05 },
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.desk.backwards",
        class: "low_intensity",
        kind: "wrong_decoration",
        weight: 2,
        assetIds: [BACKROOMS_BACKWARDS_DESK_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "floor",
        minSpacingRooms: 1,
        wrongDecoration: {
          yawDegrees: { min: -4, max: 4 },
          pitchDegrees: { min: 0, max: 2.5 },
          wallInsetMeters: { min: 0.06, max: 0.12 },
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.exit_sign.blank_wall",
        class: "low_intensity",
        kind: "wrong_decoration",
        weight: 1,
        assetIds: [BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "wall",
        minSpacingRooms: 1,
        wrongDecoration: {
          yawDegrees: { min: -3, max: 3 },
          pitchDegrees: { min: -1, max: 1 },
          wallInsetMeters: { min: 0.02, max: 0.05 },
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.desk.partition_bisect",
        class: "low_intensity",
        kind: "partial_embed",
        weight: 1,
        assetIds: [BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "partition",
        minSpacingRooms: 2,
        partialEmbed: {
          anchor: "partition",
          mode: "partition_bisect",
          penetrationRatio: { min: 0.4, max: 0.4 },
          rotationJitterDegrees: 0,
          collisionPolicy: "none",
          requireOpaqueBacking: false,
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.chair.recursive_chain",
        class: "recursive",
        kind: "recursive_chain",
        weight: 1,
        assetIds: [BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "floor",
        minSpacingRooms: 4,
        recursive: {
          copyCount: { min: 4, max: 6 },
          scaleFalloff: { min: 0.82, max: 0.88 },
          rotationStepDegrees: { min: 2, max: 7 },
          tiltStepDegrees: { min: 0, max: 4 },
          sinkStepMeters: { min: 0.01, max: 0.03 },
          keepClearanceCells: 1,
        },
      },
      {
        id: "anomaly.cabinet.impossible",
        class: "hero",
        kind: "impossible_object",
        weight: 1,
        assetIds: [BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID],
        collisionPolicy: "none",
        requiredAnchor: "reserved_room",
        minSpacingRooms: 12,
      },
    ],
  });

/** Phase 8 remains a separate profile upgrade so Phase 7 can be replayed. */
export const LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION: BackroomsWrongnessProgressionDef =
  BackroomsWrongnessProgressionSchema.parse({
    enabled: true,
    earlySafeThrough: 3,
    recursiveFrom: 10,
    heroFrom: 16,
    zoneTags: {
      earlySafe: ["story_reserved"],
      lowIntensity: ["wrongness_low"],
      recursive: ["wrongness_recursive"],
      hero: ["wrongness_hero"],
    },
  });

export const LEVEL0_CMT_PHASE8_ANOMALY_PROFILE: BackroomsAnomalyProfileDef =
  BackroomsAnomalyProfileSchema.parse({
    ...LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
    progression: LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION,
  });

export const LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE: BackroomsLevelProfileDef =
  BackroomsLevelProfileSchema.parse({
    id: LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE_ID,
    name: "CMT Backrooms — Level 0",
    description: "Drab fluorescent Level 0 with protected story islands and sparse recurrence.",
    roomTags: ["backrooms", "level_zero", "quiet"],
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
    transitionRuleIds: [],
    motifIds: [LEVEL0_CMT_PHASE6_MOTIF_ID],
    eventProfileIds: [LEVEL0_CMT_PHASE6_EVENT_PROFILE_ID],
    anomalyProfileId: LEVEL0_CMT_PHASE7_ANOMALY_PROFILE_ID,
  });

export const LEVEL0_CMT_PHASE4_ANCHORS: readonly BackroomsAnchorRequest[] =
  BackroomsAnchorRequestSchema.array().parse([
    {
      id: "anchor.survivor_pocket",
      kind: "narrative",
      tags: ["survivor_pocket", "story_reserved"],
    },
    {
      id: "anchor.parasite_reveal_corridor",
      kind: "narrative",
      tags: ["long_sightline", "parasite_reveal", "story_reserved"],
    },
    {
      id: "anchor.wall_person_tableau",
      kind: "set_piece",
      tags: ["story_reserved", "wall_person_tableau"],
    },
  ]);

export const createLevel0CmtBackroomsRecipe = (
  seed = "level0-cmt-semantic-001",
): BackroomsRecipeDef => BackroomsRecipeSchema.parse({
  id: LEVEL0_CMT_BACKROOMS_RECIPE_ID,
  name: "CMT Backrooms — Level 0",
  description: "A quiet, loop-heavy Level 0 semantic crawl with sparse protected story anchors.",
  version: "1.0.0",
  generatorId: "backrooms",
  generatorVersion: "backrooms_v1",
  seed,
  stageSalts: {},
  levelProfileId: LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE_ID,
  scale: {
    roomCount: { min: 52, max: 68 },
    mapWidth: 160,
    mapDepth: 160,
    targetTraversalMinutes: { min: 5, max: 9 },
  },
  navigation: {
    incidentalDeadEndRatio: { min: 0.02, max: 0.08 },
    loopDensity: { min: 0.22, max: 0.3 },
    landmarkSpacingRooms: { min: 7, max: 12 },
    anchorSpacingRooms: { min: 7, max: 14 },
  },
  pacing: {
    maxQuietRoomsBeforeNoveltyBoost: 8,
    setPieceCount: { min: 1, max: 2 },
    hostileEncounterRatio: { min: 0, max: 0.03 },
  },
  constraints: {
    maxGenerationAttempts: 8,
    maxEmbeddingBacktracks: 2_000,
  },
});
