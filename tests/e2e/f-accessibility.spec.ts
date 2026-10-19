// Automated WCAG 2.x A/AA checks (axe-core) on the main screens, in French and in Arabic (RTL).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

const PAGES = ["/login", "/", "/workers", "/workers/new", "/payroll", "/advances/new", "/orders", "/orders/new", "/customers", "/expenses/new", "/cash", "/reports", "/settings"];

for (const locale of ["fr", "ar"]) {
  test(`no serious accessibility violations (${locale})`, async ({ page }) => {
    await login(page, undefined, locale);
    const problems: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
        problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
      }
    }
    expect(problems).toEqual([]);
  });
}
