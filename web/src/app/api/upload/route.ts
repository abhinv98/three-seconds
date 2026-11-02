import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { ACCEPTED_TYPES, MAX_BYTES } from "@/lib/limits";

// Issues short-lived client tokens so the browser uploads straight to Vercel Blob.
// The video body never passes through this function (4.5 MB request limit).
export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is not configured (BLOB_READ_WRITE_TOKEN is missing)." }, { status: 503 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      // The public /check page uploads without an account, so uploads are limited by type, size and an unguessable
      // pathname rather than by who sends them.
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("videos/")) throw new Error("Unexpected upload path.");
        return {
          allowedContentTypes: [...ACCEPTED_TYPES],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      // Vercel calls this after the upload; it can't reach localhost, so it only fires when deployed.
      onUploadCompleted: async ({ blob }) => {
        console.info("Blob upload completed", blob.pathname);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
