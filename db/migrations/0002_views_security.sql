-- Derived balances (views), Row Level Security, grants and auth functions.
-- Balances are always computed from source rows; there are no stored totals that can drift.

-- ---------------------------------------------------------------------------
-- Views (security_invoker: RLS of the querying role applies)
-- ---------------------------------------------------------------------------

-- Cash position of each account = Σ in − Σ out of every ledger entry on that account.
create view atelier.v_account_balances with (security_invoker = true) as
select a.id as account_id, a.name, a.kind, a.active, a.is_default,
       coalesce(sum(case when l.direction = 'in' then l.amount_cents else -l.amount_cents end), 0)::bigint
         as balance_cents
from atelier.cash_accounts a
left join atelier.ledger_entries l on l.account_id = a.id
group by a.id;

-- Order balance = amount due − customer payments + refunds.
-- Amount due = Σ lines + Σ adjustments, or the cancellation fee when the order is cancelled.
create view atelier.v_order_balances with (security_invoker = true) as
select o.id as order_id, o.customer_id, o.status, o.due_date,
       coalesce(lines.total, 0)::bigint as lines_total_cents,
       coalesce(adj.total, 0)::bigint as adjustments_cents,
       (case when o.status = 'cancelled' then o.cancellation_fee_cents
             else coalesce(lines.total, 0) + coalesce(adj.total, 0) end)::bigint as due_cents,
       coalesce(pay.paid, 0)::bigint as paid_cents,
       coalesce(pay.refunded, 0)::bigint as refunded_cents,
       (case when o.status = 'cancelled' then o.cancellation_fee_cents
             else coalesce(lines.total, 0) + coalesce(adj.total, 0) end
        - coalesce(pay.paid, 0) + coalesce(pay.refunded, 0))::bigint as balance_cents
from atelier.orders o
left join lateral (select sum(line_total_cents) as total from atelier.order_lines where order_id = o.id) lines on true
left join lateral (select sum(amount_cents) as total from atelier.order_adjustments where order_id = o.id) adj on true
left join lateral (
  select
    sum(case when entry_type = 'customer_payment' then
          case when direction = 'in' then amount_cents else -amount_cents end end) as paid,
    sum(case when entry_type = 'customer_refund' then
          case when direction = 'out' then amount_cents else -amount_cents end end) as refunded
  from atelier.ledger_entries
  where order_id = o.id and entry_type in ('customer_payment', 'customer_refund')
) pay on true;

create view atelier.v_customer_balances with (security_invoker = true) as
select c.id as customer_id,
       count(b.order_id)::int as orders_count,
       coalesce(sum(b.due_cents), 0)::bigint as due_cents,
       coalesce(sum(b.paid_cents), 0)::bigint as paid_cents,
       coalesce(sum(b.refunded_cents), 0)::bigint as refunded_cents,
       coalesce(sum(b.balance_cents), 0)::bigint as balance_cents
from atelier.customers c
left join atelier.v_order_balances b on b.customer_id = c.id
group by c.id;

