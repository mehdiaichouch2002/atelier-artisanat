"use client";
import { useI18n } from "@/i18n/client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center" role="alert">
      <h1 className="text-xl font-semibold">{t("errorPage.title")}</h1>
      <p className="mt-2 text-ink-soft">{t("errorPage.help")}</p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg bg-primary px-4 font-medium text-white">
        {t("errorPage.retry")}
      </button>
    </div>
  );
}
