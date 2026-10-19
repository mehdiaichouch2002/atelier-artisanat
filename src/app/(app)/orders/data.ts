import "server-only";
import type { Tx } from "@/lib/db";
import type { TFunction } from "@/i18n/translate";
import { customerOptions } from "@/domain/customers/service";
import { activeWorkerOptions } from "@/domain/workers/service";
import { listCategories } from "@/domain/settings/service";
import { catLabel } from "@/components/labels";
import { accountOptions } from "../payroll/context";

export async function orderFormData(tx: Tx, t: TFunction) {
  const [customers, workers, categories, accounts] = [
    await customerOptions(tx),
    await activeWorkerOptions(tx),
    await listCategories(tx),
    await accountOptions(tx),
  ];
  return {
    customers: customers.map((c) => ({ value: c.id, label: c.label, hint: c.phone })),
    workers: workers.map((w) => ({ value: w.id, label: w.label })),
    categories: categories.map((c) => ({ value: c.id, label: catLabel(c, t) })),
    ...accounts,
  };
}
