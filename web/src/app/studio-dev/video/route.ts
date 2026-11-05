import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

const REEL = "/Users/sheeshtem/three-seconds/testreels/meta-sample/DY7leIUxyWu.mp4";

// Development only: the test Reel with Range support, so seeking works.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found.", { status: 404 });
  const { size } = await stat(REEL);
  const range = /bytes=(\d+)-(\d*)/.exec(request.headers.get("range") ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const body = Readable.toWeb(createReadStream(REEL, { start, end })) as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
