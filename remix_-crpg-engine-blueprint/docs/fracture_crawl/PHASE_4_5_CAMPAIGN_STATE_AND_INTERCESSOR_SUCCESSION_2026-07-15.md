# Phases 4–5 — Campaign State and Intercessor Succession

Date: 2026-07-15

Status: implemented for the Phase 4–5 batch

## Outcome

The engine now has three explicit lifecycle layers:

1. **Authored baseline** — immutable package maps, placements, defaults, and
   content definitions.
2. **Campaign state** — communal geography, configured permanent shortcuts and
   objects, major switches, documents, quests, relationships, faction state,
   durable world facts, and the Intercessor archive.
3. **Expedition state** — current encounters, actors, combat, chemistry,
   temporary lights and hazards, moved ordinary objects, loose ordinary loot,
   search/alert state, and other tactical simulation.

`resetRun` / **New Game** still discards the complete campaign. Ending an
expedition uses the new lifecycle transition and preserves campaign state.

## Phase 4 — Persistent world-state layers

The pure lifecycle implementation lives in
`src/engine-core/worldStateLayers.ts`.

It provides:

- legacy-save normalization into versioned world-layer metadata;
- an observable authored/campaign/expedition projection;
- an authorable reset policy in `settings.world_state_policy`;
- one atomic `beginNewExpedition` operation;
- a detailed reset report for tests and debugging;
- dialogue-expedition rollover while retaining campaign vocabulary;
- authored switch defaults on a genuinely new campaign;
- save, slot, browser-autosave, V1/V2, and package-round-trip support.

Default campaign behavior preserves story state and discovered geography while
clearing tactical state. Authors can explicitly configure:

- campaign- and expedition-scoped switch IDs;
- permanent door/shortcut placement IDs by map;
- permanent moved/removed object placement IDs by map;
- permanent world-item placement IDs by map;
- permanent container placement IDs by map;
- persistent entity placement IDs/state keys;
- whether raw chemistry survives an expedition boundary.

The Studio **Game → Campaign** panel authors these policies without direct JSON
editing. Reference audits reject missing maps, placements, switches, hub
spawns, and invalid history topics.

## Phase 5 — Intercessor records and succession

The pure succession implementation lives in
`src/engine-core/intercessorSuccession.ts`.

Each Intercessor has a stable saved identity containing:

- stable record ID and permanently saved generated display name;
- generation number and expedition of origin;
- skill list and signature skill;
- inventory references;
- active/dead state;
- exact death map, cell, facing, time, and expedition;
- ghost-request and death-bundle-request references;
- life-history notes.

Death now performs one idempotent atomic transition:

1. Close the current expedition.
2. Snapshot and mark the active Intercessor dead.
3. Create exactly one pending ghost request.
4. Create exactly one pending death-bundle request.
5. Reset expedition-only state through the Phase 4 operator.
6. Create a uniquely identified, deterministically named successor.
7. Preserve configured campaign artifacts and communal geography.
8. Return the successor to the configured hub spawn.
9. Update current/prior Intercessor dialogue identity and create an exact-record
   campaign topic when a dynamic-capable history keyword is configured.
10. Persist the succession notice until the player acknowledges it.

Refreshing or loading while the notice is open restores the same transition;
it cannot duplicate the death, requests, or successor.

The Journal now includes **Intercessor History**. The Studio Campaign panel
authors the hub, deterministic name pools, duplicate policy, banned/reserved
names, and previews generated names.

## Deliberate boundary

This batch creates **requests**, not physical ghosts or bundles. It does not
place a ghost entity, generate ghost dialogue, drop an inventory bundle, or
implement skill inheritance. Those are the next phases and consume the stable
records created here.

## Browser acceptance map

The QA suite now contains **QA Persistence & Succession Lab**, accessible from
the hub curator.

Recommended walkthrough:

1. Enter the lab.
2. Open the divider shortcut and explore the north annex.
3. Pick up the **Violet Archive Seal**.
4. Use the west **CAMPAIGN** terminal.
5. Use the center **HAZARD** terminal.
6. Move the south crate and pick up the ordinary supply.
7. Optionally save and refresh; the current expedition should be unchanged.
8. Use the east **SUCCESSION** terminal.
9. Confirm the death notice names the deceased and generated successor.
10. Continue as the successor at the QA hub.
11. Open Journal and inspect **Intercessor History**.
12. Return to the lab.
13. Confirm the explored annex, shortcut, Archive Seal recovery, and campaign
    switch persist.
14. Confirm the hazard, hostile, crate, and ordinary supply have reset.
15. Refresh again and confirm the history still contains exactly one death and
    two pending materialization requests.

The Journal exposes a QA-only **end expedition here** control when
`settings.campaign_debug` is enabled. It exercises the Phase 4 reset without
killing the current Intercessor.

## Governing rule

Authored data defines the world. Campaign state remembers lasting change.
Expedition state describes the current attempt. Death records a life and hands
the same persistent world to the next Intercessor.
