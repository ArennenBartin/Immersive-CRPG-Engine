import {
  compareMacroCells,
  macroCellInBounds,
  macroCellKey,
  type MacroCell,
  type MacroGridBounds,
} from "./gridSearch";

export type DungeonOccupancyKind =
  | "room"
  | "padding"
  | "wall"
  | "socket"
  | "corridor"
  | "reserved";

export interface DungeonOccupancyClaim {
  ownerId: string;
  kind: DungeonOccupancyKind;
}

export class DungeonOccupancy {
  private readonly claims = new Map<string, DungeonOccupancyClaim>();

  constructor(readonly bounds: MacroGridBounds) {}

  clone(): DungeonOccupancy {
    const clone = new DungeonOccupancy(this.bounds);
    for (const [key, claim] of this.claims) clone.claims.set(key, { ...claim });
    return clone;
  }

  claim(cell: MacroCell, claim: DungeonOccupancyClaim, compatible: readonly DungeonOccupancyKind[] = []): boolean {
    if (!macroCellInBounds(cell, this.bounds)) return false;
    const key = macroCellKey(cell);
    const existing = this.claims.get(key);
    if (existing && existing.ownerId !== claim.ownerId && !compatible.includes(existing.kind)) return false;
    this.claims.set(key, { ...claim });
    return true;
  }

  claimAll(
    cells: readonly MacroCell[],
    claim: DungeonOccupancyClaim,
    compatible: readonly DungeonOccupancyKind[] = [],
  ): boolean {
    if (cells.some((cell) => !this.canClaim(cell, claim.ownerId, compatible))) return false;
    cells.forEach((cell) => this.claim(cell, claim, compatible));
    return true;
  }

  canClaim(cell: MacroCell, ownerId: string, compatible: readonly DungeonOccupancyKind[] = []): boolean {
    if (!macroCellInBounds(cell, this.bounds)) return false;
    const existing = this.claims.get(macroCellKey(cell));
    return !existing || existing.ownerId === ownerId || compatible.includes(existing.kind);
  }

  at(cell: MacroCell): DungeonOccupancyClaim | undefined {
    return this.claims.get(macroCellKey(cell));
  }

  cells(kind?: DungeonOccupancyKind): MacroCell[] {
    return [...this.claims]
      .filter(([, claim]) => !kind || claim.kind === kind)
      .map(([key]) => key.split(":").map(Number) as MacroCell)
      .sort(compareMacroCells);
  }

  blockedForCorridor(allowedOwnerIds: ReadonlySet<string> = new Set()): Set<string> {
    return new Set(
      [...this.claims]
        .filter(([, claim]) =>
          !allowedOwnerIds.has(claim.ownerId) &&
          (claim.kind === "room" || claim.kind === "wall" || claim.kind === "reserved"))
        .map(([key]) => key),
    );
  }

  snapshot(): Array<{ cell: MacroCell; ownerId: string; kind: DungeonOccupancyKind }> {
    return [...this.claims]
      .map(([key, claim]) => ({ cell: key.split(":").map(Number) as MacroCell, ...claim }))
      .sort((left, right) => compareMacroCells(left.cell, right.cell) ||
        left.ownerId.localeCompare(right.ownerId) || left.kind.localeCompare(right.kind));
  }
}

