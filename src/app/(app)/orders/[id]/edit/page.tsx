import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pageContext, isUuid } from "@/lib/page";
import { Card, PageHeader } from "@/components/ui/card";
import { getOrder } from "@/domain/orders/service";
import { EDITABLE_LINE_STATUSES } from "@/domain/orders/logic";
import { todayLocal } from "@/lib/dates";
import { OrderForm } from "../../order-form";
import { updateOrderAction } from "../../actions";
import { orderFormData } from "../../data";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { t, q } = await pageContext("orders.manage");
  const res = await q(async (tx) => ({ order: await getOrder(tx, id), data: await orderFormData(tx, t) }));
  if (!res.order) notFound();
  if (res.order.status === "delivered" || res.order.status === "cancelled") redirect(`/orders/${id}`);
  return (
    <>
      <PageHeader
        title={t("orders.edit")}
        description={res.order.reference}
        back={<Link href={`/orders/${id}`} className="text-primary hover:underline">← {res.order.reference}</Link>}
      />
      <Card className="p-4 md:p-6">
        <OrderForm
          action={updateOrderAction}
          order={res.order}
          today={todayLocal()}
          linesEditable={EDITABLE_LINE_STATUSES.includes(res.order.status)}
          {...res.data}
        />
      </Card>
    </>
  );
}
