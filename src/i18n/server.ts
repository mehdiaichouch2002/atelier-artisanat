import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, dirOf, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { createTranslator, type Messages } from "./translate";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import es from "./locales/es.json";

const ALL: Record<Locale, Messages> = { fr, ar, en, es };

export function messagesFor(locale: Locale): Messages {
  return ALL[locale];
}

export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  return { locale, dir: dirOf(locale), t: createTranslator(ALL[locale], ALL.fr), messages: ALL[locale] };
});
