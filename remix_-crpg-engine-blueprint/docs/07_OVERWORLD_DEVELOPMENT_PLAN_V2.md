# 07 — OVERWORLD DEVELOPMENT PLAN (PHASED) V2

**Status:** The phased build plan for the Threefold March overworld. Supersedes 07 v1 (which is folded in as Phase 4, "Population"). Written for AI authoring against the current engine, grounded in shipped systems (single-plane `x/z` grids, numeric chemistry axes, entity scheduling, Stage 4 perception, audit scripts) and the emotional-layer spec (`06`).
**How to use:** Execute the phases in order. Do not begin a phase until the prior phase's exit criteria pass. Each phase has a deliverable, rules, and an audit gate. Phases 0–1 are art; 2–3 are geography and greybox; 4–5 are population and wiring; 6 is the audit pass.
**Art direction (active override):** The active overworld terrain/structure/barrier/prop skin is generated bitmap art: square-faced oblique tile textures and object cutouts, front and top faces visible, sketchy painted/Da Vinci-notebook texture, no labels, no baked backgrounds. Tiles must be cropped out of their atlas gutters and edge-conditioned so they loop. Structure and barrier tiles must be axis-aligned square faces, not isometric blocks: no perspective taper, no left/right side faces. Prop cutouts use the same front/top cabinet projection where possible. Towns, cities, estates, and fractures are not single-tile icons; they are built by hand from terrain, structure, barrier, aperture, and prop assets. The older 16x16 top-down pixel library remains installed as a fallback/source manifest and for current entity/overlay sprites.

**Current implementation status:** Phase 0 and Phase 1 now have an audit-backed source library and active generated terrain/structure/barrier/prop skins. `src/data/overworldAssets.ts` defines the locked 32-color fallback palette, 16x16 tile/object/entity/player manifest, package-compatible sprite records, entity facing/step frames, chemistry/object flags, and emotional baselines. `src/data/obliqueTerrainAssets.ts` registers 16 generated `oblique_tile_*` terrain sprites and makes them the active floor binding for the current overworld terrain objects. `src/data/obliqueStructureAssets.ts` registers 16 generated `oblique_structure_*` wall/door sprites and binds the current wall/door objects to square-faced full-tile textures. `src/data/obliqueBarrierAssets.ts` registers 16 generated `oblique_barrier_*` barrier/aperture sprites for fences, gates, windows, hedges, screens, grates, barricades, and Glass barriers, with `obj_bush` bound to the thorn hedge full-tile blocker. `src/data/obliquePropAssets.ts` registers 48 generated `oblique_prop_*` object cutouts across the systemic/story prop atlas, the interior/furniture object-pass atlas, and the exterior/nature/building-clutter atlas: crates, chests, barrels, workstations, terminals, beacons, signs, shrines, market tables, carts, rope/pulley stacks, stump/dead tree variants, Glass/Grid emitters, beds, bedrolls, chairs, tables, shelves, lamps, wells, rubble, ladders, counters, mechanism benches, altars, cupboards, stoves, broken statues, floor hatches, wind-bent trees, fallen logs, boulders, brambles, reeds, firewood, hay bales, rain barrels, broken fences, plank piles, roof debris, chimney debris, boarded windows, broken door boards, grave cairns, and roadside shrines. Current engine mappings cover crates, chests, terminals, the training beacon, tree/dead tree, the object-pass presets, and the new exterior clutter/nature presets. `scripts/extract-oblique-terrain-atlas.ts` crops `/public/overworld/generated/oblique/source/terrain_atlas_raw.png`, removes connected white gutters, edge-conditions the results for looping, and writes `/public/overworld/generated/oblique/terrain/*.png`, `/public/overworld/generated/oblique/terrain_manifest.json`, and `/public/overworld/generated/oblique/terrain_contact_sheet.png`. `scripts/extract-oblique-structure-atlas.ts` crops `/public/overworld/generated/oblique/source/structure_atlas_raw.png`, rejects the prior angled/isometric structure attempt under `/public/overworld/generated/oblique/rejected/`, edge-conditions the square-faced results for looping, and writes `/public/overworld/generated/oblique/structure/*.png`, `/public/overworld/generated/oblique/structure_manifest.json`, and `/public/overworld/generated/oblique/structure_contact_sheet.png`. `scripts/extract-oblique-barrier-atlas.ts` crops `/public/overworld/generated/oblique/source/barrier_atlas_raw.png`, removes connected white background for transparent fence/window gaps, edge-conditions horizontal seams, and writes `/public/overworld/generated/oblique/barrier/*.png`, `/public/overworld/generated/oblique/barrier_manifest.json`, and `/public/overworld/generated/oblique/barrier_contact_sheet.png`. `scripts/extract-oblique-prop-atlas.ts` crops `/public/overworld/generated/oblique/source/prop_atlas_raw.png`, `/public/overworld/generated/oblique/source/prop_objects_atlas_raw.png`, and `/public/overworld/generated/oblique/source/prop_exterior_atlas_raw.png`, removes chroma-key magenta/white background into alpha, and writes `/public/overworld/generated/oblique/prop/*.png`, `/public/overworld/generated/oblique/prop_manifest.json`, `/public/overworld/generated/oblique/prop_contact_sheet.png`, `/public/overworld/generated/oblique/prop_objects/*.png`, `/public/overworld/generated/oblique/prop_objects_manifest.json`, `/public/overworld/generated/oblique/prop_objects_contact_sheet.png`, `/public/overworld/generated/oblique/prop_exterior/*.png`, `/public/overworld/generated/oblique/prop_exterior_manifest.json`, and `/public/overworld/generated/oblique/prop_exterior_contact_sheet.png`. The playable preset object library now includes 32 new placeable object definitions for the object-pass and exterior-pass sprites, and persisted packages backfill them on load. The Intercessor player design reference is staged at `/public/sprites/player-pilgrim.png`; `scripts/extract-intercessor-player-atlas.ts` now crops `/public/overworld/generated/oblique/source/player_intercessor_atlas_raw.png`, removes chroma-key/generated gutters, pads the results to square canvases, and writes 8 generated `generated_player_intercessor_*` idle/step directional frames plus `/public/overworld/generated/player/intercessor_manifest.json` and `/public/overworld/generated/player/intercessor_contact_sheet.png`. `src/data/generatedPlayerAssets.ts` registers those frames, the package default player sprite is `generated_player_intercessor_south_idle`, and package/run backfills migrate legacy `spr_player` and `ovr_ent_intercessor_south_idle` player ids to the generated Intercessor. `npm run audit:overworld-assets` still validates the fallback/source pixel library and writes `/public/overworld/phase0_style_reference.png`, `/public/overworld/phase1_contact_sheet.png`, `/public/overworld/overworld_palette.json`, `/public/overworld/overworld_asset_manifest.json`, and `docs/overworld/PHASE_0_1_ART_BIBLE_AND_ASSET_MANIFEST.md`.

