"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerationJob } from "@curated-labs/shared";
import { api, ApiRequestError, newIdempotencyKey } from "@/lib/api";
import { Alert, Button, Field, inputStyle } from "@/components/ui";
import { tokens } from "@/lib/tokens";

type Difficulty = "beginner" | "intermediate" | "advanced";

const POLL_MS = 2000;
// Each of the up to 2 attempts (the initial call plus the one repair retry
// on validation failure) gets its own PLAYGROUND_GEN_BUDGET_MS (150s server-
// side default) — so the real worst case is closer to 2x that plus queueing/
// processing overhead, not the single-budget-plus-a-bit this used to assume.
// A live dry run against real prompts measured a genuine single-attempt
// success taking 196s, already past the old 180s cap — 6 minutes gives
// real margin above the worst realistic case instead of just the typical one.
const MAX_POLLS = 180;
// Calibration point for the progress bar's asymptotic curve, from the same
// dry run: observed single-attempt completions ranged ~70-196s. Not a
// guarantee, just where the curve should be visually "most of the way
// there" — real completion always drives the actual 100%, never this timer.
const EXPECTED_MS = 110_000;
const PROGRESS_CAP = 92;

/**
 * Describe a system, get a generated practice scenario. Generation is async
 * (the sole viable model measures ~85s), so this polls a job rather than
 * holding a request open.
 *
 * ponytail: polling, not SSE. 2s over ~2min of generation is ~60 requests
 * against the app's existing 300/min bucket. Move to SSE if generation gets
 * slower or this form gets busier.
 */
export function GenerateForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const startedAt = useRef(0);

  // Ticks independently of the 2s job poll so the bar visibly moves instead
  // of jumping in steps. There's no real per-stage signal from the server to
  // drive an exact percentage, so this is a deliberate asymptotic estimate —
  // see EXPECTED_MS/PROGRESS_CAP — that never claims 100% on its own; only
  // an actual "succeeded" job status does that (in poll(), not here).
  useEffect(() => {
    if (!busy) return;
    const tick = () => {
      const elapsed = Date.now() - startedAt.current;
      setProgress(PROGRESS_CAP * (1 - Math.exp(-elapsed / EXPECTED_MS)));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [busy]);

  // Resetting on mount (not just setting true on cleanup) matters: React
  // Strict Mode's dev-only mount→cleanup→remount cycle would otherwise leave
  // this stuck at true forever after the very first render, before the user
  // ever clicks anything — poll() would then exit on its first line with
  // busy still true, showing "Generating…" with no request ever sent.
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const poll = async (jobId: string) => {
    for (let i = 0; i < MAX_POLLS; i++) {
      if (cancelled.current) return;
      const job = await api<GenerationJob>(`/playground/jobs/${jobId}`);
      if (job.status === "succeeded" && job.scenarioId) {
        setProgress(100);
        router.push(`/app/playground/${job.scenarioId}`);
        return;
      }
      if (job.status === "failed") {
        setError(job.error ?? "Couldn't build a scenario from that description. Try describing the system in more detail.");
        setBusy(false);
        return;
      }
      setStatus(job.status === "running" ? "Generating your scenario — this can take a minute or two…" : "Queued…");
      await sleep(POLL_MS);
    }
    setError("This is taking longer than expected. Try again in a bit.");
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setProgress(0);
    startedAt.current = Date.now();
    setStatus("Starting…");
    try {
      const session = await api<{ id: string }>("/playground/sessions", {
        method: "POST",
        body: JSON.stringify({ title: prompt.slice(0, 80) || "Custom scenario" }),
      });
      const job = await api<GenerationJob>(`/playground/sessions/${session.id}/scenarios`, {
        method: "POST",
        body: JSON.stringify({ prompt, difficulty }),
        idempotencyKey: newIdempotencyKey(),
      });
      await poll(job.jobId);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: tokens.space(3), marginBottom: tokens.space(6) }}>
      <Field label="Describe a system" hint="What does it do, who uses it, what does it touch? 20–2000 characters.">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          minLength={20}
          maxLength={2000}
          required
          rows={4}
          disabled={busy}
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="A ride-sharing app that matches drivers and riders, takes payment, and stores trip history…"
        />
      </Field>
      <Field label="Difficulty">
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          disabled={busy}
          style={inputStyle}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      {busy && (
        <div style={{ display: "grid", gap: tokens.space(2) }}>
          {status && <Alert tone="info">{status}</Alert>}
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: 8,
              borderRadius: tokens.radius.md,
              background: tokens.color.border,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: tokens.color.accent,
                borderRadius: tokens.radius.md,
                transition: "width 200ms linear",
              }}
            />
          </div>
        </div>
      )}
      <Button type="submit" disabled={busy || prompt.trim().length < 20}>
        {busy ? "Generating…" : "Generate scenario →"}
      </Button>
    </form>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "UNAUTHORIZED") return "Your session expired. Sign in again to continue.";
    return err.message;
  }
  return "Could not reach the server. Try again.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
