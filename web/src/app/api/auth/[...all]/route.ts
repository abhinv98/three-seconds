import { toNextJsHandler } from "better-auth/next-js";
import { auth, schemaReady } from "@/lib/auth";

const handler = toNextJsHandler(auth);

// The tables exist before the first sign-up reaches Better Auth.
export async function GET(request: Request) {
  await schemaReady();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await schemaReady();
  return handler.POST(request);
}
