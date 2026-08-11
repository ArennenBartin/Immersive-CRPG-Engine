import type {
  GamePackage,
  MapData,
  MapExitData,
  TransitionPresentationProfileData,
} from "../schema/game";
import type {
  BackroomsTransitionRuleDef,
  TransitionPresentationAction,
} from "./types";

export type TransitionComfortSettings = {
  reducedMotion: boolean;
  photosensitivity: boolean;
  audioComfort: "full" | "reduced" | "muted";
};

export const DEFAULT_TRANSITION_COMFORT_SETTINGS: TransitionComfortSettings = {
  reducedMotion: false,
  photosensitivity: false,
  audioComfort: "full",
};

/**
 * Comfort filtering is a pure presentation step. It never changes the exit,
 * target map, target spawn, or any physical map data.
 */
export const resolveTransitionPresentationActions = (
  profile: TransitionPresentationProfileData | undefined,
  comfort: TransitionComfortSettings = DEFAULT_TRANSITION_COMFORT_SETTINGS,
): TransitionPresentationProfileData["actions"] => {
  if (!profile) return [];
  const resolved: TransitionPresentationAction[] = [];
  for (const action of profile.actions) {
    if (action.type === "play_sound") {
      if (comfort.audioComfort !== "muted") {
        resolved.push({
          ...action,
          volume:
            comfort.audioComfort === "reduced"
              ? Math.min(0.22, action.volume * 0.45)
              : action.volume,
        });
      }
      continue;
    }
    if (action.type === "screen_pulse") {
      if (!comfort.photosensitivity) {
        resolved.push({
          ...action,
          peakOpacity: comfort.reducedMotion
            ? Math.min(0.16, action.peakOpacity)
            : action.peakOpacity,
          repetitions: comfort.reducedMotion ? 1 : action.repetitions,
          durationMs: comfort.reducedMotion
            ? Math.max(180, action.durationMs)
            : action.durationMs,
        });
      }
      continue;
    }
    resolved.push({
      ...action,
      peakOpacity: comfort.photosensitivity
        ? Math.min(0.2, action.peakOpacity)
        : comfort.reducedMotion
          ? Math.min(0.32, action.peakOpacity)
          : action.peakOpacity,
      attackMs: comfort.reducedMotion ? 0 : action.attackMs,
      holdMs: comfort.reducedMotion ? Math.min(80, action.holdMs) : action.holdMs,
      releaseMs: comfort.reducedMotion
        ? Math.min(220, action.releaseMs)
        : action.releaseMs,
    });
  }
  return resolved;
};

export const transitionPresentationForExit = (
  gamePackage: Pick<GamePackage, "transition_presentation_profiles">,
  exit: Pick<MapExitData, "presentation_profile_id">,
  comfort: TransitionComfortSettings = DEFAULT_TRANSITION_COMFORT_SETTINGS,
) => {
  const profile = exit.presentation_profile_id
    ? gamePackage.transition_presentation_profiles.find(
        (candidate) => candidate.id === exit.presentation_profile_id,
      )
    : undefined;
  return profile
    ? {
        profile,
        actions: resolveTransitionPresentationActions(profile, comfort),
      }
    : undefined;
};

export type BackroomsCrossLevelRoute = {
  rule: BackroomsTransitionRuleDef;
  sourceMap: MapData;
  targetMap: MapData;
  targetSpawnId: string;
  presentationProfile?: TransitionPresentationProfileData;
};

/**
 * Resolve the logical destination independently from the presentation. Maps
 * advertise their logical level through generation provenance, while the
 * resulting runtime travel is still an ordinary MapExit/ChangeMap command.
 */
export const resolveBackroomsCrossLevelRoute = (
  gamePackage: Pick<
    GamePackage,
    | "maps"
    | "backrooms_transition_rules"
    | "transition_presentation_profiles"
  >,
  sourceMapId: string,
  ruleId: string,
): BackroomsCrossLevelRoute | undefined => {
  const rule = gamePackage.backrooms_transition_rules.find(
    (candidate) => candidate.id === ruleId,
  );
  const sourceMap = gamePackage.maps.find((map) => map.id === sourceMapId);
  if (!rule || !sourceMap || sourceMap.generation?.generatorId !== "backrooms") {
    return undefined;
  }
  if (sourceMap.generation.levelProfileId !== rule.fromLevelProfileId) {
    return undefined;
  }
  const targetMap = gamePackage.maps.find(
    (map) =>
      map.generation?.generatorId === "backrooms" &&
      map.generation.levelProfileId === rule.toLevelProfileId &&
      map.spawns.length > 0,
  );
  if (!targetMap) return undefined;
  return {
    rule,
    sourceMap,
    targetMap,
    targetSpawnId: targetMap.spawns[0].id,
    presentationProfile: rule.presentationProfileId
      ? gamePackage.transition_presentation_profiles.find(
          (profile) => profile.id === rule.presentationProfileId,
        )
      : undefined,
  };
};

export const createBackroomsCrossLevelExit = (input: {
  id: string;
  pairedExitId?: string;
  cell: readonly [number, number];
  route: BackroomsCrossLevelRoute;
}): MapExitData => ({
  id: input.id,
  cell: [input.cell[0], input.cell[1]],
  target_map_id: input.route.targetMap.id,
  target_spawn_id: input.route.targetSpawnId,
  transition_id: input.route.rule.id,
  paired_exit_id: input.pairedExitId,
  transition_kind: input.route.rule.kind,
  presentation_profile_id: input.route.presentationProfile?.id,
});
