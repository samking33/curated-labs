"use client";

import { useEffect, useRef } from "react";

/**
 * Animated voice bloom.
 *
 * Canvas 2D driven by requestAnimationFrame rather than three.js: this is a few
 * thousand flat dots with no lighting, camera or depth, so a WebGL context and
 * ~600 kB of library buys nothing here and costs a dependency plus bundle size.
 * A single 2D context redraws the whole field well inside frame budget.
 *
 * Behaviour:
 *  - Idle   : slow drift, tight ring.
 *  - Listening: the ring breathes and ripples, amplitude driven by `level`.
 *  - The loop pauses when the tab is hidden and never starts when the user has
 *    asked for reduced motion.
 */

type Particle = {
  angle: number;
  baseRadius: number;
  /** Per-particle phase, so the field ripples instead of pulsing as one. */
  phase: number;
  /** Angular drift, signed, so the ring counter-rotates in bands. */
  drift: number;
  size: number;
  band: number;
  /** 0..1 position along the brand ramp, fixed per particle. */
  hue: number;
};

/**
 * The logo's own gradient stops, lifted from the supplied SVG. Particles are
 * tinted along this ramp so the field reads as the brand mark rather than a
 * flat wash of one colour.
 */
const RAMP: [number, number, number][] = [
  [254, 0, 212], // magenta
  [0, 159, 254], // blue
  [0, 244, 150], // mint
  [0, 252, 30], // green
];

function sampleRamp(t: number): string {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i]!;
  const b = RAMP[Math.min(i + 1, RAMP.length - 1)]!;
  const mix = (j: number) => Math.round(a[j]! + (b[j]! - a[j]!) * f);
  return `${mix(0)},${mix(1)},${mix(2)}`;
}

/** Cheap deterministic value noise: no dependency, stable across renders. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeParticles(count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    // Bias the population toward the rim: sqrt spreads points evenly by area,
    // and the exponent pulls the mass outward so the edge stays bright.
    const t = Math.pow(hash(i * 1.37), 0.42);
    out.push({
      angle: hash(i * 2.11) * Math.PI * 2,
      baseRadius: t,
      phase: hash(i * 3.77) * Math.PI * 2,
      drift: (hash(i * 5.19) - 0.5) * 0.28,
      size: 0.5 + hash(i * 7.31) * 0.9,
      band: t,
      hue: hash(i * 9.43),
    });
  }
  return out;
}

export function VoiceField({
  size = 300,
  listening = true,
  count = 3200,
}: {
  size?: number;
  listening?: boolean;
  count?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read through refs so changing `listening` never restarts the animation,
  // the field eases between states instead of snapping.
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const particles = makeParticles(count);
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.44;

    let raf = 0;
    let t = 0;
    let energy = 0; // eased 0..1, follows `listening`

    const draw = () => {
      const target = listeningRef.current ? 1 : 0.18;
      energy += (target - energy) * 0.05;

      ctx.clearRect(0, 0, size, size);

      // Two travelling waves at different speeds keep the rim from looking
      // like it is simply scaling in and out.
      const breathe = 1 + Math.sin(t * 0.9) * 0.035 * energy;
      const wobble1 = t * 1.15;
      const wobble2 = t * -0.63;

      for (const p of particles) {
        const a = p.angle + p.drift * t * 0.12;

        const ripple =
          Math.sin(a * 6 + wobble1 + p.phase) * 0.035 +
          Math.sin(a * 11 - wobble2 + p.phase * 0.5) * 0.022;

        // Only the outer band reacts strongly; the interior stays calm.
        const reactivity = Math.pow(p.band, 2.2);
        const r = maxR * p.baseRadius * breathe * (1 + ripple * energy * reactivity * 3.2);

        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.97;

        // Brightest in a narrow shell at the rim, faint through the middle.
        const rim = Math.max(0, 1 - Math.abs(p.band - 0.9) / 0.24);
        const alpha = 0.05 + rim * (0.55 + 0.4 * energy);

        // Tint sweeps around the ring, with per-particle scatter to avoid hard
        // banding. Named `ramp`, not `t`: `t` is the animation clock here.
        //
        // The exponent biases the distribution toward the green end: the logo is
        // predominantly green with the cool stops as accents on the shackle, and
        // a linear sweep put blue across most of the ring.
        const sweep = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
        const ramp = Math.pow(sweep * 0.72 + p.hue * 0.28, 0.42);
        ctx.fillStyle = `rgba(${sampleRamp(ramp)},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1 + rim * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduced) {
      // Honour the preference: render one static frame, run no loop.
      energy = 0.3;
      draw();
      return;
    }

    const loop = () => {
      t += 0.016;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Don't burn frames painting a canvas nobody can see.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [size, count]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={listening ? "Assistant is listening" : "Assistant is idle"}
      style={{ width: size, height: size, maxWidth: "100%" }}
    />
  );
}
