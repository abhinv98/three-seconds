import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asciClause } from "./asci";
import { checkCaption, combinedOutcome, HINDI_LABEL_WORDS, LABEL_WORDS } from "./caption";

const SAMPLE = "In my hiking era @RayBanMeta #RayBanMetaPartner Students get 10% off using code RBM1.";
const verdict = (caption: string, tag = false) => checkCaption(caption, tag).verdict;
const text = (caption: string, tag = false) =>
  checkCaption(caption, tag)
    .lines.map((line) => line.text)
    .join("\n");

describe("the real sample caption", () => {
  it("fails without the tag: Partner is not Partnership", () => {
    const { verdict, lines } = checkCaption(SAMPLE, false);
    expect(verdict).toBe("FAIL");
    expect(lines.filter((l) => l.ok)).toEqual([]);
    expect(lines.map((l) => l.text).join("\n")).toContain(`#RayBanMetaPartner doesn't count. "Partner" isn't on ASCI's list. "Partnership" is.`);
  });

  it("passes with the tag, and still says the caption has no word of its own", () => {
    const { verdict, lines } = checkCaption(SAMPLE, true);
    expect(verdict).toBe("PASS");
    expect(lines.some((l) => !l.ok && l.text.includes("#RayBanMetaPartner"))).toBe(true);
    expect(lines.some((l) => !l.ok && l.text.includes(asciClause("ASCI-IG 1.2d").text))).toBe(true);
  });
});

describe("permitted words", () => {
  it.each([
    "Ad | In my hiking era",
    "(ad) In my hiking era",
    "This is an ad for sunglasses",
    "Advertisement: my hiking era",
    "Sponsored by Ray-Ban",
    "In collaboration with Ray-Ban",
    "Paid partnership with Ray-Ban",
    "My free gift from Ray-Ban",
    "Affiliate link in bio",
    "Includes paid promotion",
    "Employee of Ray-Ban",
    "#ad in my hiking era",
    "#AD in my hiking era",
    "#sponsored hiking",
    "#RayBanMetaPartnership hiking",
    "#raybanmetapartnership hiking",
    "#RayBanMetaAd hiking",
    "#paidpartnership hiking",
    "#FreeGift hiking",
    "#ad_raybanmeta hiking",
  ])("counts %s", (caption) => {
    expect(verdict(caption)).toBe("PASS");
  });

  it.each([
    "#RayBanMetaPartner hiking",
    "Partner with me on this",
    "#collab with the brand",
    "Collab with the brand",
    "Gifted by the brand",
    "Advertising my new video",
    "Add this to your list",
    "Bad weather on the road",
    "#roadtrip #adventure #badminton",
    "#MadMax hiking",
    "#ADventure hiking",
    "@ad_agency made this with me",
    "See https://x.com/ad/sponsored",
    "www.partnership.com is good",
    "Our ad-free hiking era",
    "The ad campaign we shot",
    "#AdFree hiking",
    "Not sponsored, just love it",
    "This is not an ad",
    "This isn't an ad",
    "This isn’t an ad",
    "Non-sponsored post",
    "#notsponsored hiking",
    "#NotAnAd hiking",
    "#unsponsored hiking",
    "sponsored nahi hai",
    "प्रायोजित नहीं है",
    "",
  ])("doesn't count %s", (caption) => {
    expect(verdict(caption)).toBe("FAIL");
  });

  it("a negation in an earlier clause doesn't cancel the word", () => {
    expect(verdict("No filter, sponsored by Ray-Ban")).toBe("PASS");
    expect(verdict("#casinosponsored hiking")).toBe("PASS");
  });

  it("names the word 1.3a has when the caption comes close", () => {
    expect(text("#collab with the brand")).toContain(`"Collab" isn't on ASCI's list. "Collaboration" is.`);
    expect(text("Gifted by the brand")).toContain(`"Gifted" isn't on ASCI's list. "Free gift" is.`);
    expect(text("#raybanmetapartner hiking")).toContain(`"Partner" isn't on ASCI's list. "Partnership" is.`);
  });
});

describe("Hindi", () => {
  it.each(["विज्ञापन: मेरी हाइकिंग की कहानी", "प्रायोजित पोस्ट है यह", "#विज्ञापन मेरी कहानी", "मुफ़्त उपहार मिला मुझे", "मुफ्त उपहार मिला मुझे", "एफिलिएट लिंक है यह"])("counts %s", (caption) => {
    expect(verdict(caption)).toBe("PASS");
  });

  it("a Hindi label in a caption that's mostly English needs a look (1.3b)", () => {
    const caption = "In my hiking era, with these sunglasses on, प्रायोजित";
    expect(verdict(caption)).toBe("REVIEW");
    expect(text(caption)).toContain(asciClause("ASCI-IG 1.3b").text);
  });

  it("an English label beside it is fine", () => {
    expect(verdict("Ad प्रायोजित In my hiking era")).toBe("PASS");
  });
});

