import { reelScope, type Member, type Verdict } from "@/lib/account";
import { requiredHold } from "@/lib/asci";
import { all } from "@/lib/db";
import type { ReelReview } from "@/lib/review";

// The overview's numbers, all measured from the Reels a viewer can see: what the rows hold, and nothing else. A check's
// report is JSON, so SQLite pulls out only what's used here instead of the whole report per Reel.

export interface OverviewReel {
  id: string;
  filename: string;
  status: "checking" | "done" | "error";
  verdict: Verdict | null;
  owner_id: string;
  owner_name: string;
  brand_name: string | null;
  sent_at: string | null;
  created_at: string;
  duration_s: number | null;
  /** The label's longest unbroken stretch: the number ASCI's hold rule is checked against. */
  hold_s: number | null;
  /** JSON arrays of the titles of the checks that failed, and that need a person. */
  failed: string | null;
  reviewing: string | null;
  has_poster: number;
}

export function overviewReels(viewer: Member): Promise<OverviewReel[]> {
  const { where, args } = reelScope(viewer);
  return all<OverviewReel>(
    `SELECT r.id, r.filename, r.status, r.verdict, r.owner_id, p.display_name AS owner_name, b.name AS brand_name, r.sent_at, r.created_at, r.poster IS NOT NULL AS has_poster,
            json_extract(r.report, '$.video.duration_s') AS duration_s,
            (SELECT json_extract(t.value, '$.longest_continuous_s') FROM json_each(r.report, '$.tracks') t
              WHERE json_extract(t.value, '$.kind') = 'disclosure_label' LIMIT 1) AS hold_s,
            (SELECT json_group_array(json_extract(c.value, '$.title')) FROM json_each(r.report, '$.checks') c
              WHERE json_extract(c.value, '$.verdict') = 'FAIL') AS failed,
            (SELECT json_group_array(json_extract(c.value, '$.title')) FROM json_each(r.report, '$.checks') c
              WHERE json_extract(c.value, '$.verdict') = 'REVIEW') AS reviewing
       FROM reel r JOIN profile p ON p.user_id = r.owner_id LEFT JOIN brand b ON b.id = r.brand_id
      WHERE ${where}
      ORDER BY COALESCE(r.sent_at, r.created_at) DESC`,
    ...args,
  );
}

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const WEEKS = 8;

/** Monday 00:00 IST of the week an instant falls in. Day 0 of the epoch was a Thursday. */
export function weekStart(ms: number): number {
  const day = Math.floor((ms + IST_MS) / DAY_MS);
  return (day - ((day + 3) % 7)) * DAY_MS - IST_MS;
}

const titles = (json: string | null): string[] => (json ? (JSON.parse(json) as string[]) : []);

export interface TrendWeek {
  start: number;
  pass: number;
  review: number;
  fail: number;
}

export interface QueueItem {
  reel: OverviewReel;
  tone: "fail" | "review" | "waiting" | "changes" | "error";
  reason: string;
}

export interface ActivityItem {
  at: string;
  reelId: string;
  who: string;
  did: string;
  filename: string;
}

