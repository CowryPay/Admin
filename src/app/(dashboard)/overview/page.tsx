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
import { withAllChains } from "@/lib/chains";

/**
 * The backend stores the EVM wallet provider under its implementation name
 * ("aws-kms"). That's an internal detail — what matters on an ops dashboard is
 * which family of wallet it is, so it reads as "evm" here. Only the label is
 * remapped; the value the backend sent is what goes into the CSV export.
 */
function providerLabel(provider: string): string {
  return provider === "aws-kms" ? "evm" : provider;
}

/**
 * Every number on this page, in `section,label,metric,value` rows. Money keeps
 * the backend's decimal string exactly as rendered — no symbol, no separator.
 */
function overviewCsvRows(data: AdminOverview): string[][] {
  const rows: string[][] = [LONG_FORMAT_HEADER];

  rows.push(["users", "total", "count", String(data.users.total)]);
  rows.push(["users", "kycVerified", "count", String(data.users.kycVerified)]);

  rows.push(["wallets", "total", "count", String(data.wallets.total)]);
  // Zero-filled the same way the charts are, so the export still contains every
  // number that was on screen — including the zeros.
  for (const row of withAllChains(data.wallets.byChain, (chain) => ({ chain, count: 0 })))
    rows.push(["wallets.byChain", row.chain, "count", String(row.count)]);
  for (const row of data.wallets.byProvider) rows.push(["wallets.byProvider", row.provider, "count", String(row.count)]);

  for (const row of data.balances.byChainAndToken) {
    rows.push(["balances.byChainAndToken", `${row.chain} ${row.tokenSymbol}`, "totalAvailable", row.totalAvailable]);
    rows.push(["balances.byChainAndToken", `${row.chain} ${row.tokenSymbol}`, "totalPending", row.totalPending]);
  }

  rows.push(["sends", "total", "count", String(data.sends.total)]);
  for (const row of data.sends.byState) rows.push(["sends.byState", row.state, "count", String(row.count)]);
  for (const row of withAllChains(data.sends.byChain, (chain) => ({ chain, count: 0 })))
    rows.push(["sends.byChain", row.chain, "count", String(row.count)]);

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
          {/* Counts wallet *rows*, and one KMS key derives a single address
              valid on every EVM chain — so a user's EVM wallet is stored once,
              tagged with the default chain. Base and Optimism reading 0 here
              means "no wallet rows recorded against them", not "unusable". */}
          <CardHeader title="Wallets by chain" hint="One EVM row per user — the same address works on all EVM chains" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar
              data={withAllChains(data.wallets.byChain, (chain) => ({ chain, count: 0 })).map((r) => ({
                label: r.chain,
                value: r.count,
              }))}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Wallets by provider" hint="evm, Stellar, Solana" />
          {loading || !data ? (
            <ChartSkeleton />
          ) : (
            <CategoryBar
              data={data.wallets.byProvider.map((r) => ({ label: providerLabel(r.provider), value: r.count }))}
            />
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
            <CategoryBar
              data={withAllChains(data.sends.byChain, (chain) => ({ chain, count: 0 })).map((r) => ({
                label: r.chain,
                value: r.count,
              }))}
            />
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
