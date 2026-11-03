import { describe, expect, it } from "vitest";
import { tidyResearch } from "@/lib/brand-research";
import { palette } from "@/lib/brand-kit";
import { FetchRefused, safeFetch } from "@/lib/safe-fetch";

describe("brand kit", () => {
  it("puts the darkest colour last and always gives the fixes two colours", () => {
    expect(palette([{ hex: "#000000", name: "Black" }, { hex: "#1084FE", name: "Blue" }], null).map((c) => c.hex)).toEqual(["#1084fe", "#000000"]);
    expect(palette([{ hex: "#000000", name: "Black" }], null).map((c) => c.hex)).toEqual(["#ffffff", "#000000"]);
    expect(palette([{ hex: "#ffff50", name: "Yellow" }], null).map((c) => c.hex)).toEqual(["#ffff50", "#111111"]);
    // No researched colours: the site's theme colour and its most used colour stand in.
    const hints = { url: "", title: "", description: "", themeColor: "#f80", icons: [], colors: [{ hex: "#1084fe", uses: 9 }], fonts: [] };
    expect(palette([], hints).map((c) => c.hex)).toEqual(["#ff8800", "#1084fe", "#111111"]);
  });

  it("drops research it can't use: bad colours, non-web links, empty mentions", () => {
    const tidy = tidyResearch({
      name: " Grok ",
      logo_url: "javascript:alert(1)",
      colors: [{ hex: "#12345", name: "Bad" }, { hex: "#ABCDEF", name: "Good" }],
      mentions: [
        { tone: "good", text: "Fine.", source: { name: "A", date: "", url: "ftp://a.example" } },
        { tone: "watch", text: "Watch.", source: { name: "", date: "", url: "https://b.example/p" } },
      ],
    });
    expect(tidy.name).toBe("Grok");
    expect(tidy.logo_url).toBe("");
    expect(tidy.colors).toEqual([{ hex: "#abcdef", name: "Good" }]);
    expect(tidy.mentions).toEqual([{ tone: "watch", text: "Watch.", source: { name: "b.example", date: "", url: "https://b.example/p" } }]);
  });

  it("refuses to fetch anything but public https hosts", async () => {
    for (const url of ["http://grok.com", "https://127.0.0.1/", "https://localhost/", "https://[::1]/", "https://intranet/"]) {
      await expect(safeFetch(url, { maxBytes: 1000 })).rejects.toBeInstanceOf(FetchRefused);
    }
  });
});
