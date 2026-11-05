import { asciClause } from "@/lib/asci";

// The caption half of a disclosure: ASCI 1.3a's permitted words, where they sit (1.2a to 1.2c) and the platform tag.
// The word lists are worker/pipeline/asci.py's, matched the same way, so a word that counts on screen counts here too;
// caption.test.ts fails if they drift apart. No database: the panel runs this in the browser as you type.

/** Instagram's limit on a caption. */
export const CAPTION_LIMIT = 2200;

/** For the label maker: 1.3a's words as a label's text, then their Hindi equivalents (1.3b allows the ad's own language). */
export const LABEL_WORDS = ["Ad", "Advertisement", "Sponsored", "Paid partnership", "Partnership", "Collaboration", "Affiliate", "Free gift", "Employee"];
export const HINDI_LABEL_WORDS = ["विज्ञापन", "प्रायोजित", "साझेदारी", "भागीदारी", "सहयोग", "एफ़िलिएट", "मुफ़्त उपहार", "कर्मचारी", "सशुल्क प्रचार"];

const LATIN = ["advertisement", "ad", "sponsored", "collaboration", "partnership", "employee", "free gift", "affiliate", "paid promotion"];

const devanagari = (text: string) => text.normalize("NFC").replaceAll("़", "");
const HINDI = HINDI_LABEL_WORDS.map(devanagari);

