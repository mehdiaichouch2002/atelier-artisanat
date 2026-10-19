// Single definition of what each role may do. The database enforces the same rules with
// Row Level Security (db/migrations/0002_views_security.sql); this module drives server
// checks and which actions the UI offers.

export type Role = "owner" | "manager";

export const ALL_PERMISSIONS = [
  "workers.manage",
  "advances.record",
  "payroll.record",
  "payroll.void",
  "customers.manage",
  "orders.manage",
  "payments.record",
  "refunds.record",
  "expenses.record",
  "income.record",
  "ledger.reverse",
  "cash.count",
  "cash.adjust",
  "cash.transfer",
  "cash.opening",
  "accounts.manage",
  "settings.manage",
  "users.manage",
  "audit.view",
  "reports.view",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];


const MANAGER: ReadonlySet<Permission> = new Set<Permission>([
  "workers.manage",
  "advances.record",
  "payroll.record",
  "customers.manage",
  "orders.manage",
  "payments.record",
  "expenses.record",
  "income.record",
  "cash.count",
  "reports.view",
]);

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  // User administration is not tied to a role: see hasPermission() (super administrator only).
  if (permission === "users.manage") return false;
  if (role === "owner") return true;
  return MANAGER.has(permission);
}

export const MANAGER_PERMISSIONS = [...MANAGER];

/**
 * Permission check for a signed-in user. User administration ("users.manage") belongs to the single
 * super administrator, whatever the role; everything else follows the role.
 */
export function hasPermission(user: { role: Role; isSuperAdmin?: boolean } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (permission === "users.manage") return user.isSuperAdmin === true;
  return can(user.role, permission);
}
