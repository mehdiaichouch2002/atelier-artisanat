import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { REPORT_KEYS, type ReportKey } from "@/domain/reports/service";
import { PageHeader } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.reports") };
}

const GROUPS: { key: string; reports: ReportKey[] }[] = [
  { key: "money", reports: ["cash-flow", "financial-activity", "expenses-by-category", "reconciliation"] },
  { key: "customers", reports: ["customer-payments", "customer-balances", "orders-by-status", "order-value", "overdue-orders"] },
  { key: "workers", reports: ["weekly-settlement", "worker-payments", "advances", "worker-balances"] },
];

export default async function ReportsPage() {
  const { t } = await pageContext("reports.view");
  void REPORT_KEYS;
  return (
    <>
      <PageHeader title={t("nav.reports")} description={t("reports.description")} />
      <div className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g.key} className="card" aria-labelledby={`rg-${g.key}`}>
            <h2 id={`rg-${g.key}`} className="border-b border-line px-4 py-3 text-lg font-semibold">{t(`reports.groups.${g.key}`)}</h2>
            <ul className="divide-y divide-line">
              {g.reports.map((r) => (
                <li key={r}>
                  <Link href={`/reports/${r}`} className="block px-4 py-3 hover:bg-sunken">
                    <span className="font-medium text-primary">{t(`reports.list.${r}.title`)}</span>
                    <span className="mt-0.5 block text-sm text-ink-soft">{t(`reports.list.${r}.description`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-ink-soft">{t("reports.noProfitNote")}</p>
    </>
  );
}