-- One row per worker and pay week with every component of the weekly settlement.
-- remaining = base pay + adjustments + carried amounts − wage advances − settlement payments
-- Business advances (money handed over for workshop purchases) never reduce pay.
create view atelier.v_worker_weeks with (security_invoker = true) as
with parts as (
  select worker_id, pay_week,
         case when basis in ('weekly', 'daily', 'piece', 'negotiated') then amount_cents else 0 end as base,
         case when basis in ('weekly', 'daily', 'piece', 'negotiated') then 1 else 0 end as base_count,
         case when basis in ('bonus', 'adjustment') then amount_cents else 0 end as adj,
         case when basis in ('carry_in', 'carry_out') then amount_cents else 0 end as carry,
         0::bigint as wage_adv, 0::bigint as biz_adv, 0::bigint as paid
  from atelier.worker_earnings
  where voided_at is null
  union all
  select worker_id, pay_week, 0, 0, 0, 0,
         case when entry_type = 'worker_advance' and advance_treatment = 'wage' then
           case when direction = 'out' then amount_cents else -amount_cents end else 0 end,
         case when entry_type = 'worker_advance' and advance_treatment = 'business' then
           case when direction = 'out' then amount_cents else -amount_cents end else 0 end,
         case when entry_type = 'worker_payment' then
           case when direction = 'out' then amount_cents else -amount_cents end else 0 end
  from atelier.ledger_entries
  where entry_type in ('worker_advance', 'worker_payment')
)
select worker_id, pay_week,
       sum(base)::bigint as base_cents,
       (sum(base_count) > 0) as has_base,
       sum(adj)::bigint as adjustments_cents,
       sum(carry)::bigint as carry_cents,
       sum(wage_adv)::bigint as wage_advances_cents,
       sum(biz_adv)::bigint as business_advances_cents,
       sum(paid)::bigint as payments_cents,
       (sum(base) + sum(adj) + sum(carry) - sum(wage_adv) - sum(paid))::bigint as remaining_cents
from parts
group by worker_id, pay_week;

-- Overall position per worker.
--   balance_cents          = Σ remaining of weeks whose pay is recorded (or that carry/adjust amounts);
--                            positive = the workshop owes the worker.
--   pending_advances_cents = msrouf and payments on weeks whose pay is not recorded yet; they will be
--                            deducted when that week's pay is confirmed (shown separately, not netted).
create view atelier.v_worker_balances with (security_invoker = true) as
select w.id as worker_id,
       coalesce(sum(ww.remaining_cents) filter (where ww.has_base or ww.carry_cents <> 0 or ww.adjustments_cents <> 0), 0)::bigint
         as balance_cents,
       coalesce(sum(ww.wage_advances_cents + ww.payments_cents)
                  filter (where not (ww.has_base or ww.carry_cents <> 0 or ww.adjustments_cents <> 0)), 0)::bigint
         as pending_advances_cents
from atelier.workers w
left join atelier.v_worker_weeks ww on ww.worker_id = w.id
group by w.id;

-- ---------------------------------------------------------------------------
-- Guard: there must always be at least one active owner.
-- ---------------------------------------------------------------------------
create function atelier.tg_keep_owner() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if not exists (select 1 from atelier.users where role = 'owner' and active) then
    raise exception 'at least one active owner is required' using errcode = '23514';
  end if;
  return null;
end
$$;
create constraint trigger users_keep_owner after update on atelier.users
  deferrable initially deferred for each row execute function atelier.tg_keep_owner();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'sessions', 'login_attempts', 'settings', 'categories', 'counters', 'workers', 'worker_arrangements',
    'worker_earnings', 'customers', 'orders', 'order_lines', 'order_adjustments', 'order_status_history',
    'cash_accounts', 'cash_counts', 'ledger_entries', 'attachments', 'audit_log'
  ] loop
    execute format('alter table atelier.%I enable row level security', t);
  end loop;
end
$$;
-- Note: sessions, login_attempts and counters have RLS enabled and *no* policy: they are only
-- reachable through the security-definer functions below.

-- Members (owner or manager) can read operational data.
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'settings', 'categories', 'workers', 'worker_arrangements', 'worker_earnings', 'customers', 'orders',
    'order_lines', 'order_adjustments', 'order_status_history', 'cash_accounts', 'cash_counts', 'ledger_entries',
    'attachments'
  ] loop
    execute format('create policy member_select on atelier.%I for select to atelier_app using (atelier.is_member())', t);
  end loop;
end
$$;

-- Members can create and edit day-to-day records.
do $$
declare t text;
begin
  foreach t in array array['workers', 'customers', 'orders', 'order_lines'] loop
    execute format('create policy member_insert on atelier.%I for insert to atelier_app with check (atelier.is_member())', t);
    execute format('create policy member_update on atelier.%I for update to atelier_app using (atelier.is_member()) with check (atelier.is_member())', t);
  end loop;
  foreach t in array array['order_adjustments', 'cash_counts', 'attachments'] loop
    execute format('create policy member_insert on atelier.%I for insert to atelier_app with check (atelier.is_member())', t);
  end loop;
