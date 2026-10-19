"use client";
import Link from "next/link";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField, useFormState } from "@/components/forms";
import { useI18n } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import type { Customer } from "@/domain/customers/service";

function DuplicateWarning() {
  const { state } = useFormState();
  const { t } = useI18n();
  const similar = state.data?.similar as { id: string; name: string; phone: string | null }[] | undefined;
  if (!similar?.length) return null;
  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm">
      <p className="font-medium text-warn">{t("customers.possibleDuplicates")}</p>
      <ul className="mt-2 list-disc ps-5">
        {similar.map((s) => (
          <li key={s.id}>
            <Link href={`/customers/${s.id}`} className="text-primary underline" target="_blank">
              {s.name}
            </Link>
            {s.phone ? <span className="num ms-2 text-ink-soft">{s.phone}</span> : null}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <CheckboxField name="confirmDuplicate" label={t("customers.createAnyway")} />
      </div>
    </div>
  );
}

export function CustomerForm({ action, customer }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; customer?: Customer }) {
  const { t } = useI18n();
  return (
    <ActionForm action={action} className="space-y-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      {customer ? <input type="hidden" name="confirmDuplicate" value="on" /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={t("fields.customerName")} required defaultValue={customer?.name} />
        <TextField name="phone" type="tel" label={t("fields.phone")} defaultValue={customer?.phone} dir="ltr" />
      </div>
      <details className="rounded-lg border border-line p-3" open={customer && (customer.email || customer.address || customer.notes) ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">{t("common.moreOptions")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField name="email" type="email" label={t("fields.email")} defaultValue={customer?.email} dir="ltr" />
          <TextField name="address" label={t("fields.address")} defaultValue={customer?.address} />
          <TextAreaField name="notes" label={t("fields.notes")} defaultValue={customer?.notes} wrapperClassName="sm:col-span-2" />
        </div>
      </details>
      {!customer ? <DuplicateWarning /> : null}
      <SubmitButton>{customer ? t("common.saveChanges") : t("customers.create")}</SubmitButton>
    </ActionForm>
  );
}
