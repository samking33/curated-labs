import { describe, expect, it } from "vitest";
import { checkDfdReferences, compileToDrawioXml, extractFromDrawioXml, dfdGraphSchema } from "@curated-labs/shared";

// Exercises the same compile -> extract -> checkDfdReferences path
// updateScenarioDfd() runs, without needing a live database.
describe("playground DFD edit validation path", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [
      { id: "n1", type: "process", label: "N1" },
      { id: "n2", type: "data_store", label: "N2" },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    trustBoundaries: [],
  });
  const refs = [{ label: 'threat "SQLi"', affectedNodeIds: ["n2"], affectedEdgeIds: ["e1"] }];

  it("accepts an edit that keeps every referenced node/edge", () => {
    const edited = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(checkDfdReferences(edited, refs)).toEqual([]);
  });

  it("rejects an edit that deletes a referenced node", () => {
    const withoutN2 = { ...graph, nodes: graph.nodes.filter((n) => n.id !== "n2"), edges: [] };
    const edited = extractFromDrawioXml(compileToDrawioXml(withoutN2));
    const errors = checkDfdReferences(edited, refs);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("SQLi");
  });
});
