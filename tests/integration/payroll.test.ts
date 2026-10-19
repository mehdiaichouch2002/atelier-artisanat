import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDateTimeToInstant } from "@/lib/dates";
import { createWorker } from "@/domain/workers/service";
import {
  carryBalanceForward,
  recordAdjustment,
  recordAdvance,
  recordBasePay,
  recordSettlementPayment,
  settlementSheet,
  voidEarning,
  weekComponents,
  workerWeeks,
} from "@/domain/payroll/service";
import { summarizeWeek } from "@/domain/payroll/logic";
import { reverseEntry } from "@/domain/ledger/service";
import { admin, app, asUser, createUser, defaultAccount, key, resetData } from "./helpers";

let owner: string;
let manager: string;
let account: string;
const WEEK = "2026-10-12"; // Monday

async function newWorker(userId: string, overrides: Partial<Parameters<typeof createWorker>[1]> = {}) {
  return asUser(userId, (tx) =>
    createWorker(tx, {
      code: null,
      fullName: "Hassan Test",
      phone: null,
      categoryId: null,
      startDate: "2026-01-05",
      notes: null,
      payKind: "weekly",
      weeklyAmountCents: 150000,
      dailyRateCents: null,
      pieceRateCents: null,
      defaultDays: null,
      ...overrides,
    }),
  );
}

const at = (local: string) => localDateTimeToInstant(local);

