import { generateBackroomsMap } from "../../backroomsGen/generate";
import { installLevel0CmtPhase6Content } from "../../backroomsGen/content";
import {
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE6_AUDIO,
  LEVEL0_CMT_PHASE6_CUTSCENES,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  createLevel0CmtBackroomsRecipe,
} from "../../backroomsGen/presets/level0Cmt";
import {
  LEVEL0_TO_LEVEL1_PRESENTATION,
  LEVEL0_TO_LEVEL1_PRESENTATION_ID,
  LEVEL0_TO_LEVEL1_TRANSITION,
  LEVEL1_TO_LEVEL0_PRESENTATION,
  LEVEL1_TO_LEVEL0_PRESENTATION_ID,
  LEVEL1_TO_LEVEL0_TRANSITION,
  LEVEL1_TO_LEVEL0_TRANSITION_ID,
  createLevel1CmtBackroomsRecipe,
} from "../../backroomsGen/presets/level1Cmt";
import {
  createBackroomsCrossLevelExit,
  resolveBackroomsCrossLevelRoute,
} from "../../backroomsGen/transitions";
import {
  GamePackageSchema,
  MapDataSchema,
  type GamePackage,
} from "../../schema/game";
import { hashMapOutput } from "../../generation-facing/deterministicIds";
import { objectLibraryPresets } from "../../schema/presets";
import { BACKROOMS_ANOMALY_OBJECTS } from "../backroomsAnomalyAssets";
import type { QaWing } from "./shared";

export const GENERATED_BACKROOMS_PHASE6_PREVIEW_SEED =
  "phase6-preview-2026-08-09-02";

export const GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE =
  createLevel0CmtBackroomsRecipe(GENERATED_BACKROOMS_PHASE6_PREVIEW_SEED);

const generated = generateBackroomsMap({
  recipe: GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  generatedAt: "2026-08-09T23:30:00.000Z",
});

export const GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_SEED =
  "phase10-level1-preview-2026-08-10-01";
export const GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE =
  createLevel1CmtBackroomsRecipe(
    GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_SEED,
  );
const generatedLevel1 = generateBackroomsMap({
  recipe: GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE,
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  generatedAt: "2026-08-10T18:00:00.000Z",
});

if (!generated.success || !generated.map || !generatedLevel1.success || !generatedLevel1.map) {
  throw new Error(
    `Bundled Phase 6 preview generation failed: ${JSON.stringify(generated.diagnostics)}`,
  );
}

const phase10Level0Base = {
  ...generated.map,
  display_name: "Backrooms — Phase 11 Level 0",
};
const phase10Level1Base = {
  ...generatedLevel1.map,
  display_name: "Backrooms — Phase 10 Level 1",
  ambient_light: 0.24,
  presentation_ambient_light: 0.26,
  presentation_profile_id: LEVEL0_TO_LEVEL1_PRESENTATION_ID,
};

const routeLibrary = {
  maps: [phase10Level0Base, phase10Level1Base],
  backrooms_transition_rules: [
    LEVEL0_TO_LEVEL1_TRANSITION,
    LEVEL1_TO_LEVEL0_TRANSITION,
  ],
  transition_presentation_profiles: [
    LEVEL0_TO_LEVEL1_PRESENTATION,
    LEVEL1_TO_LEVEL0_PRESENTATION,
  ],
};
const level1Route = resolveBackroomsCrossLevelRoute(
  routeLibrary,
  phase10Level1Base.id,
  LEVEL1_TO_LEVEL0_TRANSITION_ID,
);
const level1Threshold = phase10Level1Base.generation_sockets?.find(
  (socket) => socket.kind === "extraction",
);
if (!level1Route || !level1Threshold) {
  throw new Error("Bundled Phase 10 preview could not resolve its paired thresholds");
}

const finalizePreviewMap = (
  map: typeof phase10Level0Base,
  exit?: ReturnType<typeof createBackroomsCrossLevelExit>,
) => {
  const candidate = MapDataSchema.parse({
    ...map,
    exits: exit ? [...map.exits, exit] : map.exits,
  });
  if (candidate.generation) {
    candidate.generation.outputHash = hashMapOutput(candidate);
  }
  return MapDataSchema.parse(candidate);
};

export const GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP = finalizePreviewMap(
  phase10Level0Base,
);
export const GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP = finalizePreviewMap(
  phase10Level1Base,
  createBackroomsCrossLevelExit({
    id: "exit.backrooms.level1_to_level0",
    pairedExitId: "exit.backrooms.level0_to_level1",
    cell: [Number(level1Threshold.cell[0]), Number(level1Threshold.cell[1])],
    route: level1Route,
  }),
);

export const GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID =
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP.id;

const referencedObjectIds = new Set([
  ...[GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP]
    .flatMap((map) => [
      ...map.cells.map((cell) => cell.object_id),
      ...(map.fine_cell_overrides ?? []).map(
        (override) => override.overrides.object_id,
      ),
      ...map.custom_object_placements.map((placement) => placement.object_id),
    ]),
]);

export const generatedBackroomsPhase6Wing: QaWing = {
  maps: [GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP],
  objects: [...objectLibraryPresets, ...BACKROOMS_ANOMALY_OBJECTS].filter((object) =>
    referencedObjectIds.has(object.id),
  ),
  cutscenes: [...LEVEL0_CMT_PHASE6_CUTSCENES],
};

