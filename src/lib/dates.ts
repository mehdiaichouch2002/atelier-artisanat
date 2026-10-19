// Calendar helpers. Business dates are plain "YYYY-MM-DD" strings in the workshop time zone
// (Africa/Casablanca); instants are ISO strings / Date objects in UTC.

export const TIME_ZONE = "Africa/Casablanca";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

function parts(date: Date, timeZone = TIME_ZONE) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return {
    date: `${out.year}-${out.month}-${out.day}`,
    time: `${out.hour}:${out.minute}`,
    seconds: out.second ?? "00",
  };
}

/** Business date (YYYY-MM-DD) of an instant in the workshop time zone. */
export function toLocalDate(instant: Date | string): string {
  return parts(new Date(instant)).date;
}

/** "YYYY-MM-DDTHH:mm" in the workshop time zone, suitable for <input type="datetime-local">. */
export function toLocalDateTimeInput(instant: Date | string): string {
  const p = parts(new Date(instant));
  return `${p.date}T${p.time}`;
}

export function todayLocal(now: Date = new Date()): string {
  return toLocalDate(now);
}

/** Converts a local wall-clock time in the workshop zone ("YYYY-MM-DDTHH:mm") to a UTC Date. */
export function localDateTimeToInstant(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new RangeError(`Invalid local date-time: ${local}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Iterate: guess the offset, then correct using the zone's offset at the guessed instant.
  let guess = asUtc;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess));
    const [py, pmo, pd] = p.date.split("-").map(Number) as [number, number, number];
    const [ph, pmi] = p.time.split(":").map(Number) as [number, number];
    const shown = Date.UTC(py, pmo - 1, pd, ph, pmi);
    const diff = shown - asUtc;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** Midnight at the start of a local business date, as a UTC instant. */
export function startOfLocalDay(date: string): Date {
  return localDateTimeToInstant(`${date}T00:00`);
}

export function addDays(date: string, days: number): string {
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** First day of the pay week containing `date`, for a week starting on `weekStartDay`. */
export function weekStart(date: string, weekStartDay: number): string {
  const offset = (dayOfWeek(date) - weekStartDay + 7) % 7;
  return addDays(date, -offset);
}

export function weekEnd(weekStartDate: string): string {
  return addDays(weekStartDate, 6);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** dd/mm/yyyy with Latin digits, for every language. */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const iso = typeof date === "string" && isIsoDate(date) ? date : toLocalDate(date);
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** dd/mm/yyyy HH:mm in the workshop time zone. */
export function formatDateTime(instant: string | Date | null | undefined): string {
  if (!instant) return "";
  const p = parts(new Date(instant));
  return `${formatDate(p.date)} ${p.time}`;
}

export type PeriodKey = "today" | "week" | "month" | "custom";

export interface Period {
  key: PeriodKey;
  from: string; // inclusive local date
  to: string; // inclusive local date
}

export function resolvePeriod(
  key: string | undefined,
  from: string | undefined,
  to: string | undefined,
  weekStartDay: number,
  today = todayLocal(),
): Period {
  if (key === "custom" && from && to && isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { key: "custom", from, to };
  }
  if (key === "today") return { key: "today", from: today, to: today };
  if (key === "month") {
    const first = `${today.slice(0, 8)}01`;
    const next = addDays(`${today.slice(0, 8)}28`, 4);
    const last = addDays(`${next.slice(0, 8)}01`, -1);
    return { key: "month", from: first, to: last };
  }
  const ws = weekStart(today, weekStartDay);
  return { key: "week", from: ws, to: weekEnd(ws) };
}

/** UTC bounds [start, end) of an inclusive local date range. */
export function periodBounds(period: { from: string; to: string }): { start: Date; end: Date } {
  return { start: startOfLocalDay(period.from), end: startOfLocalDay(addDays(period.to, 1)) };
}
