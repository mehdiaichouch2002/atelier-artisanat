import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip, Printer } from "lucide-react";
import { pageContext, isUuid } from "@/lib/page";
import { getEntry } from "@/domain/ledger/service";
import { Card, CardHeader, DefinitionList, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { EntryTypeBadge } from "@/components/labels";
import { Dialog } from "@/components/forms";
import { formatDate, formatDateTime } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { ReverseForm } from "../../forms";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { t, q, user } = await pageContext();
  const data = await q(async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry) return null;
    const attachments = await tx<{ id: string; filename: string }[]>`
      select id, filename from atelier.attachments where ledger_entry_id = ${id} order by created_at`;
    const original = entry.reversalOf ? await getEntry(tx, entry.reversalOf) : null;
    return { entry, attachments, original };
  });
  if (!data) notFound();
  const { entry: e, attachments, original } = data;
  const printable = ["worker_payment", "worker_advance", "customer_payment", "customer_refund", "expense"].includes(e.entryType);
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="num">{e.reference}</span><EntryTypeBadge type={e.entryType} reversal={Boolean(e.reversalOf)} t={t} /></span>}
        back={<Link href="/cash/ledger" className="text-primary hover:underline">← {t("ledger.title")}</Link>}
        actions={
          <>
            {printable ? (
              <LinkButton href={`/print/receipt/${id}`} target="_blank" variant="secondary">
                <Printer className="size-4" aria-hidden /> {t("print.receipt")}
              </LinkButton>
            ) : null}
            {can(user.role, "ledger.reverse") && !e.reversalOf && !e.reversedBy ? (
              <Dialog trigger={t("ledger.reverse")} title={`${t("ledger.reverse")} — ${e.reference}`} triggerVariant="danger">
                <ReverseForm entryId={id} />
              </Dialog>
            ) : null}
          </>
        }
      />
      {e.reversedBy ? (
        <div className="mb-4">
          <Notice tone="warn">
            {t("ledger.reversedBy")} <Link href={`/cash/ledger/${e.reversedBy}`} className="num font-semibold underline">{e.reversedByReference}</Link>
          </Notice>
        </div>
      ) : null}
      {original ? (
        <div className="mb-4">
          <Notice tone="info">
            {t("ledger.reversalOf")} <Link href={`/cash/ledger/${original.id}`} className="num font-semibold underline">{original.reference}</Link>
          </Notice>
        </div>
      ) : null}
      <Card>
        <CardHeader title={<Money cents={e.direction === "in" ? e.amountCents : -e.amountCents} signed tone={e.direction === "in" ? "in" : "out"} />} description={t(`direction.${e.direction}`)} />
        <div className="p-4">
          <DefinitionList
            items={[
              { label: t("fields.dateTime"), value: <span className="num">{formatDateTime(e.occurredAt)}</span> },
              { label: t("fields.account"), value: `${e.accountName} · ${t(`method.${e.method}`)}` },
              ...(e.workerId ? [{ label: t("fields.worker"), value: <Link href={`/workers/${e.workerId}`} className="text-primary hover:underline">{e.workerName}</Link> }] : []),
              ...(e.payWeek ? [{ label: t("payroll.week"), value: <Link href={`/payroll/${e.workerId}?week=${e.payWeek}`} className="num text-primary hover:underline">{formatDate(e.payWeek)}</Link> }] : []),
              ...(e.customerId ? [{ label: t("fields.customer"), value: <Link href={`/customers/${e.customerId}`} className="text-primary hover:underline">{e.customerName}</Link> }] : []),
              ...(e.orderId ? [{ label: t("fields.order"), value: <Link href={`/orders/${e.orderId}`} className="num text-primary hover:underline">{e.orderReference}</Link> }] : []),
              ...(e.advanceCategory ? [{ label: t("fields.category"), value: t(`advanceCategory.${e.advanceCategory}`) }] : []),
              ...(e.advanceTreatment ? [{ label: t("advances.treatment"), value: t(`advanceTreatment.${e.advanceTreatment}`) }] : []),
              ...(e.expenseCategory ? [{ label: t("fields.expenseCategory"), value: t(`expenseCategory.${e.expenseCategory}`) }] : []),
              ...(e.supplier ? [{ label: t("fields.supplier"), value: e.supplier }] : []),
              { label: t("fields.description"), value: e.description ?? "—" },
              { label: t("fields.createdBy"), value: <>{e.createdByName} · <span className="num">{formatDateTime(e.createdAt)}</span></> },
            ]}
          />
          {attachments.length ? (
            <ul className="mt-4 space-y-1 border-t border-line pt-3">
              {attachments.map((a) => (
                <li key={a.id}>
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-primary underline">
                    <Paperclip className="size-4" aria-hidden /> {a.filename}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">{t("ledger.immutableNote")}</p>
        </div>
      </Card>
    </>
  );
}
