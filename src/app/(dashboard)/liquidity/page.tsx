"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { TrendLines } from "@/components/charts/TrendLines";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import {
  AdminAuthError,
  AdminEndpointMissingError,
  getLiquidityRevenue,
  getNombaTransactions,
  type NombaTransaction,
  getOnrampDeposits,
  markDepositCompanyFunding,
  refundDeposit,
  type LiquiditySnapshot,
  type OnrampDeposit,
} from "@/lib/adminApi";
import { formatUsd, toChartValue } from "@/lib/decimal";

/*
 * Own liquidity: CowryPay as the counterparty.
 *
 * NGN off-ramps go to Nomba first (our naira float). When the float is short,
 * the payout is too big, or the market rate is unavailable, the send falls back
 * to Paycrest / Quidax / Centiiv. On-ramps (naira in → stablecoin out) sell
 * from our own stablecoin inventory.
 *
 * Everything except the unmatched-payments table comes from
 * GET /admin/liquidity/revenue?days=. Revenue shown here is `liquidityRevenue`:
 * fees from Nomba off-ramps and on-ramps only. The response's other `revenue`
 * field (platform fees across every provider and flow) is deliberately not
 * shown — Centiiv/Paycrest/Quidax sends aren't our liquidity.
 */

const RANGES = [7, 30, 90] as const;

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

type DepositAction = "company-funding" | "refund";

/**
 * Confirmation for the two irreversible actions on an unmatched payment.
 *
 * Both are one-way on the backend: company funding takes the payment out of
 * the refund queue and the Session ID claim path for good; a refund sends the
 * naira back out of the float through Nomba. So the dialog restates exactly
 * which payment, and asks who is acting and why — the backend records both.
 *
 * A 401 here is NOT routed through useAdminQuery's sign-out: these endpoints
 * need the full ADMIN_API_KEY, and a read-only metrics key failing on them
 * doesn't mean the session is dead.
 */