**Phase 2-3 implementation status:** Phase 2 named geography is now fixed in `src/utils/threefoldMarchMap.ts` and summarized in `docs/overworld/THREEFOLD_MARCH_GEOGRAPHY_V1.md`. `createThreefoldMarchMaps()` installs all nine March maps with fixed sizes, graph connections, edge spawns/exits, void margins, route skeletons, and placeholder landmarks: Watchfold, Reedmire, Combe, Hallowdown, Marrowhouse, Thornmarch, Gallowsreach, the Convening, and the Under-Convening. The current greybox visual version is `v2_cohesive_terrain`: terrain is authored as broad fields, pools, ridges, groves, scar bands, and roads rather than per-cell random material noise. The default package now starts at `map_march_convening#spawn_start`; the old `map_overworld` systems test map remains installed as a test lab. Persisted packages backfill missing `map_march_*` maps on load and refresh stale March greyboxes that predate the cohesive terrain pass. Towns/seats are greyboxed from floor/wall/door/prop tiles, not single-tile town icons, and fracture-mouths are scar terrain plus Glass/story props, not single-tile fracture icons. `npm run audit:maps` now checks exit walkability and spawn-to-exit reachability; `npm run audit:overworld` checks the March roster, graph, current greybox version, wild discovery hooks, installed maps, and mandatory Convening descent. Phase 4 population is now the next implementation target.

---

## PHASE 0 — ART BIBLE & TILE STANDARD

**Deliverable:** a single art-standard the whole project obeys, so every later sprite is consistent.

