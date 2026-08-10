"use client";

import { useEffect, useState } from "react";
import { tokens } from "@/lib/tokens";

/**
 * Pops up when a submission earned points for a genuinely correct answer
 * (never for the flat participation awards on steps 1 and 5 — those have no
 * "correct" to cheer, so the caller only renders this when `cheers.length > 0`).
 *
 * Keyed by submissionId at the call site: a fresh key remounts this and
 * restarts the entrance animation, so back-to-back correct submissions each
 * get their own moment instead of the toast silently updating in place.
 *
 * Deliberately top-right — CoachBuddy already owns the bottom-right corner,
 * and stacking two floating widgets in one spot was the exact overlap bug
 * flagged earlier on the dashboard.
 */
export function CheerToast({
  points,
  cheers,
  onDone,
}: {
  points: number;
  cheers: string[];
  onDone?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveAt = setTimeout(() => setLeaving(true), 3400);
    const removeAt = setTimeout(() => onDone?.(), 3900);
    return () => {
      clearTimeout(leaveAt);
      clearTimeout(removeAt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only via remount (new key), not on onDone identity churn
  }, []);

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        zIndex: 70,
        maxWidth: 320,
        padding: `${tokens.space(4)} ${tokens.space(5)}`,
        borderRadius: tokens.radius.lg,
        background: tokens.color.surface,
        border: `1px solid ${tokens.color.border}`,
        boxShadow: tokens.shadow.float,
        animation: leaving
          ? "cheerOut 420ms cubic-bezier(.4,0,1,1) forwards"
          : "cheerIn 420ms cubic-bezier(.34,1.56,.64,1) both",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space(2) }}>
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: tokens.color.accentSoft,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3.5c.5 3.2 1.8 4.5 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.5 4.5-1.8 5-5Z"
              fill={tokens.color.accentInk}
            />
          </svg>
        </span>
        <strong style={{ fontSize: tokens.size.base, color: tokens.color.accentInk }}>+{points} points</strong>
      </div>

      {cheers.length > 0 && (
        <ul style={{ margin: `${tokens.space(2)} 0 0`, padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
          {cheers.map((c, i) => (
            <li key={i} style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
              {c}
            </li>
          ))}
        </ul>
      )}

      <style>{`
        @keyframes cheerIn { from { opacity: 0; transform: translateY(-10px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes cheerOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-6px) scale(.98); } }
        @media (prefers-reduced-motion: reduce) {
          /* Redefine both to no-ops rather than targeting [role="status"] —
             that attribute selector would also silence the assistant card's
             unrelated status paragraph elsewhere on the page. */
          @keyframes cheerIn { from, to { opacity: 1; transform: none; } }
          @keyframes cheerOut { from, to { opacity: 1; transform: none; } }
        }
      `}</style>
    </div>
  );
}
