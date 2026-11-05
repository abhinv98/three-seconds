"use client";

import { Building2, Film, Inbox, LayoutDashboard, LogOut, Search, Tag, Upload, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { openCommandPalette } from "@/components/command-palette";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV = {
  creator: [
    { href: "/dashboard", label: "Overview", short: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/reels", label: "My Reels", short: "Reels", icon: Film },
    { href: "/dashboard/connections", label: "Brands", short: "Brands", icon: Building2 },
    { href: "/dashboard/tools", label: "Label maker", short: "Label", icon: Tag },
  ],
  brand: [
    { href: "/dashboard", label: "Overview", short: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/reels", label: "Reels", short: "Reels", icon: Inbox },
    { href: "/dashboard/connections", label: "Creators", short: "Creators", icon: Users },
    { href: "/dashboard/tools", label: "Label maker", short: "Label", icon: Tag },
  ],
};

const noSubscribe = () => () => {};
/** The shortcut as this keyboard writes it. The server can't know, so it renders the Mac form. */
const useShortcut = () =>
  useSyncExternalStore(
    noSubscribe,
    () => (/mac|iphone|ipad/i.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );

// The Studio takes the whole window, and shows the sample's label itself.
const FULL_WINDOW = /^\/dashboard\/reels\/[^/]+\/details/;

interface ShellProps {
  role: "brand" | "creator";
  name: string;
  email: string;
  folder: string | null;
  site: string | null;
  banner: string | null;
  children: React.ReactNode;
}

export function DashboardShell({ role, name, email, folder, site, banner, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const shortcut = useShortcut();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));
  const checking = isActive("/dashboard/check");

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  if (FULL_WINDOW.test(pathname)) {
    return <main id="main">{children}</main>;
  }

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[212px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-30 border-b border-border bg-card lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-13 items-center justify-between gap-2 px-4 lg:h-14">
          <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1">
            <Logo size={18} />
          </Link>
          <div className="flex items-center gap-1 lg:hidden">
            <button type="button" onClick={openCommandPalette} aria-label="Search pages and Reels" className="grid size-9 place-items-center rounded-[6px] text-muted-foreground">
              <Search size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={signOut} aria-label="Sign out" className="grid size-9 place-items-center rounded-[6px] text-muted-foreground">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="hidden px-4 pt-1 pb-3 lg:block">
          <p className="truncate text-[15px] leading-tight font-bold tracking-[-0.01em]">{folder ?? name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{folder ? (site ?? "Brand folder") : "Creator"}</p>
        </div>

        <div className="hidden gap-2 px-3 pb-3 lg:grid">
          <Link href="/dashboard/check" aria-current={checking ? "page" : undefined} className={cn(buttonVariants({ variant: "primary", size: "compact" }), "w-full")}>
            <Upload size={15} aria-hidden="true" />
            Check a Reel
          </Link>
          <button
            type="button"
            onClick={openCommandPalette}
            className="rail-search flex h-8 items-center gap-2 rounded-[6px] border border-border px-2.5 text-[13px] text-muted-foreground"
          >
            <Search size={14} aria-hidden="true" />
            Search
            <kbd className="ml-auto font-mono text-[11px]">{shortcut}</kbd>
          </button>
        </div>

        <nav aria-label="Dashboard" className="hidden gap-0.5 px-3 lg:grid">
          {NAV[role].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "rail-link flex h-8.5 items-center gap-2.5 rounded-[6px] px-2.5 text-[14px] font-semibold text-muted-foreground",
                isActive(href) && "bg-foreground text-background",
              )}
            >
              <Icon size={15} aria-hidden="true" className={isActive(href) ? "text-brand" : undefined} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden items-center gap-2 border-t border-border px-4 py-3 lg:flex">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{email}</p>
          </div>
          <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="rail-link grid size-8 shrink-0 place-items-center rounded-[6px] text-muted-foreground">
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        {banner ? <p className="bg-foreground px-4 py-2 text-[13px] font-semibold text-background sm:px-6 lg:px-8">{banner}</p> : null}
        <main id="main" className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>

      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <TabLink href="/dashboard" label="Overview" icon={LayoutDashboard} active={isActive("/dashboard")} />
        <TabLink href="/dashboard/reels" label="Reels" icon={NAV[role][1].icon} active={isActive("/dashboard/reels")} />
        <TabLink href="/dashboard/check" label="Check" icon={Upload} active={checking} primary />
        <TabLink href="/dashboard/connections" label={NAV[role][2].short} icon={NAV[role][2].icon} active={isActive("/dashboard/connections")} />
        <TabLink href="/dashboard/tools" label="Label" icon={Tag} active={isActive("/dashboard/tools")} />
      </nav>
    </div>
  );
}

function TabLink({ href, label, icon: Icon, active, primary }: { href: string; label: string; icon: typeof Tag; active: boolean; primary?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}
    >
      <span className={cn("grid h-6 w-10 place-items-center rounded-[6px]", primary && "btn-flat btn-flat-primary", active && !primary && "bg-foreground text-background")}>
        <Icon size={15} aria-hidden="true" className={active && !primary ? "text-brand" : undefined} />
      </span>
      {label}
    </Link>
  );
}
