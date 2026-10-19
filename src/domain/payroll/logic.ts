// Weekly worker settlement rules (pure functions, no I/O).
//
//   amount due   = base pay + adjustments (bonus / correction) + carried amounts
//   remaining    = amount due − wage advances allocated to the week − settlement payments for the week
//
// * Each advance and each payment is allocated to exactly one pay week (its `pay_week` column),
//   so it can never be deducted twice.
// * "Business" advances (money handed to a worker to buy materials for the workshop) are tracked
//   but never reduce pay: they are workshop expenses.
// * Carrying a balance forward writes two opposite lines (carry_out in week W, carry_in in W+1),
//   so the worker's overall balance is unchanged and nothing is lost or duplicated.
import { assertCents, multiplyRate, type Cents } from "@/lib/money";

export type PayKind = "weekly" | "daily" | "piece" | "negotiated";

export interface WeekComponents {
  baseCents: Cents;
  hasBase: boolean;
  adjustmentsCents: Cents;
  carryCents: Cents;
  wageAdvancesCents: Cents;
  businessAdvancesCents: Cents;
  paymentsCents: Cents;
}

export type WeekStatus = "empty" | "pending" | "due" | "partial" | "settled" | "overpaid";

export interface WeekSummary extends WeekComponents {
  dueCents: Cents;
  deductionsCents: Cents;
  remainingCents: Cents;
  status: WeekStatus;
}

export const EMPTY_WEEK: WeekComponents = {
  baseCents: 0,
  hasBase: false,
  adjustmentsCents: 0,
  carryCents: 0,
  wageAdvancesCents: 0,
  businessAdvancesCents: 0,
  paymentsCents: 0,
};

export function summarizeWeek(c: WeekComponents): WeekSummary {
  for (const v of [c.baseCents, c.adjustmentsCents, c.carryCents, c.wageAdvancesCents, c.paymentsCents]) {
    assertCents(v);
  }
  const dueCents = c.baseCents + c.adjustmentsCents + c.carryCents;
  const deductionsCents = c.wageAdvancesCents + c.paymentsCents;
  const remainingCents = dueCents - deductionsCents;
  let status: WeekStatus;
  const anything = c.hasBase || c.adjustmentsCents !== 0 || c.carryCents !== 0 || deductionsCents !== 0;
  if (!anything) status = "empty";
  else if (!c.hasBase && c.carryCents === 0 && c.adjustmentsCents === 0) status = "pending";
  else if (remainingCents < 0) status = "overpaid";
  else if (remainingCents === 0) status = "settled";
  else if (deductionsCents > 0) status = "partial";
  else status = "due";
  return { ...c, dueCents, deductionsCents, remainingCents, status };
}

/**
 * Remaining amount when a base pay has not been recorded yet, using a proposed base pay.
 * Used to show the settlement screen before the owner confirms the agreed amount.
 */
export function summarizeWithProposal(c: WeekComponents, proposedBaseCents: Cents | null): WeekSummary {
  if (c.hasBase || proposedBaseCents == null) return summarizeWeek(c);
  return summarizeWeek({ ...c, baseCents: proposedBaseCents, hasBase: true });
}

export interface Arrangement {
  payKind: PayKind;
  weeklyAmountCents: Cents | null;
  dailyRateCents: Cents | null;
  pieceRateCents: Cents | null;
  defaultDays: string | number | null;
}

export interface BasePay {
  basis: PayKind;
  quantity: string | null;
  rateCents: Cents | null;
  amountCents: Cents;
}

/**
 * Computes the base pay for one week from the arrangement.
 * - weekly: the agreed weekly amount
 * - daily: days worked × daily rate (days default to the arrangement's usual days)
 * - piece: pieces made × piece rate
 * - negotiated: the amount agreed for that week (must be given)
 */
