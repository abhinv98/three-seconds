import { NextResponse } from "next/server";
import { getViewer } from "@/lib/account";
import { kitProgress } from "@/lib/brand-kit";

// What the viewer's brand kit read is doing, polled by the brand folder while it waits.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.brand) return NextResponse.json({ error: "Sign in to a brand folder first." }, { status: 401 });
  return NextResponse.json((await kitProgress(viewer.brand.id)) ?? { status: "none" }, { headers: { "cache-control": "no-store" } });
}
