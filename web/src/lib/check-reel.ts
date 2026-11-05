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
async function findStoredVideo(url: string): Promise<HeadBlobResult | Refusal> {
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

/** What we pay for per request, each with its own count per day. */
const SPEND = {
  analyze: { capEnv: "ANALYZE_DAILY_CAP", fallback: 25, noun: "checks" },
  finer: { capEnv: "FINER_DAILY_CAP", fallback: 10, noun: "finer details" },
  brand_kit: { capEnv: "BRAND_KIT_DAILY_CAP", fallback: 10, noun: "brand kit reads" },
} as const;
type SpendKind = keyof typeof SPEND;
export interface Refusal {
  error: string;
  status: number;
}

/** The kill switch for all of them. Unset, "true" or "1" allows; any other value stops, so a typo can't leave spending on. */
function spendEnabled(): boolean {
  const flag = process.env.ANALYZE_ENABLED?.trim().toLowerCase();
  return !flag || flag === "true" || flag === "1";
}

function switchedOff(kind: SpendKind): Refusal {
  const { noun } = SPEND[kind];
  return { error: `${noun[0].toUpperCase()}${noun.slice(1)} are switched off right now. Please try again later.`, status: 503 };
}

function usedUp(kind: SpendKind): Refusal {
  return { error: `Today's free ${SPEND[kind].noun} are used up. Please try again after midnight IST.`, status: 429 };
}

/**
 * Takes one of today's uses (midnight to midnight IST), or returns false once the cap is reached. One write
 * transaction, so racing requests can't overshoot. Every attempt counts, even one that then fails: the money may be
 * spent by then. The table is created here because /check has no account, so schemaReady() never runs.
 */
async function claimDaily(kind: SpendKind): Promise<boolean> {
  const { capEnv, fallback } = SPEND[kind];
  const configured = Number.parseInt(process.env[capEnv] ?? "", 10);
  const cap = configured >= 0 ? configured : fallback;
  if (cap === 0) return false;
  const [, claim] = await db.batch(
    [
      "CREATE TABLE IF NOT EXISTS spend_day (kind TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (kind, day))",
      {
        sql: `INSERT INTO spend_day (kind, day, count) VALUES (?, date('now', '+330 minutes'), 1)
              ON CONFLICT (kind, day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`,
        args: [kind, cap],
      },
    ],
    "write",
  );
  return claim.rows.length > 0;
}

/** Before a finer details or brand kit read starts: the kill switch, then today's count. Returns why it can't, or null. */
export async function admitSpend(kind: Exclude<SpendKind, "analyze">): Promise<Refusal | null> {
  if (!spendEnabled()) return switchedOff(kind);
  return (await claimDaily(kind)) ? null : usedUp(kind);
}

/**
 * Every route that starts a check comes through here first: the kill switch, our own store, then the daily cap.
 * Returns the stored video, or why the check can't run. Without a worker nothing is spent, so the cap doesn't apply.
 */
export async function admitCheck(url: string): Promise<HeadBlobResult | Refusal> {
  if (!spendEnabled()) return switchedOff("analyze");
  const video = await findStoredVideo(url);
  if ("error" in video) return video;
  if (process.env.WORKER_URL && !(await claimDaily("analyze"))) return usedUp("analyze");
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
