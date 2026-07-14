# Systemic Grid Interaction Kernel - Implementation-Grounded Specification v3.0

**Status:** Implementation-grounded kernel milestone complete for the current v1 runtime: stable v1 object instances, deterministic holders, durable world facts, derived transfer/transaction records, baseline exposure, simple NPC awareness facts, and optional expansion adapters are implemented and covered by headless tests.  
**Depends on:** Grid-Based 2D CRPG Base v3.  
**Consumes current footholds:** map cells, object placements, item placements, container placements, door opening deltas, inventory, cutscene effects, interaction handling in `PlayMode.tsx`, object footprints, and map deltas.  
**Feeds:** Philosophical Semantics v4 and Systems Simulation v4.

## 0. Purpose

The current engine already supports several concrete interactions: open doors, loot containers, pick up items, drop items, read documents, talk to NPCs, trigger cutscenes, enter shops, fight enemies, and transition maps. These interactions currently live in `PlayMode.tsx` and save only a small subset of world changes through map deltas.

The Systemic Grid Interaction Kernel turns those ad hoc interactions into a general, deterministic layer of persistent world facts.

The kernel answers four questions:

1. What persistent thing is being interacted with?
2. What grid cells, edges, holders, containers, hands, or inventories does it occupy?
3. What physical/world state changed?
4. Who could perceive the change at the baseline level?

The kernel does not decide whether an act was morally right, philosophically meaningful, or socially accepted. It records what concretely happened so later layers can interpret it.

## 1. Current foothold

### 1.1 Present interaction system

The current play loop resolves interactions through facing and adjacency. The action button can:

- start dialogue;
- open doors;
- loot containers;
- pick up ground items;
- read terminals/documents;
- trigger interact cutscenes;
- open shops;
- run cutscene effects;
- start combat;
- give or remove items and currency.

These are useful but not yet systemic. The current implementation is target-specific: a door knows how to open, a chest knows how to loot, an item knows how to be picked up. There is no common object-identity and transaction system.

### 1.2 Current persistence

Map deltas persist:

- taken authored items;
- dropped items;
- opened doors;
- container opened/unlocked/looted state.

This is the correct seed for the kernel. The current code now appends `PlaySave.world_facts` for pickup, door, container, and shop interactions, including baseline actor/cell exposure and holder movement for item transfers. The remaining limitation is that most map deltas still record the result first, while the kernel reconstructs part of the interaction model instead of owning the authoritative transaction from intent through commit.

### 1.3 Current object model

The object library already contains categories, tags, bounds, collision profiles, footprints, rotation, and `tile_sprite_id`. Maps already include custom object placements, item placements, and container placements. The kernel should not replace these immediately. It should normalize them into runtime object instances.

## 2. Kernel promise

The kernel promise is:

> Every meaningful interaction operates on a persistent object or actor, resolves through a grid-aware transaction, changes authoritative state, and emits a world fact that later systems can inspect.

The kernel makes the world more systematic before it becomes deeply simulated. It is not a physics engine. It is a factual interaction engine.

## 3. Runtime object identity

### 3.1 Templates versus instances

The current package has library definitions and map placements. The kernel introduces explicit runtime instances.

- Template: authored definition such as item, object, entity, container type, or door type.
- Placement: authored starting location on a map.
- Instance: the persistent runtime object with identity, state, location, holder, ownership, condition, and history.

Example:

```text
item template: iron_key
placement id: item_placement_12 on map parish_hall
runtime instance: objinst_iron_key_00041
```

If the key is picked up, dropped, sold, stolen, placed in a chest, or used in a cutscene, it remains the same runtime instance unless explicitly consumed or transformed.

### 3.2 Minimum instance fields

Every kernel object instance should track:

- instance id;
- template id;
- display name override if any;
- current location type;
- map id, plane id, x/y if in world;
- holder id if carried/equipped/contained;
- stack quantity if stackable;
- rotation;
- footprint;
- blocking state;
- open/closed state where applicable;
- locked/unlocked state where applicable;
- condition value;
- owner id or owner faction id if known;
- custody holder;
- access tags;
- persistence policy;
- creation event id;
- last modified event id.

### 3.3 Location types

Kernel locations include:

- world cells;
- edge between cells;
- container inventory;
- actor inventory;
- equipment slot;
- hand slot;
- shop stock;
- installed socket;
- hidden cache;
- destroyed record;
- abstract holding area for cutscenes or migration.

