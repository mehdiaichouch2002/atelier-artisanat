import { z } from "zod";
import { idempotencyKey, isoDate, optMoney, optText, optUuid, quantity, reqText } from "@/lib/validation";

export const WorkerSchema = z
  .object({
    fullName: reqText(120),
    code: optText(20),
    phone: optText(30),
    categoryId: optUuid(),
    startDate: isoDate(),
    notes: optText(2000),
    payKind: z.enum(["weekly", "daily", "piece", "negotiated"], { error: "validation.required" }),
    weeklyAmount: optMoney(),
    dailyRate: optMoney(),
    pieceRate: optMoney(),
    defaultDays: quantity(),
    idempotencyKey: idempotencyKey(),
  })
  .superRefine((v, ctx) => {
    if (v.payKind === "weekly" && v.weeklyAmount == null)
      ctx.addIssue({ code: "custom", path: ["weeklyAmount"], message: "validation.required" });
    if (v.payKind === "daily" && v.dailyRate == null)
      ctx.addIssue({ code: "custom", path: ["dailyRate"], message: "validation.required" });
    if (v.payKind === "piece" && v.pieceRate == null)
      ctx.addIssue({ code: "custom", path: ["pieceRate"], message: "validation.required" });
    if (v.defaultDays != null && Number(v.defaultDays) > 7)
      ctx.addIssue({ code: "custom", path: ["defaultDays"], message: "validation.days" });
  });

export function toWorkerInput(v: z.infer<typeof WorkerSchema>) {
  return {
    fullName: v.fullName,
    code: v.code,
    phone: v.phone,
    categoryId: v.categoryId,
    startDate: v.startDate,
    notes: v.notes,
    payKind: v.payKind,
    weeklyAmountCents: v.payKind === "weekly" ? v.weeklyAmount : null,
    dailyRateCents: v.payKind === "daily" ? v.dailyRate : null,
    pieceRateCents: v.payKind === "piece" ? v.pieceRate : null,
    defaultDays: v.payKind === "daily" ? v.defaultDays : null,
  };
}
