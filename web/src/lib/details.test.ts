import { describe, expect, it } from "vitest";
import { boxAt, extent, type FinerDetails, fixList, inSpan, type Moment, type Span } from "./details";
import { formatTimecode } from "./format";

const tracked: Span = {
  t_start: 2,
  t_end: 6,
  boxes: [
    { t: 2, box: [0, 0, 0.2, 0.2] },
    { t: 4, box: [0.4, 0.2, 0.2, 0.2] },
  ],
};

describe("an outline over the Reel", () => {
  it("holds before the first keyframe and after the last, and moves linearly between them", () => {
    expect(boxAt(tracked, 1)).toEqual([0, 0, 0.2, 0.2]);
    expect(boxAt(tracked, 3)).toEqual([0.2, 0.1, 0.2, 0.2]);
    expect(boxAt(tracked, 5.5)).toEqual([0.4, 0.2, 0.2, 0.2]);
  });

  it("is on screen from its start up to, not including, its end", () => {
    expect([1.9, 2, 5.9, 6].map((t) => inSpan(tracked, t))).toEqual([false, true, true, false]);
  });
});

describe("the fix list for the creator", () => {
  const moment = (id: string, spans: Span[]): Moment => ({
    id,
    kind: "Showcase",
    title: `Change ${id}`,
    happened: "",
    shouldBe: `Do ${id} instead.`,
    why: "",
    sources: [],
    thumb: "",
    spans,
  });
  const details = {
    reel: { filename: "reel.mp4" },
    moments: [moment("a", [tracked, { ...tracked, t_start: 40, t_end: 44.5 }]), moment("b", [tracked])],
  } as unknown as FinerDetails;

  it("runs each change from its first span's start to its last span's end", () => {
    expect(extent(details.moments[0])).toEqual({ t_start: 2, t_end: 44.5 });
    expect(fixList(details, formatTimecode)).toBe(
      "Changes for reel.mp4, before it goes live:\n\n" +
        "1. Change a (00:02.0–00:44.5)\n   Do a instead.\n\n" +
        "2. Change b (00:02.0–00:06.0)\n   Do b instead.",
    );
  });
});
