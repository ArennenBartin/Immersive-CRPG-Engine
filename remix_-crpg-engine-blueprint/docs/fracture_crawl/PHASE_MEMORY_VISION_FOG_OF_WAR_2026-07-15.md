# Fracture Crawl — Memory Vision Fog of War

- **Phase:** Memory Vision Fog of War
- **Status:** implemented and verified
- **Date:** 2026-07-15
- **Primary renderer:** `GameRenderer3D`
- **Persistence boundary:** the current expedition/save only
- **Authority:** the canonical Fracture Crawl GDD, the engine build plan, the user's three-state clarification, and the acceptance contract below
- **Scope:** rendering, render-state classification, live-state presentation filtering, diagnostics, and Studio preview parity
- **Out of scope:** redesigning authoritative light, AI, combat, targeting math, NPC perception, smoke transmission, or sensory acquisition

This document records the implemented presentation and acceptance contract for
Memory Vision fog of war.

## 1. Delivered capability

After this phase, the engine will present static architecture through one
shared three-state renderer policy:

1. **Unknown** architecture remains mounted in the 3D scene and continues to
   participate in depth and occlusion, but it is absolute black and visually
   unreadable.
2. **Remembered** architecture is a dark indigo/violet map-memory silhouette.
   It appears only when the architecture was discovered during the current
   expedition, lies within the viewer's current geometric line of sight, and
   is presently dark rather than mechanically visible.
3. **Visible** architecture uses the current renderer without a replacement
   style: authored materials, authoritative illumination, ordinary emission,
   camera readability fading, and current structural detail remain intact.

Live tactical state does not become map memory. Actors, items, movable props,
temporary fields, chemistry, current condition effects, interaction markers,
and tactical target indicators appear only when their existing visibility
rule authorizes them. Remembered architecture cannot be animated by a current
off-screen lamp or reveal a live hazard, patrol, loot drop, or object movement.

Exploration memory persists through map changes, save, and reload during the
current expedition. A new or discarded expedition begins with its own mapping
state. This phase does not add cross-expedition communal maps, actor-specific
belief models, or last-seen snapshots of every mutable world object.

## 2. Normative three-state contract

### 2.1 Inputs

The presentation resolver consumes existing runtime facts without changing
their mechanical meaning:

- `terrain_visible`: the authoritative set of terrain cells that are presently
  visible after range, structural LOS, smoke/optical transmission, and minimum
  illumination are applied;
- `currently_visible`: the stricter existing set used for live actors and
  items;
- `discovered` / `explored_cells`: cells mapped in the current expedition;
- current per-cell authoritative illumination and the snapshot's minimum-light
  threshold;
- a **presentation-only geometric LOS set**, resolved from the current viewer
  position, the existing range boundary, authored LOS-blocking cells, and the
  current closed-door/structural blocker rules.

Geometric LOS deliberately answers only whether solid current geometry blocks
the ray. It does not replace mechanical visibility, grant target acquisition,
alter stealth, or modify any NPC sensory channel. It is used only to decide
where remembered architecture is allowed to be drawn in darkness.

### 2.2 State precedence

For each rendered static cell or architectural footprint, state is resolved in
this order:

| Priority | Render state | Required facts | Presentation |
| --- | --- | --- | --- |
| 1 | **Visible** | Fog reveal is explicitly disabled, or the cell is in `terrain_visible` | Use the current authored/lit renderer. |
| 2 | **Remembered** | Not Visible; discovered in the current expedition; inside current geometric LOS; authoritative illumination is below the existing visibility threshold | Render dark indigo/violet, unlit architecture. |
| 3 | **Unknown** | Every other case | Keep geometry mounted as an opaque absolute-black silhouette. |

Visible always wins over Remembered. Remembered always requires all three
memory predicates: prior discovery, current geometric LOS, and current
darkness. Prior discovery alone does not make the map globally luminous.

