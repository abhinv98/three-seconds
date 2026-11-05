import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { failReel, finishReel, getViewer, reelsFor, startReel, type Member } from "@/lib/account";
import { admitCheck, runCheck } from "@/lib/check-reel";
import { validPoster } from "@/lib/poster";
import { requireWritable } from "@/lib/sample";

// A signed-in member checks a Reel. The browser has already uploaded it to Vercel Blob (with a token from
// /api/upload); this records it, has the worker check it and keeps the report.
export const maxDuration = 300;

/** The viewer's Reels for the command palette, which filters them on the client. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.profile) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const reels = await reelsFor(viewer as Member);
  return NextResponse.json({ reels: reels.map(({ id, filename, owner_name, verdict }) => ({ id, filename, owner_name, verdict })) });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.profile) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const readOnly = await requireWritable(viewer);
  if (readOnly) return NextResponse.json({ error: readOnly }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { url?: unknown; filename?: unknown; poster?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
  if (!url || url.length > 2048 || !filename || filename.length > 255) {
    return NextResponse.json({ error: "Upload the video, then send { url, filename }." }, { status: 400 });
  }
  const blob = await admitCheck(url);
  if ("error" in blob) return NextResponse.json({ error: blob.error }, { status: blob.status });

  const id = randomUUID();
  await startReel(viewer as Member, id, filename, blob.size, blob.url, validPoster(body?.poster));
  try {
    await finishReel(id, await runCheck(blob.url, filename));
    return NextResponse.json({ id });
  } catch (error) {
    const message = (error as Error).message || "The check failed.";
    await failReel(id, message);
    return NextResponse.json({ id, error: message }, { status: 502 });
  }
}
