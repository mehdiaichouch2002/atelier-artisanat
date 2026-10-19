"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  HandCoins,
  Home,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  Users,
  UserRound,
  Wallet,
  ShoppingBag,
  Banknote,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import { LocaleSwitcher } from "./locale-switcher";
import { cx } from "./ui/cx";

export interface ShellUser {
  displayName: string;
  role: "owner" | "manager";
}

// Daily work first; management pages in a second, quieter group. Expenses live under "Caisse".
const NAV: readonly { href: string; key: string; icon: typeof Home; group: "daily" | "manage"; also?: readonly string[] }[] = [
  { href: "/", key: "nav.dashboard", icon: Home, group: "daily" },
  { href: "/advances", key: "nav.advances", icon: HandCoins, group: "daily" },
  { href: "/payroll", key: "nav.payroll", icon: CalendarCheck, group: "daily" },
  { href: "/orders", key: "nav.orders", icon: ClipboardList, group: "daily" },
  { href: "/cash", key: "nav.cash", icon: Wallet, group: "daily", also: ["/expenses"] },
  { href: "/workers", key: "nav.workers", icon: Users, group: "manage" },
  { href: "/customers", key: "nav.customers", icon: UserRound, group: "manage" },
  { href: "/reports", key: "nav.reports", icon: BarChart3, group: "manage" },
  { href: "/settings", key: "nav.settings", icon: Settings, group: "manage" },
];

const QUICK = [
  { href: "/advances/new", key: "quick.advance", icon: HandCoins },
  { href: "/payroll", key: "quick.payWorkers", icon: Banknote },
  { href: "/orders/payment", key: "quick.customerPayment", icon: Wallet },
  { href: "/expenses/new", key: "quick.expense", icon: Receipt },
  { href: "/orders/new", key: "quick.order", icon: ShoppingBag },
] as const;

function isActive(pathname: string, href: string, also: readonly string[] = []) {
  if (href === "/") return pathname === "/";
  return [href, ...also].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

export function AppShell({
  user,
  workshopName,
  logoutAction,
  children,
}: {
  user: ShellUser;
  workshopName: string;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDialogElement>(null);
  const quickRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    menuRef.current?.close();
    quickRef.current?.close();
  }, [pathname]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-e border-line bg-surface md:flex">
        <div className="px-5 pb-3 pt-5">
          <Link href="/" className="block">
            <span className="block font-[family-name:var(--font-display)] text-xl font-semibold text-primary">{workshopName}</span>
            <span className="text-xs text-ink-soft">{t("app.tagline")}</span>
          </Link>
        </div>
        <div className="px-3 pb-3">
          <Link
            href="/advances/new"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-copper px-3 font-medium text-white hover:bg-[#7a3f20]"
          >
            <Plus className="size-4" aria-hidden />
            {t("quick.advance")}
          </Link>
        </div>
        <nav aria-label={t("nav.main")} className="flex-1 overflow-y-auto px-3">
          {(["daily", "manage"] as const).map((group) => (
            <div key={group} className={group === "manage" ? "mt-5" : undefined}>
              {group === "manage" ? (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("nav.manage")}</p>
              ) : null}
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const active = isActive(pathname, item.href, item.also);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem]",
                          active ? "bg-primary-soft font-semibold text-primary" : "text-ink-soft hover:bg-sunken hover:text-ink",
                        )}
                      >
                        <Icon className="size-5 shrink-0" aria-hidden />
                        {t(item.key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-3 border-t border-line p-4">
          <LocaleSwitcher />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{user.displayName}</div>
              <div className="text-xs text-ink-soft">{t(`roles.${user.role}`)}</div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-ink-soft hover:bg-sunken hover:text-ink"
              >
                <LogOut className="size-4 rtl:rotate-180" aria-hidden />
                {t("auth.logout")}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/" className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-primary">
            {workshopName}
          </Link>
          <LocaleSwitcher compact />
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={t("nav.mobile")}
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {[
            { href: "/", key: "nav.dashboard", icon: Home },
            { href: "/payroll", key: "nav.payrollShort", icon: CalendarCheck },
          ].map((item) => (
            <MobileItem {...item} key={item.href} active={isActive(pathname, item.href)} label={t(item.key)} />
          ))}
          <li className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => quickRef.current?.showModal()}
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-copper text-white shadow-lg ring-4 ring-canvas"
              aria-label={t("quick.title")}
              aria-haspopup="dialog"
            >
              <Plus className="size-7" aria-hidden />
            </button>
          </li>
          <MobileItem href="/orders" icon={ClipboardList} active={isActive(pathname, "/orders")} label={t("nav.orders")} />
          <li>
            <button
              type="button"
              onClick={() => menuRef.current?.showModal()}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs text-ink-soft"
              aria-haspopup="dialog"
            >
              <Menu className="size-5" aria-hidden />
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={quickRef}
        aria-label={t("quick.title")}
        className="mb-0 mt-auto w-full max-w-none rounded-t-2xl border border-line bg-surface p-4 text-ink backdrop:bg-ink/40 md:hidden"
      >
        <h2 className="mb-3 text-lg font-semibold">{t("quick.title")}</h2>
        <ul className="grid grid-cols-1 gap-2">
          {QUICK.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-4 hover:bg-sunken">
                <q.icon className="size-5 text-copper" aria-hidden />
                {t(q.key)}
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => quickRef.current?.close()} className="mt-3 min-h-11 w-full rounded-lg bg-sunken">
          {t("common.close")}
        </button>
      </dialog>

      <dialog
        ref={menuRef}
        aria-label={t("nav.more")}
        className="mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-2xl border border-line bg-surface p-4 text-ink backdrop:bg-ink/40 md:hidden"
      >
        <nav aria-label={t("nav.main")}>
          <ul className="grid grid-cols-2 gap-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href, item.also) ? "page" : undefined}
                  className={cx(
                    "flex min-h-12 items-center gap-2 rounded-lg border px-3",
                    isActive(pathname, item.href, item.also) ? "border-primary bg-primary-soft text-primary" : "border-line",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <div className="text-sm">
            <div className="font-medium">{user.displayName}</div>
            <div className="text-xs text-ink-soft">{t(`roles.${user.role}`)}</div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-sunken">
              <LogOut className="size-4 rtl:rotate-180" aria-hidden />
              {t("auth.logout")}
            </button>
          </form>
        </div>
        <button type="button" onClick={() => menuRef.current?.close()} className="mt-3 min-h-11 w-full rounded-lg bg-sunken">
          {t("common.close")}
        </button>
      </dialog>
    </div>
  );
}

function MobileItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs",
          active ? "font-semibold text-primary" : "text-ink-soft",
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    </li>
  );
}
