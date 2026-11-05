import { describe, expect, it } from "vitest";
import { tidyResearch } from "@/lib/brand-research";
import { bestLogo, imageSize, palette } from "@/lib/brand-kit";
import { FetchRefused, safeFetch } from "@/lib/safe-fetch";
import { svgColors } from "@/lib/site-hints";

const png = (w: number, h: number) => {
  const b = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const SVG = Buffer.from('<svg viewBox="0 0 1 1"><path fill="#0082FB"/></svg>');

describe("brand kit", () => {
  it("puts the darkest colour last and always gives the fixes two colours", () => {
    expect(palette([{ hex: "#000000", name: "Black" }, { hex: "#1084FE", name: "Blue" }], null).map((c) => c.hex)).toEqual(["#1084fe", "#000000"]);
    expect(palette([{ hex: "#000000", name: "Black" }], null).map((c) => c.hex)).toEqual(["#ffffff", "#000000"]);
    expect(palette([{ hex: "#ffff50", name: "Yellow" }], null).map((c) => c.hex)).toEqual(["#ffff50", "#111111"]);
    // No researched colours: the site's theme colour and its most used colour stand in.
    const hints = { themeColor: "#f80", colors: [{ hex: "#1084fe", uses: 9 }] };
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

  it("reads an image's size from its header", () => {
    expect(imageSize(png(180, 90), "image/png")).toEqual({ w: 180, h: 90 });
    const gif = Buffer.alloc(10);
    gif.write("GIF89a", 0, "latin1");
    gif.writeUInt16LE(64, 6);
    gif.writeUInt16LE(32, 8);
    expect(imageSize(gif, "image/gif")).toEqual({ w: 64, h: 32 });
    const ico = Buffer.alloc(38);
    ico.writeUInt16LE(2, 4);
    ico[6] = 32;
    ico[22] = 0; // 256
    expect(imageSize(ico, "image/x-icon")).toEqual({ w: 256, h: 256 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0x40, 0x00, 0xf0, 3, 0, 0, 0, 0]);
    expect(imageSize(jpeg, "image/jpeg")).toEqual({ w: 240, h: 320 });
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "latin1");
    webp.write("WEBPVP8 ", 8, "latin1");
    webp.writeUInt16LE(180, 26);
    webp.writeUInt16LE(180, 28);
    expect(imageSize(webp, "image/webp")).toEqual({ w: 180, h: 180 });
    expect(imageSize(Buffer.alloc(3), "image/png")).toBeNull();
    expect(imageSize(SVG, "image/svg+xml")).toBeNull();
  });

  describe("choosing the logo", () => {
    const files: Record<string, Buffer> = {
      "https://a.test/tiny.png": png(32, 32),
      "https://a.test/mid.png": png(64, 64),
      "https://a.test/big.png": png(512, 512),
      "https://a.test/logo.svg": SVG,
      "https://a.test/banner.png": png(1200, 630),
      "https://a.test/square.png": png(800, 800),
      "https://a.test/page": Buffer.from("<html>not an image</html>"),
    };
    const fetcher = async (url: string) => {
      if (!files[url]) throw new Error("404");
      return { body: files[url], contentType: url.endsWith(".svg") ? "image/svg+xml" : "text/plain" };
    };
    const pick = async (candidates: string[], social: string | null = null) => {
      const src = await bestLogo(candidates, social, fetcher);
      const body = src ? Buffer.from(src.split(",")[1], "base64") : null;
      return Object.entries(files).find(([, b]) => body?.equals(b))?.[0] ?? "";
    };

    it("takes research's logo when it's usable, whatever else there is", async () => {
      expect(await pick(["https://a.test/big.png", "https://a.test/logo.svg"])).toBe("https://a.test/big.png");
    });
    it("passes over a tiny favicon for something sharp further down the list", async () => {
      expect(await pick(["https://a.test/tiny.png", "https://a.test/logo.svg"])).toBe("https://a.test/logo.svg");
      expect(await pick(["https://a.test/tiny.png", "https://a.test/big.png"])).toBe("https://a.test/big.png");
    });
    it("falls back to the largest small icon", async () => {
      expect(await pick(["https://a.test/tiny.png", "https://a.test/mid.png"])).toBe("https://a.test/mid.png");
    });
    it("skips web pages and dead links", async () => {
      expect(await pick(["https://a.test/page", "https://a.test/gone.png", "https://a.test/mid.png"])).toBe("https://a.test/mid.png");
    });
    it("uses a social card only if it's square and nothing else worked", async () => {
      expect(await pick([], "https://a.test/square.png")).toBe("https://a.test/square.png");
      expect(await pick([], "https://a.test/banner.png")).toBe("");
      expect(await pick(["https://a.test/tiny.png"], "https://a.test/square.png")).toBe("https://a.test/tiny.png");
    });
  });

  it("reads an SVG's own colours, not its references", () => {
    expect(svgColors('<linearGradient id="abc"><stop stop-color="#0082FB"/><stop stop-color="#0064e0"/></linearGradient><path fill="url(#abc)"/><path fill="#0082fb"/><path fill="#fff"/>')).toEqual(["#0082fb", "#0064e0", "#ffffff"]);
  });

  it("refuses to fetch anything but public https hosts", async () => {
    for (const url of ["http://grok.com", "https://127.0.0.1/", "https://localhost/", "https://[::1]/", "https://intranet/"]) {
      await expect(safeFetch(url, { maxBytes: 1000 })).rejects.toBeInstanceOf(FetchRefused);
    }
  });
});
