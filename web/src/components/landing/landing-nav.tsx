import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#call", label: "The call" },
  { href: "#checks", label: "Checks" },
  { href: "#faq", label: "FAQ" },
];

/** A night-blue pill that floats over the flight and stays as a frame over the paper sections below. */
export function LandingNav() {
  return (
    <header data-theme="dark" className="pointer-events-none fixed inset-x-0 top-3 z-30 px-3 sm:top-4 sm:px-6">
      <nav
        aria-label="Main"
        className="pointer-events-auto mx-auto flex h-14 max-w-[920px] items-center justify-between gap-3 rounded-full bg-[#14163a]/75 pr-2 pl-5 text-[#f3f1ea] shadow-[0_0_0_1px_rgb(255_255_255/0.09),0_18px_40px_-24px_rgb(10_6_30/0.8)] backdrop-blur-md"
      >
        <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-full px-1 py-1.5">
          <Logo size={20} />
        </Link>
        <ul className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="ts-body-sm rounded-full px-3.5 py-2 text-white/75 transition-colors duration-[120ms] hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          <ThemeMenu />
          <Button asChild variant="brand" size="sm" className="rounded-full px-4">
            <Link href="/check">Check an ad</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
