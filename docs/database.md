# Database and financial rules

Schema `atelier` (PostgreSQL ≥ 15). Migrations: `db/migrations/0001_schema.sql` (tables, constraints, triggers)
and `0002_views_security.sql` (views, RLS, grants, auth functions).

## Conventions

- **Money** is `BIGINT` centimes everywhere (1 DH = 100). No floats in the database or the code.
- **Business dates** are `DATE` in the workshop time zone `Africa/Casablanca`; instants are `TIMESTAMPTZ`.
- **No stored totals**: every balance is a view over source rows.
- **Immutable money**: `ledger_entries`, `cash_counts`, `order_adjustments`, `order_status_history` reject
  `UPDATE`/`DELETE` (trigger, even for the schema owner). Corrections are reversal entries.
- **Audit**: triggers write `audit_log` (old/new JSON, user, time) for every change of business tables
  (password hashes and file contents are excluded).
- **Idempotency**: `idempotency_key UUID UNIQUE` on workers, customers, orders, earnings, adjustments, cash
  counts and ledger entries.

## Main tables

| Table | Purpose |
|---|---|
| `users`, `sessions`, `login_attempts` | Accounts (owner / manager), hashed session tokens, throttling. |
| `settings` | Workshop name, first day of the pay week. |
| `categories` | Crafts / product categories (built-in: babouches, copper, other). |
| `workers`, `worker_arrangements` | Worker data and the full history of pay arrangements. |
| `worker_earnings` | What a worker earned for a pay week: base pay (one per week), bonuses, corrections, carried amounts. Can only be *voided* (owner). |
| `customers`, `orders`, `order_lines`, `order_adjustments`, `order_status_history` | Orders with line items, documented price adjustments and dated status changes. |
| `cash_accounts`, `cash_counts` | Cash boxes / bank accounts and physical counts. |
| `ledger_entries` | The single money journal (see below). |
| `attachments` | Private files linked to an order or a ledger entry. |

## The ledger

Every money movement is one row: `entry_type`, `direction` (`in`/`out` of the account), positive
`amount_cents`, `account_id`, `method`, `occurred_at`, links (`worker_id`, `customer_id`, `order_id`,
`pay_week`), reference `TX-YYYY-NNNN`, creator. Type-specific CHECK constraints enforce required links and the
canonical direction of original entries; a reversal (`reversal_of`, unique) must mirror the original with the
opposite direction.

| type | cash | worker balance | customer balance | expenses report |
|---|---|---|---|---|
| opening_balance | ± | – | – | – |
| other_income | + | – | – | – |
| customer_payment | + | – | − | – |
| customer_refund | − | – | + | – |
| worker_advance (wage) | − | − | – | – |
| worker_advance (business) | − | – | – | + |
| worker_payment | − | − | – | – |
| expense | − | – | – | + |
| transfer (pair) | ± | – | – | – |
| adjustment | ± | – | – | – |

**An advance is never counted twice**: wage advances reduce what is owed to the worker and are never
expenses; business advances are expenses and never reduce pay; settlement payments are never expenses.

## Balance formulas

- **Account balance** (`v_account_balances`) = Σ in − Σ out of its entries.
- **Order** (`v_order_balances`): due = Σ lines + Σ adjustments (cancelled order: the cancellation fee kept by
  the workshop); **balance = due − payments + refunds**. Payment state: unpaid / deposit / paid / credit.
- **Customer** (`v_customer_balances`) = Σ of its orders.
- **Worker week** (`v_worker_weeks`): due = base + bonuses/corrections + carried; **remaining = due − wage
  advances of the week − settlement payments of the week**. Each advance/payment carries one `pay_week`
  (the week of its local date unless chosen explicitly), so it is deducted exactly once.
- **Worker balance** (`v_worker_balances`): `balance_cents` = Σ remaining of weeks whose pay is recorded;
  `pending_advances_cents` = msrouf on weeks whose pay is not confirmed yet (shown separately).
- **Carry forward**: writes `carry_out = −R` in week W and `carry_in = +R` in W+1 (same `carry_group`), so the
  overall balance never changes.

## Integrity rules enforced in the database

- One active base pay per worker and week (partial unique index).
- `pay_week` must be the first day of a pay week (trigger, uses `settings.week_start_day`; the setting is locked
  once pay data exists).
- No advance/payment for an inactive worker; no payment on a cancelled order.
- Order status transitions (`order_transition_allowed`) mirror `src/domain/orders/logic.ts` (tested).
- Order lines can change only in quote/confirmed/on-hold; afterwards only documented adjustments.
- `(order_id, customer_id)` composite foreign key keeps payments attached to the right customer.
- At least one active owner must always exist (deferred constraint trigger).

## Concurrency

Checks that depend on a balance lock first: worker row (`FOR UPDATE`) for settlements, carry-forward and voids;
order row for payments, refunds, status changes; advisory locks for reversals and cash counts. Tested with three
simultaneous payments: only one succeeds.
