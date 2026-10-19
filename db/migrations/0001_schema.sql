-- Atelier artisanat — core schema
-- Conventions
--   * All money is stored as BIGINT minor units (centimes of MAD). Never floats.
--   * Ledger entries are immutable: corrections are reversal entries.
--   * The application connects as role `atelier_app`; every request sets
--     `app.user_id` inside its transaction. Row Level Security uses it.
--   * Tables live in schema `atelier` (not exposed by Supabase's REST API).

create schema if not exists atelier;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'atelier_app') then
    create role atelier_app nologin;
  end if;
end
$$;

grant usage on schema atelier to atelier_app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type atelier.user_role as enum ('owner', 'manager');
create type atelier.pay_kind as enum ('weekly', 'daily', 'piece', 'negotiated');
create type atelier.earning_basis as enum (
  'weekly', 'daily', 'piece', 'negotiated',   -- base pay for the week (one per worker/week)
  'bonus', 'adjustment',                      -- documented adjustments (+/-)
  'carry_in', 'carry_out'                     -- balance carried between weeks (paired)
);
create type atelier.entry_type as enum (
  'opening_balance', 'other_income', 'customer_payment', 'customer_refund',
  'worker_advance', 'worker_payment', 'expense', 'transfer', 'adjustment'
);
create type atelier.direction as enum ('in', 'out');
create type atelier.pay_method as enum ('cash', 'bank_transfer', 'cheque', 'card', 'mobile', 'other');
create type atelier.advance_category as enum ('daily', 'food_transport', 'materials', 'other');
create type atelier.advance_treatment as enum ('wage', 'business');
create type atelier.expense_category as enum (
  'materials', 'copper_metal', 'leather_soles', 'thread_accessories', 'rent', 'utilities',
  'transport', 'packaging', 'equipment_repairs', 'worker_reimbursements', 'other'
);
create type atelier.account_kind as enum ('cash', 'bank', 'other');
create type atelier.order_status as enum (
  'quote', 'confirmed', 'on_hold', 'in_production', 'finishing', 'ready', 'delivered', 'cancelled'
);
create type atelier.order_priority as enum ('low', 'normal', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- Request context helpers
-- ---------------------------------------------------------------------------
create function atelier.current_user_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- Users, sessions, login throttling
-- ---------------------------------------------------------------------------
create table atelier.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) between 3 and 254),
  display_name text not null check (length(display_name) between 1 and 120),
  role atelier.user_role not null,
  active boolean not null default true,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en', 'es')),
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role of the current request's user (null when unauthenticated or inactive).
create function atelier.current_user_role() returns atelier.user_role
language sql stable security definer set search_path = atelier, pg_temp
as $$ select role from atelier.users where id = atelier.current_user_id() and active $$;

create function atelier.is_member() returns boolean
language sql stable as $$ select atelier.current_user_role() is not null $$;

create function atelier.is_owner() returns boolean
language sql stable as $$ select atelier.current_user_role() = 'owner' $$;

