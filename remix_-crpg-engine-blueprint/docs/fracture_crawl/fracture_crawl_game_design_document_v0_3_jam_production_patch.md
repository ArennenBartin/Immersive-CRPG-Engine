# **Fracture Crawl ��� Game Design Document v0.2**

# **FRACTURE CRAWL**

## **Game Design Document v0.3 — Jam Production Patch**

**Project:** Alderamontico fracture-crawl roguelike / persistent procedural dungeon RPG  
**Jam target:** RPG Mania XV  
**Jam theme:** Dark & Light  
**Engine:** Alderamontico 3D CRPG Engine  
**Document date:** July 2026  
**Document status: Canonical systems and production reference, patched for the August 15, 2026 jam deadline. The missing-expedition narrative spine is active; protagonist-specific plot, named cast, deepest revelation, and final ending structure remain open for the next development phase.**

# ---

**0\. Document Status and Authority**

This is the current single-source gameplay design document for the fracture-crawl game.

It replaces **Fracture Crawl GDD v0.1** wherever the two documents disagree. It also carries forward the systems from **The Third Voice** that remain appropriate to Alderamontico as a broader game language: same-map tactical combat, Attend, emotional state, Yell, Console, persistent consequences, named NPCs, documents, barks, faction reactions, contextual interaction, Glass pressure, and the principle that attention is an authored risk rather than a universal truth button.

This document does **not** supersede the current World Bible on objective cosmology, Glass, the Grid, Corda, magic, or institutions. Where plot has not yet been decided, this document defines implementation slots rather than pretending an answer is locked.

## **0.1 Authority order**

When sources conflict, use this order:

1. Direct current decisions from the project owner.  
2. This GDD’s locked gameplay and run-state rules.  
3. Alderamontico World Bible v2.  
4. Current executable engine behavior and the 3D Engine Systems Reference.  
5. Current faction and philosophy documents where compatible.  
6. The Third Voice GDD and script as a source of reusable mechanics, not plot canon for this game.  
7. Older or deprecated Alderamontico drafts as design quarry only.

## **0.2 Changes from v0.1**

The following are now locked:

* For the jam build, the fracture is generated in Studio during development, audited, curated, and committed as ordinary maps before shipping.  
* Its committed layout persists across all Intercessors and all saves of the jam build; runtime per-save generation is deferred until after the jam.  
* Death resets the active expedition, not the fracture.  
* The player controls a succession of procedurally named Intercessors rather than one fixed protagonist.  
* Every dead Intercessor becomes a persistent cyber ghost at the place of death.  
* Prior ghosts can transfer learned skills to later Intercessors.  
* A vanished expedition is recovered piece by piece through people, ghosts, artifacts, records, camps, and testimony.  
* Expedition artifacts form the central collectathon.  
* All expedition artifacts may theoretically be recovered in one exceptionally successful expedition.  
* An artifact carried at death enters the death bundle for one recovery attempt.  
* If the next Intercessor dies before reclaiming that prior bundle, its expedition artifacts return to their original world positions.  
* Ghosts never return to origin or disappear through this rule; they remain permanently.  
* Persistent mapping, landmarks, permanent shortcuts, rescued people, recovered artifacts, and major world changes survive death.  
* Tactical clutter, ordinary enemy positions, temporary light, transient chemistry, and ordinary loose resources may reset or repopulate between expeditions.  
* Everyone calls these places fractures. Alternate “common names” in older drafts are not competing terms.  
* For the jam build, procedural generation is an author-time Studio tool, not a runtime dependency.  
* The shipped fracture is one selected, audited, manually revised, committed layout.  
* Harvested Glass may be sacrificed as emergency light fuel inside the fracture.  
* Ghost readings are degraded or incomplete by default rather than arbitrarily false.  
* A prior Intercessor’s signature ghost skill is recovered deterministically after the ghost is reached.  
* The jam map target is two dense fracture maps plus one authored culmination area.  
* No primary feature is scheduled for August 15; that date is submission buffer only.

## **0.3 Current unknowns**

The following remain deliberately open until plot development:

* the exact person or authority that commissions the first Intercessor;  
* the central named relationship at the hub;  
* the full membership and fate of the missing expedition;  
* why the expedition’s permanent lighting project continued or failed;  
* whether a hidden settlement is central, peripheral, or absent;  
* the deepest chamber and its meaning;  
* the final choice and ending variants;  
* the exact metaphysical reason fractures are wounded;  
* how “love is given, not earned” becomes specific rather than doctrinal;  
* how a new Intercessor is chosen after each death.

# ---

**1\. Executive Summary**

## **1.1 High concept**

**Fracture Crawl** is a 3D systemic roguelike dungeon crawler set in Alderamontico.

For the jam build, one subterranean fracture is generated in Studio, audited, manually curated, and committed as ordinary maps before shipping. Its geography remains stable while successive Intercessors learn it, map it, open shortcuts, recover a missing expedition, and fill it with the cyber ghosts of their own failed attempts. Runtime per-save generation is a post-jam engine milestone.

The dungeon is governed by literal darkness. In complete darkness, the player cannot see ordinary creatures, terrain, or hazards—but ordinary sighted creatures cannot see the player either. Light grants information, targeting, navigation, harvesting, and confidence. It also exposes the player, gives enemies something to pursue, activates certain Glass and Grid effects, and can destroy the privacy upon which hidden fracture communities depend.

Each expedition begins at a persistent surface hub. The current Intercessor prepares a spatial inventory, chooses light tools and learned skills, enters the fracture, and attempts to recover artifacts, expedition members, Glass, knowledge, and routes. When an Intercessor dies, their ghost remains permanently. Later Intercessors can reach that ghost, recover skills, and attempt to retrieve the artifact bundle left nearby.

The central long-term goal is to reconstruct and recover the missing expedition piece by piece. The collection is physical, social, historical, and personal: artifacts, survivors, ghosts, camps, documents, lighting stations, contradictory testimony, and evidence of what the expedition chose to do in the dark.

## **1.2 One-sentence pitch**

A succession of Intercessors enters one persistent, generated-and-curated fracture, using temporary light to see without being seen, recovering a vanished expedition while every failed attempt leaves another permanent ghost in the dungeon.

## **1.3 Player promise**

The game promises that the player can:

* learn one unique dungeon deeply rather than discard it after each death;  
* turn darkness into cover rather than treating it only as missing information;  
* place and manipulate light as physical tactical objects;  
* use terrain, sound, water, fire, smoke, electricity, Glass, cover, elevation, and objects before and during combat;  
* recover a fixed collection through mastery, possibly in one extraordinary expedition;  
* revisit the places where prior Intercessors died;  
* inherit techniques from those ghosts;  
* watch the fracture become a history of their own play;  
* meet people who live below rather than treating the dungeon as empty hostile geometry;  
* assemble the fate of the vanished expedition without requiring every truth to agree.

## **1.4 Genre and form**

| Field | Target   |
| :---- | :---- |
| Genre | 3D systemic roguelike dungeon crawler / tactical CRPG / collectathon |
| Camera | Isometric perspective with quarter-turn rotation; tactical framing in combat |
| World structure | One persistent curated fracture, initially produced with Studio generation and authored revision, plus a compact authored hub |
| Run structure | Successive Intercessors; death creates a persistent ghost |
| Combat | Same-map hybrid simultaneous-pulse tactical combat |
| Core interaction | Explore, Listen, Light, Act, Attend, Manipulate, Fight, Harvest, Extract |
| Primary progression | Persistent map knowledge, artifacts, shortcuts, skills, ghosts, faction state, rescued people |
| Central resource | Glass, expedition artifacts, light fuel, information, carried capacity |
| Theme | Dark & Light as knowledge/exposure versus privacy/uncertainty |
| Jam target | Complete focused game with one fracture, one story arc, and replayable succession |
| Post-jam potential | Runtime per-save fracture generation, larger fracture recipes, more factions, more landmarks, deeper ghost systems, and additional games made in the engine |

## **1.5 Working narrative spine**

A mixed expedition entered the fracture to establish a permanent safety-light route and conduct recovery work. It vanished.

The route, its stations, and its artifacts remain scattered through the fracture. Successive Intercessors are sent to recover the expedition one member and one object at a time. The evidence gradually shows that the expedition did not simply lose a fight. It divided over what should be illuminated, what should remain hidden, what counted as rescue, and who had the right to report the lives found below.

This premise is active. The exact cause, culprit, hidden population, and final decision remain for the plot document.

# ---

**2\. Locked Design Pillars**

## **2.1 Light is a tactical commitment**

Light is not ambience, a shader, or a universal good. It is a physical commitment that changes who can know what.

Light gives the player:

* visible terrain;  
* enemy identification;  
* reliable targeting;  
* hazard recognition;  
* readable objects and documents;  
* Glass harvesting access;  
* safer movement;  
* map certainty;  
* visual overwatch;  
* the ability to distinguish person, ghost, object, and monster.

Light also:

* reveals the player;  
* exposes allies and shelters;  
* creates a visible route for creatures;  
* may awaken Glass or Grid structures;  
* changes heat and chemistry;  
* creates shadows and occlusion boundaries;  
* may repel one creature and attract another;  
* can turn a hidden social space into an institutional target.

Every important room should ask whether illumination is worth exposure.

## **2.2 Darkness conceals both sides**

Complete darkness is reciprocal.

The player cannot see a sighted creature in full darkness. That creature cannot visually see the player either.

Darkness grants:

* concealment;  
* uncertain movement;  
* stealth routes;  
* protection from visual capture;  
* access to some ghosts and Lanternless practices;  
* the ability to leave enemies searching old information;  
* privacy for people and settlements below.

Darkness costs:

* reliable navigation;  
* targeting;  
* object identification;  
* exact hazard knowledge;  
* confidence in remembered state;  
* some interactions;  
* the ability to distinguish silence from safety.

Darkness is not invisibility against sound, heat, Glass pressure, contact, trace, magical senses, or last-known-position behavior.

## **2.3 The fracture is committed once and learned**

For the jam, candidate fracture layouts are generated in Studio during development. One layout is selected, audited, manually revised, and committed as ordinary maps. Every player receives that stable campaign layout. Runtime per-save generation is deferred until after the jam.

This rule exists because the game is about:

* mastery;  
* route memory;  
* collectathon planning;  
* meaningful corpse recovery;  
* landmark recognition;  
* permanent shortcuts;  
* a dungeon accumulating history;  
* the possibility of one-run completion after many failed attempts.

The Studio generator creates candidate campaign worlds for curation, not disposable runtime levels. The shipped campaign is the strongest audited candidate, revised by hand.

## **2.4 Death adds a person**

Every death creates a persistent cyber ghost.

Death therefore changes the dungeon permanently even when the expedition fails. A dead Intercessor is not reduced to a marker or currency bundle. They become a person or damaged persistence who may:

* speak;  
* repeat;  
* teach;  
* accuse;  
* misremember;  
* help;  
* become hostile;  
* hold a skill;  
* mark a route;  
* need future care.

The fracture remembers people more reliably than it remembers success.

## **2.5 Artifacts are obligations, not trinkets**

Expedition artifacts are the primary collection set, but each artifact belongs to a history.

An artifact should be at least one of the following:

* a tool with a prior user;  
* a component of the light route;  
* a personal belonging;  
* a legal or Church object;  
* a survey record;  
* a Glass witness;  
* a key to a route or testimony;  
* evidence that changes an interpretation;  
* something requested by a living or dead person.

Collection must reconstruct relationships and choices, not merely fill a percentage meter.

## **2.6 Knowledge survives better than property**

The player’s most reliable progression is what later Intercessors know and can do.

Persistent progression favors:

* learned skills;  
* creature knowledge;  
* mapped geometry;  
* landmarks;  
* shortcuts;  
* faction information;  
* ghost relationships;  
* known Glass behavior;  
* expedition testimony;  
* the history of prior runs.

Ordinary carried goods are fragile. Exact tactical states are temporary. Understanding and communal record are what make future attempts different.

## **2.7 Systems create situations**

The generator and content authoring should create interacting situations, not rooms whose only variation is enemy count.

A good room combines several systems:

* illumination;  
* darkness;  
* sound;  
* cover;  
* elevation;  
* doors;  
* water;  
* fire;  
* smoke;  
* electricity;  
* foam;  
* Glass;  
* movable objects;  
* faction behavior;  
* ghost presence;  
* competing routes;  
* a reward or obligation.

The player should solve problems through preparation and improvisation rather than one authored answer.

## **2.8 The fracture is inhabited**

The fracture is a frontier and a second society.

It may contain:

* expedition camps;  
* Church checkpoints;  
* Lanternless blind shelters;  
* prospectors;  
* scavengers;  
* ghost keepers;  
* cyber ghosts;  
* old vampire refuges;  
* Uncounted caches;  
* smugglers;  
* altered residents;  
* survivors who refuse extraction;  
* impossible markets;  
* creatures and demons.

The dungeon must contain work, shelter, trade, memory, conflict, and ordinary need.

## **2.9 Dark and light are not morality colors**

The game must not collapse into:

* light \= good;  
* dark \= evil;  
* Church \= false;  
* Lanternless \= right;  
* mapping \= violence;  
* obscurity \= freedom.

Light can rescue. Light can expose. Darkness can shelter. Darkness can abandon. Stable routes can save lives. Stable routes can make hidden people controllable. Unreadability can preserve personhood. Unreadability can prevent accountability and rescue.

## **2.10 The engine’s existing depth is the game**

The project should not hide its systemic engine behind scripted sequences.

The game is specifically designed to use:

* fog of war;  
* dynamic lighting;  
* perception and alert states;  
* sound stimuli;  
* persistent maps;  
* tactical combat;  
* cover, height, facing, and overwatch;  
* chemistry;  
* object manipulation;  
* Glass pressure;  
* emotional state;  
* Attend;  
* Yell;  
* Console;  
* spatial inventory;  
* factions, quests, documents, barks, shops, and world facts.

# ---

**3\. Scope**

## **3.1 Jam-critical target**

The minimum complete jam version should include:

* one compact surface hub;  
* one committed persistent fracture generated in Studio and shipped as ordinary maps;  
* two dense fracture maps plus one authored culmination area;  
* one fixed artifact collection set;  
* a missing-expedition story that can be completed;  
* successive procedurally named Intercessors;  
* permanent player ghosts;  
* artifact death bundles with the one-recovery rule;  
* persistent map discovery and shortcuts;  
* light carried, placed, thrown, extinguished, and created by environment;  
* literal darkness and fog-based stealth;  
* sound suspicion and last-known-position searching;  
* at least two nonvisual creature sense types;  
* Glass harvesting and extraction;  
* same-map tactical combat;  
* a focused chemistry set;  
* Attend, Yell, and Console in usable form;  
* three major faction presences;  
* four to six creature families;  
* six to ten persistent skills;  
* contracts and collection tracking;  
* a final plot decision or culmination;  
* stable save/load.

## **3.2 Full short-game target**

A fuller post-jam version may include:

* four to six major depths;  
* more landmark templates;  
* more expedition members and artifacts;  
* deeper faction conflict;  
* ghost shelters as a complete location;  
* old vampire fracture communities;  
* alternate routes to the culmination;  
* more skill inheritance choices;  
* more chemistry and creature senses;  
* several ending conditions;  
* stronger hub transformation;  
* more procedural recipes while retaining one generated layout per save.

## **3.3 Protected content**

Protect these against scope cuts:

* persistent one-save fracture layout;  
* darkness hides player and sighted creatures reciprocally;  
* physical temporary light placement;  
* missing expedition collection spine;  
* procedurally named Intercessor succession;  
* permanent cyber ghosts at death locations;  
* ghost skill inheritance;  
* artifact death-bundle rule;  
* all-artifacts-in-one-run possibility;  
* Glass creating return-trip exposure;  
* at least one inhabited fracture shelter;  
* same-map tactical combat;  
* one meaningful use each of fire, water, smoke, and electricity;  
* persistent mapping and landmarks;  
* final plot consequence involving illumination and concealment.

## **3.4 First cuts**

Cut in this order if necessary:

1. extra creature families;  
2. secondary faction quest lines;  
3. advanced equipment systems;  
4. procedural faction shelters beyond authored landmark rooms;  
5. advanced foam/freezing interactions;  
6. multiple culmination variants;  
7. deep ghost personality generation;  
8. optional companions;  
9. complex survival meters;  
10. more than one fracture recipe.

Do not cut the death/ghost loop to save time. It is the game’s identity.

# ---

**4\. World and Fracture Canon**

## **4.1 What a fracture is**

A fracture is a permanent local failure of stable relation among Grid pressure, magic, memory, Glass, and ordinary reality.

In a fracture:

* stored feeling may become environmental;  
* ritual symbols may acquire direct force;  
* routes may repeat, fold, or refuse expected distance;  
* objects may answer the wrong person;  
* dead witness may persist too clearly;  
* local magic may become unusually literal;  
* the Grid may lose clean control while its pressure increases;  
* Glass accumulates in unusual abundance;  
* living communities may survive inside blind spots.

Everyone calls them **fractures**.

## **4.2 Permanent wound, campaign-stable arrangement**

Fractures are permanent. Their potential configurations may be unstable in the broader world, but the jam build ships one committed arrangement shared by all saves. Post-jam runtime generation may create a different stable arrangement for each campaign.

The generated campaign layout represents the fracture’s current settled configuration. It may still contain local moving structures, temporary route changes, reactive doors, collapsing passages, or major plot transformations. Ordinary player death does not reroll the entire fracture.

