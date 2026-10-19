// Customer order rules (pure functions).
//
//   amount due      = Σ lines (quantity × unit price) + Σ documented adjustments
//                     (for a cancelled order: the cancellation fee the workshop keeps, default 0)
//   balance         = amount due − customer payments + refunds
//
// A deposit is just a payment: it never marks an order as paid. Payments and refunds are ledger
// entries, so cancelling an order keeps the full history.
import { assertCents, sumCents, type Cents } from "@/lib/money";

export const ORDER_STATUSES = [
  "quote",
  "confirmed",
  "on_hold",
  "in_production",
  "finishing",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

/** Allowed status changes. Mirrors atelier.order_transition_allowed() in the database. */
export const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  quote: ["confirmed", "cancelled"],
  confirmed: ["on_hold", "in_production", "cancelled"],
  on_hold: ["confirmed", "in_production", "cancelled"],
  in_production: ["on_hold", "finishing", "ready", "cancelled"],
  finishing: ["in_production", "ready", "cancelled"],
  ready: ["finishing", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses in which order lines (the negotiated price) may still be edited. */
export const EDITABLE_LINE_STATUSES: readonly OrderStatus[] = ["quote", "confirmed", "on_hold"];

export const OPEN_STATUSES: readonly OrderStatus[] = [
  "quote",
  "confirmed",
  "on_hold",
  "in_production",
  "finishing",
  "ready",
];

export interface OrderLineInput {
  quantity: number;
  unitPriceCents: Cents;
}

export function lineTotal(line: OrderLineInput): Cents {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new RangeError("Invalid quantity");
  assertCents(line.unitPriceCents);
  if (line.unitPriceCents < 0) throw new RangeError("Negative price");
  return assertCents(line.quantity * line.unitPriceCents);
}

export function linesTotal(lines: readonly OrderLineInput[]): Cents {
  return sumCents(lines.map(lineTotal));
}

export interface OrderMoneyInput {
  status: OrderStatus;
  linesTotalCents: Cents;
  adjustmentsCents: Cents;
  paidCents: Cents; // net customer payments (payments − reversed payments)
  refundedCents: Cents; // net refunds
  cancellationFeeCents: Cents;
}

export type PaymentState = "unpaid" | "deposit" | "paid" | "credit";

export interface OrderMoney {
  dueCents: Cents;
  paidCents: Cents;
  refundedCents: Cents;
  balanceCents: Cents;
  paymentState: PaymentState;
}

export function orderMoney(o: OrderMoneyInput): OrderMoney {
  const dueCents =
    o.status === "cancelled" ? assertCents(o.cancellationFeeCents) : sumCents([o.linesTotalCents, o.adjustmentsCents]);
  const balanceCents = dueCents - o.paidCents + o.refundedCents;
  const netReceived = o.paidCents - o.refundedCents;
  let paymentState: PaymentState;
  if (balanceCents < 0) paymentState = "credit";
  else if (balanceCents === 0 && (dueCents > 0 || netReceived > 0)) paymentState = "paid";
  else if (netReceived > 0) paymentState = "deposit";
  else paymentState = "unpaid";
  return { dueCents, paidCents: o.paidCents, refundedCents: o.refundedCents, balanceCents, paymentState };
}

/** A customer payment must be positive and may not exceed the outstanding balance. */
export function checkCustomerPayment(amountCents: Cents, balanceCents: Cents, status: OrderStatus) {
  if (status === "cancelled") return { ok: false as const, reason: "cancelled" as const };
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false as const, reason: "not_positive" as const };
  if (amountCents > balanceCents) return { ok: false as const, reason: "exceeds_balance" as const };
  return { ok: true as const };
}

/** Refunds cannot exceed what the customer has paid net of earlier refunds. */
export function maxRefund(paidCents: Cents, refundedCents: Cents): Cents {
  return Math.max(0, paidCents - refundedCents);
}

export function isOverdue(status: OrderStatus, dueDate: string | null, today: string): boolean {
  return dueDate != null && dueDate < today && OPEN_STATUSES.includes(status);
}

export function isDueSoon(status: OrderStatus, dueDate: string | null, today: string, limitDate: string): boolean {
  return dueDate != null && dueDate >= today && dueDate <= limitDate && OPEN_STATUSES.includes(status);
}
