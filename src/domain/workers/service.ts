import type { Tx } from "@/lib/db-types";
import { AppError } from "@/lib/errors";
import type { Cents } from "@/lib/money";
import type { PayKind } from "@/domain/payroll/logic";

export interface Worker {
  id: string;
  code: string | null;
  fullName: string;
  phone: string | null;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  startDate: string;
  active: boolean;
  notes: string | null;
  payKind: PayKind;
  weeklyAmountCents: Cents | null;
  dailyRateCents: Cents | null;
  pieceRateCents: Cents | null;
  defaultDays: string | null;
  balanceCents: Cents;
  pendingAdvancesCents: Cents;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkerInput {
  code: string | null;
  fullName: string;
  phone: string | null;
  categoryId: string | null;
  startDate: string;
  notes: string | null;
  payKind: PayKind;
  weeklyAmountCents: Cents | null;
  dailyRateCents: Cents | null;
  pieceRateCents: Cents | null;
  defaultDays: string | null;
}

const SELECT = (tx: Tx) => tx`
  select w.id, w.code, w.full_name as "fullName", w.phone, w.category_id as "categoryId",
         c.code as "categoryCode", c.name as "categoryName", w.start_date as "startDate", w.active, w.notes,
         w.pay_kind as "payKind", w.weekly_amount_cents as "weeklyAmountCents",
         w.daily_rate_cents as "dailyRateCents", w.piece_rate_cents as "pieceRateCents",
         w.default_days::text as "defaultDays", coalesce(b.balance_cents, 0)::bigint as "balanceCents",
         coalesce(b.pending_advances_cents, 0)::bigint as "pendingAdvancesCents",
         w.created_at as "createdAt", w.updated_at as "updatedAt"
  from atelier.workers w
  left join atelier.categories c on c.id = w.category_id
  left join atelier.v_worker_balances b on b.worker_id = w.id
`;

export type WorkerSort = "name" | "code" | "start" | "balance";

export async function listWorkers(
  tx: Tx,
  opts: {
    search?: string;
    status?: "active" | "inactive" | "all";
    categoryId?: string;
    sort?: WorkerSort;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: Worker[]; total: number }> {
  const like = opts.search ? `%${opts.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const status = opts.status ?? "active";
  const where = tx`
    where true
    ${status === "active" ? tx`and w.active` : status === "inactive" ? tx`and not w.active` : tx``}
    ${opts.categoryId ? tx`and w.category_id = ${opts.categoryId}` : tx``}
    ${like ? tx`and (w.full_name ilike ${like} or w.code ilike ${like} or w.phone ilike ${like})` : tx``}`;
  const order =
    opts.sort === "code"
      ? tx`w.code nulls last, lower(w.full_name)`
      : opts.sort === "start"
        ? tx`w.start_date desc, lower(w.full_name)`
        : opts.sort === "balance"
          ? tx`coalesce(b.balance_cents, 0) desc, lower(w.full_name)`
          : tx`lower(w.full_name)`;
  const rows = await tx<Worker[]>`
    ${SELECT(tx)} ${where} order by ${order} limit ${opts.limit ?? 25} offset ${opts.offset ?? 0}`;
  const [c] = await tx<{ n: number }[]>`select count(*)::int as n from atelier.workers w ${where}`;
  return { rows, total: c?.n ?? 0 };
}

export async function getWorker(tx: Tx, id: string): Promise<Worker | null> {
  const rows = await tx<Worker[]>`${SELECT(tx)} where w.id = ${id}`;
  return rows[0] ?? null;
}

export async function activeWorkerOptions(tx: Tx): Promise<{ id: string; label: string; code: string | null }[]> {
  return tx<{ id: string; label: string; code: string | null }[]>`
    select id, full_name as label, code from atelier.workers where active order by lower(full_name)`;
}

export async function createWorker(tx: Tx, input: WorkerInput, idempotencyKey?: string | null): Promise<string> {
  if (idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`select id from atelier.workers where idempotency_key = ${idempotencyKey}`;
    if (prior) return prior.id;
  }
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.workers (code, full_name, phone, category_id, start_date, notes, pay_kind,
      weekly_amount_cents, daily_rate_cents, piece_rate_cents, default_days, idempotency_key)
    values (${input.code}, ${input.fullName}, ${input.phone}, ${input.categoryId}, ${input.startDate}, ${input.notes},
      ${input.payKind}, ${input.weeklyAmountCents}, ${input.dailyRateCents}, ${input.pieceRateCents},
      ${input.defaultDays}, ${idempotencyKey ?? null})
    returning id`;
  return r!.id;
}

export async function updateWorker(tx: Tx, id: string, input: WorkerInput): Promise<void> {
  const r = await tx`
    update atelier.workers set code = ${input.code}, full_name = ${input.fullName}, phone = ${input.phone},
      category_id = ${input.categoryId}, start_date = ${input.startDate}, notes = ${input.notes},
      pay_kind = ${input.payKind}, weekly_amount_cents = ${input.weeklyAmountCents},
      daily_rate_cents = ${input.dailyRateCents}, piece_rate_cents = ${input.pieceRateCents},
      default_days = ${input.defaultDays}
    where id = ${id}`;
  if (r.count === 0) throw new AppError("not_found");
}

/** Deactivation keeps every record; the worker simply disappears from day-to-day lists. */
export async function setWorkerActive(tx: Tx, id: string, active: boolean): Promise<void> {
  const r = await tx`update atelier.workers set active = ${active} where id = ${id}`;
  if (r.count === 0) throw new AppError("not_found");
}

export interface ArrangementHistory {
  payKind: PayKind;
  weeklyAmountCents: Cents | null;
  dailyRateCents: Cents | null;
  pieceRateCents: Cents | null;
  defaultDays: string | null;
  effectiveAt: Date;
  changedByName: string | null;
}

export async function arrangementHistory(tx: Tx, workerId: string): Promise<ArrangementHistory[]> {
  return tx<ArrangementHistory[]>`
    select a.pay_kind as "payKind", a.weekly_amount_cents as "weeklyAmountCents",
           a.daily_rate_cents as "dailyRateCents", a.piece_rate_cents as "pieceRateCents",
           a.default_days::text as "defaultDays", a.effective_at as "effectiveAt", u.display_name as "changedByName"
    from atelier.worker_arrangements a left join atelier.users u on u.id = a.changed_by
    where a.worker_id = ${workerId} order by a.effective_at desc`;
}