In the jam build, a new save loads the same committed configuration. Post-jam runtime generation may create another valid configuration of the same fracture concept.

## **4.3 Entrances and physical form**

Fracture entrances may appear:

* as openings in the ground;  
* within cliff faces;  
* in mountain sides;  
* beneath ruined structures;  
* through collapsed mines;  
* in sealed underchapels;  
* through old vampire refuges;  
* at exposed Grid rupture sites.

For this game, the main fracture is predominantly subterranean.

## **4.4 History before the Grid**

Many fracture sites were already occupied or meaningful before the Grid:

* caves;  
* mines;  
* burial chambers;  
* shrines;  
* hidden settlements;  
* vampire survival refuges;  
* old roads beneath newer roads;  
* military or royal works;  
* necromantic sites;  
* ritual chambers.

These places were not necessarily fractures yet. They supplied dense, contradictory histories upon which later Grid pressure acted.

## **4.5 Fractures after the Grid**

Some fractures appeared directly during or after the Grid’s arrival. Others converted older places.

Useful campaign families:

* **Converted fractures:** recognizable architecture and layered human history transformed by Grid pressure.  
* **Emergent fractures:** spaces with little stable architectural ancestry, governed more strongly by Glass, memory, symbolic relation, and impossible ecology.

The jam fracture may combine both.

## **4.6 Working wound model**

Until plot development locks the truth, use this production model:

A fracture is a place where incompatible patterns cannot be made into one stable answer, yet the pressure to resolve them continues.

This model explains procedural generation, repeated spatial contradiction, ghost persistence, and environments shaped by memory without forcing the final story to reveal the Grid as the sole author of every event.

## **4.7 Glass abundance**

Glass is abundant because fractures are zones of sustained Grid action and failed stabilization.

Deposits may contain:

* emotional residue;  
* route memory;  
* dead witness;  
* ritual framing;  
* fragments of testimony;  
* repeated fear;  
* partial identity;  
* old institutional use;  
* black or highly legible Grid pattern.

Glass is harvestable, useful, dangerous, and economically central.

## **4.8 Cyber ghosts are new**

Cyber ghosts did not exist as an ordinary ancient people. They are rare disembodied casualties of Grid-era conversion.

Death inside the fracture reliably creates them for the game’s player succession, but this does not make cyber ghosts common throughout Alderamontico. The specific fracture may be unusually effective at retaining dead Intercessors.

Cyber ghosts can persist through:

* Glass-bearing housings;  
* mirrors;  
* bells;  
* signs;  
* doors;  
* ritual cabinets;  
* statues;  
* reliquaries;  
* armor;  
* fracture-local pattern without stable housing.

## **4.9 Fracture society**

Below respectable public life exists a loose second society of:

* smugglers;  
* illegal Glassworkers;  
* ghost keepers;  
* fugitives;  
* old nobles;  
* unlicensed necromancers;  
* Uncounted communities;  
* Lanternless cells;  
* altered people;  
* prospectors;  
* survivors;  
* impossible markets.

It is not morally pure. It is where rejected forms of life continue without permission.

# ---

**5\. Working Narrative Structure**

## **5.1 The vanished expedition**

A mixed expedition entered the fracture to establish a permanent safety-light route, survey new Glass growth, and conduct recovery work. It vanished before completing a reliable report.

Its traces are distributed throughout the fixed dungeon:

* lighting stations;  
* route markers;  
* personal artifacts;  
* tools;  
* journals;  
* Church seals;  
* survey Glass;  
* camps;  
* bodies;  
* ghosts;  
* living survivors;  
* altered survivors;  
* conflicting records;  
* faction claims.

The player’s long-term task is to recover the expedition **one piece at a time**.

## **5.2 Collection as narrative reconstruction**

No single recovered object supplies the whole plot.

The player reconstructs:

* who entered;  
* which factions were represented;  
* what the route was intended to do;  
* where the expedition divided;  
* who preserved light;  
* who extinguished it;  
* who encountered fracture residents;  
* who attempted extraction;  
* who died;  
* who became a ghost;  
* who may still be alive;  
* what the deepest active system is doing now.

Artifacts should unlock dialogue, testimony, map annotations, faction consequences, or new interactions rather than only text entries.

## **5.3 Successive Intercessors as the protagonist**

There is no single permanent player character.

The protagonist is the succession of Intercessors sent into the same unresolved case.

Each Intercessor:

* receives a procedurally assembled Alderamontican name;  
* may receive a lightweight background or class tag;  
* begins with the communal map and permanent skill archive;  
* chooses a limited active loadout;  
* may inherit skills directly from prior ghosts;  
* can recover expedition artifacts;  
* can die and remain as another ghost.

The campaign’s emotional continuity belongs to:

* the hub community;  
* the fracture;  
* the ghost population;  
* the missing expedition;  
* the case record;  
* the player’s memory.

## **5.4 Plot acts as production slots**

### **Act I — Establish the route**

The player learns the hub, first Intercessor, darkness rules, light tools, first artifact, and first expedition trace.

### **Act II — Recover the split**

The player opens shortcuts, finds multiple expedition viewpoints, encounters fracture society, and realizes the disappearance involved incompatible choices rather than one accident.

### **Act III — Reach the operating cause**

The player reaches the deepest active system, person, settlement, or Glass structure responsible for the continuing stakes.

### **Epilogue — What is brought into the light**

The ending resolves what is reported, rescued, hidden, stabilized, abandoned, or allowed to remain unresolved.

Exact beats remain for the plot document.

# ---

**6\. Core Gameplay Loops**

## **6.1 Campaign loop**

1. Load the committed fracture layout.  
2. Meet the hub and receive the active case.  
3. Create or receive the current Intercessor.  
4. Prepare inventory, light, skills, and objective.  
5. Enter the fracture.  
6. Map, recover, harvest, fight, negotiate, and open routes.  
7. Extract successfully or die.  
8. Update hub, collection, ghosts, skills, shortcuts, and case state.  
9. Send the next Intercessor.  
10. Continue until the expedition and culmination conditions are resolved.

## **6.2 Expedition loop**

1. Select contract or recovery target.  
2. Organize loadout.  
3. Enter through known upper routes.  
4. Travel toward a landmark, artifact, ghost, or unknown branch.  
5. Manage light and concealment.  
6. Use sound and perception to read danger.  
7. Shape rooms through objects and chemistry.  
8. Resolve encounters through stealth, dialogue, Attend, manipulation, or combat.  
9. Collect Glass, artifacts, knowledge, and people.  
10. Decide whether to go deeper, recover a death bundle, or extract.

## **6.3 Room loop**

1. Stop at the boundary of current visibility.  
2. Listen.  
3. Read known map information.  
4. Choose a light method or remain dark.  
5. Reveal partial information.  
6. Identify creature senses and environmental opportunities.  
7. Commit to a route, lure, interaction, or fight.  
8. Accept the room’s changed state.  
9. Mark, extinguish, abandon, or recover placed lights.  
10. Move into the next unknown boundary.

## **6.4 Recovery loop**

When a prior Intercessor has died:

1. The new Intercessor receives the ghost’s last known location.  
2. The discovered map provides the route, but enemies and tactical states may differ.  
3. The player reaches the ghost.  
4. The player may Attend, Console, speak, or confront it.  
5. The player may inherit available skills.  
6. The player retrieves the artifact bundle if still present.  
7. The player must then extract or continue carrying the renewed risk.

## **6.5 Collectathon loop**

1. Discover an expedition artifact at its original location.  
2. Learn who used it and why it matters.  
3. Carry it toward extraction.  
4. If extraction succeeds, install it in the hub collection and advance its narrative state.  
5. If death occurs, place it in that death bundle for one recovery opportunity.  
6. If the next Intercessor dies before reclaiming the bundle, return the artifact to its original location.  
7. Preserve all ghosts created along the way.

## **6.6 Perfect expedition possibility**

All artifacts may theoretically be recovered in one expedition.

This is not the expected first-play outcome. It is a mastery challenge enabled by:

* complete map knowledge;  
* optimized shortcuts;  
* skill selection;  
* light economy;  
* creature knowledge;  
* route planning;  
* inventory management;  
* understanding where extraction is possible.

The game should recognize a one-expedition complete recovery, but should not make it the only legitimate success.

# ---

**7\. Persistent Fracture Model**

## **7.1 Committed once for the jam build**

During development, Studio selects or accepts a seed and generates candidate campaign fractures. The team audits the candidates, selects one, manually revises it, and commits it as ordinary package maps. At new-game creation, the jam runtime loads those committed maps rather than generating a new layout.

The generated output includes:

* floor topology;  
* room placement;  
* corridors;  
* stairs and vertical connectors;  
* elevations;  
* landmark positions;  
* original artifact positions;  
* major faction rooms;  
* persistent shortcut structures;  
* fixed expedition traces;  
* Glass deposit families;  
* encounter and ecology zones;  
* extraction nodes;  
* culmination access rules.

The selected authoring seed, generator version, recipe, validation result, canonical output hash, and manual revision record are stored as production provenance. Player saves reference the committed campaign maps.

## **7.2 Persistent state layers**

| State layer | Persists across death? | Notes   |
| :---- | ----: | :---- |
| Generated geometry | Yes | Core topology remains fixed for the save |
| Discovered map geometry | Yes | Inherited through Intercessor records |
| Major landmarks | Yes | Named and permanently recognized after discovery |
| Permanent shortcuts | Yes | Doors, lifts, bridges, or routes intentionally made persistent |
| Recovered expedition artifacts | Yes | Installed at hub or marked secured |
| Artifact original positions | Yes | Used when an unrecovered bundle resets |
| Ghosts | Yes | Every dead Intercessor remains |
| Rescued or removed named NPCs | Yes | Major social consequence |
| Major faction control changes | Yes | Authored and saved |
| Major destroyed barriers | Usually | Only if marked permanent |
| Ordinary enemies | No / repopulate | Spawn logic may vary by expedition |
| Patrol positions | No | Reset or reschedule |
| Common loot | Tunable | May respawn, restock, or remain consumed by category |
| Temporary light | No | Extinguished or removed between expeditions unless authored permanent |
| Fire, smoke, fluid frontier | No | Tactical chemistry normally clears or reconciles |
| Death bundle | Conditional | Remains for one recovery attempt |
| Artifact in death bundle | Conditional | Returns to origin if next Intercessor dies first |
| Ordinary dropped gear | Tunable | Final economy decision pending |

## **7.3 Major versus tactical persistence**

Use the rule:

Major navigation, collection, named-person, and story consequences persist. Tactical clutter resets.

Persistent examples:

* unlocking an expedition lift;  
* repairing a major bridge;  
* rescuing a survivor;  
* opening a landmark gate;  
* recovering an artifact;  
* creating a ghost;  
* changing faction access;  
* extinguishing a permanent Grid beacon through a plot action.

Transient examples:

* a puddle made during combat;  
* smoke;  
* temporary foam;  
* a thrown flare;  
* ordinary enemy corpses;  
* incidental moved crates;  
* patrol alert state;  
* common dropped supplies.

## **7.4 Local reactivity without rerolling**

The fixed layout may still feel alive through:

* schedules;  
* changed patrols;  
* creatures migrating after artifact recovery;  
* lights being repaired or extinguished;  
* doors opening through faction state;  
* ghost accumulation;  
* shops and shelters changing inventory;  
* minor cave-ins;  
* authored room transformations;  
* Grid pressure changing local presentation;  
* new barks, documents, and encounters.

The player should learn the dungeon without reducing it to a static solved diagram.

## **7.5 Campaign seed identity**

Development and exported build metadata should record the committed fracture’s authoring seed for:

* reproducibility;  
* debugging;  
* community comparison;  
* challenge runs;  
* future daily or curated seeds;  
* sharing unusually strong layouts.

Seed visibility is unnecessary in normal jam UI but mandatory in debug and build provenance. Post-jam runtime-generated campaigns may expose their seed to players.

# ---

**8\. Procedural Dungeon Generation**

## **8.1 Generator purpose**

The generator creates candidate persistent campaign labyrinths inside Studio. The jam runtime does not depend on generation. The selected candidate is audited, revised, and shipped as ordinary maps. Post-jam, the same architecture may generate a unique campaign per save. It does not attempt to generate the entire world of Alderamontico.

Its job is to produce:

* navigable topology;  
* meaningful darkness and lighting situations;  
* stable collectathon routes;  
* recurring landmark logic;  
* tactical variety;  
* physical and social room functions;  
* room for authored plot content;  
* valid ordinary engine maps.

## **8.2 Generation pipeline**

1. Choose recipe, seed, and generator version.  
2. Generate abstract multi-floor room graph.  
3. Assign critical path, optional branches, loops, secrets, artifact regions, faction regions, and extraction access.  
4. Validate topology.  
5. Embed rooms into 3D macro-grid coordinates.  
6. Route corridors and vertical connectors.  
7. Build floors, walls, doors, stairs, pits, elevations, and boundaries.  
8. Validate actor-footprint navigation.  
9. Place authored landmarks.  
10. Place permanent lights and darkness zones.  
11. Place original expedition artifacts and trace nodes.  
12. Place faction infrastructure and shelters.  
13. Place ecology and encounter zones.  
14. Place chemistry and environmental situations.  
15. Place Glass deposits and common resources.  
16. Place containers, objects, documents, and optional secrets.  
17. Run reachability, gate, combat-space, lighting, reference, and save-contract audits.  
18. Bake ordinary package maps.  
19. Review the candidate in Studio.  
20. Manually revise weak rooms, routes, lighting, landmark staging, and narrative placements.  
21. Run the full audit again.  
22. Commit the selected maps as shipped campaign content.  
23. Record provenance and canonical hash.

## **8.3 Abstract topology**

The topology should support:

* one clear entrance region;  
* one deep culmination region;  
* multiple route families;  
* loops that reduce corpse-recovery friction after discovery;  
* optional branches;  
* dead ends with purposeful rewards or history;  
* lock-and-key or tool-gated access;  
* several extraction opportunities or one evolving extraction network;  
* landmarks that orient without revealing exact routes;  
* artifact distribution that permits one-run collection but makes it demanding.

## **8.4 Floor scale**

Jam recommendation:

* two dense committed fracture maps;  
* one smaller authored culmination or final district;  
* 12–20 meaningful rooms per fracture map;  
* 2–3 landmark rooms per fracture map;  
* 1–2 major permanent shortcuts per fracture map;  
* 4–6 expedition artifacts per fracture map, tuned to the final collection size;  
* optional connectors that allow route planning rather than one linear descent.

Exact counts are tunable after generator and movement testing.

## **8.5 Room archetypes**

Initial archetypes:

* entrance transition;  
* dark connector;  
* lit checkpoint;  
* combat arena;  
* stealth bypass;  
* environmental hazard room;  
* Glass harvest chamber;  
* survivor camp;  
* ghost room;  
* expedition camp;  
* artifact room;  
* locked archive;  
* vertical traversal room;  
* flooded chamber;  
* collapsed civic room;  
* old vampire room;  
* Lanternless blind room;  
* Church lighting station;  
* prospector salvage room;  
* secret room;  
* landmark;  
* culmination chamber.

A room archetype defines constraints, sockets, and population opportunities. It should not always dictate the same solution.

## **8.6 Authored landmarks**

Landmarks recur as recognizable authored structures embedded in different campaign layouts.

Working examples:

* **The Hanging Cathedral** — a large vertical chamber with suspended sacred architecture and multiple light elevations.  
* **The Black Reservoir** — dark water, reflected Glass, and sound-dominant navigation.  
* **The Three Elevators** — three shafts with different faction histories and access states.  
* **The Flooded Archive** — documents, conductive water, and unstable witness Glass.  
* **The Giant Face** — an architectural or creature-like structure whose exact plot role remains open.  
* **The Lamp Orchard** — many small lights that can be cultivated, stolen, extinguished, or used as bait.  
* **The Broken Service Hall** — retro-civic counters and queues transformed into a shelter or hunting ground.  
* **The Vampire Bloodworks** — an old pre-House survival site later altered by Glass.  
* **The Silent Platform** — a broad transit-like space where sound rules change.

Landmarks provide orientation, collection anchors, plot staging, and memorable screenshots.

## **8.7 Generation constraints for light and dark**

Every generated region must contain:

* routes that can be traveled without permanent personal light;  
* at least one reason to create light;  
* at least one place where carried light is dangerous;  
* darkness pockets with meaningful stealth value;  
* lit zones that are genuinely relieving or useful;  
* light sources that can be manipulated;  
* no mandatory route requiring the player to guess through invisible lethal geometry without sufficient information;  
* no critical artifact placed behind an unsignaled irreversible hazard.

## **8.8 Situation grammar**

Population should create situations with this pattern:

Space \+ visibility condition \+ environmental material \+ creature sense \+ objective/reward \+ alternate approach.

Example:

A flooded storehouse is lit by one damaged Church lamp. Sighted creatures guard a Glass tool on the lower floor. The upper walkway is dark but partly collapsed. The player can repair the lamp and fight, remain dark and climb, douse the lamp to break sight, electrify the water, create smoke, lure the creatures with a thrown flare, or leave the artifact for later.

## **8.9 Validation**

The generator must reject or retry layouts that fail any critical condition:

