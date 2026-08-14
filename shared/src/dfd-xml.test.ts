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

  it("fans out labels for multiple edges sharing the same source/target column pair", () => {
    const g = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        { id: "a", type: "process", label: "A" },
        { id: "b1", type: "process", label: "B1" },
        { id: "b2", type: "process", label: "B2" },
        { id: "b3", type: "process", label: "B3" },
      ],
      edges: [
        // b1/b2/b3 are all one hop from a, so they land in the same column —
        // all three edges share one (source column, target column) band.
        { id: "e1", source: "a", target: "b1", label: "One" },
        { id: "e2", source: "a", target: "b2", label: "Two" },
        { id: "e3", source: "a", target: "b3", label: "Three" },
      ],
      trustBoundaries: [],
    });
    const xml = compileToDrawioXml(g);
    // Every edge in the band gets a fixed exit/entry point (forward edges)
    // so their paths fan out instead of all leaving "a" at its center.
    expect(xml).toMatch(/id="e1"[\s\S]*?exitY=0\.25/);
    expect(xml).toMatch(/id="e2"[\s\S]*?exitY=0\.50/);
    expect(xml).toMatch(/id="e3"[\s\S]*?exitY=0\.75/);
    // And the outer two get a non-zero label offset in opposite directions —
    // not all three stacked at the same point. (The middle edge's offset is
    // exactly 0, which correctly emits no <mxPoint> at all — 0 IS "centered".)
    expect(xml).toMatch(/id="e1"[\s\S]*?<mxPoint x="0" y="-22" as="offset"\/>/);
    expect(xml).toMatch(/id="e3"[\s\S]*?<mxPoint x="0" y="22" as="offset"\/>/);
  });

  it("leaves a single edge between a column pair with no fan-out (matches prior output)", () => {
    const xml = compileToDrawioXml(graph);
    expect(xml).not.toContain("exitX=1");
    expect(xml).not.toContain('as="offset"');
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

  it("splits a boundary into separate boxes instead of enclosing a foreign node between its members", () => {
    // customer (zoneA, depth 0) -> gateway (zoneB, depth 1) -> partner (zoneA, depth 2).
    // zoneA's two members land in different columns with zoneB's node
    // between them — a single bounding box around both zoneA members would
    // swallow gateway. This is the exact shape found in 8 of the 9 real
    // curated labs (e.g. app-security-checkout's Internet zone containing
    // both "customer" and "payments" with "storefront" — Public DMZ — in
    // between).
    const g = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        { id: "customer", type: "external_entity", label: "Customer", trustBoundary: "zoneA" },
        { id: "gateway", type: "process", label: "Gateway", trustBoundary: "zoneB" },
        { id: "partner", type: "third_party", label: "Partner", trustBoundary: "zoneA" },
      ],
      edges: [
        { id: "e1", source: "customer", target: "gateway" },
        { id: "e2", source: "gateway", target: "partner" },
      ],
      trustBoundaries: [
        { id: "zoneA", label: "Zone A", description: "" },
        { id: "zoneB", label: "Zone B", description: "" },
      ],
    });
    const xml = compileToDrawioXml(g);

    // zoneA renders as two boxes (both carrying dfdBoundaryId="zoneA"), not one.
    expect([...xml.matchAll(/dfdBoundaryId="zoneA"/g)]).toHaveLength(2);
    expect([...xml.matchAll(/dfdBoundaryId="zoneB"/g)]).toHaveLength(1);

    // Extract every boundary and node geometry and confirm no zoneA box
    // encloses the zoneB (gateway) node.
    const objectRe =
      /<object ([^>]*)>\s*<mxCell[^>]*>\s*<mxGeometry x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
    const attr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    type Rect = { x: number; y: number; w: number; h: number };
    const zoneABoxes: Rect[] = [];
    let gatewayRect: Rect | undefined;
    for (const m of xml.matchAll(objectRe)) {
      const [, attrs, x, y, w, h] = m;
      const rect = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
      if (attr(attrs!, "dfdBoundaryId") === "zoneA") zoneABoxes.push(rect);
      if (attr(attrs!, "id") === "gateway") gatewayRect = rect;
    }
    const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    expect(zoneABoxes.some((box) => intersects(box, gatewayRect!))).toBe(false);

    // Extraction dedupes the two zoneA boxes back into one logical boundary.
    const extracted = extractFromDrawioXml(xml);
    expect(extracted.trustBoundaries).toEqual(g.trustBoundaries);
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

  it("round-trips a node's provider field", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [{ id: "a", type: "data_store", label: "A", provider: "aws" }],
      edges: [],
      trustBoundaries: [],
    });
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted).toEqual(graph);
  });

  it("extracts no provider for a node that never had one", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [{ id: "a", type: "process", label: "A" }],
      edges: [],
      trustBoundaries: [],
    });
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted.nodes[0]!.provider).toBeUndefined();
  });
});

