import { expect, test } from "vitest";
import { filterReels, libraryUrl, NO_FILTER, parseLibraryQuery, rankReels, type LibraryReel } from "./reel-search";

const reel = (over: Partial<LibraryReel>): LibraryReel => ({
  id: "r",
  filename: "reel.mp4",
  owner_name: "Asha",
  owner_id: "a",
  verdict: "PASS",
  status: "done",
  created_at: "2026-11-01T00:00:00Z",
  sent_at: null,
  review: null,
  hasPoster: true,
  ...over,
});

const ids = (reels: { id: string }[]) => reels.map((r) => r.id);

test("search needs every word, across name, creator and verdict; a name that starts with it comes first", () => {
  const reels = [
    reel({ id: "1", filename: "old-beach.mp4" }),
    reel({ id: "2", filename: "beach-final.mp4" }),
    reel({ id: "3", filename: "city.mp4", owner_name: "Beach Boys" }),
    reel({ id: "4", filename: "beach-fail.mp4", verdict: "FAIL" }),
  ];
  expect(ids(rankReels(reels, "beach"))).toEqual(["2", "4", "1", "3"]);
  expect(ids(rankReels(reels, "beach fail"))).toEqual(["4"]);
  expect(ids(rankReels(reels, "  "))).toEqual(["1", "2", "3", "4"]);
});

test("filters combine", () => {
  const reels = [
    reel({ id: "1", verdict: "FAIL", owner_id: "a" }),
    reel({ id: "2", verdict: "FAIL", owner_id: "b", review: "changes" }),
    reel({ id: "3", verdict: "PASS", owner_id: "a", review: "approved" }),
    reel({ id: "4", verdict: null, owner_id: "a", status: "checking" }),
  ];
  expect(ids(filterReels(reels, { ...NO_FILTER, verdict: "FAIL" })).sort()).toEqual(["1", "2"]);
  expect(ids(filterReels(reels, { ...NO_FILTER, verdict: "FAIL", creator: "a" }))).toEqual(["1"]);
  expect(ids(filterReels(reels, { ...NO_FILTER, state: "approved" }))).toEqual(["3"]);
  expect(ids(filterReels(reels, { ...NO_FILTER, state: "changes" }))).toEqual(["2"]);
  // Still running isn't waiting on anyone.
  expect(ids(filterReels(reels, { ...NO_FILTER, state: "waiting" }))).toEqual(["1"]);
});

test("sorting: arrival is when it was sent, and worst first leaves unfinished Reels last", () => {
  const reels = [
    reel({ id: "new", filename: "b.mp4", verdict: "PASS", created_at: "2026-10-01T00:00:00Z", sent_at: "2026-11-05T00:00:00Z" }),
    reel({ id: "mid", filename: "c.mp4", verdict: "FAIL", created_at: "2026-11-02T00:00:00Z" }),
    reel({ id: "old", filename: "a.mp4", verdict: "REVIEW", created_at: "2026-10-20T00:00:00Z" }),
    reel({ id: "run", filename: "d.mp4", verdict: null, status: "checking", created_at: "2026-11-04T00:00:00Z" }),
  ];
  expect(ids(filterReels(reels, NO_FILTER))).toEqual(["new", "run", "mid", "old"]);
  expect(ids(filterReels(reels, { ...NO_FILTER, sort: "oldest" }))).toEqual(["old", "mid", "run", "new"]);
  expect(ids(filterReels(reels, { ...NO_FILTER, sort: "worst" }))).toEqual(["mid", "old", "new", "run"]);
  expect(ids(filterReels(reels, { ...NO_FILTER, sort: "name" }))).toEqual(["old", "new", "mid", "run"]);
});

test("the URL round trips, and junk in it is ignored", () => {
  const query = { q: "beach", verdict: "FAIL", state: "waiting", creator: "abc", sort: "worst" } as const;
  const url = libraryUrl(query, "list");
  const parsed = parseLibraryQuery(Object.fromEntries(new URLSearchParams(url)));
  expect(parsed).toEqual(query);
  expect(parseLibraryQuery({ verdict: "NOPE", state: ["x"], sort: "<script>" })).toEqual(NO_FILTER);
  expect(libraryUrl(NO_FILTER, "grid")).toBe("?");
});
