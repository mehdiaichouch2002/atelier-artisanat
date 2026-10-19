import type { Tx } from "@/lib/db-types";
import { AppError } from "@/lib/errors";
import type { Cents } from "@/lib/money";
import { assertActiveAccount, findByIdempotencyKey, insertEntry, listEntries, type LedgerEntry } from "@/domain/ledger/service";
import type { PayMethod } from "@/domain/ledger/logic";
import {
  canTransition,
  checkCustomerPayment,
  EDITABLE_LINE_STATUSES,
  maxRefund,
  orderMoney,
  type OrderMoney,
  type OrderPriority,
  type OrderStatus,
} from "./logic";

export interface OrderSummary {
  id: string;
  reference: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  orderDate: string;
  dueDate: string | null;
  status: OrderStatus;
  priority: OrderPriority;
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
  firstLine: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  itemsCount: number;
  money: OrderMoney;
  statusChangedAt: Date;
  createdAt: Date;
}

type SummaryRow = Omit<OrderSummary, "money"> & {
  lines_total_cents: number;
  adjustments_cents: number;
  paid_cents: number;
  refunded_cents: number;
  cancellation_fee_cents: number;
};

function mapSummary(r: SummaryRow): OrderSummary {
  const { lines_total_cents, adjustments_cents, paid_cents, refunded_cents, cancellation_fee_cents, ...rest } = r;
  return {
    ...rest,
    money: orderMoney({
      status: r.status,
      linesTotalCents: lines_total_cents,
      adjustmentsCents: adjustments_cents,
      paidCents: paid_cents,
      refundedCents: refunded_cents,
      cancellationFeeCents: cancellation_fee_cents,
    }),
  };
}

const SELECT = (tx: Tx) => tx`
  select o.id, o.reference, o.customer_id as "customerId", c.name as "customerName", c.phone as "customerPhone",
         o.order_date as "orderDate", o.due_date as "dueDate", o.status, o.priority,
         o.assigned_worker_id as "assignedWorkerId", w.full_name as "assignedWorkerName",
         fl.description as "firstLine", cat.code as "categoryCode", cat.name as "categoryName",
         coalesce(lc.n, 0)::int as "itemsCount",
         b.lines_total_cents, b.adjustments_cents, b.paid_cents, b.refunded_cents, o.cancellation_fee_cents,
         o.status_changed_at as "statusChangedAt", o.created_at as "createdAt"
  from atelier.orders o
  join atelier.customers c on c.id = o.customer_id
  join atelier.v_order_balances b on b.order_id = o.id
  left join atelier.workers w on w.id = o.assigned_worker_id
  left join lateral (
    select description, category_id from atelier.order_lines where order_id = o.id order by position, created_at limit 1
  ) fl on true
  left join atelier.categories cat on cat.id = fl.category_id
  left join lateral (select sum(quantity) as n from atelier.order_lines where order_id = o.id) lc on true
`;

export interface OrderFilters {
  search?: string;
  statuses?: OrderStatus[];
  customerId?: string;
  categoryId?: string;
  workerId?: string;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  orderFrom?: string;
  orderTo?: string;
  withBalance?: boolean;
  today?: string;
}

