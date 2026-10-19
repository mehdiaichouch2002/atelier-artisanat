"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { checkbox, idempotencyKey, localDateTime, money, optText, reqText, uuid } from "@/lib/validation";
import { PAY_METHODS } from "@/domain/ledger/logic";
import { recordCashCount, recordTransfer, reverseEntry } from "@/domain/ledger/service";
import { recordSimpleEntry } from "@/domain/expenses/service";

function refresh() {
  for (const p of ["/cash", "/cash/ledger", "/", "/expenses", "/advances", "/payroll", "/orders", "/customers", "/workers"]) revalidatePath(p);
}

export async function transferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({ fromAccountId: uuid(), toAccountId: uuid(), amount: money(), occurredAt: localDateTime(), description: optText(500), idempotencyKey: idempotencyKey() }),
    async (v) => {
      const user = await authorize("cash.transfer");
      await withUser(user.id, (tx) =>
        recordTransfer(tx, {
          fromAccountId: v.fromAccountId,
          toAccountId: v.toAccountId,
          amountCents: v.amount,
          occurredAt: v.occurredAt,
          description: v.description,
          idempotencyKey: v.idempotencyKey,
        }),
      );
      refresh();
      return { message: "cash.transferSaved" };
    },
  );
}

export async function simpleEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({
      entryType: z.enum(["opening_balance", "other_income"]),
      direction: z.enum(["in", "out"]).default("in"),
      amount: money(),
      occurredAt: localDateTime(),
      accountId: uuid(),
      method: z.enum(PAY_METHODS).default("cash"),
      description: optText(500),
      idempotencyKey: idempotencyKey(),
    }),
    async (v) => {
      const user = await authorize(v.entryType === "opening_balance" ? "cash.opening" : "income.record");
      await withUser(user.id, (tx) =>
        recordSimpleEntry(tx, {
          entryType: v.entryType,
          direction: v.entryType === "other_income" ? "in" : v.direction,
          amountCents: v.amount,
          occurredAt: v.occurredAt,
          accountId: v.accountId,
          method: v.method,
          description: v.description,
          idempotencyKey: v.idempotencyKey,
        }),
      );
      refresh();
      return { message: "cash.entrySaved" };
    },
  );
}

export async function cashCountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({ accountId: uuid(), counted: money({ allowZero: true, allowNegative: true }), note: optText(1000), adjust: checkbox(), idempotencyKey: idempotencyKey() }),
    async (v) => {
      const user = await authorize(v.adjust ? "cash.adjust" : "cash.count");
      const r = await withUser(user.id, (tx) =>
        recordCashCount(tx, { accountId: v.accountId, countedCents: v.counted, note: v.note, adjust: v.adjust, idempotencyKey: v.idempotencyKey }),
      );
      refresh();
      return {
        message: r.count.differenceCents === 0 ? "cash.countMatches" : r.adjustment ? "cash.countAdjusted" : "cash.countRecorded",
        data: { difference: r.count.differenceCents },
      };
    },
  );
}

export async function reverseEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ entryId: uuid(), reason: reqText(300), idempotencyKey: idempotencyKey() }), async (v) => {
    const user = await authorize("ledger.reverse");
    const [first] = await withUser(user.id, (tx) => reverseEntry(tx, { entryId: v.entryId, reason: v.reason, idempotencyKey: v.idempotencyKey }));
    refresh();
    return { message: "ledger.reversedSaved", data: { redirect: `/cash/ledger/${first!.id}` } };
  });
}
