import type { Tx } from "@/lib/db-types";
import { AppError } from "@/lib/errors";
import type { Cents } from "@/lib/money";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  ordersCount: number;
  dueCents: Cents;
  paidCents: Cents;
  refundedCents: Cents;
  balanceCents: Cents;
  createdAt: Date;
}

export interface CustomerInput {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

const SELECT = (tx: Tx) => tx`
  select c.id, c.name, c.phone, c.email, c.address, c.notes, c.active, b.orders_count as "ordersCount",
         b.due_cents as "dueCents", b.paid_cents as "paidCents", b.refunded_cents as "refundedCents",
         b.balance_cents as "balanceCents", c.created_at as "createdAt"
  from atelier.customers c join atelier.v_customer_balances b on b.customer_id = c.id
`;

export async function listCustomers(
  tx: Tx,
  opts: {
    search?: string;
    status?: "active" | "inactive" | "all";
    withBalance?: boolean;
    sort?: "name" | "balance" | "recent";
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: Customer[]; total: number }> {
  const like = opts.search ? `%${opts.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const status = opts.status ?? "active";
  const where = tx`
    where true
    ${status === "active" ? tx`and c.active` : status === "inactive" ? tx`and not c.active` : tx``}
    ${opts.withBalance ? tx`and b.balance_cents <> 0` : tx``}
    ${like ? tx`and (c.name ilike ${like} or c.phone ilike ${like} or c.email ilike ${like})` : tx``}`;
  const order =
    opts.sort === "balance"
      ? tx`b.balance_cents desc, lower(c.name)`
      : opts.sort === "recent"
        ? tx`c.created_at desc`
        : tx`lower(c.name)`;
  const rows = await tx<Customer[]>`
    ${SELECT(tx)} ${where} order by ${order} limit ${opts.limit ?? 25} offset ${opts.offset ?? 0}`;
  const [c] = await tx<{ n: number }[]>`
    select count(*)::int as n from atelier.customers c join atelier.v_customer_balances b on b.customer_id = c.id
    ${where}`;
  return { rows, total: c?.n ?? 0 };
}

export async function getCustomer(tx: Tx, id: string): Promise<Customer | null> {
  const rows = await tx<Customer[]>`${SELECT(tx)} where c.id = ${id}`;
  return rows[0] ?? null;
}

export async function customerOptions(tx: Tx): Promise<{ id: string; label: string; phone: string | null }[]> {
  return tx<{ id: string; label: string; phone: string | null }[]>`
    select id, name as label, phone from atelier.customers where active order by lower(name)`;
}

/** Digits only, without the Moroccan country prefix, for duplicate detection. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00212")) d = `0${d.slice(5)}`;
  else if (d.startsWith("212")) d = `0${d.slice(3)}`;
  return d.length >= 6 ? d : null;
}

/** Existing customers that look like the same person (same phone or same name). */
export async function findSimilarCustomers(
  tx: Tx,
  input: { name: string; phone: string | null },
  excludeId?: string,
): Promise<{ id: string; name: string; phone: string | null }[]> {
  const phone = normalizePhone(input.phone);
  const rows = await tx<{ id: string; name: string; phone: string | null }[]>`
    select id, name, phone from atelier.customers
    where (lower(trim(name)) = lower(trim(${input.name}))
       ${phone ? tx`or regexp_replace(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '^(00)?212', '0') = ${phone}` : tx``})
    ${excludeId ? tx`and id <> ${excludeId}` : tx``}
    limit 5`;
  return rows;
}

export async function createCustomer(tx: Tx, input: CustomerInput, idempotencyKey?: string | null): Promise<string> {
  if (idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`select id from atelier.customers where idempotency_key = ${idempotencyKey}`;
    if (prior) return prior.id;
  }
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.customers (name, phone, email, address, notes, idempotency_key)
    values (${input.name}, ${input.phone}, ${input.email}, ${input.address}, ${input.notes}, ${idempotencyKey ?? null})
    returning id`;
  return r!.id;
}

export async function updateCustomer(tx: Tx, id: string, input: CustomerInput): Promise<void> {
  const r = await tx`
    update atelier.customers set name = ${input.name}, phone = ${input.phone}, email = ${input.email},
      address = ${input.address}, notes = ${input.notes}
    where id = ${id}`;
  if (r.count === 0) throw new AppError("not_found");
}

export async function setCustomerActive(tx: Tx, id: string, active: boolean): Promise<void> {
  const r = await tx`update atelier.customers set active = ${active} where id = ${id}`;
  if (r.count === 0) throw new AppError("not_found");
}