**Rules:**
- **Grid contract:** one tile still equals one grid cell and one walk step. Oblique art is a render skin; it does not change `x/z` simulation, collision, LOS, fog, or pathing.
- **Active terrain skin:** generated oblique bitmap terrain with top/front faces visible, no labels, transparent background after gutter cleanup, loop-conditioned edges, and slight southward overdraw so repeated floor tiles hide interior front lips.
- **Active structure skin:** walls and closed doors are full square tile textures with only top/front rectangular faces. They must remain seamless on the square grid and must not use isometric/perspective taper.
- **Active barrier/aperture skin:** fences, gates, windows, hedges, screens, grates, barricades, and Glass barriers are full square tile textures with transparent gaps where appropriate. They are not floors, roofs, or map symbols.
- **Active prop skin:** crates, chests, terminals, beacons, signs, shrines, stalls, carts, rope gear, stump/dead-tree pieces, Glass/Grid emitters, furniture, lamps, wells, rubble, ladders, counters, workbenches, cupboards, stoves, broken statues, hatches, exterior nature blockers, and building clutter are transparent cutout object sprites in the same sketchy painted style and square-grid front/top perspective.
- **Settlements/fractures:** towns, cities, estates, spires, and fractures are hand-built places using terrain and structure tiles; do not represent them as single-tile object icons.
- **Fallback/source library:** the 16x16 limited-palette sprite library remains the manifest for existing objects, entities, overlays, and audit coverage.
- **Black background = void.** Pure `#000000` remains reserved for void/fog/out-of-sight in pixel-library surfaces and contact sheets. Oblique terrain PNGs use transparency for removed atlas background.
- **Silhouette-first:** every entity and object must remain identifiable in one color at 16×16 until matching oblique object/entity art exists.
- **Facing:** entities that need facing (player, NPCs, enemies) get 4 directional frames (N/S/E/W) minimum; 2-frame idle/step animation where affordable.
- **Dark-light convention:** Grid/Glass/fracture visuals are the *only* things that "glow" — bright saturated palette colors emerging from black. This visual is reserved for the Grid's presence, so the player learns to read glow-against-void as "the Grid is here."

**Exit criteria:** fallback palette/style reference exists; oblique terrain, square-faced structure, barrier/aperture, and prop atlases have been extracted; generated contact sheets exist; every active generated PNG has atlas gutters removed, cropped away, or chroma-keyed to alpha and loop-edge deltas recorded where applicable.

---

## PHASE 1 — ASSET MANIFEST (BUILD TO COMPLETION)

**Deliverable:** every sprite the overworld needs, authored to the Phase 0 standard, before any area is built. Areas are assembled *from* this library; do not author areas with missing assets.

Build in this order — tiles, then objects, then entities, then the player — because each layer composes the next.

### 1A — TILES (terrain the grid is painted from)
Ground and terrain types, each with walkability and (where relevant) chemistry seeds and `fellable/flammable` flags:
- **Base ground:** grass, dirt path, packed road, mud, sand, bare stone, moss.
- **Grave-country (Watchfold):** grave-road (flagged), cairn-stone, turned earth, threshold-line, fen-reed (flammable), standing water (saturation), fen-mud (slows).
- **Parish/settled (Combe):** tilled field, cobbles, churchyard grass, hollow-floor.
- **House lands (Marrowhouse):** flagstone, dark garden, gravel, estate-lawn.
- **Wilds:** forest floor, dense brush (flammable), rock, scree, cliff-edge (height), river (saturation, impassable without freeze/bridge), ford (passable water), bog (hazard).
- **Glass/fracture terrain:** Glass-growth floor, Glass-vein, fractured ground, dark-light pool (glow), cavern-rock, cramped-tunnel floor.
- **Void:** the reserved pure-black (perception/fog).
- **Autotiling note:** the current engine has **no tileset autotiling** — author edge/transition tiles by hand where terrain meets (grass↔water, road↔grass) or accept hard edges. Budget transition tiles for the ~6 most common adjacencies only.

