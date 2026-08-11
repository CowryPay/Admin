"use client";

import type { TooltipProps } from "recharts";

type Row = { name: string; color: string; display: string };

/**
 * Shared tooltip body. Values are handed in as pre-formatted strings by the
 * caller — for money charts that string is the backend's own decimal string,
 * not the number recharts used to size the mark.
 *
 * Labels stay in text ink; the series color appears only as a swatch beside
 * them, so identity is carried by a mark rather than by colored text.
 */
function TooltipShell({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-xl border border-cowry-border bg-cowry-dark/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1.5 text-xs font-semibold text-white">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: row.color }}
            />
            <span className="text-cowry-muted">{row.name}</span>
            <span className="tabular ml-auto pl-3 font-medium text-white">{row.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `displayKey` names a field carried on each datum holding the exact string to
 * show (e.g. `sentUsdcDisplay`). When absent the numeric value is shown, which
 * is correct for counts — they're integers, so there's nothing to lose.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  displayKeys,
}: TooltipProps<number, string> & { displayKeys?: Record<string, string> }) {
  if (!active || !payload?.length) return null;

  const rows: Row[] = payload.map((entry) => {
    const datum = entry.payload as Record<string, unknown>;
    const displayKey = entry.dataKey ? displayKeys?.[String(entry.dataKey)] : undefined;
    const display = displayKey && datum[displayKey] != null ? String(datum[displayKey]) : String(entry.value ?? "");
    return {
      name: entry.name ? String(entry.name) : String(entry.dataKey ?? ""),
      color: entry.color ?? "#ffffff",
      display,
    };
  });

  return <TooltipShell title={String(label ?? "")} rows={rows} />;
}
