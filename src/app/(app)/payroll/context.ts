import "server-only";
import type { Tx } from "@/lib/db";
import { accountBalances } from "@/domain/ledger/service";
import { isIsoDate, todayLocal, toLocalDateTimeInput, weekStart } from "@/lib/dates";
import { getSettings } from "@/domain/settings/service";

export async function accountOptions(tx: Tx) {
  const accounts = await accountBalances(tx);
  return {
    accounts: accounts.map((a) => ({ value: a.accountId, label: a.name })),
    defaultAccountId: accounts.find((a) => a.isDefault)?.accountId ?? accounts[0]?.accountId ?? "",
  };
}

/** The pay week requested in the URL (any date is normalised to its week start). */
export async function resolveWeek(tx: Tx, requested: string | undefined) {
  const s = await getSettings(tx);
  const today = todayLocal();
  const currentWeek = weekStart(today, s.weekStartDay);
  const week = requested && isIsoDate(requested) ? weekStart(requested, s.weekStartDay) : currentWeek;
  return { week, currentWeek, weekStartDay: s.weekStartDay };
}

export function nowLocal() {
  return toLocalDateTimeInput(new Date());
}