create table atelier.sessions (
  token_hash text primary key,
  user_id uuid not null references atelier.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on atelier.sessions (user_id);

create table atelier.login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_email_idx on atelier.login_attempts (email, attempted_at);
create index login_attempts_ip_idx on atelier.login_attempts (ip, attempted_at);

-- ---------------------------------------------------------------------------
-- Settings, categories, reference counters
-- ---------------------------------------------------------------------------
create table atelier.settings (
  id boolean primary key default true check (id),
  workshop_name text not null default 'Atelier' check (length(workshop_name) between 1 and 120),
  -- 0 = Sunday … 6 = Saturday. Pay weeks start on this day.
  week_start_day smallint not null default 1 check (week_start_day between 0 and 6),
  updated_at timestamptz not null default now(),
  updated_by uuid references atelier.users (id)
);
insert into atelier.settings default values;

create table atelier.categories (
  id uuid primary key default gen_random_uuid(),
  code text unique,                 -- built-in categories are translated by code
  name text not null check (length(name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into atelier.categories (code, name) values
  ('babouches', 'Babouches'),
  ('copper', 'Cuivre / Dinanderie'),
  ('other', 'Autre');

create table atelier.counters (
  prefix text not null,
  year int not null,
  last_value int not null default 0,
  primary key (prefix, year)
);

-- Gap-free (per committed transaction) human readable references: CMD-2026-0001
create function atelier.next_reference(p_prefix text) returns text
language plpgsql security definer set search_path = atelier, pg_temp
as $$
declare
  v_year int := extract(year from (now() at time zone 'Africa/Casablanca'))::int;
  v_next int;
begin
  if p_prefix not in ('CMD', 'TX', 'CLI') then
    raise exception 'invalid reference prefix';
  end if;
  if atelier.current_user_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into atelier.counters as c (prefix, year, last_value) values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last_value = c.last_value + 1
  returning last_value into v_next;
  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end
$$;

-- Start of the pay week containing d, using the configured week start day.
create function atelier.week_start(d date) returns date
language sql stable
as $$
  select d - ((extract(dow from d)::int - s.week_start_day + 7) % 7)
  from atelier.settings s
$$;

-- ---------------------------------------------------------------------------
-- Workers
-- ---------------------------------------------------------------------------
create table atelier.workers (
  id uuid primary key default gen_random_uuid(),
  code text unique check (code is null or length(code) between 1 and 20),
  full_name text not null check (length(full_name) between 1 and 120),
  phone text check (phone is null or length(phone) <= 30),
  category_id uuid references atelier.categories (id),
  start_date date not null,
  active boolean not null default true,
  notes text check (notes is null or length(notes) <= 2000),
  pay_kind atelier.pay_kind not null,
  weekly_amount_cents bigint check (weekly_amount_cents is null or weekly_amount_cents between 0 and 100000000),
  daily_rate_cents bigint check (daily_rate_cents is null or daily_rate_cents between 0 and 10000000),
  piece_rate_cents bigint check (piece_rate_cents is null or piece_rate_cents between 0 and 10000000),
  default_days numeric(4, 1) check (default_days is null or default_days between 0 and 7),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references atelier.users (id),
  constraint workers_arrangement_complete check (
    (pay_kind = 'weekly' and weekly_amount_cents is not null)
    or (pay_kind = 'daily' and daily_rate_cents is not null)
    or (pay_kind = 'piece' and piece_rate_cents is not null)
    or pay_kind = 'negotiated'
  )
);
create index workers_name_idx on atelier.workers (lower(full_name));
create index workers_active_idx on atelier.workers (active);

-- History of payment arrangements (written by trigger whenever they change).
create table atelier.worker_arrangements (
  id bigint generated always as identity primary key,
  worker_id uuid not null references atelier.workers (id),
  pay_kind atelier.pay_kind not null,
  weekly_amount_cents bigint,
  daily_rate_cents bigint,
  piece_rate_cents bigint,
  default_days numeric(4, 1),
  effective_at timestamptz not null default now(),
  changed_by uuid references atelier.users (id)
);
create index worker_arrangements_worker_idx on atelier.worker_arrangements (worker_id, effective_at);

create function atelier.tg_worker_arrangement_history() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     or (new.pay_kind, new.weekly_amount_cents, new.daily_rate_cents, new.piece_rate_cents, new.default_days)
        is distinct from
        (old.pay_kind, old.weekly_amount_cents, old.daily_rate_cents, old.piece_rate_cents, old.default_days) then
    insert into atelier.worker_arrangements
      (worker_id, pay_kind, weekly_amount_cents, daily_rate_cents, piece_rate_cents, default_days, changed_by)
    values
      (new.id, new.pay_kind, new.weekly_amount_cents, new.daily_rate_cents, new.piece_rate_cents, new.default_days,
       atelier.current_user_id());
  end if;
  return new;
end
$$;
create trigger workers_arrangement_history after insert or update on atelier.workers
  for each row execute function atelier.tg_worker_arrangement_history();

-- What a worker earned for a pay week (non-cash obligations).
create table atelier.worker_earnings (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references atelier.workers (id),
  pay_week date not null,
  basis atelier.earning_basis not null,
  quantity numeric(10, 2) check (quantity is null or quantity >= 0),
  rate_cents bigint check (rate_cents is null or rate_cents >= 0),
  amount_cents bigint not null check (amount_cents between -100000000 and 100000000),
  note text check (note is null or length(note) <= 500),
  carry_group uuid,
  idempotency_key uuid unique,
  voided_at timestamptz,
  voided_by uuid references atelier.users (id),
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id),
  constraint earnings_base_non_negative check (
    basis not in ('weekly', 'daily', 'piece', 'negotiated') or amount_cents >= 0
  ),
  constraint earnings_qty_rate_consistent check (
    quantity is null or rate_cents is null or amount_cents = round(quantity * rate_cents)
  ),
  constraint earnings_adjustment_note check (
    basis not in ('bonus', 'adjustment') or (note is not null and length(note) > 0)
  ),
  constraint earnings_carry_group check ((basis in ('carry_in', 'carry_out')) = (carry_group is not null)),
  constraint earnings_carry_sign check (
    (basis <> 'carry_in' and basis <> 'carry_out') or amount_cents <> 0
  ),
  constraint earnings_void_complete check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and length(void_reason) > 0)
  )
);
-- Only one active base pay line per worker and week (prevents duplicate settlements of pay).
create unique index worker_earnings_one_base_per_week on atelier.worker_earnings (worker_id, pay_week)
  where basis in ('weekly', 'daily', 'piece', 'negotiated') and voided_at is null;
create index worker_earnings_week_idx on atelier.worker_earnings (pay_week);

-- ---------------------------------------------------------------------------
-- Customers & orders
-- ---------------------------------------------------------------------------
create table atelier.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  phone text check (phone is null or length(phone) <= 30),
  email text check (email is null or length(email) <= 254),
  address text check (address is null or length(address) <= 500),
  notes text check (notes is null or length(notes) <= 2000),
  active boolean not null default true,
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references atelier.users (id)
);
create index customers_name_idx on atelier.customers (lower(name));
create index customers_phone_idx on atelier.customers (phone);

