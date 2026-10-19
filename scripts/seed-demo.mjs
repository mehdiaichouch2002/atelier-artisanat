// Simple starting data: 5 copperwork (cuivre) workers paid weekly, with NO money movements
// (no msrouf, no payments, no orders). All names are examples; rename them in the app.
// Runs only on a database without workers (use `npm run db:reset` first if needed).
//   MIGRATION_DATABASE_URL=... [DEMO_PASSWORD=...] npm run db:seed
// With DEMO_PASSWORD, also creates/updates demo.owner@example.com and demo.manager@example.com.
import postgres from "postgres";
import { hashPassword } from "./lib.mjs";

const url = process.env.MIGRATION_DATABASE_URL;
const password = process.env.DEMO_PASSWORD;
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}
if (!url) {
  console.error("MIGRATION_DATABASE_URL is required");
  process.exit(1);
}
if (password !== undefined && password.length < 10) {
  console.error("DEMO_PASSWORD must have at least 10 characters");
  process.exit(1);
}

const WORKERS = [
  { code: "C01", full_name: "Ahmed", weekly: 1500 },
  { code: "C02", full_name: "Youssef", weekly: 1400 },
  { code: "C03", full_name: "Mustapha", weekly: 1300 },
  { code: "C04", full_name: "Rachid", weekly: 1200 },
  { code: "C05", full_name: "Hamid", weekly: 1200 },
];

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [{ n }] = await sql`select count(*)::int as n from atelier.workers`;
  if (n > 0) {
    console.error("Workers already exist. Run `npm run db:reset` first to start from an empty workshop.");
    process.exit(1);
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
  await sql.begin(async (tx) => {
    if (password) {
      const hash = await hashPassword(password);
      for (const [email, name, role] of [
        ["demo.owner@example.com", "Propriétaire (démo)", "owner"],
        ["demo.manager@example.com", "Gérant (démo)", "manager"],
      ]) {
        await tx`
          insert into atelier.users (email, display_name, role, password_hash) values (${email}, ${name}, ${role}, ${hash})
          on conflict (email) do update set password_hash = excluded.password_hash, active = true`;
      }
    }
    const [owner] = await tx`select id from atelier.users where role = 'owner' and active order by created_at limit 1`;
    if (!owner) throw new Error("No owner account: run `npm run db:create-owner` or set DEMO_PASSWORD.");
    await tx`select set_config('app.user_id', ${owner.id}, true)`;
    await tx`update atelier.categories set active = (code = 'copper') where code is not null`;
    const [copper] = await tx`select id from atelier.categories where code = 'copper'`;
    for (const w of WORKERS) {
      await tx`
        insert into atelier.workers (code, full_name, category_id, start_date, pay_kind, weekly_amount_cents)
        values (${w.code}, ${w.full_name}, ${copper.id}, ${today}, 'weekly', ${w.weekly * 100})`;
    }
  });
  console.log("5 copper workers created (weekly pay, no money movements).");
  if (password) console.log("Demo logins: demo.owner@example.com / demo.manager@example.com with your DEMO_PASSWORD.");
} catch (e) {
  console.error("seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
