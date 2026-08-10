import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDfdReferences, compileToDrawioXml, extractFromDrawioXml, dfdGraphSchema, isUuid } from "@curated-labs/shared";

// Exercises the same compile -> extract -> checkDfdReferences path
// updateScenarioDfd() runs, without needing a live database.
describe("playground DFD edit validation path", () => {
  it("rejects malformed scenario ids before they'd reach the uuid db column", () => {
    // Postgres throws (not a clean 404) on a non-uuid literal against a `@db.Uuid`
    // column -- updateScenarioDfd() must gate on isUuid() before its findUnique,
    // same as its siblings (answerKey/jobStatus/loadOwnedSession) in this file.
    expect(isUuid("not-a-uuid")).toBe(false);

    const servicePath = join(__dirname, "..", "src/modules/playground/playground-generation.service.ts");
    const source = readFileSync(servicePath, "utf-8");
    const methodStart = source.indexOf("async updateScenarioDfd(");
    const methodBody = source.slice(methodStart, source.indexOf("\n  }", methodStart));
    const guardIndex = methodBody.indexOf("if (!isUuid(scenarioId))");
    const queryIndex = methodBody.indexOf("findUnique");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });

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
