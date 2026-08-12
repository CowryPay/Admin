import { getAdminKey } from "./adminKey";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

/*
 * Typed client for the backend's /admin/* routes — one function per endpoint,
 * mirroring cowrypay-frontend's src/lib/backendApi.ts, with the shared-secret
 * `x-admin-key` header in place of that file's Supabase bearer token.
 *
 * The response types below are copied field-for-field from the backend's
 * backend/src/domain/admin/repository.ts (AdminOverview / AdminMetrics /
 * AdminSendDiagnostic / AdminMetricsDay). Nothing is renamed on the way in —
 * `tokenSymbol` stays `tokenSymbol`, `sentUsdc` stays `sentUsdc` — so the two
 * files stay diffable when the backend adds a field.
 */

// ---------------------------------------------------------------------------
// Response types — mirrored from backend/src/domain/admin/repository.ts
// ---------------------------------------------------------------------------

export interface AdminOverview {
  users: {
    total: number;
    kycVerified: number;
  };
  wallets: {
    total: number;
    byChain: { chain: string; count: number }[];
    byProvider: { provider: string; count: number }[];
  };
  balances: {
    /** Ledger balances (what users hold), not on-chain treasury balances. */
    byChainAndToken: { chain: string; tokenSymbol: string; totalAvailable: string; totalPending: string }[];
  };
  sends: {
    total: number;
    byState: { state: string; count: number }[];
    byChain: { chain: string; count: number }[];
  };
  deposits: {
    total: number;
    byState: { state: string; count: number }[];
  };
  recipients: {
    total: number;
  };
}

export interface AdminMetrics {
  wallets: {
    totalCreated: number;
  };
  users: {
    total: number;
    activeAllTime: number;
    activeToday: number; // DAU
    activeLast7Days: number; // WAU
    activeLast30Days: number;
  };
  transactions: {
    sends: { total: number; settled: number };
    deposits: { total: number; settled: number };
    byChain: { chain: string; sends: number; deposits: number }[];
  };
  onChainVolume: {
    sentUsdc: string;
    depositedUsdc: string;
    byChain: { chain: string; sentUsdc: string; depositedUsdc: string }[];
  };
  revenue: {
    totalFeesUsdc: string;
    byChain: { chain: string; feesUsdc: string }[];
  };
}

export interface AdminMetricsDay {
  date: string; // YYYY-MM-DD
  sendsCount: number;
  depositsCount: number;
  sentUsdc: string;
  depositedUsdc: string;
  feesUsdc: string;
}

export interface AdminSendDiagnostic {
  id: string;
  chain: string;
  amountHuman: string;
  feeAmount: string | null;
  treasuryAddress: string | null;
  state: string;
  withdrawTxHash: string | null;
  createdAt: string;
  provider: string;
  completedAt: string | null;
  settlementTrigger: string | null;
  /**
   * Most recent transition whose trigger mentions the fee sweep — the backend
   * logs "fee_swept:<hash>" or "fee_sweep_failed: <error>". `null` means the
   * fee-sweep step was never reached at all, which is a different failure from
   * a sweep that ran and failed. The Sends table flags these distinctly.
   */
  feeSweepTrigger: string | null;
}

/**
 * One wallet's live on-chain balance. Mirrors the backend's `WalletBalance`
 * in domain/admin/treasury.ts.
 *
 * Every field except `chain` is nullable because the backend isolates per-chain
 * failures rather than failing the whole snapshot: a chain whose RPC is down or
 * whose address isn't configured comes back with `error` set and balances null,
 * while every other chain still reports. The UI has to render that per card.
 */
export interface TreasuryWalletBalance {
  chain: string;
  address: string | null;
  /** USDC balance as a decimal string. Null when the read failed. */
  usdc: string | null;
  /** Gas balance. Null for fee-treasury wallets, which don't pay gas. */
  native: { symbol: string; amount: string } | null;
  error: string | null;
}