export function computeBasePay(
  a: Arrangement,
  input: { quantity?: string | number | null; amountCents?: Cents | null } = {},
): BasePay | null {
  switch (a.payKind) {
    case "weekly":
      if (a.weeklyAmountCents == null) return null;
      return { basis: "weekly", quantity: null, rateCents: null, amountCents: a.weeklyAmountCents };
    case "daily": {
      if (a.dailyRateCents == null) return null;
      const q = input.quantity ?? a.defaultDays;
      if (q == null || q === "") return null;
      const quantity = normalizeQuantity(q);
      return { basis: "daily", quantity, rateCents: a.dailyRateCents, amountCents: multiplyRate(a.dailyRateCents, quantity) };
    }
    case "piece": {
      if (a.pieceRateCents == null || input.quantity == null || input.quantity === "") return null;
      const quantity = normalizeQuantity(input.quantity);
      return { basis: "piece", quantity, rateCents: a.pieceRateCents, amountCents: multiplyRate(a.pieceRateCents, quantity) };
    }
    case "negotiated":
      if (input.amountCents == null) return null;
      return { basis: "negotiated", quantity: null, rateCents: null, amountCents: assertCents(input.amountCents) };
  }
}

/** "5,5" | 5.5 -> "5.50" (two decimals, as stored in NUMERIC(10,2)). */
export function normalizeQuantity(q: string | number): string {
  const s = String(q).trim().replace(",", ".");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) throw new RangeError(`Invalid quantity: ${q}`);
  const [i = "0", f = ""] = s.split(".");
  return `${Number(i)}.${f.padEnd(2, "0")}`;
}

export type PaymentCheck = { ok: true } | { ok: false; reason: "not_positive" | "exceeds_remaining" };

/** A settlement payment must be positive and may not exceed what is still owed for the week. */
export function checkSettlementPayment(amountCents: Cents, remainingCents: Cents): PaymentCheck {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false, reason: "not_positive" };
  if (amountCents > remainingCents) return { ok: false, reason: "exceeds_remaining" };
  return { ok: true };
}

export interface CarryLines {
  carryOutCents: Cents; // recorded in the closed week
  carryInCents: Cents; // recorded in the following week
}

/** Moves the remaining balance (positive or negative) of a week to the next one. */
export function carryForward(remainingCents: Cents): CarryLines | null {
  assertCents(remainingCents);
  if (remainingCents === 0) return null;
  return { carryOutCents: -remainingCents, carryInCents: remainingCents };
}

export interface WeeklyOverview {
  workers: number;
  totalDueCents: Cents;
  totalAdvancesCents: Cents;
  totalPaidCents: Cents;
  totalRemainingCents: Cents;
  settled: number;
  partial: number;
  withBalance: number;
  pending: number;
}

export function weeklyOverview(weeks: readonly WeekSummary[]): WeeklyOverview {
  const o: WeeklyOverview = {
    workers: weeks.length,
    totalDueCents: 0,
    totalAdvancesCents: 0,
    totalPaidCents: 0,
    totalRemainingCents: 0,
    settled: 0,
    partial: 0,
    withBalance: 0,
    pending: 0,
  };
  for (const w of weeks) {
    o.totalDueCents += w.dueCents;
    o.totalAdvancesCents += w.wageAdvancesCents;
    o.totalPaidCents += w.paymentsCents;
    o.totalRemainingCents += w.remainingCents;
    if (w.status === "settled") o.settled++;
    else if (w.status === "partial") o.partial++;
    else if (w.status === "due" || w.status === "overpaid") o.withBalance++;
    else if (w.status === "pending") o.pending++;
  }
  return o;
}

export const ADVANCE_CATEGORIES = ["daily", "food_transport", "materials", "other"] as const;
export type AdvanceCategory = (typeof ADVANCE_CATEGORIES)[number];
export type AdvanceTreatment = "wage" | "business";

/** Default handling of an advance category (the user can override it when recording). */
export function defaultTreatment(category: AdvanceCategory): AdvanceTreatment {
  return category === "materials" ? "business" : "wage";
}
