"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { idempotencyKey, isoDate, localDateTime, money, optMoney, optText, quantity, reqText, uuid } from "@/lib/validation";
import { PAY_METHODS } from "@/domain/ledger/logic";
import {
  carryBalanceForward,
  recordAdjustment,
  recordBasePay,
  recordSettlementPayment,
  voidEarning,
} from "@/domain/payroll/service";

function refresh(workerId: string) {
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${workerId}`);
  revalidatePath(`/workers/${workerId}`);
  revalidatePath("/");
}

const PaymentSchema = z.object({
  workerId: uuid(),
  payWeek: isoDate(),
  amount: money(),
  occurredAt: localDateTime(),
  accountId: uuid(),
  method: z.enum(PAY_METHODS),
  note: optText(500),
  baseQuantity: quantity(),
  baseAmount: optMoney(),
  idempotencyKey: idempotencyKey(),
});

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, PaymentSchema, async (v) => {
    const user = await authorize("payroll.record");
    const entry = await withUser(user.id, (tx) =>
      recordSettlementPayment(tx, {
        workerId: v.workerId,
        payWeek: v.payWeek,
        amountCents: v.amount,
        occurredAt: v.occurredAt,
        accountId: v.accountId,
        method: v.method,
        note: v.note,
        baseQuantity: v.baseQuantity,
        baseAmountCents: v.baseAmount,
        idempotencyKey: v.idempotencyKey,
      }),
    );
    refresh(v.workerId);
    return { message: "payroll.paymentSaved", data: { receiptId: entry.id, reference: entry.reference } };
  });
}

export async function recordBasePayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({ workerId: uuid(), payWeek: isoDate(), quantity: quantity(), amount: optMoney(), note: optText(500), idempotencyKey: idempotencyKey() }),
    async (v) => {
      const user = await authorize("payroll.record");
      await withUser(user.id, (tx) =>
        recordBasePay(tx, {
          workerId: v.workerId,
          payWeek: v.payWeek,
          quantity: v.quantity,
          amountCents: v.amount,
          note: v.note,
          idempotencyKey: v.idempotencyKey,
        }),
      );
      refresh(v.workerId);
      return { message: "payroll.baseSaved" };
    },
  );
}

export async function recordAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({
      workerId: uuid(),
      payWeek: isoDate(),
      basis: z.enum(["bonus", "adjustment"]),
      amount: money({ allowNegative: true }),
      note: reqText(500),
      idempotencyKey: idempotencyKey(),
    }),
    async (v) => {
      const user = await authorize("payroll.record");
      await withUser(user.id, (tx) =>
        recordAdjustment(tx, {
          workerId: v.workerId,
          payWeek: v.payWeek,
          basis: v.basis,
          amountCents: v.amount,
          note: v.note,
          idempotencyKey: v.idempotencyKey,
        }),
      );
      refresh(v.workerId);
      return { message: "payroll.adjustmentSaved" };
    },
  );
}

export async function carryForwardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ workerId: uuid(), payWeek: isoDate() }), async (v) => {
    const user = await authorize("payroll.record");
    const r = await withUser(user.id, (tx) => carryBalanceForward(tx, { workerId: v.workerId, payWeek: v.payWeek }));
    refresh(v.workerId);
    return { message: r ? "payroll.carriedOk" : "payroll.nothingToCarry" };
  });
}

export async function voidEarningAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), workerId: uuid(), reason: reqText(300) }), async (v) => {
    const user = await authorize("payroll.void");
    await withUser(user.id, (tx) => voidEarning(tx, { id: v.id, reason: v.reason }));
    refresh(v.workerId);
    return { message: "payroll.voided" };
  });
}
