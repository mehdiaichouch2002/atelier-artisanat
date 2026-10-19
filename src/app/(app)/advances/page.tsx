import type { Metadata } from "next";
import { HandCoins, Plus } from "lucide-react";
import { pageContext, pageNumber, param, isUuid, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listEntries, allEntries } from "@/domain/ledger/service";
import { activeWorkerOptions } from "@/domain/workers/service";
import { getSettings } from "@/domain/settings/service";
import { ADVANCE_CATEGORIES } from "@/domain/payroll/logic";
import { naturalAmount } from "@/domain/ledger/logic";
import { periodBounds, resolvePeriod } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { PeriodPicker } from "@/components/period";
import { EntriesTable } from "@/components/entries-table";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination } from "@/components/table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.advances") };
}

const PAGE_SIZE = 30;

export default async function AdvancesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("advances.record");
  const workerId = isUuid(param(sp, "worker")) ? param(sp, "worker") : undefined;
  const category = ADVANCE_CATEGORIES.find((c) => c === param(sp, "category"));
  const search = param(sp, "q");
  const page = pageNumber(sp);
  const data = await q(async (tx) => {
    const settings = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period"), param(sp, "from"), param(sp, "to"), settings.weekStartDay);
    const { start, end } = periodBounds(period);
    const filters = { from: start, to: end, types: ["worker_advance" as const], workerId, advanceCategory: category, search };
    const list = await listEntries(tx, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    const all = await allEntries(tx, filters);
    let wage = 0;
    let business = 0;
    for (const e of all) {
      if (e.advanceTreatment === "business") business += naturalAmount(e);
      else wage += naturalAmount(e);
    }
    return { period, list, wage, business, workers: await activeWorkerOptions(tx) };
  });
  const keep = {
    worker: workerId,
    category,
    q: search,
    period: data.period.key,
    from: data.period.key === "custom" ? data.period.from : undefined,
    to: data.period.key === "custom" ? data.period.to : undefined,
  };

  return (
    <>
      <PageHeader
        title={t("nav.advances")}
        description={t("advances.description")}
        actions={
          <LinkButton href="/advances/new" variant="copper">
            <Plus className="size-4" aria-hidden /> {t("advances.new")}
          </LinkButton>
        }
      />
      <div className="mb-4">
        <PeriodPicker period={data.period} basePath="/advances" keep={{ worker: workerId, category, q: search }} t={t} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-3">
          <div className="text-sm text-ink-soft">{t("advances.wageAdvances")}</div>
          <div className="mt-1 text-xl font-semibold"><Money cents={data.wage} /></div>
          <p className="text-xs text-ink-soft">{t("advances.wageHelp")}</p>
        </div>
        <div className="card p-3">
          <div className="text-sm text-ink-soft">{t("advances.businessAdvances")}</div>
          <div className="mt-1 text-xl font-semibold"><Money cents={data.business} /></div>
          <p className="text-xs text-ink-soft">{t("advances.businessHelp")}</p>
        </div>
        <div className="card p-3">
          <div className="text-sm text-ink-soft">{t("advances.totalCashOut")}</div>
          <div className="mt-1 text-xl font-semibold"><Money cents={data.wage + data.business} /></div>
        </div>
      </div>
      <Card>
        <FilterBar action="/advances" t={t} resetHref="/advances">
          <input type="hidden" name="period" value={data.period.key} />
          {data.period.key === "custom" ? (
            <>
              <input type="hidden" name="from" value={data.period.from} />
              <input type="hidden" name="to" value={data.period.to} />
            </>
          ) : null}
          <FilterField label={t("common.search")} className="grow">
            <input name="q" defaultValue={search} className={filterInputClass} placeholder={t("ledger.searchPlaceholder")} />
          </FilterField>
          <FilterField label={t("fields.worker")}>
            <select name="worker" defaultValue={workerId ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {data.workers.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("fields.category")}>
            <select name="category" defaultValue={category ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {ADVANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`advanceCategory.${c}`)}</option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
        {data.list.rows.length === 0 ? (
          <EmptyState icon={<HandCoins className="size-8" />} title={t("advances.empty")} action={<LinkButton href="/advances/new" variant="copper">{t("advances.new")}</LinkButton>} />
        ) : (
          <>
            <EntriesTable entries={data.list.rows} t={t} cols={["date", "reference", "party", "category", "week", "description", "amount"]} caption={t("nav.advances")} />
            <Pagination page={page} total={data.list.total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/advances", { ...keep, page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
