"use client";

import { Building2, Film, Inbox, LayoutDashboard, LogOut, Upload, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV = {
  creator: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/check", label: "Check a Reel", icon: Upload },
    { href: "/dashboard/reels", label: "My Reels", icon: Film },
    { href: "/dashboard/connections", label: "Brands", icon: Building2 },
  ],
  brand: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/check", label: "Check a Reel", icon: Upload },
    { href: "/dashboard/reels", label: "Reels", icon: Inbox },
    { href: "/dashboard/connections", label: "Creators", icon: Users },
  ],
};

interface ShellProps {
  role: "brand" | "creator";
  name: string;
  email: string;
  folder: string | null;
  children: React.ReactNode;
}

export function DashboardShell({ role, name, email, folder, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-5">
          <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1">
            <Logo size={20} />
          </Link>
          <Button variant="ghost" size="compact-sm" onClick={signOut} className="lg:hidden">
            Sign out
          </Button>
        </div>
        <div className="hidden px-5 pb-4 lg:block">
          <p className="text-[13px] text-muted-foreground">{role === "brand" ? "Brand folder" : "Creator"}</p>
          <p className="truncate text-[15px] font-bold tracking-[-0.01em]">{folder ?? name}</p>
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:grid lg:gap-0.5">
          {NAV[role].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2.5 rounded-[6px] px-3 text-sm font-semibold text-muted-foreground transition-colors duration-[120ms] hover:bg-muted hover:text-foreground",
                isActive(href) && "bg-muted text-foreground",
              )}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-border p-4 lg:block">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{email}</p>
          <Button variant="outline" size="compact-sm" onClick={signOut} className="mt-3 w-full">
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        {children}
      </main>
    </div>
  );
}
