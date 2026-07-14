export const MAX_SCREEN_GLARE_SOURCES = 8;

export type ScreenGlareSource = {
  key: string;
  x: number;
  y: number;
  color: [number, number, number];
  strength: number;
  radius: number;
};

const sources = new Map<string, ScreenGlareSource>();

export const setScreenGlareSource = (source: ScreenGlareSource) => {
  sources.set(source.key, source);
};

export const deleteScreenGlareSource = (key: string) => {
  sources.delete(key);
};

export const getScreenGlareSources = () =>
  Array.from(sources.values())
    .filter((source) => source.strength > 0.001)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_SCREEN_GLARE_SOURCES);
