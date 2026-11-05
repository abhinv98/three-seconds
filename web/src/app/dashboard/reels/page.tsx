import { Upload } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/account/bits";
import { ReelsLibrary } from "@/components/account/reels-library";
import { Button } from "@/components/ui/button";
import { reelsFor, requireMember } from "@/lib/account";
import { parseLibraryQuery, type LibraryReel } from "@/lib/reel-search";
import { reviewsFor } from "@/lib/review";

export const metadata = { title: "Reels" };

export default async function ReelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireMember("/dashboard/reels");
  const query = await searchParams;
  const rows = await reelsFor(viewer);
  const reviews = await reviewsFor(rows.map((r) => r.id));
  const brand = viewer.brand !== null;
  const reels: LibraryReel[] = rows.map(({ id, filename, owner_name, owner_id, verdict, status, created_at, sent_at }) => ({
    id,
    filename,
    owner_name,
    owner_id,
    verdict,
    status,
    created_at,
    sent_at,
    review: reviews.get(id)?.status ?? null,
  }));
  return (
    <div className="grid gap-5">
      <PageHeader
        title={brand ? "Reels" : "My Reels"}
        description={brand ? "Reels your creators sent you, and the ones your team checked." : "Every Reel you've checked. Open one to see its report or send it to a brand."}
      />
      {reels.length ? (
        <ReelsLibrary reels={reels} brandView={brand} initial={parseLibraryQuery(query)} initialView={query.view === "list" ? "list" : "grid"} />
      ) : (
        <div className="rounded-[10px] border border-border bg-card">
          <EmptyState
            title="Nothing here yet"
            body={brand ? "When a creator sends you a Reel, it shows up here with its report." : "Check a Reel and it's kept here, ready to send."}
            action={
              <Button asChild size="compact">
                <Link href="/dashboard/check">
                  <Upload size={16} aria-hidden="true" />
                  Check a Reel
                </Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
