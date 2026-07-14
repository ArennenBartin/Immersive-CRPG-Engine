// Compatibility barrel: phase-4 story gates now live in the framework-agnostic
// engine core. Existing editor/runtime imports can keep using this path.
export {
  CLOCK_PHASE_LABELS,
  buildConditionContext,
  computeShopPrice,
  evaluateCondition,
  findCutsceneLabelIndex,
  getAvailableShopStock,
  getClockPhaseId,
  getVisibleDialogueOptions,
  isDialogueOptionVisible,
  isMapExitEligible,
  isTriggerEligible,
  resolveDialogueNode,
  selectEligibleBark,
  shouldRunCutsceneBranch,
} from "../engine-core/story";
export type {
  BarkSelectionOptions,
  ClockPhaseId,
  ConditionContext,
  DialogueOptionData,
  ShopStockEntry,
} from "../engine-core/story";
