"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for the dashboard pages.
 *
 * Without one, an error thrown while rendering any of these pages leaves the
 * App Router with nothing to show — it reports "missing required error
 * components, refreshing..." and hard-reloads, which hides the actual error and
 * can loop. This catches it, shows what went wrong, and offers a retry that
 * re-renders the segment instead of reloading the whole app.
 *
 * Data-fetch failures don't reach here — useAdminQuery turns those into inline
 * error states. What lands here is a genuine render-time bug, so it shows the
 * real message rather than a friendly euphemism.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console for whoever is debugging. Deliberately
    // logs the error only — never the admin key, which isn't part of it.
    console.error("Dashboard render error:", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-status-critical/40 bg-status-critical/5 p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-status-critical">
          ⚠
        </span>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-white">This page hit an error</h1>
          <p className="mt-1 text-sm text-cowry-muted">
            {error.message || "No message was attached to the error."}
          </p>
          {error.digest ? (
            <p className="mt-1 text-xs text-cowry-muted">Digest: {error.digest}</p>
          ) : null}

          {error.stack ? (
            <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-cowry-border bg-cowry-dark p-3 text-xs leading-relaxed text-cowry-muted">
              {error.stack}
            </pre>
          ) : null}

          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-lg border border-cowry-border px-3 py-1.5 text-xs font-medium text-white transition hover:border-cowry-green hover:text-cowry-green"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
