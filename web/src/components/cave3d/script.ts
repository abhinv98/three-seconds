// What happens in the Tickles' house, in words: what the visitor did, how the family is, and the lines they say
// back. Shared by the game (components/cave3d) and its writer (app/api/cave/route.ts). Every field the browser sends
// is an enum or a number, so no free text from a visitor ever reaches the model.

export const WHO = ["mr", "ms", "tick", "tock"] as const;
export type Who = (typeof WHO)[number];
export const NAMES: Record<Who, string> = { mr: "Mr Tickle", ms: "Ms Tickle", tick: "Tick", tock: "Tock" };

export const ROOMS = ["porch", "living", "kitchen", "bedroom", "kids"] as const;
export type Room = (typeof ROOMS)[number];
export const ROOM_NAMES: Record<Room, string> = {
  porch: "porch",
  living: "living room",
  kitchen: "kitchen",
  bedroom: "bedroom",
  kids: "kids' room",
};

export const THINGS = ["vase", "plate", "cup", "books", "frame", "clock", "teddy", "blocks", "pan", "broom", "sticker", "plant", "pot"] as const;
export type Thing = (typeof THINGS)[number];
export const THING_NAMES: Record<Thing, string> = {
  vase: "the vase",
  plate: "a dinner plate",
  cup: "a cup",
  books: "a stack of books",
  frame: "the family portrait",
  clock: "the alarm clock",
  teddy: "the teddy bear",
  blocks: "the toy blocks",
  pan: "the frying pan",
  broom: "the broom",
  sticker: "a “Collab” sticker",
  plant: "the pot plant",
  pot: "the soup pot",
};

export const DOING = ["watching tv", "cooking", "playing", "eating", "sleeping", "cleaning", "looking around", "hiding", "guarding", "searching", "answering the door", "walking"] as const;
export type Doing = (typeof DOING)[number];

export type GameEvent =
  | { type: "knock"; count: number }
  | { type: "slip" }
  | { type: "break"; thing: Thing; room: Room }
  | { type: "drop"; thing: Thing; room: Room }
  | { type: "throw"; thing: Thing; who: Who }
  | { type: "lights"; on: boolean }
  | { type: "tv"; on: boolean }
  | { type: "alarm"; room: Room }
  | { type: "steal"; thing: Thing }
  | { type: "poke"; who: Who }
  | { type: "wall"; room: Room }
  | { type: "chat" };

/** How much each act frightens them. Around ten acts, and they drive the visitor out. */
export const WEIGHT: Record<GameEvent["type"], number> = {
  knock: 3,
  slip: 0,
  break: 14,
  drop: 6,
  throw: 16,
  lights: 9,
  tv: 7,
  alarm: 12,
  steal: 5,
  poke: 12,
  wall: 6,
  chat: 0,
};
export const LAST_STRAW = 14;

export const STAGES = ["calm", "uneasy", "aware", "afraid", "fight", "expel"] as const;
export type Stage = (typeof STAGES)[number];
export function stageOf(suspicion: number): Stage {
  if (suspicion >= 100) return "expel";
  if (suspicion >= 80) return "fight";
  if (suspicion >= 60) return "afraid";
  if (suspicion >= 40) return "aware";
  if (suspicion >= 20) return "uneasy";
  return "calm";
}

/** Where the suspicion may land after an event: steady for talk, otherwise near the act's weight, never down. */
export function bounds(prev: number, event: GameEvent, count: number) {
  const weight = WEIGHT[event.type];
  if (!weight) return { min: prev, max: prev };
  const target = count >= LAST_STRAW ? 100 : Math.min(100, prev + weight);
  if (target >= 100) return { min: 100, max: 100 };
  return { min: Math.max(prev + 1, target - 5), max: Math.min(99, target + 5) };
}

