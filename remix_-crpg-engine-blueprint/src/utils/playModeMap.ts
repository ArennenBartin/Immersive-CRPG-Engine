import type { GamePackage, MapData } from "../schema/game";
import type { PlaySave } from "../schema/save";

export interface PlayModeMapResolution {
  map: MapData | null;
  versionOk: boolean;
}

export const resolvePlayModeMap = ({
  gamePackage,
  selectedMapId,
  saveData,
  didInitialMapLoad,
}: {
  gamePackage: GamePackage;
  selectedMapId?: string | null;
  saveData?: Pick<PlaySave, "current_map_id" | "package_version"> | null;
  didInitialMapLoad: boolean;
}): PlayModeMapResolution => {
  const findMap = (id?: string | null) =>
    id ? gamePackage.maps.find((map) => map.id === id) || null : null;

  const versionOk = saveData?.package_version === gamePackage.metadata.version;
  const saveMap = versionOk ? findMap(saveData?.current_map_id) : null;
  // A Studio/URL map handoff owns only the first load of a playtest. Once the
  // mounted player deliberately starts a New Game, the authored package start
  // must win instead of reopening that one-off preview map.
  const selectedMap = didInitialMapLoad ? null : findMap(selectedMapId);

  return {
    map:
      saveMap ||
      selectedMap ||
      findMap(gamePackage.metadata.start_map_id) ||
      gamePackage.maps[0] ||
      null,
    versionOk,
  };
};
