import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db-types";
import { TEST_ADMIN_URL, TEST_APP_URL } from "./env";

const types = {
  bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
  date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
};

export const admin = postgres(TEST_ADMIN_URL, { max: 2, onnotice: () => {}, types });
export const app = postgres(TEST_APP_URL, { max: 4, onnotice: () => {}, types });

/** Runs fn as the given user through the restricted app role (RLS applies). */
export function asUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    if (userId) await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

export async function createUser(role: "owner" | "manager", active = true): Promise<string> {
  const [u] = await admin<{ id: string }[]>`
    insert into atelier.users (email, display_name, role, active, password_hash)
    values (${`${role}-${randomUUID()}@test.local`}, ${`${role} test`}, ${role}, ${active}, 'scrypt$x')
    returning id`;
  return u!.id;
}

/** Empties all business data (keeps users, settings, categories and the default account). */
export async function resetData() {
  await admin.unsafe(`
    alter table atelier.ledger_entries disable trigger ledger_immutable;
    alter table atelier.worker_earnings disable trigger worker_earnings_guard;
    alter table atelier.order_adjustments disable trigger order_adjustments_immutable;
    alter table atelier.order_status_history disable trigger order_status_history_immutable;
    alter table atelier.cash_counts disable trigger cash_counts_immutable;
    alter table atelier.order_lines disable trigger order_lines_guard;
    truncate atelier.attachments, atelier.ledger_entries, atelier.cash_counts, atelier.order_adjustments,
      atelier.order_status_history, atelier.order_lines, atelier.orders, atelier.customers,
      atelier.worker_earnings, atelier.worker_arrangements, atelier.workers, atelier.counters, atelier.audit_log;
    delete from atelier.cash_accounts where not is_default;
    update atelier.settings set week_start_day = 1;
    alter table atelier.ledger_entries enable trigger ledger_immutable;
    alter table atelier.worker_earnings enable trigger worker_earnings_guard;
    alter table atelier.order_adjustments enable trigger order_adjustments_immutable;
    alter table atelier.order_status_history enable trigger order_status_history_immutable;
    alter table atelier.cash_counts enable trigger cash_counts_immutable;
    alter table atelier.order_lines enable trigger order_lines_guard;
  `);
}

export async function defaultAccount(): Promise<string> {
  const [a] = await admin<{ id: string }[]>`select id from atelier.cash_accounts where is_default`;
  return a!.id;
}

export const key = () => randomUUID();
