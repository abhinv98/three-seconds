import { NextResponse } from "next/server";
import { admitCheck, workerHeaders } from "@/lib/check-reel";
import { buildMockReport } from "@/lib/mock";

// The worker reads frames with Muse Spark Open (8-30s per request) and, when the label's hold is within
// half a second of the requirement, re-reads its edges at 10 fps: a second round trip. Fluid compute allows 300s.
export const maxDuration = 300;

interface AnalyzeBody {
  blobUrl: string;
  filename: string;
  durationS?: number;
  width?: number;
  height?: number;
}

function parseBody(value: unknown): AnalyzeBody | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.blobUrl !== "string" || v.blobUrl.length === 0 || v.blobUrl.length > 2048) return null;
  if (typeof v.filename !== "string" || v.filename.length === 0 || v.filename.length > 255) return null;
  const optionalNumber = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined);
  return {
    blobUrl: v.blobUrl,
    filename: v.filename,
    durationS: optionalNumber(v.durationS),
    width: optionalNumber(v.width),
    height: optionalNumber(v.height),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: "Send { blobUrl, filename } as JSON." }, { status: 400 });
  }

  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    // A real check costs money; mock mode below doesn't (and in dev its URL is this tab's blob:, not the store's).
    const video = await admitCheck(body.blobUrl);
    if ("error" in video) return NextResponse.json({ error: video.error }, { status: video.status });
    try {
      const response = await fetch(`${workerUrl.replace(/\/+$/, "")}/analyze`, {
        method: "POST",
        headers: workerHeaders("application/json"),
        body: JSON.stringify({
          blob_url: video.url,
          filename: body.filename,
          duration_s: body.durationS,
          width: body.width,
          height: body.height,
        }),
        signal: AbortSignal.timeout(290_000),
      });
      const report = await response.json().catch(() => null);
      if (!response.ok || !report) {
        return NextResponse.json({ error: `The analysis worker returned HTTP ${response.status}.` }, { status: 502 });
      }
      return NextResponse.json(report);
    } catch (error) {
      return NextResponse.json(
        { error: `The analysis worker could not be reached: ${(error as Error).message}` },
        { status: 502 },
      );
    }
  }

  // Mock mode: the fixture with the real file swapped in, after a short pause.
  await sleep(2000);
  return NextResponse.json(
    buildMockReport({
      filename: body.filename,
      blobUrl: body.blobUrl,
      durationS: body.durationS,
      width: body.width,
      height: body.height,
    }),
  );
}
