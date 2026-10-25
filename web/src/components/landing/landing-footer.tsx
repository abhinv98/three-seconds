import Link from "next/link";
import { Logo } from "@/components/logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[44ch]">
          <Logo size={22} />
          <p className="ts-body-sm mt-4 text-pretty text-muted-foreground">
            Checked against the ASCI influencer guidelines. Three Seconds shows its evidence; it does not give legal
            advice.
          </p>
          <p className="ts-caption mt-3 text-muted-foreground">Built for the Meta Global AI Developer Hackathon 2026.</p>
        </div>
        <ul className="ts-body-sm grid grid-cols-2 gap-x-10 gap-y-2">
          <li>
            <Link href="/check" className="rounded-xs text-foreground hover:text-brand-text">
              Check an ad
            </Link>
          </li>
          <li>
            <Link href="/report/sample" className="rounded-xs text-foreground hover:text-brand-text">
              Sample report
            </Link>
          </li>
          <li>
            <a href="#how" className="rounded-xs text-foreground hover:text-brand-text">
              How it works
            </a>
          </li>
          <li>
            <a href="#faq" className="rounded-xs text-foreground hover:text-brand-text">
              FAQ
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
