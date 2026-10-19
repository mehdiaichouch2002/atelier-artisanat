import type { TFunction } from "@/i18n/translate";
import type { OrderStatus } from "@/domain/orders/logic";
import type { WeekStatus } from "@/domain/payroll/logic";
import type { EntryType } from "@/domain/ledger/logic";
import { Badge, type Tone } from "./ui/badge";

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  quote: "neutral",
  confirmed: "info",
  on_hold: "warn",
  in_production: "primary",
  finishing: "primary",
  ready: "ok",
  delivered: "neutral",
  cancelled: "bad",
};

const ORDER_STATUS_SYMBOL: Record<OrderStatus, string> = {
  quote: "○",
  confirmed: "●",
  on_hold: "❚❚",
  in_production: "⚒",
  finishing: "✎",
  ready: "✓",
  delivered: "✓✓",
  cancelled: "✕",
};

export function OrderStatusBadge({ status, t }: { status: OrderStatus; t: TFunction }) {
  return (
    <Badge tone={ORDER_STATUS_TONE[status]}>
      <span aria-hidden>{ORDER_STATUS_SYMBOL[status]}</span>
      {t(`orderStatus.${status}`)}
    </Badge>
  );
}

const WEEK_TONE: Record<WeekStatus, Tone> = {
  empty: "neutral",
  pending: "warn",
  due: "copper",
  partial: "info",
  settled: "ok",
  overpaid: "bad",
};

export function WeekStatusBadge({ status, t }: { status: WeekStatus; t: TFunction }) {
  return <Badge tone={WEEK_TONE[status]}>{t(`weekStatus.${status}`)}</Badge>;
}

const ENTRY_TONE: Record<EntryType, Tone> = {
  opening_balance: "neutral",
  other_income: "ok",
  customer_payment: "ok",
  customer_refund: "copper",
  worker_advance: "copper",
  worker_payment: "primary",
  expense: "warn",
  transfer: "info",
  adjustment: "neutral",
};

export function EntryTypeBadge({ type, reversal, t }: { type: EntryType; reversal?: boolean; t: TFunction }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={ENTRY_TONE[type]}>{t(`entryType.${type}`)}</Badge>
      {reversal ? <Badge tone="bad">↺ {t("ledger.reversal")}</Badge> : null}
    </span>
  );
}

export function ActiveBadge({ active, t }: { active: boolean; t: TFunction }) {
  return active ? <Badge tone="ok">{t("common.active")}</Badge> : <Badge tone="neutral">{t("common.inactive")}</Badge>;
}

export function categoryLabel(c: { categoryCode?: string | null; categoryName?: string | null } | null, t: TFunction): string {
  if (!c) return "—";
  if (c.categoryCode) return t(`category.${c.categoryCode}`);
  return c.categoryName ?? "—";
}

export function catLabel(c: { code: string | null; name: string }, t: TFunction): string {
  return c.code ? t(`category.${c.code}`) : c.name;
}
