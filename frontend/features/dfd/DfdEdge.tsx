"use client";

import type { DfdEdge as DfdEdgeData } from "./dfd-types";
import type { Placed } from "./layout";
import { project, type DfdTheme } from "./themes";

/** Where the centre->centre ray leaves `box`. Clipped in world space so the
 *  projected endpoint lands on the node's top face, not beside it. */
function exitPoint(box: Placed, towardX: number, towardY: number) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx === 0 ? Infinity : box.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.h / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

type Props = {
  edge: DfdEdgeData;
  source: Placed;
  target: Placed;
  theme: DfdTheme;
  selected: boolean;
  onSelect: () => void;
};

export function DfdEdgeShape({ edge, source, target, theme, selected, onSelect }: Props) {
  const sc = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
  const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const start = exitPoint(source, tc.x, tc.y);
  const end = exitPoint(target, sc.x, sc.y);
  const from = project(theme, start.x, start.y);
  const to = project(theme, end.x, end.y);

  const crossing = edge.trustBoundaryCrossing;
  const stroke = selected ? theme.selected.stroke : crossing ? theme.edge.crossingStroke : theme.edge.stroke;
  const width = selected ? theme.selected.width : theme.edge.width;
  const dash = crossing ? theme.edge.crossingDash : theme.edge.dash;

  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const a = theme.edge.arrowSize;
  // Stop the line short of the arrow tip so the stroke does not poke through.
  const tipBack = theme.edge.arrowFilled ? a * 0.9 : 0;
  const lineEnd = { x: to.x - Math.cos(angle) * tipBack, y: to.y - Math.sin(angle) * tipBack };

  const wing = (sign: number) => ({
    x: to.x - Math.cos(angle - (sign * Math.PI) / 7) * a,
    y: to.y - Math.sin(angle - (sign * Math.PI) / 7) * a,
  });
  const w1 = wing(1);
  const w2 = wing(-1);

  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const label = edge.label || edge.protocol || "";

  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ cursor: "pointer" }}>
      {/* Fat invisible hit target — hairline themes are otherwise unclickable. */}
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={14} />
      <line
        x1={from.x}
        y1={from.y}
        x2={lineEnd.x}
        y2={lineEnd.y}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      {theme.edge.arrowFilled ? (
        <polygon points={`${to.x},${to.y} ${w1.x},${w1.y} ${w2.x},${w2.y}`} fill={stroke} />
      ) : (
        <path
          d={`M${w1.x} ${w1.y}L${to.x} ${to.y}L${w2.x} ${w2.y}`}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {label && (
        <text
          x={mid.x}
          y={mid.y - 6}
          textAnchor="middle"
          fill={selected ? theme.selected.stroke : theme.edge.label}
          fontFamily={theme.font}
          fontSize={theme.edge.labelSize}
          pointerEvents="none"
          style={{ paintOrder: "stroke", stroke: theme.canvasBg, strokeWidth: 3.5, strokeLinejoin: "round" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
