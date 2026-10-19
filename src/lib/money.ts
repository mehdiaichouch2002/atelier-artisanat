// Money is handled as integer centimes (1 DH = 100 centimes). No floating point arithmetic.

export type Cents = number;

export const MAX_CENTS = 100_000_000_000; // 1 000 000 000,00 DH — far above any realistic amount

/** Throws when a value is not a safe integer amount of centimes. */
export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Invalid money amount: ${value}`);
  }
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return assertCents(total);
}

/**
 * Parses user input like "1 250,50", "1250.5", "1.250,50", "250" into centimes.
 * Returns null when the input is not a valid amount. Works on the string, never via floats.
 */
export function parseMoney(input: string | null | undefined): Cents | null {
  if (input == null) return null;
  let s = String(input)
    .trim()
    .replace(/\s| | /g, "")
    .replace(/(dh|mad|درهم)$/i, "");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  // Decide which separator is the decimal one: the last of "," or "." followed by 1–2 digits.
  const m = /^(.*?)(?:([.,])(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const intPartRaw = m[1] ?? "";
  const frac = m[3] ?? "";
  // The decimal symbol cannot also be used as a thousands separator ("12,345,6").
  if (m[2] && intPartRaw.includes(m[2])) return null;
  // Thousands separators (the other symbol) may appear in groups of three.
  const intPart = intPartRaw.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "");
  if (!/^\d+$/.test(intPart)) return null;
  if (intPart.length > 12) return null;
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

const NBSP = " ";

/** Groups digits by 3 with a non-breaking space: 1250 -> "1 250". Latin digits only. */
function groupThousands(n: bigint): string {
  const s = n.toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NBSP;
    out += s[i];
  }
  return out;
}

/** Formats centimes as "1 250,00 DH" (same format in every language, Latin digits). */
export function formatMoney(cents: Cents, opts: { currency?: boolean; signed?: boolean } = {}): string {
  const { currency = true, signed = false } = opts;
  assertCents(cents);
  const negative = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  const sign = negative ? "-" : signed && cents > 0 ? "+" : "";
  return `${sign}${groupThousands(whole)},${frac}${currency ? `${NBSP}DH` : ""}`;
}

/** Value for an <input> (no currency, no grouping): 125050 -> "1250,50". */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents == null) return "";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Plain decimal for CSV exports: 125050 -> "1250,50" (French decimal comma). */
export function centsToCsv(cents: Cents): string {
  return centsToInput(cents);
}

/** Multiplies a rate by a decimal quantity (e.g. 5.5 days) with half-up rounding to the centime. */
export function multiplyRate(rateCents: Cents, quantity: string | number): Cents {
  assertCents(rateCents);
  const q = String(quantity).replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(q)) throw new RangeError(`Invalid quantity: ${quantity}`);
  const [i = "0", f = ""] = q.split(".");
  const hundredths = BigInt(i) * 100n + BigInt(f.padEnd(2, "0"));
  const product = BigInt(rateCents) * hundredths; // in 1/100 of a centime
  const rounded = (product + 50n) / 100n;
  return assertCents(Number(rounded));
}
