import type { Metadata } from "next";
import { BookOpen, Download } from "lucide-react";
import { pageContext, pageNumber, param, isUuid, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { accountBalances, listEntries } from "@/domain/ledger/service";
import { getSettings } from "@/domain/settings/service";
import { ENTRY_TYPES, type EntryType } from "@/domain/ledger/logic";
import { periodBounds, resolvePeriod } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PeriodPicker } from "@/components/period";
import { EntriesTable } from "@/components/entries-table";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination } from "@/components/table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("ledger.title") };
}

const PAGE_SIZE = 40;

export default async function LedgerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext();
  const type = ENTRY_TYPES.find((x) => x === param(sp, "type")) as EntryType | undefined;
  const accountId = isUuid(param(sp, "account")) ? param(sp, "account") : undefined;
  const workerId = isUuid(param(sp, "worker")) ? param(sp, "worker") : undefined;
  const customerId = isUuid(param(sp, "customer")) ? param(sp, "customer") : undefined;
  const search = param(sp, "q");
  const page = pageNumber(sp);
  const allTime = !param(sp, "period");
  const data = await q(async (tx) => {
    const s = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period"), param(sp, "from"), param(sp, "to"), s.weekStartDay);
    const b = allTime ? null : periodBounds(period);
    const list = await listEntries(
      tx,
      { from: b?.start, to: b?.end, types: type ? [type] : undefined, accountId, workerId, customerId, search },
      { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    );
    return { period, list, accounts: await accountBalances(tx, { includeInactive: true }) };
  });
  const keep = {
    type,
    account: accountId,
    worker: workerId,
    customer: customerId,
    q: search,
    period: allTime ? undefined : data.period.key,
    from: !allTime && data.period.key === "custom" ? data.period.from : undefined,
    to: !allTime && data.period.key === "custom" ? data.period.to : undefined,
  };
  return (
    <>
      <PageHeader
        title={t("ledger.title")}
        description={t("ledger.description")}
        actions={
          <LinkButton
            href={hrefWith("/api/export/financial-activity", { period: data.period.key, from: data.period.from, to: data.period.to })}
            variant="secondary"
          >
            <Download className="size-4" aria-hidden /> {t("reports.exportCsv")}
          </LinkButton>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PeriodPicker period={data.period} basePath="/cash/ledger" keep={{ type, account: accountId, worker: workerId, customer: customerId, q: search }} t={t} />
        {!allTime ? (
          <a href={hrefWith("/cash/ledger", { ...keep, period: undefined, from: undefined, to: undefined })} className="text-sm text-primary hover:underline">
            {t("ledger.allTime")}
          </a>
        ) : (
          <span className="text-sm font-medium text-ink-soft">({t("ledger.allTime")})</span>
        )}
      </div>
      <Card>
        <FilterBar action="/cash/ledger" t={t} resetHref="/cash/ledger">
          {keep.period ? <input type="hidden" name="period" value={keep.period} /> : null}
          {keep.from ? <input type="hidden" name="from" value={keep.from} /> : null}
          {keep.to ? <input type="hidden" name="to" value={keep.to} /> : null}
          {workerId ? <input type="hidden" name="worker" value={workerId} /> : null}
          {customerId ? <input type="hidden" name="customer" value={customerId} /> : null}
          <FilterField label={t("common.search")} className="grow">
            <input name="q" defaultValue={search} className={filterInputClass} placeholder={t("ledger.searchPlaceholder")} />
          </FilterField>
          <FilterField label={t("fields.type")}>
            <select name="type" defaultValue={type ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {ENTRY_TYPES.map((x) => (
                <option key={x} value={x}>{t(`entryType.${x}`)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("fields.account")}>
            <select name="account" defaultValue={accountId ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {data.accounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>{a.name}</option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
        {data.list.rows.length === 0 ? (
          <EmptyState icon={<BookOpen className="size-8" />} title={t("ledger.empty")} />
        ) : (
          <>
            <EntriesTable entries={data.list.rows} t={t} cols={["date", "reference", "type", "party", "account", "description", "amount"]} caption={t("ledger.title")} />
            <Pagination page={page} total={data.list.total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/cash/ledger", { ...keep, page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
