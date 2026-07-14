import {
  Component,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  BrightnessContrast,
  HueSaturation,
  Vignette,
  Noise,
  Scanline,
  N8AO,
} from "@react-three/postprocessing";
import {
  BlendFunction,
  Effect,
  EffectAttribute,
  ChromaticAberrationEffect,
} from "postprocessing";
import { Uniform, Vector2, Vector3, UnsignedByteType } from "three";
import { SCREEN_PULSE_MS, useFxStore } from "../store/fxStore";
import {
  SCREEN_VISUAL_PRESETS,
  useVisualSettingsStore,
  type VisualScaleConfig,
} from "../store/visualSettingsStore";
import { getAudioBass, getAudioLevel } from "../utils/audioManager";
import {
  getScreenGlareSources,
  MAX_SCREEN_GLARE_SOURCES,
} from "../utils/screenGlareSources";

// ── Custom warp + ripple effect ──────────────────────────────────────────────

const WARP_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHurt;
uniform vec2  uRipple;
uniform float uRippleAge;
uniform float uBass;
uniform float uLevel;
uniform float uCombat;
uniform float uPulse;
uniform float uPulseAge;
uniform float uUnderground;
uniform float uAspect;
uniform float uWarpScale;
uniform float uGlareScale;
uniform float uContrastBoost;
uniform float uMoteScale;
uniform int uGlareCount;
uniform vec2 uGlarePositions[${MAX_SCREEN_GLARE_SOURCES}];
uniform vec3 uGlareColors[${MAX_SCREEN_GLARE_SOURCES}];
uniform float uGlareStrengths[${MAX_SCREEN_GLARE_SOURCES}];
uniform float uGlareRadii[${MAX_SCREEN_GLARE_SOURCES}];

float screenLuma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 sceneTap(vec2 sampleUv) {
  return texture2D(inputBuffer, clamp(sampleUv, vec2(0.001), vec2(0.999))).rgb;
}

float authoredLine(vec2 delta, float slope, float width, float reach) {
  float y = delta.y - delta.x * slope;
  float across = exp(-abs(y) / max(width, 0.0001));
  float along = exp(-abs(delta.x) / max(reach, 0.001));
  return across * (0.26 + along * 0.92);
}

vec3 authoredGlareSource(
  vec2 uv,
  vec2 sourceUv,
  vec3 sourceColor,
  float strength,
  float radius,
  float index
) {
  vec2 delta = uv - sourceUv;
  vec2 aspectDelta = vec2(delta.x * uAspect, delta.y);
  float dist2 = dot(aspectDelta, aspectDelta);
  float visible = 1.0 - smoothstep(0.92, 1.32, length(delta));
  float shimmer = 0.9 + 0.1 * sin(uTime * (0.74 + index * 0.07) + index * 2.37);
  float sweep = sin(uTime * (0.18 + index * 0.012) + index * 1.91);
  float lineWidth = 0.0009 + radius * 0.22;
  float reach = 0.48 + radius * 10.0 + strength * 0.072;
  float slope = 0.018 + sweep * 0.018;
  float main = authoredLine(delta, slope, lineWidth, reach * 1.55);
  float horizontal = authoredLine(delta + vec2(0.0, sweep * 0.0035), 0.0, lineWidth * 0.72, reach * 2.1);
  float coolSplit = authoredLine(delta + vec2(0.0022, -0.0011), -0.11, lineWidth * 1.2, reach * 0.74);
  float warmSplit = authoredLine(delta - vec2(0.0015, 0.0007), 0.07, lineWidth, reach * 0.62);
  float core = exp(-dist2 / max(radius * radius * 1.15, 0.000012));
  float halo = exp(-dist2 / max(radius * radius * 6.0, 0.00004));
  vec3 warm = sourceColor * vec3(1.1, 0.78, 0.48);
  vec3 cool = sourceColor * vec3(0.45, 0.75, 1.18);
  vec3 glare = sourceColor * (main * 0.54 + horizontal * 0.82);
  glare += cool * coolSplit * 0.28 + warm * warmSplit * 0.22;
  glare += sourceColor * core * 0.14 + sourceColor * halo * 0.06;
  return glare * strength * shimmer * visible;
}

