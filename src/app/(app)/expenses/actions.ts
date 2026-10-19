"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { idempotencyKey, localDateTime, money, optText, optUuid, reqText, uuid } from "@/lib/validation";
import { EXPENSE_CATEGORIES, PAY_METHODS } from "@/domain/ledger/logic";
import { recordExpense } from "@/domain/expenses/service";
import { readUpload, saveAttachment } from "@/lib/attachments";

const ExpenseSchema = z.object({
  amount: money(),
  occurredAt: localDateTime(),
  category: z.enum(EXPENSE_CATEGORIES, { error: "validation.required" }),
  description: reqText(1000),
  supplier: optText(160),
  orderId: optUuid(),
  workerId: optUuid(),
  accountId: uuid(),
  method: z.enum(PAY_METHODS),
  idempotencyKey: idempotencyKey(),
});

export async function recordExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, ExpenseSchema, async (v) => {
    const user = await authorize("expenses.record");
    const file = await readUpload(fd);
    const e = await withUser(user.id, async (tx) => {
      const entry = await recordExpense(tx, {
        amountCents: v.amount,
        occurredAt: v.occurredAt,
        category: v.category,
        description: v.description,
        supplier: v.supplier,
        orderId: v.orderId,
        workerId: v.workerId,
        accountId: v.accountId,
        method: v.method,
        idempotencyKey: v.idempotencyKey,
      });
      if (file && entry.attachments === 0) await saveAttachment(tx, file, { ledgerEntryId: entry.id });
      return entry;
    });
    revalidatePath("/expenses");
    revalidatePath("/cash");
    revalidatePath("/");
    return { message: "expenses.saved", data: { reference: e.reference } };
  });
}
