// A first guess at a company's name from its website, so the website can be the only thing a brand has to type.
// The kit's research finds how the brand really writes its name; this only fills the box, which stays editable.

const SECOND_LEVEL = new Set(["co", "com", "net", "org", "ac", "gov"]);
const WORD = /^[a-z0-9-]+$/i;

export function hostOf(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

export function guessBrandName(input: string): string {
  const host = hostOf(input);
  if (!host) return "";
  const labels = host.split(".");
  // instagram.com/acme is the brand acme, not Instagram.
  if (labels[0] === "instagram") {
    const handle = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`).pathname.split("/")[1]?.split(".")[0] ?? "";
    return WORD.test(handle) ? titleCase(handle) : "";
  }
  const tail = labels.length > 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  const name = labels[labels.length - tail] ?? labels[0];
  return titleCase(name);
}

const titleCase = (word: string) =>
  word
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
