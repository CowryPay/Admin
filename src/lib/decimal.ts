/*
 * Money arrives from the backend as already-formatted decimal strings and is
 * rendered as-is. Nothing here ever calls Number() on one — a float round-trip
 * is exactly what the backend's own formatAmount() is written to avoid, and
 * re-introducing it in the dashboard would make the displayed figures disagree
 * with the ledger they're supposed to be reporting.
 *
 * The one unavoidable exception is chart geometry: a bar needs a pixel height,
 * and a pixel height is a number. That conversion is isolated in
 * `toChartValue()` below, is used only to size a mark, and is never what the
 * user reads — tooltips and labels are always handed the original string.
 */

/** Splits "123.4500" into sign, integer digits, and fraction digits. */
function parseDecimal(value: string): { negative: boolean; intPart: string; fracPart: string } | null {
  const trimmed = value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (!match[2] && !match[3])) return null;
  return {
    negative: match[1] === "-",
    intPart: match[2] || "0",
    fracPart: match[3] || "",
  };
}

/**
 * Compares two decimal strings exactly, via BigInt on a common scale — no
 * floats involved. Returns -1 / 0 / 1, or null if either side isn't a decimal
 * (so callers can degrade to "can't compare" rather than showing a wrong
 * verdict). Used by the treasury panel to decide whether the on-chain balance
 * and the ledger total actually agree.
 */
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (!left || !right) return null;

  const scale = Math.max(left.fracPart.length, right.fracPart.length);
  const toScaled = (d: { negative: boolean; intPart: string; fracPart: string }) => {
    const digits = d.intPart + d.fracPart.padEnd(scale, "0");
    const magnitude = BigInt(digits);
    return d.negative ? -magnitude : magnitude;
  };

  const l = toScaled(left);
  const r = toScaled(right);
  if (l < r) return -1;
  if (l > r) return 1;
  return 0;
}

/**
 * Exact difference of two decimal strings, as a decimal string — so the
 * treasury panel can show how far apart the two figures are without a float.
 * Returns null if either side isn't a decimal.
 */
export function subtractDecimalStrings(a: string, b: string): string | null {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (!left || !right) return null;

  const scale = Math.max(left.fracPart.length, right.fracPart.length);
  const toScaled = (d: { negative: boolean; intPart: string; fracPart: string }) => {
    const magnitude = BigInt(d.intPart + d.fracPart.padEnd(scale, "0"));
    return d.negative ? -magnitude : magnitude;
  };

  const diff = toScaled(left) - toScaled(right);
  const negative = diff < 0n;
  const digits = (negative ? -diff : diff).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale) || "0";
  const fracPart = scale > 0 ? digits.slice(digits.length - scale) : "";

  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
}

/**
 * Decimal string → number, for chart geometry ONLY (bar heights, line points).
 * Never render the result — render the original string. Non-numeric input
 * sizes to 0 rather than NaN, which recharts would drop silently.
 */
export function toChartValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Exact sum of decimal strings, as a decimal string — via BigInt on a common
 * scale, same approach as `subtractDecimalStrings`. Used for client-side
 * totals (e.g. "Total Volume") the backend reports as separate fields rather
 * than a pre-summed one. Non-decimal inputs are treated as "0" rather than
 * failing the whole sum, since a metrics dashboard should still total what it
 * can rather than blank out on one bad field.
 */
export function sumDecimalStrings(...values: string[]): string {
  let scale = 0;
  const parsedValues = values.map((value) => parseDecimal(value) ?? { negative: false, intPart: "0", fracPart: "" });
  for (const parsed of parsedValues) scale = Math.max(scale, parsed.fracPart.length);

  let total = 0n;
  for (const parsed of parsedValues) {
    const magnitude = BigInt(parsed.intPart + parsed.fracPart.padEnd(scale, "0"));
    total += parsed.negative ? -magnitude : magnitude;
  }

  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale) || "0";
  const fracPart = scale > 0 ? digits.slice(digits.length - scale) : "";

  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
}

/**
 * Decimal string → "$1,234.56" for display, rounded to exactly 2 decimal
 * places (half-up) via BigInt integer division — not a Number() round-trip.
 * A value with more precision (e.g. a client-side sum of several fields) is
 * rounded the same way a calculator would, not shown with every digit intact.
 *
 * Deliberately separate from the rest of this file's raw-string-only
 * convention: the Metrics page's headline USDC figures (volume and revenue)
 * are the one surface product asked to carry $/comma formatting client-side,
 * since the API intentionally returns them as plain numbers. Every other page
 * in the dashboard keeps rendering money verbatim.
 */
export function formatUsd(value: string): string {
  const parsed = parseDecimal(value);
  if (!parsed) return value;

  const scale = parsed.fracPart.length;
  const digits = parsed.intPart + parsed.fracPart;
  const magnitude = BigInt(digits === "" ? "0" : digits); // non-negative; sign is applied separately below

  let rounded: bigint;
  if (scale > 2) {
    const divisor = 10n ** BigInt(scale - 2);
    rounded = (magnitude + divisor / 2n) / divisor; // half-up
  } else if (scale < 2) {
    rounded = magnitude * 10n ** BigInt(2 - scale);
  } else {
    rounded = magnitude;
  }

  const roundedStr = rounded.toString().padStart(3, "0");
  const intPart = roundedStr.slice(0, roundedStr.length - 2) || "0";
  const fracPart = roundedStr.slice(-2);

  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${parsed.negative ? "-" : ""}$${grouped}.${fracPart}`;
}
