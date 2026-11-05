import { BrandFolder } from "@/components/brand/brand-folder";
import { kitProgress, type BrandKitData } from "@/lib/brand-kit";
import type { Job } from "@/lib/jobs";
import { paintBand } from "@/lib/paint";

/** The brand folder's kit on the overview: read automatically when the folder is made, again on request. */
export async function BrandKitPanel({ brandId, job, site, readOnly }: { brandId: string; job: Job<BrandKitData> | null; site: string; readOnly: boolean }) {
  const kit = job?.data ?? null;
  const progress = job?.status === "reading" ? await kitProgress(brandId) : null;
  return (
    <BrandFolder
      brandId={brandId}
      site={site}
      status={job?.status ?? "none"}
      kit={kit}
      band={kit ? paintBand(kit.colors.map((c) => c.hex)) : null}
      error={job?.error ?? null}
      startedAt={job?.started_at ?? null}
      steps={progress?.steps ?? []}
      readOnly={readOnly}
    />
  );
}