function ConfirmDepositAction({
  deposit,
  action,
  onClose,
  onDone,
}: {
  deposit: OnrampDeposit;
  action: DepositAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [actor, setActor] = useState(() => {
    try {
      return sessionStorage.getItem("cowry-admin-actor") ?? "";
    } catch {
      return "";
    }
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const isRefund = action === "refund";
  const noteRequired = !isRefund;
  const canSubmit = actor.trim() !== "" && (!noteRequired || note.trim() !== "") && !busy;

  async function submit() {
    setBusy(true);
    setFailure(null);
    try {
      sessionStorage.setItem("cowry-admin-actor", actor.trim());
    } catch {
      // Only a convenience — the action still goes through without it.
    }
    try {
      if (isRefund) await refundDeposit(deposit.id, actor.trim(), note.trim() || undefined);
      else await markDepositCompanyFunding(deposit.id, actor.trim(), note.trim());
      onDone();
    } catch (err) {
      setFailure(
        err instanceof AdminAuthError
          ? "This action needs the full admin key (ADMIN_API_KEY). Log out and sign in with it, then try again."
          : err instanceof Error
            ? err.message
            : String(err),
      );
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-cowry-border bg-cowry-card p-5">
        <h2 id="deposit-action-title" className="text-base font-semibold text-white">
          {isRefund ? "Refund this payment?" : "Mark as company funding?"}
        </h2>

        <dl className="mt-4 space-y-1 rounded-xl border border-cowry-border bg-cowry-dark/50 p-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-cowry-muted">Amount</dt>
            <dd className="tabular font-semibold text-white">{ngn(toChartValue(deposit.amount))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-cowry-muted">From</dt>
            <dd className="text-right text-white">
              {deposit.senderName ?? "—"}
              {deposit.senderBankName ? <span className="text-cowry-muted"> · {deposit.senderBankName}</span> : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-cowry-muted">Received</dt>
            <dd className="text-white">{new Date(deposit.paidAt ?? deposit.createdAt).toLocaleString()}</dd>
          </div>
        </dl>

        <p className="mt-3 text-sm text-cowry-muted">
          {isRefund
            ? "Sends the full amount back to the account it came from, out of the Nomba float. This can't be undone."
            : "Records this as our own money topping up the float. It leaves the refund queue and no user can claim it. This can't be undone."}
        </p>

        <label className="mt-4 block text-xs font-medium text-cowry-muted">
          Your name
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="mt-1 w-full rounded-lg border border-cowry-border bg-cowry-dark px-3 py-2 text-sm text-white outline-none focus:border-cowry-green"
            autoFocus
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-cowry-muted">
          {noteRequired ? "Reason" : "Reason (optional)"}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isRefund ? "e.g. no order, user asked for refund" : "e.g. float top-up from Robert's account"}
            className="mt-1 w-full rounded-lg border border-cowry-border bg-cowry-dark px-3 py-2 text-sm text-white outline-none placeholder:text-cowry-muted/60 focus:border-cowry-green"
          />
        </label>

        {failure ? (
          <p className="mt-3 rounded-lg border border-status-critical/30 bg-status-critical/5 p-3 text-xs text-status-critical">
            {failure}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-cowry-border px-3 py-1.5 text-sm text-cowry-muted transition hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isRefund ? "bg-status-critical text-white hover:opacity-90" : "bg-cowry-green text-black hover:opacity-90"
            }`}
          >
            {busy ? "Working…" : isRefund ? `Refund ${ngn(toChartValue(deposit.amount))}` : "Mark as company funding"}
          </button>
        </div>
      </div>
    </div>
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
  const [pending, setPending] = useState<{ deposit: OnrampDeposit; action: DepositAction } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="Unmatched on-ramp payments"
        hint="Naira that arrived but couldn't be matched to an order. A customer can claim it with their Session ID; otherwise refund it, or mark our own top-ups as company funding."
      />
      {notice ? (
        <p className="mb-3 rounded-lg border border-status-good/30 bg-status-good/5 p-3 text-xs text-status-good">{notice}</p>
      ) : null}
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
                <Th align="right">Action</Th>
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
                  <Td align="right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPending({ deposit: d, action: "company-funding" })}
                        className="rounded-lg border border-cowry-border px-2 py-1 text-xs font-medium text-white transition hover:border-cowry-green hover:text-cowry-green"
                      >
                        Company funding
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending({ deposit: d, action: "refund" })}
                        className="rounded-lg border border-cowry-border px-2 py-1 text-xs font-medium text-cowry-muted transition hover:border-status-critical hover:text-status-critical"
                      >
                        Refund
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      {pending ? (
        <ConfirmDepositAction
          deposit={pending.deposit}
          action={pending.action}
          onClose={() => setPending(null)}
          onDone={() => {
            const amount = ngn(toChartValue(pending.deposit.amount));
            setNotice(
              pending.action === "refund"
                ? `Refund of ${amount} started. It's no longer in this list.`
                : `${amount} marked as company funding.`,
            );
            setPending(null);
            reload();
          }}
        />
      ) : null}
    </Card>
  );
}

const MATCH_LABEL: Record<string, string> = {
  nomba_payout: "Off-ramp payout",
  onramp_deposit: "On-ramp payment",
  onramp_refund: "On-ramp refund",
};

/**
 * Every naira movement in and out of the Nomba liquidity account, read from
 * Nomba itself. Rows with no match in our records (matchedTo: null) are the
 * ones worth a look — usually a transfer made by hand in Nomba's dashboard —
 * so they're flagged and can be filtered to.
 */
function FloatMovements({ days }: { days: number }) {
  const fetcher = useCallback(() => getNombaTransactions(days), [days]);
  const { data, error, loading, reload } = useAdminQuery(fetcher, [days]);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);

  const all = data?.transactions ?? [];
  const unmatchedCount = all.filter((t) => t.matchedTo === null).length;
  const rows: NombaTransaction[] = onlyUnmatched ? all.filter((t) => t.matchedTo === null) : all;
  const net = data ? toChartValue(data.totals.inNgn) - toChartValue(data.totals.outNgn) : 0;

  return (
    <Card>
      <CardHeader
        title="Float movements"
        hint={`Every naira in and out of the Nomba liquidity account, last ${days} days — read from Nomba, not our database`}
        action={
          data && unmatchedCount > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyUnmatched((v) => !v)}
              aria-pressed={onlyUnmatched}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                onlyUnmatched ? "bg-status-warning/10 text-status-warning" : "text-cowry-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              Not in our records ({unmatchedCount})
            </button>
          ) : null
        }
      />

      {error instanceof AdminEndpointMissingError ? (
        <EmptyState label="Waiting on GET /admin/nomba/transactions — this fills in once the backend ships it." />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <ChartSkeleton height={160} />
      ) : data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
              <p className="text-xs text-cowry-muted">Money in</p>
              <p className="tabular mt-1 text-lg font-semibold text-status-good">{ngn(toChartValue(data.totals.inNgn))}</p>
            </div>
            <div className="rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
              <p className="text-xs text-cowry-muted">Money out</p>
              <p className="tabular mt-1 text-lg font-semibold text-status-serious">{ngn(toChartValue(data.totals.outNgn))}</p>
            </div>
            <div className="rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
              <p className="text-xs text-cowry-muted">Net</p>
              <p className="tabular mt-1 text-lg font-semibold text-white">
                {net < 0 ? "−" : ""}
                {ngn(Math.abs(net))}
              </p>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState label="No movements in this window" />
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Time</Th>
                    <Th align="right">Amount</Th>
                    <Th>What it was</Th>
                    <Th>Status</Th>
                    <Th>Nomba type</Th>
                    <Th>Reference</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-cowry-border/50 last:border-0">
                      <Td className="text-cowry-muted">{new Date(t.timeCreated).toLocaleString()}</Td>
                      <Td align="right" numeric className={t.direction === "in" ? "text-status-good" : "text-status-serious"}>
                        {t.direction === "in" ? "+" : "−"}
                        {ngn(toChartValue(t.amountNgn))}
                      </Td>
                      <Td>
                        {t.matchedTo ? (
                          <span className="text-white">{MATCH_LABEL[t.matchedTo] ?? t.matchedTo}</span>
                        ) : (
                          <Badge tone="warning">Not in our records</Badge>
                        )}
                      </Td>
                      <Td className="text-cowry-muted">{t.status}</Td>
                      <Td className="text-cowry-muted">{t.type}</Td>
                      <Td className="max-w-[200px] truncate text-cowry-muted">{t.merchantTxRef ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </>
      ) : null}
    </Card>
  );
}

