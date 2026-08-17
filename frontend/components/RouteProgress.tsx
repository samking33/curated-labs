"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { tokens } from "@/lib/tokens";

const MAX_STUCK_MS = 4000;

/**
 * A top progress bar that fires on every client-side page navigation.
 *
 * Without it a route change gives no feedback at all until the new page
 * appears a few seconds later.
 *
 * Two simpler ways of detecting "navigation requested" do not work here:
 *   - Patching `history.pushState` detects the wrong moment. App Router
 *     defers actually writing the history entry until the destination route
 *     has already fetched and is ready to commit: with no per-route
 *     `loading.tsx` in this app, nothing separates those two moments, so the
 *     bar appeared already at 100% and vanished within a frame.
 *   - Mutating `.push`/`.replace` on the object `useRouter()` returns doesn't
 *     stick: that context value isn't a stable object across renders, so the
 *     patch is silently gone by the next one.
 *
 * What's left, and what actually works: almost every navigation in this app
 * is a real `<Link href>`, which renders a real `<a>`: a capturing click
 * listener on the anchor is a DOM fact, not a guess about Next internals. The
 * one place that calls `router.push()` from a button (Dashboard.tsx) goes
 * through `lib/navigation.ts`'s wrapped `useRouter` instead, which dispatches
 * the same `cl:navstart` event this component listens for.
 *
 * "Finished" is the pathname or search params actually changing underneath
 * this component: that's this component re-rendering with the destination
 * already committed, not a guess at how long the fetch might take.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const creep = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckGuard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  function start() {
    if (running.current) return;
    running.current = true;
    if (hide.current) clearTimeout(hide.current);
    setVisible(true);
    setProgress(15);
    // Creeps toward 85% and stalls there: it never claims to be finished on
    // its own; only the pathname/searchParams effect below does that.
    creep.current = setInterval(() => {
      setProgress((p) => (p >= 85 ? p : p + (85 - p) * 0.15));
    }, 150);
    // Defence in depth: if the destination never lands, because of a
    // navigation this component does not anticipate, do not leave the bar stuck.
    stuckGuard.current = setTimeout(finish, MAX_STUCK_MS);
  }

  function finish() {
    if (!running.current) return;
    running.current = false;
    if (creep.current) clearInterval(creep.current);
    if (stuckGuard.current) clearTimeout(stuckGuard.current);
    setProgress(100);
    hide.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }

  useEffect(() => {
    window.addEventListener("cl:navstart", start);

    // Catches every <Link>: a capturing listener sees the click before
    // Link's own handler can call preventDefault(), and closest("a") finds
    // the anchor even when the click landed on a child span/icon.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      // Same-page (href="#..."), external, and new-tab links aren't a route
      // change this bar should announce.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname && anchor.hash) return;
      if (anchor.pathname === window.location.pathname && anchor.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, { capture: true });

    // Browser back/forward doesn't fire a click at all.
    window.addEventListener("popstate", start);

    return () => {
      window.removeEventListener("cl:navstart", start);
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The actual "arrived" signal: this component re-rendering with a new
  // pathname/query means the destination route has already committed.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(
    () => () => {
      if (creep.current) clearInterval(creep.current);
      if (hide.current) clearTimeout(hide.current);
      if (stuckGuard.current) clearTimeout(stuckGuard.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div
      aria-hidden
      data-route-progress
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 300, pointerEvents: "none" }}
    >
      <div
        data-route-progress-bar
        style={{
          height: "100%",
          width: `${progress}%`,
          background: tokens.color.accent,
          boxShadow: `0 0 8px ${tokens.color.accent}`,
          transition: progress === 100 ? "width 160ms ease, opacity 200ms ease 120ms" : "width 200ms ease",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
