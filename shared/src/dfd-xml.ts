import { LAYOUT_GAPS, NODE_H, NODE_W, layoutGraph } from "./dfd-layout";
import type { DfdGraph, DfdNode, DfdNodeType } from "./schemas/dfd";

/**
 * draw.io mxGraph XML shapes for our 7 node types, per PLAYGROUND_PROJECT.md's
 * DFD notation. Styles for external_entity/process/data_store/trust boundary
 * are copied verbatim (decoded from base64) from the MIT-licensed
 * drawio-threatmodeling library (github.com/michenriksen/drawio-threatmodeling)
 * so the diagram matches an established DFD visual convention rather than one
 * we invented. service/queue/third_party have no direct match in that library
 * and reuse the closest shape with a distinguishing tweak.
 */
const SHAPE_STYLE: Record<DfdNodeType, string> = {
  external_entity: "rounded=0;whiteSpace=wrap;html=1;",
  process: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;",
  service: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;",
  data_store: "shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;",
  queue: "shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;",
  third_party: "rounded=0;whiteSpace=wrap;html=1;dashed=1;",
  trust_boundary:
    "html=1;fontColor=#FF3333;fontStyle=1;align=left;verticalAlign=top;spacing=0;labelBorderColor=none;" +
    "fillColor=none;dashed=1;strokeWidth=2;strokeColor=#FF3333;spacingLeft=4;spacingTop=-3;",
};

const BOUNDARY_STYLE = SHAPE_STYLE.trust_boundary;
const EDGE_STYLE = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";
const EDGE_CROSSING_STYLE = `${EDGE_STYLE}dashed=1;strokeColor=#FF3333;fontColor=#FF3333;`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** JSON → draw.io XML. Deterministic — no AI, no parsing library needed for
 *  this direction since we fully control the output shape. */
export function compileToDrawioXml(graph: DfdGraph): string {
  const layout = layoutGraph(graph, LAYOUT_GAPS);
  const cells: string[] = [];

  const boundaryMembers = new Map<string, DfdNode[]>();
  for (const node of graph.nodes) {
    if (!node.trustBoundary) continue;
    if (!boundaryMembers.has(node.trustBoundary)) boundaryMembers.set(node.trustBoundary, []);
    boundaryMembers.get(node.trustBoundary)!.push(node);
  }

  // Trust boundaries first so document order puts them behind nodes/edges
  // (draw.io z-orders by document order).
  graph.trustBoundaries.forEach((boundary, i) => {
    const members = boundaryMembers.get(boundary.id) ?? [];
    const rects = members.map((n) => layout.nodes.get(n.id)!).filter(Boolean);
    const box = rects.length
      ? {
          x: Math.min(...rects.map((r) => r.x)) - 40,
          y: Math.min(...rects.map((r) => r.y)) - 50,
          w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)) + 80,
          h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)) + 90,
        }
      : { x: 0, y: layout.bounds.maxY + 100 + i * 140, w: 200, h: 100 };
    cells.push(
      `<object id="${escapeXml(boundary.id)}" label="${escapeXml(boundary.label)}" dfdKind="boundary" ` +
        `dfdDescription="${escapeXml(boundary.description)}">` +
        `<mxCell style="${BOUNDARY_STYLE}" vertex="1" connectable="0" parent="1">` +
        `<mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  });

  for (const node of graph.nodes) {
    const pos = layout.nodes.get(node.id)!;
    cells.push(
      `<object id="${escapeXml(node.id)}" label="${escapeXml(node.label)}" dfdKind="node" dfdType="${node.type}" ` +
        `dfdDescription="${escapeXml(node.description)}" dfdAssets="${escapeXml(node.assets.join(","))}"` +
        (node.trustBoundary ? ` dfdTrustBoundary="${escapeXml(node.trustBoundary)}"` : "") +
        `><mxCell style="${SHAPE_STYLE[node.type]}" vertex="1" parent="1">` +
        `<mxGeometry x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  }

  for (const edge of graph.edges) {
    cells.push(
      `<object id="${escapeXml(edge.id)}" label="${escapeXml(edge.label)}" dfdKind="edge" ` +
        `dfdProtocol="${escapeXml(edge.protocol)}" dfdData="${escapeXml(edge.data.join(","))}" ` +
        `dfdTrustBoundaryCrossing="${edge.trustBoundaryCrossing ? "1" : "0"}">` +
        `<mxCell style="${edge.trustBoundaryCrossing ? EDGE_CROSSING_STYLE : EDGE_STYLE}" edge="1" parent="1" ` +
        `source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">` +
        `<mxGeometry relative="1" as="geometry"/>` +
        `</mxCell></object>`,
    );
  }

  return (
    `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" ` +
    `fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel>`
  );
}