/** Adds the generated preview to an existing bundled workspace. An untouched
 * generated copy may be refreshed when the baked output changes; an authored
 * or manually edited same-ID map is always preserved. */
export const installGeneratedBackroomsPhase6Preview = (
  incomingPackage: GamePackage,
): GamePackage => {
  // Phase 10 originally bundled a Level 1 proof. Phase 11 scopes the demo to
  // Level 0, so retire only that exact untouched generated proof. An authored
  // or manually edited same-ID map remains user-owned and is never removed.
  const bundledLevel1 = incomingPackage.maps.find(
    (map) => map.id === GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.id,
  );
  const removeBundledLevel1 = Boolean(
    bundledLevel1 &&
      bundledLevel1.generation?.manuallyModified === false &&
      bundledLevel1.generation.outputHash ===
        GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.generation?.outputHash,
  );
  const sourcePackage = removeBundledLevel1
    ? GamePackageSchema.parse({
        ...incomingPackage,
        maps: incomingPackage.maps.filter(
          (map) => map.id !== GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.id,
        ),
        backrooms_recipes: incomingPackage.backrooms_recipes.filter(
          (recipe) =>
            recipe.id !== GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE.id,
        ),
        settings: {
          ...(incomingPackage.settings ?? {}),
          map_music: Object.fromEntries(
            Object.entries(
              (incomingPackage.settings?.map_music ?? {}) as Record<string, string>,
            ).filter(
              ([mapId]) =>
                mapId !== GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.id,
            ),
          ),
        },
      })
    : incomingPackage;
  const settings = sourcePackage.settings ?? {};
  const mapMusic = (settings.map_music ?? {}) as Record<string, string>;
  const musicTracks = (settings.music_tracks ?? {}) as Record<string, string>;
  const soundEffects = (settings.sound_effects ?? {}) as Record<string, string>;
  const previewMaps = generatedBackroomsPhase6Wing.maps ?? [];
  const installedPreviewMaps = previewMaps.map((preview) =>
    sourcePackage.maps.find((map) => map.id === preview.id),
  );
  const legacyPreviewNames = new Set([
    "Backrooms — Level 0",
    "Backrooms — Phase 6 Preview",
    "Backrooms — Phase 7 Preview",
    "Backrooms — Phase 8 Preview",
    "Backrooms — Phase 9 Preview",
    "Backrooms — Phase 10 Level 0",
  ]);
  const previewAlreadyInstalled =
    installedPreviewMaps.every(
      (installed, index) =>
        Boolean(installed) &&
        installed!.generation?.outputHash ===
          previewMaps[index]!.generation?.outputHash &&
        !legacyPreviewNames.has(installed!.display_name),
    ) &&
    (generatedBackroomsPhase6Wing.objects ?? []).every((object) =>
      sourcePackage.object_library.some((candidate) => candidate.id === object.id),
    ) &&
    LEVEL0_CMT_PHASE6_CUTSCENES.every((cutscene) =>
      sourcePackage.cutscenes.some((candidate) => candidate.id === cutscene.id),
    ) &&
    sourcePackage.backrooms_recipes.some(
      (recipe) => recipe.id === GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE.id,
    ) &&
    sourcePackage.backrooms_anomaly_profiles.some(
      (profile) =>
        profile.id === LEVEL0_CMT_PHASE8_ANOMALY_PROFILE.id &&
        profile.progression?.enabled === true,
    ) &&
    mapMusic[GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID] !== undefined &&
    musicTracks[LEVEL0_CMT_PHASE6_AUDIO.humMusicId] !== undefined &&
    soundEffects[LEVEL0_CMT_PHASE6_AUDIO.electricalPopId] !== undefined &&
    soundEffects[LEVEL0_CMT_PHASE6_AUDIO.distantImpactId] !== undefined;
  if (previewAlreadyInstalled) return sourcePackage;

  const packageWithLevel0Content = installLevel0CmtPhase6Content(sourcePackage, {
    mapId: GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID,
    recipe: GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
  });
  const packageWithContent = packageWithLevel0Content;
  const existingObjectIds = new Set(
    packageWithContent.object_library.map((object) => object.id),
  );
  const previewById = new Map(previewMaps.map((map) => [map.id, map]));
  const installedIds = new Set(packageWithContent.maps.map((map) => map.id));
  const maps = packageWithContent.maps.map((map) => {
    const preview = previewById.get(map.id);
    if (!preview) return map;
    const geometryCurrent =
      map.generation?.outputHash === preview.generation?.outputHash;
    if (
      !geometryCurrent &&
      map.generation?.manuallyModified === false
    ) {
      return structuredClone(preview);
    }
    if (legacyPreviewNames.has(map.display_name)) {
      return { ...map, display_name: preview.display_name };
    }
    return map;
  });
  for (const preview of previewMaps) {
    if (!installedIds.has(preview.id)) maps.push(structuredClone(preview));
  }
  return GamePackageSchema.parse({
    ...packageWithContent,
    maps,
    object_library: [
      ...packageWithContent.object_library,
      ...(generatedBackroomsPhase6Wing.objects ?? [])
        .filter((object) => !existingObjectIds.has(object.id))
        .map((object) => structuredClone(object)),
    ],
  });
};
