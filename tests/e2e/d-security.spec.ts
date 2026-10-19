// Scenario D — server-side authorization, protected endpoints, no secrets in the client.
import { expect, test } from "@playwright/test";
import { BASE, MANAGER, OWNER, login } from "./fixtures";

test("signed-out visitors are refused everywhere", async ({ page, request }) => {
  await page.goto("/workers");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/export/cash-flow")).status()).toBe(401);
  expect((await request.get("/api/attachments/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
});

test("session cookie is httpOnly and login is throttled", async ({ page, browser }) => {
  await login(page, OWNER);
  const cookie = (await page.context().cookies()).find((c) => c.name === "atelier_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");

  const ctx = await browser.newContext({ baseURL: BASE });
  const p = await ctx.newPage();
  for (let i = 0; i < 5; i++) {
    await p.goto("/login");
    await p.locator('input[name="email"]').fill("nobody@e2e.test");
    await p.locator('input[name="password"]').fill(`wrong-password-${i}`);
    await p.locator('button[type="submit"]').click();
    await expect(p.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  }
  await p.locator('input[name="password"]').fill("another-wrong-one");
  await p.locator('button[type="submit"]').click();
  await expect(p.getByText("Trop de tentatives", { exact: false })).toBeVisible();
  await ctx.close();
});

test("a manager cannot reach owner-only pages or perform owner-only actions", async ({ page, browser }) => {
  // Owner records an expense and opens its reversal dialog.
  await login(page, OWNER);
  await page.goto("/expenses/new");
  await page.getByLabel(/^Montant/).fill("12");
  await page.getByLabel(/^Catégorie/).selectOption("other");
  await page.getByLabel(/^Description/).fill("Test sécurité");
  await page.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(page.getByText("Dépense enregistrée.")).toBeVisible();
  await page.goto("/cash/ledger?q=Test%20s%C3%A9curit%C3%A9");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await page.waitForURL(/\/cash\/ledger\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Annuler ce mouvement" }).click();

  // Manager session in a separate browser.
  const mctx = await browser.newContext({ baseURL: BASE });
  const m = await mctx.newPage();
  await login(m, MANAGER);
  await m.goto("/settings/audit");
  await expect(m).toHaveURL(/\/\?denied=1$/);
  await expect(m.getByText("Vous n'avez pas l'autorisation pour cette action.")).toBeVisible();
  await m.goto("/cash");
  await expect(m.getByRole("button", { name: "Virement entre comptes" })).toHaveCount(0);
  await expect(m.getByRole("button", { name: "Solde d'ouverture" })).toHaveCount(0);
  const managerCookie = (await mctx.cookies()).find((c) => c.name === "atelier_session")!;

  // The owner's already-open form is submitted with the manager's session: the server refuses it.
  await page.context().addCookies([{ ...managerCookie }]);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Motif/).fill("tentative");
  await dialog.getByRole("button", { name: "Annuler ce mouvement" }).click();
  await expect(dialog.getByText("Vous n'avez pas l'autorisation pour cette action.")).toBeVisible();
  await mctx.close();

  // Still not reversed.
  await page.reload();
  await expect(page.getByText("Ce mouvement a été annulé par")).toHaveCount(0);
});

test("no database credentials or secrets reach the browser", async ({ page }) => {
  await login(page, OWNER);
  const bodies: string[] = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] ?? "";
    if (/javascript|html|json|x-component/.test(ct)) bodies.push(await r.text().catch(() => ""));
  });
  for (const path of ["/", "/workers", "/payroll", "/orders", "/cash", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  const all = bodies.join("\n");
  expect(all.length).toBeGreaterThan(1000);
  for (const secret of ["postgres://", "DATABASE_URL", "devpassword", "password_hash", "scrypt$"]) {
    expect(all, `found ${secret}`).not.toContain(secret);
  }
});