The current inventory and container systems can migrate into this unified holder model over time.

## 4. Grid-aware placement and occupancy

### 4.1 Cells and footprints

Objects may occupy:

- one cell;
- multiple cells;
- an edge between cells;
- a holder/container;
- a support surface;
- a stack atop another object;
- a carried or equipped slot.

The kernel computes authoritative occupancy. Visual offsets may make objects look natural, but occupancy remains cell/edge/holder based.

### 4.2 Multi-object cells

The grid must support multiple small items in a single cell. It must distinguish:

- floor occupancy;
- item layer;
- actor occupancy;
- blocking object occupancy;
- decor-only occupancy;
- hidden object occupancy;
- edge occupancy.

### 4.3 Rotation

The current object footprint utilities and door placement utilities are retained and generalized. Rotation affects footprint, edge blocking, interaction points, cover, and presentation.

### 4.4 Placement validity

The kernel validates placement through:

- cell activity;
- plane compatibility;
- footprint overlap;
- blocking rules;
- holder capacity;
- ownership/access permissions;
- terrain restrictions;
- edge restrictions;
- combat restrictions;
- author-configured placement tags.

A failed placement must return an intelligible reason, not just `false`.

## 5. Actor capabilities

Interactions depend on actor capabilities.

Base capabilities include:

- can reach;
- has free hand;
- can carry item category;
- has required key/tool;
- can interact while in combat;
- can perform noisy actions;
- can read;
- can use magic/skill action;
- can manipulate locked mechanisms;
- can push/pull/drag weight class;
- can enter restricted area;
- can make shop transaction;
- can trigger scripted interaction.

The simulation layer later expands capability with strength, fatigue, injuries, leverage, grip, awkwardness, and cooperative movement.

## 6. Baseline affordances

The kernel defines standard affordances. Games may enable or disable them by object profile.

### 6.1 Object transfer

- take;
- pick up stack quantity;
- drop;
- place;
- insert into container;
- remove from container;
- give to actor;
- take from actor;
- equip;
- unequip;
- move to hand;
- move to quick slot.

### 6.2 Object manipulation

- push;
- pull;
- drag;
- rotate;
- stack;
- throw;
- fasten;
- unfasten;
- barricade;
- unbarricade;
- install;
- remove installation.

### 6.3 Object state

- open;
- close;
- lock;
- unlock;
- break;
- repair;
- search;
- read;
- activate;
- deactivate;
- mark;
- clean;
- ignite;
- extinguish;
- pour;
- use as cover;
- use as improvised weapon.

Not all are implemented in the first kernel milestone. The registry must support them from the beginning.

## 7. Transaction model

### 7.1 Interaction transaction

Every meaningful interaction resolves as a transaction:

1. Intent: actor requests interaction.
2. Target resolution: identify target object, actor, cell, edge, or holder.
3. Validation: check reach, permissions, capabilities, AP/time/energy, state, and collision.
4. Reservation: reserve actor, target, cells, holder, or edge if needed.
5. Effect resolution: determine state changes.
6. State mutation: apply changes atomically.
7. World fact emission: create factual event record.
8. Exposure calculation: who could see/hear/notice.
9. UI/FX response: presentation only.
10. Rollback if interrupted before commit.

### 7.2 Atomicity

An interaction either commits fully or fails safely. Example: if an actor cannot place a chest after dragging it, the chest remains in the previous valid location rather than half-occupying invalid cells.

### 7.3 Interruptions

Some interactions take time. Long interactions can be interrupted by:

- actor movement;
- combat start;
- damage;
- dialogue/cutscene takeover;
- NPC challenge;
- loss of reach;
- target state change;
- user cancel;
- failed skill check;
- scripted interruption.

The transaction decides whether progress is retained, rolled back, or converted into a partial world fact.

## 8. Ownership, custody, possession, and access

### 8.1 Distinct concepts

The kernel distinguishes:

- ownership: who or what institution claims legitimate ownership;
- custody: who currently physically controls the object;
- possession: who carries or holds it;
- access: who may open/use/enter it;
- permission: explicit or implied authorization for an action;
- trespass: unauthorized presence in an area;
- theft: unauthorized transfer from owner/custodian.

The kernel does not decide moral guilt. It records the facts and permission state.

### 8.2 Permission sources

Permission may come from:

