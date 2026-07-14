# Editor Coverage Audit — no-code authorability

**Status: all 18 fixes below are implemented and browser-verified.** The new
**Game** nav panel is the hub for items 1–10; the rest live in their editors.

Goal: every engine feature adjustable in the editor without touching code.
Audited against `GamePackageSchema` + runtime consumers (PlayMode, engine-core).

## Already authorable (no action needed)
- Maps: cells/walls/heights, tiles, objects, items, containers, enemies,
  interact dialogues, triggers (+conditions), stamps, **Grid regions with
  Alderamontico amplification + emotional profile offsets + passive checks**.
- Tiles/Sprites (TileMaker, SpriteCreator), Dialogue trees (nodes/options with
  conditions via ConditionEditor), Quests, Items, Documents, Shops (conditional
  stock), Skills (payloads), Entities (stats, skills, sprites, dialogues,
  **starting emotional axes**).
- Simulation panel = live debug viewer (read-only by design).

## Code-only features found (the work list)
| # | Feature | Where it lived | Fix |
|---|---------|----------------|-----|
| 1 | Game identity: title, version, start map/spawn | `metadata` (JSON import only) | New **Game** panel · Basics tab |
| 2 | Player start: stats, sprite, known skills, party, portrait | `settings.*` | Game panel · Player tab |
| 3 | Clock: start hour, minutes per turn | `settings.*` | Game panel · Basics tab |
| 4 | Audio registries: music_tracks, sound_effects, title music | `settings.*` | Game panel · Audio tab |
| 5 | Dialogue portraits per speaker | `settings.dialogue_portraits` | Game panel · Portraits tab |
| 6 | Switch registry (declared switches) | `package.switches` | Game panel · Switches tab + pickers everywhere |
| 7 | Factions (rep system behind conditions) | `package.factions` | Game panel · Factions tab |
| 8 | Ambient barks (paired NPC exchanges) | `package.barks` | Game panel · Barks tab |
| 9 | Endings (id/title used by game_end) | `package.endings` | Game panel · Endings tab |
| 10 | Chemistry materials + object material binding | `CHEM_MATERIALS` table + regex inference in `chemistryRuntime.ts` | `chem_material_id` on objects (TileMaker dropdown) + custom materials tab (Game panel) honored by the runtime |
| 11 | Entity story hooks: `soul_bearing`, `on_defeat_switch`, `on_defeat_cutscene_id` | schema-only | EntityEditor section |
| 12 | Entity combat Attend (5 `combat_attend_*` fields) | schema-only | EntityEditor section |
| 13 | Entity authored Attend node (readings/truths/effects) | schema-only | EntityEditor builder |
| 14 | Skill `emotional_impulse` (emotional verbs) | schema-only | SkillEditor section |
| 15 | Cutscene actions `play_sound`, `restore_party`, `game_end` | runtime supports; editor listed them unsupported/missing | CutsceneEditor support |
| 16 | Dialogue node `scene_image_url/alt`, option `set_switches` | schema-only | DialogueEditor fields |
| 17 | Per-map music (`settings.map_music`) | authored in data but **no engine consumer** | implement in PlayMode + MapEditor dropdown |
| 18 | Entity delete/duplicate | delete button dead | implement |

Inert setting left alone: `attend_ui_mode` (no consumer; revisit when the
attend HUD lands).
