import Anthropic from "@anthropic-ai/sdk";

// One Claude request that answers in JSON matching a schema, optionally searching the web on the way. Shared by
// the brand research and the finer-details read.

export const MODEL = "claude-opus-5-5";
/** For a small pick where Opus would be waste. It has no server-side fallback on a refusal. */
export const CHEAP_MODEL = "claude-haiku-5-5";

/** List prices: per million tokens, and per web search. */
const PRICES = {
  [MODEL]: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2, search: 0.01 },
  [CHEAP_MODEL]: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01, search: 0.01 },
};

export interface Answer<T> {
  data: T;
  costUsd: number;
  searches: number;
}

export async function askForJson<T>({
  content,
  schema,
  effort,
  searches = 0,
  fetches = 0,
  model = MODEL,
}: {
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  /** Web searches allowed (0 for none). */
  searches?: number;
  /** Page fetches allowed (0 for none). */
  fetches?: number;
  model?: typeof MODEL | typeof CHEAP_MODEL;
}): Promise<Answer<T>> {
  const client = new Anthropic();
  const PRICE = PRICES[model];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(searches ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: searches }] : []),
    ...(fetches ? [{ type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: fetches }] : []),
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  let costUsd = 0;
  let searched = 0;
  // A long turn with server tools can pause; sending it back lets the server carry on.
  for (let turn = 0; turn < 4; turn++) {
    const message = await client.beta.messages
      .stream({
        model,
        max_tokens: 32000,
        ...(model === MODEL ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        ...(tools.length ? { tools } : {}),
        output_config: { effort, format: { type: "json_schema", schema } },
        messages,
      })
      .finalMessage();
    const u = message.usage;
    searched += u.server_tool_use?.web_search_requests ?? 0;
    costUsd +=
      ((u.input_tokens ?? 0) * PRICE.input +
        (u.output_tokens ?? 0) * PRICE.output +
        (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
        (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
      1e6;
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    costUsd += searched * PRICE.search;
    if (message.stop_reason === "refusal") throw new Error("Claude declined the request.");
    if (message.stop_reason === "max_tokens") throw new Error("Claude ran out of room before it finished.");
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    try {
      return { data: JSON.parse(text) as T, costUsd, searches: searched };
    } catch {
      throw new Error("Claude's answer wasn't JSON.");
    }
  }
  throw new Error("Claude kept pausing and never finished.");
}
