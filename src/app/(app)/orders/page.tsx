import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Columns3, Plus } from "lucide-react";
import { pageContext, pageNumber, param, isUuid, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listOrders, type OrderSort } from "@/domain/orders/service";
import { listCategories } from "@/domain/settings/service";
import { isOverdue, OPEN_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/domain/orders/logic";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge, catLabel } from "@/components/labels";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination, Table, Td, Th } from "@/components/table";
import { formatDate, isIsoDate, todayLocal } from "@/lib/dates";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.orders") };
}

const PAGE_SIZE = 25;

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext();
  const today = todayLocal();
  const search = param(sp, "q");
  const statusParam = param(sp, "status") ?? "open";
  const statuses: OrderStatus[] =
    statusParam === "open" ? [...OPEN_STATUSES] : statusParam === "all" ? [] : ORDER_STATUSES.filter((s) => s === statusParam);
  const overdue = param(sp, "overdue") === "1";
  const withBalance = param(sp, "balance") === "1";
  const categoryId = isUuid(param(sp, "category")) ? param(sp, "category") : undefined;
  const customerId = isUuid(param(sp, "customer")) ? param(sp, "customer") : undefined;
  const dueFrom = isIsoDate(param(sp, "dueFrom") ?? "") ? param(sp, "dueFrom") : undefined;
  const dueTo = isIsoDate(param(sp, "dueTo") ?? "") ? param(sp, "dueTo") : undefined;
  const orderFrom = isIsoDate(param(sp, "from") ?? "") ? param(sp, "from") : undefined;
  const orderTo = isIsoDate(param(sp, "to") ?? "") ? param(sp, "to") : undefined;
  const sort = (["due", "recent", "reference", "balance"] as const).find((s) => s === param(sp, "sort")) ?? ("due" as OrderSort);
  const page = pageNumber(sp);
  const [{ rows, total }, categories] = await q(async (tx) => [
    await listOrders(
      tx,
      { search, statuses, overdue, today, withBalance, categoryId, customerId, dueFrom, dueTo, orderFrom, orderTo },
      { sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    ),
    await listCategories(tx),
  ] as const);
  const keep = {
    q: search,
    status: statusParam === "open" ? undefined : statusParam,
    overdue: overdue ? "1" : undefined,
    balance: withBalance ? "1" : undefined,
    category: categoryId,
    customer: customerId,
    dueFrom,
    dueTo,
    from: orderFrom,
    to: orderTo,
    sort: sort === "due" ? undefined : sort,
  };

  const filtersActive = Boolean(search || statusParam !== "open" || overdue || withBalance || categoryId || dueFrom || dueTo || sort !== "due");
  return (
    <>
      <PageHeader
        title={t("nav.orders")}
        description={t("orders.description")}
        actions={
          <>
            <LinkButton href="/orders/board" variant="secondary">
              <Columns3 className="size-4" aria-hidden /> {t("orders.board")}
            </LinkButton>
            <LinkButton href="/orders/new">
              <Plus className="size-4" aria-hidden /> {t("orders.new")}
            </LinkButton>
          </>
        }
      />
      <Card>
        <FilterBar action="/orders" t={t} resetHref="/orders" search={<input aria-label={t("common.search")} type="search" name="q" defaultValue={search} className={`${filterInputClass} w-full`} placeholder={t("orders.searchPlaceholder")} />} active={filtersActive}>
          <FilterField label={t("fields.status")}>
            <select name="status" defaultValue={statusParam} className={filterInputClass}>
              <option value="open">{t("orders.openStatuses")}</option>
              <option value="all">{t("common.all")}</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`orderStatus.${s}`)}</option>
              ))}
            </select>
          </FilterField>
          {categories.length > 1 ? (
          <FilterField label={t("fields.category")}>
            <select name="category" defaultValue={categoryId ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{catLabel(c, t)}</option>
              ))}
            </select>
          </FilterField>
          ) : null}
          <FilterField label={t("orders.dueFrom")}>
            <input type="date" name="dueFrom" defaultValue={dueFrom} className={filterInputClass} />
          </FilterField>
          <FilterField label={t("orders.dueTo")}>
            <input type="date" name="dueTo" defaultValue={dueTo} className={filterInputClass} />
          </FilterField>
          <FilterField label={t("common.sortBy")}>
            <select name="sort" defaultValue={sort} className={filterInputClass}>
              <option value="due">{t("fields.dueDate")}</option>
              <option value="recent">{t("common.mostRecent")}</option>
              <option value="reference">{t("fields.reference")}</option>
              <option value="balance">{t("money.balance")}</option>
            </select>
          </FilterField>
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="overdue" value="1" defaultChecked={overdue} className="size-4" /> {t("orders.overdueOnly")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="balance" value="1" defaultChecked={withBalance} className="size-4" /> {t("orders.withBalanceOnly")}
            </label>
          </div>
          {customerId ? <input type="hidden" name="customer" value={customerId} /> : null}
          {orderFrom ? <input type="hidden" name="from" value={orderFrom} /> : null}
          {orderTo ? <input type="hidden" name="to" value={orderTo} /> : null}
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title={total === 0 && !search && statusParam === "open" && !overdue ? t("orders.empty") : t("common.noResults")}
            action={<LinkButton href="/orders/new">{t("orders.new")}</LinkButton>}
          />
        ) : (
          <>
            <Table caption={t("nav.orders")}>
              <thead>
                <tr>
                  <Th>{t("fields.reference")}</Th>
                  <Th>{t("fields.customer")}</Th>
                  <Th>{t("fields.dueDate")}</Th>
                  <Th>{t("fields.status")}</Th>
                  <Th num>{t("money.agreed")}</Th>
                  <Th num>{t("money.balance")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const late = isOverdue(o.status, o.dueDate, today);
                  return (
                    <tr key={o.id}>
                      <Td label={t("fields.reference")} primary>
                        <Link href={`/orders/${o.id}`} className="num text-primary hover:underline">{o.reference}</Link>
                        {o.firstLine ? <span className="block text-sm font-normal text-ink-soft">{o.firstLine}{o.itemsCount > 1 ? ` · ${t("orders.itemsCount", { count: o.itemsCount })}` : ""}</span> : null}
                      </Td>
                      <Td label={t("fields.customer")}>
                        <Link href={`/customers/${o.customerId}`} className="hover:underline">{o.customerName}</Link>
                      </Td>
                      <Td label={t("fields.dueDate")}>
                        {o.dueDate ? <span className={late ? "num font-semibold text-bad" : "num"}>{formatDate(o.dueDate)}</span> : "—"}
                        {late ? <Badge tone="bad" className="ms-2">⚠ {t("orders.overdue")}</Badge> : null}
                      </Td>
                      <Td label={t("fields.status")}><OrderStatusBadge status={o.status} t={t} /></Td>
                      <Td label={t("money.agreed")} num><Money cents={o.money.dueCents} /></Td>
                      <Td label={t("money.balance")} num>
                        <Money cents={o.money.balanceCents} tone="auto" className="font-semibold" />
                        <span className="block text-xs text-ink-soft">{t(`paymentState.${o.money.paymentState}`)}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/orders", { ...keep, page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
