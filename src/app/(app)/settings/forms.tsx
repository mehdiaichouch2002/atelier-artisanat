"use client";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/forms";
import { useI18n } from "@/i18n/client";
import {
  changeOwnPasswordAction,
  createAccountAction,
  createCategoryAction,
  createUserAction,
  resetPasswordAction,
  updateAccountAction,
  updateCategoryAction,
  updateSettingsAction,
  updateUserAction,
} from "./actions";

export function WorkshopForm({ name, weekStartDay, weekLocked }: { name: string; weekStartDay: number; weekLocked: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateSettingsAction} className="grid gap-4 sm:grid-cols-2">
      <TextField name="workshopName" label={t("settings.workshopName")} required defaultValue={name} />
      <SelectField
        name="weekStartDay"
        label={t("settings.weekStartDay")}
        required
        defaultValue={String(weekStartDay)}
        hint={weekLocked ? t("settings.weekStartLocked") : t("settings.weekStartHint")}
        options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: t(`weekday.${d}`) }))}
      />
      <div className="sm:col-span-2">
        <SubmitButton>{t("common.saveChanges")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NewCategoryForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={createCategoryAction} className="flex flex-wrap items-end gap-3">
      <TextField name="name" label={t("settings.newCategory")} required wrapperClassName="grow" />
      <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
    </ActionForm>
  );
}

export function CategoryRowForm({ id, name, active }: { id: string; name: string; active: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateCategoryAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <TextField name="name" label={t("fields.name")} required defaultValue={name} wrapperClassName="grow" />
      <CheckboxField name="active" label={t("common.active")} defaultChecked={active} />
      <SubmitButton variant="secondary" size="sm">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

/** Built-in categories keep their translated name; only their availability can change. */
export function BuiltInCategoryForm({ id, name, label, active }: { id: string; name: string; label: string; active: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateCategoryAction} className="flex flex-wrap items-center justify-between gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="active" value={active ? "" : "on"} />
      <span className="font-medium">
        {label} <span className={active ? "text-sm text-ok" : "text-sm text-ink-soft"}>· {active ? t("common.active") : t("common.inactive")}</span>
      </span>
      <SubmitButton variant={active ? "secondary" : "primary"} size="sm">
        {active ? t("settings.disableCategory") : t("settings.enableCategory")}
      </SubmitButton>
    </ActionForm>
  );
}

export function NewAccountForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={createAccountAction} className="flex flex-wrap items-end gap-3">
      <TextField name="name" label={t("settings.newAccount")} required wrapperClassName="grow" />
      <SelectField
        name="kind"
        label={t("fields.type")}
        required
        defaultValue="bank"
        options={(["cash", "bank", "other"] as const).map((k) => ({ value: k, label: t(`accountKind.${k}`) }))}
      />
      <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
    </ActionForm>
  );
}

export function AccountRowForm({ id, name, active, isDefault }: { id: string; name: string; active: boolean; isDefault: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateAccountAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <TextField name="name" label={t("fields.name")} required defaultValue={name} wrapperClassName="grow" />
      <CheckboxField name="active" label={t("common.active")} defaultChecked={active} />
      <CheckboxField name="isDefault" label={t("settings.defaultAccount")} defaultChecked={isDefault} />
      <SubmitButton variant="secondary" size="sm">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

export function NewUserForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={createUserAction} className="grid gap-4 sm:grid-cols-2">
      <TextField name="displayName" label={t("fields.name")} required />
      <TextField name="email" type="email" label={t("auth.email")} required dir="ltr" autoComplete="off" />
      <SelectField
        name="role"
        label={t("settings.role")}
        required
        defaultValue="manager"
        options={[
          { value: "manager", label: t("roles.manager") },
          { value: "owner", label: t("roles.owner") },
        ]}
      />
      <TextField name="password" type="password" label={t("settings.initialPassword")} required autoComplete="new-password" hint={t("settings.passwordHint")} dir="ltr" />
      <div className="sm:col-span-2">
        <SubmitButton>{t("settings.createUser")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function UserRowForm({ id, displayName, role, active }: { id: string; displayName: string; role: string; active: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateUserAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <TextField name="displayName" label={t("fields.name")} required defaultValue={displayName} wrapperClassName="grow" />
      <SelectField
        name="role"
        label={t("settings.role")}
        required
        defaultValue={role}
        options={[
          { value: "manager", label: t("roles.manager") },
          { value: "owner", label: t("roles.owner") },
        ]}
      />
      <CheckboxField name="active" label={t("common.active")} defaultChecked={active} />
      <SubmitButton variant="secondary" size="sm">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={resetPasswordAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <TextField name="password" type="password" label={t("settings.newPassword")} required autoComplete="new-password" hint={t("settings.passwordHint")} dir="ltr" />
      <SubmitButton>{t("settings.resetPassword")}</SubmitButton>
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={changeOwnPasswordAction} className="grid gap-4 sm:grid-cols-3">
      <TextField name="current" type="password" label={t("settings.currentPassword")} required autoComplete="current-password" dir="ltr" />
      <TextField name="password" type="password" label={t("settings.newPassword")} required autoComplete="new-password" hint={t("settings.passwordHint")} dir="ltr" />
      <TextField name="confirm" type="password" label={t("settings.confirmPassword")} required autoComplete="new-password" dir="ltr" />
      <div className="sm:col-span-3">
        <SubmitButton variant="secondary">{t("settings.changePassword")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