create table atelier.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references atelier.customers (id),
  order_date date not null,
  due_date date,
  status atelier.order_status not null default 'quote',
  priority atelier.order_priority not null default 'normal',
  assigned_worker_id uuid references atelier.workers (id),
  notes text check (notes is null or length(notes) <= 4000),
  -- Amount the workshop keeps when an order is cancelled (e.g. retained deposit).
  cancellation_fee_cents bigint not null default 0 check (cancellation_fee_cents between 0 and 100000000000),
  status_changed_at timestamptz not null default now(),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references atelier.users (id),
  unique (id, customer_id),
  constraint orders_due_after_order check (due_date is null or due_date >= order_date)
);
create index orders_customer_idx on atelier.orders (customer_id);
create index orders_status_idx on atelier.orders (status, due_date);
create index orders_date_idx on atelier.orders (order_date);

create table atelier.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references atelier.orders (id) on delete restrict,
  position int not null default 0,
  category_id uuid references atelier.categories (id),
  description text not null check (length(description) between 1 and 500),
  quantity int not null check (quantity between 1 and 100000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 10000000000),
  line_total_cents bigint generated always as (quantity * unit_price_cents) stored,
  created_at timestamptz not null default now()
);
create index order_lines_order_idx on atelier.order_lines (order_id);

create table atelier.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references atelier.orders (id),
  amount_cents bigint not null check (amount_cents <> 0 and amount_cents between -10000000000 and 10000000000),
  reason text not null check (length(reason) between 1 and 500),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id)
);
create index order_adjustments_order_idx on atelier.order_adjustments (order_id);

create table atelier.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references atelier.orders (id),
  from_status atelier.order_status,
  to_status atelier.order_status not null,
  note text,
  changed_at timestamptz not null default now(),
  changed_by uuid references atelier.users (id)
);
create index order_status_history_order_idx on atelier.order_status_history (order_id, changed_at);

