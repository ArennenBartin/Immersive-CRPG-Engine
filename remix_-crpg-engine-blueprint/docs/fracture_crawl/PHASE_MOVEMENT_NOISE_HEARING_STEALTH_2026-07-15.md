# Movement Noise, Hearing, and Stealth Mode

- **Date:** 2026-07-15
- **Status:** implemented; the release gate is the focused contract, full regression/audit suite, and browser walkthrough below
- **Scope:** mechanical sound, hearing evidence, investigation/search, player stealth stance, party noise, Studio authoring, persistence, and diagnostics
- **Out of scope:** changing visual acquisition, light, darkness, fog of war, combat rules, or building a physically exact acoustic simulation

This phase extends the existing Stage 4 perception and NPC-task systems. It
does not add a parallel stealth AI.

## 1. Governing rules

1. **Rendered audio is presentation; mechanical sound is simulation data.** A
   muted speaker does not make an action mechanically silent, and a loud audio
   asset does not make it detectable unless an explicit sound stimulus exists.
2. **Hearing supplies event-location evidence, not permanent actor tracking.**
   An enemy may investigate the newest meaningful sound, but only a fresh sound
   may update a hidden mover's last-heard position.
3. **Sight and hearing remain independent.** Direct visual evidence takes
   precedence over uncertain hearing. Stealth does not alter illumination,
   vision cones, line of sight, fog, or an enemy's existing knowledge.
4. **Entering stealth affects future movement only.** It does not clear
   suspicion, combat, last-seen position, last-heard position, or an active
   investigation.
5. **Stealth is a commitment.** It trades speed and immediate agency for less
   movement noise. A prohibited action remains blocked until the player
   manually leaves the stance.
6. **The party rule is collective.** The controlled player and current party
   followers use the same stance and movement-noise multiplier.

The resulting design rule is:

> Darkness hides sight. Quiet movement hides hearing. Neither replaces the other.

## 2. Runtime data flow

### 2.1 Emission

An accepted movement step resolves through `movementNoiseLoudness` using:

- `settings.movement_hearing.normal_movement_loudness`;
- normal or stealth stance multiplier;
- the current terrain/surface modifier;
- the engine's macro-to-fine grid scale.

`V1GridWorld.moveEntity` then writes a compact `sound` environment field at
the step's origin. Every pulse carries a monotonically increasing sequence so
multiple fine-grid steps in the same clock minute remain distinct. The saved
mechanical record supports:

- origin, intensity, radius, created/expiry tick, and duration;
- sound/frequency/material tag;
- source category, action, actor/entity, faction, and owner;
- arbitrary stimulus tags;
- whether identity may be revealed;
- compact or expanded propagation mode.

Normal and stealth steps use the categories `movement_normal` and
`movement_stealth`. Movement does not reveal source identity. Player movement
writes a compact pulse per accepted fine step; followers emit their own compact
pulses on the existing macro-step follower cadence so a party remains audible
without reintroducing a full-map propagation allocation on every fine step.

The same general dispatcher is available to doors, containers, item pickup and
drop, attacks, active skills, movable-object impacts, emotional yelling,
simulation processes, chemistry/global verbs, and authored scripts. Studio's
`Emit Mechanical Sound` action is deliberately separate from `Play Sound`.

### 2.2 Propagation and scoring

Compact movement and scripted pulses store one origin field. A listener
computes deterministic distance falloff and traces the cells between origin
and listener. Walls, LOS/movement blockers, blocking placements, and closed
doors reduce the result; an open path transmits more. Expanded legacy/runtime
sound fields remain supported and can be read directly at the listener cell.

The current defaults, authored in macro-cell units, are:

| Setting | Default |
| --- | ---: |
| Normal movement loudness | `2.4` |
| Stealth noise multiplier | `0.30` |
| Stealth speed multiplier | `0.55` |
| Accelerated/running noise multiplier | `1.65` |
| Attenuation per cell | `1.0` |
| Barrier reduction per obstruction | `0.28` |
| Party rule | `collective` |

Default surface multipliers cover floor, stone, soil, grass, water, metal,
Glass, debris, and soft ground. Authors may add more keys. Accelerated movement
is a forward-compatible tuning value; normal and stealth movement are the two
fully demonstrated modes in this phase.

### 2.3 Hearing profiles

Sound is evaluated by the existing entity sensory profile. Each channel can
author:

- accepted stimulus kinds and required tags;
- ignored tags and per-tag sensitivity multipliers;
- range, threshold, and overall sensitivity;
- repeated-sound gain;
- positional uncertainty;
- normal, reduced, or ignored barrier response;
- memory and search duration at the enclosing profile level.

A custom profile with no `sound` channel is deaf. Legacy entities without an
authored profile use the standard fallback, which contains ordinary illuminated
sight, ordinary hearing, and environmental-danger channels. Sound channels
may not live-track targets; Studio validation rejects that contradiction.

