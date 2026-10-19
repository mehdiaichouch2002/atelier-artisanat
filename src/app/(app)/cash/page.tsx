import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { pageContext } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { accountBalances, listCashCounts } from "@/domain/ledger/service";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/forms";
import { Table, Td, Th } from "@/components/table";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { nowLocal } from "../payroll/context";
import { CashCountForm, SimpleEntryForm, TransferForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.cash") };
}

export default async function CashPage() {
  const { t, q, user } = await pageContext();
  const { accounts, counts } = await q(async (tx) => ({ accounts: await accountBalances(tx), counts: await listCashCounts(tx, 10) }));
  const options = accounts.map((a) => ({ value: a.accountId, label: a.name }));
  const defaultAccountId = accounts.find((a) => a.isDefault)?.accountId ?? accounts[0]?.accountId ?? "";
  const total = accounts.reduce((s, a) => s + a.balanceCents, 0);
  const now = nowLocal();
  return (
    <>
      <PageHeader
        title={t("nav.cash")}
        description={t("cash.description")}
        actions={
          <LinkButton href="/cash/ledger" variant="secondary">
            <BookOpen className="size-4" aria-hidden /> {t("ledger.title")}
          </LinkButton>
        }
      />
      <section aria-label={t("cash.accounts")} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.map((a) => (
          <Link key={a.accountId} href={`/cash/ledger?account=${a.accountId}`} className="card block p-4 hover:border-primary">
            <div className="flex items-center justify-between gap-2 text-sm text-ink-soft">
              <span>{a.name}</span>
              <Badge>{t(`accountKind.${a.kind}`)}</Badge>
            </div>
            <div className="mt-2 text-2xl font-semibold"><Money cents={a.balanceCents} tone="auto" /></div>
          </Link>
        ))}
        <div className="card bg-primary-soft p-4">
          <div className="text-sm text-primary">{t("cash.totalCalculated")}</div>
          <div className="mt-2 text-2xl font-semibold text-primary"><Money cents={total} /></div>
          <p className="mt-1 text-xs text-ink-soft">{t("cash.calculatedHelp")}</p>
        </div>
      </section>

      <Card className="mb-4">
        <CardHeader title={t("cash.actions")} />
        <div className="flex flex-wrap gap-2 p-4">
          <Dialog trigger={t("cash.countCash")} title={t("cash.countCash")} triggerVariant="primary">
            <CashCountForm accounts={options} defaultAccountId={defaultAccountId} canAdjust={can(user.role, "cash.adjust")} />
          </Dialog>
          <Dialog trigger={t("cash.otherIncome")} title={t("cash.otherIncome")}>
            <SimpleEntryForm type="other_income" accounts={options} defaultAccountId={defaultAccountId} nowLocal={now} />
          </Dialog>
          {can(user.role, "cash.transfer") && options.length > 1 ? (
            <Dialog trigger={t("cash.transfer")} title={t("cash.transfer")}>
              <TransferForm accounts={options} nowLocal={now} />
            </Dialog>
          ) : null}
          {can(user.role, "cash.opening") ? (
            <Dialog trigger={t("cash.openingBalance")} title={t("cash.openingBalance")}>
              <SimpleEntryForm type="opening_balance" accounts={options} defaultAccountId={defaultAccountId} nowLocal={now} />
            </Dialog>
          ) : null}
          {can(user.role, "accounts.manage") ? (
            <LinkButton href="/settings#accounts" variant="ghost">{t("cash.manageAccounts")}</LinkButton>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("cash.reconciliation")} description={t("cash.reconciliationHelp")} />
        {counts.length === 0 ? (
          <EmptyState title={t("cash.noCounts")} />
        ) : (
          <Table caption={t("cash.reconciliation")}>
            <thead>
              <tr>
                <Th>{t("fields.date")}</Th>
                <Th>{t("fields.account")}</Th>
                <Th num>{t("cash.calculated")}</Th>
                <Th num>{t("cash.counted")}</Th>
                <Th num>{t("cash.difference")}</Th>
                <Th>{t("cash.adjustmentRef")}</Th>
                <Th>{t("fields.note")}</Th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id}>
                  <Td label={t("fields.date")} primary><span className="num">{formatDateTime(c.countedAt)}</span></Td>
                  <Td label={t("fields.account")}>{c.accountName}</Td>
                  <Td label={t("cash.calculated")} num><Money cents={c.calculatedCents} /></Td>
                  <Td label={t("cash.counted")} num><Money cents={c.countedCents} /></Td>
                  <Td label={t("cash.difference")} num>
                    {c.differenceCents === 0 ? <Badge tone="ok">✓ {t("cash.matches")}</Badge> : <Money cents={c.differenceCents} signed tone="auto" />}
                  </Td>
                  <Td label={t("cash.adjustmentRef")}>{c.adjustmentReference ? <span className="num">{c.adjustmentReference}</span> : "—"}</Td>
                  <Td label={t("fields.note")}>{c.note ?? "—"} <span className="text-xs text-ink-soft">· {c.createdByName}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
