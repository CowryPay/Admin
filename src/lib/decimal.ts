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
