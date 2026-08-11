"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, SERIES } from "@/lib/chartTheme";
import { ChartTooltip } from "./ChartTooltip";
import { EmptyState } from "@/components/ui/States";

export type TrendSeries = {
  key: string;
  displayKey?: string;
  name: string;
};

/**
 * Change over time, from GET /admin/metrics/timeseries. Lines rather than bars:
 * the question is shape (is this growing or flat), not the magnitude of any one
 * day. The backend zero-fills every day in the range, so gaps in activity show
 * as a line at zero rather than a broken series.
 */
export function TrendLines({
  data,
  series,
  height = 280,
  emptyLabel = "No settled activity in this window",
}: {
  data: Record<string, unknown>[];
  series: TrendSeries[];
  height?: number;
  emptyLabel?: string;
}) {
  if (!data.length) return <EmptyState label={emptyLabel} />;

  const displayKeys = Object.fromEntries(
    series.filter((s) => s.displayKey).map((s) => [s.key, s.displayKey as string]),
  );

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            // Crosshair — on a time series the pointer is rarely exactly on a
            // point, so the whole day is the hit target.
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={<ChartTooltip displayKeys={displayKeys} />}
          />
          {series.length > 1 ? (
            <Legend
              verticalAlign="top"
              align="left"
              height={28}
              iconType="plainline"
              iconSize={12}
              formatter={(value) => <span className="text-xs text-cowry-muted">{value}</span>}
            />
          ) : null}
          {series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={SERIES[index]}
              strokeWidth={2}
              // No dot per point — at 30–90 days that's a bead curtain. The
              // active dot on hover is what identifies the day being read.
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
