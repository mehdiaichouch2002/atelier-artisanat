import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDateTimeToInstant } from "@/lib/dates";
import { createCustomer, findSimilarCustomers, getCustomer } from "@/domain/customers/service";
import {
  addOrderAdjustment,
  changeStatus,
  createOrder,
  getOrder,
  orderBalance,
  recordCustomerPayment,
  recordRefund,
  updateOrder,
} from "@/domain/orders/service";
import { TRANSITIONS, ORDER_STATUSES } from "@/domain/orders/logic";
import {
  accountBalances,
  allEntries,
  createAccount,
  recordCashCount,
  recordTransfer,
  reverseEntry,
} from "@/domain/ledger/service";
import { cashFlow, expensesByCategory } from "@/domain/ledger/logic";
import { recordExpense, recordSimpleEntry } from "@/domain/expenses/service";
import { createWorker } from "@/domain/workers/service";
import { recordAdvance, recordSettlementPayment } from "@/domain/payroll/service";
import { buildReport, dashboard } from "@/domain/reports/service";
import { admin, app, asUser, createUser, defaultAccount, key, resetData } from "./helpers";

let owner: string;
let manager: string;
let account: string;
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

async function customerAndOrder(user: string) {
  return asUser(user, async (tx) => {
    const c = await createCustomer(tx, { name: "Riad Yasmine", phone: "+212 6 12 34 56 78", email: null, address: null, notes: null });
    const o = await createOrder(tx, {
      customerId: c,
      orderDate: "2026-10-01",
      dueDate: "2026-10-20",
      priority: "normal",
      assignedWorkerId: null,
      notes: null,
      status: "quote",
      lines: [
        { categoryId: null, description: "Babouches cuir jaune", quantity: 20, unitPriceCents: 25000 },
        { categoryId: null, description: "Plateau cuivre", quantity: 2, unitPriceCents: 120000 },
      ],
    });
    return { c, o };
  });
}

