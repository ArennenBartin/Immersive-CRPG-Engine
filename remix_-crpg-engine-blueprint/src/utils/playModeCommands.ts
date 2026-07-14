import type { AlderamonticoEmotionalVerbKind, ImmersiveGlobalVerbKind } from "../engine-core";

// Everything the Play command wheel can offer: the immersive global verbs
// (physical operators on cells/objects) plus the Alderamontico emotional verbs
// (operators on a faced actor's emotional axes).
export type PlayModeWheelVerbKind = ImmersiveGlobalVerbKind | AlderamonticoEmotionalVerbKind;

export interface PlayModeCommandWheelVerb {
  kind: PlayModeWheelVerbKind;
  label: string;
  icon: string;
  enabled: boolean;
  hint?: string;
}

export const PLAYMODE_PHASE_1_VERBS: ImmersiveGlobalVerbKind[] = ["drop"];

export const PLAYMODE_PHASE_2_ELEMENTAL_VERBS: ImmersiveGlobalVerbKind[] = [
  "burn",
  "douse",
  "freeze",
  "wet",
  "electrify",
  "foam",
];

export const PLAYMODE_PHASE_3_MOVEMENT_VERBS: ImmersiveGlobalVerbKind[] = [
  "push",
  "pull",
  "throw",
  "stack",
  "climb",
  "break",
];

export const PLAYMODE_EMOTIONAL_VERBS: AlderamonticoEmotionalVerbKind[] = [
  "yell",
  "console",
];

export const PLAYMODE_VERB_PAST_TENSE: Partial<Record<PlayModeWheelVerbKind, string>> = {
  burn: "Set fire to",
  douse: "Doused",
  freeze: "Froze",
  wet: "Soaked",
  electrify: "Electrified",
  foam: "Foamed",
  push: "Pushed",
  pull: "Pulled",
  throw: "Threw",
  stack: "Stacked",
  climb: "Climbed",
  break: "Broke",
  yell: "Yelled at",
  console: "Consoled",
};

export const PLAYMODE_COMMAND_WHEEL_VERBS: PlayModeCommandWheelVerb[] = [
  { kind: "drop", label: "drop", icon: "📥", enabled: true, hint: "Drop an item onto a chosen cell" },
  { kind: "burn", label: "burn", icon: "🔥", enabled: true, hint: "Set a cell alight — spreads through oil/flammables" },
  { kind: "douse", label: "douse", icon: "💧", enabled: true, hint: "Put out fire — makes steam" },
  { kind: "freeze", label: "freeze", icon: "❄️", enabled: true, hint: "Freeze water into slippery ice" },
  { kind: "wet", label: "wet", icon: "🌊", enabled: true, hint: "Soak a cell — conducts electricity" },
  { kind: "electrify", label: "shock", icon: "⚡", enabled: true, hint: "Charge a cell — chains through water" },
  { kind: "foam", label: "foam", icon: "🫧", enabled: true, hint: "Douse, occlude, and leave climbable support" },
  { kind: "push", label: "push", icon: "👉", enabled: true, hint: "Push an adjacent movable object away" },
  { kind: "pull", label: "pull", icon: "👈", enabled: true, hint: "Pull a movable object toward you when there is room" },
  { kind: "throw", label: "throw", icon: "🎯", enabled: true, hint: "Hurl a nearby movable object farther away" },
  { kind: "break", label: "break", icon: "🔨", enabled: true, hint: "Break a nearby object out of the world" },
  { kind: "stack", label: "stack", icon: "▦", enabled: true, hint: "Move an object into a support position" },
  { kind: "climb", label: "climb", icon: "🪜", enabled: true, hint: "Mark a nearby cell as climbable support" },
  { kind: "yell", label: "yell", icon: "📣", enabled: true, hint: "Startle a creature — fear spikes, skittish things flee. Loud." },
  { kind: "console", label: "console", icon: "🕊️", enabled: true, hint: "Console an adjacent creature — grief eases, panic settles" },
  { kind: "mimic", label: "mimic", icon: "🎭", enabled: false },
];

export const playModeCommandWheelPhaseStatus = () => {
  const enabled = new Set(
    PLAYMODE_COMMAND_WHEEL_VERBS.filter((verb) => verb.enabled).map((verb) => verb.kind),
  );
  return {
    phase1Complete: PLAYMODE_PHASE_1_VERBS.every((verb) => enabled.has(verb)),
    phase2Complete: PLAYMODE_PHASE_2_ELEMENTAL_VERBS.every((verb) => enabled.has(verb)),
    phase3Complete: PLAYMODE_PHASE_3_MOVEMENT_VERBS.every((verb) => enabled.has(verb)),
    emotionalComplete: PLAYMODE_EMOTIONAL_VERBS.every((verb) => enabled.has(verb)),
    enabledVerbs: [...enabled],
  };
};
