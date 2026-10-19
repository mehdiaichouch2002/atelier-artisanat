import { formatMoney, type Cents } from "@/lib/money";
import { cx } from "./cx";

/** Money is always shown as "1 250,00 DH", isolated from the text direction (correct in RTL). */
export function Money({
  cents,
  signed,
  tone,
  className,
}: {
  cents: Cents;
  signed?: boolean;
  tone?: "auto" | "in" | "out" | "muted";
  className?: string;
}) {
  const color =
    tone === "in"
      ? "text-ok"
      : tone === "out"
        ? "text-copper"
        : tone === "muted"
          ? "text-ink-soft"
          : tone === "auto"
            ? cents < 0
              ? "text-bad"
              : undefined
            : undefined;
  return (
    <bdi dir="ltr" className={cx("num", color, className)}>
      {formatMoney(cents, { signed })}
    </bdi>
  );
}