describe("orders", () => {
  it("tracks deposit, payments, status changes and balance", async () => {
    const { c, o } = await customerAndOrder(manager);
    let b = await asUser(manager, (tx) => orderBalance(tx, o));
    expect(b.dueCents).toBe(20 * 25000 + 2 * 120000); // 740 000
    await asUser(manager, (tx) => changeStatus(tx, { orderId: o, to: "confirmed" }));
    await asUser(manager, (tx) =>
      recordCustomerPayment(tx, { orderId: o, amountCents: 200000, occurredAt: at("2026-10-01T11:00"), accountId: account, method: "cash", idempotencyKey: key() }),
    );
    b = await asUser(manager, (tx) => orderBalance(tx, o));
    expect(b.paymentState).toBe("deposit"); // a deposit never means paid
    expect(b.balanceCents).toBe(540000);
    for (const s of ["in_production", "finishing", "ready"] as const) {
      await asUser(manager, (tx) => changeStatus(tx, { orderId: o, to: s }));
    }
    await expect(
      asUser(manager, (tx) =>
        recordCustomerPayment(tx, { orderId: o, amountCents: 540001, occurredAt: at("2026-10-19T11:00"), accountId: account, method: "cash" }),
      ),
    ).rejects.toMatchObject({ code: "overpayment" });
    await asUser(manager, (tx) =>
      recordCustomerPayment(tx, { orderId: o, amountCents: 540000, occurredAt: at("2026-10-19T11:00"), accountId: account, method: "bank_transfer" }),
    );
    await asUser(manager, (tx) => changeStatus(tx, { orderId: o, to: "delivered" }));
    const detail = (await asUser(manager, (tx) => getOrder(tx, o)))!;
    expect(detail.money).toMatchObject({ dueCents: 740000, paidCents: 740000, balanceCents: 0, paymentState: "paid" });
    expect(detail.history.map((h) => h.toStatus)).toEqual(["quote", "confirmed", "in_production", "finishing", "ready", "delivered"]);
    const customer = (await asUser(manager, (tx) => getCustomer(tx, c)))!;
    expect(customer.balanceCents).toBe(0);
    expect(customer.paidCents).toBe(740000);
  });

  it("enforces status transitions in the database exactly like the domain table", async () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const [r] = await admin<{ ok: boolean }[]>`select atelier.order_transition_allowed(${from}, ${to}) as ok`;
        expect([from, to, r!.ok]).toEqual([from, to, TRANSITIONS[from].includes(to)]);
      }
    }
    const { o } = await customerAndOrder(owner);
    await expect(asUser(owner, (tx) => changeStatus(tx, { orderId: o, to: "delivered" }))).rejects.toMatchObject({ code: "invalid" });
    await expect(admin`update atelier.orders set status = 'delivered' where id = ${o}`).rejects.toMatchObject({ code: "23514" });
  });

  it("locks lines once production starts; later price changes are documented adjustments", async () => {
    const { c, o } = await customerAndOrder(owner);
    await asUser(owner, (tx) => changeStatus(tx, { orderId: o, to: "confirmed" }));
    await asUser(owner, (tx) =>
      updateOrder(tx, o, {
        customerId: c, orderDate: "2026-10-01", dueDate: "2026-10-25", priority: "high", assignedWorkerId: null, notes: "x",
        lines: [{ categoryId: null, description: "Babouches", quantity: 10, unitPriceCents: 25000 }],
      }),
    );
    expect((await asUser(owner, (tx) => orderBalance(tx, o))).dueCents).toBe(250000);
    await asUser(owner, (tx) => changeStatus(tx, { orderId: o, to: "in_production" }));
    await expect(admin`delete from atelier.order_lines where order_id = ${o}`).rejects.toMatchObject({ code: "23514" });
    await asUser(manager, (tx) => addOrderAdjustment(tx, { orderId: o, amountCents: -10000, reason: "Remise fidélité" }));
    expect((await asUser(owner, (tx) => orderBalance(tx, o))).dueCents).toBe(240000);
  });

  it("cancels a paid order keeping history; refund is explicit, owner-only and capped", async () => {
    const { o } = await customerAndOrder(owner);
    await asUser(owner, (tx) => changeStatus(tx, { orderId: o, to: "confirmed" }));
    await asUser(owner, (tx) =>
      recordCustomerPayment(tx, { orderId: o, amountCents: 100000, occurredAt: at("2026-10-02T10:00"), accountId: account, method: "cash" }),
    );
    await asUser(owner, (tx) => changeStatus(tx, { orderId: o, to: "cancelled", cancellationFeeCents: 20000 }));
    let b = await asUser(owner, (tx) => orderBalance(tx, o));
    expect(b).toMatchObject({ dueCents: 20000, paidCents: 100000, balanceCents: -80000, paymentState: "credit" });
    await expect(
      asUser(owner, (tx) =>
        recordCustomerPayment(tx, { orderId: o, amountCents: 100, occurredAt: at("2026-10-03T10:00"), accountId: account, method: "cash" }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      asUser(manager, (tx) =>
        recordRefund(tx, { orderId: o, amountCents: 80000, occurredAt: at("2026-10-03T10:00"), accountId: account, method: "cash", note: "annulation" }),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(owner, (tx) =>
        recordRefund(tx, { orderId: o, amountCents: 100001, occurredAt: at("2026-10-03T10:00"), accountId: account, method: "cash", note: "annulation" }),
      ),
    ).rejects.toMatchObject({ code: "overpayment" });
    await asUser(owner, (tx) =>
      recordRefund(tx, { orderId: o, amountCents: 80000, occurredAt: at("2026-10-03T10:00"), accountId: account, method: "cash", note: "annulation" }),
    );
    b = await asUser(owner, (tx) => orderBalance(tx, o));
    expect(b).toMatchObject({ balanceCents: 0, refundedCents: 80000 });
    const d = (await asUser(owner, (tx) => getOrder(tx, o)))!;
    expect(d.payments).toHaveLength(2);
  });

  it("warns about duplicate customers by phone or name", async () => {
    await customerAndOrder(owner);
    const similar = await asUser(owner, (tx) => findSimilarCustomers(tx, { name: "Autre nom", phone: "06 12 34 56 78" }));
    expect(similar).toHaveLength(1);
    const byName = await asUser(owner, (tx) => findSimilarCustomers(tx, { name: "  riad yasmine ", phone: null }));
    expect(byName).toHaveLength(1);
  });

  it("creates an order only once for the same idempotency key", async () => {
    const k = key();
    const ids = await asUser(owner, async (tx) => {
      const c = await createCustomer(tx, { name: "A", phone: null, email: null, address: null, notes: null });
      const input = {
        customerId: c, orderDate: "2026-10-01", dueDate: null, priority: "normal" as const, assignedWorkerId: null,
        notes: null, status: "quote" as const, lines: [{ categoryId: null, description: "x", quantity: 1, unitPriceCents: 100 }],
      };
      return [await createOrder(tx, input, k), await createOrder(tx, input, k)];
    });
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("ledger and cash", () => {
  it("scenario C: opening balance, customer payment, advance, settlement, expense — no double counting", async () => {
    const w = await asUser(owner, (tx) =>
      createWorker(tx, {
        code: "A1", fullName: "Said", phone: null, categoryId: null, startDate: "2026-01-01", notes: null,
        payKind: "weekly", weeklyAmountCents: 100000, dailyRateCents: null, pieceRateCents: null, defaultDays: null,
      }),
    );
    const { o } = await customerAndOrder(owner);
    await asUser(owner, async (tx) => {
      await recordSimpleEntry(tx, { entryType: "opening_balance", direction: "in", amountCents: 500000, occurredAt: at("2026-10-12T07:00"), accountId: account, method: "cash", description: "Ouverture" });
      await changeStatus(tx, { orderId: o, to: "confirmed" });
      await recordCustomerPayment(tx, { orderId: o, amountCents: 300000, occurredAt: at("2026-10-12T10:00"), accountId: account, method: "cash" });
      await recordAdvance(tx, { workerId: w, amountCents: 20000, occurredAt: at("2026-10-13T09:00"), category: "daily", treatment: "wage", accountId: account, method: "cash" });
      await recordSettlementPayment(tx, { workerId: w, payWeek: "2026-10-12", amountCents: 80000, occurredAt: at("2026-10-17T17:00"), accountId: account, method: "cash" });
      await recordExpense(tx, { amountCents: 45000, occurredAt: at("2026-10-14T12:00"), category: "leather_soles", description: "Cuir", accountId: account, method: "cash" });
    });
    const balances = await asUser(owner, (tx) => accountBalances(tx));
    // 5000 + 3000 − 200 − 800 − 450 = 6550 DH
    expect(balances.find((b) => b.accountId === account)!.balanceCents).toBe(655000);
    const entries = await asUser(owner, (tx) => allEntries(tx, {}));
    const byCat = expensesByCategory(entries);
    expect([...byCat.values()].reduce((a, b) => a + b, 0)).toBe(45000); // advance is NOT an expense
    const flow = cashFlow(entries);
    expect(flow.netCents).toBe(655000);
    // Worker fully settled: 1000 − 200 advance − 800 payment.
    const [wb] = await admin<{ b: number }[]>`select balance_cents as b from atelier.v_worker_balances where worker_id = ${w}`;
    expect(wb!.b).toBe(0);

    const period = { key: "custom" as const, from: "2026-10-12", to: "2026-10-18" };
    const dash = await asUser(owner, (tx) => dashboard(tx, period, "2026-10-18"));
    expect(dash).toMatchObject({
      cashBalanceCents: 655000,
      customerPaymentsCents: 300000,
      wageAdvancesCents: 20000,
      workerPaymentsCents: 80000,
      expensesCents: 45000,
      workerLiabilitiesCents: 0,
      receivablesCents: 740000 - 300000,
    });
    const report = await asUser(owner, (tx) => buildReport(tx, "cash-flow", { period }));
    expect(report.totals).toMatchObject({ openingCents: 0, inCents: 800000, outCents: 145000, closingCents: 655000 });

    // Reconciliation: counted 6500 DH → explicit −50 DH adjustment, nothing overwritten.
    await expect(
      asUser(manager, (tx) => recordCashCount(tx, { accountId: account, countedCents: 650000, adjust: true, note: "écart" })),
    ).rejects.toMatchObject({ code: "42501" });
    const res = await asUser(owner, (tx) =>
      recordCashCount(tx, { accountId: account, countedCents: 650000, adjust: true, note: "écart caisse", idempotencyKey: key() }),
    );
    expect(res.count.differenceCents).toBe(-5000);
    expect(res.adjustment).toMatchObject({ entryType: "adjustment", direction: "out", amountCents: 5000 });
    const after = await asUser(owner, (tx) => accountBalances(tx));
    expect(after.find((b) => b.accountId === account)!.balanceCents).toBe(650000);
  });

  it("transfers are neither income nor expense and can be reversed as a pair", async () => {
    const bank = await asUser(owner, (tx) => createAccount(tx, { name: "Banque", kind: "bank" }));
    await asUser(owner, (tx) => recordSimpleEntry(tx, { entryType: "opening_balance", direction: "in", amountCents: 100000, occurredAt: at("2026-10-12T07:00"), accountId: account, method: "cash", description: null }));
    const legs = await asUser(owner, (tx) =>
      recordTransfer(tx, { fromAccountId: account, toAccountId: bank, amountCents: 60000, occurredAt: at("2026-10-12T08:00"), idempotencyKey: key() }),
    );
    expect(legs).toHaveLength(2);
    let bal = await asUser(owner, (tx) => accountBalances(tx));
    expect(bal.find((b) => b.accountId === account)!.balanceCents).toBe(40000);
    expect(bal.find((b) => b.accountId === bank)!.balanceCents).toBe(60000);
    const entries = await asUser(owner, (tx) => allEntries(tx, {}));
    expect(cashFlow(entries, { excludeTransfers: true }).netCents).toBe(100000);
    await asUser(owner, (tx) => reverseEntry(tx, { entryId: legs[1]!.id, reason: "erreur" }));
    bal = await asUser(owner, (tx) => accountBalances(tx));
    expect(bal.find((b) => b.accountId === account)!.balanceCents).toBe(100000);
    expect(bal.find((b) => b.accountId === bank)!.balanceCents).toBe(0);
    await expect(
      asUser(manager, (tx) => recordTransfer(tx, { fromAccountId: account, toAccountId: bank, amountCents: 1, occurredAt: new Date() })),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps ledger rows immutable, even for the schema owner", async () => {
    const e = await asUser(owner, (tx) =>
      recordExpense(tx, { amountCents: 100, occurredAt: new Date(), category: "other", description: "x", accountId: account, method: "cash" }),
    );
    await expect(admin`update atelier.ledger_entries set amount_cents = 1 where id = ${e.id}`).rejects.toMatchObject({ code: "42501" });
    await expect(admin`delete from atelier.ledger_entries where id = ${e.id}`).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects entries that break the type rules", async () => {
    await expect(
      admin`insert into atelier.ledger_entries (reference, entry_type, direction, amount_cents, account_id, occurred_at, expense_category, created_by)
            values ('X-1', 'expense', 'in', 100, ${account}, now(), 'other', ${owner})`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      admin`insert into atelier.ledger_entries (reference, entry_type, direction, amount_cents, account_id, occurred_at, created_by)
            values ('X-2', 'expense', 'out', 0, ${account}, now(), ${owner})`,
    ).rejects.toMatchObject({ code: "23514" });
  });
});