end
$$;
create policy member_delete on atelier.order_lines for delete to atelier_app using (atelier.is_member());

-- Earnings: members record them; only the owner may void.
create policy member_insert on atelier.worker_earnings for insert to atelier_app
  with check (atelier.is_member() and voided_at is null);
create policy owner_void on atelier.worker_earnings for update to atelier_app
  using (atelier.is_owner()) with check (atelier.is_owner());

-- Ledger: managers may record operational entries; opening balances, transfers, cash adjustments,
-- refunds and reversals are owner-only.
create policy ledger_insert on atelier.ledger_entries for insert to atelier_app
  with check (
    atelier.is_owner()
    or (atelier.current_user_role() = 'manager'
        and reversal_of is null
        and entry_type in ('other_income', 'customer_payment', 'worker_advance', 'worker_payment', 'expense'))
  );

-- Owner-only administration.
create policy owner_update on atelier.settings for update to atelier_app using (atelier.is_owner()) with check (atelier.is_owner());
create policy owner_insert on atelier.categories for insert to atelier_app with check (atelier.is_owner());
create policy owner_update on atelier.categories for update to atelier_app using (atelier.is_owner()) with check (atelier.is_owner());
create policy owner_insert on atelier.cash_accounts for insert to atelier_app with check (atelier.is_owner());
create policy owner_update on atelier.cash_accounts for update to atelier_app using (atelier.is_owner()) with check (atelier.is_owner());
create policy owner_insert on atelier.users for insert to atelier_app with check (atelier.is_owner());
create policy owner_update on atelier.users for update to atelier_app using (atelier.is_owner()) with check (atelier.is_owner());
create policy owner_select on atelier.audit_log for select to atelier_app using (atelier.is_owner());

-- ---------------------------------------------------------------------------
-- Grants (least privilege; no DELETE except draft order lines)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema atelier from public;
revoke all on all functions in schema atelier from public;

grant select (id, email, display_name, role, active, locale, created_at, updated_at) on atelier.users to atelier_app;
grant insert (email, display_name, role, active, locale, password_hash) on atelier.users to atelier_app;
grant update (display_name, role, active, locale) on atelier.users to atelier_app;
grant select, update on atelier.settings to atelier_app;
grant select, insert, update on atelier.categories to atelier_app;
grant select, insert, update on atelier.workers to atelier_app;
grant select on atelier.worker_arrangements to atelier_app;
grant select, insert on atelier.worker_earnings to atelier_app;
grant update (voided_at, voided_by, void_reason) on atelier.worker_earnings to atelier_app;
grant select, insert, update on atelier.customers to atelier_app;
grant select, insert, update on atelier.orders to atelier_app;
grant select, insert, update, delete on atelier.order_lines to atelier_app;
grant select, insert on atelier.order_adjustments to atelier_app;
grant select on atelier.order_status_history to atelier_app;
grant select, insert, update on atelier.cash_accounts to atelier_app;
grant select, insert on atelier.cash_counts to atelier_app;
grant select, insert on atelier.ledger_entries to atelier_app;
grant select, insert on atelier.attachments to atelier_app;
grant select on atelier.audit_log to atelier_app;
grant select on atelier.v_account_balances, atelier.v_order_balances, atelier.v_customer_balances,
  atelier.v_worker_weeks, atelier.v_worker_balances to atelier_app;

grant execute on function atelier.current_user_id(), atelier.current_user_role(), atelier.is_member(),
  atelier.is_owner(), atelier.next_reference(text), atelier.week_start(date),
  atelier.order_transition_allowed(atelier.order_status, atelier.order_status) to atelier_app;

