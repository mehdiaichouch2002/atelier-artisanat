import { notFound } from "next/navigation";
import { pageContext, isUuid } from "@/lib/page";
import { getOrder } from "@/domain/orders/service";
import { getSettings } from "@/domain/settings/service";
import { Money } from "@/components/ui/money";
import { categoryLabel } from "@/components/labels";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PrintHeader } from "../../header";

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { t, q } = await pageContext();
  const data = await q(async (tx) => ({ order: await getOrder(tx, id), settings: await getSettings(tx) }));
  if (!data.order) notFound();
  const o = data.order;
  return (
    <article>
      <PrintHeader workshop={data.settings.workshopName} title={t("print.orderSummary")} subtitle={<span className="num">{o.reference} · {t(`orderStatus.${o.status}`)}</span>} t={t} />
      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-ink-soft">{t("fields.customer")}</div>
          <div className="font-semibold">{o.customerName}</div>
          {o.customerPhone ? <div className="num">{o.customerPhone}</div> : null}
        </div>
        <div className="text-end">
          <div>{t("fields.orderDate")}: <span className="num">{formatDate(o.orderDate)}</span></div>
          <div>{t("fields.dueDate")}: <span className="num">{o.dueDate ? formatDate(o.dueDate) : "—"}</span></div>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-start">
            <th className="py-1 text-start">{t("fields.description")}</th>
            <th className="py-1 text-start">{t("fields.category")}</th>
            <th className="py-1 text-end">{t("fields.quantity")}</th>
            <th className="py-1 text-end">{t("fields.unitPrice")}</th>
            <th className="py-1 text-end">{t("fields.total")}</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-1.5">{l.description}</td>
              <td className="py-1.5">{categoryLabel(l, t)}</td>
              <td className="num py-1.5 text-end">{l.quantity}</td>
              <td className="py-1.5 text-end"><Money cents={l.unitPriceCents} /></td>
              <td className="py-1.5 text-end"><Money cents={l.lineTotalCents} /></td>
            </tr>
          ))}
          {o.adjustments.map((a) => (
            <tr key={a.id} className="border-b border-line">
              <td className="py-1.5" colSpan={4}>{t("orders.adjustment")}: {a.reason}</td>
              <td className="py-1.5 text-end"><Money cents={a.amountCents} signed /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ms-auto mt-4 w-full max-w-xs text-sm">
        <div className="flex justify-between py-1"><dt>{o.status === "cancelled" ? t("orders.cancellationFee") : t("money.agreedTotal")}</dt><dd><Money cents={o.money.dueCents} /></dd></div>
        <div className="flex justify-between py-1"><dt>{t("money.paid")}</dt><dd><Money cents={o.money.paidCents} /></dd></div>
        {o.money.refundedCents ? <div className="flex justify-between py-1"><dt>{t("money.refunded")}</dt><dd><Money cents={o.money.refundedCents} /></dd></div> : null}
        <div className="flex justify-between border-t-2 border-ink py-1 text-base font-bold"><dt>{t("money.balance")}</dt><dd><Money cents={o.money.balanceCents} /></dd></div>
      </dl>
      {o.payments.length ? (
        <section className="mt-6 text-sm">
          <h2 className="mb-2 font-sans text-base font-semibold">{t("orders.payments")}</h2>
          <ul>
            {o.payments.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-line py-1">
                <span className="num">{formatDateTime(p.occurredAt)} · {p.reference} · {t(`entryType.${p.entryType}`)}</span>
                <Money cents={p.direction === "in" ? p.amountCents : -p.amountCents} signed />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {o.notes ? <p className="mt-6 whitespace-pre-line text-sm">{o.notes}</p> : null}
    </article>
  );
}
