"use client";

import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { getOverview, getSends, type AdminSendDiagnostic } from "@/lib/adminApi";
import { explorerUrlFor, truncateHash } from "@/lib/explorer";
import { CHAINS } from "@/lib/chains";

// A fixed list rather than one derived from the current page of results —
// filtering to a chain that has no sends in the last 20 rows is a legitimate
// thing to want to do.
const LIMITS = [20, 50, 100]; // backend caps at 100

type FeeSweep =
  | { kind: "swept"; label: string; hash: string | null }
  | { kind: "failed"; label: string; hash: null }
  | { kind: "never"; label: string; hash: null };

/**
 * The backend logs "fee_swept:<hash>" on success and "fee_sweep_failed: <err>"
 * on failure. A null trigger is the third case and the one this page exists
 * for: the fee-sweep step was never reached at all, so there is no failure
 * logged anywhere — the payout died before getting there.
 */
function describeFeeSweep(trigger: string | null): FeeSweep {
  if (trigger === null) return { kind: "never", label: "Never reached", hash: null };
  if (trigger.startsWith("fee_swept")) {
    const hash = trigger.split(":")[1]?.trim() || null;
    return { kind: "swept", label: "Swept", hash };
  }
  if (trigger.startsWith("fee_sweep_failed")) return { kind: "failed", label: "Sweep failed", hash: null };
  return { kind: "failed", label: trigger, hash: null };
}

