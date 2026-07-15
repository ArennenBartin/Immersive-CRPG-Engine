# Alderamontico Fracture Crawl
## Codex Engine Architecture Build Plan v1.0

**Target repository:** `ArennenBartin/Immersive-CRPG-Engine`  
**Target branch:** `main`, unless Codex creates a dedicated implementation branch  
**Deadline:** **August 1, 2026**  
**Runtime acceptance environment:** Browser  
**Product form:** One browser application with distinct Studio and Play modes  
**Authority:** Fracture Crawl GDD v0.3 and subsequent locked decisions  
**Purpose of this document:** Convert the GDD into a phased, testable engine implementation program for Codex.

---

# 1. Mission

Build the complete reusable engine architecture required by *Fracture Crawl* by August 1, 2026. This is not a campaign-content plan. It is an engine delivery plan.

The finished architecture must allow a designer to:

1. Author and edit maps in Studio.
2. Generate one usable fracture map through an editor-facing dungeon-generation workflow.
3. Validate, inspect, bake, and manually edit generated output.
4. Play the same project immediately in browser Play mode.
5. Use authoritative light, darkness, fog, sound, perception, and environmental simulation.
6. Run a persistent expedition across deaths and map revisits.
7. Create successive procedurally named Intercessors.
8. Leave persistent cyber ghosts and death bundles.
9. Recover deterministic signature skills from ghosts.
10. Track expedition artifacts through origin, inventory, death bundle, return-to-origin, and hub recovery states.
11. Save and reload all relevant generated, authored, and runtime state safely.

The architecture is complete only when these systems are integrated and demonstrated through browser-playable acceptance maps. A collection of isolated APIs does not count as completion.

---

# 2. Operating Rules for Codex

## 2.1 Inspect before directing implementation

Codex must inspect the current repository before changing architecture. It must identify the existing implementation, tests, editor surfaces, runtime systems, save contracts, dungeon work, and known failures.

When the correct location or implementation method is not known, Codex must not invent one in advance. It should choose the implementation after inspection and report the choice.

## 2.2 Work from observable results

Each phase is defined by testable behavior. Internal structure may change as needed, provided that:

- existing working systems are preserved;
- data contracts remain explicit;
- browser behavior passes acceptance;
- save compatibility is considered;
- Studio and Play mode agree on project data;
- automated tests cover deterministic rules.

## 2.3 One application, two modes

Studio and Play mode must remain in one browser application with clearly separated modes.

Required result:

- a project can be edited in Studio;
- the designer can enter Play mode without exporting to another application;
- returning to Studio does not silently destroy authored data;
- runtime state and authored project data remain distinguishable.

## 2.4 Editor UX exists from day one

No major authoring feature may exist only as an inaccessible internal function until the end. Each phase must expose the minimum usable Studio control needed to test it.

“Minimum usable” may be plain and developer-facing. It must still allow the user to perform the operation, see the result, read failures, and undo or discard destructive operations.

## 2.5 Generated maps become ordinary editable maps

The August generator is an editor-time tool.

The required workflow is:

> Configure → Preview/Draft → Validate → Commit/Bake → Edit normally

After commit:

- generated maps use the ordinary project map format;
- all ordinary map-editing tools work on them;
- generation provenance is retained;
- manual edits are never silently overwritten;
- regeneration is explicit and scoped;
- the user is warned about replacement before destructive action.

Runtime per-save dungeon generation is not required by August 1.

## 2.6 No phase passes on a developer claim alone

A phase passes only when:

1. automated checks pass;
2. Codex documents the browser test route;
3. the user performs the browser acceptance pass;
4. discovered failures are either fixed or explicitly recorded as non-blocking.

## 2.7 Do not widen scope while a gate is failing

Codex must not begin the next major phase while a blocking acceptance test in the current phase fails. It may prepare notes or inspect dependencies, but it must not create parallel unfinished architecture.

## 2.8 Preserve universal logic

The new systems should be reusable for future Alderamontico maps and games. They must not be hard-coded to one campaign room, one artifact, one ghost, or one fracture layout.

Universality does not mean speculative abstraction. Generalize from a working vertical use case.

---

# 3. Definition of Complete Architecture

By August 1, the repository must provide all of the following.

## 3.1 Studio foundation

- One-browser Studio and Play modes.
- Project creation/import/export or the existing equivalent remains functional.
- Clear authored-data versus runtime-state boundaries.
- Browser-visible diagnostics for validation failures.
- Safe map editing after dungeon generation.
- Immediate Studio-to-Play testing.

## 3.2 Authoritative light and darkness

- Mechanical illumination is not merely visual decoration.
- Tiles or world positions can be queried for illumination.
- Light sources have data-driven properties.
- Carried, placed, thrown, and environmental lights work.
- Occlusion is respected.
- Smoke or equivalent obscurance can weaken or block sight.
- Darkness affects both player sight and sighted enemy acquisition.
- Fog of war agrees with mechanical visibility.
- Detection feedback identifies the relevant cause.

## 3.3 Sound and perception

