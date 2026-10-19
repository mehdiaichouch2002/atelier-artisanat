# Security

## Authentication

- E-mail + password. Passwords hashed with **scrypt** (N = 2¹⁵, r = 8, p = 1, 16-byte salt, 64-byte key),
  compared in constant time; minimum length 10. Unknown e-mails still run a hash comparison (no timing oracle).
- Sessions: 32 random bytes in an **httpOnly, SameSite=Lax, Secure (production)** cookie; only the SHA-256 hash
  is stored in `atelier.sessions`. Sliding expiry of 14 days. Changing a password revokes the user's other
  sessions; deactivating a user deletes all their sessions.
- **Throttling**: 5 failed logins per e-mail or 30 per IP in 15 minutes → refused (also on password change).
  The IP is taken from `x-forwarded-for` (set by the hosting proxy); per-e-mail throttling does not depend on it.
- There is no public sign-up. The first owner is created with `npm run db:create-owner`.

## Authorization (server and database)

| Role | Can |
|---|---|
| Owner | Everything. |
| Manager / accountant | Workers, msrouf, weekly pay and settlement payments, customers, orders, customer payments, expenses, other income, cash counts (without adjustment), reports and CSV. |
| Owner only | Opening balances, transfers, cash adjustments, refunds, reversals, voiding pay lines, accounts, categories, settings, audit log. |
| Super administrator (one owner account, flag `users.is_super_admin`) | Additionally: create, edit and deactivate users, reset other users' passwords. Set with `npm run db:create-owner -- --super-admin`; at most one; must stay an active owner (database constraints). |
| Worker | No account. |

Enforced three times: hidden in the UI, checked by `authorize(permission)` in every server action / route
handler (`src/lib/auth/permissions.ts`), and enforced by **PostgreSQL Row Level Security** on every table:
the app connects as the non-owner role `atelier_app`; each transaction sets `app.user_id`; policies call
`atelier.current_user_role()` (inactive users have no role). Without a valid member context, every query
returns nothing and every write fails. `password_hash` is not even selectable by the app role (column grants);
sessions and login attempts are reachable only through `SECURITY DEFINER` functions. There is no `DELETE`
privilege on financial tables. `created_by` is forced from the session (cannot be spoofed). Tables live in the
`atelier` schema, which Supabase's REST API does not expose.

Tested in `tests/integration/security.test.ts` (RLS, grants, throttling, sessions) and
`tests/e2e/d-security.spec.ts` (a manager's session submitting an owner-only form is refused by the server).

## Web protections

- **CSRF**: Server Actions only accept same-origin POSTs (Next.js origin check); cookies are SameSite=Lax.
- **XSS**: React escapes output; no `dangerouslySetInnerHTML`. Attachments are served with their sniffed type,
  `X-Content-Type-Options: nosniff`, a sandboxing `Content-Security-Policy` and `Cache-Control: private, no-store`.
- **SQL injection**: all queries use parameterised tagged templates; identifiers are never built from input.
- **IDOR**: every record access goes through RLS as the signed-in user; ids are random UUIDs.
- **Uploads**: ≤ 5 MB, only JPEG/PNG/WebP/PDF detected from the file's bytes (not the browser's claim), stored
  privately in the database, filenames sanitised.
- **CSV injection**: cells starting with `= + - @` are prefixed with `'` (except plain numbers).
- **Headers**: `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, no `X-Powered-By`.
- **Validation**: Zod on the server for every input; database CHECK constraints as the last line.
- **Errors**: users see translated, generic messages; internal errors are logged without personal data.

## Secrets

- Only in environment variables / the host's secret manager. `.env*` files are git-ignored; `.env.example`
  contains placeholders only. No secret is referenced from client code (verified by an E2E test that scans the
  HTML/JS/RSC payloads for connection strings and hashes).
- Two database credentials: `MIGRATION_DATABASE_URL` (schema owner, used only by scripts/CI) and `DATABASE_URL`
  (restricted `atelier_app`, used by the running app). Never give the app the owner credentials.
- Before each push: `git diff` review and a secret scan (see `docs/deployment.md`).

## Privacy

Minimal personal data: workers (name, optional phone/code, notes — no national ID), customers (name, optional
phone/email/address). WhatsApp links only open a chat; nothing is sent automatically. Demo data is fictional and
only loaded by an explicit dev command that refuses production.

## Backups

See `docs/deployment.md` → *Backup and restore*. Test a restore at least once.

## Known limitations / residual risks

- No multi-factor authentication. Use strong, unique passwords.
- Login throttling is per e-mail and per IP inside the database; a distributed attack is slowed, not blocked.
  Put the app behind the hosting provider's DDoS/rate-limit protection.
- Attachments in the database increase backup size; keep files small.
- OWASP Top 10 reviewed (access control, crypto, injection, insecure design, misconfiguration, components,
  auth failures, integrity, logging, SSRF — no server-side fetches of user URLs). `npm audit` reports no
  known vulnerabilities in production dependencies at the time of writing.
