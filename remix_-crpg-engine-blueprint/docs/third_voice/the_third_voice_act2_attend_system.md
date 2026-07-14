# THE THIRD VOICE — ACT 2: GAMEPLAY & THE ATTEND SYSTEM
### The mechanic, the enemies, the side quests, the feedback. Built from walk / interact / fight / cutscene / quest + one authored dialogue layer.

**Status:** Systems + content spec for Act 2, paired with the scene spec (`act2_the_road`). Defines how Attend works as playable, what you fight, what you can attend instead, the side quests, and how it all feeds the ending. No exotic systems — Attend is an authored dialogue layer with scored options; everything else is standard CRPG verbs.

**Authority note:** for The Third Voice's Attend behavior, this spec supersedes the older master-plan simplification where they conflict. The hidden score is still stored as `faction_rep.the_road`; the older engine `attend_node` / numeric Attention UI is not player-facing in this game.

---

## 1. ATTEND — THE CORE MECHANIC

**Attend is a conversation you can do well or badly.** Entering Attend on a valid target opens a dialogue layer with new options. The options are typed; choosing them moves a hidden **attention score**. Attending is a *skill you perform*, not a button that grants truth — a player can go through the motions and gain nothing, or attend cynically and come out *worse.*

### 1.1 Rules
- **Once per target, ever.** No retries, no savescum-farming. Every attend is a real, final decision.
- **The score is hidden.** Never shown as a number or bar. A visible score becomes a thing to farm, which is the Grid's own logic.
- **Feedback is diegetic:** *"The road remembers that."* The road/world is the voice of the feedback — ambient, slightly menacing, never neutral system text.
  - True reading chosen: *"The road remembers that."* / *"Something eases."* / a soft cue, portrait steadies.
  - Grid/flattering reading: *"The road remembers that too."* / a wrong note in the score / portrait flickers.
  - Surface/hasty: the attend just closes; no line.
- **The score can go DOWN.** Improper attending actively lowers it.
- **No floor.** A player can attend everything wrong, or never truly attend at all, and reach the fully blind ending.

### 1.2 Option Types
Each attend presents a mix of typed options, never labeled to the player:
- **TRUE** — the small, hard, honest note under the surface. Raises score. Unlocks deeper dialogue/lore.
- **GRID** — the flattering, useful, self-serving, or hasty-comforting reading. Lowers score. Dead-ends the conversation.
- **SURFACE** — dismissive or shallow. Neutral. Closes the attend early with nothing gained.
- **EXIT** — backs out. Neutral, but the target's one-shot Attend is spent.

Deeper content gates on prior TRUE choices: attending well opens more conversation; attending badly closes doors.

---

## 2. ATTEND IN COMBAT — Attack, Attend, Or Both

The road's enemies are **shadow-antibodies** — protective forms, guarding illegible things. In combat the player chooses:

| Action | Cost | Reward | Truth |
|---|---|---|---|
| **Attack** | fast | fanfare, XP, loot | secretly wrong — you destroyed a protection |
| **Attend** properly | slow, no fanfare | learn what it guards; enemy becomes an interactable NPC; attention up | secretly right |

Mandatory combat exists. Some enemies cannot be attended — too far gone, already forced by the scene, or genuine hostiles. The fracture is unattendable except for Edda.

Once an enemy has been properly attended, the game must not offer an authored attack path against that target. Understanding converts the encounter back into a person/thing you can interact with, not a reward-bearing enemy.

---

## 3. SIDE QUEST SHAPE

Every side quest has the same double shape: **a Grid-rewarded solution** (act / kill / fix, with fanfare and loot) and **an Attend solution** (witness, leave it, no conventional reward, hidden attention up).

- **Hobb:** killing the Death-Shadow closes him; attending him reveals the shadow is mercy.
- **Ticket Saint 14:** kicking fixes the machine; attending consoles the overworked counting thing.
- **Aven / Perfect Townsfolk:** fetch task rewards normally; attending recognizes the horror of a finished mind.
- **Shrine:** cleansing makes a Grid node; attending the shadows leaves it unreadable.
- **Jory / Friend:** Attend returns nothing. No score. No ROAD line. The silence is the content.

---

## 4. ENDING GATE

The final act is unavoidable. Hidden attention changes only how much Mike understands:

- **High:** full understanding.
- **Mid:** partial dawning.
- **Low / negative:** blind ending. Mike destroys the Mender comprehending nothing.

Attention buys understanding, never escape.
