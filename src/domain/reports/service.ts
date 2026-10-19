// Dashboard metrics and reports. Every figure is computed from source rows (ledger entries,
// earnings, orders). Cash movement, recorded sales, receivables, worker liabilities and expenses are
// kept as separate figures and are never merged into a "profit".
import type { Tx } from "@/lib/db-types";
import { periodBounds, todayLocal, addDays, type Period } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import { accountBalances, allEntries, listCashCounts, listEntries, type LedgerEntry } from "@/domain/ledger/service";
import { cashFlow, expensesByCategory, naturalAmount, EXPENSE_CATEGORIES, ENTRY_TYPES } from "@/domain/ledger/logic";
import { listOrders } from "@/domain/orders/service";
import { OPEN_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/domain/orders/logic";
import { settlementSheet } from "@/domain/payroll/service";
import { weeklyOverview } from "@/domain/payroll/logic";

export interface DashboardData {
  activeWorkers: number;
  ordersByStatus: Record<OrderStatus, number>;
  overdueOrders: number;
  customerPaymentsCents: Cents;
  receivablesCents: Cents;
  customerCreditsCents: Cents;
  recordedSalesCents: Cents;
  recordedSalesCount: number;
  wageAdvancesCents: Cents;
  businessAdvancesCents: Cents;
  workerPaymentsCents: Cents;
  expensesCents: Cents;
  workerLiabilitiesCents: Cents;
  cashInCents: Cents;
  cashOutCents: Cents;
  cashBalanceCents: Cents;
  accounts: { accountId: string; name: string; balanceCents: Cents }[];
  recentEntries: LedgerEntry[];
  recentActivity: { orderId: string; reference: string; customerName: string; toStatus: OrderStatus; changedAt: Date }[];
  upcoming: Awaited<ReturnType<typeof listOrders>>["rows"];
  isEmpty: boolean;
}

export async function dashboard(tx: Tx, period: Period, today = todayLocal()): Promise<DashboardData> {
  const { start, end } = periodBounds(period);
  const [w] = await tx<{ n: number }[]>`select count(*)::int as n from atelier.workers where active`;
  const statusRows = await tx<{ status: OrderStatus; n: number }[]>`
    select status, count(*)::int as n from atelier.orders group by status`;
  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const r of statusRows) ordersByStatus[r.status] = r.n;
  const [overdue] = await tx<{ n: number }[]>`
    select count(*)::int as n from atelier.orders
    where due_date < ${today} and status not in ('delivered', 'cancelled')`;
  const [recv] = await tx<{ receivable: number; credit: number }[]>`
    select coalesce(sum(balance_cents) filter (where balance_cents > 0), 0)::bigint as receivable,
           coalesce(-sum(balance_cents) filter (where balance_cents < 0), 0)::bigint as credit
    from atelier.v_order_balances`;
  const [sales] = await tx<{ total: number; n: number }[]>`
    select coalesce(sum(due_cents), 0)::bigint as total, count(*)::int as n
    from atelier.v_order_balances b join atelier.orders o on o.id = b.order_id
    where o.order_date between ${period.from} and ${period.to} and o.status <> 'cancelled' and o.status <> 'quote'`;
  const [liab] = await tx<{ owed: number }[]>`
    select coalesce(sum(balance_cents) filter (where balance_cents > 0), 0)::bigint as owed
    from atelier.v_worker_balances`;
  const entries = await allEntries(tx, { from: start, to: end });
  const flow = cashFlow(entries, { excludeTransfers: true });
  let wageAdv = 0;
  let bizAdv = 0;
  let workerPay = 0;
  let custPay = 0;
  for (const e of entries) {
    if (e.entryType === "worker_advance" && e.advanceTreatment === "wage") wageAdv += naturalAmount(e);
    if (e.entryType === "worker_advance" && e.advanceTreatment === "business") bizAdv += naturalAmount(e);
    if (e.entryType === "worker_payment") workerPay += naturalAmount(e);
    if (e.entryType === "customer_payment") custPay += naturalAmount(e);
  }
  const expenses = [...expensesByCategory(entries).values()].reduce((a, b) => a + b, 0);
  const accounts = await accountBalances(tx);
  const recentEntries = await listEntries(tx, {}, { limit: 8, offset: 0 });
  const recentActivity = await tx<DashboardData["recentActivity"]>`
    select h.order_id as "orderId", o.reference, c.name as "customerName", h.to_status as "toStatus",
           h.changed_at as "changedAt"
    from atelier.order_status_history h
    join atelier.orders o on o.id = h.order_id join atelier.customers c on c.id = o.customer_id
    order by h.changed_at desc, h.id desc limit 8`;
  const upcoming = await listOrders(
    tx,
    { statuses: [...OPEN_STATUSES], dueFrom: today, dueTo: addDays(today, 14) },
    { sort: "due", limit: 8 },
  );
  const [anything] = await tx<{ n: number }[]>`
    select (select count(*) from atelier.workers) + (select count(*) from atelier.orders)
         + (select count(*) from atelier.ledger_entries) as n`;
  return {
    activeWorkers: w?.n ?? 0,
    ordersByStatus,
    overdueOrders: overdue?.n ?? 0,
    customerPaymentsCents: custPay,
    receivablesCents: recv?.receivable ?? 0,
    customerCreditsCents: recv?.credit ?? 0,
    recordedSalesCents: sales?.total ?? 0,
    recordedSalesCount: sales?.n ?? 0,
    wageAdvancesCents: wageAdv,
    businessAdvancesCents: bizAdv,
    workerPaymentsCents: workerPay,
    expensesCents: expenses,
    workerLiabilitiesCents: liab?.owed ?? 0,
    cashInCents: flow.inCents,
    cashOutCents: flow.outCents,
    cashBalanceCents: accounts.reduce((a, b) => a + b.balanceCents, 0),
    accounts: accounts.map((a) => ({ accountId: a.accountId, name: a.name, balanceCents: a.balanceCents })),
    recentEntries: recentEntries.rows,
    recentActivity,
    upcoming: upcoming.rows,
    isEmpty: (anything?.n ?? 0) === 0,
  };
}

