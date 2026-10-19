import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";
import { hashPassword } from "../../scripts/lib.mjs";
import { OWNER, MANAGER } from "./fixtures";

/** Recreates the end-to-end database from scratch and creates the two test accounts. */
export default async function globalSetup() {
  if (!/e2e|test/i.test(E2E_DB)) throw new Error("E2E database name must contain 'e2e' or 'test'");
  const host = process.env.E2E_PG_HOST ?? "localhost:5432";
  const adminCreds = process.env.E2E_PG_ADMIN ?? "postgres:postgres";
  const server = postgres(`postgres://${adminCreds}@${host}/postgres`, { max: 1, onnotice: () => {} });
  await server.unsafe(`drop database if exists ${E2E_DB} with (force)`);
  await server.unsafe(`create database ${E2E_DB}`);
  await server.end();
  const url = `postgres://${adminCreds}@${host}/${E2E_DB}`;
  execFileSync("node", ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: url, APP_DB_PASSWORD: process.env.TEST_APP_DB_PASSWORD ?? "devpassword" },
    stdio: "inherit",
  });
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  for (const u of [OWNER, MANAGER]) {
    await sql`insert into atelier.users (email, display_name, role, password_hash)
              values (${u.email}, ${u.name}, ${u.role}, ${await hashPassword(u.password)})`;
  }
  await sql.end();
}
