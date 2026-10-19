import { describe, expect, it } from "vitest";
import {
  canTransition,
  checkCustomerPayment,
  isDueSoon,
  isOverdue,
  linesTotal,
  maxRefund,
  orderMoney,
  ORDER_STATUSES,
  TRANSITIONS,
} from "@/domain/orders/logic";
import {
  cashEffect,
  cashFlow,
  customerBalanceEffect,
  expenseAmount,
  expensesByCategory,
  naturalAmount,
  reconciliationDifference,
  workerBalanceEffect,
  type LedgerEntryLike,
} from "@/domain/ledger/logic";

const base = { status: "confirmed" as const, linesTotalCents: 100000, adjustmentsCents: 0, paidCents: 0, refundedCents: 0, cancellationFeeCents: 0 };

describe("orders", () => {
  it("totals lines with integer arithmetic", () => {
    expect(linesTotal([{ quantity: 3, unitPriceCents: 3333 }, { quantity: 1, unitPriceCents: 1 }])).toBe(10000);
    expect(() => linesTotal([{ quantity: 0, unitPriceCents: 100 }])).toThrow();
    expect(() => linesTotal([{ quantity: 1.5, unitPriceCents: 100 }])).toThrow();
  });
  it("computes balances and payment states (a deposit is not paid)", () => {
    expect(orderMoney(base)).toMatchObject({ dueCents: 100000, balanceCents: 100000, paymentState: "unpaid" });
    expect(orderMoney({ ...base, paidCents: 30000 })).toMatchObject({ balanceCents: 70000, paymentState: "deposit" });
    expect(orderMoney({ ...base, paidCents: 100000 }).paymentState).toBe("paid");
    expect(orderMoney({ ...base, adjustmentsCents: -10000, paidCents: 100000 })).toMatchObject({ balanceCents: -10000, paymentState: "credit" });
    expect(orderMoney({ ...base, paidCents: 100000, refundedCents: 10000 }).balanceCents).toBe(10000);
  });
  it("uses the cancellation fee as the amount due of a cancelled order", () => {
    const m = orderMoney({ ...base, status: "cancelled", paidCents: 30000, cancellationFeeCents: 10000 });
    expect(m).toMatchObject({ dueCents: 10000, balanceCents: -20000, paymentState: "credit" });
    expect(orderMoney({ ...base, status: "cancelled", paidCents: 30000, refundedCents: 30000 }).paymentState).toBe("unpaid");
  });
  it("validates payments and refunds", () => {
    expect(checkCustomerPayment(100, 100, "ready").ok).toBe(true);
    expect(checkCustomerPayment(101, 100, "ready")).toMatchObject({ ok: false, reason: "exceeds_balance" });
    expect(checkCustomerPayment(10, 100, "cancelled")).toMatchObject({ ok: false, reason: "cancelled" });
    expect(checkCustomerPayment(-1, 100, "ready")).toMatchObject({ ok: false, reason: "not_positive" });
    expect(maxRefund(1000, 400)).toBe(600);
    expect(maxRefund(1000, 1200)).toBe(0);
  });
  it("has a consistent transition table", () => {
    for (const s of ORDER_STATUSES) for (const t of TRANSITIONS[s]) expect(t).not.toBe(s);
    expect(canTransition("quote", "confirmed")).toBe(true);
    expect(canTransition("quote", "delivered")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(TRANSITIONS.cancelled).toHaveLength(0);
  });
  it("detects overdue and upcoming orders", () => {
    expect(isOverdue("in_production", "2026-10-10", "2026-10-11")).toBe(true);
    expect(isOverdue("delivered", "2026-10-10", "2026-10-11")).toBe(false);
    expect(isOverdue("ready", "2026-10-11", "2026-10-11")).toBe(false);
    expect(isOverdue("ready", null, "2026-10-11")).toBe(false);
    expect(isDueSoon("ready", "2026-10-12", "2026-10-11", "2026-10-18")).toBe(true);
  });
});

const e = (x: Partial<LedgerEntryLike> & Pick<LedgerEntryLike, "entryType" | "direction">): LedgerEntryLike => ({
  amountCents: 1000,
  ...x,
});

describe("ledger effects", () => {
  it("maps each entry type to the right balances", () => {
    const wageAdv = e({ entryType: "worker_advance", direction: "out", advanceTreatment: "wage" });
    const bizAdv = e({ entryType: "worker_advance", direction: "out", advanceTreatment: "business", expenseCategory: "materials" });
    const pay = e({ entryType: "worker_payment", direction: "out" });
    const exp = e({ entryType: "expense", direction: "out", expenseCategory: "rent" });
    const cust = e({ entryType: "customer_payment", direction: "in" });
    const refund = e({ entryType: "customer_refund", direction: "out" });
    expect([wageAdv, bizAdv, pay, exp, cust, refund].map(cashEffect)).toEqual([-1000, -1000, -1000, -1000, 1000, -1000]);
    expect([wageAdv, bizAdv, pay, exp].map(workerBalanceEffect)).toEqual([-1000, 0, -1000, 0]);
    expect([wageAdv, bizAdv, pay, exp].map(expenseAmount)).toEqual([0, 1000, 0, 1000]);
    expect([cust, refund].map(customerBalanceEffect)).toEqual([-1000, 1000]);
  });
  it("cancels originals with reversals in every view", () => {
    const orig = e({ entryType: "worker_advance", direction: "out", advanceTreatment: "wage" });
    const rev = e({ entryType: "worker_advance", direction: "in", advanceTreatment: "wage" });
    expect(naturalAmount(orig) + naturalAmount(rev)).toBe(0);
    expect(workerBalanceEffect(orig) + workerBalanceEffect(rev)).toBe(0);
    expect(cashFlow([orig, rev]).netCents).toBe(0);
    const x1 = e({ entryType: "expense", direction: "out", expenseCategory: "rent" });
    const x2 = e({ entryType: "expense", direction: "in", expenseCategory: "rent" });
    expect(expensesByCategory([x1, x2]).get("rent")).toBe(0);
  });
  it("treats transfers as neutral", () => {
    const out = e({ entryType: "transfer", direction: "out" });
    const inn = e({ entryType: "transfer", direction: "in" });
    expect(cashFlow([out, inn]).netCents).toBe(0);
    expect(cashFlow([out, inn], { excludeTransfers: true })).toMatchObject({ inCents: 0, outCents: 0 });
    expect(expenseAmount(out)).toBe(0);
  });
  it("computes reconciliation differences", () => {
    expect(reconciliationDifference(1000, 1000)).toEqual({ differenceCents: 0, adjustment: null });
    expect(reconciliationDifference(1000, 900)).toEqual({ differenceCents: -100, adjustment: { direction: "out", amountCents: 100 } });
    expect(reconciliationDifference(1000, 1250)).toEqual({ differenceCents: 250, adjustment: { direction: "in", amountCents: 250 } });
  });
});