function where(tx: Tx, f: OrderFilters) {
  const like = f.search ? `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return tx`
    where true
    ${f.statuses && f.statuses.length ? tx`and o.status in ${tx(f.statuses)}` : tx``}
    ${f.customerId ? tx`and o.customer_id = ${f.customerId}` : tx``}
    ${f.workerId ? tx`and o.assigned_worker_id = ${f.workerId}` : tx``}
    ${f.categoryId ? tx`and exists (select 1 from atelier.order_lines l where l.order_id = o.id and l.category_id = ${f.categoryId})` : tx``}
    ${f.overdue && f.today ? tx`and o.due_date < ${f.today} and o.status not in ('delivered', 'cancelled')` : tx``}
    ${f.dueFrom ? tx`and o.due_date >= ${f.dueFrom}` : tx``}
    ${f.dueTo ? tx`and o.due_date <= ${f.dueTo}` : tx``}
    ${f.orderFrom ? tx`and o.order_date >= ${f.orderFrom}` : tx``}
    ${f.orderTo ? tx`and o.order_date <= ${f.orderTo}` : tx``}
    ${f.withBalance ? tx`and b.balance_cents <> 0` : tx``}
    ${
      like
        ? tx`and (o.reference ilike ${like} or c.name ilike ${like} or c.phone ilike ${like}
              or exists (select 1 from atelier.order_lines l where l.order_id = o.id and l.description ilike ${like}))`
        : tx``
    }`;
}

export type OrderSort = "due" | "recent" | "reference" | "balance";

export async function listOrders(
  tx: Tx,
  f: OrderFilters,
  opts: { sort?: OrderSort; limit?: number; offset?: number } = {},
): Promise<{ rows: OrderSummary[]; total: number }> {
  const w = where(tx, f);
  const order =
    opts.sort === "recent"
      ? tx`o.created_at desc`
      : opts.sort === "reference"
        ? tx`o.reference desc`
        : opts.sort === "balance"
          ? tx`b.balance_cents desc, o.due_date nulls last`
          : tx`o.due_date nulls last, o.created_at`;
  const rows = await tx<SummaryRow[]>`${SELECT(tx)} ${w} order by ${order} limit ${opts.limit ?? 25} offset ${opts.offset ?? 0}`;
  const [c] = await tx<{ n: number }[]>`
    select count(*)::int as n from atelier.orders o
    join atelier.customers c on c.id = o.customer_id
    join atelier.v_order_balances b on b.order_id = o.id ${w}`;
  return { rows: rows.map(mapSummary), total: c?.n ?? 0 };
}

export interface OrderLine {
  id: string;
  position: number;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  description: string;
  quantity: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
}

export interface OrderAdjustment {
  id: string;
  amountCents: Cents;
  reason: string;
  createdAt: Date;
  createdByName: string | null;
}

export interface StatusChange {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedAt: Date;
  changedByName: string | null;
}

export interface OrderDetail extends OrderSummary {
  notes: string | null;
  cancellationFeeCents: Cents;
  lines: OrderLine[];
  adjustments: OrderAdjustment[];
  payments: LedgerEntry[];
  history: StatusChange[];
  attachments: { id: string; filename: string; mimeType: string; sizeBytes: number; createdAt: Date }[];
}

export async function getOrder(tx: Tx, id: string): Promise<OrderDetail | null> {
  const rows = await tx<SummaryRow[]>`${SELECT(tx)} where o.id = ${id}`;
  if (!rows[0]) return null;
  const summary = mapSummary(rows[0]);
  const [extra] = await tx<{ notes: string | null; cancellation_fee_cents: number }[]>`
    select notes, cancellation_fee_cents from atelier.orders where id = ${id}`;
  const lines = await tx<OrderLine[]>`
    select l.id, l.position, l.category_id as "categoryId", c.code as "categoryCode", c.name as "categoryName",
           l.description, l.quantity, l.unit_price_cents as "unitPriceCents", l.line_total_cents as "lineTotalCents"
    from atelier.order_lines l left join atelier.categories c on c.id = l.category_id
    where l.order_id = ${id} order by l.position, l.created_at`;
  const adjustments = await tx<OrderAdjustment[]>`
    select a.id, a.amount_cents as "amountCents", a.reason, a.created_at as "createdAt", u.display_name as "createdByName"
    from atelier.order_adjustments a left join atelier.users u on u.id = a.created_by
    where a.order_id = ${id} order by a.created_at`;
  const history = await tx<StatusChange[]>`
    select h.from_status as "fromStatus", h.to_status as "toStatus", h.changed_at as "changedAt",
           u.display_name as "changedByName"
    from atelier.order_status_history h left join atelier.users u on u.id = h.changed_by
    where h.order_id = ${id} order by h.changed_at, h.id`;
  const attachments = await tx<OrderDetail["attachments"]>`
    select id, filename, mime_type as "mimeType", size_bytes as "sizeBytes", created_at as "createdAt"
    from atelier.attachments where order_id = ${id} order by created_at`;
  const payments = (
    await listEntries(tx, { orderId: id, types: ["customer_payment", "customer_refund"] }, { limit: 500, offset: 0 })
  ).rows;
  return {
    ...summary,
    notes: extra?.notes ?? null,
    cancellationFeeCents: extra?.cancellation_fee_cents ?? 0,
    lines,
    adjustments,
    payments,
    history,
    attachments,
  };
}

export interface OrderLineInput {
  categoryId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: Cents;
}

export interface OrderInput {
  customerId: string;
  orderDate: string;
  dueDate: string | null;
  priority: OrderPriority;
  assignedWorkerId: string | null;
  notes: string | null;
  lines: OrderLineInput[];
}

async function insertLines(tx: Tx, orderId: string, lines: OrderLineInput[]) {
  for (const [i, l] of lines.entries()) {
    await tx`
      insert into atelier.order_lines (order_id, position, category_id, description, quantity, unit_price_cents)
      values (${orderId}, ${i}, ${l.categoryId}, ${l.description}, ${l.quantity}, ${l.unitPriceCents})`;
  }
}

export async function createOrder(
  tx: Tx,
  input: OrderInput & { status: "quote" | "confirmed" },
  idempotencyKey?: string | null,
): Promise<string> {
  if (idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`select id from atelier.orders where idempotency_key = ${idempotencyKey}`;
    if (prior) return prior.id;
  }
  if (input.lines.length === 0) throw new AppError("invalid", "no_lines");
  const [ref] = await tx<{ ref: string }[]>`select atelier.next_reference('CMD') as ref`;
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.orders (reference, customer_id, order_date, due_date, status, priority, assigned_worker_id,
      notes, idempotency_key)
    values (${ref!.ref}, ${input.customerId}, ${input.orderDate}, ${input.dueDate}, ${input.status}, ${input.priority},
      ${input.assignedWorkerId}, ${input.notes}, ${idempotencyKey ?? null})
    returning id`;
  await insertLines(tx, r!.id, input.lines);
  return r!.id;
}

