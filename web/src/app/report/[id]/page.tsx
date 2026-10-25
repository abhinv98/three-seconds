import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ReportView } from "@/components/report-view";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { SAMPLE_REPORT } from "@/lib/mock";
import type { Report } from "@/lib/report";

export const metadata: Metadata = { title: "Report" };

/** The fixture report with its matching sample Reel (web/public/sample), for /report/sample. */
const sampleReport: Report = {
  ...SAMPLE_REPORT,
  job_id: "sample",
  video: { ...SAMPLE_REPORT.video, blob_url: "/sample/glow-serum-reel.mp4", width: 720, height: 1280 },
};

export default async function ReportPage({ params }: PageProps<"/report/[id]">) {
  const id = decodeURIComponent((await params).id);
  return (
    <>
      <SiteHeader>
        <Button asChild variant="secondary" size="sm">
          <Link href="/check">
            <Icon name="upload" size={16} />
            New check
          </Link>
        </Button>
      </SiteHeader>
      <ReportView id={id} report={id === "sample" ? sampleReport : undefined} />
    </>
  );
}
