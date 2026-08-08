import { useEffect, useMemo, useRef, useState } from "react";
import { useEngineStore } from "../store/engineStore";
import {
  PLAYTEST_ASPECT_HEIGHT,
  PLAYTEST_ASPECT_WIDTH,
  PLAYTEST_MAX_HEIGHT,
  PLAYTEST_MAX_WIDTH,
  readPlaytestRequest,
} from "../utils/playtestWindow";
import { PlayMode } from "./PlayMode";

export function PlaytestShell() {
  const storageHydrated = useEngineStore((state) => state.storageHydrated);
  const gamePackage = useEngineStore((state) => state.gamePackage);
  const selectedMapId = useEngineStore((state) => state.selectedMapId);
  const setSelectedMapId = useEngineStore((state) => state.setSelectedMapId);
  const request = useMemo(() => readPlaytestRequest(window.location.href), []);
  const [selectionReady, setSelectionReady] = useState(!request.mapId);
  const requestMapHandledRef = useRef(false);

  useEffect(() => {
    if (!storageHydrated || requestMapHandledRef.current) return;
    requestMapHandledRef.current = true;
    if (
      request.mapId &&
      request.mapId !== selectedMapId &&
      gamePackage.maps.some((map) => map.id === request.mapId)
    ) {
      setSelectedMapId(request.mapId);
    }
    setSelectionReady(true);
  }, [
    gamePackage.maps,
    request.mapId,
    selectedMapId,
    setSelectedMapId,
    storageHydrated,
  ]);

  useEffect(() => {
    document.title = `${gamePackage.metadata.title || "Game"} · 16:9 Playtest`;
  }, [gamePackage.metadata.title]);

  if (!storageHydrated || !selectionReady) {
    return (
      <main className="grid h-dvh w-screen place-items-center overflow-hidden bg-black text-sm text-neutral-400">
        Loading 16:9 playtest…
      </main>
    );
  }

  return (
    <main
      className="grid h-dvh w-screen place-items-center overflow-hidden bg-black"
      data-playtest-shell
    >
      <section
        aria-label="16:9 game playtest"
        className="relative overflow-hidden bg-neutral-950 shadow-2xl"
        data-playtest-stage
        data-aspect-ratio={`${PLAYTEST_ASPECT_WIDTH}:${PLAYTEST_ASPECT_HEIGHT}`}
        data-canonical-size={`${PLAYTEST_MAX_WIDTH}x${PLAYTEST_MAX_HEIGHT}`}
        style={{
          width: `min(100vw, calc(100vh * ${PLAYTEST_ASPECT_WIDTH} / ${PLAYTEST_ASPECT_HEIGHT}), ${PLAYTEST_MAX_WIDTH}px)`,
          aspectRatio: `${PLAYTEST_ASPECT_WIDTH} / ${PLAYTEST_ASPECT_HEIGHT}`,
          maxHeight: `${PLAYTEST_MAX_HEIGHT}px`,
        }}
      >
        <div className="h-full min-h-0 w-full">
          <PlayMode />
        </div>
      </section>
    </main>
  );
}
