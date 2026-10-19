// Ledger persistence. All money movements go through `insertEntry` so references,
// idempotency and validation are uniform. Rows are immutable (enforced by the database).
import type { Tx } from "@/lib/db-types";
import { AppError } from "@/lib/errors";
import type { Cents } from "@/lib/money";
import type { Direction, EntryType, ExpenseCategory, PayMethod } from "./logic";
import { reconciliationDifference } from "./logic";

export interface LedgerEntry {
  id: string;
  reference: string;
  entryType: EntryType;
  direction: Direction;
  amountCents: Cents;
  accountId: string;
  accountName: string;
  method: PayMethod;
  occurredAt: Date;
  description: string | null;
  workerId: string | null;
  workerName: string | null;
  customerId: string | null;
  customerName: string | null;
  orderId: string | null;
  orderReference: string | null;
  payWeek: string | null;
  advanceCategory: "daily" | "food_transport" | "materials" | "other" | null;
  advanceTreatment: "wage" | "business" | null;
  expenseCategory: ExpenseCategory | null;
  supplier: string | null;
  transferGroup: string | null;
  reversalOf: string | null;
  reversedBy: string | null;
  reversedByReference: string | null;
  cashCountId: string | null;
  createdAt: Date;
  createdByName: string | null;
  attachments: number;
}

export interface NewEntry {
  entryType: EntryType;
  direction: Direction;
  amountCents: Cents;
  accountId: string;
  method?: PayMethod;
  occurredAt: Date;
  description?: string | null;
  workerId?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  payWeek?: string | null;
  advanceCategory?: LedgerEntry["advanceCategory"];
  advanceTreatment?: LedgerEntry["advanceTreatment"];
  expenseCategory?: ExpenseCategory | null;
  supplier?: string | null;
  transferGroup?: string | null;
  reversalOf?: string | null;
  cashCountId?: string | null;
  idempotencyKey?: string | null;
}

const SELECT_ENTRY = (tx: Tx) => tx`
  select l.id, l.reference, l.entry_type, l.direction, l.amount_cents, l.account_id, a.name as account_name,
         l.method, l.occurred_at, l.description, l.worker_id, w.full_name as worker_name,
         l.customer_id, c.name as customer_name, l.order_id, o.reference as order_reference, l.pay_week,
         l.advance_category, l.advance_treatment, l.expense_category, l.supplier, l.transfer_group,
         l.reversal_of, r.id as reversed_by, r.reference as reversed_by_reference, l.cash_count_id,
         l.created_at, u.display_name as created_by_name,
         (select count(*)::int from atelier.attachments at where at.ledger_entry_id = l.id) as attachments
  from atelier.ledger_entries l
  join atelier.cash_accounts a on a.id = l.account_id
  left join atelier.workers w on w.id = l.worker_id
  left join atelier.customers c on c.id = l.customer_id
  left join atelier.orders o on o.id = l.order_id
  left join atelier.ledger_entries r on r.reversal_of = l.id
  left join atelier.users u on u.id = l.created_by
`;

type EntryRow = {
  id: string;
  reference: string;
  entry_type: EntryType;
  direction: Direction;
  amount_cents: number;
  account_id: string;
  account_name: string;
  method: PayMethod;
  occurred_at: Date;
  description: string | null;
  worker_id: string | null;
  worker_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  order_id: string | null;
  order_reference: string | null;
  pay_week: string | null;
  advance_category: LedgerEntry["advanceCategory"];
  advance_treatment: LedgerEntry["advanceTreatment"];
  expense_category: ExpenseCategory | null;
  supplier: string | null;
  transfer_group: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  reversed_by_reference: string | null;
  cash_count_id: string | null;
  created_at: Date;
  created_by_name: string | null;
  attachments: number;
};

