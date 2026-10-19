import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarClock, ClipboardList, HandCoins, PackageCheck, Receipt, ShoppingBag, Wallet } from "lucide-react";
import { pageContext, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { dashboard } from "@/domain/reports/service";
import { getSettings } from "@/domain/settings/service";
import { settlementSheet } from "@/domain/payroll/service";
import { weeklyOverview } from "@/domain/payroll/logic";
import { listOrders } from "@/domain/orders/service";
import { addDays, formatDate, resolvePeriod, todayLocal, weekStart } from "@/lib/dates";
import { isOverdue } from "@/domain/orders/logic";
import { Card, Notice } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { OrderStatusBadge } from "@/components/labels";
import { PeriodPicker } from "@/components/period";
import { hrefWith } from "@/components/table";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.dashboard") };
}

/** Big, obvious action button for the most frequent tasks. */
function Action({ href, icon: Icon, label, tone }: { href: string; icon: typeof HandCoins; label: string; tone: "copper" | "primary" | "plain" }) {
  const styles =
    tone === "copper"
      ? "bg-copper text-white hover:bg-[#7a3f20]"
      : tone === "primary"
        ? "bg-primary text-white hover:bg-primary-hover"
        : "border border-line-strong bg-surface text-ink hover:bg-sunken";
  return (
    <Link href={href} className={`flex min-h-16 items-center gap-3 rounded-xl px-4 text-base font-semibold shadow-sm ${styles}`}>
      <Icon className="size-6 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

function Figure({ label, value, href, hint, alert }: { label: string; value: React.ReactNode; href: string; hint?: string; alert?: boolean }) {
  return (
    <Link href={href} className="card block p-4 hover:border-primary">
      <div className="text-sm text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${alert ? "text-bad" : "text-ink"}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-soft">{hint}</div> : null}
    </Link>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q, user } = await pageContext();
  const today = todayLocal();
  const data = await q(async (tx) => {
    const s = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period"), param(sp, "from"), param(sp, "to"), s.weekStartDay, today);
    const week = weekStart(today, s.weekStartDay);
    const sheet = (await settlementSheet(tx, week)).filter((r) => r.active);
    const ready = (await listOrders(tx, { statuses: ["ready"] }, { sort: "due", limit: 5 })).rows;
    return { period, week, d: await dashboard(tx, period, today), pay: weeklyOverview(sheet.map((r) => r.week)), ready };
  });
  const { d, pay, period } = data;
  const pq = { period: period.key, from: period.key === "custom" ? period.from : undefined, to: period.key === "custom" ? period.to : undefined };
  const toPay = Math.max(0, pay.totalRemainingCents);

  // One short list of things that need attention, most urgent first.
  const todo: { key: string; href: string; icon: typeof HandCoins; text: React.ReactNode; tone: "bad" | "warn" | "ok" }[] = [];
  if (d.overdueOrders > 0)
    todo.push({ key: "late", href: "/orders?overdue=1", icon: AlertTriangle, tone: "bad", text: t("home.todoLate", { count: d.overdueOrders }) });
  for (const o of data.ready)
    todo.push({
      key: `ready-${o.id}`,
      href: `/orders/${o.id}`,
      icon: PackageCheck,
      tone: "ok",
      text: (
        <>
          {t("home.todoReady", { reference: o.reference, customer: o.customerName })}
          {o.money.balanceCents > 0 ? (
            <span className="ms-1 text-ink-soft">
              · {t("home.toCollect")} <Money cents={o.money.balanceCents} />
            </span>
          ) : null}
        </>
      ),
    });
  if (toPay > 0)
    todo.push({ key: "pay", href: "/payroll", icon: Banknote, tone: "warn", text: <>{t("home.todoPay")} <Money cents={toPay} /></> });
  for (const o of d.upcoming.filter((o) => !isOverdue(o.status, o.dueDate, today) && o.status !== "ready" && o.dueDate && o.dueDate <= addDays(today, 7)))
    todo.push({
      key: `due-${o.id}`,
      href: `/orders/${o.id}`,
      icon: CalendarClock,
      tone: "warn",
      text: t("home.todoDue", { reference: o.reference, customer: o.customerName, date: formatDate(o.dueDate) }),
    });

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold md:text-[1.75rem]">{t("dashboard.greeting", { name: user.displayName })}</h1>
        <p className="mt-1 text-ink-soft">{formatDate(today)}</p>
      </header>
      {param(sp, "denied") ? <div className="mb-4"><Notice tone="warn">{t("errors.forbidden")}</Notice></div> : null}

      <section aria-labelledby="actions-title" className="mb-6">
        <h2 id="actions-title" className="sr-only">{t("quick.title")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Action href="/advances/new" icon={HandCoins} label={t("quick.advance")} tone="copper" />
          <Action href="/payroll" icon={Banknote} label={t("quick.payWorkers")} tone="primary" />
          <Action href="/orders/payment" icon={Wallet} label={t("quick.customerPayment")} tone="plain" />
          <Action href="/orders/new" icon={ShoppingBag} label={t("quick.order")} tone="plain" />
          <Action href="/expenses/new" icon={Receipt} label={t("quick.expense")} tone="plain" />
          {d.isEmpty && can(user.role, "workers.manage") ? (
            <Action href="/workers/new" icon={ClipboardList} label={t("workers.new")} tone="plain" />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="figures-title" className="mb-6">
        <h2 id="figures-title" className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("home.figures")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label={t("home.cash")} value={<Money cents={d.cashBalanceCents} tone="auto" />} href="/cash" />
          <Figure label={t("home.toPayWorkers")} value={<Money cents={toPay} />} href="/payroll" hint={t("home.thisWeek")} />
          <Figure label={t("home.customersOwe")} value={<Money cents={d.receivablesCents} />} href="/reports/customer-balances" />
          <Figure
            label={t("home.lateOrders")}
            value={<span className="num">{d.overdueOrders}</span>}
            href="/orders?overdue=1"
            alert={d.overdueOrders > 0}
          />
        </div>
      </section>

      <Card className="mb-6">
        <h2 className="border-b border-line px-4 py-3 text-lg font-semibold">{t("home.todo")}</h2>
        {todo.length === 0 ? (
          <p className="px-4 py-6 text-center text-ink-soft">{t("home.nothingToDo")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {todo.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-sunken">
                  <item.icon
                    className={`size-5 shrink-0 ${item.tone === "bad" ? "text-bad" : item.tone === "ok" ? "text-ok" : "text-warn"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">{item.text}</span>
                  <span className="text-primary" aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <details className="card group mb-2" open={param(sp, "period") ? true : undefined}>
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold marker:hidden">
          <span className="text-primary">{t("home.moreFigures")}</span>
          <span className="ms-2 text-sm font-normal text-ink-soft">{t("home.moreFiguresHelp")}</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <PeriodPicker period={period} basePath="/" t={t} />
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {[
              { label: t("dashboard.cashIn"), cents: d.cashInCents, href: hrefWith("/reports/cash-flow", pq) },
              { label: t("dashboard.cashOut"), cents: d.cashOutCents, href: hrefWith("/reports/cash-flow", pq) },
              { label: t("dashboard.paymentsReceived"), cents: d.customerPaymentsCents, href: hrefWith("/reports/customer-payments", pq) },
              { label: t("dashboard.recordedSales", { count: d.recordedSalesCount }), cents: d.recordedSalesCents, href: hrefWith("/reports/order-value", pq) },
              { label: t("dashboard.wageAdvances"), cents: d.wageAdvancesCents, href: hrefWith("/advances", pq) },
              { label: t("dashboard.workerPayments"), cents: d.workerPaymentsCents, href: hrefWith("/reports/worker-payments", pq) },
              { label: t("dashboard.expenses"), cents: d.expensesCents, href: hrefWith("/expenses", pq) },
              { label: t("dashboard.workerLiabilities"), cents: d.workerLiabilitiesCents, href: "/reports/worker-balances" },
            ].map((f) => (
              <div key={f.label} className="flex flex-wrap justify-between gap-x-2 border-b border-line py-1.5">
                <dt>
                  <Link href={f.href} className="text-ink-soft hover:text-ink hover:underline">{f.label}</Link>
                </dt>
                <dd><Money cents={f.cents} /></dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-soft">{t("dashboard.cashMovementHelp")} {t("dashboard.expensesHelp")}</p>
          {d.upcoming.length ? (
            <div>
              <h3 className="mb-2 font-sans text-sm font-semibold">{t("dashboard.upcoming")}</h3>
              <ul className="divide-y divide-line text-sm">
                {d.upcoming.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/orders/${o.id}`} className="text-primary hover:underline">
                      <span className="num">{o.reference}</span> · {o.customerName}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="num">{formatDate(o.dueDate)}</span>
                      <OrderStatusBadge status={o.status} t={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </>
  );
}
