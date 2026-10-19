"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import {
  ActionForm,
  ComboboxField,
  MoneyField,
  SelectField,
  SubmitButton,
  TextField,
  useFormState,
  type ComboOption,
} from "@/components/forms";
import { Notice } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { useI18n } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { formatDate } from "@/lib/dates";
import { ADVANCE_CATEGORIES, type AdvanceCategory } from "@/domain/payroll/logic";
import { EXPENSE_CATEGORIES } from "@/domain/ledger/logic";
import { useMethodOptions, type Option } from "../payroll/forms";
import { recordAdvanceAction } from "./actions";

const QUICK_AMOUNTS = [50, 100, 200, 500];

/** Tap-to-select list of workers (a search box only when there are many). */
function WorkerPicker({ workers, defaultWorker }: { workers: ComboOption[]; defaultWorker?: string | null }) {
  const { t } = useI18n();
  const { state } = useFormState();
  const error = state.fieldErrors?.workerId;
  if (workers.length > 12) {
    return <ComboboxField name="workerId" label={t("fields.worker")} options={workers} defaultValue={defaultWorker} required />;
  }
  const initial = state.values?.workerId ?? defaultWorker ?? "";
  return (
    <fieldset aria-describedby={error ? "worker-error" : undefined}>
      <legend className="mb-2 text-sm font-medium">
        {t("advances.whoReceives")} <span className="text-bad" aria-hidden>*</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {workers.map((w) => (
          <label
            key={w.value}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-white px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-semibold"
          >
            <input type="radio" name="workerId" value={w.value} defaultChecked={initial === w.value} className="accent-[var(--color-primary)]" />
            <span className="min-w-0 break-words">{w.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id="worker-error" className="mt-1 text-sm font-medium text-bad">
          {t(error)}
        </p>
      ) : null}
    </fieldset>
  );
}

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
  const [treatment, setTreatment] = useState<"wage" | "business">("wage");
  const [saved, setSaved] = useState<{ id: string; reference: string; payWeek: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const category: AdvanceCategory = treatment === "business" ? "materials" : "daily";

  const setAmount = (n: number) => {
    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="amount"]');
    if (input) {
      input.value = String(n);
      input.focus();
    }
  };

  return (
    <ActionForm
      action={recordAdvanceAction}
      className="space-y-6"
      showSuccess={false}
      onSuccess={(s: ActionState) => {
        setSaved({ id: String(s.data?.receiptId), reference: String(s.data?.reference), payWeek: String(s.data?.payWeek) });
        setTreatment("wage");
      }}
    >
      <div ref={formRef} className="space-y-6">
        {saved ? (
          <Notice tone="ok">
            {t("advances.savedDetail", { reference: saved.reference, week: formatDate(saved.payWeek) })} ·{" "}
            <Link href={`/print/receipt/${saved.id}`} target="_blank" className="inline-flex items-center gap-1 font-semibold underline">
              <Printer className="size-4" aria-hidden /> {t("print.receipt")}
            </Link>
          </Notice>
        ) : null}

        <WorkerPicker workers={workers} defaultWorker={defaultWorker} />

        <div>
          <MoneyField name="amount" label={t("fields.amount")} required className="num text-end text-xl" />
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("advances.quickAmounts")}>
            {QUICK_AMOUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(n)}
                className="min-h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-sunken"
              >
                <bdi dir="ltr" className="num">{n} DH</bdi>
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("advances.whatFor")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["wage", "business"] as const).map((tr) => (
              <label
                key={tr}
                className={cx(
                  "flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3 text-sm",
                  treatment === tr ? "border-primary bg-primary-soft" : "border-line-strong",
                )}
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

        <TextField name="note" label={t("fields.note")} placeholder={t("advances.notePlaceholder")} />

        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">{t("common.moreOptions")}</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={nowLocal} />
            <SelectField
              key={`cat-${treatment}`}
              name="category"
              label={t("fields.category")}
              required
              defaultValue={category}
              options={ADVANCE_CATEGORIES.map((c) => ({ value: c, label: t(`advanceCategory.${c}`) }))}
            />
            {treatment === "business" ? (
              <SelectField
                name="expenseCategory"
                label={t("fields.expenseCategory")}
                required
                defaultValue="materials"
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`expenseCategory.${c}`) }))}
              />
            ) : (
              <input type="hidden" name="expenseCategory" value="" />
            )}
            <SelectField name="accountId" label={t("fields.account")} required options={accounts} defaultValue={defaultAccountId} />
            <SelectField name="method" label={t("fields.method")} required options={methods} defaultValue="cash" />
            <TextField name="payWeek" type="date" label={t("advances.allocateToWeek")} hint={t("advances.allocateHint")} />
            <ComboboxField name="orderId" label={t("fields.relatedOrder")} options={orders} />
            <TextField name="attachment" type="file" label={t("fields.attachment")} accept="image/jpeg,image/png,image/webp,application/pdf" hint={t("fields.attachmentHint")} />
          </div>
        </details>

        <SubmitButton size="lg" variant="copper" className="w-full">
          {t("advances.save")}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