A discovered cell outside current geometric LOS remains recorded in the save,
but its current render state is Unknown/black. When the viewer regains a clear
geometric ray while the cell remains dark, its indigo memory representation
returns. The debug view must distinguish this mapped-but-currently-occluded
case from a never-discovered cell even though both use the same black
production presentation.

If a cell is lit but withheld from `terrain_visible` for a non-darkness reason,
such as strong optical obscurance, it does not qualify for the darkness-only
Remembered style. It remains black unless the existing authoritative
visibility result becomes Visible. This phase does not reinterpret smoke or
other perception results.

### 2.3 Macro and fine-grid agreement

Play continues to simulate on the fine grid and render static terrain once per
macro footprint. The macro presentation state must be built from the exact
fine cells covered by that rendered mesh:

- any mechanically Visible fine cell makes the rendered footprint Visible;
- otherwise, any fine cell satisfying the complete Remembered predicate makes
  the footprint Remembered;
- otherwise the footprint is Unknown/black.

Static geometry, ground haze, boundary curtains, custom architectural
placements, and the debug overlay must consume the same precomputed
presentation plan. No pass may independently guess a different fog state.

## 3. Rendering policy

### 3.1 Visible architecture

Visible uses the renderer that exists at the start of this phase:

- authored albedo, texture, normal, roughness, metalness, transparency, and
  emission remain available;
- authoritative point lights and the existing restrained structure fill may
  affect it;
- visible foreground walls may use the existing camera readability fade;
- current asset detail, decals, door orientation, and structural state may be
  shown;
- normal opaque depth behavior remains authoritative.

This phase must not make the Visible state flatter, darker, or less detailed
in order to implement memory.

### 3.2 Remembered architecture

Remembered architecture is deliberately legible but non-current:

- use a shared dark indigo/violet, unlit material;
- preserve the architecture's footprint, height, and recognizable silhouette;
- suppress authored textures, normal and roughness maps, emission, animated
  glow, live decals, interaction markers, and current light response;
- write and test depth normally so remembered walls still read as architecture;
- do not apply camera fading that would cut a bright hole through the memory
  silhouette;
- use a restrained indigo haze or curtain treatment that supports the memory
  color instead of covering it with the existing heavy black explored veil.

The exact palette may be tuned visually, but it must read as dark indigo/violet
rather than dimmed authored color. It must remain clearly different from both
the full-color Visible state and the absolute-black Unknown state.

### 3.3 Unknown architecture

Unknown architecture is not removed. Its scene geometry, instanced equivalent,
or geometry-preserving occlusion representation remains mounted and must:

- render absolute black, independent of ambient or point lights;
- suppress all authored emission, texture detail, decals, highlights, and
  material identity;
- remain opaque with depth testing and depth writing enabled;
- preserve the structural footprint, height, and occluding silhouette;
- remain ineligible for visible camera-fade treatment;
- avoid interaction icons, selection markers, glints, labels, or readable
  object identity.

Black geometry is allowed to communicate that darkness has volume and can
occlude the scene. It must not communicate what material the structure uses or
what live state exists beyond the shroud.

### 3.4 Low-cost grouping and materials

The three-state policy should reduce render cost rather than multiply it:

- Visible primitive cells may retain the existing material and quantized-light
  grouping.
- Remembered primitive cells should group by geometry kind and height using one
  shared memory material. Their group keys must not include authored material
  or illumination bands that the unlit memory shader ignores.
- Unknown primitive cells should group by geometry kind and height using one
  shared black material. Their group keys must likewise ignore authored
  material and illumination.
- Repeated architectural mesh placements should batch by geometry and render
  state. Remembered and Unknown geometry use shared override materials rather
  than per-instance cloned authored materials.
- Asset-backed geometry may use a cheaper occlusion representation only when it
  preserves the authored footprint, height, and recognizable architectural
  silhouette. It may not disappear.
- Remembered and Unknown materials do not cast expensive dynamic shadows and
  do not require per-frame material traversal.
