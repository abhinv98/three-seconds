import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import schema from "../../../shared/report.schema.json";
import fixture from "../../../shared/fixtures/mock-report.json";
import samplePass from "../../../shared/fixtures/sample-report-pass.json";
import sample from "../../../shared/fixtures/sample-report.json";
import { asciClause } from "./asci";
import { formatTimecode } from "./format";
import { buildMockReport, scaleTimesInText } from "./mock";
import type { Report } from "./report";
import { timelineSummary } from "./summary";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function expectValid(value: unknown) {
  const ok = validate(value);
  expect(validate.errors ?? []).toEqual([]);
  expect(ok).toBe(true);
}

describe("report contract", () => {
  it("mock fixture matches shared/report.schema.json", () => {
    expectValid(fixture);
  });

  it("mock fixture fits the TypeScript Report type", () => {
    const report: Report = fixture as Report;
    expect(report.checks.map((c) => c.id)).toEqual([
      "label_present",
      "label_duration",
      "spoken_disclosure",
      "label_language",
    ]);
    expect(report.verdict).toBe("FAIL");
  });

  it("never invents a clause: every cited clause is quoted from shared/asci-clauses.json", () => {
    const cited = (fixture as Report).checks.flatMap((c) => (c.clause ? [c.clause] : []));
    expect(cited.map((c) => c.code)).toEqual(["ASCI-IG 1.3a", "ASCI-IG 1.2e.II", "ASCI-IG 1.3b"]);
    for (const clause of cited) expect(clause).toEqual(asciClause(clause.code));
  });
});

describe("sample reports", () => {
  it.each([
    ["sample-report.json", sample, "FAIL"],
    ["sample-report-pass.json", samplePass, "PASS"],
  ])("%s is a real report: valid, not mock, no brand lane, clauses quoted", (_, value, verdict) => {
    expectValid(value);
    const report = value as Report;
    expect(report.mock).toBe(false);
    expect(report.verdict).toBe(verdict);
    expect(report.tracks.map((t) => t.kind)).toEqual(["disclosure_label"]);
    for (const check of report.checks) if (check.clause) expect(check.clause).toEqual(asciClause(check.clause.code));
  });
});

describe("buildMockReport", () => {
  it("swaps in the real file and stays valid", () => {
    const report = buildMockReport({
      filename: "my-reel.mp4",
      blobUrl: "https://example.public.blob.vercel-storage.com/videos/my-reel-abc.mp4",
      durationS: 14,
      width: 720,
      height: 1280,
      jobId: "job-1",
      now: new Date("2026-10-25T12:00:00Z"),
    });
    expectValid(report);
    expect(report.job_id).toBe("job-1");
    expect(report.video).toMatchObject({ filename: "my-reel.mp4", duration_s: 14, width: 720, height: 1280 });
  });

  it("scales every time to the real duration and keeps it in bounds", () => {
    const report = buildMockReport({ filename: "a.mp4", blobUrl: "blob:local", durationS: 14 });
    const label = report.tracks.find((t) => t.kind === "disclosure_label");
    expect(label?.spans[0]).toEqual({ t_start: 0.2, t_end: 1.1 });
    const times = [
      ...report.tracks.flatMap((t) => t.spans.flatMap((s) => [s.t_start, s.t_end])),
      ...report.checks.flatMap((c) => c.evidence.flatMap((e) => [e.t_start, e.t_end])),
      ...report.transcript.flatMap((s) => [s.t_start, s.t_end]),
    ];
    expect(Math.max(...times)).toBeLessThanOrEqual(14);
    expect(report.checks.find((c) => c.id === "label_duration")?.detail).toContain("Label held 0.9s in one stretch");
  });

  it("applies 1.2e to the real length instead of scaling the 28s story's hold", () => {
    const hold = (durationS: number) => {
      const report = buildMockReport({ filename: "a.mp4", blobUrl: "blob:local", durationS });
      const check = report.checks.find((c) => c.id === "label_duration");
      const needs = check?.detail.match(/needs (\S+)\./)?.[1];
      const atLeast = check?.fix?.steps[0].match(/at least (\S+) /)?.[1];
      return [check?.clause?.code, needs, atLeast];
    };
    expect(hold(14)).toEqual(["ASCI-IG 1.2e.I", "3.0s", "3.0s"]);
    expect(hold(28)).toEqual(["ASCI-IG 1.2e.II", "9.33s", "9.33s"]);
    expect(hold(60)).toEqual(["ASCI-IG 1.2e.II", "20.0s", "20.0s"]);
  });

  it("rewrites times inside sentences", () => {
    expect(scaleTimesInText("Label held 1.8s. Brand appears at 00:03.0.", 2)).toBe(
      `Label held 3.6s. Brand appears at ${formatTimecode(6)}.`,
    );
    expect(scaleTimesInText("No times here, 5 fps.", 2)).toBe("No times here, 5 fps.");
  });
});

describe("timelineSummary", () => {
  it("says audio wasn't checked instead of claiming nothing was said", () => {
    const noAudio: Report = {
      ...(fixture as Report),
      transcript: [],
      audio_checked: false,
      checks: (fixture as Report).checks.map((c) => (c.id === "spoken_disclosure" ? { ...c, evidence: [] } : c)),
    };
    expect(timelineSummary(noAudio)).toContain("Audio not checked yet.");
    expect(timelineSummary(noAudio)).not.toContain("No spoken disclosure found");
    expect(timelineSummary({ ...noAudio, audio_checked: true })).toContain("No spoken disclosure found.");
  });
});