### 1B — OBJECTS (placed on tiles; interactive)
Each with flags: `pushable, flammable, conductive, fragile, fellable, container, blocks_los, blocks_move`, and `chem_seed` where relevant:
- **Systemic props:** barrel (pushable, may hold oil/water/fuel), crate (breakable, container), torch/sconce (fire source), brazier, oil pool (chem), water trough (chem), lantern (throwable light), rope/rope-bridge (flammable, structural), lever/mechanism.
- **Nature:** tree (fellable/flammable), stump, bush (flammable), boulder (pushable/blocks), fallen log (cover), tall grass (blocks_los).
- **Built:** door (open/close state — exists), gate, fence, wall segment, window (breakable), signpost, well, market-stall, shrine.
- **Containers & loot:** chest, sack, urn, reliquary (Marrowhouse), grave-goods cairn (Watchfold).
- **Story-critical:** **the Stone** (the Convening's center — unique sprite, dark-light glow), **the Glass key mass** (fracture-bottom, unique), covenant-marker, comfort-shard (Glass).
- **Fracture objects:** Glass stalactite (ceiling, glow), Glass column (mid-morphism frozen), glass-growth cluster, dark-light emitter.

### 1C — ENTITIES (actors with schedules and emotional baselines)
Each with 4-facing sprites, an `archetype`, an `emotional_baseline`, and a `schedule` (§Phase 5 day/night):
- **Named story NPCs** (unique sprites): Brother Aldric, Esk, Reni, Mother Hollin (companions); Wenna, Ode, Maren (Watchfold); Prioress Cael, Sister Linnet, Doran (Combe); Ister, Orla (Marrowhouse); **the girl at the Stone** (unique, Glass-marked, the lens).
- **Generic townsfolk** (palette-swappable): watcher, parishioner, house-vessel, villager, child, elder, merchant, guard — a few base bodies, recolored.
- **Overworld wildlife/threats:** carrion-bird, fen-thing, wolf/hound, boar — mundane fauna (some nocturnal, some diurnal; §Phase 5).
- **Grid-amplified threats (Watchfold night roads etc.):** grief-wraith, hollowed-echo (a person reduced to one looping gesture), amplified-beast.
- **The old Alderamontican horrors (fracture threats — the main fracture danger):** the **screaming-faced** things — demonic bodies with human faces where faces should not be. Design 3–5 distinct silhouettes (a crawling one, a tall one, a swarm-thing, a false-person). These are *native* to Alderamontico, sheltering in fractures — not Glass-made. Reserve their reveal for fractures.
- **Fracture-faction inhabitants:** Lanternless, Uncounted, Ghost-Shelter keeper, cyber-ghost — the people who live in the crawls.

### 1D — THE PLAYER
The Intercessor: 4-facing, idle/step frames, plus any state overlays the sim needs to show *on the body* (on-fire, wet, frozen — small overlays reusing chemistry labels). The player sprite is authored **last**, so it's calibrated to read correctly amid the finished world.

**Exit criteria:** every tile/object/entity/player sprite in 1A–1D exists to the Phase 0 standard, tagged with its flags and (where relevant) chemistry seeds and emotional baselines. A generated **contact sheet** shows the full library on black; any sprite that fails silhouette-legibility is rejected. No area-building begins until this passes.

---

## PHASE 2 — NAMED GEOGRAPHY OF THE MARCH (DESIGN, NOT YET BUILT)

**Deliverable:** the defined map of the March — every named area, its terrain character, mood, role, connections, and what it holds. This is the authored skeleton Phase 3 greyboxes and Phase 4 populates. **The geography is invented and fixed here.**

The Threefold March is a valley cupped by high country, three faction-seats at its three points, wild land between them, and the Convening at its heart — with the deepest fracture beneath the center. ~9 named areas.

**Zone sizes** scale by role: **seats/towns ~48×48**, **wilds ~96×96 to 120×120** (the "genuinely large traversable" spaces), **crossings ~48×64**, **the basin ~64×64**, **fracture-mouths ~32×48** (the crawl interiors are the fracture template's business).

| # | Named area | role | size | terrain & mood | holds |
|---|---|---|---|---|---|
| 1 | **The Watchfold** | seat_approach + town | ~48×48 | grave-roads, cairns, fen-reed, standing water; still, held-breath quiet, dusk-lit | Watchfold hamlet (town); Wenna at the Stone-edge, Ode, Maren; night grief-wraith spawns; a fracture-mouth in the fen |
| 2 | **The Reedmire** | wild | ~96×96 | flooded fen, reed-islands, fog, hidden fords; the March's water-country | flood soft-gates (freeze/ford); a systemic set-piece (reeds+fire+water); a fracture-mouth; sidequest hook |
| 3 | **The Combe** | seat_approach + town | ~48×48 | tilled fields in a green hollow, cobbles, churchyard; soft, sorrowful, over-tended | Combe parish (town); Cael, Linnet, Doran; a grief-heavy `emotional_profile`; a fracture-mouth beyond the churchyard |
| 4 | **Hallowdown** | wild | ~120×120 | open downs, forest stands, cliffs, old field-walls; the biggest, most exploratory space | forest-fire set-piece (fell/burn); a height/climb soft-gate opening a shortcut; ≥1 fracture-mouth; wandering fauna (day) |
| 5 | **The Marrowhouse** | seat_approach + town | ~48×48 | dark gardens, flagstone, estate under old trees; cold, courteous, watchful | Marrowhouse estate (town); Ister, Orla, Reni; attachment-heavy `emotional_profile`; a ravener set-piece; witness-Glass |
| 6 | **The Thornmarch** | crossing | ~48×64 | a chokepoint of thornwall, ruin, and old road between the seats and the center | thornwall soft-gate (burn); a combat set-piece using cover/height; connects wilds→basin |
| 7 | **Gallowsreach** | wild | ~96×96 | high scree, wind, exposed rock, few trees; harsh transit country to the north | a gap/climb soft-gate; a shortcut discovery; nocturnal predators; a fracture-mouth |
| 8 | **The Convening** (basin) | basin | ~64×64 | a low bowl of ground, the Stone at center, dark-light bleeding faintly from below; charged, sacred, wrong | **the Stone; the girl (lens); the mandatory fracture-mouth descent beneath it**; visitable from the start; all three processions converge here at the climax |
| 9 | **The Under-Convening** | fracture_mouth (mandatory) | interior = fracture template | the descent beneath the basin — deepest overgrowth, brightest dark-light, thickest screaming-faced horrors | the Glass key at its bottom; the game's revelation; gates the true ending |

**Connectivity (stitched, single-scale):** the three seats sit at the valley's points; the wilds (Reedmire, Hallowdown, Gallowsreach) fill between them; the Thornmarch crossing gates the approach to the Convening basin at the center; the Under-Convening opens beneath the basin. A rough traversal graph:

```
        Gallowsreach(7)
             |
 Watchfold(1)—Reedmire(2)—Hallowdown(4)—Marrowhouse(5)
             \        |        /
              \   Thornmarch(6)/
                   |
            The Convening(8) —(down)→ Under-Convening(9)
                   |
                Combe(3)
```

Every seat is reachable from a wild; the basin is reachable early but its descent gates the ending; nothing is hard-locked (Phase 4 soft-gates only).

**Exit criteria:** all 9 areas named and specified with terrain, mood, role, size, connections, and contents; the traversal graph is connected and every edge accounted for; each wild has ≥1 fracture-mouth or sidequest; the mandatory descent is placed in the basin.

---

## PHASE 3 — GREYBOX & TRAVERSAL (BUILD THE GRIDS)

**Deliverable:** every named area exists as an actual traversable `x/z` grid, painted with Phase 1 tiles, stitched at edges, walkable end-to-end — but not yet populated with encounters or story.

**Rules:**
- **Paint terrain to the area's Phase 2 character** using only Phase 1 tiles; hand-place transition tiles at major terrain seams (no autotiler).
- **Lay the traversal skeleton:** main routes, chokepoints, the edge `entryCells` that stitch to neighbors (per the graph). Walk the whole area start-to-every-edge; it must be traversable.
- **Block out landmarks** (the Stone, town footprints, fracture-mouths) as placeholders so population has anchors.
- **Respect scale:** wilds must *feel* large — long sightlines broken by terrain, real distance between landmarks, room to move. A 120×120 down should take real time to cross.
- **Void discipline:** unreachable/off-map is pure-black void; the playable area is a legible island of light-able ground within it.

**Exit criteria:** `audit-maps` passes on every area (reachability, edge stitching, no stranded regions); a player can walk the entire March seat-to-seat-to-basin through stitched edges; landmarks are placed as anchors.

---

## PHASE 4 — POPULATION (the v1 schema, applied)

**Deliverable:** each greyboxed area filled with systemic set-pieces, ambient life, soft-gates, and discoveries. *(This is 07 v1 in full; summarized here, applied per Phase-2 area.)*

- **Systemic set-pieces** (hand-placed; 2–4 per large zone): each combines ≥2 shipped systems and has ≥2 emergent solutions expressible in the ship verb set (`push, pull, throw, burn, douse, freeze, wet, electrify, foam, break, climb`). Seed only with existing chem axes. Combat set-pieces add cover/height/hazards (Stage 6).
- **Ambient fill** (rule-based; sparse, interactive-but-untuned): flora that can be felled/burned everywhere (rides chemistry — free), sparse spawns, sparse loot. Ambient is consistent, not arranged for emergence.
- **Soft-gates** (never hard locks): each has ≥1 systemic solution *or* a bypass route. Place so passing early opens a shortcut.
- **Discoveries:** each large zone surfaces ≥1 fracture-mouth or sidequest hook; the reward is inside them. Shortcut discoveries connect distant zones once opened.

**Exit criteria:** every area meets density rules (2–4 set-pieces, sparse ambient); every set-piece has ≥2 systems/solutions; every soft-gate is passable or bypassable; every large zone has a discovery; `audit-combat` passes.

---

## PHASE 5 — WIRING (day/night, emotional profiles, story hooks)

**Deliverable:** the systemic and narrative layers switched on per area.

- **Day/night scheduling:** assign per-archetype schedules; overworld enemies sleep at night (low-alertness scheduling via Stage 4). Nocturnal archetypes invert. No emotional/Grid effect from time.
- **Emotional profiles (zone-designated):** apply `emotional_profile` to the **seat-approach zones and the basin only** (Watchfold reverence↑, Combe grief↑, Marrowhouse attachment↑, basin lens-driven), each `grid_active` with `M_base` and (basin) a `lens_ref` to the girl. **Wilds carry no profile and run no Grid tick.** (Spec 06 §4, §7.)
- **The lens:** place the girl in the basin as the lens actor; set `lensFactor` so amplification concentrates around the Stone.
- **Story hooks:** wire each seat-town's mini-trial entry, the companion recruit points, the processions-converge trigger at the basin, the mandatory descent trigger, and the attend-nodes (spec 06 §6) on the girl, the key, and the named victims (Doran, Reni). Connect the Third Voice beats to their areas.

**Exit criteria:** time-of-day changes spawns; the three seats and the basin carry live emotional profiles and the wilds do not; the lens amplifies around the Stone; every story beat fires from its area; attend-nodes open on their targets.

---

## PHASE 6 — AUDIT & INTEGRATION PASS

**Deliverable:** the whole March verified as a shippable, traversable, systemic overworld.

- **`audit-maps`** — full reachability across all stitched areas; the mandatory descent reachable.
- **`audit-combat`** — all combat set-pieces valid; no unwinnable/instant-death arrangements.
- **New `audit-overworld`** (build this early — it gates all AI output): enforces the authoring rules as automated checks — set-pieces have ≥2 systems and ≥2 solutions; soft-gates passable-or-bypassable; each large zone has a discovery; wilds carry no `emotional_profile`; all solution strings expressible in the ship verb set; the basin holds the lens and the mandatory descent. **Any area failing is rejected and regenerated.**
- **First-ten-minutes check:** verify the player can, early and visibly, (a) see the two-layer sim work — burn something, watch it panic and flee — and (b) encounter the surface-vs-attended read-out gap once. If the distinctive layer isn't visible early, re-order content until it is.

**Exit criteria:** all three audits pass on all nine areas; the March is traversable end-to-end; the distinctive two-layer sim is visible in the opening.

---

## GUARDRAILS (all phases)

- Art: Ultima IV/V, 16×16 on pure-black void, limited palette, silhouette-legible, glow reserved for the Grid. No smoothing, no gradients.
- Build order is strict: sprites complete (Ph1) before geography build (Ph3); greybox traversable (Ph3) before population (Ph4).
- No seamless open world (zones stitched); one scale (no travel map); no new materials/verbs in solutions; no hard locks/key-hunts; no ambient emergence tuning; no global emotional field; no time-driven Grid effects.
- Density caps: 2–4 set-pieces per large zone; sparse ambient — a world, not a puzzle-park.
- The `audit-overworld` script is load-bearing for AI-generated content — build it before mass generation, not after.
