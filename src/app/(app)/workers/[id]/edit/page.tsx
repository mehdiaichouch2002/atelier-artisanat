import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext, isUuid } from "@/lib/page";
import { PageHeader, Card } from "@/components/ui/card";
import { listCategories } from "@/domain/settings/service";
import { getWorker } from "@/domain/workers/service";
import { catLabel } from "@/components/labels";
import { todayLocal } from "@/lib/dates";
import { WorkerForm } from "../../worker-form";
import { updateWorkerAction } from "../../actions";

export default async function EditWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { t, q } = await pageContext("workers.manage");
  const [worker, categories] = await q(async (tx) => [await getWorker(tx, id), await listCategories(tx, { includeInactive: true })] as const);
  if (!worker) notFound();
  return (
    <>
      <PageHeader
        title={t("workers.edit")}
        description={worker.fullName}
        back={<Link href={`/workers/${id}`} className="text-primary hover:underline">← {worker.fullName}</Link>}
      />
      <Card className="p-4 md:p-6">
        <WorkerForm
          action={updateWorkerAction}
          worker={worker}
          categories={categories.map((c) => ({ value: c.id, label: catLabel(c, t) }))}
          today={todayLocal()}
        />
      </Card>
    </>
  );
}