- Point lights must not modulate Remembered or Unknown architecture.

The target is a small set of instanced draws for memory and black occlusion,
not one React object and one material clone per hidden wall.

## 4. Category-by-category visibility

| Render category | Visible | Remembered | Unknown |
| --- | --- | --- | --- |
| Static terrain, floors, walls, roofs, and immutable architectural cells | Current renderer | Indigo/violet memory architecture | Mounted absolute-black occlusion geometry |
| Immutable custom architectural placements and structural fixtures | Current renderer, including current readable detail | Indigo/violet silhouette with markers and live detail suppressed | Mounted black silhouette |
| Doors and gates | Current orientation, material, and interaction state | State-neutral architectural memory, or an explicitly stored last-observed state; never consume a hidden live change merely to update the memory view | Black structural silhouette without readable state or marker |
| Movable props and pushed/carried objects | Render only under their existing current-visibility rule | Do not show current live position | Do not reveal identity or live position |
| Containers and their contents | Render/interact only when currently authorized | No live content or state memory in this phase | Hidden as live state; an immutable architectural housing may use the static-fixture rule if authored separately |
| Ground items and dropped items | Render only under `currently_visible` | Hidden | Hidden |
| NPCs, hostiles, party followers, actor badges, HP bars, barks, and damage popups | Render only under the existing actor visibility rule | Hidden | Hidden |
| Point lights and light pools | Use the current authoritative visible-source path | No live light response and no hidden-source reveal | No live light response and no hidden-source reveal |
| Runtime surfaces, chemistry, temporary hazards, conditions, fire, smoke visuals, and environment fields | Render only on cells whose current presentation rule authorizes the live effect | Do not show current live values or off-screen changes | Hidden beneath the black presentation |
| Interaction icons, dialogue markers, hover markers, object targeting, and live tactical intent | Render/select only when the corresponding live subject is currently authorized | Hidden unless a separate explicit adjacent-known interaction rule applies | Hidden |
| Click-to-move terrain input | Keep current movement behavior and downstream collision validation | May remain available according to movement rules | May remain available according to movement rules; it does not reveal live content |

### 4.1 Live-state filtering rule

The production renderer must filter live data before building overlay instance
groups. Relying on a translucent memory veil to hide a fire, chemistry layer,
actor target, or interaction highlight is not sufficient: it leaks information
and still spends render work.

In particular:

- non-trace runtime surfaces, simulation conditions, and non-sound environment
  fields are instantiated only where the live-effect rule permits them;
- temporary authored smoke visuals do not reveal an unseen region through the
  memory layer;
- an observable smoke or hazard boundary may render on the currently visible
  side of that boundary, but the effect must not reveal cells or live updates
  beyond it;
- ground items, entity sprites, actor readouts, target cells, overwatch zones,
  intent tethers, denied-cell feedback, and world-object verb targets cannot
  reveal a current hidden subject;
- dialogue or interaction markers are Visible-state UI, not remembered
  architecture;
- a current point light cannot brighten the unlit Remembered material or the
  absolute-black Unknown material.

This is presentation/input filtering only. It does not change the underlying
simulation, chemistry, AI tasks, combat intent, or perception record.

## 5. Current-expedition persistence

The existing per-map explored-cell save data is the authority for prior
discovery in this phase.

Required behavior:

- a cell becoming mechanically Visible adds it to the campaign's communal
  expedition map;
- mapping survives ordinary map transitions, save, load, and returning to a
  previously visited map in the same expedition;
- a discovered cell that is currently outside geometric LOS remains stored but
  renders black until geometric LOS returns;
- starting a successor expedition inherits discovered cells as communal
  campaign geography; only discarding the whole campaign / starting New Game
  clears that mapping;
- current actors, items, temporary hazards, movable-object positions, and
  lighting are not persisted as visual memory by this phase;
