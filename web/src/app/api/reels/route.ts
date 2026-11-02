import { randomUUID } from "node:crypto";
import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { failReel, finishReel, getViewer, startReel, type Member } from "@/lib/account";
import { runCheck } from "@/lib/check-reel";
import { ACCEPTED_TYPES, MAX_BYTES } from "@/lib/limits";

// A signed-in member checks a Reel. The browser has already uploaded it to Vercel Blob (with a token from
// /api/upload); this records it, has the worker check it and keeps the report.
export const maxDuration = 300;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.profile) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { url?: unknown; filename?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
  if (!url || url.length > 2048 || !filename || filename.length > 255) {
    return NextResponse.json({ error: "Upload the video, then send { url, filename }." }, { status: 400 });
  }
  // head() looks the URL up with this project's Blob token, so only a video in our own store gets past here.
  const blob = await head(url).catch(() => null);
  if (!blob || !blob.pathname.startsWith("videos/")) {
    return NextResponse.json({ error: "That video isn't in this site's storage. Upload it again." }, { status: 400 });
  }
  if (!(ACCEPTED_TYPES as readonly string[]).includes(blob.contentType)) {
    return NextResponse.json({ error: "Upload an MP4 or MOV." }, { status: 415 });
  }
  if (blob.size === 0 || blob.size > MAX_BYTES) {
    return NextResponse.json({ error: `Upload a video up to ${MAX_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
  }

  const id = randomUUID();
  await startReel(viewer as Member, id, filename, blob.size, blob.url);
  try {
    await finishReel(id, await runCheck(blob.url, filename));
    return NextResponse.json({ id });
  } catch (error) {
    const message = (error as Error).message || "The check failed.";
    await failReel(id, message);
    return NextResponse.json({ id, error: message }, { status: 502 });
  }
}
