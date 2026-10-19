import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { pageContext, pageNumber, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listCustomers } from "@/domain/customers/service";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ActiveBadge } from "@/components/labels";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination, Table, Td, Th } from "@/components/table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.customers") };
}

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext();
  const search = param(sp, "q");
  const status = (["active", "inactive", "all"] as const).find((s) => s === param(sp, "status")) ?? "active";
  const withBalance = param(sp, "balance") === "1";
  const sort = (["name", "balance", "recent"] as const).find((s) => s === param(sp, "sort")) ?? "name";
  const page = pageNumber(sp);
  const { rows, total } = await q((tx) =>
    listCustomers(tx, { search, status, withBalance, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  );
  const keep = { q: search, status: status === "active" ? undefined : status, balance: withBalance ? "1" : undefined, sort: sort === "name" ? undefined : sort };
  return (
    <>
      <PageHeader
        title={t("nav.customers")}
        description={t("customers.description")}
        actions={
          <LinkButton href="/customers/new">
            <Plus className="size-4" aria-hidden /> {t("customers.new")}
          </LinkButton>
        }
      />
      <Card>
        <FilterBar action="/customers" t={t} resetHref="/customers">
          <FilterField label={t("common.search")} className="grow">
            <input name="q" defaultValue={search} className={filterInputClass} placeholder={t("customers.searchPlaceholder")} />
          </FilterField>
          <FilterField label={t("fields.status")}>
            <select name="status" defaultValue={status} className={filterInputClass}>
              <option value="active">{t("common.active")}</option>
              <option value="inactive">{t("common.inactive")}</option>
              <option value="all">{t("common.all")}</option>
            </select>
          </FilterField>
          <FilterField label={t("common.sortBy")}>
            <select name="sort" defaultValue={sort} className={filterInputClass}>
              <option value="name">{t("fields.customerName")}</option>
              <option value="balance">{t("money.balance")}</option>
              <option value="recent">{t("common.mostRecent")}</option>
            </select>
          </FilterField>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="balance" value="1" defaultChecked={withBalance} className="size-4" />
            {t("customers.withBalanceOnly")}
          </label>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-8" />}
            title={search || withBalance ? t("common.noResults") : t("customers.empty")}
            action={!search ? <LinkButton href="/customers/new">{t("customers.new")}</LinkButton> : null}
          />
        ) : (
          <>
            <Table caption={t("nav.customers")}>
              <thead>
                <tr>
                  <Th>{t("fields.customerName")}</Th>
                  <Th>{t("fields.phone")}</Th>
                  <Th num>{t("fields.orders")}</Th>
                  <Th num>{t("money.paid")}</Th>
                  <Th num>{t("money.balance")}</Th>
                  <Th>{t("fields.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <Td label={t("fields.customerName")} primary>
                      <Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>
                    </Td>
                    <Td label={t("fields.phone")}>{c.phone ? <span className="num">{c.phone}</span> : "—"}</Td>
                    <Td label={t("fields.orders")} num><span className="num">{c.ordersCount}</span></Td>
                    <Td label={t("money.paid")} num><Money cents={c.paidCents - c.refundedCents} /></Td>
                    <Td label={t("money.balance")} num><Money cents={c.balanceCents} tone="auto" className="font-semibold" /></Td>
                    <Td label={t("fields.status")}><ActiveBadge active={c.active} t={t} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/customers", { ...keep, page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
