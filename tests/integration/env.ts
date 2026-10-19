// Test database configuration. Never point these at production.
export const TEST_ADMIN_URL =
  process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/atelier_test";
export const TEST_APP_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://atelier_app:devpassword@localhost:5432/atelier_test";

if (!/test/i.test(new URL(TEST_ADMIN_URL).pathname) || !/test/i.test(new URL(TEST_APP_URL).pathname)) {
  throw new Error("Refusing to run integration tests: database name must contain 'test'");
}