- mutable door state is not silently treated as reliable memory. If no
  last-observed presentation record exists, the remembered door representation
  is state-neutral.

This boundary is intentionally narrower than the GDD's eventual communal case
map across Intercessors. Cross-expedition inheritance is a later feature.

## 6. Per-cell debug overlay

The phase adds a browser-visible, debug-only overlay that explains the state
chosen for each cell. It must use instancing and remain disabled during normal
play.

### 6.1 Required debug groups

The production debug overlay distinguishes the three renderer states:

| Debug group | Suggested color | Meaning |
| --- | --- | --- |
| Visible | Cyan/green | Cell is in authoritative `terrain_visible`; current renderer wins. |
| Remembered | Indigo/violet | Discovered, geometrically visible, currently dark, and not mechanically Visible. |
| Unknown / occluded | Red-charcoal | Production presentation is black: either no current-expedition memory or remembered space is outside current geometric LOS. |

An optional smaller inset may identify cells in `currently_visible` so actor
visibility can be compared with static terrain visibility. The debug display
must never alter those sets.

### 6.2 Debug implementation constraints

- Build one instanced plane group per debug category, not one React node per
  cell.
- Default to the actual macro presentation plan consumed by the 3D renderer.
- An optional fine-grid mode may show the authoritative fine cells at the
  runtime cell size for aggregation diagnosis.
- Draw above production fog with depth testing disabled and partial cell
  coverage so geometry remains visible.
- Show a compact legend and counts for Visible, Remembered, and
  Unknown/occluded cells.
- Include the relevant predicates for a hovered or player cell: discovered,
  geometric LOS, illumination versus minimum light, terrain visibility, and
  actor/current visibility.
- The overlay must be available in High and Performance presets only when the
  debug toggle is explicitly enabled.

The existing Senses diagnostic may host this overlay and legend, but the Fog
player toggle remains a production fog on/off control rather than being
silently repurposed as a debug switch.

## 7. Studio and Play parity

Studio and Play use the same geometry loaders, state resolver, state-aware
materials, placement classifier, and grouping policy.

### 7.1 Default Studio authoring view

The default Map Studio remains a fully revealed authoring-truth view:

- authored geometry, placements, doors, entities, markers, and editor handles
  remain visible;
- editing and pointer interaction are not restricted by player fog;
- the default view is equivalent to forcing static architecture into Visible
  presentation, not to simulating an expedition;
- authored macro coordinates remain authoritative.

### 7.2 Optional Studio Vision Preview

Studio may expose a non-persistent Vision Preview for parity testing. It must:

- feed the same renderer policy and presentation-plan interface used by Play;
- use the same macro-to-fine expansion and visual macro aggregation as Play;
- accept a selected spawn/viewer cell and an explicit preview discovery set or
  captured Play snapshot;
- show the same Visible, Remembered, and Unknown materials as Play;
- optionally expose the same per-cell debug overlay;
- never write explored cells into an actual Play save merely because an author
  moved the preview camera or viewer.

Studio must not implement a second LOS, illumination, or perception algorithm.
If a preview requires mechanical visibility, it consumes the existing engine
snapshot; the new geometric LOS term remains a presentation-only helper shared
with Play.

### 7.3 Parity interpretation

Parity does not mean Studio is fogged by default. It means:

- the same authored wall, roof, floor, or structural placement has the same
  footprint, height, rotation, and visible material in Studio and Visible Play;
- switching that geometry to Remembered or Unknown changes only the shared
  presentation policy, not the authored object or map data;
- an optional Studio preview produces the same state and material for the same
  runtime facts;
- Play remains the authority for current expedition state and save persistence.

## 8. Explicit non-goals

This phase does **not**:

- change authoritative illumination values, radii, source resolution, or
  occlusion;
- change smoke transmission, visual acquisition, stealth, detection causes,
  NPC sensory profiles, search behavior, or last-known-position logic;
- change AI navigation, combat targeting, cover, overwatch, initiative, or
  action costs;