export function mapEntry(r: EntryRow): LedgerEntry {
  return {
    id: r.id,
    reference: r.reference,
    entryType: r.entry_type,
    direction: r.direction,
    amountCents: r.amount_cents,
    accountId: r.account_id,
    accountName: r.account_name,
    method: r.method,
    occurredAt: r.occurred_at,
    description: r.description,
    workerId: r.worker_id,
    workerName: r.worker_name,
    customerId: r.customer_id,
    customerName: r.customer_name,
    orderId: r.order_id,
    orderReference: r.order_reference,
    payWeek: r.pay_week,
    advanceCategory: r.advance_category,
    advanceTreatment: r.advance_treatment,
    expenseCategory: r.expense_category,
    supplier: r.supplier,
    transferGroup: r.transfer_group,
    reversalOf: r.reversal_of,
    reversedBy: r.reversed_by,
    reversedByReference: r.reversed_by_reference,
    cashCountId: r.cash_count_id,
    createdAt: r.created_at,
    createdByName: r.created_by_name,
    attachments: r.attachments,
  };
}

export async function getEntry(tx: Tx, id: string): Promise<LedgerEntry | null> {
  const rows = await tx<EntryRow[]>`${SELECT_ENTRY(tx)} where l.id = ${id}`;
  return rows[0] ? mapEntry(rows[0]) : null;
}

export async function findByIdempotencyKey(tx: Tx, key: string | null | undefined): Promise<LedgerEntry | null> {
  if (!key) return null;
  const rows = await tx<EntryRow[]>`${SELECT_ENTRY(tx)} where l.idempotency_key = ${key}`;
  return rows[0] ? mapEntry(rows[0]) : null;
}

/** Inserts one ledger entry. Returns the existing entry when the idempotency key was already used. */
export async function insertEntry(tx: Tx, e: NewEntry): Promise<{ entry: LedgerEntry; created: boolean }> {
  const existing = await findByIdempotencyKey(tx, e.idempotencyKey);
  if (existing) return { entry: existing, created: false };
  const [ref] = await tx<{ ref: string }[]>`select atelier.next_reference('TX') as ref`;
  const rows = await tx<{ id: string }[]>`
    insert into atelier.ledger_entries (
      reference, entry_type, direction, amount_cents, account_id, method, occurred_at, description,
      worker_id, customer_id, order_id, pay_week, advance_category, advance_treatment, expense_category,
      supplier, transfer_group, reversal_of, cash_count_id, idempotency_key
    ) values (
      ${ref!.ref}, ${e.entryType}, ${e.direction}, ${e.amountCents}, ${e.accountId}, ${e.method ?? "cash"},
      ${e.occurredAt}, ${e.description ?? null}, ${e.workerId ?? null}, ${e.customerId ?? null},
      ${e.orderId ?? null}, ${e.payWeek ?? null}, ${e.advanceCategory ?? null}, ${e.advanceTreatment ?? null},
      ${e.expenseCategory ?? null}, ${e.supplier ?? null}, ${e.transferGroup ?? null}, ${e.reversalOf ?? null},
      ${e.cashCountId ?? null}, ${e.idempotencyKey ?? null}
    )
    on conflict (idempotency_key) do nothing
    returning id`;
  if (!rows[0]) {
    const again = await findByIdempotencyKey(tx, e.idempotencyKey);
    if (again) return { entry: again, created: false };
    throw new AppError("conflict");
  }
  const entry = await getEntry(tx, rows[0].id);
  return { entry: entry!, created: true };
}

/**
 * Reverses an entry (and the other leg of a transfer) with mirror entries.
 * The original stays visible; both rows are linked.
 */
