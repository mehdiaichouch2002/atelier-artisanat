import type { Metadata } from "next";
import Link from "next/link";
import { pageContext, param, isUuid, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { Card, PageHeader } from "@/components/ui/card";
import { todayLocal } from "@/lib/dates";
import { OrderForm } from "../order-form";
import { createOrderAction } from "../actions";
import { orderFormData } from "../data";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("orders.new") };
}

export default async function NewOrderPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("orders.manage");
  const data = await q((tx) => orderFormData(tx, t));
  const c = param(sp, "customer");
  return (
    <>
      <PageHeader title={t("orders.new")} back={<Link href="/orders" className="text-primary hover:underline">← {t("nav.orders")}</Link>} />
      <Card className="p-4 md:p-6">
        <OrderForm action={createOrderAction} today={todayLocal()} defaultCustomer={isUuid(c) ? c : null} {...data} />
      </Card>
    </>
  );
}
