import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/i18n/server";
import { PrintButton } from "./print-button";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const { t } = await getI18n();
  return (
    <div className="min-h-dvh bg-white">
      <div className="no-print sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <span className="text-sm text-ink-soft">{t("print.preview")}</span>
        <PrintButton label={t("common.print")} />
      </div>
      <main className="mx-auto max-w-3xl px-6 py-8 print:p-0">{children}</main>
    </div>
  );
}
