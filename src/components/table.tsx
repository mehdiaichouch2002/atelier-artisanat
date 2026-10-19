import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TFunction } from "@/i18n/translate";
import { cx } from "./ui/cx";

/**
 * Responsive data table: a normal table on tablet/desktop, a card per row on phones
 * (each cell shows its column label via data-label).
 */
export function Table({ children, caption, className }: { children: React.ReactNode; caption?: string; className?: string }) {
  return (
    <div className={cx("relative overflow-x-auto", className)}>
      <table className="rtable">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function Th({ children, num, className }: { children?: React.ReactNode; num?: boolean; className?: string }) {
  return (
    <th scope="col" className={cx(num ? "cell-num" : undefined, className)}>
      {children}
    </th>
  );
}

export function Td({
  children,
  label,
  num,
  primary,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  label: string;
  num?: boolean;
  primary?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td data-label={label} data-primary={primary ? "" : undefined} className={cx(num ? "cell-num" : undefined, className)} colSpan={colSpan}>
      {children ?? "—"}
    </td>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  makeHref,
  t,
}: {
  page: number;
  total: number;
  pageSize: number;
  makeHref: (page: number) => string;
  t: TFunction;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="px-4 py-3 text-sm text-ink-soft">{t("common.resultsCount", { count: total })}</p>;
  return (
    <nav aria-label={t("common.pagination")} className="no-print flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-ink-soft">
        {t("common.pageOf", { page, pages })} · {t("common.resultsCount", { count: total })}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={makeHref(page - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line px-3 hover:bg-sunken" rel="prev">
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("common.previous")}
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={makeHref(page + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line px-3 hover:bg-sunken" rel="next">
            {t("common.next")}
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** Builds a URL keeping the current filters. */
export function hrefWith(path: string, params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * GET filter bar (works without JavaScript): the search box is always visible, the other filters are
 * folded under "Filtres" so lists stay simple. The fold opens automatically when a filter is active.
 */
export function FilterBar({
  children,
  search,
  action,
  t,
  resetHref,
  active,
}: {
  children?: React.ReactNode;
  search?: React.ReactNode;
  action: string;
  t: TFunction;
  resetHref?: string;
  active?: boolean;
}) {
  return (
    <form action={action} method="get" role="search" className="no-print border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        {search ? <div className="min-w-48 grow">{search}</div> : null}
        <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover">
          {search ? t("common.search") : t("common.filter")}
        </button>
        {resetHref && active ? (
          <Link href={resetHref} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-ink-soft hover:bg-sunken">
            {t("common.reset")}
          </Link>
        ) : null}
      </div>
      {children ? (
        <details className="mt-2" open={active || undefined}>
          <summary className="cursor-pointer text-sm font-medium text-primary">{t("common.filters")}</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">{children}</div>
        </details>
      ) : null}
    </form>
  );
}

export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("flex min-w-36 flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export const filterInputClass = "min-h-10 rounded-lg border border-line-strong bg-white px-3";
