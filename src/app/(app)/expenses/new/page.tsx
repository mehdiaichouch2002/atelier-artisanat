import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { orderOptions } from "@/domain/orders/service";
import { activeWorkerOptions } from "@/domain/workers/service";
import { Card, PageHeader } from "@/components/ui/card";
import { accountOptions, nowLocal } from "../../payroll/context";
import { ExpenseForm } from "../expense-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("expenses.new") };
}

export default async function NewExpensePage() {
  const { t, q } = await pageContext("expenses.record");
  const data = await q(async (tx) => ({
    orders: (await orderOptions(tx)).map((o) => ({ value: o.id, label: o.label })),
    workers: (await activeWorkerOptions(tx)).map((w) => ({ value: w.id, label: w.label })),
    ...(await accountOptions(tx)),
  }));
  return (
    <>
      <PageHeader title={t("expenses.new")} description={t("expenses.newHelp")} back={<Link href="/expenses" className="text-primary hover:underline">← {t("nav.expenses")}</Link>} />
      <Card className="p-4 md:p-6">
        <ExpenseForm nowLocal={nowLocal()} {...data} />
      </Card>
    </>
  );
}
