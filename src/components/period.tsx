import Link from "next/link";
import type { TFunction } from "@/i18n/translate";
import { formatDate, type Period } from "@/lib/dates";
import { cx } from "./ui/cx";
import { hrefWith } from "./table";

/** Period selector: today / this week / this month / custom range (plain links + GET form). */
export function PeriodPicker({
  period,
  basePath,
  keep = {},
  t,
}: {
  period: Period;
  basePath: string;
  keep?: Record<string, string | undefined>;
  t: TFunction;
}) {
  const keys = ["today", "week", "month"] as const;
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <div role="group" aria-label={t("period.label")} className="inline-flex overflow-hidden rounded-lg border border-line-strong bg-surface">
        {keys.map((k) => (
          <Link
            key={k}
            href={hrefWith(basePath, { ...keep, period: k })}
            aria-current={period.key === k ? "true" : undefined}
            className={cx(
              "min-h-10 border-e border-line px-3 py-2 text-sm last:border-e-0",
              period.key === k ? "bg-primary font-semibold text-white" : "hover:bg-sunken",
            )}
          >
            {t(`period.${k}`)}
          </Link>
        ))}
      </div>
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <input type="hidden" name="period" value="custom" />
        <label className="flex flex-col text-xs text-ink-soft">
          {t("period.from")}
          <input type="date" name="from" defaultValue={period.from} className="min-h-10 rounded-lg border border-line-strong bg-white px-2 text-sm text-ink" />
        </label>
        <label className="flex flex-col text-xs text-ink-soft">
          {t("period.to")}
          <input type="date" name="to" defaultValue={period.to} className="min-h-10 rounded-lg border border-line-strong bg-white px-2 text-sm text-ink" />
        </label>
        <button type="submit" className={cx("min-h-10 rounded-lg border px-3 text-sm", period.key === "custom" ? "border-primary bg-primary-soft font-semibold" : "border-line-strong bg-surface hover:bg-sunken")}>
          {t("period.apply")}
        </button>
      </form>
      <span className="num pb-2 text-sm text-ink-soft">
        {formatDate(period.from)} → {formatDate(period.to)}
      </span>
    </div>
  );
}
