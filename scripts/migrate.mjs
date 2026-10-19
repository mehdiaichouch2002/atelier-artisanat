// Applies db/migrations/*.sql in order, once each, inside a transaction per file.
// Uses MIGRATION_DATABASE_URL (a role that owns the schema, e.g. `postgres`).
// Optionally sets the runtime role password from APP_DB_PASSWORD.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is required");
  process.exit(1);
}
const dir = path.resolve(import.meta.dirname, "../db/migrations");
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists public.atelier_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from public.atelier_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.atelier_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  if (process.env.APP_DB_PASSWORD) {
    // Identifiers cannot be bound; the role name is fixed and the password is escaped as a literal.
    const pw = process.env.APP_DB_PASSWORD.replaceAll("'", "''");
    await sql.unsafe(`alter role atelier_app with login password '${pw}'`);
    console.log("atelier_app login enabled");
  }
  console.log("migrations up to date");
} catch (err) {
  console.error("migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