create function atelier.order_transition_allowed(p_from atelier.order_status, p_to atelier.order_status)
returns boolean language sql immutable
as $$
  select case p_from
    when 'quote' then p_to in ('confirmed', 'cancelled')
    when 'confirmed' then p_to in ('on_hold', 'in_production', 'cancelled')
    when 'on_hold' then p_to in ('confirmed', 'in_production', 'cancelled')
    when 'in_production' then p_to in ('on_hold', 'finishing', 'ready', 'cancelled')
    when 'finishing' then p_to in ('in_production', 'ready', 'cancelled')
    when 'ready' then p_to in ('finishing', 'delivered', 'cancelled')
    when 'delivered' then false
    when 'cancelled' then false
  end
$$;

create function atelier.tg_order_status() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('quote', 'confirmed') then
      raise exception 'new orders must start as quote or confirmed' using errcode = '23514';
    end if;
  elsif new.status is distinct from old.status then
    if not atelier.order_transition_allowed(old.status, new.status) then
      raise exception 'invalid order status transition % -> %', old.status, new.status using errcode = '23514';
    end if;
    new.status_changed_at := now();
  end if;
  if new.status <> 'cancelled' and new.cancellation_fee_cents <> 0 then
    raise exception 'cancellation fee only applies to cancelled orders' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status in ('delivered', 'cancelled')
     and (new.customer_id, new.order_date, new.cancellation_fee_cents)
         is distinct from (old.customer_id, old.order_date, old.cancellation_fee_cents) then
    raise exception 'closed orders cannot be modified' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger orders_status_before before insert or update on atelier.orders
  for each row execute function atelier.tg_order_status();

-- Dated status history, written after the row exists.
create function atelier.tg_order_status_history() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into atelier.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, atelier.current_user_id());
  end if;
  return null;
end
$$;
create trigger orders_status_after after insert or update on atelier.orders
  for each row execute function atelier.tg_order_status_history();

-- Lines can only change while the price is still being negotiated.
create function atelier.tg_order_lines_guard() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
declare v_status atelier.order_status;
begin
  select status into v_status from atelier.orders where id = coalesce(new.order_id, old.order_id);
  if v_status not in ('quote', 'confirmed', 'on_hold') then
    raise exception 'order lines are locked once production has started; use an adjustment'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;
create trigger order_lines_guard before insert or update or delete on atelier.order_lines
  for each row execute function atelier.tg_order_lines_guard();

-- ---------------------------------------------------------------------------
-- Cash accounts and the ledger
-- ---------------------------------------------------------------------------
create table atelier.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 80),
  kind atelier.account_kind not null default 'cash',
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default atelier.current_user_id() references atelier.users (id)
);
create unique index cash_accounts_one_default on atelier.cash_accounts (is_default) where is_default;
insert into atelier.cash_accounts (name, kind, is_default) values ('Caisse atelier', 'cash', true);

create table atelier.cash_counts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references atelier.cash_accounts (id),
  counted_cents bigint not null check (counted_cents between -100000000000 and 100000000000),
  calculated_cents bigint not null,
  counted_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 1000),
  idempotency_key uuid unique,
  created_by uuid not null default atelier.current_user_id() references atelier.users (id)
);
create index cash_counts_account_idx on atelier.cash_counts (account_id, counted_at);

