"use client";
import { ActionForm, PasswordField, SubmitButton, TextField } from "@/components/forms";
import { useI18n } from "@/i18n/client";
import { loginAction } from "../auth-actions";

export function LoginForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={loginAction} className="space-y-4" aria-label={t("auth.signIn")}>
      <TextField
        name="email"
        type="email"
        label={t("auth.email")}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        autoFocus
        required
        dir="ltr"
      />
      <PasswordField name="password" label={t("auth.password")} autoComplete="current-password" required />
      <SubmitButton className="w-full">{t("auth.signIn")}</SubmitButton>
    </ActionForm>
  );
}
