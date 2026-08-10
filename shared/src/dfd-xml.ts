import { XMLParser } from "fast-xml-parser";
import { LAYOUT_GAPS, NODE_H, NODE_W, layoutGraph } from "./dfd-layout";
import { dfdGraphSchema } from "./schemas/dfd";
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
        `dfdDescription="${escapeXml(node.description)}" dfdAssets="${escapeXml(node.assets.map(encodeURIComponent).join(","))}"` +
        (node.trustBoundary ? ` dfdTrustBoundary="${escapeXml(node.trustBoundary)}"` : "") +
        `><mxCell style="${SHAPE_STYLE[node.type]}" vertex="1" parent="1">` +
        `<mxGeometry x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  }

  for (const edge of graph.edges) {
    cells.push(
      `<object id="${escapeXml(edge.id)}" label="${escapeXml(edge.label)}" dfdKind="edge" ` +
        `dfdProtocol="${escapeXml(edge.protocol)}" dfdData="${escapeXml(edge.data.map(encodeURIComponent).join(","))}" ` +
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

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "object" || name === "mxCell",
});

/** Reverse of SHAPE_STYLE, for cells a user drew freehand (no dfdType
 *  attribute because they came from the shape library, not our compiler).
 *  Order matters — more specific substrings are checked first. */
const STYLE_TO_TYPE: [string, DfdNodeType][] = [
  ["shape=partialRectangle", "data_store"],
  ["shape=process", "queue"],
  ["fillColor=#dae8fc", "service"],
  ["ellipse", "process"],
  ["dashed=1", "third_party"],
  ["rounded=0", "external_entity"],
];

function inferType(style: string): DfdNodeType {
  for (const [needle, type] of STYLE_TO_TYPE) if (style.includes(needle)) return type;
  return "process";
}

function splitList(value: unknown): string[] {
  const s = typeof value === "string" ? value : "";
  return s.length ? s.split(",").filter(Boolean).map(decodeURIComponent) : [];
}

type RawAttrs = Record<string, unknown>;

/**
 * draw.io XML -> DfdGraph. Handles both our own compiled output (`<object
 * dfdKind="...">` wrapping an `<mxCell>`, carrying our semantic attributes)
 * and cells a user drew freehand from the shape library (a bare `<mxCell>`
 * with no wrapper or custom attributes) — those get best-effort defaults.
 * Always re-validates with dfdGraphSchema before returning: a malformed or
 * hand-edited file must fail loudly here, not deep inside a grading loop.
 */
export function extractFromDrawioXml(xml: string): DfdGraph {
  const doc = parser.parse(xml) as { mxGraphModel?: { root?: RawAttrs } };
  const root = doc.mxGraphModel?.root;
  if (!root) throw new Error("Not a valid draw.io diagram: missing mxGraphModel/root.");

  const objects = (root.object as RawAttrs[]) ?? [];
  const allCells = (root.mxCell as RawAttrs[]) ?? [];
  const wrappedCellIds = new Set(
    objects
      .map((o) => {
        const cellField = o.mxCell;
        const cell = Array.isArray(cellField) ? cellField[0] : cellField;
        return (cell as RawAttrs | undefined)?.["@_id"];
      })
      .filter(Boolean),
  );
  const bareCells = allCells.filter(
    (c) => c["@_id"] !== "0" && c["@_id"] !== "1" && !wrappedCellIds.has(c["@_id"]),
  );

  const nodes: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  const trustBoundaries: Record<string, unknown>[] = [];

  const handle = (attrs: RawAttrs, cell: RawAttrs) => {
    const id = String(attrs["@_id"] ?? cell["@_id"]);
    const label = String(attrs["@_label"] ?? cell["@_value"] ?? "");
    const style = String(cell["@_style"] ?? "");
    const kind = attrs["@_dfdKind"];

    if (kind === "boundary" || (!kind && cell["@_connectable"] === "0")) {
      trustBoundaries.push({ id, label, description: String(attrs["@_dfdDescription"] ?? "") });
      return;
    }
    if (kind === "edge" || cell["@_edge"] === "1") {
      edges.push({
        id,
        source: String(cell["@_source"] ?? ""),
        target: String(cell["@_target"] ?? ""),
        label,
        protocol: String(attrs["@_dfdProtocol"] ?? ""),
        data: splitList(attrs["@_dfdData"]),
        trustBoundaryCrossing: attrs["@_dfdTrustBoundaryCrossing"] === "1",
      });
      return;
    }
    nodes.push({
      id,
      type: (attrs["@_dfdType"] as string | undefined) ?? inferType(style),
      label,
      description: String(attrs["@_dfdDescription"] ?? ""),
      ...(attrs["@_dfdTrustBoundary"] ? { trustBoundary: String(attrs["@_dfdTrustBoundary"]) } : {}),
      assets: splitList(attrs["@_dfdAssets"]),
    });
  };

  for (const obj of objects) {
    const cellField = obj.mxCell;
    const cell = Array.isArray(cellField) ? cellField[0] : cellField;
    if (cell) handle(obj, cell as RawAttrs);
  }
  for (const cell of bareCells) {
    if (cell["@_vertex"] === "1" || cell["@_edge"] === "1") handle({}, cell);
  }

  return dfdGraphSchema.parse({ version: "1.0", nodes, edges, trustBoundaries });
}

/**
 * Generic referential check: does every affectedNodeIds/affectedEdgeIds
 * reference still resolve against this graph? Used to reject a DFD edit that
 * orphans a threat or architecture-issue reference. Deliberately NOT the same
 * function as validateSeedReferences (that operates on pre-mint, key-based
 * seed data) — this works on any already-UUID'd reference list.
 */
export function checkDfdReferences(
  graph: DfdGraph,
  refs: { label: string; affectedNodeIds: string[]; affectedEdgeIds: string[] }[],
): string[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  const errors: string[] = [];
  for (const ref of refs) {
    for (const id of ref.affectedNodeIds) if (!nodeIds.has(id)) errors.push(`${ref.label}: unknown node "${id}"`);
    for (const id of ref.affectedEdgeIds) if (!edgeIds.has(id)) errors.push(`${ref.label}: unknown edge "${id}"`);
  }
  return errors;
}
