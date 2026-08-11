"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, SERIES } from "@/lib/chartTheme";
import { ChartTooltip } from "./ChartTooltip";
import { EmptyState } from "@/components/ui/States";

export type CategoryDatum = {
  label: string;
  value: number;
  /** Exact string to display, when `value` is only geometry (money charts). */
  display?: string;
};

/**
 * One measure across nominal categories (wallets per chain, sends per state).
 *
 * Horizontal, because the categories here are backend enum values like
 * PAYOUT_INITIATED and DEPOSIT_COMPLIANCE_SCREENING — as vertical bars those
 * ticks would have to be rotated or truncated. Every bar takes the same series
 * slot: there is one series, and coloring nominal bars by their own value would
 * spend the identity channel re-encoding what bar length already shows. With
 * one series there's no legend — the card title names the measure.
 */
export function CategoryBar({
  data,
  emptyLabel = "No data yet",
  colorIndex = 0,
}: {
  data: CategoryDatum[];
  emptyLabel?: string;
  colorIndex?: 0 | 1 | 2;
}) {
  if (!data.length) return <EmptyState label={emptyLabel} />;

  // Grows with the category count so bars keep a constant thickness instead of
  // stretching to fill a fixed height.
  const height = Math.max(140, data.length * 34 + 24);

  // Money charts carry the backend's exact decimal string in `display`; counts
  // don't need one. Labelling straight off that field keeps the rendered number
  // the backend's own, never the float recharts used to size the bar.
  const labelKey = data.some((d) => d.display !== undefined) ? "display" : "value";

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
            width={132}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<ChartTooltip displayKeys={{ value: "display" }} />}
          />
          <Bar
            dataKey="value"
            name="Count"
            fill={SERIES[colorIndex]}
            radius={[0, 4, 4, 0]}
            barSize={14}
            isAnimationActive={false}
          >
            {/* Direct-labeled: few enough categories that every bar can carry
                its value, which also keeps the numbers readable without hover. */}
            <LabelList
              dataKey={labelKey}
              position="right"
              offset={8}
              fill={CHART.inkMuted}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
