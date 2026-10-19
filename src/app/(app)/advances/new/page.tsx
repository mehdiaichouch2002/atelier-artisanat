import type { Metadata } from "next";
import Link from "next/link";
import { pageContext, param, isUuid, type SearchParams } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { activeWorkerOptions } from "@/domain/workers/service";
import { orderOptions } from "@/domain/orders/service";
import { Card, PageHeader } from "@/components/ui/card";
import { accountOptions, nowLocal } from "../../payroll/context";
import { AdvanceForm } from "../advance-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("advances.new") };
}

export default async function NewAdvancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { t, q } = await pageContext("advances.record");
  const { workers, orders, accounts } = await q(async (tx) => ({
    workers: await activeWorkerOptions(tx),
    orders: await orderOptions(tx, { openOnly: true }),
    accounts: await accountOptions(tx),
  }));
  const w = param(sp, "worker");
  return (
    <>
      <PageHeader
        title={t("advances.new")}
        description={t("advances.newHelp")}
        back={<Link href="/advances" className="text-primary hover:underline">← {t("nav.advances")}</Link>}
      />
      <Card className="p-4 md:p-6">
        <AdvanceForm
          workers={workers.map((x) => ({ value: x.id, label: x.label, hint: x.code ? `#${x.code}` : null }))}
          orders={orders.map((o) => ({ value: o.id, label: o.label }))}
          defaultWorker={isUuid(w) ? w : null}
          nowLocal={nowLocal()}
          {...accounts}
        />
      </Card>
    </>
  );
}
