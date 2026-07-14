// ── Structured event stream ──────────────────────────────────────────────────
// Every committed command/effect emits a structured event. Later layers (the
// interaction kernel, philosophy, simulation) consume this stream rather than
// patching gameplay code. Framework-agnostic.

export interface EngineEvent {
  id: number;
  type: string;
  tick: number;
  actorIds?: string[];
  targetIds?: string[];
  tags?: string[];
  payload?: Record<string, unknown>;
}

export type EventListener = (event: EngineEvent) => void;

export class EventBus {
  private nextId = 1;
  private log: EngineEvent[] = [];
  private listeners = new Map<string, Set<EventListener>>();
  private anyListeners = new Set<EventListener>();

  // Subscribe to one event type, or pass "*" for all. Returns an unsubscribe fn.
  subscribe(type: string, listener: EventListener): () => void {
    if (type === "*") {
      this.anyListeners.add(listener);
      return () => this.anyListeners.delete(listener);
    }
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  emit(
    type: string,
    tick: number,
    fields: Omit<EngineEvent, "id" | "type" | "tick"> = {},
  ): EngineEvent {
    const event: EngineEvent = { id: this.nextId++, type, tick, ...fields };
    this.log.push(event);
    this.listeners.get(type)?.forEach((l) => l(event));
    this.anyListeners.forEach((l) => l(event));
    return event;
  }

  getLog(): readonly EngineEvent[] {
    return this.log;
  }

  clear(): void {
    this.log = [];
  }
}