export interface TreasurySnapshot {
  /** What the platform has earned — the dedicated fee-sweep destinations. */
  feeTreasury: TreasuryWalletBalance[];
  /** What pays out sends and must stay funded with gas. */
  operational: TreasuryWalletBalance[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A 401 from any /admin/* route — the key is wrong, or was rotated on the
 * backend while this tab was still holding the old one. Its own type so the UI
 * can catch exactly this and bounce to login, instead of string-matching a
 * generic Error message.
 */
export class AdminAuthError extends Error {
  constructor(message = "invalid admin key") {
    super(message);
    this.name = "AdminAuthError";
  }
}

/**
 * The route exists but the backend has no admin key configured at all — it
 * answers 503 "admin endpoint not configured". Distinct from AdminAuthError
 * because no key the user types will fix it; it's a backend deploy problem.
 */
export class AdminNotConfiguredError extends Error {
  constructor(message = "admin endpoint not configured") {
    super(message);
    this.name = "AdminNotConfiguredError";
  }
}

/**
 * The endpoint isn't deployed on this backend yet (404). Only /admin/treasury
 * is expected to hit this — it's the one route this dashboard is built against
 * ahead of the backend shipping it, so the Treasury page can say "not deployed
 * yet" rather than showing a broken-looking error.
 */
export class AdminEndpointMissingError extends Error {
  constructor(message = "endpoint not available on this backend yet") {
    super(message);
    this.name = "AdminEndpointMissingError";
  }
}

/**
 * The endpoint answered 200 but not with the shape this client expects.
 *
 * Worth its own type because the useful response is completely different from
 * a network error: nothing is down, the contract just doesn't match, and the
 * fix is a conversation with whoever owns the endpoint. `received` carries the
 * keys that actually came back so the UI can show them instead of making
 * someone open devtools to find out.
 */
/**
 * The key works, but not on this route.
 *
 * The backend runs two shared secrets: a read-only ADMIN_METRICS_KEY that
 * covers overview/metrics/timeseries/treasury, and the full ADMIN_API_KEY that
 * also covers /admin/sends and the write endpoints. Both failures come back as
 * an identical 401, so this is distinguished by re-probing a route the metrics
 * key is known to cover — see useAdminQuery. Signing the user out for this
 * would be wrong: their key is fine, it just doesn't reach this page.
 */
export class AdminScopeError extends Error {
  constructor(message = "this endpoint needs the full admin key") {
    super(message);
    this.name = "AdminScopeError";
  }
}

export class AdminShapeError extends Error {
  readonly received: string;
  constructor(path: string, received: string) {
    super(`${path} returned an unexpected shape`);
    this.name = "AdminShapeError";
    this.received = received;
  }
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

/**
 * `key` is passed explicitly only by the login screen, which needs to test a
 * candidate key before storing it. Every other call reads the stored one.
 */
async function adminFetch<T>(path: string, key?: string): Promise<T> {
  const adminKey = key ?? getAdminKey();
  if (!adminKey) throw new AdminAuthError("no admin key");

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    cache: "no-store",
  });

  if (res.status === 401) throw new AdminAuthError();
  if (res.status === 503) throw new AdminNotConfiguredError();
  if (res.status === 404) throw new AdminEndpointMissingError(`${path} is not available on this backend yet`);

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Doubles as the login check — there is no /admin/auth endpoint to call, so a
 * candidate key is verified by making a real request with it: 200 means the
 * backend accepted it, 401 means it didn't.
 */
export function getOverview(key?: string): Promise<AdminOverview> {
  return adminFetch<AdminOverview>("/admin/overview", key);
}

export function getMetrics(): Promise<AdminMetrics> {
  return adminFetch<AdminMetrics>("/admin/metrics");
}

/** Day-by-day settled activity. `days` is clamped to [1, 365] by the backend. */
export function getMetricsTimeseries(days: number): Promise<{ days: number; timeseries: AdminMetricsDay[] }> {
  return adminFetch<{ days: number; timeseries: AdminMetricsDay[] }>(`/admin/metrics/timeseries?days=${days}`);
}

/** `limit` defaults to 20 backend-side and is capped there at 100. */
export function getSends(params: { chain?: string; limit?: number }): Promise<{ sends: AdminSendDiagnostic[] }> {
  const query = new URLSearchParams();
  if (params.chain) query.set("chain", params.chain);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return adminFetch<{ sends: AdminSendDiagnostic[] }>(`/admin/sends${qs ? `?${qs}` : ""}`);
}

/** Describes what came back, for an AdminShapeError message. */
function describeShape(value: unknown): string {
  if (value === null) return "null"; // typeof null is "object" — say what it is
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length ? `an object with keys: ${keys.join(", ")}` : "an empty object";
  }
  return `a ${typeof value}`;
}

/**
 * Live on-chain balances, in two groups the backend keeps deliberately
 * separate: `feeTreasury` is what the platform has earned (the dedicated
 * fee-sweep addresses), `operational` is what pays out sends and has to stay
 * funded with gas.
 *
 * Validated rather than trusted — this endpoint shipped after the dashboard
 * did, and an unchecked property access on a mismatch takes the page down with
 * a TypeError that tells whoever's looking at it nothing. Everything else here
 * has been stable long enough to take at its word.
 */
export async function getTreasury(): Promise<TreasurySnapshot> {
  const raw = await adminFetch<unknown>("/admin/treasury");

  if (!raw || typeof raw !== "object") throw new AdminShapeError("/admin/treasury", describeShape(raw));

  const snapshot = raw as { feeTreasury?: unknown; operational?: unknown };
  if (!Array.isArray(snapshot.feeTreasury) || !Array.isArray(snapshot.operational)) {
    throw new AdminShapeError("/admin/treasury", describeShape(raw));
  }

  return {
    feeTreasury: snapshot.feeTreasury as TreasuryWalletBalance[],
    operational: snapshot.operational as TreasuryWalletBalance[],
  };
}
