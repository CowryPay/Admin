"use client";

import { useCallback, type ReactNode } from "react";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { getLiquidityRevenue, getOnrampDeposits, type LiquiditySnapshot, type OnrampDeposit } from "@/lib/adminApi";
import { formatUsd, toChartValue } from "@/lib/decimal";

/*
 * Own liquidity: CowryPay as the counterparty.
 *
 * NGN off-ramps go to Nomba first (our naira float). When the float is short,
 * the payout is too big, or the market rate is unavailable, the send falls back
 * to Paycrest / Quidax / Centiiv. On-ramps (naira in → stablecoin out) sell
 * from our own stablecoin inventory.
 *
 * Float, inventory and alerts come from GET /admin/liquidity/revenue. Its
 * `revenue` field is deliberately NOT shown: it's platform fees across every
 * provider and flow, and this page should only show what our own liquidity
 * (Nomba off-ramp + on-ramp) earns. That needs a Nomba-only figure from the
 * backend.
 */

const ngn = (n: number) =>
  `₦${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Badge({ tone, children }: { tone: "good" | "warning" | "critical"; children: ReactNode }) {
  const cls =
    tone === "good"
      ? "border-status-good/40 text-status-good"
      : tone === "warning"
        ? "border-status-warning/40 text-status-warning"
        : "border-status-critical/40 text-status-critical";
  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function floatTone(snapshot: LiquiditySnapshot): "good" | "warning" | "critical" {
  const { balanceNgn } = snapshot.nombaFloat;
  if (balanceNgn === null) return "critical";
  return balanceNgn < snapshot.thresholds.nombaFloatLowNgn ? "warning" : "good";
}

function FloatCard({ snapshot }: { snapshot: LiquiditySnapshot }) {
  const { balanceNgn, error } = snapshot.nombaFloat;
  const { nombaFloatLowNgn, nombaFloatHighNgn } = snapshot.thresholds;
  const tone = floatTone(snapshot);
  // Fill against the "high" mark, where the monitor considers the float comfortably funded.
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
            Low alert below {ngn(nombaFloatLowNgn)} · target {ngn(nombaFloatHighNgn)}. When the float can&apos;t
            cover a payout, NGN sends go to Paycrest, Quidax or Centiiv instead.
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
        hint={`What on-ramps sell from. Low alert below ${formatUsd(String(snapshot.thresholds.inventoryLowUsd))} per chain.`}
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
                const low = toChartValue(r.availableBalance) < snapshot.thresholds.inventoryLowUsd;
                return (
                  <tr key={`${r.chain}-${r.tokenSymbol}`} className="border-b border-cowry-border/50 last:border-0">
                    <Td className="capitalize text-white">{r.chain}</Td>
                    <Td className="text-cowry-muted">{r.tokenSymbol}</Td>
                    <Td align="right" numeric className={low ? "text-status-warning" : "text-white"}>
                      {formatUsd(r.availableBalance)}
                    </Td>
                    <Td align="right" numeric className="text-cowry-muted">
                      {formatUsd(r.reservedBalance)}
                    </Td>
                    <Td align="right" numeric className="text-cowry-muted">
                      {formatUsd(r.bufferInUserPool)}
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

// Takes the page's query rather than running its own, so the stat card and
// the table share one request.
function UnmatchedDeposits({
  query: { data, error, loading, reload },
}: {
  query: ReturnType<typeof useAdminQuery<{ deposits: OnrampDeposit[] }>>;
}) {
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
                  <Td align="right" numeric className="text-white">
                    {ngn(toChartValue(d.amount))}
                  </Td>
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
  const fetcher = useCallback(() => getLiquidityRevenue(), []);
  const { data, error, loading, reload } = useAdminQuery(fetcher, []);

  const unmatchedFetcher = useCallback(() => getOnrampDeposits("UNMATCHED"), []);
  const unmatched = useAdminQuery(unmatchedFetcher, []);

  const totalInventory = data
    ? data.companyInventory.reduce((sum, r) => sum + toChartValue(r.availableBalance), 0)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Liquidity</h1>
        <p className="mt-1 max-w-3xl text-sm text-cowry-muted">
          Our own liquidity through Nomba: NGN off-ramps paid from our naira float and on-ramps sold from our
          stablecoin inventory. When Nomba can&apos;t take a payout it falls back to Paycrest, Quidax or Centiiv.
        </p>
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Nomba float"
          value={data && data.nombaFloat.balanceNgn !== null ? ngn(data.nombaFloat.balanceNgn) : "—"}
          hint={data ? (floatTone(data) === "good" ? "Healthy" : floatTone(data) === "warning" ? "Below low alert" : "Unreadable") : "Live"}
        />
        <StatCard
          label="Stablecoin inventory"
          value={totalInventory !== null ? formatUsd(totalInventory.toFixed(2)) : "—"}
          hint="Available across all chains"
        />
        <StatCard
          label="Unmatched payments"
          value={unmatched.data ? unmatched.data.deposits.length.toLocaleString() : "—"}
          hint={
            unmatched.data
              ? `${ngn(unmatched.data.deposits.reduce((s, d) => s + toChartValue(d.amount), 0))} waiting`
              : "On-ramp payments to claim or refund"
          }
        />
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FloatCard snapshot={data} />
            <InventoryCard snapshot={data} />
          </div>

        </>
      ) : null}

      <UnmatchedDeposits query={unmatched} />
    </div>
  );
}