* entrance cannot reach culmination;  
* an artifact origin is unreachable;  
* an artifact route requires its own artifact;  
* extraction cannot be reached from a critical region;  
* mandatory stairs or doors are invalid;  
* actor footprint cannot pass;  
* room overlap is illegal;  
* required light tools are unavailable before mandatory darkness interaction;  
* combat rooms lack navigable space;  
* permanent lights eliminate all stealth routes;  
* total darkness hides mandatory instant-death hazards without telegraphing;  
* a shortcut bypasses plot gates incorrectly;  
* references point to absent entities, objects, dialogue, or maps;  
* duplicate IDs occur;  
* same seed and version produce different canonical output.

## **8.10 Ordinary-map rule**

Once generated, every floor is an ordinary engine map.

A generated door is a normal door. A generated creature is a normal entity. Water uses normal chemistry. Fog uses normal fog state. Save/load uses normal map deltas. The runtime must not maintain a parallel “procedural gameplay” branch.

# ---

**9\. Exploration, Movement, and Camera**

## **9.1 Camera**

Use the active 3D isometric perspective camera.

Required behavior:

* smooth follow;  
* quarter-turn rotation;  
* controlled zoom;  
* occluder fading;  
* camera-relative movement;  
* story focus targets;  
* tactical framing during combat;  
* no separate battle screen;  
* hidden cells remain mechanically hidden even when camera angle could visually expose geometry.

## **9.2 Macro and fine grid**

Maps are authored on the macro grid and expanded into a 3×3 fine runtime grid.

The fine grid supports:

* light boundaries;  
* fluid and gas propagation;  
* precise cover;  
* narrow stealth routes;  
* thrown light placement;  
* short forced movement;  
* AoE shapes;  
* object footprints;  
* sound and hazard resolution.

## **9.3 Movement cadence**

Movement is deliberate and energy-based.

The player can:

* move by held input;  
* rotate camera freely;  
* use contextual Act;  
* wait and listen;  
* take fine movement where supported;  
* climb through valid structures;  
* push or pull obstacles;  
* transition into combat without scene change;  
* retreat from encounters through darkness, doors, smoke, or route knowledge.

## **9.4 Exploration verbs**

The player-facing exploration vocabulary is:

* **Move** — change position.  
* **Wait / Listen** — spend time to gather sound and behavior information.  
* **Act** — contextual interaction with doors, containers, NPCs, items, exits, objects, and harvesting nodes.  
* **Light** — toggle, place, throw, extinguish, or manipulate illumination.  
* **Attend** — enter an authored attention exchange with a person, ghost, ensouled object, or select creature.  
* **Manipulate** — Push, Pull, Throw, Drop, Stack, Climb, Break, Burn, Douse, Freeze, Wet, Electrify, or Foam where valid.  
* **Fight** — enter or act within tactical combat.  
* **Extract** — end the expedition through a valid route.  
* **Leave** — stop an interaction or abandon an optional situation.

## **9.5 Exploration should reward curiosity**

The player should regularly see or hear something that creates a question:

* a light through a crack;  
* an elevated route;  
* a repeated sound;  
* a Glass reflection;  
* a familiar landmark from an unexpected side;  
* a prior ghost;  
* a faction mark;  
* an old door;  
* an object that can be moved;  
* water flowing from an unseen room.

Curiosity should usually produce information, route value, collection progress, or a memorable situation even when it does not produce treasure.

# ---

**10\. Light, Darkness, and Fog of War**

## **10.1 Shared mechanical light**

The game requires one authoritative cell-light calculation shared by:

* renderer illumination;  
* player visibility;  
* NPC visibility;  
* fog of war;  
* targeting;  
* overwatch;  
* stealth;  
* alert evaluation;  
* creature abilities;  
* Glass glow;  
* fire;  
* smoke and occlusion;  
* UI exposure feedback.

A cell cannot look bright while being mechanically dark, or look dark while granting full sight, except through an explicit magical effect communicated to the player.

## **10.2 Illumination bands**

### **Full darkness**

* ordinary visual identification is unavailable;  
* sighted actors cannot acquire new visual targets;  
* the player cannot use ordinary visual ranged targeting;  
* contextual interaction is limited to adjacent known objects or special skills;  
* nonvisual senses remain active;  
* remembered geometry may remain on the map;  
* some ghosts and dark-only interactions become possible.

### **Dim light**

* near terrain and silhouettes may be visible;  
* identification range is reduced;  
* ranged accuracy or targeting confidence may be reduced;  
* movement can be seen at shorter range;  
* stealth remains viable;  
* exact object or creature information may require proximity or knowledge.

### **Full light**

* ordinary visual identification;  
* normal targeting;  
* easiest navigation and reading;  
* longest sight-based detection;  
* greatest personal exposure;  
* strongest visibility of carried Glass.

## **10.3 Fog states**

### **Unknown**

Never observed by any Intercessor in the current save.

### **Mapped / remembered**

Previously seen and entered into the communal case map. Geometry persists across Intercessors, but current enemies, moving objects, temporary hazards, and lighting may be stale or absent.

### **Currently visible**

Within present line of sight and illumination. Current entities, conditions, and interactables may be displayed according to knowledge and perception.

## **10.4 Persistent mapping**

Map discovery persists across death because later Intercessors inherit:

* case maps;  
* route notes;  
* expedition records;  
* ghost testimony;  
* permanent landmarks;  
* opened shortcuts.

The exact current tactical state does not persist on the map. A remembered room can still contain a different patrol, darkness state, scavenger, or ghost.

## **10.5 Carried light**

Carried light follows the player.

Benefits:

* continuous local vision;  
* easier interaction;  
* immediate target acquisition;  
* reliable movement.

Costs:

* continuously visible moving source;  
* weak stealth;  
* attracts light-hunters;  
* may reveal allies;  
* competes with inventory or hand use;  
* may increase Grid or Glass response.

## **10.6 Placed light**

Placed light creates stationary zones.

Uses:

* reveal a room before entry;  
* create an overwatch zone;  
* mark a route;  
* bait a creature;  
* illuminate a harvest site while the player moves elsewhere;  
* protect against dark-averse creatures;  
* support NPCs or shelters.

Risks:

* enemies investigate it;  
* it can be destroyed, moved, stolen, flooded, doused, or exhausted;  
* it exposes the route taken;  
* it may ignite nearby material;  
* recovery costs time and movement.

## **10.7 Thrown light**

Thrown light creates a temporary distant reveal.

It should:

* use normal targeting and throw logic;  
* create impact sound;  
* illuminate after landing;  
* interact with fuel, water, Glass, and creatures;  
* be recoverable only where appropriate;  
* support deliberate baiting.

## **10.8 Environmental light**

Sources include:

* fire;  
* Church lamps;  
* luminous worked Glass;  
* electrical discharge;  
* ghost light;  
* creature bodies;  
* ritual effects;  
* Glass deposits;  
* sunlight or surface spill near entrances.

Environmental light may be beneficial, hostile, unstable, or misleading.

## **10.9 Smoke and obscuration**

Smoke can create darkness-like visual cover without removing heat, sound, or other senses.

Smoke should:

* reduce line of sight;  
* weaken light penetration;  
* affect actors physically;  
* spread through openings;  
* create escape or ambush opportunities;  
* interfere with both player and enemies.

## **10.10 Light as route history**

Placed lights become a temporary constellation of the expedition.

The player can look back and see where safety, attention, and danger were spent. That constellation should feel authored by play rather than UI alone.

# ---

**11\. Sound, Perception, and Stealth**

## **11.1 Perception model**

Actors evaluate:

* light;  
* line of sight;  
* facing;  
* distance;  
* occlusion;  
* movement;  
* sound;  
* heat;  
* Glass pressure;  
* residue or trace;  
* emotional state;  
* last-known position;  
* faction and hostility context.

## **11.2 Alert progression**

Use the engine’s existing sequence:

1. **Oblivious** — no meaningful awareness.  
2. **Suspicious** — a stimulus has been noticed.  
3. **Searching** — the actor investigates a location, route, light, sound, or trace.  
4. **Combat** — the actor has identified a hostile target or crossed an authored threshold.

Darkness can break sight but does not erase suspicion.

## **11.3 Last-known position**

When visual contact is lost, enemies should remember:

* last seen cell;  
* last heard source;  
* last observed light;  
* last known direction;  
* recent damage source.

They may:

* attack the old position;  
* search nearby;  
* hold a chokepoint;  
* illuminate the area;  
* call allies;  
* retreat;  
* switch to nonvisual senses.

## **11.4 Player-generated sound**

Sound sources include:

* walking;  
* hurried movement;  
* splashing;  
* opening and closing doors;  
* throwing items;  
* breaking objects;  
* moving heavy objects;  
* Glass harvesting;  
* combat;  
* Yell;  
* fire;  
* electricity;  
* falling;  
* machinery;  
* alarms;  
* faction work.

## **11.5 Information through sound**

When the player cannot see, sound should provide approximate information:

* direction;  
* rough distance;  
* intensity;  
* repetition;  
* learned category;  
* whether a sound is approaching or receding.

Knowledge changes text and icon specificity.

Example:

* Unknown: “Something wet dragged itself nearby.”  
* Partly known: “A heavy creature moved east.”  
* Learned: “A Hollow Choir moved roughly four fine cells east.”

## **11.6 Creature sensory profiles**

### **Sighted**

Requires illumination and line of sight.

### **Light-hunter**

Detects luminous targets or sources from farther away than ordinary sight.

### **Sound-hunter**

Tracks sound through darkness and may ignore visual bait.

### **Glass-sensitive**

Detects carried Glass, active deposits, or Grid pressure.

### **Heat-sensitive**

Detects warm bodies, fire, or recent heat changes.

### **Ghostly**

Appears, communicates, or attacks under specific darkness, Glass, emotional, or ritual conditions.

### **Trace-sensitive**

Responds to residue, liquid disturbance, opened doors, webs, scent-like magical traces, or crossed boundaries.

### **Mixed**

Combines senses with different confidence and behavior.

## **11.7 Stealth re-entry**

Combat does not necessarily remain locked until one side dies.

A player who:

* breaks sight;  
* extinguishes light;  
* reduces sound;  
* changes route;  
* uses smoke;  
* closes doors;  
* survives searching;

may return enemies to searching or suspicious states where authored rules permit.

# ---

**12\. Tactical Combat**

## **12.1 Combat model**

Use the existing hybrid simultaneous-pulse system.

* Allies act through the active queue in speed order.  
* Enemy responses resolve through pulses after ally actions and movement.  
* Nearby hostiles may reinforce.  
* Movement during an ally action uses the existing macro/fine movement budget.  
* Combat remains on the exploration map.

## **12.2 Player actions**

Core combat actions:

* move;  
* basic attack;  
* skill;  
* use item;  
* manipulate object or environment;  
* place or extinguish light;  
* Attend;  
* Yell;  
* Console;  
* overwatch;  
* wait/guard;  
* attempt disengagement.

## **12.3 Tactical calculations carried forward**

Use:

* deterministic hit and damage resolution;  
* directional half and full cover;  
* facing;  
* flanking;  
* height;  
* line of sight;  
* opportunity attacks;  
* forced movement;  
* environmental hazards;  
* overwatch;  
* hostile telegraphed intent;  
* single, line, cone, cross, and block target shapes;  
* status effects;  
* party positioning where allies exist.

## **12.4 Light in combat**

Light affects:

* whether a target is visually valid;  
* ranged accuracy or confidence;  
* overwatch triggers;  
* hostile intent visibility;  
* enemy acquisition;  
* ability conditions;  
* Glass-sensitive reactions;  
* opportunities to disengage.

## **12.5 Pre-combat advantage**

The player should often enter formal combat after already changing the room through:

* light placement;  
* lure placement;  
* door state;  
* water;  
* fire;  
* smoke;  
* electricity;  
* cover movement;  
* high ground;  
* object blocking;  
* sound;  
* stealth position;  
* Attend or dialogue.

## **12.6 Damage and death**

Combat uses real HP and death.

The game does not require a separate abstract “composure combat” layer. Emotional state influences decisions and effects but does not replace bodily danger.

Named NPC death, ghost creation, and faction consequence are authored and persistent where relevant.

## **12.7 Morality and combat**

Combat is not automatically morally wrong, and pacifism is not the only high-understanding route.

The game should distinguish:

* survival;  
* predation;  
* self-defense;  
* execution;  
* attacking a nonhostile person;  
* killing a ghost housing;  
* destroying a creature whose ecology the player understands;  
* harming a faction shelter;  
* breaking a necessary protection.

Consequences should emerge from facts, witnesses, factions, and relationships rather than one global morality score.

# ---

**13\. Attend**

## **13.1 Definition**

Attend is an authored act of focused perception directed toward a soul-bearing or spiritually meaningful target.

It is not:

* a universal scan;  
* guaranteed objective truth;  
* a morality button;  
* a pacifist skip;  
* a replacement for ordinary conversation;  
* available on every generic object.

## **13.2 Valid targets**

Potential targets:

* named NPCs;  
* cyber ghosts;  
* expedition ghosts;  
* prior player ghosts;  
* ensouled or witness-bearing Glass objects;  
* selected demons or creatures;  
* doors, signs, bells, mirrors, or reliquaries with explicit spiritual interiority;  
* authored Attend nodes embedded in rooms.

Generic enemies need not all be attendable. Creature families can expose Attend only after sufficient knowledge or under specific states.

## **13.3 Carried-over outcome model**

Attend may resolve as:

* **Success** — a useful or humane reading is reached.  
* **Partial** — something real is perceived, but important framing remains uncertain.  
* **False reading** — the target or Glass returns a misleading pattern.  
* **Regular failure** — no meaningful contact.  
* **Spectacular failure** — the player imposes a harmful or dangerously confident interpretation.  
* **End early** — the Intercessor withdraws.  
* **No read** — the system itself is inappropriate or cannot reach the target.

## **Ghost-read exception**

## **Living people, creatures, and contaminated Glass may still produce deliberate or structurally false readings. Player ghosts and expedition ghosts normally produce degraded readings instead: fragmentary, incomplete, temporally displaced, attached to the wrong remembered moment, or unable to express what has been lost.**

## **A ghost is not treated as randomly lying. Explicit external distortion may create a false ghost reading only when the condition is authored and signaled through presentation, facts, or prior knowledge.**

## **Ghost Attend can complicate memory, relationship, stability, or additional rewards, but it cannot arbitrarily erase the ghost’s signature progression skill.**

## 

## **13.4 Option logic**

Options may be internally authored as:

* patient / nonpossessive;  
* fixing / completionist;  
* surface / dismissive;  
* confrontational;  
* exit.

These labels are not shown to the player.

## **13.5 Attend in exploration**

Exploration Attend can:

* identify ghost stability;  
* reveal attachment;  
* unlock dialogue;  
* expose a sensory profile;  
* identify a false Glass framing;  
* reveal a creature’s protected behavior;  
* grant a keyword or skill clue;  
* lower or raise emotional pressure;  
* create a durable fact;  
* close an interaction permanently.

## **13.6 Attend in combat**

Combat Attend:

* requires valid range, usually adjacency;  
* consumes the action or full turn allocation;  
* may be attempted only once per target identity unless explicitly reset;  
* exposes the player to tactical risk;  
* may reveal intent, senses, attachment, or a de-escalation path;  
* may pacify, convert, interrupt, or destabilize an authored target;  
* resumes combat on failure.

There is no universal “Attend then kill for both rewards” design. When Attend creates an understanding or nonhostile state, later violence is treated as violence against a nonhostile target.

## **13.7 Prior ghost Attend**

Attending a prior Intercessor ghost is a central recovery interaction.

It can determine:

* whether the ghost recognizes the new Intercessor;  
* which skills are transferable;  
* whether a memory is accurate;  
* whether the ghost needs Console or a housing;  
* whether it protects or obstructs the death bundle;  
* what the dead Intercessor understood at death.

## **13.8 Once-per-target memory**

Major Attend outcomes persist in save data. The player should not be able to repeatedly brute-force a ghost or named person until every branch is exhausted.

# ---

**14\. Emotional State, Yell, and Console**

## **14.1 Emotional axes**

Participating actors may carry five 0–100 axes:

* **Valence** — anguish to joy.  
* **Arousal** — numb to frantic.  
* **Grief** — unburdened to crushed.  
* **Reverence** — defiant to reverent.  
* **Attachment** — severed to bound.

Values decay toward authored baselines rather than a universal neutral midpoint.

## **14.2 Physical-emotional crosstalk**

Physical conditions can change emotion:

* injury raises fear or arousal;  
* darkness may calm one actor and terrify another;  
* heat and exposure increase agitation;  
* Glass pressure intensifies grief, reverence, or attachment according to local pattern;  
* isolation changes attachment behavior;  
* light may create relief, exposure, religious response, or aggression.

Emotion changes behavior:

* flee;  
* freeze;  
* guard an attachment;  
* attack;  
* assist;  
* submit;  
* search;  
* refuse dialogue;  
* seek light;  
* extinguish light.

## **14.3 Hidden exact values**

Exact emotional values are normally hidden. The HUD may show broad conditions. Attend, knowledge, or special skills reveal more precise readings.

## **14.4 Yell**

Yell:

* creates a strong sound stimulus;  
* raises local arousal;  
* reveals the player’s position;  
* may frighten, lure, interrupt, provoke, or rally;  
* can trigger faction or creature-specific reactions;  
* can be used intentionally as bait.

## **14.5 Console**

Console:

