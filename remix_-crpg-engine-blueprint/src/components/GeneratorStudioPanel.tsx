import { useState } from "react";
import { Boxes, Layers3 } from "lucide-react";
import { BackroomsGeneratorPanel } from "./BackroomsGeneratorPanel";
import { DungeonGeneratorPanel } from "./DungeonGeneratorPanel";

export function GeneratorStudioPanel() {
  const [surface, setSurface] = useState<"backrooms" | "dungeons">("backrooms");
  return <div className="min-h-full bg-neutral-950">
    <div className="sticky top-0 z-30 flex items-center gap-1 border-b border-neutral-800 bg-black px-4 py-2">
      <button onClick={() => setSurface("backrooms")} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${surface === "backrooms" ? "bg-amber-500/15 text-amber-200" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"}`}><Boxes className="h-4 w-4" /> Backrooms Level 0</button>
      <button onClick={() => setSurface("dungeons")} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${surface === "dungeons" ? "bg-sky-500/15 text-sky-200" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"}`}><Layers3 className="h-4 w-4" /> Dungeon Generator</button>
    </div>
    {surface === "backrooms" ? <BackroomsGeneratorPanel /> : <DungeonGeneratorPanel />}
  </div>;
}