export async function reverseEntry(
  tx: Tx,
  input: { entryId: string; reason: string; idempotencyKey?: string | null },
): Promise<LedgerEntry[]> {
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return [prior];
  // Ledger rows are never updated, so a row lock is not available: serialise with an advisory lock.
  await tx`select pg_advisory_xact_lock(hashtextextended(${"ledger:" + input.entryId}, 0))`;
  const original = await tx<{ id: string; transfer_group: string | null; reversal_of: string | null }[]>`
    select id, transfer_group, reversal_of from atelier.ledger_entries where id = ${input.entryId}`;
  const o = original[0];
  if (!o) throw new AppError("not_found");
  if (o.reversal_of) throw new AppError("invalid", "reversal_of_reversal");
  const ids = o.transfer_group
    ? (
        await tx<{ id: string }[]>`
          select id from atelier.ledger_entries
          where transfer_group = ${o.transfer_group} and reversal_of is null order by direction desc`
      ).map((r) => r.id)
    : [o.id];
  const out: LedgerEntry[] = [];
  for (const [i, id] of ids.entries()) {
    const already = await tx<{ id: string }[]>`select id from atelier.ledger_entries where reversal_of = ${id}`;
    if (already[0]) throw new AppError("conflict", "already_reversed");
    const src = (await getEntry(tx, id))!;
    const { entry } = await insertEntry(tx, {
      entryType: src.entryType,
      direction: src.direction === "in" ? "out" : "in",
      amountCents: src.amountCents,
      accountId: src.accountId,
      method: src.method,
      occurredAt: new Date(),
      description: `${src.reference} — ${input.reason}`,
      workerId: src.workerId,
      customerId: src.customerId,
      orderId: src.orderId,
      payWeek: src.payWeek,
      advanceCategory: src.advanceCategory,
      advanceTreatment: src.advanceTreatment,
      expenseCategory: src.expenseCategory,
      supplier: src.supplier,
      transferGroup: src.transferGroup,
      reversalOf: src.id,
      idempotencyKey: i === 0 ? input.idempotencyKey : null,
    });
    out.push(entry);
  }
  return out;
}

export interface EntryFilters {
  from?: Date;
  to?: Date; // exclusive
  types?: EntryType[];
  accountId?: string;
  workerId?: string;
  customerId?: string;
  orderId?: string;
  payWeek?: string;
  expenseCategory?: ExpenseCategory;
  advanceCategory?: string;
  search?: string;
  includeBusinessAdvances?: boolean; // for expense listings
}