* targets an adjacent or reachable actor;  
* lowers grief and/or arousal where accepted;  
* may stabilize a ghost;  
* may prevent panic;  
* may permit dialogue or extraction;  
* can fail, be rejected, or be misapplied;  
* is not a guaranteed “good” action.

## **14.6 Emotional use in the jam**

The jam should use emotional state selectively for:

* cyber ghosts;  
* survivors;  
* key faction NPCs;  
* a small number of creature families;  
* plot encounters;  
* Yell/Console demonstrations.

Do not require every generic enemy to have authored emotional dialogue.

# ---

**15\. Chemistry and Environmental Simulation**

## **15.1 Core principle**

Chemistry is an active numeric fine-cell simulation, not a set of scripted floor flags.

The game should use chemistry to alter visibility, route safety, creature behavior, and tactical position.

## **15.2 Jam-critical materials and fields**

### **Fire**

Fire:

* creates light;  
* spreads through fuel and flammable materials;  
* damages actors and objects;  
* produces smoke;  
* changes creature behavior;  
* exposes the player;  
* may awaken Glass;  
* can destroy evidence or supplies;  
* leaves scorch.

### **Water**

Water:

* flows toward lower cells;  
* extinguishes fire and some lights;  
* conducts electricity;  
* creates splashing sound;  
* reveals movement;  
* changes traversal;  
* can carry contamination or Glass residue.

### **Smoke**

Smoke:

* blocks line of sight;  
* weakens illumination;  
* creates concealment;  
* spreads through openings;  
* may choke or apply status;  
* can hide both player and enemy intent.

### **Electricity**

Electricity:

* chains through wet cells;  
* can create brief light;  
* damages or stuns;  
* activates certain Glass or Grid structures;  
* changes safe routes;  
* can be used as a trap or accidental catastrophe.

### **Foam**

Foam:

* suppresses fire;  
* creates persistent temporary layers;  
* changes visibility and support;  
* blocks some emissions;  
* can create safe lanes or trap movement.

### **Freezing**

Freezing is supported by the engine and may be used if scope permits:

* creates ice;  
* changes friction and traversal;  
* can preserve or block routes;  
* interacts with water and fire.

## **15.3 Additional available chemistry**

Poison, gas, oil, acid/corrosion, heat conduction, wetness, and other reactions may appear where existing implementation is stable. They are not all required for the jam-critical path.

## **15.4 Chemistry and light**

Chemistry must be integrated into the central theme:

* fire reveals and exposes;  
* smoke creates artificial darkness;  
* water extinguishes routes;  
* electricity produces sudden visibility and danger;  
* foam controls fire at the cost of changed terrain;  
* Glass may glow under heat, charge, blood, ritual, or pressure.

## **15.5 Environmental encounter rules**

A generated environmental situation should provide:

* a readable cause;  
* at least one manipulable variable;  
* an alternate route or retreat;  
* feedback before irreversible failure;  
* compatibility with creature senses;  
* a reason not to use the obvious strongest reaction every time.

## **15.6 Persistent versus transient chemistry**

Ordinary tactical chemistry resets or reconciles between expeditions.

Authored major changes may persist:

* draining a reservoir;  
* repairing a permanent pump;  
* destroying a major conduit;  
* sealing a gas source;  
* activating a permanent light station;  
* freezing or collapsing a plot route.

# ---

**16\. Objects, Materials, and Global Verbs**

## **16.1 Contextual Act**

The Act command handles nearby:

* doors;  
* containers;  
* items;  
* NPCs;  
* ghosts;  
* Glass deposits;  
* lighting devices;  
* switches;  
* exits;  
* harvesting nodes;  
* plot objects.

Invalid actions return a denial reason and do not partially mutate state.

## **16.2 Global verbs**

The engine supports:

* Push;  
* Pull;  
* Throw;  
* Drop;  
* Stack;  
* Climb;  
* Burn;  
* Douse;  
* Freeze;  
* Break;  
* Wet;  
* Electrify;  
* Foam;  
* Yell;  
* Console.

The action bar should prioritize relevant verbs contextually rather than showing the entire catalog at once.

## **16.3 Typical fracture objects**

* crates;  
* expedition lanterns;  
* braziers;  
* Church lamps;  
* Glass candles;  
* doors and gates;  
* barricades;  
* supports;  
* valves;  
* pumps;  
* reflective or refractive panels;  
* fuel containers;  
* water vessels;  
* rope, ladders, and climbable structures;  
* broken counters and service windows;  
* ritual cabinets;  
* bells;  
* mirrors;  
* ghost housings;  
* harvesting tools;  
* survey equipment;  
* abandoned packs;  
* movable cover.

## **16.4 Material simulation**

Object and terrain material profiles may include:

* stone;  
* wood;  
* metal;  
* cloth;  
* Glass;  
* soil;  
* water-bearing surfaces;  
* fuel-bearing surfaces.

Material matters for:

* flammability;  
* hardness;  
* breakage;  
* sound;  
* weight;  
* manipulation;  
* wetness;  
* heat;  
* corrosion;  
* residue.

## **16.5 Object condition**

Objects may become:

* worn;  
* cracked;  
* damaged;  
* broken;  
* burned;  
* wet;  
* frozen;  
* stained;  
* contaminated;  
* rotten;  
* repaired;  
* reinforced;  
* unstable.

Use condition where it supports visible, tactical consequences. Avoid turning every prop into maintenance labor.

## **16.6 Manipulation purpose**

Physical verbs should primarily support:

* light placement;  
* alternate paths;  
* cover;  
* traps;  
* chokepoints;  
* access to height;  
* protection from fields;  
* creature lures;  
* Glass harvesting;  
* artifact recovery.

# ---

**17\. Glass**

## **17.1 Definition**

Glass is Grid-born crystal that stores emotional, cognitive, mnemonic, ritual, and witness-pattern.

It is useful, survivable under ordinary handling, economically central, and morally burdened.

## **17.2 Glass roles in this game**

Glass functions as:

* harvestable expedition value;  
* emergency light fuel;  
* light source;  
* visibility liability;  
* Grid pressure carrier;  
* story evidence;  
* ghost medium;  
* environmental hazard;  
* faction objective;  
* crafting or service resource;  
* collection context.

## **17.3 Deposit families**

Possible deposit categories:

* **Clear Glass** — low-information practical material.  
* **Witness Glass** — strong memory or testimony.  
* **Veined Glass** — mixed and contradictory pattern.  
* **Black Glass** — highly Grid-legible and dangerous.  
* **Event Glass** — formed around concentrated history.  
* **Rite Glass** — formed through deliberate use.  
* **Growth Glass** — accumulated through sustained pressure.

The player does not need full taxonomy immediately. Knowledge and tools can improve identification.

## **17.4 Harvesting**

Harvesting requires:

1. discovering or identifying a deposit;  
2. reaching it;  
3. having a valid tool or skill where required;  
4. spending energy/time;  
5. generating sound, light, residue, or pressure;  
6. receiving Glass items;  
7. accepting increased load and detectability.

## **17.5 Carried Glass exposure**

As carried Glass increases, it may:

* add emitted light;  
* intensify in existing light;  
* increase Grid feed or Glass pressure;  
* attract Glass-sensitive creatures;  
* create emotional impulses;  
* make ghosts more active;  
* occupy spatial inventory;  
* increase load penalties.

The exact curve must be clear enough for planning but not reduced to one unexplained punishment.

## **17.6 Emergency Glass light fuel**

## **Harvested common Glass can be sacrificed inside the fracture to power a compatible lamp, overcharge a beacon, or release a short emergency burst of illumination. This consumes the Glass or sharply reduces its extraction value.**

## **Ordinary fuel is predictable. Glass-fed light is stronger, stranger, and riskier. It may increase Grid pressure, attract Glass-sensitive creatures, reveal ghost traces, distort nearby witness-pattern, or alter emotional state.**

## **This creates a live expedition decision: burn the payload to see and survive, or preserve its value and continue through darkness.**

## **Expedition artifacts are never consumed by this rule unless a specific authored plot action explicitly permits it.**

## 

## **17.7 Return-trip inversion**

Entering the fracture should often be darker and more controlled than leaving.

Successful collection makes the Intercessor:

* heavier;  
* brighter;  
* more valuable;  
* more detectable;  
* less able to carry emergency tools.

The game’s tension should peak on return, not only at the deepest room.

## **17.8 Glass at the hub**

Glass may be:

* sold;  
* surrendered for contracts;  
* exchanged for supplies;  
* used to research skills;  
* fitted into light tools;  
* offered to a ghost shelter;  
* claimed by the Church;  
* hidden by Lanternless contacts;  
* retained for plot decisions.

The same piece may have different values to different factions.

# ---

**18\. Expedition Artifact Collection**

## **18.1 Collection purpose**

Expedition artifacts are the fixed collectathon set and the main narrative reconstruction system.

The player should be able to view:

* total known artifacts;  
* recovered artifacts;  
* artifacts currently carried;  
* artifacts in a death bundle;  
* artifacts returned to origin;  
* unknown slots where appropriate;  
* associated expedition member;  
* related testimony and unlocked effects.

## **18.2 Artifact categories**

### **Route artifacts**

* survey markers;  
* lamps;  
* keys;  
* lift controls;  
* map plates;  
* safety rope hardware;  
* route bells;  
* containment seals.

### **Personal artifacts**

* performer tools;  
* family objects;  
* letters;  
* clothing details;  
* tokens;  
* private Glass comfort;  
* religious objects.

### **Institutional artifacts**

* Church seals;  
* Crown permits;  
* expedition charter;  
* inspection tools;  
* legal witness objects;  
* faction insignia.

### **Evidence artifacts**

* journals;  
* witness Glass;  
* damaged reports;  
* recordings in magical or Glass form;  
* contradictory route maps;  
* creature samples;  
* broken devices.

### **Operational artifacts**

* lighting components;  
* harvest tools;  
* medical equipment;  
* Glass stabilizers;  
* shelter parts;  
* emergency signals.

## **18.3 Stable origin**

Every expedition artifact has a stable original placement or origin node generated and saved at campaign creation.

The origin may be:

* a room placement;  
* a container;  
* a named NPC;  
* a ghost;  
* a creature encounter;  
* a fixed event reward;  
* a landmark puzzle.

The origin is used if the artifact must return after a failed recovery attempt.

## **18.4 Artifact state machine**

Primary states:

`AtOrigin`  
`Carried`  
`InDeathBundle`  
`RecoveredToHub`

Optional authored states:

`HeldByNPC`  
`InstalledInWorld`  
`Contested`  
`Transformed`  
`DestroyedButWitnessRecovered`

Core transitions:

`AtOrigin -> Carried`  
`Carried -> RecoveredToHub on successful extraction/turn-in`  
`Carried -> InDeathBundle on Intercessor death`  
`InDeathBundle -> Carried when reclaimed`  
`InDeathBundle -> AtOrigin when the next Intercessor dies before reclaiming it`

## **18.5 One-recovery rule**

An artifact receives one corpse-recovery opportunity after death.

If the next Intercessor dies before reclaiming the prior bundle:

* the prior ghost remains;  
* the new ghost is created;  
* the prior bundle’s expedition artifacts return to their original positions;  
* the artifacts do not move into the new death bundle;  
* ordinary nonartifact bundle behavior follows its separate rule.

## **18.6 Successful recovery resets the chain**

If the next Intercessor reclaims an artifact from the prior death bundle, it becomes normally carried again.

If that Intercessor later dies while carrying it, the artifact enters the new death bundle and receives a new one-recovery opportunity.

This preserves the value of a successful corpse run.

## **18.7 Artifact narrative unlocks**

Recovering an artifact can:

* add a document;  
* unlock dialogue;  
* identify an expedition member;  
* reveal a route;  
* change faction reputation;  
* unlock a hub display;  
* enable a skill;  
* change a ghost’s state;  
* expose a contradiction;  
* open a culmination gate.

## **18.8 One-run collection**

Artifact placement and gating must permit all artifacts to be collected in one expedition after sufficient mastery.

Do not require mutually exclusive collection choices for the base full-set achievement unless the game explicitly records alternate sets.

# ---

**19\. Intercessor Succession**

## **19.1 The player role**

The player controls an Intercessor, but not the same person forever.

Intercession is a field role: accountable action under incomplete truth where ordinary jurisdictions or officers cannot safely act.

Successive Intercessors may come from different classes or training backgrounds.

## **19.2 Procedural names**

Each Intercessor receives a name assembled from curated Alderamontican syllables.

Name generation requirements:

* pronounceable;  
* compatible with setting tone;  
* varied without becoming joke-noise;  
* deterministic if tied to save seed and succession index;  
* capable of avoiding banned or accidental offensive strings;  
* able to include manually authored names for plot characters without collision.

Recommended structure:

* 2–4 syllable given name;  
* optional family or road name if scope permits;  
* stable unique ID separate from display name.

## **19.3 Lightweight identity**

A new Intercessor may receive:

* generated name;  
* portrait/sprite variation;  
* origin tag;  
* training background;  
* one starting skill bias;  
* one emotional baseline variation;  
* one small inventory difference.

Do not generate extensive biographies that the game cannot express.

## **19.4 Shared inheritance**

Every new Intercessor inherits:

* persistent map;  
* permanent shortcuts;  
* recovered artifact collection;  
* communal creature knowledge;  
* hub state;  
* available skill archive;  
* faction state;  
* case documents;  
* known ghost locations.

They do not automatically inherit:

* the prior Intercessor’s carried inventory;  
* their exact personal emotional state;  
* all ghost-specific skills before recovery;  
* temporary expedition effects.

## **19.5 Intercessor record**

The hub should maintain an archive of every player Intercessor:

* name;  
* succession number;  
* start and death/extraction status;  
* deepest location reached;  
* artifacts recovered;  
* cause of death;  
* skills learned;  
* ghost location;  
* notable case facts;  
* optional final line or bark.

The archive turns procedural characters into campaign history.

## **19.6 Surviving Intercessors**

An Intercessor who extracts remains alive in the record.

The next expedition may use:

* the same survivor again;  
* a new Intercessor by player choice;  
* a plot-required change;  
* retirement or injury rules.

For the jam, the simplest rule is:

A surviving Intercessor remains the active character until death or an authored transition.

This preserves attachment while retaining succession.

# ---

**20\. Cyber Ghosts and Death**

## **20.1 Death result**

When an Intercessor dies inside the fracture:

1. resolve final combat and facts;  
2. create a persistent ghost record;  
3. place or bind the ghost at the death location or a nearby valid housing;  
4. create the death bundle;  
5. move carried expedition artifacts into that bundle;  
6. end the active expedition;  
7. clear transient tactical state as defined;  
8. return to the hub;  
9. create or select the next Intercessor;  
10. add a recovery objective and map marker where knowledge permits.

## **20.2 Ghost persistence**

Ghosts never disappear merely because:

* another Intercessor dies;  
* artifacts return to origin;  
* the bundle is recovered;  
* the campaign advances.

A ghost may change state through authored interaction, housing, rescue, corruption, or final plot consequence, but persistence is the default.

## **20.3 Ghost identity**

A player ghost retains:

* Intercessor ID and name;  
* appearance reference;  
* location;  
* death cause;  
* succession index;  
* learned skills;  
* emotional snapshot;  
* one or more remembered facts;  
* available dialogue/barks;  
* stability;  
* housing if any;  
* whether skills have been inherited;  
* whether Console or Attend outcomes occurred.

## **20.4 Ghost behavior states**

Possible states:

* coherent;  
* confused;  
* repeating;  
* defensive;  
* hostile;  
* attached to bundle;  
* attached to location;  
* attached to a person;  
* seeking housing;  
* stabilized;  
* sheltered;  
* silent;  
* corrupted by false Glass framing.

## **20.5 Deterministic signature skill transfer**

## **Reaching a prior Intercessor ghost reveals that ghost’s signature transferable skill.**

## **The signature skill is not gated by a random roll, an arbitrary false reading, or repeated dialogue exhaustion. Once the player reaches and completes the ghost interaction, the skill transfers permanently to the campaign archive.**

## **Attend and Console remain meaningful. They may:**

## **recover additional memories;**

## **stabilize the ghost;**

## **change its relationship to the current Intercessor;**

## **reveal optional skills, facts, or routes;**

## **make the interaction safer;**

## **help move or house the ghost;**

## **resolve an attachment.**

## **A degraded ghost reading may leave context incomplete, but it cannot permanently conceal or delete the signature progression reward.**

## **The transfer occurs once. The ghost remains in the fracture afterward and may continue to speak, repeat, change state, or require care.**

## 

## **20.6 Death bundle contents**

Guaranteed:

* carried expedition artifacts;  
* a reference to the dead Intercessor;  
* possibly one signature personal item.

Tunable:

* ordinary equipment;  
* consumables;  
* common Glass;  
* currency;  
* light tools.

Jam recommendation:

* artifacts follow the locked one-recovery rule;  
* a limited subset of ordinary gear remains recoverable;  
* common Glass and consumables are lost or partly lost to keep the economy moving;  
* the ghost’s skill is always recoverable regardless of bundle state.

## **20.7 Multiple ghosts**

The dungeon can accumulate many prior player ghosts.

Requirements:

* performance-safe representation;  
* archive UI;  
* distinctive names;  
* no duplicate entity IDs;  
* no blocking critical corridors;  
* optional clustering or housing if many deaths occur in one cell;  
* ghost barks that do not overwhelm audio or UI.

## **20.8 Death is not permadeath for the campaign**

The individual Intercessor dies. The campaign continues.

