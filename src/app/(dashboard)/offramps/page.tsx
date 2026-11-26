"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/ui/States";
import { TableScroll, Td, Th } from "@/components/ui/Table";
import { CopyButton } from "@/components/ui/CopyButton";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { getSendDetail, getSends, type AdminSend, type AdminSendDiagnostic } from "@/lib/adminApi";
import { formatUsd, toChartValue } from "@/lib/decimal";

/*
 * Off-ramps, as a business view: user sold $X → we (or a provider) paid ₦Y to
 * this bank account. The Sends page is the debugging view for fee sweeps;
 * this one answers "what happened to this user's cash-out".
 *
 * The list comes from GET /admin/sends, which today returns amount, fee,
 * provider and state. Clicking a row loads GET /admin/sends/:id, which has the
 * full receipt (rate, naira paid, recipient bank details, Nomba session ID,
 * status history). If the list starts returning the receipt fields too, the
 * "Paid" and "To" columns fill in without a click.
 */

const PROVIDERS = ["", "nomba", "centiiv", "paycrest", "quidax"] as const;
const PROVIDER_LABEL: Record<string, string> = {
  nomba: "Nomba (our liquidity)",
  centiiv: "Centiiv",
  paycrest: "Paycrest",
  quidax: "Quidax",
};
const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

type StatusGroup = "" | "complete" | "progress" | "failed";
const FAILED_STATES = new Set(["FAILED", "REFUNDED", "SEND_REJECTED"]);
function statusGroup(state: string): Exclude<StatusGroup, ""> {
  if (state === "COMPLETE") return "complete";
  if (FAILED_STATES.has(state)) return "failed";
  return "progress";
}

function StatusBadge({ state }: { state: string }) {
  const group = statusGroup(state);
  const cls =
    group === "complete"
      ? "border-status-good/40 text-status-good"
      : group === "failed"
        ? "border-status-critical/40 text-status-critical"
        : "border-status-warning/40 text-status-warning";
  const label = group === "complete" ? "Completed" : state.replace(/_/g, " ").toLowerCase();
  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{label}</span>;
}

