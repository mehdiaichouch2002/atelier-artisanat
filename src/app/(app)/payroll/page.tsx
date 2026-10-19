import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Printer } from "lucide-react";
import { pageContext, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { settlementSheet } from "@/domain/payroll/service";
import { weeklyOverview } from "@/domain/payroll/logic";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { WeekStatusBadge } from "@/components/labels";
import { Table, Td, Th } from "@/components/table";
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

      <section aria-label={t("payroll.overview")} className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: t("payroll.totalDue"), cents: o.totalDueCents },
          { label: t("payroll.totalAdvances"), cents: o.totalAdvancesCents },
          { label: t("payroll.totalPaid"), cents: o.totalPaidCents },
          { label: t("payroll.totalRemaining"), cents: o.totalRemainingCents, strong: true },
        ].map((s) => (
          <div key={s.label} className="card p-3">
            <div className="text-sm text-ink-soft">{s.label}</div>
            <div className={s.strong ? "mt-1 text-xl font-semibold text-primary" : "mt-1 text-xl font-semibold"}>
              <Money cents={s.cents} />
            </div>
          </div>
        ))}
      </section>
      <p className="mb-4 flex flex-wrap gap-2 text-sm">
        <Badge tone="ok">{t("payroll.countSettled", { count: o.settled })}</Badge>
        <Badge tone="info">{t("payroll.countPartial", { count: o.partial })}</Badge>
        <Badge tone="copper">{t("payroll.countWithBalance", { count: o.withBalance })}</Badge>
        {o.pending ? <Badge tone="warn">{t("payroll.countPending", { count: o.pending })}</Badge> : null}
      </p>

      <Card>
        <CardHeader title={t("payroll.sheetTitle")} description={t("payroll.formula")} />
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="size-8" />} title={t("payroll.noWorkers")} action={<LinkButton href="/workers/new">{t("workers.new")}</LinkButton>} />
        ) : (
          <Table caption={t("payroll.sheetTitle")}>
            <thead>
              <tr>
                <Th>{t("fields.worker")}</Th>
                <Th num>{t("payroll.due")}</Th>
                <Th num>{t("payroll.advances")}</Th>
                <Th num>{t("payroll.paid")}</Th>
                <Th num>{t("payroll.remaining")}</Th>
                <Th>{t("fields.status")}</Th>
                <Th><span className="sr-only">{t("common.actions")}</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workerId}>
                  <Td label={t("fields.worker")} primary>
                    <Link href={`/payroll/${r.workerId}?week=${week}`} className="font-medium text-primary hover:underline">
                      {r.fullName}
                    </Link>
                    <div className="text-xs font-normal text-ink-soft">{arrangementSummary(r.arrangement, t)}</div>
                    {r.previousBalanceCents !== 0 ? (
                      <div className="text-xs font-normal text-warn">
                        {t("payroll.previousBalance")}: <Money cents={r.previousBalanceCents} />
                      </div>
                    ) : null}
                  </Td>
                  <Td label={t("payroll.due")} num>
                    {r.week.hasBase || r.week.dueCents ? <Money cents={r.week.dueCents} /> : "—"}
                    {!r.recordedBase && r.week.hasBase ? (
                      <div className="text-xs font-normal text-warn">{t("payroll.proposed")}</div>
                    ) : null}
                  </Td>
                  <Td label={t("payroll.advances")} num><Money cents={r.week.wageAdvancesCents} /></Td>
                  <Td label={t("payroll.paid")} num><Money cents={r.week.paymentsCents} /></Td>
                  <Td label={t("payroll.remaining")} num>
                    {r.week.status === "pending" ? "—" : <Money cents={r.week.remainingCents} tone="auto" className="font-semibold" />}
                  </Td>
                  <Td label={t("fields.status")}><WeekStatusBadge status={r.week.status} t={t} /></Td>
                  <Td label="" className="no-print">
                    {r.active ? (
                      <Dialog
                        trigger={t("payroll.pay")}
                        title={`${t("payroll.recordPayment")} — ${r.fullName}`}
                        triggerSize="sm"
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
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

