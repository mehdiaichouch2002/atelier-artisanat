import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
export const E2E_DB = process.env.E2E_DATABASE_NAME ?? "atelier_e2e";
const PG_HOST = process.env.E2E_PG_HOST ?? "localhost:5432";
const APP_PASSWORD = process.env.TEST_APP_DB_PASSWORD ?? "devpassword";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Requires `npm run build` first. Uses a dedicated test database.
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: `postgres://atelier_app:${APP_PASSWORD}@${PG_HOST}/${E2E_DB}`,
      DATABASE_SSL: "false",
    },
  },
});
