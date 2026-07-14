// Animated GIF sprite library. Full-frame character/enemy loops served from
// public/sprites/third_voice/people_horrors and registered in every package's
// sprite_library so they are available to bind to entities, the player, or
// objects in the editor. These are asset data only — no game content.
import type { SpriteData } from "../schema/game";

const ASSET_BASE = "/sprites/third_voice/people_horrors";

type GifRow = {
  row: number;
  start: number;
  end: number;
  width: number;
  height: number;
  role: "Character" | "Enemy";
};

const GIF_ROWS: GifRow[] = [
  { row: 1, start: 1, end: 22, width: 208, height: 316, role: "Character" },
  { row: 2, start: 23, end: 44, width: 192, height: 328, role: "Character" },
  { row: 3, start: 45, end: 66, width: 236, height: 332, role: "Character" },
  { row: 4, start: 67, end: 88, width: 212, height: 328, role: "Character" },
  { row: 5, start: 89, end: 110, width: 208, height: 328, role: "Character" },
  { row: 6, start: 111, end: 132, width: 228, height: 332, role: "Enemy" },
  { row: 8, start: 149, end: 163, width: 280, height: 356, role: "Enemy" },
  { row: 9, start: 164, end: 177, width: 284, height: 372, role: "Enemy" },
];

const pad = (value: number, length: number) => value.toString().padStart(length, "0");

export const peopleHorrorSpriteId = (index: number, row: number) =>
  `tv_people_horror_${pad(index, 3)}_row${pad(row, 2)}`;

const gifFileName = (index: number, row: number) =>
  `sprite_${pad(index, 3)}_row${pad(row, 2)}.gif`;

export const PEOPLE_HORROR_SPRITES: SpriteData[] = GIF_ROWS.flatMap((row) =>
  Array.from({ length: row.end - row.start + 1 }, (_, offset) => {
    const index = row.start + offset;
    return {
      id: peopleHorrorSpriteId(index, row.row),
      display_name: `Animated ${row.role} ${pad(index, 3)} Row ${pad(row.row, 2)}`,
      width: row.width,
      height: row.height,
      pixels: [],
      data_url: `${ASSET_BASE}/${gifFileName(index, row.row)}`,
      animated: true,
    };
  }),
);
