"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import {
  getCrossChainSends,
  manualRefundCrossChainSend,
  type AdminCrossChainSend,
} from "@/lib/adminApi";
import { explorerUrlFor, truncateHash } from "@/lib/explorer";
import { CHAINS } from "@/lib/chains";

const LIMITS = [20, 50, 100]; // matches the Sends page's assumed backend cap

const STATE_FILTERS = ["All", "Success", "Stuck", "Failed", "Refunded"] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

function matchesStateFilter(send: AdminCrossChainSend, filter: StateFilter): boolean {
  if (filter === "All") return true;
  const state = send.state.toUpperCase();
  if (filter === "Success") return state === "COMPLETE";
  return state === filter.toUpperCase();
}

type RefundState = "idle" | "confirming" | "submitting" | "done" | "error";

function isStuck(send: AdminCrossChainSend): boolean {
  return send.state.toUpperCase() === "STUCK";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function StateBadge({ state }: { state: string }) {
  const stuck = state.toUpperCase() === "STUCK";
  const failed = state.toUpperCase() === "FAILED";
  const styles = stuck
    ? "border-status-warning/40 text-status-warning"
    : failed
      ? "border-status-critical/40 text-status-critical"
      : "border-cowry-border text-white";
  return <span className={`rounded-md border px-1.5 py-0.5 text-xs ${styles}`}>{state}</span>;
}

function TxLink({ chain, hash }: { chain: string; hash: string | null }) {
  if (!hash) return <span className="text-cowry-muted">—</span>;
  const url = explorerUrlFor(chain, hash);
  if (!url) {
    return (
      <span className="tabular text-xs text-cowry-muted" title={hash}>
        {truncateHash(hash)}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="tabular text-xs text-cowry-green underline-offset-2 hover:underline"
      title={hash}
    >
      {truncateHash(hash)}
    </a>
  );
}

/**
 * POST /admin/cross-chain-sends/:id/manual-refund, gated behind an inline
 * confirm step since it's a one-way write — a misclick here moves real funds,
 * unlike everything else on this page which is read-only.
 */
function ManualRefundAction({ send, onRefunded }: { send: AdminCrossChainSend; onRefunded: () => void }) {
  const [state, setState] = useState<RefundState>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isStuck(send)) return <span className="text-cowry-muted">—</span>;

  if (state === "done") {
    return <span className="text-xs font-medium text-status-good">Refund submitted</span>;
  }

  if (state === "confirming") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-cowry-muted">Refund {send.id}?</span>
        <button
          type="button"
          onClick={async () => {
            setState("submitting");
            setError(null);
            try {
              await manualRefundCrossChainSend(send.id);
              setState("done");
              onRefunded();
            } catch (err) {
              setState("error");
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          className="rounded-md border border-status-critical/40 px-1.5 py-0.5 text-xs font-medium text-status-critical transition hover:bg-status-critical/10"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="rounded-md border border-cowry-border px-1.5 py-0.5 text-xs text-cowry-muted transition hover:text-white"
        >
          Cancel
        </button>
      </span>
    );
  }

  if (state === "submitting") {
    return <span className="text-xs text-cowry-muted">Submitting…</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setState("confirming")}
        className="rounded-md border border-status-warning/40 px-1.5 py-0.5 text-xs font-medium text-status-warning transition hover:bg-status-warning/10"
      >
        Manual refund
      </button>
      {state === "error" && error ? <span className="text-xs text-status-critical">{error}</span> : null}
    </span>
  );
}

function crossChainSendsCsvRows(sends: AdminCrossChainSend[]): string[][] {
  const rows: string[][] = [
    [
      "id",
      "sourceChain",
      "destinationChain",
      "amountHuman",
      "state",
      "sourceTxHash",
      "destinationTxHash",
      "createdAt",
      "completedAt",
    ],
  ];
  for (const send of sends) {
    rows.push([
      send.id,
      send.sourceChain,
      send.destinationChain,
      send.amountHuman,
      send.state,
      send.sourceTxHash ?? "",
      send.destinationTxHash ?? "",
      send.createdAt,
      send.completedAt ?? "",
    ]);
  }
  return rows;
}

export default function CrossChainSendsPage() {
  const [sourceChain, setSourceChain] = useState<string>("");
  const [destinationChain, setDestinationChain] = useState<string>("");
  const [limit, setLimit] = useState<number>(20);
  const [stateFilter, setStateFilter] = useState<StateFilter>("Success");

  const fetcher = useCallback(
    () =>
      getCrossChainSends({
        sourceChain: sourceChain || undefined,
        destinationChain: destinationChain || undefined,
        limit,
      }),
    [sourceChain, destinationChain, limit],
  );
  const { data, error, loading, reload } = useAdminQuery(fetcher, [sourceChain, destinationChain, limit]);

  const sends = data?.crossChainSends ?? [];
  const visibleSends = sends.filter((send) => matchesStateFilter(send, stateFilter));
  const stuckCount = sends.filter(isStuck).length;

  const selectClass =
    "rounded-lg border border-cowry-border bg-cowry-card px-3 py-1.5 text-sm text-white outline-none transition focus:border-cowry-green";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Cross-chain sends</h1>
          <p className="mt-1 text-sm text-cowry-muted">
            Sends that move funds across chains, including Stellar as both a source and a destination. A STUCK send
            can be pushed through with a manual refund.
          </p>
        </div>
        <ExportCsvButton
          page="cross-chain-sends"
          disabled={!visibleSends.length}
          rows={() => crossChainSendsCsvRows(visibleSends)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-cowry-muted">
          Source chain
          <select value={sourceChain} onChange={(event) => setSourceChain(event.target.value)} className={selectClass}>
            <option value="">All chains</option>
            {CHAINS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-cowry-muted">
          Destination chain
          <select
            value={destinationChain}
            onChange={(event) => setDestinationChain(event.target.value)}
            className={selectClass}
          >
            <option value="">All chains</option>
            {CHAINS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-cowry-muted">
          State
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as StateFilter)}
            className={selectClass}
          >
            {STATE_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-cowry-muted">
          Limit
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className={selectClass}>
            {LIMITS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {stuckCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-status-warning/40 px-2.5 py-1 text-xs font-medium text-status-warning">
            <span aria-hidden>!</span>
            {stuckCount} of {sends.length} STUCK
          </span>
        ) : null}
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading ? <LoadingState label="Loading cross-chain sends…" /> : null}

      {!loading && !error ? (
        <Card className="p-0">
          {visibleSends.length === 0 ? (
            <p className="p-6 text-sm text-cowry-muted">
              {sends.length === 0
                ? "No cross-chain sends match this filter."
                : "No sends match the current state filter."}
            </p>
          ) : (
            <TableScroll>
              <table className="w-full min-w-[1180px] border-collapse">
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>Source</Th>
                    <Th>Destination</Th>
                    <Th align="right">Amount</Th>
                    <Th>State</Th>
                    <Th>Source tx</Th>
                    <Th>Destination tx</Th>
                    <Th>Created</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSends.map((send) => (
                    <tr
                      key={send.id}
                      className={`border-b border-cowry-border/50 last:border-0 ${
                        isStuck(send) ? "bg-status-warning/[0.06]" : ""
                      }`}
                    >
                      <Td className={isStuck(send) ? "border-l-2 border-status-warning" : ""}>
                        <span className="tabular text-xs text-cowry-muted" title={send.id}>
                          {truncateHash(send.id, 8, 4)}
                        </span>
                      </Td>
                      <Td>
                        <ChainBadge chain={send.sourceChain} />
                      </Td>
                      <Td>
                        <ChainBadge chain={send.destinationChain} />
                      </Td>
                      <Td align="right" numeric className="text-white">
                        {send.amountHuman}
                      </Td>
                      <Td>
                        <StateBadge state={send.state} />
                      </Td>
                      <Td>
                        <TxLink chain={send.sourceChain} hash={send.sourceTxHash} />
                      </Td>
                      <Td>
                        <TxLink chain={send.destinationChain} hash={send.destinationTxHash} />
                      </Td>
                      <Td numeric className="text-xs text-cowry-muted">
                        {formatTimestamp(send.createdAt)}
                      </Td>
                      <Td>
                        <ManualRefundAction send={send} onRefunded={reload} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>
      ) : null}
    </div>
  );
}