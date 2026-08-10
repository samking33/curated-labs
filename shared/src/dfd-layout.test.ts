import { describe, expect, it } from "vitest";
import { layoutGraph, LAYOUT_GAPS, NODE_H, NODE_W } from "./dfd-layout";
import type { DfdGraph } from "./schemas/dfd";

const graph: DfdGraph = {
  version: "1.0",
  nodes: [
    { id: "a", type: "external_entity", label: "A", description: "", assets: [], metadata: {} },
    { id: "b", type: "process", label: "B", description: "", assets: [], metadata: {} },
    { id: "c", type: "data_store", label: "C", description: "", assets: [], metadata: {} },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", label: "", protocol: "", data: [], trustBoundaryCrossing: false, metadata: {} },
    { id: "e2", source: "b", target: "c", label: "", protocol: "", data: [], trustBoundaryCrossing: false, metadata: {} },
  ],
  trustBoundaries: [],
};

describe("layoutGraph", () => {
  it("places nodes in increasing columns along the flow", () => {
    const { nodes } = layoutGraph(graph, LAYOUT_GAPS);
    const a = nodes.get("a")!;
    const b = nodes.get("b")!;
    const c = nodes.get("c")!;
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(a.w).toBe(NODE_W);
    expect(a.h).toBe(NODE_H);
  });

  it("computes bounds covering every placed node", () => {
    const { nodes, bounds } = layoutGraph(graph, LAYOUT_GAPS);
    for (const n of nodes.values()) {
      expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(n.x + n.w).toBeLessThanOrEqual(bounds.maxX);
      expect(n.y + n.h).toBeLessThanOrEqual(bounds.maxY);
    }
  });
});
