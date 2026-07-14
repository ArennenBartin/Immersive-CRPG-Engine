// ── Versioned registries ─────────────────────────────────────────────────────
// The base exposes registries (commands, actions, effects, conditions, events,
// components, …). Later layers register new types into the same registries
// instead of patching a core monolith. Framework-agnostic.

export class Registry<T> {
  private items = new Map<string, T>();

  constructor(public readonly name: string) {}

  register(id: string, item: T, { overwrite = false } = {}): void {
    if (this.items.has(id) && !overwrite) {
      throw new Error(`Registry "${this.name}": id "${id}" already registered`);
    }
    this.items.set(id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  require(id: string): T {
    const item = this.items.get(id);
    if (!item) throw new Error(`Registry "${this.name}": unknown id "${id}"`);
    return item;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  ids(): string[] {
    return [...this.items.keys()];
  }

  list(): T[] {
    return [...this.items.values()];
  }
}