- Actions can emit sound stimuli.
- Creatures can have distinct sensory profiles.
- Sighted enemies cannot acquire an unlit, visually concealed target without another valid sense.
- Sound-aware enemies can investigate noises.
- Enemies can search a last-known position instead of tracking hidden targets omnisciently.
- Glass-sensitive or light-sensitive perception can be represented through data rather than campaign-specific code.

## 3.4 Persistent expedition state

- A fracture layout remains fixed after being committed into the campaign project.
- Persistent discovery, shortcuts, major switches, rescued or changed entities, artifacts, ghosts, and relevant faction state survive revisits and saves.
- Temporary tactical state can reset or repopulate independently.
- The engine can distinguish authored baseline, persistent world delta, and current-session tactical state.

## 3.5 Intercessor succession

- The active Intercessor has a stable record and procedurally assembled name.
- Death closes the current life without ending the save.
- A successor can be created.
- Prior Intercessor history remains accessible.
- Death location and relevant character state are sufficient to create a ghost and bundle.

## 3.6 Persistent ghosts and skill inheritance

- Each dead Intercessor creates a persistent ghost at a valid location.
- Multiple ghosts may exist simultaneously.
- Ghosts survive save/load and map revisits.
- A ghost exposes a deterministic signature skill.
- Reaching and interacting with the ghost grants that skill according to configured inheritance rules.
- Ghost information may be degraded or incomplete, but the signature progression reward is not randomly false or silently lost.
- The engine supports a hub/archive representation of recovered ghost knowledge.

## 3.7 Artifact lifecycle and death bundles

Each expedition artifact has a stable identity and origin.

Required artifact states:

- `AtOrigin`
- `Carried`
- `InDeathBundle`
- `RecoveredToHub`

Required behavior:

1. An artifact can be picked up from its origin.
2. A carried artifact can be recovered to the hub.
3. On death, a carried artifact enters the new death bundle.
4. The next Intercessor may recover it from that bundle.
5. If the next Intercessor dies before recovering the previous bundle, unresolved expedition artifacts in that previous bundle return to their authored origins.
6. The older ghost remains.
7. The newer death creates another ghost.
8. An artifact is never duplicated across origin, inventory, bundle, or hub.
9. Save/load at every transition preserves a legal state.

Unless later changed by design authority, retrieving the artifact from the old bundle counts as successful reclamation. A later death places the now-carried artifact into the newer death bundle.

## 3.8 Glass expedition use

- Glass can be harvested as a world resource.
- Harvested Glass can carry value or burden.
- Glass can be sacrificed as emergency light fuel.
- Using Glass for light reduces or consumes its recoverable value.
- Glass light can expose the player and can emit stimuli usable by creature senses.
- The system is data-driven enough to support multiple Glass or light-source types later.

## 3.9 Editor-time dungeon generation

The generator must produce one usable fracture map or linked fracture map set with:

- an entrance;
- a reachable culmination or exit;
- a critical route;
- branches;
- at least one loop;
- rooms or regions;
- legal connecting geometry;
- landmark sockets;
- artifact-origin sockets;
- extraction sockets;
- creature/encounter placement sockets or equivalent authored placement points;
- deterministic seed reproduction;
- validation diagnostics;
- editable committed output.

The generator does not need to produce final story prose, final art, or perfectly balanced encounters.

## 3.10 Validation and save safety

- Invalid generated layouts are rejected before commit.
- Unreachable critical targets are reported.
- Duplicate stable IDs are reported.
- Broken map exits and references are reported.
- Artifact-state contradictions are detected.
- Ghosts and death bundles are placed only on valid reachable positions.
- Save data carries a schema/version identifier.
- Project normalization/import cannot silently replace authored maps with QA fixtures.
- A package/project round-trip preserves authored and generated content.

---

# 4. Delivery Strategy

This plan uses vertical implementation phases. Each phase produces a browser-visible slice and leaves automated tests behind.

The order is intentional:

1. Establish truth and prevent destructive data behavior.
2. Establish Studio/Play integration and diagnostics.
3. Establish authoritative perception.
4. Establish persistent campaign state.
5. Establish death, ghosts, skills, artifacts, and Glass.
6. Establish editor-time generation.
7. Integrate the complete architecture.
8. Harden for August 1.

---

# 5. Phase 0 — Repository Truth and Safety Baseline

**Target window:** July 14  
**Purpose:** Determine the real starting point and prevent existing destructive or misleading behavior from contaminating later work.

## Required investigation

Codex must identify and report:

- current application entry points;
- current Studio and Play mode boundaries;
- project/package schemas;
- map schemas and stable-ID rules;
- save schemas;
- existing dungeon generator implementation;
- existing light, fog, line-of-sight, sound, perception, chemistry, combat, entity, quest, and state systems;
- existing automated tests and audits;
- current build, typecheck, lint, test, and audit status;
- any import/normalization behavior that can replace authored content;
- current browser deployment route;
- obsolete region/continent systems that conflict with fracture work.

## Required result

Produce a machine-readable or Markdown baseline report in the repository containing:

- implemented capabilities;
- adaptations required;
- new features required;
- current failures;
- known destructive risks;
- current performance baselines where tests already exist.

## Blocking repairs

Before Phase 0 passes:

- project import/normalization must not silently replace non-QA authored maps;
- the repository must build or failures must be precisely isolated and scheduled before dependent phases;
- the complete existing automated suite must have one documented command or command sequence;
- a known-good browser launch path must exist.

