// DESTRUCTIVE: erases all business data (workers, msrouf, pay, customers, orders, payments, expenses, cash
// movements, counts, attachments, audit log). Keeps user accounts, settings, categories and the default
// cash account. Meant for test/demo databases or a fresh start before real use.
//   MIGRATION_DATABASE_URL=... npm run db:reset            (asks you to type EFFACER)
//   MIGRATION_DATABASE_URL=... npm run db:reset -- --yes   (no question, for scripts)
import readline from "node:readline";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is required");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to run with NODE_ENV/VERCEL_ENV=production.");
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  const host = new URL(url).hostname;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`This deletes ALL workers, orders, payments and cash movements on ${host}.\nType EFFACER to continue: `, resolve),
  );
  rl.close();
  if (answer.trim() !== "EFFACER") {
    console.log("Cancelled, nothing was changed.");
    process.exit(0);
  }
}

const GUARDED = [
  ["ledger_entries", "ledger_immutable"],
  ["worker_earnings", "worker_earnings_guard"],
  ["order_adjustments", "order_adjustments_immutable"],
  ["order_status_history", "order_status_history_immutable"],
  ["cash_counts", "cash_counts_immutable"],
  ["order_lines", "order_lines_guard"],
];

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    for (const [table, trigger] of GUARDED) await tx.unsafe(`alter table atelier.${table} disable trigger ${trigger}`);
    await tx.unsafe(`
      truncate atelier.attachments, atelier.ledger_entries, atelier.cash_counts, atelier.order_adjustments,
        atelier.order_status_history, atelier.order_lines, atelier.orders, atelier.customers,
        atelier.worker_earnings, atelier.worker_arrangements, atelier.workers, atelier.counters, atelier.audit_log;
      delete from atelier.cash_accounts where not is_default;
      delete from atelier.sessions where expires_at < now();
    `);
    for (const [table, trigger] of GUARDED) await tx.unsafe(`alter table atelier.${table} enable trigger ${trigger}`);
  });
  console.log("All business data erased. User accounts and settings were kept.");
} catch (e) {
  console.error("reset failed, nothing was changed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
