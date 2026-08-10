"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";

/**
 * Drop-in replacement for `next/navigation`'s `useRouter`, for the handful of
 * call sites that navigate via `router.push()`/`replace()` from a plain
 * button rather than a real `<Link>`.
 *
 * Two things were tried and rejected before this: patching `history.pushState`
 * globally detects the wrong moment (App Router defers the actual history
 * write until the destination is already rendered, so by the time pushState
 * fires the navigation is essentially over), and mutating the object returned
 * by `useRouter()` doesn't stick (its context value isn't a stable object
 * across renders, so the patch is silently discarded on the next one).
 * Wrapping the hook has neither problem — it's called fresh each render by
 * definition, so there's no stale reference to lose.
 *
 * `<Link>`-based navigation doesn't go through this at all; RouteProgress
 * covers that with a capturing click listener instead.
 */
export function useRouter() {
  const router = useNextRouter();

  // Memoised on `router`: callers put this in useCallback/useEffect dep arrays
  // (Dashboard does), so returning a fresh object each render would silently
  // defeat their memoisation. Methods are copied explicitly rather than spread
  // — a spread only picks up own enumerable properties and would quietly drop
  // anything Next exposes on a prototype.
  return useMemo(
    () => ({
      ...router,
      back: router.back.bind(router),
      forward: router.forward.bind(router),
      refresh: router.refresh.bind(router),
      prefetch: router.prefetch.bind(router),
      push: (...args: Parameters<typeof router.push>) => {
        window.dispatchEvent(new Event("cl:navstart"));
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        window.dispatchEvent(new Event("cl:navstart"));
        router.replace(...args);
      },
    }),
    [router],
  );
}
