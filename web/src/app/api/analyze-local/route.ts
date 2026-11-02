import { NextResponse } from "next/server";
import { workerHeaders } from "@/lib/check-reel";
import { MAX_BYTES } from "@/lib/limits";

// Development only. Without a Blob token the video stays in the browser tab, so /check posts its bytes here and
// this route streams them to the worker's /analyze-upload (switched on there by ALLOW_UPLOADS=1). Anywhere else
// it's a 404: deployed, uploads go to Vercel Blob and the worker downloads them through /api/analyze.
export const maxDuration = 300;

export async function POST(request: Request) {
  const workerUrl = process.env.WORKER_URL;
  if (process.env.NODE_ENV !== "development" || !workerUrl) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  const filename = params.get("filename") ?? "";
  const sourceUrl = params.get("sourceUrl") ?? "";
  if (!filename || filename.length > 255 || !sourceUrl || sourceUrl.length > 2048 || !request.body) {
    return NextResponse.json({ error: "Send the video as the body, with ?filename= and ?sourceUrl=." }, { status: 400 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return NextResponse.json({ error: `Video is larger than ${MAX_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
  }

  const target = new URL(`${workerUrl.replace(/\/+$/, "")}/analyze-upload`);
  target.searchParams.set("filename", filename);
  target.searchParams.set("source_url", sourceUrl);
  // Node's fetch streams a request body only in half-duplex mode.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: workerHeaders("application/octet-stream"),
    body: request.body,
    duplex: "half",
    signal: AbortSignal.timeout(290_000),
  };
  try {
    const response = await fetch(target, init);
    const report = await response.json().catch(() => null);
    if (!response.ok || !report) {
      const detail = report && typeof report.detail === "string" ? `: ${report.detail}` : "";
      return NextResponse.json({ error: `The analysis worker returned HTTP ${response.status}${detail}.` }, { status: 502 });
    }
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: `The analysis worker could not be reached: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