- make unseen actors targetable or add x-ray creature silhouettes;
- implement actor-specific beliefs or philosophical knowledge;
- implement a persistent snapshot of every door, prop, patrol, hazard, and
  light as last observed;
- implement cross-expedition communal mapping;
- redesign the legacy 2D renderer unless that surface is explicitly restored
  to product scope.

## 9. Suggested implementation order

1. Add and test a pure presentation resolver for Visible, Remembered, and
   Unknown using the precedence in section 2.
2. Build the presentation-only geometric LOS set from existing structural
   blockers, current doors, viewer origin, and range without changing the
   authoritative visibility snapshot.
3. Extend the shared macro fog presentation plan with the Remembered predicate
   and make static geometry and fog overlays consume that one plan.
4. Add shared unlit memory and black materials; collapse non-visible cell group
   keys and retain mounted occlusion geometry.
5. Classify custom placements into immutable architecture versus live/movable
   state, then apply the three-state architectural policy without exposing
   markers or mutable state.
6. Filter runtime fields, chemistry, tactical overlays, and interaction target
   presentation before instancing.
7. Add the instanced per-cell debug overlay and predicate legend.
8. Wire the same policy into an optional non-persistent Studio Vision Preview.
9. Run automated, browser, persistence, and performance acceptance below.

## 10. Automated acceptance checklist

- [ ] A pure truth-table test proves Visible > Remembered > Unknown precedence.
- [ ] Remembered requires prior discovery, current geometric LOS, current
      darkness, and absence from `terrain_visible`.
- [ ] A discovered cell outside current geometric LOS stays persisted but
      resolves to the black production state.
- [ ] A geometrically visible but never-discovered dark cell remains Unknown
      and black.
- [ ] A mechanically Visible cell always uses the current renderer even if it
      was never previously stored as explored.
- [ ] Macro aggregation uses only the exact covered fine cells and honors
      Visible before Remembered.
- [ ] Unknown static geometry remains mounted/instanced, opaque, depth-writing,
      non-emissive, and absolute black under strong ambient and point light.
- [ ] Remembered architecture uses the shared unlit indigo/violet material and
      is unaffected by current point lights.
- [ ] Remembered and Unknown group keys do not vary by unused illumination band
      or authored material identity.
- [ ] Static architectural placements and structural fixtures obey the same
      three-state resolver as cell architecture.
- [ ] Live actors, items, movable props, containers, temporary surfaces,
      chemistry, fields, conditions, markers, and hidden tactical targets do
      not appear in Remembered or Unknown production rendering.
- [ ] Door memory does not expose an unobserved live open/closed change.
- [ ] Fog boundary curtains and ground haze consume the shared presentation
      plan and do not cover the indigo memory state with an opaque black cap.
- [ ] Mapping round-trips through the current-expedition save and returns on map
      re-entry.
- [ ] A fresh/discarded expedition starts without the prior expedition's
      discovered-cell memory.
- [ ] Debug overlay groups match resolver output and do not mutate saves or
      visibility.
- [ ] Default Studio renders the fully revealed authored scene.
- [ ] Studio Vision Preview, when enabled with the same runtime facts, matches
      Play state selection and materials.
- [ ] Existing light, perception, combat, chemistry, engine-core, and package
      validation tests remain unchanged in meaning and continue to pass.

## 11. Browser acceptance checklist

Use a dark QA room with a portable or toggleable light, at least one interior
wall/corner, a door, a static fixture, a movable prop, an item, an actor, and a
temporary field or chemistry effect.

### 11.1 Three-state walkthrough

- [ ] Start a fresh campaign's first expedition in darkness. Never-observed architecture is
      present as solid black occlusion silhouettes with no readable materials,
      emission, labels, or decals.
- [ ] Illuminate and look at a wall, floor, doorway, and immutable fixture.
      They use the current full renderer and become mapped.
