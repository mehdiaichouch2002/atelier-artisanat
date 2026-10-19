import Link from "next/link";
import { Paperclip } from "lucide-react";
import type { TFunction } from "@/i18n/translate";
import type { LedgerEntry } from "@/domain/ledger/service";
import { formatDateTime, formatDate } from "@/lib/dates";
import { Money } from "./ui/money";
import { Badge } from "./ui/badge";
import { EntryTypeBadge } from "./labels";
import { Table, Td, Th } from "./table";

type Col = "date" | "reference" | "type" | "party" | "category" | "week" | "account" | "description" | "amount";

/** Ledger entries with consistent formatting; reversed entries are struck through. */
export function EntriesTable({ entries, t, cols, caption }: { entries: LedgerEntry[]; t: TFunction; cols: Col[]; caption: string }) {
  const has = (c: Col) => cols.includes(c);
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          {has("date") ? <Th>{t("fields.date")}</Th> : null}
          {has("reference") ? <Th>{t("fields.reference")}</Th> : null}
          {has("type") ? <Th>{t("fields.type")}</Th> : null}
          {has("party") ? <Th>{t("fields.party")}</Th> : null}
          {has("category") ? <Th>{t("fields.category")}</Th> : null}
          {has("week") ? <Th>{t("payroll.week")}</Th> : null}
          {has("account") ? <Th>{t("fields.account")}</Th> : null}
          {has("description") ? <Th>{t("fields.description")}</Th> : null}
          {has("amount") ? <Th num>{t("fields.amount")}</Th> : null}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const signed = e.direction === "in" ? e.amountCents : -e.amountCents;
          return (
            <tr key={e.id}>
              {has("date") ? (
                <Td label={t("fields.date")}>
                  <span className="num">{formatDateTime(e.occurredAt)}</span>
                </Td>
              ) : null}
              {has("reference") ? (
                <Td label={t("fields.reference")} primary>
                  <Link href={`/cash/ledger/${e.id}`} className="num text-primary hover:underline">
                    {e.reference}
                  </Link>
                  {e.attachments ? <Paperclip className="ms-1 inline size-3.5 text-ink-soft" aria-label={t("fields.attachment")} /> : null}
                </Td>
              ) : null}
              {has("type") ? (
                <Td label={t("fields.type")}>
                  <EntryTypeBadge type={e.entryType} reversal={Boolean(e.reversalOf)} t={t} />
                  {e.reversedBy ? <Badge tone="bad" className="ms-1">{t("ledger.reversed")}</Badge> : null}
                </Td>
              ) : null}
              {has("party") ? (
                <Td label={t("fields.party")}>
                  {e.workerId ? (
                    <Link href={`/workers/${e.workerId}`} className="hover:underline">{e.workerName}</Link>
                  ) : e.customerId ? (
                    <Link href={`/customers/${e.customerId}`} className="hover:underline">{e.customerName}</Link>
                  ) : (
                    e.supplier ?? "—"
                  )}
                  {e.orderId ? (
                    <Link href={`/orders/${e.orderId}`} className="num ms-1 text-sm text-primary hover:underline">{e.orderReference}</Link>
                  ) : null}
                </Td>
              ) : null}
              {has("category") ? (
                <Td label={t("fields.category")}>
                  {e.advanceCategory ? <span className="me-1">{t(`advanceCategory.${e.advanceCategory}`)}</span> : null}
                  {e.advanceTreatment === "business" ? <Badge tone="warn">{t("advanceTreatment.business")}</Badge> : null}
                  {e.expenseCategory && e.entryType === "expense" ? t(`expenseCategory.${e.expenseCategory}`) : null}
                  {!e.advanceCategory && !e.expenseCategory ? "—" : null}
                </Td>
              ) : null}
              {has("week") ? (
                <Td label={t("payroll.week")}>
                  <span className="num">{e.payWeek ? formatDate(e.payWeek) : "—"}</span>
                </Td>
              ) : null}
              {has("account") ? <Td label={t("fields.account")}>{e.accountName} · <span className="text-sm text-ink-soft">{t(`method.${e.method}`)}</span></Td> : null}
              {has("description") ? <Td label={t("fields.description")}>{e.description ?? "—"}</Td> : null}
              {has("amount") ? (
                <Td label={t("fields.amount")} num>
                  <Money cents={signed} signed tone={signed >= 0 ? "in" : "out"} className={e.reversedBy ? "line-through" : "font-medium"} />
                </Td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
