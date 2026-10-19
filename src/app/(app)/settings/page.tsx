import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { getI18n } from "@/i18n/server";
import { getSettings, listCategories, listUsers } from "@/domain/settings/service";
import { accountBalances } from "@/domain/ledger/service";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Dialog } from "@/components/forms";
import { catLabel } from "@/components/labels";
import { can, MANAGER_PERMISSIONS } from "@/lib/auth/permissions";
import {
  AccountRowForm,
  CategoryRowForm,
  ChangePasswordForm,
  NewAccountForm,
  NewCategoryForm,
  NewUserForm,
  ResetPasswordForm,
  UserRowForm,
  WorkshopForm,
} from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("nav.settings") };
}

export default async function SettingsPage() {
  const { t, q, user } = await pageContext();
  const owner = can(user.role, "settings.manage");
  const data = await q(async (tx) => {
    const [r] = await tx<{ n: number }[]>`
      select (select count(*) from atelier.worker_earnings) + (select count(*) from atelier.ledger_entries where pay_week is not null) as n`;
    return {
      settings: await getSettings(tx),
      categories: await listCategories(tx, { includeInactive: true }),
      accounts: await accountBalances(tx, { includeInactive: true }),
      users: owner ? await listUsers(tx) : [],
      weekLocked: (r?.n ?? 0) > 0,
    };
  });
  return (
    <>
      <PageHeader title={t("nav.settings")} description={owner ? t("settings.description") : t("settings.managerDescription")} />
      <div className="space-y-4">
        {owner ? (
          <Card>
            <CardHeader title={t("settings.workshop")} />
            <div className="p-4">
              <WorkshopForm name={data.settings.workshopName} weekStartDay={data.settings.weekStartDay} weekLocked={data.weekLocked} />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t("settings.myPassword")} description={`${user.displayName} · ${user.email}`} />
          <div className="p-4">
            <ChangePasswordForm />
          </div>
        </Card>

        {owner ? (
          <Card id="users">
            <CardHeader title={t("settings.users")} description={t("settings.usersHelp")} />
            <ul className="divide-y divide-line">
              {data.users.map((u) => (
                <li key={u.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium" dir="ltr">{u.email}</span>
                    <Badge tone={u.role === "owner" ? "primary" : "neutral"}>{t(`roles.${u.role}`)}</Badge>
                    {!u.active ? <Badge>{t("common.inactive")}</Badge> : null}
                    {u.id === user.id ? <Badge tone="info">{t("settings.you")}</Badge> : null}
                  </div>
                  <UserRowForm id={u.id} displayName={u.displayName} role={u.role} active={u.active} />
                  {u.id !== user.id ? (
                    <Dialog trigger={t("settings.resetPassword")} title={`${t("settings.resetPassword")} — ${u.displayName}`} triggerSize="sm" triggerVariant="ghost">
                      <ResetPasswordForm id={u.id} />
                    </Dialog>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4">
              <h3 className="mb-3 font-sans text-base font-semibold">{t("settings.addUser")}</h3>
              <NewUserForm />
            </div>
            <div className="border-t border-line p-4 text-sm text-ink-soft">
              <h3 className="mb-1 font-sans font-semibold text-ink">{t("settings.managerPermissions")}</h3>
              <ul className="list-disc ps-5">
                {MANAGER_PERMISSIONS.map((p) => (
                  <li key={p}>{t(`permissions.${p.replace(".", "_")}`)}</li>
                ))}
              </ul>
              <p className="mt-2">{t("settings.ownerOnly")}</p>
            </div>
          </Card>
        ) : null}

        {owner ? (
          <Card id="accounts">
            <CardHeader title={t("settings.accounts")} description={t("settings.accountsHelp")} />
            <ul className="divide-y divide-line">
              {data.accounts.map((a) => (
                <li key={a.accountId} className="px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                    <Badge>{t(`accountKind.${a.kind}`)}</Badge>
                    {t("cash.calculated")}: <Money cents={a.balanceCents} />
                  </div>
                  <AccountRowForm id={a.accountId} name={a.name} active={a.active} isDefault={a.isDefault} />
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4">
              <NewAccountForm />
            </div>
          </Card>
        ) : null}

        {owner ? (
          <Card id="categories">
            <CardHeader title={t("settings.categories")} description={t("settings.categoriesHelp")} />
            <ul className="divide-y divide-line">
              {data.categories.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  {c.code ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{catLabel(c, t)}</span>
                      <Badge>{t("settings.builtIn")}</Badge>
                    </div>
                  ) : (
                    <CategoryRowForm id={c.id} name={c.name} active={c.active} />
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4">
              <NewCategoryForm />
            </div>
          </Card>
        ) : null}

        {owner ? (
          <Card>
            <CardHeader title={t("settings.audit")} description={t("settings.auditHelp")} actions={<Link href="/settings/audit" className="text-sm text-primary hover:underline">{t("common.open")}</Link>} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
