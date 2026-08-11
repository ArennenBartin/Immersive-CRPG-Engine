import { stableContentHash } from "../generation-facing/stableHash";
import { GamePackageSchema, type GamePackage } from "../schema/game";
import {
  BACKROOMS_ANOMALY_OBJECTS,
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
} from "../data/backroomsAnomalyAssets";
import {
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL0_CMT_PHASE6_AMBIENCE,
  LEVEL0_CMT_PHASE6_AUDIO,
  LEVEL0_CMT_PHASE6_CUTSCENES,
  LEVEL0_CMT_PHASE6_EVENT_PROFILE,
  LEVEL0_CMT_PHASE6_MOTIF,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
} from "./presets/level0Cmt";
import {
  LEVEL0_TO_LEVEL1_PRESENTATION,
  LEVEL0_TO_LEVEL1_TRANSITION,
  LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL1_TO_LEVEL0_PRESENTATION,
  LEVEL1_TO_LEVEL0_TRANSITION,
} from "./presets/level1Cmt";
import type { BackroomsRecipeDef } from "./types";

export interface InstallLevel0CmtPhase6ContentOptions {
  mapId: string;
  recipe?: BackroomsRecipeDef;
  /** Phase 10 remains available to authored projects, but the bundled demo is Level 0-only. */
  includeCrossLevelContent?: boolean;
}

const mergeStableDefinition = <T extends { id: string }>(
  values: readonly T[],
  incoming: T,
  label: string,
): T[] => {
  const existing = values.find((entry) => entry.id === incoming.id);
  if (existing && stableContentHash(existing) !== stableContentHash(incoming)) {
    throw new Error(`${label} ID ${incoming.id} already belongs to different authored content`);
  }
  return existing ? [...values] : [...values, structuredClone(incoming)];
};

const mergeLevelProfileWithPhase7Upgrade = <T extends {
  id: string;
  anomalyProfileId?: string;
}>(
  values: readonly T[],
  incoming: T,
): T[] => {
  const existingIndex = values.findIndex((entry) => entry.id === incoming.id);
  if (existingIndex < 0) return [...values, structuredClone(incoming)];
  const existing = values[existingIndex];
  if (stableContentHash(existing) === stableContentHash(incoming)) return [...values];
  const { anomalyProfileId: _incomingAnomalyId, ...incomingPhase6Shape } = incoming;
  if (!existing.anomalyProfileId &&
      stableContentHash(existing) === stableContentHash(incomingPhase6Shape)) {
    return values.map((entry, index) =>
      index === existingIndex ? structuredClone(incoming) : entry);
  }
  throw new Error(
    `Backrooms level profile ID ${incoming.id} already belongs to different authored content`,
  );
};

const PHASE2_UPGRADABLE_OBJECT_IDS = new Set([
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
]);

const mergeAnomalyObjectWithAssetUpgrade = (
  values: readonly GamePackage["object_library"][number][],
  incoming: GamePackage["object_library"][number],
): GamePackage["object_library"] => {
  const existingIndex = values.findIndex((entry) => entry.id === incoming.id);
  if (existingIndex < 0) return [...values, structuredClone(incoming)];
  const existing = values[existingIndex];
  if (stableContentHash(existing) === stableContentHash(incoming)) return [...values];
  if (PHASE2_UPGRADABLE_OBJECT_IDS.has(incoming.id) &&
      existing.tags.includes("phase2_anomaly_kit") &&
      incoming.tags.includes("phase2_anomaly_kit") &&
      existing.asset?.data_url === incoming.asset?.data_url &&
      existing.asset?.stats && incoming.asset?.stats) {
    const normalizedIncoming = structuredClone(incoming);
    normalizedIncoming.asset!.stats.bytes = existing.asset.stats.bytes;
    if (stableContentHash(existing) === stableContentHash(normalizedIncoming)) {
      return values.map((entry, index) =>
        index === existingIndex ? structuredClone(incoming) : entry);
    }
  }
  throw new Error(
    `Backrooms anomaly object ID ${incoming.id} already belongs to different authored content`,
  );
};

const LEGACY_PARTIAL_PHASE7_ANOMALY_IDS = new Set([
  "anomaly.filing_cabinet.wall_clip",
  "anomaly.desk.backwards",
  "anomaly.desk.recursive_chain",
]);

const mergeAnomalyProfileWithPhase8Upgrade = (
  values: readonly GamePackage["backrooms_anomaly_profiles"][number][],
  incoming: GamePackage["backrooms_anomaly_profiles"][number],
): GamePackage["backrooms_anomaly_profiles"] => {
  const existingIndex = values.findIndex((entry) => entry.id === incoming.id);
  if (existingIndex < 0) return [...values, structuredClone(incoming)];
  const existing = values[existingIndex];
  if (stableContentHash(existing) === stableContentHash(incoming)) return [...values];
  const { progression: _incomingProgression, ...incomingPhase7Shape } = incoming;
  const { progression: existingProgression, ...existingBaseShape } = existing;
  const recognizedCanonicalPhase7 =
    incoming.progression?.enabled === true &&
    (!existingProgression || existingProgression.enabled === false) &&
    stableContentHash(existingBaseShape) === stableContentHash(incomingPhase7Shape);
  if (recognizedCanonicalPhase7) {
    return values.map((entry, index) =>
      index === existingIndex ? structuredClone(incoming) : entry);
  }
  const recognizedPartialPhase7 =
    existing.id === LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.id &&
    existing.name === LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.name &&
    stableContentHash(existing.density.ordinary) ===
      stableContentHash(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.ordinary) &&
    stableContentHash(existing.density.lowIntensity) ===
      stableContentHash(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.lowIntensity) &&
    stableContentHash(existing.density.recursive) ===
      stableContentHash(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.recursive) &&
    existing.density.hero.max === LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.hero.max &&
    existing.density.hero.min === 0 &&
    existing.neverAdjacentHero === true &&
    existing.maxAnomaliesPerMap === LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.maxAnomaliesPerMap &&
    existing.anomalies.length > 0 &&
    existing.anomalies.every((entry) => LEGACY_PARTIAL_PHASE7_ANOMALY_IDS.has(entry.id));
  if (recognizedPartialPhase7) {
    return values.map((entry, index) =>
      index === existingIndex ? structuredClone(incoming) : entry);
  }
  throw new Error(
    `Backrooms anomaly profile ID ${incoming.id} already belongs to different authored content`,
  );
};

