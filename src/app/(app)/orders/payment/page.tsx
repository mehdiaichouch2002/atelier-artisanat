import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { listOrders } from "@/domain/orders/service";
import { Card, PageHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { accountOptions, nowLocal } from "../../payroll/context";
import { OrderPaymentForm } from "../money-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("quick.customerPayment") };
}

export default async function QuickPaymentPage() {
  const { t, q } = await pageContext("payments.record");
  const { orders, accounts } = await q(async (tx) => ({
    orders: (await listOrders(tx, { withBalance: true, statuses: ["quote", "confirmed", "on_hold", "in_production", "finishing", "ready", "delivered"] }, { sort: "due", limit: 500 })).rows.filter(
      (o) => o.money.balanceCents > 0,
    ),
    accounts: await accountOptions(tx),
  }));
  return (
    <>
      <PageHeader
        title={t("quick.customerPayment")}
        description={t("orders.quickPaymentHelp")}
        back={<Link href="/orders" className="text-primary hover:underline">← {t("nav.orders")}</Link>}
      />
      <Card className="p-4 md:p-6">
        <OrderPaymentForm
          orders={orders.map((o) => ({ value: o.id, label: `${o.reference} — ${o.customerName}`, hint: `${t("money.balance")}: ${formatMoney(o.money.balanceCents)}` }))}
          nowLocal={nowLocal()}
          {...accounts}
        />
      </Card>
    </>
  );
}
