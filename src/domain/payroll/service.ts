// Weekly settlement, advances (msrouf) and worker earnings persistence.
import type { Tx } from "@/lib/db-types";
import { addDays, toLocalDate, weekStart } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import type { Cents } from "@/lib/money";
import { getSettings } from "@/domain/settings/service";
import {
  assertActiveAccount,
  findByIdempotencyKey,
  insertEntry,
  listEntries,
  type LedgerEntry,
} from "@/domain/ledger/service";
import type { ExpenseCategory, PayMethod } from "@/domain/ledger/logic";
import {
  carryForward,
  checkSettlementPayment,
  computeBasePay,
  EMPTY_WEEK,
  summarizeWeek,
  summarizeWithProposal,
  type AdvanceCategory,
  type AdvanceTreatment,
  type Arrangement,
  type PayKind,
  type WeekComponents,
  type WeekSummary,
} from "./logic";

type WeekRow = {
  worker_id: string;
  pay_week: string;
  base_cents: number;
  has_base: boolean;
  adjustments_cents: number;
  carry_cents: number;
  wage_advances_cents: number;
  business_advances_cents: number;
  payments_cents: number;
};

function toComponents(r: WeekRow | undefined): WeekComponents {
  if (!r) return EMPTY_WEEK;
  return {
    baseCents: r.base_cents,
    hasBase: r.has_base,
    adjustmentsCents: r.adjustments_cents,
    carryCents: r.carry_cents,
    wageAdvancesCents: r.wage_advances_cents,
    businessAdvancesCents: r.business_advances_cents,
    paymentsCents: r.payments_cents,
  };
}

/** Normalises any date to the first day of its pay week. */
export async function payWeekOf(tx: Tx, date: string): Promise<string> {
  const s = await getSettings(tx);
  return weekStart(date, s.weekStartDay);
}

type ArrangementRow = {
  id: string;
  full_name: string;
  code: string | null;
  active: boolean;
  pay_kind: PayKind;
  weekly_amount_cents: number | null;
  daily_rate_cents: number | null;
  piece_rate_cents: number | null;
  default_days: string | null;
};

function toArrangement(r: ArrangementRow): Arrangement {
  return {
    payKind: r.pay_kind,
    weeklyAmountCents: r.weekly_amount_cents,
    dailyRateCents: r.daily_rate_cents,
    pieceRateCents: r.piece_rate_cents,
    defaultDays: r.default_days,
  };
}

export interface SettlementRow {
  workerId: string;
  fullName: string;
  code: string | null;
  active: boolean;
  arrangement: Arrangement;
  /** Base pay proposed from the arrangement when none is recorded yet (null when it needs input). */
  proposedBaseCents: Cents | null;
  week: WeekSummary;
  /** Unsettled balance of earlier weeks that was not carried forward. */
  previousBalanceCents: Cents;
}

/**
 * Settlement sheet for one pay week: every active worker, plus inactive workers with activity
 * in that week. Remaining amounts include a proposed base pay when none is recorded yet.
 */
export async function settlementSheet(tx: Tx, payWeek: string): Promise<SettlementRow[]> {
  const workers = await tx<ArrangementRow[]>`
    select w.id, w.full_name, w.code, w.active, w.pay_kind, w.weekly_amount_cents, w.daily_rate_cents,
           w.piece_rate_cents, w.default_days::text as default_days
    from atelier.workers w
    where w.active or exists (select 1 from atelier.v_worker_weeks ww where ww.worker_id = w.id and ww.pay_week = ${payWeek})
    order by lower(w.full_name)`;
  const weeks = await tx<WeekRow[]>`select * from atelier.v_worker_weeks where pay_week = ${payWeek}`;
  const previous = await tx<{ worker_id: string; balance: number }[]>`
    select worker_id, sum(remaining_cents)::bigint as balance from atelier.v_worker_weeks
    where pay_week < ${payWeek} group by worker_id`;
  const byWorker = new Map(weeks.map((w) => [w.worker_id, w]));
  const prevBy = new Map(previous.map((p) => [p.worker_id, p.balance]));
  return workers.map((w) => {
    const arrangement = toArrangement(w);
    const proposal = computeBasePay(arrangement);
    const comps = toComponents(byWorker.get(w.id));
    return {
      workerId: w.id,
      fullName: w.full_name,
      code: w.code,
      active: w.active,
      arrangement,
      proposedBaseCents: proposal?.amountCents ?? null,
      week: summarizeWithProposal(comps, comps.hasBase ? null : (proposal?.amountCents ?? null)),
      previousBalanceCents: prevBy.get(w.id) ?? 0,
    };
  });
}

