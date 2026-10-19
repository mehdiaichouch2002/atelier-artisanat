// Scenario B — customer order: deposit, status changes, second payment, delivery, balances and reports.
import { expect, test } from "@playwright/test";
import { addDays, cents, fmtDate, localDate, login, unique } from "./fixtures";

test("customer order from quote to delivery with deposit and final payment", async ({ page }) => {
  await login(page);
  const customer = unique("Client B");

  await page.goto("/customers/new");
  await page.getByLabel(/^Nom du client/).fill(customer);
  await page.getByLabel(/^Téléphone/).fill("0611223344");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}/);
  const customerId = page.url().split("/customers/")[1]!.split("?")[0]!;

  // Duplicate warning on the same phone number.
  await page.goto("/customers/new");
  await page.getByLabel(/^Nom du client/).fill("Autre nom");
  await page.getByLabel(/^Téléphone/).fill("+212 6 11 22 33 44");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText("Un client semblable existe déjà", { exact: false })).toBeVisible();

  // Order: 10 × 250 + 2 × 1 200 = 4 900 DH, delivery in 10 days, deposit 1 500 DH.
  const due = addDays(localDate(), 10);
  await page.goto(`/orders/new?customer=${customerId}`);
  await page.getByLabel(/^Livraison prévue/).fill(due);
  await page.getByLabel(/^Description/).first().fill("Babouches cuir rouge");
  await page.getByLabel(/^Quantité/).first().fill("10");
  await page.getByLabel(/^Prix unitaire/).first().fill("250");
  await page.getByRole("button", { name: "Ajouter un article" }).click();
  await page.getByLabel(/^Description/).nth(1).fill("Théière en cuivre");
  await page.getByLabel(/^Quantité/).nth(1).fill("2");
  await page.getByLabel(/^Prix unitaire/).nth(1).fill("1200");
  await expect(page.getByText("Total convenu:", { exact: false })).toContainText("4 900,00");
  await page.getByLabel(/^Acompte reçu/).fill("1500");
  await page.getByRole("button", { name: "Créer la commande" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/);
  const orderUrl = page.url().split("?")[0]!;

  const balance = page.locator("dl div", { hasText: /^Reste à payer/ }).locator("dd");
  await expect(balance).toContainText("3 400,00");
  await expect(page.getByText("Acompte versé")).toBeVisible(); // a deposit is not "paid"
  await expect(page.getByText(fmtDate(due)).first()).toBeVisible();

  // Production steps.
  for (const status of ["En production", "En finition", "Prête"]) {
    await page.getByRole("button", { name: status, exact: true }).click();
    await expect(page.locator("h1").getByText(status)).toBeVisible();
  }

  // Second payment through the dialog: overpayment refused, then exact balance accepted.
  await page.getByRole("button", { name: "Encaisser un paiement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Montant reçu/).fill("3500");
  await dialog.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(dialog.getByText("Le montant dépasse ce qui reste à payer.")).toBeVisible();
  await dialog.getByLabel(/^Montant reçu/).fill("3400");
  await dialog.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(dialog.getByText("Paiement client enregistré.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Fermer" }).click();

  await page.goto(orderUrl);
  expect(cents(await balance.innerText())).toBe(0);
  await page.getByRole("button", { name: "Livrée", exact: true }).click();
  await expect(page.locator("h1").getByText("Livrée")).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(5); // status history: confirmed → … → delivered

  // Customer balance is zero, payments listed.
  await page.goto(`/customers/${customerId}`);
  await expect(page.locator("dl div", { hasText: "Payé" }).first()).toContainText("4 900,00");
  expect(cents(await page.locator("dl div.rounded-lg", { hasText: "Reste à payer" }).locator("dd").innerText())).toBe(0);

  // Reports and dashboard reflect the payments.
  await page.goto("/reports/customer-payments?period=today");
  await expect(page.locator("tbody tr", { hasText: customer })).toHaveCount(2);
  await page.goto("/?period=today");
  expect(cents(await page.locator("dl div", { hasText: "Paiements reçus" }).locator("dd").innerText())).toBeGreaterThanOrEqual(490000);
});