The emotional consequence is not that death is meaningless. It is that death creates another obligation, another person, and another place the community must remember.

# ---

**21\. Skills and Progression**

## **21.1 Progression philosophy**

Progression should change how the player reads and manipulates the fracture.

Raw stat growth may exist but should not dominate.

Primary progression sources:

* prior ghosts;  
* expedition artifacts;  
* faction training;  
* creature study;  
* landmark discovery;  
* Glass research;  
* contracts;  
* survivor instruction;  
* ordinary experience.

## **21.2 Persistent and active skills**

The campaign may unlock many skills, but each Intercessor equips or prepares a limited active set.

This creates meaningful preparation without deleting permanent learning.

## **21.3 Skill families**

### **Lightcraft**

* longer fuel duration;  
* adjustable radius;  
* dim mode;  
* directional lamps;  
* quieter placement;  
* better thrown light;  
* light recovery;  
* reduced heat;  
* special Glass illumination.

### **Dark movement**

* lower movement sound;  
* near-field obstacle sense;  
* better remembered geometry;  
* reduced stumble/collision;  
* temporary silhouette memory;  
* stealth movement through dim cells;  
* improved last-known-position evasion.

### **Fracture survival**

* identify hazards;  
* harvest faster;  
* resist Grid pressure;  
* carry Glass with less glow;  
* recognize landmarks;  
* detect unstable rooms;  
* improve extraction efficiency;  
* reveal ghost traces.

### **Combat**

* overwatch;  
* shove;  
* guarded movement;  
* status attacks;  
* light-conditioned attacks;  
* dark-conditioned attacks;  
* opportunity control;  
* forced movement resistance;  
* cover use.

### **Ghost knowledge**

* Ghost Speech;  
* stabilize transfer;  
* read death traces;  
* identify housing;  
* distinguish repetition from intention;  
* carry more ghost-derived skills;  
* invoke prior Intercessor memory.

### **Intercession**

* better de-escalation;  
* safer Attend;  
* improved Console;  
* faction authority;  
* rescue actions;  
* extraction under pressure;  
* protection of noncombatants.

## **21.4 Example skills**

* **Darkstep** — movement in full darkness emits less sound.  
* **Lampwright** — placed lights last longer and can use dim mode.  
* **Silhouette** — an illuminated target remains briefly outlined after leaving sight.  
* **Echo Reading** — sound indicators provide improved direction and category.  
* **Glass Quieting** — carried Glass emits less light and pressure.  
* **Last Sight** — exact visible geometry remains reliable for several turns after darkness.  
* **Ghost Speech** — permits dialogue with more degraded ghosts.  
* **Wick Throw** — increases thrown-light range and accuracy.  
* **Black Adaptation** — grants limited adjacent-cell perception after waiting in darkness.  
* **Surveyor’s Mark** — permanently recognizes landmark approach patterns.  
* **Still Hand** — harvesting creates less sound.  
* **Cold Lamp** — light produces less heat and fire risk.  
* **Borrowed Watch** — once per expedition, receive a warning from an inherited ghost skill.  
* **Interpose** — protect an adjacent nonhostile actor from an attack.  
* **Quiet Console** — Console creates less sound and exposure.

## **21.5 XP and levels**

The engine supports XP and level choices.

For this game:

* XP may improve baseline survivability;  
* artifact and ghost skills provide the distinctive progression;  
* kills should not be the only or best XP source;  
* exploration, rescue, study, extraction, and contracts may grant XP;  
* level choices should remain modest compared with knowledge and skills.

## **21.6 Creature knowledge**

Knowledge entries may unlock:

* precise sound labels;  
* sense type;  
* light preference;  
* resistances;  
* likely intent;  
* known territory;  
* Attend availability;  
* harvesting or avoidance techniques;  
* map warnings.

# ---

**22\. Inventory, Loadout, and Economy**

## **22.1 Spatial inventory**

Use the existing 8×6 inventory grid.

Items may define:

* shape;  
* rotation;  
* weight;  
* bulk;  
* stack behavior;  
* maximum stack;  
* use effect;  
* light emission;  
* Glass pressure;  
* artifact status.

## **22.2 Preparation tradeoffs**

The player chooses between:

* light fuel and Glass capacity;  
* healing and utility;  
* heavy weapon and mobility;  
* smoke/foam tools and ordinary supplies;  
* spare lamps and extraction value;  
* carrying an artifact and retaining emergency options.

## **22.3 Simplified equipment**

The engine lacks a complete player-facing equipment loop.

Jam rule:

* one active weapon;  
* one active utility or light tool;  
* prepared skills;  
* inventory consumables and objects;  
* optional passive armor/stat item without a full paper-doll interface.

Do not block production on a universal equipment system.

## **22.4 Light resources**

Potential items:

* hand lantern;  
* oil lamp;  
* throwing flare;  
* Glass candle;  
* fuel flask;  
* wick bundle;  
* cold-light Glass fitting;  
* smoke vessel;  
* foam canister or magical equivalent;  
* emergency Church beacon;  
* Lanternless hood or shutter.

## **22.5 Shops and faction services**

Hub commerce may include:

* Church supply counter;  
* prospector salvage trade;  
* Glass buyer;  
* Lanternless illicit tools;  
* ghost shelter services;  
* skill training;  
* repair and refill;  
* contract rewards.

Faction and story state can alter:

* stock;  
* prices;  
* access;  
* item legality;  
* information offered;  
* artifact claims.

## **22.6 Economy scope**

The game should not become a deep market simulator.

Economy exists to support:

* expedition preparation;  
* meaningful Glass value;  
* faction choices;  
* recovery pressure;  
* gradual access to light tools and utilities.

# ---

**23\. Hub**

## **23.1 Hub purpose**

The hub is the persistent human face of the campaign.

It should be small, dense, and revisited often.

## **23.2 Required spaces**

* fracture entrance;  
* Church checkpoint or safety office;  
* Intercessor desk / case archive;  
* supply counter;  
* Glass buyer or assay station;  
* prospector camp;  
* Lanternless contact;  
* ghost memorial or shelter access;  
* artifact display/recovery archive;  
* skill preparation interface;  
* contract board;  
* rest/save point.

## **23.3 Hub functions**

At the hub the player:

* creates or meets the current Intercessor;  
* reviews the map;  
* selects skills;  
* prepares inventory;  
* accepts contracts;  
* turns in artifacts and Glass;  
* speaks to factions;  
* reads recovered documents;  
* reviews prior Intercessors;  
* encounters rescued people or stabilized ghosts;  
* sees consequences.

## **23.4 Hub transformation**

The hub may change through:

* recovered artifacts placed on display;  
* memorial additions;  
* new ghosts or housings;  
* faction banners or guards;  
* unlocked shops;  
* rescued expedition members;  
* repaired light infrastructure;  
* arguments about what should be reported;  
* altered entrance lighting;  
* plot escalation.

## **23.5 Surface light contrast**

The hub should use warm, controlled, useful Glass light.

Its brightness should often feel safe and humane, not automatically false. The fracture’s darkness becomes meaningful because the player understands why people build lighted public spaces.

# ---

**24\. Factions and Fracture Society**

## **24.1 Church safety presence**

The Church may control, monitor, or license the entrance for public safety.

Strengths:

* supplies;  
* trained personnel;  
* healing;  
* route lights;  
* public accountability;  
* organized rescue;  
* known procedures.

Failures:

* containment over personhood;  
* reporting hidden people;  
* claiming Glass;  
* confusing illumination with rescue;  
* extending emergency authority.

Gameplay identity:

* reliable bright zones;  
* regulated equipment;  
* contracts;  
* healing;  
* visible routes;  
* less stealth;  
* procedural obligations.

## **24.2 Lanternless**

The Lanternless make places difficult for the Grid to index.

Methods:

* breaking Glass nodes;  
* collapsing routes;  
* interrupting repeated ritual;  
* hiding strong patterns;  
* cultivating blind places;  
* dismantling fixed signs;  
* using fragments and contradictions.

Strengths:

* concealment;  
* refuge;  
* stealth knowledge;  
* protection from capture;  
* hidden shortcuts.

Failures:

* dangerous sabotage;  
* route collapse;  
* rejection of systems people need;  
* secrecy that prevents rescue or accountability.

Gameplay identity:

* dark shelters;  
* extinguished routes;  
* light-shuttering tools;  
* Glass quieting;  
* hostility to mapping or reporting;  
* optional sabotage contracts.

## **24.3 Prospectors and scavengers**

Prospectors are practical workers, not one doctrine.

They:

* harvest Glass;  
* salvage gear;  
* map temporary routes;  
* recover bodies;  
* trade;  
* compete for claims;  
* make a living from danger.

Gameplay identity:

* merchants;  
* camps;  
* rival collection;  
* route rumors;  
* salvage rights;  
* corpse movement;  
* practical skills;  
* morally mixed choices.

## **24.4 Ghost Shelters**

Ghost Shelters are rare communities devoted to cyber ghosts and other Grid-disembodied persons.

They reject the belief that mute containment ends responsibility.

Gameplay identity:

* low-light sanctuaries;  
* housings;  
* interpreters;  
* ghost rescue;  
* skill transfer;  
* Console and Attend support;  
* conflict with containment policy.

## **24.5 The Uncounted**

The Uncounted treat legibility as vulnerability.

They complicate:

* names;  
* records;  
* addresses;  
* lineage;  
* routes;  
* Glass signatures.

Gameplay identity may include:

* hidden caches;  
* false or absent map labels;  
* erased expedition records;  
* protection from tracking;  
* difficult accountability;  
* clues that exist only outside official archives.

## **24.6 Old residents and vampire history**

Some spaces predate the Grid and were used by vampires surviving underground before modern House organization.

Possible residents:

* descendants;  
* transformed survivors;  
* territorial vampires;  
* old service communities;  
* blood-work remnants;  
* people who adapted to the fracture rather than entering as crawlers.

They should not be reduced to monsters or automatic exposition.

## **24.7 Faction relations**

Faction state should affect:

* dialogue;  
* warnings;  
* prices;  
* access;  
* patrols;  
* shelter safety;  
* contract availability;  
* artifact claims;  
* whether language precedes violence;  
* who helps recover a ghost.

## **24.8 Language before violence**

Hostile or strained factions should usually escalate through:

1. wary behavior;  
2. bark or warning;  
3. confrontation;  
4. player response;  
5. combat readiness;  
6. violence.

Immediate attacks remain appropriate for ambush, open war, monsters, or authored crisis.

# ---

**25\. NPCs, Dialogue, Documents, and Barks**

## **25.1 Named people**

Every major and secondary NPC is named.

Generic procedural creatures need not be named. Generated Intercessors and persistent ghosts are named by definition.

## **25.2 Ordinary dialogue**

Dialogue supports:

* branching options;  
* conditions;  
* hidden options;  
* item, money, quest, switch, faction, party, and skill effects;  
* cutscene launches;  
* portraits and scene images;  
* party conversations;  
* Attend content.

## **25.3 Dialogue tone**

People should speak from:

* work;  
* fatigue;  
* obligation;  
* fear;  
* appetite;  
* faith;  
* practical knowledge;  
* personal history.

Avoid turning each faction member into a doctrine lecture.

## **25.4 Expedition testimony**

Recovered testimony should disagree for understandable reasons:

* different positions;  
* incomplete sight;  
* darkness;  
* faction loyalty;  
* ghost degradation;  
* Glass falsehood;  
* shame;  
* self-protection;  
* changed interpretation.

Contradiction should invite judgment, not imply every account is equally false.

## **25.5 Documents**

Documents may include:

* expedition roster;  
* route notes;  
* safety procedures;  
* personal letters;  
* Church reports;  
* prospector claims;  
* Lanternless fragments;  
* ghost shelter records;  
* Glass assay notes;  
* creature observations;  
* prior Intercessor case notes;  
* maps.

## **25.6 Barks**

Barks provide:

* ambient work;  
* warnings;  
* faction tension;  
* creature audio identity;  
* ghost repetition;  
* response to light;  
* response to player Glass load;  
* memory of prior actions.

Barks must respect earshot, cooldown, speaker validity, and darkness context.

## **25.7 Keyword conversations**

The engine’s current dialogue graph is the stable jam foundation.

A deeper keyword conversation layer may later allow learned names, creature terms, artifacts, and places to unlock questions. For the jam, simulate this through conditions and discovered-topic flags rather than building an entirely new conversation architecture unless already implemented.

# ---

**26\. Contracts, Quests, and Objectives**

## **26.1 Contract role**

Contracts give expeditions direction without forcing one route.

They should create reasons to revisit known spaces under different loadouts and faction pressures.

## **26.2 Objective types**

Use existing:

* talk;  
* kill;  
* collect;  
* explore;  
* interact;  
* custom.

## **26.3 Contract examples**

* recover a named expedition artifact;  
* find a missing expedition member;  
* stabilize or house a ghost;  
* reach a landmark;  
* repair or extinguish a light station;  
* harvest a Glass quota;  
* identify a creature’s sense profile;  
* recover a body or personal object;  
* escort a survivor to extraction;  
* deliver supplies to a shelter;  
* document a route;  
* erase a route record;  
* retrieve a Church instrument;  
* recover a prospector claim marker;  
* bring back witness Glass;  
* survive to a target depth.

## **26.4 Main case and side contracts**

The missing expedition is the main case.

Side contracts should:

* reveal fracture society;  
* teach systems;  
* alter routes;  
* create faction relationships;  
* introduce artifacts or ghosts;  
* remain short enough for repeated expeditions.

## **26.5 Journal**

The journal combines:

* active contracts;  
* main case progression;  
* artifact collection;  
* expedition roster;  
* ghost archive;  
* creature knowledge;  
* documents;  
* map notes;  
* prior Intercessor records.

The journal should not lie by default in this game. Faction-authored entries may be biased and clearly attributed.

# ---

**27\. Creature Ecology**

## **27.1 Design rule**

Creatures are not random combat tokens.

Each family needs:

* body concept;  
* movement profile;  
* senses;  
* light behavior;  
* sound identity;  
* environmental relationship;  
* combat role;  
* noncombat behavior;  
* known or discoverable history;  
* reason to occupy its region.

## **27.2 Visual rule**

Surreal demons should use impossible anatomy rather than generic horns and red skin.

Examples:

* a giant screaming face floating where legs should be, with multiple arms forming its upper body;  
* a walking service window whose interior is a mouth;  
* a many-handed light gatherer carrying extinguished lamps inside its ribs;  
* a creature whose shadow moves ahead and whose body follows later;  
* a bell-bodied hunter that sees through vibration;  
* a soft animal shape made dangerous by Glass witness rather than gore.

## **27.3 Jam creature roles**

Recommended four to six families:

1. **Sighted guarder** — teaches reciprocal darkness.  
2. **Light-hunter** — makes placed light dangerous and useful as bait.  
3. **Sound-hunter** — prevents darkness from solving everything.  
4. **Glass-sensitive scavenger** — creates return-trip pressure.  
5. **Ghostly or emotional creature** — uses Attend, Console, or darkness conditions.  
6. **Major surreal demon** — culmination or landmark threat.

## **27.4 Neutral and nonhostile behavior**

Some creatures should:

* herd;  
* guard;  
* feed;  
* sleep;  
* avoid light;  
* collect lamps;  
* defend Glass;  
* react to sound without hostility;  
* become dangerous only under pressure.

## **27.5 Knowledge rewards**

Studying, attending, surviving, or defeating creatures can reveal:

* sense profile;  
* alert behavior;  
* preferred light;  
* weakness;  
* territory;  
* sound vocabulary;  
* Glass relation;  
* faction use or belief;  
* ghost interaction.

# ---

**28\. Extraction, Success, and Failure**

## **28.1 Extraction**

Extraction ends the active expedition and secures carried eligible state.

Extraction may occur through:

* the main entrance;  
* repaired lifts;  
* Church stations;  
* faction routes;  
* one-use emergency beacons;  
* plot-specific exits.

## **28.2 Secured on extraction**

Normally secured:

* expedition artifacts;  
* eligible Glass;  
* documents;  
* rescued NPCs;  
* discovered facts;  
* skills learned in ways marked permanent;  
* contracts;  
* map updates;  
* faction consequences.

## **28.3 Voluntary retreat**

Retreat is valid play.

The player should regularly choose to leave with partial success rather than be pushed toward death by a heroic completion expectation.

## **28.4 Death**

Death:

* ends the expedition;  
* creates a ghost;  
* creates a recovery obligation;  
* risks artifact return to origin on a second failed attempt;  
* preserves major campaign knowledge;  
* advances succession.

## **28.5 Campaign completion**

Campaign completion requires a plot-defined combination of:

* expedition recovery;  
* artifact set or critical subset;  
* deepest access;  
* faction/ghost state;  
* final decision.

Full collection and campaign completion may overlap but should not be identical unless plot supports it.

## **28.6 One-run mastery recognition**

The game should record:

* campaign completed with zero deaths;  
* all artifacts recovered in one expedition;  
* all prior artifact bundles recovered;  
* minimum-light completion;  
* maximum-darkness or stealth feats;  
* faction-specific challenge outcomes.

These are optional recognition, not required morality rankings.

# ---

**29\. Difficulty and Balance**

## **29.1 Sources of difficulty**

Difficulty comes from:

* incomplete information;  
* limited light;  
* noise;  
* creature senses;  
* environmental interaction;  
* carrying capacity;  
* return-trip exposure;  
* route choice;  
* combat positioning;  
* death-bundle recovery;  
* collection planning;  
* faction constraints.