export interface WorkerWeekDetail {
  workerId: string;
  fullName: string;
  active: boolean;
  payWeek: string;
  arrangement: Arrangement;
  week: WeekSummary; // recorded values only (no proposal)
  proposedBaseCents: Cents | null;
  earnings: EarningLine[];
  entries: LedgerEntry[];
}

export interface EarningLine {
  id: string;
  basis: string;
  quantity: string | null;
  rateCents: Cents | null;
  amountCents: Cents;
  note: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  createdByName: string | null;
}

async function lockWorker(tx: Tx, workerId: string): Promise<ArrangementRow> {
  const [w] = await tx<ArrangementRow[]>`
    select id, full_name, code, active, pay_kind, weekly_amount_cents, daily_rate_cents, piece_rate_cents,
           default_days::text as default_days
    from atelier.workers where id = ${workerId} for update`;
  if (!w) throw new AppError("not_found", "worker");
  return w;
}

export async function weekComponents(tx: Tx, workerId: string, payWeek: string): Promise<WeekComponents> {
  const [r] = await tx<WeekRow[]>`
    select * from atelier.v_worker_weeks where worker_id = ${workerId} and pay_week = ${payWeek}`;
  return toComponents(r);
}

export async function listEarnings(tx: Tx, workerId: string, payWeek?: string): Promise<EarningLine[]> {
  return tx<EarningLine[]>`
    select e.id, e.basis, e.quantity::text as quantity, e.rate_cents as "rateCents", e.amount_cents as "amountCents",
           e.note, e.voided_at as "voidedAt", e.void_reason as "voidReason", e.created_at as "createdAt",
           u.display_name as "createdByName", e.pay_week as "payWeek"
    from atelier.worker_earnings e left join atelier.users u on u.id = e.created_by
    where e.worker_id = ${workerId} ${payWeek ? tx`and e.pay_week = ${payWeek}` : tx``}
    order by e.pay_week desc, e.created_at`;
}

export async function workerWeekDetail(tx: Tx, workerId: string, payWeek: string): Promise<WorkerWeekDetail> {
  const [w] = await tx<ArrangementRow[]>`
    select id, full_name, code, active, pay_kind, weekly_amount_cents, daily_rate_cents, piece_rate_cents,
           default_days::text as default_days
    from atelier.workers where id = ${workerId}`;
  if (!w) throw new AppError("not_found", "worker");
  const arrangement = toArrangement(w);
  const { rows: list } = await listEntries(
    tx,
    { workerId, payWeek, types: ["worker_advance", "worker_payment"] },
    { limit: 500, offset: 0 },
  );
  return {
    workerId,
    fullName: w.full_name,
    active: w.active,
    payWeek,
    arrangement,
    week: summarizeWeek(await weekComponents(tx, workerId, payWeek)),
    proposedBaseCents: computeBasePay(arrangement)?.amountCents ?? null,
    earnings: await listEarnings(tx, workerId, payWeek),
    entries: list,
  };
}

