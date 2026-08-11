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
  type AdminTreasuryEntry,
} from "@/lib/adminApi";
import { compareDecimalStrings, subtractDecimalStrings } from "@/lib/decimal";
import { explorerAddressUrlFor, explorerNameFor, truncateHash } from "@/lib/explorer";

/**
 * Trust-but-verify panel.
 *
 * The rest of this dashboard reports what the database believes. This page puts
 * the live on-chain treasury balance next to the ledger total for the same
 * chain, so the two can be seen to agree (or not) without taking the database's
 * word for it. Both figures stay decimal strings end to end — the comparison
 * below is exact BigInt arithmetic, never a float.
 */

type Verdict =
  | { kind: "covers"; surplus: string }
  | { kind: "short"; shortfall: string }
  | { kind: "exact" }
  | { kind: "unknown" };

/**
 * Treasury holding *more* than the ledger's available total is the normal
 * state — captured fees accumulate there and aren't anybody's spendable
 * balance. Holding *less* is the one that matters: users' available balances
 * would exceed what the platform actually has on that chain.
 */
function verdictFor(onChainBalance: string, ledgerAvailable: string | null): Verdict {
  if (ledgerAvailable === null) return { kind: "unknown" };
  const comparison = compareDecimalStrings(onChainBalance, ledgerAvailable);
  if (comparison === null) return { kind: "unknown" };
  if (comparison === 0) return { kind: "exact" };
  if (comparison > 0) {
    return { kind: "covers", surplus: subtractDecimalStrings(onChainBalance, ledgerAvailable) ?? "—" };
  }
  return { kind: "short", shortfall: subtractDecimalStrings(ledgerAvailable, onChainBalance) ?? "—" };
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict.kind === "unknown") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-cowry-border px-1.5 py-0.5 text-xs text-cowry-muted">
        No ledger row to compare
      </span>
    );
  }
  if (verdict.kind === "short") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-status-critical/40 px-1.5 py-0.5 text-xs font-medium text-status-critical">
        <span aria-hidden>⚠</span>
        Short by {verdict.shortfall}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-status-good/40 px-1.5 py-0.5 text-xs font-medium text-status-good">
      <span aria-hidden>✓</span>
      {verdict.kind === "exact" ? "Matches ledger" : `Covers ledger +${verdict.surplus}`}
    </span>
  );
}

function TreasuryCard({ entry, overview }: { entry: AdminTreasuryEntry; overview: AdminOverview | null }) {
  const ledgerRows = overview?.balances.byChainAndToken.filter(
    (row) => row.chain.toLowerCase() === entry.chain.toLowerCase(),
  );
  // The treasury balance is a single per-chain figure, so it's compared against
  // the USDC ledger row — the token the platform actually settles in.
  const usdcRow = ledgerRows?.find((row) => row.tokenSymbol.toUpperCase() === "USDC") ?? null;
  const verdict = verdictFor(entry.onChainBalance, usdcRow?.totalAvailable ?? null);
  const addressUrl = explorerAddressUrlFor(entry.chain, entry.address);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold capitalize text-white">{entry.chain}</h3>
        <VerdictBadge verdict={verdict} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <code
          className="tabular flex-1 truncate rounded-lg border border-cowry-border bg-cowry-dark px-2.5 py-1.5 text-xs text-cowry-muted"
          title={entry.address}
        >
          {truncateHash(entry.address, 10, 8)}
        </code>
        <CopyButton value={entry.address} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
          <dt className="text-xs text-cowry-muted">On-chain balance</dt>
          {/* Rendered as-is — the live figure from the chain. */}
          <dd className="tabular mt-1 text-lg font-semibold text-white">{entry.onChainBalance}</dd>
        </div>
        <div className="rounded-xl border border-cowry-border bg-cowry-dark/50 p-3">
          <dt className="text-xs text-cowry-muted">Ledger available (USDC)</dt>
          <dd className="tabular mt-1 text-lg font-semibold text-white">{usdcRow ? usdcRow.totalAvailable : "—"}</dd>
        </div>
      </dl>

      {addressUrl ? (
        <a
          href={addressUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-cowry-green underline-offset-2 hover:underline"
        >
          View on {explorerNameFor(entry.chain)} →
        </a>
      ) : null}
    </Card>
  );
}

export default function TreasuryPage() {
  const treasuryFetcher = useCallback(() => getTreasury(), []);
  const treasury = useAdminQuery(treasuryFetcher, []);

  // Ledger side of the comparison. Fetched here rather than threaded from the
  // Overview page because each page loads independently.
  const overviewFetcher = useCallback(() => getOverview(), []);
  const overview = useAdminQuery(overviewFetcher, []);

  const notDeployedYet = treasury.error instanceof AdminEndpointMissingError;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Treasury</h1>
        <p className="mt-1 text-sm text-cowry-muted">
          The platform's own on-chain balances, next to what the ledger says users hold. A treasury that holds more
          than the ledger is expected — captured fees live there. One that holds less is not.
        </p>
      </div>

      {notDeployedYet ? (
        <Card>
          <CardHeader
            title="Waiting on GET /admin/treasury"
            hint="This page is built and will populate as soon as the backend ships the endpoint."
          />
          <p className="text-sm text-cowry-muted">
            The backend currently serves <code className="text-white">/admin/overview</code>,{" "}
            <code className="text-white">/admin/metrics</code>,{" "}
            <code className="text-white">/admin/metrics/timeseries</code> and{" "}
            <code className="text-white">/admin/sends</code>, but not{" "}
            <code className="text-white">/admin/treasury</code>. Expected shape:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-cowry-border bg-cowry-dark p-3 text-xs text-cowry-muted">
{`{ "treasury": [ { "chain": "celo",
                 "address": "0x…",
                 "onChainBalance": "1234.5600" } ] }`}
          </pre>
          <p className="mt-3 text-sm text-cowry-muted">
            Address from the existing REMITTANCE_TREASURY_ADDRESS / Solana + Stellar treasury config;{" "}
            <code className="text-white">onChainBalance</code> as a decimal string, read live per chain.
          </p>
        </Card>
      ) : treasury.error ? (
        <ErrorState error={treasury.error} onRetry={treasury.reload} />
      ) : null}

      {/* A failed overview only costs the comparison column, not the addresses. */}
      {overview.error && !notDeployedYet ? <ErrorState error={overview.error} onRetry={overview.reload} /> : null}

      {treasury.loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>
      ) : null}

      {treasury.data ? (
        treasury.data.treasury.length === 0 ? (
          <Card>
            <p className="text-sm text-cowry-muted">The backend returned no treasury addresses.</p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {treasury.data.treasury.map((entry) => (
              <TreasuryCard key={entry.chain} entry={entry} overview={overview.data} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
