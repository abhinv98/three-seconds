import Link from "next/link";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/** Sign-in, the questionnaire and invite pages: the paper ground, the wordmark, one column. */
export function AuthFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center px-4 sm:px-6">
        <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1.5">
          <Logo size={22} />
        </Link>
      </header>
      <main id="main" className={cn("mx-auto px-4 pt-6 pb-16 sm:pt-12", wide ? "max-w-[680px]" : "max-w-[420px]")}>
        {children}
      </main>
    </div>
  );
}

/** A short page for an invite that can't be used, or a link meant for the other kind of account. */
export function NoticeCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 rounded-[10px] border border-border bg-card p-6">
      <h1 className="text-[22px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
      <div className="grid gap-4 text-[15px] text-muted-foreground">{children}</div>
    </div>
  );
}
