import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { TEST_ADMIN_URL } from "./env";

/** Recreates the test schema from the migrations before the integration suite. */
export default async function setup() {
  const sql = postgres(TEST_ADMIN_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists atelier cascade; drop table if exists public.atelier_migrations;");
  await sql.end();
  execFileSync("node", ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: TEST_ADMIN_URL, APP_DB_PASSWORD: process.env.TEST_APP_DB_PASSWORD ?? "devpassword" },
    stdio: "inherit",
  });
}
