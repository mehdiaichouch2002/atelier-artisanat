import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext, isUuid } from "@/lib/page";
import { getCustomer } from "@/domain/customers/service";
import { Card, PageHeader } from "@/components/ui/card";
import { CustomerForm } from "../../customer-form";
import { updateCustomerAction } from "../../actions";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { t, q } = await pageContext("customers.manage");
  const customer = await q((tx) => getCustomer(tx, id));
  if (!customer) notFound();
  return (
    <>
      <PageHeader title={t("customers.edit")} back={<Link href={`/customers/${id}`} className="text-primary hover:underline">← {customer.name}</Link>} />
      <Card className="p-4 md:p-6">
        <CustomerForm action={updateCustomerAction} customer={customer} />
      </Card>
    </>
  );
}
