export const ACCEPTED_TYPES = ["video/mp4", "video/quicktime"] as const;
export const ACCEPT_ATTRIBUTE = "video/mp4,video/quicktime,.mp4,.mov";
export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_DURATION_S = 90;

/** Browsers sometimes report an empty type for .mov files; fall back to the extension. */
export function contentTypeFor(file: { name: string; type: string }): string | null {
  if ((ACCEPTED_TYPES as readonly string[]).includes(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  return null;
}
