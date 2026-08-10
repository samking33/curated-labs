"use client";

import type { DfdGraph, DfdSelection } from "./dfd-types";
import { TYPE_LABEL } from "./DfdNode";
import type { DfdTheme } from "./themes";

function CloseButton({ theme, onClose }: { theme: DfdTheme; onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close inspector"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: `1px solid ${theme.uiBorder}`,
        background: "transparent",
        color: theme.uiMuted,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Field({ label, value, theme }: { label: string; value: string; theme: DfdTheme }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: theme.uiMuted, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: theme.uiText, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

export function DfdInspector({
  graph,
  selection,
  theme,
  onClose,
}: {
  graph: DfdGraph;
  selection: DfdSelection;
  theme: DfdTheme;
  onClose?: () => void;
}) {
  // Floats over the canvas now, so it carries its own padding and a dismiss
  // affordance rather than a border shared with a parent column.
  const wrap: React.CSSProperties = {
    padding: 18,
    fontFamily: theme.font,
  };

  // Nothing selected means nothing rendered — the caller unmounts this.
  if (!selection) return null;

  if (selection.kind === "node") {
    const n = selection.node;
    const boundary = graph.trustBoundaries.find((b) => b.id === n.trustBoundary);
    return (
      <aside style={{ ...wrap, position: "relative" }}>
        <CloseButton theme={theme} onClose={onClose} />
        <div style={{ fontSize: 17, fontWeight: 600, color: theme.uiText, marginBottom: 2 }}>{n.label}</div>
        <div style={{ fontSize: 11, color: theme.uiMuted, marginBottom: 18 }}>{TYPE_LABEL[n.type]}</div>
        <Field label="Description" value={n.description} theme={theme} />
        <Field label="Trust boundary" value={boundary ? boundary.label : ""} theme={theme} />
        <Field label="Assets" value={n.assets.join(", ")} theme={theme} />
        <Field label="Node id" value={n.id} theme={theme} />
      </aside>
    );
  }

  const e = selection.edge;
  const src = graph.nodes.find((n) => n.id === e.source);
  const dst = graph.nodes.find((n) => n.id === e.target);
  return (
    <aside style={{ ...wrap, position: "relative" }}>
        <CloseButton theme={theme} onClose={onClose} />
      <div style={{ fontSize: 17, fontWeight: 600, color: theme.uiText, marginBottom: 2 }}>
        {e.label || "Data flow"}
      </div>
      <div style={{ fontSize: 11, color: theme.uiMuted, marginBottom: 18 }}>
        {src?.label} → {dst?.label}
      </div>
      <Field label="Protocol" value={e.protocol ?? ""} theme={theme} />
      <Field label="Data in transit" value={e.data.join(", ")} theme={theme} />
      <Field
        label="Trust boundary"
        value={e.trustBoundaryCrossing ? "Crosses a trust boundary" : "Stays inside one boundary"}
        theme={theme}
      />
      <Field label="Edge id" value={e.id} theme={theme} />
    </aside>
  );
}
