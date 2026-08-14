import type { DfdGraph, DfdNode } from "./schemas/dfd";

export const NODE_W = 190;
export const NODE_H = 90;
/**
 * Provider-styled nodes render a square vendor stencil (AWS/Azure/GCP) with
 * the label underneath, not inside. Stretching one across NODE_W makes the
 * logo roughly 2:1 and unreadable — the "symbols look very stretched"
 * report. These keep a square cell, centred in the same column slot.
 */
export const ICON_W = NODE_H;
// Wide enough that orthogonalEdgeStyle has room to route several edges
// between the same two columns without their labels stacking on top of each
// other — see compileToDrawioXml's band-grouping for the label/entry-point
// fan-out that uses this space.
export const LAYOUT_GAPS = { colGap: 260, rowGap: 110 } as const;
/**
 * Vertical space between trust-zone bands. Must stay larger than a boundary
 * box's own top + bottom padding (see BOUNDARY_PAD in dfd-xml.ts) or two
 * adjacent zone rectangles touch and read as one merged region.
 */
export const BAND_GAP = 130;

const PROVIDER_ICON_TYPES = new Set<DfdNode["type"]>(["process", "service", "data_store", "queue"]);

/** The 4 infrastructure types are the only ones that ever get a vendor icon —
 *  external_entity/third_party/trust_boundary aren't "vendor-flavored". Lives
 *  here because the cell's SIZE depends on it, and the renderer reuses it so
 *  the size rule and the style rule can never disagree. */
export function usesProviderIcon(node: DfdNode): boolean {
  return Boolean(node.provider) && PROVIDER_ICON_TYPES.has(node.type);
}

export type Placed = { id: string; x: number; y: number; w: number; h: number };
export type Layout = {
  nodes: Map<string, Placed>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Layered left-to-right layout, banded by trust zone.
 *
 * Column = longest path from a source node, so the diagram still reads as a
 * flow. Row band = the node's trust boundary, in the order the author listed
 * them (conventionally least-trusted first), so each zone owns a horizontal
 * band across the whole diagram.
 *
 * The banding is what makes the zone rectangles legible. Ordering rows by
 * dependency alone let two zones interleave vertically inside one column —
 * measured on the real seed data, that fragmented one zone into four separate
 * rectangles and stacked them private/internet/private down a single column,
 * i.e. the untrusted zone drawn *inside* the internal one. Giving each zone
 * its own band makes every boundary exactly one clean rectangle and keeps
 * external zones visually outside the internal ones.
 *
 * ponytail: no dagre. Threat-model DFDs are shallow and flow one direction.
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

  // Band = trust zone, in authored order. Nodes with no zone share a trailing
  // band so they still lay out rather than colliding with a real zone.
  const bandOrder = graph.trustBoundaries.map((b) => b.id);
  const bandOf = (node: DfdNode): number => {
    const i = node.trustBoundary ? bandOrder.indexOf(node.trustBoundary) : -1;
    return i >= 0 ? i : bandOrder.length;
  };

  // band -> column -> nodes in that cell
  const cells = new Map<number, Map<number, DfdNode[]>>();
  for (const node of graph.nodes) {
    const band = bandOf(node);
    const col = depth.get(node.id)!;
    if (!cells.has(band)) cells.set(band, new Map());
    const byCol = cells.get(band)!;
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col)!.push(node);
  }

  const nodes = new Map<string, Placed>();
  let bandTop = 0;
  // Only bands that actually hold nodes consume vertical space, so an unused
  // boundary never opens a gap in the middle of the diagram.
  for (const band of [...cells.keys()].sort((a, b) => a - b)) {
    const byCol = cells.get(band)!;
    const tallest = Math.max(...[...byCol.values()].map((c) => c.length));
    const bandHeight = tallest * NODE_H + (tallest - 1) * ROW_GAP;

    for (const [col, ids] of byCol) {
      const stackHeight = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
      const top = bandTop + (bandHeight - stackHeight) / 2;
      ids.forEach((node, row) => {
        const w = usesProviderIcon(node) ? ICON_W : NODE_W;
        nodes.set(node.id, {
          id: node.id,
          // Centre a narrow icon cell inside the full-width column slot so
          // columns stay aligned regardless of which nodes carry an icon.
          x: col * (NODE_W + COL_GAP) + (NODE_W - w) / 2,
          y: top + row * (NODE_H + ROW_GAP),
          w,
          h: NODE_H,
        });
      });
    }
    bandTop += bandHeight + BAND_GAP;
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
