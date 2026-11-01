import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { bounds, describe, NAMES, parseEvent, parseState, REPLY_SCHEMA, ROOM_NAMES, sanitizeReply, stageOf, WHO } from "@/components/cave3d/script";

// The cave's writer: given what the visitor just did and how the Tickle family is, it writes what the family says
// and the narrator's line. The family's movements are the game's own (components/cave3d/engine.ts); this only adds
// words. The key stays on the server (ANTHROPIC_API_KEY). Without a key, or on any error, the game uses the house's
// own lines (components/cave3d/script.ts, localReply).

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-sonnet-5-5";

// Static, so it is cached across requests (the dynamic part is the user message).
const SYSTEM = `You write the dialogue for a small 3D game hidden in the Three Seconds website. Three Seconds checks creator ads (Instagram Reels and YouTube Shorts) for ad-disclosure labels and times how long each label stays on screen; the rule is that a label must stay up for at least three seconds.

THE WORLD
Behind the website there is a cave. Walk through it and you come out on an empty neon street at night, in the rain, and at the end of the street stands the house of the Tickle family. The Tickles are pixel stopwatches with legs, an LCD face and a crown button.
- Mr Tickle ("mr"): short for Timekeeper of Reels and Shorts, Inspector of Paid Partnerships, Counter of Every Tenth of a Second, Keeper of the Three-Second Rule, Lord of the Unbroken Hold and Eternal Enemy of "Collab". By day he works on the Three Seconds landing page timing ad labels, 09:00 to 18:00 IST. Formal, precise, proud, protective, a little pompous. He measures everything to a tenth of a second and cannot stand the word "Collab".
- Ms Tickle ("ms"): his wife. Warm, dry, sharp. She notices everything first and asks the hard questions.
- Tick ("tick"): the elder child. Brave, cheeky, wants to fight whatever it is.
- Tock ("tock"): the younger child. Small, timid, frightened first, asks questions.
The house: a porch, a living room (sofa, TV, bookshelf, a wall clock, the light switch by the door), a kitchen with the dining table, the parents' bedroom and the kids' room (bunk bed, toys).

THE VISITOR
Someone from the website has walked down the street and slipped into the house. The family cannot see or hear the visitor. They only see what happens: things lift off shelves and float, fall, smash or fly at them; the lights go off; the TV comes on to static; someone knocks on a wall from the inside; one of them is poked by nothing. You are told what the visitor just did, the family's state and the visitor's earlier meddling.

THE STORY
Their fear rises with every act (suspicion, 0 to 100). Play it as a slow-burn ghost story that stays charming and family-friendly: eerie, never gory, no violence beyond waving a broom, a frying pan, a toy sword and a wooden spoon.
- calm (0-19): it is a normal evening. They explain it away: the wind, the kids, an old shelf. Mr Tickle tidies up.
- uneasy (20-39): Ms Tickle asks what is happening and whether everything is alright. Mr Tickle insists everything is alright, a bit too firmly.
- aware (40-59): they realise someone is in the house. They whisper. The children are frightened.
- afraid (60-79): they stop pretending. The parents arm themselves (broom, frying pan), the children hide, they whisper plans to the empty room.
- fight (80-99): the whole family, children included (toy sword, wooden spoon), hunts room by room to drive the visitor out. Warnings, countdowns, battle cries.
- expel (100): they have found the visitor and throw them out of the front door.
React to exactly what the visitor did and where: a smashed vase in the living room is not an alarm clock in the bedroom. Whoever is in that room, or nearest, speaks first. Someone asleep only speaks if the act was loud enough to wake them. Vary the lines and never repeat one from earlier. Callbacks to their world are welcome: tenths of a second, ad labels, the three-second rule, "Collab" as Mr Tickle's nemesis, his day at work, dinner, bedtime.
For "chat" (nothing just happened), write the family's small talk about their evening, two or three lines, in keeping with how frightened they are. For a knock on the front door, someone calls out from inside before they answer it.

THE NARRATOR
The narrator speaks to the visitor, not the family: a dry, amused, faintly disappointed British voice in the second person and the past tense, like the narrator of a story the visitor is not quite following. One sentence, at most 140 characters. Comment on what the visitor just did and what it means to the family; predict, tease, guilt-trip, never insult. Leave it empty about half the time, and always for "chat".

RULES
- Lines: 1 to 3 (up to 4 only for chat), each at most 70 characters, plain English, no emoji, no stage directions, no quotation marks around the line. "tone" is say, whisper (when they are afraid of being heard) or shout.
- Never mention a game, a player, a website's code, AI or any model. The family does not know what the visitor is.
- "suspicion" is an integer within the bounds you are given.

OUTPUT
JSON only, in the given schema.`;

