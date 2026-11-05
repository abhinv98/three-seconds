import { describe, expect, it } from "vitest";
import { asciClause } from "@/lib/asci";
import { contrast } from "@/lib/daypart";
import { clampPosition, fileName, FRAME, holdFor, holdFrames, isCovered, labelBox, labelSize, SAFE_SPOT, SIZES, textColourOn } from "./label";

describe("holdFor", () => {
  it("is 3 seconds up to and including 15 seconds (1.2e.I)", () => {
    for (const d of [1, 14.9, 15, 15.04]) {
      expect(holdFor(d)).toEqual({ seconds: 3, clause: asciClause("ASCI-IG 1.2e.I") });
    }
  });

  it("is a third of the length past 15 seconds, under 2 minutes (1.2e.II)", () => {
    expect(holdFor(15.1).clause).toEqual(asciClause("ASCI-IG 1.2e.II"));
    expect(holdFor(30).seconds).toBe(10);
    expect(holdFor(49.64).seconds).toBeCloseTo(16.53, 2);
    expect(holdFor(119.9).seconds).toBeCloseTo(39.97, 2);
  });

  it("has no number at 2 minutes or longer, only the section where the brand is mentioned (1.2e.III)", () => {
    for (const d of [119.96, 120, 180]) {
      expect(holdFor(d)).toEqual({ seconds: null, clause: asciClause("ASCI-IG 1.2e.III") });
    }
  });
});

describe("holdFrames", () => {
  it("rounds up, so the hold is never a frame short", () => {
    expect(holdFrames(3)).toBe(90);
    expect(holdFrames(10)).toBe(300);
    expect(holdFrames(16.53)).toBe(496);
    expect(holdFrames(16.5333)).toBe(496);
    expect(holdFrames(16.54)).toBe(497);
  });
});

describe("textColourOn", () => {
  it("uses the kit's colour with the best contrast when one reads", () => {
    expect(textColourOn("#ea4e12", ["#ea4e12", "#121212", "#333333"])).toBe("#121212");
  });

  it("falls back to ink or white when no kit colour reads", () => {
    expect(textColourOn("#ffffff", ["#ffffff"])).toBe("#111111");
    expect(textColourOn("#000000", ["#000000"])).toBe("#ffffff");
  });

  it("always gives AA on the colours the fallback covers", () => {
    for (const bg of ["#ffff50", "#121212", "#ffffff", "#ea4e12", "#0a7883"]) {
      expect(contrast(textColourOn(bg, []), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("where the label sits", () => {
  const { width, height } = labelSize(300, SIZES.M);

  it("the safe spot is clear of Instagram's UI at every size, even with a long word", () => {
    for (const size of Object.values(SIZES)) {
      const big = labelSize(700, size);
      expect(isCovered(labelBox(SAFE_SPOT.x, SAFE_SPOT.y, big.width, big.height))).toBe(false);
    }
  });

  it("top, bottom and right of the frame are covered", () => {
    expect(isCovered(labelBox(0.05, 0, width, height))).toBe(true);
    expect(isCovered(labelBox(0.05, 0.9, width, height))).toBe(true);
    expect(isCovered(labelBox(0.9, 0.4, width, height))).toBe(true);
    expect(isCovered(labelBox(0.05, 0.4, width, height))).toBe(false);
  });

  it("clampPosition keeps the whole label in the frame", () => {
    expect(clampPosition(-1, -1, width, height)).toEqual({ x: 0, y: 0 });
    const end = clampPosition(2, 2, width, height);
    expect(end.x).toBeCloseTo(1 - width / FRAME.width);
    expect(end.y).toBeCloseTo(1 - height / FRAME.height);
    expect(clampPosition(0.2, 0.3, width, height)).toEqual({ x: 0.2, y: 0.3 });
  });

  it("a label wider than the frame sits at the left edge instead of going negative", () => {
    expect(clampPosition(0.5, 0.5, 2000, height).x).toBe(0);
  });
});

describe("fileName", () => {
  it("names the brand and the word, in plain ASCII", () => {
    expect(fileName("Paid partnership", "Ray-Ban Meta")).toBe("label-ray-ban-meta-paid-partnership.png");
    expect(fileName("Ad", null)).toBe("label-ad.png");
    expect(fileName("विज्ञापन", null)).toBe("label.png");
  });
});
