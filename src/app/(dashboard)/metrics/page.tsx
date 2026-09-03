"use client";

import { useCallback, useState } from "react";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { ChartSkeleton, ErrorState } from "@/components/ui/States";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { CategoryBar } from "@/components/charts/CategoryBar";
import { GroupedBar } from "@/components/charts/GroupedBar";
import { TrendLines } from "@/components/charts/TrendLines";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { getMetrics, getMetricsTimeseries, type AdminMetrics, type AdminMetricsDay } from "@/lib/adminApi";
import { LONG_FORMAT_HEADER } from "@/lib/csv";
import { formatUsd, sumDecimalStrings, toChartValue } from "@/lib/decimal";
import { withAllChains } from "@/lib/chains";

/*
 * Each by-chain breakdown is padded to every supported chain before it's
 * charted or exported. The backend only returns chains that have rows, so a
 * chain with no settled volume or no captured revenue would otherwise be
 * missing from the chart entirely rather than showing an honest zero.
 *
 * Zero money is written as "0" — a value this dashboard generated, deliberately
 * not dressed up to look like one of the backend's formatted decimal strings.
 */
const emptyTransactions = (chain: string) => ({ chain, sends: 0, deposits: 0 });
const emptyVolume = (chain: string) => ({
  chain,
  sentUsdc: "0",
  depositedUsdc: "0",
  withdrawnUsdc: "0",
  crossChainSentUsdc: "0",
});
const emptyRevenue = (chain: string) => ({ chain, feesUsdc: "0" });

const RANGES = [7, 30, 90] as const;

function metricsCsvRows(data: AdminMetrics, timeseries: AdminMetricsDay[]): string[][] {
  const rows: string[][] = [LONG_FORMAT_HEADER];

  rows.push(["wallets", "totalCreated", "count", String(data.wallets.totalCreated)]);

  rows.push(["users", "total", "count", String(data.users.total)]);
  rows.push(["users", "activeAllTime", "count", String(data.users.activeAllTime)]);
  rows.push(["users", "activeToday", "count", String(data.users.activeToday)]);
  rows.push(["users", "activeLast7Days", "count", String(data.users.activeLast7Days)]);
  rows.push(["users", "activeLast30Days", "count", String(data.users.activeLast30Days)]);

  rows.push(["transactions.sends", "total", "count", String(data.transactions.sends.total)]);
  rows.push(["transactions.sends", "settled", "count", String(data.transactions.sends.settled)]);
  rows.push(["transactions.deposits", "total", "count", String(data.transactions.deposits.total)]);
  rows.push(["transactions.deposits", "settled", "count", String(data.transactions.deposits.settled)]);
  for (const row of withAllChains(data.transactions.byChain, emptyTransactions)) {
    rows.push(["transactions.byChain", row.chain, "sends", String(row.sends)]);
    rows.push(["transactions.byChain", row.chain, "deposits", String(row.deposits)]);
  }

  rows.push(["onChainVolume", "total", "sentUsdc", data.onChainVolume.sentUsdc]);
  rows.push(["onChainVolume", "total", "depositedUsdc", data.onChainVolume.depositedUsdc]);
  rows.push(["onChainVolume", "total", "withdrawnUsdc", data.onChainVolume.withdrawnUsdc]);
  rows.push(["onChainVolume", "total", "crossChainSentUsdc", data.onChainVolume.crossChainSentUsdc]);
  for (const row of withAllChains(data.onChainVolume.byChain, emptyVolume)) {
    rows.push(["onChainVolume.byChain", row.chain, "sentUsdc", row.sentUsdc]);
    rows.push(["onChainVolume.byChain", row.chain, "depositedUsdc", row.depositedUsdc]);
    rows.push(["onChainVolume.byChain", row.chain, "withdrawnUsdc", row.withdrawnUsdc]);
    rows.push(["onChainVolume.byChain", row.chain, "crossChainSentUsdc", row.crossChainSentUsdc]);
  }

  rows.push(["revenue", "total", "totalFeesUsdc", data.revenue.totalFeesUsdc]);
  for (const row of withAllChains(data.revenue.byChain, emptyRevenue))
    rows.push(["revenue.byChain", row.chain, "feesUsdc", row.feesUsdc]);

  // The trend chart is on screen too, so its days belong in the export.
  for (const day of timeseries) {
    rows.push(["metrics.timeseries", day.date, "sendsCount", String(day.sendsCount)]);
    rows.push(["metrics.timeseries", day.date, "depositsCount", String(day.depositsCount)]);
    rows.push(["metrics.timeseries", day.date, "sentUsdc", day.sentUsdc]);
    rows.push(["metrics.timeseries", day.date, "depositedUsdc", day.depositedUsdc]);
    rows.push(["metrics.timeseries", day.date, "withdrawnUsdc", day.withdrawnUsdc]);
    rows.push(["metrics.timeseries", day.date, "crossChainSentUsdc", day.crossChainSentUsdc]);
    rows.push(["metrics.timeseries", day.date, "feesUsdc", day.feesUsdc]);
  }

  return rows;
}