// ponytail: per-instance memory. On several server instances each keeps its own counts; move these to a shared store
// (Vercel KV or Upstash) if the game is opened to heavy traffic.
const WINDOW_MS = 10 * 60_000;
const PER_CLIENT = 30;
const MIN_GAP_MS = 2_000;
const PER_DAY = 500;
const clients = new Map<string, number[]>();
let day = "";
let today = 0;

function allow(id: string, now: number) {
  const date = new Date(now).toISOString().slice(0, 10);
  if (date !== day) {
    day = date;
    today = 0;
    clients.clear();
  }
  if (today >= PER_DAY) return false;
  const recent = (clients.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_CLIENT || (recent.length > 0 && now - recent[recent.length - 1] < MIN_GAP_MS)) return false;
  recent.push(now);
  clients.set(id, recent);
  today += 1;
  return true;
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "offline");

  const raw = await request.text();
  if (raw.length > 4_000) return fail(413, "too_large");
  let body: { event?: unknown; state?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "bad_json");
  }
  const event = parseEvent(body.event);
  const state = parseState(body.state);
  if (!event || !state) return fail(400, "bad_request");

  const id = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(id, Date.now())) return fail(429, "slow_down");

  const range = bounds(state.suspicion, event, state.count);
  const brief = {
    just_now: event.type === "chat" ? "chat" : describe(event),
    earlier: state.past.map(describe),
    meddling_so_far: state.count,
    suspicion_before: state.suspicion,
    suspicion_bounds: range,
    stage_after: stageOf(range.max),
    time: state.night ? "night, the family has gone to bed" : "evening",
    lights: state.lights ? "on" : "off",
    tv: state.tv ? "on (static)" : "off",
    mess_on_the_floor: state.mess,
    family: Object.fromEntries(
      WHO.map((w) => {
        const m = state.family[w];
        return [w, `${NAMES[w]}: in the ${ROOM_NAMES[m.room]}, ${m.asleep ? "asleep" : m.doing}${m.armed ? ", armed" : ""}`];
      }),
    ),
  };

  // Cancel the call if the visitor's browser gives up on it: the game has already moved on.
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  const started = Date.now();
  try {
    const response = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 8_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "high", format: { type: "json_schema", schema: REPLY_SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(brief) }],
      },
      { signal: request.signal },
    );
    if (response.stop_reason !== "end_turn") return fail(502, `stopped_${response.stop_reason}`);
    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail(502, "unreadable");
    }
    const reply = sanitizeReply(parsed, range.min, range.max);
    if (!reply) return fail(502, "empty");
    return NextResponse.json({ reply, ms: Date.now() - started });
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return fail(499, "gone");
    if (error instanceof Anthropic.RateLimitError) return fail(429, "busy");
    if (error instanceof Anthropic.AuthenticationError) {
      console.warn("cave writer: the API key was rejected");
      return fail(503, "offline");
    }
    if (error instanceof Anthropic.APIError) {
      console.warn(`cave writer: API error ${error.status}`);
      return fail(502, "upstream");
    }
    console.warn("cave writer: request failed", error instanceof Error ? error.name : "unknown");
    return fail(502, "upstream");
  }
}
