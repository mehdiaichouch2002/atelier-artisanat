// Scenario A — worker, msrouf on Monday and later in the week, partial then final settlement.
import { expect, test } from "@playwright/test";
import { moreOptions, addDays, cents, fmtDate, localDate, login, mondayOf, unique } from "./fixtures";

test("worker weekly settlement with advances and partial payments", async ({ page }) => {
  await login(page);
  const name = unique("Ouvrier A");

  // Create a worker paid 1 500 DH per week.
  await page.goto("/workers/new");
  await page.getByLabel(/^Nom complet/).fill(name);
  await page.getByLabel(/^Mode de rémunération/).selectOption("weekly");
  await page.getByLabel(/^Montant par semaine/).fill("1500");
  await page.getByRole("button", { name: "Créer l'ouvrier" }).click();
  await page.waitForURL(/\/workers\/[0-9a-f-]{36}/);
  await expect(page.getByText("Ouvrier enregistré.")).toBeVisible();
  const workerId = page.url().split("/workers/")[1]!.split("?")[0]!;

  // Previous week: Monday and Thursday advances (so dates are never in the future).
  const week = mondayOf(addDays(localDate(), -7));
  for (const [date, amount] of [
    [week, "200"],
    [addDays(week, 3), "150"],
  ] as const) {
    await page.goto(`/advances/new?worker=${workerId}`);
    await page.getByLabel(/^Montant/).fill(amount);
    await moreOptions(page);
    await page.getByLabel(/^Date et heure/).fill(`${date}T09:30`);
    await page.getByRole("button", { name: "Enregistrer le msrouf" }).click();
    await expect(page.getByText(`semaine du ${fmtDate(week)}`)).toBeVisible();
  }

  // Settlement screen for that week: 1 500 − 350 = 1 150 remaining.
  await page.goto(`/payroll/${workerId}?week=${week}`);
  const remaining = () => page.locator("dl div", { hasText: "Reste à payer" }).last().locator("dd");
  await expect(remaining()).toContainText("1 150,00");

  // Partial payment of 500.
  await page.getByLabel(/^Montant payé/).fill("500");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Paiement enregistré.").first()).toBeVisible();
  await page.reload();
  await expect(remaining()).toContainText("650,00");
  await expect(page.getByText("Partiellement réglé").first()).toBeVisible();

  // Overpaying is refused by the server.
  await page.getByLabel(/^Montant payé/).fill("651");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Le montant dépasse ce qui reste à payer.")).toBeVisible();

  // Final payment.
  await page.getByLabel(/^Montant payé/).fill("650");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Semaine entièrement réglée.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Semaine entièrement réglée.")).toBeVisible();
  // The receipt of the last payment is printable.
  const receiptHref = await page.getByRole("link", { name: "Reçu", exact: true }).first().getAttribute("href");
  await page.goto(receiptHref!);
  await expect(page.getByRole("heading", { name: "Reçu de paiement ouvrier" })).toBeVisible();
  await expect(page.getByText("ce reçu n'est pas un bulletin de paie", { exact: false })).toBeVisible();
  await page.goto(`/payroll/${workerId}?week=${week}`);
  expect(cents(await remaining().innerText())).toBe(0);

  // History: exactly two advances and two payments, one pay line, nothing duplicated.
  await page.goto(`/cash/ledger?worker=${workerId}`);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(page.locator("tbody tr", { hasText: "Msrouf / avance" })).toHaveCount(2);
  await expect(page.locator("tbody tr", { hasText: "Paiement ouvrier" })).toHaveCount(2);
  await page.goto(`/payroll/${workerId}?week=${week}`);
  await expect(page.locator("tbody tr", { hasText: "Paie fixe de la semaine" })).toHaveCount(1);

  // Worker profile: week settled, nothing owed.
  await page.goto(`/workers/${workerId}`);
  await expect(page.locator("tbody tr", { hasText: fmtDate(week) }).getByText("Réglé")).toBeVisible();
});
