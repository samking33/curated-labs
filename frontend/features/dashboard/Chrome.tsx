"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tokens } from "@/lib/tokens";
import { SecuracyLockup } from "@/features/brand/SecuracyLogo";

/** The radiating sunburst mark. Drawn rather than shipped as an asset. */
export function Logo({ size = 34 }: { size?: number }) {
  // Rising-sun fan: rays sweep the upper half only, above a solid baseline.
  const rays = Array.from({ length: 7 }, (_, i) => {
    const angle = -170 + (i * 160) / 6;
    const rad = (angle * Math.PI) / 180;
    return {
      x1: 50 + Math.cos(rad) * 20,
      y1: 52 + Math.sin(rad) * 20,
      x2: 50 + Math.cos(rad) * 50,
      y2: 52 + Math.sin(rad) * 50,
    };
  });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden focusable="false">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F97A3D" />
          <stop offset="100%" stopColor={tokens.color.accent} />
        </linearGradient>
      </defs>
      <g stroke="url(#logo-g)" strokeWidth={11} strokeLinecap="round">
        {rays.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
        ))}
      </g>
      <rect x={4} y={64} width={92} height={12} rx={6} fill="url(#logo-g)" />
    </svg>
  );
}

const NAV = [
  { label: "Dashboard", href: "/app" },
  { label: "Learn", href: "/app/catalog" },
  { label: "Practice", href: "/app/practice" },
  { label: "Live Classes", href: "/app/live" },
  { label: "Progress", href: "/app/progress" },
  { label: "Leaderboard", href: "/app/leaderboard" },
];

export function TopNav({
  name,
  avatarUrl,
  points,
  onProfile,
}: {
  name: string;
  avatarUrl?: string | null;
  /** Undefined hides the badge entirely (e.g. points fetch failed) rather
   *  than showing a misleading 0. */
  points?: number | null;
  onProfile?: () => void;
}) {
  const pathname = usePathname();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.space(6),
        padding: `${tokens.space(6)} ${tokens.space(8)} ${tokens.space(4)}`,
      }}
    >
      <Link
        href="/app"
        style={{ display: "flex", alignItems: "center", gap: tokens.space(3), textDecoration: "none" }}
      >
        <SecuracyLockup height={44} />
      </Link>

      <nav
        aria-label="Main"
        style={{ display: "flex", alignItems: "center", gap: tokens.space(1), margin: "0 auto" }}
      >
        {NAV.map((item) => {
          // Exact match for the dashboard root, prefix match for the sections,
          // so /app/catalog/app-security still lights up "Learn".
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                padding: `${tokens.space(3)} ${tokens.space(5)}`,
                borderRadius: tokens.radius.pill,
                fontSize: tokens.size.lg,
                textDecoration: "none",
                whiteSpace: "nowrap",
                color: tokens.color.text,
                background: active ? tokens.color.surface : "transparent",
                boxShadow: active ? tokens.shadow.pill : "none",
                fontWeight: active ? 500 : 400,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: tokens.space(3) }}>
        {points != null && (
          <Link
            href="/app/leaderboard"
            title="See the leaderboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: tokens.space(2),
              padding: `${tokens.space(2)} ${tokens.space(4)}`,
              borderRadius: tokens.radius.pill,
              background: tokens.color.accentSoft,
              color: tokens.color.accentInk,
              fontSize: tokens.size.base,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3.5c.5 3.2 1.8 4.5 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.5 4.5-1.8 5-5Z"
                fill={tokens.color.accentInk}
              />
            </svg>
            {points.toLocaleString()}
          </Link>
        )}

        <Avatar name={name} url={avatarUrl} onClick={onProfile} />
      </div>
    </header>
  );
}

