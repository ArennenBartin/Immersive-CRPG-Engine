// ── First arrival in the Lonely Street house ────────────────────────────────
// Plays once, on load, the first time Steve steps inside. Two beats separated
// by a fade: the doorway greeting, then the pair already sitting on the couch.
//
// The seated half is staged, not simulated. Steve's authoritative cell stays on
// the walkable floor in front of the sofa for the whole scene — exactly the
// invariant Riley's presentation anchor keeps (see rileyAssets) — and only the
// rendered body moves onto the cushion. Nothing here may put an actor inside
// the sofa's collision footprint.

// Deliberately imports nothing from ./qaSuite/lonelyStreetWing: the wing pulls
// this scene in, so reaching back would make a module cycle and evaluate these
// constants in the temporal dead zone.
import type { CutsceneData, GamePackage, MapData } from "../schema/game";
import { RILEY_SOFA_SEATED_CELL } from "./rileyAssets";

export const HOUSE_ARRIVAL_CUTSCENE_ID = "cut_lonely_street_house_arrival";
export const HOUSE_ARRIVAL_GREETING_DIALOGUE_ID = "dlg_house_arrival_greeting";
export const HOUSE_ARRIVAL_COUCH_DIALOGUE_ID = "dlg_house_arrival_couch";
export const HOUSE_ARRIVAL_SONG_DIALOGUE_ID = "dlg_house_arrival_song";
export const HOUSE_ARRIVAL_TRIGGER_ID = "trg_lonely_street_house_arrival";
export const HOUSE_ARRIVAL_SONG_URL =
  "/music/moving-through-the-light-mastered.ogg";
/** Set for the rest of the run once the pair are on the couch. */
export const HOUSE_ARRIVAL_SEATED_SWITCH = "steve_seated_on_couch";
/** Set the moment the scene has played, so it never repeats. */
export const HOUSE_ARRIVAL_SEEN_SWITCH = "house_arrival_scene_seen";

// Steve takes the cushion to Riley's right. Her anchor is local x = -0.57 on a
// 2.56 m sofa, so the mirrored seat keeps both bodies on cushions rather than
// on an arm.
//
// Do not mirror Riley's Y/Z values: Steve's seated FBX has its rear contact
// point 0.4164 m above and 0.1006 m behind the model root. The measured cushion
// top is 0.6402 m, which puts Steve's root at 0.2238 m (rounded to 0.22). The
// pillow's front face is local Z 0.305; local Z 0.50 puts Steve's back just in
// front of it and leaves his rear contact point on the cushion's front edge.
// Riley's rig has different root-to-seat spacing and retains its own anchor.
export const STEVE_SOFA_SEATED_LOCAL_POSITION: [number, number, number] = [
  0.57, 0.22, 0.5,
];
export const STEVE_SOFA_SEATED_LOCAL_FACING: [number, number] = [0, 1];
// One tile out from the sofa, beside Riley's own floor anchor: a legal footprint
// centre that keeps Steve clear of the sofa's collision.
export const STEVE_SOFA_SEATED_CELL: [number, number] = [
  RILEY_SOFA_SEATED_CELL[0] + 1,
  RILEY_SOFA_SEATED_CELL[1],
];
// Once Steve stands, move his authoritative body a full tile away from the
// couch/table seam. This is a separate navigation anchor, not the visual seat
// anchor: every forward footprint cell from here is verified walkable.
export const STEVE_SOFA_STANDING_CELL: [number, number] = [
  STEVE_SOFA_SEATED_CELL[0],
  STEVE_SOFA_SEATED_CELL[1] + 1,
];

// The reverse shot, kept as data so the cutscene verb and the held shot that
// survives it cannot drift apart. Macro cells; the runtime converts to fine.
export const STEVE_SOFA_SEATED_SHOT_CELL: [number, number] = [
  RILEY_SOFA_SEATED_CELL[0],
  RILEY_SOFA_SEATED_CELL[1] - 1,
];
export const STEVE_SOFA_SEATED_SHOT_FACING: [number, number] = [0, -1];

