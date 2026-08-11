// Backrooms maps use the established guarded package transaction unchanged:
// both generators produce ordinary MapData with the same provenance and
// generated-ID namespace contract.
export {
  applyDungeonPackageBake as applyBackroomsPackageBake,
  planDungeonPackageBake as planBackroomsPackageBake,
  remapDungeonMapBundle as remapBackroomsMapBundle,
} from "../dungeonGen/packageBake";

export type {
  ApplyDungeonPackageBakeOptions as ApplyBackroomsPackageBakeOptions,
  DungeonBakeCollision as BackroomsBakeCollision,
  DungeonBakeCollisionPolicy as BackroomsBakeCollisionPolicy,
  DungeonPackageBakePlan as BackroomsPackageBakePlan,
  DungeonPackageBakeResult as BackroomsPackageBakeResult,
} from "../dungeonGen/packageBake";
