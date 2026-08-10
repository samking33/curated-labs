"use client";

import { useEffect, useRef, useState } from "react";
import { tokens } from "@/lib/tokens";
import { Mascot, type Mood } from "./Mascot";
import { useCoachChat } from "./useCoachChat";

const TUCKED_KEY = "securacy:buddy-tucked";
const PROMPTS = [
  "Need a hand?",
  "Stuck on this one?",
  "Want a hint?",
  "Talk it through?",
];

/**
 * The coach peeking in from the right edge.
 *
 * Deliberately restrained: it slides in once after a delay, offers help, and
 * takes "no" for an answer — declining tucks it to a small edge handle for the
 * rest of the session, so it stops asking but stays one click away. A mascot
 * that re-nags is the fastest way to make people hate a product; one that
 * vanishes for good takes the feature with it.
 */
export function CoachBuddy() {
  const [peeking, setPeeking] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  /**
   * "Not now" tucks the character away rather than deleting it. It used to
   * unmount entirely, which left no way back to the coach for the rest of the
   * session — declining one offer of help should not cost you the feature.
   */
  const [tucked, setTucked] = useState(true); // assume tucked until checked
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [promptIndex] = useState(() => Math.floor(Math.random() * PROMPTS.length));

  const chat = useCoachChat();

  // Only greet learners who haven't already waved it away.
  useEffect(() => {
    // `?coach=open` opens the panel straight away, so a link in an email or a
    // support reply can drop someone into the coach rather than describing
    // where to find it.
    setReady(true);
    if (new URLSearchParams(window.location.search).get("coach") === "open") {
      setTucked(false);
      setPeeking(true);
      setOpen(true);
      return;
    }
    // Already declined this session: stay tucked, but stay reachable.
    if (sessionStorage.getItem(TUCKED_KEY)) return;
    setTucked(false);
    const t = setTimeout(() => setPeeking(true), 2600);
    return () => clearTimeout(t);
  }, []);

  // Eye tracking. Throttled to animation frames so mousemove cannot flood
  // React with state updates.
  const frame = useRef(0);
  useEffect(() => {
    // The tucked handle still shows the face, so keep tracking either way.
    if (!ready) return;
    const onMove = (e: MouseEvent) => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setCursor({ x: e.clientX, y: e.clientY });
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [ready]);

  // Escape closes the panel, as with any dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tuckAway = () => {
    setTucked(true);
    setPeeking(false);
    setOpen(false);
    sessionStorage.setItem(TUCKED_KEY, "1");
  };

  const summon = () => {
    setTucked(false);
    setPeeking(true);
    setOpen(true);
    sessionStorage.removeItem(TUCKED_KEY);
  };

  // Nothing renders until sessionStorage has been read, so the character
  // cannot flash in and out on first paint.
  if (!ready) return null;

  // Tucked: a small handle stays clipped to the edge. One click brings it back.
  if (tucked) {
    return (
      <button
        type="button"
        onClick={summon}
        aria-label="Open the coach"
        style={{
          position: "fixed",
          right: 0,
          bottom: 28,
          zIndex: 60,
          width: 56,
          height: 56,
          border: "none",
          borderTopLeftRadius: 26,
          borderBottomLeftRadius: 26,
          background: tokens.color.surface,
          boxShadow: tokens.shadow.float,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        {/* Nudged so the face sits centred in the tab — the SVG carries its
            contact shadow below the body, which otherwise pulls it low. */}
        <span style={{ transform: "translate(8px, 4px)", pointerEvents: "none" }}>
          <Mascot mood="idle" size={58} lookAt={cursor} />
        </span>
      </button>
    );
  }

  const mood: Mood = chat.thinking ? "thinking" : open ? "happy" : hovered ? "curious" : "idle";

  return (
    <>
      {open && <MiniChat chat={chat} onClose={() => setOpen(false)} />}

      <div
        style={{
          position: "fixed",
          right: 0,
          bottom: 18,
          zIndex: 60,
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          // Tucked off-screen until it peeks, and leaning in further on hover.
          // Peeking means part of the BODY is off-screen, not half the face —
          // the expression is the whole point of the character.
          transform: peeking
            ? `translateX(${hovered || open ? -10 : 14}px)`
            : "translateX(160px)",
          transition: "transform 620ms cubic-bezier(.34,1.4,.64,1)",
          pointerEvents: "none",
        }}
      >
        {!open && peeking && (
          <SpeechBubble
            text={PROMPTS[promptIndex]!}
            onAccept={() => setOpen(true)}
            onDismiss={tuckAway}
          />
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          aria-label={open ? "Close the coach" : "Open the coach"}
          aria-expanded={open}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            pointerEvents: "auto",
            // Leans out from the edge, straightening up when it notices you.
            transform: `rotate(${hovered || open ? -4 : -13}deg) translateY(${hovered ? -8 : 0}px)`,
            transition: "transform 420ms cubic-bezier(.34,1.56,.64,1)",
            animation: peeking && !hovered && !open ? "buddyBob 3.6s ease-in-out infinite" : "none",
          }}
        >
          <Mascot mood={mood} size={150} lookAt={cursor} />
        </button>
      </div>

      <style>{`
        @keyframes buddyBob { 0%,100%{ translate: 0 0 } 50%{ translate: 0 -7px } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes buddyBob { 0%,100%{ translate: 0 0 } }
        }
      `}</style>
    </>
  );
}

function SpeechBubble({
  text,
  onAccept,
  onDismiss,
}: {
  text: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        pointerEvents: "auto",
        position: "relative",
        marginBottom: 38,
        marginRight: -6,
        padding: `${tokens.space(3)} ${tokens.space(4)}`,
        borderRadius: 18,
        background: tokens.color.surface,
        boxShadow: tokens.shadow.float,
        border: `1px solid ${tokens.color.border}`,
        animation: "buddyPop 380ms cubic-bezier(.34,1.56,.64,1) 500ms both",
        whiteSpace: "nowrap",
      }}
    >
      <p style={{ margin: 0, fontSize: tokens.size.base, fontWeight: 500, color: tokens.color.text }}>{text}</p>

      <div style={{ display: "flex", gap: tokens.space(2), marginTop: tokens.space(3) }}>
        <button
          type="button"
          onClick={onAccept}
          style={{
            padding: `${tokens.space(2)} ${tokens.space(4)}`,
            borderRadius: tokens.radius.pill,
            border: "none",
            background: tokens.color.accent,
            color: tokens.color.accentText,
            fontSize: tokens.size.sm,
            fontFamily: tokens.font.sans,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Yes please
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: `${tokens.space(2)} ${tokens.space(3)}`,
            borderRadius: tokens.radius.pill,
            border: "none",
            background: "transparent",
            color: tokens.color.textMuted,
            fontSize: tokens.size.sm,
            fontFamily: tokens.font.sans,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>

      {/* Tail pointing down at the character. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 20,
          bottom: -7,
          width: 14,
          height: 14,
          background: tokens.color.surface,
          borderRight: `1px solid ${tokens.color.border}`,
          borderBottom: `1px solid ${tokens.color.border}`,
          transform: "rotate(45deg)",
        }}
      />
      <style>{`@keyframes buddyPop{from{opacity:0;transform:translateY(8px) scale(.92)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function MiniChat({
  chat,
  onClose,
}: {
  chat: ReturnType<typeof useCoachChat>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.turns, chat.thinking]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void chat.send(draft);
    setDraft("");
  };

  return (
    <div
      role="dialog"
      aria-label="Coach"
      style={{
        position: "fixed",
        right: 22,
        bottom: 168,
        zIndex: 61,
        width: "min(360px, calc(100vw - 44px))",
        maxHeight: "min(60vh, 480px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: tokens.radius.xl,
        background: tokens.color.surface,
        boxShadow: tokens.shadow.float,
        border: `1px solid ${tokens.color.border}`,
        overflow: "hidden",
        animation: "buddyPanel 300ms cubic-bezier(.34,1.4,.64,1) both",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space(2),
          padding: `${tokens.space(4)} ${tokens.space(4)}`,
          borderBottom: `1px solid ${tokens.color.border}`,
        }}
      >
        <strong style={{ flex: 1, fontSize: tokens.size.base, fontWeight: 600 }}>Coach</strong>
        {chat.turns.length > 0 && (
          <button type="button" onClick={chat.reset} style={ghost()}>
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close" style={ghost()}>
          ✕
        </button>
      </header>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: tokens.space(4), display: "grid", gap: tokens.space(3), alignContent: "start" }}
      >
        {chat.turns.length === 0 && (
          <p style={{ margin: 0, fontSize: tokens.size.sm, color: tokens.color.textMuted, lineHeight: 1.55 }}>
            Ask me about the diagram, a step you&apos;re stuck on, or threat modeling in general.
          </p>
        )}
        {chat.turns.map((t, i) => (
          <p
            key={i}
            style={{
              margin: 0,
              justifySelf: t.role === "user" ? "end" : "start",
              maxWidth: "88%",
              padding: `${tokens.space(2)} ${tokens.space(3)}`,
              borderRadius: 14,
              background: t.role === "user" ? tokens.color.accent : tokens.color.surfaceSunken,
              color: t.role === "user" ? tokens.color.accentText : tokens.color.text,
              fontSize: tokens.size.sm,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {t.content}
          </p>
        ))}
        {chat.thinking && (
          <span style={{ fontSize: tokens.size.sm, color: tokens.color.textFaint }}>thinking…</span>
        )}
        {chat.error && (
          <span role="alert" style={{ fontSize: tokens.size.sm, color: tokens.color.danger }}>
            {chat.error}
          </span>
        )}
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: tokens.space(2), padding: tokens.space(3), borderTop: `1px solid ${tokens.color.border}` }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the coach…"
          maxLength={2000}
          aria-label="Message the coach"
          style={{
            flex: 1,
            minWidth: 0,
            padding: `${tokens.space(2)} ${tokens.space(3)}`,
            borderRadius: tokens.radius.pill,
            border: `1px solid ${tokens.color.border}`,
            background: tokens.color.surfaceSunken,
            fontSize: tokens.size.sm,
            fontFamily: tokens.font.sans,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || chat.thinking}
          aria-label="Send"
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: "50%",
            border: "none",
            background: draft.trim() && !chat.thinking ? tokens.color.accent : tokens.color.borderStrong,
            cursor: draft.trim() && !chat.thinking ? "pointer" : "default",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4.5 12h13M12 6.5 17.5 12 12 17.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <style>{`@keyframes buddyPanel{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function ghost(): React.CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: tokens.color.textMuted,
    fontSize: tokens.size.sm,
    fontFamily: tokens.font.sans,
    cursor: "pointer",
    padding: tokens.space(1),
  };
}
