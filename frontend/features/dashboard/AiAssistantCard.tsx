"use client";

import { useEffect, useRef, useState } from "react";
import { tokens } from "@/lib/tokens";
import { api } from "@/lib/api";
import { card } from "./PerformanceCard";
import { SparkleIcon } from "./Chrome";
import { VoiceField } from "./VoiceField";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Where should I start?",
  "What is a trust boundary?",
  "Explain STRIDE simply",
];

/**
 * Coach chatbot.
 *
 * The particle field stays as the assistant's presence: it idles when nothing
 * is happening and comes alive while a reply is in flight, so the wait has a
 * visible state without needing a spinner.
 */
export function AiAssistantCard({
  onOpenProgress,
  greeting = "Ask me anything about threat modeling.",
}: {
  onOpenProgress?: () => void;
  greeting?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view as the transcript grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, thinking]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;

    // Optimistic: the learner's own message is not worth a round trip to show.
    const next = [...turns, { role: "user" as const, content }];
    setTurns(next);
    setDraft("");
    setError(null);
    setThinking(true);

    try {
      const res = await api<{ reply: string; degraded: boolean }>("/assistant/chat", {
        method: "POST",
        // Send the whole visible transcript so follow-ups keep their thread;
        // the server caps how much of it actually reaches the model.
        body: JSON.stringify({ messages: next }),
      });
      setTurns([...next, { role: "assistant", content: res.reply }]);
    } catch {
      // The learner's question stays on screen — only the reply is missing.
      setError("Couldn't reach the coach. Try again.");
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const empty = turns.length === 0;

  return (
    <section
      style={{
        ...card(),
        padding: 0,
        overflow: "hidden",
        background: `linear-gradient(180deg, ${tokens.color.surface} 55%, #EFF7F0 100%)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space(3),
          padding: `${tokens.space(5)} ${tokens.space(5)} ${tokens.space(4)}`,
          borderBottom: `1px solid ${tokens.color.border}`,
        }}
      >
        <SparkleIcon color={tokens.color.text} size={22} />
        <h2 style={{ margin: 0, flex: 1, fontSize: tokens.size.xl, fontWeight: 500, color: tokens.color.text }}>
          Ai Assistant
        </h2>
        {turns.length > 0 && (
          <IconButton label="Clear conversation" onClick={() => { setTurns([]); setError(null); }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 12h9l1-12" stroke={tokens.color.text} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}
        {/* Was a diagonal "expand" glyph that promised to enlarge this card —
            it actually navigated away to Progress. A small chart icon matches
            where the click really goes. */}
        <IconButton label="Open progress" onClick={onOpenProgress}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 19V10M12 19V5M19 19v-6"
              stroke={tokens.color.text}
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 240,
          maxHeight: 460,
          overflowY: "auto",
          padding: `${tokens.space(5)} ${tokens.space(5)} ${tokens.space(2)}`,
          display: "flex",
          flexDirection: "column",
          alignItems: empty ? "center" : "stretch",
          justifyContent: empty ? "center" : "flex-start",
          gap: tokens.space(3),
        }}
      >
        {empty ? (
          <>
            {/* The field is the assistant's resting presence. */}
            <VoiceField size={230} listening={thinking} />
            <p
              style={{
                margin: 0,
                maxWidth: 300,
                textAlign: "center",
                fontSize: "22px",
                lineHeight: 1.35,
                letterSpacing: "-0.015em",
                color: tokens.color.text,
              }}
            >
              {greeting}
            </p>
          </>
        ) : (
          turns.map((t, i) => <Bubble key={i} turn={t} />)
        )}

        {thinking && !empty && <Typing />}
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: tokens.size.sm, color: tokens.color.danger }}>
            {error}
          </p>
        )}
      </div>

      {empty && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: tokens.space(2), padding: `0 ${tokens.space(5)}` }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              style={{
                padding: `${tokens.space(2)} ${tokens.space(3)}`,
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.border}`,
                background: tokens.color.surface,
                color: tokens.color.textMuted,
                fontSize: tokens.size.sm,
                fontFamily: tokens.font.sans,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        style={{ display: "flex", alignItems: "flex-end", gap: tokens.space(3), padding: tokens.space(5) }}
      >
        <label htmlFor="assistant-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Message the coach
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline, as in every chat app.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Ask the coach…"
          maxLength={2000}
          style={{
            flex: 1,
            minWidth: 0,
            resize: "none",
            padding: `${tokens.space(3)} ${tokens.space(4)}`,
            borderRadius: tokens.radius.lg,
            border: `1px solid ${tokens.color.border}`,
            background: tokens.color.surfaceSunken,
            color: tokens.color.text,
            fontSize: tokens.size.base,
            fontFamily: tokens.font.sans,
            lineHeight: 1.45,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || thinking}
          aria-label="Send message"
          style={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: "50%",
            border: "none",
            background: draft.trim() && !thinking ? tokens.color.accent : tokens.color.borderStrong,
            cursor: draft.trim() && !thinking ? "pointer" : "default",
            display: "grid",
            placeItems: "center",
            transition: "background 120ms",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4.5 12h13M12 6.5 17.5 12 12 17.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </section>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const mine = turn.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <p
        style={{
          margin: 0,
          maxWidth: "86%",
          padding: `${tokens.space(3)} ${tokens.space(4)}`,
          borderRadius: tokens.radius.lg,
          borderBottomRightRadius: mine ? tokens.radius.sm : tokens.radius.lg,
          borderBottomLeftRadius: mine ? tokens.radius.lg : tokens.radius.sm,
          background: mine ? tokens.color.accent : tokens.color.surfaceSunken,
          color: mine ? tokens.color.accentText : tokens.color.text,
          fontSize: tokens.size.base,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          // Model prose is rendered as plain text, never as HTML (§19).
          wordBreak: "break-word",
        }}
      >
        {turn.content}
      </p>
    </div>
  );
}

function Typing() {
  return (
    <div style={{ display: "flex", gap: 5, padding: `${tokens.space(2)} ${tokens.space(4)}` }} aria-label="Coach is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: tokens.color.textFaint,
            animation: `assistantPulse 1.1s ${i * 0.16}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`@keyframes assistantPulse{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}`}</style>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        border: `1px solid ${tokens.color.border}`,
        background: tokens.color.surface,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}
