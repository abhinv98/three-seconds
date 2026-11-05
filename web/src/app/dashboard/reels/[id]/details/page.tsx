import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { Studio } from "@/components/studio/studio";
import { reelFor, requireMember } from "@/lib/account";
import { brandKits, fontCss } from "@/lib/brand-kit";
import { finerDetails } from "@/lib/finer";
import { captionFor, doneMoments, notesFor, reviewFor, shareTokenFor } from "@/lib/review";
import { isSampleViewer, requireWritable, requireWritableBrand, SAMPLE_BANNER } from "@/lib/sample";

export const metadata = { title: "Finer details" };
// "Read again" runs the pass after its response, inside this page's function.
export const maxDuration = 300;

export default async function FinerDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { read } = await searchParams;
  const viewer = await requireMember(`/dashboard/reels/${id}/details`);
  const reel = await reelFor(viewer, id);
  if (!reel) notFound();
  const job = await finerDetails.get(reel.id);
  if (!job || !reel.report) redirect(`/dashboard/reels/${reel.id}`);

  const [review, notes, done, shareToken, caption, kit, readOnlyViewer, readOnlyFolder] = await Promise.all([
    reviewFor(reel.id),
    notesFor(reel.id),
    doneMoments(reel.id),
    shareTokenFor(reel.id),
    captionFor(reel.id),
    reel.brand_id ? brandKits.get(reel.brand_id) : null,
    requireWritable(viewer),
    // A creator who sent a Reel into the sample's folder isn't the sample, but the folder is still sealed.
    reel.brand_id ? requireWritableBrand(reel.brand_id) : null,
  ]);

  // A read in progress keeps the last one's data on its row, so the Studio has something to show while it runs.
  const stored = job.data;
  const details = stored && { reel: stored.reel, finding: stored.finding, brand: stored.brand, audience: stored.audience, mentions: stored.mentions, moments: stored.moments };
  const fonts = details?.brand.webFonts ?? [];
  const brandFont = [...(details?.brand.fonts ?? []).map((f) => `"${f.replace(/["\\]/g, "")}"`), "sans-serif"].join(", ");

  return (
    <>
      {fonts.map((f) => (
        <link key={f} rel="stylesheet" href={fontCss(f)} precedence="default" />
      ))}
      {job.status === "reading" ? <AutoRefresh /> : null}
      <Studio
        reelId={reel.id}
        details={details}
        job={{ status: job.status, error: job.error, started_at: job.started_at }}
        report={reel.report}
        brandFont={brandFont}
        review={review}
        notes={notes}
        done={done}
        readOnly={Boolean(readOnlyViewer ?? readOnlyFolder)}
        shareToken={shareToken ?? undefined}
        back={{ href: `/dashboard/reels/${reel.id}`, label: reel.filename }}
        products={kit?.data?.products}
        canReview={viewer.brand !== null && reel.brand_id === viewer.brand.id}
        caption={caption}
        banner={isSampleViewer(viewer) ? SAMPLE_BANNER : null}
        sceneRead={typeof read === "string" ? read : undefined}
      />
    </>
  );
}
