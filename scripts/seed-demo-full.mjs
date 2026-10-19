// Demo data for development and demonstrations only. All names are fictional.
// Refuses to run in production or on a database that already contains business data.
//   MIGRATION_DATABASE_URL=... DEMO_PASSWORD=... npm run db:seed:full
import postgres from "postgres";
import { hashPassword, pgTypes } from "./lib.mjs";

const url = process.env.MIGRATION_DATABASE_URL;
const password = process.env.DEMO_PASSWORD;
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}
if (!url || !password || password.length < 10) {
  console.error("MIGRATION_DATABASE_URL and DEMO_PASSWORD (min. 10 characters) are required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {}, types: pgTypes });

// --- dates in the workshop time zone ---------------------------------------------------------
const tz = "Africa/Casablanca";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d, n) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const monday = (d) => addDays(d, -((dow(d) + 6) % 7));
// Local wall-clock time -> instant (Morocco is UTC+1 most of the year, UTC+0 during Ramadan).
const at = (date, time = "10:00") => {
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(guess);
  const [h, m] = shown.split(":").map(Number);
  const [th, tm] = time.split(":").map(Number);
  return new Date(guess.getTime() - ((h * 60 + m) - (th * 60 + tm)) * 60000);
};
const DH = (n) => Math.round(n * 100);

try {
  const [{ n }] = await sql`
    select (select count(*) from atelier.workers) + (select count(*) from atelier.orders)
         + (select count(*) from atelier.ledger_entries) as n`;
  if (Number(n) > 0) {
    console.error("The database already contains data. Demo seed only runs on an empty database.");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    const [owner] = await tx`
      insert into atelier.users (email, display_name, role, password_hash)
      values ('demo.owner@example.com', 'Propriétaire (démo)', 'owner', ${hash})
      on conflict (email) do update set password_hash = excluded.password_hash returning id`;
    await tx`
      insert into atelier.users (email, display_name, role, password_hash)
      values ('demo.manager@example.com', 'Gérant (démo)', 'manager', ${hash})
      on conflict (email) do update set password_hash = excluded.password_hash`;
    await tx`select set_config('app.user_id', ${owner.id}, true)`;
    await tx`update atelier.settings set workshop_name = 'Atelier Démo', week_start_day = 1`;
    await tx`update atelier.categories set active = true where code in ('babouches', 'copper')`;

    const [cash] = await tx`select id from atelier.cash_accounts where is_default`;
    const [bank] = await tx`insert into atelier.cash_accounts (name, kind) values ('Banque (démo)', 'bank') returning id`;
    const cats = Object.fromEntries((await tx`select code, id from atelier.categories where code is not null`).map((c) => [c.code, c.id]));

    const ref = async (p) => (await tx`select atelier.next_reference(${p}) as r`)[0].r;
    const entry = async (e) => {
      const [row] = await tx`
        insert into atelier.ledger_entries ${tx({
          reference: await ref("TX"),
          method: "cash",
          account_id: cash.id,
          ...e,
        })} returning id`;
      return row.id;
    };

    const start = monday(addDays(today, -28));
    await entry({ entry_type: "opening_balance", direction: "in", amount_cents: DH(8000), occurred_at: at(start, "08:00"), description: "Caisse au démarrage" });
    await entry({ entry_type: "opening_balance", direction: "in", amount_cents: DH(20000), account_id: bank.id, method: "bank_transfer", occurred_at: at(start, "08:05"), description: "Solde bancaire au démarrage" });

    const worker = async (w) => (await tx`insert into atelier.workers ${tx(w)} returning id`)[0].id;
    const hassan = await worker({ code: "B01", full_name: "Hassan Demo", category_id: cats.babouches, start_date: "2022-03-01", pay_kind: "weekly", weekly_amount_cents: DH(1200) });
    const youssef = await worker({ code: "C01", full_name: "Youssef Exemple", category_id: cats.copper, start_date: "2023-09-15", pay_kind: "daily", daily_rate_cents: DH(180), default_days: 6 });
    const khadija = await worker({ code: "B02", full_name: "Khadija Fictive", category_id: cats.babouches, start_date: "2024-01-08", pay_kind: "piece", piece_rate_cents: DH(25) });
    const omar = await worker({ code: "C02", full_name: "Omar Test", category_id: cats.copper, start_date: "2024-06-01", pay_kind: "negotiated" });
    const rachid = await worker({ code: "B03", full_name: "Rachid Ancien", category_id: cats.babouches, start_date: "2021-01-04", pay_kind: "weekly", weekly_amount_cents: DH(1000), active: false });
    void rachid;

    const base = (worker_id, pay_week, basis, amount, quantity = null, rate = null) =>
      tx`insert into atelier.worker_earnings ${tx({ worker_id, pay_week, basis, amount_cents: amount, quantity, rate_cents: rate })}`;
    const advance = (worker_id, pay_week, date, amount, category = "daily", treatment = "wage", expense_category = null, time = "09:30") =>
      entry({ entry_type: "worker_advance", direction: "out", amount_cents: DH(amount), worker_id, pay_week, occurred_at: at(date, time), advance_category: category, advance_treatment: treatment, expense_category });
    const pay = (worker_id, pay_week, date, amount) =>
      entry({ entry_type: "worker_payment", direction: "out", amount_cents: DH(amount), worker_id, pay_week, occurred_at: at(date, "18:00") });

    // Three past weeks, fully or partly settled.
    for (let i = 3; i >= 1; i--) {
      const w = monday(addDays(today, -7 * i));
      const sat = addDays(w, 5);
      await base(hassan, w, "weekly", DH(1200));
      await advance(hassan, w, w, 200);
      await advance(hassan, w, addDays(w, 3), 150, "food_transport");
      await pay(hassan, w, sat, 850);

      await base(youssef, w, "daily", DH(180 * 6), "6.00", DH(180));
      await advance(youssef, w, addDays(w, 1), 300);
      await pay(youssef, w, sat, 780);

      const pieces = 36 + i * 4;
      await base(khadija, w, "piece", DH(25 * pieces), String(pieces) + ".00", DH(25));
      await advance(khadija, w, addDays(w, 2), 100);
      await pay(khadija, w, sat, 25 * pieces - 100 - (i === 1 ? 200 : 0)); // last week: 200 DH still owed

      await base(omar, w, "negotiated", DH(1500));
      await advance(omar, w, addDays(w, 1), 400, "materials", "business", "copper_metal");
      await pay(omar, w, sat, 1500);
    }

    // Current week: advances only, settlement still to do.
    const cw = monday(today);
    await advance(hassan, cw, cw, 200);
    if (today > cw) await advance(hassan, cw, addDays(cw, 1) <= today ? addDays(cw, 1) : cw, 100, "food_transport", "wage", null, "13:00");
    await advance(youssef, cw, cw, 250);
    await advance(khadija, cw, cw, 100, "daily", "wage", null, "11:00");

    // Customers and orders.
    const customer = async (c) => (await tx`insert into atelier.customers ${tx(c)} returning id`)[0].id;
    const riad = await customer({ name: "Riad Démo (hôtel fictif)", phone: "0600000001", notes: "Commandes régulières de babouches pour les chambres." });
    const bazar = await customer({ name: "Bazar Exemple", phone: "0600000002" });
    const laila = await customer({ name: "Mme Laila Test", phone: "0600000003" });
    const hotel = await customer({ name: "Maison d'hôtes Fictive", email: "contact@example.com" });

    const order = async (o, lines, statuses = []) => {
      const [row] = await tx`insert into atelier.orders ${tx({ reference: await ref("CMD"), status: "confirmed", ...o })} returning id`;
      for (const [i, l] of lines.entries()) await tx`insert into atelier.order_lines ${tx({ order_id: row.id, position: i, ...l })}`;
      for (const s of statuses) await tx`update atelier.orders set status = ${s} where id = ${row.id}`;
      return row.id;
    };
    const custPay = (order_id, customer_id, date, amount, method = "cash") =>
      entry({ entry_type: "customer_payment", direction: "in", amount_cents: DH(amount), order_id, customer_id, occurred_at: at(date, "11:00"), method, account_id: method === "cash" ? cash.id : bank.id });

    const o1 = await order(
      { customer_id: riad, order_date: addDays(today, -20), due_date: addDays(today, 5), priority: "high", assigned_worker_id: hassan },
      [
        { category_id: cats.babouches, description: "Babouches cuir jaune, tailles assorties", quantity: 40, unit_price_cents: DH(180) },
        { category_id: cats.babouches, description: "Babouches brodées pour suite", quantity: 4, unit_price_cents: DH(350) },
      ],
      ["in_production"],
    );
    await custPay(o1, riad, addDays(today, -20), 3000, "bank_transfer");

    const o2 = await order(
      { customer_id: bazar, order_date: addDays(today, -25), due_date: addDays(today, -3), priority: "normal", assigned_worker_id: youssef },
      [{ category_id: cats.copper, description: "Plateaux en cuivre ciselé 60 cm", quantity: 6, unit_price_cents: DH(950) }],
      ["in_production", "finishing"],
    );
    await custPay(o2, bazar, addDays(today, -25), 2000);

    const o3 = await order(
      { customer_id: laila, order_date: addDays(today, -15), due_date: addDays(today, -2), assigned_worker_id: youssef },
      [{ category_id: cats.copper, description: "Lanterne en cuivre ajouré", quantity: 2, unit_price_cents: DH(1200) }],
      ["in_production", "ready", "delivered"],
    );
    await custPay(o3, laila, addDays(today, -15), 800);
    await custPay(o3, laila, addDays(today, -2), 1600);

    const o4 = await order(
      { customer_id: hotel, order_date: addDays(today, -4), due_date: addDays(today, 12), status: "quote" },
      [{ category_id: cats.babouches, description: "Babouches personnalisées avec logo", quantity: 25, unit_price_cents: DH(220) }],
    );
    void o4;

    const o5 = await order(
      { customer_id: bazar, order_date: addDays(today, -10), due_date: addDays(today, 2), assigned_worker_id: khadija },
      [{ category_id: cats.babouches, description: "Babouches enfant, couleurs variées", quantity: 30, unit_price_cents: DH(90) }],
      ["in_production", "ready"],
    );
    await custPay(o5, bazar, addDays(today, -10), 1000);

    // Expenses.
    const expense = (date, amount, expense_category, description, supplier = null, account_id = cash.id) =>
      entry({ entry_type: "expense", direction: "out", amount_cents: DH(amount), expense_category, description, supplier, occurred_at: at(date, "15:00"), account_id, method: account_id === cash.id ? "cash" : "bank_transfer" });
    await expense(addDays(today, -21), 2400, "leather_soles", "Peaux de chèvre tannées", "Tannerie (exemple)");
    await expense(addDays(today, -18), 3100, "copper_metal", "Feuilles de cuivre", "Fournisseur métaux (exemple)", bank.id);
    await expense(addDays(today, -14), 2500, "rent", "Loyer de l'atelier", null, bank.id);
    await expense(addDays(today, -9), 420, "utilities", "Électricité et eau");
    await expense(addDays(today, -6), 180, "thread_accessories", "Fil de soie et aiguilles");
    await expense(addDays(today, -3), 150, "transport", "Livraison au client");

    // A bank deposit (transfer) and a cash count matching the calculation.
    const [g] = await tx`select gen_random_uuid() as g`;
    await entry({ entry_type: "transfer", direction: "out", amount_cents: DH(3000), transfer_group: g.g, occurred_at: at(addDays(today, -7), "17:00"), method: "other", description: "Dépôt en banque" });
    await entry({ entry_type: "transfer", direction: "in", amount_cents: DH(3000), transfer_group: g.g, account_id: bank.id, occurred_at: at(addDays(today, -7), "17:00"), method: "other", description: "Dépôt en banque" });
  });
  console.log("Demo data created.");
  console.log("Sign in with demo.owner@example.com or demo.manager@example.com and the DEMO_PASSWORD you provided.");
} catch (e) {
  console.error("seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
