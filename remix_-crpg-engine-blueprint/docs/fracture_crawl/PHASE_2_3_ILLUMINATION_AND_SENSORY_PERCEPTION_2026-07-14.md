# Fracture Crawl — Batch 2 Authoritative Illumination and Sensory Perception

- **Batch:** 2
- **Build-plan phases:** Phase 2 — Authoritative Light, Darkness, Fog, and Detection; Phase 3 — Sound, Sensory Profiles, and Search Behavior
- **Date:** 2026-07-14
- **Acceptance map:** `qa_perception_lab`
- **Authority:** `08_ALDERAMONTICO_FRACTURE_CRAWL_CODEX_ENGINE_BUILD_PLAN_V1.md`, the canonical Fracture Crawl GDD, and current executable source
- **Acceptance boundary:** Automated checks establish the deterministic contract; the browser walkthrough below is the user-facing exit gate

This document records what the engine is expected to do after Batch 2 and how
to test it. Source code, schemas, and tests are authoritative if they disagree
with this report.

## 1. Capability after this batch

Batch 2 makes light and perception mechanical engine state rather than a purely
decorative rendering effect:

- Every active map has an authoritative illumination snapshot. A caller can
  query a cell's ambient value, total light, contributing source IDs, strongest
  source, distance, and transmission.
- Authored objects, moved or carried objects, authored items, inventory items,
  dropped items, runtime light fields, and fire fields can resolve to the same
  light-source contract.
- Carried lights follow their carrier; placed or thrown lights illuminate from
  their saved world position. Persistent dropped lights survive the existing
  JSON save round-trip. Configured sources can be toggled off or expire.
- Walls and closed/LOS-blocking geometry stop light and sight. Smoke, steam,
  poison gas, acid fumes, and authored smoke cells attenuate visual
  transmission.
- Ordinary sight requires range, line of sight, the configured view cone, and
  sufficient illumination. Mere proximity in darkness no longer authorizes
  visual acquisition or alert-gated combat.
- A carried light that exposes its carrier produces the explicit acquisition
  cause `carried_light_exposure`. A remote placed light can reveal another
  space without making the player its origin.
- Viewer visibility separates `discovered`, `terrain_visible`,
  `currently_visible`, `illuminated`, and `sensed` cells. Static world art uses
  physical LOS, range, smoke, and minimum light; actors and items still require
  the stricter acquisition result. Previously mapped geography can remain
  discovered while live occupants outside current mechanical sight stay hidden.
- The 3D scene consumes that same snapshot: resolved active sources create the
  point lights, darkness/fog overlays distinguish unseen from discovered and
  currently visible space, and unseen actors, items, badges, and perception
  tethers are withheld. There is no unconditional player-following light.
- Hostile perception is assembled from data-authored sensory channels rather
  than one universal sight rule. The current stimulus vocabulary is `light`,
  `sound`, `fire`, `smoke`, `danger_gas`, and `visible_player`.
- Sound fields carry an origin, intensity, radius, actor/source, action,
  timestamp, material/frequency information, and tags. Propagation loses
  strength with distance and LOS-blocking geometry.
- Movement, opening and closing doors, impacts and world verbs, thrown or
  dropped objects, melee, skills, configured processes, and Yell create sound
  evidence through the shared runtime path.
- Perception records the responsible profile, sense, cause, evidence cell and
  time, alert score, and whether a channel still has valid live tracking.
  Losing evidence clears live tracking and leaves the actor investigating the
  last-known position. New evidence can supersede that search; configured
  search and memory timers eventually de-escalate it.
- Play exposes a **Senses** diagnostic. It reports player illumination, source
  count, visible/discovered/sensed counts, strongest light source, and each
  observer's profile, channel, detection cause, alert level, score, evidence
  cell, and evidence tick. The Simulation inspector exposes the same alert
  explanation for authored/runtime inspection.

These rules live under `src/engine-core/` and are not specific to the Fracture
Crawl plot or to the QA map.

## 2. Authoritative engine APIs

`src/engine-core/visibility.ts`, re-exported from
`src/engine-core/index.ts`, is the public light/visibility boundary:

| API | Result |
| --- | --- |
| `resolveImmersiveLightSources(gamePackage, save, mapId?)` | Resolves the active authored, carried, moved, dropped, environmental, and fire sources for the map. |
| `createImmersiveIlluminationSnapshotFromV1(gamePackage, save, mapId?)` | Produces ambient light, resolved sources, per-cell contributions, and summary totals. |
| `queryImmersiveIlluminationAtCell(snapshot, cell)` | Returns the mechanical light value and contributing sources at one cell. |
| `queryImmersiveVisualAcquisition(gamePackage, save, query)` | Returns acquisition, score, cause, distance/range, illumination threshold, LOS, smoke transmission, and exposing source IDs. |
| `createImmersiveViewerVisibilityFromV1(gamePackage, save, mapId?, options?)` | Produces the five distinct viewer layers: discovered, terrain-visible, actor-visible/currently visible, illuminated, and sensed. |

The perception boundary remains
`createImmersivePerceptionSnapshotFromV1` and
`advanceImmersivePerceptionForSave` in `src/engine-core/immersiveSim.ts`. It
consumes the illumination query and typed sound/environment stimuli, evaluates
each entity's sensory channels, persists last-known evidence, and maintains
investigation tasks.

Fresh evidence writes `sensory_profile_id`, `last_sense_id`,
`last_detection_cause`, `last_evidence_tick`, `last_known_position`,
`perception_tracks_live_target`, and configured search/memory expiry ticks into
the actor's runtime state. When contact is lost, live tracking is cleared and
the search target remains the saved evidence cell. Matching evidence refreshes
the existing perception task; evidence at a different location supersedes it;
expiry fails the search task and eventually clears the remembered position.

Light on/off overrides use `save.flags.immersive_light_states`. Item definition
keys use `item:<item-id>`; resolved source IDs remain available for more precise
diagnostics. Sound and other temporary environmental evidence continues to use
the existing per-map `environment_fields` save contract.

## 3. Authoring contract

### 3.1 Maps and light sources

`MapData.ambient_light` is an optional normalized value from `0` to `1`. The QA
room authors `0`, so darkness there is complete unless a source contributes
light.

`light_source` is accepted on item and object definitions. Its fields are:

| Field | Meaning |
| --- | --- |
| `intensity` | Normalized source strength, `0` to `1`. |
| `radius` | Non-negative, literal mechanical illumination radius in authored macro tiles. |
| `duration_ticks` | Optional positive lifetime; omitted means no configured expiry. |
| `color` | Presentation color for the corresponding visual light. |
| `active_by_default` | Whether the source resolves as active without a save override. |
| `extinguishable` | Whether Play may switch the source off. |
| `mobility` | `fixed`, `portable`, or `throwable`. |
| `persistent` | Whether the source is intended to survive save persistence. |
| `stimulus_tags` | Tags used by sensory channels, such as `light`, `lamp`, or `glass`. |
| `exposes_carrier` | Whether a carried source can identify its carrier as the exposed target. |

The Item editor exposes all of those fields, including enable/disable,
duration, mobility, color, tags, start state, extinguishability, persistence,
and carrier exposure. In Play, a light item has a Use control for toggling it;
a `throwable` light also has a Throw control and uses ranged drop targeting.

Radius has one spatial meaning across simulation and presentation: the authored
number is the mechanical radius, with only the standard macro-to-fine world
conversion applied at runtime. There is no hidden visual radius multiplier.
New authored light profiles default to radius `10`; inferred legacy lamps and
runtime-generated lights fall back to radius `6`. The deliberately broad Glass
QA Lamp authors radius `14`, which resolves to `42` cells in the three-fine-cells
per macro runtime. Its point-light cutoff and ground pool use that same resolved
radius so the visible glow communicates the mechanically illuminated area.

Object `light_source` and map `ambient_light` are part of the package schema and
can be authored in project data. Dedicated object-light and ambient-light
forms are not claimed by this batch.

### 3.2 3D fog presentation contract

The 3D renderer consumes authoritative visibility as a three-state mask:

- **Visible** cells render normally.
- **Explored** cells retain readable geography beneath a dim memory haze, but
  do not reveal live actors or items.
- **Unseen** cells omit terrain and static-object geometry beneath an opaque
  ground shroud with tall, feathered boundary curtains, so walls and props
  cannot protrude through what was previously only a flat fog plane.

Visual light emitters are filtered against the authoritative visible
contributions. A lamp hidden behind an occluder therefore cannot brighten the
rendered scene through the wall, while a source that legitimately contributes
light to a visible cell can still be shown. Disabling Fog reveals static world
geometry; current-visibility rules for live actors and items remain part of
darkness and stealth rather than map-memory presentation.

