import Link from "next/link";
import { notFound } from "next/navigation";
import { HandCoins, Pencil, Banknote } from "lucide-react";
import { pageContext, isUuid, param, type SearchParams } from "@/lib/page";
import { getWorker, arrangementHistory } from "@/domain/workers/service";
import { getSettings } from "@/domain/settings/service";
import { workerWeeks, workerPeriodTotals } from "@/domain/payroll/service";
import { listEntries } from "@/domain/ledger/service";
import { Card, CardHeader, DefinitionList, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ActiveBadge, categoryLabel, EntryTypeBadge, WeekStatusBadge } from "@/components/labels";
import { Table, Td, Th } from "@/components/table";
import { ActionButton } from "@/components/confirm-action";
import { formatDate, formatDateTime, todayLocal, weekStart, addDays } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { arrangementSummary } from "../arrangement";
import { setWorkerActiveAction } from "../actions";

export default async function WorkerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { t, q, user } = await pageContext();
  const today = todayLocal();
  const data = await q(async (tx) => {
    const worker = await getWorker(tx, id);
    if (!worker) return null;
    const settings = await getSettings(tx);
    const monthStart = weekStart(`${today.slice(0, 8)}01`, settings.weekStartDay);
    const currentWeek = weekStart(today, settings.weekStartDay);
    return {
      worker,
      currentWeek,
      weeks: await workerWeeks(tx, id, 12),
      month: await workerPeriodTotals(tx, id, monthStart, currentWeek),
      monthStart,
      history: await arrangementHistory(tx, id),
      entries: (await listEntries(tx, { workerId: id }, { limit: 10, offset: 0 })).rows,
    };
  });
  if (!data) notFound();
  const { worker, weeks, month, history, entries, currentWeek } = data;
  const manage = can(user.role, "workers.manage");

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {worker.fullName}
            <ActiveBadge active={worker.active} t={t} />
          </span>
        }
        description={[worker.code ? `#${worker.code}` : null, categoryLabel(worker, t)].filter(Boolean).join(" · ")}
        back={<Link href="/workers" className="text-primary hover:underline">← {t("nav.workers")}</Link>}
        actions={
          <>
            {worker.active ? (
              <>
                <LinkButton href={`/advances/new?worker=${id}`} variant="copper">
                  <HandCoins className="size-4" aria-hidden /> {t("quick.advance")}
                </LinkButton>
                <LinkButton href={`/payroll/${id}?week=${currentWeek}`}>
                  <Banknote className="size-4" aria-hidden /> {t("payroll.recordPayment")}
                </LinkButton>
              </>
            ) : null}
            {manage ? (
              <LinkButton href={`/workers/${id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden /> {t("common.edit")}
              </LinkButton>
            ) : null}
          </>
        }
      />
      {param(sp, "saved") ? (
        <div className="mb-4">
          <Notice tone="ok">{t("workers.saved")}</Notice>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("workers.balanceTitle")} description={t("workers.balanceHelp")} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="rounded-lg bg-sunken p-4">
              <div className="text-sm text-ink-soft">{t("payroll.balanceOwed")}</div>
              <div className="mt-1 text-2xl font-semibold">
                <Money cents={worker.balanceCents} tone="auto" />
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {worker.balanceCents < 0 ? t("workers.balanceNegative") : t("workers.balancePositive")}
              </p>
              {worker.pendingAdvancesCents ? (
                <div className="mt-3 border-t border-line pt-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-soft">{t("payroll.pendingAdvances")}</span>
                    <Money cents={worker.pendingAdvancesCents} />
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">{t("workers.pendingHelp")}</p>
                </div>
              ) : null}
            </div>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">{t("workers.monthEarned", { date: formatDate(data.monthStart) })}</dt>
                <dd><Money cents={month.earnedCents} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">{t("advances.wageAdvances")}</dt>
                <dd><Money cents={month.wageAdvancesCents} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">{t("advances.businessAdvances")}</dt>
                <dd><Money cents={month.businessAdvancesCents} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">{t("payroll.paid")}</dt>
                <dd><Money cents={month.paymentsCents} /></dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("workers.details")} />
          <div className="p-4">
            <DefinitionList
              items={[
                { label: t("workers.arrangement"), value: arrangementSummary(worker, t) },
                { label: t("fields.startDate"), value: <span className="num">{formatDate(worker.startDate)}</span> },
                { label: t("fields.phone"), value: worker.phone ? <a className="num text-primary underline" href={`tel:${worker.phone}`}>{worker.phone}</a> : "—" },
                { label: t("fields.notes"), value: worker.notes ?? "—" },
              ]}
            />
            {manage ? (
              <div className="mt-4 border-t border-line pt-4">
                <ActionButton
                  action={setWorkerActiveAction}
                  fields={{ id, active: worker.active ? "" : "on" }}
                  label={worker.active ? t("workers.deactivate") : t("workers.reactivate")}
                  confirm={worker.active ? t("workers.deactivateConfirm") : undefined}
                  variant={worker.active ? "danger" : "primary"}
                  size="sm"
                />
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t("workers.weeksTitle")} description={t("payroll.formula")} />
        {weeks.length === 0 ? (
          <EmptyState title={t("workers.noWeeks")} />
        ) : (
          <Table caption={t("workers.weeksTitle")}>
            <thead>
              <tr>
                <Th>{t("payroll.week")}</Th>
                <Th num>{t("payroll.due")}</Th>
                <Th num>{t("payroll.advances")}</Th>
                <Th num>{t("payroll.paid")}</Th>
                <Th num>{t("payroll.remaining")}</Th>
                <Th>{t("fields.status")}</Th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.payWeek}>
                  <Td label={t("payroll.week")} primary>
                    <Link href={`/payroll/${id}?week=${w.payWeek}`} className="num text-primary hover:underline">
                      {formatDate(w.payWeek)} → {formatDate(addDays(w.payWeek, 6))}
                    </Link>
                  </Td>
                  <Td label={t("payroll.due")} num>{w.status === "pending" ? "—" : <Money cents={w.dueCents} />}</Td>
                  <Td label={t("payroll.advances")} num><Money cents={w.wageAdvancesCents} /></Td>
                  <Td label={t("payroll.paid")} num><Money cents={w.paymentsCents} /></Td>
                  <Td label={t("payroll.remaining")} num>
                    {w.status === "pending" ? "—" : <Money cents={w.remainingCents} tone="auto" className="font-semibold" />}
                  </Td>
                  <Td label={t("fields.status")}><WeekStatusBadge status={w.status} t={t} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={t("workers.transactions")}
          actions={<Link href={`/cash/ledger?worker=${id}`} className="text-sm text-primary hover:underline">{t("common.seeAll")}</Link>}
        />
        {entries.length === 0 ? (
          <EmptyState title={t("ledger.empty")} />
        ) : (
          <Table caption={t("workers.transactions")}>
            <thead>
              <tr>
                <Th>{t("fields.date")}</Th>
                <Th>{t("fields.reference")}</Th>
                <Th>{t("fields.type")}</Th>
                <Th>{t("payroll.week")}</Th>
                <Th num>{t("fields.amount")}</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td label={t("fields.date")}><span className="num">{formatDateTime(e.occurredAt)}</span></Td>
                  <Td label={t("fields.reference")} primary>
                    <Link href={`/cash/ledger/${e.id}`} className="num text-primary hover:underline">{e.reference}</Link>
                  </Td>
                  <Td label={t("fields.type")}>
                    <EntryTypeBadge type={e.entryType} reversal={Boolean(e.reversalOf)} t={t} />
                    {e.advanceCategory ? <span className="ms-1 text-xs text-ink-soft">{t(`advanceCategory.${e.advanceCategory}`)}</span> : null}
                  </Td>
                  <Td label={t("payroll.week")}><span className="num">{e.payWeek ? formatDate(e.payWeek) : "—"}</span></Td>
                  <Td label={t("fields.amount")} num>
                    <Money cents={e.direction === "in" ? e.amountCents : -e.amountCents} signed tone={e.direction === "in" ? "in" : "out"} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {history.length > 1 ? (
        <Card className="mt-4">
          <CardHeader title={t("workers.arrangementHistory")} />
          <ul className="divide-y divide-line">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                <span>{arrangementSummary(h, t)}</span>
                <span className="text-ink-soft">
                  <span className="num">{formatDateTime(h.effectiveAt)}</span> · {h.changedByName ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
