"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAuthError, AdminScopeError, getOverview } from "@/lib/adminApi";
import { clearAdminKey } from "@/lib/adminKey";

type QueryState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Runs an admin API call and owns the two things every page here needs to do
 * with the result: show loading/error states, and bounce to the login screen
 * the moment the key stops working.
 *
 * The 401 handling lives here rather than in each page because a key can be
 * rotated on the backend at any time — every page is one request away from
 * discovering its stored key is dead, and they should all react identically.
 */
export function useAdminQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // Held in a ref so a caller passing an inline arrow function doesn't re-fire
  // the request on every render — `deps` is what decides when to refetch.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Guards against a slow first response landing after a newer one (e.g. the
    // Sends page's chain filter changed twice quickly) and overwriting it.
    let cancelled = false;

    setLoading(true);
    setError(null);

    // One async function with a single try/catch, rather than an async handler
    // passed to .catch() — that pattern returns a promise nobody awaits, so
    // anything thrown inside the error path (including a re-probe failure)
    // becomes an unhandled rejection instead of a state update, which the App
    // Router surfaces as a bare "missing required error components" reload.
    async function run() {
      try {
        const result = await fetcherRef.current();
        if (cancelled) return;
        setData(result);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;

        if (err instanceof AdminAuthError) {
          // Two very different things produce an identical 401: a dead or
          // rotated key, and a live read-only key hitting a route that needs
          // the full admin key (/admin/sends). Re-probe the route the login
          // screen verifies against to tell them apart — signing someone out
          // mid-session because one page is out of scope would be wrong.
          let keyStillValid = false;
          try {
            await getOverview();
            keyStillValid = true;
          } catch {
            keyStillValid = false;
          }
          if (cancelled) return;

          if (keyStillValid) {
            setError(new AdminScopeError());
            setLoading(false);
          } else {
            clearAdminKey();
            router.replace("/login");
          }
          return;
        }

        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, router]);

  return { data, error, loading, reload };
}
