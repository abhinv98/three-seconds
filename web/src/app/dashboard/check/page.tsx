import { PageHeader } from "@/components/account/bits";
import { ReelUpload } from "@/components/account/reel-upload";
import { requireMember } from "@/lib/account";

export const metadata = { title: "Check a Reel" };

export default async function CheckReelPage() {
  const viewer = await requireMember("/dashboard/check");
  return (
    <div className="grid max-w-[760px] gap-6">
      <PageHeader
        title="Check a Reel"
        description="Up to 90 seconds, MP4 or MOV. Mr Tickle reads every frame, finds the ad label and times it against ASCI's rule."
      />
      <ReelUpload folder={viewer.brand?.name ?? null} />
    </div>
  );
}
