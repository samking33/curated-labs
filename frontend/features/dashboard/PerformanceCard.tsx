"use client";

import { useState } from "react";
import { tokens } from "@/lib/tokens";

export type MonthBar = { label: string; value: number };

export type Range = "month" | "quarter" | "all";

const RANGE_LABEL: Record<Range, string> = {
  month: "This Month",
  quarter: "Last 3 Months",
  all: "All Time",
};

/**
 * Bars are drawn as fine vertical hatching rather than solid fills, with a
 * saturated cap on the current month. It reads as texture at a glance and
 * keeps the card light next to the dense radial beside it.
 */
function HatchedBar({
  height,
  stroke,
  cap,
  capped,
}: {
  height: number;
  stroke: string;
  cap: string;
  capped: boolean;
}) {
  const width = 150;
  const gap = 5;
  const lines = Math.floor(width / gap);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <line
          key={i}
          x1={i * gap + 2}
          y1={capped ? 5 : 1}
          x2={i * gap + 2}
          y2={height}
          stroke={stroke}
          strokeWidth={1.6}
        />
      ))}
      {capped && <rect x={0} y={0} width={width} height={4} rx={2} fill={cap} />}
    </svg>
  );
}

export function PerformanceCard({
  completedPercent,
  months,
  highlightLabel,
  learners,
  range,
  onRangeChange,
  onConnect,
}: {
  completedPercent: number;
  months: MonthBar[];
  highlightLabel: string;
  learners: { name: string; avatarUrl?: string | null }[];
  range: Range;
  onRangeChange: (r: Range) => void;
  onConnect?: () => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const max = Math.max(...months.map((m) => m.value), 1);
  // Palette walks cool→warm so the current month reads as the peak.
  const palette = [
    { stroke: "#D8D6D2", cap: "#D8D6D2" },
    { stroke: "#AFD6E4", cap: "#AFD6E4" },
    { stroke: "#8ECB93", cap: tokens.color.accent },
  ];

  return (
    <section style={card()}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.space(3) }}>
        <h2 style={{ margin: 0, fontSize: tokens.size.xl, fontWeight: 500, color: tokens.color.text }}>
          My Performance
        </h2>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            style={selectPill()}
            aria-haspopup="listbox"
            aria-expanded={rangeOpen}
            onClick={() => setRangeOpen((o) => !o)}
          >
            {RANGE_LABEL[range]}
            <ChevronDown />
          </button>
          {rangeOpen && (
            <>
              {/* Click-away layer so the menu closes without a document listener. */}
              <div
                onClick={() => setRangeOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
              />
              <ul
                role="listbox"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 11,
                  listStyle: "none",
                  margin: 0,
                  padding: tokens.space(1),
                  minWidth: 168,
                  background: tokens.color.surface,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.md,
                  boxShadow: tokens.shadow.float,
                }}
              >
                {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={r === range}
                      onClick={() => {
                        onRangeChange(r);
                        setRangeOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: `${tokens.space(2)} ${tokens.space(3)}`,
                        border: "none",
                        borderRadius: tokens.radius.sm,
                        background: r === range ? tokens.color.surfaceSunken : "transparent",
                        color: tokens.color.text,
                        fontSize: tokens.size.base,
                        fontFamily: tokens.font.sans,
                        cursor: "pointer",
                      }}
                    >
                      {RANGE_LABEL[r]}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: tokens.space(3), marginTop: tokens.space(6) }}>
        <span style={{ fontSize: "44px", fontWeight: 600, letterSpacing: "-0.03em", color: tokens.color.text }}>
          {completedPercent}%
        </span>
        <span style={{ fontSize: tokens.size.lg, color: tokens.color.textMuted }}>Completed</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${months.length}, 1fr)`,
          gap: tokens.space(4),
          alignItems: "end",
          height: 210,
          marginTop: tokens.space(6),
        }}
      >
        {months.map((m, i) => {
          const last = i === months.length - 1;
          const p = palette[Math.min(i, palette.length - 1)]!;
          const h = Math.max(52, Math.round((m.value / max) * 150));
          return (
            <div
              key={m.label}
              title={`${m.label}: ${m.value} lab${m.value === 1 ? "" : "s"}`}
              style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
            >
              {last && (
                <div style={{ textAlign: "center", marginBottom: tokens.space(2), lineHeight: 1.15 }}>
                  <div style={{ fontSize: tokens.size.xl, fontWeight: 600, color: tokens.color.accent }}>
                    {highlightLabel}
                  </div>
                  <div style={{ fontSize: tokens.size.base, color: tokens.color.accentInk }}>Lessons</div>
                </div>
              )}
              <HatchedBar height={h} stroke={p.stroke} cap={p.cap} capped={last} />
              <div
                style={{
                  textAlign: "center",
                  marginTop: tokens.space(3),
                  fontSize: tokens.size.base,
                  fontWeight: last ? 600 : 400,
                  color: last ? tokens.color.text : tokens.color.textMuted,
                }}
              >
                {m.label}
              </div>
            </div>
          );
        })}
      </div>

      <ConnectPanel learners={learners} onConnect={onConnect} />
    </section>
  );
}

/**
 * Bottom promo panel: stacked avatars over a dotted hemisphere.
 *
 * This used to say "Connect With Learners Worldwide!" and link to Settings —
 * there has never been a messaging or social feature in this app, so that
 * promise had nothing behind it. The leaderboard is the one place that's
 * genuinely about other learners, so the panel now points there and says so.
 */
function ConnectPanel({
  learners,
  onConnect,
}: {
  learners: { name: string; avatarUrl?: string | null }[];
  onConnect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onConnect}
      style={{
        textAlign: "left",
        border: "none",
        font: "inherit",
        color: "inherit",
        cursor: onConnect ? "pointer" : "default",
        width: "100%",
        position: "relative",
        marginTop: tokens.space(5),
        padding: tokens.space(5),
        borderRadius: tokens.radius.lg,
        background: tokens.color.surfaceSunken,
        overflow: "hidden",
        minHeight: 150,
      }}
    >
      <h3
        style={{
          margin: 0,
          maxWidth: 200,
          fontSize: tokens.size.xl,
          fontWeight: 600,
          lineHeight: 1.25,
          color: tokens.color.text,
        }}
      >
        See How You Rank
      </h3>

      <div style={{ display: "flex", marginTop: tokens.space(4) }}>
        {learners.slice(0, 3).map((l, i) => (
          <span
            key={l.name}
            title={l.name}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              marginLeft: i === 0 ? 0 : -12,
              border: `2px solid ${tokens.color.surface}`,
              background: tokens.color.accentSoft,
              display: "grid",
              placeItems: "center",
              fontSize: tokens.size.sm,
              fontWeight: 600,
              color: tokens.color.accentInk,
              overflow: "hidden",
            }}
          >
            {l.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar
              <img src={l.avatarUrl} alt="" width={40} height={40} style={{ objectFit: "cover" }} />
            ) : (
              l.name.slice(0, 1).toUpperCase()
            )}
          </span>
        ))}
      </div>

      <DottedGlobe />
    </button>
  );
}

/**
 * Halftone globe: an orthographic dot-sphere sitting in the corner of the panel.
 *
 * Coordinates are rounded before they reach the DOM. Trig output serialises to
 * slightly different decimal strings between the server render and the browser,
 * which React reports as a hydration mismatch; fixing the precision makes both
 * sides emit identical attributes (and shrinks the markup).
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

function DottedGlobe() {
  const dots: { x: number; y: number; r: number }[] = [];
  const R = 108;
  const cx = 118;
  const cy = 104;

  for (let lat = -86; lat <= 86; lat += 4.5) {
    const latRad = (lat * Math.PI) / 180;
    const ringR = Math.cos(latRad) * R;
    const count = Math.max(10, Math.round(ringR / 2.6));
    for (let i = 0; i < count; i++) {
      const lon = (i / count) * Math.PI * 2;
      const z = Math.cos(lon) * ringR;
      if (z < 0) continue; // near hemisphere only
      const depth = ringR === 0 ? 1 : z / ringR;
      dots.push({
        x: r2(cx + Math.sin(lon) * ringR),
        y: r2(cy + Math.sin(latRad) * R),
        r: r2(0.5 + depth * 0.95),
      });
    }
  }

  return (
    <svg
      width="240"
      height="240"
      viewBox="0 0 240 240"
      aria-hidden
      style={{ position: "absolute", right: -46, bottom: -96 }}
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#3A3A3A" opacity={0.45} />
      ))}
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m6 9 6 6 6-6" stroke={tokens.color.text} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function card(): React.CSSProperties {
  return {
    background: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: tokens.space(6),
    boxShadow: tokens.shadow.card,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  };
}

function selectPill(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.space(2),
    padding: `${tokens.space(2)} ${tokens.space(4)}`,
    borderRadius: tokens.radius.pill,
    border: `1px solid ${tokens.color.border}`,
    background: tokens.color.surface,
    color: tokens.color.text,
    fontSize: tokens.size.base,
    fontFamily: tokens.font.sans,
    cursor: "pointer",
    boxShadow: tokens.shadow.pill,
  };
}