## Automated acceptance

- Typecheck result is recorded.
- Build result is recorded.
- Existing test and audit results are recorded.
- Package/project round-trip test proves that an authored sentinel map remains present and unchanged.
- Importing a project twice does not accumulate duplicate stable IDs.

## Browser acceptance

The user can:

1. launch the application;
2. open Studio;
3. open a known map;
4. enter Play mode;
5. return to Studio;
6. save/export and reload/import;
7. confirm the authored map still exists.

## Exit gate

Do not proceed if authored map data can still be erased by normal import, normalization, or test-fixture injection.

---

# 6. Phase 1 — Studio/Play Contract and Editor Diagnostics

**Target window:** July 14–15  
**Purpose:** Make one browser application a reliable authoring and testing environment from the beginning.

## Required capabilities

- Clear Studio mode and Play mode navigation.
- A single loaded project is shared intentionally between modes.
- Entering Play mode creates or loads runtime state without mutating authored baseline data.
- Returning to Studio offers a clear rule for discarding or preserving runtime changes.
- Validation failures are visible in Studio.
- Destructive operations request confirmation.
- Long-running generation or validation operations report status rather than appearing frozen.

## Editor UX minimum

Studio must provide visible controls for:

- validate current project/map;
- enter Play mode on the selected map or project entry;
- return to Studio;
- inspect errors and warnings;
- save/export the current project;
- load/import a project;
- create or duplicate a test map;
- open the dungeon-generation workspace, even if generation is not implemented yet.

The generator workspace may initially display “not implemented” diagnostics. It must exist as an integrated Studio surface, not a future separate tool.

## Automated acceptance

- Authored map state is unchanged after a Play mode session unless an explicit authoring action occurs.
- Runtime save state can be created and loaded independently of project source data.
- Validation results use stable identifiers and severity levels.
- Invalid references are presented without crashing Studio.

## Browser acceptance

The user can edit a visible property, enter Play mode, observe it, return, and continue editing without reload or data loss.

## Exit gate

Do not proceed until Studio-to-Play iteration is reliable enough to use for every later phase.

---

# 7. Phase 2 — Authoritative Light, Darkness, Fog, and Detection

**Target window:** July 15–17  
**Purpose:** Establish the central Dark & Light simulation as universal engine logic.

## Required test chamber

Create one reusable acceptance map containing:

- fully dark space;
- walls and occlusion;
- a player;
- a sighted enemy;
- a carried lamp;
- a placeable or droppable lamp;
- a throwable light;
- an environmental light;
- smoke or equivalent obscurance;
- an artifact or interactable object in darkness;
- debug overlays or readouts for illumination and detection.

## Required behavior

### Illumination

- World positions or tiles have queryable light values.
- The visual scene is driven by or clearly agrees with mechanical light.
- Light sources define radius/range, intensity, duration, ownership, mobility, and stimulus behavior through data.
- Carried light moves with the carrier.
- Placed light remains in the world.
- Thrown light travels or relocates through an existing item/interaction mechanism and then illuminates.
- Light can be extinguished or expire where configured.

### Darkness reciprocity

- The player cannot ordinarily see a completely unlit sight-dependent target.
- An ordinary sighted enemy cannot visually acquire the player in complete darkness merely because the player is nearby.
- Carrying light can expose the player.
- Placing light elsewhere can reveal a space without making the player the light origin.

### Fog agreement

- Fog or exploration visibility does not reveal more tactical information than mechanical sight permits.
- Previously discovered geography may remain mapped while currently unseen actors remain hidden.
- Debug display can distinguish discovered, currently visible, illuminated, and sensed states.

### Occlusion and smoke

- Solid geometry blocks line of sight as intended.
- Smoke or configured obscurance reduces or blocks visual acquisition.
- Removing or leaving smoke restores normal acquisition.

### Detection explanation

When detected, the debug/test interface can report a cause such as:

- seen directly;
- exposed by carried light;
- heard;
- sensed through Glass/light sensitivity;
- alerted by another actor.

## Automated acceptance

At minimum, deterministic tests prove:

- a sighted observer cannot visually acquire an unlit occluded target;
- illumination can change visual acquisition;
- extinguishing illumination can break visual contact;
- smoke changes visual acquisition;
- fog/current visibility agrees with the perception query;
- moving a carried source changes illumination consistently;
- saving and loading preserves persistent light entities where configured.

## Browser acceptance

The user can complete the chamber by:

1. waiting unseen in darkness;
2. throwing or placing light to inspect a remote space;
3. being detected while carrying light;
4. breaking sight through darkness or smoke;
5. observing the enemy search rather than track omnisciently.

## Exit gate

No later stealth or creature-sense work proceeds until sight and darkness behave reciprocally and the user considers the interaction readable.

---

# 8. Phase 3 — Sound, Sensory Profiles, and Search Behavior

**Target window:** July 17–18  
**Purpose:** Make perception extensible beyond vision.

## Required sensory architecture

Actors can be configured with sensory capabilities rather than relying on one universal detection rule.

The August architecture must support at least:

