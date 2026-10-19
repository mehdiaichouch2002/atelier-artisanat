import "server-only";
import { z } from "zod";
import { AppError, toAppError } from "./errors";
import { formToObject } from "./validation";

export interface ActionState {
  ok?: boolean;
  /** i18n key of a success message */
  message?: string;
  /** i18n key of a general error (errors.*) */
  error?: string;
  errorDetail?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, returned so the form keeps the user's input after an error. */
  values?: Record<string, string>;
  /** Free data for the client (e.g. created id, duplicate warnings). */
  data?: Record<string, unknown>;
}

export const initialState: ActionState = {};

export function fieldErrorsFrom(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".");
    if (!out[k]) out[k] = issue.message.startsWith("validation.") ? issue.message : "validation.invalid";
  }
  return out;
}

/**
 * Wraps a server action body: validates input with `schema`, runs `fn`, and converts any
 * failure into a serialisable state. Never leaks internal error details to the client.
 */
export async function runAction<S extends z.ZodType>(
  formData: FormData,
  schema: S,
  fn: (input: z.infer<S>, raw: Record<string, string>) => Promise<ActionState | void>,
): Promise<ActionState> {
  const raw = formToObject(formData);
  const values = Object.fromEntries(Object.entries(raw).filter(([k]) => !/password/i.test(k)));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: "errors.invalid", fieldErrors: fieldErrorsFrom(parsed.error), values };
  }
  try {
    const res = await fn(parsed.data, raw);
    // A body may return { ok: false, … } for a soft refusal (e.g. a duplicate warning).
    if (res && res.ok === false) return { values, ...res };
    return { ok: true, ...(res ?? {}) };
  } catch (err) {
    // Next.js redirects/notFound are thrown as errors and must propagate.
    if (isNextControlFlow(err)) throw err;
    const e = toAppError(err);
    if (e.code === "unexpected") console.error("action failed", err instanceof Error ? err.message : err);
    return { error: `errors.${e.code}`, errorDetail: safeDetail(e), values };
  }
}

function safeDetail(e: AppError): string | undefined {
  // Only short, known detail codes are shown (translated as errors.detail.<code>).
  return e.detail && /^[a-z_]{2,40}$/.test(e.detail) ? e.detail : undefined;
}

function isNextControlFlow(err: unknown): boolean {
  const d = (err as { digest?: unknown })?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND");
}
