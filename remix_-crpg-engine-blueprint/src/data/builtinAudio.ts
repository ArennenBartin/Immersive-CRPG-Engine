// Pure registry shared by runtime audio resolution and headless reference
// audits. Package settings may override any ID with a custom URL.
export const SFX = {
  ui_click: "/sfx/ui-click.wav",
  ui_back: "/sfx/ui-back.wav",
  dialogue_open: "/sfx/dialogue-open.wav",
  dialogue_next: "/sfx/dialogue-next.wav",
  document_open: "/sfx/document-open.wav",
  item_pickup: "/sfx/item-pickup.wav",
  coin: "/sfx/coin.wav",
  save_chime: "/sfx/save-chime.wav",
  shop_open: "/sfx/shop-open.wav",
  door_transition: "/sfx/door-transition.wav",
  footstep_stone: "/sfx/footstep-stone.wav",
  bump: "/sfx/bump.wav",
  melee_swing: "/sfx/melee-swing.wav",
  melee_hit: "/sfx/melee-hit.wav",
  melee_crit: "/sfx/melee-crit.wav",
  enemy_defeat: "/sfx/enemy-defeat.wav",
  spell_cast: "/sfx/spell-cast.wav",
  spell_hit: "/sfx/spell-hit.wav",
  heal: "/sfx/heal.wav",
  level_up: "/sfx/level-up.wav",
  warning: "/sfx/warning.wav",
} as const;

export type SoundEffectId = keyof typeof SFX;
