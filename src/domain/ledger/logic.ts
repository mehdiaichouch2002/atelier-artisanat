// The ledger: one immutable list of money movements. Every report is derived from it.
//
// Effect of each entry type (amount is always positive; `direction` says in/out of the account):
//
// | type              | cash account | worker balance        | customer balance | expenses report |
// |-------------------|--------------|-----------------------|------------------|-----------------|
// | opening_balance   | ±            | –                     | –                | –               |
// | other_income      | +            | –                     | –                | –               |
// | customer_payment  | +            | –                     | − (owes less)    | –               |
// | customer_refund   | −            | –                     | + (owes more)    | –               |
// | worker_advance    | −            | − if "wage" advance   | –                | + if "business" |
// | worker_payment    | −            | −                     | –                | –               |
// | expense           | −            | –                     | –                | +               |
// | transfer          | ± (pair)     | –                     | –                | –  (net zero)   |
// | adjustment        | ±            | –                     | –                | –               |
//
// A reversal is an entry of the same type in the opposite direction, so it cancels the original in
// every column above. Wage advances and settlement payments are labour payments: they are never
// counted as expenses, which is what prevents an advance from being counted twice.
import type { Cents } from "@/lib/money";

export const ENTRY_TYPES = [
  "opening_balance",
  "other_income",
  "customer_payment",
  "customer_refund",
  "worker_advance",
  "worker_payment",
  "expense",
  "transfer",
  "adjustment",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
export type Direction = "in" | "out";

export const EXPENSE_CATEGORIES = [
  "materials",
  "copper_metal",
  "leather_soles",
  "thread_accessories",
  "rent",
  "utilities",
  "transport",
  "packaging",
  "equipment_repairs",
  "worker_reimbursements",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAY_METHODS = ["cash", "bank_transfer", "cheque", "card", "mobile", "other"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

/** Canonical direction of an original (non-reversal) entry; null = either. */
export const CANONICAL_DIRECTION: Readonly<Record<EntryType, Direction | null>> = {
  opening_balance: null,
  other_income: "in",
  customer_payment: "in",
  customer_refund: "out",
  worker_advance: "out",
  worker_payment: "out",
  expense: "out",
  transfer: null,
  adjustment: null,
};

export interface LedgerEntryLike {
  entryType: EntryType;
  direction: Direction;
  amountCents: Cents;
  advanceTreatment?: "wage" | "business" | null;
  expenseCategory?: ExpenseCategory | null;
}

/** Effect on the cash account: +amount for money in, −amount for money out. */
export function cashEffect(e: LedgerEntryLike): Cents {
  return e.direction === "in" ? e.amountCents : -e.amountCents;
}

/** Amount of the entry in its "natural" sense (an advance is positive, its reversal negative). */
export function naturalAmount(e: LedgerEntryLike): Cents {
  const canonical = CANONICAL_DIRECTION[e.entryType] ?? "in";
  return e.direction === canonical ? e.amountCents : -e.amountCents;
}

/** Reduction of what the workshop owes a worker. */
export function workerBalanceEffect(e: LedgerEntryLike): Cents {
  if (e.entryType === "worker_payment") return -naturalAmount(e);
  if (e.entryType === "worker_advance" && e.advanceTreatment === "wage") return -naturalAmount(e);
  return 0;
}

/** Change of what a customer owes. */
export function customerBalanceEffect(e: LedgerEntryLike): Cents {
  if (e.entryType === "customer_payment") return -naturalAmount(e);
  if (e.entryType === "customer_refund") return naturalAmount(e);
  return 0;
}

/** Amount counted in the expenses report (expenses + business advances, net of reversals). */
export function expenseAmount(e: LedgerEntryLike): Cents {
  if (e.entryType === "expense") return naturalAmount(e);
  if (e.entryType === "worker_advance" && e.advanceTreatment === "business") return naturalAmount(e);
  return 0;
}

export interface CashFlowSummary {
  inCents: Cents;
  outCents: Cents;
  netCents: Cents;
  byType: Record<EntryType, Cents>; // signed cash effect per type
}

/** Cash movement over a set of entries. Transfers cancel out when both accounts are included. */
export function cashFlow(entries: readonly LedgerEntryLike[], opts: { excludeTransfers?: boolean } = {}): CashFlowSummary {
  const byType = Object.fromEntries(ENTRY_TYPES.map((t) => [t, 0])) as Record<EntryType, Cents>;
  let inCents = 0;
  let outCents = 0;
  for (const e of entries) {
    if (opts.excludeTransfers && e.entryType === "transfer") continue;
    const c = cashEffect(e);
    byType[e.entryType] += c;
    if (c >= 0) inCents += c;
    else outCents -= c;
  }
  return { inCents, outCents, netCents: inCents - outCents, byType };
}

export function expensesByCategory(entries: readonly LedgerEntryLike[]): Map<ExpenseCategory, Cents> {
  const out = new Map<ExpenseCategory, Cents>();
  for (const e of entries) {
    const a = expenseAmount(e);
    if (a === 0 || !e.expenseCategory) continue;
    out.set(e.expenseCategory, (out.get(e.expenseCategory) ?? 0) + a);
  }
  return out;
}

/** Difference to record when a physical count does not match the calculated balance. */
export function reconciliationDifference(calculatedCents: Cents, countedCents: Cents) {
  const diff = countedCents - calculatedCents;
  return {
    differenceCents: diff,
    adjustment: diff === 0 ? null : { direction: (diff > 0 ? "in" : "out") as Direction, amountCents: Math.abs(diff) },
  };
}

/** Owner-only entry types (also enforced by Row Level Security). */
export const OWNER_ONLY_TYPES: readonly EntryType[] = ["opening_balance", "transfer", "adjustment", "customer_refund"];
