// Scenario C — opening balance, customer payment, advance, settlement and expense; cash effects,
// no double counting of advances, reconciliation and reports.
import { expect, test, type Page } from "@playwright/test";
import { addDays, cents, localDate, login, mondayOf, unique } from "./fixtures";

async function cashBalance(page: Page): Promise<number> {
  await page.goto("/cash");
  return cents(await page.locator("a.card", { hasText: "Caisse atelier" }).locator("div.text-2xl").innerText());
}

async function expensesTotal(page: Page, period: string): Promise<number> {
  await page.goto(`/reports/expenses-by-category?${period}`);
  const foot = page.locator("tfoot td").last();
  return (await foot.count()) ? cents(await foot.innerText()) : 0;
}

test("cash effects of every movement type and reconciliation", async ({ page }) => {
  await login(page);
  const today = localDate();
  const period = `period=custom&from=${addDays(today, -30)}&to=${today}`;
  const start = await cashBalance(page);
  const expensesBefore = await expensesTotal(page, period);

  // Opening balance 5 000 DH (owner only).
  await page.goto("/cash");
  await page.getByRole("button", { name: "Solde d'ouverture" }).click();
  let dialog = page.getByRole("dialog", { name: "Solde d'ouverture" });
  await dialog.getByLabel(/^Montant/).fill("5000");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog.getByText("Mouvement enregistré.")).toBeVisible();
  expect(await cashBalance(page)).toBe(start + 500000);

  // Customer payment of 1 000 DH (deposit on a new order).
  const customer = unique("Client C");
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "+ Nouveau client" }).click();
  await page.getByLabel(/^Nom du client/).fill(customer);
  await page.getByLabel(/^Description/).first().fill("Plateau cuivre");
  await page.getByLabel(/^Prix unitaire/).first().fill("3000");
  await page.getByLabel(/^Acompte reçu/).fill("1000");
  await page.getByRole("button", { name: "Créer la commande" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/);
  expect(await cashBalance(page)).toBe(start + 600000);

  // Worker with 800 DH/week; 300 DH wage advance and 500 DH settlement for last week.
  const worker = unique("Ouvrier C");
  await page.goto("/workers/new");
  await page.getByLabel(/^Nom complet/).fill(worker);
  await page.getByLabel(/^Montant par semaine/).fill("800");
  await page.getByRole("button", { name: "Créer l'ouvrier" }).click();
  await page.waitForURL(/\/workers\/[0-9a-f-]{36}/);
  const workerId = page.url().split("/workers/")[1]!.split("?")[0]!;
  const week = mondayOf(addDays(today, -7));
  await page.goto(`/advances/new?worker=${workerId}`);
  await page.getByLabel(/^Montant/).fill("300");
  await page.getByLabel(/^Date et heure/).fill(`${week}T10:00`);
  await page.getByRole("button", { name: "Enregistrer le msrouf" }).click();
  await expect(page.getByText("enregistrée sur la semaine", { exact: false })).toBeVisible();
  expect(await cashBalance(page)).toBe(start + 570000);

  await page.goto(`/payroll/${workerId}?week=${week}`);
  await page.getByLabel(/^Montant payé/).fill("500");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Semaine entièrement réglée.")).toBeVisible();
  expect(await cashBalance(page)).toBe(start + 520000);

  // Expense of 450 DH.
  await page.goto("/expenses/new");
  await page.getByLabel(/^Montant/).fill("450");
  await page.getByLabel(/^Catégorie/).selectOption("leather_soles");
  await page.getByLabel(/^Description/).fill("Cuir");
  await page.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(page.getByText("Dépense enregistrée.")).toBeVisible();
  expect(await cashBalance(page)).toBe(start + 475000);

  // The advance and the settlement are NOT expenses: only the 450 DH is added.
  expect(await expensesTotal(page, period)).toBe(expensesBefore + 45000);

  // Worker balance is zero: 800 − 300 advance − 500 payment.
  await page.goto(`/workers/${workerId}`);
  expect(cents(await page.locator("div.bg-sunken div.text-2xl").innerText())).toBe(0);

  // Reconciliation: counted 50 DH less than calculated → explicit adjustment.
  const calculated = await cashBalance(page);
  await page.getByRole("button", { name: "Compter la caisse" }).click();
  dialog = page.getByRole("dialog", { name: "Compter la caisse" });
  await dialog.getByLabel(/^Montant compté/).fill(String((calculated - 5000) / 100).replace(".", ","));
  await dialog.getByLabel(/^Note/).fill("Écart de fin de journée");
  await dialog.getByLabel("Enregistrer l'écart comme ajustement").check();
  await dialog.getByRole("button", { name: "Enregistrer le comptage" }).click();
  await expect(dialog.getByText("Comptage et ajustement enregistrés.")).toBeVisible();
  expect(await cashBalance(page)).toBe(calculated - 5000);
  await expect(page.locator("tbody tr").first()).toContainText("-50,00");

  // Cash-flow report: closing balance equals the calculated balance.
  await page.goto(`/reports/cash-flow?${period}`);
  const closing = page.locator("tbody tr", { hasText: "Caisse atelier" }).locator("td").last();
  expect(cents(await closing.innerText())).toBe(calculated - 5000);

  // CSV export works with French formatting.
  const res = await page.request.get(`/api/export/cash-flow?${period}`);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Caisse atelier;");
});
