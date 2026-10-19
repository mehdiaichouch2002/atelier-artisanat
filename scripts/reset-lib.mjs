// Shared by `npm run db:reset` and the one-time production clean-up in vercel-build.
const GUARDED = [
  ["ledger_entries", "ledger_immutable"],
  ["worker_earnings", "worker_earnings_guard"],
  ["order_adjustments", "order_adjustments_immutable"],
  ["order_status_history", "order_status_history_immutable"],
  ["cash_counts", "cash_counts_immutable"],
  ["order_lines", "order_lines_guard"],
];

export const DEMO_EMAILS = ["demo.owner@example.com", "demo.manager@example.com"];

/**
 * Erases all business data inside the given transaction: workers, pay, msrouf, customers, orders, payments,
 * expenses, cash movements and counts, attachments, audit log. Keeps settings, categories, the default cash
 * account and (unless removeDemoUsers) all user accounts.
 */
export async function eraseBusinessData(tx, { removeDemoUsers = false } = {}) {
  for (const [table, trigger] of GUARDED) await tx.unsafe(`alter table atelier.${table} disable trigger ${trigger}`);
  await tx.unsafe(`
    truncate atelier.attachments, atelier.ledger_entries, atelier.cash_counts, atelier.order_adjustments,
      atelier.order_status_history, atelier.order_lines, atelier.orders, atelier.customers,
      atelier.worker_earnings, atelier.worker_arrangements, atelier.workers, atelier.counters, atelier.audit_log;
    delete from atelier.cash_accounts where not is_default;
    update atelier.cash_accounts set created_by = null;
    delete from atelier.sessions where expires_at < now();
    delete from atelier.login_attempts;
  `);
  for (const [table, trigger] of GUARDED) await tx.unsafe(`alter table atelier.${table} enable trigger ${trigger}`);
  if (removeDemoUsers) {
    await tx`update atelier.settings set updated_by = null`;
    await tx`delete from atelier.users where email in ${tx(DEMO_EMAILS)} and not is_super_admin`;
  }
}