## **29.2 Avoided difficulty**

Avoid relying primarily on:

* inflated enemy HP;  
* invisible instant kills;  
* random unavoidable damage;  
* excessive hunger/thirst drain;  
* huge corpse-run distance without shortcut opportunity;  
* artifacts permanently deleted by failure;  
* procedurally impossible layouts;  
* required knowledge that was never telegraphed.

## **29.3 Adaptive mastery**

The fixed dungeon naturally becomes easier as the player learns it.

The game should allow that mastery rather than continuously scaling every enemy to erase progress.

New challenge comes from:

* deeper routes;  
* artifact burden;  
* changed faction states;  
* ghosts;  
* ecology migration;  
* optional high-risk objectives;  
* self-imposed one-run collection.

## **29.4 Accessibility options**

Consider:

* stronger sound-direction indicators;  
* higher contrast fog boundaries;  
* adjustable darkness floor for display without changing mechanical light;  
* reduced flashing and chromatic effects;  
* text descriptions of detection cause;  
* slower tactical presentation;  
* larger UI;  
* color-independent light state symbols;  
* optional seed reroll before first entry;  
* recovery assist that marks ghost route more clearly.

# ---

**30\. User Interface and Player Feedback**

## **30.1 HUD**

Display:

* HP and relevant resources;  
* current Intercessor name;  
* active light type;  
* fuel/duration;  
* illumination band;  
* visual exposure state;  
* strongest alert source;  
* detection mode: seen, heard, Glass-sensed, heat-sensed, trace-sensed, last-known;  
* carried Glass and pressure;  
* inventory load;  
* current depth/landmark;  
* active objective;  
* status effects;  
* extraction availability;  
* death-bundle objective where relevant.

## **30.2 Map**

The map shows:

* persistent discovered geometry;  
* landmarks;  
* shortcuts;  
* extraction routes;  
* artifact origin only when learned;  
* prior ghost locations;  
* current death bundle;  
* faction shelters where known;  
* stale-state distinction;  
* current visible area.

It does not show current enemies outside perception.

## **30.3 Collection interface**

The collection view shows:

* artifact silhouette or icon;  
* recovered state;  
* associated expedition member;  
* narrative notes;  
* current state if lost/in bundle/at origin where appropriate;  
* hub display location;  
* effects or unlocked dialogue.

## **30.4 Ghost archive**

The archive shows:

* all player Intercessors;  
* living, retired, dead, sheltered, or unresolved status;  
* ghost location;  
* inherited skill;  
* cause of death;  
* notable recovery facts;  
* optional portrait.

## **30.5 Action bar**

Prioritize by context:

* Act;  
* light toggle;  
* place/drop light;  
* throw light;  
* Wait/Listen;  
* active weapon;  
* active skill;  
* Attend;  
* relevant global verb;  
* extraction.

## **30.6 Detection explanation**

When detected, the game must explain why:

* “Seen in full light.”  
* “Heard: broken glass.”  
* “Carried Glass answered.”  
* “Heat detected through smoke.”  
* “The creature searched your last-known position.”  
* “You crossed its marked floor.”

This feedback is essential for trust in systemic stealth.

# ---

**31\. Art Direction**

## **31.1 Governing look**

A stylish black-based retro-futuristic 1950s painted fantasy.

Core qualities:

* high black point;  
* painterly surfaces;  
* strong silhouettes;  
* deep negative space;  
* warm controlled pools of light;  
* brass, stone, plaster, terrazzo, timber, slate, tile, and Glass;  
* streamlined commercial and civic forms layered onto old fantasy architecture;  
* restrained cream, turquoise, teal, mustard, coral, oxidized copper, red, violet, cyan, and magenta;  
* no actual electronics or modern machinery unless explicitly magical/Glass-based.

## **31.2 3D materials**

World textures are flat, seamless, top-down or orthographic material swatches suitable for 3D meshes.

General material library:

* dark stone floor;  
* polished civic stone;  
* cracked plaster;  
* painted plaster;  
* terrazzo;  
* brick;  
* limestone block;  
* dark timber;  
* warm planks;  
* brass and oxidized metal;  
* slate roof;  
* aged tiles;  
* cavern soil;  
* wet stone;  
* stained ritual floor;  
* Glass-inlaid surfaces.

Textures should share brush language and avoid baked directional lighting that conflicts with dynamic lights.

## **31.3 Hub visual identity**

The hub is:

* maintained but tired;  
* lit by useful Glass;  
* retro-civic;  
* partly temporary around an old fracture entrance;  
* populated by counters, signs, bunks, crates, records, lamps, and memorials.

## **31.4 Fracture visual identity**

The fracture combines:

* caves;  
* old architecture;  
* service spaces;  
* shrines;  
* vampire remnants;  
* expedition infrastructure;  
* Glass overgrowth;  
* impossible spatial relationships;  
* intense darkness;  
* selective luminous color.

Avoid a uniform industrial sci-fi dungeon.

## **31.5 Creature art**

Creature forms should be:

* silhouette-readable;  
* anatomically wrong in specific ways;  
* painterly rather than hyperreal;  
* tied to senses and behavior;  
* legible enough for tactical play;  
* capable of looking frightening without visual noise everywhere.

## **31.6 Ghost art**

Cyber ghosts may appear:

* tiled;  
* repeated;  
* interrupted;  
* paneled;  
* missing between movements;  
* reflected in Glass;  
* bound to objects;  
* luminous without looking electronic.

Player ghosts should retain recognizable features from their living Intercessor.

# ---

**32\. Audio and Music**

## **32.1 Audio as information**

Audio is not only atmosphere. It is a core perception channel.

Required categories:

* footsteps by surface;  
* splash and fluid movement;  
* doors and object manipulation;  
* light ignition, hum, crackle, and extinction;  
* Glass resonance;  
* creature movement and calls;  
* directional scraping;  
* harvesting;  
* fire;  
* smoke/breathing;  
* electricity;  
* faction work;  
* ghost speech;  
* alarms;  
* extraction signals.

## **32.2 Directionality**

Sound must communicate approximate direction and intensity reliably enough to support dark navigation.

Use visual accessibility indicators as support, not replacement.

## **32.3 Music identity**

Alderamontico music may combine:

* 1950s American jazz and chamber lounge language;  
* muted trumpet;  
* vibraphone;  
* celesta;  
* layered piano chords;  
* warm melodic bass;  
* brushed or dry snare;  
* restrained jungle syncopation;  
* liquid acid filtering;  
* tape saturation;  
* crystal resonance;  
* warped strings;  
* deep doom weight in severe spaces.

## **32.4 Hub music**

Hub music should be:

* human;  
* melodic;  
* tired but welcoming;  
* rhythmically stable;  
* capable of changing as ghosts and artifacts accumulate.

## **32.5 Fracture music**

Fracture music should leave room for tactical listening.

Use:

* sparse motifs;  
* low drones;  
* filtered jazz fragments;  
* broken lounge loops;  
* rhythmic absence;  
* local musical identities for landmarks;  
* combat escalation that does not drown out sound cues.

## **32.6 Darkness**

Complete darkness may reduce music density so the player hears:

* movement;  
* breath;  
* Glass;  
* distant work;  
* water;  
* ghosts.

# ---

**33\. Engine Mapping**

The engine baseline comes from the current 3D Engine Systems Reference. Status below refers to game-specific use, not universal engine completeness.

| Game feature | Engine system | Status / work   |
| :---- | :---- | :---- |
| 3D isometric exploration | GameRenderer3D, camera modes | Active; author content |
| Map editor in 3D | MapEditor \+ renderer | Active |
| Macro-to-fine grid | fineWorld, coordinate helpers | Active |
| Persistent fixed fracture maps | Package maps \+ saves \+ deltas | Active foundation; generator must bake safely |
| Procedural dungeon generation | Studio author-time dungeon generator | Build |
| Committed campaign layout provenance | Package/save metadata | Build/wire |
| Fog of war | WorldOverlays3D, fog utilities | Active; adapt to persistent communal mapping |
| Unified cell light authority | Lighting \+ perception \+ fog | Build/integrate; highest-priority game adaptation |
| Carried/placed/thrown lights | Items, objects, fields, renderer | Wire/build |
| Smoke obscuration | Chemistry \+ perception | Active/core; tune presentation |
| Sound stealth | Perception \+ sound stimuli | Active/core; improve player feedback |
| Alert states | Perception/behavior arbiter | Active |
| Last-known position | Perception/AI facts | Strengthen and expose |
| Hybrid tactical combat | Combat session/runtime | Active |
| Cover/facing/height | Tactical calculations | Active |
| Forced movement/overwatch | Combat runtime | Active |
| Status effects | Runtime statuses | Active |
| Attend | Alderamontico state \+ dialogue | Active/core; author target rules and ghost flow |
| Yell/Console | Alderamontico verbs | Active |
| Emotional axes | alderamonticoState | Active/core |
| Chemistry | chemistryRuntime | Active |
| Push/Pull/Throw/etc. | Global verbs/object simulation | Active/core; contextualize |
| Glass harvesting | Act/process/item/Glass state | Build/wire |
| Glass glow and pressure | Alderamontico state \+ lights | Build/wire |
| Spatial inventory | Inventory UI/runtime | Active |
| Simplified loadout | Skills/items | Wire; avoid full equipment dependency |
| Expedition artifacts | Item/object/quest/save | Build |
| Artifact original positions | Generator/save data | Build |
| Artifact death bundle | Death/save/artifact state | Build |
| Artifact return-to-origin rule | Death pipeline | Build |
| Intercessor name generation | New campaign system | Build |
| Intercessor archive | Save/journal UI | Build |
| Persistent player ghosts | Entity/save/dialogue/facts | Build |
| Ghost skill inheritance | Skills \+ ghost interaction | Build |
| Hub | Authored map/story systems | Author |
| Factions/reputation | Existing faction state | Active; author |
| Dialogue | Dialogue graph/runtime | Active |
| Documents/journal | Existing story UI | Active; extend collection/archive |
| Barks | Existing bark system | Active |
| Contracts/quests | Existing quest objectives | Active; author |
| Shops | Existing shops | Active |
| Extraction | Map exits/events/save | Wire |
| Music and sound | Registries/cutscenes/runtime | Active; author |
| Generation validation | Audits/tests | Build |

# ---

**34\. Game-Specific Data Contract**

## **34.1 Campaign fracture record**

Recommended fields:

`fracture_campaign:`  
  `recipe_id`  
  `seed`  
  `generator_version`  
  `canonical_hash`  
  `generated_map_ids[]`  
  `entrance_map_id`  
  `culmination_map_id`  
  `created_at`  
  `validation_report_id`

## **34.2 Intercessor record**

`intercessor:`  
  `id`  
  `display_name`  
  `syllable_seed`  
  `succession_index`  
  `portrait_or_sprite_id`  
  `origin_tag`  
  `class_or_training_tag`  
  `starting_baseline`  
  `status`  
  `created_at`  
  `death_location`  
  `death_cause`  
  `deepest_depth`  
  `artifacts_recovered[]`  
  `learned_skills[]`  
  `signature_ghost_skill`  
  `ghost_id`

## **34.3 Ghost record**

`ghost:`  
  `id`  
  `source_intercessor_id`  
  `map_id`  
  `cell`  
  `housing_id?`  
  `stability_state`  
  `emotional_snapshot`  
  `remembered_facts[]`  
  `dialogue_id`  
  `bark_set_id`  
  `signature_skill_id`  
  `skill_inherited`  
  `attend_outcome`  
  `console_state`  
  `active`

## **34.4 Artifact record**

`artifact:`  
  `id`  
  `name`  
  `category`  
  `expedition_member_id?`  
  `original_origin`  
  `current_state`  
  `current_holder_id?`  
  `death_bundle_id?`  
  `recovery_generation`  
  `recovered_to_hub`  
  `journal_document_ids[]`  
  `unlock_effects[]`

## **34.5 Death bundle record**

`death_bundle:`  
  `id`  
  `source_intercessor_id`  
  `map_id`  
  `cell`  
  `created_at`  
  `active`  
  `artifact_ids[]`  
  `recoverable_item_stacks[]`  
  `recovery_attempt_owner_id?`

## **34.6 Knowledge record**

`campaign_knowledge:`  
  `discovered_cells_by_map`  
  `landmarks[]`  
  `creature_entries[]`  
  `expedition_facts[]`  
  `artifact_clues[]`  
  `faction_topics[]`  
  `known_ghost_locations[]`  
  `unlocked_skills[]`

## **34.7 Persistent lighting record**

Distinguish:

* authored permanent light;  
* repaired permanent light;  
* destroyed permanent light;  
* temporary expedition light;  
* environmental fire light;  
* Glass emission.

Only persistent authored changes survive death by default.

# ---

**35\. Save and Reset Contract**

## **35.1 Save authority**

The save must include:

* fracture seed and maps;  
* map deltas;  
* discovered fog;  
* landmarks;  
* shortcuts;  
* artifacts;  
* death bundles;  
* ghosts;  
* Intercessor archive;  
* current Intercessor;  
* skills;  
* knowledge;  
* factions;  
* quests;  
* hub changes;  
* named NPC state;  
* major chemistry/field changes marked persistent;  
* current expedition state.

## **35.2 Expedition reset**

On death or completed extraction, reset according to category:

* ordinary enemies respawn/repopulate;  
* patrols reset;  
* temporary lights clear;  
* transient chemistry reconciles;  
* common loose resources restock or remain consumed according to item class;  
* current combat clears;  
* active alerts clear;  
* map geometry remains;  
* major deltas remain;  
* ghosts remain;  
* artifact states resolve according to the death-bundle rule.

## **35.3 Safe package operations**

Before content production, package normalization must not delete generated or authored maps.

The QA suite must be opt-in. Import/export must round-trip:

* generated maps;  
* generation metadata;  
* artifact origins;  
* ghost records;  
* references;  
* map deltas.

## **35.4 Save migrations**

Generator version and save schema need migration policy.

A save must not silently regenerate its fracture under a newer generator.

Options:

* retain baked maps forever;  
* migrate metadata only;  
* provide explicit “new campaign with same seed” separately.

# ---

**36\. Production Plan**

# **36.1 Jam deadline and governing production rule**

# **The jam ends August 15, 2026\. No primary feature is scheduled for that date; August 15 is submission and emergency buffer only.**

# **The jam build ships one committed, curated fracture layout. Runtime per-save fracture generation is a post-jam engine milestone and is not on the jam critical path.**

# **The Studio generator may be used to produce candidate topology during development. By July 20 it must be able to produce connected ordinary maps with legal corridors, stairs, landmark sockets, artifact-compatible regions, and basic validation. If it cannot, generator work freezes and the jam fracture is completed manually. This is a scope decision, not abandonment of the engine feature.**

# **The jam content target is two dense fracture maps plus one authored culmination area.**

# 

# **36.2 July 14–18 — Prove light, darkness, and stealth**

# **Build one authored test chamber proving:**

# **full darkness prevents ordinary visual acquisition for both player and sighted enemy;**

# **carried light reveals the player;**

# **placed light reveals a room while the player remains elsewhere;**

# **thrown light creates sound and illumination;**

# **smoke interrupts sight;**

# **fog matches mechanical visibility;**

# **enemies search last-known position;**

# **detection cause is explained clearly;**

# **Glass can be sacrificed as emergency light fuel.**

# **Do not move into broad content production until this chamber feels trustworthy and tactically interesting.**

# 

# **36.3 July 19–22 — Select and commit the fracture**

# **Use Studio generation to produce candidate layouts, or hand-author the structure if the generator misses the cutoff.**

# **Required output:**

# **two dense fracture maps;**

# **one authored culmination area;**

# **three to five strong landmarks;**

# **artifact origin sockets;**

# **permanent shortcut routes;**

# **valid extraction paths;**

# **ordinary editable engine maps;**

# **full reachability and no-softlock audit.**

# **Select the strongest candidate, manually revise weak rooms and routes, then commit it as shipped content. Runtime new-game generation stops here for the jam.**

# 

# **36.4 July 23–29 — Complete the campaign loop**

# **Build and connect:**

# **procedural Intercessor names;**

# **active Intercessor record;**

# **death pipeline;**

# **persistent cyber ghost creation;**

# **death bundle;**

# **one-recovery artifact return-to-origin rule;**

# **deterministic signature ghost-skill inheritance;**

# **artifact collection and hub securing;**

# **persistent map discovery;**

# **shortcuts;**

# **extraction;**

# **hub archive and collection display;**

# **save/load across death and extraction.**

# **At the end of this phase, the game must function end to end even with placeholder plot content.**

# 

# **36.5 July 30–August 5 — Plot and authored content**

# **Author:**

# **the recurring hub cast;**

# **the missing expedition roster;**

# **ten to fifteen core expedition artifacts, reducing further if implementation demands it;**

# **expedition testimony and contradictions;**

# **main case progression;**

# **three major faction presences;**

# **fracture residents and shelters;**

# **culmination access;**

# **final decision and ending;**

# **dialogue, documents, barks, and contracts.**

# **Every artifact must connect to a person, route, testimony, relationship, or decision.**

# 

# **36.6 August 6–10 — Ecology and presentation**

# **Add and tune:**

# **four creature families with distinct senses;**

# **Glass-sensitive return pressure;**

# **Glass-fueled emergency light;**

# **fire, water, smoke, and electricity situations;**

