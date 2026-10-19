import Link from "next/link";
import { notFound } from "next/navigation";
import { HandCoins, Printer } from "lucide-react";
import { pageContext, isUuid, param, type SearchParams } from "@/lib/page";
import { workerWeekDetail } from "@/domain/payroll/service";
import { summarizeWithProposal } from "@/domain/payroll/logic";
import { Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { EntryTypeBadge, WeekStatusBadge } from "@/components/labels";
import { Table, Td, Th } from "@/components/table";
import { ActionButton } from "@/components/confirm-action";
import { Dialog } from "@/components/forms";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { WeekNav } from "../week-nav";
import { accountOptions, nowLocal, resolveWeek } from "../context";
import { AdjustmentForm, BasePayForm, PaymentForm, VoidEarningForm } from "../forms";
import { carryForwardAction } from "../actions";
import { arrangementSummary } from "../../workers/arrangement";

export default async function WorkerWeekPage({ params, searchParams }: { params: Promise<{ workerId: string }>; searchParams: SearchParams }) {
  const { workerId } = await params;
  if (!isUuid(workerId)) notFound();
  const sp = await searchParams;
  const { t, q, user } = await pageContext("payroll.record");
  const data = await q(async (tx) => {
    const w = await resolveWeek(tx, param(sp, "week"));
    try {
      return { ...w, detail: await workerWeekDetail(tx, workerId, w.week), accounts: await accountOptions(tx) };
    } catch {
      return null;
    }
  });
  if (!data) notFound();
  const { week, currentWeek, detail, accounts } = data;
  const recorded = detail.week;
  const shown = summarizeWithProposal(recorded, recorded.hasBase ? null : detail.proposedBaseCents);
  const advances = detail.entries.filter((e) => e.entryType === "worker_advance");
  const payments = detail.entries.filter((e) => e.entryType === "worker_payment");
  const owner = can(user.role, "payroll.void");
  const ctx = {
    workerId,
    workerName: detail.fullName,
    payWeek: week,
    payKind: detail.arrangement.payKind,
    hasBase: recorded.hasBase,
    proposedBaseCents: detail.proposedBaseCents,
    defaultDays: detail.arrangement.defaultDays == null ? null : String(detail.arrangement.defaultDays),
    remainingCents: shown.remainingCents,
    nowLocal: nowLocal(),
    ...accounts,
  };

  const line = (label: React.ReactNode, cents: number, opts: { sign?: "-" | "+"; strong?: boolean; muted?: boolean } = {}) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${opts.strong ? "border-t border-line-strong pt-3 text-lg font-semibold" : ""}`}>
      <dt className={opts.muted ? "text-ink-soft" : undefined}>{label}</dt>
      <dd>
        {opts.sign === "-" && cents !== 0 ? <span aria-hidden>− </span> : null}
        <Money cents={opts.sign === "-" ? Math.abs(cents) : cents} tone={opts.strong ? "auto" : undefined} />
      </dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={detail.fullName}
        description={arrangementSummary(detail.arrangement, t)}
        back={
          <span className="flex flex-wrap gap-3">
            <Link href={`/payroll?week=${week}`} className="text-primary hover:underline">← {t("nav.payroll")}</Link>
            <Link href={`/workers/${workerId}`} className="text-primary hover:underline">{t("workers.profile")}</Link>
          </span>
        }
        actions={
          detail.active ? (
            <LinkButton href={`/advances/new?worker=${workerId}`} variant="copper">
              <HandCoins className="size-4" aria-hidden /> {t("quick.advance")}
            </LinkButton>
          ) : null
        }
      />
      <div className="mb-4">
        <WeekNav week={week} basePath={`/payroll/${workerId}`} t={t} currentWeek={currentWeek} />
      </div>
      {!detail.active ? (
        <div className="mb-4">
          <Notice tone="warn">{t("workers.inactiveNotice")}</Notice>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title={t("payroll.calculation")} actions={<WeekStatusBadge status={shown.status} t={t} />} />
          <dl className="px-4 py-3">
            {line(
              <>
                {t("payroll.basePay")}{" "}
                {!recorded.hasBase && detail.proposedBaseCents != null ? <Badge tone="warn">{t("payroll.proposed")}</Badge> : null}
              </>,
              shown.baseCents,
            )}
            {recorded.adjustmentsCents !== 0 ? line(t("payroll.adjustments"), recorded.adjustmentsCents) : null}
            {recorded.carryCents !== 0 ? line(t("payroll.carried"), recorded.carryCents) : null}
            {line(t("money.due"), shown.dueCents, { strong: false })}
            {line(t("payroll.wageAdvancesDeducted"), recorded.wageAdvancesCents, { sign: "-" })}
            {line(t("payroll.paymentsMade"), recorded.paymentsCents, { sign: "-" })}
            {line(t("payroll.remaining"), shown.remainingCents, { strong: true })}
            {recorded.businessAdvancesCents ? (
              <p className="mt-2 text-xs text-ink-soft">
                {t("payroll.businessAdvancesNote")} <Money cents={recorded.businessAdvancesCents} />
              </p>
            ) : null}
          </dl>
          <p className="border-t border-line px-4 py-3 text-xs text-ink-soft">{t("payroll.formula")}</p>
          <div className="no-print flex flex-wrap gap-2 border-t border-line px-4 py-3">
            <Dialog trigger={t("payroll.addAdjustment")} title={t("payroll.addAdjustment")} triggerSize="sm">
              <AdjustmentForm workerId={workerId} payWeek={week} />
            </Dialog>
            {recorded.hasBase && shown.remainingCents !== 0 ? (
              <ActionButton
                action={carryForwardAction}
                fields={{ workerId, payWeek: week }}
                label={t("payroll.carryForward")}
                confirm={t("payroll.carryConfirm")}
                variant="secondary"
                size="sm"
              />
            ) : null}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title={t("payroll.recordPayment")} description={t("payroll.paymentHelp")} />
          <div className="p-4">
            {!detail.active ? (
              <p className="text-ink-soft">{t("workers.inactiveNotice")}</p>
            ) : shown.status === "settled" ? (
              <Notice tone="ok">
                {t("payroll.weekSettled")}
                {payments.find((p) => !p.reversalOf && !p.reversedBy) ? (
                  <>
                    {" · "}
                    <Link href={`/print/receipt/${payments.find((p) => !p.reversalOf && !p.reversedBy)!.id}`} target="_blank" className="font-semibold underline">
                      {t("print.receipt")}
                    </Link>
                  </>
                ) : null}
              </Notice>
            ) : (
              <PaymentForm ctx={ctx} />
            )}
            {!recorded.hasBase && detail.active ? (
              <details className="mt-4 rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">{t("payroll.confirmBaseOnly")}</summary>
                <div className="mt-3">
                  <BasePayForm ctx={ctx} />
                </div>
              </details>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t("payroll.earningsLines")} />
        {detail.earnings.length === 0 ? (
          <EmptyState title={t("payroll.noEarnings")} />
        ) : (
          <Table caption={t("payroll.earningsLines")}>
            <thead>
              <tr>
                <Th>{t("fields.type")}</Th>
                <Th>{t("fields.detail")}</Th>
                <Th num>{t("fields.amount")}</Th>
                <Th>{t("fields.createdBy")}</Th>
                <Th><span className="sr-only">{t("common.actions")}</span></Th>
              </tr>
            </thead>
            <tbody>
              {detail.earnings.map((e) => (
                <tr key={e.id} className={e.voidedAt ? "opacity-60" : undefined}>
                  <Td label={t("fields.type")} primary>
                    {t(`earningBasis.${e.basis}`)}
                    {e.voidedAt ? <Badge tone="bad" className="ms-2">{t("payroll.voidedBadge")}</Badge> : null}
                  </Td>
                  <Td label={t("fields.detail")}>
                    {e.quantity != null && e.rateCents != null ? (
                      <span className="num">
                        {e.quantity} × <Money cents={e.rateCents} />
                      </span>
                    ) : null}
                    {e.note ? <span className="block text-sm text-ink-soft">{e.note}</span> : null}
                    {e.voidReason ? <span className="block text-sm text-bad">{t("payroll.voidReason")}: {e.voidReason}</span> : null}
                  </Td>
                  <Td label={t("fields.amount")} num>
                    <Money cents={e.amountCents} className={e.voidedAt ? "line-through" : undefined} />
                  </Td>
                  <Td label={t("fields.createdBy")}>
                    <span className="text-sm">
                      {e.createdByName} · <span className="num">{formatDateTime(e.createdAt)}</span>
                    </span>
                  </Td>
                  <Td label="" className="no-print">
                    {owner && !e.voidedAt && e.basis !== "carry_in" ? (
                      <Dialog trigger={t("payroll.void")} title={t("payroll.void")} triggerSize="sm" triggerVariant="ghost">
                        <VoidEarningForm id={e.id} workerId={workerId} />
                      </Dialog>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {[
          { title: t("payroll.advancesThisWeek"), list: advances, empty: t("advances.empty") },
          { title: t("payroll.paymentsThisWeek"), list: payments, empty: t("payroll.noPayments") },
        ].map((block) => (
          <Card key={block.title}>
            <CardHeader title={block.title} />
            {block.list.length === 0 ? (
              <EmptyState title={block.empty} />
            ) : (
              <ul className="divide-y divide-line">
                {block.list.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/cash/ledger/${e.id}`} className="num font-medium text-primary hover:underline">
                        {e.reference}
                      </Link>
                      <span className="ms-2 text-sm text-ink-soft num">{formatDateTime(e.occurredAt)}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-sm">
                        {e.reversalOf ? <EntryTypeBadge type={e.entryType} reversal t={t} /> : null}
                        {e.advanceCategory ? <Badge>{t(`advanceCategory.${e.advanceCategory}`)}</Badge> : null}
                        {e.advanceTreatment === "business" ? <Badge tone="warn">{t("advanceTreatment.business")}</Badge> : null}
                        {e.reversedBy ? <Badge tone="bad">{t("ledger.reversed")}</Badge> : null}
                        {e.description ? <span className="text-ink-soft">{e.description}</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money cents={e.direction === "out" ? e.amountCents : -e.amountCents} className={e.reversedBy ? "line-through" : "font-semibold"} />
                      {e.entryType === "worker_payment" && !e.reversalOf ? (
                        <Link href={`/print/receipt/${e.id}`} target="_blank" className="no-print text-primary" aria-label={t("print.receipt")}>
                          <Printer className="size-4" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
