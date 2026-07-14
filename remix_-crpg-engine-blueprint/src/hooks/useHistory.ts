import { useState, useCallback } from 'react';

export function useHistory<T>(initialState: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialState);
  const [future, setFuture] = useState<T[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setPast(newPast);
    setFuture([present, ...future]);
    setPresent(previous);
  }, [past, present, future]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setPast([...past, present]);
    setPresent(next);
    setFuture(newFuture);
  }, [past, present, future]);

  const set = useCallback((newPresent: T | ((curr: T) => T)) => {
    setPresent((current) => {
      const nextValue = typeof newPresent === 'function' ? (newPresent as Function)(current) : newPresent;
      if (current === nextValue) return current;
      setPast((p) => [...p, current]);
      setFuture([]);
      return nextValue;
    });
  }, []);

  const reset = useCallback((newPresent: T) => {
    setPast([]);
    setPresent(newPresent);
    setFuture([]);
  }, []);

  return { state: present, set, undo, redo, canUndo, canRedo, reset };
}