/** Updates details. Lines are replaced only while the price is still negotiable. */
export async function updateOrder(tx: Tx, id: string, input: OrderInput): Promise<void> {
  const [o] = await tx<{ status: OrderStatus }[]>`select status from atelier.orders where id = ${id} for update`;
  if (!o) throw new AppError("not_found");
  if (o.status === "delivered" || o.status === "cancelled") throw new AppError("invalid", "order_closed");
  await tx`
    update atelier.orders set customer_id = ${input.customerId}, order_date = ${input.orderDate},
      due_date = ${input.dueDate}, priority = ${input.priority}, assigned_worker_id = ${input.assignedWorkerId},
      notes = ${input.notes}
    where id = ${id}`;
  if (EDITABLE_LINE_STATUSES.includes(o.status)) {
    if (input.lines.length === 0) throw new AppError("invalid", "no_lines");
    await tx`delete from atelier.order_lines where order_id = ${id}`;
    await insertLines(tx, id, input.lines);
  }
}

export async function changeStatus(
  tx: Tx,
  input: { orderId: string; to: OrderStatus; cancellationFeeCents?: Cents | null },
): Promise<void> {
  const [o] = await tx<{ status: OrderStatus }[]>`select status from atelier.orders where id = ${input.orderId} for update`;
  if (!o) throw new AppError("not_found");
  if (o.status === input.to) return; // idempotent: repeated clicks do nothing
  if (!canTransition(o.status, input.to)) throw new AppError("invalid", "transition");
  const fee = input.to === "cancelled" ? (input.cancellationFeeCents ?? 0) : 0;
  if (fee < 0) throw new AppError("invalid", "fee");
  await tx`update atelier.orders set status = ${input.to}, cancellation_fee_cents = ${fee} where id = ${input.orderId}`;
}

