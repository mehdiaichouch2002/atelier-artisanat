// Build used by Vercel (see vercel.json). Before building the app it:
//   1. applies pending database migrations   (if MIGRATION_DATABASE_URL is set)
//   2. runs the one-time production clean-up        (if PRODUCTION_RESET_TOKEN is set and new)
//   3. makes sure the super administrator exists (if SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are set)
// so a deploy never needs commands on a PC. If a migration fails, the build fails and the previous
// version stays online.
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { hashPassword } from "./lib.mjs";
import { eraseBusinessData } from "./reset-lib.mjs";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", env: process.env, ...opts });
const url = process.env.MIGRATION_DATABASE_URL;

if (url) {
  // Never let a stray APP_DB_PASSWORD change the app role's password during a deploy.
  run("node", ["scripts/migrate.mjs"], { env: { ...process.env, APP_DB_PASSWORD: "" } });
} else {
  console.log("MIGRATION_DATABASE_URL not set: skipping database migrations.");
}

// One-time production clean-up: set PRODUCTION_RESET_TOKEN to any new value (e.g. a date) and redeploy.
// Erases all business data and the demo accounts. The token is recorded, so the same value never runs twice.
const resetToken = (process.env.PRODUCTION_RESET_TOKEN ?? "").trim();
if (url && resetToken) {
  if (resetToken.length < 6) {
    console.error("PRODUCTION_RESET_TOKEN must have at least 6 characters.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      const [done] = await tx`select ran_at from atelier.maintenance_runs where token = ${resetToken}`;
      if (done) {
        console.log(`production clean-up "${resetToken}" already done on ${done.ran_at.toISOString()}: skipped.`);
        return;
      }
      await eraseBusinessData(tx, { removeDemoUsers: true });
      await tx`insert into atelier.maintenance_runs (token, action) values (${resetToken}, 'production-reset')`;
      console.log(`production clean-up "${resetToken}" done: business data and demo accounts erased.`);
    });
  } finally {
    await sql.end();
  }
}

const email = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD ?? "";
if (url && email && password) {
  if (password.length < 10) {
    console.error("SUPER_ADMIN_PASSWORD must have at least 10 characters.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [existing] = await sql`select id from atelier.users where email = ${email}`;
    const reset = process.env.SUPER_ADMIN_RESET_PASSWORD === "true";
    await sql.begin(async (tx) => {
      let id = existing?.id;
      if (!id) {
        const name = process.env.SUPER_ADMIN_NAME?.trim() || email;
        [{ id }] = await tx`
          insert into atelier.users (email, display_name, role, password_hash)
          values (${email}, ${name}, 'owner', ${await hashPassword(password)}) returning id`;
        console.log(`super administrator created: ${email}`);
      } else if (reset) {
        await tx`update atelier.users set password_hash = ${await hashPassword(password)} where id = ${id}`;
        await tx`delete from atelier.sessions where user_id = ${id}`;
        console.log(`super administrator password reset: ${email}`);
      }
      // Keep the account usable: active owner, the single super administrator, no login lock.
      await tx`update atelier.users set role = 'owner', active = true where id = ${id}`;
      await tx`update atelier.users set is_super_admin = false where is_super_admin and id <> ${id}`;
      await tx`update atelier.users set is_super_admin = true where id = ${id}`;
      await tx`delete from atelier.login_attempts where email = ${email} and not success`;
    });
    console.log(`super administrator ready: ${email}`);
  } finally {
    await sql.end();
  }
}

run("npx", ["next", "build"]);
