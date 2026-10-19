// Creates (or resets the password of) an owner account.
//   MIGRATION_DATABASE_URL=... OWNER_EMAIL=... OWNER_NAME=... npm run db:create-owner
// The password is read from OWNER_PASSWORD or asked interactively (not echoed).
// Add `-- --super-admin` to make this account the single super administrator (the only one who can add,
// edit or deactivate users); any previous super administrator loses the flag.
import readline from "node:readline";
import postgres from "postgres";
import { hashPassword } from "./lib.mjs";

const url = process.env.MIGRATION_DATABASE_URL;
const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
const name = (process.env.OWNER_NAME ?? "").trim() || email;
if (!url || !email) {
  console.error("MIGRATION_DATABASE_URL and OWNER_EMAIL are required");
  process.exit(1);
}

async function askHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "*");
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = process.env.OWNER_PASSWORD ?? (await askHidden("Password (min. 10 characters): "));
if (password.length < 10) {
  console.error("Password must be at least 10 characters");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const hash = await hashPassword(password);
  const [u] = await sql`
    insert into atelier.users (email, display_name, role, password_hash)
    values (${email}, ${name}, 'owner', ${hash})
    on conflict (email) do update set password_hash = excluded.password_hash, role = 'owner', active = true
    returning id`;
  await sql`delete from atelier.sessions where user_id = ${u.id}`;
  // An owner recovery also lifts every login lock (per e-mail and per connection) from failed attempts.
  await sql`delete from atelier.login_attempts where not success`;
  if (process.argv.includes("--super-admin")) {
    await sql.begin(async (tx) => {
      await tx`update atelier.users set is_super_admin = false where is_super_admin and id <> ${u.id}`;
      await tx`update atelier.users set is_super_admin = true where id = ${u.id}`;
    });
    console.log(`super administrator: ${email}`);
  }
  console.log(`owner ready: ${email}`);
} catch (e) {
  console.error("failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
