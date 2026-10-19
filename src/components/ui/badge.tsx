import { cx } from "./cx";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "primary" | "copper";

const tones: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border-ok/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  bad: "bg-bad-soft text-bad border-bad/20",
  info: "bg-info-soft text-info border-info/20",
  neutral: "bg-neutral-soft text-neutral border-neutral/20",
  primary: "bg-primary-soft text-primary border-primary/20",
  copper: "bg-copper-soft text-copper border-copper/20",
};

/** Status badge: always text (plus an optional symbol), never colour alone. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
