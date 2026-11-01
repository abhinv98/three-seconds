import { describe, expect, it } from "vitest";
import { formatCountdown, istClock, shiftRemaining, untilNextShift, untilSix, whereIsTickle } from "./ist";

// Instants written as IST wall times: UTC is 5 h 30 m earlier.
const ist = (iso: string) => Date.parse(`${iso}+05:30`);

describe("Mr Tickle's shift", () => {
  it("is at work on a weekday between 09:00 and 18:00 IST", () => {
    expect(shiftRemaining(ist("2026-11-02T10:00:00"))).toBe(8 * 3600_000); // Monday
    expect(shiftRemaining(ist("2026-11-06T17:59:30"))).toBe(30_000); // Friday
    expect(shiftRemaining(ist("2026-11-03T09:00:00"))).toBe(9 * 3600_000);
  });
  it("is home before nine, from six, and at weekends", () => {
    expect(shiftRemaining(ist("2026-11-02T08:59:59"))).toBeNull();
    expect(shiftRemaining(ist("2026-11-02T18:00:00"))).toBeNull();
    expect(shiftRemaining(ist("2026-11-07T11:00:00"))).toBeNull(); // Saturday
    expect(shiftRemaining(ist("2026-11-01T11:00:00"))).toBeNull(); // Sunday
  });
  it("uses India's date, not UTC's, near midnight", () => {
    // 01:00 IST on Monday is still Sunday in UTC; he is home either way, and 09:30 IST Monday is a workday.
    expect(shiftRemaining(ist("2026-11-02T01:00:00"))).toBeNull();
    expect(shiftRemaining(ist("2026-11-02T09:30:00"))).toBe(8.5 * 3600_000);
  });
  it("knows when he is back", () => {
    expect(untilNextShift(ist("2026-11-02T08:00:00"))).toBe(3600_000); // Monday morning
    expect(untilNextShift(ist("2026-11-02T18:30:00"))).toBe(14.5 * 3600_000); // Monday evening
    expect(untilNextShift(ist("2026-11-06T18:30:00"))).toBe(62.5 * 3600_000); // Friday evening, back Monday
  });
  it("formats the countdown and the clock", () => {
    expect(formatCountdown(7 * 3600_000 + 61_500)).toBe("07:01:02");
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(istClock(ist("2026-11-02T18:42:10"))).toBe("18:42");
  });
  it("counts down to six and says where he is", () => {
    expect(untilSix(ist("2026-11-02T17:59:30"))).toBe(30_000);
    expect(untilSix(ist("2026-11-02T18:00:00"))).toBe(24 * 3600_000);
    expect(whereIsTickle(ist("2026-11-02T10:00:00"))).toBe("work");
    expect(whereIsTickle(ist("2026-11-02T19:00:00"))).toBe("home");
    expect(whereIsTickle(ist("2026-11-02T10:00:00"), "?tickle=home")).toBe("home");
    expect(whereIsTickle(ist("2026-11-01T10:00:00"), "?x=1&tickle=work")).toBe("work");
    expect(whereIsTickle(ist("2026-11-02T10:00:00"), "?tickle=homer")).toBe("work");
  });
});

