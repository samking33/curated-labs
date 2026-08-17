"use client";

import { tokens } from "@/lib/tokens";
import { card } from "./PerformanceCard";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export type DayState = "done" | "current" | "todo";

export type Segment = {
  label: string;
  icon: "book" | "headphones" | "bulb" | "badge";
  /** Lab step this checkpoint represents, used to mark the live one. */
  step: string;
};

/**
 * Segment angles, clockwise from twelve o'clock. Deliberately clustered across
 * the right-hand arc rather than spread evenly: it leaves the left side of the
 * dial quiet and keeps the labels off the card's edge.
 */
const SEGMENT_DEG = [0, 48, 96, 150];
const TRACK_END = 168;

/* ------------------------------------------------------------ geometry */

const SIZE = 420;
const C = SIZE / 2;
const R_OUTER = 168;
const R_INNER = 96;

const polar = (r: number, deg: number) => {
  // -90 puts 0° at twelve o'clock and sweeps clockwise, matching how progress
  // is read on a dial. Rounded so SSR and hydration emit identical attributes.
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x: Math.round((C + Math.cos(rad) * r) * 100) / 100,
    y: Math.round((C + Math.sin(rad) * r) * 100) / 100,
  };
};

/** Pie wedge from twelve o'clock, used for the inner completion fill. */
function wedgePath(r: number, sweepDeg: number) {
  if (sweepDeg <= 0) return "";
  if (sweepDeg >= 360) {
    return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`;
  }
  const end = polar(r, sweepDeg);
  return `M ${C} ${C} L ${C} ${C - r} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
}

function arcPath(r: number, fromDeg: number, toDeg: number) {
  const a = polar(r, fromDeg);
  const b = polar(r, toDeg);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${toDeg - fromDeg > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function WeeklyProgressCard({
  days,
  todayIndex,
  completed,
  total,
  segments,
  currentStep,
  startedAgo,
  timerLabel,
  onOpenLab,
}: {
  /** done/current/todo per day of the week — real, derived from attempt
   *  history. There is no per-day breakdown behind it, so the strip is a
   *  read-only status display, not a selector into different data. */
  days: DayState[];
  todayIndex: number;
  completed: number;
  total: number;
  segments: Segment[];
  currentStep?: string;
  /** "started 2 hours ago", or null with no lab in progress. Real, derived
   *  from the attempt's actual startedAt — not a client-side ticking clock. */
  startedAgo: string | null;
  timerLabel: string;
  onOpenLab?: () => void;
}) {
  const fraction = total > 0 ? Math.min(1, completed / total) : 0;

  return (
    <section style={{ ...card(), padding: tokens.space(5) }}>
      {/* Day strip: status only. Not a selector — there is no per-day view for
          it to switch to. It stopped *looking* clickable a while back, but it
          was still read as one ("I cannot click on other days"), so it now
          says what it is rather than leaving people to infer it. */}
      <div
        style={{
          fontSize: tokens.size.xs,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: tokens.color.textFaint,
          marginBottom: tokens.space(3),
        }}
      >
        Your activity this week
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: tokens.space(2) }}>
        {DAYS.map((d, i) => {
          const active = i === todayIndex;
          return (
            <div key={d} style={{ display: "grid", justifyItems: "center", gap: tokens.space(3) }}>
              <span
                aria-label={DAY_NAMES[i]}
                aria-current={active ? "date" : undefined}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: tokens.size.base,
                  fontFamily: tokens.font.sans,
                  fontWeight: active ? 600 : 400,
                  background: active ? tokens.color.accent : tokens.color.surfaceSunken,
                  color: active ? tokens.color.accentText : tokens.color.text,
                }}
              >
                {d}
              </span>
              <DayDot state={days[i] ?? "todo"} />
            </div>
          );
        })}
      </div>

      {/* radial dial */}
      <div style={{ display: "grid", placeItems: "center", flex: 1, minHeight: 0, marginTop: tokens.space(4) }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ width: "100%", maxWidth: 420, height: "auto" }}
          role="img"
          aria-label={`${completed} of ${total} steps completed in your current lab`}
        >
          <defs>
            <linearGradient id="wedge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#D7EDD9" />
              <stop offset="100%" stopColor="#EEF7EE" />
            </linearGradient>
          </defs>

          {/* outer track, then the completed portion drawn over it */}
          <circle
            cx={C}
            cy={C}
            r={R_OUTER}
            fill="none"
            stroke={tokens.color.borderStrong}
            strokeWidth={1.6}
            strokeDasharray="2 9"
            strokeLinecap="round"
          />
          <path
            d={arcPath(R_OUTER, 0, Math.max(1, fraction * TRACK_END))}
            fill="none"
            stroke={tokens.color.accent}
            strokeWidth={1.8}
            strokeDasharray="2 9"
            strokeLinecap="round"
          />

          {/* one checkpoint per segment, filled up to today's progress */}
          {segments.map((s, i) => {
            const deg = SEGMENT_DEG[i] ?? (i / segments.length) * 360;
            const p = polar(R_OUTER, deg);
            const reached = deg <= fraction * TRACK_END + 0.5;
            return (
              <g key={`cp-${s.label}`}>
                <circle cx={p.x} cy={p.y} r={9} fill={reached ? tokens.color.accent : tokens.color.surface} />
                {reached ? (
                  <path
                    d={`M ${p.x - 3.6} ${p.y} l 2.6 2.8 l 4.6 -5.2`}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <circle cx={p.x} cy={p.y} r={8.2} fill="none" stroke={tokens.color.borderStrong} strokeWidth={1.4} />
                )}
              </g>
            );
          })}

          {/* inner disc + completion wedge */}
          <circle cx={C} cy={C} r={R_INNER} fill={tokens.color.surface} stroke={tokens.color.border} strokeWidth={1.2} />
          <path d={wedgePath(R_INNER - 1, fraction * 360)} fill="url(#wedge)" />
          <circle cx={C} cy={C} r={R_INNER} fill="none" stroke={tokens.color.border} strokeWidth={1.2} />

          {/* markers sitting on the inner rim, one per segment plus midpoints */}
          {Array.from({ length: segments.length * 2 }, (_, i) => {
            const deg = (i / (segments.length * 2)) * 360;
            const p = polar(R_INNER, deg);
            const onSegment = i % 2 === 0;
            return (
              <circle
                key={`mk-${i}`}
                cx={p.x}
                cy={p.y}
                r={4.6}
                fill={tokens.color.surface}
                stroke={onSegment ? tokens.color.ink : tokens.color.borderStrong}
                strokeWidth={onSegment ? 2 : 1.3}
              />
            );
          })}

          <text
            x={C}
            y={C - 2}
            textAnchor="middle"
            fontFamily={tokens.font.sans}
            fontSize="40"
            fontWeight={600}
            fill={tokens.color.accent}
          >
            {String(completed).padStart(2, "0")}
            <tspan fontSize="24" fill={tokens.color.text}>
              /{total}
            </tspan>
          </text>
          <text
            x={C}
            y={C + 24}
            textAnchor="middle"
            fontFamily={tokens.font.sans}
            fontSize="15"
            fill={tokens.color.textMuted}
          >
            Steps Completed
          </text>

          {/*
           * Segment labels ride between the two rings. Only the live one is
           * clickable — step order is enforced server-side, so the other
           * three cannot lead anywhere different from the one action
           * ("resume the lab"). Drawing all four as buttons implied you could
           * jump straight to e.g. Mitigations, which was never true.
           */}
          {segments.map((s, i) => {
            const deg = SEGMENT_DEG[i] ?? (i / segments.length) * 360;
            const p = polar(R_INNER + 34, deg);
            const live = currentStep === s.step;
            return (
              <g
                key={s.label}
                transform={`translate(${p.x} ${p.y})`}
                onClick={live ? onOpenLab : undefined}
                style={{ cursor: live && onOpenLab ? "pointer" : "default" }}
                role={live && onOpenLab ? "button" : undefined}
                aria-label={live && onOpenLab ? `Resume the ${s.label} step` : undefined}
              >
                {live && <rect x={-46} y={-30} width={92} height={52} fill="transparent" />}
                <g transform="translate(0 -16)" opacity={live ? 1 : 0.45}>
                  <SegmentIcon kind={s.icon} active={live} />
                </g>
                <text
                  textAnchor="middle"
                  y={14}
                  fontFamily={tokens.font.sans}
                  fontSize="14"
                  fontWeight={live ? 600 : 400}
                  fill={live ? tokens.color.accent : tokens.color.textFaint}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Resume row. One real action ("open the lab"), one honest fact
          ("started N ago") — the ticking client-side stopwatch and its pause
          button here previously didn't track anything real: it reset to 0:00
          on every page load and had no effect on the actual lab. */}
      <button
        type="button"
        onClick={onOpenLab}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tokens.space(3),
          width: "100%",
          marginTop: tokens.space(4),
          padding: `${tokens.space(4)} ${tokens.space(5)}`,
          borderRadius: tokens.radius.pill,
          border: "none",
          background: tokens.color.surfaceSunken,
          cursor: onOpenLab ? "pointer" : "default",
          fontFamily: tokens.font.sans,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: tokens.space(3), minWidth: 0 }}>
          <ClockIcon />
          <span
            style={{
              fontSize: tokens.size.lg,
              color: tokens.color.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {timerLabel}
          </span>
        </span>
        <span style={{ fontSize: tokens.size.base, color: tokens.color.textMuted, whiteSpace: "nowrap" }}>
          {startedAgo ? `Started ${startedAgo}` : "Browse labs →"}
        </span>
      </button>
    </section>
  );
}

function DayDot({ state }: { state: DayState }) {
  if (state === "done") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-label="completed" role="img">
        <circle cx="10" cy="10" r="10" fill={tokens.color.ink} />
        <path d="M6 10.2l2.6 2.6L14 7.4" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "current") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-label="in progress" role="img">
        <circle cx="10" cy="10" r="9" fill="none" stroke={tokens.color.accentSoft} strokeWidth="2.2" />
        <path
          d="M10 1a9 9 0 0 1 9 9"
          fill="none"
          stroke={tokens.color.accent}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-label="not started" role="img">
      <circle cx="10" cy="10" r="9" fill="none" stroke={tokens.color.borderStrong} strokeWidth="1.6" />
    </svg>
  );
}