// ---------------------------------------------------------------------------
// Reports: a uniform tabular shape used by the screen, the print view and CSV export.
// ---------------------------------------------------------------------------
export const REPORT_KEYS = [
  "cash-flow",
  "financial-activity",
  "expenses-by-category",
  "customer-payments",
  "customer-balances",
  "orders-by-status",
  "order-value",
  "overdue-orders",
  "worker-payments",
  "advances",
  "weekly-settlement",
  "worker-balances",
  "reconciliation",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export type ColumnKind = "text" | "money" | "date" | "datetime" | "int" | "label";

export interface ReportColumn {
  key: string;
  label: string; // i18n key
  kind: ColumnKind;
  /** For kind "label": prefix of the i18n key for values (e.g. "entryType."). */
  labelPrefix?: string;
}

export type ReportRow = Record<string, string | number | Date | null>;

export interface Report {
  key: ReportKey;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
  /** Extra headline figures: i18n key -> cents */
  figures?: { label: string; cents: Cents }[];
  usesPeriod: boolean;
  usesWeek?: boolean;
  truncated?: boolean;
}

const sumBy = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function entryRows(entries: LedgerEntry[]): ReportRow[] {
  return entries.map((e) => ({
    occurredAt: e.occurredAt,
    reference: e.reference,
    entryType: e.entryType,
    account: e.accountName,
    party: e.workerName ?? e.customerName ?? e.supplier ?? null,
    order: e.orderReference,
    description: e.description,
    inCents: e.direction === "in" ? e.amountCents : 0,
    outCents: e.direction === "out" ? e.amountCents : 0,
    reversal: e.reversalOf ? "yes" : null,
  }));
}

const ENTRY_COLUMNS: ReportColumn[] = [
  { key: "occurredAt", label: "fields.date", kind: "datetime" },
  { key: "reference", label: "fields.reference", kind: "text" },
  { key: "entryType", label: "fields.type", kind: "label", labelPrefix: "entryType." },
  { key: "account", label: "fields.account", kind: "text" },
  { key: "party", label: "fields.party", kind: "text" },
  { key: "order", label: "fields.order", kind: "text" },
  { key: "description", label: "fields.description", kind: "text" },
  { key: "inCents", label: "fields.moneyIn", kind: "money" },
  { key: "outCents", label: "fields.moneyOut", kind: "money" },
];

export async function buildReport(
  tx: Tx,
  key: ReportKey,
  params: { period: Period; payWeek?: string; today?: string },
): Promise<Report> {
  const { start, end } = periodBounds(params.period);
  const today = params.today ?? todayLocal();
  switch (key) {
    case "financial-activity": {
      const entries = await allEntries(tx, { from: start, to: end });
      const rows = entryRows(entries);
      return {
        key,
        usesPeriod: true,
        columns: ENTRY_COLUMNS,
        rows,
        totals: { inCents: sumBy(rows, (r) => Number(r.inCents)), outCents: sumBy(rows, (r) => Number(r.outCents)) },
        truncated: entries.length >= 20000,
      };
    }
    case "cash-flow": {
      const accounts = await accountBalances(tx, { includeInactive: true });
      const rows: ReportRow[] = [];
      for (const a of accounts) {
        const [r] = await tx<{ opening: number; inflow: number; outflow: number }[]>`
          select
            coalesce(sum(case when occurred_at < ${start} then (case when direction = 'in' then amount_cents else -amount_cents end) end), 0)::bigint as opening,
            coalesce(sum(case when occurred_at >= ${start} and occurred_at < ${end} and direction = 'in' then amount_cents end), 0)::bigint as inflow,
            coalesce(sum(case when occurred_at >= ${start} and occurred_at < ${end} and direction = 'out' then amount_cents end), 0)::bigint as outflow
          from atelier.ledger_entries where account_id = ${a.accountId} and occurred_at < ${end}`;
        rows.push({
          account: a.name,
          openingCents: r?.opening ?? 0,
          inCents: r?.inflow ?? 0,
          outCents: r?.outflow ?? 0,
          closingCents: (r?.opening ?? 0) + (r?.inflow ?? 0) - (r?.outflow ?? 0),
        });
      }
      const entries = await allEntries(tx, { from: start, to: end });
      const flow = cashFlow(entries);
      return {
        key,
        usesPeriod: true,
        columns: [
          { key: "account", label: "fields.account", kind: "text" },
          { key: "openingCents", label: "reports.openingBalance", kind: "money" },
          { key: "inCents", label: "fields.moneyIn", kind: "money" },
          { key: "outCents", label: "fields.moneyOut", kind: "money" },
          { key: "closingCents", label: "reports.closingBalance", kind: "money" },
        ],
        rows,
        totals: {
          openingCents: sumBy(rows, (r) => Number(r.openingCents)),
          inCents: sumBy(rows, (r) => Number(r.inCents)),
          outCents: sumBy(rows, (r) => Number(r.outCents)),
          closingCents: sumBy(rows, (r) => Number(r.closingCents)),
        },
        figures: ENTRY_TYPES.filter((t) => flow.byType[t] !== 0).map((t) => ({
          label: `entryType.${t}`,
          cents: flow.byType[t],
        })),
      };
    }
    case "expenses-by-category": {
      const entries = await allEntries(tx, { from: start, to: end, types: ["expense"], includeBusinessAdvances: true });
      const by = expensesByCategory(entries);
      const rows = EXPENSE_CATEGORIES.filter((c) => by.has(c)).map((c) => ({
        category: c,
        count: entries.filter((e) => e.expenseCategory === c && !e.reversalOf).length,
        totalCents: by.get(c) ?? 0,
      }));
      return {
        key,
        usesPeriod: true,
        columns: [
          { key: "category", label: "fields.category", kind: "label", labelPrefix: "expenseCategory." },
          { key: "count", label: "fields.count", kind: "int" },
          { key: "totalCents", label: "fields.total", kind: "money" },
        ],
        rows,
        totals: { totalCents: sumBy(rows, (r) => r.totalCents), count: sumBy(rows, (r) => r.count) },
      };
    }
    case "customer-payments": {
      const entries = await allEntries(tx, { from: start, to: end, types: ["customer_payment", "customer_refund"] });
      const rows = entryRows(entries);
      return {
        key,
        usesPeriod: true,
        columns: ENTRY_COLUMNS,
        rows,
        totals: { inCents: sumBy(rows, (r) => Number(r.inCents)), outCents: sumBy(rows, (r) => Number(r.outCents)) },
      };
    }
    case "customer-balances": {
      const rows = await tx<ReportRow[]>`
        select c.name as customer, c.phone, b.orders_count as "ordersCount", b.due_cents as "dueCents",
               b.paid_cents as "paidCents", b.refunded_cents as "refundedCents", b.balance_cents as "balanceCents"
        from atelier.customers c join atelier.v_customer_balances b on b.customer_id = c.id
        where b.balance_cents <> 0 order by b.balance_cents desc`;
      return {
        key,
        usesPeriod: false,
        columns: [
          { key: "customer", label: "fields.customer", kind: "text" },
          { key: "phone", label: "fields.phone", kind: "text" },
          { key: "ordersCount", label: "fields.orders", kind: "int" },
          { key: "dueCents", label: "money.due", kind: "money" },
          { key: "paidCents", label: "money.paid", kind: "money" },
          { key: "refundedCents", label: "money.refunded", kind: "money" },
          { key: "balanceCents", label: "money.balance", kind: "money" },
        ],
        rows,
        totals: { balanceCents: sumBy(rows, (r) => Number(r.balanceCents)) },
      };
    }
    case "orders-by-status": {
      const rows = await tx<ReportRow[]>`
        select o.status, count(*)::int as count, coalesce(sum(b.due_cents), 0)::bigint as "dueCents",
               coalesce(sum(b.balance_cents), 0)::bigint as "balanceCents"
        from atelier.orders o join atelier.v_order_balances b on b.order_id = o.id
        where o.order_date between ${params.period.from} and ${params.period.to}
        group by o.status`;
      const order = new Map(ORDER_STATUSES.map((s, i) => [s, i]));
      rows.sort((a, b) => order.get(a.status as OrderStatus)! - order.get(b.status as OrderStatus)!);
      return {
        key,
        usesPeriod: true,
        columns: [
          { key: "status", label: "fields.status", kind: "label", labelPrefix: "orderStatus." },
          { key: "count", label: "fields.count", kind: "int" },
          { key: "dueCents", label: "money.due", kind: "money" },
          { key: "balanceCents", label: "money.balance", kind: "money" },
        ],
        rows,
        totals: { count: sumBy(rows, (r) => Number(r.count)), dueCents: sumBy(rows, (r) => Number(r.dueCents)) },
      };
    }
    case "order-value": {
      const rows = await tx<ReportRow[]>`
        select o.order_date as "orderDate", o.reference, c.name as customer, o.status,
               b.due_cents as "dueCents", b.paid_cents - b.refunded_cents as "receivedCents", b.balance_cents as "balanceCents"
        from atelier.orders o join atelier.customers c on c.id = o.customer_id
        join atelier.v_order_balances b on b.order_id = o.id
        where o.order_date between ${params.period.from} and ${params.period.to}
          and o.status not in ('quote', 'cancelled')
        order by o.order_date, o.reference`;
      return {
        key,
        usesPeriod: true,
        columns: [
          { key: "orderDate", label: "fields.date", kind: "date" },
          { key: "reference", label: "fields.reference", kind: "text" },
          { key: "customer", label: "fields.customer", kind: "text" },
          { key: "status", label: "fields.status", kind: "label", labelPrefix: "orderStatus." },
          { key: "dueCents", label: "money.agreed", kind: "money" },
          { key: "receivedCents", label: "money.received", kind: "money" },
          { key: "balanceCents", label: "money.balance", kind: "money" },
        ],
        rows,
        totals: {
          dueCents: sumBy(rows, (r) => Number(r.dueCents)),
          receivedCents: sumBy(rows, (r) => Number(r.receivedCents)),
          balanceCents: sumBy(rows, (r) => Number(r.balanceCents)),
        },
      };
    }
    case "overdue-orders": {
      const { rows: orders } = await listOrders(tx, { overdue: true, today }, { sort: "due", limit: 1000 });
      const rows = orders.map((o) => ({
        dueDate: o.dueDate,
        reference: o.reference,
        customer: o.customerName,
        phone: o.customerPhone,
        status: o.status,
        daysLate: o.dueDate ? Math.round((Date.parse(today) - Date.parse(o.dueDate)) / 86_400_000) : null,
        balanceCents: o.money.balanceCents,
      }));
      return {
        key,
        usesPeriod: false,
        columns: [
          { key: "dueDate", label: "fields.dueDate", kind: "date" },
          { key: "reference", label: "fields.reference", kind: "text" },
          { key: "customer", label: "fields.customer", kind: "text" },
          { key: "phone", label: "fields.phone", kind: "text" },
          { key: "status", label: "fields.status", kind: "label", labelPrefix: "orderStatus." },
          { key: "daysLate", label: "fields.daysLate", kind: "int" },
          { key: "balanceCents", label: "money.balance", kind: "money" },
        ],
        rows,
      };
    }
    case "worker-payments":
    case "advances": {
      const type = key === "advances" ? "worker_advance" : "worker_payment";
      const entries = await allEntries(tx, { from: start, to: end, types: [type] });
      const byWorker = new Map<string, { worker: string; wage: number; business: number; total: number; count: number }>();
      for (const e of entries) {
        const k = e.workerId ?? "";
        const cur = byWorker.get(k) ?? { worker: e.workerName ?? "", wage: 0, business: 0, total: 0, count: 0 };
        const a = naturalAmount(e);
        cur.total += a;
        if (e.advanceTreatment === "business") cur.business += a;
        else cur.wage += a;
        if (!e.reversalOf) cur.count++;
        byWorker.set(k, cur);
      }
      const rows: ReportRow[] = [...byWorker.values()]
        .sort((a, b) => a.worker.localeCompare(b.worker))
        .map((r): ReportRow =>
          key === "advances"
            ? { worker: r.worker, count: r.count, wageCents: r.wage, businessCents: r.business, totalCents: r.total }
            : { worker: r.worker, count: r.count, totalCents: r.total },
        );
      return {
        key,
        usesPeriod: true,
        columns:
          key === "advances"
            ? [
                { key: "worker", label: "fields.worker", kind: "text" },
                { key: "count", label: "fields.count", kind: "int" },
                { key: "wageCents", label: "advances.wageAdvances", kind: "money" },
                { key: "businessCents", label: "advances.businessAdvances", kind: "money" },
                { key: "totalCents", label: "fields.total", kind: "money" },
              ]
            : [
                { key: "worker", label: "fields.worker", kind: "text" },
                { key: "count", label: "fields.count", kind: "int" },
                { key: "totalCents", label: "fields.total", kind: "money" },
              ],
        rows,
        totals:
          key === "advances"
            ? {
                count: sumBy(rows, (r) => Number(r.count)),
                wageCents: sumBy(rows, (r) => Number(r.wageCents)),
                businessCents: sumBy(rows, (r) => Number(r.businessCents)),
                totalCents: sumBy(rows, (r) => Number(r.totalCents)),
              }
            : { count: sumBy(rows, (r) => Number(r.count)), totalCents: sumBy(rows, (r) => Number(r.totalCents)) },
      };
    }
    case "weekly-settlement": {
      const week = params.payWeek!;
      const sheet = (await settlementSheet(tx, week)).filter((r) => r.week.status !== "empty" || r.active);
      const overview = weeklyOverview(sheet.map((s) => s.week));
      const rows = sheet.map((s) => ({
        worker: s.fullName,
        dueCents: s.week.dueCents,
        advancesCents: s.week.wageAdvancesCents,
        paidCents: s.week.paymentsCents,
        remainingCents: s.week.remainingCents,
        status: s.week.status,
        recorded: s.week.hasBase ? "yes" : "proposed",
      }));
      return {
        key,
        usesPeriod: false,
        usesWeek: true,
        columns: [
          { key: "worker", label: "fields.worker", kind: "text" },
          { key: "dueCents", label: "payroll.due", kind: "money" },
          { key: "advancesCents", label: "payroll.advances", kind: "money" },
          { key: "paidCents", label: "payroll.paid", kind: "money" },
          { key: "remainingCents", label: "payroll.remaining", kind: "money" },
          { key: "status", label: "fields.status", kind: "label", labelPrefix: "weekStatus." },
        ],
        rows,
        totals: {
          dueCents: overview.totalDueCents,
          advancesCents: overview.totalAdvancesCents,
          paidCents: overview.totalPaidCents,
          remainingCents: overview.totalRemainingCents,
        },
      };
    }
    case "worker-balances": {
      const rows = await tx<ReportRow[]>`
        select w.full_name as worker, w.code, w.active, b.balance_cents as "balanceCents"
        from atelier.workers w join atelier.v_worker_balances b on b.worker_id = w.id
        where b.balance_cents <> 0 order by b.balance_cents desc`;
      return {
        key,
        usesPeriod: false,
        columns: [
          { key: "worker", label: "fields.worker", kind: "text" },
          { key: "code", label: "fields.code", kind: "text" },
          { key: "balanceCents", label: "payroll.balanceOwed", kind: "money" },
        ],
        rows: rows.map(({ active: _a, ...r }) => r),
        totals: { balanceCents: sumBy(rows, (r) => Number(r.balanceCents)) },
      };
    }
    case "reconciliation": {
      const counts = await listCashCounts(tx, 200);
      const rows = counts
        .filter((c) => c.countedAt >= start && c.countedAt < end)
        .map((c) => ({
          countedAt: c.countedAt,
          account: c.accountName,
          calculatedCents: c.calculatedCents,
          countedCents: c.countedCents,
          differenceCents: c.differenceCents,
          adjustment: c.adjustmentReference,
          note: c.note,
          by: c.createdByName,
        }));
      return {
        key,
        usesPeriod: true,
        columns: [
          { key: "countedAt", label: "fields.date", kind: "datetime" },
          { key: "account", label: "fields.account", kind: "text" },
          { key: "calculatedCents", label: "cash.calculated", kind: "money" },
          { key: "countedCents", label: "cash.counted", kind: "money" },
          { key: "differenceCents", label: "cash.difference", kind: "money" },
          { key: "adjustment", label: "cash.adjustmentRef", kind: "text" },
          { key: "note", label: "fields.note", kind: "text" },
          { key: "by", label: "fields.createdBy", kind: "text" },
        ],
        rows,
      };
    }
  }
}
