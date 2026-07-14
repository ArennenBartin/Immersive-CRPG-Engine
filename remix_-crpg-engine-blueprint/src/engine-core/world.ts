// ── Reference in-memory grid world ───────────────────────────────────────────
// A minimal GridWorld used by tests and as a reference adapter. The live runtime
// will later implement GridWorld over the real save/map data; this proves the
// pipeline works headlessly without React.

import { EventBus } from "./events";
import { GridEntity, GridWorld } from "./pipeline";
import { RngStreams } from "./rng";

export class InMemoryGridWorld implements GridWorld {
  tick = 0;
  rng: RngStreams;
  events = new EventBus();
  private entities = new Map<string, GridEntity>();
  private blocked = new Set<string>();

  constructor(masterSeed: number, public width = 32, public height = 32) {
    this.rng = new RngStreams(masterSeed);
  }

  private key(x: number, y: number) {
    return `${x},${y}`;
  }

  setBlocked(x: number, y: number, value = true): void {
    if (value) this.blocked.add(this.key(x, y));
    else this.blocked.delete(this.key(x, y));
  }

  addEntity(entity: GridEntity): void {
    this.entities.set(entity.id, entity);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return !this.blocked.has(this.key(x, y));
  }

  getEntity(id: string): GridEntity | undefined {
    return this.entities.get(id);
  }

  getEntityAt(x: number, y: number): GridEntity | undefined {
    for (const e of this.entities.values()) if (e.x === x && e.y === y) return e;
    return undefined;
  }

  moveEntity(id: string, x: number, y: number): void {
    const e = this.entities.get(id);
    if (e) {
      e.x = x;
      e.y = y;
    }
  }
}