vec3 hd2dBlur(vec2 uv, float amount) {
  float r = 0.0015 + amount * 0.0075;
  vec3 blur = sceneTap(uv) * 0.28;
  blur += sceneTap(uv + vec2( r * 1.35, 0.0)) * 0.105;
  blur += sceneTap(uv + vec2(-r * 1.35, 0.0)) * 0.105;
  blur += sceneTap(uv + vec2(0.0,  r)) * 0.105;
  blur += sceneTap(uv + vec2(0.0, -r)) * 0.105;
  blur += sceneTap(uv + vec2( r,  r * 0.72)) * 0.075;
  blur += sceneTap(uv + vec2(-r,  r * 0.72)) * 0.075;
  blur += sceneTap(uv + vec2( r, -r * 0.72)) * 0.075;
  blur += sceneTap(uv + vec2(-r, -r * 0.72)) * 0.075;
  return blur;
}

vec3 protectHighlights(vec3 color) {
  color = max(color, vec3(0.0));
  float peak = max(max(color.r, color.g), color.b);
  if (peak > 0.86) {
    float rolledPeak = 0.86 + (1.0 - exp(-(peak - 0.86) * 2.6)) * 0.13;
    color *= rolledPeak / max(peak, 0.0001);
  }
  return min(color, vec3(0.995));
}

