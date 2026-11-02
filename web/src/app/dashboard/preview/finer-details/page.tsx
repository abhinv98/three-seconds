import { readFile } from "node:fs/promises";
import path from "node:path";
import { Poppins } from "next/font/google";
import { notFound } from "next/navigation";
import { FinerDetailsScreen } from "@/components/details/finer-details";
import { requireMember } from "@/lib/account";
import type { FinerDetails } from "@/lib/details";

// The brand's typeface, for the fixes drawn over its Reel (Buzzy AI sets its site in Poppins).
const brandType = Poppins({ subsets: ["latin"], weight: "600", variable: "--font-brand" });

export const metadata = { title: "Finer details" };

/**
 * Development only: the "Finer details" screen on a local Reel, with its changes placed by hand, to agree the design
 * before the pipeline exists. The Reel and its sample read live in gitignored folders (public/preview, preview-data).
 */
export default async function FinerDetailsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  await requireMember("/dashboard/preview/finer-details");
  const file = path.join(process.cwd(), "preview-data", "buzzy-details.json");
  const raw = await readFile(file, "utf8").catch(() => null);
  if (!raw) notFound();
  const details = JSON.parse(raw) as FinerDetails;
  return (
    <div className={brandType.variable}>
      <FinerDetailsScreen details={details} brandFont="var(--font-brand), Poppins, sans-serif" preview />
    </div>
  );
}
