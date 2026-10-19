# Architecture

```
Browser ──(HTML, Server Actions, CSRF-checked by Next.js)──▶ Next.js 16 server (Node)
                                                              │  authorize(permission)  ← src/lib/auth
                                                              │  Zod validation          ← src/lib/validation.ts
                                                              │  domain services         ← src/domain/*/service.ts
                                                              ▼
                                         PostgreSQL 16 (role atelier_app, RLS on every table)
                                         set_config('app.user_id', …) per transaction
```

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Pure business rules | `src/domain/*/logic.ts` | Settlement, order balances, ledger effects, status transitions. No I/O, fully unit-tested. |
| Persistence services | `src/domain/*/service.ts` | SQL (via `postgres`) inside a transaction handle `Tx`. Row locks / advisory locks for checks that must not race. Idempotency keys. |
| Database | `db/migrations/*.sql` | Types, constraints, triggers (immutability, status transitions, audit), views computing every balance, RLS policies, grants, auth functions. |
| Server actions | `src/app/(app)/**/actions.ts` | `authorize()` → Zod parse (`runAction`) → `withUser(user.id, tx => service(...))` → `revalidatePath`. Never trust the client. |
| Pages | `src/app/(app)/**/page.tsx` | Server components reading through `pageContext()` (requires sign-in and permission). |
| Client components | `src/components/forms.tsx`, `*-form.tsx` | Forms with `useActionState`, field errors, kept input, double-submit protection, idempotency key. |
| i18n | `src/i18n` | `fr` (default), `ar` (RTL), `en`, `es`. Cookie-based locale, `<html lang dir>` set server-side. |

### Request flow of a sensitive operation (example: settlement payment)

1. Form posts to `recordPaymentAction` with a client-generated `idempotencyKey` (UUID, one per logical operation).
2. `authorize("payroll.record")` resolves the session through `atelier.auth_resolve_session` (security definer).
3. `runAction` validates with Zod; amounts are parsed from text to integer centimes.
4. `withUser` opens a transaction and sets `app.user_id`; RLS now knows who acts.
5. `recordSettlementPayment` returns an existing entry if the key was already used, locks the worker row
   (`SELECT … FOR UPDATE`), records the week's base pay if needed, recomputes the remaining amount from the
   database view and refuses overpayment, then inserts one immutable ledger entry.
6. Database triggers validate the entry (pay week alignment, active worker, canonical direction), stamp the
   creator, and write the audit log. Any failure rolls back the whole transaction.

## Why these choices

- **Server Actions + server components**: little client JavaScript, forms work without JavaScript (progressive
  enhancement), CSRF protection built into Next.js (origin check on actions).
- **Raw SQL + views instead of an ORM**: balances are defined once in SQL views and mirrored by pure TypeScript
  functions; integration tests check both agree. Constraints and triggers are first-class.
- **Own authentication instead of Supabase Auth**: works on any PostgreSQL (local, Supabase, managed), keeps the
  session check inside the same database and RLS model. See `docs/security.md`.
- **Attachments in the database** (bytea, ≤ 4 MB, type sniffed from content): private by default, served only to
  signed-in members, works on serverless hosting without a writable disk. Suitable for a small workshop.
- **React Hook Form not used**: React 19 `useActionState` + Zod covers validation, kept input and pending states
  with less client code.

## Directory map

```
db/migrations/        SQL migrations (applied in order by scripts/migrate.mjs)
scripts/              migrate, create-owner, seed-demo (demo only)
src/app/(app)/        authenticated pages and their server actions
src/app/print/        print layouts (receipts, order summary, weekly report, any report)
src/app/api/          CSV export and attachment download (authorized route handlers)
src/components/       UI kit (buttons, cards, badges, money, tables, forms, dialogs, shell)
src/domain/           logic.ts (pure) + service.ts (SQL) per domain
src/i18n/             locales and translator
src/lib/              money, dates (Africa/Casablanca), db, auth, validation, csv, attachments
tests/unit|integration|e2e
```