create table atelier.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  entry_type atelier.entry_type not null,
  direction atelier.direction not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  account_id uuid not null references atelier.cash_accounts (id),
  method atelier.pay_method not null default 'cash',
  occurred_at timestamptz not null,
  description text check (description is null or length(description) <= 1000),
  worker_id uuid references atelier.workers (id),
  customer_id uuid references atelier.customers (id),
  order_id uuid references atelier.orders (id),
  pay_week date,
  advance_category atelier.advance_category,
  advance_treatment atelier.advance_treatment,
  expense_category atelier.expense_category,
  supplier text check (supplier is null or length(supplier) <= 160),
  transfer_group uuid,
  cash_count_id uuid references atelier.cash_counts (id),
  reversal_of uuid unique references atelier.ledger_entries (id),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id),
  foreign key (order_id, customer_id) references atelier.orders (id, customer_id),
  constraint ledger_customer_fields check (
    entry_type not in ('customer_payment', 'customer_refund') or (customer_id is not null and order_id is not null)
  ),
  constraint ledger_worker_fields check (
    entry_type not in ('worker_advance', 'worker_payment') or (worker_id is not null and pay_week is not null)
  ),
  constraint ledger_advance_fields check (
    (entry_type = 'worker_advance') = (advance_category is not null and advance_treatment is not null)
  ),
  constraint ledger_business_advance_category check (
    entry_type <> 'worker_advance' or advance_treatment <> 'business' or expense_category is not null
  ),
  constraint ledger_expense_fields check (entry_type <> 'expense' or expense_category is not null),
  constraint ledger_expense_category_scope check (
    expense_category is null or entry_type = 'expense'
    or (entry_type = 'worker_advance' and advance_treatment = 'business')
  ),
  constraint ledger_transfer_fields check ((entry_type = 'transfer') = (transfer_group is not null)),
  constraint ledger_pay_week_scope check (pay_week is null or entry_type in ('worker_advance', 'worker_payment')),
  -- Canonical direction for original entries; reversals go the other way (checked by trigger).
  constraint ledger_canonical_direction check (
    reversal_of is not null
    or entry_type in ('opening_balance', 'transfer', 'adjustment')
    or (entry_type in ('other_income', 'customer_payment') and direction = 'in')
    or (entry_type in ('customer_refund', 'worker_advance', 'worker_payment', 'expense') and direction = 'out')
  )
);
create index ledger_occurred_idx on atelier.ledger_entries (occurred_at);
create index ledger_account_idx on atelier.ledger_entries (account_id, occurred_at);
create index ledger_worker_idx on atelier.ledger_entries (worker_id, pay_week) where worker_id is not null;
create index ledger_order_idx on atelier.ledger_entries (order_id) where order_id is not null;
create index ledger_customer_idx on atelier.ledger_entries (customer_id) where customer_id is not null;
create index ledger_type_idx on atelier.ledger_entries (entry_type, occurred_at);

create function atelier.tg_ledger_validate() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
declare
  o atelier.ledger_entries;
  v_status atelier.order_status;
begin
  if new.pay_week is not null and new.pay_week <> atelier.week_start(new.pay_week) then
    raise exception 'pay_week must be the first day of a pay week' using errcode = '23514';
  end if;
  if new.reversal_of is not null then
    select * into o from atelier.ledger_entries where id = new.reversal_of;
    if o.reversal_of is not null then
      raise exception 'a reversal cannot itself be reversed' using errcode = '23514';
    end if;
    if new.entry_type <> o.entry_type or new.direction = o.direction or new.amount_cents <> o.amount_cents
       or new.account_id <> o.account_id
       or (new.worker_id, new.customer_id, new.order_id, new.pay_week, new.advance_category,
           new.advance_treatment, new.expense_category, new.transfer_group)
          is distinct from
          (o.worker_id, o.customer_id, o.order_id, o.pay_week, o.advance_category,
           o.advance_treatment, o.expense_category, o.transfer_group) then
      raise exception 'a reversal must mirror the original entry' using errcode = '23514';
    end if;
  elsif new.entry_type = 'customer_payment' then
    select status into v_status from atelier.orders where id = new.order_id;
    if v_status = 'cancelled' then
      raise exception 'cannot record a payment on a cancelled order' using errcode = '23514';
    end if;
  end if;
  if new.entry_type in ('worker_advance', 'worker_payment') and new.reversal_of is null
     and not exists (select 1 from atelier.workers w where w.id = new.worker_id and w.active) then
    raise exception 'worker is inactive' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger ledger_validate before insert on atelier.ledger_entries
  for each row execute function atelier.tg_ledger_validate();

create function atelier.tg_immutable() returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable; record a reversal or adjustment instead', tg_table_name
    using errcode = '42501';
end
$$;
create trigger ledger_immutable before update or delete on atelier.ledger_entries
  for each row execute function atelier.tg_immutable();
create trigger cash_counts_immutable before update or delete on atelier.cash_counts
  for each row execute function atelier.tg_immutable();
create trigger order_adjustments_immutable before update or delete on atelier.order_adjustments
  for each row execute function atelier.tg_immutable();