- owner;
- faction;
- area rule;
- quest state;
- dialogue grant;
- shop transaction;
- party membership;
- cutscene effect;
- key item;
- disguise/access badge;
- emergency rule;
- author override.

### 8.3 Current migration

Current containers with key checks become access-controlled holders. Current opened doors become edge/object states. Current ground items become world instances with owner and pickup permissions as needed.

## 9. World facts

### 9.1 Definition

A `WorldFact` is a durable record that something concrete happened in the world.

Minimum fields:

- fact id;
- timestamp/turn;
- map id;
- plane and cells/edges involved;
- actor id;
- target id;
- action type;
- previous state summary;
- new state summary;
- direct consequences;
- visibility/audibility baseline;
- permission state;
- resulting object instance ids;
- source command id;
- parent fact ids if caused by another event.

### 9.2 Examples

```text
object_taken:
  actor: player
  object: iron_key_instance_41
  from: altar_cell_12_9
  to: player_inventory
  permission: not_granted
  exposures: priest_visible, guard_audible
```

```text
door_opened:
  actor: companion_2
  object: chapel_door_instance_7
  previous: closed_locked
  new: open_unlocked
  tool: brass_key_instance_3
  permission: granted_by_key
```

```text
container_searched:
  actor: player
  container: parish_chest_instance_2
  result: hidden_letter_revealed
  permission: no_known_permission
```

### 9.3 Base event versus world fact

The base event stream records all operational events. The kernel world fact stream records meaningful world interactions. A movement step may be a base event only. Moving a corpse, stealing a relic, breaking a window, opening a sealed chest, or barricading a door is a world fact.

## 10. Baseline exposure

### 10.1 Exposure records

The kernel records who could have perceived a world fact in a coarse baseline way.

Exposure types:

- visual;
- auditory;
- tactile/contact;
- direct participant;
- authored omniscient system exposure;
- area announcement;
- inventory/custody awareness;
- obvious later inspection.

### 10.2 Exposure is not belief

Exposure does not mean knowledge in the philosophical sense. It means the actor had an opportunity to perceive the event or result. The philosophical layer turns exposure into actor-relative observations and beliefs.

### 10.3 Current migration

Current barks and proximity checks provide a seed for earshot. Current line-of-sight and blocks LOS provide a seed for visual exposure. Current schedules provide a seed for who was present.

## 11. Obvious-change memory

The kernel gives NPCs simple awareness of obvious physical changes, even before the full simulation layer.

Examples:

- a door that was closed is open;
- a chest is empty;
- a valuable object is missing;
- a barricade blocks a route;
- a body is present;
- a fire is burning;
- a window is broken;
- an object is lying in a forbidden area.

NPCs may react through base AI states, barks, dialogue triggers, or faction reputation. The philosophical layer later creates nuanced accounts; the simulation layer creates richer traces.

## 12. Kernel and combat

The kernel must function during both exploration and combat.

Combat actions can use kernel affordances:

- open/close door;
- drag ally;
- push table;
- place object;
- barricade doorway;
- ignite oil;
- extinguish fire;
- throw item;
- break cover;
- search container during combat;
- use lever;
- lock gate.

All such actions use AP and produce world facts.

## 13. Kernel and cutscenes

Cutscenes must use the same interaction transactions when they manipulate real objects.

A cutscene that gives an item, opens a door, hides an entity, moves a body, breaks a seal, or empties a container should create the same state transitions and facts as gameplay unless explicitly marked as presentation-only.

## 14. Kernel and editor

The Studio must author kernel properties:

- object instance policy;
- interaction profile;
- affordances;
- footprint and rotation;
- holder/container rules;
- ownership and permission;
- access keys;
- interaction time/AP/energy costs;
- failure messages;
- event/fact importance;
- exposure rules;
- transaction interruptibility;
- combat usability;
- AI usability.

## 15. Kernel implementation roadmap

### Phase K0 - extract current interactions

- Inventory all current `PlayMode.tsx` interaction branches.
- Convert doors, containers, ground items, documents, NPC dialogue, shop opening, and interact cutscenes into command wrappers.
- Preserve current UI behavior.

### Phase K1 - runtime instances

- Create object instance registry at runtime.
- Convert authored item placements, object placements, containers, and doors into instances.
- Keep compatibility with current map deltas.

### Phase K2 - holders and transfers

