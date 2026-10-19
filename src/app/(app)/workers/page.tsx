import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { pageContext, pageNumber, param, isUuid, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listWorkers, type WorkerSort } from "@/domain/workers/service";
import { listCategories } from "@/domain/settings/service";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ActiveBadge, catLabel, categoryLabel } from "@/components/labels";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination, Table, Td, Th } from "@/components/table";
import { can } from "@/lib/auth/permissions";
import { arrangementSummary } from "./arrangement";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.workers") };
}

const PAGE_SIZE = 25;

export default async function WorkersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q, user } = await pageContext();
  const search = param(sp, "q");
  const status = (["active", "inactive", "all"] as const).find((s) => s === param(sp, "status")) ?? "active";
  const categoryId = isUuid(param(sp, "craft")) ? param(sp, "craft") : undefined;
  const sort = (["name", "code", "start", "balance"] as const).find((s) => s === param(sp, "sort")) ?? ("name" as WorkerSort);
  const page = pageNumber(sp);
  const [{ rows, total }, categories] = await q(async (tx) => [
    await listWorkers(tx, { search, status, categoryId, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    await listCategories(tx),
  ] as const);
  const showCraft = categories.length > 1;
  const filters = { q: search, status: status === "active" ? undefined : status, craft: categoryId, sort: sort === "name" ? undefined : sort };

  const filtersActive = Boolean(search || status !== "active" || categoryId || sort !== "name");
  return (
    <>
      <PageHeader
        title={t("nav.workers")}
        description={t("workers.description")}
        actions={
          can(user.role, "workers.manage") ? (
            <LinkButton href="/workers/new">
              <Plus className="size-4" aria-hidden /> {t("workers.new")}
            </LinkButton>
          ) : null
        }
      />
      <Card>
        <FilterBar action="/workers" t={t} resetHref="/workers" search={<input aria-label={t("common.search")} type="search" name="q" defaultValue={search} className={`${filterInputClass} w-full`} placeholder={t("workers.searchPlaceholder")} />} active={filtersActive}>
          <FilterField label={t("fields.status")}>
            <select name="status" defaultValue={status} className={filterInputClass}>
              <option value="active">{t("common.active")}</option>
              <option value="inactive">{t("common.inactive")}</option>
              <option value="all">{t("common.all")}</option>
            </select>
          </FilterField>
          {showCraft ? (
          <FilterField label={t("fields.craft")}>
            <select name="craft" defaultValue={categoryId ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {catLabel(c, t)}
                </option>
              ))}
            </select>
          </FilterField>
          ) : null}
          <FilterField label={t("common.sortBy")}>
            <select name="sort" defaultValue={sort} className={filterInputClass}>
              <option value="name">{t("fields.fullName")}</option>
              <option value="code">{t("fields.workerCode")}</option>
              <option value="start">{t("fields.startDate")}</option>
              <option value="balance">{t("payroll.balanceOwed")}</option>
            </select>
          </FilterField>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title={search || status !== "active" || categoryId ? t("common.noResults") : t("workers.empty")}
            action={
              can(user.role, "workers.manage") && !search ? <LinkButton href="/workers/new">{t("workers.new")}</LinkButton> : null
            }
          >
            {!search ? t("workers.emptyHelp") : null}
          </EmptyState>
        ) : (
          <>
            <Table caption={t("nav.workers")}>
              <thead>
                <tr>
                  <Th>{t("fields.fullName")}</Th>
                  {showCraft ? <Th>{t("fields.craft")}</Th> : null}
                  <Th>{t("workers.arrangement")}</Th>
                  <Th num>{t("payroll.balanceOwed")}</Th>
                  <Th>{t("fields.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <Td label={t("fields.fullName")} primary>
                      <Link href={`/workers/${w.id}`} className="font-medium text-primary hover:underline">
                        {w.fullName}
                      </Link>
                      {w.code ? <span className="ms-2 text-sm text-ink-soft">#{w.code}</span> : null}
                    </Td>
                    {showCraft ? <Td label={t("fields.craft")}>{categoryLabel(w, t)}</Td> : null}
                    <Td label={t("workers.arrangement")}>{arrangementSummary(w, t)}</Td>
                    <Td label={t("payroll.balanceOwed")} num>
                      <Money cents={w.balanceCents} tone="auto" />
                    </Td>
                    <Td label={t("fields.status")}>
                      <ActiveBadge active={w.active} t={t} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/workers", { ...filters, page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
