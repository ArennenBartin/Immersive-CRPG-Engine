import { useEffect, useMemo, useState } from "react";
import type { TransitionPresentationAction } from "../backroomsGen";

export type ActiveTransitionPresentation = {
  sequence: number;
  profileId: string;
  actions: TransitionPresentationAction[];
};

function TransitionTint({
  action,
}: {
  action: Extract<TransitionPresentationAction, { type: "screen_tint" }>;
}) {
  const [visible, setVisible] = useState(false);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    setVisible(false);
    setReleasing(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    const release = window.setTimeout(() => {
      setReleasing(true);
      setVisible(false);
    }, action.attackMs + action.holdMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(release);
    };
  }, [action]);

  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: action.color,
        opacity: visible ? action.peakOpacity : 0,
        transitionProperty: "opacity",
        transitionDuration: `${releasing ? action.releaseMs : action.attackMs}ms`,
        transitionTimingFunction: "ease-out",
      }}
    />
  );
}

/**
 * Event-driven transition treatment. It mounts only for a map transition,
 * uses CSS/timers instead of the game render loop, and cannot affect map
 * routing, collision, or topology.
 */
export function TransitionPresentationLayer({
  presentation,
  onComplete,
}: {
  presentation: ActiveTransitionPresentation | null;
  onComplete: (sequence: number) => void;
}) {
  const visualActions = useMemo(
    () =>
      presentation?.actions.filter(
        (action) => action.type !== "play_sound",
      ) ?? [],
    [presentation],
  );
  const durationMs = useMemo(
    () =>
      visualActions.reduce((longest, action) => {
        const duration =
          action.type === "screen_tint"
            ? action.attackMs + action.holdMs + action.releaseMs
            : action.durationMs * action.repetitions;
        return Math.max(longest, duration);
      }, 0),
    [visualActions],
  );

  useEffect(() => {
    if (!presentation) return;
    const timer = window.setTimeout(
      () => onComplete(presentation.sequence),
      Math.max(1, durationMs + 32),
    );
    return () => window.clearTimeout(timer);
  }, [durationMs, onComplete, presentation]);

  if (!presentation || visualActions.length === 0) return null;

  return (
    <div
      data-testid="transition-presentation-layer"
      data-profile-id={presentation.profileId}
      className="pointer-events-none absolute inset-0 z-[45] overflow-hidden"
      aria-hidden="true"
    >
      <style>{`@keyframes transition-presentation-pulse { 0%, 100% { opacity: 0; } 45% { opacity: 1; } }`}</style>
      {visualActions.map((action, index) =>
        action.type === "screen_tint" ? (
          <TransitionTint key={`${presentation.sequence}:tint:${index}`} action={action} />
        ) : (
          <div
            key={`${presentation.sequence}:pulse:${index}`}
            className="absolute inset-0"
            style={{
              backgroundColor: action.color,
              opacity: action.peakOpacity,
              animation: `transition-presentation-pulse ${action.durationMs}ms ease-in-out ${action.repetitions}`,
            }}
          />
        ),
      )}
    </div>
  );
}

