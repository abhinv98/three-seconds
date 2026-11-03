import { describe, expect, it } from "vitest";
import type { BrandKitData } from "@/lib/brand-kit";
import { assemble, fitBox, fitStretch, numberSources, traceObjects, type FinerRead } from "@/lib/finer";
import type { Report } from "@/lib/report";

const kit: BrandKitData = {
  name: "Grok",
  site: "grok.com",
  tagline: "An AI assistant.",
  logo: "",
  colors: [
    { hex: "#1084fe", name: "Blue" },
    { hex: "#000000", name: "Black" },
  ],
  fonts: ["Inter"],
  web_fonts: ["Inter"],
  products: ["Grok"],
  market: "Consumers.",
  market_sources: [{ name: "A", date: "", url: "https://a.example/x" }],
  mentions: [
    { tone: "good", text: "Fast.", source: { name: "B", date: "1 Jan 2026", url: "https://b.example/y" } },
    { tone: "watch", text: "Risky.", source: { name: "A", date: "", url: "https://a.example/x" } },
  ],
  read_at: "2026-11-03",
};

const report = { video: { duration_s: 60, width: 1080, height: 1920 } } as Report;

const read: FinerRead = {
  finding: "Not ready.",
  viewer: "Productivity fans.",
  moments: [
    {
      kind: "ASCI",
      title: "Add a label",
      happened: "None.",
      should_be: "Add one.",
      why: "ASCI.",
      source_ids: ["S2", "S9"],
      where: [{ t_start: -5, t_end: 80, t: 3, box: [0.9, 0.9, 0.5, 0.5], trace: false }],
      fix: { style: "label", text: "Paid partnership with Grok", box: [0.04, 0.03, 0.7, 0.05], t_start: 0, t_end: 21 },
    },
    {
      kind: "Showcase",
      title: "Phone too small",
      happened: "Small.",
      should_be: "Bigger.",
      why: "Readable.",
      source_ids: [],
      where: [
        { t_start: 18, t_end: 22, t: 20, box: [0.6, 0.2, 0.1, 0.1], trace: true },
        { t_start: 40, t_end: 41, t: 40.5, box: [0.1, 0.1, 0.2, 0.2], trace: true },
      ],
      fix: null,
    },
  ],
};

describe("finer details", () => {
  it("keeps boxes inside the frame and stretches inside the Reel", () => {
    expect(fitBox([0.9, 0.9, 0.5, 0.5])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(fitBox([0.1, 0.1, 0, 0])).toEqual([0.1, 0.1, 0.02, 0.02]);
    expect(fitStretch(-5, 80, 60)).toEqual({ t_start: 0, t_end: 60 });
    expect(fitStretch(30, 30, 60)).toEqual({ t_start: 30, t_end: 30.3 });
  });

  it("numbers each source once, so the model cites by id", () => {
    const sources = numberSources(kit);
    expect([...sources.keys()]).toEqual(["S1", "S2"]);
    expect(sources.get("S2")?.url).toBe("https://a.example/x");
  });

  it("asks SAM to follow only the places marked trace", () => {
    expect(traceObjects(read, 60).map((o) => o.id)).toEqual(["1.0", "1.1"]);
  });

  it("uses a SAM track where there is one and holds the box where there isn't", () => {
    const track = [{ t_start: 18.5, t_end: 21, boxes: [{ t: 18.5, box: [0.6, 0.2, 0.1, 0.1] as [number, number, number, number] }] }];
    const details = assemble(
      { id: "r1", filename: "reel.mp4" },
      report,
      kit,
      numberSources(kit),
      { duration_s: 60, width: 1080, height: 1920, frames: [], poster: "UE9TVEVS" },
      read,
      { tracks: { "1.0": track }, failed: ["1.1"], stills: [{ t: 3, jpeg: "U1RJTEw=" }], cost_usd: 0.01 },
    );
    const [label, phone] = details.moments;
    expect(label.spans).toEqual([{ t_start: 0, t_end: 60, boxes: [{ t: 3, box: [0.5, 0.5, 0.5, 0.5] }] }]);
    expect(label.sources.map((s) => s.name)).toEqual(["A"]); // S9 doesn't exist, so it's dropped
    expect(label.fix?.spans).toEqual([{ t_start: 0, t_end: 21 }]);
    expect(label.thumb).toBe("data:image/jpeg;base64,U1RJTEw=");
    expect(phone.spans[0]).toBe(track[0]);
    expect(phone.spans[1]).toEqual({ t_start: 40, t_end: 41, boxes: [{ t: 40.5, box: [0.1, 0.1, 0.2, 0.2] }] });
    expect(phone.thumb).toBe("data:image/jpeg;base64,UE9TVEVS"); // no still: the poster stands in
    expect(details.reel.video[0].src).toBe("/api/reels/r1/video");
    expect(details.brand.webFonts).toEqual(["Inter"]);
  });
});
