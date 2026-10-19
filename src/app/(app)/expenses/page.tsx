import type { Metadata } from "next";
import { Plus, Receipt } from "lucide-react";
import { pageContext, pageNumber, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { allEntries, listEntries } from "@/domain/ledger/service";
import { getSettings } from "@/domain/settings/service";
import { EXPENSE_CATEGORIES, expensesByCategory } from "@/domain/ledger/logic";
import { periodBounds, resolvePeriod } from "@/lib/dates";
import { CashTabs } from "@/components/cash-tabs";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { PeriodPicker } from "@/components/period";
import { EntriesTable } from "@/components/entries-table";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination } from "@/components/table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.expenses") };
}

const PAGE_SIZE = 30;

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("expenses.record");
  const category = EXPENSE_CATEGORIES.find((c) => c === param(sp, "category"));
  const search = param(sp, "q");
  const page = pageNumber(sp);
  const data = await q(async (tx) => {
    const s = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period") ?? "month", param(sp, "from"), param(sp, "to"), s.weekStartDay);
    const { start, end } = periodBounds(period);
    const f = { from: start, to: end, types: ["expense" as const], includeBusinessAdvances: true, expenseCategory: category, search };
    return {
      period,
      list: await listEntries(tx, f, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      byCategory: expensesByCategory(await allEntries(tx, { ...f, expenseCategory: undefined })),
    };
  });
  const total = [...data.byCategory.values()].reduce((a, b) => a + b, 0);
  const keep = {
    category,
    q: search,
    period: data.period.key,
    from: data.period.key === "custom" ? data.period.from : undefined,
    to: data.period.key === "custom" ? data.period.to : undefined,
  };
  const filtersActive = Boolean(category || search);
  return (
    <>
      <PageHeader
        title={t("nav.expenses")}
        description={t("expenses.description")}
        actions={<LinkButton href="/expenses/new"><Plus className="size-4" aria-hidden /> {t("expenses.new")}</LinkButton>}
      />
      <CashTabs current="expenses" t={t} />
      <div className="mb-4">
        <PeriodPicker period={data.period} basePath="/expenses" keep={{ category, q: search }} t={t} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("expenses.byCategory")} description={t("expenses.byCategoryHelp")} />
          {data.byCategory.size === 0 ? (
            <p className="p-4 text-sm text-ink-soft">{t("expenses.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {EXPENSE_CATEGORIES.filter((c) => data.byCategory.has(c)).map((c) => (
                <li key={c} className="flex justify-between gap-2 px-4 py-2 text-sm">
                  <a href={hrefWith("/expenses", { ...keep, category: c })} className="hover:underline">{t(`expenseCategory.${c}`)}</a>
                  <Money cents={data.byCategory.get(c) ?? 0} />
                </li>
              ))}
              <li className="flex justify-between gap-2 bg-sunken px-4 py-2 font-semibold">
                <span>{t("fields.total")}</span>
                <Money cents={total} />
              </li>
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <FilterBar action="/expenses" t={t} resetHref="/expenses" search={<input aria-label={t("common.search")} type="search" name="q" defaultValue={search} className={`${filterInputClass} w-full`} placeholder={t("ledger.searchPlaceholder")} />} active={filtersActive}>
            <input type="hidden" name="period" value={data.period.key} />
            {data.period.key === "custom" ? (
              <>
                <input type="hidden" name="from" value={data.period.from} />
                <input type="hidden" name="to" value={data.period.to} />
              </>
            ) : null}
            <FilterField label={t("fields.category")}>
              <select name="category" defaultValue={category ?? ""} className={filterInputClass}>
                <option value="">{t("common.all")}</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`expenseCategory.${c}`)}</option>
                ))}
              </select>
            </FilterField>
          </FilterBar>
          {data.list.rows.length === 0 ? (
            <EmptyState icon={<Receipt className="size-8" />} title={t("expenses.empty")} action={<LinkButton href="/expenses/new">{t("expenses.new")}</LinkButton>} />
          ) : (
            <>
              <EntriesTable entries={data.list.rows} t={t} cols={["date", "reference", "category", "party", "description", "amount"]} caption={t("nav.expenses")} />
              <Pagination page={page} total={data.list.total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/expenses", { ...keep, page: p })} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
