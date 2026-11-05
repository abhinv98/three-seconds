import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Mukta } from "next/font/google";
import { themeBootScript } from "@/components/theme-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Mukta for everything read (Latin and Devanagari), JetBrains Mono for every time and measurement.
const mukta = Mukta({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "devanagari"],
  variable: "--font-mukta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Three Seconds", template: "%s · Three Seconds" },
  description: "Check a creator ad against the ASCI influencer guidelines before it goes live.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mukta.variable} ${jetbrainsMono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
