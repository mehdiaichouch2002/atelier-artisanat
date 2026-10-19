"use client";
import Link from "next/link";
import { useState } from "react";
import { Printer } from "lucide-react";
import { ActionForm, ComboboxField, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, type ComboOption } from "@/components/forms";
import { Notice } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { centsToInput, formatMoney, type Cents } from "@/lib/money";
import type { ActionState } from "@/lib/action";
import { useMethodOptions, type Option } from "../payroll/forms";
import { addAdjustmentAction, changeStatusAction, recordOrderPaymentAction, recordRefundAction, uploadOrderAttachmentAction } from "./actions";

export function OrderPaymentForm({
  orderId,
  orders,
  balanceCents,
  nowLocal,
  accounts,
  defaultAccountId,
  refund,
  maxRefundCents,
  creditCents,
}: {
  orderId?: string;
  orders?: ComboOption[];
  balanceCents?: Cents;
  nowLocal: string;
  accounts: Option[];
  defaultAccountId: string;
  refund?: boolean;
  maxRefundCents?: Cents;
  /** Amount owed back to the customer (pre-filled for refunds). */
  creditCents?: Cents;
}) {
  const { t } = useI18n();
  const methods = useMethodOptions();
  const [receipt, setReceipt] = useState<{ id: string; reference: string } | null>(null);
  const suggested = refund ? creditCents : balanceCents;
  return (
    <ActionForm
      action={refund ? recordRefundAction : recordOrderPaymentAction}
      className="space-y-4"
      onSuccess={(s: ActionState) => setReceipt({ id: String(s.data?.receiptId), reference: String(s.data?.reference) })}
      showSuccess={false}
    >
      {receipt ? (
        <Notice tone="ok">
          {t(refund ? "orders.refundSaved" : "orders.paymentSaved")} ({receipt.reference}) ·{" "}
          <Link href={`/print/receipt/${receipt.id}`} target="_blank" className="inline-flex items-center gap-1 font-semibold underline">
            <Printer className="size-4" aria-hidden /> {t("print.receipt")}
          </Link>
        </Notice>
      ) : null}
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : <ComboboxField name="orderId" label={t("fields.order")} options={orders ?? []} required />}
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          name="amount"
          label={refund ? t("orders.refundAmount") : t("orders.amountReceived")}
          required
          defaultValue={suggested && suggested > 0 ? centsToInput(suggested) : ""}
          hint={
            refund && maxRefundCents != null
              ? t("orders.maxRefundHint", { amount: formatMoney(maxRefundCents) })
              : suggested != null
                ? t("orders.balanceHint", { amount: formatMoney(suggested) })
                : undefined
          }
        />
        <TextField name="occurredAt" type="datetime-local" label={t("fields.dateTime")} required defaultValue={nowLocal} />
        <SelectField name="accountId" label={t("fields.account")} required options={accounts} defaultValue={defaultAccountId} />
        <SelectField name="method" label={t("fields.method")} required options={methods} defaultValue="cash" />
      </div>
      <TextAreaField name="note" label={refund ? t("fields.reason") : t("fields.note")} rows={2} required={refund} />
      <SubmitButton variant={refund ? "danger" : "primary"}>{refund ? t("orders.saveRefund") : t("orders.savePayment")}</SubmitButton>
    </ActionForm>
  );
}

export function OrderAdjustmentForm({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={addAdjustmentAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <MoneyField name="amount" label={t("fields.amount")} required hint={t("orders.adjustmentHint")} />
      <TextField name="reason" label={t("fields.reason")} required />
      <SubmitButton>{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

export function CancelOrderForm({ orderId, paidCents }: { orderId: string; paidCents: Cents }) {
  const { t } = useI18n();
  return (
    <ActionForm action={changeStatusAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="to" value="cancelled" />
      <p className="text-sm">{t("orders.cancelHelp")}</p>
      {paidCents > 0 ? (
        <>
          <Notice tone="warn">{t("orders.cancelPaidWarning", { amount: formatMoney(paidCents) })}</Notice>
          <MoneyField name="cancellationFee" label={t("orders.cancellationFee")} hint={t("orders.cancellationFeeHint")} defaultValue="0" />
        </>
      ) : null}
      <SubmitButton variant="danger">{t("orders.confirmCancel")}</SubmitButton>
    </ActionForm>
  );
}

export function AttachmentUploadForm({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={uploadOrderAttachmentAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <TextField name="attachment" type="file" label={t("fields.attachment")} accept="image/jpeg,image/png,image/webp,application/pdf" required hint={t("fields.attachmentHint")} wrapperClassName="grow" />
      <SubmitButton variant="secondary">{t("orders.upload")}</SubmitButton>
    </ActionForm>
  );
}
