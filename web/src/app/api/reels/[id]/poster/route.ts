import { canSee, getViewer, type Member } from "@/lib/account";
import { get } from "@/lib/db";
import { posterBytes } from "@/lib/poster";

// A Reel's filmstrip, for someone who may see that Reel (lib/account.ts canSee). It never changes, so the browser keeps it.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.profile) return new Response("Sign in first.", { status: 401 });
  const row = await get<{ poster: string | null; owner_id: string; brand_id: string | null; sent_at: string | null }>(
    "SELECT poster, owner_id, brand_id, sent_at FROM reel WHERE id = ?",
    (await params).id,
  );
  if (!row?.poster || !canSee(viewer as Member, row)) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(posterBytes(row.poster)), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" },
  });
}
