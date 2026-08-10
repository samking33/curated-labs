import { describe, expect, it } from "vitest";
import { checkDfdReferences, compileToDrawioXml, extractFromDrawioXml } from "./dfd-xml";
import { dfdGraphSchema } from "./schemas/dfd";
import type { DfdGraph } from "./schemas/dfd";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const graph: DfdGraph = {
  version: "1.0",
  nodes: [
    {
      id: "customer",
      type: "external_entity",
      label: "Customer <VIP>",
      description: 'Shopper "at home"',
      trustBoundary: "internet",
      assets: ["email", "session_cookie"],
      metadata: {},
    },
    {
      id: "storefront",
      type: "process",
      label: "Storefront",
      description: "",
      assets: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: "e-customer-storefront",
      source: "customer",
      target: "storefront",
      label: "Checkout request",
      protocol: "HTTPS",
      data: ["session_cookie", "cart"],
      trustBoundaryCrossing: true,
      metadata: {},
    },
  ],
  trustBoundaries: [{ id: "internet", label: "Internet", description: "Untrusted public network." }],
};

describe("compileToDrawioXml", () => {
  const xml = compileToDrawioXml(graph);

  it("wraps everything in a valid mxGraphModel/root", () => {
    expect(xml).toContain("<mxGraphModel");
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
    expect(xml).toContain("</root></mxGraphModel>");
  });

  it("emits one object per node, edge, and trust boundary with stable ids", () => {
    expect(xml).toContain('<object id="customer"');
    expect(xml).toContain('<object id="storefront"');
    expect(xml).toContain('<object id="e-customer-storefront"');
    expect(xml).toContain('<object id="internet"');
  });

  it("stamps semantic fields as custom attributes, not just visual style", () => {
    expect(xml).toContain('dfdKind="node"');
    expect(xml).toContain('dfdType="external_entity"');
    expect(xml).toContain('dfdAssets="email,session_cookie"');
    expect(xml).toContain('dfdTrustBoundary="internet"');
    expect(xml).toContain('dfdKind="edge"');
    expect(xml).toContain('dfdProtocol="HTTPS"');
    expect(xml).toContain('dfdTrustBoundaryCrossing="1"');
    expect(xml).toContain('dfdKind="boundary"');
  });

  it("escapes XML-significant characters in labels and descriptions", () => {
    expect(xml).toContain("Customer &lt;VIP&gt;");
    expect(xml).toContain("Shopper &quot;at home&quot;");
    expect(xml).not.toContain("Customer <VIP>");
  });

  it("wires edge source/target to the real node ids", () => {
    expect(xml).toContain('source="customer" target="storefront"');
  });

  it("uses a provider-specific style and stamps dfdProvider when a node has a provider", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        { id: "a", type: "data_store", label: "A", provider: "aws" },
        { id: "b", type: "external_entity", label: "B" }, // no provider set, and wrong type for one anyway
      ],
      edges: [],
      trustBoundaries: [],
    });
    const xml = compileToDrawioXml(graph);
    expect(xml).toContain('dfdProvider="aws"');
    // The generic external_entity style must still be used for the node with no provider.
    // (window widened from the brief's {0,50} to {0,100}: the real attribute
    // string between dfdKind="node" and the style is 73 chars for this node.)
    expect(xml).toMatch(/id="b"[^>]*dfdKind="node"[\s\S]{0,100}rounded=0;whiteSpace=wrap;html=1;/);
  });

  it("ignores provider on non-infrastructure types even if somehow set", () => {
    // dfdNodeSchema doesn't forbid provider on e.g. external_entity at the type level
    // (it's a per-field optional, not cross-field validated) — the COMPILER is what
    // enforces the 4-type scoping, so this proves that enforcement directly.
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [{ id: "a", type: "external_entity", label: "A", provider: "aws" }],
      edges: [],
      trustBoundaries: [],
    });
    const xml = compileToDrawioXml(graph);
    expect(xml).not.toContain('dfdProvider="aws"');
  });
});

