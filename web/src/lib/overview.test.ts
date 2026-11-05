import { expect, test, vi } from "vitest";
import type { ReelReview } from "@/lib/review";

vi.mock("@/lib/account", () => ({ reelScope: () => ({ where: "1", args: [] }) }));
vi.mock("@/lib/db", () => ({ all: async () => [] }));
const { summarize, weekStart } = await import("./overview");
type Row = Parameters<typeof summarize>[0][number];

const NOW = Date.parse("2026-11-05T10:00:00Z"); // a Thursday
const reel = (over: Partial<Row>): Row => ({
  id: "r",
  filename: "reel.mp4",
  status: "done",
  verdict: "PASS",
  owner_id: "creator-a",
  owner_name: "Asha",
  brand_name: "Acme",
  sent_at: "2026-11-04T10:00:00Z",
  created_at: "2026-11-04T09:00:00Z",
  duration_s: 30,
  hold_s: 12,
  failed: "[]",
  reviewing: "[]",
  has_poster: 1,
  ...over,
});
const brand = { id: "brand-owner", brandView: true };
const creator = { id: "creator-a", brandView: false };

test("weeks start on Monday at midnight in India", () => {
  expect(new Date(weekStart(NOW)).toISOString()).toBe("2026-11-01T18:30:00.000Z"); // Monday 2 Nov, 00:00 IST
  expect(weekStart(Date.parse("2026-11-01T18:29:59Z"))).toBe(weekStart(NOW) - 7 * 86_400_000); // still Sunday in India
});

test("nothing checked gives no rates at all, not zeros", () => {
  const o = summarize([], new Map(), brand, NOW);
  expect(o.checked).toBe(0);
  expect(o.passRate).toBeNull();
  expect(o.hold).toBeNull();
  expect(o.topFailure).toBeNull();
  expect(o.trend).toHaveLength(8);
  expect(o.trend.flatMap((w) => [w.pass, w.review, w.fail]).every((n) => n === 0)).toBe(true);
});

test("rates, hold and the top failure come from checked Reels only", () => {
  const rows = [
    reel({ id: "1", verdict: "PASS", hold_s: 12 }),
    reel({ id: "2", verdict: "FAIL", hold_s: 3, failed: '["Label held long enough"]' }),
    reel({ id: "3", verdict: "FAIL", hold_s: null, duration_s: 15, failed: '["Disclosure label on screen","Label held long enough"]' }),
    reel({ id: "4", verdict: "REVIEW", hold_s: 9, reviewing: '["Label held long enough"]' }),
    reel({ id: "5", status: "checking", verdict: null, hold_s: null, duration_s: null }),
    reel({ id: "6", status: "error", verdict: null, hold_s: null, duration_s: null }),
  ];
  const o = summarize(rows, new Map(), brand, NOW);
  expect(o.checked).toBe(4);
  expect(o.passRate).toBe(0.25);
  // (12 + 3 + 0 + 9) / 4 against (10 + 10 + 3 + 10) / 4: a third of 30 s, and 3 s for 15 s or less.
  expect(o.hold).toEqual({ held: 6, needed: 8.25 });
  expect(o.topFailure).toEqual({ title: "Label held long enough", count: 2 });
});

test("creators to watch skip the viewer and anyone with no fail", () => {
  const rows = [
    reel({ id: "1", verdict: "FAIL", failed: '["x"]' }),
    reel({ id: "2", verdict: "PASS" }),
    reel({ id: "3", verdict: "FAIL", owner_id: "creator-b", owner_name: "Bilal", failed: '["x"]' }),
    reel({ id: "4", verdict: "FAIL", owner_id: "creator-b", owner_name: "Bilal", failed: '["x"]' }),
    reel({ id: "5", verdict: "PASS", owner_id: "creator-c", owner_name: "Chitra" }),
    reel({ id: "6", verdict: "FAIL", owner_id: "brand-owner", owner_name: "Team", failed: '["x"]' }),
  ];
  expect(summarize(rows, new Map(), brand, NOW).watch).toEqual([
    { id: "creator-b", name: "Bilal", fails: 2, total: 2 },
    { id: "creator-a", name: "Asha", fails: 1, total: 2 },
  ]);
});

test("the trend counts each verdict in the week it was checked, and drops older weeks", () => {
  const rows = [
    reel({ id: "1", verdict: "PASS", created_at: "2026-11-04T09:00:00Z" }),
    reel({ id: "2", verdict: "FAIL", created_at: "2026-11-02T01:00:00Z" }),
    reel({ id: "3", verdict: "REVIEW", created_at: "2026-10-28T09:00:00Z" }),
    reel({ id: "4", verdict: "PASS", created_at: "2026-08-01T09:00:00Z" }),
  ];
  const o = summarize(rows, new Map(), brand, NOW);
  expect(o.trend[7]).toMatchObject({ pass: 1, fail: 1, review: 0 });
  expect(o.trend[6]).toMatchObject({ pass: 0, fail: 0, review: 1 });
  expect(o.checkedThisWeek).toBe(2);
  expect(o.trend.reduce((n, w) => n + w.pass + w.fail + w.review, 0)).toBe(3);
});

test("the queue: a brand decides, a creator fixes and sends", () => {
  const approved: ReelReview = { status: "approved", note: null, by_name: "Mira", at: "2026-11-04T12:00:00Z" };
  const changes: ReelReview = { status: "changes", note: "Hold it longer", by_name: "Mira", at: "2026-11-04T12:00:00Z" };
  const rows = [
    reel({ id: "pass", verdict: "PASS", created_at: "2026-11-01T09:00:00Z" }),
    reel({ id: "fail", verdict: "FAIL", failed: '["Label held long enough"]', created_at: "2026-11-03T09:00:00Z" }),
    reel({ id: "review", verdict: "REVIEW", reviewing: '["Disclosure label on screen"]' }),
    reel({ id: "approved", verdict: "FAIL" }),
    reel({ id: "changes", verdict: "FAIL" }),
    reel({ id: "broken", status: "error", verdict: null }),
    reel({ id: "running", status: "checking", verdict: null }),
  ];
  const reviews = new Map([
    ["approved", approved],
    ["changes", changes],
  ]);
  const asBrand = summarize(rows, reviews, brand, NOW).queue;
  expect(asBrand.map((q) => q.reel.id)).toEqual(["fail", "broken", "review", "pass"]);
  expect(asBrand[0].reason).toBe("Label held long enough");
  const asCreator = summarize(rows, reviews, creator, NOW).queue;
  expect(asCreator.map((q) => q.reel.id)).toEqual(["fail", "broken", "changes", "review"]);
  expect(asCreator[2].reason).toBe("Mira asked for changes: Hold it longer");
});

test("activity lists real events, newest first", () => {
  const rows = [reel({ id: "1", verdict: "FAIL", failed: '["x"]', created_at: "2026-11-01T09:00:00Z", sent_at: "2026-11-02T09:00:00Z" }), reel({ id: "2", status: "checking", verdict: null, sent_at: null })];
  const reviews = new Map<string, ReelReview>([["1", { status: "changes", note: null, by_name: "Mira", at: "2026-11-03T09:00:00Z" }]]);
  expect(summarize(rows, reviews, brand, NOW).activity.map((a) => `${a.who} ${a.did}`)).toEqual(["Mira asked for changes", "Asha sent it to Acme", "Asha checked it: FAIL"]);
});
