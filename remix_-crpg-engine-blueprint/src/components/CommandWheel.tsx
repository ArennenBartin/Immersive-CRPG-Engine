/**
 * @deprecated Historical radial UI. Play Mode exposes the canonical verbs in
 * its paged action bar; production modules must not import this component.
 */
import React, { useEffect } from "react";

// A radial command menu for the immersive-sim global verbs. It is purely a
// chooser: it renders a ring of verb wedges and reports the selection. The
// caller owns what each verb does (target-cell cursor, dispatch, commit), so
// the wheel stays reusable as more verbs come online.

export interface CommandWheelVerb {
  kind: string;
  label: string;
  icon: string; // emoji glyph
  enabled: boolean;
  hint?: string;
}

interface Props {
  verbs: CommandWheelVerb[];
  onSelect: (kind: string) => void;
  onClose: () => void;
}

const SIZE = 360; // px, square container
const RADIUS = 134; // px, wedge distance from center

export function CommandWheel({ verbs, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = verbs.length || 1;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55"
      onClick={onClose}
    >
      <div
        className="relative"
        style={{ width: SIZE, height: SIZE }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* center hub */}
        <div className="absolute left-1/2 top-1/2 flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-neutral-600 bg-neutral-900/95 text-center shadow-lg">
          <span className="text-sm font-semibold text-neutral-100">Commands</span>
          <span className="mt-0.5 text-[10px] text-neutral-500">Esc to close</span>
        </div>

        {verbs.map((verb, index) => {
          const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
          const cx = SIZE / 2 + Math.cos(angle) * RADIUS;
          const cy = SIZE / 2 + Math.sin(angle) * RADIUS;
          return (
            <button
              key={verb.kind}
              disabled={!verb.enabled}
              title={verb.hint || verb.label}
              onClick={() => {
                if (verb.enabled) onSelect(verb.kind);
              }}
              className={`absolute flex h-[58px] w-[58px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border text-center transition-colors ${
                verb.enabled
                  ? "cursor-pointer border-cyan-500/60 bg-neutral-900/95 text-neutral-50 shadow-md hover:border-cyan-300 hover:bg-cyan-950/70"
                  : "cursor-not-allowed border-neutral-800 bg-neutral-950/80 text-neutral-600"
              }`}
              style={{ left: cx, top: cy }}
            >
              <span className="text-lg leading-none">{verb.icon}</span>
              <span className="text-[10px] capitalize leading-none">{verb.label}</span>
              {!verb.enabled && (
                <span className="text-[7px] uppercase tracking-wide text-neutral-700">soon</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
