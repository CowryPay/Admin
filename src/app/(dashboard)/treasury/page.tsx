"use client";

import { useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChartSkeleton, ErrorState } from "@/components/ui/States";
import { CopyButton } from "@/components/ui/CopyButton";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import {
  AdminEndpointMissingError,
  getOverview,
  getTreasury,
  type AdminOverview,
  type TreasuryWalletBalance,
} from "@/lib/adminApi";
import { compareDecimalStrings } from "@/lib/decimal";
import { explorerAddressUrlFor, explorerNameFor, truncateHash } from "@/lib/explorer";

/**
 * Trust-but-verify panel.
 *
 * The rest of this dashboard reports what the database believes. This reads the
 * chains directly, in the two groups the backend keeps separate: what the
 * platform has *earned* (fee treasury) and what it *pays out of* (operational).
 *
 * The operational group is the one that pages someone: those wallets need gas,
 * and when they run dry the failure is silent — wallet creation and payouts
 * start failing with no signal until a user complains. Gas is shown per card
 * for exactly that reason.
 */

/** Ledger USDC available on a chain — the database's side of the comparison. */
function ledgerUsdcFor(overview: AdminOverview | null, chain: string): string | null {
  const row = overview?.balances.byChainAndToken.find(
    (entry) => entry.chain.toLowerCase() === chain.toLowerCase() && entry.tokenSymbol.toUpperCase() === "USDC",
  );
  return row?.totalAvailable ?? null;
}

function isZero(amount: string): boolean {
  return compareDecimalStrings(amount, "0") === 0;
}

/**
 * A balance figure.
 *
 * These strings are wildly variable in length — "0" for an empty wallet,
 * "0.000899920260306464" for an ETH gas balance, an 18-decimal ledger total —
 * and they're never abbreviated, so the layout has to absorb them rather than
 * the number being cut to fit. Two things make that work: the size steps down
 * past a length that would overflow, and `break-all` lets a long number wrap
 * instead of forcing its grid track wider than the card (grid items default to
 * min-width:auto, which is what pushed the gas value outside the card border).
 */
function Figure({ value, warn = false }: { value: string; warn?: boolean }) {
  const size = value.length > 22 ? "text-sm" : value.length > 14 ? "text-base" : "text-lg";
  return (
    <dd
      title={value}
      className={`tabular mt-1 break-all font-semibold leading-tight ${size} ${
        warn ? "text-status-warning" : "text-white"
      }`}
    >
      {value}
    </dd>
  );
}

function WalletCard({
  wallet,
  ledgerUsdc,
}: {
  wallet: TreasuryWalletBalance;
  /** Only passed for operational wallets — see the note in the section below. */
  ledgerUsdc?: string | null;
}) {
  const addressUrl = explorerAddressUrlFor(wallet.chain, wallet.address);
  // Gas at exactly zero is unambiguous and worth shouting about. Anything above
  // it isn't judged here — a "low" threshold is chain-specific and nobody has
  // told us what counts as low, so inventing one would just cry wolf.
  const outOfGas = wallet.native !== null && isZero(wallet.native.amount);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold capitalize text-white">{wallet.chain}</h3>
        {wallet.error ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-status-critical/40 px-1.5 py-0.5 text-xs font-medium text-status-critical">
            <span aria-hidden>⚠</span>
            Read failed
          </span>
        ) : outOfGas ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-status-warning/40 px-1.5 py-0.5 text-xs font-medium text-status-warning">
            <span aria-hidden>!</span>
            No gas
          </span>
        ) : null}
      </div>

      {wallet.address ? (
        <div className="mb-4 flex items-center gap-2">
          <code
            className="tabular flex-1 truncate rounded-lg border border-cowry-border bg-cowry-dark px-2.5 py-1.5 text-xs text-cowry-muted"
            title={wallet.address}
          >
            {truncateHash(wallet.address, 10, 8)}
          </code>
          <CopyButton value={wallet.address} />
        </div>
      ) : (
        <p className="mb-4 rounded-lg border border-dashed border-cowry-border px-2.5 py-1.5 text-xs text-cowry-muted">
          Address not configured
        </p>
      )}

      {wallet.error ? (
        <p className="rounded-lg border border-status-critical/30 bg-status-critical/5 p-3 text-xs text-cowry-muted">
          {wallet.error}
        </p>
      ) : (
        // min-w-0 on each cell is what actually contains the long numbers —
        // without it a grid item refuses to shrink below its content.
        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
            <dt className="text-xs text-cowry-muted">USDC on chain</dt>
            {/* Decimal string from the backend, rendered as-is. */}
            <Figure value={wallet.usdc ?? "—"} />
          </div>

          {wallet.native ? (
            <div className="min-w-0 rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
              <dt className="text-xs text-cowry-muted">Gas ({wallet.native.symbol})</dt>
              <Figure value={wallet.native.amount} warn={outOfGas} />
            </div>
          ) : null}

          {ledgerUsdc !== undefined ? (
            <div className="col-span-2 min-w-0 rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
              <dt className="text-xs text-cowry-muted">Ledger available on this chain (USDC)</dt>
              <Figure value={ledgerUsdc ?? "—"} />
            </div>
          ) : null}
        </dl>
      )}

      {addressUrl ? (
        <a
          href={addressUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-cowry-green underline-offset-2 hover:underline"
        >
          View on {explorerNameFor(wallet.chain)} →
        </a>
      ) : null}
    </Card>
  );
}