function whereClause(tx: Tx, f: EntryFilters) {
  const typeCond =
    f.types && f.types.length
      ? f.includeBusinessAdvances
        ? tx`and (l.entry_type in ${tx(f.types)} or (l.entry_type = 'worker_advance' and l.advance_treatment = 'business'))`
        : tx`and l.entry_type in ${tx(f.types)}`
      : tx``;
  const like = f.search ? `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return tx`
    where true
    ${f.from ? tx`and l.occurred_at >= ${f.from}` : tx``}
    ${f.to ? tx`and l.occurred_at < ${f.to}` : tx``}
    ${typeCond}
    ${f.accountId ? tx`and l.account_id = ${f.accountId}` : tx``}
    ${f.workerId ? tx`and l.worker_id = ${f.workerId}` : tx``}
    ${f.customerId ? tx`and l.customer_id = ${f.customerId}` : tx``}
    ${f.orderId ? tx`and l.order_id = ${f.orderId}` : tx``}
    ${f.payWeek ? tx`and l.pay_week = ${f.payWeek}` : tx``}
    ${f.expenseCategory ? tx`and l.expense_category = ${f.expenseCategory}` : tx``}
    ${f.advanceCategory ? tx`and l.advance_category = ${f.advanceCategory}` : tx``}
    ${
      like
        ? tx`and (l.reference ilike ${like} or l.description ilike ${like} or l.supplier ilike ${like}
              or w.full_name ilike ${like} or c.name ilike ${like} or o.reference ilike ${like})`
        : tx``
    }
  `;
}

export async function listEntries(
  tx: Tx,
  f: EntryFilters,
  page: { limit: number; offset: number } = { limit: 50, offset: 0 },
): Promise<{ rows: LedgerEntry[]; total: number }> {
  const where = whereClause(tx, f);
  const rows = await tx<EntryRow[]>`
    ${SELECT_ENTRY(tx)} ${where}
    order by l.occurred_at desc, l.created_at desc
    limit ${page.limit} offset ${page.offset}`;
  const [count] = await tx<{ n: number }[]>`
    select count(*)::int as n from atelier.ledger_entries l
    left join atelier.workers w on w.id = l.worker_id
    left join atelier.customers c on c.id = l.customer_id
    left join atelier.orders o on o.id = l.order_id
    ${where}`;
  return { rows: rows.map(mapEntry), total: count?.n ?? 0 };
}

/** All entries matching the filters (for exports / reports). Capped for safety. */
export async function allEntries(tx: Tx, f: EntryFilters, cap = 20000): Promise<LedgerEntry[]> {
  const rows = await tx<EntryRow[]>`
    ${SELECT_ENTRY(tx)} ${whereClause(tx, f)} order by l.occurred_at asc, l.created_at asc limit ${cap}`;
  return rows.map(mapEntry);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export interface AccountBalance {
  accountId: string;
  name: string;
  kind: "cash" | "bank" | "other";
  active: boolean;
  isDefault: boolean;
  balanceCents: Cents;
}

export async function accountBalances(tx: Tx, opts: { includeInactive?: boolean } = {}): Promise<AccountBalance[]> {
  const rows = await tx<
    { account_id: string; name: string; kind: AccountBalance["kind"]; active: boolean; is_default: boolean; balance_cents: number }[]
  >`select * from atelier.v_account_balances
    ${opts.includeInactive ? tx`` : tx`where active`}
    order by is_default desc, name`;
  return rows.map((r) => ({
    accountId: r.account_id,
    name: r.name,
    kind: r.kind,
    active: r.active,
    isDefault: r.is_default,
    balanceCents: r.balance_cents,
  }));
}

/** Balance of an account at the end of an instant (exclusive), from the ledger. */
export async function accountBalanceAt(tx: Tx, accountId: string, before?: Date): Promise<Cents> {
  const [r] = await tx<{ b: number }[]>`
    select coalesce(sum(case when direction = 'in' then amount_cents else -amount_cents end), 0)::bigint as b
    from atelier.ledger_entries where account_id = ${accountId}
    ${before ? tx`and occurred_at < ${before}` : tx``}`;
  return r?.b ?? 0;
}

export async function defaultAccountId(tx: Tx): Promise<string> {
  const [r] = await tx<{ id: string }[]>`
    select id from atelier.cash_accounts where active order by is_default desc, created_at limit 1`;
  if (!r) throw new AppError("invalid", "no_account");
  return r.id;
}

export async function assertActiveAccount(tx: Tx, accountId: string): Promise<void> {
  const [r] = await tx<{ active: boolean }[]>`select active from atelier.cash_accounts where id = ${accountId}`;
  if (!r) throw new AppError("not_found", "account");
  if (!r.active) throw new AppError("invalid", "account_inactive");
}

export async function createAccount(tx: Tx, input: { name: string; kind: AccountBalance["kind"] }): Promise<string> {
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.cash_accounts (name, kind) values (${input.name}, ${input.kind}) returning id`;
  return r!.id;
}

export async function updateAccount(
  tx: Tx,
  input: { id: string; name: string; active: boolean; isDefault: boolean },
): Promise<void> {
  if (input.isDefault) {
    await tx`update atelier.cash_accounts set is_default = false where is_default and id <> ${input.id}`;
  }
  const r = await tx`
    update atelier.cash_accounts set name = ${input.name}, active = ${input.active || input.isDefault},
      is_default = ${input.isDefault}
    where id = ${input.id}`;
  if (r.count === 0) throw new AppError("not_found");
}

