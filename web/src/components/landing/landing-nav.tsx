import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#checks", label: "Checks" },
  { href: "#whatsapp", label: "WhatsApp" },
  { href: "#faq", label: "FAQ" },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1.5">
          <Logo size={22} />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="ts-body-sm rounded-[8px] px-3 py-2 text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <ThemeMenu />
          <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
            <Link href="/report/sample">Sample report</Link>
          </Button>
          <Button asChild variant="brand" size="sm">
            <Link href="/check">Check an ad</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
