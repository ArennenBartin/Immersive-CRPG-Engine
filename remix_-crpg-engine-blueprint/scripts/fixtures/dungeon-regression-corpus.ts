/**
 * Small, intentionally stable corpus for the focused generator test suite.
 * The large seed audit derives its own numbered seeds; this list is for fast
 * regression checks that run as part of `test:all`.
 */
export const DUNGEON_REGRESSION_SEEDS = [
  "institutional-ruin-001",
  "institutional-ruin-gate-heavy-017",
  "institutional-ruin-multifloor-042",
  "institutional-ruin-secret-heavy-073",
] as const;

export const DUNGEON_PROFILE_SEEDS = [
  "institutional-ruin-profile-001",
  "institutional-ruin-profile-002",
  "institutional-ruin-profile-003",
] as const;