- ordinary sight;
- hearing;
- light or Glass sensitivity;
- future extension to other senses without rewriting all detection logic.

## Required sound behavior

- Movement, doors, impacts, thrown objects, combat actions, Yell, and configured interactions can emit sound stimuli.
- Sound has location, intensity, source, timestamp/turn, and relevant tags.
- Hearing actors can react according to range and occlusion/attenuation rules already supported or minimally required.
- A sound does not reveal the target’s future position.

## Last-known-position behavior

- Seeing or hearing a target records a last-known or last-suspected position.
- Losing valid detection stops perfect tracking.
- The actor investigates or searches the recorded area.
- New evidence may update the search.
- Search eventually de-escalates according to configured behavior.

## Required acceptance creatures

The test chamber must demonstrate:

1. a sight-dominant creature;
2. a sound-hunting creature;
3. a Glass- or light-sensitive creature.

These may use placeholder art and simple combat.

## Automated acceptance

- A sound stimulus causes a hearing actor to investigate the stimulus location.
- The actor does not know a hidden target’s new location without new evidence.
- A sight-only actor ignores an unlit target when no other valid sense applies.
- A configured light-sensitive actor reacts to qualifying light or Glass emission.
- Perception state survives a save/load only where intended; ephemeral search state may reset according to explicit policy.

## Browser acceptance

The user can distract one creature with a thrown object or Yell, bypass one creature through darkness, and provoke one creature through light or Glass use.

## Exit gate

The three sense profiles must produce meaningfully different player behavior.

---

# 9. Phase 4 — Persistent World Layers and Save Contract

**Target window:** July 18–19  
**Purpose:** Establish the persistent-fracture architecture before adding succession and collectibles.

## Required state layers

The engine must distinguish:

### Authored baseline

The project’s committed map, entity, quest, dialogue, item, and generation data.

### Persistent campaign state

State that remains across expeditions and deaths, including:

- discovered geography;
- permanent shortcuts;
- major switches;
- recovered artifacts;
- rescued or permanently changed NPCs;
- persistent ghosts;
- relevant faction and quest state;
- permanent lighting infrastructure where configured;
- campaign archive/history.

### Current expedition/tactical state

State that may reset, repopulate, or be discarded, including:

- temporary enemy positions;
- temporary hazards;
- loose ordinary loot;
- short-lived lights;
- current alert/search state;
- current chemistry simulation, according to explicit reset policy.

## Required behavior

- Starting a new expedition resets only configured tactical state.
- Death does not regenerate or erase the map.
- Permanent changes remain visible.
- Authored project data remains recoverable and is not overwritten by runtime saves.
- The state system supports versioning and migration hooks.

## Automated acceptance

A round-trip scenario must prove:

1. discover a region;
2. unlock a shortcut;
3. change a major switch;
4. create a temporary hazard;
5. save;
6. reload;
7. end/reset the expedition;
8. verify discovery, shortcut, and switch persist;
9. verify temporary state follows its configured reset policy;
10. verify authored baseline has not changed.

## Browser acceptance

The user revisits the test map after an expedition reset and sees the same geography, retained discovery, and retained shortcut while temporary encounter state has reset.

## Exit gate

Do not implement death bundles or ghosts until the engine can prove the difference between authored, persistent, and temporary state.

---

# 10. Phase 5 — Intercessor Records, Death, and Succession

**Target window:** July 19–20  
**Purpose:** Make death produce a new playable person rather than a conventional reload.

## Required Intercessor record

Each Intercessor requires a stable record sufficient to support:

- unique stable ID;
- procedurally assembled display name;
- creation order/generation;
- relevant skills and learned signature skill;
- inventory references;
- death state;
- death map and position;
- death time/turn or expedition index;
- ghost reference;
- bundle reference;
- archive/history display.

The precise internal schema is Codex’s decision after repository inspection.

## Name generation

- Names are built from configurable syllable pools or equivalent data.
- Identical names are permitted only under an explicit policy; accidental collision must not merge records.
- The generated name remains stable after save/load.
- The system is reusable for other generated Alderamontican actors.

## Death transition

On valid player death:

1. freeze or conclude the current expedition safely;
2. record the death;
3. create the ghost request/state;
4. create the death-bundle request/state;
5. preserve campaign state;
6. create or select the successor;
7. resume from the configured hub/start flow.

## Automated acceptance

- A generated name remains stable across save/load.
- Two Intercessors never share a stable ID.
- Death produces exactly one closed record, one ghost, and one bundle event.
- Re-triggering load or transition does not duplicate the ghost or bundle.
- A successor can enter the same persistent map.

## Browser acceptance

The user dies, receives a newly named successor, re-enters the same map, and can inspect the previous Intercessor in campaign history.

## Exit gate

Repeated death/load cycles must not duplicate or erase Intercessor records.

---

# 11. Phase 6 — Persistent Ghosts and Deterministic Skill Inheritance

**Target window:** July 20–21  
**Purpose:** Turn player history into persistent geography and progression.

## Ghost creation

A dead Intercessor produces a ghost at a valid reachable location derived from the death event.

Required ghost properties include enough information to support:

- stable identity;
- source Intercessor;
- map and position;
- visual/presentation state;
- signature skill;
- interaction state;
- degraded memory/testimony fields or references;
- archive recovery state;
- persistent existence after interaction.

