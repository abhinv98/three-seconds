import { readFile } from "node:fs/promises";

const SCENE = "/private/tmp/claude-501/-Users-sheeshtem-three-seconds/88c473e3-c7aa-4ae6-9647-8dcc51d01e92/scratchpad/sam/scene.json";

// Development only. ?state=tracking|none|failed answers as the real route would while a job runs or when there's none.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found.", { status: 404 });
  const state = new URL(request.url).searchParams.get("state");
  if (state === "tracking") return Response.json({ status: "reading", started_at: new Date(Date.now() - 34_000).toISOString(), error: null }, { status: 202 });
  if (state === "none") return Response.json({ status: "none", started_at: null, error: null }, { status: 404 });
  if (state === "failed") return Response.json({ status: "error", started_at: null, error: "SAM 3.1 didn't answer." }, { status: 409 });
  return new Response(await readFile(SCENE), { headers: { "content-type": "application/json" } });
}
