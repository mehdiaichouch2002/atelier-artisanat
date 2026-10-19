import type { Tx } from "@/lib/db-types";
import { AppError } from "@/lib/errors";

export interface Settings {
  workshopName: string;
  weekStartDay: number;
}

export async function getSettings(tx: Tx): Promise<Settings> {
  const [r] = await tx<{ workshop_name: string; week_start_day: number }[]>`
    select workshop_name, week_start_day from atelier.settings`;
  return { workshopName: r?.workshop_name ?? "Atelier", weekStartDay: r?.week_start_day ?? 1 };
}

/** The week start day can only change while no pay data exists (pay weeks are keyed by it). */
export async function updateSettings(tx: Tx, input: Settings): Promise<void> {
  const current = await getSettings(tx);
  if (current.weekStartDay !== input.weekStartDay) {
    const [r] = await tx<{ n: number }[]>`
      select (select count(*) from atelier.worker_earnings)
           + (select count(*) from atelier.ledger_entries where pay_week is not null) as n`;
    if ((r?.n ?? 0) > 0) throw new AppError("invalid", "week_start_locked");
  }
  await tx`update atelier.settings set workshop_name = ${input.workshopName}, week_start_day = ${input.weekStartDay}`;
}

export interface Category {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
}

export async function listCategories(tx: Tx, opts: { includeInactive?: boolean } = {}): Promise<Category[]> {
  return tx<Category[]>`
    select id, code, name, active from atelier.categories
    ${opts.includeInactive ? tx`` : tx`where active`}
    order by code is null, created_at`;
}

export async function createCategory(tx: Tx, name: string): Promise<string> {
  const [r] = await tx<{ id: string }[]>`insert into atelier.categories (name) values (${name}) returning id`;
  return r!.id;
}

export async function updateCategory(tx: Tx, input: { id: string; name: string; active: boolean }): Promise<void> {
  await tx`update atelier.categories set name = ${input.name}, active = ${input.active} where id = ${input.id}`;
}

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "manager";
  active: boolean;
  locale: string;
  createdAt: Date;
}

export async function listUsers(tx: Tx): Promise<UserRow[]> {
  return tx<UserRow[]>`
    select id, email, display_name as "displayName", role, active, locale, created_at as "createdAt"
    from atelier.users order by role, display_name`;
}

export async function createUser(
  tx: Tx,
  input: { email: string; displayName: string; role: "owner" | "manager"; passwordHash: string },
): Promise<string> {
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.users (email, display_name, role, password_hash)
    values (${input.email.toLowerCase()}, ${input.displayName}, ${input.role}, ${input.passwordHash})
    returning id`;
  return r!.id;
}

export async function updateUser(
  tx: Tx,
  input: { id: string; displayName: string; role: "owner" | "manager"; active: boolean },
): Promise<void> {
  const r = await tx`
    update atelier.users set display_name = ${input.displayName}, role = ${input.role}, active = ${input.active}
    where id = ${input.id}`;
  if (r.count === 0) throw new AppError("not_found");
}

export interface AuditRow {
  id: number;
  tableName: string;
  recordId: string;
  action: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  userName: string | null;
  at: Date;
}

export async function listAudit(
  tx: Tx,
  opts: { tableName?: string; recordId?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AuditRow[]; total: number }> {
  const where = tx`
    where true
    ${opts.tableName ? tx`and a.table_name = ${opts.tableName}` : tx``}
    ${opts.recordId ? tx`and a.record_id = ${opts.recordId}` : tx``}`;
  const rows = await tx<AuditRow[]>`
    select a.id, a.table_name as "tableName", a.record_id as "recordId", a.action, a.old_data as "oldData",
           a.new_data as "newData", u.display_name as "userName", a.at
    from atelier.audit_log a left join atelier.users u on u.id = a.user_id
    ${where}
    order by a.at desc, a.id desc limit ${opts.limit ?? 50} offset ${opts.offset ?? 0}`;
  const [c] = await tx<{ n: number }[]>`select count(*)::int as n from atelier.audit_log a ${where}`;
  return { rows, total: c?.n ?? 0 };
}