const LATIN_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${LATIN.join("|")})(?![\\p{L}\\p{N}])`, "gu");
const HASHTAG = /#[\p{L}\p{M}\p{N}_]+/gu;
const LINK = /https?:\/\/\S+|www\.\S+/gu;
const MENTION = /@[\p{L}\p{N}._]+/gu;
const TAG_OR_LINK = String.raw`(?:#[\p{L}\p{M}\p{N}_]+|https?:\/\/\S+|www\.\S+)`;
/** Three or more hashtags or links in a row: the group 1.2c means. */
const TAG_GROUP = new RegExp(`${TAG_OR_LINK}(?:\\s+${TAG_OR_LINK}){2,}`, "gu");

const NEGATED_BEFORE = new Set(["not", "no", "never", "non", "isn't", "isnt", "wasn't", "wasnt", "without"]);
const NEGATED_AFTER = new Set(["nahi", "nahin", "नहीं", "नही", "ना"]);
const NEGATED_TAG = /(?:^(?:no|un)|not|non|never|isnt|wasnt)(?:an?|paid)?(?:advertisement|ad|sponsored|collaboration|partnership|employee|freegift|affiliate|paidpromotion)/;
/** "ad" followed by one of these is about ads, not a label on one. */
const AD_NOUN = /^[ -]*(?:free|hoc|block|blocker|blockers|blocking|campaign|campaigns|agency|shoot|spend|budget|account|break)(?![\p{L}])/iu;
/** Whole words inside an all-lowercase hashtag. "ad" isn't here: #roadtrip and #adventure hold those letters by accident. */
const TAG_WORDS = /advertisement|sponsored|collaboration|partnership|employee|freegift|affiliate|paidpromotion/;

/** Close to a permitted word, and not one: what a creator wrote, and the word ASCI's list has instead. */
const NEAR_MISSES: Record<string, string> = {
  partner: "Partnership",
  partners: "Partnership",
  collab: "Collaboration",
  collabs: "Collaboration",
  gifted: "Free gift",
  gift: "Free gift",
  sponsor: "Sponsored",
  sponsors: "Sponsored",
  promo: "Ad",
  promotion: "Ad",
  paid: "Ad",
  advert: "Advertisement",
  advertising: "Advertisement",
};
const NEAR_IN_TAG = /partner|collab|gifted|sponsor|advert/;

/** Where Instagram's "more" falls: about 125 characters or two lines, whichever comes first. It varies by screen. */
const FOLD_CHARS = 125;
function foldAt(text: string): number {
  const first = text.indexOf("\n");
  const second = first < 0 ? -1 : text.indexOf("\n", first + 1);
  return second < 0 ? FOLD_CHARS : Math.min(FOLD_CHARS, second);
}

const blank = (match: string) => " ".repeat(match.length);

function negated(lower: string, start: number, end: number): boolean {
  const clause = lower.slice(0, start).split(/[,.;:!?|\n।]/).pop() ?? "";
  const word = (w: string) => w.replace(/’/g, "'").replace(/[^\p{L}\p{M}']/gu, "");
  const before = clause.trim().split(/\s+/).slice(-3).map(word);
  const after = lower.slice(end).trim().split(/\s+/).slice(0, 2).map(word);
  return before.some((w) => NEGATED_BEFORE.has(w)) || after.some((w) => NEGATED_AFTER.has(w));
}

/** #RayBanMetaPartnership becomes ray, ban, meta, partnership. */
const tagParts = (tag: string) =>
  tag
    .split("_")
    .flatMap((part) => part.match(/\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+/gu) ?? [])
    .map((part) => part.toLowerCase());

function tagHasWord(tag: string): boolean {
  const lower = tag.toLowerCase();
  if (NEGATED_TAG.test(lower)) return false;
  if (TAG_WORDS.test(lower)) return true;
  const parts = tagParts(tag);
  const ad = parts.indexOf("ad");
  return lower === "paidad" || (ad >= 0 && !AD_NOUN.test(parts[ad + 1] ?? ""));
}

interface Hit {
  word: string;
  at: number;
  hindi: boolean;
}

function findHits(text: string): Hit[] {
  const hits: Hit[] = [];
  const noLinks = text.replace(LINK, blank).replace(MENTION, blank);
  for (const match of noLinks.matchAll(HASHTAG)) {
    if (tagHasWord(match[0].slice(1))) hits.push({ word: match[0], at: match.index, hindi: false });
  }
  const plain = noLinks.replace(HASHTAG, blank).toLowerCase();
  for (const match of plain.matchAll(LATIN_RE)) {
    const end = match.index + match[0].length;
    if (negated(plain, match.index, end) || (match[0] === "ad" && AD_NOUN.test(plain.slice(end)))) continue;
    hits.push({ word: text.slice(match.index, end), at: match.index, hindi: false });
  }
  const deva = devanagari(noLinks);
  for (const word of HINDI) {
    const at = deva.indexOf(word);
    if (at >= 0 && !negated(deva, at, at + word.length)) hits.push({ word, at, hindi: true });
  }
  return hits.sort((a, b) => a.at - b.at);
}

function nearMiss(text: string): { wrote: string; has: string; word: string } | null {
  const noLinks = text.replace(LINK, blank).replace(MENTION, blank);
  for (const match of noLinks.matchAll(/#[\p{L}\p{M}\p{N}_]+|[\p{L}\p{M}]+/gu)) {
    const token = match[0];
    const isTag = token.startsWith("#");
    const parts = isTag ? tagParts(token.slice(1)) : [token.toLowerCase()];
    const word = parts.find((part) => part in NEAR_MISSES) ?? (isTag ? token.toLowerCase().match(NEAR_IN_TAG)?.[0] : undefined);
    if (word) return { wrote: token, has: NEAR_MISSES[word], word: word[0].toUpperCase() + word.slice(1) };
  }
  return null;
}

const quoted = (code: string) => `${code.replace("ASCI-IG ", "")}: "${asciClause(code).text}"`;

const inTagGroup = (text: string, at: number) => [...text.matchAll(TAG_GROUP)].some((group) => at >= group.index && at < group.index + group[0].length);

export interface CaptionCheck {
  verdict: "PASS" | "REVIEW" | "FAIL";
  lines: { ok: boolean; text: string }[];
}

/**
 * The tag is on 1.3a's list ("Any one or more can be used") and Instagram shows it above the caption, so with the tag
 * on the post discloses even if the caption doesn't; the lines still say what the caption is missing.
 */
export function checkCaption(caption: string, usesPlatformTag: boolean): CaptionCheck {
  const text = caption.trim();
  const hits = findHits(text);
  const lines: CaptionCheck["lines"] = [];
  const fold = foldAt(text);
  const clear = hits.filter((hit) => hit.at < fold && !inTagGroup(text, hit.at));
  const best = clear[0] ?? hits[0];

  let wrongLanguage = false;
  // With the tag on, the tag is what carries the verdict, so it comes first.
  if (usesPlatformTag) {
    const listQuoted = Boolean(text && !best);
    lines.push({ ok: true, text: `Instagram's Paid partnership tag is on ASCI's list too${listQuoted ? " (1.3a)" : ""}, and it shows above the caption.${listQuoted ? "" : ` ${quoted("ASCI-IG 1.3a")}`}` });
  }
  if (!text) {
    lines.push({ ok: false, text: "No caption here yet." });
  } else if (!best) {
    lines.push({ ok: false, text: `No permitted word in the caption. ${quoted("ASCI-IG 1.3a")}` });
    const near = nearMiss(text);
    if (near) lines.push({ ok: false, text: `${near.wrote} doesn't count. "${near.word}" isn't on ASCI's list. "${near.has}" is.` });
  } else {
    lines.push({ ok: true, text: `"${best.word}" is on ASCI's list (1.3a)${best.hindi ? " in Hindi" : ""}.` });
    if (clear.length) {
      lines.push({ ok: true, text: `It's upfront, before Instagram's "more". ${quoted("ASCI-IG 1.2a")}` });
    } else if (best.at < fold) {
      lines.push({ ok: false, text: `"${best.word}" sits in a group of hashtags. ${quoted("ASCI-IG 1.2c")}` });
    } else {
      lines.push({ ok: false, text: `"${best.word}" comes after Instagram's "more", which falls at about ${FOLD_CHARS} characters or two lines. ${quoted("ASCI-IG 1.2b")}` });
    }
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    const hindiLetters = text.match(/\p{Script=Devanagari}/gu)?.length ?? 0;
    wrongLanguage = !hits.some((hit) => !hit.hindi) && hindiLetters * 2 < letters;
    if (wrongLanguage) lines.push({ ok: false, text: `The label is only in Hindi and the caption is mostly not. ${quoted("ASCI-IG 1.3b")}` });
  }

  if (!usesPlatformTag) {
    lines.push({ ok: false, text: `No Paid partnership tag. ${quoted("ASCI-IG 1.2d")}` });
  } else if (!best) {
    lines.push({ ok: false, text: `Worth adding a word of your own to the first line as well. ${quoted("ASCI-IG 1.2d")}` });
  }

  const verdict = usesPlatformTag ? "PASS" : !best ? "FAIL" : clear.length && !wrongLanguage ? "PASS" : "REVIEW";
  return { verdict, lines };
}

/** How the measured on-screen verdict and the caption check sit together. It adds to the measured verdict; it never replaces it. */
export function combinedOutcome(measured: "PASS" | "REVIEW" | "FAIL", caption: CaptionCheck["verdict"], usesPlatformTag: boolean): string {
  if (measured === "PASS") {
    return caption === "PASS"
      ? "The label on screen passes on its own, and the caption backs it up."
      : "The label on screen passes on its own. The caption is part of the post too, so it's worth fixing.";
  }
  const screen = measured === "FAIL" ? "The file still fails the on-screen check" : "The on-screen check still needs a look";
  if (caption === "FAIL") return `${screen}, and the caption doesn't disclose either. Nothing tells a viewer this is paid.`;
  if (usesPlatformTag) return `${screen}, and that stays as measured. With the tag on, the post carries a permitted label from the moment it goes up.`;
  if (caption === "PASS") return `${screen}, and that stays as measured. The caption discloses upfront, and 1.2e's on-screen rule is written for posts "without accompanying text", so a person should decide if this post needs both.`;
  return `${screen}, and that stays as measured. The caption has a permitted word, but not where people will see it.`;
}
