import { useCallback, useEffect, useRef, useState } from "react";

export const OPENING_PROLOGUE_VIDEO_URL =
  "/cutscenes/intro-fractal-pingpong.mp4";

export const OPENING_PROLOGUE_LINES = [
  "There was a time where I wouldn't dread this.",
  "I mean. For gods sake I'm just going to a friend's place.",
  "To get DRUNK!",
  "Whatever, everything that bothers me could either get like.... way worse or way, WAY better with some alcohol.",
  "Maybe I'll see a talking spider again, that was fun.",
  "Either way, I really should be visiting Riley more... She's asked me to hang out probably like 20 times over.",
  "It'll be fun...",
] as const;

export function ManagedLoopingVideo({
  src,
  className = "absolute inset-0 h-full w-full object-cover object-center",
}: {
  src: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {
      // A New Game click normally satisfies autoplay. Browsers that still
      // gate playback will retry from the next user interaction.
    });
    return () => {
      // Release the decoder before mounting the comparatively heavy 3D play
      // scene. Keeping the old video pipeline alive caused some browsers to
      // exhaust their media/GPU resources at the end of the prologue.
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  );
}

export function OpeningPrologue({ onComplete }: { onComplete: () => void }) {
  const [lineIndex, setLineIndex] = useState(0);
  const completedRef = useRef(false);

  const advance = useCallback(() => {
    if (completedRef.current) return;
    if (lineIndex >= OPENING_PROLOGUE_LINES.length - 1) {
      completedRef.current = true;
      onComplete();
      return;
    }
    setLineIndex((current) => current + 1);
  }, [lineIndex, onComplete]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance]);

  const finalLine = lineIndex === OPENING_PROLOGUE_LINES.length - 1;

  return (
    <section
      className="relative h-full overflow-hidden bg-black text-white"
      aria-label="Opening cutscene"
      data-opening-prologue
      data-prologue-line={lineIndex + 1}
    >
      <ManagedLoopingVideo src={OPENING_PROLOGUE_VIDEO_URL} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_18%,rgba(0,0,0,0.28)_72%,rgba(0,0,0,0.78)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/72" />

      <div className="relative z-10 flex h-full items-end justify-center px-5 pb-8 sm:px-10 sm:pb-12">
        <button
          type="button"
          onClick={advance}
          className="group w-full max-w-3xl border border-red-950/90 bg-black/82 px-5 py-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.82)] backdrop-blur-[2px] transition-colors hover:border-red-700 hover:bg-black/88 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 sm:px-7 sm:py-5"
          aria-label={finalLine ? "Finish opening cutscene" : "Advance opening cutscene"}
        >
          <span className="flex items-center justify-between gap-4 border-b border-red-950/70 pb-2 font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-[0.26em] text-red-400">
            <span>Steve</span>
            <span className="text-[10px] tracking-[0.2em] text-neutral-500">
              {lineIndex + 1} / {OPENING_PROLOGUE_LINES.length}
            </span>
          </span>
          <span
            className="mt-3 block font-[family-name:var(--font-body)] text-base leading-relaxed text-neutral-100 sm:text-lg"
            aria-live="polite"
          >
            {OPENING_PROLOGUE_LINES[lineIndex]}
          </span>
          <span className="mt-4 block text-right font-[family-name:var(--font-display)] text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-500 transition-colors group-hover:text-red-400">
            {finalLine ? "Begin" : "Continue"} · Click / Space / Enter
          </span>
        </button>
      </div>
    </section>
  );
}