beforeAll(async () => {
  owner = await createUser("owner");
  manager = await createUser("manager");
});
beforeEach(async () => {
  await resetData();
  account = await defaultAccount();
});
afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("weekly settlement", () => {
  it("handles Monday + Thursday advances, a partial payment and the final balance", async () => {
    const w = await newWorker(manager);
    await asUser(manager, async (tx) => {
      await recordAdvance(tx, {
        workerId: w, amountCents: 20000, occurredAt: at("2026-10-12T09:00"), category: "daily", treatment: "wage",
        accountId: account, method: "cash", idempotencyKey: key(),
      });
      await recordAdvance(tx, {
        workerId: w, amountCents: 15000, occurredAt: at("2026-10-15T18:30"), category: "food_transport",
        treatment: "wage", accountId: account, method: "cash", idempotencyKey: key(),
      });
    });
    const sheet = await asUser(manager, (tx) => settlementSheet(tx, WEEK));
    const row = sheet.find((r) => r.workerId === w)!;
    expect(row.week.hasBase).toBe(true); // proposal applied for display
    expect(row.week.remainingCents).toBe(150000 - 35000);

    const payKey = key();
    await asUser(manager, (tx) =>
      recordSettlementPayment(tx, {
        workerId: w, payWeek: WEEK, amountCents: 50000, occurredAt: at("2026-10-17T17:00"), accountId: account,
        method: "cash", idempotencyKey: payKey,
      }),
    );
    // Same request again (double click / retry): no second payment.
    await asUser(manager, (tx) =>
      recordSettlementPayment(tx, {
        workerId: w, payWeek: WEEK, amountCents: 50000, occurredAt: at("2026-10-17T17:00"), accountId: account,
        method: "cash", idempotencyKey: payKey,
      }),
    );
    let week = summarizeWeek(await asUser(manager, (tx) => weekComponents(tx, w, WEEK)));
    expect(week).toMatchObject({ baseCents: 150000, wageAdvancesCents: 35000, paymentsCents: 50000, remainingCents: 65000, status: "partial" });

    await expect(
      asUser(manager, (tx) =>
        recordSettlementPayment(tx, {
          workerId: w, payWeek: WEEK, amountCents: 65001, occurredAt: at("2026-10-17T17:05"), accountId: account,
          method: "cash", idempotencyKey: key(),
        }),
      ),
    ).rejects.toMatchObject({ code: "overpayment" });

    await asUser(manager, (tx) =>
      recordSettlementPayment(tx, {
        workerId: w, payWeek: WEEK, amountCents: 65000, occurredAt: at("2026-10-17T17:10"), accountId: account,
        method: "cash", idempotencyKey: key(),
      }),
    );
    week = summarizeWeek(await asUser(manager, (tx) => weekComponents(tx, w, WEEK)));
    expect(week.remainingCents).toBe(0);
    expect(week.status).toBe("settled");

    const [{ n }] = await admin<{ n: number }[]>`
      select count(*)::int as n from atelier.ledger_entries where worker_id = ${w} and entry_type = 'worker_payment'`;
    expect(n).toBe(2);
    const [{ base }] = await admin<{ base: number }[]>`
      select count(*)::int as base from atelier.worker_earnings where worker_id = ${w}`;
    expect(base).toBe(1);
  });

  it("allocates an advance to the pay week of its local date (Sunday night belongs to that week)", async () => {
    const w = await newWorker(owner);
    // Sunday 2026-10-18 23:30 in Casablanca is still the week of Monday 12th.
    const e = await asUser(owner, (tx) =>
      recordAdvance(tx, {
        workerId: w, amountCents: 1000, occurredAt: at("2026-10-18T23:30"), category: "daily", treatment: "wage",
        accountId: account, method: "cash",
      }),
    );
    expect(e.payWeek).toBe(WEEK);
  });

  it("never deducts business advances from pay but counts them once in cash", async () => {
    const w = await newWorker(owner);
    await asUser(owner, (tx) =>
      recordAdvance(tx, {
        workerId: w, amountCents: 40000, occurredAt: at("2026-10-13T10:00"), category: "materials",
        treatment: "business", accountId: account, method: "cash",
      }),
    );
    const c = await asUser(owner, (tx) => weekComponents(tx, w, WEEK));
    expect(c.wageAdvancesCents).toBe(0);
    expect(c.businessAdvancesCents).toBe(40000);
    const [{ expense_category }] = await admin<{ expense_category: string }[]>`
      select expense_category from atelier.ledger_entries where worker_id = ${w}`;
    expect(expense_category).toBe("materials");
  });

  it("refuses a second base pay for the same week (database constraint and service)", async () => {
    const w = await newWorker(owner);
    await asUser(owner, (tx) => recordBasePay(tx, { workerId: w, payWeek: WEEK }));
    await expect(asUser(owner, (tx) => recordBasePay(tx, { workerId: w, payWeek: WEEK }))).rejects.toMatchObject({
      code: "duplicate",
    });
    await expect(
      admin`insert into atelier.worker_earnings (worker_id, pay_week, basis, amount_cents, created_by)
            values (${w}, ${WEEK}, 'negotiated', 100, ${owner})`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("computes daily and piece-rate pay and rejects pay weeks that do not start on the configured day", async () => {
    const d = await newWorker(owner, { payKind: "daily", weeklyAmountCents: null, dailyRateCents: 12000, defaultDays: "6" });
    const p = await newWorker(owner, { payKind: "piece", weeklyAmountCents: null, pieceRateCents: 2550 });
    await asUser(owner, (tx) => recordBasePay(tx, { workerId: d, payWeek: WEEK, quantity: "5.5" }));
    await asUser(owner, (tx) => recordBasePay(tx, { workerId: p, payWeek: WEEK, quantity: "40" }));
    expect((await asUser(owner, (tx) => weekComponents(tx, d, WEEK))).baseCents).toBe(66000);
    expect((await asUser(owner, (tx) => weekComponents(tx, p, WEEK))).baseCents).toBe(102000);
    await expect(asUser(owner, (tx) => recordBasePay(tx, { workerId: d, payWeek: "2026-10-14" }))).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("carries a balance forward without changing the worker's overall balance", async () => {
    const w = await newWorker(owner);
    await asUser(owner, (tx) =>
      recordSettlementPayment(tx, {
        workerId: w, payWeek: WEEK, amountCents: 100000, occurredAt: at("2026-10-17T12:00"), accountId: account, method: "cash",
      }),
    );
    const before = await admin<{ b: number }[]>`select balance_cents as b from atelier.v_worker_balances where worker_id = ${w}`;
    expect(before[0]!.b).toBe(50000);
    const res = await asUser(owner, (tx) => carryBalanceForward(tx, { workerId: w, payWeek: WEEK }));
    expect(res).toEqual({ carriedCents: 50000, toWeek: "2026-10-19" });
    const weeks = await asUser(owner, (tx) => workerWeeks(tx, w));
    expect(weeks.find((x) => x.payWeek === WEEK)!.remainingCents).toBe(0);
    expect(weeks.find((x) => x.payWeek === "2026-10-19")!.remainingCents).toBe(50000);
    const after = await admin<{ b: number }[]>`select balance_cents as b from atelier.v_worker_balances where worker_id = ${w}`;
    expect(after[0]!.b).toBe(50000);
    // Carrying again is a no-op: week W is now at zero.
    expect(await asUser(owner, (tx) => carryBalanceForward(tx, { workerId: w, payWeek: WEEK }))).toBeNull();
  });

  it("restores the balance when an advance is reversed, and refuses a double reversal", async () => {
    const w = await newWorker(owner);
    const adv = await asUser(owner, (tx) =>
      recordAdvance(tx, {
        workerId: w, amountCents: 30000, occurredAt: at("2026-10-13T08:00"), category: "daily", treatment: "wage",
        accountId: account, method: "cash",
      }),
    );
    await asUser(owner, (tx) => reverseEntry(tx, { entryId: adv.id, reason: "erreur de saisie" }));
    const c = await asUser(owner, (tx) => weekComponents(tx, w, WEEK));
    expect(c.wageAdvancesCents).toBe(0);
    await expect(asUser(owner, (tx) => reverseEntry(tx, { entryId: adv.id, reason: "again" }))).rejects.toMatchObject({
      code: "conflict",
    });
    // Managers cannot reverse.
    const adv2 = await asUser(owner, (tx) =>
      recordAdvance(tx, {
        workerId: w, amountCents: 100, occurredAt: at("2026-10-13T08:00"), category: "daily", treatment: "wage",
        accountId: account, method: "cash",
      }),
    );
    await expect(asUser(manager, (tx) => reverseEntry(tx, { entryId: adv2.id, reason: "x" }))).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("serialises concurrent settlement payments so the week cannot be overpaid", async () => {
    const w = await newWorker(owner);
    const attempt = () =>
      asUser(owner, (tx) =>
        recordSettlementPayment(tx, {
          workerId: w, payWeek: WEEK, amountCents: 100000, occurredAt: at("2026-10-17T12:00"), accountId: account,
          method: "cash", idempotencyKey: key(),
        }),
      );
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const c = summarizeWeek(await asUser(owner, (tx) => weekComponents(tx, w, WEEK)));
    expect(c.paymentsCents).toBe(100000);
    expect(c.remainingCents).toBe(50000);
  });

  it("supports bonuses, corrections and owner-only voiding with audit", async () => {
    const w = await newWorker(owner);
    const base = await asUser(owner, (tx) => recordBasePay(tx, { workerId: w, payWeek: WEEK }));
    await asUser(manager, (tx) =>
      recordAdjustment(tx, { workerId: w, payWeek: WEEK, basis: "bonus", amountCents: 10000, note: "Prime Aïd" }),
    );
    await asUser(manager, (tx) =>
      recordAdjustment(tx, { workerId: w, payWeek: WEEK, basis: "adjustment", amountCents: -5000, note: "Absence" }),
    );
    expect(summarizeWeek(await asUser(owner, (tx) => weekComponents(tx, w, WEEK))).dueCents).toBe(155000);
    await expect(asUser(manager, (tx) => voidEarning(tx, { id: base, reason: "x" }))).rejects.toBeTruthy();
    await asUser(owner, (tx) => voidEarning(tx, { id: base, reason: "mauvais montant" }));
    expect(summarizeWeek(await asUser(owner, (tx) => weekComponents(tx, w, WEEK))).dueCents).toBe(5000);
    // A new base pay can be recorded after voiding.
    await asUser(owner, (tx) => recordBasePay(tx, { workerId: w, payWeek: WEEK, amountCents: 120000 }));
    const c = await asUser(owner, (tx) => weekComponents(tx, w, WEEK));
    expect(c.baseCents).toBe(120000);
    const audit = await admin`select * from atelier.audit_log where table_name = 'worker_earnings' and action = 'update'`;
    expect(audit.length).toBe(1);
    await expect(admin`delete from atelier.worker_earnings where id = ${base}`).rejects.toMatchObject({ code: "42501" });
  });

  it("does not accept advances or payments for inactive workers", async () => {
    const w = await newWorker(owner);
    await admin`update atelier.workers set active = false where id = ${w}`;
    await expect(
      asUser(owner, (tx) =>
        recordAdvance(tx, {
          workerId: w, amountCents: 100, occurredAt: at("2026-10-13T08:00"), category: "daily", treatment: "wage",
          accountId: account, method: "cash",
        }),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
