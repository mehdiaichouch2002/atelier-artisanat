import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, MessageCircle } from "lucide-react";
import { pageContext, isUuid, param, type SearchParams } from "@/lib/page";
import { getCustomer } from "@/domain/customers/service";
import { listOrders } from "@/domain/orders/service";
import { listEntries } from "@/domain/ledger/service";
import { Card, CardHeader, DefinitionList, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ActiveBadge, OrderStatusBadge } from "@/components/labels";
import { Table, Td, Th } from "@/components/table";
import { EntriesTable } from "@/components/entries-table";
import { ActionButton } from "@/components/confirm-action";
import { formatDate, todayLocal } from "@/lib/dates";
import { isOverdue } from "@/domain/orders/logic";
import { whatsappLink } from "@/lib/whatsapp";
import { setCustomerActiveAction } from "../actions";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const { t, q } = await pageContext();
  const data = await q(async (tx) => {
    const customer = await getCustomer(tx, id);
    if (!customer) return null;
    return {
      customer,
      orders: (await listOrders(tx, { customerId: id }, { sort: "recent", limit: 100 })).rows,
      payments: (await listEntries(tx, { customerId: id }, { limit: 50, offset: 0 })).rows,
    };
  });
  if (!data) notFound();
  const { customer: c, orders, payments } = data;
  const today = todayLocal();
  const wa = whatsappLink(c.phone);
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.name}<ActiveBadge active={c.active} t={t} /></span>}
        back={<Link href="/customers" className="text-primary hover:underline">← {t("nav.customers")}</Link>}
        actions={
          <>
            <LinkButton href={`/orders/new?customer=${id}`}>
              <Plus className="size-4" aria-hidden /> {t("orders.new")}
            </LinkButton>
            <LinkButton href={`/customers/${id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> {t("common.edit")}
            </LinkButton>
          </>
        }
      />
      {param(sp, "saved") ? <div className="mb-4"><Notice tone="ok">{t("customers.saved")}</Notice></div> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("customers.accountTitle")} description={t("customers.balanceFormula")} />
          <dl className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
            {[
              { label: t("money.agreedTotal"), cents: c.dueCents },
              { label: t("money.paid"), cents: c.paidCents },
              { label: t("money.refunded"), cents: c.refundedCents },
              { label: t("money.balance"), cents: c.balanceCents, strong: true },
            ].map((x) => (
              <div key={x.label} className={x.strong ? "rounded-lg bg-sunken p-3" : "p-3"}>
                <dt className="text-sm text-ink-soft">{x.label}</dt>
                <dd className="mt-1 text-lg font-semibold"><Money cents={x.cents} tone={x.strong ? "auto" : undefined} /></dd>
              </div>
            ))}
          </dl>
          {c.balanceCents < 0 ? <p className="px-4 pb-4 text-sm text-warn">{t("customers.creditNote")}</p> : null}
        </Card>
        <Card>
          <CardHeader title={t("customers.details")} />
          <div className="space-y-4 p-4">
            <DefinitionList
              items={[
                { label: t("fields.phone"), value: c.phone ? <a href={`tel:${c.phone}`} className="num text-primary underline">{c.phone}</a> : "—" },
                { label: t("fields.email"), value: c.email ? <a href={`mailto:${c.email}`} className="text-primary underline">{c.email}</a> : "—" },
                { label: t("fields.address"), value: c.address ?? "—" },
                { label: t("fields.notes"), value: c.notes ?? "—" },
              ]}
            />
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline">
                <MessageCircle className="size-4" aria-hidden /> {t("customers.whatsapp")}
              </a>
            ) : null}
            <div className="border-t border-line pt-3">
              <ActionButton
                action={setCustomerActiveAction}
                fields={{ id, active: c.active ? "" : "on" }}
                label={c.active ? t("customers.deactivate") : t("customers.reactivate")}
                confirm={c.active ? t("customers.deactivateConfirm") : undefined}
                variant={c.active ? "danger" : "primary"}
                size="sm"
              />
            </div>
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title={t("nav.orders")} />
        {orders.length === 0 ? (
          <EmptyState title={t("orders.empty")} action={<LinkButton href={`/orders/new?customer=${id}`}>{t("orders.new")}</LinkButton>} />
        ) : (
          <Table caption={t("nav.orders")}>
            <thead>
              <tr>
                <Th>{t("fields.reference")}</Th>
                <Th>{t("fields.date")}</Th>
                <Th>{t("fields.dueDate")}</Th>
                <Th>{t("fields.status")}</Th>
                <Th num>{t("money.agreed")}</Th>
                <Th num>{t("money.balance")}</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <Td label={t("fields.reference")} primary>
                    <Link href={`/orders/${o.id}`} className="num text-primary hover:underline">{o.reference}</Link>
                    {o.firstLine ? <span className="ms-2 text-sm font-normal text-ink-soft">{o.firstLine}</span> : null}
                  </Td>
                  <Td label={t("fields.date")}><span className="num">{formatDate(o.orderDate)}</span></Td>
                  <Td label={t("fields.dueDate")}>
                    <span className={isOverdue(o.status, o.dueDate, today) ? "num font-semibold text-bad" : "num"}>{formatDate(o.dueDate) || "—"}</span>
                  </Td>
                  <Td label={t("fields.status")}><OrderStatusBadge status={o.status} t={t} /></Td>
                  <Td label={t("money.agreed")} num><Money cents={o.money.dueCents} /></Td>
                  <Td label={t("money.balance")} num><Money cents={o.money.balanceCents} tone="auto" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card className="mt-4">
        <CardHeader title={t("customers.payments")} />
        {payments.length === 0 ? (
          <EmptyState title={t("customers.noPayments")} />
        ) : (
          <EntriesTable entries={payments} t={t} cols={["date", "reference", "type", "party", "account", "amount"]} caption={t("customers.payments")} />
        )}
      </Card>
    </>
  );
}
