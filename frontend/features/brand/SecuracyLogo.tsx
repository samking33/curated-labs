/* eslint-disable @next/next/no-img-element -- static SVG in /public; the image
   loader would only add a proxy hop for a 4 kB vector. */

/**
 * The supplied Securacy lockup.
 *
 * This replaced a hand-drawn approximation built before the real assets
 * arrived. Two variants ship because the wordmark is dark on light and white on
 * dark — recolouring one variant with CSS is not possible, the text is baked in.
 */

/** Native aspect of both files (613.36 × 208.12). */
const RATIO = 208.12 / 613.36;

export const BRAND = {
  /** Logo green. Vivid — see accentText before putting text on it. */
  green: "#0bd400",
  gradient: ["#fe00d4", "#009ffe", "#00f496", "#00fc1e"] as const,
} as const;

export function SecuracyLockup({
  height = 32,
  variant = "light",
}: {
  /** Height in px; width follows the native ratio. */
  height?: number;
  /** "light" = for light backgrounds. "dark" = white wordmark. */
  variant?: "light" | "dark";
}) {
  return (
    <img
      src={variant === "dark" ? "/brand/securacy-dark.svg" : "/brand/securacy-light.svg"}
      alt="Securacy"
      height={height}
      width={Math.round(height / RATIO)}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