function FeeSweepBadge({ sweep, chain }: { sweep: FeeSweep; chain: string }) {
  // Icon + word, never color alone — these read as status, and status here is
  // the whole point of the column.
  const styles = {
    swept: "border-status-good/40 text-status-good",
    failed: "border-status-critical/40 text-status-critical",
    never: "border-status-warning/40 text-status-warning",
  }[sweep.kind];
  const icon = { swept: "✓", failed: "✕", never: "!" }[sweep.kind];

  const sweptUrl = sweep.hash ? explorerUrlFor(chain, sweep.hash) : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${styles}`}>
        <span aria-hidden>{icon}</span>
        {sweep.label}
      </span>
      {sweptUrl ? (
        <a
          href={sweptUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-cowry-muted underline-offset-2 hover:text-cowry-green hover:underline"
        >
          {truncateHash(sweep.hash as string)}
        </a>
      ) : null}
    </span>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function sendsCsvRows(sends: AdminSendDiagnostic[]): string[][] {
  const rows: string[][] = [
    [
      "id",
      "chain",
      "provider",
      "amountHuman",
      "feeAmount",
      "treasuryAddress",
      "state",
      "withdrawTxHash",
      "createdAt",
      "completedAt",
      "settlementTrigger",
      "feeSweepTrigger",
    ],
  ];
  for (const send of sends) {
    rows.push([
      send.id,
      send.chain,
      send.provider,
      // Money stays the backend's decimal string.
      send.amountHuman,
      send.feeAmount ?? "",
      send.treasuryAddress ?? "",
      send.state,
      send.withdrawTxHash ?? "",
      send.createdAt,
      send.completedAt ?? "",
      send.settlementTrigger ?? "",
      // Empty means the sweep was never reached — same distinction the table
      // draws, preserved in the file.
      send.feeSweepTrigger ?? "",
    ]);
  }
  return rows;
}

export default function SendsPage() {
  const [chain, setChain] = useState<string>("");
  const [limit, setLimit] = useState<number>(20);

  const fetcher = useCallback(() => getSends({ chain: chain || undefined, limit }), [chain, limit]);
  const { data, error, loading, reload } = useAdminQuery(fetcher, [chain, limit]);

  // /admin/sends returns a page of rows with no total, so the denominator comes
  // from /admin/overview — which already counts every send, and counts them per
  // chain, so the figure stays right when a chain filter is applied.
  const overviewFetcher = useCallback(() => getOverview(), []);
  const overview = useAdminQuery(overviewFetcher, []);

  const sends = data?.sends ?? [];
  const neverSwept = sends.filter((send) => send.feeSweepTrigger === null).length;

  const total = useMemo(() => {
    if (!overview.data) return null;
    if (!chain) return overview.data.sends.total;
    // A chain with no sends at all is absent from byChain, which means zero
    // rather than unknown.
    return overview.data.sends.byChain.find((row) => row.chain.toLowerCase() === chain.toLowerCase())?.count ?? 0;
  }, [overview.data, chain]);

  const scope = chain ? ` on ${chain}` : "";
  const countLabel =
    total === null
      ? `Latest ${sends.length}${scope}` // overview unavailable — no denominator to show
      : total === 0
        ? `No sends${scope} yet`
        : sends.length >= total
          ? `All ${total} send${total === 1 ? "" : "s"}${scope}`
          : `Latest ${sends.length} from a total of ${total} sends${scope}`;

  const selectClass =
    "rounded-lg border border-cowry-border bg-cowry-card px-3 py-1.5 text-sm text-white outline-none transition focus:border-cowry-green";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Sends</h1>
          <p className="mt-1 text-sm text-cowry-muted">
            Fee-sweep diagnostics, newest first. A send reaching COMPLETE says nothing about whether its fee reached
            treasury — the sweep is a separate best-effort step.
          </p>
        </div>
        {/* Exports exactly the rows currently fetched, filter and limit included. */}
        <ExportCsvButton page="sends" disabled={!sends.length} rows={() => sendsCsvRows(sends)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-cowry-muted">
          Chain
          <select value={chain} onChange={(event) => setChain(event.target.value)} className={selectClass}>
            <option value="">All chains</option>
            {CHAINS.map((option) => (
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

        {neverSwept > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-status-warning/40 px-2.5 py-1 text-xs font-medium text-status-warning">
            <span aria-hidden>!</span>
            {neverSwept} of {sends.length} never reached the fee sweep
          </span>
        ) : null}
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading ? <LoadingState label="Loading sends…" /> : null}

      {!loading && !error ? (
        <p className="tabular text-sm text-cowry-muted">
          {countLabel}
          {total !== null && sends.length < total ? (
            <span className="ml-2 text-xs">
              (newest first — raise the limit to see more, capped at 100)
            </span>
          ) : null}
        </p>
      ) : null}

      {!loading && !error ? (
        <Card className="p-0">
          {sends.length === 0 ? (
            <p className="p-6 text-sm text-cowry-muted">No sends match this filter.</p>
          ) : (
            <TableScroll>
              <table className="w-full min-w-[1180px] border-collapse">
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>Chain</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Fee</Th>
                    <Th>Treasury</Th>
                    <Th>State</Th>
                    <Th>Withdraw tx</Th>
                    <Th>Created</Th>
                    <Th>Fee sweep</Th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((send) => {
                    const sweep = describeFeeSweep(send.feeSweepTrigger);
                    const txUrl = explorerUrlFor(send.chain, send.withdrawTxHash);
                    return (
                      <tr
                        key={send.id}
                        className={`border-b border-cowry-border/50 last:border-0 ${
                          // Flagged row: the sweep step was never reached.
                          // Carried by a left rule *and* the badge in the last
                          // column, so it survives being read in grayscale.
                          sweep.kind === "never" ? "bg-status-warning/[0.06]" : ""
                        }`}
                      >
                        <Td className={sweep.kind === "never" ? "border-l-2 border-status-warning" : ""}>
                          <span className="tabular text-xs text-cowry-muted" title={send.id}>
                            {truncateHash(send.id, 8, 4)}
                          </span>
                        </Td>
                        <Td className="text-white">{send.chain}</Td>
                        <Td align="right" numeric className="text-white">
                          {send.amountHuman}
                        </Td>
                        <Td align="right" numeric className="text-cowry-muted">
                          {send.feeAmount ?? "—"}
                        </Td>
                        <Td>
                          {send.treasuryAddress ? (
                            <span className="tabular text-xs text-cowry-muted" title={send.treasuryAddress}>
                              {truncateHash(send.treasuryAddress)}
                            </span>
                          ) : (
                            <span className="text-cowry-muted">—</span>
                          )}
                        </Td>
                        <Td>
                          <span className="rounded-md border border-cowry-border px-1.5 py-0.5 text-xs text-white">
                            {send.state}
                          </span>
                        </Td>
                        <Td>
                          {send.withdrawTxHash ? (
                            txUrl ? (
                              <a
                                href={txUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="tabular text-xs text-cowry-green underline-offset-2 hover:underline"
                                title={send.withdrawTxHash}
                              >
                                {truncateHash(send.withdrawTxHash)}
                              </a>
                            ) : (
                              <span className="tabular text-xs text-cowry-muted" title={send.withdrawTxHash}>
                                {truncateHash(send.withdrawTxHash)}
                              </span>
                            )
                          ) : (
                            <span className="text-cowry-muted">—</span>
                          )}
                        </Td>
                        <Td numeric className="text-xs text-cowry-muted">
                          {formatTimestamp(send.createdAt)}
                        </Td>
                        <Td>
                          <FeeSweepBadge sweep={sweep} chain={send.chain} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>
      ) : null}
    </div>
  );
}
