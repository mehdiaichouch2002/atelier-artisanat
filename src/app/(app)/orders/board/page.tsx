import type { Metadata } from "next";
import Link from "next/link";
import { List } from "lucide-react";
import { pageContext } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listOrders } from "@/domain/orders/service";
import { isOverdue, OPEN_STATUSES, TRANSITIONS } from "@/domain/orders/logic";
import { PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_TONE } from "@/components/labels";
import { ActionButton } from "@/components/confirm-action";
import { formatDate, todayLocal } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { changeStatusAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("orders.board") };
}

/** Kanban view of open orders. Moving a card uses buttons (keyboard and screen-reader friendly). */
export default async function BoardPage() {
  const { t, q, user } = await pageContext();
  const today = todayLocal();
  const { rows } = await q((tx) => listOrders(tx, { statuses: [...OPEN_STATUSES] }, { sort: "due", limit: 500 }));
  const manage = can(user.role, "orders.manage");
  return (
    <>
      <PageHeader
        title={t("orders.board")}
        description={t("orders.boardHelp")}
        actions={
          <LinkButton href="/orders" variant="secondary">
            <List className="size-4" aria-hidden /> {t("orders.listView")}
          </LinkButton>
        }
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        <div className="grid auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3">
          {OPEN_STATUSES.map((status) => {
            const items = rows.filter((o) => o.status === status);
            return (
              <section key={status} aria-labelledby={`col-${status}`} className="flex min-h-40 flex-col rounded-xl border border-line bg-sunken/60">
                <h2 id={`col-${status}`} className="flex items-center justify-between gap-2 px-3 py-2 font-sans text-sm font-semibold">
                  <Badge tone={ORDER_STATUS_TONE[status]}>{t(`orderStatus.${status}`)}</Badge>
                  <span className="num text-ink-soft">{items.length}</span>
                </h2>
                <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                  {items.length === 0 ? <li className="px-2 py-4 text-center text-sm text-ink-faint">{t("orders.columnEmpty")}</li> : null}
                  {items.map((o) => {
                    const late = isOverdue(o.status, o.dueDate, today);
                    const forward = TRANSITIONS[o.status].filter(
                      (s) => s !== "cancelled" && (s === "delivered" || OPEN_STATUSES.indexOf(s) > OPEN_STATUSES.indexOf(o.status)),
                    );
                    return (
                      <li key={o.id} className="card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/orders/${o.id}`} className="num font-semibold text-primary hover:underline">{o.reference}</Link>
                          {o.priority === "urgent" || o.priority === "high" ? <Badge tone="copper">{t(`priority.${o.priority}`)}</Badge> : null}
                        </div>
                        <div className="mt-1 text-sm">{o.customerName}</div>
                        {o.firstLine ? <div className="truncate text-sm text-ink-soft">{o.firstLine}</div> : null}
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className={late ? "num font-semibold text-bad" : "num text-ink-soft"}>
                            {late ? "⚠ " : ""}
                            {o.dueDate ? formatDate(o.dueDate) : "—"}
                          </span>
                          <Money cents={o.money.balanceCents} tone="auto" />
                        </div>
                        {manage && forward.length ? (
                          <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
                            {forward.slice(0, 2).map((s) => (
                              <ActionButton key={s} action={changeStatusAction} fields={{ orderId: o.id, to: s }} label={`→ ${t(`orderStatus.${s}`)}`} size="sm" />
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