# **Attend, Yell, and Console encounters;**

# **landmark dressing;**

# **art assets;**

# **music and tactical sound cues;**

# **tutorialization;**

# **UI feedback for light, sound, detection, Glass pressure, ghosts, and collection state.**

# 

# **36.7 August 11–14 — Stabilization**

# **Perform:**

# **complete playthroughs;**

# **lighting consistency tests;**

# **artifact state-machine tests;**

# **corpse-recovery tests;**

# **ghost accumulation and performance tests;**

# **generator provenance and committed-map audits;**

# **save/load and import/export tests;**

# **combat and stealth balance;**

# **accessibility pass;**

# **submission build and page preparation.**

# **No new primary mechanic begins during this phase.**

# 

# **36.8 August 15 — Submission buffer**

# **Use only for packaging, emergency fixes, upload verification, and submission. Any feature not already integrated and tested is cut or deferred.**

# 

# **37\. Jam-Critical Path**

A minimal end-to-end campaign:

1. Start at hub.  
2. Receive first procedurally named Intercessor.  
3. Enter generated persistent fracture.  
4. Learn carried and placed light.  
5. Avoid or fight sighted creature using darkness.  
6. Find first expedition artifact.  
7. Harvest Glass.  
8. Die or extract.  
9. If dead, create ghost and death bundle.  
10. Start next Intercessor.  
11. Reach prior ghost and inherit skill.  
12. Recover artifact bundle or fail and return artifact to origin.  
13. Open permanent shortcut.  
14. Reach deeper expedition trace.  
15. Recover enough critical pieces to access culmination.  
16. Resolve final encounter/decision.  
17. Show campaign archive, ghosts, collection, and ending.

# ---

**38\. Testing and Acceptance Criteria**

## **38.1 Lighting**

* Full-dark player cannot visually target unseen sighted enemy.  
* Sighted enemy cannot acquire full-dark player without another sense.  
* Carried light affects both renderer and perception.  
* Placed light affects both renderer and perception.  
* Smoke changes both renderer and line of sight.  
* Fog state matches mechanical visibility.  
* Detection reason is displayed correctly.

## **38.2 Generator**

* Same seed/version produces same output hash.  
* Every artifact origin is reachable.  
* Culmination is reachable.  
* All-artifact route exists in principle.  
* Permanent shortcuts function.  
* No duplicate IDs.  
* Maps load in editor and play mode.  
* Save/load does not regenerate.

## **38.3 Death and ghosts**

* Death creates one persistent ghost.  
* Ghost remains after later deaths.  
* Ghost does not block critical navigation.  
* Signature skill transfers deterministically once after the ghost is reached.  
* Ghost archive updates.  
* Many ghosts do not corrupt save or collapse performance.

## **38.4 Artifact bundle**

* Carried artifact enters bundle on death.  
* Next Intercessor can recover it.  
* Recovered artifact enters new bundle on later death.  
* If next Intercessor dies before prior recovery, prior bundle artifact returns to origin.  
* Prior ghost remains.  
* New ghost is added.  
* Recovered-to-hub artifact never returns to origin.

## **38.5 Persistence**

* Map discovery persists.  
* Current enemies do not remain falsely visible on remembered map.  
* Shortcuts persist.  
* Temporary light clears.  
* Major plot changes persist.  
* Package export/import preserves generated campaign maps.

## **38.6 Combat and stealth**

* Breaking sight can move enemies to searching where allowed.  
* Last-known position works.  
* Sound-hunter finds player in darkness through noise.  
* Glass-sensitive creature reacts to carried Glass.  
* Cover, height, overwatch, and forced movement remain functional in generated rooms.

## **38.7 Content**

* Every major artifact has a person/history connection.  
* Every main expedition member has at least two discoverable traces.  
* Every faction provides one material benefit and one credible harm.  
* No critical plot fact depends on one easily missable random bark.

# ---

**39\. Risks and Mitigations**

## **39.1 Lighting inconsistency**

**Risk:** renderer, fog, and AI disagree.  
**Mitigation:** one authoritative cell-light model and automated chamber tests.

## **39.2 Generator scope**

**Risk:** building a universal generator consumes the jam.  
**Mitigation:** one fracture recipe, bounded room set, authored landmarks, deterministic bake-time generation.

## **39.3 Ghost accumulation**

**Risk:** too many persistent entities create clutter or performance problems.  
**Mitigation:** lightweight ghost representation, nonblocking placement, archive, optional housing/aggregation presentation.

## **39.4 Corpse-run frustration**

**Risk:** repeated recovery becomes punitive.  
**Mitigation:** permanent shortcuts, persistent map, one-recovery artifact reset to origin, skill always recoverable, partial ordinary-item loss.

## **39.5 Collectathon detachment**

**Risk:** artifacts feel like checkboxes.  
**Mitigation:** every artifact changes dialogue, testimony, routes, hub display, faction state, or skill access.

## **39.6 Too many systems**

**Risk:** chemistry, emotion, factions, combat, and stealth overwhelm the player.  
**Mitigation:** introduce one system at a time through upper fracture rooms; contextual action bar; focused jam material set.

## **39.7 Plot overexplains fracture metaphysics**

**Risk:** mystery collapses into doctrine.  
**Mitigation:** center missing people, conflicting testimony, and practical consequences; reserve objective explanation.

## **39.8 Randomized protagonists feel disposable**

**Risk:** generated Intercessors lack identity.  
**Mitigation:** stable names, portraits, records, signature skills, ghost persistence, final lines, and surviving Intercessor continuity.

## **39.9 Fixed dungeon becomes solved too quickly**

**Risk:** map mastery removes tension.  
**Mitigation:** patrol repopulation, changing light states, creature migration, faction consequences, artifact burden, optional challenge routes, and deeper situational variability without rerolling topology.

# ---

**40\. Plot Development Questions**

The next plot phase should answer in this order:

1. Who commissions the first Intercessor?  
2. Who at the hub carries the emotional continuity between successors?  
3. Who led the missing expedition?  
4. What was the official purpose of its permanent light route?  
5. What did the expedition discover that divided it?  
6. Which expedition members remain living, ghosted, altered, missing, or deliberately hidden?  
7. What recurring person or ghost becomes the player’s central relationship?  
8. Why does the campaign continue after the first few recoveries?  
9. What is the deepest active light, structure, person, or settlement?  
10. What does each major faction want reported or concealed?  
11. What does recovery mean when a ghost does not want to leave?  
12. What does “love is given, not earned” look like in one concrete relationship?  
13. What final action uses the light/dark mechanics rather than only dialogue?  
14. What is the ending condition for partial artifact recovery versus full collection?  
15. What changes at the hub after the final decision?

## **40.1 Plot guardrails**

The plot should not:

* make one fixed Intercessor secretly immortal unless deliberately chosen;  
* turn all prior ghosts into disposable skill vendors;  
* reveal every fracture as a simple Grid machine;  
* make the Church wholly cynical;  
* make the Lanternless automatically correct;  
* require knowledge of The Third Voice;  
* use Mike merely because he already exists;  
* make collection unrelated to people;  
* resolve the theme as “choose light” or “choose dark” in the abstract.

# ---

**41\. Glossary**

**Artifact** — A fixed missing-expedition object in the central collection set.

**At Origin** — Artifact state indicating it remains at its original generated placement or holder.

**Attend** — Authored focused perception of a soul-bearing or spiritually meaningful target.

**Black Glass** — Highly Grid-legible Glass associated with severe activity and contamination.

**Campaign fracture** — The persistent generated dungeon tied to one save.

**Console** — An action attempting to lower grief/arousal or stabilize a target.

**Cyber ghost** — A rare disembodied Grid casualty whose consciousness persists after embodiment fails.

**Death bundle** — Recoverable container created when an Intercessor dies.

**Dim light** — Illumination band allowing partial visual information and reduced detection.

**Expedition** — The vanished group whose people, artifacts, route, and testimony form the central case.

**Extract** — Leave the fracture through a valid route and secure eligible carried progress.

**Fracture** — Permanent local failure of stable relation among Grid pressure, magic, memory, Glass, and ordinary reality.

**Full darkness** — Illumination band in which ordinary visual identification fails for both player and sighted creatures.

**Ghost Shelter** — Rare community or facility devoted to cyber ghosts and other Grid-disembodied persons.

**Glass** — Grid-born crystal storing emotional, cognitive, mnemonic, ritual, and witness-pattern.

**Intercessor** — Field actor who intervenes under incomplete truth to preserve life, choice, or future answer.

**Lanternless** — Groups who cultivate blind places and resist clean Grid indexing.

**Landmark** — Recognizable authored room or structure embedded in generated topology.

**Mapped / remembered** — Previously observed geometry inherited across Intercessors, without current tactical certainty.

**One-recovery rule** — Artifact rule granting one death-bundle recovery attempt before unreclaimed artifacts return to origin.

**Persistent shortcut** — Major navigational change that survives death.

**Prospector** — Practical fracture worker who harvests, salvages, trades, maps, or recovers.

**Signature ghost skill** — A skill retained by a dead player Intercessor and transferable to later Intercessors.

**Succession** — Campaign structure in which new Intercessors continue after individual deaths.

**Yell** — Loud action that creates sound, arousal, and social or creature response.

# ---

**42\. Working Design Statement**

**Fracture Crawl is a 3D systemic roguelike collectathon in which one procedurally generated fracture persists for an entire campaign. Successive Intercessors use temporary light to gain knowledge at the cost of exposure, recover a vanished expedition piece by piece, and leave permanent cyber ghosts wherever they die. The dungeon becomes known, collected, shortcut, inhabited, and haunted by the player’s own history.**

# ---

**43\. Source Notes**

This document is grounded in:

* Alderamontico World Bible v2;  
* Alderamontico philosophies and Laws of Glass;  
* the current 3D Engine Systems Reference;  
* current faction sheets;  
* the Dungeon Generator Architecture and stabilization plan;  
* The Third Voice GDD where mechanics remain useful;  
* current project-owner decisions made during fracture-crawl development;  
* the RPG Mania XV theme, **Dark & Light**.

The next document should be the **Plot and Character Specification**, beginning with the missing expedition roster, the hub’s recurring cast, and the exact mechanism by which successive Intercessors are commissioned.

# ---

**APPENDIX A — Content Target Matrix**

This appendix defines a practical content envelope. Counts are targets, not promises; protected mechanics take precedence over raw quantity.

## **A.1 Jam content target**

| Category | Minimum | Preferred jam target | Post-jam direction   |
| :---- | ----: | ----: | ----- |
| Hub maps | 1 | 1 | 1 expanded hub or 2 connected hub maps |
| Committed fracture maps | 3 | 3 | 4–6 |
| Culmination maps | 1 | 1 | 1–2 variants |
| Landmark templates | 3 | 5–7 | 12+ |
| Room archetypes | 10 | 16–20 | 30+ |
| Expedition members | 4 | 6–8 | 10–14 |
| Expedition artifacts | 10 | 15–20 | 30+ |
| Player light tools | 3 | 4–5 | 8+ |
| Creature families | 4 | 5–6 | 10+ |
| Major faction presences | 3 | 3–4 | 6 |
| Named recurring hub NPCs | 4 | 6–8 | 12+ |
| Named fracture residents | 3 | 5–7 | 12+ |
| Persistent skills | 6 | 10–14 | 30+ |
| Contracts | 5 | 8–12 | 25+ |
| Documents | 8 | 15–25 | 50+ |
| Barks | 20 | 50+ | 150+ |
| Ghost dialogue templates | 4 | 8–12 | procedural \+ authored variants |
| Endings | 1 | 2–3 outcome variants | 4+ |

## **A.2 Required representation by depth**

Each depth should contain at least:

* one strong darkness tutorial or escalation;  
* one environmental chemistry situation;  
* one permanent shortcut;  
* one expedition artifact cluster;  
* one expedition member trace;  
* one faction presence or evidence;  
* one landmark or strong visual room;  
* one optional high-risk Glass deposit;  
* one reason to return later with a different skill or light tool;  
* one viable extraction plan.

## **A.3 Content density rule**

A room should not be considered complete merely because it has enemies and loot.

A meaningful room should answer at least three of these:

1. What was this place before the Grid?  
2. Who uses it now?  
3. What can the player manipulate?  
4. What does light change here?  
5. What does darkness protect or conceal?  
6. What sound communicates before sight?  
7. What collection, route, or person gives the room long-term value?  
8. What can persist after the expedition?  
9. What makes returning later different?

# ---

**APPENDIX B — Light Tool Catalogue and Tuning Framework**

## **B.1 Hand lantern**

**Role:** reliable baseline carried light.

Suggested properties:

* moderate circular radius;  
* toggleable at no or low energy cost;  
* finite fuel;  
* occupies utility slot or hand state;  
* produces low continuous sound or Glass hum depending on model;  
* creates visible moving target;  
* vulnerable to dousing and breakage only under explicit conditions.

Player decisions:

* keep it lit and accept exposure;  
* shutter it to dim mode;  
* extinguish before stealth crossing;  
* place it temporarily;  
* reserve fuel for return.

## **B.2 Oil lamp**

**Role:** cheap placeable light with chemistry risk.

Properties:

* stationary once placed;  
* recoverable;  
* refillable;  
* produces heat;  
* may spill oil when broken, thrown, or knocked;  
* can ignite fuel-bearing surfaces;  
* brighter than a Glass candle;  
* attractive to light-hunters.

## **B.3 Throwing flare**

**Role:** rapid remote information and bait.

Properties:

* thrown with grid targeting;  
* impact sound;  
* short bright duration;  
* cannot usually be recovered;  
* may ignite;  
* can be doused;  
* provides a brief map reveal without guaranteeing safety;  
* may cause enemies to face, move toward, flee, or attack the flare.

## **B.4 Glass candle**

**Role:** low-intensity spiritual light.

Properties:

* dim radius;  
* long duration;  
* low heat;  
* reveals ghost traces, witness residue, or certain Glass properties;  
* may increase local Grid pressure;  
* may make some ghosts communicative and others defensive;  
* can remain useful where ordinary flame is unsafe.

## **B.5 Church safety beacon**

**Role:** high-security emergency light and extraction support.

Properties:

* very bright;  
* can signal the surface or a station;  
* strongly reveals player and nearby people;  
* may repel some creatures;  
* may attract severe light-hunters;  
* limited charges;  
* politically marked and trackable;  
* potentially required for an emergency extraction.

## **B.6 Lanternless shutter**

**Role:** modification rather than source.

Properties:

* reduces carried light radius;  
* narrows light direction;  
* reduces long-range visibility;  
* makes close navigation harder;  
* allows controlled peeking;  
* may be illegal or distrusted at Church checkpoints.

## **B.7 Creature-carried light**

Some creatures may:

* emit light naturally;  
* carry stolen lamps;  
* collect extinguished lights;  
* create light when alarmed;  
* leave luminous residue;  
* darken areas around them.

Creature light must use the same cell-light authority.

## **B.8 Tuning variables**

Every source should expose data fields for:

* radius;  
* intensity;  
* falloff;  
* duration/fuel;  
* toggle cost;  
* placement cost;  
* throw range;  
* sound on use;  
* heat output;  
* Glass pressure;  
* faction legality;  
* creature attraction multiplier;  
* smoke susceptibility;  
* water susceptibility;  
* recoverability;  
* inventory footprint;  
* weight.

## **B.9 Light economy target**

The player should rarely be unable to create any light at all, but should often be unable to illuminate every space safely.

A typical expedition should involve:

* one reliable carried source;  
* a small number of remote/placed sources;  
* environmental lights that may be exploited;  
* meaningful fuel conservation;  
* an increased need for light during artifact recovery and return.

# ---

**APPENDIX C — Creature Design Templates**

## **C.1 Sighted guarder template**

**Purpose:** teaches reciprocal darkness.

Behavior:

* guards a place, object, or route;  
* sees well in light;  
* loses acquisition in darkness;  
* searches last-known position;  
* may remain near its attachment rather than chase indefinitely.

Counterplay:

* extinguish light;  
* lure with remote light;  
* use smoke;  
* approach through dark cover;  
* Attend attachment;  
* create a second route.

## **C.2 Light-hunter template**

**Purpose:** turns illumination into bait and danger.

Behavior:

* detects bright sources at long range;  
* moves toward newly created light;  
* may attack the source before the player;  
* may ignore dark stationary targets;  
* becomes aggressive when deprived of light or overfed by it.

Counterplay:

* throw light away from route;  
* extinguish after movement commitment;  
* trap the light zone;  
* use dim light;  
* exploit its predictable attraction.

## **C.3 Sound-hunter template**

**Purpose:** prevents darkness from becoming universal safety.

Behavior:

* poor or absent sight;  
* tracks sound gradient;  
* reacts strongly to harvesting, breaking, and splashing;  
* may overshoot or investigate false sound;  
* is vulnerable to quiet movement and thrown distractions.

Counterplay:

* wait for movement cycles;  
* use Yell or thrown objects as lure;  
* move on quiet surfaces;  
* block sound route with doors;  
* create competing environmental noise.

## **C.4 Glass-sensitive scavenger template**

**Purpose:** makes successful return dangerous.

Behavior:

* detects carried Glass pressure;  
* weak interest in empty crawler;  
* follows or ambushes high-value carriers;  
* may steal dropped Glass instead of attacking;  
* may retreat to a nest or market route.

Counterplay:

