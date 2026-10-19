# Deployment, backup and rollback

The app needs **Node.js ≥ 22** and **PostgreSQL ≥ 15** (Supabase works). It is a standard Next.js server
(`npm run build && npm start`), so it runs on Vercel, a VPS, or any Node host.

## Environment variables

| Name | Used by | Value |
|---|---|---|
| `DATABASE_URL` | running app | Connection as the restricted role `atelier_app`. |
| `DATABASE_SSL` | running app | `true` for Supabase / managed databases. |
| `DATABASE_PREPARE` | running app | `false` behind a transaction pooler (Supabase port 6543). |
| `DATABASE_POOL_MAX` | running app | Optional, default 5 (use 1–2 on serverless). |
| `MIGRATION_DATABASE_URL` | scripts / CI only | Schema-owner connection (e.g. `postgres`). Never set on the app. |
| `APP_DB_PASSWORD` | `db:migrate` | Optional: sets the `atelier_app` login password. |

## First deployment with Supabase + Vercel

1. **Supabase**: create a project (region close to Morocco, e.g. EU). Copy the *direct* connection string of the
   `postgres` user (Project Settings → Database).
2. **Migrate** from a trusted machine:
   ```bash
   MIGRATION_DATABASE_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslmode=require' \
   APP_DB_PASSWORD='<long random password>' npm run db:migrate
   ```
   This creates schema `atelier`, role `atelier_app` (login), RLS policies and grants.
3. **Create the owner**:
   ```bash
   MIGRATION_DATABASE_URL='…' OWNER_EMAIL='owner@example.com' OWNER_NAME='Nom' npm run db:create-owner
   ```
   (the password is asked interactively).
4. **Vercel**: import the GitHub repository, framework Next.js, Node 22. Environment variables (Production):
   - `DATABASE_URL=postgresql://atelier_app.<ref>:<app pw>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   - `DATABASE_SSL=true`, `DATABASE_PREPARE=false`, `DATABASE_POOL_MAX=1`
   Supabase's pooler accepts custom roles using the `role.projectref` user name; if your project does not,
   use the direct connection (port 5432) or Supabase's session pooler instead. **Verify on the first deploy.**
5. Deploy a **Preview** first, sign in, run the smoke checks below, then promote to Production.

## Automatic database updates on Vercel (recommended)

`vercel.json` makes Vercel run `npm run vercel-build` (`scripts/vercel-build.mjs`) on every deploy. Before
building, it applies pending migrations and makes sure the super administrator exists, so **no command has to
be run from a PC**. Set these once in Vercel → Settings → Environment Variables (Production, type *Sensitive*):

| Name | Value |
|---|---|
| `MIGRATION_DATABASE_URL` | owner connection, **direct** address (no `-pooler`), e.g. Neon `neondb_owner` |
| `SUPER_ADMIN_EMAIL` | the super administrator's e-mail |
| `SUPER_ADMIN_PASSWORD` | their first password (10+ characters) |
| `SUPER_ADMIN_NAME` | optional display name |

- The account is created only if it doesn't exist; later deploys keep the password changed in the app.
  To force a reset (forgotten password), set `SUPER_ADMIN_RESET_PASSWORD=true`, redeploy, sign in, then delete
  that variable.
- If a migration fails, the build fails and the previous version stays online.
- Trade-off: Vercel also exposes these variables to the running app (which never reads them). Keep them
  *Sensitive* and limited to Production. You can remove `SUPER_ADMIN_PASSWORD` once the account exists.
- A brand-new database still needs the `atelier_app` password set once (`APP_DB_PASSWORD` with
  `npm run db:migrate`, see below); the Vercel build never changes it.

## Neon instead of Supabase

Neon (https://neon.tech) can be used the same way (used for local setup on Windows, where installing PostgreSQL
was blocked by Smart App Control):

- Run `db:migrate`, `db:create-owner` and `db:seed` with the **direct** address (`neondb_owner`, host without
  `-pooler`).
- Point the app at the **pooled** address (host with `-pooler`) as user `atelier_app`, with `DATABASE_SSL=true`
  and `DATABASE_PREPARE=false`.
- Remove `&channel_binding=require` from addresses copied from the Neon console; the `postgres` driver does not
  support it.
- Verified: the app connects through Neon's pooled address as the custom role `atelier_app`
  (with `DATABASE_PREPARE=false`).
- Pick a region close to the users (e.g. Europe/Frankfurt for Morocco): every page makes several database round
  trips, so a distant region (e.g. US East) makes pages noticeably slower.

## Self-hosted (VPS)

```bash
git clone https://github.com/mehdiaichouch2002/atelier-artisanat && cd atelier-artisanat
npm ci && npm run build
MIGRATION_DATABASE_URL=… APP_DB_PASSWORD=… npm run db:migrate
MIGRATION_DATABASE_URL=… OWNER_EMAIL=… npm run db:create-owner
DATABASE_URL=postgres://atelier_app:…@localhost:5432/atelier NODE_ENV=production npm start   # behind HTTPS (Caddy/Nginx)
```
Serve only over HTTPS (session cookies are `Secure` in production).

## Production smoke test (after every deploy)

1. `/login` loads; wrong password → error; owner login works.
2. Create a test worker, record a 1 DH msrouf, reverse it (Caisse → Journal → mouvement → Annuler).
3. Dashboard, Paie de la semaine, Commandes, Rapports load on a phone.
4. Switch to العربية: layout is right-to-left.
5. Sign in as a manager: Réglages shows only the password form.

## Updating

1. **Back up** (below). 2. `npm run db:migrate` (migrations are forward-only and transactional per file).
3. Deploy the new code. 4. Smoke test.

## Rollback

- **Code**: Vercel → Deployments → previous deployment → *Promote / Instant Rollback* (or redeploy the previous
  git commit; on a VPS `git checkout <tag> && npm ci && npm run build && restart`).
- **Database**: migrations are additive; older code keeps working with a newer schema unless a release note says
  otherwise. If a migration must be undone, restore the backup taken just before it (below).

## Backup and restore

Supabase takes daily backups (plan dependent); also keep your own:

```bash
# Backup (custom format, compressed). Store it off-site and encrypted; it contains personal and financial data.
pg_dump "$MIGRATION_DATABASE_URL" --schema=atelier --format=custom --no-owner --file=atelier-$(date +%F).dump

# Restore into an EMPTY database (test this regularly on a scratch database first)
MIGRATION_DATABASE_URL=<target> APP_DB_PASSWORD=<pw> npm run db:migrate   # creates the role if missing
psql "<target>" -c "drop schema atelier cascade"
pg_restore --dbname="<target>" --no-owner --exit-on-error atelier-YYYY-MM-DD.dump
psql "<target>" -c "insert into public.atelier_migrations(name) values ('0001_schema.sql'),('0002_views_security.sql') on conflict do nothing"
# then re-run: npm run db:migrate  (re-applies grants for atelier_app if needed)
```
A CSV export of every report is also available in the app (Rapports → Exporter CSV) for quick archiving.

## Pre-push checklist (used for this repository)

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
git diff --cached --stat                     # review what is pushed
git ls-files | grep -E '(^|/)\.env' | grep -v .env.example    # must print nothing
git grep -nE 'postgres(ql)?://[^:@/ ]+:[^@ ]+@' -- ':!*.md' ':!.env.example' ':!.github/workflows/ci.yml' ':!tests/' ':!playwright.config.ts'
```
Only throwaway local/CI test passwords appear in tests and the CI workflow (they configure ephemeral containers).
