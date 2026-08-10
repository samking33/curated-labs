"use client";

import { useEffect, useRef, useState } from "react";

export type Mood = "idle" | "curious" | "happy" | "thinking";

/**
 * The coach character.
 *
 * Drawn as layered SVG rather than a real 3D model: depth here comes from
 * gradients, a rim light and a contact shadow, which is enough for a face at
 * this size and avoids shipping a WebGL runtime plus a rigged asset for one
 * decorative element.
 *
 * What makes it feel alive is behaviour, not polygons — the pupils track the
 * cursor, it blinks on its own schedule, and the brows, mouth and lean all
 * shift with mood.
 */
export function Mascot({
  mood = "idle",
  size = 190,
  lookAt,
}: {
  mood?: Mood;
  size?: number;
  /** Cursor position in viewport coords; pupils follow it. */
  lookAt?: { x: number; y: number } | null;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [blink, setBlink] = useState(false);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });

  // Irregular blink timing — a metronome reads as a machine.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 130);
          schedule();
        },
        2200 + Math.random() * 3200,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // Pupils track the cursor, clamped so they stay inside the sclera.
  useEffect(() => {
    const el = ref.current;
    if (!el || !lookAt) return;
    const r = el.getBoundingClientRect();
    const dx = lookAt.x - (r.left + r.width / 2);
    const dy = lookAt.y - (r.top + r.height * 0.42);
    const dist = Math.hypot(dx, dy) || 1;
    const reach = Math.min(dist / 55, 1) * 6.5;
    setPupil({ x: (dx / dist) * reach, y: (dy / dist) * reach });
  }, [lookAt]);

  const curious = mood === "curious";
  const happy = mood === "happy";
  const thinking = mood === "thinking";

  // Eyes widen when it notices you, narrow slightly when concentrating.
  const eyeScale = blink ? 0.08 : curious ? 1.16 : thinking ? 0.82 : 1;
  const browLift = curious ? -7 : happy ? -4 : thinking ? 1 : 0;
  const mouth = happy
    ? "M78 141q22 20 44 0"
    : curious
      ? "M86 139q14 13 28 0"
      : thinking
        ? "M84 143q16 -6 32 0"
        : "M84 140q16 11 32 0";

  return (
    <svg
      ref={ref}
      width={size}
      height={size * 1.12}
      viewBox="0 0 200 224"
      aria-hidden
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        {/* Volume: lit from the upper left, falling to a deeper shade. */}
        <radialGradient id="m-body" cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#7BD98A" />
          <stop offset="52%" stopColor="#4CB050" />
          <stop offset="100%" stopColor="#2E8038" />
        </radialGradient>
        <linearGradient id="m-rim" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#BFF3C6" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#BFF3C6" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="m-sclera" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E4EFE6" />
        </radialGradient>
        <linearGradient id="m-antenna" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#22ABDD" />
          <stop offset="100%" stopColor="#8E3E9E" />
        </linearGradient>
        <filter id="m-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Contact shadow — grounds the character so it isn't a floating sticker. */}
      <ellipse
        cx="100"
        cy="207"
        rx={happy || curious ? 62 : 56}
        ry="11"
        fill="#1d3b22"
        opacity="0.2"
        filter="url(#m-soft)"
        style={{ transition: "rx 260ms ease" }}
      />

      {/* Antenna, with a bob that lags the body for a springy feel. */}
      <g
        style={{
          transformOrigin: "100px 62px",
          transform: `rotate(${curious ? -11 : thinking ? 7 : -3}deg)`,
          transition: "transform 420ms cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <path d="M100 66 Q96 44 104 30" stroke="#2E8038" strokeWidth="5" fill="none" strokeLinecap="round" />
        <circle cx="105" cy="26" r="9" fill="url(#m-antenna)" />
        <circle cx="102" cy="23" r="3" fill="#fff" opacity="0.55" />
      </g>

      {/* Head / body */}
      <g>
        <path
          d="M100 58c34 0 60 24 60 56v20c0 30-26 50-60 50s-60-20-60-50v-20c0-32 26-56 60-56z"
          fill="url(#m-body)"
        />
        {/* Rim light along the right edge, away from the key light. */}
        <path
          d="M100 58c34 0 60 24 60 56v20c0 30-26 50-60 50s-60-20-60-50v-20c0-32 26-56 60-56z"
          fill="url(#m-rim)"
        />

        {/* Brows */}
        <g style={{ transform: `translateY(${browLift}px)`, transition: "transform 220ms ease" }}>
          <path d="M60 92q13 -8 26 -1" stroke="#245F2A" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M114 91q13 -7 26 1" stroke="#245F2A" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>

        {/* Eyes. scaleY collapses them for the blink. */}
        {[72, 128].map((cx) => (
          <g
            key={cx}
            style={{
              transformOrigin: `${cx}px 112px`,
              transform: `scaleY(${eyeScale})`,
              transition: blink ? "transform 70ms ease" : "transform 200ms ease",
            }}
          >
            <ellipse cx={cx} cy="112" rx="17" ry="18.5" fill="url(#m-sclera)" />
            <circle cx={cx + pupil.x} cy={112 + pupil.y} r="8.4" fill="#152018" />
            {/* Two highlights read as a wet, rounded surface. */}
            <circle cx={cx + pupil.x - 3} cy={109 + pupil.y} r="3.1" fill="#fff" />
            <circle cx={cx + pupil.x + 3.4} cy={115.5 + pupil.y} r="1.5" fill="#fff" opacity="0.7" />
          </g>
        ))}

        {/* Cheeks warm up when it's pleased. */}
        <ellipse cx="52" cy="132" rx="10" ry="6.5" fill="#FF8FA3" opacity={happy || curious ? 0.5 : 0.28} style={{ transition: "opacity 240ms" }} />
        <ellipse cx="148" cy="132" rx="10" ry="6.5" fill="#FF8FA3" opacity={happy || curious ? 0.5 : 0.28} style={{ transition: "opacity 240ms" }} />

        <path d={mouth} stroke="#1B4720" strokeWidth="5.5" fill="none" strokeLinecap="round" style={{ transition: "d 240ms ease" }} />
      </g>

      {/* Left hand gripping the screen edge — the reason it reads as "peeking". */}
      <g
        style={{
          transformOrigin: "44px 168px",
          transform: `rotate(${curious ? -14 : 0}deg) translateY(${curious ? -5 : 0}px)`,
          transition: "transform 320ms cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <ellipse cx="40" cy="166" rx="15" ry="12" fill="#3F9B45" />
        <ellipse cx="36" cy="162" rx="10" ry="7" fill="#5FC067" opacity="0.75" />
      </g>
    </svg>
  );
}
