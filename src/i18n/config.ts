export const LOCALES = ["fr", "ar", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "atelier_locale";

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  ar: "الدارجة / العربية",
  en: "English",
  es: "Español",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