/**
 * Installs the ordinary cutscenes/audio definitions referenced by a Phase 6
 * map. Trigger witness state still lives in the normal save's trig_run flags.
 */
export const installLevel0CmtPhase6Content = (
  sourcePackage: GamePackage,
  options: InstallLevel0CmtPhase6ContentOptions,
): GamePackage => {
  let cutscenes = [...sourcePackage.cutscenes];
  LEVEL0_CMT_PHASE6_CUTSCENES.forEach((cutscene) => {
    cutscenes = mergeStableDefinition(cutscenes, cutscene, "Cutscene");
  });
  let motifs = mergeStableDefinition(
    sourcePackage.backrooms_motifs,
    LEVEL0_CMT_PHASE6_MOTIF,
    "Backrooms motif",
  );
  let eventProfiles = mergeStableDefinition(
    sourcePackage.backrooms_event_profiles,
    LEVEL0_CMT_PHASE6_EVENT_PROFILE,
    "Backrooms event profile",
  );
  let levelProfiles = mergeLevelProfileWithPhase7Upgrade(
    sourcePackage.backrooms_level_profiles,
    LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
  );
  if (options.includeCrossLevelContent) {
    levelProfiles = mergeStableDefinition(
      levelProfiles,
      LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE,
      "Backrooms level profile",
    );
  }
  let transitionRules = [...sourcePackage.backrooms_transition_rules];
  if (options.includeCrossLevelContent) {
    for (const rule of [
      LEVEL0_TO_LEVEL1_TRANSITION,
      LEVEL1_TO_LEVEL0_TRANSITION,
    ]) {
      transitionRules = mergeStableDefinition(
        transitionRules,
        rule,
        "Backrooms transition rule",
      );
    }
  }
  let transitionPresentationProfiles = [
    ...sourcePackage.transition_presentation_profiles,
  ];
  if (options.includeCrossLevelContent) {
    for (const profile of [
      LEVEL0_TO_LEVEL1_PRESENTATION,
      LEVEL1_TO_LEVEL0_PRESENTATION,
    ]) {
      transitionPresentationProfiles = mergeStableDefinition(
        transitionPresentationProfiles,
        profile,
        "Transition presentation profile",
      );
    }
  }
  let anomalyProfiles = mergeAnomalyProfileWithPhase8Upgrade(
    sourcePackage.backrooms_anomaly_profiles,
    LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  );
  let objectLibrary = [...sourcePackage.object_library];
  for (const object of BACKROOMS_ANOMALY_OBJECTS) {
    objectLibrary = mergeAnomalyObjectWithAssetUpgrade(
      objectLibrary,
      object,
    );
  }
  let recipes = [...sourcePackage.backrooms_recipes];
  if (options.recipe) {
    recipes = mergeStableDefinition(recipes, options.recipe, "Backrooms recipe");
  }

  const settings = sourcePackage.settings ?? {};
  const musicTracks = {
    ...((settings.music_tracks ?? {}) as Record<string, string>),
    [LEVEL0_CMT_PHASE6_AUDIO.humMusicId]: LEVEL0_CMT_PHASE6_AUDIO.humUrl,
  };
  const soundEffects = {
    ...((settings.sound_effects ?? {}) as Record<string, string>),
    [LEVEL0_CMT_PHASE6_AUDIO.electricalPopId]: LEVEL0_CMT_PHASE6_AUDIO.electricalPopUrl,
    [LEVEL0_CMT_PHASE6_AUDIO.distantImpactId]: LEVEL0_CMT_PHASE6_AUDIO.distantImpactUrl,
  };
  const mapMusic = {
    ...((settings.map_music ?? {}) as Record<string, string>),
    [options.mapId]: LEVEL0_CMT_PHASE6_AUDIO.humMusicId,
  };

  // Parsing applies the same defaults used by normal imports and guarantees
  // that generated narrative content remains a conventional game package.
  return GamePackageSchema.parse({
    ...sourcePackage,
    settings: {
      ...settings,
      music_tracks: musicTracks,
      sound_effects: soundEffects,
      map_music: mapMusic,
      backrooms_ambience_profiles: {
        ...((settings.backrooms_ambience_profiles ?? {}) as Record<string, unknown>),
        [LEVEL0_CMT_PHASE6_AMBIENCE.id]: LEVEL0_CMT_PHASE6_AMBIENCE,
      },
    },
    cutscenes,
    object_library: objectLibrary,
    backrooms_recipes: recipes,
    backrooms_level_profiles: levelProfiles,
    backrooms_transition_rules: transitionRules,
    transition_presentation_profiles: transitionPresentationProfiles,
    backrooms_motifs: motifs,
    backrooms_event_profiles: eventProfiles,
    backrooms_anomaly_profiles: anomalyProfiles,
  });
};
