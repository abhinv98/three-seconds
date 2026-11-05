import { getViewer, reelFor, type Member } from "@/lib/account";
import { reelScenes } from "@/lib/scene-job";

// The Studio's scene data, only for someone who may see that Reel (lib/account.ts canSee). It's about 1 MB, so the
// page fetches it here instead of taking it as a prop. 200 is the SceneData, kept a week because a finished scene never
// changes; anything else is { status, started_at, error }: 202 while running, 404 if none, 409 if it failed.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.profile) return new Response("Sign in first.", { status: 401 });
  const reel = await reelFor(viewer as Member, (await params).id);
  if (!reel) return new Response("Not found.", { status: 404 });
  const job = await reelScenes.get(reel.id);
  if (job?.status === "done" && job.data) {
    return Response.json(job.data, { headers: { "cache-control": "private, max-age=604800, immutable" } });
  }
  return Response.json(
    { status: job?.status ?? "none", started_at: job?.started_at ?? null, error: job?.error ?? null },
    { status: job?.status === "reading" ? 202 : job ? 409 : 404, headers: { "cache-control": "private, no-store" } },
  );
}