export interface Overview {
  checked: number;
  checkedThisWeek: number;
  passed: number;
  reviewing: number;
  failed: number;
  /** 0-1, or null with nothing checked. */
  passRate: number | null;
  /** Means over checked Reels; a Reel with no label held for 0 seconds. Null with nothing checked. */
  hold: { held: number; needed: number } | null;
  topFailure: { title: string; count: number } | null;
  /** Other people's Reels, grouped by creator: anyone with a fail, most fails first. */
  watch: { id: string; name: string; fails: number; total: number }[];
  trend: TrendWeek[];
  queue: QueueItem[];
  activity: ActivityItem[];
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const SEVERITY: Record<QueueItem["tone"], number> = { fail: 0, error: 1, changes: 2, review: 3, waiting: 4 };

/** Why a Reel needs someone, or null when it doesn't. A brand decides; a creator fixes, then sends. */
function needsAttention(reel: OverviewReel, review: ReelReview | undefined, brandView: boolean): QueueItem | null {
  if (reel.status === "error") return { reel, tone: "error", reason: "The check didn't finish." };
  if (reel.status !== "done" || !reel.verdict) return null;
  if (review?.status === "approved") return null;
  if (review?.status === "changes") {
    return brandView ? null : { reel, tone: "changes", reason: review.note ? `${review.by_name} asked for changes: ${review.note}` : `${review.by_name} asked for changes.` };
  }
  if (reel.verdict === "FAIL") return { reel, tone: "fail", reason: titles(reel.failed)[0] ?? "A check failed." };
  if (reel.verdict === "REVIEW") return { reel, tone: "review", reason: titles(reel.reviewing)[0] ?? "A person should look at this." };
  if (brandView) return { reel, tone: "waiting", reason: "Passed. Waiting for your approval." };
  return reel.sent_at ? null : { reel, tone: "waiting", reason: "Passed. Ready to send to a brand." };
}

export function summarize(reels: OverviewReel[], reviews: Map<string, ReelReview>, viewer: { id: string; brandView: boolean }, now = Date.now()): Overview {
  const done = reels.filter((r) => r.status === "done" && r.verdict);
  const count = (verdict: Verdict) => done.filter((r) => r.verdict === verdict).length;
  const passed = count("PASS");

  const timed = done.filter((r) => r.duration_s);
  const hold = timed.length ? { held: mean(timed.map((r) => r.hold_s ?? 0)), needed: mean(timed.map((r) => requiredHold(r.duration_s!).seconds)) } : null;

  const failures = new Map<string, number>();
  for (const reel of done) for (const title of titles(reel.failed)) failures.set(title, (failures.get(title) ?? 0) + 1);
  const [topTitle, topCount] = [...failures].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];

  const creators = new Map<string, { id: string; name: string; fails: number; total: number }>();
  for (const reel of done) {
    if (reel.owner_id === viewer.id) continue;
    const creator = creators.get(reel.owner_id) ?? { id: reel.owner_id, name: reel.owner_name, fails: 0, total: 0 };
    creator.total += 1;
    if (reel.verdict === "FAIL") creator.fails += 1;
    creators.set(reel.owner_id, creator);
  }

  const thisWeek = weekStart(now);
  const trend: TrendWeek[] = Array.from({ length: WEEKS }, (_, i) => ({ start: thisWeek - (WEEKS - 1 - i) * 7 * DAY_MS, pass: 0, review: 0, fail: 0 }));
  for (const reel of done) {
    const week = trend.find((w) => w.start === weekStart(Date.parse(reel.created_at)));
    if (week) week[reel.verdict === "PASS" ? "pass" : reel.verdict === "FAIL" ? "fail" : "review"] += 1;
  }

  const queue = reels
    .flatMap((reel) => needsAttention(reel, reviews.get(reel.id), viewer.brandView) ?? [])
    .sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone] || Date.parse(a.reel.created_at) - Date.parse(b.reel.created_at));

  const activity: ActivityItem[] = reels.flatMap((reel) => {
    const items: ActivityItem[] = [];
    const who = reel.owner_id === viewer.id ? "You" : reel.owner_name;
    if (reel.status === "done" && reel.verdict) items.push({ at: reel.created_at, reelId: reel.id, who, did: `checked it: ${reel.verdict}`, filename: reel.filename });
    if (reel.sent_at) items.push({ at: reel.sent_at, reelId: reel.id, who, did: `sent it to ${reel.brand_name ?? "a brand"}`, filename: reel.filename });
    const review = reviews.get(reel.id);
    if (review) items.push({ at: review.at, reelId: reel.id, who: review.by_name, did: review.status === "approved" ? "approved it" : "asked for changes", filename: reel.filename });
    return items;
  });
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    checked: done.length,
    checkedThisWeek: done.filter((r) => Date.parse(r.created_at) >= thisWeek).length,
    passed,
    reviewing: count("REVIEW"),
    failed: count("FAIL"),
    passRate: done.length ? passed / done.length : null,
    hold,
    topFailure: topTitle ? { title: topTitle, count: topCount } : null,
    watch: [...creators.values()].filter((c) => c.fails > 0).sort((a, b) => b.fails - a.fails || a.name.localeCompare(b.name)),
    trend,
    queue,
    activity: activity.slice(0, 5),
  };
}
