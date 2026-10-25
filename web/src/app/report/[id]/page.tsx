import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ReportView } from "@/components/report-view";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params }: PageProps<"/report/[id]">) {
  const { id } = await params;
  return (
    <>
      <SiteHeader>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <Icon name="upload" size={16} />
            New check
          </Link>
        </Button>
      </SiteHeader>
      <ReportView id={decodeURIComponent(id)} />
    </>
  );
}
