import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { getSessionUser } from "@/lib/auth/session";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.signIn") };
}

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  const { t } = await getI18n();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 size-12 rotate-45 rounded-md border-2 border-copper bg-copper-soft"
          />
          <h1 className="text-2xl font-semibold text-primary">{t("app.name")}</h1>
          <p className="mt-1 text-ink-soft">{t("app.tagline")}</p>
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">{t("auth.signIn")}</h2>
          <LoginForm />
        </div>
        <div className="mt-6 flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
