import { notFound } from "next/navigation";
import { pageContext, isUuid } from "@/lib/page";
import { getEntry } from "@/domain/ledger/service";
import { getSettings } from "@/domain/settings/service";
import { weekComponents } from "@/domain/payroll/service";
import { summarizeWeek } from "@/domain/payroll/logic";
import { orderBalance } from "@/domain/orders/service";
import { Money } from "@/components/ui/money";
import { addDays, formatDate, formatDateTime } from "@/lib/dates";
import { PrintHeader } from "../../header";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { t, q } = await pageContext();
  const data = await q(async (tx) => {
    const e = await getEntry(tx, id);
    if (!e) return null;
    const settings = await getSettings(tx);
    const week = e.workerId && e.payWeek ? summarizeWeek(await weekComponents(tx, e.workerId, e.payWeek)) : null;
    const order = e.orderId && (e.entryType === "customer_payment" || e.entryType === "customer_refund") ? await orderBalance(tx, e.orderId) : null;
    return { e, settings, week, order };
  });
  if (!data) notFound();
  const { e, settings, week, order } = data;
  const party = e.workerName ?? e.customerName ?? e.supplier;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-line py-2">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
  return (
    <article>
      <PrintHeader workshop={settings.workshopName} title={t(`print.receiptTitle.${e.entryType}`)} subtitle={<span className="num">{e.reference}</span>} t={t} />
      {e.reversalOf ? <p className="mb-4 rounded border border-bad p-2 text-bad">{t("ledger.reversal")}</p> : null}
      {e.reversedBy ? <p className="mb-4 rounded border border-bad p-2 text-bad">{t("ledger.reversedBy")} {e.reversedByReference}</p> : null}
      <div className="mb-6 rounded-lg border-2 border-ink p-4 text-center">
        <div className="text-sm text-ink-soft">{t("fields.amount")}</div>
        <div className="text-3xl font-bold"><Money cents={e.amountCents} /></div>
      </div>
      <dl>
        {row(t("fields.dateTime"), <span className="num">{formatDateTime(e.occurredAt)}</span>)}
        {party ? row(e.workerId ? t("fields.worker") : e.customerId ? t("fields.customer") : t("fields.supplier"), party) : null}
        {e.orderReference ? row(t("fields.order"), <span className="num">{e.orderReference}</span>) : null}
        {e.payWeek ? row(t("payroll.week"), <span className="num">{formatDate(e.payWeek)} → {formatDate(addDays(e.payWeek, 6))}</span>) : null}
        {e.advanceCategory ? row(t("fields.category"), t(`advanceCategory.${e.advanceCategory}`)) : null}
        {e.advanceTreatment ? row(t("advances.treatment"), t(`advanceTreatment.${e.advanceTreatment}`)) : null}
        {e.expenseCategory && e.entryType === "expense" ? row(t("fields.category"), t(`expenseCategory.${e.expenseCategory}`)) : null}
        {row(t("fields.method"), `${t(`method.${e.method}`)} · ${e.accountName}`)}
        {e.description ? row(t("fields.note"), e.description) : null}
        {row(t("fields.createdBy"), e.createdByName ?? "—")}
      </dl>
      {week && e.entryType === "worker_payment" ? (
        <section className="mt-6">
          <h2 className="mb-2 font-sans text-base font-semibold">{t("print.weekSituation")}</h2>
          <dl>
            {row(t("payroll.due"), <Money cents={week.dueCents} />)}
            {row(t("payroll.wageAdvancesDeducted"), <Money cents={week.wageAdvancesCents} />)}
            {row(t("payroll.paymentsMade"), <Money cents={week.paymentsCents} />)}
            {row(t("payroll.remaining"), <Money cents={week.remainingCents} />)}
          </dl>
          <p className="mt-2 text-xs text-ink-soft">{t("print.situationAtPrint")}</p>
        </section>
      ) : null}
      {order ? (
        <section className="mt-6">
          <h2 className="mb-2 font-sans text-base font-semibold">{t("print.orderSituation")}</h2>
          <dl>
            {row(t("money.agreedTotal"), <Money cents={order.dueCents} />)}
            {row(t("money.paid"), <Money cents={order.paidCents} />)}
            {order.refundedCents ? row(t("money.refunded"), <Money cents={order.refundedCents} />) : null}
            {row(t("money.balance"), <Money cents={order.balanceCents} />)}
          </dl>
        </section>
      ) : null}
      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <div className="border-t border-ink pt-2">{t("print.signatureWorkshop")}</div>
        <div className="border-t border-ink pt-2">{t("print.signatureRecipient")}</div>
      </div>
      <p className="mt-8 text-xs text-ink-soft">{t("print.disclaimer")}</p>
    </article>
  );
}