## Placement safety

If the exact death position is invalid for persistent placement, the engine must choose and report a valid nearby fallback. It must never place a required ghost outside navigable space or in an unreachable sealed cell.

## Skill inheritance

- Every eligible ghost exposes one deterministic signature skill.
- The skill is derived from recorded Intercessor state or configured rules.
- Reaching and communing with the ghost grants the skill according to campaign limits.
- Random false reads cannot replace the signature reward.
- Attend or related mechanics may expose more context, improve stabilization, or affect presentation without arbitrarily deleting progression.
- Repeated interaction does not duplicate the skill.

## Multiple ghosts

- Several ghosts may coexist on one map.
- Their IDs, visuals, and interactions remain distinct.
- Performance remains acceptable at a practical jam-scale accumulation target.

## Automated acceptance

- Ghost creation is idempotent.
- Ghost placement is valid and reachable under the validator’s rules.
- Skill inheritance is deterministic.
- A learned skill is not duplicated on repeat interaction.
- Multiple ghosts survive save/load.
- Ghost interaction does not remove the ghost unless explicitly configured.

## Browser acceptance

The user creates at least two dead Intercessors, reaches both ghosts, inherits their distinct signature skills, reloads, and still sees both ghosts and both learned skills.

## Exit gate

The entire ghost cycle must work without campaign-specific scripting.

---

# 12. Phase 7 — Artifact Registry, Death Bundles, and Recovery Rules

**Target window:** July 21–22  
**Purpose:** Implement the collectathon’s failure and recovery state machine without duplication or unwinnable loss.

## Artifact identity and origin

Every expedition artifact requires:

- stable artifact ID;
- authored origin map and stable origin reference or position;
- current lifecycle state;
- current holder/container/bundle where applicable;
- hub recovery state;
- optional narrative and display metadata.

## Legal state transitions

- `AtOrigin → Carried`
- `Carried → RecoveredToHub`
- `Carried → InDeathBundle` on death
- `InDeathBundle → Carried` on successful recovery
- `InDeathBundle → AtOrigin` when the immediate recovery opportunity fails because the successor dies before reclaiming it

No transition may produce two copies.

## Death-bundle behavior

- A death bundle has a stable identity, owner Intercessor, map, position, and contents.
- Ordinary gear may follow separately configured rules.
- Expedition artifacts follow the protected one-recovery rule.
- The bundle remains independently identifiable from the ghost.
- Ghost persistence is not conditional on bundle recovery.

## One-recovery rule

When Intercessor B begins after Intercessor A’s death:

- A’s unresolved artifact bundle is recoverable by B.
- If B dies before retrieving an artifact from A’s bundle, that unresolved artifact returns to its origin.
- A’s ghost remains.
- B creates a new ghost and bundle.
- The unresolved artifact does not silently transfer into B’s new bundle.

When B retrieves the artifact and later dies:

- the artifact is now carried by B;
- it enters B’s new death bundle;
- the previous recovery attempt is considered successful.

## Recovery to hub

- Extracting or otherwise completing recovery moves the artifact to `RecoveredToHub`.
- The hub/archive can query recovered artifacts.
- Recovered artifacts are not lost by later ordinary death unless explicitly designed otherwise.

## Automated acceptance matrix

Tests must cover:

1. origin → carry → hub;
2. origin → carry → death bundle → recovery → hub;
3. origin → carry → death bundle → successor death before recovery → origin;
4. origin → carry → death bundle → successor recovery → successor death → new bundle;
5. save/load at every state;
6. repeated load does not duplicate;
7. invalid bundle placement falls back safely;
8. artifact origin remains valid after map editing or reports a broken reference;
9. multiple artifacts in one bundle behave independently and legally.

## Browser acceptance

The user performs the complete recovery matrix with at least one artifact and can visually confirm its origin, bundle, inventory, and hub states.

## Exit gate

No artifact duplication, disappearance, or illegal state is acceptable.

---

# 13. Phase 8 — Glass Harvesting and Emergency Light Fuel

**Target window:** July 22  
**Purpose:** Give Glass a meaningful in-expedition decision while keeping the system reusable.

## Required behavior

- A configured Glass deposit or object can be harvested.
- Harvesting produces a Glass resource or item with value/burden metadata.
- A compatible light source can consume Glass as emergency fuel.
- Consumption produces configured illumination and duration.
- Consumed Glass no longer retains full hub/extraction value.
- Glass-powered light can emit normal light exposure and configured Glass/light-sensitive stimuli.
- The choice is visible in UI: preserve the payload or burn it for sight/survival.

## Integration

Glass use must interact with:

- inventory/resource state;
- light simulation;
- perception stimuli;
- save/load;
- extraction/hub value query;
- editor configuration.

## Automated acceptance

- Harvest quantity/value is stable across save/load.
- Fuel consumption cannot create value from nothing.
- Glass light affects illumination and perception.
- Repeated activation cannot consume the same unit twice.

## Browser acceptance

The user harvests Glass, verifies its recoverable value, burns part of it to light a dark area, and sees the reduced remaining value.

## Exit gate

The system must create a real mechanical tradeoff, not only a cosmetic effect.