export async function addOrderAdjustment(
  tx: Tx,
  input: { orderId: string; amountCents: Cents; reason: string; idempotencyKey?: string | null },
): Promise<void> {
  if (input.idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`
      select id from atelier.order_adjustments where idempotency_key = ${input.idempotencyKey}`;
    if (prior) return;
  }
  const [o] = await tx<{ status: OrderStatus }[]>`select status from atelier.orders where id = ${input.orderId} for update`;
  if (!o) throw new AppError("not_found");
  if (o.status === "cancelled") throw new AppError("invalid", "order_closed");
  if (input.amountCents === 0) throw new AppError("invalid", "zero_amount");
  const money = await orderBalance(tx, input.orderId);
  if (money.dueCents + input.amountCents < 0) throw new AppError("invalid", "negative_total");
  await tx`
    insert into atelier.order_adjustments (order_id, amount_cents, reason, idempotency_key)
    values (${input.orderId}, ${input.amountCents}, ${input.reason}, ${input.idempotencyKey ?? null})`;
}

export async function orderBalance(tx: Tx, orderId: string): Promise<OrderMoney & { status: OrderStatus; customerId: string }> {
  const [b] = await tx<
    {
      status: OrderStatus;
      customer_id: string;
      lines_total_cents: number;
      adjustments_cents: number;
      paid_cents: number;
      refunded_cents: number;
      cancellation_fee_cents: number;
    }[]
  >`
    select b.status, b.customer_id, b.lines_total_cents, b.adjustments_cents, b.paid_cents, b.refunded_cents,
           o.cancellation_fee_cents
    from atelier.v_order_balances b join atelier.orders o on o.id = b.order_id where b.order_id = ${orderId}`;
  if (!b) throw new AppError("not_found");
  return {
    status: b.status,
    customerId: b.customer_id,
    ...orderMoney({
      status: b.status,
      linesTotalCents: b.lines_total_cents,
      adjustmentsCents: b.adjustments_cents,
      paidCents: b.paid_cents,
      refundedCents: b.refunded_cents,
      cancellationFeeCents: b.cancellation_fee_cents,
    }),
  };
}

/** Records a customer payment (deposit or later payment). The order row is locked during the check. */
export async function recordCustomerPayment(
  tx: Tx,
  input: {
    orderId: string;
    amountCents: Cents;
    occurredAt: Date;
    accountId: string;
    method: PayMethod;
    note?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry> {
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return prior;
  await tx`select id from atelier.orders where id = ${input.orderId} for update`;
  await assertActiveAccount(tx, input.accountId);
  const b = await orderBalance(tx, input.orderId);
  const check = checkCustomerPayment(input.amountCents, b.balanceCents, b.status);
  if (!check.ok) throw new AppError(check.reason === "exceeds_balance" ? "overpayment" : "invalid", check.reason);
  const { entry } = await insertEntry(tx, {
    entryType: "customer_payment",
    direction: "in",
    amountCents: input.amountCents,
    accountId: input.accountId,
    method: input.method,
    occurredAt: input.occurredAt,
    description: input.note ?? null,
    customerId: b.customerId,
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
  });
  return entry;
}

/** Refund to a customer (owner only via RLS). Cannot exceed what was paid. */
export async function recordRefund(
  tx: Tx,
  input: {
    orderId: string;
    amountCents: Cents;
    occurredAt: Date;
    accountId: string;
    method: PayMethod;
    note: string;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry> {
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return prior;
  await tx`select id from atelier.orders where id = ${input.orderId} for update`;
  await assertActiveAccount(tx, input.accountId);
  const b = await orderBalance(tx, input.orderId);
  if (input.amountCents <= 0) throw new AppError("invalid", "not_positive");
  if (input.amountCents > maxRefund(b.paidCents, b.refundedCents)) throw new AppError("overpayment", "refund_exceeds_paid");
  const { entry } = await insertEntry(tx, {
    entryType: "customer_refund",
    direction: "out",
    amountCents: input.amountCents,
    accountId: input.accountId,
    method: input.method,
    occurredAt: input.occurredAt,
    description: input.note,
    customerId: b.customerId,
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
  });
  return entry;
}

export async function orderOptions(tx: Tx, opts: { openOnly?: boolean } = {}) {
  return tx<{ id: string; label: string }[]>`
    select o.id, o.reference || ' — ' || c.name as label
    from atelier.orders o join atelier.customers c on c.id = o.customer_id
    ${opts.openOnly ? tx`where o.status not in ('delivered', 'cancelled')` : tx``}
    order by o.created_at desc limit 300`;
}
