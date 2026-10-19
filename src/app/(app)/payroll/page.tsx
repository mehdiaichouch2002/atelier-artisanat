import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Printer } from "lucide-react";
import { pageContext, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { settlementSheet } from "@/domain/payroll/service";
import { weeklyOverview } from "@/domain/payroll/logic";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { WeekStatusBadge } from "@/components/labels";
import { Dialog } from "@/components/forms";
import { WeekNav } from "./week-nav";
import { accountOptions, nowLocal, resolveWeek } from "./context";
import { PaymentForm } from "./forms";
import { arrangementSummary } from "../workers/arrangement";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.payroll") };
}

export default async function PayrollPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("payroll.record");
  const { week, currentWeek, sheet, accounts } = await q(async (tx) => {
    const w = await resolveWeek(tx, param(sp, "week"));
    return { ...w, sheet: await settlementSheet(tx, w.week), accounts: await accountOptions(tx) };
  });
  const rows = sheet.filter((r) => r.active || r.week.status !== "empty");
  const o = weeklyOverview(rows.map((r) => r.week));
  const now = nowLocal();

  return (
    <>
      <PageHeader
        title={t("nav.payroll")}
        description={t("payroll.description")}
        actions={
          <LinkButton href={`/print/week?week=${week}`} variant="secondary" target="_blank">
            <Printer className="size-4" aria-hidden /> {t("print.weekReport")}
          </LinkButton>
        }
      />
      <div className="mb-4">
        <WeekNav week={week} basePath="/payroll" t={t} currentWeek={currentWeek} />
      </div>

      <section aria-label={t("payroll.overview")} className="mb-4 grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-sm text-ink-soft">{t("payroll.totalRemaining")}</div>
          <div className="mt-1 text-2xl font-semibold text-primary">
            <Money cents={Math.max(0, o.totalRemainingCents)} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-ink-soft">{t("payroll.alreadyGiven")}</div>
          <div className="mt-1 text-2xl font-semibold">
            <Money cents={o.totalAdvancesCents + o.totalPaidCents} />
          </div>
          <div className="mt-0.5 text-xs text-ink-soft">
            {t("payroll.advances")} <Money cents={o.totalAdvancesCents} /> · {t("payroll.paid")} <Money cents={o.totalPaidCents} />
          </div>
        </div>
      </section>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="size-8" />} title={t("payroll.noWorkers")} action={<LinkButton href="/workers/new">{t("workers.new")}</LinkButton>} />
        ) : (
          <ul className="divide-y divide-line" aria-label={t("payroll.sheetTitle")}>
            {rows.map((r) => (
              <li key={r.workerId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/payroll/${r.workerId}?week=${week}`} className="text-base font-semibold text-primary hover:underline">
                    {r.fullName}
                  </Link>
                  <div className="mt-0.5 text-sm text-ink-soft">
                    {r.week.hasBase ? (
                      <>
                        {t("payroll.due")} <Money cents={r.week.dueCents} />
                        {!r.recordedBase ? ` (${t("payroll.proposed")})` : ""}
                      </>
                    ) : (
                      arrangementSummary(r.arrangement, t)
                    )}
                    {r.week.wageAdvancesCents ? (
                      <>
                        {" · "}
                        {t("payroll.advances")} <Money cents={r.week.wageAdvancesCents} />
                      </>
                    ) : null}
                    {r.week.paymentsCents ? (
                      <>
                        {" · "}
                        {t("payroll.paid")} <Money cents={r.week.paymentsCents} />
                      </>
                    ) : null}
                  </div>
                  {r.previousBalanceCents !== 0 ? (
                    <div className="text-xs text-warn">
                      {t("payroll.previousBalance")}: <Money cents={r.previousBalanceCents} />
                    </div>
                  ) : null}
                </div>
                <div className="text-end">
                  <div className="text-xs text-ink-soft">{t("payroll.remaining")}</div>
                  <div className="text-lg font-semibold">
                    {r.week.status === "pending" || r.week.status === "empty" ? "—" : <Money cents={r.week.remainingCents} tone="auto" />}
                  </div>
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  <WeekStatusBadge status={r.week.status} t={t} />
                  {r.active ? (
                    <Dialog
                      trigger={t("payroll.pay")}
                      title={`${t("payroll.recordPayment")} — ${r.fullName}`}
                      triggerVariant="primary"
                      disabled={r.week.status === "settled"}
                    >
                      <PaymentForm
                        ctx={{
                          workerId: r.workerId,
                          workerName: r.fullName,
                          payWeek: week,
                          payKind: r.arrangement.payKind,
                          hasBase: r.recordedBase,
                          proposedBaseCents: r.proposedBaseCents,
                          defaultDays: r.arrangement.defaultDays == null ? null : String(r.arrangement.defaultDays),
                          remainingCents: r.week.remainingCents,
                          nowLocal: now,
                          ...accounts,
                        }}
                      />
                    </Dialog>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-soft">{t("payroll.formula")}</p>
    </>
  );
}