- Implement actor inventory holders, container holders, ground holders, equipment holders, and shop holders.
- Convert pickup/drop/loot/give/remove item to transfers.

Current local status: actor inventory, container inventory, world-cell, equipment-slot, hand-slot, shop-stock, hidden-cache, and destroyed holders exist in `src/engine-core/kernel.ts`. Pickup, explicit drop, container loot/stow/take-all, shop buy/sell, `give_item`, and `remove_item` facts now record holder movement where relevant, and `createKernelSnapshotFromV1` derives snapshot transfer records from persisted facts. Equipment and hand holder IDs exist as stable kernel holders; a live equipment runtime remains a later base/gameplay feature rather than a blocker for this kernel milestone.

### Phase K3 - grid placement and manipulation

- Implement place, push, pull, drag, rotate, open, close, lock, unlock, search, break, and repair as transactions.
- Update navigation and collision from occupancy.

Current local status: `KernelTransactionRecord` now exists in `src/engine-core/kernel.ts`, and `createKernelSnapshotFromV1` derives committed transaction records for the current v1 object-state verbs: door open/close, container unlock/open/search, object push/move, and object break/remove. Navigation, collision, and rendering consume `MapDelta.moved_objects` / `removed_objects`, and kernel snapshots now preserve stable authored object identity across moved/removed placement state. Pull, drag, rotate, lock, place, repair, barricade-specific authoring, and kernel-owned pathfinding remain future expansion verbs beyond this implementation-grounded milestone.

### Phase K4 - world facts and exposure

- Emit world facts for all interactions.
- Calculate baseline visual/auditory/direct exposure.
- Add runtime inspector for world facts.

Current local status: implemented as a foothold. Existing interaction facts now carry actor-specific direct, visual, and auditory exposure records. Visual exposure uses map `blocks_los` cells and a short baseline radius; auditory exposure uses a short earshot radius; direct participants remain explicit. The Play-mode event/debug overlay already exposes `PlaySave.world_facts`, including these exposure records. This is still coarse baseline exposure, not stealth/perception/lighting.

### Phase K5 - AI awareness

- Add obvious-change memory and simple NPC reactions.
- Expose facts to dialogue, triggers, conditions, quests, and cutscenes.

Current local status: implemented as a milestone foothold. The kernel derives `npc_noticed_world_fact` records from exposed obvious physical changes such as item pickup/drop, door open/close, push/break, and container changes/search. These records are persisted in `PlaySave.world_facts` and parent-linked to the originating interaction. Authored behavior trees, dialogue conditions, quest conditions, faction reactions, and bark reactions can consume these facts in later semantic/simulation work; they are not required for the kernel to record awareness opportunities.

### Phase K6 - expansion readiness

- Add semantic adapter hooks for philosophy.
- Add physical-state hooks for simulation.
- Validate that the kernel can run with philosophy off and simulation off.

Current local status: implemented as an adapter seam. `createKernelFactsFromEngineEvents` accepts optional kernel fact adapters and an awareness-fact off switch, and the default runtime runs with philosophy/simulation absent. Headless coverage proves the kernel can emit its base fact stream independently while giving later philosophy/simulation layers a hook to append derived facts.

## 16. Kernel acceptance slice

A test map must prove:

- player takes an object from an owned/permission-relevant world holder;
- a nearby NPC sees/hears it and an awareness fact is recorded;
- player can put the object in a container;
- container state persists;
- player can push a table/crate to block movement;
- pathing/collision updates from moved object deltas;
- combat still runs with kernel facts enabled;
- player can break or move the barricade;
- every implemented interaction creates a world fact;
- save/load preserves object instance identities and fact streams;
- the Studio/runtime inspector can inspect the facts and object history.

Current local status: covered headlessly by `scripts/test-engine-core.ts` (277 checks). The acceptance slice proves pickup/drop transfers, container stow/search/open/unlock/take-all persistence, push/break collision updates, combat coexistence, exposure/awareness facts, v2 save preservation of world facts, and runtime debug inspection of the `PlaySave.world_facts` stream. The authored map uses current demo/system objects rather than a literal altar/table naming requirement, but it exercises the same holder, transaction, exposure, and occupancy mechanics.

## 17. Non-goals

The kernel does not implement deep physics, detailed fire/fluid/scent propagation, social philosophy, actor beliefs, consent, claims, cases, or moral interpretation. It only guarantees that physical and interaction facts exist for later systems.
