import type { ReactNode } from "react";
import { AdminEndpointMissingError, AdminNotConfiguredError } from "@/lib/adminApi";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-cowry-border bg-cowry-card p-6 text-sm text-cowry-muted">
      <span
        aria-hidden
        className="h-3 w-3 animate-pulse rounded-full bg-cowry-green"
      />
      {label}
    </div>
  );
}

/** Placeholder with the card's real height, so charts don't jump on load. */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl border border-cowry-border/60 bg-white/[0.02]"
      style={{ height }}
    />
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-xl border border-dashed border-cowry-border p-6 text-sm text-cowry-muted">
      {label}
    </div>
  );
}

/**
 * 401s never reach here — useAdminQuery redirects on those. What's left is a
 * backend that has no admin key configured (503), an endpoint that isn't
 * deployed yet (404, currently only /admin/treasury), or a genuine failure.
 * They read very differently to whoever is on call, so they're not collapsed
 * into one "something went wrong".
 */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  let title = "Couldn't load this data";
  let detail: ReactNode = error.message;

  if (error instanceof AdminNotConfiguredError) {
    title = "Admin API not configured on the backend";
    detail = "The backend is running without an admin key set, so every /admin/* route is refusing requests. No key typed here will work until that's set.";
  } else if (error instanceof AdminEndpointMissingError) {
    title = "This endpoint isn't deployed yet";
    detail = error.message;
  }

  return (
    <div className="rounded-2xl border border-status-critical/40 bg-status-critical/5 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-status-critical">
          ⚠
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-cowry-muted">{detail}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg border border-cowry-border px-3 py-1.5 text-xs font-medium text-white transition hover:border-cowry-green hover:text-cowry-green"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
