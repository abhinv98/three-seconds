import { getViewer, reelFor, type Member } from "@/lib/account";

// The video behind a report, only for someone who may see that Reel (lib/account.ts canSee): a redirect to the file
// in Vercel Blob, which answers the player's range requests itself, so seeking works.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.profile) return new Response("Sign in first.", { status: 401 });
  const reel = await reelFor(viewer as Member, (await params).id);
  if (!reel?.video_url) return new Response("Not found.", { status: 404 });
  return new Response(null, { status: 302, headers: { location: reel.video_url, "cache-control": "private, no-store" } });
}
