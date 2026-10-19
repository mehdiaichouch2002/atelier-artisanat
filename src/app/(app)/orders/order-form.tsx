"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  ActionForm,
  ComboboxField,
  MoneyField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useFormState,
  type ComboOption,
} from "@/components/forms";
import { Money } from "@/components/ui/money";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { centsToInput, parseMoney } from "@/lib/money";
import type { ActionState } from "@/lib/action";
import type { OrderDetail } from "@/domain/orders/service";
import { ORDER_PRIORITIES } from "@/domain/orders/logic";
import { useMethodOptions, type Option } from "../payroll/forms";

interface LineState {
  key: number;
  categoryId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 1;
const blankLine = (): LineState => ({ key: nextKey++, categoryId: "", description: "", quantity: "1", unitPrice: "" });

function LinesEditor({ initial, categories }: { initial: LineState[]; categories: Option[] }) {
  const { t } = useI18n();
  const { state } = useFormState();
  const [lines, setLines] = useState<LineState[]>(initial.length ? initial : [blankLine()]);
  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = Number(l.quantity);
        const p = parseMoney(l.unitPrice);
        return Number.isInteger(q) && q > 0 && p != null ? sum + q * p : sum;
      }, 0),
    [lines],
  );
  const update = (key: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const err = (name: string) => {
    const e = state.fieldErrors?.[name];
    return e ? t(e) : undefined;
  };

  return (
    <fieldset>
      <legend className="mb-2 text-base font-semibold">{t("orders.lines")}</legend>
      {err("lines") ? <p className="mb-2 text-sm font-medium text-bad" role="alert">{err("lines")}</p> : null}
      <ol className="space-y-3">
        {lines.map((l, i) => {
          const q = Number(l.quantity);
          const p = parseMoney(l.unitPrice);
          const lineTotal = Number.isInteger(q) && q > 0 && p != null ? q * p : null;
          const id = `line-${l.key}`;
          return (
            <li key={l.key} className="rounded-lg border border-line bg-white p-3">
              <div className="grid gap-3 lg:grid-cols-[10rem_1fr_6rem_9rem_auto] lg:items-end sm:grid-cols-2">
                <div>
                  <label htmlFor={`${id}-cat`} className="mb-1 block text-sm font-medium">{t("fields.category")}</label>
                  <select
                    id={`${id}-cat`}
                    name={`lines.${i}.categoryId`}
                    value={l.categoryId}
                    onChange={(e) => update(l.key, { categoryId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${id}-desc`} className="mb-1 block text-sm font-medium">
                    {t("fields.description")} <span className="text-bad" aria-hidden>*</span>
                  </label>
                  <input
                    id={`${id}-desc`}
                    name={`lines.${i}.description`}
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    className="field-input"
                    aria-invalid={err(`lines.${i}.description`) ? true : undefined}
                    aria-describedby={err(`lines.${i}.description`) ? `${id}-desc-err` : undefined}
                    placeholder={t("orders.linePlaceholder")}
                  />
                  {err(`lines.${i}.description`) ? <p id={`${id}-desc-err`} className="mt-1 text-sm text-bad">{err(`lines.${i}.description`)}</p> : null}
                </div>
                <div>
                  <label htmlFor={`${id}-qty`} className="mb-1 block text-sm font-medium">{t("fields.quantity")}</label>
                  <input
                    id={`${id}-qty`}
                    name={`lines.${i}.quantity`}
                    value={l.quantity}
                    inputMode="numeric"
                    dir="ltr"
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className="field-input num text-end"
                    aria-invalid={err(`lines.${i}.quantity`) ? true : undefined}
                  />
                  {err(`lines.${i}.quantity`) ? <p className="mt-1 text-sm text-bad">{err(`lines.${i}.quantity`)}</p> : null}
                </div>
                <div>
                  <label htmlFor={`${id}-price`} className="mb-1 block text-sm font-medium">{t("fields.unitPrice")}</label>
                  <input
                    id={`${id}-price`}
                    name={`lines.${i}.unitPrice`}
                    value={l.unitPrice}
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                    className="field-input num text-end"
                    aria-invalid={err(`lines.${i}.unitPrice`) ? true : undefined}
                  />
                  {err(`lines.${i}.unitPrice`) ? <p className="mt-1 text-sm text-bad">{err(`lines.${i}.unitPrice`)}</p> : null}
                </div>
                <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-end">
                  <span className="text-sm text-ink-soft lg:hidden">{t("fields.total")}</span>
                  <span className="font-semibold">{lineTotal != null ? <Money cents={lineTotal} /> : "—"}</span>
                  {lines.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      aria-label={t("orders.removeLine", { n: i + 1 })}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          <Plus className="size-4" aria-hidden /> {t("orders.addLine")}
        </Button>
        <p className="text-lg">
          {t("money.agreedTotal")}: <strong><Money cents={total} /></strong>
        </p>
      </div>
    </fieldset>
  );
}

export function OrderForm({
  action,
  order,
  customers,
  workers,
  categories,
  today,
  defaultCustomer,
  accounts,
  defaultAccountId,
  linesEditable = true,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  order?: OrderDetail;
  customers: ComboOption[];
  workers: Option[];
  categories: Option[];
  today: string;
  defaultCustomer?: string | null;
  accounts: Option[];
  defaultAccountId: string;
  linesEditable?: boolean;
}) {
  const { t } = useI18n();
  const methods = useMethodOptions();
  const [newCustomer, setNewCustomer] = useState(false);
  const initialLines: LineState[] =
    order?.lines.map((l) => ({
      key: nextKey++,
      categoryId: l.categoryId ?? "",
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: centsToInput(l.unitPriceCents),
    })) ?? [];

  return (
    <ActionForm action={action} className="space-y-6">
      {order ? <input type="hidden" name="id" value={order.id} /> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">{t("orders.customerAndDates")}</legend>
        {newCustomer && !order ? (
          <>
            <TextField name="newCustomerName" label={t("fields.customerName")} required />
            <TextField name="newCustomerPhone" type="tel" label={t("fields.phone")} dir="ltr" />
          </>
        ) : (
          <ComboboxField
            name="customerId"
            label={t("fields.customer")}
            options={customers}
            defaultValue={order?.customerId ?? defaultCustomer}
            required
          />
        )}
        {!order ? (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setNewCustomer((v) => !v)}>
              {newCustomer ? t("orders.pickExistingCustomer") : t("orders.newCustomerInline")}
            </Button>
          </div>
        ) : null}
        <TextField name="orderDate" type="date" label={t("fields.orderDate")} required defaultValue={order?.orderDate ?? today} />
        <TextField name="dueDate" type="date" label={t("fields.dueDate")} defaultValue={order?.dueDate} />
        <SelectField
          name="priority"
          label={t("fields.priority")}
          required
          defaultValue={order?.priority ?? "normal"}
          options={ORDER_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
        />
        <SelectField
          name="assignedWorkerId"
          label={t("fields.assignedWorker")}
          options={workers}
          placeholder={t("common.none")}
          defaultValue={order?.assignedWorkerId}
        />
        {!order ? (
          <SelectField
            name="status"
            label={t("fields.status")}
            required
            defaultValue="confirmed"
            options={[
              { value: "quote", label: t("orderStatus.quote") },
              { value: "confirmed", label: t("orderStatus.confirmed") },
            ]}
          />
        ) : null}
      </fieldset>

      {linesEditable ? (
        <LinesEditor initial={initialLines} categories={categories} />
      ) : (
        <p className="rounded-lg bg-sunken p-3 text-sm text-ink-soft">{t("orders.linesLocked")}</p>
      )}

      {!order ? (
        <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-3">
          <legend className="px-1 text-base font-semibold">{t("orders.depositOptional")}</legend>
          <MoneyField name="deposit" label={t("orders.depositReceived")} hint={t("orders.depositHint")} />
          <SelectField name="depositAccountId" label={t("fields.account")} options={accounts} defaultValue={defaultAccountId} />
          <SelectField name="depositMethod" label={t("fields.method")} options={methods} defaultValue="cash" />
        </fieldset>
      ) : null}

      <TextAreaField name="notes" label={t("fields.notes")} defaultValue={order?.notes} />
      {!order ? (
        <TextField name="attachment" type="file" label={t("fields.attachment")} accept="image/jpeg,image/png,image/webp,application/pdf" hint={t("fields.attachmentHint")} />
      ) : null}
      <SubmitButton size="lg">{order ? t("common.saveChanges") : t("orders.create")}</SubmitButton>
    </ActionForm>
  );
}
