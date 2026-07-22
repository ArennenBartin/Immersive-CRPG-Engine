# CRPG Engine Feature Demo

This project is a 3D-presented, grid-simulated CRPG engine workspace with a built-in feature-test package. The demo exercises maps, object placement, fog of war, doors, containers, items, dialogue, documents, quests, shops, party recruitment, combat, simulation, saves, import/export, and the editor surfaces.

## Documentation

- [Current Engine Systems Reference (3D, Stabilized)](docs/ENGINE_SYSTEMS_REFERENCE_3D_STABILIZED.md) — consolidated, source-audited feature and contract reference
- [Dungeon Generator — Implemented Systems Record](docs/DUNGEON_GENERATOR_IMPLEMENTED.md) — current DG0–DG10 architecture, authoring/bake workflow, commands, limitations, and source map
- [Stabilization and Dungeon Readiness — Implementation Record](docs/STABILIZATION_AND_DUNGEON_READINESS_IMPLEMENTED.md) — S0–S7 changes, acceptance evidence, and deferred backlog
- [Implemented Systems (2D)](docs/IMPLEMENTED_SYSTEMS_2D.md) — historical pre-3D implementation reference
- [Implemented Baseline and Rewrite Manifest v1](docs/00_IMPLEMENTED_BASELINE_AND_REWRITE_MANIFEST_V1.md) — implementation-grounded rewrite coordination
- [Grid-Based 2D CRPG Base Systems v3](docs/01_GRID_2D_CRPG_BASE_IMPLEMENTATION_GROUNDED_V3.md) — target base runtime spec grounded in the current implementation
- [Systemic Grid Interaction Kernel v3](docs/02_SYSTEMIC_GRID_INTERACTION_KERNEL_IMPLEMENTATION_GROUNDED_V3.md) — object identity, transactions, world facts, and exposure
- [Systems-Heavy Grid Simulation v4](docs/03_SYSTEMS_HEAVY_GRID_SIMULATION_IMPLEMENTATION_GROUNDED_V4.md) — simulation S0-S8 roadmap and implementation grounding
- [Grid Immersive-Sim Engine Roadmap v1](docs/04_GRID_IMMERSIVE_SIM_ENGINE_ROADMAP_V1.md) — object/Part, scheduler, reactions, perception, verbs, combat, inventory, and world-state roadmap
- [Alderamontico State System Contract v1](docs/05_ALDERAMONTICO_STATE_SYSTEM_CONTRACT_V1.md) — physical + emotional axis-state target contract
- [Emotional Layer, Grid Operator & Attend v1](docs/06_EMOTIONAL_LAYER_GRID_ATTEND_SPEC_V1.md) — implementation-grounded completion spec for emotional axes, Grid/lens operation, Condition read-outs, and attend nodes
- [Overworld Development Plan v2](docs/07_OVERWORLD_DEVELOPMENT_PLAN_V2.md) — phased Threefold March asset, geography, population, wiring, and integration plan
- [Alderamontico Fracture Crawl — Codex Engine Architecture Build Plan v1](docs/08_ALDERAMONTICO_FRACTURE_CRAWL_CODEX_ENGINE_BUILD_PLAN_V1.md) — phased, acceptance-gated engine delivery plan for the August 1 architecture milestone
- [Fracture Crawl GDD v0.3 — Jam Production Patch](docs/fracture_crawl/fracture_crawl_game_design_document_v0_3_jam_production_patch.md) — canonical systems, campaign-loop, content-scope, and jam-production reference for Fracture Crawl
- [Fracture Crawl Phase 0–1 Baseline and Studio/Play Handoff](docs/fracture_crawl/PHASE_0_1_REPOSITORY_TRUTH_AND_STUDIO_PLAY_BASELINE_2026-07-14.md) — repository audit, safety repairs, Studio/Play contract, verification evidence, and user acceptance checklist
- [Fracture Crawl Phases 2–3 — Illumination and Sensory Perception](docs/fracture_crawl/PHASE_2_3_ILLUMINATION_AND_SENSORY_PERCEPTION_2026-07-14.md) — authoritative darkness/light/fog, typed senses, last-known search, QA chamber, and user acceptance checklist
- [Fracture Crawl Phases 4–5 — Campaign State and Intercessor Succession](docs/fracture_crawl/PHASE_4_5_CAMPAIGN_STATE_AND_INTERCESSOR_SUCCESSION_2026-07-15.md) — campaign/expedition state layers, deterministic successors, life history, and pending world-materialization records
- [Fracture Crawl Phases 6–8 — Ghosts, Artifact Recovery, and Glass Fuel](docs/fracture_crawl/PHASE_6_8_GHOSTS_ARTIFACTS_AND_GLASS_2026-07-18.md) — persistent ghost skills, conserved artifact bundles, Glass value/fuel tradeoff, Studio authoring, and browser acceptance route
- [Fracture Crawl Phases 9–11 — Deterministic Dungeons and Integrated Architecture](docs/fracture_crawl/PHASE_9_11_DUNGEON_GENERATION_AND_INTEGRATED_SCENARIO_2026-07-19.md) — non-destructive topology drafts, exact-draft geometry, typed editable sockets, guarded bake, and the complete Phase 11 browser scenario
- [Alderamontico World Bible v1](docs/canon/alderamontico_world_bible_v1.md) — authoritative world reference for cosmology, the Grid, Glass, peoples, philosophies-as-factions, and the Anchor
- [The Third Voice Master Build Plan v1](docs/third_voice/the_third_voice_master_build_plan_v1.md) — primary project bible and agent-facing build plan for The Third Voice
- [The Third Voice Act 2 Attend System](docs/third_voice/the_third_voice_act2_attend_system.md) — authoritative Attend mechanic spec for hidden scoring, side quests, combat Attend, and ending comprehension
- [The Third Voice Treatment v2](docs/third_voice/the_third_voice_treatment_v2.md) — adventure treatment for the Threefold March trial
- [The Third Voice NPC Scene Dialogue Writing Bible v1](docs/third_voice/the_third_voice_npc_scene_dialogue_writing_bible_v1.md) — writer-facing dialogue, scene, bark, and NPC voice reference
- [Unsurfaced Systems Play Mode Plan](docs/UNSURFACED_SYSTEMS_PLAYMODE_PLAN.md) — Play Mode surfacing checklist
- [Spear of Destiny V5 Fixed Canon](docs/canon/spear_of_destiny_wound_is_the_lie_v5_fixed_canon.md)

