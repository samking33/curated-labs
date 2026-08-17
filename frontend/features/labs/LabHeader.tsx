"use client";

import Link from "next/link";
import type { LabStep } from "@curated-labs/shared";
import { tokens } from "@/lib/tokens";

export type StepDef = { step: LabStep; label: string };

/**
 * Sticky lab header: where you are, what you're doing, how far through.
 *
 * The progress rail replaced a row of pills. Pills showed the step names but
 * not the shape of the journey — you couldn't see at a glance that there are
 * six stops and you're on the second. A connected rail with numbered nodes
 * carries that in one look, which matters because the whole product is a
 * repeated five-step drill.
 */
export function LabHeader({
  title,
  categoryName,
  categorySlug,
  difficulty,
  minutes,
  steps,
  currentIndex,
  onRevisit,
  backHref = "/app/catalog",
  categoryHref = `/app/catalog/${categorySlug}`,
}: {
  title: string;
  categoryName: string;
  categorySlug: string;
  difficulty: string;
  minutes: number;
  steps: StepDef[];
  currentIndex: number;
  /** Set to make already-completed stops clickable, for reviewing an earlier
   *  answer. Read-only: revisiting never lets a submitted step be re-answered. */
  onRevisit?: (step: StepDef["step"]) => void;
  backHref?: string;
  categoryHref?: string;
}) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: `${tokens.color.bg}f2`,
        backdropFilter: "blur(10px)",
        borderBottom: `1px solid ${tokens.color.border}`,
        padding: `${tokens.space(4)} ${tokens.space(7)} 0`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: tokens.space(6),
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <nav
            aria-label="Breadcrumb"
            style={{ display: "flex", alignItems: "center", gap: tokens.space(2), fontSize: tokens.size.sm }}
          >
            <Link href={backHref} style={{ color: tokens.color.textMuted, textDecoration: "none" }}>
              ← Labs
            </Link>
            <span style={{ color: tokens.color.textFaint }}>/</span>
            <Link
              href={categoryHref}
              style={{ color: tokens.color.textMuted, textDecoration: "none" }}
            >
              {categoryName}
            </Link>
          </nav>

          <h1
            style={{
              margin: `${tokens.space(2)} 0 0`,
              fontSize: "32px",
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              fontWeight: 600,
              color: tokens.color.text,
            }}
          >
            {title}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: tokens.space(2), paddingBottom: tokens.space(1) }}>
          <Meta capitalize>{difficulty}</Meta>
          <Meta>{minutes} min</Meta>
        </div>
      </div>

      <StepRail steps={steps} currentIndex={currentIndex} onRevisit={onRevisit} />
    </header>
  );
}

function Meta({ children, capitalize }: { children: React.ReactNode; capitalize?: boolean }) {
  return (
    <span
      style={{
        padding: `${tokens.space(1)} ${tokens.space(3)}`,
        borderRadius: tokens.radius.pill,
        border: `1px solid ${tokens.color.border}`,
        background: tokens.color.surface,
        fontSize: tokens.size.sm,
        color: tokens.color.textMuted,
        // Only the difficulty needs it; "30 min" must not become "30 Min".
        textTransform: capitalize ? "capitalize" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StepRail({
  steps,
  currentIndex,
  onRevisit,
}: {
  steps: StepDef[];
  currentIndex: number;
  onRevisit?: (step: StepDef["step"]) => void;
}) {
  return (
    <nav
      aria-label="Lab progress"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        marginTop: tokens.space(5),
      }}
    >
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const nodeBg = done || current ? tokens.color.accent : tokens.color.surface;
        const nodeFg = done || current ? tokens.color.accentText : tokens.color.textFaint;

        // Only finished stops are revisitable, and only to read them back.
        const revisitable = done && Boolean(onRevisit);

        return (
          <div
            key={s.step}
            onClick={revisitable ? () => onRevisit!(s.step) : undefined}
            role={revisitable ? "button" : undefined}
            tabIndex={revisitable ? 0 : undefined}
            onKeyDown={revisitable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRevisit!(s.step); } } : undefined}
            aria-label={revisitable ? `Review your ${s.label} answer` : undefined}
            title={revisitable ? `Review your ${s.label} answer` : undefined}
            style={{ display: "grid", justifyItems: "center", position: "relative", minWidth: 0, cursor: revisitable ? "pointer" : "default" }}
          >
            {/* Connector drawn behind the node, and only between nodes. */}
            {i > 0 && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 13,
                  right: "50%",
                  width: "100%",
                  height: 2,
                  background: done || current ? tokens.color.accent : tokens.color.border,
                }}
              />
            )}

            <span
              aria-hidden
              style={{
                position: "relative",
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: nodeBg,
                color: nodeFg,
                border: `2px solid ${done || current ? tokens.color.accent : tokens.color.border}`,
                fontSize: tokens.size.sm,
                fontWeight: 600,
                // Lifts the current stop off the rail without moving anything.
                boxShadow: current ? `0 0 0 4px ${tokens.color.accentSoft}` : "none",
              }}
            >
              {done ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>

            <span
              aria-current={current ? "step" : undefined}
              style={{
                marginTop: tokens.space(2),
                marginBottom: tokens.space(3),
                fontSize: tokens.size.sm,
                fontWeight: current ? 600 : 400,
                color: current ? tokens.color.text : tokens.color.textMuted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * The five steps as a roadmap, shown while the learner is still on the brief.
 * Setting expectations up front is worth the space — it is the difference
 * between "a form" and "a guided exercise".
 */
export function Roadmap({ steps, currentIndex }: { steps: StepDef[]; currentIndex: number }) {
  const blurb: Record<string, string> = {
    architecture_issues: "Say what looks risky, weak or missing.",
    attack_surfaces: "Mark where untrusted input gets in.",
    threats: "Name the threats. Retry until you have the shape of it.",
    prioritization: "Rank them and defend your reasoning.",
    mitigations: "Match each threat to the control that addresses it.",
    release_decision: "Ship, ship with conditions, or hold.",
  };
  const items = steps.filter((s) => blurb[s.step]);

  return (
    <section
      style={{
        background: tokens.color.surface,
        borderRadius: tokens.radius.xl,
        padding: tokens.space(6),
        boxShadow: tokens.shadow.card,
      }}
    >
      <h2 style={{ margin: 0, fontSize: tokens.size.lg, fontWeight: 600, color: tokens.color.text }}>
        What you&apos;ll do
      </h2>
      <ol style={{ listStyle: "none", margin: `${tokens.space(4)} 0 0`, padding: 0, display: "grid", gap: tokens.space(4) }}>
        {items.map((s, i) => {
          const stepIdx = steps.findIndex((x) => x.step === s.step);
          const done = stepIdx < currentIndex;
          return (
            <li key={s.step} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: tokens.space(3) }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: tokens.size.sm,
                  fontWeight: 600,
                  background: done ? tokens.color.accentSoft : tokens.color.surfaceSunken,
                  color: done ? tokens.color.accent : tokens.color.textMuted,
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: tokens.size.base, fontWeight: 500, color: tokens.color.text }}>{s.label}</div>
                <div style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted, lineHeight: 1.5 }}>
                  {blurb[s.step]}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
