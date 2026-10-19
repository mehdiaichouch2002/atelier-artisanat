import { pageContext } from "@/lib/page";
import { PageHeader, Card } from "@/components/ui/card";
import { listCategories } from "@/domain/settings/service";
import { catLabel } from "@/components/labels";
import { todayLocal } from "@/lib/dates";
import Link from "next/link";
import { WorkerForm } from "../worker-form";
import { createWorkerAction } from "../actions";

export default async function NewWorkerPage() {
  const { t, q } = await pageContext("workers.manage");
  const categories = await q((tx) => listCategories(tx));
  return (
    <>
      <PageHeader title={t("workers.new")} back={<Link href="/workers" className="text-primary hover:underline">← {t("nav.workers")}</Link>} />
      <Card className="p-4 md:p-6">
        <WorkerForm action={createWorkerAction} categories={categories.map((c) => ({ value: c.id, label: catLabel(c, t) }))} today={todayLocal()} />
      </Card>
    </>
  );
}