Mechanically visible actor billboards are composited as a single unit after
fog, memory haze, and transparent wall-fade overlays. Their full sprite is
shaded from the authoritative illumination at the actor's foot cell, preventing
screen-space fog above that cell from blacking out only the upper body. Actor
sprites still depth-test against solid foreground geometry, so a real wall can
occlude an actor standing behind it. The player's ground ring is an unlit
tactical overlay above all fog states and therefore remains legible even at
zero illumination.

Each macro terrain or wall mesh aggregates fog state across its exact covered
fine-cell block: one visible edge retains the whole mesh, one discovered edge
retains it as explored memory, and visibility from a neighboring macro tile
cannot leak across the boundary. Walls intentionally faded between the camera
and player retain a readable silhouette above the fog overlay but below actors,
so camera clearance never turns a known wall into an apparent opening.

Static-world visibility deliberately does not reuse the actor-acquisition score
floor. A lit wall in the viewer's physical LOS remains `terrain_visible` even
when an actor at the same distance would not yet be acquired; a wall behind a
real occluder remains hidden. Live actors and items continue to use exact-fine
`currently_visible` gating.

Fog planes and curtains aggregate to the same macro footprint as static art.
Only currently terrain-visible structures enter a protected post-fog render
pass (below tactical rings and sprites); explored structures stay beneath the
memory mask and unseen structures are culled. This prevents neighboring or
unseen fine subcells from painting black over a visible wall.

Wall lighting samples the maximum authoritative illumination across the exact
fine-cell footprint rather than the usually blocked center cell. A restrained,
albedo-colored emissive fill makes illuminated caps and faces readable even
when their normals cannot receive a low point light. Zero illumination adds no
fill, and the physical point lights and gold floor pools remain cosmetic.

### 3.3 Entity sensory profiles

An entity's optional `sensory_profile` contains:

| Field | Meaning |
| --- | --- |
| `id` | Stable profile identifier used in diagnostics. |
| `channels` | Independent detection channels evaluated for the actor. |
| `memory_ticks` | How long last-known evidence remains available. |
| `search_ticks` | How long the resulting investigation may remain active. |

Each channel defines `id`, `stimulus_kinds`, optional `stimulus_tags`, `range`,
`threshold`, `sensitivity`, `requires_los`, `requires_view_cone`,
`requires_illumination`, and `tracks_live_target`.

The Entity editor provides four presets and editable memory/search durations:

| Preset | Authored channels | Intended behavior |
| --- | --- | --- |
| Standard sight + hearing | illuminated/coned sight plus ordinary hearing | General-purpose compatibility profile. |
| Sight-dominant | longer, more sensitive illuminated sight only | Bypass through darkness, smoke, or occlusion. |
| Hearing-dominant | longer, more sensitive hearing only | Distract with sound; it searches the evidence position rather than a hidden target's future position. |
| Light / Glass-sensitive | LOS-sensitive light channel filtered to `light`/`glass` tags | Provoke with a qualifying lamp or Glass-tagged emission. |

The presets write explicit package data. Fine-grained channel edits beyond the
preset and timing controls can be made in package data; a full per-channel form
is later authoring polish, not part of this batch's claim.

## 4. Acceptance map: `qa_perception_lab`

The QA suite includes a plot-neutral, 21 by 21 perception chamber with
`ambient_light: 0`. It contains:

- walls, a center shutter lane, an L-shaped sound baffle, and an east divider;
- an authored smoke patch using terrain, hazard, and semantic smoke tags;
- a fixed environmental oil lamp;
- a **Glass QA Lamp** that is portable, placeable, throwable, persistent,
  extinguishable, carrier-exposing, and tagged `light`, `lamp`, `glass`, and
  `portable_light`, with a literal radius of `14` authored macro tiles;
- a deliberately non-emissive **Dark Artifact** control item;
- a crate used to produce impact evidence behind the sound baffle;
- a sight-dominant watcher, hearing-dominant hunter, and
  Light/Glass-sensitive watcher;
- an instruction terminal and a return exit.

The three creatures are deliberately separate proofs. Success is not “all
three become hostile”: each must react only to the evidence its authored
profile permits.

## 5. Automated acceptance

Run from the project root:

```bash
npm run typecheck
npm run test:perception
npm run test:suite
npm run test:engine
npm run test:package-roundtrip
npm run build
```

