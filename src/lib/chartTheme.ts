/*
 * Recharts takes real color values as props, not Tailwind class names, so the
 * chart palette is duplicated here as hex. Keep in sync with the `chart`,
 * `series` and `status` scales in tailwind.config.ts — that file carries the
 * reasoning for why these specific steps were chosen.
 *
 * Series slots are assigned in fixed order and never cycled: SERIES[0] is
 * always the primary measure (sends / sent volume / fees), SERIES[1] always the
 * secondary (deposits / deposited volume). A chart that filters down to fewer
 * series keeps the survivors on their original slot — color follows the entity,
 * never its rank.
 */

export const SERIES = ["#199e70", "#d95926", "#9085e9"] as const;

export const CHART = {
  grid: "#2c2c2a",
  axis: "#383835",
  label: "#898781",
  ink: "#ffffff",
  inkMuted: "#c3c2b7",
  surface: "#141414",
} as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Shared axis/tick styling — recessive, so the marks carry the chart. */
export const AXIS_TICK = { fill: CHART.label, fontSize: 11 } as const;
