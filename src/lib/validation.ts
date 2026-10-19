// Shared Zod building blocks. Error messages are i18n keys (validation.*).
import { z } from "zod";
import { parseMoney } from "./money";
import { isIsoDate, localDateTimeToInstant } from "./dates";

const empty = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

export const reqText = (max = 200) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: "validation.required" }).min(1, { error: "validation.required" }).max(max, { error: "validation.tooLong" }),
  );

export const optText = (max = 1000) =>
  z.preprocess(
    (v) => (empty(v) ? null : typeof v === "string" ? v.trim() : v),
    z.string().max(max, { error: "validation.tooLong" }).nullable(),
  );

export const money = (opts: { allowZero?: boolean; allowNegative?: boolean } = {}) =>
  z.preprocess(
    (v) => (empty(v) ? undefined : typeof v === "number" ? v : parseMoney(String(v))),
    z
      .number({ error: (i) => (i.input === undefined ? "validation.required" : "validation.amount") })
      .int({ error: "validation.amount" })
      .refine((n) => (opts.allowNegative ? true : n >= 0), { error: "validation.amountPositive" })
      .refine((n) => (opts.allowZero ? true : n !== 0), { error: "validation.amountPositive" }),
  );

export const optMoney = () =>
  z.preprocess(
    (v) => (empty(v) ? null : parseMoney(String(v))),
    z.number({ error: "validation.amount" }).int().min(0, { error: "validation.amountPositive" }).nullable(),
  );

export const isoDate = () =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: "validation.required" }).refine(isIsoDate, { error: "validation.date" }),
  );

export const optIsoDate = () =>
  z.preprocess((v) => (empty(v) ? null : v), z.string().refine(isIsoDate, { error: "validation.date" }).nullable());

/** "YYYY-MM-DDTHH:mm" interpreted in the workshop time zone. */
export const localDateTime = () =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string({ error: "validation.required" })
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { error: "validation.date" })
      .transform((s) => localDateTimeToInstant(s)),
  );

export const uuid = () => z.uuid({ error: "validation.required" });
export const optUuid = () => z.preprocess((v) => (empty(v) ? null : v), z.uuid({ error: "validation.invalid" }).nullable());

export const idempotencyKey = () => z.preprocess((v) => (empty(v) ? null : v), z.uuid().nullable());

export const checkbox = () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const quantity = () =>
  z.preprocess(
    (v) => (empty(v) ? null : String(v).trim().replace(",", ".")),
    z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, { error: "validation.quantity" }).nullable(),
  );

export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}
