import Link from "next/link";
import { pageContext } from "@/lib/page";
import { Card, PageHeader } from "@/components/ui/card";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";

export default async function NewCustomerPage() {
  const { t } = await pageContext("customers.manage");
  return (
    <>
      <PageHeader title={t("customers.new")} back={<Link href="/customers" className="text-primary hover:underline">← {t("nav.customers")}</Link>} />
      <Card className="p-4 md:p-6">
        <CustomerForm action={createCustomerAction} />
      </Card>
    </>
  );
}
