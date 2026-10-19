"use client";
import Link from "next/link";
import { useState } from "react";
import { Printer } from "lucide-react";
import {
  ActionForm,
  MoneyField,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/forms";
import { Notice } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { centsToInput, formatMoney, type Cents } from "@/lib/money";
import type { ActionState } from "@/lib/action";
import type { PayKind } from "@/domain/payroll/logic";
import { recordAdjustmentAction, recordBasePayAction, recordPaymentAction, voidEarningAction } from "./actions";

export interface Option {
  value: string;
  label: string;
}

export interface PayContext {
  workerId: string;
  workerName: string;
  payWeek: string;
  payKind: PayKind;
  hasBase: boolean;
  proposedBaseCents: Cents | null;
  defaultDays: string | null;
  remainingCents: Cents;
  nowLocal: string;
  accounts: Option[];
  defaultAccountId: string;
}

export function useMethodOptions(): Option[] {
  const { t } = useI18n();
  return (["cash", "bank_transfer", "cheque", "card", "mobile", "other"] as const).map((m) => ({ value: m, label: t(`method.${m}`) }));
}

/** Settlement payment form. Records the week's base pay first when it is not recorded yet. */
export function PaymentForm({ ctx, onDone }: { ctx: PayContext; onDone?: () => void }) {
  const { t } = useI18n();
  const methods = useMethodOptions();
  const [receipt, setReceipt] = useState<{ id: string; reference: string } | null>(null);
  const needsQuantity = !ctx.hasBase && (ctx.payKind === "daily" || ctx.payKind === "piece");
  const needsAmount = !ctx.hasBase && ctx.payKind === "negotiated";
  const suggested = ctx.hasBase || ctx.proposedBaseCents != null ? Math.max(0, ctx.remainingCents) : null;

  return (
    <ActionForm
      action={recordPaymentAction}
      className="space-y-4"
      onSuccess={(s: ActionState) => {
        if (s.data?.receiptId) setReceipt({ id: String(s.data.receiptId), reference: String(s.data.reference) });
        onDone?.();
      }}
    >
      {receipt ? (
        <Notice tone="ok">
          {t("payroll.paymentSaved")} ({receipt.reference}) ·{" "}
          <Link href={`/print/receipt/${receipt.id}`} className="inline-flex items-center gap-1 font-semibold underline" target="_blank">
            <Printer className="size-4" aria-hidden /> {t("print.receipt")}
          </Link>
        </Notice>
      ) : null}
      <input type="hidden" name="workerId" value={ctx.workerId} />
      <input type="hidden" name="payWeek" value={ctx.payWeek} />
      {!ctx.hasBase ? (
        <div className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm">
          <p className="font-medium text-warn">{t("payroll.baseNotRecorded")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ctx.payKind === "weekly" ? (
              <MoneyField
                name="baseAmount"
                label={t("payroll.agreedThisWeek")}
                defaultValue={centsToInput(ctx.proposedBaseCents)}
                hint={t("payroll.agreedThisWeekHint")}
              />
            ) : null}
            {needsQuantity ? (
              <TextField
                name="baseQuantity"
                label={ctx.payKind === "daily" ? t("payroll.daysWorked") : t("payroll.piecesMade")}
                inputMode="decimal"
                required
                dir="ltr"
                defaultValue={ctx.payKind === "daily" ? (ctx.defaultDays ?? "") : ""}
              />
            ) : null}
            {needsAmount ? <MoneyField name="baseAmount" label={t("payroll.agreedThisWeek")} required /> : null}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          name="amount"
          label={t("payroll.amountPaid")}
          required
          defaultValue={suggested != null ? centsToInput(suggested) : ""}
          hint={suggested != null ? t("payroll.remainingHint", { amount: formatMoney(ctx.remainingCents) }) : undefined}
        />
        <TextField name="note" label={t("fields.note")} />
      </div>
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("common.moreOptions")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={ctx.nowLocal} />
          <SelectField name="accountId" label={t("fields.account")} required options={ctx.accounts} defaultValue={ctx.defaultAccountId} />
          <SelectField name="method" label={t("fields.method")} required options={methods} defaultValue="cash" />
        </div>
      </details>
      <SubmitButton size="lg" className="w-full sm:w-auto">
        {t("payroll.savePayment")}
      </SubmitButton>
    </ActionForm>
  );
}

export function BasePayForm({ ctx }: { ctx: PayContext }) {
  const { t } = useI18n();
  return (
    <ActionForm action={recordBasePayAction} className="space-y-3">
      <input type="hidden" name="workerId" value={ctx.workerId} />
      <input type="hidden" name="payWeek" value={ctx.payWeek} />
      <div className="grid gap-3 sm:grid-cols-2">
        {ctx.payKind === "daily" || ctx.payKind === "piece" ? (
          <TextField
            name="quantity"
            label={ctx.payKind === "daily" ? t("payroll.daysWorked") : t("payroll.piecesMade")}
            inputMode="decimal"
            required
            dir="ltr"
            defaultValue={ctx.payKind === "daily" ? (ctx.defaultDays ?? "") : ""}
          />
        ) : (
          <MoneyField
            name="amount"
            label={t("payroll.agreedThisWeek")}
            required={ctx.payKind === "negotiated"}
            defaultValue={centsToInput(ctx.proposedBaseCents)}
          />
        )}
        <TextField name="note" label={t("fields.note")} />
      </div>
      <SubmitButton variant="secondary">{t("payroll.confirmBase")}</SubmitButton>
    </ActionForm>
  );
}

export function AdjustmentForm({ workerId, payWeek }: { workerId: string; payWeek: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={recordAdjustmentAction} className="space-y-3">
      <input type="hidden" name="workerId" value={workerId} />
      <input type="hidden" name="payWeek" value={payWeek} />
      <SelectField
        name="basis"
        label={t("fields.type")}
        required
        defaultValue="bonus"
        options={[
          { value: "bonus", label: t("earningBasis.bonus") },
          { value: "adjustment", label: t("earningBasis.adjustment") },
        ]}
      />
      <MoneyField name="amount" label={t("fields.amount")} required hint={t("payroll.adjustmentHint")} />
      <TextField name="note" label={t("fields.reason")} required />
      <SubmitButton>{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

export function VoidEarningForm({ id, workerId }: { id: string; workerId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={voidEarningAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="workerId" value={workerId} />
      <p className="text-sm text-ink-soft">{t("payroll.voidHelp")}</p>
      <TextField name="reason" label={t("fields.reason")} required />
      <SubmitButton variant="danger">{t("payroll.void")}</SubmitButton>
    </ActionForm>
  );
}
