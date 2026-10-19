"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { idempotencyKey, localDateTime, money, optMoney, reqText, uuid } from "@/lib/validation";
import { readUpload, saveAttachment } from "@/lib/attachments";
import { createCustomer } from "@/domain/customers/service";
import {
  addOrderAdjustment,
  changeStatus,
  createOrder,
  recordCustomerPayment,
  recordRefund,
  updateOrder,
} from "@/domain/orders/service";
import { ORDER_STATUSES } from "@/domain/orders/logic";
import { PAY_METHODS } from "@/domain/ledger/logic";
import { defaultAccountId } from "@/domain/ledger/service";
import { OrderSchema, parseLines } from "./schema";

function refresh(orderId?: string, customerId?: string) {
  revalidatePath("/orders");
  revalidatePath("/orders/board");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/");
}

export async function createOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, OrderSchema, async (v, raw) => {
    const user = await authorize("orders.manage");
    const { lines, errors } = parseLines(raw);
    if (Object.keys(errors).length) return { ok: false, error: "errors.invalid", fieldErrors: errors };
    const file = await readUpload(fd);
    const id = await withUser(user.id, async (tx) => {
      const customerId =
        v.customerId ??
        (await createCustomer(
          tx,
          { name: v.newCustomerName!, phone: v.newCustomerPhone, email: null, address: null, notes: null },
          v.idempotencyKey,
        ));
      const orderId = await createOrder(
        tx,
        {
          customerId,
          orderDate: v.orderDate,
          dueDate: v.dueDate,
          priority: v.priority,
          assignedWorkerId: v.assignedWorkerId,
          notes: v.notes,
          status: v.status ?? "confirmed",
          lines,
        },
        v.idempotencyKey,
      );
      if (v.deposit && v.deposit > 0) {
        await recordCustomerPayment(tx, {
          orderId,
          amountCents: v.deposit,
          occurredAt: new Date(),
          accountId: v.depositAccountId ?? (await defaultAccountId(tx)),
          method: v.depositMethod ?? "cash",
          note: null,
          idempotencyKey: v.idempotencyKey,
        });
      }
      if (file) {
        const [{ n }] = await tx<[{ n: number }]>`select count(*)::int as n from atelier.attachments where order_id = ${orderId}`;
        if (n === 0) await saveAttachment(tx, file, { orderId });
      }
      return orderId;
    });
    refresh(id);
    return { message: "orders.saved", data: { redirect: `/orders/${id}?saved=1` } };
  });
}

export async function updateOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, OrderSchema.and(z.object({ id: uuid() })), async (v, raw) => {
    const user = await authorize("orders.manage");
    const { lines, errors } = parseLines(raw);
    const hasLines = Object.keys(raw).some((k) => k.startsWith("lines."));
    if (hasLines && Object.keys(errors).length) return { ok: false, error: "errors.invalid", fieldErrors: errors };
    if (!v.customerId) throw new AppError("invalid", "customer");
    await withUser(user.id, (tx) =>
      updateOrder(tx, v.id, {
        customerId: v.customerId!,
        orderDate: v.orderDate,
        dueDate: v.dueDate,
        priority: v.priority,
        assignedWorkerId: v.assignedWorkerId,
        notes: v.notes,
        lines: hasLines ? lines : [],
      }),
    );
    refresh(v.id, v.customerId);
    return { message: "orders.saved", data: { redirect: `/orders/${v.id}?saved=1` } };
  });
}

export async function changeStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ orderId: uuid(), to: z.enum(ORDER_STATUSES), cancellationFee: optMoney() }), async (v) => {
    const user = await authorize("orders.manage");
    await withUser(user.id, (tx) => changeStatus(tx, { orderId: v.orderId, to: v.to, cancellationFeeCents: v.cancellationFee }));
    refresh(v.orderId);
    return { message: "orders.statusChanged" };
  });
}

export async function addAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({ orderId: uuid(), amount: money({ allowNegative: true }), reason: reqText(500), idempotencyKey: idempotencyKey() }),
    async (v) => {
      const user = await authorize("orders.manage");
      await withUser(user.id, (tx) =>
        addOrderAdjustment(tx, { orderId: v.orderId, amountCents: v.amount, reason: v.reason, idempotencyKey: v.idempotencyKey }),
      );
      refresh(v.orderId);
      return { message: "orders.adjustmentSaved" };
    },
  );
}

const MoneyEntrySchema = z.object({
  orderId: uuid(),
  amount: money(),
  occurredAt: localDateTime(),
  accountId: uuid(),
  method: z.enum(PAY_METHODS),
  note: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(500).nullable()),
  idempotencyKey: idempotencyKey(),
});

export async function recordOrderPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, MoneyEntrySchema, async (v) => {
    const user = await authorize("payments.record");
    const e = await withUser(user.id, (tx) =>
      recordCustomerPayment(tx, {
        orderId: v.orderId,
        amountCents: v.amount,
        occurredAt: v.occurredAt,
        accountId: v.accountId,
        method: v.method,
        note: v.note,
        idempotencyKey: v.idempotencyKey,
      }),
    );
    refresh(v.orderId, e.customerId ?? undefined);
    return { message: "orders.paymentSaved", data: { receiptId: e.id, reference: e.reference } };
  });
}

export async function recordRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, MoneyEntrySchema.extend({ note: reqText(500) }), async (v) => {
    const user = await authorize("refunds.record");
    const e = await withUser(user.id, (tx) =>
      recordRefund(tx, {
        orderId: v.orderId,
        amountCents: v.amount,
        occurredAt: v.occurredAt,
        accountId: v.accountId,
        method: v.method,
        note: v.note,
        idempotencyKey: v.idempotencyKey,
      }),
    );
    refresh(v.orderId, e.customerId ?? undefined);
    return { message: "orders.refundSaved", data: { receiptId: e.id, reference: e.reference } };
  });
}

export async function uploadOrderAttachmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ orderId: uuid() }), async (v) => {
    const user = await authorize("orders.manage");
    const file = await readUpload(fd);
    if (!file) return { ok: false, error: "errors.invalid", fieldErrors: { attachment: "validation.required" } };
    await withUser(user.id, (tx) => saveAttachment(tx, file, { orderId: v.orderId }));
    refresh(v.orderId);
    return { message: "orders.attachmentSaved" };
  });
}
