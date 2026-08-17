"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";

export type Turn = { role: "user" | "assistant"; content: string; degraded?: boolean };

/**
 * Conversation state for the coach.
 *
 * Shared by the dashboard card and the peeking mascot's mini chat: same
 * endpoint, same transcript rules, two different shells. Keeping it here means
 * a change to how history is sent cannot drift between the two surfaces.
 */
export function useCoachChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || thinking) return;

      // Optimistic: the learner's own words need no round trip.
      const next: Turn[] = [...turns, { role: "user", content }];
      setTurns(next);
      setError(null);
      setThinking(true);

      try {
        const res = await api<{ reply: string; degraded: boolean }>("/assistant/chat", {
          method: "POST",
          body: JSON.stringify({ messages: next }),
        });
        setTurns([...next, { role: "assistant", content: res.reply, degraded: res.degraded }]);
      } catch {
        // The question stays on screen: only the reply is missing.
        setError("Couldn't reach the coach. Try again.");
      } finally {
        setThinking(false);
      }
    },
    [turns, thinking],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
  }, []);

  return { turns, thinking, error, send, reset };
}
