# Testing

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| Unit | `npm run test:unit` | nothing | Money parsing/formatting/rounding, dates & week boundaries (Africa/Casablanca), weekly settlement, base pay for weekly/daily/piece/negotiated, carry-forward, order totals, payment states, cancellations, status transitions, ledger effects & reversals, reconciliation, CSV, upload type sniffing, permissions, **translation completeness** (`npm run i18n:check`). |
| Integration | `npm run test:integration` | PostgreSQL | Real database through the restricted role: settlement with two advances and partial payments, idempotent retries, overpayment refusal, concurrent payments (only one wins), carry-forward, voiding, pending msrouf, orders/deposits/refunds/cancellation, DB transition table = code table, line locking, duplicates, scenario C cash effects, transfers and their reversal, immutability, CHECK constraints, **RLS** (anonymous, inactive, manager limits, column privileges, sessions, throttling, owner guard). |
| End-to-end | `npm run build && npm run test:e2e` | PostgreSQL + Chromium | Scenarios A–E from the brief plus axe-core accessibility scans in French and Arabic. |

## Test databases

Integration tests use `atelier_test` and end-to-end tests `atelier_e2e`; both are **dropped and recreated** by
the test setup, and the setup refuses to run on a database whose name does not contain `test`/`e2e`.

Defaults (override with env vars): admin `postgres:postgres@localhost:5432`, app role password `devpassword`
(`TEST_MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL`, `TEST_APP_DB_PASSWORD`, `E2E_PG_HOST`, `E2E_PG_ADMIN`).
If Chromium is preinstalled elsewhere, set `PW_CHROMIUM_PATH`.

```bash
createdb atelier_test            # once
npm test                         # unit + integration
npm run build && npm run test:e2e
```

## End-to-end scenarios

- **A** `a-weekly-settlement.spec.ts` — create a 1 500 DH/week worker, msrouf Monday (200) and Thursday (150),
  remaining 1 150, partial payment 500 → 650 "partly settled", overpayment refused, final 650 → settled, printable
  receipt, ledger shows exactly 2 advances + 2 payments and one pay line.
- **B** `b-customer-order.spec.ts` — customer + duplicate warning, two-line order (4 900 DH) with 1 500 deposit
  ("deposit paid", not "paid"), production statuses, overpayment refused, final payment, delivered, history,
  customer balance 0, customer-payments report and dashboard.
- **C** `c-cash-ledger.spec.ts` — opening balance, customer deposit, wage advance, settlement, expense: exact cash
  balance after each step; expenses report grows only by the expense (advance not double-counted); worker balance
  0; reconciliation with a −50 DH adjustment; cash-flow closing balance; CSV with BOM and `;`.
- **D** `d-security.spec.ts` — signed-out access refused (pages, CSV, attachments), httpOnly session cookie, login
  throttling, manager blocked from owner pages and from submitting an owner-only form (server refusal), no
  credentials or hashes in any HTML/JS/RSC payload.
- **E** `e-responsive-i18n.spec.ts` — 14 pages at 390/768/1280 px without horizontal overflow, bottom bar + quick
  actions + menu on phones, Arabic `dir="rtl"` with sidebar on the right and Latin-digit `DH` amounts, worker +
  msrouf journeys in English and Spanish, language switcher.
- **F** `f-accessibility.spec.ts` — axe-core WCAG 2.1 A/AA scan of 13 screens in French and Arabic: no serious
  or critical violations.

Results of the latest run are recorded in `docs/progress.md`.