describe("extractFromDrawioXml", () => {
  it("round-trips compile -> extract back to an equivalent graph", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        { id: "a", type: "external_entity", label: "A", description: "d", trustBoundary: "b1", assets: ["x", "y"] },
        { id: "b", type: "data_store", label: "B", description: "", assets: [] },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", label: "L", protocol: "HTTPS", data: ["x"], trustBoundaryCrossing: true },
      ],
      trustBoundaries: [{ id: "b1", label: "Boundary", description: "d2" }],
    });
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted).toEqual(graph);
  });

  it("survives a literal comma inside an asset/data string as one item, not split in two", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        {
          id: "a",
          type: "external_entity",
          label: "A",
          assets: ["card number, expiry"],
        },
        { id: "b", type: "data_store", label: "B" },
      ],
      edges: [{ id: "e1", source: "a", target: "b", data: ["card number, expiry"] }],
      trustBoundaries: [],
    });
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted.nodes[0]!.assets).toEqual(["card number, expiry"]);
    expect(extracted.edges[0]!.data).toEqual(["card number, expiry"]);
  });

  it("infers a best-effort node from a bare mxCell with no object wrapper", () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="freehand" value="New Node" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1">' +
      '<mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>' +
      "</root></mxGraphModel>";
    const graph = extractFromDrawioXml(xml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: "freehand", label: "New Node", type: "process" });
  });

  it("infers a service (not process) node from a bare mxCell using the service ellipse style", () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="freehand" value="New Service" ' +
      'style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;" ' +
      'vertex="1" parent="1">' +
      '<mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>' +
      "</root></mxGraphModel>";
    const graph = extractFromDrawioXml(xml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: "freehand", label: "New Service", type: "service" });
  });

  it("throws on XML with no mxGraphModel/root", () => {
    expect(() => extractFromDrawioXml("<not-a-diagram/>")).toThrow();
  });

  // Deleting a vertex in the real editor (plain Delete key) does not delete
  // its connected edges — they survive with one endpoint attribute missing.
  // Confirmed live in Task 13's manual verification pass: this used to blow
  // up dfdGraphSchema's min(1) check on source/target and abort the whole
  // extraction with a generic "couldn't read that diagram" error instead of
  // routing through checkDfdReferences to name the threat that referenced
  // the deleted node/edge.
  it("drops a dangling edge (missing source or target) instead of throwing", () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<object id="n1" label="Kept" dfdKind="node" dfdType="process">' +
      '<mxCell style="ellipse;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>' +
      '<object id="e1" label="Dangling" dfdKind="edge">' +
      '<mxCell edge="1" parent="1" target="n1"><mxGeometry as="geometry"/></mxCell></object>' +
      "</root></mxGraphModel>";
    const graph = extractFromDrawioXml(xml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toEqual([]);
  });

  // Same class of bug as the dangling edge above, but for a deleted trust
  // boundary: the real editor lets a user delete a boundary shape without
  // clearing dfdTrustBoundary off the nodes it used to contain, which used to
  // blow up dfdGraphSchema's superRefine ("references unknown trust
  // boundary") and abort extraction entirely.
  it("drops a node's trustBoundary reference instead of throwing when the boundary no longer exists", () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<object id="n1" label="Kept" dfdKind="node" dfdType="process" dfdTrustBoundary="gone">' +
      '<mxCell style="ellipse;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>' +
      "</root></mxGraphModel>";
    const graph = extractFromDrawioXml(xml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]!.trustBoundary).toBeUndefined();
  });

  // A shape dragged from draw.io's own generic search sidebar (not our
  // custom shape library) can land with no label at all, which used to fail
  // dfdNodeSchema's label min(1) and abort extraction entirely.
  it("defaults an empty label to the node's own id instead of throwing", () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="freehand" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">' +
      '<mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>' +
      "</root></mxGraphModel>";
    const graph = extractFromDrawioXml(xml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]!.label).toBe("freehand");
  });

  // The real embedded editor's "save" event does not hand back the bare
  // <mxGraphModel> compileToDrawioXml produces and DfdEditorFrame loads in —
  // it wraps it in <mxfile><diagram>, draw.io's own file format. Confirmed
  // live in Task 13's manual verification pass (every edit-mode save 400'd
  // against BAD_REQUEST "Couldn't read that diagram" before this was handled).
  it("unwraps the real editor's <mxfile><diagram><mxGraphModel> save format", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [{ id: "a", type: "process", label: "A" }],
      edges: [],
      trustBoundaries: [],
    });
    const bare = compileToDrawioXml(graph);
    const wrapped = `<mxfile host="localhost"><diagram id="d1" name="Page-1">${bare}</diagram></mxfile>`;
    expect(extractFromDrawioXml(wrapped)).toEqual(graph);
  });
});

describe("extractFromDrawioXml against every curated seed DFD", () => {
  const labsDir = path.resolve(__dirname, "../../backend/prisma/seed/labs");
  const files = readdirSync(labsDir).filter((f) => f.endsWith(".json"));

  it.each(files)("round-trips %s without losing referential integrity", (file) => {
    const seed = JSON.parse(readFileSync(path.join(labsDir, file), "utf-8"));
    const graph = dfdGraphSchema.parse(seed.dfd);
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted).toEqual(graph);
  });
});

describe("checkDfdReferences", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [{ id: "n1", type: "process", label: "N1" }],
    edges: [{ id: "e1", source: "n1", target: "n1" }],
    trustBoundaries: [],
  });

  it("passes when every reference resolves", () => {
    const errors = checkDfdReferences(graph, [
      { label: "threat X", affectedNodeIds: ["n1"], affectedEdgeIds: ["e1"] },
    ]);
    expect(errors).toEqual([]);
  });

  it("reports a reference to a node that no longer exists", () => {
    const errors = checkDfdReferences(graph, [
      { label: "threat X", affectedNodeIds: ["deleted-node"], affectedEdgeIds: [] },
    ]);
    expect(errors).toEqual(['threat X: unknown node "deleted-node"']);
  });
});
