"use client";
import { ActionForm, CheckboxField, MoneyField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/forms";
import { useI18n } from "@/i18n/client";
import type { Option } from "../payroll/forms";
import { useMethodOptions } from "../payroll/forms";
import { cashCountAction, reverseEntryAction, simpleEntryAction, transferAction } from "./actions";

export function TransferForm({ accounts, nowLocal }: { accounts: Option[]; nowLocal: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={transferAction} className="space-y-4">
      <p className="text-sm text-ink-soft">{t("cash.transferHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="fromAccountId" label={t("cash.fromAccount")} required options={accounts} defaultValue={accounts[0]?.value} />
        <SelectField name="toAccountId" label={t("cash.toAccount")} required options={accounts} defaultValue={accounts[1]?.value} />
        <MoneyField name="amount" label={t("fields.amount")} required />
        <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={nowLocal} />
      </div>
      <TextField name="description" label={t("fields.note")} />
      <SubmitButton>{t("cash.saveTransfer")}</SubmitButton>
    </ActionForm>
  );
}

export function SimpleEntryForm({
  type,
  accounts,
  defaultAccountId,
  nowLocal,
}: {
  type: "opening_balance" | "other_income";
  accounts: Option[];
  defaultAccountId: string;
  nowLocal: string;
}) {
  const { t } = useI18n();
  const methods = useMethodOptions();
  return (
    <ActionForm action={simpleEntryAction} className="space-y-4">
      <input type="hidden" name="entryType" value={type} />
      <p className="text-sm text-ink-soft">{t(type === "opening_balance" ? "cash.openingHelp" : "cash.otherIncomeHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="accountId" label={t("fields.account")} required options={accounts} defaultValue={defaultAccountId} />
        <MoneyField name="amount" label={t("fields.amount")} required />
        {type === "opening_balance" ? (
          <SelectField
            name="direction"
            label={t("cash.openingSign")}
            required
            defaultValue="in"
            options={[
              { value: "in", label: t("cash.openingPositive") },
              { value: "out", label: t("cash.openingNegative") },
            ]}
          />
        ) : (
          <SelectField name="method" label={t("fields.method")} required options={methods} defaultValue="cash" />
        )}
        <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={nowLocal} />
      </div>
      <TextField name="description" label={t("fields.description")} />
      <SubmitButton>{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

export function CashCountForm({ accounts, defaultAccountId, canAdjust }: { accounts: Option[]; defaultAccountId: string; canAdjust: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={cashCountAction} className="space-y-4">
      <p className="text-sm text-ink-soft">{t("cash.countHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="accountId" label={t("fields.account")} required options={accounts} defaultValue={defaultAccountId} />
        <MoneyField name="counted" label={t("cash.countedAmount")} required />
      </div>
      <TextAreaField name="note" label={t("fields.note")} rows={2} hint={t("cash.noteRequiredForAdjustment")} />
      {canAdjust ? <CheckboxField name="adjust" label={t("cash.recordAdjustment")} hint={t("cash.recordAdjustmentHint")} /> : null}
      <SubmitButton>{t("cash.saveCount")}</SubmitButton>
    </ActionForm>
  );
}

export function ReverseForm({ entryId }: { entryId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={reverseEntryAction} className="space-y-3">
      <input type="hidden" name="entryId" value={entryId} />
      <p className="text-sm text-ink-soft">{t("ledger.reverseHelp")}</p>
      <TextField name="reason" label={t("fields.reason")} required />
      <SubmitButton variant="danger">{t("ledger.reverse")}</SubmitButton>
    </ActionForm>
  );
}
