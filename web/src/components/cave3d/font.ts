import { Pixelify_Sans } from "next/font/google";

/** The game's pixel type, for its HUD on /cave and behind the zipper on the landing page. */
export const pixel = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-pixel", display: "swap", preload: false });
