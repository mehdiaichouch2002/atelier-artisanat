"use client";
import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createTranslator, type Messages, type TFunction } from "./translate";

const Ctx = createContext<{ locale: Locale; t: TFunction } | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(messages) }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