export interface Member {
  room: Room;
  doing: Doing;
  asleep: boolean;
  armed: boolean;
}
export interface GameState {
  suspicion: number;
  count: number;
  night: boolean;
  lights: boolean;
  tv: boolean;
  mess: number;
  family: Record<Who, Member>;
  past: GameEvent[];
}

export type Tone = "say" | "whisper" | "shout";
export interface Line {
  who: Who;
  text: string;
  tone: Tone;
}
export interface Reply {
  lines: Line[];
  narrator: string;
  suspicion: number;
}

/** The answer's shape for structured outputs: every field required, nothing extra. */
export const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines", "narrator", "suspicion"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "text", "tone"],
        properties: {
          who: { type: "string", enum: [...WHO] },
          text: { type: "string" },
          tone: { type: "string", enum: ["say", "whisper", "shout"] },
        },
      },
    },
    narrator: { type: "string" },
    suspicion: { type: "integer" },
  },
};

const isOneOf = <T extends string>(value: unknown, list: readonly T[]): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
/** One line of plain text, cut at a word (with an ellipsis) when it runs over `max`. */
const tidy = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:.!?…-]+$/, "")}…`;
};

/** Keeps at most four lines of 90 characters by known speakers, a narrator line of 160, suspicion within bounds. */
export function sanitizeReply(raw: unknown, min: number, max: number): Reply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lines: Line[] = [];
  if (Array.isArray(r.lines))
    for (const item of r.lines) {
      if (lines.length === 4) break;
      if (!item || typeof item !== "object") continue;
      const l = item as Record<string, unknown>;
      if (!isOneOf(l.who, WHO) || typeof l.text !== "string") continue;
      const text = tidy(l.text, 90);
      if (text) lines.push({ who: l.who, text, tone: isOneOf(l.tone, ["say", "whisper", "shout"] as const) ? l.tone : "say" });
    }
  const narrator = typeof r.narrator === "string" ? tidy(r.narrator, 160) : "";
  if (!lines.length && !narrator) return null;
  const asked = typeof r.suspicion === "number" && Number.isFinite(r.suspicion) ? Math.round(r.suspicion) : max;
  return { lines, narrator, suspicion: Math.max(min, Math.min(max, asked)) };
}

export function parseEvent(raw: unknown): GameEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case "knock":
      return typeof e.count === "number" && Number.isFinite(e.count) ? { type: "knock", count: Math.max(1, Math.min(9, Math.round(e.count))) } : null;
    case "slip":
      return { type: "slip" };
    case "chat":
      return { type: "chat" };
    case "break":
    case "drop":
      return isOneOf(e.thing, THINGS) && isOneOf(e.room, ROOMS) ? { type: e.type, thing: e.thing, room: e.room } : null;
    case "throw":
      return isOneOf(e.thing, THINGS) && isOneOf(e.who, WHO) ? { type: "throw", thing: e.thing, who: e.who } : null;
    case "lights":
    case "tv":
      return typeof e.on === "boolean" ? { type: e.type, on: e.on } : null;
    case "alarm":
    case "wall":
      return isOneOf(e.room, ROOMS) ? { type: e.type, room: e.room } : null;
    case "steal":
      return isOneOf(e.thing, THINGS) ? { type: "steal", thing: e.thing } : null;
    case "poke":
      return isOneOf(e.who, WHO) ? { type: "poke", who: e.who } : null;
    default:
      return null;
  }
}

export function parseState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
  const suspicion = num(s.suspicion, 100);
  const count = num(s.count, 99);
  const mess = num(s.mess, 99);
  const flags = [s.night, s.lights, s.tv];
  const fam = s.family && typeof s.family === "object" ? (s.family as Record<string, unknown>) : null;
  if (suspicion === null || count === null || mess === null || !fam || flags.some((f) => typeof f !== "boolean")) return null;
  const family = {} as Record<Who, Member>;
  for (const w of WHO) {
    const m = fam[w] && typeof fam[w] === "object" ? (fam[w] as Record<string, unknown>) : {};
    family[w] = {
      room: isOneOf(m.room, ROOMS) ? m.room : "living",
      doing: isOneOf(m.doing, DOING) ? m.doing : "walking",
      asleep: m.asleep === true,
      armed: m.armed === true,
    };
  }
  const past = Array.isArray(s.past) ? s.past.slice(-8).map(parseEvent).filter((e): e is GameEvent => e !== null) : [];
  return { suspicion, count, night: s.night as boolean, lights: s.lights as boolean, tv: s.tv as boolean, mess, family, past };
}

export function describe(event: GameEvent): string {
  switch (event.type) {
    case "knock":
      return event.count > 1 ? `The visitor knocked on the front door again (knock number ${event.count}).` : "The visitor knocked on the front door.";
    case "slip":
      return "The visitor slipped into the house through the open door, unseen.";
    case "break":
      return `The visitor dropped ${THING_NAMES[event.thing]} in the ${ROOM_NAMES[event.room]} and it smashed.`;
    case "drop":
      return `The visitor moved ${THING_NAMES[event.thing]} and left it on the ${ROOM_NAMES[event.room]} floor.`;
    case "throw":
      return `The visitor threw ${THING_NAMES[event.thing]} and it hit ${NAMES[event.who]}.`;
    case "lights":
      return event.on ? "The visitor switched the house lights back on." : "The visitor switched off the house lights.";
    case "tv":
      return event.on ? "The visitor switched the TV on to loud static." : "The visitor switched the TV off.";
    case "alarm":
      return `The visitor set off the alarm clock in the ${ROOM_NAMES[event.room]}.`;
    case "steal":
      return `The visitor picked up ${THING_NAMES[event.thing]}; to the family it is floating in mid-air.`;
    case "poke":
      return `The visitor poked ${NAMES[event.who]}.`;
    case "wall":
      return `The visitor knocked on the ${ROOM_NAMES[event.room]} wall from inside the house.`;
    case "chat":
      return "Nothing happened just now; the family is talking among themselves.";
  }
}

const pick = <T,>(list: T[], n: number) => list[((n % list.length) + list.length) % list.length];

/** The family's chatter when nobody is meddling. */
const CHATTER: Line[][] = [
  [
    { who: "mr", text: "Forty-two Reels today. Every label, timed to the tenth.", tone: "say" },
    { who: "ms", text: "And how many said Collab?", tone: "say" },
    { who: "mr", text: "Eleven. Eleven!", tone: "shout" },
  ],
  [
    { who: "tick", text: "Papa, can I hold the stopwatch tomorrow?", tone: "say" },
    { who: "mr", text: "When you can count three seconds without rushing.", tone: "say" },
  ],
  [
    { who: "tock", text: "Is three seconds a long time?", tone: "say" },
    { who: "ms", text: "It is if you’re a label, sweetheart.", tone: "say" },
  ],
  [
    { who: "mr", text: "Today was a good day. We earned a lot.", tone: "say" },
    { who: "ms", text: "Then you can do the dishes.", tone: "say" },
  ],
  [
    { who: "ms", text: "Did you lock the front door?", tone: "say" },
    { who: "mr", text: "Nobody comes down this street. Nobody.", tone: "say" },
  ],
];

const REACTIONS: Record<Exclude<Stage, "expel">, Line[][]> = {
  calm: [
    [{ who: "mr", text: "Hm. That was fine at six o’clock.", tone: "say" }],
    [{ who: "mr", text: "Must have been the wind.", tone: "say" }],
    [{ who: "ms", text: "Tick! Was that you?", tone: "shout" }, { who: "tick", text: "Wasn’t me!", tone: "say" }],
  ],
  uneasy: [
    [
      { who: "ms", text: "What is happening? Is everything alright?", tone: "say" },
      { who: "mr", text: "Everything is alright. Go back to what you were doing.", tone: "say" },
    ],
    [
      { who: "ms", text: "That’s twice now. Is everything alright?", tone: "say" },
      { who: "mr", text: "Everything is alright. Probably.", tone: "say" },
    ],
  ],
  aware: [
    [
      { who: "mr", text: "Someone is in our house.", tone: "whisper" },
      { who: "ms", text: "I can feel it. Right… there.", tone: "whisper" },
      { who: "tock", text: "Papa, I’m scared.", tone: "whisper" },
    ],
    [
      { who: "ms", text: "Things don’t move on their own.", tone: "whisper" },
      { who: "mr", text: "Kids, stay close to me.", tone: "whisper" },
    ],
  ],
  afraid: [
    [
      { who: "ms", text: "Get the frying pan.", tone: "whisper" },
      { who: "mr", text: "Stay behind me. I’m timing it.", tone: "say" },
      { who: "tick", text: "I’m not scared!", tone: "shout" },
    ],
    [
      { who: "mr", text: "Whatever you are, you’re not welcome here.", tone: "shout" },
      { who: "tock", text: "…is it gone?", tone: "whisper" },
    ],
  ],
  fight: [
    [
      { who: "mr", text: "Three seconds to leave. Starting now.", tone: "shout" },
      { who: "ms", text: "Three. Two…", tone: "shout" },
      { who: "tick", text: "We’ll find you!", tone: "shout" },
    ],
    [
      { who: "ms", text: "Spread out. Sweep every room.", tone: "say" },
      { who: "tock", text: "I’ve got my spoon!", tone: "shout" },
    ],
  ],
};

const NARRATOR: Partial<Record<GameEvent["type"], string[]>> = {
  break: [
    "You broke something that belonged to someone. It had never done anything to you.",
    "Another thing broken. You are very good at this. Nobody asked you to be.",
  ],
  drop: ["You put it on the floor, where it did not belong. A small, pointless rebellion."],
  throw: ["You threw it at him. He did not see it coming. He does not see anything coming."],
  lights: ["You turned off their lights. Somewhere in the dark, a family decided to be brave."],
  tv: ["You turned on the television. Nobody was watching. Except, now, everybody."],
  alarm: ["The alarm rang. They had not set it. You had."],
  steal: ["You picked it up. To them, it is simply floating. You have made a ghost of yourself."],
  poke: ["You poked him. He felt it. You enjoyed that more than you should have."],
  wall: ["You knocked on the wall from the inside. A bold choice, for a guest."],
};

/** The house's own lines, used at once while (or instead of) waiting for the writer. */
export function localReply(event: GameEvent, state: GameState): Reply {
  const n = state.count;
  if (event.type === "chat") return { lines: pick(CHATTER, n), narrator: "", suspicion: state.suspicion };
  if (event.type === "knock")
    return {
      lines: [
        event.count === 1
          ? { who: "mr", text: "Coming! One moment.", tone: "shout" }
          : event.count === 2
            ? { who: "ms", text: "Someone’s at the door again, dear.", tone: "say" }
            : { who: "mr", text: "Who keeps knocking at this hour?", tone: "shout" },
      ],
      narrator: event.count === 1 ? "You knocked. A polite intruder. How refreshing." : "",
      suspicion: Math.min(99, state.suspicion + WEIGHT.knock),
    };
  if (event.type === "slip")
    return { lines: [], narrator: "And just like that, you were inside someone else’s evening.", suspicion: state.suspicion };
  const { min, max } = bounds(state.suspicion, event, state.count);
  const suspicion = Math.round((min + max) / 2);
  const stage = stageOf(suspicion);
  if (stage === "expel") return { lines: [{ who: "mr", text: "OUT.", tone: "shout" }], narrator: "They found you. Not with their eyes.", suspicion: 100 };
  const lines = pick(REACTIONS[stage], n);
  const told = NARRATOR[event.type];
  const narrator = stage === "aware" && n % 2 ? "And now they know. Not who. Just that." : told ? pick(told, n) : "";
  return { lines, narrator, suspicion };
}
