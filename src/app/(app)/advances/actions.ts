"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { idempotencyKey, localDateTime, money, optIsoDate, optText, optUuid, uuid } from "@/lib/validation";
import { ADVANCE_CATEGORIES } from "@/domain/payroll/logic";
import { EXPENSE_CATEGORIES, PAY_METHODS } from "@/domain/ledger/logic";
import { recordAdvance } from "@/domain/payroll/service";
import { readUpload, saveAttachment } from "@/lib/attachments";

const AdvanceSchema = z.object({
  workerId: uuid(),
  amount: money(),
  occurredAt: localDateTime(),
  category: z.enum(ADVANCE_CATEGORIES),
  treatment: z.enum(["wage", "business"]),
  expenseCategory: z.preprocess((v) => (v === "" ? null : v), z.enum(EXPENSE_CATEGORIES).nullable()),
  accountId: uuid(),
  method: z.enum(PAY_METHODS),
  payWeek: optIsoDate(),
  orderId: optUuid(),
  note: optText(500),
  idempotencyKey: idempotencyKey(),
});

export async function recordAdvanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, AdvanceSchema, async (v) => {
    const user = await authorize("advances.record");
    const file = await readUpload(fd);
    const entry = await withUser(user.id, async (tx) => {
      const e = await recordAdvance(tx, {
        workerId: v.workerId,
        amountCents: v.amount,
        occurredAt: v.occurredAt,
        category: v.category,
        treatment: v.treatment,
        expenseCategory: v.expenseCategory,
        accountId: v.accountId,
        method: v.method,
        note: v.note,
        orderId: v.orderId,
        payWeek: v.payWeek,
        idempotencyKey: v.idempotencyKey,
      });
      if (file && e.attachments === 0) await saveAttachment(tx, file, { ledgerEntryId: e.id });
      return e;
    });
    revalidatePath("/advances");
    revalidatePath("/payroll");
    revalidatePath(`/workers/${v.workerId}`);
    revalidatePath("/");
    return { message: "advances.saved", data: { receiptId: entry.id, reference: entry.reference, payWeek: entry.payWeek } };
  });
}
