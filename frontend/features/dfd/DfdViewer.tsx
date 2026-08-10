"use client";

import { useEffect, useState } from "react";
import { DfdCanvas } from "./DfdCanvas";
import { DfdInspector } from "./DfdInspector";
import type { DfdGraph, DfdSelection } from "./dfd-types";
import { THEMES, THEME_ORDER, type ThemeId } from "./themes";

const STORAGE_KEY = "curated-labs:dfd-theme";

/**
 * DFD viewer shell: skin switcher + canvas + inspector.
 * Lab step components consume `onSelectionChange`, never the canvas directly,
 * so the visual layer stays replaceable.
 */
export function DfdViewer({
  graph,
  onSelectionChange,
}: {
  graph: DfdGraph;
  onSelectionChange?: (selection: DfdSelection) => void;
}) {
  const [themeId, setThemeId] = useState<ThemeId>("whiteboard");
  const [selection, setSelection] = useState<DfdSelection>(null);
  const theme = THEMES[themeId];

  // Resolve the skin after mount to keep SSR output stable — the server has
  // neither localStorage nor the query string. `?view=` wins so a link can
  // pin a specific skin; otherwise fall back to the learner's last choice.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next = [fromUrl, saved].find((id) => id && id in THEMES);
    if (next) setThemeId(next as ThemeId);
  }, []);

  const pick = (id: ThemeId) => {
    setThemeId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    // Keep the URL honest so a copied link reproduces what is on screen.
    const url = new URL(window.location.href);
    url.searchParams.set("view", id);
    window.history.replaceState(null, "", url);
  };

  const select = (next: DfdSelection) => {
    setSelection(next);
    onSelectionChange?.(next);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: theme.uiBg,
        color: theme.uiText,
        fontFamily: theme.font,
      }}
    >
      {/* Segmented control: one track, one sliding selection. Four separate
          outlined buttons read as four unrelated actions. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderBottom: `1px solid ${theme.uiBorder}`,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: theme.uiMuted,
          }}
        >
          View
        </span>
        <div
          role="group"
          aria-label="Diagram style"
          style={{
            display: "inline-flex",
            padding: 3,
            gap: 2,
            borderRadius: 999,
            background: theme.uiPanel,
            border: `1px solid ${theme.uiBorder}`,
          }}
        >
          {THEME_ORDER.map((id) => {
            const active = id === themeId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                aria-pressed={active}
                title={THEMES[id].hint}
                style={{
                  padding: "6px 14px",
                  fontSize: 12.5,
                  fontFamily: theme.font,
                  borderRadius: 999,
                  cursor: "pointer",
                  border: "none",
                  background: active ? theme.selected.stroke : "transparent",
                  color: active ? theme.uiBg : theme.uiMuted,
                  fontWeight: active ? 600 : 400,
                  whiteSpace: "nowrap",
                  transition: "background 120ms, color 120ms",
                }}
              >
                {THEMES[id].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* The inspector floats over the canvas instead of holding a permanent
          column. Empty most of the time, it was spending a third of the width
          telling the learner to click something. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <DfdCanvas graph={graph} themeId={themeId} selection={selection} onSelect={select} />

        {selection && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 290,
              maxHeight: "calc(100% - 24px)",
              overflowY: "auto",
              borderRadius: 14,
              border: `1px solid ${theme.uiBorder}`,
              background: theme.uiPanel,
              boxShadow: "0 8px 30px rgba(0,0,0,0.28)",
            }}
          >
            <DfdInspector graph={graph} selection={selection} theme={theme} onClose={() => select(null)} />
          </div>
        )}

        {!selection && (
          <p
            style={{
              position: "absolute",
              left: 14,
              bottom: 12,
              margin: 0,
              fontSize: 12,
              color: theme.uiMuted,
              pointerEvents: "none",
            }}
          >
            Click a node or flow to inspect it · scroll to zoom · drag to pan
          </p>
        )}
      </div>
    </div>
  );
}
