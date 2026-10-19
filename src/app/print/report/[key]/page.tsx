import { notFound } from "next/navigation";
import { pageContext, param, type SearchParams } from "@/lib/page";
import { buildReport, REPORT_KEYS, type ReportKey } from "@/domain/reports/service";
import { getSettings } from "@/domain/settings/service";
import { formatDate, isIsoDate, resolvePeriod, todayLocal, weekStart } from "@/lib/dates";
import { ReportTable } from "@/components/report-view";
import { PrintHeader } from "../../header";

export default async function PrintReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SearchParams }) {
  const { key } = await params;
  if (!(REPORT_KEYS as readonly string[]).includes(key)) notFound();
  const sp = await searchParams;
  const { t, q } = await pageContext("reports.view");
  const { report, settings, period, week } = await q(async (tx) => {
    const settings = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period") ?? "month", param(sp, "from"), param(sp, "to"), settings.weekStartDay);
    const w = param(sp, "week");
    const week = w && isIsoDate(w) ? weekStart(w, settings.weekStartDay) : weekStart(todayLocal(), settings.weekStartDay);
    return { settings, period, week, report: await buildReport(tx, key as ReportKey, { period, payWeek: week }) };
  });
  const subtitle = report.usesWeek
    ? `${t("payroll.week")} ${formatDate(week)}`
    : report.usesPeriod
      ? `${formatDate(period.from)} → ${formatDate(period.to)}`
      : t("reports.snapshot");
  return (
    <article>
      <PrintHeader workshop={settings.workshopName} title={t(`reports.list.${key}.title`)} subtitle={<span className="num">{subtitle}</span>} t={t} />
      <ReportTable report={report} t={t} />
      <p className="mt-4 text-xs text-ink-soft">{t(`reports.list.${key}.explanation`)}</p>
    </article>
  );
}
