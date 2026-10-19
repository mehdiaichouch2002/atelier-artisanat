import type { TFunction } from "@/i18n/translate";
import { formatDateTime } from "@/lib/dates";

export function PrintHeader({ workshop, title, subtitle, t }: { workshop: string; title: string; subtitle?: React.ReactNode; t: TFunction }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
      <div>
        <div className="text-xl font-semibold">{workshop}</div>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        {subtitle ? <div className="mt-1 text-ink-soft">{subtitle}</div> : null}
      </div>
      <div className="text-end text-xs text-ink-soft">
        {t("print.printedAt")}
        <div className="num">{formatDateTime(new Date())}</div>
      </div>
    </header>
  );
}
