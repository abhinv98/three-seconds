import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ShareView, type SharedDetails } from "@/app/share/[token]/share-view";
import { Logo } from "@/components/logo";
import { brandKits, fontCss } from "@/lib/brand-kit";
import { finerDetails } from "@/lib/finer";
import type { Report } from "@/lib/report";
import { captionFor, doneMoments, notesFor, reelIdForShare, reviewFor, sharedReel } from "@/lib/review";
import { SAMPLE_BANNER } from "@/lib/sample";

// Public and read-only: anyone with the token sees this one Reel. Everything a client component gets is listed here by
// hand, so no email, owner name, user id, Blob URL or cost can reach the page. Never cached: a revoked token is dead at once.

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const reelId = await reelIdForShare(token);
  if (!reelId) notFound();
  const reel = await sharedReel(reelId);
  if (!reel?.report) notFound();

  const full = JSON.parse(reel.report) as Report;
  const report: Report = {
    ...full,
    job_id: "",
    models_used: [],
    transcript: [],
    video: { ...full.video, blob_url: `/api/reels/${reelId}/video?share=${encodeURIComponent(token)}` },
  };
  const [job, kit, review, notes, done, caption] = await Promise.all([
    finerDetails.get(reelId),
    reel.brand_id ? brandKits.get(reel.brand_id) : null,
    reviewFor(reelId),
    notesFor(reelId),
    doneMoments(reelId),
    captionFor(reelId),
  ]);

  const read = job?.status === "done" ? job.data : null;
  const details: SharedDetails | null = read && {
    finding: read.finding,
    moments: read.moments,
    poster: read.reel.poster,
    accent: read.brand.colors[0]?.hex ?? "#ea4e12",
    ink: read.brand.colors.at(-1)?.hex ?? "#121212",
  };
  const fonts = read?.brand.fonts ?? kit?.data?.fonts ?? [];
  const webFonts = read?.brand.webFonts ?? kit?.data?.web_fonts ?? [];

  return (
    <div className="min-h-dvh bg-background">
      {webFonts.map((font) => (
        <link key={font} rel="stylesheet" href={fontCss(font)} precedence="default" />
      ))}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1">
            <Logo size={20} />
          </Link>
          <span className="text-[13px] font-semibold text-muted-foreground">Shared with you, read-only</span>
        </div>
      </header>
      {reel.is_sample ? <p className="bg-foreground px-4 py-2 text-center text-[13px] font-semibold text-background">{SAMPLE_BANNER}</p> : null}
      <ShareView
        reelId={reelId}
        report={report}
        details={details}
        brand={{ name: reel.brand_name, logo: read?.brand.logo ?? kit?.data?.logo ?? "" }}
        brandFont={[...fonts.map((font) => `"${font.replace(/["\\]/g, "")}"`), "sans-serif"].join(", ")}
        review={review && { status: review.status, note: review.note, at: review.at }}
        notes={notes.map(({ id, t, text }) => ({ id, t, text }))}
        done={done}
        caption={caption && { caption: caption.caption, usesPlatformTag: caption.usesPlatformTag }}
      />
    </div>
  );
}
