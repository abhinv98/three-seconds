import { Notice, PageHeader } from "@/components/account/bits";
import { ReelUpload } from "@/components/account/reel-upload";
import { requireMember } from "@/lib/account";
import { requireWritable } from "@/lib/sample";

export const metadata = { title: "Check a Reel" };

export default async function CheckReelPage() {
  const viewer = await requireMember("/dashboard/check");
  const readOnly = await requireWritable(viewer);
  return (
    <div className="grid max-w-[760px] gap-6">
      <PageHeader
        title="Check a Reel"
        description="Up to 90 seconds, MP4 or MOV. Mr Tickle reads every frame, finds the ad label and times it against ASCI's rule."
      />
      {readOnly ? <Notice>{readOnly}</Notice> : <ReelUpload folder={viewer.brand?.name ?? null} />}
    </div>
  );
}