### 2.4 Evidence, suspicion, and search

The Stage 4 perception resolver converts active sound fields to stimuli,
applies the listener's filters and attenuation, and selects evidence
deterministically. Fresh repeated sounds can add bounded confidence. Re-reading
the same still-active pulse cannot repeatedly inflate suspicion.

The existing awareness states remain authoritative:

- `oblivious`;
- `suspicious`;
- `searching`;
- `combat` after valid visual/combat confirmation.

Hearing stores separate `last_heard_position`, `last_heard_tick`, and
`last_heard_sequence` fields. Sight stores `last_seen_position` and
`last_seen_tick`. The current `perception_evidence_driver` reports whether
hearing, sight, a tracked source, or an environmental hazard drives behavior.
Even when an authored sound may reveal identity, it never grants a live target
lock.

A qualifying sound creates or updates the existing perception investigation
task. The actor travels to the estimated evidence cell, checks a small
deterministic local route, and gives up when its search/memory expires without
new evidence. Positional uncertainty may move the estimated target to a nearby
walkable cell. A newer fresh sound may replace the old target; the player's
unheard later movement cannot.

### 2.5 Performance contract

- Movement uses compact origin pulses rather than allocating a propagated
  field at every cell in the radius.
- Per-cell environment history remains capped by the existing field retention
  policy.
- Exploration perception keys movement on a stimulus-sequence bucket at macro
  cadence. Every fine step remains recorded mechanically, while the expensive
  full perception/LOS solve is not repeated for every fine-grid input pulse.
- All listeners consume one shared perception snapshot; rendering reads that
  result instead of performing a second solve.

## 3. Player stealth stance

The stance is toggled explicitly with **C** or the **Sneak / Stand** button. A
stance card shows Normal/Stealth, Normal/Quiet steps, and Full pace/Slower.
Browser-test attributes on the Play root expose the stance, movement-noise
mode, and collective party rule without making hidden enemy numbers part of
the production HUD.

While stealth is active:

- held and tapped movement use the authored slower cadence;
- exploration movement also spends proportionally more world energy;
- movement pulses use the authored quieter multiplier, but never become
  mathematically silent;
- player and follower movement use the same collective stance;
- doorway assistance does not silently open a door;
- attacks, active skills, overwatch, throws, global verbs, Act, dialogue,
  doors, containers, switches, item pickup/drop/use, workstations, and other
  world interactions are blocked.

The UI and the V1 dispatch layer both enforce the rule. A script/system path
may opt into the explicit `bypassPlayerStealth` escape hatch; ordinary player
input does not. A blocked action leaves stealth active and produces a warning,
log message, and popup such as:

> Exit stealth mode to do that.

Waiting remains available. Manual exit immediately restores ordinary action
availability. The stance may be used in tactical play where the existing input
gate permits it, but it never ends combat or erases prior awareness.

## 4. Save, refresh, and lifecycle behavior

The following are ordinary `PlaySave` data and therefore participate in save
slots, V1/V2 normalization, browser autosave, and JSON round trips:

- `player_stealth.active` and `changed_at_tick`;
- active sound fields and their source/sequence metadata in map deltas;
- per-actor last-heard, last-seen, alert, evidence-driver, and search state;
- active NPC investigation tasks and local-search progress.

The runtime autosave coalesces writes for 250 ms and flushes on `pagehide`, so
rapid movement does not synchronously serialize the full save on every store
update. A browser refresh restores the current stance and hearing state.

A genuinely new game starts in Normal stance. Beginning a new expedition also
resets the stance to Normal and clears expedition tactical state through the
existing lifecycle operator. Authored movement/hearing settings and entity
sensory profiles remain package data and survive package export/import.

## 5. Studio authoring

### Game → Player

The **Movement, hearing, and stealth** section authors normal loudness, stealth
noise and speed multipliers, accelerated movement multiplier, attenuation,
barrier reduction, built-in/custom surface modifiers, and the collective party
rule. The same resolver is used by Studio preview and Play.

### Entities → Sensory Profile

Authors can use Standard, Sight-dominant, Hearing-dominant,
Light/Glass-sensitive, or Deaf presets, then edit every channel field listed in
section 2.3. Deafness is represented cleanly by the absence of a sound channel.

### Events → Cutscenes

`Emit Mechanical Sound` authors the source entity, source cell, macro loudness,
tag, category, material, duration, stimulus tags, and identity-reveal policy.
It creates simulation evidence without requiring an audio asset. `Play Sound`
remains the independent audible presentation action.

### Validation

The Studio project validator reports invalid movement ranges, malformed
surface modifiers, duplicate sensory-channel IDs, sound live-tracking,
unsupported hearing source locks, invalid repeated-sound gain, invalid
positional uncertainty, and invalid tag multipliers.

