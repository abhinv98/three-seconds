"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";

export const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#rule", label: "The rule" },
  { href: "#labels", label: "Labels" },
  { href: "#faq", label: "FAQ" },
];

/**
 * A plain bar: the wordmark, four links, the theme switch and the one action. On a phone the links fold into Menu.
 * It slides away while the page scrolls down (so nothing on the page is cut off under it) and returns on the way up.
 */
export function LandingNav() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      const busy = header.contains(document.activeElement) || header.querySelector("details[open]");
      header.toggleAttribute("data-away", y > last && y > 160 && !busy);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header ref={ref} className="lp-nav">
      <nav aria-label="Main" className="lp-nav__inner">
        <Link href="/" aria-label="Three Seconds, home" className="lp-nav__home">
          <Logo size={20} className="lp-nav__lockup" />
          <Logo size={22} variant="mark" className="lp-nav__mark" />
        </Link>
        <ul className="lp-nav__links">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="lp-link">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <details className="lp-nav__menu">
          <summary className="lp-link">Menu</summary>
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="lp-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
        <div className="lp-nav__end">
          <ThemeMenu />
          <Link href="/check" className="lp-button lp-button--small">
            Check an ad
          </Link>
        </div>
      </nav>
    </header>
  );
}