* Glass Quieting skill;  
* split or drop Glass as bait;  
* use containers or shielding;  
* extract through alternate route;  
* negotiate with a faction that uses the creature.

## **C.5 Ghostly attachment template**

**Purpose:** carries Attend and Console mechanics.

Behavior:

* bound to room, object, person, or repeated action;  
* may not be visible in full light;  
* reacts to artifact possession;  
* can become communicative, defensive, or hostile;  
* may teach a skill or reveal expedition fact.

Counterplay:

* Attend;  
* Console;  
* provide housing;  
* return an object;  
* change room light;  
* refuse to force closure.

## **C.6 Major surreal demon template**

**Purpose:** major tactical and visual culmination.

Requirements:

* impossible but readable silhouette;  
* multi-stage sense behavior;  
* uses room geometry;  
* interacts with light and dark rather than only taking damage;  
* telegraphs severe attacks;  
* provides alternate survival or objective completion routes;  
* has history or ecology without requiring sympathetic interpretation.

Example concept:

A giant screaming face floats at floor level where legs should be. Several long arms grow upward into a crown that functions as its body. It does not see from the face; each hand detects a different category of light, sound, Glass, or grief.

## **C.7 Creature knowledge template**

Each family entry should include:

* common or field name;  
* visual silhouette;  
* locomotion;  
* senses;  
* light response;  
* sound response;  
* territory;  
* hostility conditions;  
* combat role;  
* environmental interactions;  
* Attend availability;  
* known faction uses;  
* knowledge unlock stages;  
* drop or ecological consequence.

# ---

**APPENDIX D — Systemic Room Situation Library**

These are implementation examples, not mandatory fixed rooms.

## **D.1 The flooded lamp room**

* shallow conductive water;  
* one damaged permanent lamp;  
* sighted creatures;  
* artifact on raised shelf;  
* dark upper route;  
* electrical conduit.

Approaches:

* repair light and fight;  
* remain dark and climb;  
* douse light;  
* electrify water;  
* lure creatures with flare;  
* drain water through valve;  
* return with insulated skill.

## **D.2 The bell corridor**

* total darkness;  
* hanging bells linked by residue;  
* trace-sensitive creature;  
* narrow route;  
* sound-hunter beyond door.

Approaches:

* move slowly without touching bells;  
* cut or brace bell lines;  
* deliberately ring distant bell;  
* use Yell to draw one creature into another;  
* light corridor and accept visual exposure.

## **D.3 The Glass orchard**

* many small luminous Glass growths;  
* light-hunter grazes among them;  
* harvestable nodes;  
* ghost visible only when most lights are extinguished.

Approaches:

* harvest quickly in brightness;  
* extinguish nodes to reach ghost;  
* lure hunter between growths;  
* use smoke;  
* take only low-pressure Glass.

## **D.4 The Church checkpoint below**

* permanent bright room;  
* locked supply cabinet;  
* wounded survivor;  
* official map station;  
* Lanternless route hidden behind light fixture.

Choices:

* use safe station and report findings;  
* repair supplies;  
* dim light to reveal route;  
* help survivor;  
* steal supplies;  
* negotiate access.

## **D.5 The black reservoir**

* deep dark water;  
* no ordinary visual floor;  
* sound echoes;  
* floating artifact container;  
* heat-sensitive creature;  
* one controllable warm lamp.

Approaches:

* move lamp as bait;  
* freeze a path;  
* use cold light;  
* cross in darkness through sound;  
* lower water.

## **D.6 The prior death site**

* player ghost;  
* death bundle;  
* environmental cause still legible;  
* new patrol;  
* artifact recovery pressure.

Approaches depend on prior death cause and inherited map knowledge.

## **D.7 The prospector claim**

* neutral workers;  
* claimed Glass deposit;  
* rival artifact nearby;  
* light machinery/noise;  
* faction dialogue before violence.

Player may trade, steal, help, report, sabotage, or wait for workers to leave.

## **D.8 The Lanternless blind shelter**

* no permanent light;  
* residents navigate through tactile marks;  
* carried light causes alarm;  
* ghost housing;  
* shortcut information.

The player must decide whether to extinguish light and trust the shelter.

## **D.9 The broken service hall**

* curved counters;  
* numbered windows;  
* service-shadow creature;  
* documents behind glass;  
* queue barriers as cover;  
* lights controlled from several desks.

The room supports social encounter, stealth, and combat without becoming a joke about bureaucracy.

## **D.10 The vampire bloodworks**

* old channels;  
* red residue;  
* pre-Grid architecture;  
* Glass growth along later wounds;  
* territorial resident;  
* artifact from expedition medical team.

The player learns that predation, survival, and later institutional extraction occupied the same site at different times.

## **D.11 The three elevators**

* three vertical routes;  
* one Church-lit and monitored;  
* one broken but repairable;  
* one dark and controlled by fracture residents;  
* different extraction implications.

Opening one route may change faction access and patrols.

## **D.12 The artifact carrying test**

* artifact emits increasing light after pickup;  
* return corridor contains Glass-sensitive scavengers;  
* alternate dark route requires a skill;  
* temporary extraction beacon available at high cost.

This room explicitly teaches that success creates exposure.

# ---

**APPENDIX E — Artifact Authoring Template**

## **E.1 Required fields**

Every artifact author must define:

* name;  
* visual object;  
* category;  
* original holder or location;  
* expedition member association;  
* practical function;  
* personal meaning;  
* faction claims;  
* emitted light/pressure if any;  
* inventory shape and weight;  
* extraction consequence;  
* journal unlock;  
* dialogue unlocks;  
* hub display;  
* return-to-origin behavior;  
* culmination relevance.

## **E.2 Artifact quality test**

An artifact is not ready if it can be replaced by “red keycard” without loss.

A strong artifact changes at least two of:

* route;  
* relationship;  
* testimony;  
* light behavior;  
* faction state;  
* skill;  
* ghost state;  
* final interpretation.

## **E.3 Example artifact set scaffold**

The final plot document should replace or refine these placeholders:

1. **Expedition Charter** — official purpose and hidden clauses.  
2. **First Route Lamp** — prototype permanent safety light.  
3. **Surveyor’s Black Plate** — map-witness Glass holding contradictory routes.  
4. **Medic’s Bell** — calls a ghost or survivor under specific conditions.  
5. **Lantern Shutter** — evidence that expedition members deliberately reduced light.  
6. **Prospector Claim Knife** — marks Glass ownership and a betrayal.  
7. **Personal Juggling Ball / Performer Tool** — only if a relevant expedition member justifies it; do not insert Mike by default.  
8. **Ghost Housing Key** — opens or binds a shelter apparatus.  
9. **Broken Church Seal** — proof of authority rejected or exceeded.  
10. **Deep Light Regulator** — critical component of the culmination system.  
11. **Vampire Measure Cup** — older history connected to survival/extraction.  
12. **Uncounted Name Strip** — intentionally removed identity record.  
13. **Emergency Extraction Flare** — practical tool and evidence of failed retreat.  
14. **Witness Glass of the Split** — incompatible testimony in one piece.  
15. **Final Personal Object** — emotionally identifies the expedition leader beyond office.

## **E.4 Hub display**

Recovered artifacts should become visible in the hub:

* mounted;  
* stored;  
* used;  
* argued over;  
* requested by factions;  
* placed near related ghost housing;  
* incorporated into repaired infrastructure.

The collection space should become a physical history, not only a menu.

# ---

**APPENDIX F — Detailed UI Flows**

## **F.1 New game**

1. New Game.  
2. Load the committed campaign fracture.  
3. Verify the shipped fracture package and initialize persistent campaign state.  
4. Present first Intercessor name and minimal identity.  
5. Open hub introduction.  
6. Begin first case briefing.

## **F.2 Expedition preparation**

1. Select active Intercessor.  
2. Review objective and ghost recovery marker.  
3. Select prepared skills.  
4. Arrange inventory.  
5. Select active weapon and utility/light.  
6. Review load, light capacity, Glass capacity, and faction restrictions.  
7. Confirm entry.

## **F.3 Light action**

1. Choose light action.  
2. Show predicted radius and exposure.  
3. If throwing/placing, choose valid cell.  
4. Show sound/heat warning where known.  
5. Confirm.  
6. Apply cell light and renderer update.  
7. Recalculate fog and perception.  
8. Emit enemy/faction reactions.

## **F.4 Wait / Listen**

1. Player chooses Wait/Listen.  
2. Spend energy.  
3. Advance scheduler and environmental state.  
4. Gather audible stimuli.  
5. Display directional information according to knowledge.  
6. Update alerts and last-known facts.

## **F.5 Attend**

1. Select valid target.  
2. Enter distinct quiet dialogue layer.  
3. Display surface presentation.  
4. Offer authored readings/options.  
5. Resolve true, partial, false, failure, spectacular failure, end early, or no read. For ghosts, resolve degraded or incomplete readings instead of arbitrary false readings unless explicit external distortion is signaled.  
6. Apply emotional, dialogue, fact, skill, hostility, or ghost-state effects.  
7. Mark major target outcome persistent.

## **F.6 Death**

1. Resolve death animation and final facts.  
2. Display Intercessor name and cause of death.  
3. Show artifacts entering bundle.  
4. Create ghost.  
5. Show any prior bundle artifacts returning to origin if the one-recovery rule was failed.  
6. Update archive.  
7. Return to hub.  
8. Create/select next Intercessor.  
9. Add recovery objective.

## **F.7 Ghost recovery**

1. Reach ghost.  
2. Resolve bark/visual state.  
3. Talk, Attend, Console, fight, or leave according to state.  
4. Reveal signature skill.  
5. Transfer the signature skill deterministically after the ghost is reached; Attend and Console may improve memory, stability, relationship, or additional rewards.  
6. Open death bundle separately.  
7. Recover artifacts/items.  
8. Update archive and objective.

## **F.8 Extraction**

1. Reach valid extraction.  
2. Preview secured artifacts, Glass, people, and contracts.  
3. Confirm extraction.  
4. Save secured progress.  
5. Clear transient expedition state.  
6. Return to hub.  
7. Play faction, artifact, ghost, and story reactions.

# ---

**APPENDIX G — Implementation Priority and Acceptance Gates**

## **G.1 Gate 1: package safety**

Do not begin campaign content until:

* import/export preserves arbitrary maps;  
* QA suite no longer deletes user maps;  
* strict type check passes;  
* old continent generator is removed from active paths;  
* save/load round-trip works on a multi-map dungeon.

## **G.2 Gate 2: light authority**

Do not author full creatures until:

* renderer light and mechanical light agree;  
* fog uses mechanical light;  
* sighted AI uses mechanical light;  
* placed and carried sources work;  
* smoke modifies sight;  
* detection explanation is reliable.

## **G.3 Gate 3: persistent generation**

Do not author artifact collection until:

* generator output is deterministic;  
* generated maps are normal maps;  
* campaign maps never reroll on death/load;  
* all required routes validate;  
* editor can open generated maps without corrupting them.

## **G.4 Gate 4: artifact state**

Do not scale artifact count until:

* stable origins work;  
* extraction secures artifacts;  
* death bundle works;  
* one-recovery return-to-origin rule passes automated tests;  
* recovered artifacts survive save/load.

## **G.5 Gate 5: ghost succession**

Do not write extensive ghost content until:

* names generate safely;  
* death creates persistent ghost;  
* next Intercessor starts correctly;  
* skill transfer works;  
* multiple ghosts persist;  
* ghost entities remain nonblocking and performant.

## **G.6 Gate 6: playable slice**

The slice is ready when a player can:

* enter darkness;  
* manipulate light;  
* avoid one enemy;  
* fight one enemy;  
* use one chemistry interaction;  
* recover one artifact;  
* die;  
* meet prior ghost;  
* inherit one skill;  
* recover bundle;  
* extract;  
* see hub change.

# ---

**APPENDIX H — Production Cut Matrix**

## **H.1 Must ship**

* fixed generated layout;  
* persistent mapping;  
* reciprocal darkness stealth;  
* carried and placed light;  
* one throwable light;  
* artifact collection;  
* artifact death bundle;  
* permanent player ghosts;  
* skill inheritance;  
* hub;  
* missing expedition plot;  
* same-map combat;  
* sound suspicion;  
* Glass exposure;  
* save/load.

## **H.2 Should ship**

* three faction presences;  
* four creature senses/families;  
* fire/water/smoke/electricity;  
* landmarks;  
* permanent shortcuts;  
* Attend/Console ghost interactions;  
* collection display;  
* several contracts;  
* final choice.

## **H.3 Could ship**

* foam and freezing;  
* optional companions;  
* ghost housing management;  
* multiple extraction devices;  
* expanded Uncounted content;  
* rival crawler AI;  
* seed sharing UI;  
* advanced challenge records.

## **H.4 Explicitly deferred**

* runtime per-save fracture generation;  
* continent generation;  
* infinite megadungeon;  
* full equipment paper doll;  
* dynamic procedural dialogue;  
* cloud saves;  
* multiplayer;  
* full ghost-play mode;  
* universal faction war simulation;  
* every old Alderamontico plot thread;  
* Mike rescue as default premise.

# ---

**APPENDIX I — Mechanics Carried Forward from The Third Voice**

The following are retained as Alderamontico design language:

## **I.1 Same-map tactical combat**

Combat occurs in the explored physical space, preserving terrain, light, objects, hazards, and consequences.

## **I.2 Attend as authored soul dialogue**

Attend remains distinct from normal Talk and can succeed, partially read, falsely read, fail, spectacularly fail, end early, or return no read. False readings remain available for living, creature, and externally distorted targets; ghosts use degraded or incomplete readings by default.

## **I.3 One-shot attention**

Major Attend targets remember the attempt. The player cannot treat a person as infinitely resettable dialogue content.

## **I.4 Emotional state**

Valence, arousal, grief, reverence, and attachment continue to inform behavior and interaction.

## **I.5 Yell and Console**

These remain world actions that feed sound, emotion, AI, and dialogue rather than decorative choices.

## **I.6 Named people and authored empty reads**

Named NPCs are not disposable flavor. Some targets may refuse or fail to produce an Attend read for meaningful reasons.

## **I.7 Persistent consequences**

Killed, rescued, stabilized, attended, moved, recovered, and faction-altered states persist where appropriate.

## **I.8 Documents, barks, shops, items, factions, and journal**

The existing story and world systems remain core support for the new loop.

## **I.9 What does not carry forward automatically**

The following belong specifically to The Third Voice unless deliberately restored:

* Mike as protagonist;  
* Rell’s juggling-store refusal;  
* the lying Grid quest journal;  
* the Mender/Source Door fixed tragedy;  
* one unavoidable plot outcome with Understanding tiers;  
* spiritual-layer staging as the whole game’s perspective;  
* CLARO-7 and Jory as required encounters;  
* Aldric’s epilogue role.

This fracture game may reference or reuse individual elements later, but it is not a disguised rewrite of The Third Voice.

# ---

**APPENDIX J — Balance Metrics to Track**

## **J.1 Exploration metrics**

Track per expedition:

* turns/time spent in full darkness;  
* turns/time spent in dim/full light;  
* lights placed;  
* lights recovered;  
* lights lost;  
* rooms revealed by thrown light;  
* sound alerts caused;  
* combats avoided;  
* combats entered with advantage;  
* distance to extraction;  
* shortcuts used.

## **J.2 Collection metrics**

* artifacts discovered;  
* artifacts extracted;  
* artifacts lost to bundle;  
* artifacts recovered from bundle;  
* artifacts returned to origin;  
* average artifact carry distance;  
* Glass harvested;  
* Glass extracted;  
* inventory occupancy at death/extraction.

## **J.3 Death metrics**

* cause;  
* location;  
* depth;  
* illumination state;  
* carried Glass;  
* artifact count;  
* enemy sense that acquired player;  
* prior bundle status;  
* time until ghost recovery;  
* skill inherited.

## **J.4 Combat metrics**

* damage taken/dealt;  
* light state at combat start;  
* cover use;  
* height use;  
* overwatch triggers;  
* forced movement;  
* chemistry damage;  
* disengagement success;  
* Attend attempts and outcomes.

## **J.5 Generator metrics**

* generation time;  
* retries;  
* room counts;  
* critical path length;  
* loop count;  
* artifact route feasibility;  
* minimum one-run collection route;  
* permanent light coverage;  
* full-dark route coverage;  
* extraction distances;  
* invalid placements;  
* output hash.

## **J.6 Balance targets**

Early tuning goals:

* the first artifact should be reachable without mastery;  
* first death should teach rather than end campaign momentum;  
* recovery route should be shorter after at least one permanent shortcut;  
* a player should understand why they were detected in nearly every case;  
* carried Glass should create noticeable but not immediate unavoidable pursuit;  
* one-run full collection should be difficult because of planning and execution, not impossible inventory arithmetic;  
* the first prior ghost recovery should occur soon enough to prove the succession premise.

# ---

**FINAL DEVELOPMENT NOTE**

This document intentionally stops before naming the missing expedition, fixing the hub cast, or deciding the deepest truth. The systems now provide a specific dramatic shape:

* people go down to recover other people;  
* light makes rescue possible and exposure inevitable;  
* death does not erase the worker, but makes them another responsibility;  
* artifacts move between origin, hand, death bundle, and home;  
* the same dungeon becomes more knowable and more haunted;  
* mastery can produce one extraordinary complete expedition;  
* the final plot must decide what kind of knowledge should be brought back into public light.

The next design task is not another engine expansion. It is the **Plot and Character Specification**.