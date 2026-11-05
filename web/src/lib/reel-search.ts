// Searching and filtering the Reels a viewer can see, for the command palette and the library. Both run on the client.

export type VerdictWord = "PASS" | "FAIL" | "REVIEW";

/** What the command palette and the library search over. */
export interface ReelHit {
  id: string;
  filename: string;
  owner_name: string;
  verdict: VerdictWord | null;
}

/** Every word has to appear in the file name, the creator or the verdict; a file name that starts with the query goes first. */
export function rankReels<T extends ReelHit>(reels: T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return reels;
  const matching = reels.filter((reel) => {
    const text = `${reel.filename} ${reel.owner_name} ${reel.verdict ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const whole = query.trim().toLowerCase();
  const starts = matching.filter((reel) => reel.filename.toLowerCase().startsWith(whole));
  return [...starts, ...matching.filter((reel) => !starts.includes(reel))];
}

export interface LibraryReel extends ReelHit {
  owner_id: string;
  status: "checking" | "done" | "error";
  created_at: string;
  sent_at: string | null;
  review: "approved" | "changes" | null;
  hasPoster: boolean;
}

export type StateFilter = "approved" | "changes" | "waiting" | "";
export type SortKey = "newest" | "oldest" | "worst" | "name";

export interface LibraryQuery {
  q: string;
  verdict: VerdictWord | "";
  state: StateFilter;
  creator: string;
  sort: SortKey;
}

export const NO_FILTER: LibraryQuery = { q: "", verdict: "", state: "", creator: "", sort: "newest" };

const SEVERITY: Record<string, number> = { FAIL: 0, REVIEW: 1, PASS: 2 };
const arrived = (reel: LibraryReel) => Date.parse(reel.sent_at ?? reel.created_at);

/** The one test for "waiting": checked, and nobody has answered it yet. */
export const isWaiting = (reel: LibraryReel) => reel.status === "done" && reel.review === null;

export function filterReels(reels: LibraryReel[], query: LibraryQuery): LibraryReel[] {
  const kept = rankReels(reels, query.q).filter(
    (reel) =>
      (!query.verdict || reel.verdict === query.verdict) &&
      (!query.creator || reel.owner_id === query.creator) &&
      (!query.state || (query.state === "waiting" ? isWaiting(reel) : reel.review === query.state)),
  );
  const newest = (a: LibraryReel, b: LibraryReel) => arrived(b) - arrived(a);
  const sorters: Record<SortKey, (a: LibraryReel, b: LibraryReel) => number> = {
    newest,
    oldest: (a, b) => arrived(a) - arrived(b),
    // Reels with no verdict yet (still running, or stopped) go after the ones that have one.
    worst: (a, b) => (SEVERITY[a.verdict ?? ""] ?? 3) - (SEVERITY[b.verdict ?? ""] ?? 3) || newest(a, b),
    name: (a, b) => a.filename.localeCompare(b.filename),
  };
  return [...kept].sort(sorters[query.sort]);
}

const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** The library's state from its URL, so a link or the Back button brings the same view back. Anything unknown is ignored. */
export function parseLibraryQuery(params: Record<string, string | string[] | undefined>): LibraryQuery {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };
  return {
    q: one("q").slice(0, 100),
    verdict: pick(one("verdict"), ["FAIL", "REVIEW", "PASS", ""], ""),
    state: pick(one("state"), ["approved", "changes", "waiting", ""], ""),
    creator: one("creator").slice(0, 100),
    sort: pick(one("sort"), ["newest", "oldest", "worst", "name"], "newest"),
  };
}

export function libraryUrl(query: LibraryQuery, view: "grid" | "list"): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.verdict) params.set("verdict", query.verdict);
  if (query.state) params.set("state", query.state);
  if (query.creator) params.set("creator", query.creator);
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (view !== "grid") params.set("view", view);
  const text = params.toString();
  return text ? `?${text}` : "?";
}