// A Playground generation produced a node id equal to a trust boundary id
// ("private_network" as both). Nodes, edges, and trust boundaries all
// compile into one draw.io document (compileToDrawioXml) sharing a single
// mxGraph cell-id namespace, so this rendered as a genuine "Duplicate ID"
// codec error in the live editor, silently corrupting the boundary. The
// within-type duplicate checks (see below) never caught it because each
// only looks at its own array.
describe("dfdGraphSchema cross-namespace id collisions", () => {
  it("rejects a node id that collides with a trust boundary id", () => {
    expect(() =>
      dfdGraphSchema.parse({
        version: "1.0",
        nodes: [{ id: "private_network", type: "process", label: "A" }],
        edges: [],
        trustBoundaries: [{ id: "private_network", label: "Private Network", description: "" }],
      }),
    ).toThrow();
  });

  it("rejects a node id that collides with an edge id", () => {
    expect(() =>
      dfdGraphSchema.parse({
        version: "1.0",
        nodes: [
          { id: "shared", type: "process", label: "A" },
          { id: "b", type: "process", label: "B" },
        ],
        edges: [{ id: "shared", source: "shared", target: "b" }],
        trustBoundaries: [],
      }),
    ).toThrow();
  });

  it("rejects a trust boundary id that collides with an edge id", () => {
    expect(() =>
      dfdGraphSchema.parse({
        version: "1.0",
        nodes: [
          { id: "a", type: "process", label: "A" },
          { id: "b", type: "process", label: "B" },
        ],
        edges: [{ id: "shared", source: "a", target: "b" }],
        trustBoundaries: [{ id: "shared", label: "Boundary", description: "" }],
      }),
    ).toThrow();
  });

  it("still accepts a graph where every id is unique across all three namespaces", () => {
    expect(() =>
      dfdGraphSchema.parse({
        version: "1.0",
        nodes: [{ id: "a", type: "process", label: "A", trustBoundary: "b1" }],
        edges: [],
        trustBoundaries: [{ id: "b1", label: "Boundary", description: "" }],
      }),
    ).not.toThrow();
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

  // A layered layout places nodes by dependency depth, not by trust
  // boundary, so two boundaries routinely share a column — without
  // clustering, a single bounding box around one boundary's scattered
  // members silently swallows a node from a different boundary sitting
  // between them. Parses the compiled XML's own geometry (not the internal
  // layout functions, which aren't exported) so this exercises exactly what
  // the editor actually renders.
  it.each(files)("no trust-boundary box in %s encloses a node from a different boundary", (file) => {
    const seed = JSON.parse(readFileSync(path.join(labsDir, file), "utf-8"));
    const graph = dfdGraphSchema.parse(seed.dfd);
    const xml = compileToDrawioXml(graph);

    const objectRe = /<object ([^>]*)>\s*<mxCell[^>]*>\s*<mxGeometry x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
    const attr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];

    const boundaries: { boundaryId: string; x: number; y: number; w: number; h: number }[] = [];
    const nodes: { trustBoundary?: string; x: number; y: number; w: number; h: number }[] = [];
    for (const m of xml.matchAll(objectRe)) {
      const [, attrs, x, y, w, h] = m;
      const rect = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
      if (attr(attrs!, "dfdKind") === "boundary") {
        boundaries.push({ boundaryId: attr(attrs!, "dfdBoundaryId")!, ...rect });
      } else if (attr(attrs!, "dfdKind") === "node") {
        nodes.push({ trustBoundary: attr(attrs!, "dfdTrustBoundary"), ...rect });
      }
    }

    type Rect = { x: number; y: number; w: number; h: number };
    const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (const boundary of boundaries) {
      for (const node of nodes) {
        if (node.trustBoundary === boundary.boundaryId) continue;
        expect(intersects(boundary, node), `boundary ${boundary.boundaryId} box encloses a foreign node`).toBe(false);
      }
    }
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