---

# 14. Phase 9 — Editor-Time Dungeon Generation: Graph and Draft

**Target window:** July 22–24  
**Purpose:** Create a deterministic, inspectable fracture topology before geometry is committed.

## Studio workflow

The integrated dungeon workspace must allow the user to:

- choose or enter a seed;
- configure a minimal fracture profile;
- generate a draft;
- inspect the resulting topology;
- rerun with the same seed;
- see validation warnings and failures;
- discard the draft without touching project maps.

## Required topology

A generated draft must represent:

- entrance;
- culmination/exit;
- critical path;
- branches;
- at least one loop;
- landmark opportunities;
- artifact-origin opportunities;
- extraction opportunities;
- region or room identities;
- gates/dependencies only where validation can prove solvability.

## Determinism

- The same generator version, profile, and seed produce the same draft.
- Named or staged randomness prevents unrelated changes from unnecessarily reshuffling every result when possible.
- Generator version and seed are stored as provenance.

## Validation

Before geometry commit, detect at minimum:

- missing entrance or culmination;
- disconnected critical route;
- unreachable branch nodes;
- impossible gate dependency;
- missing required socket categories;
- duplicate stable draft IDs.

## Automated acceptance

- Same seed/profile/version yields the same topology hash.
- A corpus of test seeds produces valid drafts within a bounded time.
- Intentionally invalid fixtures produce clear diagnostics.
- Draft generation does not mutate authored maps.

## Browser acceptance

The user generates several drafts, reproduces one seed, inspects its critical route and branches, and discards drafts without changing the campaign project.

## Exit gate

Do not begin committed geometry until topology generation is deterministic and non-destructive.

---

# 15. Phase 10 — Dungeon Geometry, Validation, and Bake

**Target window:** July 24–26  
**Purpose:** Turn a valid draft into one usable, editable fracture map or linked map set.

## Required generated result

The generator must produce one fracture containing:

- traversable rooms or regions;
- legal corridors/connections;
- entrance;
- reachable culmination;
- branches and at least one loop;
- at least three recognizable landmark sockets or placements;
- artifact-origin sockets;
- extraction sockets;
- encounter/creature placement opportunities;
- sufficient dark and light-controllable spaces for the core mechanics;
- ordinary map entities and references compatible with Play mode.

## Geometry rules

The exact algorithm is Codex’s decision after inspection. The output must satisfy:

- no overlapping illegal blocking geometry;
- no inaccessible required room;
- valid map boundaries;
- valid movement/navigation under the engine’s grid contract;
- legal exits and linked-map transitions where used;
- no required socket inside invalid geometry;
- no corridor that visually exists but cannot be traversed.

## Draft versus commit

### Draft

- previewable;
- disposable;
- separate from authored project maps;
- reports validation results.

### Commit/Bake

- explicit user action;
- produces ordinary editable maps;
- records generator seed, version, profile, and topology/output hashes;
- does not overwrite an existing edited result without explicit confirmation;
- creates a restorable or reviewable change boundary where current architecture permits.

## Manual edit safety

After bake, the user must be able to:

- move or delete ordinary generated entities;
- edit tiles/geometry through normal tools;
- add story content;
- add or alter lights;
- change encounters;
- save/export/reload;
- play the edited version.

A later regeneration action must clearly state its scope. It must never silently replace manual edits.

Selective regeneration is desirable but not required for August 1. Generate-once → bake → edit is sufficient, provided future regeneration remains explicit and non-destructive.

## Automated acceptance

- Generated geometry passes map contract and reference validation.
- Entrance can reach culmination.
- Required sockets are reachable.
- Critical routes are traversable under runtime movement rules.
- Commit produces stable map IDs and entity IDs.
- Package/project round-trip preserves generated provenance and manual edits.
- A generated map can be loaded in Play mode without special runtime generator code.

## Browser acceptance

The user:

1. generates a draft;
2. validates it;
3. commits it;
4. opens the resulting map in Studio;
5. manually changes a room and moves an artifact socket;
6. saves and reloads;
7. enters Play mode;
8. traverses entrance to culmination;
9. returns to Studio and confirms edits remain.

## Exit gate

The generated fracture must be usable enough to serve as the campaign’s foundation, not merely a graph screenshot or disconnected room demo.

---

# 16. Phase 11 — Integrated Architecture Scenario

**Target window:** July 26–28  
**Purpose:** Prove all required systems operate together on the generated fracture.

## Required integrated scenario

Using the committed generated fracture, create a system demonstration—not the final campaign—with:

- one hub/start map;
- one generated fracture;
- one culmination point;
- one sighted creature;
- one sound-hunting creature;
- one Glass/light-sensitive creature;
- one carried light;
- one placeable light;
- one throwable light;
- one smoke or obscurance encounter;
- one harvestable Glass source;
- one expedition artifact;
- one shortcut;
- one extraction point;
- one death event;
- one ghost;
- one signature skill;
- one death bundle;
- one hub recovery display or query.

## Required end-to-end route

The user can:

1. open the project in Studio;
2. inspect and edit the generated map;
3. enter Play mode;
4. receive a generated Intercessor name;
5. enter the fracture;
6. use darkness and temporary light;
7. distract or evade a creature through sound;
8. harvest Glass;
9. choose whether to burn Glass as light;
10. collect an artifact;
11. unlock a shortcut;
12. die;
13. become a new Intercessor;
14. return to the persistent map;
15. see the prior ghost;
16. inherit the signature skill;
17. recover the bundle;
18. extract;
19. see the artifact recovered to the hub;
20. save, reload, and retain all intended persistent state.

## Automated acceptance

Create one integration test or deterministic scenario harness covering the complete state transitions. Unit tests remain necessary, but this phase requires proof that subsystem contracts agree.

## Browser acceptance

The user completes the route above without console repair, save editing, or Studio intervention during play.

## Exit gate

The architecture is not complete if each subsystem works separately but the full route fails.

---

# 17. Phase 12 — Editor Completion and Authoring Readiness

**Target window:** July 28–29  
**Purpose:** Make the architecture usable for campaign production immediately after delivery.

## Required Studio support

The user must be able to author or configure, through existing or newly adapted editor UX:

- map lights and relevant properties;
- light-carrying/placeable/throwable items;
- perception/sensory profiles;
- sound-emitting actions or relevant tags;
- persistent versus temporary entity/reset policy;
- Intercessor name data;
- ghost signature skill data/rules;
- artifact identity and origin;
- extraction and hub recovery behavior;
- Glass harvest and fuel behavior;
- dungeon profile, seed, draft, validation, and bake;
- generated socket conversion or authored placement;
- shortcut persistence;
- test-map entry point.

The interface may remain compact and technical. It must not require source-code edits for normal campaign authoring.

## Validation UX

Studio must clearly report:

- severity;
- affected map/entity/artifact;
- stable ID where applicable;
- human-readable problem;
- enough context to locate the problem;
- whether the problem blocks Play or generation commit.

## Documentation

Codex must add concise repository documentation describing:

- how to launch browser development mode;
- how to run all verification;
- how to open the integrated architecture demo;
- how to generate and bake a fracture;
- how persistent state differs from authored data;
- how to configure artifacts, ghosts, lights, and Glass;
- known limitations deferred beyond August 1.

## Browser acceptance

The user creates or duplicates a small test project and configures one new artifact, one new light, and one new sensory profile without changing code.

## Exit gate

The architecture must be usable by the user for campaign work, not only understandable by Codex.

---

# 18. Phase 13 — Hardening, Performance, and August 1 Release

**Target window:** July 29–August 1  
**Purpose:** Stabilize the complete architecture rather than adding more systems.

## Required verification

- Typecheck passes.
- Production browser build passes.
- Full automated test suite passes.
- Full audit suite passes or every remaining non-blocking failure is documented and accepted.
- Package/project round-trip passes.
- Save round-trip passes.
- Generated fracture seed audit passes.
- Map/reference validation passes.
- Integrated scenario passes.

## Browser reliability passes

Test at minimum:

1. fresh browser session;
2. project load;
3. Studio edit;
4. draft generation;
5. validation;
6. bake;
7. manual edit;
8. Play mode;
9. death and succession;
10. ghost interaction;
11. artifact recovery;
12. save/load;
13. return to Studio;
14. export/reimport or equivalent project round-trip.

## Performance targets

Codex must measure and report rather than guess:

- generated fracture draft time;
- generation/bake time;
- Play mode frame behavior on the integrated fracture;
- fog/visibility update cost;
- save size and save/load time;
- behavior with multiple persistent ghosts;
- browser memory behavior over repeated Studio/Play transitions.

No universal numeric target is imposed without baseline evidence. Regressions that make normal browser testing impractical are blocking.

## Feature freeze

From July 29 onward:

- no unrelated architecture;
- no broad refactor without a demonstrated blocking need;
- no new generator ambition beyond one usable fracture;
- no runtime per-save generation;
- no campaign-content expansion;
- no polishing that risks save or data contracts.

## August 1 completion gate

The engine architecture is complete when:

- all Definition of Complete Architecture sections are demonstrated;
- the integrated scenario works in browser;
- Studio supports authoring the systems;
- one usable fracture can be generated, validated, baked, edited, saved, reloaded, and played;
- the user completes the final acceptance route;
- known limitations are documented rather than hidden.

---

# 19. Calendar and Hard Gates

| Date | Required gate |
|---|---|
| July 14 | Repository truth report; destructive normalization/import risk neutralized or isolated as immediate blocker |
| July 15 | Reliable one-app Studio/Play loop with browser-visible diagnostics |
| July 17 | Authoritative light, darkness, fog, occlusion, smoke, and detection-cause chamber passes |
| July 18 | Sound, sensory profiles, and last-known-position search pass |
| July 19 | Authored/persistent/temporary state layers and save round-trip pass |
| July 20 | Intercessor succession passes |
| July 21 | Persistent ghosts and deterministic skill inheritance pass |
| July 22 | Artifact bundle lifecycle and Glass emergency-light loop pass |
| July 24 | Deterministic dungeon topology draft and validation pass |
| July 26 | One usable fracture generates, validates, bakes, edits, saves, and plays |
| July 28 | Full integrated architecture scenario passes |
| July 29 | Editor authoring coverage and documentation complete; feature freeze begins |
| July 30–31 | Hardening and complete browser acceptance |
| August 1 | Complete architecture accepted |

