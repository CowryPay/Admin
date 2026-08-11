"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAuthError } from "@/lib/adminApi";
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

    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (err instanceof AdminAuthError) {
          // Wrong or rotated key — drop it and send them back to login rather
          // than leaving a dead key in place to fail on the next page too.
          clearAdminKey();
          router.replace("/login");
          return;
        }
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, router]);

  return { data, error, loading, reload };
}
