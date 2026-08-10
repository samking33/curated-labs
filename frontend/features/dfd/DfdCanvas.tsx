"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DfdGraph, DfdSelection } from "./dfd-types";
import { GAPS, layoutGraph } from "./layout";
import { DfdNodeShape } from "./DfdNode";
import { DfdEdgeShape } from "./DfdEdge";
import { DfdBoundaries } from "./DfdBoundary";
import { project, THEMES, type ThemeId } from "./themes";

type Props = {
  graph: DfdGraph;
  themeId: ThemeId;
  selection: DfdSelection;
  onSelect: (selection: DfdSelection) => void;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const PADDING = 90;

/**
 * The single DFD renderer. Themes only change paint and projection — pan,
 * zoom, hit-testing and selection are written once here.
 *
 * ponytail: plain SVG, no React Flow. RF's hit-testing assumes an untransformed
 * 2D plane, and three of the four skins are isometric; SVG transforms keep
 * clicks landing on the shape the learner actually sees.
 */
export function DfdCanvas({ graph, themeId, selection, onSelect }: Props) {
  const theme = THEMES[themeId];
  const layout = useMemo(() => layoutGraph(graph, GAPS[theme.projection]), [graph, theme.projection]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ px: number; py: number } | null>(null);

  // Projected extent of every node corner + slab depth, so fit-to-view works
  // for both projections without special-casing.
  const extent = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of layout.nodes.values()) {
      for (const [cx, cy] of [
        [p.x, p.y],
        [p.x + p.w, p.y],
        [p.x + p.w, p.y + p.h],
        [p.x, p.y + p.h],
      ]) {
        const q = project(theme, cx, cy);
        xs.push(q.x);
        ys.push(q.y, q.y + theme.depth);
      }
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [layout, theme]);

  const [size, setSize] = useState({ w: 1000, h: 620 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(() => {
    const cw = size.w;
    const ch = size.h;
    const gw = extent.maxX - extent.minX + PADDING * 2;
    const gh = extent.maxY - extent.minY + PADDING * 2;
    const k = Math.min(Math.min(cw / gw, ch / gh), 1.4);
    return {
      k,
      x: cw / 2 - ((extent.minX + extent.maxX) / 2) * k,
      y: ch / 2 - ((extent.minY + extent.maxY) / 2) * k,
    };
  }, [extent, size]);

  // Re-fit whenever the projection changes, so switching skins never leaves
  // the diagram parked off-screen.
  useEffect(() => setView(fit), [fit, themeId]);

  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * Math.exp(-e.deltaY * 0.0015)));
      return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    drag.current = { px: e.clientX, py: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const gridId = `grid-${theme.id}`;
  const majorId = `grid-major-${theme.id}`;

  // Painter's order: in iso, further-back nodes (smaller x+y) draw first.
  const drawOrder =
    theme.projection === "iso"
      ? [...graph.nodes].sort((a, b) => {
          const pa = layout.nodes.get(a.id)!;
          const pb = layout.nodes.get(b.id)!;
          return pa.x + pa.y - (pb.x + pb.y);
        })
      : graph.nodes;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: theme.canvasBg, overflow: "hidden" }}>
      {theme.floor && <div style={{ position: "absolute", inset: 0, background: theme.floor }} />}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ position: "relative", display: "block", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClick={() => onSelect(null)}
      >
        {theme.grid && (
          <defs>
            <pattern id={gridId} width={theme.grid.size} height={theme.grid.size} patternUnits="userSpaceOnUse">
              <path
                d={`M ${theme.grid.size} 0 L 0 0 0 ${theme.grid.size}`}
                fill="none"
                stroke={theme.grid.color}
                strokeWidth={theme.grid.width}
              />
            </pattern>
            {theme.grid.majorEvery && (
              <pattern
                id={majorId}
                width={theme.grid.size * theme.grid.majorEvery}
                height={theme.grid.size * theme.grid.majorEvery}
                patternUnits="userSpaceOnUse"
              >
                <rect width="100%" height="100%" fill={`url(#${gridId})`} />
                <path
                  d={`M ${theme.grid.size * theme.grid.majorEvery} 0 L 0 0 0 ${theme.grid.size * theme.grid.majorEvery}`}
                  fill="none"
                  stroke={theme.grid.majorColor}
                  strokeWidth={theme.grid.width}
                />
              </pattern>
            )}
          </defs>
        )}
        {theme.grid && <rect width="100%" height="100%" fill={`url(#${theme.grid.majorEvery ? majorId : gridId})`} />}

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <DfdBoundaries graph={graph} layout={layout} theme={theme} gaps={GAPS[theme.projection]} />
          {graph.edges.map((edge) => {
            const s = layout.nodes.get(edge.source);
            const t = layout.nodes.get(edge.target);
            if (!s || !t) return null;
            return (
              <DfdEdgeShape
                key={edge.id}
                edge={edge}
                source={s}
                target={t}
                theme={theme}
                selected={selection?.kind === "edge" && selection.edge.id === edge.id}
                onSelect={() => onSelect({ kind: "edge", edge })}
              />
            );
          })}
          {drawOrder.map((node) => (
            <DfdNodeShape
              key={node.id}
              node={node}
              placed={layout.nodes.get(node.id)!}
              theme={theme}
              selected={selection?.kind === "node" && selection.node.id === node.id}
              onSelect={() => onSelect({ kind: "node", node })}
            />
          ))}
        </g>
      </svg>

      <button
        type="button"
        onClick={() => setView(fit)}
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          padding: "6px 12px",
          fontSize: 12,
          fontFamily: theme.font,
          color: theme.uiText,
          background: theme.uiPanel,
          border: `1px solid ${theme.uiBorder}`,
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Reset view
      </button>
    </div>
  );
}
