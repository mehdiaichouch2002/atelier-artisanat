// Row Level Security and privilege tests: the restricted app role must not be able to read or
// change data without a valid member context, and managers must not perform owner-only actions.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, app, asUser, createUser, defaultAccount, resetData } from "./helpers";

let owner: string;
let manager: string;
let inactive: string;
let account: string;

beforeAll(async () => {
  owner = await createUser("owner");
  manager = await createUser("manager");
  inactive = await createUser("manager", false);
});
beforeEach(async () => {
  await resetData();
  account = await defaultAccount();
  await admin`insert into atelier.customers (name, created_by) values ('Client RLS', ${owner})`;
});
afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("row level security", () => {
  it("returns nothing and refuses writes without a user context", async () => {
    expect(await asUser(null, (tx) => tx`select * from atelier.customers`)).toHaveLength(0);
    expect(await asUser(null, (tx) => tx`select * from atelier.ledger_entries`)).toHaveLength(0);
    expect(await asUser(null, (tx) => tx`select * from atelier.v_account_balances`)).toHaveLength(0);
    await expect(asUser(null, (tx) => tx`insert into atelier.customers (name) values ('x')`)).rejects.toBeTruthy();
    await expect(asUser(null, (tx) => tx`select atelier.next_reference('TX')`)).rejects.toMatchObject({ code: "42501" });
  });

  it("treats a deactivated user, or a random id, like an anonymous one", async () => {
    expect(await asUser(inactive, (tx) => tx`select * from atelier.customers`)).toHaveLength(0);
    expect(await asUser("00000000-0000-0000-0000-000000000000", (tx) => tx`select * from atelier.customers`)).toHaveLength(0);
  });

  it("lets members read operational data", async () => {
    expect(await asUser(manager, (tx) => tx`select * from atelier.customers`)).toHaveLength(1);
  });

  it("never exposes password hashes, sessions or login attempts to the app role", async () => {
    await expect(asUser(owner, (tx) => tx`select password_hash from atelier.users`)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(owner, (tx) => tx`select * from atelier.sessions`)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(owner, (tx) => tx`select * from atelier.login_attempts`)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(owner, (tx) => tx`select * from atelier.audit_log`)).resolves.toBeDefined();
    expect(await asUser(manager, (tx) => tx`select * from atelier.audit_log`)).toHaveLength(0);
  });

  it("blocks owner-only ledger types and reversals for managers", async () => {
    for (const type of ["opening_balance", "adjustment", "customer_refund"]) {
      await expect(
        asUser(manager, (tx) => tx`
          insert into atelier.ledger_entries (reference, entry_type, direction, amount_cents, account_id, occurred_at)
          values (${"T-" + type}, ${type}, 'in', 100, ${account}, now())`),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("blocks managers from users, settings and accounts administration", async () => {
    await expect(
      asUser(manager, (tx) => tx`insert into atelier.users (email, display_name, role, password_hash) values ('x@y.z', 'x', 'owner', 'h')`),
    ).rejects.toMatchObject({ code: "42501" });
    const r1 = await asUser(manager, (tx) => tx`update atelier.users set role = 'owner' where id = ${manager}`);
    expect(r1.count).toBe(0);
    const r2 = await asUser(manager, (tx) => tx`update atelier.settings set workshop_name = 'hack'`);
    expect(r2.count).toBe(0);
    await expect(asUser(manager, (tx) => tx`insert into atelier.cash_accounts (name) values ('x')`)).rejects.toMatchObject({ code: "42501" });
  });

  it("forbids deletes on financial tables and spoofed authorship", async () => {
    await expect(asUser(owner, (tx) => tx`delete from atelier.customers`)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(owner, (tx) => tx`delete from atelier.ledger_entries`)).rejects.toMatchObject({ code: "42501" });
    const [c] = await asUser(manager, (tx) => tx<{ created_by: string }[]>`
      insert into atelier.customers (name, created_by) values ('spoof', ${owner}) returning created_by`);
    expect(c!.created_by).toBe(manager);
  });

  it("keeps at least one active owner", async () => {
    await expect(asUser(owner, (tx) => tx`update atelier.users set active = false where role = 'owner'`)).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("only lets a user change their own password unless owner", async () => {
    await expect(asUser(manager, (tx) => tx`select atelier.auth_set_password(${owner}, 'x', null)`)).rejects.toMatchObject({
      code: "42501",
    });
    await asUser(manager, (tx) => tx`select atelier.auth_set_password(${manager}, 'scrypt$new', null)`);
  });

  it("throttles repeated failed logins", async () => {
    const email = "brute@test.local";
    for (let i = 0; i < 5; i++) await app`select atelier.auth_record_attempt(${email}, '1.2.3.4', false)`;
    const [r] = await app<{ t: boolean }[]>`select atelier.auth_is_throttled(${email}, '9.9.9.9') as t`;
    expect(r!.t).toBe(true);
    const [r2] = await app<{ t: boolean }[]>`select atelier.auth_is_throttled('other@test.local', '9.9.9.9') as t`;
    expect(r2!.t).toBe(false);
  });

  it("resolves sessions only for active users and before expiry", async () => {
    await app`select atelier.auth_create_session(${owner}, 'hash-1', 3600)`;
    const [u] = await app<{ id: string }[]>`select * from atelier.auth_resolve_session('hash-1', 3600)`;
    expect(u!.id).toBe(owner);
    await app`select atelier.auth_create_session(${owner}, 'hash-2', 0)`;
    expect(await app`select * from atelier.auth_resolve_session('hash-2', 3600)`).toHaveLength(0);
    await expect(app`select atelier.auth_create_session(${inactive}, 'hash-3', 3600)`).rejects.toMatchObject({ code: "42501" });
  });
});
