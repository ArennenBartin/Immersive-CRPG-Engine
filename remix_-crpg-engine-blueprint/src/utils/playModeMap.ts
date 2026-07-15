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
  void didInitialMapLoad;
  const findMap = (id?: string | null) =>
    id ? gamePackage.maps.find((map) => map.id === id) || null : null;

  const versionOk = saveData?.package_version === gamePackage.metadata.version;
  const saveMap = versionOk ? findMap(saveData?.current_map_id) : null;
  const selectedMap = findMap(selectedMapId);

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
