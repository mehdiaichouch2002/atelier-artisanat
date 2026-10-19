"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { checkbox, idempotencyKey, optText, reqText, uuid } from "@/lib/validation";
import { createCustomer, findSimilarCustomers, setCustomerActive, updateCustomer } from "@/domain/customers/service";

const CustomerSchema = z.object({
  name: reqText(160),
  phone: optText(30),
  email: z.preprocess((v) => (v === "" || v == null ? null : String(v).trim()), z.email({ error: "validation.email" }).max(254).nullable()),
  address: optText(500),
  notes: optText(2000),
  confirmDuplicate: checkbox(),
  idempotencyKey: idempotencyKey(),
});

export async function createCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, CustomerSchema, async (v) => {
    const user = await authorize("customers.manage");
    const result = await withUser(user.id, async (tx) => {
      if (!v.confirmDuplicate) {
        const similar = await findSimilarCustomers(tx, { name: v.name, phone: v.phone });
        if (similar.length) return { similar };
      }
      return { id: await createCustomer(tx, v, v.idempotencyKey) };
    });
    if ("similar" in result) return { ok: false, error: "customers.similarFound", data: { similar: result.similar } };
    revalidatePath("/customers");
    return { message: "customers.saved", data: { redirect: `/customers/${result.id}?saved=1`, id: result.id } };
  });
}

export async function updateCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, CustomerSchema.extend({ id: uuid() }), async (v) => {
    const user = await authorize("customers.manage");
    await withUser(user.id, (tx) => updateCustomer(tx, v.id, v));
    revalidatePath("/customers");
    revalidatePath(`/customers/${v.id}`);
    return { message: "customers.saved", data: { redirect: `/customers/${v.id}?saved=1` } };
  });
}

export async function setCustomerActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), active: checkbox() }), async (v) => {
    const user = await authorize("customers.manage");
    await withUser(user.id, (tx) => setCustomerActive(tx, v.id, v.active));
    revalidatePath("/customers");
    revalidatePath(`/customers/${v.id}`);
    return { message: v.active ? "customers.reactivated" : "customers.deactivated" };
  });
}