-- ---------------------------------------------------------------------------
-- Authentication functions (the only way the app touches sessions and hashes)
-- ---------------------------------------------------------------------------
create function atelier.auth_find_user(p_email text)
returns table (id uuid, password_hash text, active boolean)
language sql stable security definer set search_path = atelier, pg_temp
as $$ select u.id, u.password_hash, u.active from atelier.users u where u.email = lower(p_email) $$;

-- True when too many recent failures exist for this e-mail or IP (15 minute window).
create function atelier.auth_is_throttled(p_email text, p_ip text) returns boolean
language sql stable security definer set search_path = atelier, pg_temp
as $$
  select (select count(*) from atelier.login_attempts
           where email = lower(p_email) and not success and attempted_at > now() - interval '15 minutes') >= 5
      or (select count(*) from atelier.login_attempts
           where ip = p_ip and not success and attempted_at > now() - interval '15 minutes') >= 30
$$;

create function atelier.auth_record_attempt(p_email text, p_ip text, p_success boolean) returns void
language sql security definer set search_path = atelier, pg_temp
as $$
  delete from atelier.login_attempts where attempted_at < now() - interval '1 day';
  insert into atelier.login_attempts (email, ip, success) values (lower(left(p_email, 254)), left(p_ip, 64), p_success);
$$;

create function atelier.auth_create_session(p_user_id uuid, p_token_hash text, p_ttl_seconds int) returns void
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if not exists (select 1 from atelier.users where id = p_user_id and active) then
    raise exception 'inactive user' using errcode = '42501';
  end if;
  delete from atelier.sessions where expires_at < now();
  insert into atelier.sessions (token_hash, user_id, expires_at)
  values (p_token_hash, p_user_id, now() + make_interval(secs => p_ttl_seconds));
end
$$;

-- Returns the user for a valid session and slides its expiry forward.
create function atelier.auth_resolve_session(p_token_hash text, p_ttl_seconds int)
returns table (id uuid, email text, display_name text, role atelier.user_role, locale text)
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  update atelier.sessions s set last_seen_at = now(), expires_at = now() + make_interval(secs => p_ttl_seconds)
  where s.token_hash = p_token_hash and s.expires_at > now() and s.last_seen_at < now() - interval '10 minutes';
  return query
    select u.id, u.email, u.display_name, u.role, u.locale
    from atelier.sessions s join atelier.users u on u.id = s.user_id
    where s.token_hash = p_token_hash and s.expires_at > now() and u.active;
end
$$;

create function atelier.auth_delete_session(p_token_hash text) returns void
language sql security definer set search_path = atelier, pg_temp
as $$ delete from atelier.sessions where token_hash = p_token_hash $$;

-- Owner can reset anyone's password; a user can change their own. Other sessions are revoked.
create function atelier.auth_set_password(p_user_id uuid, p_hash text, p_keep_token_hash text) returns void
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if not (atelier.is_owner() or atelier.current_user_id() = p_user_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update atelier.users set password_hash = p_hash where id = p_user_id;
  delete from atelier.sessions where user_id = p_user_id and token_hash is distinct from p_keep_token_hash;
end
$$;

-- Deactivating a user must also end their sessions.
create function atelier.tg_user_deactivated() returns trigger
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if old.active and not new.active then
    delete from atelier.sessions where user_id = new.id;
  end if;
  return null;
end
$$;
create trigger users_deactivated after update on atelier.users
  for each row execute function atelier.tg_user_deactivated();

revoke all on all functions in schema atelier from public;
grant execute on function atelier.current_user_id(), atelier.current_user_role(), atelier.is_member(),
  atelier.is_owner(), atelier.next_reference(text), atelier.week_start(date),
  atelier.order_transition_allowed(atelier.order_status, atelier.order_status),
  atelier.auth_find_user(text), atelier.auth_is_throttled(text, text), atelier.auth_record_attempt(text, text, boolean),
  atelier.auth_create_session(uuid, text, int), atelier.auth_resolve_session(text, int),
  atelier.auth_delete_session(text), atelier.auth_set_password(uuid, text, text)
  to atelier_app;
