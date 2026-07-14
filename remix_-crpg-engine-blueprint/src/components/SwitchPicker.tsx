// Shared switch-id input: free text plus a datalist of every switch declared
// in the registry (Game panel · Switches) or referenced anywhere in content,
// so authors pick existing switches instead of retyping them.
import React, { useId, useMemo } from "react";
import { useEngineStore } from "../store/engineStore";
import { collectReferencedSwitches } from "./GameEditor";

export function SwitchPicker({
  value,
  onChange,
  placeholder = "switch_name",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const gamePackage = useEngineStore((state) => state.gamePackage);
  const listId = useId();
  const ids = useMemo(() => {
    const declared = Object.keys(gamePackage.switches || {});
    const referenced = collectReferencedSwitches(gamePackage);
    return Array.from(new Set([...declared, ...referenced])).sort();
  }, [gamePackage]);

  return (
    <>
      <input
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={
          className ||
          "w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
        }
      />
      <datalist id={listId}>
        {ids.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </>
  );
}