export default function LiquidityPage() {
  const [days, setDays] = useState<number>(30);
  const fetcher = useCallback(() => getLiquidityRevenue(days), [days]);
  const { data, error, loading, reload } = useAdminQuery(fetcher, [days]);
  const lr = data?.liquidityRevenue;

  const unmatchedFetcher = useCallback(() => getOnrampDeposits("UNMATCHED"), []);
  const unmatched = useAdminQuery(unmatchedFetcher, []);

  const totalInventory = data
    ? data.companyInventory.reduce((sum, r) => sum + toChartValue(r.availableBalance), 0)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Liquidity</h1>
          <p className="mt-1 max-w-3xl text-sm text-cowry-muted">
            Our own liquidity through Nomba: NGN off-ramps paid from our naira float and on-ramps sold from our
            stablecoin inventory. Revenue here counts Nomba only — sends that fell back to Paycrest, Quidax or
            Centiiv are left out.
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

      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Nomba revenue"
          value={lr ? formatUsd(lr.totalFeesUsdc) : "—"}
          hint={`Off-ramp + on-ramp fees, last ${days} days`}
        />
        <StatCard
          label="Off-ramp fees"
          value={lr ? formatUsd(lr.offrampFeesUsdc) : "—"}
          hint="NGN payouts from our float"
        />
        <StatCard
          label="On-ramp fees"
          value={lr ? formatUsd(lr.onrampFeesUsdc) : "—"}
          hint="Naira in, stablecoin out"
        />
      </div>

      {data && !lr ? (
        <Card>
          <CardHeader
            title="Nomba revenue isn't on this backend yet"
            hint="/admin/liquidity/revenue answered without liquidityRevenue. It will appear here once that backend change is deployed."
          />
        </Card>
      ) : null}

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

          {lr ? (
            <>
              <Card>
                <CardHeader title="Nomba fees per day" hint="USD — off-ramp and on-ramp" />
                <TrendLines
                  emptyLabel="No Nomba revenue in this window"
                  data={lr.daily.map((d) => ({
                    label: d.date.slice(5),
                    offramp: toChartValue(d.offrampFeesUsdc),
                    offrampDisplay: formatUsd(d.offrampFeesUsdc),
                    onramp: toChartValue(d.onrampFeesUsdc),
                    onrampDisplay: formatUsd(d.onrampFeesUsdc),
                  }))}
                  series={[
                    { key: "offramp", displayKey: "offrampDisplay", name: "Off-ramp fees" },
                    { key: "onramp", displayKey: "onrampDisplay", name: "On-ramp fees" },
                  ]}
                />
              </Card>
              <Card>
                <CardHeader title="Nomba volume per day" hint="USD — stablecoin sold to us (off-ramp) and bought from us (on-ramp)" />
                <TrendLines
                  emptyLabel="No Nomba volume in this window"
                  data={lr.daily.map((d) => ({
                    label: d.date.slice(5),
                    offramp: toChartValue(d.offrampVolumeUsdc),
                    offrampDisplay: formatUsd(d.offrampVolumeUsdc),
                    onramp: toChartValue(d.onrampVolumeUsdc),
                    onrampDisplay: formatUsd(d.onrampVolumeUsdc),
                  }))}
                  series={[
                    { key: "offramp", displayKey: "offrampDisplay", name: "Off-ramp volume" },
                    { key: "onramp", displayKey: "onrampDisplay", name: "On-ramp volume" },
                  ]}
                />
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <FloatMovements days={Math.min(days, 90)} />

      <UnmatchedDeposits query={unmatched} />
    </div>
  );
}
