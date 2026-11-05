import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { Toaster } from "@/components/ui/toast";
import type { FinerDetails } from "@/lib/details";
import type { Report } from "@/lib/report";

const FIXTURE = "/private/tmp/claude-501/-Users-sheeshtem-three-seconds/88c473e3-c7aa-4ae6-9647-8dcc51d01e92/scratchpad/studio-fixture.json";

export const metadata = { title: "Studio harness" };

const fixtureStart = () => new Date(Date.now() - 41_000).toISOString();

// Development only. The Studio on the test Reel, with real SceneData and a hand-written read, and every state it has:
// ?scene=tracking|none|failed  ?read=reading|error  ?moments=none  ?readOnly=1
export default async function StudioDev({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const { details, report, products, caption } = JSON.parse(await readFile(FIXTURE, "utf8")) as { details: FinerDetails; report: Report; products: string[]; caption: { caption: string; usesPlatformTag: boolean; by_name: string; at: string } };
  const read = query.read;
  const shown = read === "reading" || read === "error" ? null : query.moments === "none" ? { ...details, moments: [] } : details;
  return (
    <>
      <Studio
        reelId="studio-dev"
        details={shown}
        job={{
          status: read === "reading" ? "reading" : read === "error" ? "error" : "done",
          error: read === "error" ? "The model didn't answer." : null,
          started_at: fixtureStart(),
        }}
        report={report}
        brandFont="Inter, sans-serif"
        review={null}
        notes={[{ id: "n1", reel_id: "studio-dev", t: 27.2, text: "Is this shot needed? It slows the middle.", by_name: "Brand team", at: "2026-11-04T10:00:00.000Z" }]}
        done={[]}
        readOnly={query.readOnly === "1"}
        back={{ href: "/dashboard/reels", label: "Reels" }}
        urls={{ scene: `/studio-dev/scene${query.scene ? `?state=${query.scene}` : ""}`, video: "/studio-dev/video" }}
        products={products}
        caption={caption}
        banner={query.readOnly === "1" ? "Sample brand folder. Not run by or affiliated with Meta." : null}
      />
      <Toaster />
    </>
  );
}