const beat = (
  id: string,
  speaker: string,
  text: string,
  nextNodeId?: string,
) => ({
  id,
  speaker,
  text,
  options: [{ text: "…", ...(nextNodeId ? { next_node_id: nextNodeId } : {}) }],
});

export const HOUSE_ARRIVAL_GREETING_DIALOGUE: GamePackage["dialogue"][number] = {
  id: HOUSE_ARRIVAL_GREETING_DIALOGUE_ID,
  display_name: "Riley — first arrival",
  format: "tree_v1",
  nodes: [
    beat("greet", "Riley", "Hey, Steve!", "hi"),
    beat("hi", "Steve", "Riley! Hi... o-OH.", "check"),
    beat("check", "Steve", "Riley, are you... all... good?", "fine"),
    beat("fine", "Riley", "Oh, yeah I'm good, things are fire actually.", "tell"),
    beat("tell", "Steve", "Yeah... I can... tell.", "smile"),
    beat("smile", "Riley", ":)"),
  ],
};

export const HOUSE_ARRIVAL_COUCH_DIALOGUE: GamePackage["dialogue"][number] = {
  id: HOUSE_ARRIVAL_COUCH_DIALOGUE_ID,
  display_name: "Riley — on the couch",
  format: "tree_v1",
  nodes: [
    beat("music", "Riley", "So what have you been listening to lately?", "head_static"),
    beat("head_static", "Steve", "(in his head) @#@*!&#*@", "well"),
    beat("well", "Steve", "Well you see...", "smile"),
    beat("smile", "Riley", ":)", "made_song"),
    beat("made_song", "Steve", "I made this song.", "finally"),
    beat("finally", "Riley", "Finally! It's been so long!", "with_ai"),
    beat("with_ai", "Steve", "With AI.", "come_on"),
    beat("come_on", "Riley", ":(, Steve, c'mon.", "chance"),
    beat("chance", "Steve", "Just give it a chance.", "aux"),
    beat("aux", "Steve", "*Steve plugs into the aux*"),
  ],
};

export const HOUSE_ARRIVAL_SONG_DIALOGUE: GamePackage["dialogue"][number] = {
  id: HOUSE_ARRIVAL_SONG_DIALOGUE_ID,
  display_name: "Riley — Moving Through the Light",
  format: "tree_v1",
  nodes: [
    beat("good", "Riley", "It's good-", "pleased"),
    beat("pleased", "Steve", ":)", "not_you"),
    beat("not_you", "Riley", "But it doesn't sound like YOU, y'know?", "lost_voice"),
    beat("lost_voice", "Steve", "I don't know what I sound like anymore.", "silence"),
    beat("silence", "Riley", "...", "happy"),
    beat("happy", "Riley", "I'm happy to see you, Steve.", "thanks"),
    beat("thanks", "Steve", "Thanks...", "basement"),
    beat("basement", "Riley", "Hey, I have a 15 pack in the basement.", "favor"),
    beat("favor", "Riley", "Mind grabbing it?", "hell_yeah"),
    beat("hell_yeah", "Steve", "Hell yeah, Riley"),
  ],
};

export const HOUSE_ARRIVAL_DIALOGUES: GamePackage["dialogue"] = [
  HOUSE_ARRIVAL_GREETING_DIALOGUE,
  HOUSE_ARRIVAL_COUCH_DIALOGUE,
  HOUSE_ARRIVAL_SONG_DIALOGUE,
];

