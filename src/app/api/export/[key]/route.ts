import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withUser } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { buildReport, REPORT_KEYS, type ReportKey } from "@/domain/reports/service";
import { getSettings } from "@/domain/settings/service";
import { isIsoDate, resolvePeriod, todayLocal, weekStart } from "@/lib/dates";
import { reportToCsv } from "@/lib/csv";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "reports.view")) return new Response("Forbidden", { status: 403 });
  if (!(REPORT_KEYS as readonly string[]).includes(key)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const { t } = await getI18n();
  const { report, period } = await withUser(user.id, async (tx) => {
    const s = await getSettings(tx);
    const period = resolvePeriod(g("period") ?? "month", g("from"), g("to"), s.weekStartDay);
    const w = g("week");
    const payWeek = w && isIsoDate(w) ? weekStart(w, s.weekStartDay) : weekStart(todayLocal(), s.weekStartDay);
    return { report: await buildReport(tx, key as ReportKey, { period, payWeek }), period };
  });
  const filename = `${key}_${period.from}_${period.to}.csv`;
  return new Response(reportToCsv(report, t), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
