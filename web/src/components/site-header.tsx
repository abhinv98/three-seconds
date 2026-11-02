import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1.5">
          <Logo size={22} />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="rounded-sm px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          {children}
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
