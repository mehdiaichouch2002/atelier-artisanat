"use client";
import Link from "next/link";
import { useState } from "react";
import { Printer } from "lucide-react";
import {
  ActionForm,
  ComboboxField,
  MoneyField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  type ComboOption,
} from "@/components/forms";
import { Notice } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { formatDate } from "@/lib/dates";
import { defaultTreatment, ADVANCE_CATEGORIES, type AdvanceCategory } from "@/domain/payroll/logic";
import { EXPENSE_CATEGORIES } from "@/domain/ledger/logic";
import { useMethodOptions, type Option } from "../payroll/forms";
import { recordAdvanceAction } from "./actions";

const DEFAULT_EXPENSE: Record<AdvanceCategory, string> = {
  daily: "other",
  food_transport: "transport",
  materials: "materials",
  other: "other",
};

export function AdvanceForm({
  workers,
  orders,
  defaultWorker,
  nowLocal,
  accounts,
  defaultAccountId,
}: {
  workers: ComboOption[];
  orders: ComboOption[];
  defaultWorker?: string | null;
  nowLocal: string;
  accounts: Option[];
  defaultAccountId: string;
}) {
  const { t } = useI18n();
  const methods = useMethodOptions();
  const [category, setCategory] = useState<AdvanceCategory>("daily");
  const [treatment, setTreatment] = useState<"wage" | "business">("wage");
  const [saved, setSaved] = useState<{ id: string; reference: string; payWeek: string } | null>(null);

  return (
    <ActionForm
      action={recordAdvanceAction}
      className="space-y-5"
      showSuccess={false}
      onSuccess={(s: ActionState) => {
        setSaved({ id: String(s.data?.receiptId), reference: String(s.data?.reference), payWeek: String(s.data?.payWeek) });
        setCategory("daily");
        setTreatment("wage");
      }}
    >
      {saved ? (
        <Notice tone="ok">
          {t("advances.savedDetail", { reference: saved.reference, week: formatDate(saved.payWeek) })} ·{" "}
          <Link href={`/print/receipt/${saved.id}`} target="_blank" className="inline-flex items-center gap-1 font-semibold underline">
            <Printer className="size-4" aria-hidden /> {t("print.receipt")}
          </Link>
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <ComboboxField name="workerId" label={t("fields.worker")} options={workers} defaultValue={defaultWorker} required />
        <MoneyField name="amount" label={t("fields.amount")} required autoFocus={Boolean(defaultWorker)} />
        <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={nowLocal} />
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t("fields.category")}</legend>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {ADVANCE_CATEGORIES.map((c) => (
              <label
                key={c}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-white px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-semibold"
              >
                <input
                  type="radio"
                  name="category"
                  value={c}
                  checked={category === c}
                  onChange={() => {
                    setCategory(c);
                    setTreatment(defaultTreatment(c));
                  }}
                  className="accent-[var(--color-primary)]"
                />
                {t(`advanceCategory.${c}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t("advances.treatment")}</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {(["wage", "business"] as const).map((tr) => (
              <label
                key={tr}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-line-strong bg-white p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="treatment"
                  value={tr}
                  checked={treatment === tr}
                  onChange={() => setTreatment(tr)}
                  className="mt-1 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="block font-semibold">{t(`advanceTreatment.${tr}`)}</span>
                  <span className="text-ink-soft">{t(`advanceTreatment.${tr}Help`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {treatment === "business" ? (
          <SelectField
            key={category}
            name="expenseCategory"
            label={t("fields.expenseCategory")}
            required
            defaultValue={DEFAULT_EXPENSE[category]}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`expenseCategory.${c}`) }))}
          />
        ) : (
          <input type="hidden" name="expenseCategory" value="" />
        )}
        <SelectField name="accountId" label={t("fields.account")} required options={accounts} defaultValue={defaultAccountId} />
        <SelectField name="method" label={t("fields.method")} required options={methods} defaultValue="cash" />
      </div>
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("common.moreOptions")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField name="payWeek" type="date" label={t("advances.allocateToWeek")} hint={t("advances.allocateHint")} />
          <ComboboxField name="orderId" label={t("fields.relatedOrder")} options={orders} />
          <TextField name="attachment" type="file" label={t("fields.attachment")} accept="image/jpeg,image/png,image/webp,application/pdf" hint={t("fields.attachmentHint")} />
        </div>
      </details>
      <TextAreaField name="note" label={t("fields.note")} rows={2} />
      <SubmitButton size="lg" variant="copper" className="w-full sm:w-auto">
        {t("advances.save")}
      </SubmitButton>
    </ActionForm>
  );
}
