import { describe, expect, it } from "vitest";
import {
  carryForward,
  checkSettlementPayment,
  computeBasePay,
  defaultTreatment,
  EMPTY_WEEK,
  normalizeQuantity,
  summarizeWeek,
  summarizeWithProposal,
  weeklyOverview,
} from "@/domain/payroll/logic";

const weekly = { payKind: "weekly" as const, weeklyAmountCents: 150000, dailyRateCents: null, pieceRateCents: null, defaultDays: null };

describe("summarizeWeek", () => {
  it("remaining = due − wage advances − payments", () => {
    const s = summarizeWeek({ ...EMPTY_WEEK, baseCents: 150000, hasBase: true, wageAdvancesCents: 35000, paymentsCents: 50000 });
    expect(s).toMatchObject({ dueCents: 150000, deductionsCents: 85000, remainingCents: 65000, status: "partial" });
  });
  it("ignores business advances", () => {
    const s = summarizeWeek({ ...EMPTY_WEEK, baseCents: 1000, hasBase: true, businessAdvancesCents: 999999 });
    expect(s.remainingCents).toBe(1000);
    expect(s.status).toBe("due");
  });
  it("includes adjustments and carried amounts", () => {
    const s = summarizeWeek({ ...EMPTY_WEEK, baseCents: 1000, hasBase: true, adjustmentsCents: -200, carryCents: 500 });
    expect(s.dueCents).toBe(1300);
  });
  it("classifies statuses", () => {
    expect(summarizeWeek(EMPTY_WEEK).status).toBe("empty");
    expect(summarizeWeek({ ...EMPTY_WEEK, wageAdvancesCents: 100 }).status).toBe("pending");
    expect(summarizeWeek({ ...EMPTY_WEEK, baseCents: 100, hasBase: true, paymentsCents: 100 }).status).toBe("settled");
    expect(summarizeWeek({ ...EMPTY_WEEK, baseCents: 100, hasBase: true, wageAdvancesCents: 150 }).status).toBe("overpaid");
    expect(summarizeWeek({ ...EMPTY_WEEK, baseCents: 0, hasBase: true }).status).toBe("settled");
  });
  it("applies a proposal only when no base pay is recorded", () => {
    expect(summarizeWithProposal({ ...EMPTY_WEEK, wageAdvancesCents: 100 }, 1000).remainingCents).toBe(900);
    expect(summarizeWithProposal({ ...EMPTY_WEEK, baseCents: 500, hasBase: true }, 1000).remainingCents).toBe(500);
    expect(summarizeWithProposal({ ...EMPTY_WEEK, wageAdvancesCents: 100 }, null).status).toBe("pending");
  });
});

describe("computeBasePay", () => {
  it("handles each pay arrangement", () => {
    expect(computeBasePay(weekly)).toEqual({ basis: "weekly", quantity: null, rateCents: null, amountCents: 150000 });
    const daily = { ...weekly, payKind: "daily" as const, weeklyAmountCents: null, dailyRateCents: 12000, defaultDays: "6.0" };
    expect(computeBasePay(daily)!.amountCents).toBe(72000);
    expect(computeBasePay(daily, { quantity: "4,5" })).toMatchObject({ quantity: "4.50", amountCents: 54000 });
    const piece = { ...weekly, payKind: "piece" as const, weeklyAmountCents: null, pieceRateCents: 2550 };
    expect(computeBasePay(piece)).toBeNull();
    expect(computeBasePay(piece, { quantity: 40 })!.amountCents).toBe(102000);
    const nego = { ...weekly, payKind: "negotiated" as const, weeklyAmountCents: null };
    expect(computeBasePay(nego)).toBeNull();
    expect(computeBasePay(nego, { amountCents: 90000 })!.amountCents).toBe(90000);
  });
  it("normalises quantities", () => {
    expect(normalizeQuantity("5")).toBe("5.00");
    expect(normalizeQuantity("05,5")).toBe("5.50");
    expect(() => normalizeQuantity("-1")).toThrow();
  });
});

describe("payments, carry forward and overview", () => {
  it("checks settlement payments", () => {
    expect(checkSettlementPayment(100, 100)).toEqual({ ok: true });
    expect(checkSettlementPayment(101, 100)).toEqual({ ok: false, reason: "exceeds_remaining" });
    expect(checkSettlementPayment(0, 100)).toEqual({ ok: false, reason: "not_positive" });
    expect(checkSettlementPayment(1.5, 100)).toEqual({ ok: false, reason: "not_positive" });
  });
  it("carries positive and negative balances as an opposite pair", () => {
    expect(carryForward(500)).toEqual({ carryOutCents: -500, carryInCents: 500 });
    expect(carryForward(-300)).toEqual({ carryOutCents: 300, carryInCents: -300 });
    expect(carryForward(0)).toBeNull();
  });
  it("totals a week", () => {
    const weeks = [
      summarizeWeek({ ...EMPTY_WEEK, baseCents: 1000, hasBase: true, paymentsCents: 1000 }),
      summarizeWeek({ ...EMPTY_WEEK, baseCents: 1000, hasBase: true, wageAdvancesCents: 200 }),
      summarizeWeek({ ...EMPTY_WEEK, baseCents: 1000, hasBase: true }),
      summarizeWeek({ ...EMPTY_WEEK, wageAdvancesCents: 50 }),
    ];
    expect(weeklyOverview(weeks)).toEqual({
      workers: 4,
      totalDueCents: 3000,
      totalAdvancesCents: 250,
      totalPaidCents: 1000,
      totalRemainingCents: 1750,
      settled: 1,
      partial: 1,
      withBalance: 1,
      pending: 1,
    });
  });
  it("defaults material purchases to business advances", () => {
    expect(defaultTreatment("materials")).toBe("business");
    expect(defaultTreatment("daily")).toBe("wage");
  });
});
