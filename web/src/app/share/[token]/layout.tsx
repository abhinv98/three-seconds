import type { Metadata } from "next";

// A share link is the only key to its page: no search engine gets it, and the sites it links to never see the token.
export const metadata: Metadata = {
  title: "Shared Reel",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
