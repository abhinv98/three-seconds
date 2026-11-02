import { Upload } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader, Panel, ReelTable } from "@/components/account/bits";
import { Button } from "@/components/ui/button";
import { reelsFor, requireMember } from "@/lib/account";

export const metadata = { title: "Reels" };

export default async function ReelsPage() {
  const viewer = await requireMember("/dashboard/reels");
  const reels = await reelsFor(viewer);
  const brand = viewer.brand !== null;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={brand ? "Reels" : "My Reels"}
        description={brand ? "Reels your creators sent you, and the ones your team checked." : "Every Reel you've checked. Open one to see its report or send it to a brand."}
        action={
          <Button asChild size="compact">
            <Link href="/dashboard/check">
              <Upload size={16} aria-hidden="true" />
              Check a Reel
            </Link>
          </Button>
        }
      />
      <Panel title={`${reels.length} ${reels.length === 1 ? "Reel" : "Reels"}`}>
        {reels.length ? (
          <ReelTable reels={reels} brandView={brand} />
        ) : (
          <EmptyState
            title="Nothing here yet"
            body={brand ? "When a creator sends you a Reel, it shows up here with its report." : "Check a Reel and it's kept here, ready to send."}
          />
        )}
      </Panel>
    </div>
  );
}
