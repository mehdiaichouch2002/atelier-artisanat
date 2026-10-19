import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip, Pencil, Printer, MessageCircle } from "lucide-react";
import { pageContext, isUuid, param, type SearchParams } from "@/lib/page";
import { getOrder } from "@/domain/orders/service";
import { isOverdue, maxRefund, TRANSITIONS } from "@/domain/orders/logic";
import { Card, CardHeader, DefinitionList, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge, categoryLabel } from "@/components/labels";
import { Table, Td, Th } from "@/components/table";
import { EntriesTable } from "@/components/entries-table";
import { ActionButton } from "@/components/confirm-action";
import { Dialog } from "@/components/forms";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { whatsappLink } from "@/lib/whatsapp";
import { accountOptions, nowLocal } from "../../payroll/context";
import { changeStatusAction } from "../actions";
import { AttachmentUploadForm, CancelOrderForm, OrderAdjustmentForm, OrderPaymentForm } from "../money-forms";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const { t, q, user } = await pageContext();
  const data = await q(async (tx) => ({ order: await getOrder(tx, id), accounts: await accountOptions(tx) }));
  if (!data.order) notFound();
  const o = data.order;
  const today = todayLocal();
  const overdue = isOverdue(o.status, o.dueDate, today);
  const closed = o.status === "delivered" || o.status === "cancelled";
  const next = TRANSITIONS[o.status].filter((s) => s !== "cancelled");
  const wa = whatsappLink(o.customerPhone);
  const now = nowLocal();

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="num">{o.reference}</span>
            <OrderStatusBadge status={o.status} t={t} />
            {overdue ? <Badge tone="bad">⚠ {t("orders.overdue")}</Badge> : null}
            {o.priority === "urgent" || o.priority === "high" ? <Badge tone="copper">{t(`priority.${o.priority}`)}</Badge> : null}
          </span>
        }
        description={
          <Link href={`/customers/${o.customerId}`} className="text-primary hover:underline">
            {o.customerName}
          </Link>
        }
        back={<Link href="/orders" className="text-primary hover:underline">← {t("nav.orders")}</Link>}
        actions={
          <>
            <LinkButton href={`/print/order/${id}`} target="_blank" variant="secondary">
              <Printer className="size-4" aria-hidden /> {t("print.orderSummary")}
            </LinkButton>
            {!closed && can(user.role, "orders.manage") ? (
              <LinkButton href={`/orders/${id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden /> {t("common.edit")}
              </LinkButton>
            ) : null}
          </>
        }
      />
      {param(sp, "saved") ? <div className="mb-4"><Notice tone="ok">{t("orders.saved")}</Notice></div> : null}

      {!closed && can(user.role, "orders.manage") ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <span className="me-2 text-sm font-medium text-ink-soft">{t("orders.moveTo")}</span>
            {next.map((s) => (
              <ActionButton
                key={s}
                action={changeStatusAction}
                fields={{ orderId: id, to: s }}
                label={t(`orderStatus.${s}`)}
                variant={s === "delivered" || s === "ready" ? "primary" : "secondary"}
                size="sm"
                confirm={s === "delivered" && o.money.balanceCents > 0 ? t("orders.deliverUnpaidConfirm") : undefined}
              />
            ))}
            <span className="ms-auto">
              <Dialog trigger={t("orders.cancel")} title={t("orders.cancelTitle")} triggerVariant="ghost" triggerSize="sm">
                <CancelOrderForm orderId={id} paidCents={o.money.paidCents - o.money.refundedCents} />
              </Dialog>
            </span>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("orders.lines")} />
          <Table caption={t("orders.lines")}>
            <thead>
              <tr>
                <Th>{t("fields.description")}</Th>
                <Th>{t("fields.category")}</Th>
                <Th num>{t("fields.quantity")}</Th>
                <Th num>{t("fields.unitPrice")}</Th>
                <Th num>{t("fields.total")}</Th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id}>
                  <Td label={t("fields.description")} primary>{l.description}</Td>
                  <Td label={t("fields.category")}>{categoryLabel(l, t)}</Td>
                  <Td label={t("fields.quantity")} num><span className="num">{l.quantity}</span></Td>
                  <Td label={t("fields.unitPrice")} num><Money cents={l.unitPriceCents} /></Td>
                  <Td label={t("fields.total")} num><Money cents={l.lineTotalCents} /></Td>
                </tr>
              ))}
              {o.adjustments.map((a) => (
                <tr key={a.id}>
                  <Td label={t("orders.adjustment")} primary>
                    {t("orders.adjustment")}: {a.reason}
                    <span className="block text-xs font-normal text-ink-soft">
                      {a.createdByName} · <span className="num">{formatDateTime(a.createdAt)}</span>
                    </span>
                  </Td>
                  <Td label="" />
                  <Td label="" />
                  <Td label="" />
                  <Td label={t("fields.total")} num><Money cents={a.amountCents} signed /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!closed && can(user.role, "orders.manage") ? (
            <div className="no-print border-t border-line p-3">
              <Dialog trigger={t("orders.addAdjustment")} title={t("orders.addAdjustment")} triggerSize="sm">
                <OrderAdjustmentForm orderId={id} />
              </Dialog>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title={t("orders.moneyTitle")} />
          <dl className="space-y-1.5 p-4">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{o.status === "cancelled" ? t("orders.cancellationFee") : t("money.agreedTotal")}</dt>
              <dd><Money cents={o.money.dueCents} /></dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{t("money.paid")}</dt>
              <dd><Money cents={o.money.paidCents} /></dd>
            </div>
            {o.money.refundedCents ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">{t("money.refunded")}</dt>
                <dd><Money cents={o.money.refundedCents} /></dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-line-strong pt-2 text-lg font-semibold">
              <dt>{o.money.balanceCents < 0 ? t("orders.creditToRefund") : t("money.balance")}</dt>
              <dd><Money cents={Math.abs(o.money.balanceCents)} tone={o.money.balanceCents < 0 ? "out" : undefined} /></dd>
            </div>
            <div className="pt-1">
              <Badge tone={o.money.paymentState === "paid" ? "ok" : o.money.paymentState === "deposit" ? "info" : o.money.paymentState === "credit" ? "bad" : "neutral"}>
                {t(`paymentState.${o.money.paymentState}`)}
              </Badge>
            </div>
            <p className="pt-2 text-xs text-ink-soft">{t("orders.balanceFormula")}</p>
          </dl>
          <div className="no-print flex flex-wrap gap-2 border-t border-line p-3">
            {o.status !== "cancelled" && o.money.balanceCents > 0 && can(user.role, "payments.record") ? (
              <Dialog trigger={t("orders.recordPayment")} title={`${t("orders.recordPayment")} — ${o.reference}`} triggerVariant="primary" triggerSize="sm">
                <OrderPaymentForm orderId={id} balanceCents={o.money.balanceCents} nowLocal={now} {...data.accounts} />
              </Dialog>
            ) : null}
            {maxRefund(o.money.paidCents, o.money.refundedCents) > 0 && can(user.role, "refunds.record") ? (
              <Dialog trigger={t("orders.refund")} title={`${t("orders.refund")} — ${o.reference}`} triggerVariant="secondary" triggerSize="sm">
                <OrderPaymentForm
                  orderId={id}
                  refund
                  maxRefundCents={maxRefund(o.money.paidCents, o.money.refundedCents)}
                  creditCents={Math.max(0, -o.money.balanceCents)}
                  nowLocal={now}
                  {...data.accounts}
                />
              </Dialog>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("orders.payments")} />
          {o.payments.length === 0 ? (
            <EmptyState title={t("orders.noPayments")}>{t("orders.noPaymentsHelp")}</EmptyState>
          ) : (
            <EntriesTable entries={o.payments} t={t} cols={["date", "reference", "type", "account", "description", "amount"]} caption={t("orders.payments")} />
          )}
        </Card>
        <Card>
          <CardHeader title={t("orders.details")} />
          <div className="space-y-4 p-4">
            <DefinitionList
              items={[
                { label: t("fields.orderDate"), value: <span className="num">{formatDate(o.orderDate)}</span> },
                {
                  label: t("fields.dueDate"),
                  value: o.dueDate ? <span className={overdue ? "num font-semibold text-bad" : "num"}>{formatDate(o.dueDate)}</span> : "—",
                },
                { label: t("fields.priority"), value: t(`priority.${o.priority}`) },
                {
                  label: t("fields.assignedWorker"),
                  value: o.assignedWorkerId ? <Link href={`/workers/${o.assignedWorkerId}`} className="text-primary hover:underline">{o.assignedWorkerName}</Link> : "—",
                },
                { label: t("fields.phone"), value: o.customerPhone ? <a href={`tel:${o.customerPhone}`} className="num text-primary underline">{o.customerPhone}</a> : "—" },
              ]}
            />
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline">
                <MessageCircle className="size-4" aria-hidden /> {t("customers.whatsapp")}
              </a>
            ) : null}
            {o.notes ? (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("fields.notes")}</h3>
                <p className="mt-1 whitespace-pre-line">{o.notes}</p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("orders.history")} />
          <ol className="space-y-0 p-4">
            {o.history.map((h, i) => (
              <li key={i} className="relative border-s-2 border-line ps-4 pb-4 last:pb-0">
                <span className="absolute -start-[7px] top-1 size-3 rounded-full border-2 border-surface bg-primary" aria-hidden />
                <div className="flex flex-wrap items-center gap-2">
                  <OrderStatusBadge status={h.toStatus} t={t} />
                  <span className="num text-sm text-ink-soft">{formatDateTime(h.changedAt)}</span>
                </div>
                <div className="text-sm text-ink-soft">{h.changedByName ?? "—"}</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader title={t("orders.attachments")} />
          <div className="space-y-3 p-4">
            {o.attachments.length === 0 ? (
              <p className="text-sm text-ink-soft">{t("orders.noAttachments")}</p>
            ) : (
              <ul className="space-y-2">
                {o.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-primary underline">
                      <Paperclip className="size-4" aria-hidden /> {a.filename}
                    </a>
                    <span className="ms-2 text-xs text-ink-soft num">{Math.ceil(a.sizeBytes / 1024)} Ko</span>
                  </li>
                ))}
              </ul>
            )}
            {can(user.role, "orders.manage") ? <div className="no-print"><AttachmentUploadForm orderId={id} /></div> : null}
          </div>
        </Card>
      </div>
    </>
  );
}
