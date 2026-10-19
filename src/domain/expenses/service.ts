import type { Tx } from "@/lib/db-types";
import type { Cents } from "@/lib/money";
import { assertActiveAccount, findByIdempotencyKey, insertEntry, type LedgerEntry } from "@/domain/ledger/service";
import type { ExpenseCategory, PayMethod } from "@/domain/ledger/logic";
import { AppError } from "@/lib/errors";

export async function recordExpense(
  tx: Tx,
  input: {
    amountCents: Cents;
    occurredAt: Date;
    category: ExpenseCategory;
    description: string;
    supplier?: string | null;
    orderId?: string | null;
    workerId?: string | null;
    accountId: string;
    method: PayMethod;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry> {
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return prior;
  if (input.amountCents <= 0) throw new AppError("invalid", "not_positive");
  await assertActiveAccount(tx, input.accountId);
  const { entry } = await insertEntry(tx, {
    entryType: "expense",
    direction: "out",
    amountCents: input.amountCents,
    accountId: input.accountId,
    method: input.method,
    occurredAt: input.occurredAt,
    description: input.description,
    supplier: input.supplier ?? null,
    orderId: input.orderId ?? null,
    workerId: input.workerId ?? null,
    expenseCategory: input.category,
    idempotencyKey: input.idempotencyKey,
  });
  return entry;
}

/** Opening balance (owner) or other income: a plain movement on one account. */
export async function recordSimpleEntry(
  tx: Tx,
  input: {
    entryType: "opening_balance" | "other_income";
    direction: "in" | "out";
    amountCents: Cents;
    occurredAt: Date;
    accountId: string;
    method: PayMethod;
    description: string | null;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry> {
  if (input.entryType === "other_income" && input.direction !== "in") throw new AppError("invalid", "direction");
  if (input.amountCents <= 0) throw new AppError("invalid", "not_positive");
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return prior;
  await assertActiveAccount(tx, input.accountId);
  const { entry } = await insertEntry(tx, { ...input });
  return entry;
}
