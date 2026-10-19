import { cx } from "./cx";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("card min-w-0", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back ? <div className="mb-1 text-sm">{back}</div> : null}
        <h1 className="text-2xl font-semibold text-ink md:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1 text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-copper" aria-hidden>{icon}</div> : null}
      <p className="font-semibold">{title}</p>
      {children ? <div className="max-w-md text-sm text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children, role }: { tone?: "info" | "ok" | "warn" | "bad"; children: React.ReactNode; role?: string }) {
  const tones = {
    info: "border-info/30 bg-info-soft text-info",
    ok: "border-ok/30 bg-ok-soft text-ok",
    warn: "border-warn/30 bg-warn-soft text-warn",
    bad: "border-bad/30 bg-bad-soft text-bad",
  };
  return (
    <div role={role ?? (tone === "bad" ? "alert" : "status")} className={cx("rounded-lg border px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: React.ReactNode; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">{it.label}</dt>
          <dd className="mt-0.5 break-words">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
