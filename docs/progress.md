# Progress

Last updated: 19/10/2026.

## Done (verified)

| Phase | Status |
|---|---|
| 1 Discovery | Empty repository; Node 22 and PostgreSQL 16 available, no Docker (so no local Supabase). Research in `docs/research.md`. |
| 2 Foundation | Next.js 16 + TS strict, design system, i18n (fr/ar/en/es, RTL), auth (scrypt + DB sessions), schema + migrations, RLS and grants. |
| 3 Core | Workers, msrouf, weekly settlement (weekly/daily/piece/negotiated, partial payments, bonuses, carry-forward, voids), customers, orders (lines, statuses, deposits, payments, refunds, cancellation, attachments), expenses, ledger, accounts, transfers, opening balances, cash counts. |
| 4 Reporting & UX | Dashboard with periods, 13 reports, CSV export, print layouts (receipts, order summary, weekly report, any report), search/filters/pagination, empty states, onboarding, mobile bottom bar + quick actions, Kanban board. |
| 5 Verification | All suites green (below). Bugs found by the tests and fixed: tablet overflow (3 causes), dialog closing on a fully-paid order hid the receipt link, duplicate warning shown twice, low-contrast text (axe), label/name mismatch, misleading negative worker balance mid-week (pending msrouf now shown separately). |
| 6 Release prep | Docs, `.env.example`, CI workflow, secret scan, diff review. |
| 7 GitHub | Pushed to `main` of `mehdiaichouch2002/atelier-artisanat`. |

## Test results (latest run, local, PostgreSQL 16.15, Chromium 141)

```
npm run lint        → 0 errors, 0 warnings
npm run typecheck   → 0 errors
npm test            → Test Files 9 passed (9) · Tests 95 passed (95)   (unit 66 incl. i18n, integration 29)
npm run build       → ✓ Compiled successfully, 36 routes
npm run test:e2e    → 16 passed (1.5m)   scenarios A, B, C, D (4), E (7), F accessibility (fr, ar)
npm audit --omit=dev → found 0 vulnerabilities
```
`npm audit` (including dev tooling) reports 5 high-severity advisories in `braces`, pulled in by lint/test
tooling only (not shipped to the server or browser). The fix requires a breaking `--force` upgrade; left as is.

## Simplification pass (owner feedback: "too complicated")

- Home: big action buttons, 4 key numbers, one "À faire" list; detailed period figures folded.
- Navigation: daily work (Accueil, Msrouf, Paie, Commandes, Caisse) separated from management (Ouvriers,
  Clients, Rapports, Réglages); Dépenses moved under Caisse (tabs Comptes / Dépenses / Journal).
- Msrouf: tap a worker, tap or type an amount, choose "à déduire de la paie" or "achat pour l'atelier"; all the
  rest pre-filled under "Plus d'options". Same approach for payments, orders, workers, customers, expenses.
- Weekly pay: one line per worker with the amount still to pay and a Pay button.
- Lists: search box only, filters folded. Cash: rare owner operations folded.
- Products: Cuivre only by default (migration `0003_copper_only.sql`); built-in categories can be switched on/off
  in Réglages; category fields are hidden while only one category is active.
- Data: `npm run db:seed` = 5 copper workers with no money movements; `npm run db:reset` (confirmed by typing
  EFFACER) erases business data; the old rich demo is `npm run db:seed:full`.
- Verified after the change: lint 0, type check 0, 95 unit/integration tests, 16 end-to-end tests (A–F incl.
  axe accessibility in fr/ar) all passing.

## Not done / blockers

- **Deployment: blocked — no hosting or database credentials were provided** (no Vercel/Supabase/VPS access in
  this environment). Everything needed is documented in `docs/deployment.md`. Remaining manual actions:
  1. Create a Supabase project (or any PostgreSQL 15+), run `npm run db:migrate` with its owner connection string
     and an `APP_DB_PASSWORD`.
  2. Run `npm run db:create-owner`.
  3. Create a Vercel project from this repository, set `DATABASE_URL` (role `atelier_app`), `DATABASE_SSL=true`,
     `DATABASE_PREPARE=false`, `DATABASE_POOL_MAX=1`; deploy a preview, run the smoke test, promote.
  4. Verify that the Supabase pooler accepts the custom role (else use the direct/session connection).
- **GitHub Actions does not start**: CI run #1 (and its re-run) on commit `c46944c` failed in 3–4 seconds with
  no runner assigned, no steps executed and no logs. That pattern points to an account-level setting (Actions
  disabled for the repository/account, or a billing / spending-limit problem), not to the code; the same checks
  pass locally. Action needed: GitHub → repository *Settings → Actions → General* (allow actions) and account
  *Settings → Billing and plans* (payment method / spending limit), then re-run the workflow.
- Supabase Auth is not used (own auth on PostgreSQL); a deliberate choice, see `docs/architecture.md`.

## Limitations and deferred features

- Single workshop (no multi-tenant). Inventory, suppliers, production costs, CSV import, PWA/offline drafts:
  not implemented (optional in the brief).
- Settlement unit is the pay week (custom periods are available for reports, not for settling).
- Advances recovered in several instalments: done manually with carry-forward.
- No MFA; no e-mail password reset (the owner resets passwords in Settings).
- Native date pickers follow the browser's language format; displayed dates are always dd/mm/yyyy.
- PDF export is via the browser's print-to-PDF on the print layouts (no server PDF generation).
