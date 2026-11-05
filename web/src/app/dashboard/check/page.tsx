import { Notice, PageHeader } from "@/components/account/bits";
import { ReelUpload } from "@/components/account/reel-upload";
import { requireMember } from "@/lib/account";
import { requireWritable } from "@/lib/sample";

export const metadata = { title: "Check a Reel" };

export default async function CheckReelPage() {
  const viewer = await requireMember("/dashboard/check");
  const readOnly = await requireWritable(viewer);
  return (
    <div className="grid gap-4">
      <PageHeader title="Check a Reel" description="Mr Tickle reads every frame, finds the ad label and times it against ASCI's rule." />
      {readOnly ? <Notice>{readOnly}</Notice> : <ReelUpload folder={viewer.brand?.name ?? null} analysis={process.env.WORKER_URL ? "worker" : "sample"} />}
    </div>
  );
}