export default function MetricsPage() {
  const [days, setDays] = useState<number>(30);

  const metricsFetcher = useCallback(() => getMetrics(), []);
  const { data, error, loading, reload } = useAdminQuery(metricsFetcher, []);

  const trendFetcher = useCallback(() => getMetricsTimeseries(days), [days]);
  const trend = useAdminQuery(trendFetcher, [days]);

  const timeseries = trend.data?.timeseries ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Metrics</h1>
          <p className="mt-1 text-sm text-cowry-muted">
            Settled activity only — completed sends and credited deposits. Failed and pending attempts are shown
            beside the settled count, never folded into it.
          </p>
        </div>
        <ExportCsvButton page="metrics" disabled={!data} rows={() => (data ? metricsCsvRows(data, timeseries) : [])} />
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Users" value={loading || !data ? "—" : data.users.total.toLocaleString()} />
        <StatCard
          label="Active all time"
          value={loading || !data ? "—" : data.users.activeAllTime.toLocaleString()}
          hint="moved settled money at least once"
        />
        <StatCard
          label="Active 30 days"
          value={loading || !data ? "—" : data.users.activeLast30Days.toLocaleString()}
          hint="MAU"
        />
        <StatCard
          label="Active today"
          value={loading || !data ? "—" : data.users.activeToday.toLocaleString()}
          hint={data ? `${data.users.activeLast7Days.toLocaleString()} in last 7 days` : "DAU"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Sends settled"
          value={loading || !data ? "—" : data.transactions.sends.settled.toLocaleString()}
          hint={data ? `of ${data.transactions.sends.total.toLocaleString()} attempted` : undefined}
        />
        <StatCard
          label="Deposits settled"
          value={loading || !data ? "—" : data.transactions.deposits.settled.toLocaleString()}
          hint={data ? `of ${data.transactions.deposits.total.toLocaleString()} attempted` : undefined}
        />
        {/* Total Volume sums every on-chain flow the backend now reports —
            not just sent + deposited — so it doesn't undercount withdrawals
            and cross-chain sends. */}
        <StatCard
          label="Total volume"
          value={
            loading || !data
              ? "—"
              : formatUsd(
                  sumDecimalStrings(
                    data.onChainVolume.sentUsdc,
                    data.onChainVolume.depositedUsdc,
                    data.onChainVolume.withdrawnUsdc,
                    data.onChainVolume.crossChainSentUsdc,
                  ),
                )
          }
          hint="USDC, settled only — sent + deposited + withdrawn + cross-chain sent"
        />
        <StatCard
          label="Revenue"
          value={loading || !data ? "—" : formatUsd(data.revenue.totalFeesUsdc)}
          hint="USDC fees captured on settled sends"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Sent"
          value={loading || !data ? "—" : formatUsd(data.onChainVolume.sentUsdc)}
        />
        <StatCard
          label="Deposited"
          value={loading || !data ? "—" : formatUsd(data.onChainVolume.depositedUsdc)}
        />
        <StatCard
          label="Withdrawn"
          value={loading || !data ? "—" : formatUsd(data.onChainVolume.withdrawnUsdc)}
          hint="crypto withdrawals"
        />
        <StatCard
          label="Cross-chain sent"
          value={loading || !data ? "—" : formatUsd(data.onChainVolume.crossChainSentUsdc)}
          hint="e.g. Base/Optimism/Solana ↔ Stellar"
        />
      </div>

      <Card>
        <CardHeader
          title="Settled volume over time"
          hint="USDC per day — sent, deposited, and fees captured"
          action={
            <div role="group" aria-label="Time range" className="flex gap-1">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setDays(range)}
                  aria-pressed={days === range}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    days === range
                      ? "bg-cowry-green/10 text-cowry-green"
                      : "text-cowry-muted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {range}d
                </button>
              ))}
            </div>
          }
        />
        {trend.error ? (
          <ErrorState error={trend.error} onRetry={trend.reload} />
        ) : trend.loading ? (
          <ChartSkeleton height={280} />
        ) : (
          <TrendLines
            data={timeseries.map((day) => ({
              label: day.date.slice(5), // MM-DD — the year is the same across the window
              sent: toChartValue(day.sentUsdc),
              sentDisplay: formatUsd(day.sentUsdc),
              deposited: toChartValue(day.depositedUsdc),
              depositedDisplay: formatUsd(day.depositedUsdc),
              fees: toChartValue(day.feesUsdc),
              feesDisplay: formatUsd(day.feesUsdc),
            }))}
            series={[
              { key: "sent", displayKey: "sentDisplay", name: "Sent USDC" },
              { key: "deposited", displayKey: "depositedDisplay", name: "Deposited USDC" },
              { key: "fees", displayKey: "feesDisplay", name: "Fees USDC" },
            ]}
          />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Withdrawals & cross-chain sends over time"
          hint="USDC per day — crypto withdrawals and cross-chain sends"
        />
        {trend.error ? (
          <ErrorState error={trend.error} onRetry={trend.reload} />
        ) : trend.loading ? (
          <ChartSkeleton height={280} />
        ) : (
          <TrendLines
            data={timeseries.map((day) => ({
              label: day.date.slice(5),
              withdrawn: toChartValue(day.withdrawnUsdc),
              withdrawnDisplay: formatUsd(day.withdrawnUsdc),
              crossChainSent: toChartValue(day.crossChainSentUsdc),
              crossChainSentDisplay: formatUsd(day.crossChainSentUsdc),
            }))}
            series={[
              { key: "withdrawn", displayKey: "withdrawnDisplay", name: "Withdrawn USDC" },
              { key: "crossChainSent", displayKey: "crossChainSentDisplay", name: "Cross-chain sent USDC" },
            ]}
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="On-chain volume by chain" hint="USDC, settled only — sent and deposited" />
          {loading || !data ? (
            <ChartSkeleton height={260} />
          ) : (
            <GroupedBar
              data={withAllChains(data.onChainVolume.byChain, emptyVolume).map((row) => ({
                label: row.chain,
                // Numeric fields size the bars; the *Display fields are what
                // the tooltip shows, so no rendered figure comes from a float.
                sent: toChartValue(row.sentUsdc),
                sentDisplay: formatUsd(row.sentUsdc),
                deposited: toChartValue(row.depositedUsdc),
                depositedDisplay: formatUsd(row.depositedUsdc),
              }))}
              series={[
                { key: "sent", displayKey: "sentDisplay", name: "Sent USDC" },
                { key: "deposited", displayKey: "depositedDisplay", name: "Deposited USDC" },
              ]}
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Withdrawals & cross-chain sends by chain"
            hint="USDC, settled only — includes Stellar as a cross-chain source and destination"
          />
          {loading || !data ? (
            <ChartSkeleton height={260} />
          ) : (
            <GroupedBar
              data={withAllChains(data.onChainVolume.byChain, emptyVolume).map((row) => ({
                label: row.chain,
                withdrawn: toChartValue(row.withdrawnUsdc),
                withdrawnDisplay: formatUsd(row.withdrawnUsdc),
                crossChainSent: toChartValue(row.crossChainSentUsdc),
                crossChainSentDisplay: formatUsd(row.crossChainSentUsdc),
              }))}
              series={[
                { key: "withdrawn", displayKey: "withdrawnDisplay", name: "Withdrawn USDC" },
                { key: "crossChainSent", displayKey: "crossChainSentDisplay", name: "Cross-chain sent USDC" },
              ]}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Transactions by chain" hint="All attempts, settled and not" />
          {loading || !data ? (
            <ChartSkeleton height={260} />
          ) : (
            <GroupedBar
              data={withAllChains(data.transactions.byChain, emptyTransactions).map((row) => ({
                label: row.chain,
                sends: row.sends,
                deposits: row.deposits,
              }))}
              series={[
                { key: "sends", name: "Sends" },
                { key: "deposits", name: "Deposits" },
              ]}
            />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Revenue by chain" hint="USDC fees captured on settled sends" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar
              data={withAllChains(data.revenue.byChain, emptyRevenue).map((row) => ({
                label: row.chain,
                value: toChartValue(row.feesUsdc),
                display: formatUsd(row.feesUsdc),
              }))}
              emptyLabel="No fees captured yet"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