describe("where the word sits", () => {
  const long = "In my hiking era with these sunglasses on, the trail was long and the view was worth it, and there is so much more to say about the day. ";

  it("a word past the fold gets a REVIEW, quoting 1.2b word for word", () => {
    expect(long.length).toBeGreaterThan(125);
    expect(verdict(`${long}Sponsored by Ray-Ban.`)).toBe("REVIEW");
    expect(text(`${long}Sponsored by Ray-Ban.`)).toContain(asciClause("ASCI-IG 1.2b").text);
  });

  it("the same word before the fold passes", () => {
    expect(verdict(`Sponsored by Ray-Ban. ${long}`)).toBe("PASS");
  });

  it("two line breaks are a fold too", () => {
    expect(verdict("Hiking era\n\nAd")).toBe("REVIEW");
    expect(verdict("Hiking era\nAd")).toBe("PASS");
  });

  it("a word in a group of hashtags gets a REVIEW, quoting 1.2c word for word", () => {
    const caption = "Hiking era #travel #hiking #ad #views";
    expect(verdict(caption)).toBe("REVIEW");
    expect(text(caption)).toContain(asciClause("ASCI-IG 1.2c").text);
  });

  it("a link in the run counts towards the group", () => {
    expect(verdict("Hiking era https://x.com/a #hiking #ad")).toBe("REVIEW");
  });

  it("two hashtags aren't a group", () => {
    expect(verdict("Hiking era #ad #views")).toBe("PASS");
  });

  it("the word outside the group is the one that counts", () => {
    expect(verdict("Ad. Hiking era #travel #hiking #ad #views")).toBe("PASS");
  });
});

describe("the platform tag", () => {
  it("alone is enough, because 1.3a lists it", () => {
    expect(verdict("", true)).toBe("PASS");
    expect(text("", true)).toContain(asciClause("ASCI-IG 1.3a").text);
  });

  it("covers a word that's buried", () => {
    expect(verdict("Hiking era\n\nAd", true)).toBe("PASS");
  });

  it("without it, a good caption still says the tag is worth adding", () => {
    const { lines } = checkCaption("Ad. Hiking era", false);
    expect(lines.at(-1)).toEqual({ ok: false, text: expect.stringContaining(asciClause("ASCI-IG 1.2d").text) });
  });
});

describe("clauses", () => {
  it("quotes only what shared/asci-clauses.json holds", () => {
    const quotes = [
      ...checkCaption(SAMPLE, false).lines,
      ...checkCaption(SAMPLE, true).lines,
      ...checkCaption("Ad. Hiking era", false).lines,
      ...checkCaption("Hiking era\n\nAd", false).lines,
      ...checkCaption("Hiking era #a #b #ad", false).lines,
      ...checkCaption("Hiking era with sunglasses प्रायोजित", false).lines,
    ].flatMap((line) => [...line.text.matchAll(/(1\.\d[a-z]?): "(.+)"$/g)].map((m) => [m[1], m[2]]));
    expect(new Set(quotes.map(([code]) => code))).toEqual(new Set(["1.2a", "1.2b", "1.2c", "1.2d", "1.3a", "1.3b"]));
    for (const [code, quote] of quotes) expect(quote).toBe(asciClause(`ASCI-IG ${code}`).text);
  });
});

describe("the worker's word lists", () => {
  const python = readFileSync(path.join(import.meta.dirname, "../../../worker/pipeline/asci.py"), "utf8");
  const list = (name: string) => [...(python.match(new RegExp(`${name} = (?:\\[|\\n?\\s*_devanagari\\(w\\)\\s*for w in \\[)([^\\]]+)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  it("every English word on the worker's list passes here", () => {
    const words = list("_LATIN");
    expect(words).toContain("advertisement");
    for (const word of words) expect(verdict(word)).toBe("PASS");
    expect(verdict("paid promotion")).toBe("PASS");
  });

  it("every Hindi word on the worker's list passes here, and only those", () => {
    const words = list("_DEVANAGARI");
    expect(words).toContain("विज्ञापन");
    expect(new Set(HINDI_LABEL_WORDS)).toEqual(new Set(words));
    for (const word of words) expect(verdict(word)).toBe("PASS");
  });

  it("every label the label maker offers counts here", () => {
    for (const word of [...LABEL_WORDS, ...HINDI_LABEL_WORDS]) expect(verdict(word)).toBe("PASS");
  });
});

describe("combinedOutcome", () => {
  it("never lets the caption overwrite a measured FAIL", () => {
    for (const [caption, tag] of [
      ["PASS", true],
      ["PASS", false],
      ["REVIEW", false],
      ["FAIL", false],
    ] as const) {
      expect(combinedOutcome("FAIL", caption, tag)).toContain("still fails the on-screen check");
    }
  });

  it("says plainly when nothing discloses", () => {
    expect(combinedOutcome("FAIL", "FAIL", false)).toContain("Nothing tells a viewer this is paid.");
  });

  it("with the tag on, says the post carries a label while the file stays as measured", () => {
    const line = combinedOutcome("FAIL", "PASS", true);
    expect(line).toContain("stays as measured");
    expect(line).toContain("With the tag on");
  });

  it("a passing file passes on its own", () => {
    expect(combinedOutcome("PASS", "PASS", false)).toContain("passes on its own");
    expect(combinedOutcome("PASS", "FAIL", false)).toContain("passes on its own");
  });
});
