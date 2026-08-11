"use client";

import type { DfdSelection } from "@curated-labs/shared";
import { tokens } from "@/lib/tokens";
import { Card } from "@/components/ui";

const tagStyle = {
  fontSize: tokens.size.xs,
  padding: `${tokens.space(1)} ${tokens.space(2)}`,
  background: tokens.color.surfaceSunken,
  borderRadius: tokens.radius.sm,
  color: tokens.color.textMuted,
};

/** Shows what's currently selected in the DFD — separate from RefPicker
 *  (which turns a selection into an attached answer reference on specific
 *  steps); this is a general "what is this" box available on every step. */
export function NodeDetailsPanel({ selection }: { selection: DfdSelection }) {
  if (!selection) return null;

  const title = selection.kind === "node" ? selection.node.label : selection.edge.label || selection.edge.id;
  const subtitle = selection.kind === "node" ? selection.node.type.replace(/_/g, " ") : "data flow";
  const description = selection.kind === "node" ? selection.node.description : selection.edge.protocol;
  const tags = selection.kind === "node" ? selection.node.assets : selection.edge.data;

  return (
    <Card>
      <div
        style={{
          fontSize: tokens.size.xs,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: tokens.color.textFaint,
        }}
      >
        {subtitle}
      </div>
      <h3 style={{ margin: `${tokens.space(1)} 0 ${tokens.space(2)}`, fontSize: tokens.size.lg }}>{title}</h3>
      {description && <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: 0 }}>{description}</p>}
      {tags.length > 0 && (
        <div style={{ marginTop: tokens.space(2), display: "flex", gap: tokens.space(1), flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <span key={tag} style={tagStyle}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
