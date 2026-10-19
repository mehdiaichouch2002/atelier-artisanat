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

## Not done / blockers

- **Deployment: blocked — no hosting or database credentials were provided** (no Vercel/Supabase/VPS access in
  this environment). Everything needed is documented in `docs/deployment.md`. Remaining manual actions:
  1. Create a Supabase project (or any PostgreSQL 15+), run `npm run db:migrate` with its owner connection string
     and an `APP_DB_PASSWORD`.
  2. Run `npm run db:create-owner`.
  3. Create a Vercel project from this repository, set `DATABASE_URL` (role `atelier_app`), `DATABASE_SSL=true`,
     `DATABASE_PREPARE=false`, `DATABASE_POOL_MAX=1`; deploy a preview, run the smoke test, promote.
  4. Verify that the Supabase pooler accepts the custom role (else use the direct/session connection).
- CI workflow is committed but its first run on GitHub has not been observed from this session.
- Supabase Auth is not used (own auth on PostgreSQL); a deliberate choice, see `docs/architecture.md`.

## Limitations and deferred features

- Single workshop (no multi-tenant). Inventory, suppliers, production costs, CSV import, PWA/offline drafts:
  not implemented (optional in the brief).
- Settlement unit is the pay week (custom periods are available for reports, not for settling).
- Advances recovered in several instalments: done manually with carry-forward.
- No MFA; no e-mail password reset (the owner resets passwords in Settings).
- Native date pickers follow the browser's language format; displayed dates are always dd/mm/yyyy.
- PDF export is via the browser's print-to-PDF on the print layouts (no server PDF generation).
