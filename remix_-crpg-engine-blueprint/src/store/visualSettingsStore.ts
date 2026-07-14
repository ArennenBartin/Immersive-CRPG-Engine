import { create } from "zustand";

export type VisualScalePreset = "performance" | "balanced" | "high" | "ultra";
export type VisualAoQuality = "performance" | "low" | "medium" | "high" | "ultra";

export interface VisualScaleConfig {
  label: string;
  dprCap: number;
  aoQuality: VisualAoQuality;
  aoHalfRes: boolean;
  aoSamples: number;
  denoiseSamples: number;
  denoiseRadius: number;
  aoRadiusScale: number;
  aoIntensityScale: number;
  contrastBoost: number;
  saturationBoost: number;
  glareScale: number;
  warpScale: number;
  chromaticScale: number;
  vignetteScale: number;
  scanlineScale: number;
  grainScale: number;
  moteScale: number;
}

const STORAGE_KEY = "crpg-visual-scale-preset";

export const VISUAL_SCALE_PRESET_ORDER: VisualScalePreset[] = [
  "performance",
  "balanced",
  "high",
  "ultra",
];

export const DEFAULT_VISUAL_SCALE_PRESET: VisualScalePreset = "high";

export const SCREEN_VISUAL_PRESETS: Record<VisualScalePreset, VisualScaleConfig> = {
  performance: {
    label: "Performance",
    dprCap: 1.05,
    aoQuality: "performance",
    aoHalfRes: true,
    aoSamples: 6,
    denoiseSamples: 2,
    denoiseRadius: 5,
    aoRadiusScale: 0.72,
    aoIntensityScale: 0.7,
    contrastBoost: 0.006,
    saturationBoost: 0.002,
    glareScale: 0.46,
    warpScale: 0.32,
    chromaticScale: 0.2,
    vignetteScale: 0.74,
    scanlineScale: 0.18,
    grainScale: 0.12,
    moteScale: 0.04,
  },
  balanced: {
    label: "Balanced",
    dprCap: 1.35,
    aoQuality: "low",
    aoHalfRes: true,
    aoSamples: 8,
    denoiseSamples: 3,
    denoiseRadius: 6,
    aoRadiusScale: 0.86,
    aoIntensityScale: 0.84,
    contrastBoost: 0.012,
    saturationBoost: 0.01,
    glareScale: 0.62,
    warpScale: 0.46,
    chromaticScale: 0.32,
    vignetteScale: 0.88,
    scanlineScale: 0.32,
    grainScale: 0.22,
    moteScale: 0.12,
  },
  high: {
    label: "High",
    dprCap: 1.75,
    aoQuality: "medium",
    aoHalfRes: true,
    aoSamples: 12,
    denoiseSamples: 4,
    denoiseRadius: 8,
    aoRadiusScale: 1,
    aoIntensityScale: 1,
    contrastBoost: 0.018,
    saturationBoost: 0.018,
    glareScale: 0.72,
    warpScale: 0.58,
    chromaticScale: 0.42,
    vignetteScale: 1,
    scanlineScale: 0.42,
    grainScale: 0.3,
    moteScale: 0.18,
  },
  ultra: {
    label: "Ultra",
    dprCap: 2.25,
    aoQuality: "high",
    aoHalfRes: false,
    aoSamples: 16,
    denoiseSamples: 6,
    denoiseRadius: 10,
    aoRadiusScale: 1.12,
    aoIntensityScale: 1.12,
    contrastBoost: 0.026,
    saturationBoost: 0.026,
    glareScale: 0.88,
    warpScale: 0.72,
    chromaticScale: 0.55,
    vignetteScale: 1.08,
    scanlineScale: 0.58,
    grainScale: 0.42,
    moteScale: 0.28,
  },
};

const isVisualScalePreset = (value: string | null): value is VisualScalePreset =>
  value !== null && Object.prototype.hasOwnProperty.call(SCREEN_VISUAL_PRESETS, value);

const readStoredPreset = (): VisualScalePreset => {
  if (typeof window === "undefined") return DEFAULT_VISUAL_SCALE_PRESET;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isVisualScalePreset(stored) ? stored : DEFAULT_VISUAL_SCALE_PRESET;
  } catch {
    return DEFAULT_VISUAL_SCALE_PRESET;
  }
};

const FOG_STORAGE_KEY = "crpg-fog-of-war";

const readStoredFog = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FOG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

interface VisualSettingsState {
  preset: VisualScalePreset;
  setPreset: (preset: VisualScalePreset) => void;
  // Tactical fog of war in Play Mode (unseen cells hidden, explored cells dim).
  fogOfWar: boolean;
  setFogOfWar: (enabled: boolean) => void;
}

export const useVisualSettingsStore = create<VisualSettingsState>()((set) => ({
  preset: readStoredPreset(),
  setPreset: (preset) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, preset);
      } catch {
        // A blocked storage write should not prevent changing the live preset.
      }
    }
    set({ preset });
  },
  fogOfWar: readStoredFog(),
  setFogOfWar: (enabled) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(FOG_STORAGE_KEY, enabled ? "1" : "0");
      } catch {
        // ignore storage failures
      }
    }
    set({ fogOfWar: enabled });
  },
}));
