import type { Metadata } from "next";
import Link from "next/link";
import { pageContext, pageNumber, param, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listAudit } from "@/domain/settings/service";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterField, filterInputClass, hrefWith, Pagination } from "@/components/table";
import { formatDateTime } from "@/lib/dates";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("settings.audit") };
}

const TABLES = ["workers", "worker_earnings", "customers", "orders", "order_lines", "order_adjustments", "ledger_entries", "cash_counts", "cash_accounts", "users", "settings", "categories", "attachments"];
const PAGE_SIZE = 50;

function changed(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): string[] {
  if (!oldData || !newData) return [];
  return Object.keys(newData).filter((k) => !["updated_at", "updated_by"].includes(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]));
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("audit.view");
  const table = TABLES.find((x) => x === param(sp, "table"));
  const page = pageNumber(sp);
  const { rows, total } = await q((tx) => listAudit(tx, { tableName: table, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
  return (
    <>
      <PageHeader title={t("settings.audit")} description={t("settings.auditHelp")} back={<Link href="/settings" className="text-primary hover:underline">← {t("nav.settings")}</Link>} />
      <Card>
        <FilterBar action="/settings/audit" t={t} resetHref="/settings/audit">
          <FilterField label={t("settings.auditTable")}>
            <select name="table" defaultValue={table ?? ""} className={filterInputClass}>
              <option value="">{t("common.all")}</option>
              {TABLES.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const fields = changed(r.oldData, r.newData);
            return (
              <li key={r.id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-ink-soft">{formatDateTime(r.at)}</span>
                  <Badge tone={r.action === "insert" ? "ok" : r.action === "delete" ? "bad" : "info"}>{t(`audit.${r.action}`)}</Badge>
                  <span className="font-medium" dir="ltr">{r.tableName}</span>
                  <span className="text-ink-soft">{r.userName ?? t("audit.system")}</span>
                </div>
                {fields.length ? (
                  <p className="mt-1 break-words text-xs text-ink-soft" dir="ltr">
                    {fields.slice(0, 8).map((f) => `${f}: ${JSON.stringify(r.oldData?.[f])} → ${JSON.stringify(r.newData?.[f])}`).join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} t={t} makeHref={(p) => hrefWith("/settings/audit", { table, page: p })} />
      </Card>
    </>
  );
}
