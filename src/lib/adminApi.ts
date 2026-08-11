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

export interface AdminTreasuryEntry {
  chain: string;
  address: string;
  onChainBalance: string;
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

/**
 * Not deployed on the backend yet as of this writing — throws
 * AdminEndpointMissingError until it is. Shape is the one agreed in the issue:
 * address from the existing REMITTANCE_TREASURY_ADDRESS / Solana + Stellar
 * treasury config, balance read live per chain.
 */
export function getTreasury(): Promise<{ treasury: AdminTreasuryEntry[] }> {
  return adminFetch<{ treasury: AdminTreasuryEntry[] }>("/admin/treasury");
}