create trigger order_status_history_immutable before update or delete on atelier.order_status_history
  for each row execute function atelier.tg_immutable();

-- Earnings can only be voided (never edited or deleted).
create function atelier.tg_earnings_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'worker earnings cannot be deleted; void them instead' using errcode = '42501';
  end if;
  if old.voided_at is not null then
    raise exception 'voided earnings cannot be changed' using errcode = '42501';
  end if;
  if (new.worker_id, new.pay_week, new.basis, new.quantity, new.rate_cents, new.amount_cents, new.note,
      new.carry_group, new.created_at, new.created_by)
     is distinct from
     (old.worker_id, old.pay_week, old.basis, old.quantity, old.rate_cents, old.amount_cents, old.note,
      old.carry_group, old.created_at, old.created_by) then
    raise exception 'worker earnings can only be voided' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger worker_earnings_guard before update or delete on atelier.worker_earnings
  for each row execute function atelier.tg_earnings_guard();

create function atelier.tg_earnings_validate() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if new.pay_week <> atelier.week_start(new.pay_week) then
    raise exception 'pay_week must be the first day of a pay week' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger worker_earnings_validate before insert on atelier.worker_earnings
  for each row execute function atelier.tg_earnings_validate();

-- ---------------------------------------------------------------------------
-- Attachments (private, stored in the database, served only to members)
-- ---------------------------------------------------------------------------
create table atelier.attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references atelier.orders (id),
  ledger_entry_id uuid references atelier.ledger_entries (id),
  filename text not null check (length(filename) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  data bytea not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default atelier.current_user_id() references atelier.users (id),
  constraint attachments_one_target check (num_nonnulls(order_id, ledger_entry_id) = 1)
);
create index attachments_order_idx on atelier.attachments (order_id);
create index attachments_ledger_idx on atelier.attachments (ledger_entry_id);

-- ---------------------------------------------------------------------------
-- Audit log (written by triggers only)
-- ---------------------------------------------------------------------------
create table atelier.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  at timestamptz not null default now()
);
create index audit_log_record_idx on atelier.audit_log (table_name, record_id);
create index audit_log_at_idx on atelier.audit_log (at);

create function atelier.tg_audit() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id text;
begin
  v_old := v_old - 'password_hash' - 'data';
  v_new := v_new - 'password_hash' - 'data';
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'token_hash', '?');
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into atelier.audit_log (table_name, record_id, action, old_data, new_data, user_id)
  values (tg_table_name, v_id, lower(tg_op), v_old, v_new, atelier.current_user_id());
  return null;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'settings', 'categories', 'workers', 'worker_earnings', 'customers', 'orders', 'order_lines',
    'order_adjustments', 'cash_accounts', 'cash_counts', 'ledger_entries', 'attachments'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on atelier.%I for each row execute function atelier.tg_audit()',
      t || '_audit', t);
  end loop;
end
$$;

-- updated_at / updated_by maintenance
create function atelier.tg_touch() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := atelier.current_user_id();
  end if;
  return new;
end
$$;
create trigger workers_touch before update on atelier.workers for each row execute function atelier.tg_touch();
create trigger customers_touch before update on atelier.customers for each row execute function atelier.tg_touch();
create trigger orders_touch before update on atelier.orders for each row execute function atelier.tg_touch();
create trigger users_touch before update on atelier.users for each row execute function atelier.tg_touch();
create trigger settings_touch before update on atelier.settings for each row execute function atelier.tg_touch();

-- Created-by can never be spoofed.
create function atelier.tg_force_creator() returns trigger
language plpgsql
as $$
begin
  if atelier.current_user_id() is not null then
    new.created_by := atelier.current_user_id();
  end if;
  return new;
end
$$;
do $$
declare t text;
begin
  foreach t in array array[
    'workers', 'worker_earnings', 'customers', 'orders', 'order_adjustments', 'cash_counts', 'ledger_entries',
    'attachments', 'cash_accounts'
  ] loop
    execute format(
      'create trigger %I before insert on atelier.%I for each row execute function atelier.tg_force_creator()',
      t || '_creator', t);
  end loop;
end
$$;
