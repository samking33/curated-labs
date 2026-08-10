"use client";

import type { DfdGraph } from "./dfd-types";
import { clusterBoxes, type Placed, type Layout } from "./layout";
import { project, type DfdTheme } from "./themes";

const PAD = 34;

/**
 * Dashed hull around each cluster of nodes in a trust boundary. Boundary
 * crossings are where threat modeling actually happens, so this is not
 * decoration — a learner mis-reading which side of a boundary a component sits
 * on gets the whole exercise wrong.
 *
 * ponytail: axis-aligned world bbox per cluster, then projected. A concave hull
 * only pays off once a single cluster interleaves two boundaries.
 */
export function DfdBoundaries({
  graph,
  layout,
  theme,
  gaps,
}: {
  graph: DfdGraph;
  layout: Layout;
  theme: DfdTheme;
  gaps: { colGap: number; rowGap: number };
}) {
  // Neighbouring nodes sit exactly one gap apart; anything further belongs to a
  // separate cluster. The slack absorbs the taller rows iso needs.
  const reach = Math.max(gaps.colGap, gaps.rowGap) + 20;

  return (
    <g pointerEvents="none">
      {graph.trustBoundaries.flatMap((boundary) => {
        const members = graph.nodes
          .filter((n) => n.trustBoundary === boundary.id)
          .map((n) => layout.nodes.get(n.id))
          .filter((p): p is Placed => Boolean(p));
        if (members.length === 0) return [];

        return clusterBoxes(members, reach).map((group, i) => {
          const minX = Math.min(...group.map((p) => p.x)) - PAD;
          const minY = Math.min(...group.map((p) => p.y)) - PAD;
          const maxX = Math.max(...group.map((p) => p.x + p.w)) + PAD;
          const maxY = Math.max(...group.map((p) => p.y + p.h)) + PAD;

          const corners = (
            [
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
            ] as const
          ).map(([x, y]) => project(theme, x, y));

          // Flat: top-left corner. Iso: the west vertex — the hull's top vertex
          // points into the middle of the diagram, where data flows and their
          // labels run, so labels anchored there collide.
          const label =
            theme.projection === "iso"
              ? corners.reduce((a, b) => (b.x < a.x ? b : a))
              : corners.reduce((a, b) => (b.y < a.y ? b : a));

          return (
            <g key={`${boundary.id}-${i}`}>
              <polygon
                points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill={theme.boundary.fill}
                stroke={theme.boundary.stroke}
                strokeWidth={theme.boundary.width}
                strokeDasharray={theme.boundary.dash}
              />
              <text
                x={label.x}
                y={label.y - 8}
                textAnchor="middle"
                fill={theme.boundary.label}
                fontFamily={theme.font}
                fontSize={11}
                letterSpacing={1}
                // Same halo the edge labels use — in iso a hull corner often
                // lands underneath a data flow.
                style={{ paintOrder: "stroke", stroke: theme.canvasBg, strokeWidth: 3.5, strokeLinejoin: "round" }}
              >
                {boundary.label.toUpperCase()}
              </text>
            </g>
          );
        });
      })}
    </g>
  );
}
