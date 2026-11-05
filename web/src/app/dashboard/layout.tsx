import type { Metadata } from "next";
import { DashboardShell } from "@/components/account/dashboard-shell";
import { CommandPalette } from "@/components/command-palette";
import { Toaster } from "@/components/ui/toast";
import { requireMember } from "@/lib/account";
import { isSampleViewer, SAMPLE_BANNER } from "@/lib/sample";

export const metadata: Metadata = { title: { template: "%s · Dashboard", default: "Dashboard" } };

// Every page below also calls requireMember itself: a layout alone isn't a safe place to guard a route.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireMember("/dashboard");
  return (
    <>
      <DashboardShell
        role={viewer.profile.role}
        name={viewer.profile.display_name}
        email={viewer.user.email}
        folder={viewer.brand?.name ?? null}
        site={viewer.brand?.website.replace(/^https:\/\/(www\.)?/, "") ?? null}
        banner={isSampleViewer(viewer) ? SAMPLE_BANNER : null}
      >
        {children}
      </DashboardShell>
      <CommandPalette role={viewer.profile.role} />
      <Toaster />
    </>
  );
}
