import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth, schemaReady } from "@/lib/auth";
import { isSampleViewer, SAMPLE_READ_ONLY } from "@/lib/sample";

const handler = toNextJsHandler(auth);

// Everyone shares the sample account, so its session only signs in and out. Nothing else: not its password, email or
// name, not signing the others out, and not list-sessions, which shows every visitor's IP address.
const OPEN_TO_SAMPLE = new Set(["/sign-in/email", "/sign-up/email", "/sign-out", "/get-session"]);

async function refusedForSample(request: Request) {
  if (OPEN_TO_SAMPLE.has(new URL(request.url).pathname.replace(/^\/api\/auth/, ""))) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  return session && isSampleViewer(session) ? NextResponse.json({ code: "SAMPLE_READ_ONLY", message: SAMPLE_READ_ONLY }, { status: 403 }) : null;
}

// The tables exist before the first sign-up reaches Better Auth.
export async function GET(request: Request) {
  await schemaReady();
  return (await refusedForSample(request)) ?? handler.GET(request);
}

export async function POST(request: Request) {
  await schemaReady();
  return (await refusedForSample(request)) ?? handler.POST(request);
}