function money(amount: string | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "—";
  const n = toChartValue(amount);
  const symbol = currency === "NGN" ? "₦" : "";
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${formatted}` : `${formatted} ${currency}`;
}

/**
 * What the recipient was paid. Nomba records the exact naira; other providers
 * only store the rate, so it's (amount − fee) × rate and marked approximate.
 */
function paidOut(send: Pick<AdminSend, "amountHuman" | "feeAmount" | "rate" | "fiatAmount" | "fiatCurrency">): {
  text: string;
  exact: boolean;
} {
  if (send.fiatAmount) return { text: money(send.fiatAmount, send.fiatCurrency), exact: true };
  if (!send.rate) return { text: "—", exact: false };
  const net = toChartValue(send.amountHuman) - toChartValue(send.feeAmount ?? "0");
  return { text: `≈ ${money((net * toChartValue(send.rate)).toFixed(2), send.fiatCurrency)}`, exact: false };
}

function Field({ label, children, copy }: { label: string; children: ReactNode; copy?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-cowry-border/60 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-cowry-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right text-sm text-white">
        <span className="min-w-0 break-all">{children}</span>
        {copy ? <CopyButton value={copy} /> : null}
      </dd>
    </div>
  );
}

function ReceiptPanel({ sendId, onClose }: { sendId: string; onClose: () => void }) {
  const fetcher = useCallback(() => getSendDetail(sendId), [sendId]);
  const { data, error, loading, reload } = useAdminQuery(fetcher, [sendId]);
  const send = data?.send;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Off-ramp receipt"
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-cowry-border bg-cowry-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Off-ramp receipt</h2>
            {send ? <p className="mt-0.5 text-xs text-cowry-muted">{new Date(send.createdAt).toLocaleString()}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-cowry-border px-2.5 py-1 text-xs text-cowry-muted transition hover:text-white"
          >
            Close
          </button>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading || !send ? (
          <ChartSkeleton height={320} />
        ) : (
          <div className="space-y-4">
            {/* The one-line story */}
            <div className="rounded-xl border border-cowry-border bg-cowry-dark/50 p-4">
              <p className="text-sm text-cowry-muted">User sold</p>
              <p className="tabular text-2xl font-semibold text-white">
                {formatUsd(send.amountHuman)} <span className="text-base font-normal text-cowry-muted">{send.tokenSymbol}</span>
              </p>
              <p className="mt-2 text-sm text-cowry-muted">Recipient got</p>
              <p className="tabular text-2xl font-semibold text-white">{paidOut(send).text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge state={send.state} />
                <span className="text-xs text-cowry-muted">via {providerLabel(send.provider)}</span>
              </div>
            </div>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-cowry-muted">Paid to</h3>
              <dl>
                <Field label="Account name">{send.recipient.accountName}</Field>
                <Field label="Account number" copy={send.recipient.accountIdentifier}>
                  {send.recipient.accountIdentifier}
                </Field>
                <Field label="Bank">{send.recipient.institutionName ?? send.providerBankName ?? send.recipient.institution}</Field>
                {send.providerRecipientName ? (
                  <Field label="Name at bank (Nomba)">{send.providerRecipientName}</Field>
                ) : null}
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-cowry-muted">Money</h3>
              <dl>
                <Field label="Sold">
                  {send.amountHuman} {send.tokenSymbol} on <span className="capitalize">{send.chain}</span>
                </Field>
                <Field label="Our fee">{send.feeAmount ? `${send.feeAmount} ${send.tokenSymbol}` : "—"}</Field>
                <Field label="Rate">{send.rate ? `${money(send.rate, send.fiatCurrency)} per ${send.tokenSymbol}` : "—"}</Field>
                <Field label={paidOut(send).exact ? "Paid out" : "Paid out (estimated)"}>{paidOut(send).text}</Field>
                {send.providerFee ? <Field label="Nomba transfer fee">{money(send.providerFee, "NGN")}</Field> : null}
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-cowry-muted">References</h3>
              <dl>
                <Field label="Our reference" copy={send.reference}>
                  {send.reference}
                </Field>
                {send.bankSessionId ? (
                  <Field label="Bank session ID" copy={send.bankSessionId}>
                    {send.bankSessionId}
                  </Field>
                ) : null}
                {send.providerTransferId ? (
                  <Field label="Nomba transfer ID" copy={send.providerTransferId}>
                    {send.providerTransferId}
                  </Field>
                ) : null}
                {send.providerOrderId ? (
                  <Field label="Provider order ID" copy={send.providerOrderId}>
                    {send.providerOrderId}
                  </Field>
                ) : null}
                <Field label="Send ID" copy={send.id}>
                  {send.id}
                </Field>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cowry-muted">What happened</h3>
              <ol className="space-y-2">
                {(data?.transitions ?? []).map((t) => (
                  <li key={t.id} className="rounded-lg border border-cowry-border/60 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-white">{t.toState.replace(/_/g, " ").toLowerCase()}</span>
                      <span className="text-xs text-cowry-muted">{new Date(t.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 break-all text-xs text-cowry-muted">{t.trigger}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function FilterButtons<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o || "all"}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            value === o ? "bg-cowry-green/10 text-cowry-green" : "text-cowry-muted hover:bg-white/5 hover:text-white"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export default function OfframpsPage() {
  const [limit, setLimit] = useState<number>(50);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("");
  const [status, setStatus] = useState<StatusGroup>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const fetcher = useCallback(() => getSends({ limit }), [limit]);
  const { data, error, loading, reload } = useAdminQuery(fetcher, [limit]);

  const rows: AdminSendDiagnostic[] = useMemo(
    () =>
      (data?.sends ?? []).filter(
        (s) => (!provider || s.provider === provider) && (!status || statusGroup(s.state) === status),
      ),
    [data, provider, status],
  );
  // The receipt columns only appear once the list endpoint returns them.
  const hasReceiptFields = (data?.sends ?? []).some((s) => s.recipient !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Off-ramps</h1>
        <p className="mt-1 max-w-3xl text-sm text-cowry-muted">
          Every cash-out: what the user sold, what the recipient was paid, and to which bank account. Click a row for
          the full receipt.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Recent off-ramps"
          hint={`Newest first · filters apply to the last ${limit} sends`}
          action={
            <FilterButtons
              label="How many"
              options={["20", "50", "100"] as const}
              value={String(limit) as "20" | "50" | "100"}
              onChange={(v) => setLimit(Number(v))}
              render={(v) => `Last ${v}`}
            />
          }
        />
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
          <FilterButtons
            label="Provider"
            options={PROVIDERS}
            value={provider}
            onChange={setProvider}
            render={(v) => (v ? (v === "nomba" ? "Nomba" : providerLabel(v)) : "All providers")}
          />
          <FilterButtons
            label="Status"
            options={["", "complete", "progress", "failed"] as const}
            value={status}
            onChange={setStatus}
            render={(v) => ({ "": "Any status", complete: "Completed", progress: "In progress", failed: "Failed / refunded" })[v]}
          />
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <ChartSkeleton height={240} />
        ) : rows.length === 0 ? (
          <EmptyState label="No off-ramps match these filters" />
        ) : (
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th align="right">User sold</Th>
                  {hasReceiptFields ? <Th align="right">Paid</Th> : null}
                  {hasReceiptFields ? <Th>To</Th> : null}
                  <Th align="right">Our fee</Th>
                  <Th>Provider</Th>
                  <Th>Status</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setOpenId(s.id)}
                    className="cursor-pointer border-b border-cowry-border/50 transition last:border-0 hover:bg-white/[0.03]"
                  >
                    <Td className="text-cowry-muted">{new Date(s.createdAt).toLocaleString()}</Td>
                    <Td align="right" numeric className="text-white">
                      {formatUsd(s.amountHuman)}
                      <span className="ml-1 text-xs capitalize text-cowry-muted">{s.chain}</span>
                    </Td>
                    {hasReceiptFields ? (
                      <Td align="right" numeric className="text-white">
                        {s.fiatCurrency
                          ? paidOut({
                              amountHuman: s.amountHuman,
                              feeAmount: s.feeAmount,
                              rate: s.rate ?? null,
                              fiatAmount: s.fiatAmount ?? null,
                              fiatCurrency: s.fiatCurrency,
                            }).text
                          : "—"}
                      </Td>
                    ) : null}
                    {hasReceiptFields ? (
                      <Td className="text-cowry-muted">
                        {s.recipient ? (
                          <>
                            <span className="text-white">{s.recipient.accountName}</span>
                            <span className="ml-1 text-xs">
                              {s.recipient.institutionName ?? s.recipient.institution} · {s.recipient.accountIdentifier}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                    ) : null}
                    <Td align="right" numeric className="text-cowry-muted">
                      {s.feeAmount ? formatUsd(s.feeAmount) : "—"}
                    </Td>
                    <Td className={s.provider === "nomba" ? "text-cowry-green" : "text-cowry-muted"}>
                      {s.provider === "nomba" ? "Nomba" : providerLabel(s.provider)}
                    </Td>
                    <Td>
                      <StatusBadge state={s.state} />
                    </Td>
                    <Td align="right" className="text-xs text-cowry-green">
                      Receipt →
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      {openId ? <ReceiptPanel sendId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
