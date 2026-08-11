import type { DfdGraph } from "./schemas/dfd";

export const NODE_W = 190;
export const NODE_H = 90;
// Wide enough that orthogonalEdgeStyle has room to route several edges
// between the same two columns without their labels stacking on top of each
// other — see compileToDrawioXml's band-grouping for the label/entry-point
// fan-out that uses this space.
export const LAYOUT_GAPS = { colGap: 260, rowGap: 110 } as const;

export type Placed = { id: string; x: number; y: number; w: number; h: number };
export type Layout = {
  nodes: Map<string, Placed>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Layered left-to-right layout: column = longest path from a source node.
 * ponytail: no dagre. Threat-model DFDs are shallow and flow one direction.
 * Ported from the (now-deleted) custom renderer's layout.ts, dropping the
 * isometric-only gap variant — draw.io isn't isometric.
 */
export function layoutGraph(graph: DfdGraph, gaps: { colGap: number; rowGap: number } = LAYOUT_GAPS): Layout {
  const { colGap: COL_GAP, rowGap: ROW_GAP } = gaps;
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  // Real DFDs loop back — webhooks, callbacks, replication. Drop those
  // feedback edges via DFS before ranking, otherwise the node they return to
  // gets ranked ahead of the node that calls it.
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const feedback = new Set<string>();
  const walk = (id: string) => {
    state.set(id, VISITING);
    for (const next of outgoing.get(id) ?? []) {
      const s = state.get(next);
      if (s === VISITING) feedback.add(`${id} ${next}`);
      else if (s !== DONE) walk(next);
    }
    state.set(id, DONE);
  };
  for (const node of graph.nodes) if ((incoming.get(node.id) ?? []).length === 0) walk(node.id);
  for (const node of graph.nodes) if (!state.has(node.id)) walk(node.id);

  const parents = new Map<string, string[]>();
  for (const node of graph.nodes) {
    parents.set(
      node.id,
      (incoming.get(node.id) ?? []).filter((src) => !feedback.has(`${src} ${node.id}`)),
    );
  }

  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const ps = parents.get(id) ?? [];
    const d = ps.length === 0 ? 0 : Math.max(...ps.map(depthOf)) + 1;
    depth.set(id, d);
    return d;
  };
  for (const node of graph.nodes) depthOf(node.id);

  const columns = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const d = depth.get(node.id)!;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(node.id);
  }

  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const colHeight = tallest * NODE_H + (tallest - 1) * ROW_GAP;

  const nodes = new Map<string, Placed>();
  for (const [col, ids] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const stackHeight = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
    const top = (colHeight - stackHeight) / 2;
    ids.forEach((id, row) => {
      nodes.set(id, {
        id,
        x: col * (NODE_W + COL_GAP),
        y: top + row * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      });
    });
  }

  const placed = [...nodes.values()];
  return {
    nodes,
    bounds: {
      minX: Math.min(0, ...placed.map((p) => p.x)),
      minY: Math.min(0, ...placed.map((p) => p.y)),
      maxX: Math.max(0, ...placed.map((p) => p.x + p.w)),
      maxY: Math.max(0, ...placed.map((p) => p.y + p.h)),
    },
  };
}
