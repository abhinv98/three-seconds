/** What the command palette and the library search over. */
export interface ReelHit {
  id: string;
  filename: string;
  owner_name: string;
  verdict: "PASS" | "FAIL" | "REVIEW" | null;
}

/** Every word has to appear in the file name, the creator or the verdict; a file name that starts with the query goes first. */
export function rankReels<T extends ReelHit>(reels: T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return reels;
  const matching = reels.filter((reel) => {
    const text = `${reel.filename} ${reel.owner_name} ${reel.verdict ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const whole = query.trim().toLowerCase();
  const starts = matching.filter((reel) => reel.filename.toLowerCase().startsWith(whole));
  return [...starts, ...matching.filter((reel) => !starts.includes(reel))];
}
