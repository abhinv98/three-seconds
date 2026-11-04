import { head, type HeadBlobResult } from "@vercel/blob";
import { db } from "@/lib/db";
import { ACCEPTED_TYPES, MAX_BYTES } from "@/lib/limits";
import { buildMockReport } from "@/lib/mock";
import type { Report } from "@/lib/report";

/** Headers for the analysis worker. A deployed worker answers only with WORKER_TOKEN, the secret it shares with us. */
export function workerHeaders(contentType: string): Record<string, string> {
  const token = process.env.WORKER_TOKEN;
  return token ? { "content-type": contentType, authorization: `Bearer ${token}` } : { "content-type": contentType };
}

/** head() looks the URL up with this project's Blob token, so only a video in our own store gets past here. */
async function findStoredVideo(url: string): Promise<HeadBlobResult | { error: string; status: number }> {
  const blob = await head(url).catch(() => null);
  if (!blob || !blob.pathname.startsWith("videos/")) {
    return { error: "That video isn't in this site's storage. Upload it again.", status: 400 };
  }
  if (!(ACCEPTED_TYPES as readonly string[]).includes(blob.contentType)) {
    return { error: "Upload an MP4 or MOV.", status: 415 };
  }
  if (blob.size === 0 || blob.size > MAX_BYTES) {
    return { error: `Upload a video up to ${MAX_BYTES / (1024 * 1024)} MB.`, status: 413 };
  }
  return blob;
}

/** The kill switch. Unset, "true" or "1" allows checks; any other value stops them, so a typo can't leave spending on. */
function analysisEnabled(): boolean {
  const flag = process.env.ANALYZE_ENABLED?.trim().toLowerCase();
  return !flag || flag === "true" || flag === "1";
}

const DEFAULT_DAILY_CAP = 25;

/**
 * Takes one of today's analyses (midnight to midnight IST), or returns false once ANALYZE_DAILY_CAP are taken. One
 * write transaction, so racing requests can't overshoot. Every attempt counts, even one the worker then fails: the
 * money may be spent by then. The table is created here because /check has no account, so schemaReady() never runs.
 */
async function claimAnalysis(): Promise<boolean> {
  const configured = Number.parseInt(process.env.ANALYZE_DAILY_CAP ?? "", 10);
  const cap = configured >= 0 ? configured : DEFAULT_DAILY_CAP;
  if (cap === 0) return false;
  const [, claim] = await db.batch(
    [
      "CREATE TABLE IF NOT EXISTS analyze_day (day TEXT PRIMARY KEY, count INTEGER NOT NULL)",
      {
        sql: `INSERT INTO analyze_day (day, count) VALUES (date('now', '+330 minutes'), 1)
              ON CONFLICT (day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`,
        args: [cap],
      },
    ],
    "write",
  );
  return claim.rows.length > 0;
}

/**
 * Every route that starts a check comes through here first: the kill switch, our own store, then the daily cap.
 * Returns the stored video, or why the check can't run. Without a worker nothing is spent, so the cap doesn't apply.
 */
export async function admitCheck(url: string): Promise<HeadBlobResult | { error: string; status: number }> {
  if (!analysisEnabled()) return { error: "Checks are switched off right now. Please try again later.", status: 503 };
  const video = await findStoredVideo(url);
  if ("error" in video) return video;
  if (process.env.WORKER_URL && !(await claimAnalysis())) {
    return { error: "Today's free checks are used up. Please try again after midnight IST.", status: 429 };
  }
  return video;
}

/**
 * Checks a video in Vercel Blob. With WORKER_URL set, the worker's /analyze downloads and reads it; without one, the
 * sample report stands in, as on /check.
 */
export async function runCheck(videoUrl: string, filename: string): Promise<Report> {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return buildMockReport({ filename, blobUrl: videoUrl });
  }
  const response = await fetch(`${workerUrl.replace(/\/+$/, "")}/analyze`, {
    method: "POST",
    headers: workerHeaders("application/json"),
    body: JSON.stringify({ blob_url: videoUrl, filename }),
    signal: AbortSignal.timeout(290_000),
  });
  const body = (await response.json().catch(() => null)) as (Report & { detail?: unknown }) | null;
  if (!response.ok || !body) {
    throw new Error(typeof body?.detail === "string" ? body.detail : `The analysis worker returned HTTP ${response.status}.`);
  }
  return body;
}