function SegmentIcon({ kind, active }: { kind: Segment["icon"]; active?: boolean }) {
  const p = { stroke: active ? tokens.color.accent : tokens.color.textFaint, strokeWidth: 1.6, fill: "none", strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (kind) {
    case "book":
      return (
        <g {...p} transform="translate(-11 -9)">
          <path d="M11 4.5C9.5 3.2 7.4 2.8 5 3.2v12c2.4-.4 4.5 0 6 1.3 1.5-1.3 3.6-1.7 6-1.3v-12c-2.4-.4-4.5 0-6 1.3Z" />
          <path d="M11 4.5v12.3" />
        </g>
      );
    case "headphones":
      return (
        <g {...p} transform="translate(-10 -9)">
          <path d="M3.5 12v-1.5a6.5 6.5 0 0 1 13 0V12" />
          <rect x="2" y="11.5" width="4" height="6" rx="1.6" />
          <rect x="14" y="11.5" width="4" height="6" rx="1.6" />
        </g>
      );
    case "bulb":
      return (
        <g {...p} transform="translate(-9 -9)">
          <path d="M9 2.5a5.5 5.5 0 0 0-3.2 10c.5.4.8 1 .8 1.6v.4h4.8v-.4c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 9 2.5Z" />
          <path d="M7 17h4" />
        </g>
      );
    case "badge":
      return (
        <g {...p} transform="translate(-9 -9)">
          <circle cx="9" cy="9" r="6.5" />
          <circle cx="9" cy="9" r="2.4" />
        </g>
      );
  }
}

function ClockIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.6" stroke={tokens.color.text} strokeWidth="1.6" />
      <path d="M12 7.6V12l2.8 1.8" stroke={tokens.color.text} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
