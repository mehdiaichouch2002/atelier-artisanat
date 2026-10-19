"use client";
import { ActionForm, ComboboxField, MoneyField, SelectField, SubmitButton, TextField, type ComboOption } from "@/components/forms";
import { useI18n } from "@/i18n/client";
import { EXPENSE_CATEGORIES } from "@/domain/ledger/logic";
import { useMethodOptions, type Option } from "../payroll/forms";
import { recordExpenseAction } from "./actions";

export function ExpenseForm({
  orders,
  workers,
  nowLocal,
  accounts,
  defaultAccountId,
}: {
  orders: ComboOption[];
  workers: ComboOption[];
  nowLocal: string;
  accounts: Option[];
  defaultAccountId: string;
}) {
  const { t } = useI18n();
  const methods = useMethodOptions();
  return (
    <ActionForm action={recordExpenseAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField name="amount" label={t("fields.amount")} required />
        <SelectField
          name="category"
          label={t("fields.category")}
          required
          placeholder={t("common.choose")}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`expenseCategory.${c}`) }))}
        />
        <TextField name="description" label={t("fields.description")} required wrapperClassName="sm:col-span-2" />
      </div>
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("common.moreOptions")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={nowLocal} />
          <TextField name="supplier" label={t("fields.supplier")} />
          <SelectField name="accountId" label={t("fields.account")} required options={accounts} defaultValue={defaultAccountId} />
          <SelectField name="method" label={t("fields.method")} required options={methods} defaultValue="cash" />
          <ComboboxField name="orderId" label={t("fields.relatedOrder")} options={orders} />
          <ComboboxField name="workerId" label={t("expenses.reimbursedWorker")} options={workers} hint={t("expenses.reimbursedWorkerHint")} />
          <TextField name="attachment" type="file" label={t("fields.attachment")} accept="image/jpeg,image/png,image/webp,application/pdf" hint={t("fields.attachmentHint")} />
        </div>
      </details>
      <SubmitButton size="lg">{t("expenses.save")}</SubmitButton>
    </ActionForm>
  );
}
