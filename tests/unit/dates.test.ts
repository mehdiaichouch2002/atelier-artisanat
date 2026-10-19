import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDate,
  formatDateTime,
  isIsoDate,
  localDateTimeToInstant,
  periodBounds,
  resolvePeriod,
  toLocalDate,
  weekStart,
} from "@/lib/dates";

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });

  it("computes pay week starts for any configured start day", () => {
    expect(weekStart("2026-10-19", 1)).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-18", 1)).toBe("2026-10-12"); // Sunday -> previous Monday
    expect(weekStart("2026-10-18", 6)).toBe("2026-10-17"); // Saturday-start week
    expect(weekStart("2026-10-16", 6)).toBe("2026-10-10");
    expect(weekStart("2027-01-01", 1)).toBe("2026-12-28"); // across year boundary
  });

  it("converts Casablanca wall-clock time to instants and back", () => {
    const i = localDateTimeToInstant("2026-10-18T23:30");
    expect(toLocalDate(i)).toBe("2026-10-18");
    expect(formatDateTime(i)).toBe("18/10/2026 23:30");
    // Late-evening UTC instant already belongs to the next local day when Morocco is UTC+1.
    expect(toLocalDate(new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-19");
  });

  it("formats dates as dd/mm/yyyy", () => {
    expect(formatDate("2026-03-05")).toBe("05/03/2026");
    expect(formatDate(null)).toBe("");
  });

  it("resolves periods", () => {
    expect(resolvePeriod("today", undefined, undefined, 1, "2026-10-21")).toEqual({ key: "today", from: "2026-10-21", to: "2026-10-21" });
    expect(resolvePeriod(undefined, undefined, undefined, 1, "2026-10-21")).toEqual({ key: "week", from: "2026-10-19", to: "2026-10-25" });
    expect(resolvePeriod("month", undefined, undefined, 1, "2026-02-14")).toEqual({ key: "month", from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod("month", undefined, undefined, 1, "2028-02-14").to).toBe("2028-02-29");
    expect(resolvePeriod("custom", "2026-10-01", "2026-10-05", 1, "2026-10-21").key).toBe("custom");
    expect(resolvePeriod("custom", "2026-10-05", "2026-10-01", 1, "2026-10-21").key).toBe("week"); // invalid range
    const b = periodBounds({ from: "2026-10-19", to: "2026-10-19" });
    expect(b.end.getTime() - b.start.getTime()).toBe(86_400_000);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