## Run Locally

1. Install dependencies with `npm install`.
2. Optional: set `GEMINI_API_KEY` in `.env.local` for AI-assisted authoring endpoints.
3. Start the dev server with `npm run dev`.
4. If port 5000 is occupied (macOS AirTunes commonly claims it), use
   `PORT=5003 HMR_PORT=5004 npm run dev` and open `http://localhost:5003`.

## Validation

- `npm run verify` — complete release/readiness gate
- `npm run verify:dungeon-readiness` — descriptive alias for the same gate
- `npm run test:all` — complete chained automated test suite
- `npm run audit:all` — complete chained repository audit suite
- `npm run lint`
- `npm run test:engine`
- `npm run test:perception` — focused 27-check illumination, terrain/actor visibility, wall-lighting, sensory-profile, search, and alert-gating contract
- `npm run test:chemistry`
- `npm run test:state`
- `npm run test:dungeon` — focused deterministic dungeon-generator suite
- `npm run test:dungeon-quality` — off-thread Draft/Geometry/Full contract and deterministic 32-seed single-map quality corpus
- `npm run test:fracture-dungeon` — Fracture topology draft, exact geometry bake, socket, provenance, edit, and remap contract
- `npm run test:phase11` — complete fixed-seed integrated architecture state-transition route
- `npm run audit:dungeon` — one default Institutional Ruin end-to-end audit
- `npm run audit:dungeon-seeds -- --count N --recipe ID --stage topology|embedding|full` — configurable seed corpus; add `--json [file]` or `--csv [file]` for reports
- `npm run profile:dungeon` — three default full-generation profiles and bounded-budget checks
- `npm run build`
- `npm run audit:maps`
- `npm run audit:combat`

The live inner contracts remain `crpg_engine_game_package_v1` and `crpg_engine_save_v1`; JSON export/persistence wraps them in the corresponding v2 envelopes. See the current systems reference for migration and normalization caveats.
