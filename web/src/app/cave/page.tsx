import type { Metadata } from "next";
import { CaveGame } from "@/components/cave3d/cave-game";
import { pixel } from "@/components/cave3d/font";

export const metadata: Metadata = {
  title: "Behind the website",
  description: "Behind the website there is a cave, a door, and Mr Tickle’s dimension.",
  robots: { index: false },
};

export default function CavePage() {
  return (
    <div className={pixel.variable}>
      <CaveGame />
    </div>
  );
}
