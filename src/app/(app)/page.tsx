import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle } from "lucide-react";
import { pageContext, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { dashboard } from "@/domain/reports/service";
import { getSettings } from "@/domain/settings/service";
import { formatDate, formatDateTime, resolvePeriod, todayLocal } from "@/lib/dates";
import { isOverdue } from "@/domain/orders/logic";
import { Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { OrderStatusBadge, EntryTypeBadge } from "@/components/labels";
import { PeriodPicker } from "@/components/period";
import { hrefWith } from "@/components/table";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.dashboard") };
}

function Metric({
  label,
  value,
  href,
  help,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  href: string;
  help?: string;
  tone?: "warn" | "bad" | "primary";
}) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "primary" ? "text-primary" : "text-ink";
  return (
    <Link href={href} className="card group block p-4 transition-colors hover:border-primary focus-visible:border-primary">
      <div className="text-sm text-ink-soft group-hover:text-ink">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {help ? <div className="mt-1 text-xs text-ink-soft">{help}</div> : null}
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q, user } = await pageContext();
  const today = todayLocal();
  const { d, period } = await q(async (tx) => {
    const s = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period"), param(sp, "from"), param(sp, "to"), s.weekStartDay, today);
    return { period, d: await dashboard(tx, period, today) };
  });
  const pq = { period: period.key, from: period.key === "custom" ? period.from : undefined, to: period.key === "custom" ? period.to : undefined };
  const os = d.ordersByStatus;

  return (
    <>
      <PageHeader title={t("dashboard.greeting", { name: user.displayName })} description={t("dashboard.subtitle", { date: formatDate(today) })} />
      {param(sp, "denied") ? <div className="mb-4"><Notice tone="warn">{t("errors.forbidden")}</Notice></div> : null}

      {d.isEmpty ? (
        <Card className="mb-6">
          <CardHeader title={t("onboarding.title")} description={t("onboarding.subtitle")} />
          <ol className="grid gap-3 p-4 md:grid-cols-2">
            {[
              { href: "/cash", key: "opening", show: can(user.role, "cash.opening") },
              { href: "/workers/new", key: "workers", show: true },
              { href: "/customers/new", key: "customers", show: true },
              { href: "/orders/new", key: "orders", show: true },
              { href: "/advances/new", key: "advances", show: true },
              { href: "/settings", key: "settings", show: can(user.role, "settings.manage") },
            ]
              .filter((s) => s.show)
              .map((s, i) => (
                <li key={s.key}>
                  <Link href={s.href} className="flex items-start gap-3 rounded-lg border border-line p-3 hover:border-primary">
                    <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-copper-soft font-semibold text-copper">{i + 1}</span>
                    <span>
                      <span className="block font-medium">{t(`onboarding.${s.key}.title`)}</span>
                      <span className="text-sm text-ink-soft">{t(`onboarding.${s.key}.help`)}</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ol>
        </Card>
      ) : null}

      <section aria-labelledby="now-title" className="mb-6">
        <h2 id="now-title" className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("dashboard.now")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={t("dashboard.cashBalance")} value={<Money cents={d.cashBalanceCents} tone="auto" />} href="/cash" help={t("dashboard.cashBalanceHelp")} tone="primary" />
          <Metric label={t("dashboard.receivables")} value={<Money cents={d.receivablesCents} />} href="/reports/customer-balances" help={t("dashboard.receivablesHelp")} />
          <Metric label={t("dashboard.workerLiabilities")} value={<Money cents={d.workerLiabilitiesCents} />} href="/reports/worker-balances" help={t("dashboard.workerLiabilitiesHelp")} />
          <Metric label={t("dashboard.activeWorkers")} value={<span className="num">{d.activeWorkers}</span>} href="/workers" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={t("dashboard.awaitingProduction")} value={<span className="num">{os.quote + os.confirmed + os.on_hold}</span>} href="/orders?status=confirmed" help={t("dashboard.awaitingHelp", { quotes: os.quote, onHold: os.on_hold })} />
          <Metric label={t("dashboard.inProduction")} value={<span className="num">{os.in_production + os.finishing}</span>} href="/orders?status=in_production" />
          <Metric label={t("dashboard.ready")} value={<span className="num">{os.ready}</span>} href="/orders?status=ready" tone={os.ready ? "primary" : undefined} />
          <Metric label={t("dashboard.overdue")} value={<span className="num">{d.overdueOrders}</span>} href="/orders?overdue=1" tone={d.overdueOrders ? "bad" : undefined} />
        </div>
      </section>

      <section aria-labelledby="period-title" className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="period-title" className="font-sans text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("dashboard.period")}</h2>
          <PeriodPicker period={period} basePath="/" t={t} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <h3 className="font-sans text-sm font-semibold">{t("dashboard.cashMovement")}</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="flex items-center gap-1 text-ink-soft"><ArrowDownLeft className="size-4 text-ok" aria-hidden />{t("dashboard.cashIn")}</dt><dd><Money cents={d.cashInCents} tone="in" /></dd></div>
              <div className="flex justify-between gap-2"><dt className="flex items-center gap-1 text-ink-soft"><ArrowUpRight className="size-4 text-copper" aria-hidden />{t("dashboard.cashOut")}</dt><dd><Money cents={d.cashOutCents} tone="out" /></dd></div>
              <div className="flex justify-between gap-2 border-t border-line pt-1.5 font-semibold"><dt>{t("dashboard.netCash")}</dt><dd><Money cents={d.cashInCents - d.cashOutCents} signed tone="auto" /></dd></div>
            </dl>
            <p className="mt-2 text-xs text-ink-soft">{t("dashboard.cashMovementHelp")}</p>
            <Link href={hrefWith("/reports/cash-flow", pq)} className="mt-2 inline-block text-sm text-primary hover:underline">{t("dashboard.details")}</Link>
          </Card>
          <Card className="p-4">
            <h3 className="font-sans text-sm font-semibold">{t("dashboard.customers")}</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-ink-soft"><Link href={hrefWith("/reports/customer-payments", pq)} className="hover:underline">{t("dashboard.paymentsReceived")}</Link></dt><dd><Money cents={d.customerPaymentsCents} /></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft"><Link href={hrefWith("/reports/order-value", pq)} className="hover:underline">{t("dashboard.recordedSales", { count: d.recordedSalesCount })}</Link></dt><dd><Money cents={d.recordedSalesCents} /></dd></div>
              {d.customerCreditsCents ? <div className="flex justify-between gap-2"><dt className="text-ink-soft">{t("dashboard.customerCredits")}</dt><dd><Money cents={d.customerCreditsCents} /></dd></div> : null}
            </dl>
            <p className="mt-2 text-xs text-ink-soft">{t("dashboard.salesHelp")}</p>
          </Card>
          <Card className="p-4">
            <h3 className="font-sans text-sm font-semibold">{t("dashboard.workersAndExpenses")}</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-ink-soft"><Link href={hrefWith("/advances", pq)} className="hover:underline">{t("dashboard.wageAdvances")}</Link></dt><dd><Money cents={d.wageAdvancesCents} /></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft"><Link href={hrefWith("/reports/worker-payments", pq)} className="hover:underline">{t("dashboard.workerPayments")}</Link></dt><dd><Money cents={d.workerPaymentsCents} /></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft"><Link href={hrefWith("/expenses", pq)} className="hover:underline">{t("dashboard.expenses")}</Link></dt><dd><Money cents={d.expensesCents} /></dd></div>
            </dl>
            <p className="mt-2 text-xs text-ink-soft">{t("dashboard.expensesHelp")}</p>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("dashboard.upcoming")} actions={<Link href="/orders" className="text-sm text-primary hover:underline">{t("common.seeAll")}</Link>} />
          {d.upcoming.length === 0 ? (
            <EmptyState title={t("dashboard.noUpcoming")} />
          ) : (
            <ul className="divide-y divide-line">
              {d.upcoming.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/orders/${o.id}`} className="num font-medium text-primary hover:underline">{o.reference}</Link>
                    <div className="truncate text-ink-soft">{o.customerName}</div>
                  </div>
                  <div className="text-end">
                    <div className={isOverdue(o.status, o.dueDate, today) ? "num font-semibold text-bad" : "num"}>{formatDate(o.dueDate)}</div>
                    <OrderStatusBadge status={o.status} t={t} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("dashboard.recentTransactions")} actions={<Link href="/cash/ledger" className="text-sm text-primary hover:underline">{t("common.seeAll")}</Link>} />
          {d.recentEntries.length === 0 ? (
            <EmptyState title={t("ledger.empty")} />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentEntries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/cash/ledger/${e.id}`} className="block truncate hover:underline">
                      {e.workerName ?? e.customerName ?? e.supplier ?? e.description ?? e.reference}
                    </Link>
                    <EntryTypeBadge type={e.entryType} reversal={Boolean(e.reversalOf)} t={t} />
                  </div>
                  <Money cents={e.direction === "in" ? e.amountCents : -e.amountCents} signed tone={e.direction === "in" ? "in" : "out"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("dashboard.orderActivity")} />
          {d.recentActivity.length === 0 ? (
            <EmptyState title={t("orders.empty")} />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentActivity.map((a, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {a.toStatus === "delivered" ? <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden /> : <Circle className="size-4 shrink-0 text-ink-faint" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <Link href={`/orders/${a.orderId}`} className="num font-medium text-primary hover:underline">{a.reference}</Link>
                    <span className="ms-1 text-ink-soft">{a.customerName}</span>
                    <div className="num text-xs text-ink-soft">{formatDateTime(a.changedAt)}</div>
                  </div>
                  <OrderStatusBadge status={a.toStatus} t={t} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
