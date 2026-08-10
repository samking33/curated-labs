import { describe, expect, it } from "vitest";
import { compileToDrawioXml } from "./dfd-xml";
import type { DfdGraph } from "./schemas/dfd";

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
});
