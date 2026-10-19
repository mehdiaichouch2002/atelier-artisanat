import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { pageContext, param, type SearchParams } from "@/lib/page";
import { buildReport, REPORT_KEYS, type ReportKey } from "@/domain/reports/service";
import { getSettings } from "@/domain/settings/service";
import { isIsoDate, resolvePeriod, todayLocal, weekStart } from "@/lib/dates";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { PeriodPicker } from "@/components/period";
import { ReportTable } from "@/components/report-view";
import { hrefWith } from "@/components/table";
import { WeekNav } from "../../payroll/week-nav";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SearchParams }) {
  const { key } = await params;
  if (!(REPORT_KEYS as readonly string[]).includes(key)) notFound();
  const sp = await searchParams;
  const { t, q } = await pageContext("reports.view");
  const { report, period, week, currentWeek } = await q(async (tx) => {
    const s = await getSettings(tx);
    const period = resolvePeriod(param(sp, "period") ?? "month", param(sp, "from"), param(sp, "to"), s.weekStartDay);
    const currentWeek = weekStart(todayLocal(), s.weekStartDay);
    const w = param(sp, "week");
    const week = w && isIsoDate(w) ? weekStart(w, s.weekStartDay) : currentWeek;
    return { report: await buildReport(tx, key as ReportKey, { period, payWeek: week }), period, week, currentWeek };
  });
  const qs = { period: period.key, from: period.from, to: period.to, week: report.usesWeek ? week : undefined };
  return (
    <>
      <PageHeader
        title={t(`reports.list.${key}.title`)}
        description={t(`reports.list.${key}.description`)}
        back={<Link href="/reports" className="text-primary hover:underline">← {t("nav.reports")}</Link>}
        actions={
          <>
            <LinkButton href={hrefWith(`/api/export/${key}`, qs)} variant="secondary">
              <Download className="size-4" aria-hidden /> {t("reports.exportCsv")}
            </LinkButton>
            <LinkButton href={hrefWith(`/print/report/${key}`, qs)} target="_blank" variant="secondary">
              <Printer className="size-4" aria-hidden /> {t("common.print")}
            </LinkButton>
          </>
        }
      />
      <div className="mb-4">
        {report.usesPeriod ? <PeriodPicker period={period} basePath={`/reports/${key}`} t={t} /> : null}
        {report.usesWeek ? <WeekNav week={week} basePath={`/reports/${key}`} t={t} currentWeek={currentWeek} /> : null}
        {!report.usesPeriod && !report.usesWeek ? <p className="text-sm text-ink-soft">{t("reports.snapshot")}</p> : null}
      </div>
      <Card className="mb-4">
        <div className="p-4 text-sm">
          <h2 className="mb-1 font-sans text-sm font-semibold">{t("reports.howCalculated")}</h2>
          <p className="text-ink-soft">{t(`reports.list.${key}.explanation`)}</p>
        </div>
      </Card>
      {report.figures?.length ? (
        <Card className="mb-4">
          <CardHeader title={t("reports.byType")} />
          <dl className="grid gap-x-6 gap-y-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {report.figures.map((f) => (
              <div key={f.label} className="flex justify-between gap-2 text-sm">
                <dt className="text-ink-soft">{t(f.label)}</dt>
                <dd><Money cents={f.cents} signed tone="auto" /></dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
      <Card>
        <ReportTable report={report} t={t} />
        {report.truncated ? <p className="p-4 text-sm text-warn">{t("reports.truncated")}</p> : null}
      </Card>
    </>
  );
}