vec3 hd2dGrade(vec3 color, vec2 uv, float pulse) {
  float luma = screenLuma(color);
  vec3 coolShadows = color * vec3(0.9, 0.98, 1.1);
  vec3 warmHighlights = color * vec3(1.1, 1.035, 0.94);
  color = mix(coolShadows, warmHighlights, smoothstep(0.22, 0.84, luma));
  color = protectHighlights(color);
  color = (color - 0.5) * (1.022 + uContrastBoost + pulse * 0.012) + 0.502;
  color = color - vec3(0.006) * smoothstep(0.0, 0.48, 1.0 - luma);

  float gray = screenLuma(color);
  color = mix(vec3(gray), color, 1.06 + uUnderground * 0.08 + uContrastBoost * 0.45);

  float topHaze = smoothstep(0.42, 1.0, uv.y) * (1.0 - uCombat * 0.42);
  float edgeHaze = smoothstep(0.62, 1.0, abs(uv.x - 0.5) * 2.0) * 0.45;
  vec3 hazeColor = mix(vec3(0.33, 0.72, 0.96), vec3(0.45, 0.34, 0.95), uUnderground);
  color = mix(color, hazeColor, (topHaze + edgeHaze) * 0.018);

  return protectHighlights(color);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv;
  float pulse = uPulse * (1.0 - smoothstep(0.0, 1.0, uPulseAge));

  // Radial ripple from hurt origin
  vec2 rippleDir = p - uRipple;
  float rippleDist = length(rippleDir);
  float rippleWave = sin(rippleDist * 34.0 - uRippleAge * 18.0) * 0.0085 * uWarpScale;
  float rippleFade = (1.0 - uRippleAge) * smoothstep(0.68, 0.0, rippleDist) * (uHurt + pulse * 0.85);
  p += normalize(rippleDir + 0.0001) * rippleWave * rippleFade;

  // Slow glass-field drift: present even when audio is quiet.
  float lowWave = sin(p.y * 24.0 + uTime * 0.52 + sin(p.x * 7.0 - uTime * 0.28));
  float crossWave = sin((p.x + p.y) * 42.0 - uTime * 0.72);
  float lineCrawl = sin((uv.y + uTime * 0.018) * 860.0);
  float living = (0.00055 + uBass * 0.0036 + uLevel * 0.0022 + uCombat * 0.0018 + pulse * 0.0045) * uWarpScale;
  p += vec2(lowWave * living, crossWave * living * 0.62);
  p.x += lineCrawl * (0.00012 + uUnderground * 0.00008 + pulse * 0.00032) * uWarpScale;

  // Audio-bass barrel breathe + gameplay/combat swell.
  vec2 c = p - 0.5;
  float r2 = dot(c, c);
  p += c * r2 * (0.007 + uBass * 0.03 + uLevel * 0.012 + uCombat * 0.011 + pulse * 0.018) * uWarpScale;

  vec3 sharp = sceneTap(p);
  float focusDistance = abs(uv.y - 0.54);
  float dof = smoothstep(0.28, 0.64, focusDistance);
  dof += smoothstep(0.78, 1.0, uv.y) * 0.12;
  dof = clamp(dof * (0.44 - uCombat * 0.22) * (0.86 + uWarpScale * 0.18) + pulse * 0.02, 0.0, 0.42);
  vec3 colorBase = mix(sharp, hd2dBlur(p, dof), dof);

  vec3 localAvg =
    sceneTap(p + vec2(0.0026, 0.0)) +
    sceneTap(p - vec2(0.0026, 0.0)) +
    sceneTap(p + vec2(0.0, 0.0026)) +
    sceneTap(p - vec2(0.0, 0.0026));
  localAvg *= 0.25;
  float crevice = smoothstep(0.018, 0.13, screenLuma(localAvg) - screenLuma(sharp));
  colorBase *= 1.0 - crevice * (0.024 + uUnderground * 0.014 + uContrastBoost * 0.06);
  colorBase += (sharp - localAvg) * (0.036 * (1.0 - dof) + uContrastBoost * 0.07 + pulse * 0.01);

  vec4 color = vec4(hd2dGrade(colorBase, uv, pulse), inputColor.a);

  vec3 authoredGlare = vec3(0.0);
  for (int i = 0; i < ${MAX_SCREEN_GLARE_SOURCES}; i++) {
    if (i < uGlareCount) {
      authoredGlare += authoredGlareSource(
        uv,
        uGlarePositions[i],
        uGlareColors[i],
        uGlareStrengths[i] * (1.0 + pulse * 0.28 + uLevel * 0.12),
        uGlareRadii[i],
        float(i)
      );
    }
  }
  color.rgb += authoredGlare * (0.26 + uUnderground * 0.08 + uCombat * 0.035) * uGlareScale;

  vec2 moteUv = uv * vec2(92.0, 58.0) + vec2(uTime * -0.38, uTime * 0.72);
  vec2 moteCell = fract(moteUv) - 0.5;
  float moteSeed = hash21(floor(moteUv));
  float mote = smoothstep(0.034, 0.0, length(moteCell)) * step(0.99945, moteSeed);
  color.rgb += vec3(0.34, 0.82, 1.0) * mote * (0.007 + uUnderground * 0.016) * (1.0 - uCombat * 0.35) * uMoteScale;

  float glassGleam = sin((uv.x - uv.y) * 72.0 + uTime * 0.85) * 0.5 + 0.5;
  color.rgb += vec3(0.002, 0.0015, 0.004) * glassGleam * (uUnderground * 0.12 + pulse * 0.08 + uLevel * 0.06);
  color.rgb = protectHighlights(color.rgb);
  outputColor = color;
}
`;

class WarpEffect extends Effect {
  constructor() {
    super("WarpEffect", WARP_FRAG, {
      // We sample inputBuffer at displaced UVs, so this is a convolution effect.
      // Without this attribute the effect merger builds an invalid shader and
      // can tear down the WebGL context on stricter (mobile) drivers.
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["uTime",      new Uniform(0)],
        ["uHurt",      new Uniform(0)],
        ["uRipple",    new Uniform(new Vector2(0.5, 0.5))],
        ["uRippleAge", new Uniform(1)],
        ["uBass",      new Uniform(0)],
        ["uLevel",     new Uniform(0)],
        ["uCombat",    new Uniform(0)],
        ["uPulse",     new Uniform(0)],
        ["uPulseAge",  new Uniform(1)],
        ["uUnderground", new Uniform(0)],
        ["uAspect", new Uniform(1)],
        ["uWarpScale", new Uniform(1)],
        ["uGlareScale", new Uniform(1)],
        ["uContrastBoost", new Uniform(0.06)],
        ["uMoteScale", new Uniform(0.55)],
        ["uGlareCount", new Uniform(0)],
        [
          "uGlarePositions",
          new Uniform(
            Array.from({ length: MAX_SCREEN_GLARE_SOURCES }, () => new Vector2(-10, -10)),
          ),
        ],
        [
          "uGlareColors",
          new Uniform(
            Array.from({ length: MAX_SCREEN_GLARE_SOURCES }, () => new Vector3(1, 0.78, 0.5)),
          ),
        ],
        [
          "uGlareStrengths",
          new Uniform(Array.from({ length: MAX_SCREEN_GLARE_SOURCES }, () => 0)),
        ],
        [
          "uGlareRadii",
          new Uniform(Array.from({ length: MAX_SCREEN_GLARE_SOURCES }, () => 0.01)),
        ],
      ]),
      blendFunction: BlendFunction.NORMAL,
    });
  }
}

function WarpFX({ effectRef }: { effectRef: RefObject<WarpEffect | null> }) {
  const effect = useMemo(() => new WarpEffect(), []);

  useEffect(() => {
    effectRef.current = effect;
    return () => {
      effectRef.current = null;
      effect.dispose();
    };
  }, [effect, effectRef]);

  return <primitive object={effect} dispose={null} />;
}

function ChromaticAberrationFX({
  effectRef,
}: {
  effectRef: RefObject<ChromaticAberrationEffect | null>;
}) {
  const offset = useMemo(() => new Vector2(0.0006, 0.0004), []);
  const effect = useMemo(
    () =>
      new ChromaticAberrationEffect({
        offset,
        radialModulation: false,
        modulationOffset: 0.15,
      }),
    [offset],
  );

  useEffect(() => {
    effectRef.current = effect;
    return () => {
      effectRef.current = null;
      effect.dispose();
    };
  }, [effect, effectRef]);

  return <primitive object={effect} dispose={null} />;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ScreenFXProps {
  inCombat: boolean;
  mapId?: string | null;
}

// ── Frame driver — updates all uniforms each tick ────────────────────────────

function ScreenFXDriver({
  warpRef,
  caRef,
  inCombat,
  underground,
  visual,
}: {
  warpRef: RefObject<WarpEffect | null>;
  caRef: RefObject<ChromaticAberrationEffect | null>;
  inCombat: boolean;
  underground: boolean;
  visual: VisualScaleConfig;
}) {
  const playerHurtAt = useFxStore((s) => s.playerHurtAt);
  const screenPulseAt = useFxStore((s) => s.screenPulseAt);
  const screenPulseStrength = useFxStore((s) => s.screenPulseStrength);

  const combatRamp   = useRef(0);
  const rippleAge    = useRef(1);
  const pulseAge     = useRef(1);
  const pulseStrength = useRef(0);
  const lastHurtAt   = useRef(0);
  const lastPulseAt  = useRef(0);
  const rippleOrigin = useRef(new Vector2(0.5, 0.5));

  useFrame((state, delta) => {
    const now = performance.now();

    // Detect new hurt event — reset ripple
    if (playerHurtAt !== lastHurtAt.current && playerHurtAt > 0) {
      lastHurtAt.current = playerHurtAt;
      rippleAge.current  = 0;
      rippleOrigin.current.set(0.5, 0.5);
    }

    if (screenPulseAt !== lastPulseAt.current && screenPulseAt > 0) {
      lastPulseAt.current = screenPulseAt;
      pulseAge.current = 0;
      pulseStrength.current = screenPulseStrength;
      const phase = Math.sin(screenPulseAt * 0.017);
      rippleOrigin.current.set(0.5 + phase * 0.08, 0.52 + Math.cos(screenPulseAt * 0.011) * 0.06);
    }

    const hurt = Math.max(0, 1 - (now - playerHurtAt) / 600);

    // Smooth combat ramp: ramps up fast, fades out slowly
    const targetCombat = inCombat ? 1 : 0;
    combatRamp.current += (targetCombat - combatRamp.current) * delta * (inCombat ? 0.9 : 0.4);
    const combat = combatRamp.current;

    rippleAge.current = Math.min(1, rippleAge.current + delta * 1.2);
    pulseAge.current = Math.min(1, pulseAge.current + (delta * 1000) / SCREEN_PULSE_MS);

    const bass = getAudioBass();
    const level = getAudioLevel();
    const pulse = pulseStrength.current * (1 - pulseAge.current);

    // CA offset: gentle always-on, rises in combat, spikes on hurt.
    // Mutate the effect's own offset Vector2 in place.
    const ca = caRef.current;
    if (ca) {
      ca.offset.x = (0.00038 + combat * 0.0012 + hurt * 0.0042 + bass * 0.0011 + level * 0.0007 + pulse * 0.0024) * visual.chromaticScale;
      ca.offset.y = (0.00026 + combat * 0.0008 + hurt * 0.003 + pulse * 0.0017) * 0.7 * visual.chromaticScale;
    }

    // Warp uniforms
    const warp = warpRef.current;
    if (warp) {
      const u = warp.uniforms;
      u.get("uTime")!.value      = now * 0.001;
      u.get("uHurt")!.value      = hurt;
      u.get("uRipple")!.value    = rippleOrigin.current;
      u.get("uRippleAge")!.value = rippleAge.current;
      u.get("uBass")!.value      = bass;
      u.get("uLevel")!.value     = level;
      u.get("uCombat")!.value    = combat;
      u.get("uPulse")!.value     = pulseStrength.current;
      u.get("uPulseAge")!.value  = pulseAge.current;
      u.get("uUnderground")!.value = underground ? 1 : 0;
      u.get("uAspect")!.value = state.size.width / Math.max(1, state.size.height);
      u.get("uWarpScale")!.value = visual.warpScale;
      u.get("uGlareScale")!.value = visual.glareScale;
      u.get("uContrastBoost")!.value = visual.contrastBoost;
      u.get("uMoteScale")!.value = visual.moteScale;

      const glareSources = getScreenGlareSources();
      const glarePositions = u.get("uGlarePositions")!.value as Vector2[];
      const glareColors = u.get("uGlareColors")!.value as Vector3[];
      const glareStrengths = u.get("uGlareStrengths")!.value as number[];
      const glareRadii = u.get("uGlareRadii")!.value as number[];

      u.get("uGlareCount")!.value = glareSources.length;
      for (let index = 0; index < MAX_SCREEN_GLARE_SOURCES; index += 1) {
        const source = glareSources[index];
        if (source) {
          glarePositions[index].set(source.x, source.y);
          glareColors[index].set(source.color[0], source.color[1], source.color[2]);
          glareStrengths[index] = source.strength;
          glareRadii[index] = source.radius;
        } else {
          glarePositions[index].set(-10, -10);
          glareColors[index].set(1, 0.78, 0.5);
          glareStrengths[index] = 0;
          glareRadii[index] = 0.01;
        }
      }
    }
  });

  return null;
}

// ── Failsafe boundary ─────────────────────────────────────────────────────────
// Post-processing is a cosmetic layer. If the EffectComposer or any effect throws
// while constructing its passes (e.g. an unsupported render target on a mobile
// GPU), swallow it and render nothing rather than taking down the whole game.

class FXBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("ScreenFX disabled — post-processing failed to initialise:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export function ScreenFX({ inCombat, mapId }: ScreenFXProps) {
  const warpRef = useRef<WarpEffect>(null);
  const caRef   = useRef<ChromaticAberrationEffect>(null);
  const visualPreset = useVisualSettingsStore((s) => s.preset);
  const visual = SCREEN_VISUAL_PRESETS[visualPreset];

  const underground =
    (mapId?.includes("network") || mapId?.includes("cave") || mapId?.includes("depth")) ?? false;

  return (
    <FXBoundary>
      <ScreenFXDriver
        warpRef={warpRef}
        caRef={caRef}
        inCombat={inCombat}
        underground={underground}
        visual={visual}
      />
      <EffectComposer multisampling={0} frameBufferType={UnsignedByteType}>
        <N8AO
          halfRes={visual.aoHalfRes}
          depthAwareUpsampling
          quality={visual.aoQuality}
          aoRadius={(underground ? 2.4 : 2) * visual.aoRadiusScale}
          aoSamples={visual.aoSamples}
          denoiseSamples={visual.denoiseSamples}
          denoiseRadius={visual.denoiseRadius}
          distanceFalloff={underground ? 0.82 : 0.9}
          intensity={(underground ? 1.18 : 0.92) * visual.aoIntensityScale}
          color={underground ? "#07101a" : "#100c13"}
        />
        <WarpFX effectRef={warpRef} />
        <BrightnessContrast
          brightness={underground ? 0.008 : 0.012}
          contrast={(underground ? 0.014 : 0.01) + visual.contrastBoost}
        />
        <HueSaturation
          hue={0}
          saturation={(underground ? 0.045 : 0.026) + visual.saturationBoost}
        />
        <ChromaticAberrationFX effectRef={caRef} />
        <Scanline
          density={underground ? 1.34 : 1.08}
          opacity={(underground ? 0.045 : 0.028) * visual.scanlineScale}
        />
        <Vignette
          eskil={false}
          offset={0.28}
          darkness={(underground ? 0.58 : 0.34) * visual.vignetteScale}
        />
        <Noise
          blendFunction={BlendFunction.OVERLAY}
          opacity={(underground ? 0.056 : 0.036) * visual.grainScale}
        />
      </EffectComposer>
    </FXBoundary>
  );
}
