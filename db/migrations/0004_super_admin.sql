-- Super administrator: the only account allowed to create, edit, deactivate users and reset their
-- passwords. Exactly one account can hold the flag; it must stay an active owner.
-- Set it with: OWNER_EMAIL=… npm run db:create-owner -- --super-admin
alter table atelier.users add column is_super_admin boolean not null default false;
alter table atelier.users add constraint users_super_admin_is_active_owner
  check (not is_super_admin or (role = 'owner' and active));
create unique index users_one_super_admin on atelier.users (is_super_admin) where is_super_admin;

create function atelier.is_super_admin() returns boolean
language sql stable security definer set search_path = atelier, pg_temp
as $$ select coalesce((select is_super_admin from atelier.users where id = atelier.current_user_id() and active), false) $$;
revoke all on function atelier.is_super_admin() from public;
grant execute on function atelier.is_super_admin() to atelier_app;

-- User administration moves from "any owner" to the super administrator only.
drop policy owner_insert on atelier.users;
drop policy owner_update on atelier.users;
create policy super_admin_insert on atelier.users for insert to atelier_app with check (atelier.is_super_admin());
create policy super_admin_update on atelier.users for update to atelier_app
  using (atelier.is_super_admin()) with check (atelier.is_super_admin());
grant select (is_super_admin) on atelier.users to atelier_app;

-- The super admin may reset anyone's password; everyone may change their own.
create or replace function atelier.auth_set_password(p_user_id uuid, p_hash text, p_keep_token_hash text) returns void
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  if not (atelier.is_super_admin() or atelier.current_user_id() = p_user_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update atelier.users set password_hash = p_hash where id = p_user_id;
  delete from atelier.sessions where user_id = p_user_id and token_hash is distinct from p_keep_token_hash;
end
$$;

-- Session lookup now also returns the flag (return type change requires drop + create).
drop function atelier.auth_resolve_session(text, int);
create function atelier.auth_resolve_session(p_token_hash text, p_ttl_seconds int)
returns table (id uuid, email text, display_name text, role atelier.user_role, locale text, is_super_admin boolean)
language plpgsql security definer set search_path = atelier, pg_temp
as $$
begin
  update atelier.sessions s set last_seen_at = now(), expires_at = now() + make_interval(secs => p_ttl_seconds)
  where s.token_hash = p_token_hash and s.expires_at > now() and s.last_seen_at < now() - interval '10 minutes';
  return query
    select u.id, u.email, u.display_name, u.role, u.locale, u.is_super_admin
    from atelier.sessions s join atelier.users u on u.id = s.user_id
    where s.token_hash = p_token_hash and s.expires_at > now() and u.active;
end
$$;
revoke all on function atelier.auth_resolve_session(text, int) from public;
grant execute on function atelier.auth_resolve_session(text, int) to atelier_app;
