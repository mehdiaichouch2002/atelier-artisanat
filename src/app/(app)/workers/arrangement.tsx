import type { TFunction } from "@/i18n/translate";
import { formatMoney, type Cents } from "@/lib/money";

export function arrangementSummary(
  a: {
    payKind: "weekly" | "daily" | "piece" | "negotiated";
    weeklyAmountCents: Cents | null;
    dailyRateCents: Cents | null;
    pieceRateCents: Cents | null;
    defaultDays?: string | number | null;
  },
  t: TFunction,
): React.ReactNode {
  const m = (c: Cents | null) => (c == null ? "—" : formatMoney(c));
  switch (a.payKind) {
    case "weekly":
      return t("workers.summary.weekly", { amount: m(a.weeklyAmountCents) });
    case "daily":
      return t("workers.summary.daily", { amount: m(a.dailyRateCents) });
    case "piece":
      return t("workers.summary.piece", { amount: m(a.pieceRateCents) });
    case "negotiated":
      return t("payKind.negotiated");
  }
}
