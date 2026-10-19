"use client";
import { useRef } from "react";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { setLocaleAction } from "@/app/locale-actions";

export function LocaleSwitcher({ compact }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setLocaleAction} className="flex items-center gap-1.5">
      <Languages className="size-4 text-ink-soft" aria-hidden />
      <label htmlFor={compact ? "locale-compact" : "locale"} className="sr-only">
        {t("common.language")}
      </label>
      <select
        id={compact ? "locale-compact" : "locale"}
        name="locale"
        defaultValue={locale}
        onChange={() => form.current?.requestSubmit()}
        className="min-h-9 rounded-md border border-line bg-surface px-2 text-sm"
        data-testid="locale-switcher"
      >
        {LOCALES.map((l: Locale) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm underline">
          OK
        </button>
      </noscript>
    </form>
  );
}
