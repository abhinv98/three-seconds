import { getViewer, reelFor, type Member } from "@/lib/account";
import { reelIdForShare } from "@/lib/review";
import { reelScenes } from "@/lib/scene-job";

// The Studio's scene data, for someone who may see that Reel (lib/account.ts canSee), or with ?share= and that Reel's own
// share token, which decides alone. It's about 1 MB, so the page fetches it here instead of taking it as a prop. 200 is
// the SceneData, kept a week because a finished scene never changes, except on a share link: a browser cache would
// outlive a revoke. Anything else is { status, started_at, error }: 202 while running, 404 if none, 409 if it failed.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: reelId } = await params;
  const share = new URL(request.url).searchParams.get("share");
  if (share !== null) {
    if ((await reelIdForShare(share)) !== reelId) return new Response("Not found.", { status: 404 });
  } else {
    const viewer = await getViewer();
    if (!viewer?.profile) return new Response("Sign in first.", { status: 401 });
    if (!(await reelFor(viewer as Member, reelId))) return new Response("Not found.", { status: 404 });
  }
  const job = await reelScenes.get(reelId);
  if (job?.status === "done" && job.data) {
    return Response.json(job.data, { headers: { "cache-control": share !== null ? "private, no-store" : "private, max-age=604800, immutable" } });
  }
  return Response.json(
    { status: job?.status ?? "none", started_at: job?.started_at ?? null, error: job?.error ?? null },
    { status: job?.status === "reading" ? 202 : job ? 409 : 404, headers: { "cache-control": "private, no-store" } },
  );
}
