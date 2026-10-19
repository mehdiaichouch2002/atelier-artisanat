import Link from "next/link";
import type { TFunction } from "@/i18n/translate";
import { cx } from "./ui/cx";

/** Tabs grouping everything about money: accounts, expenses and the journal. */
export function CashTabs({ current, t }: { current: "cash" | "expenses" | "ledger"; t: TFunction }) {
  const tabs = [
    { key: "cash", href: "/cash", label: t("cash.tabAccounts") },
    { key: "expenses", href: "/expenses", label: t("nav.expenses") },
    { key: "ledger", href: "/cash/ledger", label: t("cash.tabJournal") },
  ] as const;
  return (
    <nav aria-label={t("nav.cash")} className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={current === tab.key ? "page" : undefined}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[0.9375rem]",
            current === tab.key ? "border-primary font-semibold text-primary" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
