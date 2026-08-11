/*
 * Client-side CSV export. Everything here serializes JSON the page has already
 * fetched — there is no export endpoint on the backend and no second request,
 * so what lands in the file is exactly what was on screen when the button was
 * pressed (including whatever filter the Sends page had applied).
 *
 * Money is written as the plain decimal string the backend sent: no currency
 * symbol, no thousands separator, no rounding. A spreadsheet can then parse it
 * as a number if it wants to; the file itself never loses precision.
 */

function escapeCell(value: string): string {
  // Quote only when the value would otherwise break the row, and double any
  // embedded quotes — the standard CSV escape.
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** `cowrypay-admin-overview-2026-08-11.csv` */
export function adminCsvFilename(page: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `cowrypay-admin-${page}-${today}.csv`;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Long format — `section,label,metric,value`, one row per number.
 *
 * Overview and Metrics are nested objects of scalars *and* variable-length
 * breakdowns (wallets by chain, balances by chain+token, volume by chain), which
 * don't share a column shape. Flattening them into one wide row per page would
 * mean a header that changes every time a new chain appears. Long format holds
 * every number from every section in one file with a stable header, which is
 * what makes "every number visible on screen is present in its export" checkable
 * rather than aspirational.
 */
export const LONG_FORMAT_HEADER = ["section", "label", "metric", "value"];