## 6. Feedback and debug tooling

Production feedback stays qualitative:

- the stance card explains the player's current movement commitment;
- blocked actions state that stealth must be exited;
- an enemy's first escalation can produce a facing/reaction bark and popup;
- the **Detection** card uses restrained states such as “Something stirs” and
  “They are searching,” without exposing exact hidden scores.

The always-available **Senses** debug toggle adds exact verification data:

- sound-origin/radius rings (cyan for ordinary sound, violet for stealth);
- observer, sensory profile, channel, cause, alertness, score, evidence cell,
  and evidence tick;
- actor evidence badges/tethers supplied by the existing perception overlay;
- separate last-heard, last-seen, investigation target, and current evidence
  driver in saved actor state.

The 3D sound-ring layer is capped to the newest 16 sound stimuli and is rendered
only while the debug toggle is active.

## 7. Browser QA scenario

Use the QA hub's **To Perception** route and enter `qa_perception_lab`. The room
has zero ambient light, a stone control lane, a soft-ground lane, a wall/L-baffle,
a pushable noise crate, a portable Glass lamp, an ordinary-hearing observer, a
hearing-dominant hunter, a Deaf Visual Sentinel, and a Glass-sensitive watcher.

1. Enable **Senses** and begin at the dark south spawn.
2. Walk the stone route normally while outside visual LOS. Confirm compact
   footstep rings and a hearing-driven suspicious/investigating response.
3. Stop. Confirm the observer approaches/searches the last-heard cell rather
   than following the player without new evidence.
4. Move again and confirm a fresh pulse may update the investigation target.
5. Let suspicion/search decay, press **C**, and repeat the route. Confirm the
   stance card, slower cadence, smaller radius, and meaningfully shorter
   detection distance.
6. Compare the ordinary observer with the hearing-dominant hunter; the latter
   may still hear stealth movement. Confirm the Deaf Visual Sentinel ignores
   sound alone.
7. While still in stealth, attempt **Act**, item pickup/drop, a skill, an
   attack, and a throw. Each must be blocked with readable feedback and must
   leave the stance active.
8. Press **C** again. Confirm the same actions are available immediately.
9. Enter an illuminated sight lane while stealthing. Confirm ordinary visual
   acquisition still works and overrides hearing uncertainty.
10. Push or strike the west crate. Confirm the impact produces a stronger
    response than walking. Compare the open route with the wall/L-baffle path.
11. Save, refresh, and load. Confirm stance, last-heard/last-seen state, and
    active investigation are not corrupted.
12. Repeat the same setup from Studio preview and confirm the configured
    values and outcomes match Play.

The focused automated contract also constructs the same route with an authored
closed door and verifies that opening the door increases the received score.

## 8. Acceptance checklist

### Implemented contract

- [x] Ordinary player movement emits explicit mechanical sound.
- [x] Followers emit their own sound under one collective stance rule.
- [x] Distance, surfaces, barriers, channel range, threshold, sensitivity,
  filters, and repeated-sound tuning are data-driven.
- [x] Hearing-capable unseen enemies can become suspicious and investigate.
- [x] Hearing stores last-heard evidence separately from last-seen evidence.
- [x] Sound never grants permanent live player tracking.
- [x] Investigation performs a finite local search and decays without evidence.
- [x] Stealth is explicit, slower, quieter, restrictive, and never perfectly
  silent.
- [x] Stealth does not alter visual detection or clear existing awareness.
- [x] Prohibited actions are blocked in UI and engine dispatch without
  silently exiting the stance.
- [x] Manual exit restores ordinary actions.
- [x] Stance, sound evidence, and investigation state serialize in `PlaySave`.
- [x] Studio authors movement/hearing values, sensory profiles, and scripted
  mechanical sound without direct JSON editing.
- [x] Debug tooling distinguishes hearing from sight and shows evidence cells.
- [x] The QA Perception Lab contains ordinary, strong, and deaf hearing cases,
  two surface routes, occlusion, a loud object, darkness, and illumination.

### Release verification gate

- [ ] The focused hearing/stealth contract passes.
- [ ] TypeScript and production build pass.
- [ ] Save, package, and Studio/Play parity tests pass.
- [ ] The complete existing automated suite passes.
- [ ] The complete audit suite passes.
- [ ] The browser scenario in section 7 passes from beginning to end.

Do not declare the phase complete until every release-gate item is confirmed in
the implementation handoff.

## 9. Verification commands

Focused implementation checks:

```bash
npm run typecheck
npm run test:hearing-stealth
npm run test:perception
npm run test:engine
npm run test:suite
```

Persistence and Studio/Play parity:

```bash
npm run test:save-roundtrip
npm run test:package-roundtrip
npm run test:studio-runtime-support
npm run test:studio-play
```

Final regression and audit gate:

```bash
npm run test:all
npm run audit:all
npm run build
```

