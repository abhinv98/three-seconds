import { buildMockReport } from "@/lib/mock";
import type { Report } from "@/lib/report";

/** Headers for the analysis worker. A deployed worker answers only with WORKER_TOKEN, the secret it shares with us. */
export function workerHeaders(contentType: string): Record<string, string> {
  const token = process.env.WORKER_TOKEN;
  return token ? { "content-type": contentType, authorization: `Bearer ${token}` } : { "content-type": contentType };
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