function Avatar({ name, url, onClick }: { name: string; url?: string | null; onClick?: () => void }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      title={name}
      aria-label={`${name} — open settings`}
      onClick={onClick}
      style={{
        border: "none",
        padding: 0,
        cursor: onClick ? "pointer" : "default",
        width: 46,
        height: 46,
        borderRadius: "50%",
        overflow: "hidden",
        background: tokens.color.accentSoft,
        boxShadow: tokens.shadow.pill,
        display: "grid",
        placeItems: "center",
        fontSize: tokens.size.base,
        fontWeight: 600,
        color: tokens.color.accentInk,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatar, no loader configured
        <img src={url} alt="" width={46} height={46} style={{ objectFit: "cover" }} />
      ) : (
        initials || "?"
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ hero */

export function HeroHeader({
  firstName,
  modulesThisWeek,
  today,
  onAskCoach,
  onPrimaryAction,
  /** Drives both the label and the icon — "Continue lab" vs "Start a lab" are
   *  different actions, not one button with a generic name. */
  hasLabInProgress,
}: {
  firstName: string;
  modulesThisWeek: number;
  hasLabInProgress: boolean;
  onPrimaryAction?: () => void;
  /**
   * Formatted on the server and passed down. Calling `new Date()` here would
   * render one value during SSR and another in the browser whenever the two
   * disagree on timezone, which React reports as a hydration mismatch.
   */
  today: { day: number; weekday: string; month: string };
  onAskCoach?: () => void;
}) {
  const { day, weekday, month } = today;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: tokens.space(8),
        padding: `${tokens.space(4)} ${tokens.space(8)} ${tokens.space(10)}`,
        flexWrap: "wrap",
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: tokens.size.lg, color: tokens.color.text }}>
          Great Job, <strong style={{ fontWeight: 600 }}>{firstName}!</strong>
        </p>
        <h1
          style={{
            margin: `${tokens.space(3)} 0 0`,
            fontSize: tokens.size.hero,
            lineHeight: 1.18,
            letterSpacing: "-0.025em",
            fontWeight: 400,
            color: tokens.color.text,
          }}
        >
          You&apos;ve Completed
          <br />
          <strong style={{ fontWeight: 600 }}>{modulesThisWeek} Modules</strong> This Week.
        </h1>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: tokens.space(4) }}>
        <div style={{ display: "flex", alignItems: "center", gap: tokens.space(3) }}>
          <span
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              border: `1px solid ${tokens.color.borderStrong}`,
              display: "grid",
              placeItems: "center",
              fontSize: tokens.size.xl,
              color: tokens.color.text,
            }}
          >
            {day}
          </span>
          <span style={{ fontSize: tokens.size.base, lineHeight: 1.25, color: tokens.color.text }}>
            {weekday},
            <br />
            {month}
          </span>
        </div>

        <span aria-hidden style={{ width: 1, height: 34, background: tokens.color.borderStrong }} />

        {/* Was "Add Task" — a to-do action this app has never had. It always
            opened the catalog, so it now says exactly that, and resumes your
            in-progress lab instead when there is one. */}
        <button type="button" onClick={onPrimaryAction} style={pillButton(false)}>
          {hasLabInProgress ? <PlayIcon /> : <PlusIcon />}
          {hasLabInProgress ? "Continue Lab" : "Start a Lab"}
        </button>

        <button type="button" onClick={onAskCoach} style={pillButton(true)}>
          <SparkleIcon color={tokens.color.accentText} />
          Ask the Coach
        </button>
      </div>
    </div>
  );
}

function pillButton(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.space(2),
    padding: `${tokens.space(4)} ${tokens.space(6)}`,
    borderRadius: tokens.radius.pill,
    fontSize: tokens.size.lg,
    fontFamily: tokens.font.sans,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: primary ? "none" : `1px solid ${tokens.color.border}`,
    background: primary ? tokens.color.accent : tokens.color.surface,
    color: primary ? tokens.color.accentText : tokens.color.text,
    boxShadow: primary ? "0 6px 18px rgba(240,84,35,0.28)" : tokens.shadow.pill,
  };
}

function PlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke={tokens.color.text} strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 4.5v15l13-7.5-13-7.5Z" fill={tokens.color.text} />
    </svg>
  );
}

export function SparkleIcon({ color = tokens.color.text, size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5c.5 3.2 1.8 4.5 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.5 4.5-1.8 5-5Z"
        fill={color}
      />
      <path d="M18.5 14c.28 1.6.92 2.24 2.5 2.5-1.58.26-2.22.9-2.5 2.5-.28-1.6-.92-2.24-2.5-2.5 1.58-.26 2.22-.9 2.5-2.5Z" fill={color} />
      <path d="M5.5 4c.2 1.15.66 1.6 1.8 1.8-1.14.2-1.6.65-1.8 1.8-.2-1.15-.66-1.6-1.8-1.8C4.84 5.6 5.3 5.15 5.5 4Z" fill={color} />
    </svg>
  );
}
