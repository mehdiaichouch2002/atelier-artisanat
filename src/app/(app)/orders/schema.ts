import { z } from "zod";
import { idempotencyKey, isoDate, optIsoDate, optMoney, optText, optUuid } from "@/lib/validation";
import { parseMoney } from "@/lib/money";
import { ORDER_PRIORITIES } from "@/domain/orders/logic";
import { PAY_METHODS } from "@/domain/ledger/logic";

export interface ParsedLine {
  categoryId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

/** Reads order lines posted as lines.<n>.<field>. Returns field errors keyed like the inputs. */
export function parseLines(raw: Record<string, string>): { lines: ParsedLine[]; errors: Record<string, string> } {
  const idx = new Set<number>();
  for (const k of Object.keys(raw)) {
    const m = /^lines\.(\d+)\./.exec(k);
    if (m) idx.add(Number(m[1]));
  }
  const lines: ParsedLine[] = [];
  const errors: Record<string, string> = {};
  for (const i of [...idx].sort((a, b) => a - b).slice(0, 100)) {
    const description = (raw[`lines.${i}.description`] ?? "").trim();
    const qtyRaw = (raw[`lines.${i}.quantity`] ?? "").trim();
    const priceRaw = raw[`lines.${i}.unitPrice`] ?? "";
    const category = (raw[`lines.${i}.categoryId`] ?? "").trim();
    if (!description && !qtyRaw && !priceRaw.trim()) continue; // empty row
    const quantity = Number(qtyRaw);
    const unitPriceCents = parseMoney(priceRaw);
    if (!description) errors[`lines.${i}.description`] = "validation.required";
    if (description.length > 500) errors[`lines.${i}.description`] = "validation.tooLong";
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) errors[`lines.${i}.quantity`] = "validation.quantityInt";
    if (unitPriceCents == null || unitPriceCents < 0) errors[`lines.${i}.unitPrice`] = "validation.amount";
    lines.push({
      categoryId: /^[0-9a-f-]{36}$/i.test(category) ? category : null,
      description,
      quantity,
      unitPriceCents: unitPriceCents ?? 0,
    });
  }
  if (lines.length === 0) errors["lines"] = "validation.linesRequired";
  return { lines, errors };
}

export const OrderSchema = z
  .object({
    customerId: optUuid(),
    newCustomerName: optText(160),
    newCustomerPhone: optText(30),
    orderDate: isoDate(),
    dueDate: optIsoDate(),
    priority: z.enum(ORDER_PRIORITIES),
    assignedWorkerId: optUuid(),
    notes: optText(4000),
    status: z.enum(["quote", "confirmed"]).optional(),
    deposit: optMoney(),
    depositAccountId: optUuid(),
    depositMethod: z.preprocess((v) => (v === "" ? undefined : v), z.enum(PAY_METHODS).optional()),
    idempotencyKey: idempotencyKey(),
  })
  .superRefine((v, ctx) => {
    if (!v.customerId && !v.newCustomerName)
      ctx.addIssue({ code: "custom", path: ["customerId"], message: "validation.customerRequired" });
    if (v.dueDate && v.dueDate < v.orderDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "validation.dueBeforeOrder" });
  });