export const HOUSE_ARRIVAL_CUTSCENE: CutsceneData = {
  id: HOUSE_ARRIVAL_CUTSCENE_ID,
  display_name: "Lonely Street house — first arrival",
  is_blocking: true,
  actions: [
    // Crossing the threshold ends the opening/approach score before Riley's
    // first shot. Omitting a music id/url is the cutscene verb for Stop Music.
    { type: "play_music" },
    // Steve is through the door; the shot finds Riley on the sofa. `facing` is
    // the direction the CAMERA looks: [0, -1] means it stands south of her and
    // looks north at the couch. Without a facing this stays a plain focus pan.
    //
    // Target the SOFA line, not Riley's own cell: her cell is a tile further
    // south, which pushes the eye back through the south wall.
    {
      type: "camera_pan",
      cell: [STEVE_SOFA_SEATED_SHOT_CELL[0], STEVE_SOFA_SEATED_SHOT_CELL[1]],
      facing: [...STEVE_SOFA_SEATED_SHOT_FACING] as [number, number],
      duration: 1400,
    },
    { type: "show_dialogue", dialogue_id: HOUSE_ARRIVAL_GREETING_DIALOGUE_ID },
    { type: "screen_fade", fade: "out", color: "#000000", duration: 700 },
    { type: "wait", duration: 1000 },
    // Re-open already seated. The cell is the floor anchor; the seated switch
    // is what moves the rendered body onto the cushion.
    // Same-map reposition: omitting map_id keeps this a move, not a map load.
    {
      type: "teleport_player",
      cell: [STEVE_SOFA_SEATED_CELL[0], STEVE_SOFA_SEATED_CELL[1]],
      facing: [0, 1],
    },
    { type: "set_switch", switch_id: HOUSE_ARRIVAL_SEATED_SWITCH, switch_value: true },
    // The reverse shot: stand in front of the couch and look back north at the
    // pair. Same framing the held shot uses once the cutscene releases.
    {
      type: "camera_pan",
      cell: [STEVE_SOFA_SEATED_SHOT_CELL[0], STEVE_SOFA_SEATED_SHOT_CELL[1]],
      facing: [...STEVE_SOFA_SEATED_SHOT_FACING] as [number, number],
      duration: 0,
    },
    { type: "screen_fade", fade: "in", color: "#000000", duration: 700 },
    { type: "show_dialogue", dialogue_id: HOUSE_ARRIVAL_COUCH_DIALOGUE_ID },
    {
      type: "play_music",
      music_url: HOUSE_ARRIVAL_SONG_URL,
      volume: 0.7,
    },
    { type: "show_dialogue", dialogue_id: HOUSE_ARRIVAL_SONG_DIALOGUE_ID },
    { type: "set_switch", switch_id: HOUSE_ARRIVAL_SEEN_SWITCH, switch_value: true },
    // Stand Steve, then move his authoritative body away from the cramped
    // couch/table seam before returning control. This also resets facing after
    // the dialogue so Forward is guaranteed to enter the open room.
    { type: "set_switch", switch_id: HOUSE_ARRIVAL_SEATED_SWITCH, switch_value: false },
    {
      type: "move_player",
      cell: [STEVE_SOFA_STANDING_CELL[0], STEVE_SOFA_STANDING_CELL[1]],
      facing: [0, -1],
    },
    // The cutscene remains blocking during the camera handoff and returns
    // control as soon as this final action completes.
    { type: "camera_pan", duration: 700 },
  ],
};

/** Single source of truth: the wing authors this, hydration reinstalls it. */
export const HOUSE_ARRIVAL_TRIGGER: MapData["triggers"][number] = {
  id: HOUSE_ARRIVAL_TRIGGER_ID,
  type: "on_load",
  cutscene_id: HOUSE_ARRIVAL_CUTSCENE_ID,
  once: true,
  conditions: [],
};

// The sofa placement sits at macro (-2, 0), i.e. world (-2, 0). Duplicated
// rather than imported for the same cycle reason noted at the top of the file.
const SOFA_PLACEMENT_WORLD: [number, number] = [-2, 0];

/**
 * World offset from Steve's authoritative cell to his seat on the cushion.
 *
 * Applied OUTSIDE the visual yaw group, so it is plain world space and stays
 * correct whatever facing the seated body takes.
 */
export const STEVE_SOFA_SEATED_RENDER_OFFSET: [number, number, number] = [
  SOFA_PLACEMENT_WORLD[0] +
    STEVE_SOFA_SEATED_LOCAL_POSITION[0] -
    STEVE_SOFA_SEATED_CELL[0],
  STEVE_SOFA_SEATED_LOCAL_POSITION[1],
  SOFA_PLACEMENT_WORLD[1] +
    STEVE_SOFA_SEATED_LOCAL_POSITION[2] -
    STEVE_SOFA_SEATED_CELL[1],
];
