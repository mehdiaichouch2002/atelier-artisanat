import { pageContext, param, type SearchParams } from "@/lib/page";
import { buildReport } from "@/domain/reports/service";
import { getSettings } from "@/domain/settings/service";
import { addDays, formatDate, isIsoDate, todayLocal, weekStart } from "@/lib/dates";
import { ReportTable } from "@/components/report-view";
import { PrintHeader } from "../header";

export default async function PrintWeekPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("payroll.record");
  const { report, settings, week } = await q(async (tx) => {
    const settings = await getSettings(tx);
    const w = param(sp, "week");
    const week = w && isIsoDate(w) ? weekStart(w, settings.weekStartDay) : weekStart(todayLocal(), settings.weekStartDay);
    return { settings, week, report: await buildReport(tx, "weekly-settlement", { period: { key: "custom", from: week, to: addDays(week, 6) }, payWeek: week }) };
  });
  return (
    <article>
      <PrintHeader workshop={settings.workshopName} title={t("print.weekReport")} subtitle={<span className="num">{formatDate(week)} → {formatDate(addDays(week, 6))}</span>} t={t} />
      <ReportTable report={report} t={t} />
      <p className="mt-4 text-xs text-ink-soft">{t("payroll.formula")}</p>
      <p className="mt-2 text-xs text-ink-soft">{t("print.disclaimer")}</p>
    </article>
  );
}