- [ ] Remove or leave the light while retaining a clear geometric ray to those
      mapped cells. Their architecture becomes readable dark indigo/violet.
- [ ] Move behind a corner or wall so current geometric LOS is blocked. The
      mapped architecture becomes black again rather than remaining globally
      visible.
- [ ] Return to a clear geometric ray without restoring light. The indigo
      memory architecture returns.
- [ ] Restore mechanical visibility. The same geometry returns to authored
      materials and current lighting without a duplicate mesh, missing wall,
      or stale black proxy.

### 11.2 Occlusion and material integrity

- [ ] Unknown black walls still occlude geometry behind them and never become
      transparent because of camera wall fading.
- [ ] A strong lamp beside Remembered or Unknown architecture does not tint,
      brighten, texture, or animate it unless the cell becomes mechanically
      Visible.
- [ ] Remembered architecture is visibly indigo/violet and distinguishable from
      black Unknown geometry at the normal Play camera distance.
- [ ] Explored haze and curtains support the memory silhouette and do not read
      as invisible walk-through walls on open floor.
- [ ] Wall, roof, and doorway footprints do not disappear or leave detached fog
      shading when changing state.

### 11.3 Live-state filtering

- [ ] An actor leaving current visibility disappears; no sprite, HP bar, badge,
      bark, damage popup, intent line, or live position remains in memory.
- [ ] A ground item or dropped item outside current visibility is absent even
      when its floor is Remembered.
- [ ] A movable prop changed outside current visibility does not expose its new
      location through indigo memory.
- [ ] Fire, chemistry, smoke visuals, conditions, and temporary environment
      fields do not update through the memory layer.
- [ ] Hidden dialogue markers, object highlights, world-verb targets, combat
      intents, and denied-cell indicators do not leak through the translucent
      fog treatment or accept an unauthorized live-object selection.
- [ ] Ordinary click-to-move still works according to existing movement and
      collision rules without revealing hidden content.

### 11.4 Persistence and diagnostics

- [ ] Save in one map, change maps, return, and reload. Previously discovered
      architecture still qualifies for indigo memory when the darkness and
      geometric-LOS predicates are met.
- [ ] Discard the expedition and begin another. The previous discovered-cell
      set is not inherited.
- [ ] Enable the debug overlay. Visible, Remembered, and Unknown/occluded
      cells use distinct colors and the legend counts agree with the viewed
      area.
- [ ] Inspect a boundary cell. The displayed predicates explain exactly why it
      selected Visible, Remembered, or Unknown.
- [ ] Disable the debug overlay. All debug planes and labels disappear and
      frame behavior returns to the production presentation.

### 11.5 Studio parity and performance

- [ ] Open the same map in Studio. Default authoring view remains fully revealed
      and editable.
- [ ] If Vision Preview is present, use the same viewer/discovery facts as Play
      and confirm matching state colors, footprints, heights, doorways, and
      materials.
- [ ] Leaving preview does not modify the Play save or authored map.
- [ ] High and Performance presets remain responsive while walking through
      repeated state transitions.
- [ ] Render inspection shows batched Remembered and Unknown architecture rather
      than one cloned material/model traversal per hidden cell.

## 12. Phase exit gate

The phase is complete only when all of the following are true:

- static architecture never disappears merely because it is Unknown;
- Unknown architecture is absolute black and unreadable while retaining depth
  and occlusion;
- remembered architecture is dark indigo/violet and appears only in current
  geometric LOS during darkness;
- Visible remains the current authored and mechanically illuminated renderer;
- current-expedition mapping survives save/load without claiming broader
  campaign persistence;
- live actors, items, mutable props, fields, chemistry, lighting, markers, and
  tactical state do not leak through memory;
- the per-cell debug overlay explains every production state;
- Studio and Play share one renderer policy, with Studio fully revealed by
  default; any future Vision Preview must consume that same policy;
- existing light, perception, AI, combat, and simulation semantics have not
  been redesigned to achieve the presentation.