/** Records the agreed base pay of a week (once per worker and week). */
export async function recordBasePay(
  tx: Tx,
  input: {
    workerId: string;
    payWeek: string;
    quantity?: string | null;
    amountCents?: Cents | null;
    note?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<string> {
  if (input.idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`
      select id from atelier.worker_earnings where idempotency_key = ${input.idempotencyKey}`;
    if (prior) return prior.id;
  }
  const w = await lockWorker(tx, input.workerId);
  if (input.payWeek !== (await payWeekOf(tx, input.payWeek))) throw new AppError("invalid", "pay_week");
  const comps = await weekComponents(tx, input.workerId, input.payWeek);
  if (comps.hasBase) throw new AppError("duplicate", "base_pay_exists");
  const base = computeBasePay(toArrangement(w), {
    quantity: input.quantity ?? null,
    amountCents: input.amountCents ?? null,
  });
  // The owner may override a weekly amount for one week (e.g. a short week): record it as negotiated.
  const final =
    base && input.amountCents != null && base.basis === "weekly" && input.amountCents !== base.amountCents
      ? { basis: "negotiated" as const, quantity: null, rateCents: null, amountCents: input.amountCents }
      : base ??
        (input.amountCents != null
          ? { basis: "negotiated" as const, quantity: null, rateCents: null, amountCents: input.amountCents }
          : null);
  if (!final) throw new AppError("invalid", "base_pay_input");
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.worker_earnings (worker_id, pay_week, basis, quantity, rate_cents, amount_cents, note,
      idempotency_key)
    values (${input.workerId}, ${input.payWeek}, ${final.basis}, ${final.quantity}, ${final.rateCents},
      ${final.amountCents}, ${input.note ?? null}, ${input.idempotencyKey ?? null})
    returning id`;
  return r!.id;
}

/** Bonus or correction (positive or negative) for a week, with a mandatory note. */
export async function recordAdjustment(
  tx: Tx,
  input: {
    workerId: string;
    payWeek: string;
    basis: "bonus" | "adjustment";
    amountCents: Cents;
    note: string;
    idempotencyKey?: string | null;
  },
): Promise<string> {
  if (input.idempotencyKey) {
    const [prior] = await tx<{ id: string }[]>`
      select id from atelier.worker_earnings where idempotency_key = ${input.idempotencyKey}`;
    if (prior) return prior.id;
  }
  await lockWorker(tx, input.workerId);
  if (input.amountCents === 0) throw new AppError("invalid", "zero_amount");
  if (input.basis === "bonus" && input.amountCents < 0) throw new AppError("invalid", "negative_bonus");
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.worker_earnings (worker_id, pay_week, basis, amount_cents, note, idempotency_key)
    values (${input.workerId}, ${input.payWeek}, ${input.basis}, ${input.amountCents}, ${input.note},
      ${input.idempotencyKey ?? null})
    returning id`;
  return r!.id;
}

/**
 * Pays (part of) what is owed for a week. If the week's base pay is not recorded yet it is
 * recorded first, in the same transaction, from the arrangement or the given amount.
 * The worker row is locked so two simultaneous payments cannot both pass the remaining check.
 */
export async function recordSettlementPayment(
  tx: Tx,
  input: {
    workerId: string;
    payWeek: string;
    amountCents: Cents;
    occurredAt: Date;
    accountId: string;
    method: PayMethod;
    note?: string | null;
    baseQuantity?: string | null;
    baseAmountCents?: Cents | null;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry> {
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return prior;
  const w = await lockWorker(tx, input.workerId);
  if (!w.active) throw new AppError("invalid", "worker_inactive");
  if (input.payWeek !== (await payWeekOf(tx, input.payWeek))) throw new AppError("invalid", "pay_week");
  await assertActiveAccount(tx, input.accountId);
  let comps = await weekComponents(tx, input.workerId, input.payWeek);
  if (!comps.hasBase && (input.baseQuantity != null || input.baseAmountCents != null || w.pay_kind === "weekly")) {
    await recordBasePay(tx, {
      workerId: input.workerId,
      payWeek: input.payWeek,
      quantity: input.baseQuantity,
      amountCents: input.baseAmountCents,
    });
    comps = await weekComponents(tx, input.workerId, input.payWeek);
  }
  const summary = summarizeWeek(comps);
  const check = checkSettlementPayment(input.amountCents, summary.remainingCents);
  if (!check.ok) throw new AppError(check.reason === "exceeds_remaining" ? "overpayment" : "invalid", check.reason);
  const { entry } = await insertEntry(tx, {
    entryType: "worker_payment",
    direction: "out",
    amountCents: input.amountCents,
    accountId: input.accountId,
    method: input.method,
    occurredAt: input.occurredAt,
    description: input.note ?? null,
    workerId: input.workerId,
    payWeek: input.payWeek,
    idempotencyKey: input.idempotencyKey,
  });
  return entry;
}

/** Records a msrouf / cash advance. Allocated to the pay week of its date unless given. */
export async function recordAdvance(
  tx: Tx,
  input: {
    workerId: string;
    amountCents: Cents;
    occurredAt: Date;
    category: AdvanceCategory;
    treatment: AdvanceTreatment;
    expenseCategory?: ExpenseCategory | null;
    accountId: string;
    method: PayMethod;
    note?: string | null;
    orderId?: string | null;
    payWeek?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<LedgerEntry> {
  const prior = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (prior) return prior;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new AppError("invalid", "amount");
  await assertActiveAccount(tx, input.accountId);
  const payWeek = await payWeekOf(tx, input.payWeek ?? toLocalDate(input.occurredAt));
  const expenseCategory =
    input.treatment === "business"
      ? (input.expenseCategory ?? (input.category === "materials" ? "materials" : input.category === "food_transport" ? "transport" : "other"))
      : null;
  const { entry } = await insertEntry(tx, {
    entryType: "worker_advance",
    direction: "out",
    amountCents: input.amountCents,
    accountId: input.accountId,
    method: input.method,
    occurredAt: input.occurredAt,
    description: input.note ?? null,
    workerId: input.workerId,
    orderId: input.orderId ?? null,
    payWeek,
    advanceCategory: input.category,
    advanceTreatment: input.treatment,
    expenseCategory,
    idempotencyKey: input.idempotencyKey,
  });
  return entry;
}

/** Moves the remaining balance of a week (owed or over-advanced) to the next week. */
export async function carryBalanceForward(
  tx: Tx,
  input: { workerId: string; payWeek: string; note?: string | null },
): Promise<{ carriedCents: Cents; toWeek: string } | null> {
  await lockWorker(tx, input.workerId);
  const summary = summarizeWeek(await weekComponents(tx, input.workerId, input.payWeek));
  const lines = carryForward(summary.remainingCents);
  if (!lines) return null;
  const toWeek = addDays(input.payWeek, 7);
  const [g] = await tx<{ g: string }[]>`select gen_random_uuid() as g`;
  await tx`
    insert into atelier.worker_earnings (worker_id, pay_week, basis, amount_cents, note, carry_group)
    values (${input.workerId}, ${input.payWeek}, 'carry_out', ${lines.carryOutCents}, ${input.note ?? null}, ${g!.g}),
           (${input.workerId}, ${toWeek}, 'carry_in', ${lines.carryInCents}, ${input.note ?? null}, ${g!.g})`;
  return { carriedCents: lines.carryInCents, toWeek };
}

/** Voids an earnings line (owner only). Carry lines are voided as a pair. */
export async function voidEarning(tx: Tx, input: { id: string; reason: string }): Promise<void> {
  const [e] = await tx<{ id: string; carry_group: string | null; voided_at: Date | null; worker_id: string }[]>`
    select id, carry_group, voided_at, worker_id from atelier.worker_earnings where id = ${input.id}`;
  if (!e) throw new AppError("not_found");
  if (e.voided_at) throw new AppError("conflict", "already_voided");
  await lockWorker(tx, e.worker_id);
  const r = await tx`
    update atelier.worker_earnings
    set voided_at = now(), voided_by = atelier.current_user_id(), void_reason = ${input.reason}
    where voided_at is null and ${e.carry_group ? tx`carry_group = ${e.carry_group}` : tx`id = ${e.id}`}`;
  if (r.count === 0) throw new AppError("forbidden");
}

export interface WorkerWeekHistory extends WeekSummary {
  payWeek: string;
}

export async function workerWeeks(tx: Tx, workerId: string, limit = 26): Promise<WorkerWeekHistory[]> {
  const rows = await tx<WeekRow[]>`
    select * from atelier.v_worker_weeks where worker_id = ${workerId} order by pay_week desc limit ${limit}`;
  return rows.map((r) => ({ payWeek: r.pay_week, ...summarizeWeek(toComponents(r)) }));
}

export interface WorkerPeriodTotals {
  wageAdvancesCents: Cents;
  businessAdvancesCents: Cents;
  paymentsCents: Cents;
  earnedCents: Cents;
}

/** Totals for weeks starting within [fromWeek, toWeek]. */
export async function workerPeriodTotals(
  tx: Tx,
  workerId: string,
  fromWeek: string,
  toWeek: string,
): Promise<WorkerPeriodTotals> {
  const [r] = await tx<{ wage: number; biz: number; paid: number; earned: number }[]>`
    select coalesce(sum(wage_advances_cents), 0)::bigint as wage,
           coalesce(sum(business_advances_cents), 0)::bigint as biz,
           coalesce(sum(payments_cents), 0)::bigint as paid,
           coalesce(sum(base_cents + adjustments_cents), 0)::bigint as earned
    from atelier.v_worker_weeks
    where worker_id = ${workerId} and pay_week between ${fromWeek} and ${toWeek}`;
  return {
    wageAdvancesCents: r?.wage ?? 0,
    businessAdvancesCents: r?.biz ?? 0,
    paymentsCents: r?.paid ?? 0,
    earnedCents: r?.earned ?? 0,
  };
}
