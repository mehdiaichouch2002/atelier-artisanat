import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, multiplyRate, parseMoney, sumCents, assertCents } from "@/lib/money";

const nb = (s: string) => s.replace(/ /g, " ");

describe("parseMoney", () => {
  it.each([
    ["1250", 125000],
    ["1 250,50", 125050],
    ["1250.5", 125050],
    ["1.250,50", 125050],
    ["1,250.50", 125050],
    ["1.250", 125000],
    ["0,05", 5],
    ["12 345 678,90 DH", 1234567890],
    ["-15", -1500],
    ["250 MAD", 25000],
  ])("parses %s", (input, cents) => expect(parseMoney(input)).toBe(cents));

  it.each(["", "abc", "12,345,6", "1,2,3", "1e5", "--5", "99999999999999"])("rejects %s", (input) =>
    expect(parseMoney(input)).toBeNull(),
  );

  it("avoids floating point errors", () => {
    expect(parseMoney("0,1")! + parseMoney("0,2")!).toBe(30);
    expect(parseMoney("19,99")).toBe(1999);
  });
});

describe("formatMoney", () => {
  it("uses the Moroccan format with Latin digits", () => {
    expect(nb(formatMoney(125000))).toBe("1 250,00 DH");
    expect(nb(formatMoney(0))).toBe("0,00 DH");
    expect(nb(formatMoney(-5))).toBe("-0,05 DH");
    expect(nb(formatMoney(123456789012))).toBe("1 234 567 890,12 DH");
    expect(nb(formatMoney(100, { currency: false }))).toBe("1,00");
    expect(nb(formatMoney(100, { signed: true }))).toBe("+1,00 DH");
  });
  it("round-trips through the input format", () => {
    for (const c of [0, 5, 99, 100, 125050, -125050, 99999999]) expect(parseMoney(centsToInput(c))).toBe(c);
  });
  it("refuses non-integer amounts", () => {
    expect(() => formatMoney(1.5)).toThrow();
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 2)).toThrow();
    expect(sumCents([1, 2, 3])).toBe(6);
  });
});

describe("multiplyRate", () => {
  it("multiplies with half-up rounding", () => {
    expect(multiplyRate(12000, "5.5")).toBe(66000);
    expect(multiplyRate(333, "1.5")).toBe(500); // 499.5 -> 500
    expect(multiplyRate(333, "0,25")).toBe(83); // 83.25 -> 83
    expect(multiplyRate(2550, 40)).toBe(102000);
    expect(() => multiplyRate(100, "1.234")).toThrow();
    expect(() => multiplyRate(100, "-1")).toThrow();
  });
});