A missed gate must trigger triage immediately. Triage may simplify presentation or algorithmic sophistication, but it must preserve the required observable architecture.

---

# 20. Triage Rules

## Preserve first

Never cut these merely to save time:

- authored/persistent/runtime state separation;
- authoritative light and darkness;
- reciprocal sight rules;
- sound and last-known-position logic;
- Intercessor succession;
- persistent ghosts;
- deterministic signature skill inheritance;
- artifact lifecycle and one-recovery rule;
- Glass emergency-light use;
- editor-time draft/validate/bake flow;
- editable generated output;
- save safety;
- browser Studio UX.

## Simplify before cutting

These may be simplified while retaining their contract:

- generator visual preview;
- generator room variety;
- corridor aesthetics;
- number of dungeon profiles;
- number of provided sensory presets;
- ghost presentation effects;
- archive presentation;
- Glass effect variety;
- animation and sound polish;
- selective regeneration;
- sophisticated search AI;
- advanced performance visualization.

## Deferred beyond August 1

- runtime per-save generation;
- unlimited seed reliability guarantees;
- multiple complete generator biomes;
- selective room-level regeneration, unless already straightforward;
- procedural story placement;
- procedural ghost personalities;
- large-scale ghost population optimization beyond demonstrated need;
- campaign plot and final content;
- full faction simulation;
- unrelated overworld/continent restoration;
- equipment-system completion unless required by a blocking integration.

---

# 21. Codex Work-Unit Format

For every phase, Codex should report work in this format.

## Before implementation

- What current behavior was found?
- What existing systems will be adapted?
- What new capability is required?
- What data or save contract changes are anticipated?
- Which automated and browser tests will prove completion?

## After implementation

- What observable behavior now works?
- What automated tests were added or changed?
- What commands were run and what passed?
- What browser route should the user test?
- What limitations remain?
- Did any authored or save schema change?
- Is migration required?
- Is the phase gate ready for user acceptance?

Codex must avoid telling the user a phase is complete when it has not run the relevant checks.

---

# 22. Branch and Commit Discipline

Codex may choose the exact branch strategy after inspecting repository norms. The following outcomes are required:

- work is recoverable in small coherent boundaries;
- a failing experiment does not corrupt the last accepted phase;
- each phase has an identifiable completion commit or pull request boundary;
- schema changes and migrations are not hidden inside unrelated work;
- generated binary or disposable output is not committed unless intentionally part of project fixtures;
- the integrated acceptance project/map is committed as a durable regression fixture.

Recommended phase boundaries:

1. baseline and safety;
2. Studio/Play contract;
3. light/perception;
4. persistent state;
5. succession/ghosts;
6. artifacts/Glass;
7. dungeon draft;
8. dungeon bake;
9. integrated scenario;
10. hardening.

---

# 23. Final User Acceptance Checklist

The user should be able to answer **yes** to every item by August 1.

## Studio and project safety

- Can I open the engine entirely in a browser?
- Can I move between Studio and Play mode quickly?
- Can I edit, save, reload, and reimport without losing maps?
- Can I see understandable validation errors?

## Dark and light

- Is complete darkness mechanically real?
- Can a normal sighted enemy fail to see me in darkness?
- Does carrying light expose me?
- Can I place and throw light?
- Can smoke or occlusion break sight?
- Do enemies search where they last knew I was?

## Persistence and succession

- Does the same fracture remain after death?
- Do permanent shortcuts and discoveries remain?
- Does death create a newly named Intercessor?
- Does the dead Intercessor remain in history?

## Ghosts and skills

- Does every death create one persistent ghost?
- Can multiple ghosts coexist?
- Can I reliably inherit each ghost’s signature skill?
- Do save/load and revisits preserve them?

## Artifacts and bundles

- Can an artifact exist at exactly one legal place/state?
- Does death place carried artifacts in the correct bundle?
- Can the successor recover them?
- Does failure return unresolved artifacts to origin?
- Does the old ghost remain?
- Can recovered artifacts be secured at the hub?

## Glass

- Can I harvest Glass?
- Can I burn it for emergency light?
- Does that reduce what I can recover?
- Can creatures react to its light or emission?

## Generator

- Can I generate a fracture draft from Studio?
- Can I reproduce it by seed?
- Can I inspect and understand validation failures?
- Can I commit one valid result?
- Does it become an ordinary editable map?
- Are my manual edits preserved?
- Can I play the edited result immediately?

## Complete architecture

- Can I complete the integrated death–ghost–skill–artifact–recovery loop inside the generated fracture?
- Can I save and reload at every major state?
- Can I begin campaign authoring without requiring source-code edits for normal content setup?

---

# 24. First Codex Instruction

Begin with **Phase 0 only**.

Inspect the current repository and produce the repository truth/safety report. Run the existing verification commands that are practical in the environment. Identify destructive project-normalization or fixture-injection behavior, current build failures, current dungeon implementation, current Studio/Play contract, and the exact existing capabilities relevant to this plan.

Do not begin broad feature implementation until the Phase 0 report and safety gate are complete.