`npm run test:perception` is the focused 27-check Batch 2 contract. It checks
the dark acceptance room and its three profiles, unlit visual failure,
the lamp's authored/resolved macro and fine radii, carried-source movement,
persistent dropped-source save round-trip,
carried-light exposure, extinguishing, wall and smoke obstruction, distinct
visibility layers, terrain-versus-actor visibility, edge-lit macro-wall
sampling, emissive-fill bounds, last-known evidence, loss of live tracking,
finite search, and alert-gated combat. The broader commands guard the existing
engine, QA suite, fog render-state contract, save/package behavior, and
production build against regressions.

`npm run test:all` includes the focused perception contract and may be used for
the complete repository regression pass.

## 6. Browser/user test checklist

Use the explicit QA-suite replace/merge workflow if `qa_perception_lab` is not
already present, then open that map in Play.

- [ ] With no lamp carried, wait near the sight watcher in the zero-ambient
  lane. It must not visually acquire or start combat from proximity alone.
- [ ] Turn on **Senses**. Confirm the player light value and the observer's
  profile/channel/cause/evidence readout are understandable.
- [ ] Pick up the Glass QA Lamp. Its light must move with the player, reveal
  the full mechanically illuminated radius, and allow the sight watcher to
  report carried-light exposure. The point light and ground pool should reach
  the same boundary without a tiny inner-glow mismatch.
- [ ] Use the lamp to extinguish it. Visual contact should break when no other
  light reaches the player; relighting should restore the same rules.
- [ ] Stand where a fog or faded-wall boundary crosses the player's billboard.
  The complete sprite should use the light value at the player's feet rather
  than becoming partly black, solid foreground walls should still occlude it,
  and the cyan player ring must remain visible in complete darkness.
- [ ] Approach the shutter and divider while their near faces are inside the
  lamp footprint. With **Fog** on, rotate through all four camera quarters in
  both High and Performance: visible wall caps/faces must retain their material
  color, no macro wall may disappear because one of its fine subcells is
  unseen, and truly occluded wall blocks must remain masked.
- [ ] Throw/place the lamp into a remote bay. The remote area should illuminate
  from the dropped source, while the player is no longer the lamp origin; the
  Light/Glass watcher should react to the qualifying emission.
- [ ] Push, throw at, or strike the west crate, or use Yell. The hearing hunter
  should investigate the sound evidence around the baffle without learning the
  player's later hidden position.
- [ ] Break sight behind a wall or through the smoke patch. The watcher should
  search the last-known cell, accept newer evidence if produced, and eventually
  de-escalate instead of tracking the live player through concealment.
- [ ] Revisit a discovered but currently unseen bay. Geography may remain
  mapped, but unseen actors/items must not leak through fog. Save/reload once
  with the lamp dropped and confirm the persistent source remains in place.
- [ ] Compare a visible bay, an explored bay, and an unseen bay in 3D. Visible
  geometry should be normal, explored geography should sit beneath memory
  haze, and unseen terrain, walls, props, and hidden light emitters must not
  protrude through or illuminate the volumetric shroud.

The batch passes user acceptance when darkness and light feel reciprocal and
the three sensory profiles require meaningfully different play.

## 7. Implemented now versus deferred

| Implemented in Batch 2 | Deferred to later build-plan phases |
| --- | --- |
| Queryable illumination; source resolution; carried/placed/thrown/runtime light; configured toggle/expiry; wall/smoke attenuation; visibility/acquisition queries. | Phase 4's explicit campaign-versus-expedition state layers and reset policy. Batch 2 uses the existing save/delta contract. |
| Data-driven sight, hearing, and Light/Glass channels; typed evidence; last-known-position search; de-escalation; alert-gated combat. | More elaborate coordinated search tactics, advanced sense types, and presentation polish beyond the current general channel contract. |
| Light and sensory schema fields, Item-editor light controls, Entity-editor presets/timers, diagnostics, and a reusable QA chamber. | Phase 12's broader authoring completion, including richer per-channel, object-light, and map-ambient forms. |
| Glass-tagged light can be detected as Glass/light evidence. | Phase 8's Glass harvesting, recoverable value, emergency fuel consumption, duration/value tradeoff, and conservation rules. The QA lamp does not claim that economy. |
| Existing dropped-source save persistence and temporary search/evidence lifecycle. | Intercessor succession, ghosts, artifact/death-bundle lifecycle, expedition resets, and dungeon integration in Phases 4–11. |

Batch 2 does not introduce campaign-specific creature code, artifact recovery,
death succession, Glass fuel economics, or a new persistence architecture.