export default function TreasuryPage() {
  const treasuryFetcher = useCallback(() => getTreasury(), []);
  const treasury = useAdminQuery(treasuryFetcher, []);

  const overviewFetcher = useCallback(() => getOverview(), []);
  const overview = useAdminQuery(overviewFetcher, []);

  const notDeployedYet = treasury.error instanceof AdminEndpointMissingError;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Treasury</h1>
        <p className="mt-1 text-sm text-cowry-muted">
          Live balances read from each chain, not from our database. Fee treasury is what the platform has earned;
          operational is what pays out sends and has to stay funded.
        </p>
      </div>

      {notDeployedYet ? (
        <Card>
          <CardHeader title="Waiting on GET /admin/treasury" hint="The endpoint isn't responding on this backend." />
        </Card>
      ) : treasury.error ? (
        <ErrorState error={treasury.error} onRetry={treasury.reload} />
      ) : null}

      {treasury.loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>
      ) : null}

      {treasury.data ? (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-white">
              Fee treasury
              <span className="ml-2 font-normal text-cowry-muted">— platform earnings, swept from settled sends</span>
            </h2>
            {treasury.data.feeTreasury.length === 0 ? (
              <Card>
                <p className="text-sm text-cowry-muted">No fee treasury wallets reported.</p>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {treasury.data.feeTreasury.map((wallet, index) => (
                  <WalletCard key={`fee-${wallet.chain}-${index}`} wallet={wallet} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-white">
              Operational
              <span className="ml-2 font-normal text-cowry-muted">— pays out sends, needs gas</span>
            </h2>
            {/* Deliberately not auto-flagged as a shortfall. These are the payout
                wallets, not the only place user funds sit, so "on-chain below
                ledger" is a normal state here and a red badge would be noise.
                Both figures are shown; judging them needs someone who knows
                which wallets actually custody deposits. */}
            <p className="mb-3 text-xs text-cowry-muted">
              Ledger figures are shown for context. These wallets fund payouts and aren&apos;t the only place user
              deposits are held, so a balance below the ledger total isn&apos;t automatically a shortfall.
            </p>
            {treasury.data.operational.length === 0 ? (
              <Card>
                <p className="text-sm text-cowry-muted">No operational wallets reported.</p>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {treasury.data.operational.map((wallet, index) => (
                  <WalletCard
                    key={`ops-${wallet.chain}-${index}`}
                    wallet={wallet}
                    ledgerUsdc={ledgerUsdcFor(overview.data, wallet.chain)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
