import { expect, type Page } from "@playwright/test";

export const OWNER = { email: "owner@e2e.test", name: "Patron E2E", role: "owner", password: "e2e-owner-password" } as const;
export const MANAGER = { email: "manager@e2e.test", name: "Gérant E2E", role: "manager", password: "e2e-manager-password" } as const;

export const BASE = `http://localhost:${process.env.E2E_PORT ?? 3200}`;

export async function setLocale(page: Page, locale: string) {
  await page.context().addCookies([{ name: "atelier_locale", value: locale, url: BASE }]);
}

export async function login(page: Page, user: { email: string; password: string } = OWNER, locale = "fr") {
  await setLocale(page, locale);
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}

/** "1 250,50 DH" (with non-breaking spaces, optional sign) -> centimes */
export function cents(text: string): number {
  const t = text.replace(/[\s  ]|DH/g, "");
  const neg = t.startsWith("-");
  const [i, f = "0"] = t.replace(/^[-+]/, "").split(",");
  const v = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return neg ? -v : v;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local date in Africa/Casablanca, shifted by `days`. */
export function localDate(days = 0): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Monday (default week start) of the week containing `date`. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
