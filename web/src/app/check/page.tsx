import type { Metadata } from "next";
import { SamplePreview } from "@/components/sample-preview";
import { SiteHeader } from "@/components/site-header";
import { UploadFlow, type StorageMode } from "@/components/upload-flow";

export const metadata: Metadata = { title: "Check an ad" };

export default function CheckPage() {
  const storage: StorageMode = process.env.BLOB_READ_WRITE_TOKEN
    ? "blob"
    : process.env.NODE_ENV === "development"
      ? "local"
      : "missing";
  const analysis = process.env.WORKER_URL ? "worker" : "mock";

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1120px] px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          <section aria-labelledby="page-heading">
            <h1 id="page-heading" className="ts-display max-w-[14ch] text-balance">
              Check a creator ad before it goes live.
            </h1>
            <p className="ts-body mt-4 max-w-[52ch] text-pretty text-muted-foreground">
              Upload a Reel or Short. We measure the disclosure label, the brand and what&apos;s said, then check them
              against the ASCI influencer guidelines.
            </p>
            <div className="mt-8">
              <UploadFlow storage={storage} analysis={analysis} />
            </div>
            {storage === "local" && (
              <p className="ts-caption mt-3 text-muted-foreground">
                Local preview: no Blob token, so videos stay in this browser tab.
              </p>
            )}
          </section>
          <aside aria-label="What a report looks like">
            <SamplePreview />
          </aside>
        </div>
      </main>
    </>
  );
}
