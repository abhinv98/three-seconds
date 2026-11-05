import { describe, expect, it } from "vitest";
import type { FinerDetails, Moment } from "./details";
import { premiereMarkersCsv } from "./exports";
import type { ReelNote } from "./review";

const moment = (over: Partial<Moment>): Moment => ({
  id: "m1",
  kind: "ASCI",
  title: "Add the label",
  happened: "",
  shouldBe: "Show Ad from the first frame.",
  why: "",
  sources: [],
  thumb: "",
  spans: [{ t_start: 0, t_end: 16.5, boxes: [] }],
  ...over,
});
const details = (moments: Moment[]) => ({ moments }) as FinerDetails;
const note = (t: number, text: string): ReelNote => ({ id: "n", reel_id: "r", t, text, by_name: "Asha", at: "" });
const rows = (csv: string) => csv.split("\r\n").slice(1, -1);

describe("premiereMarkersCsv", () => {
  it("has exactly these columns, CRLF lines and a final line break", () => {
    const csv = premiereMarkersCsv(details([moment({})]), []);
    expect(csv.split("\r\n")[0]).toBe("Name,Start,Duration,Description");
    expect(csv.charCodeAt(0)).toBe("N".charCodeAt(0));
    expect(csv).toBe("Name,Start,Duration,Description\r\n1. Add the label,00:00:00:00,00:00:16:15,ASCI: Show Ad from the first frame.\r\n");
  });

  it("writes HH:MM:SS:FF at 30 fps", () => {
    const start = (t: number) => rows(premiereMarkersCsv(details([]), [note(t, "x")]))[0].split(",")[1];
    expect(start(0)).toBe("00:00:00:00");
    expect(start(1 / 30)).toBe("00:00:00:01");
    expect(start(3.5)).toBe("00:00:03:15");
    expect(start(29.99)).toBe("00:00:30:00");
    expect(start(59.999)).toBe("00:01:00:00");
    expect(start(61.1)).toBe("00:01:01:03");
    expect(start(3600)).toBe("01:00:00:00");
    expect(start(3723.5)).toBe("01:02:03:15");
    expect(start(-1)).toBe("00:00:00:00");
  });

  it("takes the duration in frames, so start plus duration lands on the end frame", () => {
    const csv = premiereMarkersCsv(details([moment({ spans: [{ t_start: 1.01, t_end: 2.02, boxes: [] }] })]), []);
    const [, start, duration] = rows(csv)[0].split(",");
    expect(start).toBe("00:00:01:00");
    expect(duration).toBe("00:00:01:01");
  });

  it("gives a moment one marker per span and numbers it by its place in the list", () => {
    const csv = premiereMarkersCsv(
      details([
        moment({}),
        moment({
          id: "m2",
          kind: "Showcase",
          title: "Show the logo",
          shouldBe: "Hold it longer.",
          spans: [
            { t_start: 5, t_end: 6, boxes: [] },
            { t_start: 20, t_end: 21, boxes: [] },
          ],
        }),
      ]),
      [],
    );
    expect(rows(csv).map((r) => r.split(",")[0])).toEqual(["1. Add the label", "2. Show the logo", "2. Show the logo"]);
  });

  it("puts notes in as point markers, everything in time order", () => {
    const csv = premiereMarkersCsv(details([moment({ spans: [{ t_start: 2, t_end: 3, boxes: [] }] })]), [note(1, "Too dark"), note(9, "Nice")]);
    expect(rows(csv)).toEqual([
      "Note,00:00:01:00,00:00:00:00,Asha: Too dark",
      "1. Add the label,00:00:02:00,00:00:01:00,ASCI: Show Ad from the first frame.",
      "Note,00:00:09:00,00:00:00:00,Asha: Nice",
    ]);
  });

  it("quotes commas and quotes, and keeps every record on one line", () => {
    const csv = premiereMarkersCsv(details([moment({ title: 'Say "Ad", clearly', shouldBe: "Line one\nline two\r\n  line three" })]), []);
    expect(rows(csv)).toEqual([`"1. Say ""Ad"", clearly",00:00:00:00,00:00:16:15,ASCI: Line one line two line three`]);
  });

  it("stops a spreadsheet running a note as a formula", () => {
    const csv = premiereMarkersCsv(details([]), [{ ...note(0, "x"), by_name: "=HYPERLINK(1)" }]);
    expect(rows(csv)[0].split(",").at(-1)).toBe("'=HYPERLINK(1): x");
  });

  it("has only the header when there is nothing to mark", () => {
    expect(premiereMarkersCsv(details([]), [])).toBe("Name,Start,Duration,Description\r\n");
  });
});
