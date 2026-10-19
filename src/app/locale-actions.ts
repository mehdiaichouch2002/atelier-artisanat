"use server";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getSessionUser();
  if (user) {
    // Only the owner may update user rows through RLS; others keep the preference in the cookie.
    await withUser(user.id, (tx) => tx`update atelier.users set locale = ${locale} where id = ${user.id}`).catch(() => {});
  }
  revalidatePath("/", "layout");
}
