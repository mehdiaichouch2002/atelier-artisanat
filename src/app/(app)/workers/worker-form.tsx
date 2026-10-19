"use client";
import { useState } from "react";
import { ActionForm, MoneyField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/forms";
import { useI18n } from "@/i18n/client";
import { centsToInput } from "@/lib/money";
import type { ActionState } from "@/lib/action";
import type { Worker } from "@/domain/workers/service";
import type { PayKind } from "@/domain/payroll/logic";

export function WorkerForm({
  action,
  worker,
  categories,
  today,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  worker?: Worker;
  categories: { value: string; label: string }[];
  today: string;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<PayKind>(worker?.payKind ?? "weekly");
  return (
    <ActionForm action={action} className="space-y-6">
      {worker ? <input type="hidden" name="id" value={worker.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="fullName" label={t("fields.fullName")} required defaultValue={worker?.fullName} autoComplete="off" />
        <TextField name="phone" type="tel" label={t("fields.phone")} defaultValue={worker?.phone} dir="ltr" />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-base font-semibold">{t("workers.arrangement")}</legend>
        <SelectField
          name="payKind"
          label={t("fields.payKind")}
          required
          defaultValue={kind}
          onChange={(e) => setKind(e.target.value as PayKind)}
          options={(["weekly", "daily", "piece", "negotiated"] as const).map((k) => ({ value: k, label: t(`payKind.${k}`) }))}
        />
        {kind === "weekly" ? (
          <MoneyField name="weeklyAmount" label={t("fields.weeklyAmount")} required defaultValue={centsToInput(worker?.weeklyAmountCents)} />
        ) : null}
        {kind === "daily" ? (
          <>
            <MoneyField name="dailyRate" label={t("fields.dailyRate")} required defaultValue={centsToInput(worker?.dailyRateCents)} />
            <TextField
              name="defaultDays"
              label={t("fields.defaultDays")}
              inputMode="decimal"
              defaultValue={worker?.defaultDays ?? "6"}
              hint={t("workers.defaultDaysHint")}
              dir="ltr"
            />
          </>
        ) : null}
        {kind === "piece" ? (
          <MoneyField name="pieceRate" label={t("fields.pieceRate")} required defaultValue={centsToInput(worker?.pieceRateCents)} />
        ) : null}
        {kind === "negotiated" ? <p className="self-end text-sm text-ink-soft">{t("workers.negotiatedHelp")}</p> : null}
      </fieldset>

      {categories.length === 1 ? <input type="hidden" name="categoryId" value={worker?.categoryId ?? categories[0]!.value} /> : null}
      <details className="rounded-lg border border-line p-3" open={worker && (worker.code || worker.notes) ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">{t("common.moreOptions")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField name="code" label={t("fields.workerCode")} defaultValue={worker?.code} hint={t("workers.codeHint")} />
          {categories.length !== 1 ? (
            <SelectField
              name="categoryId"
              label={t("fields.craft")}
              options={categories}
              placeholder={t("common.none")}
              defaultValue={worker?.categoryId}
            />
          ) : null}
          <TextField name="startDate" type="date" label={t("fields.startDate")} required defaultValue={worker?.startDate ?? today} />
          <TextAreaField name="notes" label={t("fields.notes")} defaultValue={worker?.notes} wrapperClassName="sm:col-span-2" />
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{worker ? t("common.saveChanges") : t("workers.create")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