/** Moves money between two accounts: two linked entries, neither income nor expense. */
export async function recordTransfer(
  tx: Tx,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: Cents;
    occurredAt: Date;
    description?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry[]> {
  if (input.fromAccountId === input.toAccountId) throw new AppError("invalid", "same_account");
  const existing = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (existing) return [existing];
  await assertActiveAccount(tx, input.fromAccountId);
  await assertActiveAccount(tx, input.toAccountId);
  const [g] = await tx<{ g: string }[]>`select gen_random_uuid() as g`;
  const common = {
    entryType: "transfer" as const,
    amountCents: input.amountCents,
    occurredAt: input.occurredAt,
    description: input.description ?? null,
    transferGroup: g!.g,
    method: "other" as const,
  };
  const out = await insertEntry(tx, {
    ...common,
    direction: "out",
    accountId: input.fromAccountId,
    idempotencyKey: input.idempotencyKey,
  });
  const into = await insertEntry(tx, { ...common, direction: "in", accountId: input.toAccountId });
  return [out.entry, into.entry];
}

// ---------------------------------------------------------------------------
// Reconciliation (physical cash counts)
// ---------------------------------------------------------------------------
export interface CashCount {
  id: string;
  accountId: string;
  accountName: string;
  countedCents: Cents;
  calculatedCents: Cents;
  differenceCents: Cents;
  countedAt: Date;
  note: string | null;
  createdByName: string | null;
  adjustmentReference: string | null;
}

export async function listCashCounts(tx: Tx, limit = 20, id?: string): Promise<CashCount[]> {
  const rows = await tx<
    {
      id: string;
      account_id: string;
      account_name: string;
      counted_cents: number;
      calculated_cents: number;
      counted_at: Date;
      note: string | null;
      created_by_name: string | null;
      adjustment_reference: string | null;
    }[]
  >`
    select cc.*, a.name as account_name, u.display_name as created_by_name,
           (select reference from atelier.ledger_entries l where l.cash_count_id = cc.id and l.reversal_of is null
            limit 1) as adjustment_reference
    from atelier.cash_counts cc
    join atelier.cash_accounts a on a.id = cc.account_id
    left join atelier.users u on u.id = cc.created_by
    ${id ? tx`where cc.id = ${id}` : tx``}
    order by cc.counted_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    accountName: r.account_name,
    countedCents: r.counted_cents,
    calculatedCents: r.calculated_cents,
    differenceCents: r.counted_cents - r.calculated_cents,
    countedAt: r.counted_at,
    note: r.note,
    createdByName: r.created_by_name,
    adjustmentReference: r.adjustment_reference,
  }));
}

/**
 * Records a physical count against the balance calculated from the ledger.
 * When `adjust` is set (owner only) and there is a difference, an explicit adjustment entry
 * brings the calculated balance to the counted amount. Nothing is overwritten.
 */
export async function recordCashCount(
  tx: Tx,
  input: {
    accountId: string;
    countedCents: Cents;
    note?: string | null;
    adjust: boolean;
    idempotencyKey?: string | null;
  },
): Promise<{ count: CashCount; adjustment: LedgerEntry | null }> {
  if (input.idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`
      select id from atelier.cash_counts where idempotency_key = ${input.idempotencyKey}`;
    if (prior) {
      const [count] = await listCashCounts(tx, 1, prior.id);
      return { count: count!, adjustment: null };
    }
  }
  // Lock the account so concurrent entries cannot change the balance between count and adjustment.
  await tx`select pg_advisory_xact_lock(hashtextextended(${"account:" + input.accountId}, 0))`;
  await assertActiveAccount(tx, input.accountId);
  const calculated = await accountBalanceAt(tx, input.accountId);
  const [row] = await tx<{ id: string }[]>`
    insert into atelier.cash_counts (account_id, counted_cents, calculated_cents, note, idempotency_key)
    values (${input.accountId}, ${input.countedCents}, ${calculated}, ${input.note ?? null},
            ${input.idempotencyKey ?? null})
    returning id`;
  const { adjustment } = reconciliationDifference(calculated, input.countedCents);
  let adj: LedgerEntry | null = null;
  if (input.adjust && adjustment) {
    if (!input.note?.trim()) throw new AppError("invalid", "note_required");
    adj = (
      await insertEntry(tx, {
        entryType: "adjustment",
        direction: adjustment.direction,
        amountCents: adjustment.amountCents,
        accountId: input.accountId,
        method: "other",
        occurredAt: new Date(),
        description: input.note,
        cashCountId: row!.id,
      })
    ).entry;
  }
  const [count] = await listCashCounts(tx, 1, row!.id);
  return { count: count!, adjustment: adj };
}
