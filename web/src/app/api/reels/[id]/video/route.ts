import { getViewer, reelFor, type Member } from "@/lib/account";
import { get } from "@/lib/db";
import { reelIdForShare } from "@/lib/review";

// The video behind a report: a redirect to the file in Vercel Blob, which answers the player's range requests itself, so
// seeking works. For someone who may see that Reel (lib/account.ts canSee), or with ?share= and that Reel's own share
// token, which decides alone: a revoked or wrong token gets nothing, signed in or not.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = new URL(request.url).searchParams.get("share");
  let videoUrl: string | null | undefined;
  if (share !== null) {
    if ((await reelIdForShare(share)) !== id) return new Response("Not found.", { status: 404 });
    videoUrl = (await get<{ video_url: string | null }>("SELECT video_url FROM reel WHERE id = ?", id))?.video_url;
  } else {
    const viewer = await getViewer();
    if (!viewer?.profile) return new Response("Sign in first.", { status: 401 });
    videoUrl = (await reelFor(viewer as Member, id))?.video_url;
  }
  if (!videoUrl) return new Response("Not found.", { status: 404 });
  return new Response(null, { status: 302, headers: { location: videoUrl, "cache-control": "private, no-store" } });
}
