import { pgCode, pgConstraint } from "./db-errors";

export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "duplicate"
  | "overpayment"
  | "rate_limited"
  | "unexpected";

/** Error with a translatable code (errors.<code> in the locale files). */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AppError";
  }
}

/** Maps database errors to user-facing error codes. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const code = pgCode(err);
  if (code === "42501") return new AppError("forbidden");
  if (code === "23505") return new AppError("duplicate", pgConstraint(err));
  if (code === "23514" || code === "23503" || code === "22P02" || code === "23502") {
    return new AppError("invalid", err instanceof Error ? err.message : undefined);
  }
  return new AppError("unexpected");
}
