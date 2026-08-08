export const PLAYTEST_QUERY_PARAM = "playtest";
export const PLAYTEST_MAP_QUERY_PARAM = "map";

export const PLAYTEST_ASPECT_WIDTH = 16;
export const PLAYTEST_ASPECT_HEIGHT = 9;
export const PLAYTEST_MAX_WIDTH = 1280;
export const PLAYTEST_MAX_HEIGHT = 720;
export const PLAYTEST_WINDOW_NAME = "crpg-engine-playtest";

export interface PlaytestRequest {
  enabled: boolean;
  mapId: string | null;
}

export const readPlaytestRequest = (href: string): PlaytestRequest => {
  const url = new URL(href);
  return {
    enabled: url.searchParams.get(PLAYTEST_QUERY_PARAM) === "1",
    mapId: url.searchParams.get(PLAYTEST_MAP_QUERY_PARAM),
  };
};

/** A Studio "Play map" handoff is already an explicit play decision. */
export const shouldEnterRequestedPlaytestMap = (href: string) => {
  const request = readPlaytestRequest(href);
  return request.enabled && Boolean(request.mapId);
};

export const buildPlaytestUrl = (href: string, mapId?: string | null) => {
  const url = new URL(href);
  url.searchParams.set(PLAYTEST_QUERY_PARAM, "1");
  if (mapId) url.searchParams.set(PLAYTEST_MAP_QUERY_PARAM, mapId);
  else url.searchParams.delete(PLAYTEST_MAP_QUERY_PARAM);
  url.hash = "";
  return url.toString();
};

export interface OpenPlaytestWindowOptions {
  mapId?: string | null;
  prepare?: () => void | Promise<void>;
}

/**
 * Opens the tab synchronously so browser popup protection sees a direct user
 * gesture, then navigates only after the Studio workspace has been persisted.
 */
export const openPlaytestWindow = async ({
  mapId,
  prepare,
}: OpenPlaytestWindowOptions = {}): Promise<boolean> => {
  if (typeof window === "undefined") return false;

  const playtestWindow = window.open("about:blank", PLAYTEST_WINDOW_NAME);
  if (!playtestWindow) return false;

  try {
    playtestWindow.opener = null;
    playtestWindow.document.title = "Loading playtest…";
    playtestWindow.document.body.style.margin = "0";
    playtestWindow.document.body.style.background = "#000";
    playtestWindow.document.body.style.color = "#a3a3a3";
    playtestWindow.document.body.style.fontFamily = "system-ui, sans-serif";
    playtestWindow.document.body.style.display = "grid";
    playtestWindow.document.body.style.placeItems = "center";
    playtestWindow.document.body.textContent = "Preparing 16:9 playtest…";

    await prepare?.();
    playtestWindow.location.replace(buildPlaytestUrl(window.location.href, mapId));
    return true;
  } catch (error) {
    playtestWindow.close();
    throw error;
  }
};
