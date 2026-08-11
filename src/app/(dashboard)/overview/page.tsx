"use client";

import { useCallback } from "react";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { ChartSkeleton, ErrorState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { CategoryBar } from "@/components/charts/CategoryBar";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { getOverview, type AdminOverview } from "@/lib/adminApi";
import { LONG_FORMAT_HEADER } from "@/lib/csv";

/**
 * Every number on this page, in `section,label,metric,value` rows. Money keeps
 * the backend's decimal string exactly as rendered — no symbol, no separator.
 */
function overviewCsvRows(data: AdminOverview): string[][] {
  const rows: string[][] = [LONG_FORMAT_HEADER];

  rows.push(["users", "total", "count", String(data.users.total)]);
  rows.push(["users", "kycVerified", "count", String(data.users.kycVerified)]);

  rows.push(["wallets", "total", "count", String(data.wallets.total)]);
  for (const row of data.wallets.byChain) rows.push(["wallets.byChain", row.chain, "count", String(row.count)]);
  for (const row of data.wallets.byProvider) rows.push(["wallets.byProvider", row.provider, "count", String(row.count)]);

  for (const row of data.balances.byChainAndToken) {
    rows.push(["balances.byChainAndToken", `${row.chain} ${row.tokenSymbol}`, "totalAvailable", row.totalAvailable]);
    rows.push(["balances.byChainAndToken", `${row.chain} ${row.tokenSymbol}`, "totalPending", row.totalPending]);
  }

  rows.push(["sends", "total", "count", String(data.sends.total)]);
  for (const row of data.sends.byState) rows.push(["sends.byState", row.state, "count", String(row.count)]);
  for (const row of data.sends.byChain) rows.push(["sends.byChain", row.chain, "count", String(row.count)]);

  rows.push(["deposits", "total", "count", String(data.deposits.total)]);
  for (const row of data.deposits.byState) rows.push(["deposits.byState", row.state, "count", String(row.count)]);

  rows.push(["recipients", "total", "count", String(data.recipients.total)]);

  return rows;
}

export default function OverviewPage() {
  const fetcher = useCallback(() => getOverview(), []);
  const { data, error, loading, reload } = useAdminQuery(fetcher, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
          <p className="mt-1 text-sm text-cowry-muted">
            Ops-health snapshot across every provider and chain — all attempts, not just settled ones.
          </p>
        </div>
        <ExportCsvButton page="overview" disabled={!data} rows={() => (data ? overviewCsvRows(data) : [])} />
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Users" value={loading || !data ? "—" : data.users.total.toLocaleString()} />
        <StatCard
          label="KYC verified"
          value={loading || !data ? "—" : data.users.kycVerified.toLocaleString()}
          hint={data ? `of ${data.users.total.toLocaleString()} users` : undefined}
        />
        <StatCard label="Wallets" value={loading || !data ? "—" : data.wallets.total.toLocaleString()} />
        <StatCard label="Recipients" value={loading || !data ? "—" : data.recipients.total.toLocaleString()} />
        <StatCard label="Sends" value={loading || !data ? "—" : data.sends.total.toLocaleString()} hint="all attempts" />
        <StatCard
          label="Deposits"
          value={loading || !data ? "—" : data.deposits.total.toLocaleString()}
          hint="all attempts"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Wallets by chain" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar data={data.wallets.byChain.map((r) => ({ label: r.chain, value: r.count }))} />
          )}
        </Card>

        <Card>
          <CardHeader title="Wallets by provider" hint="aws-kms, Blockradar, Stellar, Solana" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar data={data.wallets.byProvider.map((r) => ({ label: r.provider, value: r.count }))} />
          )}
        </Card>

        <Card>
          <CardHeader title="Sends by state" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar data={data.sends.byState.map((r) => ({ label: r.state, value: r.count }))} />
          )}
        </Card>

        <Card>
          <CardHeader title="Sends by chain" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar data={data.sends.byChain.map((r) => ({ label: r.chain, value: r.count }))} />
          )}
        </Card>

        <Card>
          <CardHeader title="Deposits by state" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar data={data.deposits.byState.map((r) => ({ label: r.state, value: r.count }))} />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Ledger balances by chain and token"
            hint="What users hold — not the platform's on-chain treasury (see Treasury)"
          />
          {loading || !data ? (
            <ChartSkeleton />
          ) : data.balances.byChainAndToken.length === 0 ? (
            <p className="text-sm text-cowry-muted">No balances yet.</p>
          ) : (
            <TableScroll>
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr>
                    <Th>Chain</Th>
                    <Th>Token</Th>
                    <Th align="right">Available</Th>
                    <Th align="right">Pending</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.balances.byChainAndToken.map((row) => (
                    <tr key={`${row.chain}-${row.tokenSymbol}`} className="border-b border-cowry-border/50 last:border-0">
                      <Td className="text-white">{row.chain}</Td>
                      <Td className="text-cowry-muted">{row.tokenSymbol}</Td>
                      {/* Rendered as-is: these are already-formatted decimal
                          strings from the backend and are never parsed here. */}
                      <Td align="right" numeric className="text-white">
                        {row.totalAvailable}
                      </Td>
                      <Td align="right" numeric className="text-cowry-muted">
                        {row.totalPending}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>
      </div>
    </div>
  );
}
