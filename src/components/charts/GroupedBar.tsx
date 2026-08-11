"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, SERIES } from "@/lib/chartTheme";
import { ChartTooltip } from "./ChartTooltip";
import { EmptyState } from "@/components/ui/States";

export type GroupedSeries = {
  /** Numeric field on each datum — geometry only. */
  key: string;
  /** Field holding the exact string to display, for money series. */
  displayKey?: string;
  name: string;
};

/**
 * Two measures across the same categories (sends vs deposits per chain, sent
 * vs deposited volume per chain).
 *
 * Grouped rather than stacked: these pairs aren't parts of a whole — sends and
 * deposits are separate flows, and stacking them would invite reading the
 * combined height as a total that means nothing. Both series share one axis;
 * a second y-scale is never the answer here.
 */
export function GroupedBar({
  data,
  series,
  emptyLabel = "No data yet",
  height = 260,
}: {
  data: Record<string, unknown>[];
  series: [GroupedSeries, GroupedSeries];
  emptyLabel?: string;
  height?: number;
}) {
  if (!data.length) return <EmptyState label={emptyLabel} />;

  const displayKeys = Object.fromEntries(
    series.filter((s) => s.displayKey).map((s) => [s.key, s.displayKey as string]),
  );

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barGap={2}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: CHART.axis }} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip displayKeys={displayKeys} />} />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="square"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-cowry-muted">{value}</span>}
          />
          {series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              // Fixed slot by position in `series`, not by magnitude — the
              // primary measure keeps slot 1 even when it's the smaller bar.
              fill={SERIES[index]}
              radius={[4, 4, 0, 0]}
              barSize={16}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
