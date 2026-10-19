// Scenario E — phone, tablet and desktop layouts; Arabic RTL; key journeys in English and Spanish.
import { expect, test } from "@playwright/test";
import { login, setLocale, unique } from "./fixtures";

const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];
const PAGES = ["/", "/workers", "/payroll", "/advances/new", "/orders", "/orders/new", "/orders/board", "/customers", "/expenses", "/cash", "/cash/ledger", "/reports", "/reports/weekly-settlement", "/settings"];

for (const size of SIZES) {
  test(`${size.name}: pages fit the screen and navigation works`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
    if (size.width < 768) {
      // Bottom bar + quick actions sheet.
      await page.goto("/");
      const bottom = page.getByRole("navigation", { name: "Navigation rapide" });
      await expect(bottom).toBeVisible();
      await page.getByRole("button", { name: "Saisie rapide" }).click();
      await page.getByRole("dialog", { name: "Saisie rapide" }).getByRole("link", { name: "Nouvelle avance / Msrouf" }).click();
      await expect(page).toHaveURL(/\/advances\/new$/);
      await bottom.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Clients" }).click();
      await expect(page).toHaveURL(/\/customers$/);
    } else {
      await expect(page.getByRole("navigation", { name: "Navigation principale" }).first()).toBeVisible();
    }
  });
}

test("Arabic uses a right-to-left layout with Latin digits and DH amounts", async ({ page }) => {
  await login(page, undefined, "ar");
  await page.goto("/payroll");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-MA");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("خلاص السيمانة");
  // Sidebar sits on the right in RTL.
  const box = await page.locator("aside").boundingBox();
  expect(box!.x).toBeGreaterThan(600);
  // Money keeps Latin digits and the DH suffix, isolated left-to-right.
  const money = page.locator("bdi.num").first();
  await expect(money).toHaveText(/^-?[0-9 ]+,[0-9]{2} DH$/);
  await expect(money).toHaveAttribute("dir", "ltr");
  // Phone layout in RTL fits the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

for (const lang of [
  { code: "en", newWorker: "New worker", name: "Full name", weekly: "Amount per week", create: "Create worker", saved: "Worker saved.", amount: "Amount", save: "Save msrouf", savedAdv: "recorded for the week of" },
  { code: "es", newWorker: "Nuevo trabajador", name: "Nombre completo", weekly: "Importe por semana", create: "Crear trabajador", saved: "Trabajador guardado.", amount: "Importe", save: "Guardar el msrouf", savedAdv: "registrado en la semana del" },
]) {
  test(`key journey in ${lang.code}: create a worker and record a msrouf`, async ({ page }) => {
    await login(page, undefined, lang.code);
    await expect(page.locator("html")).toHaveAttribute("lang", lang.code);
    await page.goto("/workers/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(lang.newWorker);
    await page.getByLabel(new RegExp(`^${lang.name}`)).fill(unique(`Worker ${lang.code}`));
    await page.getByLabel(new RegExp(`^${lang.weekly}`)).fill("1000");
    await page.getByRole("button", { name: lang.create }).click();
    await page.waitForURL(/\/workers\/[0-9a-f-]{36}/);
    await expect(page.getByText(lang.saved)).toBeVisible();
    const id = page.url().split("/workers/")[1]!.split("?")[0]!;
    await page.goto(`/advances/new?worker=${id}`);
    await page.getByLabel(new RegExp(`^${lang.amount}`)).first().fill("75");
    await page.getByRole("button", { name: lang.save }).click();
    await expect(page.getByText(lang.savedAdv, { exact: false })).toBeVisible();
  });
}

test("language switcher changes the interface", async ({ page }) => {
  await login(page);
  await setLocale(page, "fr");
  await page.goto("/");
  await page.getByTestId("locale-switcher").first().selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("link", { name: "Trabajadores" }).first()).toBeVisible();
});

test("password fields can be shown and hidden; login focuses the e-mail field", async ({ page }) => {
  await setLocale(page, "fr");
  await page.goto("/login");
  await expect(page.locator('input[name="email"]')).toBeFocused();
  const pw = page.locator('input[name="password"]');
  await pw.fill("secret-value");
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(pw).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Masquer le mot de passe" }).click();
  await expect(pw).toHaveAttribute("type", "password");
  // The Caps Lock warning cannot be exercised here: headless Chromium does not report Caps Lock state.
});
