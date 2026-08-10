"use client";

import type { CSSProperties, ReactNode } from "react";
import { tokens } from "@/lib/tokens";

/**
 * Small shared primitives so feature code never reaches for a raw colour.
 * Deliberately unstyled beyond the tokens — the real visual identity lands
 * later and should only need changes here and in tokens.ts (§16).
 */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: tokens.color.surface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: tokens.space(5),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const palette = {
    primary: { bg: tokens.color.accent, fg: tokens.color.accentText, border: tokens.color.accent },
    ghost: { bg: "transparent", fg: tokens.color.text, border: tokens.color.borderStrong },
    danger: { bg: "transparent", fg: tokens.color.danger, border: tokens.color.danger },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: `${tokens.space(2)} ${tokens.space(4)}`,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        borderRadius: tokens.radius.md,
        fontSize: tokens.size.base,
        fontFamily: tokens.font.sans,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: tokens.space(4) }}>
      <span style={{ display: "block", fontSize: tokens.size.sm, color: tokens.color.textMuted, marginBottom: tokens.space(1) }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ display: "block", fontSize: tokens.size.xs, color: tokens.color.textFaint, marginTop: tokens.space(1) }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: tokens.space(2),
  background: tokens.color.bg,
  color: tokens.color.text,
  border: `1px solid ${tokens.color.borderStrong}`,
  borderRadius: tokens.radius.md,
  fontSize: tokens.size.base,
  fontFamily: tokens.font.sans,
};

/** Every async surface must show loading / error / empty / success (§25). */
export function Alert({ tone, children }: { tone: "error" | "warning" | "info"; children: ReactNode }) {
  const color = { error: tokens.color.danger, warning: tokens.color.warning, info: tokens.color.accent }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        padding: tokens.space(3),
        border: `1px solid ${color}`,
        borderRadius: tokens.radius.md,
        color,
        fontSize: tokens.size.sm,
        background: `${color}12`,
      }}
    >
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
      {label}
    </span>
  );
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: `2px ${tokens.space(2)}`,
        borderRadius: tokens.radius.sm,
        fontSize: tokens.size.xs,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: color ?? tokens.color.textMuted,
        border: `1px solid ${color ?? tokens.color.border}`,
      }}
    >
      {children}
    </span>
  );
}
