import { describe, expect, it } from "vitest";
import { dfdGraphSchema } from "./dfd-types";
import { clusterBoxes, GAPS, layoutGraph, NODE_H, NODE_W, type Placed } from "./layout";
import { project, THEMES, THEME_ORDER } from "./themes";
import { labSeedSchema, validateSeedReferences } from "@curated-labs/shared";
import seedJson from "../../../backend/prisma/seed/labs/app-security-checkout.json";

// Parse the real curated lab rather than a fixture: if a seed file drifts from
// the schema, these tests are where it should surface.
const seed = labSeedSchema.parse(seedJson);
const graph = seed.dfd;

describe("dfd schema", () => {
  it("accepts the curated seed lab", () => {
    expect(() => labSeedSchema.parse(seedJson)).not.toThrow();
  });

  it("has no broken answer-key references in the seed lab", () => {
    expect(validateSeedReferences(seed)).toEqual([]);
  });

  it("rejects an edge pointing at a node that does not exist", () => {
    const broken = {
      version: "1.0",
      nodes: [{ id: "a", type: "process", label: "A" }],
      edges: [{ id: "e", source: "a", target: "ghost" }],
      trustBoundaries: [],
    };
    expect(dfdGraphSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects duplicate node ids", () => {
    const dupes = {
      version: "1.0",
      nodes: [
        { id: "a", type: "process", label: "A" },
        { id: "a", type: "service", label: "A again" },
      ],
      edges: [],
      trustBoundaries: [],
    };
    expect(dfdGraphSchema.safeParse(dupes).success).toBe(false);
  });
});

describe("layout", () => {
  it("places every node exactly once", () => {
    const { nodes } = layoutGraph(graph);
    expect(nodes.size).toBe(graph.nodes.length);
  });

  it("puts a target to the right of its source unless the graph loops back", () => {
    const { nodes } = layoutGraph(graph);
    const forward = graph.edges.filter((e: { id: string }) => e.id !== "e-payments-orders");
    for (const e of forward) {
      expect(nodes.get(e.target)!.x).toBeGreaterThan(nodes.get(e.source)!.x);
    }
  });

  it("terminates on a cycle instead of recursing forever", () => {
    const cyclic = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        { id: "a", type: "process", label: "A" },
        { id: "b", type: "process", label: "B" },
      ],
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "ba", source: "b", target: "a" },
      ],
      trustBoundaries: [],
    });
    expect(layoutGraph(cyclic).nodes.size).toBe(2);
  });
});

describe("projected hit targets", () => {
  // An overlapping slab steals the click from the node beneath it, so no two
  // projected top faces may intersect in any skin.
  it.each(THEME_ORDER)("keeps every node clickable in the %s skin", (id) => {
    const theme = THEMES[id];
    const { nodes } = layoutGraph(graph, GAPS[theme.projection]);
    const boxes = [...nodes.values()].map((p) => {
      const corners = [
        [p.x, p.y],
        [p.x + p.w, p.y],
        [p.x + p.w, p.y + p.h],
        [p.x, p.y + p.h],
      ].map(([x, y]) => project(theme, x, y));
      return {
        id: p.id,
        minX: Math.min(...corners.map((c) => c.x)),
        maxX: Math.max(...corners.map((c) => c.x)),
        minY: Math.min(...corners.map((c) => c.y)),
        maxY: Math.max(...corners.map((c) => c.y)) + theme.depth,
      };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps = a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
        expect(overlaps, `${a.id} overlaps ${b.id} in ${id}`).toBe(false);
      }
    }
  });

  it("uses wider rows for isometric skins than for flat ones", () => {
    expect(GAPS.iso.rowGap).toBeGreaterThan(GAPS.flat.rowGap);
    expect(NODE_W).toBeGreaterThan(0);
    expect(NODE_H).toBeGreaterThan(0);
  });
});

describe("themes", () => {
  it("exposes all four skins in switch order", () => {
    expect(THEME_ORDER).toHaveLength(4);
    for (const id of THEME_ORDER) expect(THEMES[id].id).toBe(id);
  });

  it("leaves flat coordinates untouched and skews isometric ones", () => {
    expect(project(THEMES.whiteboard, 10, 20)).toEqual({ x: 10, y: 20 });
    const iso = project(THEMES["iso-3d"], 10, 20);
    expect(iso.x).toBeCloseTo(-8.66, 2);
    expect(iso.y).toBeCloseTo(15, 2);
  });
});

describe("trust boundary clustering", () => {
  const box = (id: string, x: number, y: number): Placed => ({ id, x, y, w: NODE_W, h: NODE_H });

  it("keeps neighbours within reach in one hull", () => {
    const groups = clusterBoxes([box("a", 0, 0), box("b", NODE_W + 100, 0)], 120);
    expect(groups).toHaveLength(1);
  });

  it("splits members that are far apart", () => {
    const groups = clusterBoxes([box("a", 0, 0), box("b", 2000, 0)], 120);
    expect(groups.map((g) => g.map((p) => p.id))).toEqual([["a"], ["b"]]);
  });

  it("links a chain transitively through its middle member", () => {
    // a—b and b—c are each within reach; a—c is not. Single linkage must still
    // return one hull, or a wide boundary fragments into stripes.
    const step = NODE_W + 100;
    const groups = clusterBoxes([box("a", 0, 0), box("c", step * 2, 0), box("b", step, 0)], 120);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("separates the two Internet clusters in the seeded checkout lab", () => {
    // Customer and the payment processor share a boundary at opposite ends of
    // the flow. One bounding box around both would enclose the private network.
    const layout = layoutGraph(graph, GAPS.flat);
    const internet = graph.nodes
      .filter((n) => n.trustBoundary === "internet")
      .map((n) => layout.nodes.get(n.id)!);
    expect(internet.length).toBeGreaterThan(1);
    expect(clusterBoxes(internet, Math.max(GAPS.flat.colGap, GAPS.flat.rowGap) + 20)).toHaveLength(2);
  });

  it("keeps the private network as a single hull in both projections", () => {
    for (const gaps of [GAPS.flat, GAPS.iso]) {
      const layout = layoutGraph(graph, gaps);
      const members = graph.nodes
        .filter((n) => n.trustBoundary === "private_network")
        .map((n) => layout.nodes.get(n.id)!);
      expect(clusterBoxes(members, Math.max(gaps.colGap, gaps.rowGap) + 20)).toHaveLength(1);
    }
  });
});
