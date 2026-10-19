import "server-only";
import { getI18n } from "@/i18n/server";
import { requirePagePermission, requireUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { withUser, type Tx } from "@/lib/db";

/** Everything a protected page needs: the user, translations and a data accessor running under RLS. */
export async function pageContext(permission?: Permission) {
  const user = permission ? await requirePagePermission(permission) : await requireUser();
  const i18n = await getI18n();
  return { user, ...i18n, q: <T>(fn: (tx: Tx) => Promise<T>) => withUser(user.id, fn) };
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim().slice(0, 200) : undefined;
}

export function pageNumber(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(param(sp, "page") ?? 1);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
