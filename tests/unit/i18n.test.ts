// Automated translation check: every text must exist in all four languages, every key used in the
// code must exist, and placeholders must match between languages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fr from "@/i18n/locales/fr.json";
import ar from "@/i18n/locales/ar.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import { hasKey, type Messages } from "@/i18n/translate";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { ORDER_PRIORITIES, ORDER_STATUSES } from "@/domain/orders/logic";
import { ENTRY_TYPES, EXPENSE_CATEGORIES, PAY_METHODS } from "@/domain/ledger/logic";
import { ADVANCE_CATEGORIES } from "@/domain/payroll/logic";
import { REPORT_KEYS } from "@/domain/reports/service";

const LOCALES: Record<string, Messages> = { fr, ar, en, es };

function flatten(m: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(m)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const NAMESPACES = Object.keys(fr).join("|");
// String literals that look like keys but are not translations.
const IGNORED = new Set(["app.user_id"]);

describe("translations", () => {
  const base = flatten(fr);

  it.each(["ar", "en", "es"])("%s has exactly the same keys as French", (loc) => {
    const other = flatten(LOCALES[loc]!);
    const missing = [...base.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !base.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(["ar", "en", "es"])("%s uses the same placeholders and has no empty text", (loc) => {
    const other = flatten(LOCALES[loc]!);
    const problems: string[] = [];
    for (const [k, v] of base) {
      const o = other.get(k);
      if (o === undefined) continue;
      if (!o.trim()) problems.push(`${k}: empty`);
      if (placeholders(v).join() !== placeholders(o).join()) problems.push(`${k}: placeholders differ`);
    }
    expect(problems).toEqual([]);
  });

  it("defines every key referenced literally in the source code", () => {
    const permissions = new Set<string>(ALL_PERMISSIONS);
    const re = new RegExp(`["'\`]((?:${NAMESPACES})\\.[A-Za-z0-9_.-]+)["'\`]`, "g");
    const missing = new Set<string>();
    for (const file of sourceFiles(path.resolve(import.meta.dirname, "../../src"))) {
      for (const m of readFileSync(file, "utf8").matchAll(re)) {
        const key = m[1]!;
        if (permissions.has(key) || key.endsWith(".") || IGNORED.has(key)) continue;
        if (!hasKey(fr, key)) missing.add(`${key} (${path.basename(file)})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("defines every dynamic key family", () => {
    const families: [string, readonly (string | number)[]][] = [
      ["orderStatus", ORDER_STATUSES],
      ["priority", ORDER_PRIORITIES],
      ["entryType", ENTRY_TYPES],
      ["print.receiptTitle", ENTRY_TYPES],
      ["expenseCategory", EXPENSE_CATEGORIES],
      ["method", PAY_METHODS],
      ["advanceCategory", ADVANCE_CATEGORIES],
      ["advanceTreatment", ["wage", "business", "wageHelp", "businessHelp"]],
      ["weekStatus", ["empty", "pending", "due", "partial", "settled", "overpaid"]],
      ["earningBasis", ["weekly", "daily", "piece", "negotiated", "bonus", "adjustment", "carry_in", "carry_out"]],
      ["payKind", ["weekly", "daily", "piece", "negotiated"]],
      ["paymentState", ["unpaid", "deposit", "paid", "credit"]],
      ["accountKind", ["cash", "bank", "other"]],
      ["roles", ["owner", "manager"]],
      ["category", ["babouches", "copper", "other"]],
      ["weekday", [0, 1, 2, 3, 4, 5, 6]],
      ["period", ["today", "week", "month", "custom"]],
      ["audit", ["insert", "update", "delete"]],
      ["direction", ["in", "out"]],
      ["errors", ["unauthenticated", "forbidden", "not_found", "invalid", "conflict", "duplicate", "overpayment", "rate_limited", "unexpected"]],
      ["permissions", ALL_PERMISSIONS.map((p) => p.replace(".", "_")).filter((p) => fr.permissions && p in fr.permissions)],
    ];
    const missing: string[] = [];
    for (const [prefix, members] of families) for (const m of members) if (!hasKey(fr, `${prefix}.${m}`)) missing.push(`${prefix}.${m}`);
    for (const r of REPORT_KEYS) for (const f of ["title", "description", "explanation"]) if (!hasKey(fr, `reports.list.${r}.${f}`)) missing.push(`reports.list.${r}.${f}`);
    expect(missing).toEqual([]);
  });

  it("lists every manager permission", async () => {
    const { MANAGER_PERMISSIONS } = await import("@/lib/auth/permissions");
    for (const p of MANAGER_PERMISSIONS) expect(hasKey(fr, `permissions.${p.replace(".", "_")}`)).toBe(true);
  });
});
