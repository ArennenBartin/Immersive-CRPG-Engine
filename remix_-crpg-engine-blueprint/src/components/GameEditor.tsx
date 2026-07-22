// ── Game panel ───────────────────────────────────────────────────────────────
// The authoring hub for everything that used to be code-only: game identity,
// player start kit, audio registries, dialogue portraits, the switch registry,
// factions, ambient barks, endings, and custom chemistry materials. Each tab
// edits plain package data; nothing here requires touching code.
import React, { useMemo, useState } from "react";
import {
  Settings2,
  User,
  Music,
  ImageIcon,
  ToggleLeft,
  Landmark,
  MessagesSquare,
  Flag,
  History,
  FlaskConical,
  Plus,
  Trash2,
} from "lucide-react";
import { useEngineStore } from "../store/engineStore";
import type { ConditionData, GamePackage } from "../schema/game";
import { ConditionEditor } from "./ConditionEditor";
import { CHEM_MATERIALS } from "../engine-core/chemistry";
import { previewIntercessorNames } from "../engine-core/intercessorSuccession";
import {
  DEFAULT_MOVEMENT_HEARING_SETTINGS,
  resolveMovementHearingSettings,
} from "../engine-core/hearingStealth";

type Bark = GamePackage["barks"][number];

const TABS = [
  { id: "basics", label: "Basics", icon: Settings2 },
  { id: "player", label: "Player", icon: User },
  { id: "campaign", label: "Campaign", icon: History },
  { id: "audio", label: "Audio", icon: Music },
  { id: "portraits", label: "Portraits", icon: ImageIcon },
  { id: "switches", label: "Switches", icon: ToggleLeft },
  { id: "factions", label: "Factions", icon: Landmark },
  { id: "barks", label: "Barks", icon: MessagesSquare },
  { id: "endings", label: "Endings", icon: Flag },
  { id: "chemistry", label: "Chemistry", icon: FlaskConical },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors";
const smallBtn =
  "rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors";

const confirmDelete = (kind: string, name?: string, consequence?: string) =>
  window.confirm(
    `Delete ${kind}${name ? ` \"${name}\"` : ""}?\n\n${
      consequence ? `${consequence}\n\n` : ""
    }This cannot be undone.`,
  );

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-neutral-400 font-medium tracking-wide">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-600 leading-snug">{hint}</span>}
    </label>
  );
}

function Section({ title, hint, children, action }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
          {hint && <p className="mt-1 text-xs text-neutral-500 leading-snug">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Walk a condition tree collecting every switch id it references.
const collectConditionSwitches = (condition: ConditionData | undefined, out: Set<string>) => {
  if (!condition) return;
  if (condition.switch) out.add(condition.switch);
  if (condition.not) collectConditionSwitches(condition.not, out);
  for (const child of condition.all || []) collectConditionSwitches(child, out);
  for (const child of condition.any || []) collectConditionSwitches(child, out);
};

// Every switch id referenced anywhere in the package (dialogue options,
// cutscene actions + branches, triggers, exits, shops, entity hooks). Used to
// surface undeclared switches so authors can adopt them into the registry.
export const collectReferencedSwitches = (pkg: GamePackage): Set<string> => {
  const refs = new Set<string>();
  for (const dialogue of pkg.dialogue) {
    for (const node of dialogue.nodes || []) {
      for (const option of node.options || []) {
        if (option.set_switch) refs.add(option.set_switch);
        if (option.required_switch) refs.add(option.required_switch);
        for (const sw of option.set_switches || []) refs.add(sw.switch_id);
        collectConditionSwitches(option.condition, refs);
      }
    }
  }
  for (const cutscene of pkg.cutscenes) {
    for (const action of cutscene.actions || []) {
      if (action.switch_id) refs.add(action.switch_id);
      collectConditionSwitches(action.condition, refs);
    }
  }
  for (const map of pkg.maps) {
    for (const trigger of map.triggers || []) {
      for (const legacy of trigger.conditions || []) refs.add(legacy.switch_id);
      collectConditionSwitches(trigger.condition, refs);
    }
    for (const exit of map.exits || []) collectConditionSwitches(exit.condition, refs);
  }
  for (const shop of pkg.shops) {
    for (const entry of shop.items || []) {
      collectConditionSwitches(entry.condition, refs);
      for (const mod of entry.price_modifiers || []) collectConditionSwitches(mod.condition, refs);
    }
  }
  for (const entity of pkg.entities) {
    const e = entity as Record<string, unknown>;
    for (const key of ["combat_attend_switch", "combat_attend_success_switch", "on_defeat_switch"]) {
      if (typeof e[key] === "string" && e[key]) refs.add(e[key] as string);
    }
  }
  return refs;
};

export function GameEditor() {
  const { gamePackage, setGamePackage, updateSettings } = useEngineStore();
  const [tab, setTab] = useState<TabId>("basics");

  const settings = (gamePackage.settings || {}) as Record<string, any>;
  const patchPackage = (updates: Partial<GamePackage>) =>
    setGamePackage({ ...gamePackage, ...updates });
  const patchMetadata = (updates: Partial<GamePackage["metadata"]>) =>
    patchPackage({ metadata: { ...gamePackage.metadata, ...updates } });

  const startMap = gamePackage.maps.find((map) => map.id === gamePackage.metadata.start_map_id);
  const musicIds = Object.keys((settings.music_tracks || {}) as Record<string, string>);

  return (
    <div className="h-full w-full overflow-y-auto bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl p-4 lg:p-8 space-y-6">
        <header className="border-b border-neutral-800 pb-4">
          <h2 className="text-xl font-semibold text-white">Game</h2>
          <p className="text-sm text-neutral-400">
            Identity, player start, audio, portraits, switches, factions, barks, endings, chemistry — the whole
            package, no code required.
          </p>
        </header>

        <nav className="flex flex-wrap gap-1.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab === entry.id
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
              }`}
            >
              <entry.icon className="h-4 w-4" />
              {entry.label}
            </button>
          ))}
        </nav>

        {tab === "basics" && (
          <div className="space-y-6">
            <Section title="Identity" hint="Shown on the title screen and end screen.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Title">
                  <input
                    className={inputCls}
                    value={gamePackage.metadata.title}
                    onChange={(e) => patchMetadata({ title: e.target.value })}
                  />
                </Field>
                <Field label="Version">
                  <input
                    className={inputCls}
                    value={gamePackage.metadata.version}
                    onChange={(e) => patchMetadata({ version: e.target.value })}
                  />
                </Field>
                <Field label="End screen title" hint="Fallback when a game_end action has no ending.">
                  <input
                    className={inputCls}
                    value={settings.end_title || ""}
                    placeholder="The End"
                    onChange={(e) => updateSettings({ end_title: e.target.value || undefined })}
                  />
                </Field>
                <Field label="Title image URL" hint="Optional splash art behind the title.">
                  <input
                    className={inputCls}
                    value={settings.title_image_url || ""}
                    placeholder="https://… or data:image/…"
                    onChange={(e) => updateSettings({ title_image_url: e.target.value || undefined })}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Where the game starts">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Start map">
                  <select
                    className={inputCls}
                    value={gamePackage.metadata.start_map_id}
                    onChange={(e) => {
                      const map = gamePackage.maps.find((m) => m.id === e.target.value);
                      patchMetadata({
                        start_map_id: e.target.value,
                        start_spawn_id: map?.spawns[0]?.id || gamePackage.metadata.start_spawn_id,
                      });
                    }}
                  >
                    {gamePackage.maps.map((map) => (
                      <option key={map.id} value={map.id}>
                        {map.display_name || map.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start spawn">
                  <select
                    className={inputCls}
                    value={gamePackage.metadata.start_spawn_id}
                    onChange={(e) => patchMetadata({ start_spawn_id: e.target.value })}
                  >
                    {(startMap?.spawns || []).map((spawn) => (
                      <option key={spawn.id} value={spawn.id}>
                        {spawn.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="World clock">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Start hour (0–23)">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className={inputCls}
                    value={settings.clock_start_hour ?? 9}
                    onChange={(e) => updateSettings({ clock_start_hour: parseInt(e.target.value, 10) || 0 })}
                  />
                </Field>
                <Field label="Minutes per turn">
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={settings.minutes_per_turn ?? 5}
                    onChange={(e) => updateSettings({ minutes_per_turn: parseInt(e.target.value, 10) || 0 })}
                  />
                </Field>
              </div>
            </Section>
          </div>
        )}

        {tab === "player" && (
          <div className="space-y-6">
            <Section title="Starting stats">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(["hp", "max_hp", "mp", "max_mp", "attack", "defense", "speed", "energy"] as const).map((key) => (
                  <Field key={key} label={key.replace(/_/g, " ").toUpperCase()}>
                    <input
                      type="number"
                      className={inputCls}
                      value={settings.player_stats?.[key] ?? ""}
                      placeholder="engine default"
                      onChange={(e) =>
                        updateSettings({
                          player_stats: {
                            ...(settings.player_stats || {}),
                            [key]: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </Section>

            <MovementHearingSection
              gamePackage={gamePackage}
              settings={settings}
              updateSettings={updateSettings}
            />

            <Section title="Appearance">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Player sprite">
                  <select
                    className={inputCls}
                    value={settings.player_sprite_id || ""}
                    onChange={(e) => updateSettings({ player_sprite_id: e.target.value || undefined })}
                  >
                    <option value="">-- Engine default --</option>
                    {gamePackage.sprite_library.map((sprite) => (
                      <option key={sprite.id} value={sprite.id}>
                        {sprite.display_name || sprite.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Player portrait URL" hint="Shown beside dialogue when set.">
                  <input
                    className={inputCls}
                    value={settings.player_portrait_url || ""}
                    placeholder="https://… or data:image/…"
                    onChange={(e) => updateSettings({ player_portrait_url: e.target.value || undefined })}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Known skills at start">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {gamePackage.abilities.map((skill) => {
                  const known: string[] = settings.initial_known_skills || [];
                  const checked = known.includes(skill.id);
                  return (
                    <label key={skill.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          updateSettings({
                            initial_known_skills: e.target.checked
                              ? Array.from(new Set([...known, skill.id]))
                              : known.filter((id) => id !== skill.id),
                          })
                        }
                      />
                      <span className="font-medium text-neutral-100">{skill.display_name || skill.id}</span>
                      <span className="ml-auto text-xs text-neutral-500">{skill.element}/{skill.targeting}</span>
                    </label>
                  );
                })}
                {gamePackage.abilities.length === 0 && (
                  <p className="text-sm text-neutral-500">No skills exist yet — create them in the Skills editor.</p>
                )}
              </div>
            </Section>

            <Section title="Starting party members" hint="Friendly NPCs who join before the first scene.">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {gamePackage.entities.filter((e) => e.is_npc).map((entity) => {
                  const party: string[] = settings.starting_party_members || [];
                  const checked = party.includes(entity.id);
                  return (
                    <label key={entity.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          updateSettings({
                            starting_party_members: e.target.checked
                              ? Array.from(new Set([...party, entity.id]))
                              : party.filter((id) => id !== entity.id),
                          })
                        }
                      />
                      {entity.display_name || entity.id}
                    </label>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {tab === "campaign" && (
          <CampaignTab
            gamePackage={gamePackage}
            settings={settings}
            updateSettings={updateSettings}
          />
        )}

        {tab === "audio" && (
          <AudioTab settings={settings} updateSettings={updateSettings} musicIds={musicIds} />
        )}

        {tab === "portraits" && (
          <PortraitsTab settings={settings} updateSettings={updateSettings} />
        )}

        {tab === "switches" && <SwitchesTab gamePackage={gamePackage} patchPackage={patchPackage} />}

        {tab === "factions" && <FactionsTab gamePackage={gamePackage} patchPackage={patchPackage} />}

        {tab === "barks" && <BarksTab gamePackage={gamePackage} patchPackage={patchPackage} />}

        {tab === "endings" && <EndingsTab gamePackage={gamePackage} patchPackage={patchPackage} />}

        {tab === "chemistry" && <ChemistryTab settings={settings} updateSettings={updateSettings} />}
      </div>
    </div>
  );
}

// ── Player movement, hearing, and stealth authoring ─────────────────────────
function MovementHearingSection({
  gamePackage,
  settings,
  updateSettings,
}: {
  gamePackage: GamePackage;
  settings: Record<string, any>;
  updateSettings: (updates: any) => void;
}) {
  const [newSurface, setNewSurface] = useState("");
  const resolved = resolveMovementHearingSettings(gamePackage);
  const authored = (settings.movement_hearing || {}) as Record<string, any>;
  const patchMovement = (updates: Record<string, unknown>) =>
    updateSettings({
      movement_hearing: {
        ...DEFAULT_MOVEMENT_HEARING_SETTINGS,
        ...authored,
        surface_noise_modifiers: {
          ...DEFAULT_MOVEMENT_HEARING_SETTINGS.surface_noise_modifiers,
          ...(authored.surface_noise_modifiers || {}),
        },
        ...updates,
      },
    });
  const patchSurface = (surface: string, value: number) =>
    patchMovement({
      surface_noise_modifiers: {
        ...resolved.surface_noise_modifiers,
        [surface]: Math.max(0, value),
      },
    });
  const numericField = (
    key:
      | "normal_movement_loudness"
      | "stealth_noise_multiplier"
      | "stealth_speed_multiplier"
      | "running_noise_multiplier"
      | "sound_attenuation_per_cell"
      | "barrier_reduction",
    label: string,
    hint: string,
    options: { min?: number; max?: number; step?: number } = {},
  ) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={options.min ?? 0}
        max={options.max}
        step={options.step ?? 0.05}
        className={inputCls}
        value={resolved[key]}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) patchMovement({ [key]: value });
        }}
      />
    </Field>
  );
  const standardSurfaces = [
    "default",
    "floor",
    "stone",
    "soil",
    "grass",
    "water",
    "metal",
    "glass",
    "debris",
    "soft",
  ];
  const displayedSurfaces = [
    ...standardSurfaces,
    ...Object.keys(authored.surface_noise_modifiers || {}).filter(
      (surface) => !standardSurfaces.includes(surface),
    ),
  ];

  return (
    <Section
      title="Movement, hearing, and stealth"
      hint="Mechanical sound is independent of speaker volume. These values are shared by Studio preview and Play."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {numericField(
          "normal_movement_loudness",
          "Normal movement loudness",
          "Base sound budget for an ordinary movement pulse.",
          { min: 0.05 },
        )}
        {numericField(
          "stealth_noise_multiplier",
          "Stealth noise multiplier",
          "Multiplies future movement sound while the stance is active.",
          { max: 4 },
        )}
        {numericField(
          "stealth_speed_multiplier",
          "Stealth speed multiplier",
          "Fraction of normal movement cadence while moving quietly.",
          { min: 0.1, max: 1 },
        )}
        {numericField(
          "running_noise_multiplier",
          "Accelerated movement multiplier",
          "Reserved for running or other accelerated movement modes.",
          { max: 4 },
        )}
        {numericField(
          "sound_attenuation_per_cell",
          "Attenuation per cell",
          "How quickly mechanical sound loses strength with distance.",
          { min: 0.05 },
        )}
        {numericField(
          "barrier_reduction",
          "Barrier reduction",
          "Fraction removed by each wall or closed-door obstruction (0–0.95).",
          { max: 0.95, step: 0.01 },
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium tracking-wide text-neutral-400">
          Surface noise multipliers
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {displayedSurfaces.map((surface) => (
            <div
              key={surface}
              className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2.5 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-xs capitalize text-neutral-300">
                {surface}
              </span>
              <input
                type="number"
                min={0}
                max={4}
                step={0.05}
                value={resolved.surface_noise_modifiers[surface] ?? 1}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) patchSurface(surface, value);
                }}
                className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-xs text-white outline-none focus:border-emerald-500"
              />
              {!standardSurfaces.includes(surface) && (
                <button
                  type="button"
                  title={`Remove ${surface} modifier`}
                  className="text-neutral-600 hover:text-red-400"
                  onClick={() => {
                    const next = { ...(authored.surface_noise_modifiers || {}) };
                    delete next[surface];
                    patchMovement({ surface_noise_modifiers: next });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex max-w-sm gap-2">
          <input
            className={inputCls}
            value={newSurface}
            placeholder="Add surface key…"
            onChange={(event) => setNewSurface(event.target.value)}
          />
          <button
            type="button"
            className={`${smallBtn} inline-flex items-center gap-1.5`}
            onClick={() => {
              const surface = newSurface.trim().toLowerCase();
              if (!surface) return;
              patchSurface(surface, 1);
              setNewSurface("");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-neutral-600">
          Below 1 is quieter; above 1 is louder. Terrain and material tags use the matching key when available.
        </p>
      </div>

      <Field
        label="Follower stealth rule"
        hint="The first implementation uses one party-wide stance so followers cannot silently undermine the player."
      >
        <select
          className={inputCls}
          value={resolved.party_stealth_rule}
          onChange={() => patchMovement({ party_stealth_rule: "collective" })}
        >
          <option value="collective">Collective — player and followers enter stealth together</option>
        </select>
      </Field>

      <button
        type="button"
        className={smallBtn}
        onClick={() => updateSettings({ movement_hearing: undefined })}
      >
        Restore engine defaults
      </button>
    </Section>
  );
}

// ── Campaign lifecycle helpers ──────────────────────────────────────────────
const csvValues = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const csvText = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").join(", ") : "";

function CampaignTab({
  gamePackage,
  settings,
  updateSettings,
}: {
  gamePackage: GamePackage;
  settings: Record<string, any>;
  updateSettings: (updates: any) => void;
}) {
  const policy = (settings.world_state_policy || {}) as Record<string, any>;
  const succession = (settings.intercessor_succession || {}) as Record<string, any>;
  const patchPolicy = (updates: Record<string, unknown>) =>
    updateSettings({
      world_state_policy: {
        version: 1,
        ...policy,
        ...updates,
      },
    });
  const patchSuccession = (updates: Record<string, unknown>) =>
    updateSettings({
      intercessor_succession: {
        enabled: true,
        ...succession,
        ...updates,
      },
    });
  const hubMapId = succession.hub_map_id || gamePackage.metadata.start_map_id;
  const hubMap = gamePackage.maps.find((map) => map.id === hubMapId);
  const campaignSwitches = new Set<string>(policy.campaign_switch_ids || []);
  const expeditionSwitches = new Set<string>(policy.expedition_switch_ids || []);
  const setSwitchScope = (id: string, scope: "campaign" | "expedition") => {
    const nextCampaign = new Set(campaignSwitches);
    const nextExpedition = new Set(expeditionSwitches);
    nextCampaign.delete(id);
    nextExpedition.delete(id);
    (scope === "campaign" ? nextCampaign : nextExpedition).add(id);
    patchPolicy({
      campaign_switch_ids: [...nextCampaign].sort(),
      expedition_switch_ids: [...nextExpedition].sort(),
    });
  };
  const patchPerMapIds = (key: string, mapId: string, ids: string[]) => {
    const current = (policy[key] || {}) as Record<string, string[]>;
    patchPolicy({
      [key]: {
        ...current,
        [mapId]: ids,
      },
    });
  };
  const namePreview = previewIntercessorNames(gamePackage, {
    campaignSeed: "studio-preview",
    count: 6,
  });

  return (
    <div className="space-y-6">
      <Section
        title="World-state layers"
        hint="Authored package data is immutable. Campaign facts survive expedition boundaries; tactical state is rebuilt from the authored baseline. A full New Game still clears the campaign."
      >
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={Boolean(policy.preserve_chemistry)}
            onChange={(event) => patchPolicy({ preserve_chemistry: event.target.checked })}
          />
          Preserve live chemistry across expeditions
        </label>
        <p className="text-xs leading-relaxed text-neutral-500">
          Leave this off for ordinary puddles, smoke, fire, foam, and temporary light. Permanent environmental changes should be represented by campaign switches or stable structural records.
        </p>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Switch lifetime</div>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {Object.keys(gamePackage.switches || {}).sort().map((id) => (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-200">{id}</span>
                <select
                  className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] text-white"
                  value={expeditionSwitches.has(id) ? "expedition" : "campaign"}
                  onChange={(event) => setSwitchScope(id, event.target.value as "campaign" | "expedition")}
                >
                  <option value="campaign">campaign</option>
                  <option value="expedition">expedition</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Permanent map records"
        hint="Use stable authored placement IDs. These records survive a new expedition; unlisted doors, moved objects, loose loot, and containers restore to their authored state."
      >
        <div className="space-y-4">
          {gamePackage.maps.map((map) => (
            <div key={map.id} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="mb-3 text-sm font-medium text-neutral-200">{map.display_name || map.id}</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {([
                  ["persistent_door_ids", "Door / shortcut IDs"],
                  ["persistent_object_ids", "Moved / removed object IDs"],
                  ["persistent_item_ids", "World item placement IDs"],
                  ["persistent_container_ids", "Container placement IDs"],
                ] as const).map(([key, label]) => (
                  <Field key={key} label={label} hint="Comma-separated stable IDs">
                    <input
                      className={`${inputCls} font-mono text-xs`}
                      value={csvText(policy[key]?.[map.id])}
                      onChange={(event) => patchPerMapIds(key, map.id, csvValues(event.target.value))}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Field label="Persistent entity-state keys" hint="Stable placement-backed runtime keys, comma-separated.">
          <input
            className={`${inputCls} font-mono text-xs`}
            value={csvText(policy.persistent_entity_state_ids)}
            onChange={(event) => patchPolicy({ persistent_entity_state_ids: csvValues(event.target.value) })}
          />
        </Field>
      </Section>

      <Section
        title="Intercessor succession"
        hint="A death closes one life, materializes a persistent ghost and independent death bundle at a safe reachable cell, starts a fresh expedition, and returns the successor to this hub. Communing with a ghost transfers its signature skill once."
      >
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={succession.enabled !== false}
            onChange={(event) => patchSuccession({ enabled: event.target.checked })}
          />
          Enable Intercessor succession
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Successor hub map">
            <select
              className={inputCls}
              value={hubMapId}
              onChange={(event) => {
                const map = gamePackage.maps.find((candidate) => candidate.id === event.target.value);
                patchSuccession({ hub_map_id: event.target.value, hub_spawn_id: map?.spawns[0]?.id || "" });
              }}
            >
              {gamePackage.maps.map((map) => <option key={map.id} value={map.id}>{map.display_name || map.id}</option>)}
            </select>
          </Field>
          <Field label="Successor hub spawn">
            <select
              className={inputCls}
              value={succession.hub_spawn_id || gamePackage.metadata.start_spawn_id}
              onChange={(event) => patchSuccession({ hub_spawn_id: event.target.value })}
            >
              {(hubMap?.spawns || []).map((spawn) => <option key={spawn.id} value={spawn.id}>{spawn.id}</option>)}
            </select>
          </Field>
          <Field label="First-name / prefix pool" hint="Comma-separated syllables or names.">
            <input className={inputCls} value={csvText(succession.name_prefixes)} onChange={(event) => patchSuccession({ name_prefixes: csvValues(event.target.value) })} />
          </Field>
          <Field label="Root / family pool">
            <input className={inputCls} value={csvText(succession.name_roots)} onChange={(event) => patchSuccession({ name_roots: csvValues(event.target.value) })} />
          </Field>
          <Field label="Suffix pool" hint="Optional punctuation or suffixes.">
            <input className={inputCls} value={csvText(succession.name_suffixes)} onChange={(event) => patchSuccession({ name_suffixes: csvValues(event.target.value) })} />
          </Field>
          <Field label="Duplicate display names">
            <select className={inputCls} value={succession.duplicate_name_policy || "avoid"} onChange={(event) => patchSuccession({ duplicate_name_policy: event.target.value })}>
              <option value="avoid">Avoid where possible</option>
              <option value="allow">Allow (IDs remain distinct)</option>
            </select>
          </Field>
          <Field label="Banned names">
            <input className={inputCls} value={csvText(succession.banned_names)} onChange={(event) => patchSuccession({ banned_names: csvValues(event.target.value) })} />
          </Field>
          <Field label="Reserved names">
            <input className={inputCls} value={csvText(succession.reserved_names)} onChange={(event) => patchSuccession({ reserved_names: csvValues(event.target.value) })} />
          </Field>
          <Field label="Successor base skills" hint="Comma-separated stable ability IDs. Leave empty for an untrained successor.">
            <input className={`${inputCls} font-mono text-xs`} value={csvText(succession.base_known_skills)} onChange={(event) => patchSuccession({ base_known_skills: csvValues(event.target.value) })} />
          </Field>
          <Field label="Ghost world marker" hint="Compact glyph used by the lightweight persistent landmark renderer.">
            <input className={inputCls} value={succession.ghost_marker_icon || "👻"} onChange={(event) => patchSuccession({ ghost_marker_icon: event.target.value || "👻" })} />
          </Field>
          <Field label="Death-bundle marker">
            <input className={inputCls} value={succession.death_bundle_marker_icon || "🎒"} onChange={(event) => patchSuccession({ death_bundle_marker_icon: event.target.value || "🎒" })} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={succession.recover_artifacts_on_hub_entry !== false}
              onChange={(event) => patchSuccession({ recover_artifacts_on_hub_entry: event.target.checked })}
            />
            Archive carried artifacts on hub entry
          </label>
        </div>
        <div className="rounded-lg border border-indigo-800/60 bg-indigo-950/20 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300">Name-pool preview</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {namePreview.map((name, index) => (
              <span key={`${name}:${index}`} className="rounded border border-indigo-800/60 bg-black/25 px-2 py-1 font-serif text-sm text-indigo-100">{name}</span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">The chosen runtime name and stable record ID are saved permanently; later pool edits never rename an existing Intercessor.</p>
        </div>
      </Section>
    </div>
  );
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function AudioTab({
  settings,
  updateSettings,
  musicIds,
}: {
  settings: Record<string, any>;
  updateSettings: (updates: any) => void;
  musicIds: string[];
}) {
  const registryEditor = (
    key: "music_tracks" | "sound_effects",
    title: string,
    hint: string,
    idPlaceholder: string,
  ) => {
    const registry = (settings[key] || {}) as Record<string, string>;
    const entries = Object.entries(registry);
    const setRegistry = (next: Record<string, string>) => updateSettings({ [key]: next });
    return (
      <Section
        title={title}
        hint={hint}
        action={
          <button
            className={smallBtn}
            onClick={() => {
              let id = idPlaceholder;
              let n = 1;
              while (registry[id]) id = `${idPlaceholder}_${n++}`;
              setRegistry({ ...registry, [id]: "" });
            }}
          >
            <Plus className="mr-1 inline h-3 w-3" /> Add
          </button>
        }
      >
        <div className="space-y-2">
          {entries.map(([id, url]) => (
            <div key={id} className="flex items-center gap-2">
              <input
                className={`${inputCls} max-w-[14rem] font-mono text-xs`}
                value={id}
                onChange={(e) => {
                  const next = { ...registry };
                  delete next[id];
                  next[e.target.value] = url;
                  setRegistry(next);
                }}
              />
              <input
                className={`${inputCls} flex-1 text-xs`}
                value={url}
                placeholder="/sfx/… , https://… or data:audio/…"
                onChange={(e) => setRegistry({ ...registry, [id]: e.target.value })}
              />
              <button
                className="p-1.5 text-neutral-500 hover:text-red-400"
                onClick={() => {
                  const kind = key === "music_tracks" ? "music track" : "sound effect";
                  if (!confirmDelete(kind, id, "Content that references this ID may stop playing audio.")) return;
                  const next = { ...registry };
                  delete next[id];
                  setRegistry(next);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-neutral-500">Nothing registered yet.</p>}
        </div>
      </Section>
    );
  };

  return (
    <div className="space-y-6">
      {registryEditor(
        "music_tracks",
        "Music tracks",
        "Named tracks for play_music cutscene actions and per-map music (set per map in the Map editor). The special id `combat` overrides the battle track.",
        "music_new",
      )}
      {registryEditor(
        "sound_effects",
        "Sound effects",
        "Named sounds for play_sound cutscene actions.",
        "sfx_new",
      )}
      <Section title="Title screen music">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Track">
            <select
              className={inputCls}
              value={settings.title_music_id || ""}
              onChange={(e) => updateSettings({ title_music_id: e.target.value || undefined })}
            >
              <option value="">-- None --</option>
              {musicIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Or direct URL">
            <input
              className={inputCls}
              value={settings.title_music_url || ""}
              placeholder="https://…"
              onChange={(e) => updateSettings({ title_music_url: e.target.value || undefined })}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

// ── Portraits ────────────────────────────────────────────────────────────────
function PortraitsTab({
  settings,
  updateSettings,
}: {
  settings: Record<string, any>;
  updateSettings: (updates: any) => void;
}) {
  const portraits = (settings.dialogue_portraits || {}) as Record<
    string,
    { src?: string; alt?: string; side?: "left" | "right"; flipX?: boolean }
  >;
  const setPortraits = (next: typeof portraits) => updateSettings({ dialogue_portraits: next });
  const entries = Object.entries(portraits);

  return (
    <Section
      title="Dialogue portraits"
      hint="Keyed by speaker name (case-insensitive). A dialogue node whose speaker matches shows this portrait beside the text box."
      action={
        <button
          className={smallBtn}
          onClick={() => {
            let key = "speaker";
            let n = 1;
            while (portraits[key]) key = `speaker_${n++}`;
            setPortraits({ ...portraits, [key]: { src: "", alt: "", side: "left" } });
          }}
        >
          <Plus className="mr-1 inline h-3 w-3" /> Add speaker
        </button>
      }
    >
      <div className="space-y-3">
        {entries.map(([speaker, config]) => (
          <div key={speaker} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 md:grid-cols-[10rem_1fr_6rem_5rem_auto]">
            <Field label="Speaker">
              <input
                className={inputCls}
                value={speaker}
                onChange={(e) => {
                  const next = { ...portraits };
                  delete next[speaker];
                  next[e.target.value] = config;
                  setPortraits(next);
                }}
              />
            </Field>
            <Field label="Image URL">
              <input
                className={inputCls}
                value={config.src || ""}
                placeholder="https://… or data:image/…"
                onChange={(e) => setPortraits({ ...portraits, [speaker]: { ...config, src: e.target.value } })}
              />
            </Field>
            <Field label="Side">
              <select
                className={inputCls}
                value={config.side || "left"}
                onChange={(e) => setPortraits({ ...portraits, [speaker]: { ...config, side: e.target.value as "left" | "right" } })}
              >
                <option value="left">left</option>
                <option value="right">right</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 pb-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={config.flipX || false}
                onChange={(e) => setPortraits({ ...portraits, [speaker]: { ...config, flipX: e.target.checked || undefined } })}
              />
              Flip
            </label>
            <button
              className="mb-1.5 p-1.5 text-neutral-500 hover:text-red-400"
              onClick={() => {
                if (!confirmDelete("dialogue portrait", speaker)) return;
                const next = { ...portraits };
                delete next[speaker];
                setPortraits(next);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-neutral-500">No portraits configured.</p>}
      </div>
    </Section>
  );
}

// ── Switches ─────────────────────────────────────────────────────────────────
function SwitchesTab({
  gamePackage,
  patchPackage,
}: {
  gamePackage: GamePackage;
  patchPackage: (updates: Partial<GamePackage>) => void;
}) {
  const [newId, setNewId] = useState("");
  const [filter, setFilter] = useState("");
  const switches = gamePackage.switches || {};
  const referenced = useMemo(() => collectReferencedSwitches(gamePackage), [gamePackage]);
  const undeclared = [...referenced].filter((id) => !(id in switches)).sort();
  const ids = Object.keys(switches)
    .sort()
    .filter((id) => !filter || id.includes(filter));

  const setSwitches = (next: Record<string, boolean>) => patchPackage({ switches: next });

  return (
    <div className="space-y-6">
      <Section
        title="Switch registry"
        hint="Durable true/false story facts. Declaring them here powers the pickers in the Dialogue, Events, and Map editors and sets the value a new game starts with."
      >
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={newId}
            placeholder="new_switch_name (lowercase_snake)"
            onChange={(e) => setNewId(e.target.value.replace(/[^a-z0-9_]/g, "_").toLowerCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newId && !(newId in switches)) {
                setSwitches({ ...switches, [newId]: false });
                setNewId("");
              }
            }}
          />
          <button
            className={`${smallBtn} whitespace-nowrap`}
            disabled={!newId || newId in switches}
            onClick={() => {
              setSwitches({ ...switches, [newId]: false });
              setNewId("");
            }}
          >
            <Plus className="mr-1 inline h-3 w-3" /> Declare
          </button>
        </div>
        {undeclared.length > 0 && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="flex items-center justify-between gap-2">
              <span>
                {undeclared.length} switch{undeclared.length === 1 ? "" : "es"} referenced in content but not declared:
              </span>
              <button
                className={smallBtn}
                onClick={() =>
                  setSwitches({ ...switches, ...Object.fromEntries(undeclared.map((id) => [id, false])) })
                }
              >
                Declare all
              </button>
            </div>
            <div className="mt-1 font-mono text-[11px] text-amber-300/80">{undeclared.join(", ")}</div>
          </div>
        )}
        <input
          className={`${inputCls} max-w-xs`}
          value={filter}
          placeholder="Filter…"
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {ids.map((id) => (
            <div key={id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5">
              <span className="flex-1 truncate font-mono text-xs text-neutral-200">{id}</span>
              {referenced.has(id) && <span className="text-[10px] uppercase text-emerald-500">used</span>}
              <label className="flex items-center gap-1 text-[11px] text-neutral-400">
                starts
                <select
                  className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-[11px] text-white"
                  value={String(switches[id])}
                  onChange={(e) => setSwitches({ ...switches, [id]: e.target.value === "true" })}
                >
                  <option value="false">off</option>
                  <option value="true">on</option>
                </select>
              </label>
              <button
                className="p-1 text-neutral-600 hover:text-red-400"
                title={referenced.has(id) ? "Still referenced by content" : "Remove"}
                onClick={() => {
                  if (
                    !confirmDelete(
                      "switch declaration",
                      id,
                      referenced.has(id)
                        ? "This switch is still referenced by authored content. Deleting its declaration will leave those references unresolved."
                        : undefined,
                    )
                  ) return;
                  const next = { ...switches };
                  delete next[id];
                  setSwitches(next);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Factions ─────────────────────────────────────────────────────────────────
function FactionsTab({
  gamePackage,
  patchPackage,
}: {
  gamePackage: GamePackage;
  patchPackage: (updates: Partial<GamePackage>) => void;
}) {
  const factions = (gamePackage.factions || []) as Array<{
    id: string;
    display_name?: string;
    hidden?: boolean;
    description?: string;
  }>;
  const setFactions = (next: typeof factions) => patchPackage({ factions: next });

  return (
    <Section
      title="Factions"
      hint="Reputation counters adjusted by cutscenes (adjust_faction_rep) and read by rep_gte / rep_lte conditions. Hidden factions never surface in the UI — perfect for secret scores."
      action={
        <button
          className={smallBtn}
          onClick={() => setFactions([...factions, { id: `faction_${factions.length + 1}`, display_name: "New Faction" }])}
        >
          <Plus className="mr-1 inline h-3 w-3" /> Add
        </button>
      }
    >
      <div className="space-y-3">
        {factions.map((faction, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[12rem_1fr_auto_auto]">
              <Field label="ID">
                <input
                  className={`${inputCls} font-mono text-xs`}
                  value={faction.id}
                  onChange={(e) => setFactions(factions.map((f, i) => (i === index ? { ...f, id: e.target.value } : f)))}
                />
              </Field>
              <Field label="Display name">
                <input
                  className={inputCls}
                  value={faction.display_name || ""}
                  onChange={(e) =>
                    setFactions(factions.map((f, i) => (i === index ? { ...f, display_name: e.target.value } : f)))
                  }
                />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={faction.hidden || false}
                  onChange={(e) =>
                    setFactions(factions.map((f, i) => (i === index ? { ...f, hidden: e.target.checked || undefined } : f)))
                  }
                />
                Hidden
              </label>
              <button
                className="mb-1.5 self-end p-1.5 text-neutral-500 hover:text-red-400"
                onClick={() => {
                  if (
                    !confirmDelete(
                      "faction",
                      faction.display_name || faction.id,
                      "Conditions or cutscene actions that reference this faction may become invalid.",
                    )
                  ) return;
                  setFactions(factions.filter((_, i) => i !== index));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Field label="Author notes">
              <textarea
                className={`${inputCls} min-h-[3rem] text-xs`}
                value={faction.description || ""}
                placeholder="What this score means, when to raise/lower it…"
                onChange={(e) =>
                  setFactions(factions.map((f, i) => (i === index ? { ...f, description: e.target.value || undefined } : f)))
                }
              />
            </Field>
          </div>
        ))}
        {factions.length === 0 && <p className="text-sm text-neutral-500">No factions yet.</p>}
      </div>
    </Section>
  );
}

// ── Barks ────────────────────────────────────────────────────────────────────
function BarksTab({
  gamePackage,
  patchPackage,
}: {
  gamePackage: GamePackage;
  patchPackage: (updates: Partial<GamePackage>) => void;
}) {
  const barks = gamePackage.barks || [];
  const npcs = gamePackage.entities.filter((entity) => entity.is_npc);
  const setBarks = (next: Bark[]) => patchPackage({ barks: next });
  const patchBark = (index: number, updates: Partial<Bark>) =>
    setBarks(barks.map((bark, i) => (i === index ? { ...bark, ...updates } : bark)));

  return (
    <Section
      title="Ambient barks"
      hint="Short overheard exchanges between two NPCs — the town talking to itself. Fires when both speakers stand together and the player is in earshot. The first bark whose condition passes wins, so put specific variants before generic ones."
      action={
        <button
          className={smallBtn}
          onClick={() =>
            setBarks([
              ...barks,
              {
                id: `bark_${Date.now()}`,
                speakers: [npcs[0]?.id || "", npcs[1]?.id || npcs[0]?.id || ""],
                lines: [],
              } as Bark,
            ])
          }
        >
          <Plus className="mr-1 inline h-3 w-3" /> Add bark
        </button>
      }
    >
      <div className="space-y-4">
        {barks.map((bark, index) => (
          <div key={bark.id || index} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_6rem_auto]">
              <Field label="ID">
                <input
                  className={`${inputCls} font-mono text-xs`}
                  value={bark.id}
                  onChange={(e) => patchBark(index, { id: e.target.value })}
                />
              </Field>
              {[0, 1].map((slot) => (
                <Field key={slot} label={`Speaker ${slot + 1}`}>
                  <select
                    className={inputCls}
                    value={String(bark.speakers?.[slot] ?? "")}
                    onChange={(e) => {
                      const speakers = [...(bark.speakers || ["", ""])] as [string, string];
                      speakers[slot] = e.target.value;
                      patchBark(index, { speakers });
                    }}
                  >
                    <option value="">-- pick NPC --</option>
                    {npcs.map((npc) => (
                      <option key={npc.id} value={npc.id}>
                        {npc.display_name || npc.id}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field label="Cooldown (min)">
                <input
                  type="number"
                  className={inputCls}
                  value={bark.cooldown_minutes ?? ""}
                  placeholder="default"
                  onChange={(e) =>
                    patchBark(index, {
                      cooldown_minutes: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
                    })
                  }
                />
              </Field>
              <button
                className="self-end p-1.5 text-neutral-500 hover:text-red-400"
                onClick={() => {
                  const lineCount = bark.lines?.length || 0;
                  if (
                    !confirmDelete(
                      "ambient bark",
                      bark.id,
                      lineCount > 0
                        ? `This will also delete its ${lineCount} authored line${lineCount === 1 ? "" : "s"}.`
                        : undefined,
                    )
                  ) return;
                  setBarks(barks.filter((_, i) => i !== index));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <ConditionEditor
              label="Plays when"
              value={bark.condition}
              onChange={(condition) => patchBark(index, { condition })}
              compact
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400">Lines (played in order)</span>
                <button
                  className={smallBtn}
                  onClick={() =>
                    patchBark(index, {
                      lines: [...(bark.lines || []), { speaker: bark.speakers?.[0] || "", text: "" }],
                    })
                  }
                >
                  <Plus className="mr-1 inline h-3 w-3" /> Line
                </button>
              </div>
              {(bark.lines || []).map((line, lineIndex) => (
                <div key={lineIndex} className="flex items-center gap-2">
                  <select
                    className={`${inputCls} max-w-[11rem]`}
                    value={line.speaker}
                    onChange={(e) => {
                      const lines = bark.lines.map((l, li) => (li === lineIndex ? { ...l, speaker: e.target.value } : l));
                      patchBark(index, { lines });
                    }}
                  >
                    {[bark.speakers?.[0], bark.speakers?.[1]].filter(Boolean).map((id) => {
                      const npc = npcs.find((n) => n.id === id);
                      return (
                        <option key={id} value={id!}>
                          {npc?.display_name || id}
                        </option>
                      );
                    })}
                  </select>
                  <input
                    className={`${inputCls} flex-1`}
                    value={line.text}
                    placeholder="What they say…"
                    onChange={(e) => {
                      const lines = bark.lines.map((l, li) => (li === lineIndex ? { ...l, text: e.target.value } : l));
                      patchBark(index, { lines });
                    }}
                  />
                  <button
                    className="p-1.5 text-neutral-500 hover:text-red-400"
                    onClick={() => {
                      if (!confirmDelete("bark line", undefined, `The line reads: \"${line.text}\"`)) return;
                      patchBark(index, { lines: bark.lines.filter((_, li) => li !== lineIndex) });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {barks.length === 0 && <p className="text-sm text-neutral-500">No barks yet.</p>}
      </div>
    </Section>
  );
}

// ── Endings ──────────────────────────────────────────────────────────────────
function EndingsTab({
  gamePackage,
  patchPackage,
}: {
  gamePackage: GamePackage;
  patchPackage: (updates: Partial<GamePackage>) => void;
}) {
  const endings = (gamePackage.endings || []) as Array<{ id: string; title?: string; description?: string }>;
  const setEndings = (next: typeof endings) => patchPackage({ endings: next });

  return (
    <Section
      title="Endings"
      hint="Named endings a game_end cutscene action can reference. The title shows on the end screen; a game_end action can also override the title directly."
      action={
        <button
          className={smallBtn}
          onClick={() => setEndings([...endings, { id: `ending_${endings.length + 1}`, title: "New Ending" }])}
        >
          <Plus className="mr-1 inline h-3 w-3" /> Add
        </button>
      }
    >
      <div className="space-y-2">
        {endings.map((ending, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 md:grid-cols-[12rem_1fr_auto]">
            <Field label="ID">
              <input
                className={`${inputCls} font-mono text-xs`}
                value={ending.id}
                onChange={(e) => setEndings(endings.map((f, i) => (i === index ? { ...f, id: e.target.value } : f)))}
              />
            </Field>
            <Field label="End screen title">
              <input
                className={inputCls}
                value={ending.title || ""}
                onChange={(e) => setEndings(endings.map((f, i) => (i === index ? { ...f, title: e.target.value } : f)))}
              />
            </Field>
            <button
              className="mb-1.5 self-end p-1.5 text-neutral-500 hover:text-red-400"
              onClick={() => {
                if (
                  !confirmDelete(
                    "ending",
                    ending.title || ending.id,
                    "Game-ending actions that reference this ending may become invalid.",
                  )
                ) return;
                setEndings(endings.filter((_, i) => i !== index));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {endings.length === 0 && <p className="text-sm text-neutral-500">No endings declared (game_end still works with a title override).</p>}
      </div>
    </Section>
  );
}

// ── Chemistry ────────────────────────────────────────────────────────────────
const CHEM_PROPS = [
  ["flammability", "How readily it catches (0–100)"],
  ["ignitionThreshold", "Heat needed to ignite"],
  ["fuelCapacity", "How long it burns"],
  ["conductivity", "Electric conduction"],
  ["absorbency", "How much water it soaks up"],
  ["thermalMass", "Resists temperature change"],
  ["brittleness", "Shatters under force"],
  ["impactResistance", "Shrugs off blows"],
  ["foamAffinity", "Holds suppressive foam"],
] as const;

function ChemistryTab({
  settings,
  updateSettings,
}: {
  settings: Record<string, any>;
  updateSettings: (updates: any) => void;
}) {
  const custom = (settings.chem_materials || {}) as Record<string, Record<string, unknown>>;
  const setCustom = (next: typeof custom) => updateSettings({ chem_materials: next });
  const customIds = Object.keys(custom);
  const builtinIds = Object.keys(CHEM_MATERIALS);

  return (
    <div className="space-y-6">
      <Section
        title="Custom chemistry materials"
        hint="Materials drive burning, dousing, freezing, conduction, and shattering on the grid. Define your own here, then bind objects to them in the Tiles editor (Chemistry material dropdown). A custom id that matches a built-in overrides it everywhere."
        action={
          <button
            className={smallBtn}
            onClick={() => {
              let id = "custom_material";
              let n = 1;
              while (custom[id]) id = `custom_material_${n++}`;
              setCustom({
                ...custom,
                [id]: { label: "Custom Material", flammability: 0, ignitionThreshold: 100, fuelCapacity: 0, conductivity: 0, absorbency: 0, thermalMass: 30, brittleness: 0, impactResistance: 30, foamAffinity: 0, tags: [] },
              });
            }}
          >
            <Plus className="mr-1 inline h-3 w-3" /> Add material
          </button>
        }
      >
        <div className="space-y-4">
          {customIds.map((id) => {
            const material = custom[id];
            const patch = (updates: Record<string, unknown>) =>
              setCustom({ ...custom, [id]: { ...material, ...updates } });
            return (
              <div key={id} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[12rem_1fr_1fr_auto]">
                  <Field label="ID">
                    <input
                      className={`${inputCls} font-mono text-xs`}
                      value={id}
                      onChange={(e) => {
                        const next = { ...custom };
                        delete next[id];
                        next[e.target.value] = material;
                        setCustom(next);
                      }}
                    />
                  </Field>
                  <Field label="Label">
                    <input
                      className={inputCls}
                      value={String(material.label || "")}
                      onChange={(e) => patch({ label: e.target.value })}
                    />
                  </Field>
                  <Field label="Tags (comma separated)">
                    <input
                      className={inputCls}
                      value={Array.isArray(material.tags) ? (material.tags as string[]).join(", ") : ""}
                      placeholder="flammable, solid"
                      onChange={(e) =>
                        patch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
                      }
                    />
                  </Field>
                  <button
                    className="mb-1.5 self-end p-1.5 text-neutral-500 hover:text-red-400"
                    onClick={() => {
                      if (
                        !confirmDelete(
                          "custom chemistry material",
                          id,
                          "Objects bound to this material may lose their intended simulation behavior.",
                        )
                      ) return;
                      const next = { ...custom };
                      delete next[id];
                      setCustom(next);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {CHEM_PROPS.map(([prop, hint]) => (
                    <Field key={prop} label={prop} hint={hint}>
                      <input
                        type="number"
                        className={inputCls}
                        value={typeof material[prop] === "number" ? (material[prop] as number) : ""}
                        placeholder="0"
                        onChange={(e) => patch({ [prop]: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            );
          })}
          {customIds.length === 0 && <p className="text-sm text-neutral-500">No custom materials — the built-ins below cover the basics.</p>}
        </div>
      </Section>

      <Section title="Built-in materials (reference)" hint="Always available. Bind any of these to objects in the Tiles editor.">
        <div className="flex flex-wrap gap-1.5">
          {builtinIds.map((id) => (
            <span key={id} className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 font-mono text-xs text-neutral-300">
              {id}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}
