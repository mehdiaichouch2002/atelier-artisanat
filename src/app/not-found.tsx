import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="text-ink-soft">{t("notFound.help")}</p>
      <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 font-medium text-white">
        {t("notFound.back")}
      </Link>
    </main>
  );
}
