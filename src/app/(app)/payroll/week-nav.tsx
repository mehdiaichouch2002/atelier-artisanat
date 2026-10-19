import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TFunction } from "@/i18n/translate";
import { addDays, formatDate } from "@/lib/dates";

export function WeekNav({ week, basePath, t, currentWeek }: { week: string; basePath: string; t: TFunction; currentWeek: string }) {
  const sep = basePath.includes("?") ? "&" : "?";
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Link
        href={`${basePath}${sep}week=${addDays(week, -7)}`}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-sunken"
        aria-label={t("payroll.previousWeek")}
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /> {t("payroll.previousWeekShort")}
      </Link>
      <form method="get" action={basePath.split("?")[0]} className="flex items-center gap-2">
        {basePath.includes("?")
          ? [...new URLSearchParams(basePath.split("?")[1]).entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
          : null}
        <label htmlFor="week-picker" className="sr-only">{t("payroll.chooseWeek")}</label>
        <input id="week-picker" type="date" name="week" defaultValue={week} className="min-h-10 rounded-lg border border-line-strong bg-white px-2 text-sm" />
        <button type="submit" className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-sunken">
          {t("common.go")}
        </button>
      </form>
      <Link
        href={`${basePath}${sep}week=${addDays(week, 7)}`}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-sunken"
        aria-label={t("payroll.nextWeek")}
      >
        {t("payroll.nextWeekShort")} <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
      </Link>
      {week !== currentWeek ? (
        <Link href={`${basePath}${sep}week=${currentWeek}`} className="text-sm text-primary hover:underline">
          {t("payroll.thisWeek")}
        </Link>
      ) : null}
      <span className="num text-sm text-ink-soft">
        {formatDate(week)} → {formatDate(addDays(week, 6))}
      </span>
    </div>
  );
}
