/**
 * Centralized design tokens (§16).
 *
 * Feature code must never hard-code a colour or spacing value — it reads from
 * here, so the whole app re-skins by editing this file. Keys are stable; only
 * the values changed when the product owner supplied the visual direction.
 */
export const tokens = {
  color: {
    /** Warm off-white page. The hero gradient sits on top of this. */
    bg: "#F4F3F1",
    surface: "#FFFFFF",
    surfaceRaised: "#FAFAF9",
    /** Slightly warm neutral used for inset panels and chart gutters. */
    surfaceSunken: "#F6F5F3",
    border: "#EAE8E4",
    borderStrong: "#D9D6D1",
    text: "#141414",
    textMuted: "#6F6F6F",
    textFaint: "#9C9A97",
    /*
     * Securacy green, straight from the supplied logo.
     *
     * It is vivid enough that white text on it measures 2.0:1 — unreadable, and
     * below even the 3:1 large-text floor. Near-black on it measures 9.2:1, so
     * filled controls use dark ink and keep the real brand colour instead of a
     * muddied "accessible" substitute.
     */
    accent: "#0BD400",
    /** Text and icons ON an accent fill. */
    accentText: "#0A2A0B",
    /** Accent-COLOURED text on a light surface — the fill is far too light. */
    accentInk: "#0E7A1B",
    accentSoft: "#E2FBE0",
    /** Logo gradient stops, for decorative use only (no text sits on these). */
    brandMagenta: "#FE00D4",
    brandBlue: "#009FFE",
    brandMint: "#00F496",
    brandGreen: "#00FC1E",
    /** Near-black used for primary controls (pause, mic) and status ticks. */
    ink: "#101010",
    success: "#0E7A1B",
    successSoft: "#E2FBE0",
    warning: "#C97A16",
    danger: "#D93A2B",
    critical: "#D93A2B",
    high: "#E4712C",
    medium: "#C99A16",
    low: "#3E9B54",
  },
  space: (n: number) => `${n * 4}px`,
  radius: { sm: "8px", md: "12px", lg: "20px", xl: "28px", pill: "999px" },
  font: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "SF Pro Display", "Segoe UI", Inter, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  size: { xs: "11px", sm: "13px", base: "14.5px", lg: "17px", xl: "21px", xxl: "34px", hero: "46px" },
  /** Cards sit on the page with a soft, very diffuse shadow rather than a border. */
  shadow: {
    card: "0 1px 2px rgba(20,20,20,0.04), 0 8px 24px rgba(20,20,20,0.04)",
    pill: "0 1px 2px rgba(20,20,20,0.06), 0 4px 12px rgba(20,20,20,0.06)",
    float: "0 2px 6px rgba(20,20,20,0.08), 0 12px 32px rgba(20,20,20,0.10)",
  },
} as const;

export const priorityColor: Record<string, string> = {
  critical: tokens.color.critical,
  high: tokens.color.high,
  medium: tokens.color.medium,
  low: tokens.color.low,
};
