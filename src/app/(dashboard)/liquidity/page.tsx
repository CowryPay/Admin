"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { TrendLines } from "@/components/charts/TrendLines";
import { CategoryBar } from "@/components/charts/CategoryBar";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import {
  AdminEndpointMissingError,
  getLiquidity,
  getLiquidityRevenue,
  getOnrampDeposits,
  type LiquidityRevenue,
  type LiquiditySnapshot,
} from "@/lib/adminApi";

/*
 * Own liquidity: CowryPay as the counterparty.
 *
 * NGN off-ramps go to Nomba first (our naira float). When the float is short,
 * the payout is too big, or the market rate is unavailable, the send falls back
 * to Paycrest / Quidax / Centiiv. On-ramps (naira in → stablecoin out) only run
 * on our own liquidity.
 *
 * The revenue difference is the point of this page: on our own liquidity we
 * keep the platform fee AND the FX spread (minus Nomba's transfer fee); on a
 * provider fallback we keep only the platform fee.
 */

const RANGES = [7, 30, 90] as const;

// Display-only formatters. The revenue endpoint returns rounded numbers, not
// ledger strings (its spread figures are estimates), so Intl is fine here.
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const ngn = (n: number) =>
  `₦${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

const PROVIDER_LABEL: Record<string, string> = {
  nomba: "Nomba (own)",
  paycrest: "Paycrest",
  quidax: "Quidax",
  centiiv: "Centiiv",
};
const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

function Row({ label, value, strong = false, muted = false }: { label: string; value: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-cowry-border/60 py-2 last:border-0">
      <dt className="text-sm text-cowry-muted">{label}</dt>
      <dd className={`tabular text-sm ${strong ? "font-semibold text-white" : muted ? "text-cowry-muted" : "text-white"}`}>
        {value}
      </dd>
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "warning" | "critical"; children: ReactNode }) {
  const cls =
    tone === "good"
      ? "border-status-good/40 text-status-good"
      : tone === "warning"
        ? "border-status-warning/40 text-status-warning"
        : "border-status-critical/40 text-status-critical";
  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function FloatCard({ snapshot }: { snapshot: LiquiditySnapshot }) {
  const { balanceNgn, error } = snapshot.nombaFloat;
  const { nombaFloatLowNgn, nombaFloatHighNgn } = snapshot.thresholds;
  const tone = balanceNgn === null ? "critical" : balanceNgn < nombaFloatLowNgn ? "warning" : "good";
  // Fill against the "high" mark, which is where the monitor considers the float comfortably funded.
  const fill = balanceNgn === null ? 0 : Math.min(100, (balanceNgn / Math.max(nombaFloatHighNgn, 1)) * 100);
  const lowMark = Math.min(100, (nombaFloatLowNgn / Math.max(nombaFloatHighNgn, 1)) * 100);

  return (
    <Card>
      <CardHeader
        title="Nomba naira float"
        hint="Live balance that pays NGN off-ramps"
        action={
          <Badge tone={tone}>{balanceNgn === null ? "Unreadable" : tone === "warning" ? "Low — falling back" : "Healthy"}</Badge>
        }
      />
      {balanceNgn === null ? (
        <p className="rounded-lg border border-status-critical/30 bg-status-critical/5 p-3 text-xs text-cowry-muted">
          {error ?? "Couldn't read the float."}
        </p>
      ) : (
        <>
          <p className="tabular text-3xl font-semibold text-white">{ngn(balanceNgn)}</p>
          <div className="relative mt-4 h-2 rounded-full bg-white/5" aria-hidden>
            <div
              className={`h-2 rounded-full ${tone === "good" ? "bg-status-good" : "bg-status-warning"}`}
              style={{ width: `${fill}%` }}
            />
            <div className="absolute top-[-3px] h-[14px] w-px bg-status-warning" style={{ left: `${lowMark}%` }} />
          </div>
          <p className="mt-2 text-xs text-cowry-muted">
            Low alert below {ngn(nombaFloatLowNgn)} · target {ngn(nombaFloatHighNgn)}. Below what a payout needs, NGN
            sends go to the providers instead.
          </p>
        </>
      )}
    </Card>
  );
}

function InventoryCard({ snapshot }: { snapshot: LiquiditySnapshot }) {
  const rows = snapshot.companyInventory;
  return (
    <Card>
      <CardHeader
        title="Company stablecoin inventory"
        hint={`What on-ramps sell from. Low alert below ${usd(snapshot.thresholds.inventoryLowUsd)} per chain.`}
      />
      {rows.length === 0 ? (
        <EmptyState label="No inventory recorded yet" />
      ) : (
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Chain</Th>
                <Th>Token</Th>
                <Th align="right">Available</Th>
                <Th align="right">Reserved</Th>
                <Th align="right">Buffer in user pool</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const low = Number(r.availableBalance) < snapshot.thresholds.inventoryLowUsd;
                return (
                  <tr key={`${r.chain}-${r.tokenSymbol}`} className="border-b border-cowry-border/50 last:border-0">
                    <Td className="capitalize text-white">{r.chain}</Td>
                    <Td className="text-cowry-muted">{r.tokenSymbol}</Td>
                    <Td align="right" numeric className={low ? "text-status-warning" : "text-white"}>
                      {usd(Number(r.availableBalance))}
                    </Td>
                    <Td align="right" numeric className="text-cowry-muted">
                      {usd(Number(r.reservedBalance))}
                    </Td>
                    <Td align="right" numeric className="text-cowry-muted">
                      {usd(Number(r.bufferInUserPool))}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
      {snapshot.openAlerts.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-cowry-muted">Open alerts:</span>
          {snapshot.openAlerts.map((a) => (
            <Badge key={a} tone="warning">
              {a}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function RevenueBreakdown({ data }: { data: LiquidityRevenue }) {
  const { nombaOfframp: n, onramp: o, providerOfframp: p, spreadBps } = data;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Nomba off-ramp" hint="Users sell stablecoin to us, we pay naira from the float" />
        <dl>
          <Row label="Completed payouts" value={n.count.toLocaleString()} />
          <Row label="Volume" value={usd(n.volumeUsd)} />
          <Row label="Naira paid out" value={ngn(n.payoutNgn)} />
          <Row label="Platform fee" value={usd(n.feeUsd)} />
          <Row label={`FX spread (est. ${spreadBps.offramp} bps)`} value={usd(n.spreadUsd)} />
          <Row label="Nomba transfer fees" value={`−${usd(n.transferCostUsd)}`} muted />
          <Row label="Net revenue" value={usd(n.revenueUsd)} strong />
        </dl>
      </Card>

      <Card>
        <CardHeader title="On-ramp" hint="Users pay naira into Nomba, we credit stablecoin" />
        <dl>
          <Row label="Orders created" value={o.ordersCreated.toLocaleString()} />
          <Row label="Credited" value={`${o.credited.toLocaleString()} (${pct(o.credited, o.ordersCreated)})`} />
          <Row label="Expired / cancelled" value={`${o.expired} / ${o.cancelled}`} muted />
          <Row label="Naira received" value={ngn(o.receivedNgn)} />
          <Row label="Stablecoin delivered" value={usd(o.volumeUsd)} />
          <Row label="Platform fee" value={usd(o.feeUsd)} />
          <Row label={`FX spread (est. ${spreadBps.onramp} bps)`} value={usd(o.spreadUsd)} />
          <Row label="Revenue" value={usd(o.revenueUsd)} strong />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Provider fallback" hint="Paycrest / Quidax / Centiiv — all currencies. Fee only, no spread." />
        {p.byProvider.length === 0 ? (
          <EmptyState label="No provider payouts in this window" />
        ) : (
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Provider</Th>
                  <Th align="right">Sends</Th>
                  <Th align="right">Volume</Th>
                  <Th align="right">Fees</Th>
                </tr>
              </thead>
              <tbody>
                {p.byProvider.map((row) => (
                  <tr key={row.provider} className="border-b border-cowry-border/50">
                    <Td className="text-white">{providerLabel(row.provider)}</Td>
                    <Td align="right" numeric>{row.count.toLocaleString()}</Td>
                    <Td align="right" numeric>{usd(row.volumeUsd)}</Td>
                    <Td align="right" numeric>{usd(row.feeUsd)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="font-semibold text-white">Total</Td>
                  <Td align="right" numeric className="font-semibold text-white">{p.count.toLocaleString()}</Td>
                  <Td align="right" numeric className="font-semibold text-white">{usd(p.volumeUsd)}</Td>
                  <Td align="right" numeric className="font-semibold text-white">{usd(p.feeUsd)}</Td>
                </tr>
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}

function UnmatchedDeposits() {
  const fetcher = useCallback(() => getOnrampDeposits("UNMATCHED"), []);
  const { data, error, loading, reload } = useAdminQuery(fetcher, []);
  const deposits = data?.deposits ?? [];

  return (
    <Card>
      <CardHeader
        title="Unmatched on-ramp payments"
        hint="Naira that arrived but couldn't be matched to an order. The user can claim it with their Session ID, or it gets refunded."
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <ChartSkeleton height={120} />
      ) : deposits.length === 0 ? (
        <EmptyState label="Nothing waiting — every payment was matched" />
      ) : (
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Received</Th>
                <Th align="right">Amount</Th>
                <Th>Sender</Th>
                <Th>Bank</Th>
                <Th>Reason</Th>
                <Th>Narration</Th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="border-b border-cowry-border/50 last:border-0">
                  <Td className="text-cowry-muted">{new Date(d.paidAt ?? d.createdAt).toLocaleString()}</Td>
                  <Td align="right" numeric className="text-white">{ngn(Number(d.amount))}</Td>
                  <Td className="text-white">{d.senderName ?? "—"}</Td>
                  <Td className="text-cowry-muted">{d.senderBankName ?? "—"}</Td>
                  <Td>
                    <Badge tone="warning">{(d.reason ?? "unknown").replace(/_/g, " ")}</Badge>
                  </Td>
                  <Td className="max-w-[240px] truncate text-cowry-muted">{d.narration ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}

export default function LiquidityPage() {
  const [days, setDays] = useState<number>(30);

  const revenueFetcher = useCallback(() => getLiquidityRevenue(days), [days]);
  const revenue = useAdminQuery(revenueFetcher, [days]);

  const snapshotFetcher = useCallback(() => getLiquidity(), []);
  const snapshot = useAdminQuery(snapshotFetcher, []);

  const r = revenue.data;
  const notDeployed = revenue.error instanceof AdminEndpointMissingError;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Liquidity</h1>
          <p className="mt-1 max-w-3xl text-sm text-cowry-muted">
            Our own liquidity through Nomba: NGN off-ramps paid from our naira float and on-ramps sold from our
            stablecoin inventory. When Nomba can&apos;t take a payout it falls back to Paycrest, Quidax or Centiiv —
            those earn only the platform fee.
          </p>
        </div>
        <div role="group" aria-label="Time range" className="flex gap-1">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              aria-pressed={days === range}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                days === range ? "bg-cowry-green/10 text-cowry-green" : "text-cowry-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {r && !r.nombaEnabled ? (
        <div className="rounded-2xl border border-status-warning/40 bg-status-warning/5 p-4 text-sm text-cowry-muted">
          <span className="font-semibold text-white">Nomba off-ramp is switched off</span> (NOMBA_ENABLED=false). Every
          NGN payout is going to the providers.
        </div>
      ) : null}

      {notDeployed ? (
        <Card>
          <CardHeader
            title="Waiting on GET /admin/liquidity/revenue"
            hint="The revenue endpoint isn't on this backend yet. Float and inventory below still work."
          />
        </Card>
      ) : revenue.error ? (
        <ErrorState error={revenue.error} onRetry={revenue.reload} />
      ) : null}

      {/* Headline: where the money comes from */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Own-liquidity revenue"
          value={r ? usd(r.totals.liquidityRevenueUsd) : "—"}
          hint="Nomba off-ramp + on-ramp, fee + spread"
        />
        <StatCard
          label="Provider revenue"
          value={r ? usd(r.totals.providerRevenueUsd) : "—"}
          hint="Platform fee on fallback payouts"
        />
        <StatCard
          label="Total revenue"
          value={r ? usd(r.totals.totalRevenueUsd) : "—"}
          hint={r ? `${pct(r.totals.liquidityRevenueUsd, r.totals.totalRevenueUsd)} from own liquidity` : `last ${days} days`}
        />
        <StatCard
          label="NGN sends via Nomba"
          value={r ? pct(r.ngnRouting.viaNomba, r.ngnRouting.total) : "—"}
          hint={
            r
              ? `${r.ngnRouting.viaNomba} of ${r.ngnRouting.total} · ${r.ngnRouting.fellBack} fell back to providers`
              : "share of NGN off-ramps"
          }
        />
      </div>

      {/* Live balances */}
      {snapshot.error ? (
        <ErrorState error={snapshot.error} onRetry={snapshot.reload} />
      ) : snapshot.loading || !snapshot.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <FloatCard snapshot={snapshot.data} />
          <InventoryCard snapshot={snapshot.data} />
        </div>
      )}

      {revenue.loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
        </div>
      ) : r ? (
        <>
          <Card>
            <CardHeader title="Revenue per day" hint="USD — own liquidity vs provider fallback" />
            <TrendLines
              emptyLabel="No revenue in this window"
              data={r.timeseries.map((d) => ({
                label: d.date.slice(5),
                own: d.liquidityRevenueUsd,
                ownDisplay: usd(d.liquidityRevenueUsd),
                provider: d.providerRevenueUsd,
                providerDisplay: usd(d.providerRevenueUsd),
              }))}
              series={[
                { key: "own", displayKey: "ownDisplay", name: "Own liquidity" },
                { key: "provider", displayKey: "providerDisplay", name: "Provider fallback" },
              ]}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Volume per day" hint="USD — how the money moves" />
              <TrendLines
                emptyLabel="No volume in this window"
                data={r.timeseries.map((d) => ({
                  label: d.date.slice(5),
                  nomba: d.nombaOfframpUsd,
                  nombaDisplay: usd(d.nombaOfframpUsd),
                  provider: d.providerOfframpUsd,
                  providerDisplay: usd(d.providerOfframpUsd),
                  onramp: d.onrampUsd,
                  onrampDisplay: usd(d.onrampUsd),
                }))}
                series={[
                  { key: "nomba", displayKey: "nombaDisplay", name: "Nomba off-ramp" },
                  { key: "provider", displayKey: "providerDisplay", name: "Provider off-ramp" },
                  { key: "onramp", displayKey: "onrampDisplay", name: "On-ramp" },
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="NGN off-ramp routing" hint="Sends attempted, by who paid out" />
              <CategoryBar
                emptyLabel="No NGN off-ramps in this window"
                data={r.ngnRouting.byProvider.map((x) => ({ label: providerLabel(x.provider), value: x.count }))}
              />
            </Card>
          </div>

          <RevenueBreakdown data={r} />

          <p className="text-xs text-cowry-muted">
            Spread is estimated at the current configured spread ({r.spreadBps.offramp} bps off-ramp,{" "}
            {r.spreadBps.onramp} bps on-ramp). Trades don&apos;t record the market mid rate, so if the spread was
            changed during this window, older trades are estimated at today&apos;s value.
          </p>
        </>
      ) : null}

      <UnmatchedDeposits />
    </div>
  );
}
