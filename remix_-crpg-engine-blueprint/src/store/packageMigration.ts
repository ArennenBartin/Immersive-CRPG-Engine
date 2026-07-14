import type { GamePackage } from "../schema/game";
import { migrateGamePackageV1ToV2 } from "../schema/v2";

export interface MigrationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface MigrationChange {
  code: string;
  message: string;
  path?: string;
  affectedIds?: string[];
}

export interface PackageBackupArtifact {
  /** Suggested filename for a browser download or filesystem write. */
  filename: string;
  mimeType: "application/json";
  createdAt: string;
  /** Export-compatible v2 package JSON captured before the destructive operation. */
  json: string;
}

/**
 * The common result contract for package normalization and explicit content
 * installation. `package` is always safe to apply. If confirmation is still
 * required it remains the original package and `proposedPackage` contains the
 * candidate solely for review.
 */
export interface PackageMigrationResult {
  package: GamePackage;
  warnings: MigrationWarning[];
  changes: MigrationChange[];
  destructiveChanges: MigrationChange[];
  applied: boolean;
  requiresConfirmation: boolean;
  proposedPackage?: GamePackage;
  backup?: PackageBackupArtifact;
  /** Convenience alias for callers that persist the backup without a download UI. */
  backupJson?: string;
}

export interface FinalizePackageMigrationOptions {
  confirmDestructive?: boolean;
  warnings?: MigrationWarning[];
  changes?: MigrationChange[];
  destructiveChanges?: MigrationChange[];
  now?: Date;
  backupReason?: string;
}

const safeFilenamePart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "game";

export const createPackageBackupArtifact = (
  source: GamePackage,
  options: { now?: Date; reason?: string } = {},
): PackageBackupArtifact => {
  const createdAt = (options.now || new Date()).toISOString();
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const reason = safeFilenamePart(options.reason || "before-destructive-change");
  return {
    filename: `${safeFilenamePart(source.metadata.title)}-${reason}-${timestamp}.json`,
    mimeType: "application/json",
    createdAt,
    json: JSON.stringify(migrateGamePackageV1ToV2(source), null, 2),
  };
};

export const removedMapIds = (source: GamePackage, candidate: GamePackage): string[] => {
  const candidateIds = new Set(candidate.maps.map((map) => map.id));
  return [...new Set(source.maps.map((map) => map.id))].filter((id) => !candidateIds.has(id));
};

const sameChange = (left: MigrationChange, right: MigrationChange) =>
  left.code === right.code &&
  left.path === right.path &&
  left.message === right.message &&
  JSON.stringify(left.affectedIds || []) === JSON.stringify(right.affectedIds || []);

/**
 * Applies a migration candidate only when it is non-destructive or explicitly
 * confirmed. Map removals are detected even if a caller forgets to declare
 * them. Confirmed destructive operations always receive a pre-operation JSON
 * backup without relying on Node APIs or DOM side effects.
 */
export const finalizePackageMigration = (
  source: GamePackage,
  candidate: GamePackage,
  options: FinalizePackageMigrationOptions = {},
): PackageMigrationResult => {
  const warnings = [...(options.warnings || [])];
  const changes = [...(options.changes || [])];
  const destructiveChanges = [...(options.destructiveChanges || [])];
  const removedIds = removedMapIds(source, candidate);

  if (removedIds.length) {
    const removal: MigrationChange = {
      code: "maps_removed",
      path: "maps",
      message: `The operation would remove ${removedIds.length} map${removedIds.length === 1 ? "" : "s"}.`,
      affectedIds: removedIds,
    };
    if (!destructiveChanges.some((change) => sameChange(change, removal))) {
      destructiveChanges.push(removal);
    }
  }

  if (destructiveChanges.length && !options.confirmDestructive) {
    warnings.push({
      code: "destructive_confirmation_required",
      message: "The proposed package was not applied because destructive changes require explicit confirmation.",
    });
    return {
      package: source,
      proposedPackage: candidate,
      warnings,
      changes,
      destructiveChanges,
      applied: false,
      requiresConfirmation: true,
    };
  }

  const backup = destructiveChanges.length
    ? createPackageBackupArtifact(source, {
        now: options.now,
        reason: options.backupReason,
      })
    : undefined;

  return {
    package: candidate,
    warnings,
    changes,
    destructiveChanges,
    applied: true,
    requiresConfirmation: false,
    backup,
    backupJson: backup?.json,
  };
};

/**
 * Runtime assertion used by normalizers and headless tests. An unconfirmed
 * result must never make an input map ID disappear from the safe package.
 */
export const assertUnconfirmedMapPreservation = (
  source: GamePackage,
  result: PackageMigrationResult,
) => {
  if (result.backup || (result.applied && result.destructiveChanges.length)) return;
  const missing = removedMapIds(source, result.package);
  if (missing.length) {
    throw new Error(`Unconfirmed package migration removed map IDs: ${missing.join(", ")}`);
  }
};
